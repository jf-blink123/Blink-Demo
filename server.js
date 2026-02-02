// server.js (HTTPS + serves frontend + keeps existing API routes)
import express from "express";
import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "node:console";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // C:\laragon\www\backend

const app = express();
app.use(express.json());

// -------------------------
// Load .env from C:\laragon\www\.env
// (parent of the backend folder)
// -------------------------
function loadDotEnvFromProjectRoot() {
  const envPath = path.join(__dirname, "..", ".env"); // C:\laragon\www\.env
  if (!fs.existsSync(envPath)) {
    console.warn(`⚠️ .env not found at: ${envPath}`);
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();

    // don't overwrite existing env
    if (!process.env[key]) process.env[key] = val;
  }
}
loadDotEnvFromProjectRoot();

// -------------------------
// Config
// -------------------------
const BLINK_API_BASE = (process.env.BLINK_API_BASE || "https://api.blinkpayment.co.uk").replace(/\/+$/, "");
const API_KEY = process.env.BLINK_API_KEY || "";
const SECRET_KEY = process.env.BLINK_SECRET_KEY || "";

// HTTPS port (same as before)
const HTTPS_PORT = Number(process.env.PORT || 3001);

// Optional HTTP->HTTPS redirect
const HTTP_REDIRECT_PORT = Number(process.env.HTTP_PORT || 3000);
const ENABLE_HTTP_REDIRECT = (process.env.ENABLE_HTTP_REDIRECT || "true").toLowerCase() === "true";

// Frontend folder (served by this server). Your .env says FRONTEND_DIR=public
const FRONTEND_DIR = process.env.FRONTEND_DIR || "public";
const FRONTEND_PATH = path.join(__dirname, FRONTEND_DIR); // relative to server.js folder

// -------------------------
// HTTPS certs
// Your cert files are in: C:\laragon\www\backend\certs
// Names: localhost.pem and localhost-key.pem
// -------------------------
const CERT_DIR = path.join(__dirname, "certs");

// Allow overriding via .env, but resolve relative paths against backend folder
function resolveMaybeRelative(p) {
  if (!p) return "";
  // If it's already absolute (C:\... or /...), keep it
  if (path.isAbsolute(p)) return p;
  // Otherwise resolve from backend folder (server.js folder)
  return path.join(__dirname, p);
}

const HTTPS_CERT_PATH = resolveMaybeRelative(process.env.HTTPS_CERT_PATH) || path.join(CERT_DIR, "localhost.pem");
const HTTPS_KEY_PATH = resolveMaybeRelative(process.env.HTTPS_KEY_PATH) || path.join(CERT_DIR, "localhost-key.pem");

// If your env still says backend/certs/... this will now resolve safely.
// But recommended env values (optional):
// HTTPS_CERT_PATH=certs/localhost.pem
// HTTPS_KEY_PATH=certs/localhost-key.pem

if (!fs.existsSync(HTTPS_CERT_PATH) || !fs.existsSync(HTTPS_KEY_PATH)) {
  console.error("Missing HTTPS cert files.");
  console.error("Expected:");
  console.error(`  ${HTTPS_CERT_PATH}`);
  console.error(`  ${HTTPS_KEY_PATH}`);
  process.exit(1);
}

const httpsOptions = {
  cert: fs.readFileSync(HTTPS_CERT_PATH),
  key: fs.readFileSync(HTTPS_KEY_PATH),
};

if (!API_KEY || !SECRET_KEY) {
  console.error("Missing BLINK_API_KEY or BLINK_SECRET_KEY in environment (.env).");
  console.error("Loaded .env from:", path.join(__dirname, "..", ".env"));
  process.exit(1);
}

// -------------------------
// CORS (optional now that frontend is same origin)
// -------------------------
const ALLOWED_ORIGINS = new Set([
  `https://localhost:${HTTPS_PORT}`,
  `https://127.0.0.1:${HTTPS_PORT}`,
  // if you still use live server:
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost",
  "https://127.0.0.1:5500",
  "https://localhost:5500",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// -------------------------
// Serve Frontend (HTTPS)
// -------------------------
if (fs.existsSync(FRONTEND_PATH)) {
  app.use(express.static(FRONTEND_PATH));

  // default route -> index.html
  app.get("/", (_req, res) => {
    res.sendFile(path.join(FRONTEND_PATH, "index.html"));
  });
} else {
  console.warn(
    `⚠️ FRONTEND_DIR not found: ${FRONTEND_PATH}\n` +
      `Set FRONTEND_DIR in C:\\laragon\\www\\.env (e.g. FRONTEND_DIR=public) and ensure the folder exists under backend.`
  );
}

// -------------------------
// Blink token cache
// -------------------------
let cached = { token: "", expiresAtMs: 0 };
let access_token = "";

async function fetchBlinkAccessToken() {
  const url = `${BLINK_API_BASE}/tokens`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "*/*", "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      secret_key: SECRET_KEY,
      payment_api_status: true,
      send_blink_receipt: false,
      address_postcode_required: true,
      enable_moto_payments: true,
      card_layout: "multi-line",
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) return { ok: false, status: res.status, data };

  const token = data?.access_token || data?.token || data?.data?.access_token;
  if (!token) return { ok: false, status: 502, data: { error: "No access_token in response", blink: data } };

  return { ok: true, status: 200, data: { access_token: token, blink: data } };
}

async function getValidAccessToken() {
  const now = Date.now();
  if (cached.token && now < cached.expiresAtMs - 60_000) {
    return { ok: true, token: cached.token, cached: true };
  }

  const result = await fetchBlinkAccessToken();
  if (!result.ok) return { ok: false, status: result.status, data: result.data };

  const token = result.data.access_token;
  cached.token = token;
  cached.expiresAtMs = now + 30 * 60 * 1000;
  access_token = token;

  return { ok: true, token, cached: false };
}

function isTokenExpiredError(result) {
  const err = result?.data?.error;
  return typeof err === "string" && err.toLowerCase().includes("access token expired");
}

// -------------------------
// API routes (kept)
// -------------------------

// GET /api/token
app.get("/api/token", async (_req, res) => {
  const t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);
  return res.json({ access_token: t.token, cached: t.cached, expiresAtMs: cached.expiresAtMs });
});

// GET /api/intents
app.get("/api/intents", async (_req, res) => {
  let t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);

  let result = await createBlinkIntent(t.token);

  if (isTokenExpiredError(result)) {
    cached.token = "";
    cached.expiresAtMs = 0;
    access_token = "";

    t = await getValidAccessToken();
    if (!t.ok) return res.status(t.status).json(t.data);

    result = await createBlinkIntent(t.token);
  }

  if (!result?.ok) return res.status(result?.status || 500).json(result?.data || { error: "Unknown error" });
  return res.json({ result: result.data, cached_token: t.cached });
});

async function createBlinkIntent(bearerToken) {
  const url = `${BLINK_API_BASE}/intents`;

  const return_url = process.env.INTENT_RETURN_URL || `https://localhost:${HTTPS_PORT}/`;
  const notification_url = process.env.INTENT_NOTIFICATION_URL || `https://localhost:${HTTPS_PORT}/`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      amount: "8",
      transaction_type: "SALE",
      payment_type: "credit-card",
      currency: "GBP",
      return_url,
      notification_url,
      card_layout: "multi-line",
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, status: 200, data };
}

// POST /api/paylinks
app.post("/api/paylinks", async (req, res) => {
  let t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);

  let result = await createPaylink(t.token, req.body);

  if (isTokenExpiredError(result)) {
    cached.token = "";
    cached.expiresAtMs = 0;
    access_token = "";

    t = await getValidAccessToken();
    if (!t.ok) return res.status(t.status).json(t.data);

    result = await createPaylink(t.token, req.body);
  }

  if (!result?.ok) return res.status(result?.status || 500).json(result?.data || { error: "Unknown error" });
  return res.json({ result: result.data, cached_token: t.cached });
});

async function createPaylink(bearerToken, payload) {
  const url = `https://secure.blinkpayment.co.uk/api/paylink/v1/paylinks`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(payload || {}),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, status: 200, data };
}

// GET /api/paylinks/existing  -> proxies Blink: /api/paylink/v1/paylinks
app.get("/api/paylinks/existing", async (req, res) => {
  let t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);

  let result = await listPaylinks(t.token, req.query);

  if (isTokenExpiredError(result)) {
    cached.token = "";
    cached.expiresAtMs = 0;
    access_token = "";

    t = await getValidAccessToken();
    if (!t.ok) return res.status(t.status).json(t.data);

    result = await listPaylinks(t.token, req.query);
  }

  if (!result?.ok) return res.status(result?.status || 500).json(result?.data || { error: "Unknown error" });
  return res.json(result.data);
});

async function listPaylinks(bearerToken, query = {}) {
  // Blink host for paylinks APIs (matches your POST /paylinks base)
  const base = "https://secure.blinkpayment.co.uk";
  const pathname = "/api/paylink/v1/paylinks";

  // Optional pagination passthrough (defaults)
  const pageNumber = String(query.pageNumber ?? "1");
  const pageSize = String(query.pageSize ?? "50");

  const url = new URL(pathname, base);
  url.searchParams.set("pageNumber", pageNumber);
  url.searchParams.set("pageSize", pageSize);

  // If you later want to support more filters, passthrough here safely, e.g.
  // if (query.status) url.searchParams.set("status", String(query.status));

  const upstream = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) return { ok: false, status: upstream.status, data };
  return { ok: true, status: 200, data };
}

// POST /api/paylinks/:id/notifications
app.post("/api/paylinks/:id/notifications", async (req, res) => {
  const paylinkId = req.params.id;
  if (!paylinkId) return res.status(400).json({ error: "Missing paylink id" });

  let t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);

  let result = await sendPaylinkNotification(t.token, paylinkId, req.body);

  if (isTokenExpiredError(result)) {
    cached.token = "";
    cached.expiresAtMs = 0;
    access_token = "";

    t = await getValidAccessToken();
    if (!t.ok) return res.status(t.status).json(t.data);

    result = await sendPaylinkNotification(t.token, paylinkId, req.body);
  }

  if (!result?.ok) return res.status(result?.status || 500).json(result?.data || { error: "Unknown error" });
  return res.json({ result: result.data, cached_token: t.cached });
});

async function sendPaylinkNotification(bearerToken, paylinkId, body) {
  const url = `https://secure.blinkpayment.co.uk/api/paylink/v1/paylinks/${encodeURIComponent(paylinkId)}/notifications`;

  const payload = {
    send_email: true,
    ...(body && typeof body === "object" ? body : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, status: 200, data };
}

// Proxy any Blink call using Bearer token
app.all("/api/blink/:path(*)", async (req, res) => {
  const pathPart = "/" + (req.params.path || "");
  const url = `${BLINK_API_BASE}${pathPart}`;

  const t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);

  const method = req.method.toUpperCase();

  const upstream = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.token}`,
    },
    body: ["GET", "HEAD"].includes(method) ? undefined : JSON.stringify(req.body ?? {}),
  });

  const text = await upstream.text();
  res.status(upstream.status).send(text);
});

// Serve your example PDF
const PDF_ABS_PATH =
  process.env.PDF_ABS_PATH ||
  "C:/Users/JoeFinlay/OneDrive - Blink Payment/Discovery call pack/Invoice Example.pdf";

app.get("/invoice-example.pdf", (_req, res) => {
  if (!fs.existsSync(PDF_ABS_PATH)) {
    return res.status(404).json({ error: "PDF not found", path: PDF_ABS_PATH });
  }
  res.type("application/pdf");
  res.sendFile(PDF_ABS_PATH);
});

// HostedFields submit catcher (optional)
app.post("/api/hostedfields/submit", (req, res) => {
  console.log("HostedFields submit:", req.body);
  res.json({ ok: true });
});

// Health route
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    https: true,
    httpsPort: HTTPS_PORT,
    frontendPath: FRONTEND_PATH,
    envPath: path.join(__dirname, "..", ".env"),
  });
});

// Chrome DevTools sometimes requests this
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.status(204).end();
});

// -------------------------
// Start HTTPS server
// -------------------------
https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
  console.log(`✅ HTTPS server running: https://localhost:${HTTPS_PORT}`);
  console.log(`✅ Loaded .env from: ${path.join(__dirname, "..", ".env")}`);
  console.log(`✅ Cert: ${HTTPS_CERT_PATH}`);
  console.log(`✅ Key:  ${HTTPS_KEY_PATH}`);
  console.log(`✅ Frontend: ${FRONTEND_PATH}`);
  console.log("Try:");
  console.log(`  https://localhost:${HTTPS_PORT}/`);
  console.log(`  https://localhost:${HTTPS_PORT}/api/health`);
  console.log(`  https://localhost:${HTTPS_PORT}/api/token`);
  console.log(`  https://localhost:${HTTPS_PORT}/api/intents`);
});

// Optional HTTP -> HTTPS redirect
if (ENABLE_HTTP_REDIRECT) {
  http
    .createServer((req, res) => {
      const host = req.headers.host ? req.headers.host.split(":")[0] : "localhost";
      const target = `https://${host}:${HTTPS_PORT}${req.url || "/"}`;
      res.writeHead(301, { Location: target });
      res.end();
    })
    .listen(HTTP_REDIRECT_PORT, () => {
      console.log(`↪ HTTP redirect: http://localhost:${HTTP_REDIRECT_PORT} -> https://localhost:${HTTPS_PORT}`);
    });
}

// server.js
import express from "express";
import { log } from "node:console";

import fs from "node:fs";
import path from "node:path";

const app = express();
app.use(express.json());

// --- CORS for local dev ---
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost",
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

// ---- simple .env loader (no extra deps) ----
function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadDotEnv();

const BLINK_API_BASE = (process.env.BLINK_API_BASE || "https://api.blinkpayment.co.uk").replace(/\/+$/, "");
const API_KEY = process.env.BLINK_API_KEY || "";
const SECRET_KEY = process.env.BLINK_SECRET_KEY || "";
const PORT = Number(process.env.PORT || 3001);

if (!API_KEY || !SECRET_KEY) {
  console.error("Missing BLINK_API_KEY or BLINK_SECRET_KEY in environment (.env).");
  process.exit(1);
}

// ---- in-memory token cache (Blink tokens expire ~30 minutes) ----
let cached = { token: "", expiresAtMs: 0 };
let access_token = "";

/**
 * Calls Blink POST /tokens using api_key + secret_key.
 * Returns access_token.
 */
async function fetchBlinkAccessToken() {
  const url = `${BLINK_API_BASE}/tokens`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
    },
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

/**
 * ✅ Single source of truth: returns a valid token.
 */
async function getValidAccessToken() {
  const now = Date.now();

  // refresh 60s early
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

// GET /api/token
app.get("/api/token", async (_req, res) => {
  const t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);
  return res.json({ access_token: t.token, cached: t.cached, expiresAtMs: cached.expiresAtMs });
});

// -------------------------
// Intent route
// -------------------------
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
  return res.json({ result, cached_token: t.cached });
});

function isTokenExpiredError(result) {
  const err = result?.data?.error;
  return typeof err === "string" && err.toLowerCase().includes("access token expired");
}

async function createBlinkIntent(bearerToken) {
  const url = `${BLINK_API_BASE}/intents`;

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
      return_url: "http://127.0.0.1:5500/",
      notification_url: "https://api-demo-php.blinkpayment.co.uk/notification",
      card_layout: "multi-line",
      delay_capture: 14,
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

// -------------------------
// ✅ Create Paylink
// POST /api/paylinks
// -------------------------
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

// -------------------------
// ✅ Send Paylink Email Notification
// POST /api/paylinks/:id/notifications
// -------------------------
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

// Example: proxy any subsequent Blink call using Bearer token
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

// Serve your example PDF over HTTP
const PDF_ABS_PATH = "C:/Users/JoeFinlay/OneDrive - Blink Payment/Discovery call pack/Invoice Example.pdf";

app.get("/invoice-example.pdf", (_req, res) => {
  if (!fs.existsSync(PDF_ABS_PATH)) {
    return res.status(404).json({ error: "PDF not found", path: PDF_ABS_PATH });
  }
  res.type("application/pdf");
  res.sendFile(PDF_ABS_PATH);
});

app.listen(PORT, () => {
  console.log(`Blink backend running on http://localhost:${PORT}`);
});

app.get("/", (_req, res) => {
  res.type("text").send(
    "Blink backend is running.\n\n" +
      "Try:\n" +
      "  GET   /api/token\n" +
      "  GET   /api/intents\n" +
      "  POST  /api/paylinks\n" +
      "  POST  /api/paylinks/:id/notifications\n" +
      "  ALL   /api/blink/<blink-path>\n" +
      "  GET   /invoice-example.pdf\n"
  );
});

app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.status(204).end();
});

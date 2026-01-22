// server.js (safe-for-public-hosting branch)
// - Keeps Blink credentials server-side only
// - No public "token vending machine" (admin-only)
// - No open proxy to arbitrary Blink endpoints (admin-only)
// - Configurable CORS for your deployed frontend
// - Basic in-memory rate limiting for public routes
// - Serves invoice PDF from ./public by default (works on Render/Linux)

import express from "express";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.use(express.json({ limit: "1mb" }));

/**
 * ---- Optional .env loader (local dev only) ----
 * On Render: set env vars in the dashboard (recommended).
 * Locally: you can still use a .env file.
 */
function loadDotEnvLocalOnly() {
  if (process.env.NODE_ENV === "production") return; // don't read .env in prod hosts
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
loadDotEnvLocalOnly();

// ---- Config ----
const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT || 3001);

const BLINK_API_BASE = (process.env.BLINK_API_BASE || "https://api.blinkpayment.co.uk").replace(/\/+$/, "");
const BLINK_API_KEY = process.env.BLINK_API_KEY || "";
const BLINK_SECRET_KEY = process.env.BLINK_SECRET_KEY || "";

// Used in /api/intents payload (make these env so you don't forget to swap for prod/demo domains)
const RETURN_URL = process.env.RETURN_URL || "http://localhost:5500/";
const NOTIFICATION_URL =
  process.env.NOTIFICATION_URL || "https://api-demo-php.blinkpayment.co.uk/notification";

// CORS origins: comma-separated
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5500,http://127.0.0.1:5500")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Admin gate (for dev/debug endpoints only)
const ADMIN_KEY = process.env.ADMIN_KEY || "";

// Rate limiting (basic, in-memory)
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000); // 1 min
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120); // 120 req/min per IP

// Invoice PDF path (default: ./public/invoice-example.pdf)
const INVOICE_PDF_PATH =
  process.env.INVOICE_PDF_PATH || path.join(process.cwd(), "public", "invoice-example.pdf");

// ---- Fail fast on missing Blink creds (unless you explicitly want to run without them) ----
if (!BLINK_API_KEY || !BLINK_SECRET_KEY) {
  console.error("Missing BLINK_API_KEY or BLINK_SECRET_KEY (set them in Render env vars or local .env).");
  process.exit(1);
}

// -------------------------
// CORS (browser only; doesn't secure your API by itself)
// -------------------------
const ALLOWED_ORIGINS = new Set(CORS_ORIGINS);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// -------------------------
// Basic security headers (no deps)
// -------------------------
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  // If you embed anything, you can adjust CSP; for APIs, keeping it simple:
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none';");
  next();
});

// -------------------------
// Basic rate limiter (in-memory)
// -------------------------
const rl = new Map(); // ip -> { count, resetAt }
function rateLimit(req, res, next) {
  // You can scope this to only /api routes if you prefer:
  if (!req.path.startsWith("/api/")) return next();

  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();
  const entry = rl.get(ip);

  if (!entry || now > entry.resetAt) {
    rl.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: "Too many requests" });
  }

  return next();
}
app.use(rateLimit);

// -------------------------
// Admin guard (for debug routes only)
// -------------------------
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return res.status(503).json({ error: "ADMIN_KEY not configured on server" });
  const key = req.header("x-admin-key") || "";
  if (key !== ADMIN_KEY) return res.sendStatus(401);
  return next();
}

// -------------------------
// Blink token handling (server-side only)
// -------------------------
let cached = { token: "", expiresAtMs: 0 };

async function fetchBlinkAccessToken() {
  const url = `${BLINK_API_BASE}/tokens`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "*/*", "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: BLINK_API_KEY,
      secret_key: BLINK_SECRET_KEY,
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

  return { ok: true, status: 200, token };
}

async function getValidAccessToken() {
  const now = Date.now();

  // refresh 60s early
  if (cached.token && now < cached.expiresAtMs - 60_000) {
    return { ok: true, token: cached.token, cached: true };
  }

  const r = await fetchBlinkAccessToken();
  if (!r.ok) return { ok: false, status: r.status, data: r.data };

  cached.token = r.token;
  cached.expiresAtMs = now + 30 * 60 * 1000; // ~30 mins
  return { ok: true, token: cached.token, cached: false };
}

function isTokenExpiredError(result) {
  const err = result?.data?.error;
  return typeof err === "string" && err.toLowerCase().includes("access token expired");
}

// -------------------------
// Health / Root
// -------------------------
app.get("/healthz", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

app.get("/", (_req, res) => {
  res.type("text").send(
    "Blink backend is running.\n\n" +
      "Public routes:\n" +
      "  GET   /healthz\n" +
      "  GET   /api/intents\n" +
      "  POST  /api/paylinks\n" +
      "  POST  /api/paylinks/:id/notifications\n" +
      "  GET   /invoice-example.pdf\n\n" +
      "Admin/debug routes (require x-admin-key):\n" +
      "  GET   /api/token\n" +
      "  ALL   /api/blink/<blink-path>\n"
  );
});

// -------------------------
// Admin/debug endpoints
// -------------------------

// Admin-only: expose token for debugging (NOT for frontend usage)
app.get("/api/token", requireAdmin, async (_req, res) => {
  const t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);
  return res.json({ access_token: t.token, cached: t.cached, expiresAtMs: cached.expiresAtMs });
});

// Admin-only: proxy arbitrary Blink endpoints (useful for debugging; do not leave open)
app.all("/api/blink/:path(*)", requireAdmin, async (req, res) => {
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

// -------------------------
// Public API routes (safe: token never returned to browser)
// -------------------------

// GET /api/intents
app.get("/api/intents", async (_req, res) => {
  let t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);

  let result = await createBlinkIntent(t.token);
  if (isTokenExpiredError(result)) {
    cached.token = "";
    cached.expiresAtMs = 0;

    t = await getValidAccessToken();
    if (!t.ok) return res.status(t.status).json(t.data);

    result = await createBlinkIntent(t.token);
  }

  if (!result?.ok) return res.status(result?.status || 500).json(result?.data || { error: "Unknown error" });
  return res.json({ result: result.data, cached_token: t.cached });
});

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
      return_url: RETURN_URL,
      notification_url: NOTIFICATION_URL,
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

// POST /api/paylinks
app.post("/api/paylinks", async (req, res) => {
  let t = await getValidAccessToken();
  if (!t.ok) return res.status(t.status).json(t.data);

  let result = await createPaylink(t.token, req.body);

  if (isTokenExpiredError(result)) {
    cached.token = "";
    cached.expiresAtMs = 0;

    t = await getValidAccessToken();
    if (!t.ok) return res.status(t.status).json(t.data);

    result = await createPaylink(t.token, req.body);
  }

  if (!result?.ok) return res.status(result?.status || 500).json(result?.data || { error: "Unknown error" });
  return res.json({ result: result.data, cached_token: t.cached });
});

async function createPaylink(bearerToken, payload) {
  const url = `https://secure.blinkpayment.co.uk/api/paylink/v1/paylinks`;

  // Optional: basic payload sanity check (prevent totally empty requests)
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 400, data: { error: "Invalid payload" } };
  }

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

// -------------------------
// Invoice PDF route
// -------------------------
app.get("/invoice-example.pdf", (_req, res) => {
  if (!fs.existsSync(INVOICE_PDF_PATH)) {
    return res.status(404).json({
      error: "PDF not found",
      expectedPath: INVOICE_PDF_PATH,
      hint: "Put the file at ./public/invoice-example.pdf or set INVOICE_PDF_PATH env var.",
    });
  }
  res.type("application/pdf");
  res.sendFile(INVOICE_PDF_PATH);
});

// Render / misc noise endpoint
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Blink backend running on port ${PORT} (env: ${NODE_ENV})`);
  console.log(`CORS origins: ${CORS_ORIGINS.join(", ")}`);
});

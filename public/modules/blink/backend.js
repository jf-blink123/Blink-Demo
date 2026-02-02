// modules/blink/backend.js

const API_BASE = "https://localhost:3001";

export async function getIntent() {
  const url = `${API_BASE}/api/intents`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));

  // Your server responds like: { result: <blinkIntent>, cached_token: true }
  // Sometimes your caller might be passing around {status, data} shapes.
  // Normalize everything into the actual Blink intent object.
  const intent =
    data?.result?.data?.element ? data.result.data : // if backend returns {result: {ok, data}}
    data?.result?.element ? data.result :            // if backend returns {result: blinkIntent}
    data?.data?.result?.element ? data.data.result : // if wrapper is nested
    data?.data?.element ? data.data :                // if directly under data
    data?.element ? data :                           // raw blink intent
    null;

  // ✅ If we have an intent object, return it even if HTTP status isn't 200
  // (this prevents your VT UI from failing when your backend incorrectly uses 502)
  if (intent?.element?.ccElement) return intent;

  // Otherwise treat it as a real error
  const msg =
    data?.message ||
    data?.error ||
    data?.data?.message ||
    data?.data?.error ||
    `Failed to fetch intent (${res.status})`;

  const err = new Error(msg);
  err.status = res.status;
  err.data = data;
  throw err;
}

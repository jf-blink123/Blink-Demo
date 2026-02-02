// modules/blink/hostedFields.js

const BLINK_SDKS = [
  { src: "https://code.jquery.com/jquery-3.6.3.min.js" },
  { src: "https://gateway2.blinkpayment.co.uk/sdk/web/v1/js/hostedfields.min.js" },
  { src: "https://secure.blinkpayment.co.uk/assets/js/api/custom.js" },
];

// ⚠️ User asked: no ids on injected tags.
// So we dedupe by src.
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll("script")).some((s) => s.src === src);
    if (existing) return resolve();

    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

// Optional: Blink API CSS if you want it
const BLINK_CSS = [
  // { href: "https://secure.blinkpayment.co.uk/assets/css/api.css" },
];

function loadCssOnce(href) {
  const existing = Array.from(document.querySelectorAll("link[rel='stylesheet']")).some((l) => l.href === href);
  if (existing) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export async function injectBlinkAssetsAfterMount() {
  for (const css of BLINK_CSS) loadCssOnce(css.href);
  for (const lib of BLINK_SDKS) await loadScriptOnce(lib.src);
}

export function normalizePastedHtml(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
}

export function fillDeviceParamsIfPresent(scopeEl = document) {
  const tz = scopeEl.querySelector("#device_timezone");
  const caps = scopeEl.querySelector("#device_capabilities");
  const lang = scopeEl.querySelector("#device_accept_language");
  const res = scopeEl.querySelector("#device_screen_resolution");

  if (tz) tz.value = String(new Date().getTimezoneOffset());
  if (lang) lang.value = navigator.language || "en-GB";
  if (res) res.value = `${screen.width}x${screen.height}x${screen.colorDepth || 24}`;
  if (caps) caps.value = "javascript";
}

/**
 * Credit card hosted fields form (ccElement)
 */
export function buildBlinkPaymentForm(ccElementHtml) {
  const form = document.createElement("form");
  form.className = "blink-form";
  form.id = "payment-cc";

  form.innerHTML = `
    <div class="vt-form-host">
      ${ccElementHtml}
    </div>

    <div class="row" style="margin-top:12px; display:flex; gap:10px; align-items:center;">
      <button id="vtPayBtn" type="submit">Pay (Card)</button>
    </div>
  `;

  // Optional: prevent the URL query-string append if Blink is doing GET submits
  // You can toggle this ON if you don't want navigation
  form.addEventListener("submit", (e) => {
    // Keep submit behavior if Blink needs it
    // e.preventDefault();
  });

  form.querySelector("#vtPayBtn")?.addEventListener("click", () => {
    const fd = new FormData(form);
    console.group("CC FormData");
    for (const [k, v] of fd.entries()) console.log(k, v);
    console.groupEnd();
  });

  return form;
}

/**
 * Google Pay element form (gpElement)
 * Blink's gpElement usually contains:
 *  - a container div like <div id="container"></div>
 *  - hidden fields similar to ccElement
 */
export function buildBlinkGooglePayForm(gpElementHtml) {
  const form = document.createElement("form");
  form.className = "blink-form blink-form--gpay";
  form.id = "payment-gpay";

  form.innerHTML = `
    <div class="vt-form-host">
      ${gpElementHtml}
    </div>

    <div class="row" style="margin-top:12px; display:flex; gap:10px; align-items:center;">
      <button type="submit">Pay (Google Pay)</button>
    </div>
  `;

  form.addEventListener("submit", (e) => {
    // Usually Google Pay flow is handled by the SDK,
    // but we keep this here for safety.
    // e.preventDefault();
  });

  form.addEventListener("click", (e) => {
    const btn = e.target.closest("button[type='submit']");
    if (!btn) return;
    const fd = new FormData(form);
    console.group("GPay FormData");
    for (const [k, v] of fd.entries()) console.log(k, v);
    console.groupEnd();
  });

  return form;
}

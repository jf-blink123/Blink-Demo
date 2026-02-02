// modules/ui/paylinks.js
import { escapeHtml } from "../utils.js";
import { sendEmailNotificationViaBackend } from "../api/re-usable.js";

let ALL_PAYLINKS = [];

export async function loadExistingPaylinks(mount) {
  if (!mount) return;

  // Cache (per-module) for client-side filtering without re-fetching
  // Put this at the top of the file (outside the function) if you haven't already:
  // let ALL_PAYLINKS = [];
  // (If you already added it, ignore this comment.)
  if (typeof window !== "undefined") {
    // no-op (just keeping lint calm in some setups)
  }

  if (!mount.querySelector("[data-paylinks-list]")) {
    mount.appendChild(buildPaylinksShell());
  }

  const listEl = mount.querySelector("[data-paylinks-list]");
  if (!listEl) return;

  // Large spinner in list area
  listEl.innerHTML = `
    <div class="paylinks-loading">
      <div class="paylinks-spinner" aria-hidden="true"></div>
      <div class="paylinks-loading-text">Loading paylinks…</div>
    </div>
  `;

  const API_URL = "/api/paylinks/existing";

  // Helper to render based on current dropdown selection
  const renderWithCurrentFilter = () => {
    const selectEl = mount.querySelector("#filter-select");
    const value = selectEl ? String(selectEl.value || "All") : "All";

    let filtered = ALL_PAYLINKS;

    // dropdown values are "All", "Paid", "Unpaid" per your shell
    if (value !== "All") {
      filtered = ALL_PAYLINKS.filter((p) => String(p?.status || "") === value);
    }

    listEl.innerHTML = filtered.length
      ? filtered.map(renderPaylinkRow).join("")
      : `<div class="paylinks-empty">No ${escapeHtml(value)} paylinks found.</div>`;
  };

  // Bind filter listener once
  const filterSelect = mount.querySelector("#filter-select");
  if (filterSelect && !filterSelect.__bound) {
    filterSelect.__bound = true;

    filterSelect.addEventListener("change", () => {
      renderWithCurrentFilter();
    });
  }

  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Paylinks API failed (${res.status})`);
    const json = await res.json();

    const rows = Array.isArray(json.data) ? json.data : [];

    // ✅ Filter out all paylinks unless notes === "Blink Demo"
    const demoOnly = rows.filter((p) => String(p?.notes || "").trim() === "Blink Demo");

    // ✅ Save for client-side filtering
    ALL_PAYLINKS = demoOnly;

    // If you still want the "2/2/1/1 sample" behaviour, uncomment this block:
    /*
    ALL_PAYLINKS = pickPaylinksByStatus(demoOnly, {
      Paid: 2,
      Unpaid: 2,
      Cancelled: 1,
      "Payment Attempted": 1,
    });
    */

    // Render using the currently selected dropdown option
    renderWithCurrentFilter();
  } catch (err) {
    console.warn("Using demo paylinks:", err);

    const rows = getDemoPaylinks();

    // Keep behaviour consistent with live data filter
    const demoOnly = rows.filter((p) => String(p?.notes || "").trim() === "Blink Demo");

    ALL_PAYLINKS = demoOnly.length ? demoOnly : rows;

    // Render using the currently selected dropdown option
    renderWithCurrentFilter();
  }

  // Delegated actions (open / resend) — bind once per mount
  if (!mount.__paylinksBound) {
    mount.__paylinksBound = true;

    mount.addEventListener("click", async (e) => {
      const openBtn = e.target.closest(".paylink-open-btn");

      if (openBtn) {
        const url = openBtn.dataset.url || "";
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      const resendBtn = e.target.closest(".paylink-resend-btn");
      if (resendBtn) {
        const id = resendBtn.dataset.id;
        resendBtn.disabled = true;
        resendBtn.textContent = "Sending…";
        try {
          // 🔁 Replace with real resend endpoint when ready
          // await new Promise((r) => setTimeout(r, 900));
          await sendEmailNotificationViaBackend(id);
          resendBtn.textContent = "Sent ✓";
        } catch {
          resendBtn.textContent = "Failed";
        } finally {
          setTimeout(() => {
            resendBtn.textContent = "Resend";
            resendBtn.disabled = false;
          }, 1200);
        }
      }
    });
  }
}


function buildPaylinksShell() {
  const wrap = document.createElement("div");
  wrap.className = "paylinks";
  wrap.innerHTML = `
    <div class="paylinks-head">
      <div class="paylinks-title">Existing paylinks</div>
      <div class="paylinks-filter">
        <p class="filter-p">Filter</p>
        <select id="filter-select" class="paylinks-filter">
          <option>All</option>
          <option>Paid</option>
          <option>Unpaid</option>
          <option>Payment Attempted</option>
        </select>
      </div>
    </div>
    <div class="paylinks-list" data-paylinks-list="true"></div>
  `;
  return wrap;
}

function showListSpinner(listEl, label = "Loading…") {
  listEl.innerHTML = `
    <div class="paylinks-loading">
      <div class="paylinks-spinner" aria-hidden="true"></div>
      <div class="paylinks-loading-text">${escapeHtml(label)}</div>
    </div>
  `;
}

function renderPaylinkRow(p) {
  const id = p?.id ?? "—";
  const url = p?.paylink_url || "";
  const status = p?.status || "—";
  const name = p?.customer_name || "—";
  const email = p?.customer_email || "—";

  // Blink list payload uses phone_number; demo used customer_phone
  const phone = p?.phone_number || p?.customer_phone || "—";

  // For “Invoice Reference” use notes when present; fallback to transaction_unique
  const invoiceRef = p?.notes || p?.transaction_unique || "";

  const amount = formatMoney(p?.amount, p?.currency);

  return `
    <div class="paylink-row">
      <div class="paylink-main">
        <div class="paylink-name">
          Paylink #${escapeHtml(id)}${invoiceRef ? ` - ${escapeHtml(invoiceRef)}` : ""}
          <span class="badge badge--${statusToClass(status)}">${escapeHtml(status)}</span>
        </div>

        <div class="paylink-grid">
          <div>
            <span class="k">Customer:</span>
            <span class="v">${escapeHtml(name)}</span>
          </div>
          <div>
            <span class="k">Invoice Reference:</span>
            <span class="v">${escapeHtml(invoiceRef || "—")}</span>
          </div>
          <div>
            <span class="k">Amount:</span>
            <span class="v">${escapeHtml(amount)}</span>
          </div>
          <div>
            <span class="k">Email:</span>
            <span class="v">${escapeHtml(email)}</span>
          </div>
          <div>
            <span class="k">Phone:</span>
            <span class="v">${escapeHtml(phone)}</span>
          </div>
        </div>
      </div>

      <div class="paylink-actions">
        ${
          url
            ? `<button class="paylink-open-btn btn secondary" type="button" data-url="${escapeHtml(url)}">Open</button>`
            : `<button class="btn secondary" type="button" disabled>No URL</button>`
        }
        <button class="paylink-resend-btn btn secondary" type="button" data-id="${escapeHtml(id)}">
          Resend
        </button>
      </div>
    </div>
  `;
}

function formatMoney(amount, currency = "GBP") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
  } catch {
    return `${amount} ${currency}`;
  }
}

function getDemoPaylinks() {
  return [
    {
      id: 1124053,
      paylink_url: "https://secure.blinkpayment.co.uk/jfinlaydemo/l/KbN5KtjqQ",
      status: "Paid",
      amount: "12.00",
      transaction_unique: "INV-2000-121",
      currency: "GBP",
      customer_name: "Jane Smith",
      customer_email: "jane.smith@example.com",
      customer_phone: "+44 7700 900123",
      created_at: "2026-02-02 09:46:48",
    },
    {
      id: 1121094,
      paylink_url: "https://secure.blinkpayment.co.uk/jfinlaydemo/l/Ma1LlsaQy",
      status: "Unpaid",
      amount: "2100.00",
      transaction_unique: "INV-2000-122",
      currency: "GBP",
      customer_name: "John Bloggs",
      customer_email: "john.bloggs@example.com",
      customer_phone: "+44 7700 900456",
      created_at: "2026-02-02 09:18:36",
    },
    {
      id: 1127781,
      paylink_url: "https://secure.blinkpayment.co.uk/jfinlaydemo/l/JeOBJH9d5",
      status: "Payment Attempted",
      amount: "85.00",
      transaction_unique: "INV-2000-123",
      currency: "GBP",
      customer_name: "Alice Turner",
      customer_email: "alice.turner@example.com",
      customer_phone: "+44 7700 900789",
      created_at: "2026-02-02 09:14:51",
    },
    {
      id: 1128899,
      paylink_url: "",
      status: "Cancelled",
      amount: "49.99",
      transaction_unique: "INV-2000-124",
      currency: "GBP",
      customer_name: "Mark Wilson",
      customer_email: "mark.wilson@example.com",
      customer_phone: "+44 7700 900999",
      created_at: "2026-02-02 09:11:12",
    },
  ];
}

function statusToClass(status = "") {
  return String(status).toLowerCase().replace(/\s+/g, "-");
}

function normalizeStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function pickPaylinksByStatus(rows, wanted) {
  // wanted example: { Paid: 2, Unpaid: 2, Cancelled: 1, "Payment Attempted": 1 }

  // bucket rows by normalized status
  const buckets = new Map();
  for (const r of rows) {
    const key = normalizeStatus(r?.status);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  // newest first if created_at exists (string compare works with YYYY-MM-DD HH:mm:ss)
  for (const [k, arr] of buckets) {
    arr.sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));
    buckets.set(k, arr);
  }

  const out = [];
  for (const [statusLabel, count] of Object.entries(wanted)) {
    const key = normalizeStatus(statusLabel);
    const arr = buckets.get(key) || [];
    out.push(...arr.slice(0, count));
  }

  return out;
}

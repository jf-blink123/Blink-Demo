// modules/invoice/buildInvoice.js
import { escapeHtml } from "../utils.js";
import { sendEmailNotificationViaBackend } from "../api/re-usable.js";
export function mountBuildInvoice(mount) {
  if (!mount) return;
  if (mount.getAttribute("data-mounted") === "true") return;
  mount.setAttribute("data-mounted", "true");

  const state = { invoice: null, paylinkUrl: "", paylinkId: null };

  mount.innerHTML = `
    <div class="invoice-builder">
      <div class="invoice-builder__head">
        <div>
          <div class="invoice-builder__title">Generate Invoice</div>
          <div class="hint">
            Fill in invoice details, then we’ll create a Paylink via your backend and embed it into the invoice preview.
          </div>
        </div>
      </div>

      <div class="invoice-builder__grid">
        <div class="invoice-builder__panel">

          <div class="invoice-builder__section-title">Customer</div>

          <div class="field">
            <label for="inv_full_name">Full Name</label>
            <input id="inv_full_name" type="text" placeholder="Full Name" value="" />
          </div>

          <div class="field">
            <label for="inv_email">Email</label>
            <input id="inv_email" type="email" placeholder="Email" value="" />
          </div>

          <div class="field">
            <label for="inv_mobile_number">Mobile Number</label>
            <input id="inv_mobile_number" type="text" placeholder="Mobile Number" value="" />
          </div>

          <div class="invoice-builder__section-title" style="margin-top:14px;">Invoice</div>

          <div class="field">
            <label for="inv_transaction_unique">Invoice Reference</label>
            <input id="inv_transaction_unique" type="text" placeholder="Invoice Reference" value="" />
          </div>

          <div class="field">
            <label for="inv_amount">Amount</label>
            <input id="inv_amount" type="number" placeholder="Amount" value="" />
          </div>

          <div class="field">
            <label for="inv_expiry_date">Paylink Expiry Date</label>
            <input id="inv_expiry_date" type="text" placeholder="Paylink Expiry Date" value="" />
          </div>

          <div class="field text_area_input">
            <label for="inv_meta_data">Other Data</label>
            <textarea id="inv_meta_data" placeholder="Other Data"></textarea>
          </div>

          <!-- NEW: Reminder fields -->
          <div class="invoice-builder__section-title" style="margin-top:14px;">Reminders (optional)</div>

          <div class="field">
            <label for="inv_reminder">Reminder</label>
            <select id="inv_reminder">
              <option value=""></option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          <div class="field">
            <label for="inv_reminder_interval_count">Reminder interval</label>
            <input id="inv_reminder_interval_count" type="number" placeholder="Reminder interval" value="" />
          </div>

          <div class="field">
            <label for="inv_reminder_interval_frequency">Reminder Interval Frequency (Weeks, Days)</label>
            <select id="inv_reminder_interval_frequency">
              <option value="">Reminder Interval Frequency (Weeks, Days)</option>
              <option value="days">days</option>
              <option value="week">week</option>
            </select>
          </div>

          <div class="actions" style="margin-top:12px;">
            <button class="btn primary" type="button" data-generate-invoice>Generate Invoice</button>

            <button class="btn secondary hidden" type="button" style="margin-top: 10px" data-view-pdf>
              View Invoice PDF
            </button>

            <button class="btn secondary hidden" type="button" style="margin-top: 10px" data-send-email>
              Send Email Notification
            </button>
          </div>

          <div class="hint" data-inv-hint style="margin-top:10px;"></div>
        </div>

        <div class="invoice-builder__preview" data-preview>
          <div class="hint">Generate an invoice to preview it here.</div>
        </div>
      </div>
    </div>
  `;

  const $preview = mount.querySelector("[data-preview]");
  const $hint = mount.querySelector("[data-inv-hint]");
  const $btnGenerate = mount.querySelector("[data-generate-invoice]");
  const $btnPdf = mount.querySelector("[data-view-pdf]");
  const $btnSendEmail = mount.querySelector("[data-send-email]");

  $btnGenerate?.addEventListener("click", async () => {
    try {
      setBusy($btnGenerate, true, "Generating…");
      if ($hint) $hint.textContent = "";

      // hide action buttons until we have a fresh invoice
      $btnPdf?.classList.add("hidden");
      $btnSendEmail?.classList.add("hidden");
      state.paylinkId = null;
      state.paylinkUrl = "";
      state.invoice = null;

      const invoice = readInvoiceFromInputs(mount);
      const paylinkPayload = buildPaylinkPayload(invoice);

      const created = await createPaylinkViaBackend(paylinkPayload);

      const paylinkUrl = extractPaylinkUrl(created);
      const paylinkId = extractPaylinkId(created);

      if (!paylinkUrl) {
        console.warn("Paylink response:", created);
        throw new Error("No paylink_url found in backend response.");
      }
      if (!paylinkId) {
        console.warn("Paylink response:", created);
        throw new Error("No paylink id found in backend response.");
      }

      state.invoice = invoice;
      state.paylinkUrl = paylinkUrl;
      state.paylinkId = paylinkId;

      $preview.innerHTML = buildInvoiceHtml(invoice, paylinkUrl);

      // show buttons once invoice is generated
      $btnPdf?.classList.remove("hidden");
      $btnSendEmail?.classList.remove("hidden");

      if ($hint) {
        $hint.textContent =
          "Invoice generated + Paylink created. You can view the example PDF or send an email notification for the created paylink.";
      }
    } catch (err) {
      console.error(err);
      if ($hint) $hint.textContent = `Failed: ${String(err?.message || err)}`;
    } finally {
      setBusy($btnGenerate, false);
    }
  });

  $btnPdf?.addEventListener("click", () => {
    window.open("http://localhost:3001/invoice-example.pdf", "_blank", "noopener,noreferrer");
  });

  $btnSendEmail?.addEventListener("click", async () => {
    try {
      if (!state.paylinkId) throw new Error("No paylink id available yet.");
      if ($hint) $hint.textContent = "";

      setBusy($btnSendEmail, true, "Sending…");

      await sendEmailNotificationViaBackend(state.paylinkId);

      if ($hint) $hint.textContent = "Email notification triggered successfully.";
    } catch (err) {
      console.error(err);
      if ($hint) $hint.textContent = `Failed to send email: ${String(err?.message || err)}`;
    } finally {
      setBusy($btnSendEmail, false);
    }
  });
}

function readInvoiceFromInputs(root) {
  const get = (id) => root.querySelector(`#${CSS.escape(id)}`)?.value ?? "";

  // meta_data JSON (optional)
  let meta = undefined;
  const metaRaw = get("inv_meta_data").trim();
  if (metaRaw) {
    try {
      meta = JSON.parse(metaRaw);
    } catch {
      meta = { raw: metaRaw };
    }
  }

  // reminder fields (optional)
  const reminderRaw = String(get("inv_reminder") ?? "").trim().toLowerCase();
  const reminder =
    reminderRaw === "true" ? true : reminderRaw === "false" ? false : undefined;

  const reminder_interval_count_raw = String(get("inv_reminder_interval_count") ?? "").trim();
  const reminder_interval_count =
    reminder_interval_count_raw === "" ? undefined : toInt(reminder_interval_count_raw);

  const reminder_interval_frequency_raw = String(get("inv_reminder_interval_frequency") ?? "").trim();
  const reminder_interval_frequency =
    reminder_interval_frequency_raw === "" ? undefined : reminder_interval_frequency_raw;

  const transactionUnique = get("inv_transaction_unique").trim();
  const amount = toInt(get("inv_amount"));

  return {
    // paylink fields
    full_name: get("inv_full_name").trim(),
    email: get("inv_email").trim(),
    mobile_number: get("inv_mobile_number").trim(),
    transaction_unique: transactionUnique,
    amount,
    notes: 'Blink Demo', // update if you wanto to refresh list
    expiry_date: get("inv_expiry_date").trim(),
    meta_data: meta ?? {},

    // reminder fields
    reminder,
    reminder_interval_count,
    reminder_interval_frequency,

    // computed
    invoice_no: deriveInvoiceNoFromTransactionUnique(transactionUnique) || "INV-0000",
    date: formatUKDate(new Date()),
  };
}

function buildPaylinkPayload(invoice) {
  // ✅ KEEP IN PAYLOAD (but hidden from UI)
  const notification_url = "https://blinkpayment.co.uk/webhook";
  const redirect_url = "https://api-demo-php.blinkpayment.co.uk/return";
  const payment_method = ["credit-card", "open-banking"];
  const transaction_type = "SALE";

  const payload = {
    payment_method,
    transaction_type,

    full_name: invoice.full_name,
    email: invoice.email,
    mobile_number: invoice.mobile_number,

    transaction_unique: invoice.transaction_unique || `Payment for ${invoice.invoice_no}`,
    is_decide_amount: true,
    amount: invoice.amount,

    notes: invoice.notes || invoice.transaction_unique || `Payment for ${invoice.invoice_no}`,
    notification_url,
    redirect_url,
    expiry_date: invoice.expiry_date || "31-12-2100",
    meta_data: invoice.meta_data ?? {},
  };

  // Reminders (optional):
  // Defaults to false at Blink side; if user leaves blank we don't send it at all.
  // If reminder === true, include interval fields if provided.
  if (typeof invoice.reminder === "boolean") {
    payload.reminder = invoice.reminder;

    if (invoice.reminder === true) {
      if (Number.isInteger(invoice.reminder_interval_count) && invoice.reminder_interval_count > 0) {
        payload.reminder_interval_count = invoice.reminder_interval_count;
      }
      if (
        invoice.reminder_interval_frequency === "days" ||
        invoice.reminder_interval_frequency === "week"
      ) {
        payload.reminder_interval_frequency = invoice.reminder_interval_frequency;
      }
    }
  }

  return payload;
}

async function createPaylinkViaBackend(payload) {
  const res = await fetch("https://localhost:3001/api/paylinks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || JSON.stringify(data);
    throw new Error(`Backend /api/paylinks failed (${res.status}): ${msg}`);
  }
  return data;
}

// async function sendEmailNotificationViaBackend(paylinkId) {
//   const res = await fetch(
//     `https://localhost:3001/api/paylinks/${encodeURIComponent(paylinkId)}/notifications`,
//     {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       cache: "no-store",
//       body: JSON.stringify({ send_email: true }),
//     }
//   );

//   const data = await res.json().catch(() => ({}));
//   if (!res.ok) {
//     const msg = data?.error || data?.message || JSON.stringify(data);
//     throw new Error(`Backend notification failed (${res.status}): ${msg}`);
//   }
//   return data;
// }

function extractPaylinkUrl(serverResponse) {
  const r = serverResponse?.result ?? serverResponse?.data ?? serverResponse;

  return (
    r?.paylink_url ||
    r?.data?.paylink_url ||
    r?.result?.data?.paylink_url ||
    r?.blink?.paylink_url ||
    r?.blink?.data?.paylink_url ||
    null
  );
}

function extractPaylinkId(serverResponse) {
  const r = serverResponse?.result ?? serverResponse?.data ?? serverResponse;

  return (
    r?.id ||
    r?.data?.id ||
    r?.result?.data?.id ||
    r?.blink?.id ||
    r?.blink?.data?.id ||
    null
  );
}

function buildInvoiceHtml(invoice, paylinkUrl) {
  const total = invoice.amount || 0;

  return `
    <main class="invoice" id="Invoice">
      <section class="pad">
        <header class="top">
          <h1 class="title">INVOICE</h1>

          <div class="meta" aria-label="Invoice metadata">
            <div class="label">Date</div>
            <p class="value">${escapeHtml(invoice.date)}</p>

            <div class="label">Invoice No.</div>
            <p class="value">${escapeHtml(invoice.invoice_no)}</p>
          </div>
        </header>

        <section class="parties" aria-label="Bill to and From">
          <div class="box">
            <p class="heading">Bill to:</p>
            <p class="name">${escapeHtml(invoice.full_name || "—")}</p>
            <p class="line">${escapeHtml(invoice.email || "—")}</p>
            <p class="line">${escapeHtml(invoice.mobile_number || "—")}</p>
          </div>

          <div class="box">
            <p class="heading">From:</p>
            <p class="name">Your Company</p>
            <p class="line">accounts@yourcompany.com</p>
            <p class="line">123 Any Street</p>
            <p class="line">Any City, ST 12345</p>
          </div>
        </section>

        <section class="table-wrap" aria-label="Invoice line items">
          <table>
            <thead>
              <tr>
                <th class="desc">Description</th>
                <th class="num">Qty</th>
                <th class="num">Price</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="desc">${escapeHtml(invoice.transaction_unique || "Service")}</td>
                <td class="num">1</td>
                <td class="num">${escapeHtml(moneyGBP(total))}</td>
                <td class="num">${escapeHtml(moneyGBP(total))}</td>
              </tr>
            </tbody>
          </table>

          <div class="total" aria-label="Total amount">
            <span class="muted">Total amount</span>
            <span class="amount">${escapeHtml(moneyGBP(total))}</span>
          </div>
        </section>

        <section class="bottom" aria-label="Payment and notes">
          <div class="pay">
            <p class="small-heading">Payment</p>
            <p>Pay securely using the link below.</p>
          </div>

          <div class="notes">
            <p class="small-heading">Notes</p>
            <p>${escapeHtml(invoice.notes || "—")}</p>
          </div>
        </section>

        <section class="pay-cta">
          <a class="pay-with-blink-btn" href="${escapeHtml(paylinkUrl)}" target="_blank" rel="noopener noreferrer">
            Pay with Blink
          </a>
        </section>

        <footer class="footer">
          <div class="site">www.example.com</div>
        </footer>
      </section>
    </main>
  `;
}

function moneyGBP(n) {
  const num = Number(n || 0);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(num);
  } catch {
    return `£${num.toFixed(2)}`;
  }
}

function formatUKDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function toInt(v) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function deriveInvoiceNoFromTransactionUnique(transactionUnique) {
  const s = String(transactionUnique || "");
  const m = s.match(/(INV[-\w]+)/i);
  return m ? m[1] : "";
}

function setBusy(btn, busy, labelWhenBusy = "Working…") {
  if (!btn) return;
  if (busy) {
    btn.dataset.prevText = btn.textContent;
    btn.textContent = labelWhenBusy;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.prevText || btn.textContent;
    btn.disabled = false;
    delete btn.dataset.prevText;
  }
}

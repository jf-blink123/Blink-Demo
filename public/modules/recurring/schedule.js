// modules/recurring/schedule.js

export function mountRecurringSchedule(mount) {
  if (!mount) return;

  mount.innerHTML = `
    <div class="recurring-builder">
      <div class="recurring-builder__head">
        <div class="recurring-builder__title">Recurring Payment Schedule</div>
        <div class="hint">
          Create a fixed schedule repeat payment. Only key customer and schedule fields are shown.
        </div>
      </div>

      <div class="recurring-builder__panel">

        <div class="recurring-builder__section-title">Customer</div>

        <div class="field">
          <label for="rp_customer_name">Customer Name</label>
          <input
            id="rp_customer_name"
            type="text"
            placeholder="customer_name"
            value=""
          />
        </div>

        <div class="field">
          <label for="rp_customer_email">Customer Email</label>
          <input
            id="rp_customer_email"
            type="email"
            placeholder="customer_email"
            value=""
          />
        </div>

        <div class="field">
          <label for="rp_reference">Reference</label>
          <input
            id="rp_reference"
            type="text"
            placeholder="reference"
            value=""
          />
        </div>

        <div class="recurring-builder__section-title" style="margin-top:14px;">
          Schedule
        </div>

        <div class="field">
          <label for="rp_frequency">Frequency</label>
          <select id="rp_frequency">
            <option value="">Select frequency</option>
            <option value="days">days</option>
            <option value="week">week</option>
          </select>
        </div>

        <div class="field">
          <label for="rp_frequency_duration">Frequency Duration</label>
          <input
            id="rp_frequency_duration"
            type="number"
            placeholder="frequency_duration"
            value=""
          />
        </div>

        <div class="field">
          <label for="rp_first_amount">First Amount</label>
          <input
            id="rp_first_amount"
            type="number"
            step="0.01"
            placeholder="first_amount"
            value=""
          />
        </div>

        <div class="field">
          <label for="rp_recurring_amount">Recurring Amount</label>
          <input
            id="rp_recurring_amount"
            type="number"
            step="0.01"
            placeholder="recurring_amount"
            value=""
          />
        </div>

        <div class="field">
          <label for="rp_installments">Installments</label>
          <input
            id="rp_installments"
            type="number"
            placeholder="installments"
            value=""
          />
        </div>

        <div class="actions" style="margin-top:14px;">
          <button class="btn primary" type="button" data-create-recurring>
            Create Repeat Payment
          </button>
        </div>

        <div class="hint" data-recurring-hint style="margin-top:10px;"></div>
      </div>
    </div>
  `;

  const $hint = mount.querySelector("[data-recurring-hint]");
  const $btnCreate = mount.querySelector("[data-create-recurring]");

  $btnCreate?.addEventListener("click", () => {
    const payload = readRecurringFromInputs(mount);
    console.log("Recurring payment payload (UI subset):", payload);

    if ($hint) {
      $hint.textContent =
        "Recurring payment schedule prepared. See console for mapped payload.";
    }
  });
}

/**
 * Reads ONLY the UI fields and maps them to the repeat-payments payload shape
 */
function readRecurringFromInputs(root) {
  const get = (id) => root.querySelector(`#${CSS.escape(id)}`)?.value ?? "";

  return {
    // fixed values (hidden from UI)
    payment_type: "fixed_schedule",
    currency: "GBP",
    type: 1,

    // exposed fields
    customer_name: get("rp_customer_name").trim(),
    customer_email: get("rp_customer_email").trim(),
    reference: get("rp_reference").trim(),

    frequency: get("rp_frequency"),
    frequency_duration: toInt(get("rp_frequency_duration")),

    first_amount: toNumber(get("rp_first_amount")),
    recurring_amount: toNumber(get("rp_recurring_amount")),

    is_limited_installments: true,
    installments: toInt(get("rp_installments")),
  };
}

function toInt(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toNumber(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

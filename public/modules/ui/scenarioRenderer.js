// modules/ui/scenarioRenderer.js
import html_obj from "../html_objects.js";
import { createAppState, getScenario, getActiveTag } from "../state.js";
import { renderScenarioTabs, updateSelectedScenarioTab, renderNestedTags } from "../ui/tabs.js";
import { ensureViewMount, removeMountedViewsExcept } from "../ui/mounts.js";

import {
  renderFieldsFromFieldsArray,
  clearScenarioFormFields,
  readValuesFromContainer,
  applyValuesToContainer,
} from "../ui/fields.js";

import { loadExistingPaylinks } from "../ui/paylinks.js";
import { mountBuildInvoice } from "../invoice/buildInvoice.js";

import { getIntent } from "../blink/backend.js";
import {
  normalizePastedHtml,
  buildBlinkPaymentForm,
  buildBlinkGooglePayForm,      // ✅ NEW
  fillDeviceParamsIfPresent,
  injectBlinkAssetsAfterMount,
} from "../blink/hostedFields.js";

import { logLine } from "../utils.js";

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}

async function populateCardFields({ mount, intentData }) {
  const ccElementRaw = intentData?.element?.ccElement;
  if (!ccElementRaw) throw new Error("No ccElement on intent response");

  const gpElementRaw = intentData?.element?.gpElement || ""; // ✅ NEW
  console.log(gpElementRaw);
  
  // 1) Mount both elements first (cc + gp)
  const ccElementHtml = normalizePastedHtml(ccElementRaw);
  const ccForm = buildBlinkPaymentForm(ccElementHtml);

  mount.innerHTML = "";
  mount.appendChild(ccForm);

  // 1b) Add Google Pay area underneath (if present)
  if (gpElementRaw) {
    const gpElementHtml = normalizePastedHtml(gpElementRaw);

    const sep = document.createElement("div");
    sep.className = "hint";
    sep.style.marginTop = "14px";
    sep.textContent = "— Or pay with Google Pay —";

    const gpForm = buildBlinkGooglePayForm(gpElementHtml);

    mount.appendChild(sep);
    mount.appendChild(gpForm);

    // device params exist inside gp form too
    fillDeviceParamsIfPresent(gpForm);
  }

  // 2) Fill device params for card form
  fillDeviceParamsIfPresent(ccForm);

  // 3) Inject assets AFTER elements exist
  await injectBlinkAssetsAfterMount();

  // 4) Wait a tick so globals are ready
  await nextFrame();
}

// small safety: if your script runs before DOM is ready, nothing mounts
function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

export function initApp({ scenarios }) {
  onReady(() => _initApp({ scenarios }));
}

function _initApp({ scenarios }) {
  const state = createAppState(scenarios);

  const $tabs = document.querySelector(".tabs");
  const $title = document.getElementById("panelTitle");
  const $desc = document.getElementById("panelDesc");
  const $meta = document.getElementById("panelMeta");
  const $card = document.querySelector(".card");

  if (!$tabs || !$card) {
    console.error("Scenario renderer: missing required DOM nodes.", { tabs: !!$tabs, card: !!$card });
    return;
  }

  let $fieldsHost = $card.querySelector('[data-fields-host="true"]');
  if (!$fieldsHost) {
    $fieldsHost = document.createElement("div");
    $fieldsHost.setAttribute("data-fields-host", "true");
    $fieldsHost.className = "fields-host";
    $card.prepend($fieldsHost);
  }

  renderScenarioTabs({
    $tabs,
    scenarios: state.scenarios,
    onSelect: (id) => setActiveScenario(id),
  });

  setActiveScenario(state.activeScenarioId);

  function setActiveScenario(id) {
    state.activeScenarioId = id;
    const scenario = getScenario(state, id);

    updateSelectedScenarioTab(id);
    if ($title) $title.textContent = scenario.title;

    if (scenario.tags?.length && !state.activeTagByScenario[id]) {
      state.activeTagByScenario[id] = scenario.tags[0];
    }

    renderScenario();
    loadInputs(state, $fieldsHost);
  }

  async function renderScenario() {
    const scenario = getScenario(state, state.activeScenarioId);

    // Virtual Terminal
    if (scenario.id === "virtual_terminal") {
      if ($meta) $meta.innerHTML = "";
      if ($desc) $desc.textContent = scenario.description || "";

      clearScenarioFormFields($fieldsHost);

      removeMountedViewsExcept($card, "vtHostedFieldsMount");
      const mount = ensureViewMount($card, "vtHostedFieldsMount");
      mount.innerHTML = `<div class="hint">Loading Blink Hosted Fields…</div>`;

      try {
        const intentData = await getIntent();
        console.log('cal');
        
        await populateCardFields({ mount, intentData });
      } catch (err) {
        console.error(err);
        mount.innerHTML = `<div class="hint">Failed to load hosted fields (see console).</div>`;
      }
      return;
    }

    // Normal scenarios
    const activeTag = getActiveTag(state);

    renderNestedTags({
      $meta,
      tags: scenario.tags || [],
      activeTag,
      onSelect: (tag) => {
        state.activeTagByScenario[state.activeScenarioId] = tag;
        renderScenario();
        loadInputs(state, $fieldsHost);
      },
    });

    const view = scenario.views?.[activeTag];
    if ($desc) $desc.textContent = view?.description || scenario.description || "";

    const fields = view?.fields || [];
    renderFieldsFromFieldsArray($fieldsHost, fields, {
      onRun: fields.length ? () => onRunScenario(state, $fieldsHost) : null,
      onSave: fields.length ? () => saveInputs(state, $fieldsHost) : null,
      onReset: fields.length ? () => resetInputs(state, $fieldsHost) : null,
    });

    removeMountedViewsExcept($card, activeTag);

    if (activeTag === "Invoice") {
      clearScenarioFormFields($fieldsHost);
      const mount = ensureViewMount($card, activeTag);
      if (mount.getAttribute("data-mounted") !== "true") {
        mount.appendChild(stringToHtml(html_obj?.Invoice || "<div class='hint'>No Invoice HTML found.</div>"));
        mount.setAttribute("data-mounted", "true");
      }
      return;
    }

    if (activeTag === "Build Invoice") {
      clearScenarioFormFields($fieldsHost);
      const mount = ensureViewMount($card, activeTag);
      mountBuildInvoice(mount);
      return;
    }

    if (activeTag === "Payment Links") {
      clearScenarioFormFields($fieldsHost);
      const mount = ensureViewMount($card, activeTag);
      mount.innerHTML = "";
      await loadExistingPaylinks(mount);
      return;
    }
  }

  async function onRunScenario(state, fieldsHost) {
    const scenario = getScenario(state, state.activeScenarioId);
    const activeTag = getActiveTag(state);
    const fields = scenario?.views?.[activeTag]?.fields || [];

    const values = readValuesFromContainer(fieldsHost, fields);

    try {
      if (typeof scenario.run === "function") {
        await scenario.run({ values, log: logLine });
      } else {
        logLine(`→ [${scenario.title}/${activeTag}] Values:\n${JSON.stringify(values, null, 2)}\n\n`);
      }
    } catch (err) {
      logLine(`✗ Error:\n${String(err?.stack || err)}\n\n`);
    }
  }

  function stringToHtml(htmlString) {
    const template = document.createElement("template");
    template.innerHTML = String(htmlString || "").trim();
    return template.content;
  }
}

// ---- localStorage helpers for scenario fields (NO form) ----
function storageKey(state) {
  const scenarioId = state.activeScenarioId;
  const tag = state.activeTagByScenario[scenarioId] || "default";
  return `demo_inputs_${scenarioId}_${tag}`;
}

function getFieldsForActiveView(state) {
  const scenario = state.scenarios.find((s) => s.id === state.activeScenarioId);
  const tag = state.activeTagByScenario[state.activeScenarioId] || scenario?.tags?.[0];
  return scenario?.views?.[tag]?.fields || [];
}

function saveInputs(state, fieldsHost) {
  const fields = getFieldsForActiveView(state);
  const values = readValuesFromContainer(fieldsHost, fields);
  localStorage.setItem(storageKey(state), JSON.stringify(values));
  logLine(`✓ Saved inputs.\n`);
}

function loadInputs(state, fieldsHost) {
  const scenario = state.scenarios.find((s) => s.id === state.activeScenarioId);
  if (scenario?.id === "virtual_terminal") return;

  const raw = localStorage.getItem(storageKey(state));
  if (!raw) return;

  try {
    const values = JSON.parse(raw);
    applyValuesToContainer(fieldsHost, values);
  } catch {}
}

function resetInputs(state, fieldsHost) {
  localStorage.removeItem(storageKey(state));
  const fields = getFieldsForActiveView(state);
  const empty = {};
  for (const f of fields) empty[f.id] = "";
  applyValuesToContainer(fieldsHost, empty);
  logLine(`↺ Reset inputs.\n`);
}

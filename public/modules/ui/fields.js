// modules/ui/fields.js

/**
 * Renders a set of input fields into a container (NO <form>).
 * Also renders action buttons (Run/Save/Reset) if callbacks are provided.
 *
 * Usage:
 * renderFieldsFromFieldsArray(container, fields, {
 *   c: () => {},
 *   onSave: () => {},
 *   onReset: () => {},
 * });
 */

export function renderFieldsFromFieldsArray(container, fields = [], opts = {}) {
  if (!container) return;

  const { onRun, onSave, onReset } = opts;

  // wipe previous UI
  container.innerHTML = "";

  // no fields: still render actions only if at least one handler exists
  // const shouldShowActions = Boolean(onRun || onSave || onReset);
  const shouldShowActions = false;
  // render fields
  if (Array.isArray(fields) && fields.length) {
    for (const field of fields) {
      const wrapper = document.createElement("div");
      wrapper.className = "field";

      const label = document.createElement("label");
      label.setAttribute("for", field.id);
      label.textContent = field.label || field.id;

      let input;

      if (field.type === "textarea") {
        input = document.createElement("textarea");
        input.placeholder = field.placeholder ?? "";
      } else if (field.type === "select") {
        input = document.createElement("select");
        for (const opt of field.options || []) {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          input.appendChild(o);
        }
      } else {
        input = document.createElement("input");
        input.type = field.type || "text";
        input.placeholder = field.placeholder ?? "";
      }

      input.id = field.id;
      input.name = field.id;

      if (field.required) input.required = true;

      // IMPORTANT: you requested defaults empty unless you explicitly set defaultValue
      if (field.defaultValue != null) {
        input.value = String(field.defaultValue);
      } else {
        input.value = "";
      }

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      container.appendChild(wrapper);
    }
  }

  // actions
  if (shouldShowActions) {
    const actions = document.createElement("div");
    actions.className = "actions";

    if (onRun) {
      const btnRun = document.createElement("button");
      btnRun.type = "button";
      btnRun.className = "btn primary";
      btnRun.textContent = "Run";
      btnRun.addEventListener("click", onRun);
      actions.appendChild(btnRun);
    }

    if (onSave) {
      const btnSave = document.createElement("button");
      btnSave.type = "button";
      btnSave.className = "btn secondary";
      btnSave.textContent = "Save";
      btnSave.addEventListener("click", onSave);
      actions.appendChild(btnSave);
    }

    if (onReset) {
      const btnReset = document.createElement("button");
      btnReset.type = "button";
      btnReset.className = "btn secondary";
      btnReset.textContent = "Reset";
      btnReset.addEventListener("click", onReset);
      actions.appendChild(btnReset);
    }

    // hide actions row when there are no fields AND no run handler
    // (otherwise you'd see empty buttons on Paylink tabs)
    if (!fields?.length && !onRun && !onSave && !onReset) {
      actions.classList.add("hidden");
    }

    container.appendChild(actions);
  }
}

export function clearScenarioFormFields(container) {
  // Kept name for compatibility, but now it just clears a container
  if (!container) return;
  container.innerHTML = "";
}

/**
 * Read values from inputs/selects/textarea inside a container.
 * Returns { [id]: value }
 */
export function readValuesFromContainer(container, fields = []) {
  const values = {};
  for (const f of fields) {
    const el = container.querySelector(`#${CSS.escape(f.id)}`);
    values[f.id] = el ? el.value : "";
  }
  return values;
}

/**
 * Apply values into inputs/selects/textarea inside a container.
 */
export function applyValuesToContainer(container, values = {}) {
  if (!container) return;
  for (const [k, v] of Object.entries(values)) {
    const el = container.querySelector(`#${CSS.escape(k)}`);
    if (el != null && v != null) el.value = v;
  }
}

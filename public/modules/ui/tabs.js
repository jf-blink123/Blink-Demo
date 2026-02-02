// modules/ui/tabs.js
export function renderScenarioTabs({ $tabs, scenarios, onSelect }) {
  if (!$tabs) return;
  $tabs.innerHTML = "";

  for (const s of scenarios) {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.type = "button";
    btn.role = "tab";
    btn.id = `tab-${s.id}`;
    btn.setAttribute("aria-controls", `panel-${s.id}`);
    btn.setAttribute("aria-selected", "false");
    btn.textContent = s.title;

    btn.addEventListener("click", () => onSelect(s.id));
    $tabs.appendChild(btn);
  }
}

export function updateSelectedScenarioTab(activeId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const selected = btn.id === `tab-${activeId}`;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

export function renderNestedTags({ $meta, tags = [], activeTag, onSelect }) {
  if (!$meta) return;
  $meta.innerHTML = "";

  tags.forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    if (tag === activeTag) span.setAttribute("data-selected", "true");

    span.addEventListener("click", () => onSelect(tag));
    $meta.appendChild(span);
  });
}

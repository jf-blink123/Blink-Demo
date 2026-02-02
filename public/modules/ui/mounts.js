// modules/ui/mounts.js
export function ensureViewMount($card, id) {
  if (!$card) return null;
  let mount = document.getElementById(id);
  if (!mount) {
    mount = document.createElement("section");
    mount.id = id;
    mount.className = "view-mount";
    $card.appendChild(mount);
  }
  return mount;
}

export function removeMountedViewsExcept($card, keepId) {
  if (!$card) return;
  const mounts = Array.from($card.querySelectorAll(".view-mount"));
  for (const m of mounts) {
    if (m.id !== keepId) m.remove();
  }
}

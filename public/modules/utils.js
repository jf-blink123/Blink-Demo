// modules/utils.js
export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export function logLine(msg) {
  const $log = document.getElementById("log");
  if ($log) $log.textContent += msg;
  else console.log(msg);
}

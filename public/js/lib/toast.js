import { setText } from "./dom.js";

let hideTimer = null;

export function showToast(message, { variant = "default", timeoutMs = 3500 } = {}) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.classList.toggle("error", variant === "error");
  setText(node, message);

  // Restart animation reliably
  node.classList.remove("show");
  node.offsetWidth;
  node.classList.add("show");

  node.style.display = "block";

  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    node.style.display = "none";
  }, timeoutMs);
}

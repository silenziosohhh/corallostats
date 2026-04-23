import { el } from "./dom.js";

export function skelBlock({ widthPct = 100, height = 12, radius = 10, className = "" } = {}) {
  const node = el("div", { className: `skel ${className}`.trim() });
  node.style.setProperty("--skel-w", `${widthPct}%`);
  node.style.setProperty("--skel-h", `${height}px`);
  node.style.setProperty("--skel-r", `${radius}px`);
  return node;
}

export function setSkeletonText(node, { widthPct = 100, height = 12, radius = 10 } = {}) {
  if (!node) return;
  node.textContent = "";
  node.classList.add("skel", "skel-text");
  const tag = String(node.tagName || "").toUpperCase();
  const inlineTags = new Set(["SPAN", "CODE", "B", "I", "EM", "STRONG", "SMALL", "S"]);
  node.classList.add(inlineTags.has(tag) ? "skel-inline" : "skel-block");
  node.style.setProperty("--skel-w", `${widthPct}%`);
  node.style.setProperty("--skel-h", `${height}px`);
  node.style.setProperty("--skel-r", `${radius}px`);
}

export function clearSkeletonText(node) {
  if (!node) return;
  node.classList.remove("skel", "skel-text", "skel-inline", "skel-block");
  node.style.removeProperty("--skel-w");
  node.style.removeProperty("--skel-h");
  node.style.removeProperty("--skel-r");
}

export function setAriaBusy(node, busy) {
  if (!node) return;
  if (busy) node.setAttribute("aria-busy", "true");
  else node.removeAttribute("aria-busy");
}

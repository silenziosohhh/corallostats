import { copyToClipboard } from "../lib/clipboard.js";
import { showToast } from "../lib/toast.js";
import { t } from "../lib/i18n.js";

function codeTextFrom(pre) {
  if (!pre) return "";
  return String(pre.textContent || "").trim();
}

function ensureCopyButton(block) {
  if (!block || block.dataset.codecopyBound === "1") return;
  const pre = block.querySelector("pre");
  if (!pre) return;

  block.dataset.codecopyBound = "1";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn codecopy-btn";
  btn.setAttribute("aria-label", "Copia");
  btn.innerHTML = `<i class="fa-regular fa-copy" aria-hidden="true"></i>`;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = codeTextFrom(pre);
    if (!text) return;
    try {
      await copyToClipboard(text);
      showToast(t("ui.copied"));
    } catch {
      showToast(t("ui.copyFailed"), { variant: "error" });
    }
  });

  block.append(btn);
}

export function initCodeblocks(root = document) {
  const blocks = Array.from(root.querySelectorAll(".codeblock"));
  for (const b of blocks) ensureCopyButton(b);
}


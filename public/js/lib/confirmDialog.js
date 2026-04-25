let dialogRef = null;
let inFlight = null;

function h(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = String(className);
  if (text != null) node.textContent = String(text);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

function ensureDialog() {
  if (dialogRef) return dialogRef;

  const titleEl = h("div", { className: "dialog-title", text: "Conferma" });
  const msgEl = h("div", { className: "muted confirm-message" });
  const listEl = h("ul", { className: "confirm-list" });

  const cancelTop = h("button", { className: "btn", text: "Annulla", attrs: { type: "button" } });
  const cancelBottom = h("button", { className: "btn", text: "Annulla", attrs: { type: "button" } });
  const okBtn = h("button", { className: "btn primary", text: "OK", attrs: { type: "button" } });

  const modal = h(
    "div",
    { className: "modal confirm-modal" },
    [
      h("header", {}, [
        h("div", { className: "dialog-head-left" }, [titleEl]),
        cancelTop,
      ]),
      h("main", {}, [msgEl, listEl]),
      h("footer", { className: "confirm-actions" }, [cancelBottom, okBtn]),
    ]
  );

  const dialog = h("dialog", { className: "ui-confirm", attrs: { "aria-label": "Conferma" } }, [modal]);
  document.body.appendChild(dialog);

  function finish(ok) {
    const st = inFlight;
    inFlight = null;
    try {
      dialog.close(ok ? "ok" : "cancel");
    } catch {
      // ignore
    }
    st?.resolve?.(!!ok);
  }

  cancelTop.addEventListener("click", () => finish(false));
  cancelBottom.addEventListener("click", () => finish(false));
  okBtn.addEventListener("click", () => finish(true));

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(false);
  });

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) finish(false);
  });

  dialogRef = { dialog, titleEl, msgEl, listEl, okBtn, cancelTop, cancelBottom };
  return dialogRef;
}

export async function uiConfirm({
  title = "Conferma",
  message = "",
  details = [],
  confirmText = "OK",
  cancelText = "Annulla",
  variant = "default",
} = {}) {
  const ui = ensureDialog();

  ui.titleEl.textContent = String(title || "Conferma");
  ui.msgEl.textContent = String(message || "");

  ui.listEl.innerHTML = "";
  const items = Array.isArray(details) ? details.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (items.length) {
    for (const t of items) ui.listEl.appendChild(h("li", { text: t }));
    ui.listEl.style.display = "";
  } else {
    ui.listEl.style.display = "none";
  }

  ui.okBtn.textContent = String(confirmText || "OK");
  ui.cancelTop.textContent = String(cancelText || "Annulla");
  ui.cancelBottom.textContent = String(cancelText || "Annulla");

  ui.okBtn.classList.toggle("danger", variant === "danger");
  ui.okBtn.classList.toggle("primary", variant !== "danger");

  if (inFlight?.resolve) {
    try {
      inFlight.resolve(false);
    } catch {
      // ignore
    }
  }

  const p = new Promise((resolve) => {
    inFlight = { resolve };
  });

  try {
    ui.dialog.showModal();
  } catch {
    const msg = String(message || "");
    const extra = items.length ? `\n\n- ${items.join("\n- ")}` : "";
    return window.confirm(msg + extra);
  }

  try {
    ui.cancelBottom.focus();
  } catch {
    // ignore
  }

  return await p;
}

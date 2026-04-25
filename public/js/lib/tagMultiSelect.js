import { openDropdownPortal } from "./dropdownPortal.js";

let globalsBound = false;
let openInst = null;

function closeOpen() {
  if (!openInst) return;
  const { wrap, btn, portal, onScroll } = openInst;
  wrap?.classList?.remove("open");
  btn?.setAttribute?.("aria-expanded", "false");
  portal?.close?.();
  try {
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
  } catch {
    // ignore
  }
  openInst = null;
}

function bindGlobals() {
  if (globalsBound) return;
  globalsBound = true;

  document.addEventListener("ui:dropdown-close-all", () => closeOpen());

  document.addEventListener("click", (e) => {
    if (!openInst) return;
    if (openInst.wrap?.contains?.(e.target)) return;
    if (openInst.portal?.menu?.contains?.(e.target)) return;
    closeOpen();
  });

  document.addEventListener("keydown", (e) => {
    if (!openInst) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    closeOpen();
  });
}

function countChecked(menu) {
  return menu ? menu.querySelectorAll('input[type="checkbox"]:checked').length : 0;
}

function syncLabel({ labelEl, menu, placeholder = "Seleziona tag" } = {}) {
  if (!labelEl) return;
  const n = countChecked(menu);
  labelEl.textContent = n ? `Tag selezionati: ${n}` : placeholder;
}

function syncChips({ chipsEl, menu, getLabel }) {
  if (!chipsEl || !menu) return;
  chipsEl.innerHTML = "";
  const checked = [...menu.querySelectorAll('input[type="checkbox"]:checked')];
  for (const c of checked) {
    const value = String(c.value || "").trim();
    if (!value) continue;
    const text = typeof getLabel === "function" ? getLabel(value) : value;
    const chip = document.createElement("span");
    chip.className = "pill tag-chip";
    chip.textContent = text;
    chipsEl.appendChild(chip);
  }
}

function enforceMax({ menu, max = 10 } = {}) {
  if (!menu) return;
  const maxN = Number(max);
  if (!Number.isFinite(maxN) || maxN <= 0) return;
  const checked = [...menu.querySelectorAll('input[type="checkbox"]:checked')];
  const atMax = checked.length >= maxN;
  for (const box of menu.querySelectorAll('input[type="checkbox"]')) {
    if (!(box instanceof HTMLInputElement)) continue;
    if (box.checked) {
      box.disabled = false;
      continue;
    }
    box.disabled = atMax;
  }
}

export function mountTagMultiSelect({
  wrap,
  btn,
  menu,
  labelEl,
  chipsEl,
  max = 10,
  placeholder = "Seleziona tag",
  getLabel,
  onMaxExceeded,
} = {}) {
  if (!wrap || !btn || !menu) return () => {};
  bindGlobals();

  const syncAll = () => {
    syncLabel({ labelEl, menu, placeholder });
    syncChips({ chipsEl, menu, getLabel });
    enforceMax({ menu, max });
  };

  const onBtnClick = (e) => {
    e.preventDefault();
    const isOpen = wrap.classList.contains("open");
    if (isOpen) {
      closeOpen();
      return;
    }

    try {
      document.dispatchEvent(new CustomEvent("ui:dropdown-close-all"));
    } catch {
      // ignore
    }
    closeOpen();

    wrap.classList.add("open");
    btn.setAttribute("aria-expanded", "true");

    const portal = openDropdownPortal({ btn, menu, align: "left", matchWidth: true, zIndex: 1400 });
    const onScroll = (ev) => {
      const t = ev?.target;
      if (t && portal.menu && (t === portal.menu || portal.menu.contains(t))) return;
      portal.update?.();
    };
    try {
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
    } catch {
      // ignore
    }

    openInst = { wrap, btn, portal, onScroll };
  };

  const onMenuChange = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;

    const maxN = Number(max);
    if (Number.isFinite(maxN) && maxN > 0) {
      const n = countChecked(menu);
      if (n > maxN) {
        target.checked = false;
        if (typeof onMaxExceeded === "function") onMaxExceeded(maxN);
      }
    }
    syncAll();
  };

  btn.addEventListener("click", onBtnClick);
  menu.addEventListener("change", onMenuChange);

  syncAll();

  return () => {
    if (openWrap === wrap) closeOpen();
    btn.removeEventListener("click", onBtnClick);
    menu.removeEventListener("change", onMenuChange);
  };
}

export function syncTagMultiSelect({ menu, labelEl, chipsEl, placeholder, getLabel, max } = {}) {
  syncLabel({ labelEl, menu, placeholder });
  syncChips({ chipsEl, menu, getLabel });
  enforceMax({ menu, max });
}

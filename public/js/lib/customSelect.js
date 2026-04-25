import { el } from "./dom.js";
import { openDropdownPortal } from "./dropdownPortal.js";

let globalsBound = false;
let openInst = null;
const instances = new WeakMap();

function closeAllDropdowns() {
  if (!openInst) return;
  const { wrapper, btn, portal, onScroll } = openInst;
  wrapper?.classList?.remove("open");
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

function optionLabel(option) {
  return (option.textContent || "").trim() || option.value;
}

function renderMenu(select, menu) {
  menu.innerHTML = "";
  const selectedValue = select.value;

  for (const opt of select.options) {
    const item = el("button", { className: "dd-item", type: "button" });
    item.textContent = optionLabel(opt);
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", opt.value === selectedValue ? "true" : "false");
    item.addEventListener("click", () => {
      select.value = opt.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeAllDropdowns();
    });
    menu.append(item);
  }
}

export function enhanceSelect(select, { buttonText } = {}) {
  if (!select || select.dataset.enhanced === "1") return;
  select.dataset.enhanced = "1";

  if (!globalsBound) {
    globalsBound = true;

    document.addEventListener("ui:dropdown-close-all", () => closeAllDropdowns());

    document.addEventListener("click", (e) => {
      if (!openInst) return;
      if (openInst.wrapper?.contains?.(e.target)) return;
      if (openInst.portal?.menu?.contains?.(e.target)) return;
      closeAllDropdowns();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!openInst) return;
      e.preventDefault();
      closeAllDropdowns();
    });

    const obsRoot = document.body || document.documentElement;
    if (obsRoot) {
      const mo = new MutationObserver((mutations) => {
        const touched = new Set();
        for (const m of mutations) {
          const t = m.target;
          if (!(t instanceof Element)) continue;
          const sel = t instanceof HTMLSelectElement ? t : t.closest("select");
          if (sel && instances.has(sel)) touched.add(sel);
        }
        for (const sel of touched) {
          const inst = instances.get(sel);
          inst?.updateButton?.();
          if (inst?.wrapper?.classList?.contains("open")) inst?.renderMenu?.();
        }
      });
      mo.observe(obsRoot, { childList: true, subtree: true });
    }
  }

  const wrapper = el("div", { className: "dd" });
  const btn = el("button", { className: "dd-btn", type: "button" });
  const menu = el("div", { className: "dd-menu" });
  menu.setAttribute("role", "menu");
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");

  const updateButton = () => {
    const selected = select.selectedOptions?.[0];
    const label = selected ? optionLabel(selected) : select.value;
    btn.textContent = buttonText ? buttonText(label, select.value) : label;
    btn.disabled = !!select.disabled;
  };
  const render = () => renderMenu(select, menu);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (select.disabled) return;
    const isOpen = wrapper.classList.contains("open");
    closeAllDropdowns();
    if (!isOpen) {
      try {
        document.dispatchEvent(new CustomEvent("ui:dropdown-close-all"));
      } catch {
        // ignore
      }
      render();
      wrapper.classList.add("open");
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

      openInst = { wrapper, btn, portal, onScroll };
    }
  });

  select.addEventListener("change", () => {
    updateButton();
  });

  const styleProps = ["minWidth", "width", "maxWidth", "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf"];
  for (const p of styleProps) {
    const v = select.style?.[p];
    if (v) wrapper.style[p] = v;
  }

  // Replace select in DOM, keep it for form/accessibility but visually hidden
  const parent = select.parentNode;
  parent.insertBefore(wrapper, select);
  wrapper.append(btn, menu, select);
  select.classList.add("dd-native");

  updateButton();
  instances.set(select, { wrapper, updateButton, renderMenu: render });
}

export function enhanceSelects(root = document) {
  const nodes = root.querySelectorAll?.("select[data-ui=\"select\"]") || [];
  for (const node of nodes) enhanceSelect(node);
}

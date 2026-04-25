function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function viewport() {
  const w = document.documentElement?.clientWidth || window.innerWidth || 0;
  const h = document.documentElement?.clientHeight || window.innerHeight || 0;
  return { w, h };
}

function findPortalRoot(btn) {
  const dialog = btn?.closest?.("dialog");
  return dialog || document.body;
}

export function openDropdownPortal({
  btn,
  menu,
  align = "left",
  matchWidth = true,
  padding = 10,
  zIndex = 1200,
} = {}) {
  if (!btn || !menu) return { close: () => {}, update: () => {} };

  const portalRoot = findPortalRoot(btn);
  const originalParent = menu.parentNode;
  const originalNext = menu.nextSibling;
  const original = {
    position: menu.style.position,
    top: menu.style.top,
    left: menu.style.left,
    right: menu.style.right,
    width: menu.style.width,
    zIndex: menu.style.zIndex,
    display: menu.style.display,
    maxHeight: menu.style.maxHeight,
  };

  const close = () => {
    try {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
    } catch {
      // ignore
    }
    try {
      if (originalParent) {
        if (originalNext && originalNext.parentNode === originalParent) originalParent.insertBefore(menu, originalNext);
        else originalParent.appendChild(menu);
      }
    } catch {
      // ignore
    }

    menu.style.position = original.position;
    menu.style.top = original.top;
    menu.style.left = original.left;
    menu.style.right = original.right;
    menu.style.width = original.width;
    menu.style.zIndex = original.zIndex;
    menu.style.display = original.display;
    menu.style.maxHeight = original.maxHeight;
  };

  const update = () => {
    const { w, h } = viewport();
    const btnRect = btn.getBoundingClientRect();

    const desiredWidth = matchWidth ? btnRect.width : menu.getBoundingClientRect().width;
    const width = clamp(desiredWidth, 180, Math.max(180, w - padding * 2));

    const desiredHeight = Math.max(0, Number(menu.scrollHeight || 0));

    const spaceBelow = h - btnRect.bottom - padding;
    const spaceAbove = btnRect.top - padding;
    const openUp = spaceBelow < Math.min(220, desiredHeight || 0) && spaceAbove > spaceBelow;

    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = clamp(available, 140, 420);

    let left = align === "right" ? btnRect.right - width : btnRect.left;
    left = clamp(left, padding, w - padding - width);

    const top =
      openUp
        ? btnRect.top - Math.min(desiredHeight, maxHeight) - 8
        : btnRect.bottom + 8;
    const clampedTop = clamp(top, padding, h - padding - maxHeight);

    menu.style.position = "fixed";
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(clampedTop)}px`;
    menu.style.right = "";
    menu.style.width = `${Math.round(width)}px`;
    menu.style.zIndex = String(zIndex);
    menu.style.maxHeight = `${Math.round(maxHeight)}px`;
    menu.style.display = "block";
    menu.style.visibility = "";
  };

  try {
    portalRoot.appendChild(menu);
  } catch {
    // If something weird happens, keep it in place.
  }

  update();

  return { close, update, menu };
}

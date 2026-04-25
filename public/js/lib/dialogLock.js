let locked = false;
let scrollY = 0;
let scrollbarW = 0;

function lockScroll() {
  if (locked) return;
  locked = true;
  scrollY = window.scrollY || 0;
  scrollbarW = Math.max(0, (window.innerWidth || 0) - (document.documentElement?.clientWidth || 0));

  document.documentElement.classList.add("dialog-open");
  document.body.classList.add("dialog-open");

  // iOS/Safari friendly background lock.
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.paddingRight = scrollbarW ? `${scrollbarW}px` : "";

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  if (!locked) return;
  locked = false;

  document.documentElement.classList.remove("dialog-open");
  document.body.classList.remove("dialog-open");

  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.paddingRight = "";

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  window.scrollTo(0, scrollY);
}

function applyFromDom() {
  const anyOpen = Boolean(document.querySelector("dialog[open]"));
  if (anyOpen) lockScroll();
  else unlockScroll();
}

export function initDialogLock() {
  if (document.__dialogLockBound) return;
  document.__dialogLockBound = true;

  applyFromDom();

  const obs = new MutationObserver(() => applyFromDom());
  obs.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open"],
  });

  // If a dialog is closed via ESC/cancel, ensure unlock runs.
  document.addEventListener("close", applyFromDom, true);
  document.addEventListener("cancel", applyFromDom, true);
}

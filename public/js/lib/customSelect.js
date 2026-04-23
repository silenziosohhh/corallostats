import { el } from "./dom.js";

function closeAllDropdowns() {
  for (const node of document.querySelectorAll(".dd.open")) node.classList.remove("open");
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

  const wrapper = el("div", { className: "dd" });
  const btn = el("button", { className: "dd-btn", type: "button" });
  const menu = el("div", { className: "dd-menu" });
  menu.setAttribute("role", "menu");

  const updateButton = () => {
    const selected = select.selectedOptions?.[0];
    const label = selected ? optionLabel(selected) : select.value;
    btn.textContent = buttonText ? buttonText(label, select.value) : label;
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = wrapper.classList.contains("open");
    closeAllDropdowns();
    if (!isOpen) {
      renderMenu(select, menu);
      wrapper.classList.add("open");
    }
  });

  select.addEventListener("change", () => {
    updateButton();
  });

  // Replace select in DOM, keep it for form/accessibility but visually hidden
  const parent = select.parentNode;
  parent.insertBefore(wrapper, select);
  wrapper.append(btn, menu, select);
  select.classList.add("dd-native");

  updateButton();

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) wrapper.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") wrapper.classList.remove("open");
  });
}


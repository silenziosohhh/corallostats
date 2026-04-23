export function qs(selector, root = document) {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setText(node, text) {
  node.textContent = text;
}

export function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.type) node.type = opts.type;
  if (opts.style) node.setAttribute("style", opts.style);
  return node;
}


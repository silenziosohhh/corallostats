function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInline(mdEscaped) {
  // Order matters: strong/underline before em to reduce conflicts.
  let out = mdEscaped;

  // **bold**
  out = out.replace(/\*\*([^*][\s\S]*?)\*\*/g, "<strong>$1</strong>");
  // __underline__
  out = out.replace(/__([^_][\s\S]*?)__/g, "<u>$1</u>");
  // *italic*
  out = out.replace(/\*([^*][\s\S]*?)\*/g, "<em>$1</em>");
  // _italic_
  out = out.replace(/_([^_][\s\S]*?)_/g, "<em>$1</em>");

  return out;
}

export function renderMarkdownLite(md) {
  const escaped = escapeHtml(md || "");
  const lines = escaped.split(/\r\n|\r|\n/g);

  const out = [];
  let quoteBuf = null;
  let listBuf = null;

  const flushQuote = () => {
    if (!quoteBuf || !quoteBuf.length) return;
    const html = quoteBuf.map((x) => applyInline(x)).join("<br>");
    out.push(`<blockquote class="md-quote">${html}</blockquote>`);
    quoteBuf = null;
  };

  const flushList = () => {
    if (!listBuf || !listBuf.length) return;
    const items = listBuf.map((x) => `<li>${applyInline(x)}</li>`).join("");
    out.push(`<ul class="md-list">${items}</ul>`);
    listBuf = null;
  };

  for (const line of lines) {
    const m = /^&gt;\s?(.*)$/.exec(line);
    if (m) {
      flushList();
      if (!quoteBuf) quoteBuf = [];
      quoteBuf.push(m[1] || "");
      continue;
    }
    flushQuote();

    const li = /^-\s+(.*)$/.exec(line);
    if (li) {
      if (!listBuf) listBuf = [];
      listBuf.push(li[1] || "");
      continue;
    }

    flushList();
    out.push(applyInline(line));
  }
  flushQuote();
  flushList();

  return out.join("<br>");
}

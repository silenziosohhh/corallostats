function qs(sel, root = document) {
  return root.querySelector(sel);
}

function formatInt(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("it-IT");
}

function formatTime(ms) {
  const t = new Date(ms);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDateTime(ms) {
  const t = new Date(ms);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString("it-IT", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function setSvgChildren(svg, nodes) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  for (const n of nodes) svg.appendChild(n);
}

function mkSvg(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function niceCeil(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 1) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(x)));
  const frac = x / exp;
  let nice = 1;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * exp;
}

function formatAxisTick(value, step) {
  const v = Number(value);
  const s = Number(step);
  if (!Number.isFinite(v)) return "—";

  const absStep = Number.isFinite(s) ? Math.abs(s) : 0;
  let maxFrac = 0;
  if (absStep > 0 && absStep < 1) maxFrac = 2;
  else if (absStep > 0 && absStep < 10) maxFrac = 1;

  const safe = Math.abs(v) < 1e-9 ? 0 : v;
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: maxFrac }).format(safe);
}

function drawLineChart(svg, points) {
  const w = 860;
  const h = 230;
  const padL = 48;
  const padR = 16;
  const padT = 14;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const values = points.map((p) => Number(p.count || 0)).filter((n) => Number.isFinite(n));
  const rawMax = Math.max(1, ...values);
  const max = niceCeil(rawMax);
  const yStep = max / 4;

  const xAt = (i) => padL + (i / Math.max(1, points.length - 1)) * innerW;
  const yAt = (v) => padT + (1 - v / max) * innerH;

  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * innerH;
    grid.push(mkSvg("line", { x1: padL, y1: y, x2: w - padR, y2: y, class: "ana-grid" }));

    const tickVal = (max * (4 - i)) / 4;
    const label = mkSvg("text", { x: padL - 10, y: y + 4, "text-anchor": "end", class: "ana-axis-text" });
    label.textContent = formatAxisTick(tickVal, yStep);
    grid.push(label);
  }

  if (points.length > 1) {
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (points.length - 1)));
    const uniq = [...new Set(ticks)].filter((i) => i >= 0 && i < points.length);
    for (const idx of uniq) {
      const x = xAt(idx);
      grid.push(mkSvg("line", { x1: x, y1: padT, x2: x, y2: padT + innerH, class: "ana-grid-x" }));
      const t = Number(points[idx]?.t || 0);
      const txt = mkSvg("text", { x, y: h - 10, "text-anchor": "middle", class: "ana-axis-text" });
      txt.textContent = t ? formatTime(t) : "";
      grid.push(txt);
    }
  }

  const axis = [
    mkSvg("line", { x1: padL, y1: padT + innerH, x2: w - padR, y2: padT + innerH, class: "ana-axis" }),
    mkSvg("line", { x1: padL, y1: padT, x2: padL, y2: padT + innerH, class: "ana-axis" }),
  ];

  let d = "";
  for (let i = 0; i < points.length; i++) {
    const v = Number(points[i]?.count || 0);
    const x = xAt(i);
    const y = yAt(Number.isFinite(v) ? v : 0);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  const areaD = `${d} L ${xAt(points.length - 1)} ${padT + innerH} L ${xAt(0)} ${padT + innerH} Z`;

  const defs = mkSvg("defs");
  const grad = mkSvg("linearGradient", { id: "ana-fill", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.append(
    mkSvg("stop", { offset: "0%", "stop-color": "rgba(56,189,248,.30)" }),
    mkSvg("stop", { offset: "100%", "stop-color": "rgba(56,189,248,0)" })
  );
  defs.appendChild(grad);

  const area = mkSvg("path", { d: areaD, fill: "url(#ana-fill)", class: "ana-area" });
  const path = mkSvg("path", { d, fill: "none", class: "ana-line" });

  const cross = mkSvg("line", {
    x1: padL,
    y1: padT,
    x2: padL,
    y2: padT + innerH,
    class: "ana-cross",
    opacity: "0",
  });

  const dot = mkSvg("circle", { cx: padL, cy: padT, r: 4, class: "ana-dot", opacity: "0" });

  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");

  setSvgChildren(svg, [defs, ...axis, ...grid, area, path, cross, dot]);

  return { w, h, innerW, innerH, xAt, yAt, max, dot, cross };
}

function arcPath(cx, cy, r, start, end) {
  const sx = cx + r * Math.cos(start);
  const sy = cy + r * Math.sin(start);
  const ex = cx + r * Math.cos(end);
  const ey = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function drawDonut(svg, items) {
  const w = 260;
  const h = 260;
  const cx = w / 2;
  const cy = h / 2;
  const r = 92;
  const stroke = 18;

  const total = items.reduce((a, x) => a + (Number(x.count) || 0), 0) || 0;

  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const bg = mkSvg("circle", {
    cx,
    cy,
    r,
    fill: "none",
    stroke: "rgba(255,255,255,.10)",
    "stroke-width": stroke,
  });

  const nodes = [bg];

  const palette = [
    "rgba(56,189,248,.95)",
    "rgba(88,101,242,.95)",
    "rgba(54,211,153,.95)",
    "rgba(251,191,36,.95)",
    "rgba(244,63,94,.95)",
    "rgba(168,85,247,.95)",
  ];

  let angle = -Math.PI / 2;
  for (let i = 0; i < items.length; i++) {
    const c = Number(items[i]?.count || 0);
    if (!Number.isFinite(c) || c <= 0 || total <= 0) continue;
    const frac = c / total;
    const end = angle + frac * Math.PI * 2;
    const path = mkSvg("path", {
      d: arcPath(cx, cy, r, angle, end),
      fill: "none",
      stroke: palette[i % palette.length],
      "stroke-width": stroke,
      "stroke-linecap": "round",
      class: "ana-donut",
    });
    nodes.push(path);
    angle = end;
  }

  const hole = mkSvg("circle", { cx, cy, r: r - stroke - 8, fill: "rgba(0,0,0,.12)" });
  nodes.push(hole);

  const label = mkSvg("text", { x: cx, y: cy - 6, "text-anchor": "middle", class: "ana-donut-k" });
  label.textContent = "24h";
  const value = mkSvg("text", { x: cx, y: cy + 20, "text-anchor": "middle", class: "ana-donut-v" });
  value.textContent = formatInt(total);
  nodes.push(label, value);

  setSvgChildren(svg, nodes);

  return { total };
}

function groupLabel(key) {
  const k = String(key || "").toLowerCase();
  if (k === "bedwars") return "Bedwars";
  if (k === "kitpvp") return "KitPvP";
  if (k === "duels") return "Duels";
  if (k === "coralcup") return "CoralCUP";
  if (k === "clans") return "Clans";
  if (k === "results") return "Results";
  if (k === "summary") return "Summary";
  if (k === "stats") return "Stats";
  return "Altro";
}

function renderLegend(root, items) {
  if (!root) return;
  root.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    li.className = "ana-legend-item";
    li.innerHTML = `<span class="ana-legend-k">${groupLabel(it.key)}</span><span class="ana-legend-v">${formatInt(
      it.count
    )}</span>`;
    root.appendChild(li);
  }
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "ana-legend-item muted";
    li.textContent = "Nessuna richiesta nelle ultime 24h.";
    root.appendChild(li);
  }
}

function renderRateLimit({ rateLimit }) {
  const box = qs("#ana-rate");
  if (!box) return;

  const max = Number(rateLimit?.max || 0);
  const count = Number(rateLimit?.count || 0);
  const remaining = Number(rateLimit?.remaining || 0);
  const resetAt = Number(rateLimit?.resetAt || 0);
  const now = Number(rateLimit?.now || Date.now());

  box.dataset.resetAt = resetAt ? String(resetAt) : "";

  const pct = max > 0 ? clamp((count / max) * 100, 0, 100) : 0;

  qs("#ana-rl-used")?.replaceChildren(document.createTextNode(`${formatInt(count)} / ${formatInt(max)}`));
  qs("#ana-rl-remaining")?.replaceChildren(document.createTextNode(formatInt(remaining)));
  qs("#ana-rl-reset")?.replaceChildren(document.createTextNode(resetAt ? formatTime(resetAt) : "—"));

  const fill = qs(".ana-meter-fill", box);
  if (fill) fill.style.width = `${pct}%`;

  const hint = qs("#ana-rl-hint");
  if (hint) {
    if (!resetAt) hint.textContent = "";
    else {
      const sec = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
      hint.textContent = `Reset tra ~${sec}s`;
    }
  }
}

function buildWsUrl({ token }) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/analytics?token=${encodeURIComponent(token)}`;
}

function pctOf(part, total) {
  const a = Number(part || 0);
  const b = Number(total || 0);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return 0;
  return clamp((a / b) * 100, 0, 100);
}

function renderEndpoints(root, endpoints, total24h) {
  if (!root) return;
  root.innerHTML = "";

  const items = Array.isArray(endpoints) ? endpoints : [];
  if (!items.length) {
    root.innerHTML = `<div class="muted">Nessun dato ancora. Fai qualche chiamata a <code>/api/v1/*</code> e torna qui.</div>`;
    return;
  }

  for (const it of items) {
    const key = String(it?.key || "").trim();
    const count = Number(it?.count || 0);
    if (!key || !Number.isFinite(count) || count <= 0) continue;

    const share = pctOf(count, total24h);
    const avgPerHour = Math.round(count / 24);

    const card = document.createElement("div");
    card.className = "ana-ep";
    card.innerHTML = `
      <div class="ana-ep-top">
        <div class="ana-ep-key" title="${key.replace(/\"/g, "&quot;")}">${key}</div>
        <div class="ana-ep-count">${formatInt(count)}</div>
      </div>
      <div class="ana-ep-meta">
        <span>${share.toFixed(1)}%</span>
        <span>Avg/h ${formatInt(avgPerHour)}</span>
      </div>
      <div class="ana-ep-meter" aria-hidden="true"><i style="width:${share}%"></i></div>
    `;
    root.appendChild(card);
  }
}

export async function mount() {
  const status = qs("#ana-status");
  const svgLine = qs("#ana-line");
  const svgDonut = qs("#ana-donut");
  const legend = qs("#ana-legend");
  const tooltip = qs("#ana-tooltip");
  const endpointsRoot = qs("#ana-endpoints");
  const rateBox = qs("#ana-rate");

  const setStatus = (txt) => {
    if (!status) return;
    status.textContent = txt;
  };

  setStatus("Caricamento…");

  let chartCtx = null;
  let ws = null;
  let wsClosedByUs = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  const ptsRef = { points: [] };
  let cleanupPointer = null;
  const rateHintTimer = window.setInterval(() => {
    if (!rateBox) return;
    const resetAt = Number(rateBox.dataset.resetAt || 0);
    const hint = qs("#ana-rl-hint");
    if (!hint) return;
    if (!resetAt) {
      if (hint.textContent) hint.textContent = "";
      return;
    }
    const sec = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
    const txt = `Reset tra ~${sec}s`;
    if (hint.textContent !== txt) hint.textContent = txt;
  }, 1000);

  const bindPointer = () => {
    if (!svgLine) return;
    if (cleanupPointer) cleanupPointer();

    const onMove = (e) => {
      if (!tooltip || !chartCtx) return;
      const pts = ptsRef.points;
      if (!pts.length) return;

      const rect = svgLine.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const idx = Math.round((x / rect.width) * Math.max(0, pts.length - 1));
      const p = pts[clamp(idx, 0, Math.max(0, pts.length - 1))];
      if (!p) return;

      const cx = chartCtx.xAt(idx);
      const cy = chartCtx.yAt(Number(p.count || 0));
      chartCtx.dot.setAttribute("cx", String(cx));
      chartCtx.dot.setAttribute("cy", String(cy));
      chartCtx.dot.setAttribute("opacity", "1");
      chartCtx.cross?.setAttribute?.("x1", String(cx));
      chartCtx.cross?.setAttribute?.("x2", String(cx));
      chartCtx.cross?.setAttribute?.("opacity", "1");

      tooltip.style.opacity = "1";
      tooltip.style.left = `${Math.round(clamp(x, 78, rect.width - 78))}px`;
      tooltip.textContent = `${formatShortDateTime(p.t)} • ${formatInt(p.count)}`;
    };

    const onLeave = () => {
      if (tooltip) tooltip.style.opacity = "0";
      if (chartCtx) chartCtx.dot.setAttribute("opacity", "0");
      if (chartCtx?.cross) chartCtx.cross.setAttribute("opacity", "0");
    };

    svgLine.addEventListener("pointermove", onMove);
    svgLine.addEventListener("pointerleave", onLeave);

    cleanupPointer = () => {
      svgLine.removeEventListener("pointermove", onMove);
      svgLine.removeEventListener("pointerleave", onLeave);
    };
  };

  const applyData = (data) => {
    if (!data || typeof data !== "object") return;

    qs("#ana-total-24h")?.replaceChildren(document.createTextNode(formatInt(data?.last24h?.total)));
    qs("#ana-total-7d")?.replaceChildren(document.createTextNode(formatInt(data?.last7d?.total)));

    const now = Number(data?.now || Date.now());
    const total24h = Number(data?.last24h?.total || 0);
    if (Number.isFinite(total24h)) {
      const avgPerHour = Math.round(total24h / 24);
      qs("#ana-avg")?.replaceChildren(document.createTextNode(formatInt(avgPerHour)));
    }
    qs("#ana-updated")?.replaceChildren(document.createTextNode(formatTime(now)));

    if (data?.rateLimit) renderRateLimit({ rateLimit: data.rateLimit });

    if (svgLine) {
      const pts = Array.isArray(data?.last24h?.points) ? data.last24h.points : [];
      ptsRef.points = pts;
      chartCtx = drawLineChart(svgLine, pts);
      bindPointer();

      let peak = 0;
      let peakT = null;
      for (const p of pts) {
        const c = Number(p?.count || 0);
        if (!Number.isFinite(c)) continue;
        if (c > peak) {
          peak = c;
          peakT = Number(p?.t || 0) || null;
        }
      }
      const peakTxt = peakT ? `${formatInt(peak)} @ ${formatTime(peakT)}` : formatInt(peak);
      qs("#ana-peak")?.replaceChildren(document.createTextNode(peakTxt));
    }

    if (svgDonut) {
      const items = Array.isArray(data?.last24h?.groups) ? data.last24h.groups : [];
      drawDonut(svgDonut, items);
      renderLegend(legend, items);
      const top = items[0] || null;
      qs("#ana-top-cat")?.replaceChildren(document.createTextNode(top ? groupLabel(top.key) : "—"));
      qs("#ana-top-cat-count")?.replaceChildren(document.createTextNode(top ? formatInt(top.count) : "—"));
    }

    renderEndpoints(endpointsRoot, data?.last24h?.endpoints, Number(data?.last24h?.total || 0));
  };

  const clearReconnect = () => {
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = () => {
    clearReconnect();
    if (wsClosedByUs) return;
    reconnectAttempt += 1;
    const delay = Math.min(12_000, 700 + reconnectAttempt * 650);
    reconnectTimer = window.setTimeout(() => connectWs(), delay);
  };

  const connectWs = async () => {
    if (wsClosedByUs) return;
    try {
      setStatus("Connessione…");
      const tokRes = await fetch("/api/analytics/ws-token", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!tokRes.ok) throw new Error(String(tokRes.status));
      const tokJson = await tokRes.json();
      const token = String(tokJson?.token || "");
      if (!token) throw new Error("missing_token");

      ws?.close?.();
      ws = new WebSocket(buildWsUrl({ token }));

      ws.addEventListener("open", () => {
        reconnectAttempt = 0;
        setStatus("Live");
      });

      ws.addEventListener("message", (e) => {
        try {
          const data = JSON.parse(String(e.data || ""));
          applyData(data);
        } catch {
          // ignore
        }
      });

      ws.addEventListener("close", () => scheduleReconnect());
      ws.addEventListener("error", () => scheduleReconnect());
    } catch {
      setStatus("Offline");
      scheduleReconnect();
    }
  };

  try {
    const res = await fetch("/api/analytics", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    applyData(data);

    connectWs();
  } catch {
    setStatus("Impossibile caricare le analitiche.");
  }

  return () => {
    try {
      window.clearInterval(rateHintTimer);
      if (tooltip) tooltip.style.opacity = "0";
      if (chartCtx) chartCtx.dot.setAttribute("opacity", "0");
      if (cleanupPointer) cleanupPointer();
      clearReconnect();
      wsClosedByUs = true;
      ws?.close?.();
    } catch {
      // ignore
    }
  };
}

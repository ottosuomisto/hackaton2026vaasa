/* Kevyt SVG-aikasarjakaavio: viivat, alueet ja pylväät kahdella y-akselilla.
   Ei riippuvuuksia, toimii myös ilman verkkoyhteyttä. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const registry = new Map();

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function fmt(v, unit) {
    if (v === null || v === undefined || Number.isNaN(v)) return "–";
    const s = Math.abs(v) >= 100 ? Math.round(v).toLocaleString("fi-FI") : v.toLocaleString("fi-FI", { maximumFractionDigits: 1 });
    return unit ? `${s} ${unit}` : s;
  }

  function render(container, opts) {
    container.innerHTML = "";
    container.classList.add("chart");
    const W = Math.max(container.clientWidth || 640, 280);
    const H = opts.height || 240;
    const m = { t: 14, r: opts.right ? 46 : 14, b: 26, l: 40 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const n = opts.labels.length;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.ariaLabel || "Aikasarjakaavio" }, container);

    const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const step = n > 1 ? iw / (n - 1) : iw;
    const scale = (axis) => {
      const a = opts[axis];
      return (v) => m.t + ih - ((v - a.min) / (a.max - a.min)) * ih;
    };
    const yL = scale("left");
    const yR = opts.right ? scale("right") : yL;

    // Taustakaistat (esim. RH > 90 % riskialue)
    (opts.bands || []).forEach((b) => {
      const y = b.axis === "right" ? yR : yL;
      el("rect", { x: m.l, width: iw, y: y(b.to), height: Math.max(0, y(b.from) - y(b.to)), fill: b.color }, svg);
      if (b.label) {
        const t = el("text", { x: m.l + iw - 4, y: y(b.to) + 12, "text-anchor": "end" }, svg);
        t.textContent = b.label;
      }
    });

    // Vaakaviivat ja y-akseli
    const ticks = opts.left.ticks || 5;
    for (let i = 0; i <= ticks; i++) {
      const v = opts.left.min + ((opts.left.max - opts.left.min) * i) / ticks;
      const y = yL(v);
      el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, class: "grid-line" }, svg);
      const t = el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, svg);
      t.textContent = Math.round(v);
      if (opts.right) {
        const vr = opts.right.min + ((opts.right.max - opts.right.min) * i) / ticks;
        const tr = el("text", { x: m.l + iw + 6, y: y + 4 }, svg);
        tr.textContent = Math.round(vr).toLocaleString("fi-FI");
      }
    }
    if (opts.left.title) {
      const t = el("text", { x: m.l - 34, y: m.t - 4, class: "axis-title" }, svg);
      t.textContent = opts.left.title;
    }
    if (opts.right && opts.right.title) {
      const t = el("text", { x: m.l + iw + 46, y: m.t - 4, "text-anchor": "end", class: "axis-title" }, svg);
      t.textContent = opts.right.title;
    }

    // X-akselin tikit
    let lastTickX = -Infinity;
    opts.labels.forEach((lab, i) => {
      if (!opts.tick || !opts.tick(lab, i)) return;
      const px = x(i);
      if (px - lastTickX < (opts.tickGap || 48)) return;
      lastTickX = px;
      el("line", { x1: px, x2: px, y1: m.t + ih, y2: m.t + ih + 4, stroke: "rgba(1,39,62,.3)" }, svg);
      const t = el("text", { x: px, y: H - 8, "text-anchor": "middle" }, svg);
      t.textContent = opts.xFormat ? opts.xFormat(lab, i) : lab;
    });

    // Sarjat: ensin pylväät, sitten alueet ja viivat
    const order = { bar: 0, area: 1, line: 2 };
    [...opts.series].sort((a, b) => order[a.type || "line"] - order[b.type || "line"]).forEach((s) => {
      const y = s.axis === "right" ? yR : yL;
      if (s.type === "bar") {
        const bw = Math.max(1, step * 0.8);
        const base = y(opts[s.axis || "left"].min);
        s.values.forEach((v, i) => {
          if (v === null || v === undefined || v <= 0) return;
          el("rect", { x: x(i) - bw / 2, width: bw, y: y(v), height: base - y(v), fill: s.color }, svg);
        });
        return;
      }
      let d = "";
      let pen = false;
      s.values.forEach((v, i) => {
        if (v === null || v === undefined) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      if (s.type === "area") {
        const valid = s.values.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined);
        if (valid.length) {
          const base = y(opts[s.axis || "left"].min);
          const area = `M${x(valid[0][1])},${base}` + valid.map(([v, i]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("") + `L${x(valid[valid.length - 1][1])},${base}Z`;
          el("path", { d: area, fill: s.color, opacity: s.fillOpacity || 0.15 }, svg);
        }
      }
      el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": s.dash || "" }, svg);
      if (s.dots) s.values.forEach((v, i) => { if (v !== null) el("circle", { cx: x(i), cy: y(v), r: 3, fill: s.color }, svg); });
    });

    // Merkinnät (esim. "Sense+ olisi hälyttänyt")
    (opts.markers || []).forEach((mk) => {
      const px = x(mk.index);
      el("line", { x1: px, x2: px, y1: m.t, y2: m.t + ih, stroke: mk.color, "stroke-width": 1.5, "stroke-dasharray": "4 3" }, svg);
      const t = el("text", { x: px + 5, y: m.t + 10, style: `fill:${mk.color};font-weight:700` }, svg);
      t.textContent = mk.label;
    });

    // Työkaluvihje
    const tip = document.createElement("div");
    tip.className = "chart__tip";
    tip.hidden = true;
    container.appendChild(tip);
    const cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "rgba(1,39,62,.35)", visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
    const move = (evt) => {
      const rect = svg.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      cross.setAttribute("x1", x(i));
      cross.setAttribute("x2", x(i));
      cross.setAttribute("visibility", "visible");
      const rows = opts.series.map((s) => `<div><i style="background:${s.color}"></i>${s.name}: <b style="display:inline">${fmt(s.values[i], s.unit)}</b></div>`).join("");
      tip.innerHTML = `<b>${opts.tipTitle ? opts.tipTitle(opts.labels[i], i) : opts.labels[i]}</b>${rows}`;
      tip.hidden = false;
      const left = (x(i) / W) * rect.width;
      tip.style.left = `${Math.min(Math.max(left, 90), rect.width - 90)}px`;
      tip.style.top = `${(m.t / H) * rect.height + 20}px`;
    };
    hit.addEventListener("mousemove", move);
    hit.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      registry.forEach((opts, node) => {
        if (!node.isConnected) registry.delete(node);
        else render(node, opts);
      });
    }, 150);
  });

  window.Charts = {
    timeSeries(container, opts) {
      registry.set(container, opts);
      render(container, opts);
    },
    fmt,
  };
})();

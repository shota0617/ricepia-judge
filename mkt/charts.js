/* Lightweight single-series SVG charts (bar / line) with hover tooltips.
   One series per chart → one color, no legend; the card title names the measure. */
(function(){
"use strict";
const W = 600, H = 220, PAD = {l:46, r:12, t:18, b:28};

function niceMax(v){
  if(v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function short(v){
  const a = Math.abs(v);
  if(a >= 1e8) return (v/1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "") + "億";
  if(a >= 1e4) return (v/1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "万";
  return Math.round(v).toLocaleString("ja-JP");
}
function frame(el, data, fmt){
  const max = niceMax(Math.max(0, ...data.map(d => d.value || 0)));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const y = v => PAD.t + ih - (v / max) * ih;
  let g = "";
  for(let i = 0; i <= 4; i++){
    const v = max * i / 4, yy = y(v);
    g += `<line class="${i ? "gridl" : "base"}" x1="${PAD.l}" x2="${W-PAD.r}" y1="${yy}" y2="${yy}"/>`;
    g += `<text class="ax" x="${PAD.l-6}" y="${yy+3}" text-anchor="end">${short(v)}</text>`;
  }
  const step = iw / data.length;
  const every = Math.ceil(data.length / 8);
  data.forEach((d, i) => {
    if(i % every === 0 || i === data.length - 1)
      g += `<text class="ax" x="${PAD.l + step*i + step/2}" y="${H-8}" text-anchor="middle">${RP.esc(d.label)}</text>`;
  });
  return {max, iw, ih, y, step, g};
}
function tipLayer(el, data, fmt, pos){
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; el.appendChild(tip);
  RP.$$(".hit", el).forEach(h => {
    const i = +h.dataset.i;
    const show = () => {
      const d = data[i], p = pos(i);
      tip.innerHTML = `<b>${RP.esc(d.label)}</b>　${RP.esc(fmt(d.value))}${d.sub ? "<br/>" + RP.esc(d.sub) : ""}`;
      tip.style.left = (p.x / W * 100) + "%"; tip.style.top = (p.y / H * 100) + "%";
      tip.hidden = false;
      el.querySelectorAll(".mark").forEach((m, j) => m.classList.toggle("hl", j === i));
      const xh = el.querySelector(".xhair"); if(xh){ xh.setAttribute("x1", p.x); xh.setAttribute("x2", p.x); xh.style.display = ""; }
    };
    const hide = () => { tip.hidden = true; el.querySelectorAll(".mark.hl").forEach(m => m.classList.remove("hl")); const xh = el.querySelector(".xhair"); if(xh) xh.style.display = "none"; };
    h.addEventListener("mouseenter", show); h.addEventListener("mouseleave", hide);
    h.addEventListener("touchstart", show, {passive:true});
  });
}

RP.chart = {
  bar(el, data, opts){
    opts = opts || {};
    const fmt = opts.fmt || (v => RP.fmt(v));
    if(!data.length || data.every(d => !d.value)){ el.innerHTML = `<div class="empty">${RP.esc(opts.empty || "データがありません")}</div>`; return; }
    const f = frame(el, data, fmt);
    const bw = Math.min(42, f.step * 0.62);
    let marks = "", hits = "", labels = "";
    const maxI = data.reduce((m, d, i) => (d.value || 0) > (data[m].value || 0) ? i : m, 0);
    data.forEach((d, i) => {
      const v = d.value || 0, x = PAD.l + f.step*i + (f.step - bw)/2, yy = f.y(v), h = Math.max(0, PAD.t + f.ih - yy);
      // rounded data-end, square baseline
      const r = Math.min(4, bw/2, h);
      const path = h > 0 ? `M${x},${yy+h} V${yy+r} Q${x},${yy} ${x+r},${yy} H${x+bw-r} Q${x+bw},${yy} ${x+bw},${yy+r} V${yy+h} Z` : "";
      hits += `<rect class="hit" data-i="${i}" x="${PAD.l + f.step*i}" y="${PAD.t}" width="${f.step}" height="${f.ih}"/>`;
      marks += `<path class="mark${opts.dimPast && i < data.length-1 ? " dim" : ""}" d="${path}"/>`;
      if((i === data.length - 1 || i === maxI) && v) labels += `<text class="lbl-v" x="${x+bw/2}" y="${yy-5}" text-anchor="middle">${short(v)}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${RP.esc(opts.title || "棒グラフ")}">${f.g}${marks}${labels}${hits}</svg>`;
    tipLayer(el, data, fmt, i => ({x: PAD.l + f.step*i + f.step/2, y: f.y(data[i].value || 0)}));
  },
  line(el, data, opts){
    opts = opts || {};
    const fmt = opts.fmt || (v => RP.fmt(v));
    const pts = data.filter(d => d.value != null && d.value !== "");
    if(pts.length < 1 || data.every(d => !d.value)){ el.innerHTML = `<div class="empty">${RP.esc(opts.empty || "データがありません")}</div>`; return; }
    const f = frame(el, data, fmt);
    const X = i => PAD.l + f.step*i + f.step/2;
    let d = "", dots = "", hits = "";
    data.forEach((p, i) => {
      if(p.value == null || p.value === "") return;
      d += (d ? " L" : "M") + X(i) + "," + f.y(p.value);
      dots += `<circle class="mark dot" cx="${X(i)}" cy="${f.y(p.value)}" r="4"/>`;
      hits += `<rect class="hit" data-i="${i}" x="${PAD.l + f.step*i}" y="${PAD.t}" width="${f.step}" height="${f.ih}"/>`;
    });
    const last = data.length - 1;
    const lastLbl = data[last].value ? `<text class="lbl-v" x="${X(last)}" y="${f.y(data[last].value)-9}" text-anchor="middle">${short(data[last].value)}</text>` : "";
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${RP.esc(opts.title || "折れ線グラフ")}">${f.g}<line class="xhair" x1="0" x2="0" y1="${PAD.t}" y2="${PAD.t+f.ih}" style="display:none"/><path class="line" d="${d}"/>${dots}${lastLbl}${hits}</svg>`;
    tipLayer(el, data, fmt, i => ({x: X(i), y: f.y(data[i].value || 0)}));
  },
  hbars(el, data, opts){
    opts = opts || {};
    if(!data.length || data.every(d => !d.value)){ el.innerHTML = `<div class="empty">${RP.esc(opts.empty || "データがありません")}</div>`; return; }
    const max = Math.max(...data.map(d => d.value || 0)) || 1;
    el.innerHTML = data.map(d => `
      <div class="bar-row" title="${RP.esc(d.sub || "")}">
        <div class="bh"><span>${RP.esc(d.label)}</span><b>${RP.esc((opts.fmt || RP.fmt)(d.value))}</b></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.value||0)/max*100}%"></div></div>
      </div>`).join("");
  }
};
})();

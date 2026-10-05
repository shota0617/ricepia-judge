/* Dashboard, customer RFM analysis, market research */
(function(){
"use strict";
const {$, esc} = RP;

/* ================= DASHBOARD ================= */
const METRICS = [
  {k:"sales", label:"売上", unit:"円", yen:true, form:"bar"},
  {k:"customers", label:"客数", unit:"人", form:"bar"},
  {k:"aov", label:"客単価", unit:"円", yen:true, form:"bar", derived:r => r.customers ? r.sales / r.customers : 0},
  {k:"ec", label:"EC・電話注文", unit:"件", form:"bar"},
  {k:"line", label:"LINE友だち数", unit:"人", form:"line"},
  {k:"ig", label:"Instagramフォロワー", unit:"人", form:"line"},
  {k:"ad", label:"販促費", unit:"円", yen:true, form:"bar"}
];
const INPUT_KEYS = METRICS.filter(m => !m.derived);
const kpis = () => RP.store.get("kpis", []).slice().sort((a, b) => a.month < b.month ? -1 : 1);
const val = (r, m) => m.derived ? m.derived(r) : RP.num(r[m.k]);
const fmtM = m => v => m.yen ? RP.yen(v) : RP.fmt(v) + m.unit;

RP.mod.dash = {
  init(){
    $("#dashMetric").innerHTML = METRICS.map(m => `<option value="${m.k}">${esc(m.label)}</option>`).join("");
    $("#dashMetric").addEventListener("change", () => this.renderChart());
    $("#kpiTable").addEventListener("change", e => {
      const x = e.target; if(!x.dataset.m) return;
      const list = kpis(), row = list.find(r => r.month === x.dataset.m); if(!row) return;
      row[x.dataset.k] = x.value === "" ? "" : RP.num(x.value);
      RP.store.set("kpis", list); this.renderTiles(); this.renderChart();
    });
    $("#kpiTable").addEventListener("click", e => {
      const d = e.target.dataset.del; if(!d) return;
      if(confirm(d + " の行を削除しますか？")){ RP.store.set("kpis", kpis().filter(r => r.month !== d)); this.show(); }
    });
    $("#dashSeason").addEventListener("click", e => {
      const b = e.target.closest("button[data-occ]"); if(b) RP.go("studio", {occasion: b.dataset.occ});
    });
  },
  show(){ this.renderTiles(); this.renderChart(); this.renderTable(); this.renderUpcoming(); this.renderSeason(); },
  renderTiles(){
    const list = kpis(), last = list[list.length-1], prev = list[list.length-2];
    const tile = (label, m, sub) => {
      if(!last) return `<div class="tile"><div class="t-label">${label}</div><div class="t-val">—</div><div class="t-sub">KPIを入力してください</div></div>`;
      const v = val(last, m), p = prev ? val(prev, m) : 0;
      const d = p ? (v - p) / p * 100 : null;
      return `<div class="tile"><div class="t-label">${label}（${esc(last.month.replace("-", "/"))}）</div><div class="t-val">${esc(fmtM(m)(v))}</div>
        <div class="t-sub">${d == null ? "前月データなし" : `前月比 <span class="${d >= 0 ? "delta-up" : "delta-down"}">${d >= 0 ? "▲" : "▼"}${Math.abs(d).toFixed(1)}%</span>`}</div></div>`;
    };
    const ym = RP.ym(new Date());
    const evs = RP.store.get("calendar", []).filter(e => (e.date || "").startsWith(ym));
    const done = evs.filter(e => e.status === "done").length;
    $("#dashTiles").innerHTML = tile("売上", METRICS[0]) + tile("客数", METRICS[1]) + tile("客単価", METRICS[2]) + tile("LINE友だち", METRICS[4]) +
      `<div class="tile"><div class="t-label">今月の販促予定</div><div class="t-val">${done} / ${evs.length}</div><div class="t-sub">完了 / 予定件数</div></div>`;
  },
  renderChart(){
    const m = METRICS.find(x => x.k === $("#dashMetric").value) || METRICS[0];
    const list = kpis().slice(-12);
    const data = list.map(r => ({label: (+r.month.slice(5)) + "月", value: val(r, m), sub: r.month}));
    RP.chart[m.form]($("#dashChart"), data, {fmt: fmtM(m), title: m.label + "の月次推移", empty:"下の表に月次KPIを入力するとグラフが表示されます"});
    $("#dashChartTable").innerHTML = `<table class="tbl"><tr><th>月</th><th class="num">${esc(m.label)}</th></tr>${list.map(r => `<tr><td>${esc(r.month)}</td><td class="num">${esc(fmtM(m)(val(r, m)))}</td></tr>`).join("")}</table>`;
  },
  renderTable(){
    const list = kpis();
    $("#kpiTable").innerHTML = `<tr><th>月</th>${INPUT_KEYS.map(m => `<th class="num">${esc(m.label)}${m.unit === "円" ? "（円）" : ""}</th>`).join("")}<th class="num">客単価</th><th></th></tr>` +
      list.slice().reverse().map(r => `<tr><td><b>${esc(r.month)}</b></td>${INPUT_KEYS.map(m => `<td><input inputmode="numeric" data-m="${esc(r.month)}" data-k="${m.k}" value="${r[m.k] === "" || r[m.k] == null ? "" : esc(r[m.k])}"/></td>`).join("")}
        <td class="num muted">${r.customers ? RP.yen(r.sales / r.customers) : "—"}</td><td><button class="del" data-del="${esc(r.month)}" title="削除">×</button></td></tr>`).join("") +
      (list.length ? "" : `<tr><td colspan="${INPUT_KEYS.length + 3}" class="muted">「＋ 月を追加」で入力を始めましょう</td></tr>`);
  },
  addRow(){
    const list = kpis();
    let month;
    if(list.length){ const d = RP.parseDate(list[list.length-1].month + "-01"); d.setMonth(d.getMonth() + 1); month = RP.ym(d); }
    else month = RP.ym(new Date());
    const ans = prompt("追加する月（YYYY-MM）", month);
    if(!ans || !/^\d{4}-\d{2}$/.test(ans)) return;
    if(list.some(r => r.month === ans)){ RP.toast("その月はすでにあります"); return; }
    list.push({month: ans}); RP.store.set("kpis", list); this.show();
  },
  sample(){
    if(kpis().length && !confirm("サンプルデータで上書きします。よろしいですか？")) return;
    const now = new Date(), list = [];
    const season = [0.95, 0.85, 0.9, 0.95, 0.9, 0.85, 0.9, 0.95, 1.05, 1.3, 1.25, 1.45];
    for(let i = 11; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1), s = season[d.getMonth()];
      const customers = Math.round(620 * s * (0.95 + Math.random() * 0.1));
      list.push({month: RP.ym(d), customers, sales: Math.round(customers * (3900 + Math.random() * 500) / 100) * 100,
        ec: Math.round(80 * s + (11 - i) * 4), line: 380 + (11 - i) * 22 + Math.round(Math.random() * 10), ig: 520 + (11 - i) * 35, ad: Math.round(30000 * s / 1000) * 1000});
    }
    RP.store.set("kpis", list); this.show(); RP.toast("サンプルデータを入れました（実データに書き換えてください）");
  },
  renderUpcoming(){
    const t = RP.today(), end = RP.addDays(t, 14);
    const list = RP.store.get("calendar", []).filter(e => e.date >= t && e.date <= end && e.status !== "done").sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 8);
    $("#dashUpcoming").innerHTML = list.length ? list.map(e => `<div class="alt"><span><b>${esc(RP.jpDate(e.date))}</b> <span class="tag blue">${esc(RP.chanLabel(e.channel))}</span> ${esc(e.title)}</span></div>`).join("")
      : `<div class="empty">予定はありません。<button class="link" data-go="calendar">カレンダーで計画する →</button></div>`;
  },
  renderSeason(){
    const m = new Date().getMonth() + 1, n = m % 12 + 1;
    $("#dashSeason").innerHTML = [[m, "今月"], [n, "来月"]].map(([mm, l]) =>
      `<div class="muted small" style="margin:6px 0 4px">${l}（${mm}月）</div><div class="chips">${RP.monthSeason(mm).map(s => `<button class="chip" data-occ="${esc(s)}" title="この行事でコンテンツを作る">${esc(s)}</button>`).join("")}</div>`).join("");
  },
  async advise(){
    const btn = $("#dashAiBtn"), out = $("#dashAiOut");
    const list = kpis().slice(-12).map(r => { const o = {month:r.month}; METRICS.forEach(m => o[m.label] = Math.round(val(r, m))); return o; });
    const m = new Date().getMonth() + 1;
    const cal = RP.store.get("calendar", []).filter(e => (e.date || "").startsWith(RP.ym(new Date())));
    const camps = RP.store.get("campaigns", []).slice(0, 3).map(c => c.name + "（" + (c.period ? c.period.start + "〜" + c.period.end : "") + "）");
    RP.busy(btn, true, "分析中…");
    try{
      const r = await RP.ai.into(out, {feature:"advice", maxTokens: 12000, effort:"high", prompt:
`米穀店の経営データを分析し、今月の打ち手を提案してください。今日は${RP.today()}です。

# 月次KPI（古い順）
${list.length ? JSON.stringify(list) : "データなし（一般的な米穀店の傾向から提案してください）"}

# 今月の季節要素
${RP.monthSeason(m).join("、")}（来月：${RP.monthSeason(m % 12 + 1).join("、")}）

# 今月の販促予定
${cal.length ? cal.map(e => e.date + " " + e.title + "（" + e.status + "）").join("\n") : "なし"}

# 実施中・直近のキャンペーン
${camps.join("、") || "なし"}

# 出力形式（Markdown）
## 現状診断
数字から読み取れることを3〜5点。前年同月・前月比、季節性、客数×客単価の分解で。
## 今月の重点施策 TOP3
各施策について「ねらい／具体的なやり方／目標KPI／概算コスト／手間」を書く。小さな店で実行できる内容に。
## 今週やることチェックリスト
- [ ] 形式で5〜7個
## 注意点
1〜3点。`});
      RP.saveToLibrary({type:"advice", title:"AI経営アドバイス " + RP.today(), text:r.text});
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  }
};

/* ================= CUSTOMERS (RFM) ================= */
const SEGS = [
  {key:"champion", label:"チャンピオン", desc:"最近・頻繁・高額。店の売上の柱", test:s => s.R >= 4 && s.F >= 4 && s.M >= 4},
  {key:"loyal", label:"ロイヤル", desc:"定期的に買ってくれる常連", test:s => s.F >= 4 && s.R >= 3},
  {key:"new", label:"新規", desc:"最近初めて買ってくれた人", test:s => s.freq <= 1 && s.R >= 4},
  {key:"promising", label:"育成候補", desc:"2回以上購入、常連予備軍", test:s => s.R >= 3 && s.freq >= 2},
  {key:"atrisk", label:"離脱危険", desc:"以前は常連だが最近来ていない", test:s => s.R <= 2 && s.F >= 3},
  {key:"dormant", label:"休眠", desc:"しばらく購入がない", test:s => s.R <= 2},
  {key:"other", label:"一般", desc:"その他", test:() => true}
];
function rfm(list){
  const now = new Date(), n = list.length;
  const rows = list.map(c => {
    const d = RP.parseDate(c.last);
    return Object.assign({}, c, {days: d ? Math.max(0, Math.round((now - d) / 864e5)) : 9999, freq: RP.num(c.freq), monetary: RP.num(c.monetary)});
  });
  const score = (key, asc) => {
    const sorted = rows.slice().sort((a, b) => asc ? a[key] - b[key] : b[key] - a[key]);
    sorted.forEach((r, i) => r["_" + key] = 5 - Math.floor(i / n * 5));
  };
  score("days", true); score("freq", false); score("monetary", false);
  rows.forEach(r => { r.R = r._days; r.F = r._freq; r.M = r._monetary; r.seg = SEGS.find(s => s.test(r)).key; });
  return rows;
}
const segLabel = k => (SEGS.find(s => s.key === k) || {}).label || k;

RP.mod.customers = {
  init(){ $("#cuFile").addEventListener("change", e => { if(e.target.files[0]) this.importCsv(e.target.files[0]); e.target.value = ""; }); },
  show(){ this.render(); },
  importCsv(file){
    const fr = new FileReader();
    fr.onload = () => {
      const rows = RP.parseCsv(fr.result);
      if(rows.length < 2){ RP.toast("データ行が見つかりません", "err"); return; }
      const h = rows[0].map(x => x.trim().toLowerCase());
      const find = re => h.findIndex(x => re.test(x));
      const iName = find(/名|name|顧客|id/), iLast = find(/最終|last|日付|date/), iFreq = find(/回数|freq|count|頻度/), iMon = find(/額|金額|monetary|total|累計|売上/);
      if(iLast < 0 || iFreq < 0 || iMon < 0){ RP.toast("列名を認識できません（最終購入日・購入回数・累計購入額が必要です）", "err"); return; }
      const list = rows.slice(1).map((r, i) => ({name: iName >= 0 ? r[iName] : "顧客" + (i+1), last: r[iLast], freq: RP.num(r[iFreq]), monetary: RP.num(r[iMon])}))
        .filter(c => RP.parseDate(c.last));
      RP.store.set("customers", list); this.render(); RP.toast(list.length + "件の顧客を読み込みました", "ok");
    };
    fr.readAsText(file);
  },
  sample(){
    const list = [], now = new Date();
    const fam = ["佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤","吉田","山田","近藤","石川","杉浦","神谷","鈴村","太田"];
    for(let i = 0; i < 160; i++){
      const type = Math.random();
      const days = type < .25 ? Math.random() * 30 : type < .55 ? 30 + Math.random() * 60 : type < .8 ? 90 + Math.random() * 120 : 210 + Math.random() * 300;
      const freq = Math.max(1, Math.round((type < .25 ? 10 : type < .55 ? 5 : 2) * (0.3 + Math.random())));
      const d = new Date(now - days * 864e5);
      list.push({name: fam[i % fam.length] + "様" + (i+1), last: RP.ymd(d), freq, monetary: Math.round(freq * (3000 + Math.random() * 3000) / 100) * 100});
    }
    RP.store.set("customers", list); this.render(); RP.toast("サンプル顧客を生成しました");
  },
  clear(){ if(confirm("顧客データを全削除しますか？")){ RP.store.set("customers", []); this.render(); } },
  stats(){
    const rows = rfm(RP.store.get("customers", []));
    const total = rows.reduce((a, r) => a + r.monetary, 0) || 1;
    const segs = SEGS.map(s => {
      const g = rows.filter(r => r.seg === s.key), n = g.length || 1;
      return {key:s.key, label:s.label, desc:s.desc, count:g.length, share:g.length / (rows.length || 1),
        days:g.reduce((a, r) => a + r.days, 0) / n, freq:g.reduce((a, r) => a + r.freq, 0) / n,
        monetary:g.reduce((a, r) => a + r.monetary, 0) / n, revShare:g.reduce((a, r) => a + r.monetary, 0) / total};
    }).filter(s => s.count);
    return {rows, segs};
  },
  render(){
    const {rows, segs} = this.stats();
    $("#cuCount").textContent = rows.length ? rows.length + "件" : "";
    if(!rows.length){
      $("#cuTiles").innerHTML = ""; $("#cuChart").innerHTML = `<div class="empty">顧客データを読み込むと分析が表示されます</div>`; $("#cuSegTable").innerHTML = "";
      return;
    }
    const n = rows.length;
    const repeat = rows.filter(r => r.freq >= 2).length / n, active = rows.filter(r => r.days <= 90).length / n;
    $("#cuTiles").innerHTML = [
      ["顧客数", RP.fmt(n) + "人", ""],
      ["リピート率", (repeat * 100).toFixed(1) + "%", "2回以上購入"],
      ["アクティブ率", (active * 100).toFixed(1) + "%", "90日以内に購入"],
      ["平均累計購入額", RP.yen(rows.reduce((a, r) => a + r.monetary, 0) / n), "1人あたり"],
      ["平均購入回数", (rows.reduce((a, r) => a + r.freq, 0) / n).toFixed(1) + "回", ""]
    ].map(t => `<div class="tile"><div class="t-label">${t[0]}</div><div class="t-val">${t[1]}</div><div class="t-sub">${t[2]}</div></div>`).join("");
    RP.chart.hbars($("#cuChart"), segs.map(s => ({label:s.label + "　" + s.desc, value:s.count})), {fmt: v => v + "人"});
    $("#cuSegTable").innerHTML = `<table class="tbl"><tr><th>セグメント</th><th class="num">人数</th><th class="num">構成比</th><th class="num">売上構成比</th><th class="num">平均経過日数</th><th class="num">平均回数</th><th class="num">平均累計額</th></tr>
      ${segs.map(s => `<tr><td><b>${esc(s.label)}</b></td><td class="num">${s.count}</td><td class="num">${(s.share * 100).toFixed(1)}%</td><td class="num">${(s.revShare * 100).toFixed(1)}%</td><td class="num">${Math.round(s.days)}日</td><td class="num">${s.freq.toFixed(1)}</td><td class="num">${RP.yen(s.monetary)}</td></tr>`).join("")}</table>`;
  },
  exportCsv(){
    const {rows} = this.stats();
    if(!rows.length){ RP.toast("顧客データがありません"); return; }
    RP.download("ricepia-customers-rfm-" + RP.today() + ".csv",
      RP.csv([["顧客名","最終購入日","購入回数","累計購入額","経過日数","R","F","M","セグメント"]].concat(rows.map(r => [r.name, r.last, r.freq, r.monetary, r.days, r.R, r.F, r.M, segLabel(r.seg)]))), "text/csv;charset=utf-8");
  },
  async strategy(){
    const {rows, segs} = this.stats();
    if(!rows.length){ RP.toast("先に顧客データを読み込んでください", "err"); return; }
    const btn = $("#cuAiBtn"), out = $("#cuAiOut");
    const table = segs.map(s => `| ${s.label}（${s.desc}） | ${s.count}人 | ${(s.share * 100).toFixed(1)}% | 売上${(s.revShare * 100).toFixed(1)}% | 平均${Math.round(s.days)}日前 | ${s.freq.toFixed(1)}回 | ${Math.round(s.monetary)}円 |`).join("\n");
    RP.busy(btn, true, "施策を作成中…");
    try{
      const r = await RP.ai.into(out, {feature:"segment", maxTokens: 14000, prompt:
`米穀店の顧客をRFM分析でセグメント分けしました（個人情報は含みません）。今日は${RP.today()}、季節要素は「${RP.monthSeason(new Date().getMonth() + 1).join("、")}」です。

| セグメント | 人数 | 構成比 | 売上構成比 | 最終購入 | 平均回数 | 平均累計額 |
|---|---|---|---|---|---|---|
${table}

# 出力形式（Markdown）
最初に「## 全体所見」で、売上の集中度・リピート構造・最優先で手を打つべきセグメントを3〜4行で。
続いて人数の多い順ではなく「売上インパクトの大きい順」に、セグメントごとに：
## セグメント名
- **目的**：
- **施策**：2〜3個（米の消費サイクル＝一般家庭で5kgが約3〜4週間、を踏まえたタイミング設計を含める）
- **オファー**：利益を削りすぎない特典
- **KPI**：
**LINEメッセージ例**（200字以内、そのまま送れる文面）
> （文面）
最後に「## 30日アクションプラン」を週ごとに。`});
      RP.saveToLibrary({type:"segment", channel:"line", title:"顧客セグメント別施策 " + RP.today(), text:r.text});
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  }
};

/* ================= RESEARCH ================= */
const PRESETS = [
  "今年の新米の店頭価格相場と、米価の最新動向",
  "米穀店・お米専門店の成功しているSNS・販促事例",
  "お米のギフト（お歳暮・内祝い）の売れ筋と価格帯",
  "愛知県のお米・食のトレンドと地域イベント",
  "お米の定期便・サブスクの事例と価格設定",
  "飲食店向け業務用米の取引で重視されるポイント"
];
RP.mod.research = {
  lastText: "", lastSources: [], lastQ: "",
  init(){
    $("#rsPresets").innerHTML = PRESETS.map(p => `<button class="chip" type="button">${esc(p)}</button>`).join("");
    $("#rsPresets").onclick = e => { const b = e.target.closest(".chip"); if(b) $("#rsQuery").value = b.textContent; };
    $("#rsHistory").addEventListener("click", e => {
      const b = e.target.closest("button[data-id]"); if(!b) return;
      const h = RP.store.get("research", []).find(x => x.id === b.dataset.id); if(!h) return;
      this.lastText = h.text; this.lastSources = h.sources; this.lastQ = h.q;
      $("#rsQuery").value = h.q; $("#rsOutCard").hidden = false; $("#rsOut").innerHTML = RP.md(h.text); this.renderSources();
      $("#rsOutCard").scrollIntoView({behavior:"smooth"});
    });
  },
  show(){ this.renderHistory(); },
  async run(){
    const q = $("#rsQuery").value.trim();
    if(!q){ RP.toast("調べたいことを入力してください", "err"); return; }
    const btn = $("#rsGo"), out = $("#rsOut");
    $("#rsOutCard").hidden = false; $("#rsSources").innerHTML = "";
    RP.busy(btn, true, "Webを調査中…");
    try{
      const r = await RP.ai.into(out, {feature:"research", maxTokens: 16000,
        tools:[{type:"web_search_20260209", name:"web_search", max_uses:6, user_location:{type:"approximate", country:"JP", timezone:"Asia/Tokyo"}}],
        prompt:
`次のテーマについてWeb検索で最新情報を調べ、米穀店の店主向けにまとめてください。今日は${RP.today()}です。

# テーマ
${q}

# 出力形式（Markdown）
## 要点
3行で結論。
## 詳しく
事実・数字（いつ時点の情報かを明記）。信頼できる情報源（公的機関・業界団体・大手メディア）を優先。
## 当店への示唆
この店の強みと商品マスタを踏まえ、すぐ試せる具体的な打ち手を3つ。
情報が見つからない・古い場合は推測で埋めず、その旨を書く。`});
      this.lastText = r.text; this.lastSources = r.sources; this.lastQ = q;
      this.renderSources();
      const hist = RP.store.get("research", []);
      hist.unshift({id:RP.uid(), q, text:r.text, sources:r.sources, date:new Date().toISOString()});
      RP.store.set("research", hist.slice(0, 30)); this.renderHistory();
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  },
  renderSources(){
    const s = this.lastSources || [];
    $("#rsSources").innerHTML = s.length ? `<div class="sect" style="margin-top:0">出典（${s.length}件）</div>` +
      s.slice(0, 20).map(x => `<a href="${esc(/^https?:/.test(x.url) ? x.url : "#")}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join("") : "";
  },
  save(){
    if(!this.lastText) return;
    RP.saveToLibrary({type:"research", title:"リサーチ：" + this.lastQ.slice(0, 40), text:this.lastText + (this.lastSources.length ? "\n\n出典：\n" + this.lastSources.map(s => s.title + " " + s.url).join("\n") : "")});
  },
  renderHistory(){
    const h = RP.store.get("research", []);
    $("#rsHistory").innerHTML = h.length ? h.map(x => `<div class="alt"><span>${esc(x.q)}<br/><span class="muted small">${esc(new Date(x.date).toLocaleString("ja-JP", {dateStyle:"short", timeStyle:"short"}))}・出典${(x.sources || []).length}件</span></span><button data-id="${x.id}">開く</button></div>`).join("")
      : `<div class="empty">まだリサーチ履歴はありません</div>`;
  }
};
})();

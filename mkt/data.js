/* Brand profile, content library, settings */
(function(){
"use strict";
const {$, $$, esc} = RP;

/* Seeded from the product line-up of the quality-judge app (index.html). Prices are left for the shop to fill. */
RP.DEFAULT_BRAND = {
  name:"近藤米穀店", brand:"らいすぴあ",
  story:"創業130余年の老舗米穀店。現在は5代目が店を継ぎ、自らの目で精米の品質を見極めて販売している。",
  area:"愛知県【市区町村】／地元のご家庭と飲食店が中心",
  hours:"【営業時間】／定休日【　】",
  usp:"・5代目が全量を品質チェック（AI品質判定も導入）\n・注文ごとの精米で鮮度が高い\n・全国の産地米から愛知産、オリジナルブレンドまで幅広い品揃え\n・用途（おにぎり、お弁当、寿司など）に合わせた提案ができる",
  target:"地域の子育て世帯・シニア世帯、贈答品を探す方、地元の飲食店",
  voice:"誠実で温かい、町のお米屋さんの語り口。専門用語は噛み砕いて。絵文字は控えめ。",
  channels:"店頭販売、電話注文、配達【対応エリア】、Instagram【@アカウント】、LINE公式アカウント",
  ng:"「日本一」「最高級」など根拠のない最上級表現。他店を下げる比較。",
  products:[
    {name:"姫さま（つや姫・減農薬）", cat:"プレミアム", price:"", note:"贈答向け"},
    {name:"幻の米（JAながのコシヒカリ）", cat:"プレミアム", price:"", note:""},
    {name:"富山コシヒカリ", cat:"産地品種", price:"", note:""},
    {name:"山形 雪若丸", cat:"産地品種", price:"", note:""},
    {name:"佐賀 夢しずく", cat:"産地品種", price:"", note:""},
    {name:"岩手 ひとめぼれ", cat:"産地品種", price:"", note:""},
    {name:"ミルキークイーン", cat:"産地品種", price:"", note:"もちもち食感"},
    {name:"減農薬コシヒカリ", cat:"産地品種", price:"", note:""},
    {name:"安城 ハツシモ", cat:"愛知産", price:"", note:""},
    {name:"のどか愛知コシヒカリ", cat:"愛知産", price:"", note:""},
    {name:"あいちのかおり", cat:"愛知産", price:"", note:""},
    {name:"つやっ子（あいちコシヒカリ＋あいちのこころ）", cat:"愛知産", price:"", note:"ブレンド"},
    {name:"西尾 にこまる", cat:"愛知産", price:"", note:""},
    {name:"おにぎりがうまい米", cat:"オリジナル", price:"", note:"らいすぴあオリジナル"},
    {name:"花子（あいちのこころ＋中米）", cat:"オリジナル", price:"", note:"ブレンド"},
    {name:"コスパ米（あいちのこころ＋中米）", cat:"オリジナル", price:"", note:"お手頃価格"},
    {name:"ハイガ米（岩手ひとめぼれ）", cat:"特殊米", price:"", note:""},
    {name:"5分づき米（岩手ひとめぼれ）", cat:"特殊米", price:"", note:""},
    {name:"玄米（岩手ひとめぼれ）", cat:"特殊米", price:"", note:""},
    {name:"もっちり玄米", cat:"特殊米", price:"", note:""},
    {name:"もっちり玄米デラックス（黒米入り）", cat:"特殊米", price:"", note:""},
    {name:"愛知コシヒカリ", cat:"特殊米", price:"", note:""}
  ]
};

RP.productOptions = function(sel, opts){
  opts = opts || {};
  const ps = RP.brand().products || [];
  const cats = [...new Set(ps.map(p => p.cat || "その他"))];
  sel.innerHTML = (opts.any ? `<option value="">（特定の商品なし・お店全体）</option>` : "") +
    cats.map(c => `<optgroup label="${esc(c)}">${ps.filter(p => (p.cat || "その他") === c).map(p => `<option>${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
};

/* ================= BRAND ================= */
const FIELDS = {bdName:"name", bdBrand:"brand", bdStory:"story", bdArea:"area", bdHours:"hours", bdUsp:"usp", bdTarget:"target", bdVoice:"voice", bdChannels:"channels", bdNg:"ng"};
let products = [];
RP.mod.brand = {
  show(){
    const b = RP.brand();
    Object.keys(FIELDS).forEach(id => $("#" + id).value = b[FIELDS[id]] || "");
    products = JSON.parse(JSON.stringify(b.products || []));
    this.renderProducts();
  },
  renderProducts(){
    const t = $("#bdProducts");
    t.innerHTML = `<tr><th>商品名</th><th>カテゴリ</th><th>価格（例：5kg 3,980円）</th><th>特徴メモ</th><th></th></tr>` +
      products.map((p, i) => `<tr>
        <td><input class="txt" data-i="${i}" data-k="name" value="${esc(p.name)}"/></td>
        <td><input class="txt" style="min-width:90px" data-i="${i}" data-k="cat" value="${esc(p.cat)}"/></td>
        <td><input class="txt" data-i="${i}" data-k="price" value="${esc(p.price)}"/></td>
        <td><input class="txt" style="min-width:160px" data-i="${i}" data-k="note" value="${esc(p.note)}"/></td>
        <td><button class="del" title="削除" data-del="${i}">×</button></td></tr>`).join("");
    t.oninput = e => { const x = e.target; if(x.dataset.k) products[+x.dataset.i][x.dataset.k] = x.value; };
    t.onclick = e => { const d = e.target.dataset.del; if(d != null){ products.splice(+d, 1); this.renderProducts(); } };
  },
  addProduct(){ products.push({name:"", cat:"", price:"", note:""}); this.renderProducts(); },
  save(){
    const b = {};
    Object.keys(FIELDS).forEach(id => b[FIELDS[id]] = $("#" + id).value.trim());
    b.products = products.filter(p => p.name.trim());
    RP.store.set("brand", b);
    RP.toast("ブランド設定を保存しました", "ok");
    RP.$$("select[data-products]").forEach(s => { const v = s.value; RP.productOptions(s, {any: s.dataset.products === "any"}); s.value = v; });
  }
};

/* ================= LIBRARY ================= */
const TYPE_LABEL = {content:"コンテンツ", research:"リサーチ", review:"口コミ返信", doctor:"コピー改善案", advice:"AIアドバイス", segment:"顧客施策"};
RP.mod.library = {
  init(){
    $("#libFilter").innerHTML += Object.keys(TYPE_LABEL).map(k => `<option value="${k}">${TYPE_LABEL[k]}</option>`).join("");
    $("#libSearch").addEventListener("input", () => this.render());
    $("#libFilter").addEventListener("change", () => this.render());
    $("#libList").addEventListener("click", e => {
      const b = e.target.closest("button[data-act]"); if(!b) return;
      const lib = RP.store.get("library", []), it = lib.find(x => x.id === b.dataset.id); if(!it) return;
      const act = b.dataset.act;
      if(act === "copy") RP.copy(it.text);
      if(act === "open") b.closest(".item").querySelector(".item-body").classList.toggle("open");
      if(act === "del"){ if(confirm("削除しますか？")){ RP.store.set("library", lib.filter(x => x.id !== it.id)); this.render(); } }
      if(act === "cal"){ RP.mod.calendar.edit(null, {title: it.title, channel: it.channel, note: it.text.slice(0, 400), contentId: it.id}); }
      if(act === "doctor"){ RP.go("doctor"); $("#drText").value = it.text; if(it.channel) $("#drChannel").value = it.channel; }
    });
  },
  show(){ this.render(); },
  render(){
    const q = $("#libSearch").value.trim().toLowerCase(), f = $("#libFilter").value;
    const lib = RP.store.get("library", []).filter(x => (!f || x.type === f) && (!q || (x.title + " " + x.text).toLowerCase().includes(q)));
    $("#libList").innerHTML = lib.length ? lib.map(x => `
      <div class="item">
        <div class="item-head">
          <span class="tag">${esc(TYPE_LABEL[x.type] || x.type)}</span>
          ${x.channel ? `<span class="tag blue">${esc(RP.chanLabel(x.channel))}</span>` : ""}
          <span class="item-title">${esc(x.title)}</span>
          <span class="muted small" style="margin-left:auto">${esc(new Date(x.created).toLocaleString("ja-JP", {dateStyle:"short", timeStyle:"short"}))}</span>
        </div>
        <div class="item-body">${esc(x.text)}</div>
        <div class="item-actions">
          <button data-act="open" data-id="${x.id}">全文</button>
          <button data-act="copy" data-id="${x.id}">コピー</button>
          ${x.type === "content" ? `<button data-act="cal" data-id="${x.id}">予定に入れる</button><button data-act="doctor" data-id="${x.id}">診断</button>` : ""}
          <button data-act="del" data-id="${x.id}">削除</button>
        </div>
      </div>`).join("") : `<div class="card empty">${q || f ? "該当するものがありません" : "まだ保存されたコンテンツはありません。<br/>コンテンツ生成やリサーチの結果を保存するとここに並びます。"}</div>`;
  },
  exportCsv(){
    const lib = RP.store.get("library", []);
    RP.download("ricepia-library-" + RP.today() + ".csv",
      RP.csv([["作成日時","種類","チャネル","タイトル","本文"]].concat(lib.map(x => [x.created, TYPE_LABEL[x.type] || x.type, x.channel ? RP.chanLabel(x.channel) : "", x.title, x.text]))),
      "text/csv;charset=utf-8");
  }
};

/* ================= SETTINGS ================= */
RP.mod.settings = {
  init(){ $("#sgModel").innerHTML = RP.MODELS.map(m => `<option value="${m.id}">${esc(m.label)}</option>`).join(""); },
  show(){
    const s = RP.settings();
    $("#sgModel").value = s.model; $("#sgEffort").value = s.effort; $("#sgFallback").checked = !!s.fallback;
    $("#sgRate").value = s.rate; $("#sgBudget").value = s.budget;
    this.renderUsage();
  },
  save(){
    RP.store.set("settings", {model: $("#sgModel").value, effort: $("#sgEffort").value, fallback: $("#sgFallback").checked,
      rate: RP.num($("#sgRate").value) || 150, budget: RP.num($("#sgBudget").value)});
    RP.toast("設定を保存しました", "ok"); RP.renderCost(); this.renderUsage();
  },
  renderUsage(){
    const FEAT = {content:"コンテンツ生成", refine:"修正", doctor:"コピー診断", review:"口コミ返信", reviews:"口コミ分析", campaign:"キャンペーン設計", calendar:"カレンダー計画", segment:"顧客施策", research:"市場リサーチ", advice:"AIアドバイス"};
    const ym = RP.ym(new Date()), s = RP.settings();
    const list = RP.usage().filter(u => (u.t || "").startsWith(ym));
    const by = {};
    list.forEach(u => { const k = u.feature; by[k] = by[k] || {n:0, jpy:0}; by[k].n++; by[k].jpy += u.jpy; });
    const total = RP.monthCost(ym);
    const pct = s.budget ? Math.min(100, total / s.budget * 100) : 0;
    $("#sgUsage").innerHTML = `
      <div class="tiles" style="grid-template-columns:1fr 1fr">
        <div class="tile"><div class="t-label">今月の利用料（概算）</div><div class="t-val">${RP.yen(total)}</div><div class="t-sub">${list.length}回の生成</div></div>
        <div class="tile"><div class="t-label">予算消化率</div><div class="t-val">${s.budget ? Math.round(pct) + "%" : "—"}</div><div class="t-sub">上限 ${s.budget ? RP.yen(s.budget) : "未設定"}</div></div>
      </div>
      ${s.budget ? `<div class="bar-track" style="height:8px;margin-bottom:12px"><div class="bar-fill" style="width:${pct}%;background:${pct >= 80 ? "var(--red)" : "var(--chart)"}"></div></div>` : ""}
      <table class="tbl"><tr><th>機能</th><th class="num">回数</th><th class="num">金額</th></tr>
      ${Object.keys(by).sort((a, b) => by[b].jpy - by[a].jpy).map(k => `<tr><td>${esc(FEAT[k] || k)}</td><td class="num">${by[k].n}</td><td class="num">${RP.yen(by[k].jpy)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">今月の利用はまだありません</td></tr>`}
      </table>
      <p class="hint">※ トークン数×公表単価×為替で算出した目安です。正確な請求額はAnthropic Consoleでご確認ください。</p>`;
  }
};
})();

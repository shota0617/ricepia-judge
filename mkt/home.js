/* Home (overview), 今週の改善 (rule-based diagnosis), channel stats, sidebar badges */
(function(){
"use strict";
const {$, esc} = RP;

/* Channels tracked on the home table. `key` matches the calendar's channel values. */
const CH = [
  {key:"line", label:"LINE", unit:"友だち"},
  {key:"instagram", label:"Instagram", unit:"フォロワー"},
  {key:"x", label:"X", unit:"フォロワー"},
  {key:"gbp", label:"Googleビジネス", unit:"クチコミ"},
  {key:"mail", label:"メルマガ", unit:"読者"},
  {key:"blog", label:"ブログ / note", unit:"フォロワー"}
];

/* ---------- data helpers ---------- */
const events = () => RP.store.get("calendar", []);
const posted = e => e.status === "done" || e.status === "scheduled";
function postsBetween(from, to, ch){
  const t = RP.today();
  return events().filter(e => posted(e) && e.date >= from && e.date <= to && e.date <= t && (!ch || e.channel === ch)).length;
}
const statsHist = () => RP.store.get("chstats", []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
function latestStat(key){
  const h = statsHist();
  for(let i = h.length - 1; i >= 0; i--) if(h[i].values[key] != null && h[i].values[key] !== "") return {date:h[i].date, v:+h[i].values[key]};
  return null;
}
function weekDelta(key){
  const last = latestStat(key); if(!last) return null;
  const cutoff = RP.addDays(last.date, -6), h = statsHist();
  for(let i = h.length - 1; i >= 0; i--){
    const x = h[i];
    if(x.date <= cutoff && x.values[key] != null && x.values[key] !== "") return last.v - (+x.values[key]);
  }
  return null;
}
const pct = (a, b) => b ? (a - b) / b * 100 : null;
const signed = (n, suf) => (n > 0 ? "+" : n < 0 ? "−" : "±") + RP.fmt(Math.abs(n)) + (suf || "");
const signedPct = p => p == null ? "—" : (p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(p).toFixed(1) + "%";
const brandBlanks = () => (JSON.stringify(RP.brand()).match(/【/g) || []).length;

/* ---------- diagnosis (local rules, no API cost) ---------- */
RP.diagnose = function(){
  const actions = [], notes = [];
  const t = RP.today(), now = new Date();
  const evs = events();

  // --- actions
  const overdue = evs.filter(e => e.date < t && (e.status === "idea" || e.status === "draft")).length;
  if(overdue) actions.push({text:`期限を過ぎた未完了の予定が${overdue}件あります`, go:"calendar"});
  const today = evs.filter(e => e.date === t && e.status !== "done").length;
  if(today) actions.push({text:`今日の予定が${today}件あります`, go:"calendar"});
  const blanks = brandBlanks();
  if(blanks) actions.push({text:`ブランド設定に未記入の【 】が${blanks}箇所あります（AIの文章に反映されます）`, go:"brand"});
  const k = RP.kpi.list();
  if(k.length && now.getDate() >= 5){
    const pm = RP.ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    if(!k.some(r => r.month === pm && RP.num(r.sales))) actions.push({text:`先月（${+pm.slice(5)}月）の売上が未入力です`, go:"sales"});
  }
  const hist = statsHist();
  if(hist.length){
    const age = Math.round((new Date(t) - new Date(hist[hist.length-1].date)) / 864e5);
    if(age >= 14) actions.push({text:`チャネルの数値が${age}日更新されていません`, go:"stats"});
  }
  if(!RP.getKey()) actions.push({text:"APIキーを設定すると、文章づくりや分析のAI機能が使えます", go:"key"});

  // --- notes (diagnosis)
  const rows = k.filter(r => RP.num(r.sales));
  if(rows.length >= 2){
    const a = rows[rows.length-1], b = rows[rows.length-2];
    const ps = pct(RP.num(a.sales), RP.num(b.sales));
    const pc = pct(RP.num(a.customers), RP.num(b.customers));
    const aov = r => RP.num(r.customers) ? RP.num(r.sales) / RP.num(r.customers) : 0;
    const pa = pct(aov(a), aov(b));
    const m = +a.month.slice(5) + "月";
    if(ps != null && ps <= -5){
      const cause = pc != null && pa != null ? (Math.abs(pc) >= Math.abs(pa) ? "客数" : "客単価") : null;
      notes.push({tone:"warn", go:"improve", text:`${m}の売上が前月比${signedPct(ps)}。${pc != null ? `客数${signedPct(pc)}・客単価${signedPct(pa)}で、主な原因は${cause}です。` : ""}`});
    } else if(ps != null && ps >= 5){
      notes.push({tone:"good", go:"sales", text:`${m}の売上が前月比${signedPct(ps)}と好調です。伸びた商品・施策を来月も続けましょう。`});
    }
    if(pa != null && pa <= -3 && !(ps != null && ps <= -5)) notes.push({tone:"warn", go:"campaign", text:`客単価が前月比${signedPct(pa)}。5kg・10kgのまとめ買いや定期便の提案で戻せます。`});
    const ly = k.find(r => r.month === (+a.month.slice(0, 4) - 1) + a.month.slice(4));
    if(ly && RP.num(ly.sales)){
      const py = pct(RP.num(a.sales), RP.num(ly.sales));
      notes.push({tone: py >= 0 ? "good" : "warn", go:"sales", text:`${m}の売上は前年同月比${signedPct(py)}です。`});
    }
  }
  const lines = k.filter(r => RP.num(r.line));
  if(lines.length >= 5){
    const d = lines.slice(-4).map((r, i, arr) => i ? RP.num(r.line) - RP.num(arr[i-1].line) : null).slice(1);
    const lastD = d[d.length-1], avg = (d[0] + d[1]) / 2;
    if(avg > 0 && lastD < avg * 0.6) notes.push({tone:"warn", go:"studio:pop", text:`LINE友だちの伸びが鈍っています（先月${signed(lastD, "人")}、その前の平均${signed(Math.round(avg), "人")}）。店頭POPで登録特典を案内しましょう。`});
  }
  const p7 = postsBetween(RP.addDays(t, -6), t);
  const p14 = postsBetween(RP.addDays(t, -13), RP.addDays(t, -7));
  if(evs.length){
    if(p7 < 2) notes.push({tone:"warn", go:"calendar", text:`直近7日の発信が${p7}件です。週2〜3回を目安に、カレンダーで予定を入れましょう。`});
    else if(p7 > p14) notes.push({tone:"good", go:"calendar", text:`直近7日の発信は${p7}件（前週${p14}件）。いいペースです。`});
  }
  CH.forEach(c => {
    const s = latestStat(c.key);
    if(s && s.v > 0 && evs.length && !postsBetween(RP.addDays(t, -13), t, c.key))
      notes.push({tone:"warn", go:"studio:" + c.key, text:`${c.label}の発信が14日間ありません（${RP.fmt(s.v)}${c.unit}）。1本作りましょう。`});
  });
  const cust = RP.store.get("customers", []);
  if(cust.length && RP.mod.customers){
    const segs = RP.mod.customers.stats().segs;
    const risk = segs.find(s => s.key === "atrisk");
    if(risk && risk.count) notes.push({tone:"warn", go:"customers", text:`離脱しかけている常連のお客様が${risk.count}人。お米が切れる頃（前回から約4週間）にLINEで声をかけましょう。`});
    const dorm = segs.find(s => s.key === "dormant");
    if(dorm && dorm.share >= 0.3) notes.push({tone:"info", go:"customers", text:`休眠のお客様が全体の${Math.round(dorm.share * 100)}%。新米の入荷案内は掘り起こしのきっかけになります。`});
  }
  const up = evs.filter(e => e.date > t && e.date <= RP.addDays(t, 14)).length;
  if(!up) notes.push({tone:"info", go:"calendar", text:"今後2週間の予定がありません。カレンダーの「1ヶ月分をAIで計画」で埋められます。"});
  const nm = (now.getMonth() + 1) % 12 + 1;
  const ev = RP.monthSeason(nm)[0];
  if(ev) notes.push({tone:"info", go:"campaign", text:`来月は「${ev}」。告知は2〜3週間前から始めると効果的です。`});
  return {actions, notes};
};

function goTo(g){
  if(!g) return;
  if(g === "key") return RP.keyModal();
  if(g === "stats") return RP.mod.home.editStats();
  const [view, ch] = g.split(":");
  RP.go(view, ch ? {channel: ch} : {});
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-goto]");
  if(el){ e.preventDefault(); goTo(el.dataset.goto); }
});

RP.refreshBadges = function(){
  const t = RP.today();
  const due = events().filter(e => e.date <= t && (e.status === "idea" || e.status === "draft" || (e.date === t && e.status !== "done"))).length;
  const set = (id, v) => { const el = $("#" + id); if(el){ el.textContent = v || ""; el.hidden = !v; } };
  set("nbCalendar", due);
  const d = RP.diagnose();
  set("nbImprove", d.notes.filter(n => n.tone === "warn").length + d.actions.length);
  set("nbBrand", brandBlanks() ? "要記入" : "");
};

/* ================= HOME ================= */
RP.mod.home = {
  show(){
    const now = new Date();
    $("#homeTime").textContent = RP.pad(now.getHours()) + ":" + RP.pad(now.getMinutes()) + " 更新";
    this.renderWelcome();
    const d = RP.diagnose();
    this.renderAction(d); this.renderTiles(); this.renderStrip(); this.renderDiag(d);
    this.renderChannels(); this.renderDaily();
    RP.mod.sales.renderUpcoming(); RP.mod.sales.renderSeason();
    RP.refreshBadges();
  },
  renderWelcome(){
    const el = $("#homeWelcome");
    const empty = !RP.kpi.list().length && !events().length && !RP.store.get("customers", []).length && !statsHist().length;
    if(RP.store.get("demo", false)){
      el.innerHTML = `<div class="demo-bar"><b>サンプル</b><span>表示中の数字と名前はすべて見本です。</span><span class="spacer"></span><button class="btn-ghost-sm" onclick="RP.mod.home.clearSample()">サンプルを消して実データにする</button></div>`;
    } else if(empty){
      el.innerHTML = `<div class="card welcome"><h2>はじめに</h2>
        <p>数字を入れるほど、ホームの診断が具体的になります。まずはサンプルで全体の見え方を確かめるのがおすすめです。</p>
        <div class="row-btns"><button class="btn-sm btn-gold" onclick="RP.mod.home.sample()">サンプルで試す</button>
        <button class="btn-ghost-sm" data-go="brand">ブランド設定から始める</button>
        <button class="btn-ghost-sm" data-go="sales">売上を入力する</button></div></div>`;
    } else el.innerHTML = "";
  },
  renderAction(d){
    const a = d.actions;
    $("#homeAction").className = "act-box " + (a.length ? "act-warn" : "act-ok");
    $("#homeAction").innerHTML = a.length
      ? `<div class="act-title">要アクション ${a.length}件</div>` + a.map(x => `<a href="#" class="act-item" data-goto="${esc(x.go)}">${esc(x.text)}<span>→</span></a>`).join("")
      : `<div class="act-title">✓ 要アクションなし</div>`;
    const warn = d.notes.length;
    $("#homeDiagJump").innerHTML = `<i class="dot"></i>らいすぴあAIの診断 ${warn}件<span>↓</span>`;
  },
  renderTiles(){
    const k = RP.kpi.list().filter(r => RP.num(r.sales));
    const a = k[k.length-1], b = k[k.length-2];
    const tile = (label, val, sub) => `<div class="tile"><div class="t-label">${label}</div><div class="t-val">${val}</div><div class="t-sub">${sub}</div></div>`;
    const delta = (x, y, unit) => y ? `<span class="${x >= y ? "delta-up" : "delta-down"}">${signedPct(pct(x, y))}</span> ／ 前月比` : unit || "前月データなし";
    let html = "";
    if(a){
      const m = a.month.replace("-", "/");
      html += tile(`売上 ${m}`, RP.yen(RP.num(a.sales)), delta(RP.num(a.sales), b && RP.num(b.sales)));
      html += tile(`客数 ${m}`, RP.fmt(RP.num(a.customers)) + "<small>人</small>", delta(RP.num(a.customers), b && RP.num(b.customers)));
    } else {
      html += tile("売上", "—", `<a href="#" data-goto="sales">売上と配信で入力 →</a>`) + tile("客数", "—", "");
    }
    const ls = latestStat("line"), lw = weekDelta("line");
    const kl = RP.kpi.list().filter(r => RP.num(r.line));
    if(ls) html += tile("LINE友だち", RP.fmt(ls.v), lw == null ? RP.jpDate(ls.date) + " 時点" : `<span class="${lw >= 0 ? "delta-up" : "delta-down"}">${signed(lw)}</span> ／ 7日`);
    else if(kl.length) html += tile("LINE友だち", RP.fmt(RP.num(kl[kl.length-1].line)), kl.length > 1 ? `<span class="delta-up">${signed(RP.num(kl[kl.length-1].line) - RP.num(kl[kl.length-2].line))}</span> ／ 前月` : "");
    else html += tile("LINE友だち", "—", `<a href="#" data-goto="stats">数値を入力 →</a>`);
    const ym = RP.ym(new Date());
    const mine = events().filter(e => (e.date || "").startsWith(ym));
    html += tile("今月の発信", mine.filter(posted).filter(e => e.date <= RP.today()).length + "<small>件</small>", `予定 ${mine.length}件`);
    $("#homeTiles").innerHTML = html;
  },
  renderStrip(){
    const cust = RP.store.get("customers", []).length;
    const k = RP.kpi.list().filter(r => RP.num(r.sales)), a = k[k.length-1];
    $("#homeStrip").innerHTML = `
      <div><span>顧客リスト全体</span><b>${cust ? RP.fmt(cust) + "人" : "—"}</b></div>
      <div><span>売上の内訳 ${a ? a.month.replace("-", "/") : ""}</span><b>${a ? `客数 ${RP.fmt(RP.num(a.customers))}・客単価 ${RP.num(a.customers) ? RP.yen(RP.num(a.sales) / RP.num(a.customers)) : "—"}` : "—"}</b></div>
      <div><span>AI利用料 今月</span><b>${RP.yen(RP.monthCost())}</b></div>`;
  },
  renderDiag(d){
    const n = d.notes;
    $("#homeDiag").innerHTML = `<div class="card-head"><h2>らいすぴあAIの診断 <small>${n.length}件</small></h2></div>
      ${n.length ? `<div class="diag-list">${n.slice(0, 4).map(x => `<a href="#" class="diag-item ${x.tone}" data-goto="${esc(x.go)}"><i class="dot"></i><span>${esc(x.text)}</span><b>→</b></a>`).join("")}</div>`
        : `<div class="empty">データが増えると、ここに改善点が表示されます。</div>`}
      <a href="#" class="more" data-goto="improve">くわしい診断は「今週の改善」で →</a>`;
  },
  renderChannels(){
    const t = RP.today();
    const rows = CH.map(c => {
      const s = latestStat(c.key), wd = weekDelta(c.key);
      const p7 = postsBetween(RP.addDays(t, -6), t, c.key), p14 = postsBetween(RP.addDays(t, -13), RP.addDays(t, -7), c.key);
      const wow = p14 ? signedPct(pct(p7, p14)).replace(/\.\d%/, "%") : (p7 ? "新規" : "—");
      return `<tr data-goto="studio:${c.key}" title="${esc(c.label)}の投稿を作る">
        <td><b>${esc(c.label)}</b></td>
        <td class="num">${s ? RP.fmt(s.v) + ` <small>${c.unit}</small>` : `<span class="muted">未入力</span>`}</td>
        <td class="num">${wd == null ? "—" : signed(wd)}</td>
        <td class="num">${p7}<small>件</small></td>
        <td class="num">${wow}</td></tr>`;
    }).join("");
    $("#homeChannels").innerHTML = `<table class="ctable"><tr><th>チャネル</th><th class="num">規模</th><th class="num">増減 7日</th><th class="num">発信 7日</th><th class="num">前週比</th></tr>${rows}</table>
      <p class="foot-note">発信は販促カレンダーで「予約済み・完了」にした予定の数 · 規模は「数値を更新」で記録 · 行を押すとそのチャネルの投稿を作成</p>`;
  },
  renderDaily(){
    const t = RP.today(), data = [];
    const evs = events().filter(posted);
    for(let i = 29; i >= 0; i--){
      const d = RP.addDays(t, -i), dt = RP.parseDate(d);
      data.push({label:(dt.getMonth()+1) + "/" + dt.getDate(), value:evs.filter(e => e.date === d).length, sub:RP.jpDate(d)});
    }
    RP.chart.bar($("#homeDaily"), data, {fmt: v => v + "件", integer:true, title:"日別発信数", empty:"販促カレンダーの予定を「予約済み」「完了」にすると、ここに発信数が表示されます"});
  },
  editStats(){
    const body = RP.modal("チャネルの数値を記録", `
      <p class="hint">各SNS・LINEの管理画面に出ている数字を入れてください。週1回ほど記録すると「増減 7日」が出ます。</p>
      <label class="lbl">記録日</label><input type="date" id="stDate" class="inp" value="${RP.today()}"/>
      ${CH.map(c => { const s = latestStat(c.key); return `<label class="lbl">${esc(c.label)}（${c.unit}）</label><input type="number" min="0" class="inp" data-ch="${c.key}" value="${s ? s.v : ""}" placeholder="空欄なら記録しません"/>`; }).join("")}
      <button class="btn-primary" id="stSave">記録する</button>`);
    body.querySelector("#stSave").onclick = () => {
      const date = $("#stDate").value || RP.today(), values = {};
      RP.$$("input[data-ch]", body).forEach(i => { if(i.value !== "") values[i.dataset.ch] = RP.num(i.value); });
      const h = statsHist().filter(x => x.date !== date);
      h.push({date, values});
      RP.store.set("chstats", h);
      RP.closeModal("genModal"); RP.toast("記録しました", "ok"); this.show();
    };
  },
  sample(){
    const t = RP.today();
    RP.store.set("kpis", RP.mod.sales.sampleData());
    RP.mod.customers.sample(true);
    const base = {line:540, instagram:780, x:290, gbp:41, mail:160};
    const grow = {line:16, instagram:22, x:6, gbp:1, mail:4};
    const hist = [];
    for(let w = 4; w >= 0; w--){
      const values = {};
      Object.keys(base).forEach(k => values[k] = base[k] + grow[k] * (4 - w) + Math.round(Math.random() * grow[k] * 0.4));
      hist.push({date: RP.addDays(t, -7 * w), values});
    }
    RP.store.set("chstats", hist);
    const plan = [
      [-29,"instagram","新米入荷の様子"],[-27,"line","週末限定 精米無料"],[-25,"gbp","営業時間のお知らせ"],[-22,"instagram","おにぎりがうまい米の炊き方"],
      [-20,"x","今日の精米"],[-17,"line","敬老の日ギフト"],[-15,"instagram","5代目の品質チェック"],[-12,"gbp","新米食べ比べセット"],
      [-10,"instagram","愛知産ハツシモの特徴"],[-8,"x","新米の保存方法"],[-6,"line","新米フェア告知"],[-4,"instagram","お客様の声"],
      [-2,"x","今日の精米"],[-1,"gbp","お歳暮早割のご案内"],[-1,"instagram","新米フェア当日の店頭"],[-6,"instagram","新米フェアの準備"],
      [-6,"x","新米フェア告知"],[-15,"line","5代目のおすすめ"],[-22,"x","おにぎりの日"],[-13,"instagram","ハツシモで作るお寿司"],[-3,"blog","お米の正しい保存方法（下書き）"],
      [2,"instagram","新米食べ比べのリール"],[5,"line","お歳暮早割スタート"],[9,"gbp","年末年始の営業日"],[12,"mail","冬のおすすめ"]
    ];
    const evs = events().filter(e => !e.demo).concat(plan.map(([d, ch, title]) => ({id:RP.uid(), demo:true, date:RP.addDays(t, d), channel:ch, title,
      status: d < 0 ? (ch === "blog" ? "draft" : "done") : d < 6 ? "scheduled" : "idea", note:""})));
    RP.store.set("calendar", evs);
    RP.store.set("demo", true);
    RP.toast("サンプルを表示しています（数字と名前はすべて見本です）");
    this.show();
  },
  clearSample(){
    if(!confirm("サンプルの売上・顧客・チャネル数値・予定を消します。よろしいですか？")) return;
    ["kpis", "customers", "chstats"].forEach(k => RP.store.set(k, []));
    RP.store.set("calendar", events().filter(e => !e.demo));
    RP.store.del("demo");
    RP.toast("サンプルを消しました", "ok"); this.show();
  }
};

/* ================= 今週の改善 ================= */
RP.mod.improve = {
  show(){
    const d = RP.diagnose();
    const row = x => `<a href="#" class="diag-item ${x.tone || "act"}" data-goto="${esc(x.go)}"><i class="dot"></i><span>${esc(x.text)}</span><b>開く →</b></a>`;
    $("#improveList").innerHTML = `
      <div class="card-head"><h2>要アクション <small>${d.actions.length}件</small></h2></div>
      ${d.actions.length ? `<div class="diag-list">${d.actions.map(row).join("")}</div>` : `<div class="empty">✓ 今すぐ対応が必要なことはありません</div>`}
      <div class="card-head" style="margin-top:18px"><h2>らいすぴあAIの診断 <small>${d.notes.length}件</small></h2></div>
      ${d.notes.length ? `<div class="diag-list">${d.notes.map(row).join("")}</div>` : `<div class="empty">データが増えると、ここに改善点が表示されます</div>`}
      <p class="foot-note">この診断は入力済みのデータから自動で出しています（AI利用料はかかりません）。下のAI経営アドバイザーは、より踏み込んだ打ち手を文章で提案します。</p>`;
  }
};
})();

/* Campaign designer & promotion calendar */
(function(){
"use strict";
const {$, $$, esc} = RP;
const EXTRA_CH = [{value:"store", label:"店頭施策・試食"}, {value:"ads", label:"Web広告"}, {value:"dm", label:"DM・ハガキ"}];
const chLabel = v => (EXTRA_CH.find(c => c.value === v) || {}).label || RP.chanLabel(v);
const chOptions = sel => RP.CHANNELS.concat(EXTRA_CH).map(c => `<option value="${c.value}" ${c.value === sel ? "selected" : ""}>${esc(c.label)}</option>`).join("");

/* ================= CAMPAIGN ================= */
let cpCh;
RP.mod.campaign = {
  current: null,
  init(){
    const sel = $("#cpProduct"); sel.dataset.products = "any"; RP.productOptions(sel, {any:true});
    cpCh = RP.chips($("#cpChannels"), RP.CHANNELS.filter(c => ["instagram","line","gbp","x","flyer","pop","ec","mail"].includes(c.value)).concat(EXTRA_CH), {multi:true, value:["instagram","line","gbp","pop","store"]});
    $("#cpStart").value = RP.today();
    $("#cpList").addEventListener("click", e => {
      const b = e.target.closest("button[data-act]"); if(!b) return;
      const list = RP.store.get("campaigns", []), c = list.find(x => x.id === b.dataset.id); if(!c) return;
      if(b.dataset.act === "open"){ this.render(c); $("#cpOut").scrollIntoView({behavior:"smooth"}); }
      if(b.dataset.act === "del" && confirm("このキャンペーンを削除しますか？")){ RP.store.set("campaigns", list.filter(x => x.id !== c.id)); this.renderList(); }
    });
  },
  show(){ this.renderList(); },
  async plan(){
    const btn = $("#cpGo"), out = $("#cpOut");
    const start = $("#cpStart").value || RP.today(), days = Math.max(3, RP.num($("#cpDays").value) || 30);
    const end = RP.addDays(start, days - 1);
    const months = [...new Set([0, Math.floor(days/2), days-1].map(d => RP.parseDate(RP.addDays(start, d)).getMonth()+1))];
    const chs = cpCh.get().map(chLabel);
    const kpis = RP.store.get("kpis", []).slice(-6);
    RP.busy(btn, true);
    try{
      const j = await RP.ai.json({feature:"campaign", maxTokens: 16000, effort:"high", prompt:
`米穀店の販促キャンペーンを、実行可能なレベルまで具体的に設計してください。

# 条件
目的：${$("#cpGoal").value}
主役の商品：${$("#cpProduct").value || "お店全体"}
期間：${start} 〜 ${end}（${days}日間）
予算：${RP.fmt(RP.num($("#cpBudget").value))}円（この範囲で配分）
売上目標：${RP.num($("#cpTarget").value) ? RP.fmt(RP.num($("#cpTarget").value)) + "円" : "指定なし（妥当な目標を提案）"}
使えるチャネル：${chs.join("、") || "おまかせ"}
期間中の季節要素：${months.map(m => m + "月：" + RP.monthSeason(m).join("・")).join(" ／ ")}
条件・アイデア：${$("#cpNotes").value.trim() || "特になし"}
直近のKPI：${kpis.length ? JSON.stringify(kpis) : "データなし"}

# 出力
次のJSONだけを出力（コードブロック不要）。金額は整数（円）、日付はYYYY-MM-DDで期間内。
{"name":"キャンペーン名","concept":"コンセプト（60字）","catchcopy":"メインキャッチ（20字以内）",
 "target":{"persona":"具体的なペルソナ（年齢・家族・生活）","insight":"そのお客様の本音・購買理由"},
 "offer":"特典・オファー内容（利益を圧迫しすぎないもの）",
 "kpis":[{"name":"KPI名","target":"目標値","how":"計測方法（小さな店でも測れる方法）"}],
 "budget":[{"item":"費目","channel":"チャネル名","amount":金額,"reason":"理由"}],
 "timeline":[{"date":"YYYY-MM-DD","channel":"チャネル名","action":"やること（具体的に）"}],
 "contents":[{"channel":"チャネル名","title":"コンテンツ名","idea":"内容の要点"}],
 "risks":[{"risk":"想定リスク","mitigation":"対策"}],
 "forecast":"売上・効果の見込みと根拠（100字）"}
timelineは準備→告知→本番→フォローの流れで8〜14件。budgetの合計は予算以内。`}, btn);
      j.id = RP.uid(); j.created = new Date().toISOString(); j.period = {start, end};
      const list = RP.store.get("campaigns", []); list.unshift(j); RP.store.set("campaigns", list.slice(0, 50));
      this.render(j); this.renderList();
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  },
  render(j){
    this.current = j;
    const out = $("#cpOut"); out.classList.remove("placeholder");
    const total = (j.budget || []).reduce((a, b) => a + RP.num(b.amount), 0);
    out.innerHTML = `
      <div class="hero"><div class="k">CAMPAIGN — ${esc(j.period ? RP.jpDate(j.period.start) + "〜" + RP.jpDate(j.period.end) : "")}</div>
        <div class="v">${esc(j.name)}</div><div class="s">「${esc(j.catchcopy)}」<br/>${esc(j.concept)}</div></div>
      <div class="sect">ターゲット</div>
      <div class="ai-out"><p><b>ペルソナ：</b>${esc(j.target && j.target.persona)}</p><p><b>インサイト：</b>${esc(j.target && j.target.insight)}</p><p><b>オファー：</b>${esc(j.offer)}</p></div>
      <div class="sect">KPI</div>
      <table class="tbl">${(j.kpis || []).map(k => `<tr><td><b>${esc(k.name)}</b></td><td>${esc(k.target)}</td><td class="muted" style="white-space:normal">${esc(k.how)}</td></tr>`).join("")}</table>
      <div class="sect">予算配分（合計 ${RP.yen(total)}）</div>
      <div id="cpBudgetChart"></div>
      <details class="tbl-toggle"><summary>内訳と理由</summary><table class="tbl">${(j.budget || []).map(b => `<tr><td>${esc(b.item)}</td><td>${esc(b.channel)}</td><td class="num">${RP.yen(RP.num(b.amount))}</td><td class="muted" style="white-space:normal">${esc(b.reason)}</td></tr>`).join("")}</table></details>
      <div class="sect">スケジュール</div>
      <div class="timeline">${(j.timeline || []).map(t => `<div class="tl"><b>${esc(RP.jpDate(t.date))}</b> <span class="tag blue">${esc(t.channel)}</span><br/>${esc(t.action)}</div>`).join("")}</div>
      <div class="row-btns"><button class="btn-sm btn-gold" id="cpToCal">🗓️ スケジュールをカレンダーに追加</button></div>
      <div class="sect">制作するコンテンツ</div>
      ${(j.contents || []).map((c, i) => `<div class="alt"><span><span class="tag">${esc(c.channel)}</span> <b>${esc(c.title)}</b><br/>${esc(c.idea)}</span><button data-ci="${i}">✍️ 作る</button></div>`).join("")}
      <div class="sect">リスクと対策</div>
      <div class="ai-out"><ul>${(j.risks || []).map(r => `<li><b>${esc(r.risk)}</b> → ${esc(r.mitigation)}</li>`).join("")}</ul></div>
      <div class="sect">見込み</div><div class="ai-out"><p>${esc(j.forecast)}</p></div>
      <div class="row-btns"><button class="btn-ghost-sm" id="cpCopy">📋 企画書としてコピー</button></div>`;
    RP.chart.hbars($("#cpBudgetChart"), (j.budget || []).map(b => ({label:b.item + "（" + b.channel + "）", value:RP.num(b.amount)})), {fmt: RP.yen});
    $("#cpToCal").onclick = () => {
      const evs = (j.timeline || []).map(t => ({date:t.date, title:"［" + j.name + "］" + t.action.slice(0, 40), channel:guessCh(t.channel), note:t.action, campaign:j.id}));
      RP.addEvents(evs); RP.toast(evs.length + "件をカレンダーに追加しました", "ok");
    };
    out.querySelectorAll("button[data-ci]").forEach(b => b.onclick = () => {
      const c = j.contents[+b.dataset.ci];
      RP.go("studio", {channel: guessCh(c.channel), notes:`キャンペーン「${j.name}」（${j.catchcopy}）の一環。\nコンテンツ：${c.title}\n内容：${c.idea}\nオファー：${j.offer}`});
    });
    $("#cpCopy").onclick = () => RP.copy(this.toText(j));
  },
  toText(j){
    return [`■ ${j.name}`, `キャッチ：${j.catchcopy}`, `コンセプト：${j.concept}`, `期間：${j.period ? j.period.start + "〜" + j.period.end : ""}`,
      `ペルソナ：${j.target && j.target.persona}`, `インサイト：${j.target && j.target.insight}`, `オファー：${j.offer}`,
      "", "■ KPI", ...(j.kpis || []).map(k => `・${k.name}：${k.target}（${k.how}）`),
      "", "■ 予算", ...(j.budget || []).map(b => `・${b.item}（${b.channel}）${RP.yen(RP.num(b.amount))}`),
      "", "■ スケジュール", ...(j.timeline || []).map(t => `・${t.date} [${t.channel}] ${t.action}`),
      "", "■ リスク", ...(j.risks || []).map(r => `・${r.risk} → ${r.mitigation}`), "", "■ 見込み", j.forecast].join("\n");
  },
  renderList(){
    const list = RP.store.get("campaigns", []);
    $("#cpList").innerHTML = list.length ? list.map(c => `
      <div class="item"><div class="item-head"><span class="item-title">${esc(c.name)}</span><span class="tag">${esc(c.period ? c.period.start + "〜" + c.period.end : "")}</span></div>
      <div class="item-body">${esc(c.catchcopy)}／${esc(c.concept)}</div>
      <div class="item-actions"><button data-act="open" data-id="${c.id}">開く</button><button data-act="del" data-id="${c.id}">削除</button></div></div>`).join("")
      : `<div class="empty">まだキャンペーンはありません</div>`;
  }
};
function guessCh(name){
  const n = String(name || "").toLowerCase();
  const all = EXTRA_CH.concat(RP.CHANNELS);
  const hit = all.find(c => n === c.value || n.includes(c.label.toLowerCase()) || c.label.toLowerCase().includes(n));
  if(hit) return hit.value;
  if(/insta|インスタ/.test(n)) return "instagram";
  if(/line/.test(n)) return "line";
  if(/google|gbp|マップ/.test(n)) return "gbp";
  if(/x|twitter|ツイッター/.test(n)) return "x";
  if(/pop|店頭|試食/.test(n)) return "store";
  if(/チラシ|折込/.test(n)) return "flyer";
  return "store";
}
RP.guessCh = guessCh;

/* ================= CALENDAR ================= */
let cur = new Date(); cur.setDate(1);
const evs = () => RP.store.get("calendar", []);
RP.mod.calendar = {
  init(){
    $("#calLegend").innerHTML = Object.keys(RP.STATUS).map(k => `<span><i style="background:${statusColor(k)}"></i>${RP.STATUS[k].label}</span>`).join("");
    $("#calGrid").addEventListener("click", e => {
      const ev = e.target.closest(".ev"); if(ev){ e.stopPropagation(); this.edit(ev.dataset.id); return; }
      const cell = e.target.closest(".cal-cell"); if(cell) this.edit(null, {date: cell.dataset.date});
    });
    $("#calList").addEventListener("click", e => {
      const b = e.target.closest("button[data-act]"); if(!b) return;
      const it = evs().find(x => x.id === b.dataset.id); if(!it) return;
      if(b.dataset.act === "edit") this.edit(it.id);
      if(b.dataset.act === "make") RP.go("studio", {channel: RP.CHANNELS.some(c => c.value === it.channel) ? it.channel : "instagram", notes: it.title + (it.note ? "\n" + it.note : ""), occasion: it.occasion || ""});
      if(b.dataset.act === "done"){ const all = evs(); all.find(x => x.id === it.id).status = "done"; RP.store.set("calendar", all); this.render(); }
    });
  },
  show(){ this.render(); },
  shift(n){ cur.setMonth(cur.getMonth() + n); this.render(); },
  today(){ cur = new Date(); cur.setDate(1); this.render(); },
  render(){
    const y = cur.getFullYear(), m = cur.getMonth();
    $("#calTitle").textContent = y + "年" + (m+1) + "月";
    const season = RP.monthSeason(m+1);
    $("#calSeason").innerHTML = season.map(s => `<span>🌸 ${esc(s)}</span>`).join("");
    const fixed = {};
    season.forEach(s => { const mm = s.match(/[（(](\d{1,2})\/(\d{1,2})/); if(mm && +mm[1] === m+1) fixed[+mm[2]] = s.replace(/[（(].*$/, ""); });
    const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
    const all = evs(), today = RP.today();
    let html = "日月火水木金土".split("").map(d => `<div class="dow">${d}</div>`).join("");
    for(let i = 0; i < 42; i++){
      const d = new Date(start); d.setDate(start.getDate() + i);
      if(i === 35 && d.getMonth() !== m) break;
      const ds = RP.ymd(d), out = d.getMonth() !== m;
      const items = all.filter(e => e.date === ds);
      html += `<div class="cal-cell${out ? " out" : ""}${ds === today ? " today" : ""}" data-date="${ds}">
        <span class="dn">${d.getDate()}</span>${!out && fixed[d.getDate()] ? `<span class="hol">${esc(fixed[d.getDate()])}</span>` : ""}
        ${items.map(e => `<span class="ev${e.status === "done" ? " done" : ""}" data-id="${e.id}" style="border-left-color:${statusColor(e.status)}" title="${esc(e.title)}">${esc(e.title)}</span>`).join("")}
      </div>`;
    }
    $("#calGrid").innerHTML = html;
    const ym = RP.ym(cur);
    const list = all.filter(e => (e.date || "").startsWith(ym)).sort((a, b) => a.date < b.date ? -1 : 1);
    $("#calList").innerHTML = list.length ? list.map(e => `
      <div class="item"><div class="item-head">
        <b>${esc(RP.jpDate(e.date))}</b><span class="tag ${RP.STATUS[e.status] ? RP.STATUS[e.status].cls : ""}">${esc((RP.STATUS[e.status] || {}).label || e.status)}</span>
        <span class="tag blue">${esc(chLabel(e.channel))}</span><span class="item-title">${esc(e.title)}</span></div>
        ${e.note ? `<div class="item-body">${esc(e.note)}</div>` : ""}
        <div class="item-actions"><button data-act="edit" data-id="${e.id}">編集</button><button data-act="make" data-id="${e.id}">✍️ コンテンツを作る</button>${e.status !== "done" ? `<button data-act="done" data-id="${e.id}">✓ 完了</button>` : ""}</div></div>`).join("")
      : `<div class="empty">この月の予定はまだありません。<br/>日付をタップして追加するか、「1ヶ月分をAIで計画」をお試しください。</div>`;
  },
  edit(id, preset){
    const all = evs();
    const e = id ? all.find(x => x.id === id) : Object.assign({date: RP.today(), title:"", channel:"instagram", status:"idea", note:""}, preset || {});
    if(!e) return;
    const body = RP.modal(id ? "予定を編集" : "予定を追加", `
      <label class="lbl">日付</label><input type="date" id="evDate" class="inp" value="${esc(e.date)}"/>
      <label class="lbl">タイトル</label><input id="evTitle" class="inp" value="${esc(e.title)}" placeholder="例：新米入荷のお知らせ投稿"/>
      <div class="row2">
        <div><label class="lbl">チャネル</label><select id="evCh" class="inp">${chOptions(e.channel)}</select></div>
        <div><label class="lbl">状態</label><select id="evSt" class="inp">${Object.keys(RP.STATUS).map(k => `<option value="${k}" ${k === e.status ? "selected" : ""}>${RP.STATUS[k].label}</option>`).join("")}</select></div>
      </div>
      <label class="lbl">メモ</label><textarea id="evNote" class="inp" rows="4">${esc(e.note || "")}</textarea>
      <div class="row-btns">
        <button class="btn-sm" id="evSave">保存</button>
        ${id ? `<button class="btn-ghost-sm danger" id="evDel">削除</button>` : ""}
      </div>`);
    body.querySelector("#evSave").onclick = () => {
      const rec = Object.assign({}, e, {date:$("#evDate").value, title:$("#evTitle").value.trim() || "（無題）", channel:$("#evCh").value, status:$("#evSt").value, note:$("#evNote").value});
      if(id){ const i = all.findIndex(x => x.id === id); all[i] = rec; RP.store.set("calendar", all); }
      else RP.addEvents([rec]);
      RP.closeModal("genModal"); RP.toast("保存しました", "ok");
      if(!$("#v-calendar").hidden) this.render();
    };
    if(id) body.querySelector("#evDel").onclick = () => { RP.store.set("calendar", all.filter(x => x.id !== id)); RP.closeModal("genModal"); this.render(); };
  },
  async autoPlan(){
    const btn = $("#calAiBtn");
    const y = cur.getFullYear(), m = cur.getMonth() + 1, ym = RP.ym(cur);
    const last = new Date(y, m, 0).getDate();
    const existing = evs().filter(e => (e.date || "").startsWith(ym)).map(e => e.date + " " + e.title);
    RP.busy(btn, true, "計画中");
    try{
      const j = await RP.ai.json({feature:"calendar", maxTokens: 12000, prompt:
`${y}年${m}月（${ym}-01〜${ym}-${last}）の、米穀店の販促・発信カレンダーを作ってください。

# 前提
- 小さな店なので無理のない頻度：Instagram週2〜3回、LINE配信月2〜4回、Googleビジネス週1回、店頭施策は月1〜2回を目安。
- この月の季節要素：${RP.monthSeason(m).join("、")}
- 既存の予定（重複させない）：${existing.join(" / ") || "なし"}
- 曜日を考慮（週末前の金曜にLINE配信など）。祝日・行事の数日前に告知を置く。

# 出力
次のJSON配列だけを出力：
[{"date":"YYYY-MM-DD","channel":"instagram|line|gbp|x|blog|pop|flyer|mail|store","title":"予定のタイトル（30字以内）","product":"関連商品（なければ空）","idea":"投稿・施策の中身（60字）"}]
件数は14〜20件。`}, btn);
      const list = (Array.isArray(j) ? j : j.items || []).filter(x => (x.date || "").startsWith(ym));
      this.preview(list);
    }catch(e){ RP.toast("計画の作成に失敗しました：" + e.message, "err"); }
    finally{ RP.busy(btn, false); }
  },
  preview(list){
    const body = RP.modal("AIが提案した予定（" + list.length + "件）", `
      <p class="hint">追加する予定にチェックを入れてください。</p>
      ${list.map((x, i) => `<label class="alt" style="cursor:pointer"><input type="checkbox" data-i="${i}" checked style="margin-top:4px;accent-color:#c8a96e"/><span><b>${esc(RP.jpDate(x.date))}</b> <span class="tag blue">${esc(chLabel(x.channel))}</span> ${esc(x.title)}<br/><span class="muted small">${esc(x.idea)}</span></span></label>`).join("")}
      <button class="btn-primary" id="pvAdd">選択した予定を追加</button>`);
    body.querySelector("#pvAdd").onclick = () => {
      const pick = $$("input[data-i]", body).filter(c => c.checked).map(c => list[+c.dataset.i]);
      RP.addEvents(pick.map(x => ({date:x.date, title:x.title, channel:x.channel, note:[x.product, x.idea].filter(Boolean).join("｜")})));
      RP.closeModal("genModal"); RP.toast(pick.length + "件を追加しました", "ok"); this.render();
    };
  }
};
function statusColor(s){ return {idea:"var(--line2)", draft:"var(--orange)", scheduled:"var(--blue)", done:"var(--green)"}[s] || "var(--line2)"; }
})();

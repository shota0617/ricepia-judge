/* らいすぴあ ミーティング — development backlog (needs across meetings → GitHub Issues / 開発依頼書) */
(function(){
"use strict";
const {$, $$, esc} = M;

const STATUS = {
  new:{label:"新規", cls:"b-gold"}, review:{label:"検討中", cls:"b-blue"}, dev:{label:"開発中", cls:"b-orange"},
  released:{label:"リリース済み", cls:"b-green"}, rejected:{label:"見送り", cls:""}
};
const PRI_W = {Must:3, Should:2, Could:1}, IMP_W = {"高":3, "中":2, "低":1};
const PRI = {Must:"b-red", Should:"b-orange", Could:"b-blue"};
const higher = (a, b, w) => (w[a] || 0) >= (w[b] || 0) ? a : b;
M.score = b => (PRI_W[b.priority] || 1) * (IMP_W[b.impact] || 1) + (b.mentions.length - 1) * 3;

/** Merge analysed needs into the backlog. Same-purpose needs (backlog_match) gain a mention instead of a duplicate. */
M.addNeeds = function(meeting, needs){
  const list = M.backlog(); let added = 0, merged = 0;
  needs.forEach(n => {
    const mention = {meetingId:meeting.id, meetingTitle:meeting.title, customer:meeting.customer || "", date:meeting.startedAt, evidence:n.evidence};
    const hit = n.backlog_match && list.find(b => b.id === n.backlog_match);
    if(hit){
      if(!hit.mentions.some(x => x.meetingId === meeting.id)) hit.mentions.push(mention);
      hit.priority = higher(n.priority, hit.priority, PRI_W);
      hit.impact = higher(n.impact, hit.impact, IMP_W);
      n.acceptance_criteria.forEach(c => { if(!hit.acceptance_criteria.includes(c)) hit.acceptance_criteria.push(c); });
      if(n.dev_notes && !hit.dev_notes.includes(n.dev_notes)) hit.dev_notes = (hit.dev_notes ? hit.dev_notes + "\n" : "") + n.dev_notes;
      if(hit.status === "rejected") hit.status = "review";
      hit.updated = Date.now();
      merged++;
    } else {
      list.unshift({id:"BL-" + M.uid().slice(-6).toUpperCase(), title:n.title, category:n.category, kind:n.kind, priority:n.priority, impact:n.impact,
        description:n.description, user_story:n.user_story, acceptance_criteria:n.acceptance_criteria.slice(), dev_notes:n.dev_notes || "",
        status:"new", mentions:[mention], created:Date.now(), updated:Date.now(), issueUrl:""});
      added++;
    }
  });
  M.saveBacklog(list);
  return {added, merged};
};

function itemMd(b, opts){
  opts = opts || {};
  const L = [];
  if(opts.heading) L.push("## " + b.title + "（" + b.id + "）", "");
  L.push("## 背景（お客様の声）", b.description, "");
  b.mentions.forEach(m => {
    (m.evidence || []).slice(0, 3).forEach(e => L.push(`> 「${e.quote}」— ${e.speaker}（${m.customer ? m.customer + "・" : ""}${M.dt(m.date)} [${e.time}]）`));
  });
  L.push("", "## ユーザーストーリー", b.user_story, "", "## 受け入れ条件");
  b.acceptance_criteria.forEach(c => L.push("- [ ] " + c));
  if(b.dev_notes) L.push("", "## 開発メモ", b.dev_notes);
  L.push("", "## メタ情報",
    `- 優先度：${b.priority} / 影響：${b.impact} / 種別：${b.category}（${b.kind}ニーズ）`,
    `- 言及：${b.mentions.length}件の会議（${Array.from(new Set(b.mentions.map(m => m.customer || m.meetingTitle))).join("、")}）`,
    `- バックログID：${b.id}（らいすぴあ ミーティングで作成）`);
  return L.join("\n");
}
function issueUrl(b){
  const repo = M.settings().repo.trim();
  let body = itemMd(b);
  if(body.length > 5500) body = body.slice(0, 5500) + "\n\n…（長いため省略）";
  return "https://github.com/" + repo + "/issues/new?title=" + encodeURIComponent("[要望] " + b.title) + "&body=" + encodeURIComponent(body);
}
function backlogMd(items){
  const L = ["# 開発バックログ（お客様の声から）", "", "作成日：" + M.dt(Date.now()), "", "| ID | タイトル | 優先度 | 影響 | 言及 | 状態 |", "|---|---|---|---|---|---|"];
  items.forEach(b => L.push(`| ${b.id} | ${b.title} | ${b.priority} | ${b.impact} | ${b.mentions.length} | ${STATUS[b.status].label} |`));
  items.forEach(b => L.push("", "---", "", "# " + b.title + "（" + b.id + "）", "", itemMd(b)));
  return L.join("\n");
}

let filter = "active", query = "";
function visible(){
  return M.backlog()
    .filter(b => filter === "all" ? true : filter === "active" ? (b.status === "released" ? pendingNotices(b) > 0 : b.status !== "rejected") : b.status === filter)
    .filter(b => !query || (b.title + b.description + b.user_story + b.mentions.map(m => m.customer).join("")).toLowerCase().includes(query))
    .sort((a, b) => M.score(b) - M.score(a) || b.updated - a.updated);
}
function render(){
  const all = M.backlog(), items = visible();
  const cnt = k => all.filter(b => b.status === k).length;
  $("#blStats").innerHTML = Object.keys(STATUS).map(k => `<div class="kpi"><div class="k">${STATUS[k].label}</div><div class="v">${cnt(k)}</div></div>`).join("") +
    `<div class="kpi"><div class="k">複数のお客様から</div><div class="v" style="color:var(--orange)">${all.filter(b => new Set(b.mentions.map(m => m.customer || m.meetingId)).size > 1).length}</div></div>`;
  const el = $("#blList");
  if(!items.length){
    el.innerHTML = `<div class="empty">${all.length ? "条件に合う項目はありません。" : "まだ項目がありません。<br/>「要望分析」でAIが抽出したニーズを追加すると、ここに溜まっていきます。<br/>同じ要望が別のお客様からも出ると、自動でまとまり、優先度が上がります。"}</div>`;
    return;
  }
  el.innerHTML = items.map(b => {
    const custs = Array.from(new Set(b.mentions.map(m => m.customer).filter(Boolean)));
    return `<div class="bl${["released","rejected"].includes(b.status) ? " done" : ""}" data-id="${esc(b.id)}">
      <div class="score"><input type="checkbox" class="blPick" data-id="${esc(b.id)}" aria-label="選択"/><b>${M.score(b)}</b>点</div>
      <div><div class="bl-h"><b>${esc(b.title)}</b><span class="badge ${PRI[b.priority]}">${esc(b.priority)}</span><span class="badge ${STATUS[b.status].cls}">${STATUS[b.status].label}</span>
        <span class="tag">${esc(b.category)}</span><span class="tag">${esc(b.kind)}</span><span class="tag">影響 ${esc(b.impact)}</span>
        <span class="tag" title="${esc(custs.join("、"))}">🗣 ${b.mentions.length}件の会議${custs.length ? "・" + esc(custs.slice(0, 3).join("、")) + (custs.length > 3 ? " ほか" : "") : ""}</span>
        <span class="muted small">${esc(b.id)}</span></div></div>
      <div class="bl-body">${esc(b.description)}
        <details style="margin-top:6px;"><summary>詳細（ユーザーストーリー・受け入れ条件・お客様の声）</summary>
          <div class="lbl" style="font-size:10px;color:var(--muted);font-weight:700;margin-top:6px;">ユーザーストーリー</div><div>${esc(b.user_story)}</div>
          <div class="lbl" style="font-size:10px;color:var(--muted);font-weight:700;margin-top:6px;">受け入れ条件</div><ul class="ac">${b.acceptance_criteria.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
          ${b.dev_notes ? `<div class="lbl" style="font-size:10px;color:var(--muted);font-weight:700;margin-top:6px;">開発メモ</div><div style="white-space:pre-wrap;">${esc(b.dev_notes)}</div>` : ""}
          <div class="lbl" style="font-size:10px;color:var(--muted);font-weight:700;margin-top:6px;">お客様の声</div>
          ${b.mentions.map(m => (m.evidence || []).map(e => `<div class="quote">「${esc(e.quote)}」<span class="src">${esc(e.speaker)} · ${esc(m.customer || m.meetingTitle)} · ${esc(M.dt(m.date))} [${esc(e.time)}]</span></div>`).join("")).join("")}
        </details></div>
      <div class="bl-acts">
        <select class="blStatus" data-id="${esc(b.id)}" aria-label="状態">${Object.keys(STATUS).map(k => `<option value="${k}"${k === b.status ? " selected" : ""}>${STATUS[k].label}</option>`).join("")}</select>
        <button class="btn btn-dark btn-sm" data-act="issue" data-id="${esc(b.id)}">🐙 GitHub Issueを作成</button>
        ${b.issueUrl ? `<a class="small" href="${esc(b.issueUrl)}" target="_blank" rel="noopener">Issueを開く</a>` : `<button class="btn btn-ghost btn-sm" data-act="link" data-id="${esc(b.id)}">🔗 Issue URLを記録</button>`}
        ${b.status === "released" ? `<button class="btn btn-gold btn-sm" data-act="notice" data-id="${esc(b.id)}">📣 お客様へのお知らせ${pendingNotices(b) ? "（未連絡 " + pendingNotices(b) + "）" : "（連絡済み）"}</button>` : ""}
        <button class="btn btn-ghost btn-sm" data-act="md" data-id="${esc(b.id)}">📋 Markdown</button>
        <button class="btn btn-ghost btn-sm" data-act="del" data-id="${esc(b.id)}" title="削除">🗑</button>
      </div></div>`;
  }).join("");
}
function update(id, patch){
  const list = M.backlog(), b = list.find(x => x.id === id); if(!b) return;
  Object.assign(b, patch, {updated:Date.now()});
  M.saveBacklog(list); render(); M.badges();
}
function picked(){
  const ids = $$(".blPick").filter(c => c.checked).map(c => c.dataset.id);
  const list = M.backlog();
  return ids.length ? list.filter(b => ids.includes(b.id)) : [];
}

/* ================= release notices: tell each customer their request shipped ================= */
function noticeGroups(b){
  const g = new Map();
  b.mentions.slice().sort((x, y) => x.date - y.date).forEach(m => {
    const key = m.customer || m.meetingTitle;
    if(!g.has(key)) g.set(key, {key, customer:m.customer, date:m.date, quote:(m.evidence && m.evidence[0] && m.evidence[0].quote) || ""});
  });
  return Array.from(g.values());
}
function pendingNotices(b){ const n = b.notified || {}; return noticeGroups(b).filter(x => !n[x.key]).length; }
function noticeText(b, g){
  const d = new Date(g.date), L = [];
  L.push((g.customer || "お客様") + " 様", "", "いつもありがとうございます。近藤米穀店 らいすぴあです。");
  const q = g.quote.length > 60 ? g.quote.slice(0, 58) + "…" : g.quote;
  L.push(`${d.getMonth()+1}月${d.getDate()}日のお打ち合わせで${q ? "「" + q + "」と" : ""}お聞かせいただいたご要望について、「${b.title}」として対応いたしました。`);
  if(b.acceptance_criteria.length){ L.push("", "【できるようになったこと】"); b.acceptance_criteria.slice(0, 5).forEach(c => L.push("・" + c)); }
  L.push("", "ぜひお試しいただき、使い勝手などお気づきの点があればお聞かせください。", "今後ともよろしくお願いいたします。");
  return L.join("\n");
}
function openNotices(b){
  const n = b.notified || {};
  $("#relModal").dataset.id = b.id;
  $("#relTitle").textContent = b.title;
  $("#relList").innerHTML = noticeGroups(b).map(g => `<div data-key="${esc(g.key)}" style="border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:10px;">
      <div class="row"><b style="font-size:13px;">${esc(g.customer || g.key)}</b>${n[g.key] ? `<span class="badge b-green">連絡済み ${esc(M.dt(n[g.key]))}</span>` : '<span class="badge b-gold">未連絡</span>'}</div>
      <textarea class="inp" rows="9" style="margin-top:6px;font-size:12px;">${esc(noticeText(b, g))}</textarea>
      <div class="row" style="margin-top:6px;"><button class="btn btn-ghost btn-sm" data-rel="copy">📋 コピー</button>
        <button class="btn btn-sm" data-rel="line" style="background:#06c755;color:#fff;">LINEで送る</button><span class="spacer"></span>
        <button class="btn ${n[g.key] ? "btn-ghost" : "btn-dark"} btn-sm" data-rel="done">${n[g.key] ? "未連絡に戻す" : "✓ 連絡済みにする"}</button></div></div>`).join("");
  M.modal("relModal", true);
}

/* ================= customer voice report across all meetings ================= */
const REPORT_SYSTEM = `あなたは顧客の声（VoC）分析とプロダクト戦略の専門家です。近藤米穀店「らいすぴあ」がお客様との会議から集めたニーズのデータをもとに、経営者と開発チームが次に何をすべきか判断できるレポートをMarkdownで作成します。

守ること：
- 渡されたデータだけを根拠にする。件数・割合は「集計」の数字と一致させ、推測で数字を作らない
- 会議数が少ない場合は、傾向の確からしさが低いことを明記する
- 1社だけの強い要望と、複数のお客様に共通する要望を区別する
- バックログIDがある項目はIDを併記する

構成：
## 1. まとめ（3行）
## 2. よく出る困りごと・ニーズ（頻度順。何社・何回の会議で出たか）
## 3. お客様のタイプ別の違い
## 4. 潜在ニーズから見える新しい機会
## 5. 開発ロードマップ案（今月／3ヶ月以内／その先。理由と期待効果つき）
## 6. 見送り・保留にすべきもの、作る前に確かめるべきもの
## 7. 次のヒアリングで確かめる仮説と質問（質問文の例つき）`;
function reportData(){
  const ms = M.meetings().filter(m => m.analysis), bl = M.backlog();
  const count = arr => arr.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {});
  const needs = ms.flatMap(m => m.analysis.needs);
  const customers = new Set(ms.map(m => m.customer || m.title));
  const agg = [
    "分析済みの会議：" + ms.length + "件／お客様：" + customers.size + "社",
    "ニーズ総数：" + needs.length + "件",
    "カテゴリ別：" + Object.entries(count(needs.map(n => n.category))).map(([k, v]) => k + " " + v).join("、"),
    "明示/潜在：" + Object.entries(count(needs.map(n => n.kind))).map(([k, v]) => k + " " + v).join("、"),
    "優先度：" + Object.entries(count(needs.map(n => n.priority))).map(([k, v]) => k + " " + v).join("、"),
    "お客様の温度感：" + Object.entries(count(ms.map(m => m.analysis.sentiment))).map(([k, v]) => k + " " + v).join("、")
  ].join("\n");
  const meet = ms.map(m => [
    `## ${M.dt(m.startedAt)} ${m.title}（お客様：${m.customer || "不明"}／温度感：${m.analysis.sentiment}）`,
    "お客様像：" + m.analysis.customer_profile.who + "／" + m.analysis.customer_profile.situation,
    "要約：" + m.analysis.summary,
    "ニーズ：" + m.analysis.needs.map(n => `${n.title}（${n.priority}・${n.kind}・${n.category}）`).join("／"),
    m.analysis.pain_points.length ? "困りごと：" + m.analysis.pain_points.join("／") : ""
  ].filter(Boolean).join("\n")).join("\n\n");
  const back = bl.map(b => `${b.id}｜${b.title}｜${STATUS[b.status].label}｜${b.priority}・影響${b.impact}｜会議${b.mentions.length}件｜${Array.from(new Set(b.mentions.map(m => m.customer).filter(Boolean))).join("、") || "—"}｜スコア${M.score(b)}`).join("\n");
  return {ms, text:"# 集計\n" + agg + "\n\n# 会議ごとの分析結果\n" + meet + "\n\n# 開発バックログ（ID｜タイトル｜状態｜優先度・影響｜言及｜お客様｜スコア）\n" + (back || "（なし）")};
}
function showReport(){
  const r = M.store.get("report", null), out = $("#rpOut");
  $("#rpActs").hidden = !r;
  if(!r){ out.innerHTML = '<div class="muted small" style="line-height:1.8;">分析済みの会議すべてを横断して、よく出る困りごと・お客様のタイプ別の違い・新しい機会・開発ロードマップ案をAIがまとめます。会議が3件以上たまってからがおすすめです。</div>'; return; }
  out.innerHTML = '<div class="muted small">' + esc(M.dt(r.at)) + " 作成（会議 " + r.meetings + "件）</div>" + M.md(r.md);
  out.dataset.md = "# お客様の声レポート（" + M.dt(r.at) + "）\n\n" + r.md;
}
async function makeReport(){
  const d = reportData();
  if(!d.ms.length){ M.toast("分析済みの会議がありません。先に「要望分析」で会議を分析してください", "err"); return; }
  const out = $("#rpOut"), btn = $("#rpBtn");
  out.innerHTML = '<span class="cursor"></span>';
  M.busy(btn, true, "作成中…");
  try{
    const s = M.settings();
    let raf = 0;
    const text = await M.ai({system:REPORT_SYSTEM, effort:"high", maxTokens:16000,
      prompt:(s.product ? "# 開発対象・前提\n" + s.product + "\n\n" : "") + d.text + "\n\n上のデータから、お客様の声レポートを作成してください。",
      onText: t => { if(raf) return; raf = requestAnimationFrame(() => { raf = 0; out.innerHTML = M.md(t) + '<span class="cursor"></span>'; }); }});
    if(raf) cancelAnimationFrame(raf);
    M.store.set("report", {at:Date.now(), meetings:d.ms.length, md:text});
    showReport();
  }catch(e){ M.errorBox(out, e); }
  finally{ M.busy(btn, false); }
}

const SPEC_SYSTEM = `あなたは要件定義に強いテックリードです。お客様との会議から抽出・整理された「開発バックログ項目」をもとに、開発チーム（またはAIコーディングエージェント）がそのまま着手できる開発依頼書をMarkdownで作成します。

守ること：
- 渡された情報（お客様の声・受け入れ条件・開発メモ・前提）だけを根拠にする。書かれていない仕様・数値・外部サービス名を作らず、決める必要がある点は【要確認】と明記して「未確定事項」に集める
- お客様の言葉（引用）を背景に残し、なぜ作るのかが伝わるようにする
- 小さく作って早く確かめる順序（MVP → 次の段階）を提案する
- 個人情報・決済・認証が関わる場合は非機能要件で必ず触れる

構成：
## 1. 背景と目的
## 2. 利用者と利用シーン
## 3. スコープ（今回やること／やらないこと）
## 4. 機能要件（項目ごとに：概要・ユーザーストーリー・画面と操作の流れ・扱うデータ・受け入れ条件。バックログIDを併記）
## 5. 非機能要件
## 6. 優先順位とリリース計画（MVP → 次の段階）
## 7. 未確定事項・お客様への確認事項
## 8. テスト観点
## 9. AIコーディングエージェント（Claude Code）への依頼文（\`\`\` で囲んだ、そのまま貼れる日本語の依頼文。前提・作るもの・受け入れ条件・注意点を含める）`;

async function makeSpec(){
  let items = picked();
  if(!items.length) items = visible().filter(b => !["released","rejected"].includes(b.status)).slice(0, 8);
  if(!items.length){ M.toast("対象の項目がありません", "err"); return; }
  const out = $("#specOut"), btn = $("#blSpec");
  $("#specCard").hidden = false;
  out.innerHTML = '<span class="cursor"></span>';
  M.busy(btn, true, "作成中…");
  try{
    const s = M.settings();
    const prompt = (s.product ? "# 開発対象・前提\n" + s.product + "\n\n" : "") +
      "# 開発バックログ項目（" + items.length + "件・優先度順）\n\n" + items.map(b => "---\n# " + b.title + "（" + b.id + "）\n" + itemMd(b)).join("\n\n") +
      "\n\n上の項目をまとめて、開発依頼書を作成してください。";
    let raf = 0;
    const text = await M.ai({system:SPEC_SYSTEM, prompt, effort:"high", maxTokens:24000, onText: t => {
      if(raf) return; raf = requestAnimationFrame(() => { raf = 0; out.innerHTML = M.md(t) + '<span class="cursor"></span>'; });
    }});
    if(raf) cancelAnimationFrame(raf);
    out.innerHTML = M.md(text);
    out.dataset.md = "# 開発依頼書（" + M.ymd(Date.now()) + "）\n\n対象：" + items.map(b => b.id + " " + b.title).join(" / ") + "\n\n" + text;
    $("#specCard").scrollIntoView({behavior:"smooth", block:"start"});
  }catch(e){ M.errorBox(out, e); }
  finally{ M.busy(btn, false); }
}

M.mod.backlog = {
  init(){
    $("#blRepo").value = M.settings().repo || "";
    $("#blRepo").addEventListener("change", e => M.saveSettings({repo:e.target.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "")}));
    $("#blFilter").onchange = e => { filter = e.target.value; render(); };
    $("#blSearch").addEventListener("input", e => { query = e.target.value.trim().toLowerCase(); render(); });
    $("#blList").addEventListener("change", e => {
      if(!e.target.classList.contains("blStatus")) return;
      update(e.target.dataset.id, {status:e.target.value});
      // closing the loop: tell the customers who asked for it
      if(e.target.value === "released"){ const b = M.backlog().find(x => x.id === e.target.dataset.id); if(b && pendingNotices(b)) openNotices(b); }
    });
    $("#relList").addEventListener("click", e => {
      const btn = e.target.closest("button[data-rel]"); if(!btn) return;
      const box = btn.closest("[data-key]"), key = box.dataset.key, text = $("textarea", box).value;
      if(btn.dataset.rel === "copy") M.copy(text, "お知らせ文をコピーしました");
      if(btn.dataset.rel === "line") window.open("https://line.me/R/msg/text/?" + encodeURIComponent(text), "_blank", "noopener");
      if(btn.dataset.rel === "done"){
        const list = M.backlog(), b = list.find(x => x.id === $("#relModal").dataset.id); if(!b) return;
        b.notified = b.notified || {};
        if(b.notified[key]) delete b.notified[key]; else b.notified[key] = Date.now();
        M.saveBacklog(list); openNotices(b); render();
      }
    });
    $("#rpBtn").onclick = makeReport;
    $("#rpCopy").onclick = () => M.copy(($("#rpOut").dataset.md) || "", "レポートをコピーしました");
    $("#rpDl").onclick = () => M.download("お客様の声レポート_" + M.ymd(Date.now()) + ".md", $("#rpOut").dataset.md || "", "text/markdown;charset=utf-8");
    $("#blList").addEventListener("click", e => {
      const b = e.target.closest("button[data-act]"); if(!b) return;
      const item = M.backlog().find(x => x.id === b.dataset.id); if(!item) return;
      if(b.dataset.act === "issue"){
        const repo = M.settings().repo;
        if(!/^[\w.-]+\/[\w.-]+$/.test(repo || "")){ M.toast("先に上の「GitHubリポジトリ」に owner/repo を入力してください", "err"); $("#blRepo").focus(); return; }
        window.open(issueUrl(item), "_blank", "noopener");
        if(item.status === "new") update(item.id, {status:"review"});
        M.toast("GitHubの新規Issue画面を開きました。内容を確認して「Submit」してください");
      }
      if(b.dataset.act === "link"){
        const u = prompt("作成したIssueのURLを貼り付けてください", "https://github.com/" + (M.settings().repo || ""));
        if(u && /^https:\/\/github\.com\//.test(u.trim())) update(item.id, {issueUrl:u.trim()});
      }
      if(b.dataset.act === "notice") openNotices(item);
      if(b.dataset.act === "md") M.copy("# " + item.title + "\n\n" + itemMd(item), "Markdownをコピーしました");
      if(b.dataset.act === "del" && confirm("「" + item.title + "」をバックログから削除します。よろしいですか？")){ M.saveBacklog(M.backlog().filter(x => x.id !== item.id)); render(); M.badges(); }
    });
    $("#blSpec").onclick = makeSpec;
    $("#blCsv").onclick = () => {
      const rows = [["ID","タイトル","状態","優先度","影響","種別","明示/潜在","言及数","お客様","概要","ユーザーストーリー","受け入れ条件","開発メモ","Issue","スコア"]];
      visible().forEach(b => rows.push([b.id, b.title, STATUS[b.status].label, b.priority, b.impact, b.category, b.kind, b.mentions.length,
        Array.from(new Set(b.mentions.map(m => m.customer).filter(Boolean))).join(" / "), b.description, b.user_story, b.acceptance_criteria.join(" / "), b.dev_notes, b.issueUrl, M.score(b)]));
      M.download("backlog-" + M.ymd(Date.now()) + ".csv", M.csv(rows), "text/csv;charset=utf-8");
    };
    $("#blMd").onclick = () => { const it = picked().length ? picked() : visible(); M.download("backlog-" + M.ymd(Date.now()) + ".md", backlogMd(it), "text/markdown;charset=utf-8"); };
    $("#specCopy").onclick = () => M.copy($("#specOut").dataset.md || "", "開発依頼書をコピーしました");
    $("#specDl").onclick = () => M.download("開発依頼書_" + M.ymd(Date.now()) + ".md", $("#specOut").dataset.md || "", "text/markdown;charset=utf-8");
  },
  show(){ render(); showReport(); }
};
})();

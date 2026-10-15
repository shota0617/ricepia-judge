/* らいすぴあ ミーティング — needs analysis (transcript → customer needs → dev-ready items), import, history */
(function(){
"use strict";
const {$, $$, esc} = M;

const NEED = {type:"object", additionalProperties:false,
  required:["title","category","kind","description","priority","impact","confidence","evidence","user_story","acceptance_criteria","dev_notes","backlog_match"],
  properties:{
    title:{type:"string"},
    category:{type:"string", enum:["新機能","改善","不具合・不満","業務フロー","価格・契約","サポート・運用","その他"]},
    kind:{type:"string", enum:["明示","潜在"]},
    description:{type:"string"},
    priority:{type:"string", enum:["Must","Should","Could"]},
    impact:{type:"string", enum:["高","中","低"]},
    confidence:{type:"string", enum:["高","中","低"]},
    evidence:{type:"array", items:{type:"object", additionalProperties:false, required:["time","speaker","quote"], properties:{time:{type:"string"}, speaker:{type:"string"}, quote:{type:"string"}}}},
    user_story:{type:"string"},
    acceptance_criteria:{type:"array", items:{type:"string"}},
    dev_notes:{type:"string"},
    backlog_match:{type:"string"}
  }};
const SCHEMA = {type:"object", additionalProperties:false,
  required:["summary","customer_profile","sentiment","needs","pain_points","decisions","open_questions","next_actions","risks"],
  properties:{
    summary:{type:"string"},
    customer_profile:{type:"object", additionalProperties:false, required:["who","situation","goals"], properties:{who:{type:"string"}, situation:{type:"string"}, goals:{type:"array", items:{type:"string"}}}},
    sentiment:{type:"string", enum:["前向き","中立","懸念あり"]},
    needs:{type:"array", items:NEED},
    pain_points:{type:"array", items:{type:"string"}},
    decisions:{type:"array", items:{type:"string"}},
    open_questions:{type:"array", items:{type:"object", additionalProperties:false, required:["question","reason"], properties:{question:{type:"string"}, reason:{type:"string"}}}},
    next_actions:{type:"array", items:{type:"object", additionalProperties:false, required:["owner","action","due"], properties:{owner:{type:"string", enum:["当社","お客様","両方"]}, action:{type:"string"}, due:{type:"string"}}}},
    risks:{type:"array", items:{type:"string"}}
  }};

const SYSTEM = `あなたは近藤米穀店「らいすぴあ」のプロダクトマネージャー兼業務アナリストです。お客様とのミーティングの文字起こしから、お客様のニーズを漏れなく正確に抽出し、開発チームがそのまま着手できる形に整理します。

【読み取り方】
- 文字起こしは音声認識によるもので、誤変換・句読点の欠落・話者の取り違えがあり得る。文脈から自然に解釈し、確信が持てない点は confidence を下げ、open_questions に確認事項として挙げる
- （お客様）と付いた話者の発言を中心に読む。当社側の提案にお客様が同意しただけのものは、反応の強さで priority を判断する
- 明示ニーズ：お客様がはっきり求めたこと。潜在ニーズ：困りごと・手作業の回避策・繰り返される不満・「〜できたらいいのに」から読み取れる本当の目的。潜在ニーズは根拠となる発言を必ず示す
- 要望された手段（How）の裏にある目的（Why）を description に書く。解決策を一つに決めつけない
- evidence.quote は文字起こしからの抜粋（要約・改変しない。長い場合は「…」で省略可）。time はその行の [mm:ss]、speaker は話者名
- 文字起こしにない数値・価格・期限・固有名詞を作らない。不明な点は open_questions へ
- priority：Must＝ないと使ってもらえない／契約・継続に関わる、Should＝強い要望だが代替手段がある、Could＝あると嬉しい
- impact：お客様の業務・売上・手間への影響の大きさ
- user_story は「〇〇として、△△したい。なぜなら□□だから。」の形
- acceptance_criteria は開発者とお客様の双方が確かめられる、具体的で検証可能な条件を3〜6個
- dev_notes：実装上の論点、既存の仕組みとの関係、データ・権限・外部連携、見積りに影響する不確定要素
- 既存バックログと同じ目的のニーズは backlog_match にそのIDを入れる（言い回しが違っても目的が同じなら一致）。なければ空文字
- next_actions.due は会話に出た期限のみ。なければ空文字
- 雑談・挨拶はニーズにしない。同じ趣旨のニーズは1つにまとめる
- すべて日本語で書く`;

let current = null; // meeting being shown

/* ---------- helpers shared by analysis / history ---------- */
function roleOf(m, l){
  if(l.role) return l.role;
  const ours = (M.settings().ourSide || "").split(/[,、，\s]+/).map(s => s.trim()).filter(Boolean);
  if(!ours.length) return "";
  return ours.some(n => l.who.includes(n)) ? "当社" : "お客様";
}
function transcriptForAi(m){
  const t = m.lines.map(l => { const r = roleOf(m, l); return `[${M.lineTime(m, l)}] ${l.who}${r === "お客様" ? "（お客様）" : r ? "（当社）" : ""}: ${l.text}`; }).join("\n");
  const MAX = 300000;
  return t.length > MAX ? t.slice(0, MAX) + "\n（※ 長いため以降は省略）" : t;
}
M.minutesMd = function(m){
  const a = m.analysis, L = [];
  L.push("# " + m.title, "");
  L.push("- 日時：" + M.dt(m.startedAt) + "（" + M.dur(m) + "）");
  if(m.customer) L.push("- お客様：" + m.customer);
  const ppl = Object.values(m.participants || {}).map(p => p.name + (p.role ? "（" + p.role + "）" : ""));
  if(ppl.length) L.push("- 参加者：" + ppl.join("、"));
  L.push("");
  if(a){
    L.push("## 要約", a.summary, "");
    L.push("## お客様像", "- " + a.customer_profile.who, "- 状況：" + a.customer_profile.situation);
    a.customer_profile.goals.forEach(g => L.push("- 目標：" + g));
    L.push("", "## ニーズ（" + a.needs.length + "件）");
    a.needs.forEach((n, i) => {
      L.push("", `### ${i+1}. ${n.title}（${n.priority}・${n.kind}・${n.category}）`, n.description);
      n.evidence.forEach(e => L.push(`> 「${e.quote}」— ${e.speaker} [${e.time}]`));
      L.push("", "- ユーザーストーリー：" + n.user_story, "- 受け入れ条件：");
      n.acceptance_criteria.forEach(c => L.push("  - [ ] " + c));
      if(n.dev_notes) L.push("- 開発メモ：" + n.dev_notes);
    });
    if(a.pain_points.length){ L.push("", "## 困りごと"); a.pain_points.forEach(x => L.push("- " + x)); }
    if(a.decisions.length){ L.push("", "## 決まったこと"); a.decisions.forEach(x => L.push("- " + x)); }
    if(a.open_questions.length){ L.push("", "## 確認事項"); a.open_questions.forEach(q => L.push("- " + q.question + "（" + q.reason + "）")); }
    if(a.next_actions.length){ L.push("", "## 次のアクション", "| 担当 | 内容 | 期限 |", "|---|---|---|"); a.next_actions.forEach(x => L.push(`| ${x.owner} | ${x.action} | ${x.due || "—"} |`)); }
    if(a.risks.length){ L.push("", "## リスク・懸念"); a.risks.forEach(x => L.push("- " + x)); }
    L.push("");
  }
  if(m.notes){ L.push("## 手書きメモ", m.notes, ""); }
  if(m.chat && m.chat.length){ L.push("## チャット"); m.chat.forEach(c => L.push(`- [${M.lineTime(m, c)}] ${c.who}: ${c.text}`)); L.push(""); }
  L.push("## 文字起こし", "```", M.transcriptText(m), "```");
  return L.join("\n");
};
function followupMail(m){
  const a = m.analysis, L = [];
  L.push((m.customer || "お客様") + " 様", "", "本日はお時間をいただき、ありがとうございました。", "お打ち合わせの内容を以下のとおり整理しました。認識違いがあればご指摘ください。", "");
  L.push("■ いただいたご要望");
  a.needs.forEach((n, i) => L.push(`${i+1}. ${n.title}`));
  if(a.decisions.length){ L.push("", "■ 決まったこと"); a.decisions.forEach(x => L.push("・" + x)); }
  if(a.open_questions.length){ L.push("", "■ ご確認いただきたいこと"); a.open_questions.forEach((q, i) => L.push(`${i+1}. ${q.question}`)); }
  const acts = a.next_actions.filter(x => x.owner !== "当社");
  const ours = a.next_actions.filter(x => x.owner !== "お客様");
  if(ours.length){ L.push("", "■ 当社で進めること"); ours.forEach(x => L.push("・" + x.action + (x.due ? "（" + x.due + "）" : ""))); }
  if(acts.length){ L.push("", "■ お願いしたいこと"); acts.forEach(x => L.push("・" + x.action + (x.due ? "（" + x.due + "）" : ""))); }
  L.push("", "引き続きよろしくお願いいたします。", "", "近藤米穀店 らいすぴあ");
  return L.join("\n");
}

/* ---------- import external transcripts (Zoom .vtt / .srt / .txt) ---------- */
function parseTranscript(text, base){
  text = String(text || "").replace(/^﻿/, "").replace(/\r/g, "");
  const lines = [];
  const toMs = s => { const p = s.replace(",", ".").split(":").map(Number); while(p.length < 3) p.unshift(0); return ((p[0]*60 + p[1])*60 + p[2]) * 1000; };
  const push = (ms, raw) => {
    raw = raw.trim(); if(!raw) return;
    let who = "話者", t = raw, m;
    if((m = raw.match(/^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/))){ who = m[1].trim(); t = m[2]; }
    else if((m = raw.match(/^([^:：「」\n]{1,24})[:：]\s*([\s\S]+)$/))){ who = m[1].trim(); t = m[2]; }
    t = t.replace(/<[^>]+>/g, "").trim();
    if(!t) return;
    const last = lines[lines.length - 1];
    if(last && last.who === who && ms - (last.at - base) < 4000 && last.text.length < 300){ last.text += t; return; }
    lines.push({id:"im-" + lines.length + "-" + M.uid(), at:base + ms, who, role:"", pid:"", text:t});
  };
  if(/-->/.test(text)){
    // WebVTT / SRT cues
    const blocks = text.split(/\n{2,}/);
    blocks.forEach(b => {
      const ls = b.split("\n"), i = ls.findIndex(l => l.includes("-->"));
      if(i < 0) return;
      const ms = toMs(ls[i].split("-->")[0].trim());
      push(ms, ls.slice(i + 1).join(" "));
    });
  } else {
    // plain text: "[00:01:02] 名前: 発言" / "名前 00:01:02\n発言" / "名前: 発言"
    let ms = 0, pending = null;
    text.split("\n").forEach(l => {
      const s = l.trim(); if(!s) return;
      let m;
      if((m = s.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.+)$/))){ ms = toMs(m[1]); push(ms, m[2]); pending = null; return; }
      if((m = s.match(/^(.{1,24}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/))){ ms = toMs(m[2]); pending = m[1]; return; }
      if(pending){ push(ms, pending + ": " + s); return; }
      push(ms, s); ms += 5000;
    });
  }
  return lines;
}
function importNow(){
  const text = $("#imText").value.trim();
  if(!text){ M.toast("文字起こしを貼り付けるか、ファイルを選んでください", "err"); return; }
  const d = $("#imDate").value ? new Date($("#imDate").value).getTime() : Date.now();
  const lines = parseTranscript(text, d);
  if(!lines.length){ M.toast("文字起こしを読み取れませんでした", "err"); return; }
  const rec = {id:"m_im_" + M.uid(), code:"", source:"import", role:"host",
    title: $("#imTitle").value.trim() || "取り込んだ会議 " + M.dt(d), customer: $("#imCustomer").value.trim(),
    startedAt:d, endedAt:lines[lines.length-1].at, participants:{}, lines, chat:[], notes:"", analysis:null};
  M.speakers(rec).forEach((n, i) => rec.participants["s" + i] = {name:n, role:""});
  M.saveMeeting(rec);
  $("#imText").value = ""; $("#imTitle").value = ""; $("#imCustomer").value = "";
  $("#importCard").hidden = true;
  M.toast(lines.length + "件の発言を取り込みました", "ok");
  M.go("analyze", {meetingId:rec.id});
}

/* ---------- rendering ---------- */
const PRI = {Must:"b-red", Should:"b-orange", Could:"b-blue"};
function renderSelect(sel){
  const list = M.meetings();
  $("#anSelect").innerHTML = list.length ? list.map(m => `<option value="${esc(m.id)}">${esc(M.dt(m.startedAt))}　${esc(m.title)}${m.customer ? "（" + esc(m.customer) + "）" : ""}${m.analysis ? "　✓分析済み" : ""}</option>`).join("") : '<option value="">（会議の記録がありません）</option>';
  if(sel) $("#anSelect").value = sel;
  current = M.meeting($("#anSelect").value);
}
function renderMeta(){
  const m = current, box = $("#anMeta");
  $("#anBtn").disabled = !m || (!m.lines.length && !m.notes);
  if(!m){ box.innerHTML = '<div class="empty">「ミーティング」で会議をすると、文字起こしがここに届きます。<br/>Zoomなどの文字起こし（.vtt / .txt）を取り込むか、サンプルで試すこともできます。</div>'; $("#anOut").innerHTML = ""; return; }
  const spk = M.speakers(m);
  const roles = spk.map(n => { const l = m.lines.find(x => x.who === n); const r = roleOf(m, l); return `<span class="tag">${esc(n)}${r ? "・" + r : ""}</span>`; }).join("");
  box.innerHTML = `<div class="kpis">
      <div class="kpi"><div class="k">日時</div><div class="v" style="font-size:13px;">${esc(M.dt(m.startedAt))}</div></div>
      <div class="kpi"><div class="k">長さ</div><div class="v">${esc(M.dur(m))}</div></div>
      <div class="kpi"><div class="k">発言</div><div class="v">${m.lines.length}</div></div>
      <div class="kpi"><div class="k">話者</div><div class="v">${spk.length}</div></div>
    </div>
    <div class="small mid" style="margin-bottom:6px;">話者：${roles || "—"}</div>
    <details><summary>文字起こしを見る（${m.lines.length}件）</summary>
      <div style="max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:8px 12px;background:var(--soft);">
        ${m.lines.map(l => `<div class="tline"><span class="who ${M.colorOf(l.who, spk)}">${esc(l.who)}</span><span class="tm">${M.lineTime(m, l)}</span><br/>${esc(l.text)}</div>`).join("") || '<div class="muted small">発言なし</div>'}
        ${m.notes ? `<div class="memo-h">手書きメモ</div><div class="small" style="white-space:pre-wrap;">${esc(m.notes)}</div>` : ""}
      </div></details>`;
  renderResult();
}
function renderResult(){
  const m = current, out = $("#anOut");
  if(!m || !m.analysis){ out.innerHTML = ""; return; }
  const a = m.analysis, bl = M.backlog();
  const sc = {"前向き":"b-green","中立":"","懸念あり":"b-red"}[a.sentiment] || "";
  const blTitle = id => (bl.find(b => b.id === id) || {}).title;
  let h = `<div class="card" style="margin-top:12px;">
    <div class="ctitle">分析結果 <span class="badge ${sc}">お客様の温度感：${esc(a.sentiment)}</span><span class="muted small">${esc(M.dt(a.at))}</span><span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" id="anCopyMd">📋 議事録をコピー</button>
      <button class="btn btn-ghost btn-sm" id="anDlMd">⬇ 議事録.md</button>
      <button class="btn btn-ghost btn-sm" id="anMail">✉ 確認メール文面</button></div>
    <div class="kpis">
      <div class="kpi"><div class="k">ニーズ</div><div class="v">${a.needs.length}</div></div>
      <div class="kpi"><div class="k">Must</div><div class="v" style="color:var(--red)">${a.needs.filter(n => n.priority === "Must").length}</div></div>
      <div class="kpi"><div class="k">潜在ニーズ</div><div class="v" style="color:var(--orange)">${a.needs.filter(n => n.kind === "潜在").length}</div></div>
      <div class="kpi"><div class="k">確認事項</div><div class="v">${a.open_questions.length}</div></div>
    </div>
    <p style="font-size:13px;line-height:1.9;">${esc(a.summary)}</p>
    <div class="sect">お客様像</div>
    <div class="need"><p><b>${esc(a.customer_profile.who)}</b><br/>${esc(a.customer_profile.situation)}</p>${a.customer_profile.goals.length ? `<ul class="list" style="margin-top:6px;">${a.customer_profile.goals.map(g => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}</div>
    <div class="sect">ニーズ（チェックしたものを開発バックログへ）</div>`;
  h += a.needs.map((n, i) => `<div class="need">
      <div class="need-h"><input type="checkbox" class="anPick" data-i="${i}" ${n._added ? "disabled" : "checked"} aria-label="バックログに追加"/>
        <b>${esc(n.title)}</b><span class="badge ${PRI[n.priority]}">${esc(n.priority)}</span><span class="badge ${n.kind === "潜在" ? "b-orange" : "b-blue"}">${esc(n.kind)}</span>
        <span class="tag">${esc(n.category)}</span><span class="tag">影響 ${esc(n.impact)}</span><span class="tag">確度 ${esc(n.confidence)}</span>
        ${n.backlog_match && blTitle(n.backlog_match) ? `<span class="badge b-gold" title="既存のバックログに統合されます">↻ 既存「${esc(blTitle(n.backlog_match))}」と同じ要望</span>` : ""}
        ${n._added ? '<span class="badge b-green">バックログ追加済み</span>' : ""}</div>
      <p>${esc(n.description)}</p>
      ${n.evidence.map(e => `<div class="quote">「${esc(e.quote)}」<span class="src">${esc(e.speaker)} · ${esc(e.time)}</span></div>`).join("")}
      <div class="lbl">ユーザーストーリー</div><p>${esc(n.user_story)}</p>
      <div class="lbl">受け入れ条件</div><ul class="ac">${n.acceptance_criteria.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      ${n.dev_notes ? `<div class="lbl">開発メモ</div><p>${esc(n.dev_notes)}</p>` : ""}
    </div>`).join("") || '<div class="muted small">ニーズは見つかりませんでした</div>';
  h += `<button class="btn btn-gold btn-wide" id="anToBacklog" style="margin-top:4px;">🛠 チェックしたニーズを開発バックログへ追加</button>`;
  const list = (title, arr, f) => arr.length ? `<div class="sect">${title}</div><ul class="list">${arr.map(x => `<li>${f ? f(x) : esc(x)}</li>`).join("")}</ul>` : "";
  h += list("困りごと", a.pain_points) + list("決まったこと", a.decisions) +
    list("確認事項（次回お客様に聞く）", a.open_questions, q => `<b>${esc(q.question)}</b><span class="muted">　— ${esc(q.reason)}</span>`);
  if(a.next_actions.length) h += `<div class="sect">次のアクション</div><div class="tbl-wrap"><table class="mtable"><tr><th>担当</th><th>内容</th><th>期限</th></tr>${a.next_actions.map(x => `<tr><td><span class="badge ${x.owner === "お客様" ? "b-gold" : ""}">${esc(x.owner)}</span></td><td>${esc(x.action)}</td><td>${esc(x.due || "—")}</td></tr>`).join("")}</table></div>`;
  h += list("リスク・懸念", a.risks);
  h += "</div>";
  out.innerHTML = h;
  $("#anCopyMd").onclick = () => M.copy(M.minutesMd(m), "議事録（Markdown）をコピーしました");
  $("#anDlMd").onclick = () => M.download(M.safeName(m.title) + "_議事録.md", M.minutesMd(m), "text/markdown;charset=utf-8");
  $("#anMail").onclick = () => { $("#mailText").value = followupMail(m); M.modal("mailModal", true); };
  $("#anToBacklog").onclick = () => {
    const picks = $$(".anPick").filter(c => c.checked && !c.disabled).map(c => a.needs[+c.dataset.i]);
    if(!picks.length){ M.toast("追加するニーズを選んでください"); return; }
    const r = M.addNeeds(m, picks);
    picks.forEach(n => n._added = true);
    M.saveMeeting(m); renderResult(); M.badges();
    M.toast(`バックログに追加しました（新規 ${r.added}件・既存に統合 ${r.merged}件）`, "ok");
  };
}

async function analyze(){
  const m = current; if(!m) return;
  M.saveSettings({product:$("#anProduct").value.trim(), ourSide:$("#anOurSide").value.trim()});
  const btn = $("#anBtn"); M.busy(btn, true, "AIが分析中…（1〜2分）");
  $("#anOut").innerHTML = "";
  try{
    const bl = M.backlog().filter(b => b.status !== "rejected").slice(0, 150);
    const ppl = M.speakers(m).map(n => { const r = roleOf(m, m.lines.find(l => l.who === n)); return n + (r ? "（" + r + "）" : ""); }).join("、");
    const st = M.settings();
    const prompt = [
      st.product ? "# 開発対象・前提\n" + st.product : "",
      "# 会議\n" + m.title + "\n日時：" + M.dt(m.startedAt) + "\nお客様：" + (m.customer || "（未入力）") + "\n参加者：" + (ppl || "（不明）"),
      bl.length ? "# 既存の開発バックログ（ID｜タイトル｜概要）\n" + bl.map(b => `${b.id}｜${b.title}｜${String(b.description || "").slice(0, 80)}`).join("\n") : "# 既存の開発バックログ\n（なし）",
      m.notes ? "# 当社の手書きメモ\n" + m.notes : "",
      m.chat && m.chat.length ? "# チャット\n" + m.chat.map(c => `[${M.lineTime(m, c)}] ${c.who}: ${c.text}`).join("\n") : "",
      "# 文字起こし\n" + (transcriptForAi(m) || "（なし）"),
      "上の会議から、お客様のニーズを抽出して整理してください。"
    ].filter(Boolean).join("\n\n");
    let n = 0;
    const r = await M.ai({system:SYSTEM, prompt, schema:SCHEMA, effort:"high", onText: t => { if(++n % 20 === 0) btn.innerHTML = '<span class="spinner"></span>AIが整理中… ' + t.length + "字"; }});
    const ids = new Set(bl.map(b => b.id));
    r.needs.forEach(x => { if(!ids.has(x.backlog_match)) x.backlog_match = ""; });
    r.at = Date.now();
    m.analysis = r;
    M.saveMeeting(m); M.badges();
    renderSelect(m.id); renderResult();
    M.toast("分析が完了しました（ニーズ " + r.needs.length + "件）", "ok");
  }catch(e){ M.errorBox($("#anOut"), e); }
  finally{ M.busy(btn, false); }
}

M.mod.analyze = {
  init(){
    const s = M.settings();
    $("#anProduct").value = s.product || "";
    $("#anOurSide").value = s.ourSide || "";
    $("#anSelect").onchange = () => { current = M.meeting($("#anSelect").value); renderMeta(); };
    $("#anBtn").onclick = analyze;
    $("#anImportBtn").onclick = () => { $("#importCard").hidden = !$("#importCard").hidden; };
    $("#anSample").onclick = () => { const rec = M.loadSample(); M.go("analyze", {meetingId:rec.id}); M.toast("サンプルの会議と分析結果を読み込みました", "ok"); };
    $("#imBtn").onclick = importNow;
    $("#imFile").onchange = e => {
      const f = e.target.files[0]; if(!f) return;
      const fr = new FileReader();
      fr.onload = () => { $("#imText").value = fr.result; if(!$("#imTitle").value) $("#imTitle").value = f.name.replace(/\.[^.]+$/, ""); };
      fr.readAsText(f); e.target.value = "";
    };
    $("#mailCopy").onclick = () => M.copy($("#mailText").value, "メール文面をコピーしました");
    $("#anOurSide").addEventListener("change", e => { M.saveSettings({ourSide:e.target.value.trim()}); renderMeta(); });
    $("#anProduct").addEventListener("change", e => M.saveSettings({product:e.target.value.trim()}));
  },
  show(p){
    renderSelect(p.meetingId || (current && current.id));
    renderMeta();
  }
};

/* ================= history ================= */
function renderHistory(){
  const list = M.meetings(), el = $("#hiList");
  if(!list.length){ el.innerHTML = '<div class="empty">まだ会議の記録がありません。</div>'; return; }
  el.innerHTML = `<div class="tbl-wrap"><table class="mtable"><tr><th>日時</th><th>会議 / お客様</th><th>長さ</th><th>発言</th><th>状態</th><th></th></tr>` +
    list.map(m => `<tr>
      <td style="white-space:nowrap;">${esc(M.dt(m.startedAt))}</td>
      <td><b>${esc(m.title)}</b>${m.customer ? `<div class="muted small">${esc(m.customer)}</div>` : ""}${m.source === "import" ? ' <span class="tag">取り込み</span>' : ""}${m.sample ? ' <span class="tag">サンプル</span>' : ""}</td>
      <td style="white-space:nowrap;">${esc(M.dur(m))}</td><td>${m.lines.length}</td>
      <td>${m.analysis ? `<span class="badge b-green">分析済み・ニーズ${m.analysis.needs.length}</span>` : '<span class="badge">未分析</span>'}</td>
      <td style="white-space:nowrap;"><button class="btn btn-gold btn-sm" data-act="an" data-id="${esc(m.id)}">分析</button>
        <button class="btn btn-ghost btn-sm" data-act="md" data-id="${esc(m.id)}">議事録</button>
        <button class="btn btn-ghost btn-sm" data-act="txt" data-id="${esc(m.id)}">文字起こし</button>
        <button class="btn btn-ghost btn-sm" data-act="del" data-id="${esc(m.id)}" title="削除">🗑</button></td></tr>`).join("") + "</table></div>";
}
function backupAll(){
  const data = {app:"ricepia-meeting", version:1, exported:new Date().toISOString(), data:{}};
  M.store.keys().forEach(k => data.data[k] = M.store.get(k));
  M.download("ricepia-meeting-backup-" + M.ymd(Date.now()) + ".json", JSON.stringify(data, null, 1), "application/json");
}
function restoreAll(file){
  const fr = new FileReader();
  fr.onload = () => {
    try{
      const j = JSON.parse(fr.result);
      if(j.app !== "ricepia-meeting" || !j.data) throw new Error("形式が違います");
      if(!confirm("現在の会議記録・バックログを、バックアップの内容で上書きします。よろしいですか？")) return;
      Object.keys(j.data).forEach(k => M.store.set(k, j.data[k]));
      M.toast("復元しました", "ok"); setTimeout(() => location.reload(), 600);
    }catch(e){ M.toast("復元に失敗しました：" + e.message, "err"); }
  };
  fr.readAsText(file);
}
M.mod.history = {
  init(){
    $("#hiList").addEventListener("click", e => {
      const b = e.target.closest("button[data-act]"); if(!b) return;
      const m = M.meeting(b.dataset.id); if(!m) return;
      if(b.dataset.act === "an") M.go("analyze", {meetingId:m.id});
      if(b.dataset.act === "md") M.download(M.safeName(m.title) + "_議事録.md", M.minutesMd(m), "text/markdown;charset=utf-8");
      if(b.dataset.act === "txt") M.download(M.safeName(m.title) + "_文字起こし.txt", M.transcriptText(m));
      if(b.dataset.act === "del" && confirm("「" + m.title + "」の記録を削除します。元に戻せません。よろしいですか？\n（バックログに追加したニーズは残ります）")){ M.deleteMeeting(m.id); renderHistory(); M.badges(); }
    });
    $("#hiBackup").onclick = backupAll;
    $("#hiRestore").onchange = e => { if(e.target.files[0]) restoreAll(e.target.files[0]); e.target.value = ""; };
  },
  show(){ renderHistory(); }
};
M.parseTranscript = parseTranscript;
})();

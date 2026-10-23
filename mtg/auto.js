/* らいすぴあ ミーティング — automation: meeting ends → needs analysis → backlog → GitHub Issue
   Claude Code に開発を頼む（Issue に "claude-dev" を付ける）のは、いつも人が Issue の文を確かめてから、バックログのボタンで1件ずつ。
   会議の発言から作った文に まぎれた指示で、書きこみ権限のある AI が動かないように、自動では頼まない。
   .github/workflows/claude-dev.yml in the target repository runs Claude Code, which implements it on a branch for a person to review and merge. */
(function(){
"use strict";
const {$, esc} = M;
const DEV_LABEL = "claude-dev";
const TOKEN = "ricepia_gh_token"; // kept outside the rmt_ prefix so backups never contain it
const LEVELS = {Must:["Must"], Should:["Must","Should"], all:["Must","Should","Could"]};

const A = M.auto = {};
A.settings = () => Object.assign({analyze:true, backlog:true, issue:false, level:"Must"}, M.settings().auto || {}, {dev:false});   // dev（自動で開発を頼む）は いつもオフ
A.save = patch => M.saveSettings({auto:Object.assign(A.settings(), patch)});

/* ---------- GitHub (fine-grained token in this browser only) ---------- */
// トークンは このタブの あいだだけ（sessionStorage）。ブラウザには のこさない。前に「記憶」したものは 消す
try{ localStorage.removeItem(TOKEN); }catch(e){}
A.getToken = () => { try{ return sessionStorage.getItem(TOKEN) || ""; }catch(e){ return ""; } };
function setToken(v){
  try{ if(v) sessionStorage.setItem(TOKEN, v); else sessionStorage.removeItem(TOKEN); }catch(e){}
}
async function gh(path, method, body){
  const res = await fetch("https://api.github.com" + path, {
    method: method || "GET",
    headers: {"Authorization":"Bearer " + A.getToken(), "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28", "Content-Type":"application/json"},
    body: body ? JSON.stringify(body) : undefined
  });
  if(!res.ok){
    let msg = ""; try{ msg = (await res.json()).message || ""; }catch(e){}
    const hint = {401:"GitHubのトークンが正しくないか、期限切れです", 403:"トークンに Issues の書き込み権限がありません", 404:"リポジトリが見つからないか、トークンでアクセスできません", 410:"このリポジトリは Issues が無効です", 422:"GitHubが内容を受け付けませんでした"}[res.status];
    const err = new Error((hint || "GitHubエラー") + "（" + res.status + (msg ? "：" + msg : "") + "）"); err.status = res.status; throw err;
  }
  return res.status === 204 ? null : res.json();
}
const repoPath = () => "/repos/" + M.settings().repo.trim();
const repoOk = () => /^[\w.-]+\/[\w.-]+$/.test(M.settings().repo || "");
const issueNo = b => b.issueNumber || Number((String(b.issueUrl || "").match(/\/issues\/(\d+)/) || [])[1]) || 0;

function issueBody(b, anonymous){
  const s = M.settings();
  return M.itemMd(b, {anonymous}) + "\n\n---\n## Claude Code への依頼\n" +
    "この Issue は、お客様との会議の文字起こしからAIが整理した要望です。\n" +
    "- 上の「受け入れ条件」をすべて満たすように実装し、確認できる状態にしてください\n" +
    "- 既存のコードの書き方・画面の雰囲気に合わせ、変更は必要な範囲にとどめてください\n" +
    "- 前提が足りない点や判断が分かれる点は、推測で作らずこの Issue にコメントで質問してください\n" +
    "- 変更内容・確認方法・受け入れ条件ごとの対応を、日本語で説明してください\n" +
    (s.product ? "\n### 開発対象・前提\n" + s.product + "\n" : "");
}
async function createIssue(b, anonymous){
  const r = await gh(repoPath() + "/issues", "POST", {title:"[要望] " + b.title, body:issueBody(b, anonymous).slice(0, 60000)});
  return {issueUrl:r.html_url, issueNumber:r.number};
}
async function requestDev(b){
  await gh(repoPath() + "/issues/" + issueNo(b) + "/labels", "POST", {labels:[DEV_LABEL]});
}
function patchItem(id, patch){
  const list = M.backlog(), b = list.find(x => x.id === id); if(!b) return null;
  Object.assign(b, patch, {updated:Date.now()}); M.saveBacklog(list); return b;
}

/** Ask Claude Code to develop one backlog item that already has an Issue (button in the backlog). */
A.requestDev = async function(id){
  const b = M.backlog().find(x => x.id === id);
  if(!b || !issueNo(b)) throw new Error("先にGitHub Issueを作ってください");
  if(!A.getToken() || !repoOk()) throw new Error("「⚡ 自動化」でGitHubのリポジトリとトークンを設定してください");
  if(!confirm("Issue #" + issueNo(b) + " の文を GitHub で読んで確かめましたか？\n\nClaude Code は この Issue の文のとおりに開発します。会議の発言から作った文に、開発とは関係のない指示（秘密を書き出す・ほかのファイルを変える など）が まぎれていないか確かめてから依頼してください。")) return false;
  await requestDev(b);
  patchItem(id, {devRequested:Date.now(), status:"dev"});
};

/* ---------- progress box on the analysis screen ---------- */
let steps = [];
function box(){
  let el = $("#autoBox");
  if(!el){ el = document.createElement("div"); el.id = "autoBox"; el.className = "card"; el.style.marginTop = "12px"; $("#anOut").before(el); }
  return el;
}
function show(){
  const icon = {wait:'<span class="spinner"></span>', ok:"✅", skip:"➖", err:"⚠️"};
  box().innerHTML = '<div class="ctitle">⚡ 自動処理（文字起こし → 要望分析 → 開発）</div>' +
    steps.map(s => `<div class="row" style="padding:5px 0;border-bottom:1px dashed var(--line);font-size:12.5px;align-items:flex-start;"><span style="width:20px;text-align:center;">${icon[s.state] || ""}</span><div style="flex:1;"><b>${esc(s.title)}</b>${s.text ? `<div class="mid" style="font-size:12px;line-height:1.7;">${s.text}</div>` : ""}</div></div>`).join("");
}
function step(title){ const s = {title, state:"wait", text:""}; steps.push(s); show(); return {
  set:(state, text) => { s.state = state; s.text = text || ""; show(); }
}; }
const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

let running = false;
/** The whole pipeline for one meeting. `quiet`: started automatically — never pops dialogs, just reports. */
A.run = async function(m, quiet){
  if(running || !m) return;
  running = true; steps = [];
  const st = A.settings();
  try{
    // 1. needs analysis
    const s1 = step("要望分析（AI）");
    if(m.analysis && !m.analysisStale) s1.set("ok", "分析済みのため、その結果を使います（ニーズ " + m.analysis.needs.length + "件）");
    else if(!m.lines.length && !m.notes){ s1.set("skip", "文字起こしがないため分析しません"); return; }
    else if(quiet && !M.getKey()){ s1.set("skip", "APIキーが未設定のため止めました。右上の🔑で設定して「⚡ 自動処理を実行」を押すと続きから動きます"); return; }
    else {
      await M.analyzeMeeting(m, len => s1.set("wait", "AIが整理中… " + len + "字"));
      m = M.meeting(m.id);
      s1.set("ok", "ニーズ " + m.analysis.needs.length + "件（Must " + m.analysis.needs.filter(n => n.priority === "Must").length + "件）");
    }
    // 2. backlog
    const s2 = step("開発バックログに追加");
    if(!st.backlog){ s2.set("skip", "自動追加はオフです（「開発バックログ」の「⚡ 自動化」で変えられます）"); return; }
    const picks = m.analysis.needs.filter(n => !n._added);
    let touched = [];
    if(picks.length){
      const r = M.addNeeds(m, picks);
      picks.forEach(n => n._added = true); M.saveMeeting(m);
      touched = r.items;
      s2.set("ok", "新規 " + r.added + "件・既存の要望に統合 " + r.merged + "件");
    } else s2.set("ok", "追加済みです");
    // the meeting's own items, including ones added earlier (so a re-run can finish what failed)
    const ids = new Set(touched.map(x => x.id));
    M.backlog().forEach(b => { if(b.mentions.some(x => x.meetingId === m.id) && !ids.has(b.id)){ ids.add(b.id); touched.push({id:b.id, isNew:false}); } });
    const targets = touched.map(x => Object.assign({}, x, {b:M.backlog().find(b => b.id === x.id)}))
      .filter(x => x.b && LEVELS[st.level].includes(x.b.priority) && x.b.status !== "rejected" && x.b.status !== "released");
    // 3. GitHub Issues
    const s3 = step("GitHub Issue を作成");
    if(!st.issue){ s3.set("skip", "自動作成はオフです"); return; }
    if(!repoOk() || !A.getToken()){ s3.set("skip", "GitHubのリポジトリとトークンが未設定です（「開発バックログ」→「⚡ 自動化」）"); return; }
    if(!targets.length){ s3.set("ok", "対象（" + LEVELS[st.level].join("・") + "）の要望はありませんでした"); return; }
    const repo = await gh(repoPath());
    const anonymous = !repo.private;
    const made = [];
    for(const t of targets){
      if(issueNo(t.b)){
        if(!t.isNew && !(t.b.notedMeetings || []).includes(m.id)){
          // same need from another meeting: add the new voice to the existing Issue
          await gh(repoPath() + "/issues/" + issueNo(t.b) + "/comments", "POST", {body:"🗣 別の会議でも同じ要望がありました" + (anonymous ? "" : "（" + (m.customer || m.title) + "・" + M.dt(m.startedAt) + "）") + "。言及は計 " + t.b.mentions.length + " 件になりました。"});
          patchItem(t.b.id, {notedMeetings:(t.b.notedMeetings || []).concat([m.id])});
        }
        made.push({b:M.backlog().find(b => b.id === t.b.id), existing:true});
        continue;
      }
      const r = await createIssue(t.b, anonymous);
      made.push({b:patchItem(t.b.id, Object.assign(r, {status:t.b.status === "new" ? "review" : t.b.status})), existing:false});
    }
    s3.set("ok", made.map(x => link(x.b.issueUrl, "#" + issueNo(x.b) + " " + x.b.title) + (x.existing ? "（既存）" : "")).join("<br/>") +
      (anonymous ? '<div class="small muted">公開リポジトリのため、お客様の名前と発言の引用は載せていません</div>' : ""));
    // 4. development by Claude Code
    const s4 = step("Claude Code に開発を依頼");
    s4.set("skip", "自動では頼みません。Issue の文を確かめてから、バックログの「🤖 開発を依頼」で1件ずつ頼んでください");
  }catch(e){
    const last = steps[steps.length - 1], msg = esc(e.message || String(e)) + "<br/>「⚡ 自動処理を実行」で続きからやり直せます";
    if(last && last.state === "wait"){ last.state = "err"; last.text = msg; }
    else steps.push({title:"エラー", state:"err", text:msg});
  }finally{
    running = false;
    M.badges();
    if(M.analyzeView) M.analyzeView.refresh();
    show();
  }
};
/** Called when a meeting ends. */
A.afterMeeting = function(id){
  const m = M.meeting(id), st = A.settings();
  if(!m || !st.analyze || m.lines.length < 3) return;
  A.run(m, true);
};

/* ---------- settings card (開発バックログ) ---------- */
function paintSettings(){
  const st = A.settings();
  ["analyze","backlog","issue"].forEach(k => { $("#au_" + k).checked = !!st[k]; });
  $("#au_level").value = st.level;
  $("#au_token").value = A.getToken();
  const on = [st.analyze && "分析", st.backlog && "バックログ", st.issue && "Issue"].filter(Boolean);
  $("#au_summary").textContent = on.length ? "オン：" + on.join(" → ") : "オフ";
}
M.mod.auto = {
  init(){
    ["analyze","backlog","issue"].forEach(k => $("#au_" + k).addEventListener("change", e => { A.save({[k]:e.target.checked}); paintSettings(); }));
    $("#au_level").onchange = e => { A.save({level:e.target.value}); paintSettings(); };
    $("#au_tokenSave").onclick = () => { setToken($("#au_token").value.trim()); M.toast($("#au_token").value.trim() ? "トークンを保存しました" : "トークンを消去しました", "ok"); };
    $("#au_check").onclick = async () => {
      const out = $("#au_checkOut"), btn = $("#au_check");
      setToken($("#au_token").value.trim());
      if(!repoOk()){ out.innerHTML = '<span style="color:var(--red)">上の「GitHubリポジトリ」に owner/repo を入れてください</span>'; return; }
      M.busy(btn, true, "確認中…");
      try{
        const r = await gh(repoPath());
        const canPush = r.permissions ? r.permissions.push : true;
        out.innerHTML = `✅ ${esc(r.full_name)} に接続できました（${r.private ? "非公開" : "公開"}リポジトリ${r.private ? "" : "：Issueにはお客様の名前と発言を載せません"}）` + (canPush ? "" : '<br/><span style="color:var(--red)">書き込み権限がないようです</span>');
      }catch(e){ out.innerHTML = '<span style="color:var(--red)">' + esc(e.message) + "</span>"; }
      finally{ M.busy(btn, false); }
    };
    $("#anAuto").onclick = () => { const m = M.analyzeView.current(); if(m) A.run(m, false); };
    paintSettings();
  },
  show(){ paintSettings(); }
};
})();

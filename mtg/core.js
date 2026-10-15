/* らいすぴあ ミーティング — core: storage, utilities, Claude API client, routing */
(function(){
"use strict";
const M = window.M = {mod:{}};
const PFX = "rmt_";

/* ================= storage ================= */
M.store = {
  get(k, d){ try{ const v = localStorage.getItem(PFX+k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){
    try{ localStorage.setItem(PFX+k, JSON.stringify(v)); return true; }
    catch(e){ M.toast("保存に失敗しました（ブラウザの容量不足の可能性）。古い会議を書き出して削除してください", "err"); return false; }
  },
  keys(){ const out=[]; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k.startsWith(PFX)) out.push(k.slice(PFX.length)); } }catch(e){} return out; }
};
M.settings = () => Object.assign({name:"", repo:"", product:"", ourSide:""}, M.store.get("settings", {}));
M.saveSettings = patch => M.store.set("settings", Object.assign(M.settings(), patch));

/* meetings */
M.meetings = () => M.store.get("meetings", []);
M.meeting = id => M.meetings().find(m => m.id === id) || null;
M.saveMeeting = function(rec){
  const list = M.meetings(), i = list.findIndex(m => m.id === rec.id);
  if(i >= 0) list[i] = rec; else list.unshift(rec);
  return M.store.set("meetings", list.slice(0, 200));
};
M.deleteMeeting = id => M.store.set("meetings", M.meetings().filter(m => m.id !== id));
M.backlog = () => M.store.get("backlog", []);
M.saveBacklog = list => M.store.set("backlog", list);

/* ================= utilities ================= */
M.$ = (s, r=document) => r.querySelector(s);
M.$$ = (s, r=document) => Array.from(r.querySelectorAll(s));
M.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
M.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
M.pad = n => String(n).padStart(2, "0");
M.clock = ms => { ms = Math.max(0, ms || 0); const s = Math.floor(ms/1000), h = Math.floor(s/3600); return (h ? h + ":" + M.pad(Math.floor(s/60)%60) : Math.floor(s/60)) + ":" + M.pad(s%60); };
M.dt = t => { const d = new Date(t); return isNaN(d) ? "" : d.getFullYear() + "/" + (d.getMonth()+1) + "/" + d.getDate() + " " + M.pad(d.getHours()) + ":" + M.pad(d.getMinutes()); };
M.ymd = t => { const d = new Date(t); return d.getFullYear() + "-" + M.pad(d.getMonth()+1) + "-" + M.pad(d.getDate()); };
M.dur = m => { const e = m.endedAt || (m.lines.length ? m.lines[m.lines.length-1].at : m.startedAt); const min = Math.round((e - m.startedAt) / 60000); return min >= 60 ? Math.floor(min/60) + "時間" + (min%60) + "分" : min + "分"; };
M.colorOf = (name, names) => "c" + (Math.max(0, names.indexOf(name)) % 6);

M.toast = function(msg, type){
  const t = document.createElement("div");
  t.className = "toast" + (type ? " " + type : "");
  t.textContent = msg;
  M.$("#toasts").appendChild(t);
  setTimeout(() => t.remove(), type === "err" ? 5500 : 2600);
};
M.copy = async function(text, msg){
  try{ await navigator.clipboard.writeText(text); }
  catch(e){
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); }catch(_){} ta.remove();
  }
  M.toast(msg || "コピーしました", "ok");
};
M.download = function(name, content, mime){
  const blob = new Blob([content], {type: mime || "text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
M.csv = rows => "﻿" + rows.map(r => r.map(v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\r\n");
M.safeName = s => String(s || "meeting").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
M.busy = function(btn, on, label){
  if(!btn) return;
  if(on){ btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + M.esc(label || "AIが分析中…"); }
  else { btn.disabled = false; if(btn.dataset.label) btn.innerHTML = btn.dataset.label; }
};
M.modal = function(id, show){ M.$("#" + id).hidden = !show; };

/* Minimal, escape-first markdown renderer for AI output */
M.md = function(src){
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const inline = s => M.esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let html = "", list = null, para = [], code = null;
  const flushP = () => { if(para.length){ html += "<p>" + para.map(inline).join("<br/>") + "</p>"; para = []; } };
  const flushL = () => { if(list){ html += "</" + list + ">"; list = null; } };
  for(let i=0;i<lines.length;i++){
    const l = lines[i]; let m;
    if(code != null){ if(/^\s*```/.test(l)){ html += "<pre><code>" + M.esc(code) + "</code></pre>"; code = null; } else code += (code ? "\n" : "") + l; continue; }
    if(/^\s*```/.test(l)){ flushP(); flushL(); code = ""; continue; }
    if(/^\s*\|.*\|\s*$/.test(l) && lines[i+1] && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){
      flushP(); flushL();
      const cells = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => inline(c.trim()));
      html += "<table><tr>" + cells(l).map(c => "<th>" + c + "</th>").join("") + "</tr>";
      i += 2;
      while(i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])){ html += "<tr>" + cells(lines[i]).map(c => "<td>" + c + "</td>").join("") + "</tr>"; i++; }
      i--; html += "</table>"; continue;
    }
    if((m = l.match(/^(#{1,4})\s+(.*)/))){ flushP(); flushL(); const h = Math.min(m[1].length + 1, 3); html += `<h${h}>${inline(m[2])}</h${h}>`; continue; }
    if(/^\s*(-{3,}|\*{3,})\s*$/.test(l)){ flushP(); flushL(); html += "<hr/>"; continue; }
    if((m = l.match(/^\s*[-*・]\s+(?:\[[ x]\]\s*)?(.*)/))){ flushP(); if(list !== "ul"){ flushL(); html += "<ul>"; list = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
    if((m = l.match(/^\s*\d+[.)]\s+(.*)/))){ flushP(); if(list !== "ol"){ flushL(); html += "<ol>"; list = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
    if((m = l.match(/^>\s?(.*)/))){ flushP(); flushL(); html += "<blockquote>" + inline(m[1]) + "</blockquote>"; continue; }
    if(!l.trim()){ flushP(); flushL(); continue; }
    flushL(); para.push(l);
  }
  if(code != null) html += "<pre><code>" + M.esc(code) + "</code></pre>";
  flushP(); flushL();
  return html;
};

/* ================= API key (shared with Marketing Studio: rpm_key) ================= */
const KEY = "rpm_key";
M.getKey = () => { try{ return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ""; }catch(e){ return ""; } };
M.renderKey = function(){
  const b = M.$("#keyBtn"), k = M.getKey();
  b.textContent = k ? "🔑 設定済み" : "🔑 APIキー";
  b.classList.toggle("ok", !!k);
};
M.keyModal = function(){
  M.$("#keyInput").value = M.getKey();
  try{ M.$("#keyRemember").checked = !!localStorage.getItem(KEY); }catch(e){}
  M.modal("keyModal", true);
  setTimeout(() => M.$("#keyInput").focus(), 50);
};
M.saveKey = function(){
  const v = M.$("#keyInput").value.trim();
  if(v.length < 10){ M.toast("APIキーを入力してください", "err"); return; }
  try{
    sessionStorage.setItem(KEY, v);
    if(M.$("#keyRemember").checked) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY);
  }catch(e){}
  M.modal("keyModal", false); M.renderKey(); M.toast("APIキーを設定しました", "ok");
  if(M._keyWaiter){ const w = M._keyWaiter; M._keyWaiter = null; w(); }
};
M.forgetKey = function(){
  try{ sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); }catch(e){}
  M.$("#keyInput").value = ""; M.renderKey(); M.toast("APIキーを消去しました");
};
M.ensureKey = function(){
  if(M.getKey()) return Promise.resolve();
  return new Promise(res => { M._keyWaiter = res; M.keyModal(); M.toast("先にAPIキーを設定してください"); });
};

/* ================= Claude API (browser direct, SSE streaming) =================
   Same pattern as index.html / meta-ads.html: the static page calls the Messages API directly. */
M.MODEL = "claude-opus-5-5";
M.FAST_MODEL = "claude-sonnet-5-5";
let noFallback = false;

async function streamOnce(body, onText){
  const headers = {
    "content-type":"application/json",
    "x-api-key": M.getKey(),
    "anthropic-version":"2023-06-01",
    "anthropic-dangerous-direct-browser-access":"true"
  };
  if(body.fallbacks) headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  const res = await fetch("https://api.anthropic.com/v1/messages", {method:"POST", headers, body: JSON.stringify(body)});
  if(!res.ok){
    let msg = "HTTP " + res.status;
    try{ const j = await res.json(); msg = (j.error && j.error.message) || msg; }catch(e){}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", stop = null;
  for(;;){
    const {done, value} = await reader.read();
    if(done) break;
    buf += dec.decode(value, {stream:true});
    let i;
    while((i = buf.indexOf("\n\n")) >= 0){
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = chunk.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
      if(!data) continue;
      let ev; try{ ev = JSON.parse(data); }catch(e){ continue; }
      if(ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta"){ text += ev.delta.text; onText && onText(text); }
      else if(ev.type === "message_delta" && ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
      else if(ev.type === "error"){
        const err = new Error((ev.error && ev.error.message) || "ストリーミング中にエラーが発生しました");
        err.status = ev.error && ev.error.type === "overloaded_error" ? 529 : 500; throw err;
      }
    }
  }
  return {text, stop};
}

/** M.ai({system, prompt, schema?, model?, effort?, maxTokens?, onText?}) → text, or parsed JSON when schema is given */
M.ai = async function(o){
  await M.ensureKey();
  const output_config = {effort: o.effort || "high"};
  if(o.schema) output_config.format = {type:"json_schema", schema:o.schema};
  const body = {
    model: o.model || M.MODEL, max_tokens: o.maxTokens || 32000, stream: true,
    system: o.system, messages: [{role:"user", content:o.prompt}], output_config
  };
  if(!noFallback) body.fallbacks = "default";
  let r;
  try{ r = await streamOnce(body, o.onText); }
  catch(e){
    // Retry once without the fallback beta if this key/org doesn't accept it.
    if(e.status === 400 && body.fallbacks && /fallback|beta/i.test(e.message)){ noFallback = true; delete body.fallbacks; r = await streamOnce(body, o.onText); }
    else throw e;
  }
  if(r.stop === "refusal") throw new Error("AIがこの内容への回答を控えました。内容を見直してもう一度お試しください");
  if(r.stop === "max_tokens" && o.schema) throw new Error("AIの回答が長すぎて途中で切れました。会議を分けるか、もう一度お試しください");
  if(!o.schema) return r.text + (r.stop === "max_tokens" ? "\n\n（※ 出力が長すぎたため途中で終了しました）" : "");
  try{ return JSON.parse(r.text); }
  catch(e){ throw new Error("AIの応答を解析できませんでした。もう一度お試しください"); }
};
M.errorBox = function(el, e){
  const msg = e && e.message ? e.message : String(e);
  let hint = "";
  if(e && e.status === 401) hint = "→ APIキーが正しいか確認してください（右上の🔑）。";
  else if(e && e.status === 429) hint = "→ 利用上限に達しました。少し待ってから再度お試しください。";
  else if(e && (e.status === 529 || e.status >= 500)) hint = "→ AIサーバーが混雑しています。少し待ってから再度お試しください。";
  else if(/Failed to fetch|NetworkError/i.test(msg)) hint = "→ ネットワーク接続を確認してください。";
  el.hidden = false;
  el.innerHTML = `<div class="err-box">エラー：${M.esc(msg)}${hint ? "<br/>" + M.esc(hint) : ""}</div>`;
};

/* ================= transcript formatting ================= */
M.lineTime = (m, l) => M.clock(l.at - m.startedAt);
M.transcriptText = function(m, opts){
  opts = opts || {};
  return m.lines.map(l => `[${M.lineTime(m, l)}] ${l.who}${opts.roles && l.role === "お客様" ? "（お客様）" : ""}: ${l.text}`).join("\n");
};
M.speakers = m => Array.from(new Set(m.lines.map(l => l.who)));

/* ================= routing ================= */
M.VIEWS = ["meet","analyze","backlog","history"];
M.go = function(name, params){
  if(!M.VIEWS.includes(name)) name = "meet";
  M.$$(".view").forEach(v => v.hidden = v.id !== "v-" + name);
  M.$$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.go === name));
  const mod = M.mod[name];
  if(mod && mod.show) mod.show(params || {});
  if(!/^#join=/.test(location.hash) && location.hash !== "#" + name) history.replaceState(null, "", location.pathname + location.search + "#" + name);
  M.badges();
  window.scrollTo(0, 0);
};
M.badges = function(){
  const open = M.backlog().filter(b => b.status === "new").length;
  M.$("#nbBacklog").textContent = open || "";
  M.$("#nbBacklog").hidden = !open;
  const todo = M.meetings().filter(m => !m.analysis && m.lines.length).length;
  M.$("#nbAnalyze").textContent = todo || "";
  M.$("#nbAnalyze").hidden = !todo;
};
M.boot = function(){
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-go]");
    if(g){ e.preventDefault(); M.go(g.dataset.go); }
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") M.$$(".modal").forEach(m => m.hidden = true);
    if(e.key === "Enter" && e.target.id === "keyInput") M.saveKey();
  });
  M.$$(".modal").forEach(m => m.addEventListener("click", e => { if(e.target === m) m.hidden = true; }));
  Object.keys(M.mod).forEach(k => { try{ M.mod[k].init && M.mod[k].init(); }catch(e){ console.error(k, e); } });
  M.renderKey();
  const h = location.hash.slice(1);
  M.go(/^join=/.test(h) ? "meet" : (h || "meet"));
};
})();

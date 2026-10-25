/* らいすぴあ Marketing Studio — core: storage, utilities, Claude API client, routing */
(function(){
"use strict";
const RP = window.RP = {mod:{}};
const PFX = "rpm_";

/* ================= storage ================= */
RP.store = {
  get(k, d){ try{ const v = localStorage.getItem(PFX+k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){
    try{ localStorage.setItem(PFX+k, JSON.stringify(v)); return true; }
    catch(e){ RP.toast("保存に失敗しました（ブラウザの容量不足の可能性）", "err"); return false; }
  },
  del(k){ try{ localStorage.removeItem(PFX+k); }catch(e){} },
  keys(){ const out=[]; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k.startsWith(PFX)) out.push(k.slice(PFX.length)); } }catch(e){} return out; }
};

/* ================= utilities ================= */
RP.$ = (s, r=document) => r.querySelector(s);
RP.$$ = (s, r=document) => Array.from(r.querySelectorAll(s));
RP.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
RP.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
RP.num = v => { const n = Number(String(v == null ? "" : v).replace(/[,，円¥\s]/g, "")); return isFinite(n) ? n : 0; };
RP.yen = n => "¥" + Math.round(n || 0).toLocaleString("ja-JP");
RP.fmt = n => Math.round(n || 0).toLocaleString("ja-JP");
RP.pad = n => String(n).padStart(2, "0");
RP.ymd = d => d.getFullYear() + "-" + RP.pad(d.getMonth()+1) + "-" + RP.pad(d.getDate());
RP.ym = d => d.getFullYear() + "-" + RP.pad(d.getMonth()+1);
RP.today = () => RP.ymd(new Date());
RP.parseDate = s => { const m = String(s||"").match(/(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; };
RP.jpDate = s => { const d = RP.parseDate(s); return d ? (d.getMonth()+1) + "/" + d.getDate() + "（" + "日月火水木金土"[d.getDay()] + "）" : s; };
RP.addDays = (s, n) => { const d = RP.parseDate(s) || new Date(); d.setDate(d.getDate()+n); return RP.ymd(d); };

RP.toast = function(msg, type){
  const t = document.createElement("div");
  t.className = "toast" + (type ? " " + type : "");
  t.textContent = msg;
  RP.$("#toasts").appendChild(t);
  setTimeout(() => t.remove(), type === "err" ? 5000 : 2600);
};
RP.copy = async function(text){
  if(!text){ RP.toast("コピーする内容がありません"); return; }
  try{ await navigator.clipboard.writeText(text); }
  catch(e){
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); }catch(_){} ta.remove();
  }
  RP.toast("コピーしました", "ok");
};
RP.download = function(name, content, mime){
  const blob = new Blob([content], {type: mime || "text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
RP.csv = function(rows){
  const cell = v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n");
};
RP.parseCsv = function(text){
  const rows = []; let row = [], cur = "", q = false;
  text = text.replace(/^﻿/, "");
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(q){ if(c === '"'){ if(text[i+1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if(c === '"') q = true;
    else if(c === ","){ row.push(cur); cur = ""; }
    else if(c === "\n" || c === "\r"){ if(c === "\r" && text[i+1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if(cur !== "" || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
};
RP.busy = function(btn, on, label){
  if(!btn) return;
  if(on){ btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + RP.esc(label || "AIが作成中…"); }
  else { btn.disabled = false; if(btn.dataset.label) btn.innerHTML = btn.dataset.label; }
};
RP.chips = function(el, options, opts){
  opts = opts || {};
  const multi = !!opts.multi;
  let value = multi ? (opts.value || []).slice() : (opts.value != null ? opts.value : options[0].value);
  el.innerHTML = options.map(o => `<button type="button" class="chip" data-v="${RP.esc(o.value)}" title="${RP.esc(o.hint||"")}">${RP.esc(o.label)}</button>`).join("");
  const paint = () => RP.$$(".chip", el).forEach(b => b.classList.toggle("on", multi ? value.includes(b.dataset.v) : b.dataset.v === value));
  el.onclick = e => {
    const b = e.target.closest(".chip"); if(!b) return;
    const v = b.dataset.v;
    if(multi) value = value.includes(v) ? value.filter(x => x !== v) : value.concat([v]); else value = v;
    paint(); if(opts.onChange) opts.onChange(value);
  };
  paint();
  return { get: () => value, set: v => { value = multi ? (v||[]).slice() : v; paint(); } };
};

/* Minimal, escape-first markdown renderer for AI output */
RP.md = function(src){
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const inline = s => RP.esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let html = "", list = null, para = [];
  const flushP = () => { if(para.length){ html += "<p>" + para.map(inline).join("<br/>") + "</p>"; para = []; } };
  const flushL = () => { if(list){ html += "</" + list + ">"; list = null; } };
  for(let i=0;i<lines.length;i++){
    const l = lines[i];
    let m;
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
    if((m = l.match(/^\s*[-*・]\s+(.*)/))){ flushP(); if(list !== "ul"){ flushL(); html += "<ul>"; list = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
    if((m = l.match(/^\s*\d+[.)]\s+(.*)/))){ flushP(); if(list !== "ol"){ flushL(); html += "<ol>"; list = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
    if((m = l.match(/^>\s?(.*)/))){ flushP(); flushL(); html += "<blockquote>" + inline(m[1]) + "</blockquote>"; continue; }
    if(!l.trim()){ flushP(); flushL(); continue; }
    flushL(); para.push(l);
  }
  flushP(); flushL();
  return html;
};

RP.parseJSON = function(text){
  let t = String(text || "").replace(/```(?:json)?/gi, "").trim();
  try{ return JSON.parse(t); }catch(e){}
  const s = Math.min(...["{", "["].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  const e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if(s !== Infinity && e > s){ try{ return JSON.parse(t.slice(s, e+1)); }catch(err){} }
  throw new Error("AIの応答を解析できませんでした。もう一度お試しください。");
};

/* ================= domain constants ================= */
RP.CHANNELS = [
  {value:"instagram", label:"Instagram", spec:"Instagramフィード投稿のキャプション。1行目で惹きつけ、改行と絵文字で読みやすく。本文300〜600字。末尾にハッシュタグを10〜15個（地域・品種・お米・ライフスタイル系をミックス）。写真の構図案も1行添える。"},
  {value:"x", label:"X（旧Twitter）", spec:"X投稿。全角140字以内を厳守（URLなし）。1投稿で完結し、ハッシュタグは1〜2個まで。"},
  {value:"line", label:"LINE配信", spec:"LINE公式アカウントのメッセージ配信。冒頭20字で用件が伝わるように。全体250字以内。最後に行動（来店・予約・返信）を1つだけ促す。吹き出し1つ分の想定。"},
  {value:"gbp", label:"Googleビジネス", spec:"Googleビジネスプロフィールの「最新情報」投稿。300〜500字。店名・地域名・商品名を自然に含め、検索されやすい語を入れる。電話番号やURLは書かず『ボタンから』と促す。"},
  {value:"blog", label:"ブログ / note", spec:"ブログ記事。SEOを意識したタイトル案3つ、見出し(##)付きの本文1200〜1800字、最後にまとめと店舗案内。米屋ならではの専門知識を必ず1つ入れる。"},
  {value:"ec", label:"EC商品ページ", spec:"ECサイト（自社EC・楽天・Amazon等）の商品ページ。商品名（検索キーワードを含む・60字以内）、キャッチコピー、箇条書きの特徴5点、商品説明300〜500字、おすすめの食べ方、よくある質問3つ、を見出し付きで。"},
  {value:"pop", label:"店頭POP", spec:"店頭POP。大見出しキャッチ（15字以内）、サブコピー（25字以内）、本文（60字以内）、価格表示欄の書き方、の4要素。手書き風に親しみやすく。"},
  {value:"flyer", label:"チラシ", spec:"A4チラシの原稿。メインキャッチ、サブキャッチ、目玉商品3つ（各40字の説明）、特典・期間、店舗情報欄、レイアウト指示（どこに何を置くか）を見出し付きで。"},
  {value:"mail", label:"メルマガ", spec:"メールマガジン。件名案3つ（各30字以内）、プリヘッダー、本文600〜900字（挨拶→季節の話題→本題→特典→結び）。"},
  {value:"press", label:"プレスリリース", spec:"地域メディア向けプレスリリース。タイトル、リード文（100字）、本文（背景・内容・店主コメント）、開催概要、会社概要、問い合わせ先欄。誇張せず事実ベースで。"},
  {value:"gift", label:"ギフト・のし文面", spec:"ギフト用の添え状・メッセージカード文面。贈り主→受け手の関係別に3パターン（ビジネス、親族、友人）。各120字以内。"}
];
RP.GOALS = [
  {value:"認知拡大", label:"認知を広げる"}, {value:"来店促進", label:"来店してほしい"},
  {value:"購入促進", label:"買ってほしい"}, {value:"リピート促進", label:"また買ってほしい"},
  {value:"ギフト需要", label:"贈り物に"}, {value:"予約獲得", label:"予約を取りたい"},
  {value:"ファン化", label:"ファンを増やす"}
];
RP.TONES = [
  {value:"brand", label:"ブランド標準"}, {value:"親しみやすい", label:"親しみやすく"},
  {value:"上品・高級感", label:"上品に"}, {value:"職人・専門家", label:"職人らしく"},
  {value:"元気・ポップ", label:"元気に"}, {value:"ストーリー重視", label:"物語で"}
];
/* Monthly retail & rice-related moments in Japan */
RP.SEASON = {
  1:["お正月","鏡開き（1/11）","成人の日","七草がゆ（1/7）","寒の内の精米"],
  2:["節分・恵方巻（2/3頃）","バレンタイン","建国記念の日","受験生の応援ごはん"],
  3:["ひな祭り・ちらし寿司（3/3）","ホワイトデー","卒業・送別","春のお彼岸（ぼたもち）"],
  4:["入学・新生活","お花見弁当","昭和の日","新生活の米びつ提案"],
  5:["ゴールデンウィーク","こどもの日","母の日（第2日曜）","田植えシーズン"],
  6:["父の日（第3日曜）","梅雨・米の保存方法","夏至","お中元早割"],
  7:["お中元","土用の丑の日","夏休みのおにぎり","海の日"],
  8:["お盆","米の日（8/18）","夏祭り","新米予約の受付開始"],
  9:["敬老の日","秋のお彼岸（おはぎ）","新米入荷（早場米）","十五夜"],
  10:["新米シーズン本番","ハロウィン","スポーツの日","新米食べ比べ"],
  11:["新嘗祭・勤労感謝の日","お歳暮早割","いい夫婦の日（11/22）","七五三"],
  12:["お歳暮","冬至","年末・お正月準備（もち米）","クリスマス"]
};
RP.STATUS = {idea:{label:"アイデア", cls:""}, draft:{label:"下書き", cls:"orange"}, scheduled:{label:"予約済み", cls:"blue"}, done:{label:"完了", cls:"green"}};
RP.chanLabel = v => (RP.CHANNELS.find(c => c.value === v) || {label: v || "その他"}).label;
RP.monthSeason = (m) => RP.SEASON[m] || [];

/* ================= settings & usage ================= */
RP.MODELS = [
  {id:"claude-opus-5-5", label:"Claude Opus 5.5（高品質・推奨）", in:4, out:20, cacheRead:0.2},
  {id:"claude-sonnet-5-5", label:"Claude Sonnet 5.5（高速・低コスト）", in:2, out:10, cacheRead:0.2}
];
const DEFAULT_SETTINGS = {model:"claude-opus-5-5", effort:"medium", fallback:true, rate:150, budget:5000};
RP.settings = () => Object.assign({}, DEFAULT_SETTINGS, RP.store.get("settings", {}));
RP.usage = () => RP.store.get("usage", []);
RP.monthCost = function(ym){
  ym = ym || RP.ym(new Date());
  return RP.usage().filter(u => (u.t || "").startsWith(ym)).reduce((a, u) => a + (u.jpy || 0), 0);
};
function logUsage(feature, model, u, searches){
  const s = RP.settings();
  const m = RP.MODELS.find(x => x.id === model) || RP.MODELS[0];
  const usd = ((u.in||0) * m.in + (u.cw||0) * m.in * 1.25 + (u.cr||0) * m.cacheRead + (u.out||0) * m.out) / 1e6 + (searches||0) * 0.01;
  const rec = {t: new Date().toISOString(), feature, model, in:u.in||0, out:u.out||0, cr:u.cr||0, cw:u.cw||0, searches:searches||0, jpy: usd * s.rate};
  const list = RP.usage().concat([rec]).slice(-800);
  RP.store.set("usage", list);
  RP.renderCost();
}
RP.renderCost = function(){
  const s = RP.settings(), c = RP.monthCost();
  const b = RP.$("#costBadge");
  b.textContent = "今月 " + RP.yen(c);
  b.classList.toggle("warn", s.budget > 0 && c >= s.budget * 0.8);
};

/* ================= API key ================= */
// キーは このタブの あいだだけ（sessionStorage）。ブラウザには のこさない（同じサイトの ほかのページに 穴があっても ぬすまれないように）。前に「記憶」したものは 消す
try{ localStorage.removeItem(PFX+"key"); }catch(e){}
RP.getKey = () => { try{ return sessionStorage.getItem(PFX+"key") || ""; }catch(e){ return ""; } };
RP.renderKey = function(){
  const k = RP.getKey(), b = RP.$("#keyBadge");
  b.textContent = k ? "🔑 APIキー設定済み" : "🔑 APIキー未設定";
  b.classList.toggle("ok", !!k);
  const m = RP.$("#keyBadgeM"); if(m){ m.classList.toggle("ok", !!k); m.title = k ? "APIキー設定済み" : "APIキー未設定"; }
};
RP.keyModal = function(){
  RP.$("#keyInput").value = RP.getKey();
  RP.$("#keyModal").hidden = false;
  setTimeout(() => RP.$("#keyInput").focus(), 50);
};
RP.saveKey = function(){
  const v = RP.$("#keyInput").value.trim();
  if(v.length < 10){ RP.toast("APIキーを入力してください", "err"); return; }
  try{
    sessionStorage.setItem(PFX+"key", v);
  }catch(e){}
  RP.closeModal("keyModal"); RP.renderKey(); RP.toast("APIキーを設定しました", "ok");
  if(RP._keyWaiter){ const w = RP._keyWaiter; RP._keyWaiter = null; w(); }
};
RP.forgetKey = function(){
  try{ sessionStorage.removeItem(PFX+"key"); localStorage.removeItem(PFX+"key"); }catch(e){}
  RP.renderKey(); RP.toast("APIキーを消去しました");
};
RP.closeModal = id => { RP.$("#" + id).hidden = true; };
RP.modal = function(title, html){
  RP.$("#genModalTitle").textContent = title;
  RP.$("#genModalBody").innerHTML = html;
  RP.$("#genModal").hidden = false;
  return RP.$("#genModalBody");
};

/* ================= brand context ================= */
RP.brand = () => RP.store.get("brand", null) || RP.DEFAULT_BRAND;
RP.brandContext = function(){
  const b = RP.brand();
  const prods = (b.products || []).map(p => `- ${p.name}（${p.cat || "—"}）${p.price ? " / " + p.price : ""}${p.note ? " / " + p.note : ""}`).join("\n");
  return [
    "【店舗プロフィール】",
    "店名：" + (b.name || ""), "ブランド名：" + (b.brand || ""),
    "歴史・ストーリー：" + (b.story || ""), "所在地・商圏：" + (b.area || ""), "営業時間：" + (b.hours || ""),
    "強み：" + (b.usp || ""), "主なお客様：" + (b.target || ""), "文章のトーン：" + (b.voice || ""),
    "販売チャネル・連絡先：" + (b.channels || ""), "使わない言葉・注意事項：" + (b.ng || ""),
    "", "【商品マスタ】", prods || "（未登録）"
  ].join("\n");
};
const BASE_SYSTEM = `あなたは日本の老舗米穀店専属のマーケティングディレクターです。地域密着の小売・食品マーケティング、SNS運用、EC、CRM、販促企画に精通し、店主が「そのまま使える」アウトプットを日本語で作ります。

守ること：
- 店舗プロフィールと商品マスタにある事実だけを使い、価格・受賞歴・産地・数値などを創作しない。不明な情報は【　】の差し込み枠にする。
- 景品表示法（優良誤認・有利誤認）に配慮し、「日本一」「最高」「必ず」など根拠のない最上級・断定表現を使わない。二重価格表示や期間限定の表現にも注意する。
- 米トレーサビリティ法・食品表示基準に配慮し、産地・品種・産年は事実として書かれたものだけを表示する。健康効果を断定しない（健康増進法・薬機法）。
- 押し売り感を避け、老舗米屋の誠実さと専門性が伝わる表現にする。`;

/* ================= Claude API client (raw fetch, SSE streaming) =================
   The app is a static, build-free page that calls the Messages API directly from the browser,
   the same way index.html does. */
let noFallback = false;
RP.ensureKey = function(){
  if(RP.getKey()) return Promise.resolve();
  return new Promise(res => { RP._keyWaiter = res; RP.keyModal(); RP.toast("先にAPIキーを設定してください"); });
};

async function streamOnce(body, onText, acc){
  const headers = {
    "content-type":"application/json",
    "x-api-key": RP.getKey(),
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
  let buf = "";
  const blocks = [], partial = {};
  const out = {blocks, stop:null, usage:{in:0,out:0,cr:0,cw:0}, searches:0};
  const handle = ev => {
    switch(ev.type){
      case "message_start": {
        const u = (ev.message && ev.message.usage) || {};
        out.usage.in = u.input_tokens || 0; out.usage.cr = u.cache_read_input_tokens || 0; out.usage.cw = u.cache_creation_input_tokens || 0;
        out.usage.out = u.output_tokens || 0;
        break;
      }
      case "content_block_start": {
        const b = JSON.parse(JSON.stringify(ev.content_block));
        if(b.type === "text"){ b.text = b.text || ""; if(b.text){ acc.text += b.text; onText && onText(b.text, acc.text); } }
        if(b.type === "server_tool_use" || b.type === "tool_use") partial[ev.index] = "";
        if(b.type === "web_search_tool_result" && Array.isArray(b.content)){
          b.content.forEach(r => { if(r.url) acc.sources.push({url:r.url, title:r.title || r.url}); });
        }
        blocks[ev.index] = b;
        break;
      }
      case "content_block_delta": {
        const b = blocks[ev.index], d = ev.delta || {};
        if(!b) break;
        if(d.type === "text_delta"){ b.text += d.text; acc.text += d.text; onText && onText(d.text, acc.text); }
        else if(d.type === "thinking_delta"){ b.thinking = (b.thinking || "") + d.thinking; }
        else if(d.type === "signature_delta"){ b.signature = d.signature; }
        else if(d.type === "input_json_delta"){ partial[ev.index] = (partial[ev.index] || "") + d.partial_json; }
        else if(d.type === "citations_delta" && d.citation){
          (b.citations = b.citations || []).push(d.citation);
          if(d.citation.url) acc.sources.push({url:d.citation.url, title:d.citation.title || d.citation.url});
        }
        break;
      }
      case "content_block_stop": {
        const b = blocks[ev.index];
        if(b && ev.index in partial){
          try{ b.input = partial[ev.index] ? JSON.parse(partial[ev.index]) : {}; }catch(e){ b.input = {}; }
          if(b.type === "server_tool_use") out.searches++;
        }
        break;
      }
      case "message_delta": {
        if(ev.delta && ev.delta.stop_reason) out.stop = ev.delta.stop_reason;
        if(ev.usage && ev.usage.output_tokens != null) out.usage.out = ev.usage.output_tokens;
        if(ev.usage && ev.usage.server_tool_use && ev.usage.server_tool_use.web_search_requests != null) out.searches = ev.usage.server_tool_use.web_search_requests;
        break;
      }
      case "error": {
        const err = new Error((ev.error && ev.error.message) || "ストリーミング中にエラーが発生しました");
        err.status = ev.error && ev.error.type === "overloaded_error" ? 529 : 500;
        throw err;
      }
    }
  };
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
      handle(ev);
    }
  }
  return out;
}

/**
 * RP.ai.run({feature, system, messages|prompt, maxTokens, effort, tools, onText})
 * → {text, sources, stop}
 */
RP.ai = {};
RP.ai.run = async function(opts){
  await RP.ensureKey();
  const s = RP.settings();
  if(s.budget > 0 && RP.monthCost() >= s.budget){
    if(!confirm("今月のAI利用料が予算上限（" + RP.yen(s.budget) + "）に達しています。続けますか？")) throw new Error("予算上限のため中止しました");
  }
  const model = opts.model || s.model;
  let messages = opts.messages || [{role:"user", content: opts.prompt}];
  const acc = {text:"", sources:[]};
  const total = {in:0,out:0,cr:0,cw:0}; let searches = 0, stop = null;
  for(let turn = 0; turn < 4; turn++){
    const body = {
      model, max_tokens: opts.maxTokens || 8000, stream: true,
      system: [
        {type:"text", text: BASE_SYSTEM + "\n\n" + RP.brandContext(), cache_control:{type:"ephemeral"}},
        {type:"text", text: opts.system || ""}
      ].filter(b => b.text),
      messages,
      output_config: {effort: opts.effort || s.effort}
    };
    if(opts.tools) body.tools = opts.tools;
    if(s.fallback && !noFallback) body.fallbacks = "default";
    let r;
    try{ r = await streamOnce(body, opts.onText, acc); }
    catch(e){
      // If the fallback beta is not accepted for this key/org, retry once without it.
      if(e.status === 400 && body.fallbacks && /fallback|beta/i.test(e.message)){ noFallback = true; turn--; continue; }
      throw e;
    }
    ["in","out","cr","cw"].forEach(k => total[k] += r.usage[k]);
    searches += r.searches; stop = r.stop;
    if(r.stop === "pause_turn"){ messages = messages.concat([{role:"assistant", content: r.blocks.filter(Boolean)}]); continue; }
    break;
  }
  logUsage(opts.feature || "other", model, total, searches);
  if(stop === "refusal") throw new Error("AIがこの依頼への回答を控えました。表現を変えて再度お試しください。");
  if(stop === "max_tokens") acc.text += "\n\n（※ 出力が長すぎたため途中で終了しました）";
  const seen = new Set();
  acc.sources = acc.sources.filter(x => !seen.has(x.url) && seen.add(x.url));
  return {text: acc.text, sources: acc.sources, stop};
};
/** Stream into an element as rendered markdown. */
RP.ai.into = async function(el, opts){
  el.hidden = false; el.classList.remove("placeholder");
  el.innerHTML = '<span class="cursor"></span>';
  let raf = 0;
  const r = await RP.ai.run(Object.assign({}, opts, {
    onText: (d, full) => {
      if(raf) return;
      raf = requestAnimationFrame(() => { raf = 0; el.innerHTML = RP.md(full) + '<span class="cursor"></span>'; });
    }
  }));
  if(raf) cancelAnimationFrame(raf);
  el.innerHTML = RP.md(r.text);
  return r;
};
/** Ask for JSON; show a progress counter on the button while it streams. */
RP.ai.json = async function(opts, btn){
  const r = await RP.ai.run(Object.assign({}, opts, {
    onText: (d, full) => { if(btn) btn.innerHTML = '<span class="spinner"></span>AIが作成中… ' + full.length + "字"; }
  }));
  return RP.parseJSON(r.text);
};
RP.errorBox = function(el, e){
  const msg = e && e.message ? e.message : String(e);
  let hint = "";
  if(e && e.status === 401) hint = "→ APIキーが正しいか確認してください。";
  else if(e && e.status === 429) hint = "→ 利用上限に達しました。少し待ってから再度お試しください。";
  else if(e && (e.status === 529 || e.status >= 500)) hint = "→ AIサーバーが混雑しています。少し待ってから再度お試しください。";
  else if(/Failed to fetch|NetworkError/i.test(msg)) hint = "→ ネットワーク接続を確認してください。";
  el.hidden = false; el.classList.remove("placeholder");
  el.innerHTML = `<div class="err-box">エラー：${RP.esc(msg)}${hint ? "<br/>" + RP.esc(hint) : ""}</div>`;
};

/* ================= library helper (shared) ================= */
RP.saveToLibrary = function(item){
  const lib = RP.store.get("library", []);
  const rec = Object.assign({id: RP.uid(), created: new Date().toISOString()}, item);
  lib.unshift(rec);
  RP.store.set("library", lib.slice(0, 1000));
  RP.toast("ライブラリに保存しました", "ok");
  return rec;
};
RP.addEvents = function(events){
  const cal = RP.store.get("calendar", []);
  events.forEach(e => cal.push(Object.assign({id: RP.uid(), status:"idea"}, e)));
  RP.store.set("calendar", cal);
};

/* ================= backup ================= */
RP.backup = function(){
  const data = {app:"ricepia-marketing", version:1, exported:new Date().toISOString(), data:{}};
  RP.store.keys().filter(k => k !== "key").forEach(k => data.data[k] = RP.store.get(k));
  RP.download("ricepia-marketing-backup-" + RP.today() + ".json", JSON.stringify(data, null, 1), "application/json");
};
RP.restore = function(file){
  const fr = new FileReader();
  fr.onload = () => {
    try{
      const j = JSON.parse(fr.result);
      if(j.app !== "ricepia-marketing" || !j.data) throw new Error("形式が違います");
      if(!confirm("現在のデータをバックアップの内容で上書きします。よろしいですか？")) return;
      Object.keys(j.data).forEach(k => { if(k !== "key") RP.store.set(k, j.data[k]); });
      RP.toast("復元しました", "ok"); setTimeout(() => location.reload(), 600);
    }catch(e){ RP.toast("復元に失敗しました：" + e.message, "err"); }
  };
  fr.readAsText(file);
};
RP.resetAll = function(){
  if(!confirm("ブランド設定・KPI・顧客・カレンダー・ライブラリなど全データを削除します。元に戻せません。よろしいですか？")) return;
  RP.store.keys().forEach(k => RP.store.del(k));
  location.reload();
};

/* ================= routing ================= */
RP.VIEWS = ["home","improve","sales","studio","doctor","reviews","campaign","calendar","customers","research","library","brand","settings"];
RP.go = function(name, params){
  if(name === "dash") name = "home"; // old bookmark
  if(!RP.VIEWS.includes(name)) name = "home";
  RP.$$(".view").forEach(v => v.hidden = v.id !== "v-" + name);
  RP.$$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.go === name));
  const m = RP.mod[name];
  if(m && m.show) m.show(params || {});
  if(location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  if(RP.refreshBadges) RP.refreshBadges();
  const nb = RP.$('#nav button[data-go="' + name + '"]');
  if(nb && nb.scrollIntoView && window.innerWidth <= 900) nb.scrollIntoView({inline:"center", block:"nearest"});
  window.scrollTo(0, 0);
};
RP.boot = function(){
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-go]");
    if(g){ e.preventDefault(); RP.go(g.dataset.go); }
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape") RP.$$(".modal").forEach(m => m.hidden = true);
    if(e.key === "Enter" && e.target.id === "keyInput") RP.saveKey();
  });
  RP.$$(".modal").forEach(m => m.addEventListener("click", e => { if(e.target === m) m.hidden = true; }));
  RP.$("#sgRestore").addEventListener("change", e => { if(e.target.files[0]) RP.restore(e.target.files[0]); e.target.value = ""; });
  Object.keys(RP.mod).forEach(k => { try{ RP.mod[k].init && RP.mod[k].init(); }catch(e){ console.error(k, e); } });
  RP.renderKey(); RP.renderCost();
  window.addEventListener("hashchange", () => RP.go(location.hash.slice(1)));
  RP.go(location.hash.slice(1) || "home");
};
})();

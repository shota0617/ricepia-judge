/* らいすぴあ ミーティング — video meeting (WebRTC mesh over PeerJS) + live transcription (Web Speech API) */
(function(){
"use strict";
const {$, $$, esc} = M;
const PREFIX = "ricepia-mtg-";
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

const C = {
  peer:null, isHost:false, code:"", myId:"", name:"", role:"当社", hostConn:null, inRoom:false, joining:false,
  local:null, mic:null, cam:null, placeholder:null, phTimer:0, screen:null, camBeforeShare:null,
  conns:new Map(), calls:new Map(), remote:new Map(), names:new Map(), roles:new Map(), states:new Map(), seen:new Set(),
  // 参加を認めた相手（主催者が許可した人。参加者は、主催者と、主催者から知らされた人）。認める前は 映像・音声・会議の記録を返さない
  allowed:new Set(), pendIntro:new Map(), pendCall:new Map(), asking:new Set(),
  muted:false, camOff:false, sharing:false, rec:null, seq:0, timer:0, saveT:0, unread:0, pane:"", clockOffset:0,
  stt:{want:false, running:false, r:null, lang:"ja-JP", lastErr:"", interimT:0, fails:0}
};
M.call = C;

/* ---------- signaling options (default: PeerJS public cloud; self-host via ?peerhost=...) ---------- */
function peerOptions(){
  const q = new URLSearchParams(location.search), o = {debug:0};
  if(q.get("peerhost")){
    o.host = q.get("peerhost");
    o.port = Number(q.get("peerport") || (q.get("peersecure") === "0" ? 80 : 443));
    o.path = q.get("peerpath") || "/";
    o.secure = q.get("peersecure") !== "0";
  }
  return o;
}
const genCode = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(8)); r.forEach(x => s += a[x % a.length]); return s; };
const normCode = s => String(s || "").toLowerCase().replace(/^.*#join=/, "").replace(/[^a-z0-9]/g, "");
const showCode = c => c.slice(0, 4) + "-" + c.slice(4);
const inviteUrl = () => location.origin + location.pathname + location.search + "#join=" + C.code;

/* ================= media ================= */
function placeholderTrack(){
  const cv = document.createElement("canvas"); cv.width = 640; cv.height = 360;
  const g = cv.getContext("2d");
  const draw = () => {
    g.fillStyle = "#2b2b20"; g.fillRect(0, 0, 640, 360);
    g.fillStyle = "#4a4a38"; g.beginPath(); g.arc(320, 170, 64, 0, Math.PI*2); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 56px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText((C.name || "?").slice(0, 1), 320, 172);
  };
  draw(); clearInterval(C.phTimer); C.phTimer = setInterval(draw, 1000);
  return cv.captureStream(2).getVideoTracks()[0];
}
function silentTrack(){
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const dst = ac.createMediaStreamDestination();
  const t = dst.stream.getAudioTracks()[0]; t.enabled = false; return t;
}
async function acquire(){
  if(C.local) return C.local;
  const md = navigator.mediaDevices;
  if(!md || !md.getUserMedia) throw new Error("このブラウザではカメラ・マイクを使えません（https で開いているか確認してください）");
  let s = null;
  try{ s = await md.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}, video:{width:{ideal:1280}, height:{ideal:720}, facingMode:"user"}}); }
  catch(e){
    try{ s = await md.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}); M.toast("カメラが使えないため音声のみで参加します"); }
    catch(e2){ M.toast("カメラ・マイクが使えません。画面とチャットのみで参加できます", "err"); }
  }
  C.mic = s && s.getAudioTracks()[0] || null;
  C.cam = s && s.getVideoTracks()[0] || null;
  C.local = new MediaStream([C.mic || silentTrack(), C.cam || (C.placeholder = placeholderTrack())]);
  if(!C.mic) C.muted = true;
  if(!C.cam) C.camOff = true;
  applyEnabled();
  return C.local;
}
function applyEnabled(){
  if(C.mic) C.mic.enabled = !C.muted;
  if(C.cam) C.cam.enabled = !C.camOff;
}
function stopMedia(){
  [C.mic, C.cam, C.screen, C.placeholder].forEach(t => { try{ t && t.stop(); }catch(e){} });
  clearInterval(C.phTimer);
  C.local = C.mic = C.cam = C.screen = C.placeholder = null;
  if(meterRaf){ cancelAnimationFrame(meterRaf); meterRaf = 0; }
}

/* lobby preview + mic level meter */
let meterRaf = 0;
async function preview(){
  const err = $("#lbErr"); err.hidden = true;
  try{ await acquire(); }
  catch(e){ M.errorBox(err, e); return; }
  const v = $("#lbVideo"); v.srcObject = C.local; v.muted = true; v.play().catch(() => {});
  $("#lbPh").hidden = true;
  paintLobby();
  if(C.mic && !meterRaf){
    try{
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const an = ac.createAnalyser(); an.fftSize = 256;
      ac.createMediaStreamSource(new MediaStream([C.mic])).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0; for(const x of buf) peak = Math.max(peak, Math.abs(x - 128));
        $("#lbMeter").style.width = (C.muted ? 0 : Math.min(100, peak * 1.6)) + "%";
        meterRaf = C.inRoom ? 0 : requestAnimationFrame(loop);
      };
      loop();
    }catch(e){}
  }
}
function paintLobby(){
  $("#lbMic").classList.toggle("off", C.muted); $("#lbMic").textContent = C.muted ? "🔇" : "🎤";
  $("#lbCam").classList.toggle("off", C.camOff); $("#lbCam").textContent = "📷";
  $("#lbVideo").style.visibility = C.camOff ? "hidden" : "visible";
}

/* ================= room lifecycle ================= */
function loadPeerLib(){
  if(window.Peer) return Promise.resolve();
  return Promise.reject(new Error("通話ライブラリ（PeerJS）を読み込めませんでした。ネットワーク接続を確認し、ページを再読み込みしてください"));
}
function lobbyValues(){
  const name = $("#lbName").value.trim();
  if(!name){ $("#lbName").focus(); throw new Error("表示名を入力してください"); }
  M.saveSettings({name});
  return name;
}
async function startHost(){
  const err = $("#lbErr"); err.hidden = true;
  let name; try{ name = lobbyValues(); }catch(e){ M.toast(e.message, "err"); return; }
  const btn = $("#btnHost"); M.busy(btn, true, "準備中…");
  try{
    await loadPeerLib(); await acquire();
    C.isHost = true; C.name = name; C.role = "当社";
    resetRoom();
    await openPeer(genCode(), 0);
    const startedAt = Date.now();
    C.rec = {
      id:"m_" + C.code + "_" + startedAt, code:C.code, source:"live", role:"host",
      title: $("#lbTitle").value.trim() || "お客様ミーティング " + M.dt(startedAt),
      customer: $("#lbCustomer").value.trim(), startedAt, endedAt:null,
      participants:{}, lines:[], chat:[], notes:"", analysis:null
    };
    enterRoom();
  }catch(e){ M.errorBox(err, e); destroyPeer(); }
  finally{ M.busy(btn, false); }
}
function openPeer(code, attempt){
  return new Promise((res, rej) => {
    const p = new Peer(code ? PREFIX + code : undefined, peerOptions());
    let opened = false;
    p.on("open", id => { opened = true; C.peer = p; C.myId = id; if(code) C.code = code; bindPeer(p); res(); });
    p.on("error", e => {
      if(opened) return;
      p.destroy();
      if(e.type === "unavailable-id" && attempt < 3) return openPeer(genCode(), attempt + 1).then(res, rej);
      rej(new Error(peerErrMsg(e)));
    });
  });
}
function peerErrMsg(e){
  const t = e && e.type;
  if(t === "browser-incompatible") return "このブラウザはビデオ通話に対応していません。Chrome / Edge / Safari の最新版でお試しください";
  if(t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") return "接続サーバーにつながりません。ネットワーク（社内ネットワークの制限など）を確認してください";
  if(t === "peer-unavailable") return "ミーティングが見つかりません。コードを確認するか、主催者が開始するまでお待ちください";
  return (e && e.message) || "接続エラーが発生しました";
}
async function joinRoom(){
  const err = $("#lbErr"); err.hidden = true;
  let name; try{ name = lobbyValues(); }catch(e){ M.toast(e.message, "err"); return; }
  const code = normCode($("#lbCode").value);
  if(code.length !== 8){ M.toast("8文字のミーティングコードを入力してください", "err"); $("#lbCode").focus(); return; }
  const btn = $("#btnJoin"); M.busy(btn, true, "接続中…");
  try{
    await loadPeerLib(); await acquire();
    C.isHost = false; C.name = name; C.role = $("#lbRole").value; C.code = code;
    resetRoom();
    await openPeer(null, 0);
    await new Promise((res, rej) => {
      C.joining = {res, rej};
      C.hostConn = connectTo(PREFIX + code);
      // 主催者が「許可」を押すまで待つ（つながったら ボタンの文を かえる）
      setTimeout(() => { if(C.joining && C.hostConn && C.hostConn.open) btn.innerHTML = '<span class="spinner"></span>主催者の許可を待っています…'; }, 3000);
      setTimeout(() => { if(C.joining){ C.joining = false; rej(new Error(C.hostConn && C.hostConn.open ? "主催者が参加を許可しませんでした（時間切れ）" : "主催者からの応答がありません。コードを確認してください")); } }, 120000);
    });
    enterRoom();
  }catch(e){ M.errorBox(err, e); destroyPeer(); }
  finally{ M.busy(btn, false); }
}
function bindPeer(p){
  p.on("connection", conn => setupConn(conn));
  p.on("call", call => {
    if(C.allowed.has(call.peer)){ call.answer(C.local); setupCall(call); return; }
    // まだ参加を認めていない相手：認めるまで応答しない（しばらく認められなければ切る）
    const old = C.pendCall.get(call.peer); if(old) try{ old.close(); }catch(e){}
    C.pendCall.set(call.peer, call);
    setTimeout(() => { if(C.pendCall.get(call.peer) === call){ C.pendCall.delete(call.peer); try{ call.close(); }catch(e){} } }, 120000);
  });
  p.on("disconnected", () => { if(C.inRoom && !p.destroyed){ setTimeout(() => { try{ p.reconnect(); }catch(e){} }, 1500); } });
  p.on("error", e => {
    if(e.type === "peer-unavailable"){
      if(C.joining && String(e.message || "").includes(PREFIX + C.code)){ const j = C.joining; C.joining = false; j.rej(new Error(peerErrMsg(e))); }
      return; // someone left before we reached them
    }
    if(C.inRoom) M.toast(peerErrMsg(e), "err");
  });
}
function destroyPeer(){
  try{ C.peer && C.peer.destroy(); }catch(e){}
  C.peer = null; C.conns.clear(); C.calls.clear(); C.hostConn = null; C.joining = false;
  C.allowed.clear(); C.pendIntro.clear(); C.pendCall.forEach(c => { try{ c.close(); }catch(e){} }); C.pendCall.clear(); C.asking.clear();
  $$(".admitAsk").forEach(e => e.remove());
}
// 参加を認める：とっておいた自己紹介と着信を いま受けとる
function allow(pid){
  if(C.allowed.has(pid)) return;
  C.allowed.add(pid);
  const conn = C.conns.get(pid);
  if(conn && conn.open) send(conn, {type:"intro", name:C.name, role:C.role, state:myState()});
  const intro = C.pendIntro.get(pid); C.pendIntro.delete(pid);
  if(intro) onData(pid, intro);
  const call = C.pendCall.get(pid); C.pendCall.delete(pid);
  if(call){ call.answer(C.local); setupCall(call); }
}
// 主催者：参加を希望した人を 許可するか きく（許可するまで 会議の中身は 何も送らない）
function askAdmit(pid){
  if(C.asking.has(pid)) return;
  C.asking.add(pid);
  const intro = C.pendIntro.get(pid) || {};
  const nm = String(intro.name || "名前なし").slice(0, 40), role = intro.role === "お客様" ? "お客様" : "当社";
  const box = document.createElement("div");
  box.className = "admitAsk";
  box.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:" + (150 + 64 * $$(".admitAsk").length) + "px;z-index:450;background:#fff;color:#222;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.3);padding:10px 12px;display:flex;gap:8px;align-items:center;max-width:92vw;";
  box.innerHTML = '<span style="font-size:14px;"><b>' + esc(nm) + "</b>さん（" + esc(role) + "）が参加を希望しています</span>" +
    '<button class="btn btn-gold btn-sm" data-a="ok">許可</button><button class="btn btn-ghost btn-sm" data-a="no">拒否</button>';
  document.body.appendChild(box);
  const done = ok => {
    box.remove(); C.asking.delete(pid);
    const conn = C.conns.get(pid);
    if(!conn || !conn.open){ C.pendIntro.delete(pid); return; }
    if(!ok){ send(conn, {type:"deny"}); C.pendIntro.delete(pid); const call = C.pendCall.get(pid); C.pendCall.delete(pid); try{ call && call.close(); }catch(e){} setTimeout(() => { try{ conn.close(); }catch(e){} }, 300); return; }
    C.allowed.forEach(id => { if(id !== pid) send(C.conns.get(id), {type:"admit", id:pid}); });   // 参加している人にも 知らせる（そのあと直接つながってくる）
    allow(pid);
    sendWelcome(pid);
  };
  box.querySelector('[data-a="ok"]').onclick = () => done(true);
  box.querySelector('[data-a="no"]').onclick = () => done(false);
}
function sendWelcome(pid){
  send(C.conns.get(pid), {type:"welcome",
    peers: Array.from(C.conns.keys()).filter(id => id !== pid && C.allowed.has(id)).map(id => ({id, name:C.names.get(id) || ""})),
    meeting:{title:C.rec.title, customer:C.rec.customer, startedAt:C.rec.startedAt, code:C.code},
    lines:C.rec.lines, chat:C.rec.chat, now:Date.now()});
}

function resetRoom(){
  C.seen.clear(); C.names.clear(); C.roles.clear(); C.states.clear(); C.remote.clear(); C.unread = 0; C.seq = 0;
  C.pane = ""; C.clockOffset = 0;
  $("#grid").innerHTML = "";
  C.rec = {id:"pending", participants:{}, lines:[], chat:[], notes:"", startedAt:Date.now()};
}
function enterRoom(){
  C.inRoom = true;
  C.names.set(C.myId, C.name); C.roles.set(C.myId, C.role);
  C.rec.participants[C.myId] = {name:C.name, role:C.role};
  $("#room").hidden = false; document.body.style.overflow = "hidden";
  tile(C.myId, true);
  attach(C.myId, C.local);
  $("#rTitle").textContent = C.rec.title;
  $("#rCode").textContent = showCode(C.code);
  clearInterval(C.timer);
  C.timer = setInterval(() => { $("#rTimer").textContent = M.clock(Date.now() - C.rec.startedAt); }, 1000);
  $("#memoNotes").value = C.rec.notes || "";
  $("#sttLang").value = C.stt.lang;
  renderTranscript(); renderChat(); renderMemo();
  setPane(window.innerWidth > 900 ? "tr" : "");
  paintBar(); persist();
  if(C.isHost) addSys(C.name + "さんがミーティングを開始しました");
  if($("#lbStt").checked) sttStart();
  if(C.isHost) setTimeout(() => invite(), 400);
  history.replaceState(null, "", location.pathname + location.search + "#meet");
}
function leave(notify){
  if(!C.inRoom) return;
  if(notify !== false) broadcast({type: C.isHost ? "end" : "bye"});
  const recDone = M.recorder ? M.recorder.stop(true) : Promise.resolve();
  sttStop(true);
  C.inRoom = false;
  C.rec.endedAt = Date.now();
  const saved = persist(true);
  clearInterval(C.timer);
  setTimeout(() => { destroyPeer(); stopMedia(); }, 300);
  $("#room").hidden = true; document.body.style.overflow = "";
  $("#lbVideo").srcObject = null; $("#lbPh").hidden = false;
  const rec = C.rec;
  if(saved) M.toast("会議の記録を保存しました（" + rec.lines.length + "件の発言）", "ok");
  else {
    // localStorage is full: never lose the meeting silently
    M.download(M.safeName(rec.title) + "_議事録.md", M.minutesMd(rec), "text/markdown;charset=utf-8");
    M.toast("ブラウザの保存容量が足りず記録を保存できなかったため、文字起こしをファイルに書き出しました。「履歴」で古い会議を削除してください", "err");
  }
  recDone.then(() => {
    M.go(rec.lines.length || rec.notes || rec.audio ? "analyze" : "history", {meetingId:rec.id});
    if(saved && M.auto) M.auto.afterMeeting(rec.id); // analysis → backlog → Issue → development, as configured
  });
}
// Notices about recording / transcription are shown locally; peers derive their own from our `state`.
C.notifyAll = text => addSys(text);
C.stateChanged = () => stateChanged();
function confirmLeave(){
  const msg = C.isHost ? "ミーティングを終了しますか？\n参加者全員の会議も終了します。" : "ミーティングから退出しますか？";
  if(confirm(msg)) leave();
}

/* ================= data channel ================= */
function myState(){ return {muted:C.muted, camOff:C.camOff, sharing:C.sharing, stt:C.stt.want && !C.muted, sttOn:C.stt.want, rec:!!(M.recorder && M.recorder.active)}; }
const now = () => Date.now() + C.clockOffset; // host clock, so every participant's lines share one timeline
// When two peers open connections to each other at the same time, both sides keep the one started by the smaller id.
const starter = c => c._out ? C.myId : c.peer;
function connectTo(id){ const c = C.peer.connect(id, {reliable:true}); c._out = true; setupConn(c); return c; }
function callTo(id){ const c = C.peer.call(id, C.local, {metadata:{name:C.name}}); if(c){ c._out = true; setupCall(c); } }
function send(conn, msg){ try{ if(conn && conn.open) conn.send(msg); }catch(e){} }
function broadcast(msg){ C.conns.forEach((c, pid) => { if(C.allowed.has(pid)) send(c, msg); }); }
function setupConn(conn){
  conn.on("open", () => {
    const ex = C.conns.get(conn.peer);
    if(ex && ex !== conn && ex.open){
      if(starter(conn) > starter(ex)){ conn.close(); return; }
      C.conns.set(conn.peer, conn); ex.close();
    } else C.conns.set(conn.peer, conn);
    if(conn === C.hostConn) C.allowed.add(conn.peer);   // 参加者から見た主催者（コードで決まる相手）
    if(C.allowed.has(conn.peer)) send(conn, {type:"intro", name:C.name, role:C.role, state:myState()});
    if(conn === C.hostConn) send(conn, {type:"hello"});
  });
  conn.on("data", d => { try{ onData(conn.peer, d); }catch(e){ console.error(e); } });
  conn.on("close", () => {
    if(C.conns.get(conn.peer) === conn) C.conns.delete(conn.peer);
    // a duplicate connection being closed is not the participant leaving
    setTimeout(() => { const cur = C.conns.get(conn.peer); if(!cur || !cur.open) dropPeer(conn.peer); }, 1500);
  });
  conn.on("error", () => {});
}
function onData(pid, d){
  if(!d || typeof d !== "object") return;
  if(!C.allowed.has(pid)){
    // まだ参加を認めていない相手：自己紹介だけ とっておき（主催者は 参加の希望として きく）、ほかは 受けとらない
    if(d.type === "intro") C.pendIntro.set(pid, {type:"intro", name:String(d.name || "").slice(0, 40), role:d.role, state:d.state});
    else if(d.type === "hello" && C.isHost && C.inRoom) askAdmit(pid);
    return;
  }
  switch(d.type){
    case "hello":
      if(!C.isHost) return;
      sendWelcome(pid);
      break;
    case "admit":
      if(C.isHost || !C.hostConn || pid !== C.hostConn.peer) break;   // 知らせてよいのは主催者だけ
      if(typeof d.id === "string" && d.id && d.id !== C.myId) allow(d.id.slice(0, 80));
      break;
    case "deny":
      if(C.joining && C.hostConn && pid === C.hostConn.peer){ const j = C.joining; C.joining = false; j.rej(new Error("主催者が参加を許可しませんでした")); }
      break;
    case "welcome": {
      if(!C.joining || !C.hostConn || pid !== C.hostConn.peer) return;
      const mt = d.meeting || {};
      if(Number.isFinite(Number(d.now))) C.clockOffset = Number(d.now) - Date.now();
      const startedAt = Number(mt.startedAt) || Date.now();
      const id = "m_" + C.code + "_" + startedAt;
      const prev = M.meeting(id), early = C.rec;
      C.rec = prev || {id, code:C.code, source:"live", role:"guest", title:String(mt.title || "ミーティング").slice(0, 80), customer:String(mt.customer || "").slice(0, 80),
        startedAt, endedAt:null, participants:{}, lines:[], chat:[], notes:"", analysis:null};
      C.rec.endedAt = null;
      Object.assign(C.rec.participants, early.participants);
      (Array.isArray(d.lines) ? d.lines : []).forEach(l => { if(l && typeof l === "object") mergeLine(cleanLine(l, startedAt)); });
      (Array.isArray(d.chat) ? d.chat : []).forEach(c => { if(c && typeof c === "object"){ const x = cleanChat(c, startedAt); if(x.text && !C.rec.chat.some(y => y.id === x.id)) C.rec.chat.push(x); } });
      const j = C.joining; C.joining = false; j.res();
      // mesh: open data + media to everyone already in the room (the host included)
      const others = (Array.isArray(d.peers) ? d.peers : []).map(p => String(p && p.id || "").slice(0, 80)).filter(x => x && x !== C.myId);
      others.forEach(allow);   // 主催者が知らせた人だけ
      others.forEach(x => { if(!C.conns.has(x)) connectTo(x); });
      [C.hostConn.peer].concat(others).forEach(callTo);
      break;
    }
    case "intro": {
      const first = !C.seen.has(pid);
      C.seen.add(pid);
      if(first){ // the display name and role are fixed at the first intro (no renaming into someone else mid-meeting)
        C.names.set(pid, String(d.name || "参加者").slice(0, 40));
        C.roles.set(pid, d.role === "お客様" ? "お客様" : "当社");
      }
      const st = cleanState(d.state);
      C.states.set(pid, st);
      C.rec.participants[pid] = {name:C.names.get(pid), role:C.roles.get(pid)};
      tile(pid, false); paintTile(pid);
      if(first){
        addSys(C.names.get(pid) + "さんが参加しました");
        if(st.sttOn) addSys("🔴 " + C.names.get(pid) + "さんの発言は文字起こしされています");
        if(st.rec) addSys("⏺ " + C.names.get(pid) + "さんがこの会議を録音しています");
      }
      paintBar(); persist();
      break;
    }
    case "state": {
      if(!C.seen.has(pid)) break;
      const prev = C.states.get(pid) || {}, st = cleanState(d.state), nm = C.names.get(pid);
      if(!!prev.sttOn !== st.sttOn) addSys(st.sttOn ? "🔴 " + nm + "さんの文字起こしが始まりました（発言はテキストとして記録されます）" : "⏸ " + nm + "さんの文字起こしが止まりました");
      if(!!prev.rec !== st.rec) addSys(st.rec ? "⏺ " + nm + "さんが録音を開始しました（音声が記録されます）" : "⏹ " + nm + "さんが録音を停止しました");
      C.states.set(pid, st); paintTile(pid); paintBar();
      break;
    }
    case "line": {
      if(!d.line || !C.seen.has(pid)) break;
      const l = peerLine(d.line, pid);
      if(l.text && mergeLine(l)){ appendLine(l); persist(); }
      caption(pid, l.text, true);
      break;
    }
    case "interim": if(C.seen.has(pid)) caption(pid, String(d.text || "").slice(0, 500), false); break;
    case "chat": if(d.msg && C.seen.has(pid)){ const c = peerChat(d.msg, pid); if(c.text) addChat(c, false); } break;
    case "bye": dropPeer(pid); break;
    case "end":
      // only the host can end the meeting for everyone
      if(C.isHost || !C.hostConn || pid !== C.hostConn.peer) break;
      M.toast("主催者がミーティングを終了しました");
      leave(false);
      break;
  }
}
const bool = v => v === true;
function cleanState(s){ s = s && typeof s === "object" ? s : {}; return {muted:bool(s.muted), camOff:bool(s.camOff), sharing:bool(s.sharing), stt:bool(s.stt), sttOn:bool(s.sttOn), rec:bool(s.rec)}; }
// A peer's own line: identity and time come from our side, never from the payload.
function peerLine(l, pid){
  return {id:pid + "-" + String(l.id || M.uid()).slice(-40), at:now(), who:C.names.get(pid) || "参加者", role:C.roles.get(pid) || "当社", pid, text:String(l.text || "").slice(0, 2000)};
}
function peerChat(c, pid){ return {id:pid + "-" + String(c.id || M.uid()).slice(-40), at:now(), who:C.names.get(pid) || "参加者", pid, text:String(c.text || "").slice(0, 2000)}; }
// History sent by the host in `welcome`: trusted source, but normalise types so rendering can't break.
function cleanLine(l, base){
  const at = Number(l.at);
  return {id:String(l.id || M.uid()).slice(0, 120), at:Number.isFinite(at) ? at : base, who:String(l.who || "参加者").slice(0, 40),
    role:l.role === "お客様" ? "お客様" : "当社", pid:String(l.pid || "").slice(0, 80), text:String(l.text || "").slice(0, 2000)};
}
function cleanChat(c, base){ const at = Number(c.at); return {id:String(c.id || M.uid()).slice(0, 120), at:Number.isFinite(at) ? at : base, who:String(c.who || "").slice(0, 40), pid:String(c.pid || "").slice(0, 80), text:String(c.text || "").slice(0, 2000)}; }
function dropPeer(pid){
  C.pendIntro.delete(pid);
  if(!C.seen.has(pid) && !C.conns.has(pid) && !C.calls.has(pid)) return;
  const c = C.conns.get(pid); C.conns.delete(pid); try{ c && c.close(); }catch(e){}
  const call = C.calls.get(pid); C.calls.delete(pid); try{ call && call.close(); }catch(e){}
  C.remote.delete(pid);
  const t = $('#grid .tile[data-pid="' + CSS.escape(pid) + '"]'); if(t) t.remove();
  if(C.seen.has(pid) && C.inRoom){ C.seen.delete(pid); addSys((C.names.get(pid) || "参加者") + "さんが退出しました"); }
  layout(); paintBar();
  if(!C.isHost && C.hostConn && pid === C.hostConn.peer && C.inRoom) M.toast("主催者との接続が切れました。ほかの参加者とは会議を続けられます");
}

/* ================= media connections ================= */
function setupCall(call){
  if(!call) return;
  const old = C.calls.get(call.peer);
  if(old && old !== call && old.open !== false){
    // simultaneous calls in both directions: both ends keep the one started by the smaller id
    if(starter(call) > starter(old)){ try{ call.close(); }catch(e){} return; }
    try{ old.close(); }catch(e){}
  }
  C.calls.set(call.peer, call);
  call.on("stream", s => { tile(call.peer, false); attach(call.peer, s); });
  call.on("close", () => { if(C.calls.get(call.peer) === call) C.calls.delete(call.peer); });
  call.on("error", () => {});
}
function outgoingVideo(track){
  // swap the track inside the local stream (used for new calls) and on every live sender
  const cur = C.local.getVideoTracks()[0];
  if(cur) C.local.removeTrack(cur);
  C.local.addTrack(track);
  C.calls.forEach(call => {
    const pc = call.peerConnection; if(!pc) return;
    const s = pc.getSenders().find(x => x.track && x.track.kind === "video");
    if(s) s.replaceTrack(track).catch(() => {});
  });
  attach(C.myId, C.local);
}
async function toggleShare(){
  if(C.sharing){ stopShare(); return; }
  try{
    const s = await navigator.mediaDevices.getDisplayMedia({video:true, audio:false});
    C.screen = s.getVideoTracks()[0];
    C.camBeforeShare = C.local.getVideoTracks()[0];
    C.screen.onended = () => stopShare();
    outgoingVideo(C.screen);
    C.sharing = true; stateChanged();
  }catch(e){ if(e && e.name !== "NotAllowedError") M.toast("画面共有を開始できませんでした", "err"); }
}
function stopShare(){
  if(!C.sharing) return;
  C.sharing = false;
  try{ C.screen && C.screen.stop(); }catch(e){}
  C.screen = null;
  if(C.camBeforeShare && C.local) outgoingVideo(C.camBeforeShare);
  stateChanged();
}
function toggleMic(){
  if(!C.mic){ M.toast("マイクが使えません（ブラウザの許可を確認してください）", "err"); return; }
  C.muted = !C.muted; applyEnabled();
  if(C.muted) sttPause(); else sttRun();
  stateChanged();
}
function toggleCam(){
  if(!C.cam){ M.toast("カメラが使えません（ブラウザの許可を確認してください）", "err"); return; }
  C.camOff = !C.camOff; applyEnabled(); stateChanged();
}
function stateChanged(){
  if(!C.inRoom){ paintLobby(); return; }
  broadcast({type:"state", state:myState()});
  paintTile(C.myId); paintBar();
}

/* ================= live transcription ================= */
function sttStart(){
  if(!SR){ M.toast("このブラウザは自動文字起こしに未対応です。Chrome / Edge / Safari をお使いください（他の参加者の文字起こしは届きます）", "err"); return; }
  if(C.stt.want) return;
  C.stt.want = true; C.stt.fails = 0;
  addSys("🔴 " + C.name + "さんの文字起こしを開始しました（発言はテキストとして記録されます）");
  if(C.muted) M.toast("ミュート中は文字起こしを一時停止します");
  sttRun(); stateChanged();
}
function sttStop(silent){
  if(!C.stt.want) return;
  C.stt.want = false;
  sttPause();
  if(!silent){ addSys("⏸ " + C.name + "さんの文字起こしを停止しました"); stateChanged(); }
}
function sttPause(){
  const r = C.stt.r; C.stt.r = null; C.stt.running = false;
  if(r){ r.onend = null; try{ r.stop(); }catch(e){} }
  caption(C.myId, "", false); broadcast({type:"interim", text:""});
}
function sttRun(){
  if(!SR || !C.stt.want || C.muted || C.stt.running || !C.inRoom) return;
  const r = new SR();
  r.lang = C.stt.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
  r.onresult = e => {
    C.stt.fails = 0;
    let interim = "";
    for(let i = e.resultIndex; i < e.results.length; i++){
      const res = e.results[i], txt = (res[0] && res[0].transcript || "").trim();
      if(res.isFinal){ if(txt) emitLine(txt); }
      else interim += txt;
    }
    caption(C.myId, interim, false);
    clearTimeout(C.stt.interimT);
    C.stt.interimT = setTimeout(() => broadcast({type:"interim", text:interim}), 120);
  };
  r.onerror = e => {
    C.stt.lastErr = e.error;
    if(e.error === "not-allowed" || e.error === "service-not-allowed"){ sttGiveUp("音声認識が許可されていません（ブラウザのマイク許可を確認してください）"); return; }
    if(e.error !== "network" && e.error !== "audio-capture") return; // no-speech / aborted: just restart
    // retry quietly a few times, then stop instead of looping
    if(++C.stt.fails >= 4) sttGiveUp(e.error === "network" ? "音声認識サービスに接続できないため、文字起こしを停止しました。ネットワークを確認して、もう一度「📝 文字起こし」を押してください" : "マイクの音声を取得できないため、文字起こしを停止しました");
    else if(C.stt.fails === 1) M.toast(e.error === "network" ? "音声認識サービスに接続できません。再試行します…" : "マイクの音声を取得できません。再試行します…", "err");
  };
  r.onend = () => {
    C.stt.running = false; C.stt.r = null;
    if(C.stt.want && !C.muted && C.inRoom) setTimeout(sttRun, C.stt.fails ? 1500 * C.stt.fails : 250);
    C.stt.lastErr = "";
  };
  try{ r.start(); C.stt.r = r; C.stt.running = true; }
  catch(e){ C.stt.running = false; setTimeout(sttRun, 1000); }
}
function sttGiveUp(msg){
  C.stt.fails = 0;
  M.toast(msg, "err");
  sttStop();
}
function emitLine(text){
  const line = {id:C.myId + "-" + (++C.seq) + "-" + Date.now().toString(36), at:now(), who:C.name, role:C.role, pid:C.myId, text};
  if(mergeLine(line)){ appendLine(line); persist(); }
  caption(C.myId, text, true);
  broadcast({type:"line", line});
}
function mergeLine(l){
  if(!l || !l.text || C.rec.lines.some(x => x.id === l.id)) return false;
  const arr = C.rec.lines;
  let i = arr.length; while(i > 0 && arr[i-1].at > l.at) i--;
  arr.splice(i, 0, l);
  return true;
}

/* ================= UI: tiles ================= */
function tile(pid, isMe){
  let t = $('#grid .tile[data-pid="' + CSS.escape(pid) + '"]');
  if(t) return t;
  t = document.createElement("div");
  t.className = "tile" + (isMe ? " me" : "");
  t.dataset.pid = pid;
  t.innerHTML = '<video autoplay playsinline' + (isMe ? " muted" : "") + '></video><div class="avatar"><span></span></div><div class="cap"></div><div class="nm"><b></b><span class="ic"></span></div>';
  $("#grid").appendChild(t);
  paintTile(pid); layout();
  return t;
}
function attach(pid, stream){
  const t = tile(pid, pid === C.myId), v = $("video", t);
  if(v.srcObject !== stream) v.srcObject = stream;
  v.play().catch(() => {});
  if(pid !== C.myId){ C.remote.set(pid, stream); if(M.recorder) M.recorder.addStream(pid, stream); }
}
function paintTile(pid){
  const t = $('#grid .tile[data-pid="' + CSS.escape(pid) + '"]'); if(!t) return;
  const me = pid === C.myId, st = me ? myState() : (C.states.get(pid) || {});
  const name = (me ? C.name + "（自分）" : C.names.get(pid) || "接続中…");
  $(".nm b", t).textContent = name;
  $(".nm .ic", t).textContent = (st.muted ? "🔇" : "") + (st.stt ? " 📝" : "") + (C.roles.get(pid) === "お客様" ? " 🧑‍💼" : "");
  $(".avatar span", t).textContent = (me ? C.name : C.names.get(pid) || "?").slice(0, 1);
  t.classList.toggle("camoff", !!st.camOff && !st.sharing);
  t.classList.toggle("sharing", !!st.sharing);
  t.classList.toggle("screen", !me && !!st.sharing);
}
function layout(){
  const n = $$("#grid .tile").length, narrow = window.innerWidth < 640;
  const cols = narrow ? (n <= 2 ? 1 : 2) : (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);
  $("#grid").style.setProperty("--cols", cols);
}
const capTimers = {};
function caption(pid, text, final){
  const t = $('#grid .tile[data-pid="' + CSS.escape(pid) + '"]'); if(!t) return;
  const cap = $(".cap", t);
  clearTimeout(capTimers[pid]);
  if(!text){ cap.classList.remove("show"); t.classList.remove("speaking"); return; }
  cap.textContent = text; cap.classList.add("show"); t.classList.add("speaking");
  capTimers[pid] = setTimeout(() => { cap.classList.remove("show"); t.classList.remove("speaking"); }, final ? 3500 : 5000);
  if(!final) renderInterim(pid, text);
}

/* ================= UI: control bar & side panel ================= */
function paintBar(){
  const b = (id, on, off) => { const el = $("#" + id); if(!el) return; el.classList.toggle("on", !!on); el.classList.toggle("off", !!off); };
  b("cMic", false, C.muted); $("#cMic .lb").textContent = C.muted ? "ミュート解除" : "ミュート";
  b("cCam", false, C.camOff); $("#cCam .lb").textContent = C.camOff ? "ビデオ開始" : "ビデオ停止";
  b("cShare", C.sharing); $("#cShare .lb").textContent = C.sharing ? "共有を停止" : "画面共有";
  b("cStt", C.stt.want); $("#cStt .lb").textContent = C.stt.want ? "文字起こし中" : "文字起こし";
  b("cTr", C.pane === "tr"); b("cChat", C.pane === "chat"); b("cMemo", C.pane === "memo");
  $("#cShare").hidden = !canShare;
  const anyStt = C.stt.want && !C.muted || Array.from(C.states.values()).some(s => s.stt);
  const live = $("#rLive"); live.classList.toggle("paused", !anyStt);
  live.innerHTML = "<i></i>" + (anyStt ? "文字起こし中" : "文字起こし停止中");
  const recOn = M.recorder && M.recorder.active, anyRec = recOn || Array.from(C.states.values()).some(s => s.rec);
  $("#rRec").hidden = !anyRec;
  b("cRec", recOn); $("#cRec .lb").textContent = recOn ? "録音を停止" : "録音";
  $("#cRec").hidden = !(M.recorder && M.recorder.supported());
  $("#rCount").textContent = "👥 " + (C.seen.size + 1);
  const cnt = $("#cChat .cnt"); cnt.textContent = C.unread || ""; cnt.hidden = !C.unread;
}
function setPane(p){
  C.pane = C.pane === p ? "" : p;
  $("#side").hidden = !C.pane;
  $$(".stabs button[data-pane]").forEach(b => b.classList.toggle("on", b.dataset.pane === C.pane));
  $$(".spane-wrap").forEach(w => w.hidden = w.dataset.pane !== C.pane);
  if(C.pane === "chat"){ C.unread = 0; setTimeout(() => $("#chatInput").focus(), 50); scrollEnd("#chatList", true); }
  if(C.pane === "tr") scrollEnd("#trList", true);
  paintBar();
  setTimeout(layout, 0);
}
function scrollEnd(sel, force){
  const el = $(sel); if(!el) return;
  const p = el.parentElement;
  if(force || p.scrollHeight - p.scrollTop - p.clientHeight < 120) p.scrollTop = p.scrollHeight;
}
function lineHtml(l){
  if(l.sys) return `<div class="tline sys">${esc(l.text)}</div>`;
  const names = M.speakers(C.rec);
  return `<div class="tline"><span class="who ${M.colorOf(l.who, names)}">${esc(l.who)}${l.role === "お客様" ? " 🧑‍💼" : ""}</span><span class="tm">${M.lineTime(C.rec, l)}</span><br/>${esc(l.text)}</div>`;
}
function renderTranscript(){
  const el = $("#trList");
  el.innerHTML = C.rec.lines.length ? C.rec.lines.map(lineHtml).join("") : '<div class="empty">発言が文字起こしされるとここに表示されます。<br/>下の「📝 文字起こし」で開始します。</div>';
  $("#trInterim").innerHTML = "";
  scrollEnd("#trList", true);
}
function appendLine(l){
  const el = $("#trList");
  if(el.querySelector(".empty")) el.innerHTML = "";
  // keep chronological order even when a remote line arrives late
  const idx = C.rec.lines.indexOf(C.rec.lines.find(x => x.id === l.id));
  if(idx === C.rec.lines.length - 1) el.insertAdjacentHTML("beforeend", lineHtml(l)); else renderTranscript();
  const im = $('#trInterim [data-pid="' + CSS.escape(l.pid) + '"]'); if(im) im.remove();
  scrollEnd("#trList");
}
function renderInterim(pid, text){
  const box = $("#trInterim");
  let el = $('[data-pid="' + CSS.escape(pid) + '"]', box);
  if(!el){ el = document.createElement("div"); el.className = "tline interim"; el.dataset.pid = pid; box.appendChild(el); }
  el.textContent = (pid === C.myId ? C.name : C.names.get(pid) || "") + "：" + text + " …";
  clearTimeout(el._t); el._t = setTimeout(() => el.remove(), 5000);
  scrollEnd("#trList");
}
function addSys(text){
  const el = $("#trList");
  if(!el) return;
  if(el.querySelector(".empty")) el.innerHTML = "";
  el.insertAdjacentHTML("beforeend", lineHtml({sys:true, text}));
  scrollEnd("#trList");
}
function renderChat(){
  const el = $("#chatList");
  el.innerHTML = C.rec.chat.length ? C.rec.chat.map(chatHtml).join("") : '<div class="empty">チャットはまだありません。<br/>URLや資料名の共有に使えます（議事録にも残ります）。</div>';
}
function chatHtml(c){
  const mine = c.pid ? c.pid === C.myId : c.who === C.name;
  const body = esc(c.text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return `<div class="chatmsg${mine ? " mine" : ""}"><div class="muted small">${esc(c.who)} · ${M.lineTime(C.rec, c)}</div><span class="bub">${body}</span></div>`;
}
function addChat(c, mine){
  if(C.rec.chat.some(x => x.id === c.id)) return;
  C.rec.chat.push(c);
  const el = $("#chatList"); if(el.querySelector(".empty")) el.innerHTML = "";
  el.insertAdjacentHTML("beforeend", chatHtml(c));
  scrollEnd("#chatList", mine);
  if(!mine && C.pane !== "chat"){ C.unread++; paintBar(); M.toast("💬 " + c.who + "：" + c.text.slice(0, 40)); }
  persist();
}
function sendChat(){
  const inp = $("#chatInput"), text = inp.value.trim();
  if(!text) return;
  const c = {id:C.myId + "-" + M.uid(), at:now(), who:C.name, pid:C.myId, text};
  addChat(c, true); broadcast({type:"chat", msg:c});
  inp.value = "";
}

/* ================= AI memo during the meeting ================= */
const LIVE_SCHEMA = {type:"object", additionalProperties:false, required:["captured","ask_next","summary"], properties:{
  summary:{type:"string"},
  captured:{type:"array", items:{type:"object", additionalProperties:false, required:["need","kind"], properties:{need:{type:"string"}, kind:{type:"string", enum:["明示","潜在"]}}}},
  ask_next:{type:"array", items:{type:"string"}}
}};
function renderMemo(){
  const a = C.rec.live;
  $("#memoOut").innerHTML = !a ? '<div class="muted small" style="line-height:1.8;">会議の途中で押すと、ここまでの文字起こしから<b>お客様の要望</b>と<b>まだ聞けていないこと</b>をAIが整理します（数秒〜数十秒）。</div>' :
    `<div class="memo-h">ここまでの要点（${M.esc(a.at)}時点）</div><div class="memo-item">${esc(a.summary)}</div>` +
    `<div class="memo-h">つかめた要望</div>` + (a.captured.length ? a.captured.map(c => `<div class="memo-item"><span class="badge ${c.kind === "潜在" ? "b-orange" : "b-blue"}">${esc(c.kind)}</span> ${esc(c.need)}</div>`).join("") : '<div class="muted small">まだありません</div>') +
    `<div class="memo-h">次に聞くとよいこと</div>` + (a.ask_next.length ? a.ask_next.map(q => `<div class="memo-item">❓ ${esc(q)}</div>`).join("") : '<div class="muted small">十分に聞けています</div>');
}
async function liveAssist(){
  if(!C.rec.lines.length && !C.rec.notes){ M.toast("まだ発言がありません。文字起こしを開始してください"); return; }
  const btn = $("#memoBtn"); M.busy(btn, true, "整理中…");
  try{
    const s = M.settings();
    const r = await M.ai({
      model:M.FAST_MODEL, effort:"low", maxTokens:4000, schema:LIVE_SCHEMA,
      system:"あなたは商談・ヒアリングに同席するアシスタントです。進行中の会議の文字起こしから、お客様の要望（明示・潜在）を短く整理し、要件を固めるために次に確認すべき質問を提案します。日本語で簡潔に。文字起こしには音声認識の誤りが含まれることがあります。発言にないことは書かないこと。summaryは2文以内、capturedは最大8件、ask_nextは最大5件。",
      prompt:(s.product ? "【開発対象・前提】\n" + s.product + "\n\n" : "") + "【会議】" + C.rec.title + (C.rec.customer ? "（お客様：" + C.rec.customer + "）" : "") +
        "\n\n【文字起こし（「（お客様）」付きがお客様側の発言）】\n" + M.transcriptText(C.rec, {roles:true}).slice(-60000) + (C.rec.notes ? "\n\n【手書きメモ】\n" + C.rec.notes : "")
    });
    const now = new Date();
    C.rec.live = Object.assign(r, {at:M.pad(now.getHours()) + ":" + M.pad(now.getMinutes())});
    renderMemo(); persist();
  }catch(e){ M.errorBox($("#memoOut"), e); }
  finally{ M.busy(btn, false); }
}

/* ================= invite ================= */
function invite(){
  $("#invCode").textContent = showCode(C.code);
  $("#invUrl").value = inviteUrl();
  const text = (C.rec.title ? "「" + C.rec.title + "」" : "オンラインミーティング") + "のご案内です。\n下のURLを開いて参加してください（アプリのインストールは不要です）。\n" + inviteUrl() + "\nミーティングコード：" + showCode(C.code);
  $("#invLine").href = "https://line.me/R/msg/text/?" + encodeURIComponent(text);
  $("#invMail").href = "mailto:?subject=" + encodeURIComponent("ミーティングのご案内：" + C.rec.title) + "&body=" + encodeURIComponent(text);
  $("#invText").value = text;
  const ppl = [{name:C.name + "（自分）", role:C.role, st:myState()}].concat(Array.from(C.seen).map(id => ({name:C.names.get(id), role:C.roles.get(id), st:C.states.get(id) || {}})));
  $("#invPeople").innerHTML = ppl.map(p => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line);font-size:12px;"><b>${esc(p.name)}</b><span class="badge ${p.role === "お客様" ? "b-gold" : ""}">${esc(p.role)}</span><span class="spacer"></span>${p.st.muted ? "🔇" : "🎤"} ${p.st.camOff ? "🚫📷" : "📷"} ${p.st.stt ? "📝" : ""}</div>`).join("");
  M.modal("invModal", true);
}

/* ================= persistence ================= */
function persist(immediate){
  if(!C.rec || C.rec.id === "pending") return true; // guests: nothing to save until the host's welcome arrives
  clearTimeout(C.saveT);
  const go = () => { const ok = M.saveMeeting(C.rec); M.badges(); return ok; };
  if(immediate) return go();
  C.saveT = setTimeout(go, 700);
  return true;
}

/* ================= module ================= */
M.mod.meet = {
  init(){
    const s = M.settings();
    $("#lbName").value = s.name || "";
    const h = location.hash.match(/^#join=([a-z0-9-]+)/i);
    if(h){
      $("#lbCode").value = showCode(normCode(h[1]));
      $("#lbRole").value = "お客様";
      $("#joinCard").classList.add("focus");
      $("#hostBox").hidden = true; $("#hostToggle").hidden = false;
      $("#lbGuestNote").hidden = false;
    }
    $("#lbSttNote").textContent = SR ? "" : "※このブラウザは自動文字起こし未対応です（Chrome / Edge / Safari 推奨）。ほかの参加者の文字起こしは届きます。";
    $("#lbPreviewBtn").onclick = preview;
    $("#lbMic").onclick = async () => { await preview(); if(C.mic){ C.muted = !C.muted; applyEnabled(); paintLobby(); } };
    $("#lbCam").onclick = async () => { await preview(); if(C.cam){ C.camOff = !C.camOff; applyEnabled(); paintLobby(); } };
    $("#btnHost").onclick = startHost;
    $("#btnJoin").onclick = joinRoom;
    $("#hostToggle").onclick = () => { $("#hostBox").hidden = false; $("#hostToggle").hidden = true; };
    $("#lbCode").addEventListener("keydown", e => { if(e.key === "Enter") joinRoom(); });
    // in-call controls
    $("#cMic").onclick = toggleMic;
    $("#cCam").onclick = toggleCam;
    $("#cShare").onclick = toggleShare;
    $("#cStt").onclick = () => C.stt.want ? sttStop() : sttStart();
    $("#cCaps").onclick = () => { $("#room").classList.toggle("hide-caps"); $("#cCaps").classList.toggle("off", $("#room").classList.contains("hide-caps")); };
    $("#cTr").onclick = () => setPane("tr");
    $("#cChat").onclick = () => setPane("chat");
    $("#cMemo").onclick = () => setPane("memo");
    $("#cInvite").onclick = invite;
    $("#cRec").onclick = () => M.recorder.toggle();
    $("#rCode").onclick = invite;
    $("#cEnd").onclick = confirmLeave;
    $$(".stabs button[data-pane]").forEach(b => b.onclick = () => setPane(b.dataset.pane));
    $("#sideClose").onclick = () => setPane(C.pane);
    $("#chatSend").onclick = sendChat;
    $("#chatInput").addEventListener("keydown", e => { if(e.key === "Enter" && !e.isComposing){ e.preventDefault(); sendChat(); } });
    $("#memoBtn").onclick = liveAssist;
    $("#memoNotes").addEventListener("input", e => { C.rec.notes = e.target.value; persist(); });
    $("#sttLang").onchange = e => { C.stt.lang = e.target.value; if(C.stt.running){ sttPause(); sttRun(); } };
    $("#trSave").onclick = () => M.download(M.safeName(C.rec.title) + "_文字起こし.txt", M.transcriptText(C.rec));
    $("#invCopy").onclick = () => M.copy($("#invUrl").value, "招待リンクをコピーしました");
    $("#invCopyText").onclick = () => M.copy($("#invText").value, "招待文をコピーしました");
    window.addEventListener("resize", layout);
    document.addEventListener("keydown", e => {
      if(!C.inRoom || !e.altKey) return;
      if(e.code === "KeyA"){ e.preventDefault(); toggleMic(); }
      if(e.code === "KeyV"){ e.preventDefault(); toggleCam(); }
    });
    window.addEventListener("beforeunload", e => { if(C.inRoom){ persist(true); e.preventDefault(); e.returnValue = ""; } });
    window.addEventListener("pagehide", () => {
      if(!C.inRoom) return;
      broadcast({type: C.isHost ? "end" : "bye"}); C.rec.endedAt = Date.now(); persist(true);
      if(M.recorder) M.recorder.flushNow(); // pieces already in IndexedDB are recovered on the next visit
    });
  },
  show(){ M.$("#lbName").value = M.$("#lbName").value || M.settings().name || ""; }
};
})();

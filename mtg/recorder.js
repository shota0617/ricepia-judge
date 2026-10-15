/* らいすぴあ ミーティング — meeting audio recording (mixes own mic + every remote participant)
   Pieces are written to IndexedDB every few seconds ("<meetingId>:part:N") so a closed tab or a crash
   loses at most the last few seconds; leftovers are stitched back together on the next visit. */
(function(){
"use strict";
const C = M.call;
const R = M.recorder = {active:false, mr:null, ac:null, dest:null, srcs:new Map(), chunks:[], pending:[], part:0, startedAt:0, mime:"", recId:"", flushT:0};
const FLUSH_MS = 10000;
const partKey = (id, n) => id + ":part:" + String(n).padStart(6, "0");

function pickMime(){
  const c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return c.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
}
function connect(key, stream){
  if(!R.active || R.srcs.has(key) || !stream || !stream.getAudioTracks().length) return;
  try{
    const src = R.ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    src.connect(R.dest); R.srcs.set(key, src);
  }catch(e){ console.warn("record source", e); }
}
function flush(){
  if(!R.pending.length || !R.recId) return Promise.resolve();
  const blob = new Blob(R.pending, {type:R.mime}); R.pending = [];
  return M.audio.put(partKey(R.recId, R.part++), blob).catch(() => {});
}
R.flushNow = () => { try{ if(R.active) R.mr.requestData(); }catch(e){} flush(); };
R.supported = () => !!(window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));

R.start = function(){
  if(R.active) return;
  if(!R.supported()){ M.toast("このブラウザは録音に対応していません", "err"); return; }
  R.ac = new (window.AudioContext || window.webkitAudioContext)();
  R.ac.resume().catch(() => {});
  R.dest = R.ac.createMediaStreamDestination();
  R.mime = pickMime();
  R.chunks = []; R.pending = []; R.part = 0; R.srcs.clear();
  try{ R.mr = new MediaRecorder(R.dest.stream, Object.assign({audioBitsPerSecond:32000}, R.mime ? {mimeType:R.mime} : {})); }
  catch(e){ M.toast("録音を開始できませんでした", "err"); R.ac.close(); return; }
  R.mime = R.mr.mimeType || R.mime || "audio/webm";
  R.mr.ondataavailable = e => { if(e.data && e.data.size){ R.chunks.push(e.data); R.pending.push(e.data); } };
  R.active = true;
  R.recId = C.rec.id;
  R.startedAt = Date.now() + (C.clockOffset || 0);
  if(C.mic) connect("me", new MediaStream([C.mic]));
  C.remote.forEach((s, pid) => connect(pid, s));
  M.audio.del(R.recId); // a new recording replaces the previous one of this meeting
  M.audio.put(R.recId + ":meta", {startedAt:R.startedAt, mime:R.mime}).catch(() => {});
  R.mr.start(1000);
  clearInterval(R.flushT); R.flushT = setInterval(flush, FLUSH_MS);
  C.notifyAll("⏺ " + C.name + "さんが録音を開始しました（音声が記録されます）");
  C.stateChanged();
};
R.addStream = (pid, stream) => connect(pid, stream);

/** Stop, store the whole file under the meeting id and drop the pieces. Resolves when stored. */
R.stop = function(silent){
  if(!R.active) return Promise.resolve(null);
  R.active = false;
  clearInterval(R.flushT);
  const rec = C.rec, startedAt = R.startedAt, mime = R.mime, id = R.recId;
  return new Promise(res => {
    R.mr.onstop = async () => {
      try{ R.ac.close(); }catch(e){}
      R.srcs.clear();
      const blob = new Blob(R.chunks, {type:mime}); R.chunks = []; R.pending = []; R.recId = "";
      try{
        if(!blob.size) throw new Error("録音データが空でした");
        await M.audio.del(id);
        await M.audio.put(id, blob);
        rec.audio = {startedAt, mime, size:blob.size, sec:Math.round((Date.now() + (C.clockOffset || 0) - startedAt) / 1000), timing:"end"};
        if(!M.saveMeeting(rec)) throw new Error("会議の記録を保存できませんでした（容量不足）");
        M.toast("録音を保存しました（" + (blob.size >= 1048576 ? (blob.size / 1048576).toFixed(1) + "MB" : Math.ceil(blob.size / 1024) + "KB") + "）", "ok");
      }catch(e){
        M.toast("録音を保存できなかったため、ファイルに書き出しました：" + e.message, "err");
        M.download(M.safeName(rec.title) + "_録音." + (/mp4/.test(mime) ? "m4a" : "webm"), blob, mime);
      }
      res(rec.audio || null);
    };
    try{ R.mr.stop(); }catch(e){ res(null); }
    if(!silent){ C.notifyAll("⏹ " + C.name + "さんが録音を停止しました"); C.stateChanged(); }
  });
};
R.toggle = () => R.active ? R.stop() : (C.rec && C.rec.audio && !confirm("この会議には録音が1つ保存されています。新しく録音すると置き換わります。続けますか？") ? null : R.start());

/** Stitch together recordings that were interrupted (tab closed, crash) and attach them to their meetings. */
R.recover = async function(){
  const keys = (await M.audio.keys()).map(String);
  const ids = Array.from(new Set(keys.filter(k => /:part:\d+$/.test(k)).map(k => k.replace(/:part:\d+$/, ""))));
  for(const id of ids){
    if(R.active && R.recId === id) continue;
    const parts = keys.filter(k => k.startsWith(id + ":part:")).sort();
    const meta = (await M.audio.get(id + ":meta")) || {};
    const rec = M.meeting(id);
    const blobs = []; for(const k of parts){ const b = await M.audio.get(k); if(b) blobs.push(b); }
    const blob = blobs.length ? new Blob(blobs, {type:meta.mime || blobs[0].type || "audio/webm"}) : null;
    if(!rec || !blob){
      // the meeting record itself is gone: hand the audio to the user rather than dropping it
      if(blob) M.download("復元した録音_" + M.ymd(meta.startedAt || Date.now()) + "." + (/mp4/.test(blob.type) ? "m4a" : "webm"), blob, blob.type);
      await M.audio.del(id); continue;
    }
    await M.audio.del(id);
    await M.audio.put(id, blob);
    rec.audio = {startedAt:meta.startedAt || rec.startedAt, mime:blob.type, size:blob.size, timing:"end", recovered:true};
    M.saveMeeting(rec);
    M.toast("前回保存しきれなかった録音を復元しました：" + rec.title, "ok");
  }
};
setTimeout(() => R.recover().catch(() => {}), 1500);
})();

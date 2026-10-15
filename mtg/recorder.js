/* らいすぴあ ミーティング — meeting audio recording (mixes own mic + every remote participant) */
(function(){
"use strict";
const C = M.call;
const R = M.recorder = {active:false, mr:null, ac:null, dest:null, srcs:new Map(), chunks:[], startedAt:0, mime:""};

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
R.supported = () => !!(window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));

R.start = function(){
  if(R.active) return;
  if(!R.supported()){ M.toast("このブラウザは録音に対応していません", "err"); return; }
  R.ac = new (window.AudioContext || window.webkitAudioContext)();
  R.ac.resume().catch(() => {});
  R.dest = R.ac.createMediaStreamDestination();
  R.mime = pickMime();
  R.chunks = []; R.srcs.clear();
  try{ R.mr = new MediaRecorder(R.dest.stream, Object.assign({audioBitsPerSecond:32000}, R.mime ? {mimeType:R.mime} : {})); }
  catch(e){ M.toast("録音を開始できませんでした", "err"); R.ac.close(); return; }
  R.mime = R.mr.mimeType || R.mime || "audio/webm";
  R.mr.ondataavailable = e => { if(e.data && e.data.size) R.chunks.push(e.data); };
  R.active = true;
  if(C.mic) connect("me", new MediaStream([C.mic]));
  C.remote.forEach((s, pid) => connect(pid, s));
  R.mr.start(1000);
  R.startedAt = Date.now();
  C.notifyAll("⏺ " + C.name + "さんが録音を開始しました（音声が記録されます）");
  C.stateChanged();
};
R.addStream = (pid, stream) => connect(pid, stream);

/** Stop and save into IndexedDB under the meeting id. Resolves when the file is stored. */
R.stop = function(silent){
  if(!R.active) return Promise.resolve(null);
  R.active = false;
  const rec = C.rec, startedAt = R.startedAt, mime = R.mime;
  return new Promise(res => {
    R.mr.onstop = async () => {
      try{ R.ac.close(); }catch(e){}
      R.srcs.clear();
      const blob = new Blob(R.chunks, {type:mime}); R.chunks = [];
      try{
        if(!blob.size) throw new Error("録音データが空でした");
        // one recording per meeting: a second recording in the same meeting replaces the first
        await M.audio.put(rec.id, blob);
        rec.audio = {startedAt, mime, size:blob.size, sec:Math.round((Date.now() - startedAt) / 1000), timing:"end"};
        M.saveMeeting(rec);
        M.toast("録音を保存しました（" + (blob.size >= 1048576 ? (blob.size / 1048576).toFixed(1) + "MB" : Math.ceil(blob.size / 1024) + "KB") + "）", "ok");
      }catch(e){ M.toast("録音を保存できませんでした：" + e.message, "err"); }
      res(rec.audio || null);
    };
    try{ R.mr.stop(); }catch(e){ res(null); }
    if(!silent){ C.notifyAll("⏹ " + C.name + "さんが録音を停止しました"); C.stateChanged(); }
  });
};
R.toggle = () => R.active ? R.stop() : (C.rec && C.rec.audio && !confirm("この会議には録音が1つ保存されています。新しく録音すると置き換わります。続けますか？") ? null : R.start());
})();

// ビデオ通話（WebRTC 1対1）とサーバーとの WebSocket 接続。
// 発信（offer）は常に店員側。お客様側は届いた offer に応答する。

export async function getLocalMedia({ video = true, audio = true } = {}) {
  const tries = [
    { video: video && { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio },
    { video: false, audio },
  ];
  let lastError;
  for (const c of tries) {
    if (!c.video && !c.audio) break;
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      lastError = e;
    }
  }
  console.warn('カメラ・マイクを使えません', lastError);
  return new MediaStream(); // 見る・聞くだけで参加
}

export class Call extends EventTarget {
  /**
   * @param {object} o
   * @param {'staff'|'customer'} o.role
   * @param {string} o.wsUrl
   * @param {MediaStream} o.stream 自分のカメラ・マイク
   * @param {HTMLVideoElement} o.remoteVideo
   */
  constructor({ role, wsUrl, stream, remoteVideo }) {
    super();
    this.role = role;
    this.wsUrl = wsUrl;
    this.stream = stream;
    this.remoteVideo = remoteVideo;
    this.iceServers = [];
    this.pc = null;
    this.pendingCandidates = [];
    this.ended = false;
    this.retry = 0;
    this.screenTrack = null;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  connect() {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.emit('connection', { online: true });
      this.sendMedia();
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      // 4000=接客終了 4001=別の画面に置き換え。それ以外は回線断とみなして繋ぎ直す
      if (this.ended || e.code === 4000 || e.code === 4001) {
        if (!this.hungUp) this.emit('ended', { reason: e.code === 4001 || this.replaced ? 'replaced' : 'closed' });
        return this.teardown();
      }
      this.emit('connection', { online: false });
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      setTimeout(() => !this.ended && this.connect(), wait);
    };
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  async onMessage(msg) {
    switch (msg.type) {
      case 'hello':
        this.iceServers = msg.iceServers;
        return;
      case 'peer-joined':
        if (this.role === 'staff') await this.startOffer();
        return;
      case 'peer-left':
        this.closePc();
        this.emit('remote', { present: false });
        return;
      case 'signal':
        return this.onSignal(msg.data).catch((e) => console.error('signal', e));
      case 'media':
        return this.emit('peer-media', msg.data);
      case 'replaced':
        this.replaced = true;
        this.ended = true;
        return;
      default:
        this.emit('message', msg);
    }
  }

  newPc() {
    this.closePc();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    this.pendingCandidates = [];
    const remote = new MediaStream();
    this.remoteVideo.srcObject = remote;
    pc.ontrack = (e) => {
      remote.addTrack(e.track);
      this.remoteVideo.play().catch(() => this.emit('autoplay-blocked'));
      this.emit('remote', { present: true });
    };
    pc.onicecandidate = (e) => e.candidate && this.send({ type: 'signal', data: { candidate: e.candidate } });
    pc.onconnectionstatechange = () => {
      this.emit('pc-state', { state: pc.connectionState });
      if (pc.connectionState === 'failed') {
        // 繋がらなかった：店員側から張り直す
        if (this.role === 'staff') this.startOffer();
        else this.send({ type: 'signal', data: { restart: true } });
      }
    };
    return pc;
  }

  /** 店員側：新しく通話を張る */
  async startOffer() {
    const pc = this.newPc();
    for (const kind of ['audio', 'video']) {
      const track = kind === 'video' ? (this.screenTrack ?? this.stream.getVideoTracks()[0]) : this.stream.getAudioTracks()[0];
      if (track) pc.addTransceiver(track, { direction: 'sendrecv', streams: [this.stream] });
      else pc.addTransceiver(kind, { direction: 'recvonly' });
    }
    await pc.setLocalDescription(await pc.createOffer());
    this.send({ type: 'signal', data: { sdp: pc.localDescription, fresh: true } });
  }

  async onSignal(data) {
    if (data.restart && this.role === 'staff') return this.startOffer();
    if (data.sdp?.type === 'offer') {
      // 新しい通話なら作り直す。画面共有開始などの再交渉なら今の接続のまま
      const pc = data.fresh || !this.pc ? this.newPc() : this.pc;
      await pc.setRemoteDescription(data.sdp);
      if (data.fresh) {
        for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
      }
      await pc.setLocalDescription(await pc.createAnswer());
      this.send({ type: 'signal', data: { sdp: pc.localDescription } });
      this.flushCandidates();
    } else if (data.sdp?.type === 'answer') {
      if (!this.pc || this.pc.signalingState !== 'have-local-offer') return;
      await this.pc.setRemoteDescription(data.sdp);
      this.flushCandidates();
    } else if (data.candidate) {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(data.candidate).catch(() => {});
      else this.pendingCandidates.push(data.candidate);
    }
  }

  flushCandidates() {
    for (const c of this.pendingCandidates.splice(0)) this.pc.addIceCandidate(c).catch(() => {});
  }

  closePc() {
    if (this.pc) {
      this.pc.ontrack = this.pc.onicecandidate = this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
    if (this.remoteVideo) this.remoteVideo.srcObject = null;
  }

  // ---- マイク・カメラ・画面共有 ----
  get micOn() {
    const t = this.stream.getAudioTracks()[0];
    return !!t && t.enabled;
  }
  get camOn() {
    const t = this.stream.getVideoTracks()[0];
    return !!t && t.enabled;
  }
  get hasMic() {
    return this.stream.getAudioTracks().length > 0;
  }
  get hasCam() {
    return this.stream.getVideoTracks().length > 0;
  }
  toggleMic() {
    this.stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    this.sendMedia();
    return this.micOn;
  }
  toggleCam() {
    this.stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    this.sendMedia();
    return this.camOn;
  }
  sendMedia() {
    this.send({ type: 'media', data: { mic: this.micOn, cam: this.camOn || !!this.screenTrack } });
  }

  /** 店員側：画面共有の開始／終了。共有中の映像を返す（終了時は null） */
  async toggleScreen() {
    if (this.screenTrack) {
      this.screenTrack.stop();
      await this.useVideoTrack(null);
      return null;
    }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = display.getVideoTracks()[0];
    track.onended = () => this.screenTrack === track && this.useVideoTrack(null).then(() => this.emit('screen-ended'));
    await this.useVideoTrack(track);
    return display;
  }

  async useVideoTrack(screenTrack) {
    this.screenTrack = screenTrack;
    const track = screenTrack ?? this.stream.getVideoTracks()[0] ?? null;
    const tr = this.pc?.getTransceivers().find((t) => t.receiver.track.kind === 'video');
    if (tr) {
      await tr.sender.replaceTrack(track);
      const want = track ? 'sendrecv' : 'recvonly';
      if (tr.direction !== want) {
        // カメラなしで共有を始める時などは送受信の向きが変わるので再交渉する
        tr.direction = want;
        await this.pc.setLocalDescription(await this.pc.createOffer());
        this.send({ type: 'signal', data: { sdp: this.pc.localDescription } });
      }
    }
    this.sendMedia();
  }

  hangup() {
    this.hungUp = true;
    this.ended = true;
    this.teardown();
  }

  teardown() {
    this.ended = true;
    this.closePc();
    this.stream.getTracks().forEach((t) => t.stop());
    this.screenTrack?.stop();
    if (this.ws && this.ws.readyState <= 1) this.ws.close();
  }
}

export const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

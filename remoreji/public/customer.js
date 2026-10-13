import { $, api, yen, esc, toast, totalsHtml, linesHtml, ICONS, METHOD_LABEL } from './common.js';
import { Call, getLocalMedia, wsBase } from './call.js';

const token = location.pathname.split('/').pop();
if (location.search) history.replaceState(null, '', location.pathname);

let info;
let stream;
let call;
let state = null;
let online = false;
let remotePresent = false;
let peerMedia = { mic: true, cam: true };
let payViewKey = '';
let lastReceiptUrl = null;
let countdownTimer;

function show(id) {
  for (const s of ['prejoin', 'incall', 'ended']) $(`#${s}`).hidden = s !== id;
}

function showEnded(title, msg, { rejoin = false } = {}) {
  $('#ended-title').textContent = title;
  $('#ended-msg').textContent = msg;
  const a = $('#ended-receipt');
  a.hidden = !lastReceiptUrl;
  if (lastReceiptUrl) a.href = lastReceiptUrl;
  if (rejoin && !$('#rejoin')) {
    const b = document.createElement('button');
    b.id = 'rejoin';
    b.className = 'btn btn-dark';
    b.textContent = 'もう一度つなぐ';
    b.onclick = () => location.reload();
    a.after(b);
  }
  show('ended');
}

function setCtl(btn, on, iconOn, iconOff, available = true) {
  btn.innerHTML = on ? iconOn : iconOff;
  btn.classList.toggle('off', !on);
  btn.disabled = !available;
}

// ---------- 参加前 ----------
async function init() {
  try {
    info = await api(`/api/r/${token}`);
  } catch (e) {
    return showEnded('この接客は終了しました', e.status === 404 ? 'リンクの有効期限が切れているか、接客が終了しています。' : e.message);
  }
  $('#store-name').textContent = info.store;
  document.title = `${info.store} - ビデオでお会計`;
  show('prejoin');
  stream = await getLocalMedia();
  $('#preview').srcObject = stream;
  const refresh = () => {
    const mic = stream.getAudioTracks()[0];
    const cam = stream.getVideoTracks()[0];
    setCtl($('#pre-mic'), mic?.enabled, ICONS.mic, ICONS.micOff, !!mic);
    setCtl($('#pre-cam'), cam?.enabled, ICONS.cam, ICONS.camOff, !!cam);
    $('#preview-off').hidden = !!cam?.enabled;
  };
  $('#pre-mic').onclick = () => { stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled)); refresh(); };
  $('#pre-cam').onclick = () => { stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled)); refresh(); };
  refresh();
  if (!stream.getTracks().length) {
    const err = $('#prejoin-error');
    err.hidden = false;
    err.textContent = 'カメラ・マイクが使えません（ブラウザの設定で許可してください）。このまま参加すると、店員の映像と声は届きますが、お客様の声は届きません。';
  }
  $('#join').onclick = join;
}

// ---------- 通話 ----------
function join() {
  show('incall');
  $('#local').srcObject = stream;
  $('#local').hidden = !stream.getVideoTracks().length;
  call = new Call({ role: 'customer', wsUrl: `${wsBase()}?role=customer&token=${encodeURIComponent(token)}`, stream, remoteVideo: $('#remote') });
  call.addEventListener('message', (e) => onMessage(e.detail));
  call.addEventListener('connection', (e) => {
    online = e.detail.online;
    updateStage();
    if (!online) checkStillOpen();
  });
  call.addEventListener('remote', (e) => { remotePresent = e.detail.present; updateStage(); });
  call.addEventListener('peer-media', (e) => { peerMedia = e.detail; updateStage(); });
  call.addEventListener('autoplay-blocked', () => {
    $('#stage-msg').textContent = '画面をタップすると音声が流れます';
    $('#stage-overlay').hidden = false;
    $('#stage-overlay').onclick = () => { $('#remote').play(); updateStage(); };
  });
  call.addEventListener('ended', (e) => {
    if (e.detail.reason === 'replaced') showEnded('別の画面で開かれました', 'この画面での通話は終了しました。', { rejoin: true });
    else showEnded('接客が終了しました', 'ご利用ありがとうございました。');
  });
  call.connect();

  const refreshCtl = () => {
    setCtl($('#mic'), call.micOn, ICONS.mic, ICONS.micOff, call.hasMic);
    setCtl($('#cam'), call.camOn, ICONS.cam, ICONS.camOff, call.hasCam);
    $('#local').style.visibility = call.camOn ? 'visible' : 'hidden';
  };
  $('#mic').onclick = () => { call.toggleMic(); refreshCtl(); };
  $('#cam').onclick = () => { call.toggleCam(); refreshCtl(); };
  $('#leave').innerHTML = ICONS.hangup;
  $('#leave').onclick = () => {
    if (state?.sale?.status === 'pending' && !confirm('お会計の途中です。通話を終了しますか？')) return;
    call.hangup();
    showEnded('通話を終了しました', 'お会計がお済みでない場合は、もう一度つないでください。', { rejoin: true });
  };
  refreshCtl();
}

let checking = false;
async function checkStillOpen() {
  if (checking) return;
  checking = true;
  try {
    await api(`/api/r/${token}`);
  } catch (e) {
    if (e.status === 404) {
      call.hangup();
      showEnded('接客が終了しました', 'ご利用ありがとうございました。');
    }
  } finally {
    checking = false;
  }
}

function updateStage() {
  const overlay = $('#stage-overlay');
  let msg = '';
  let spin = true;
  if (!online) msg = '接続しています…';
  else if (state?.room.status === 'waiting') msg = '店員を呼び出しています…<br><span class="small">しばらくお待ちください</span>';
  else if (state && !state.peers.staff) msg = '店員の接続を待っています…';
  else if (!remotePresent) msg = '映像をつないでいます…';
  else if (!peerMedia.cam) { msg = '店員のカメラはオフです'; spin = false; }
  overlay.hidden = !msg;
  overlay.onclick = null;
  overlay.querySelector('.spinner').hidden = !spin;
  $('#stage-msg').innerHTML = msg;
  const badge = $('#remote-badge');
  badge.hidden = !(remotePresent && !peerMedia.mic);
  badge.textContent = '店員のマイクはミュート中';
}

function onMessage(msg) {
  if (msg.type === 'error') return toast(msg.message, true);
  if (msg.type !== 'state') return;
  state = msg;
  if (state.sale?.receiptUrl) lastReceiptUrl = state.sale.receiptUrl;
  updateStage();
  renderLines();
  renderPay();
}

function renderLines() {
  const sale = state.sale;
  const lines = sale ? sale.items : state.cart;
  $('#lines').innerHTML = linesHtml(lines) || '<div class="empty">店員が商品を登録すると、ここに表示されます</div>';
  $('#totals').innerHTML = lines.length ? totalsHtml(sale ?? state.totals) : '';
}

// ---------- お支払い ----------
function renderPay() {
  const sale = state.sale;
  const a = sale?.attempt;
  const key = sale ? [sale.id, sale.status, a?.method, a?.expiresAt, a?.failed, a?.url, a?.reported].join(':') : '';
  if (key === payViewKey) return;
  payViewKey = key;
  clearInterval(countdownTimer);
  const box = $('#pay-card');
  box.hidden = !sale;
  if (!sale) return;
  if (sale.status === 'paid') {
    box.innerHTML = `<div class="done"><div class="check">✓</div>
      <h2 style="font-size:18px">お支払いが完了しました</h2>
      <p class="muted" style="margin:6px 0 14px">${yen(sale.total)}（${METHOD_LABEL[sale.method]}）</p>
      <a class="btn btn-gold btn-block" href="${esc(sale.receiptUrl)}" target="_blank" rel="noopener">領収書を表示</a>
      <p class="muted small" style="margin-top:10px">ありがとうございました。店員の案内をお待ちください。</p></div>`;
    return;
  }
  if (!a) {
    box.innerHTML = `<div class="h">お支払い</div>
      <div class="grand" style="margin:0 0 14px"><span>お支払い金額</span><span class="v">${yen(sale.total)}</span></div>
      <p class="small muted" style="margin-bottom:8px">お支払い方法を選んでください</p>
      <div class="pay-methods">
        <button class="pay-method" id="pick-card"><span class="ic card">CARD</span>クレジットカード</button>
        <button class="pay-method" id="pick-paypay"><span class="ic paypay">PayPay</span>PayPay</button>
      </div>`;
    $('#pick-card').onclick = (e) => pick(e.currentTarget, 'card');
    $('#pick-paypay').onclick = (e) => pick(e.currentTarget, 'paypay');
    return;
  }
  if (a.method === 'card') return renderCard(sale);
  if (a.method === 'paypay') return renderPayPay(sale);
}

async function pick(btn, method) {
  document.querySelectorAll('.pay-method').forEach((b) => (b.disabled = true));
  btn.innerHTML = '<div class="spinner dark"></div>';
  try {
    await api(`/api/r/${token}/pay/${method}`, { method: 'POST' });
  } catch (e) {
    toast(e.message, true);
    payViewKey = '';
    renderPay();
  }
}

const backButton = () => '<button class="btn btn-ghost btn-block" id="pay-back" style="margin-top:8px">支払い方法を変更する</button>';
function bindBack() {
  $('#pay-back').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api(`/api/r/${token}/pay/back`, { method: 'POST' });
    } catch (err) {
      toast(err.message, true);
      e.currentTarget.disabled = false;
    }
  };
}

// ---- クレジットカード（Airペイ）----
function renderCard(sale) {
  const a = sale.attempt;
  const box = $('#pay-card');
  const head = `<div class="h">クレジットカード（Airペイ）</div>
    <div class="grand" style="margin:0 0 10px"><span>お支払い金額</span><span class="v">${yen(sale.total)}</span></div>`;
  if (!a.url) {
    box.innerHTML = `${head}<div class="row" style="justify-content:center;padding:14px 0"><div class="spinner dark"></div><span>店員がお支払い用のリンクを準備しています…</span></div>${backButton()}`;
    return bindBack();
  }
  if (a.reported) {
    box.innerHTML = `${head}<div class="row" style="justify-content:center;padding:14px 0"><div class="spinner dark"></div><span>ありがとうございます。店員が入金を確認しています…</span></div>
      <p class="muted small center">確認が終わると自動で切り替わります。</p>`;
    return;
  }
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  box.innerHTML = `${head}
    ${a.demo ? '<div class="notice" style="margin-bottom:8px">デモモードです。デモ用の支払い画面が開きます（実際の決済は行われません）。</div>' : ''}
    <ol class="small" style="padding-left:20px;line-height:1.9;margin-bottom:10px">
      <li>下のボタンから Airペイのお支払い画面を開きます</li>
      <li>金額が <b>${yen(sale.total)}</b> であることを確かめて、カード情報を入力します</li>
      <li>支払いが終わったら、この画面に戻って「支払いが終わりました」を押してください</li>
    </ol>
    <a class="btn btn-gold btn-lg btn-block" href="${esc(a.url)}" target="_blank" rel="noopener">Airペイで支払う</a>
    <p class="muted small center" style="margin-top:6px">お支払い先：${esc(a.host)}</p>
    <p class="muted small center" style="margin-top:10px">${mobile ? '別のスマホで支払う場合はこちらのQRを読み取ってください' : 'スマホで支払う場合はこちらのQRを読み取ってください'}</p>
    <img class="qr" src="${esc(a.qr)}" alt="Airペイ 支払い用QRコード" style="width:150px">
    <button class="btn btn-dark btn-block" id="card-done" style="margin-top:8px">支払いが終わりました</button>
    ${backButton()}`;
  bindBack();
  $('#card-done').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api(`/api/r/${token}/pay/card/reported`, { method: 'POST' });
    } catch (err) {
      toast(err.message, true);
      e.currentTarget.disabled = false;
    }
  };
}

// ---- PayPay ----
function renderPayPay(sale) {
  const a = sale.attempt;
  const box = $('#pay-card');
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const expired = a.failed || (a.expiresAt && Date.parse(a.expiresAt) < Date.now());
  if (expired) {
    box.innerHTML = `<div class="h">PayPay</div><p style="margin:10px 0">${a.failed === 'FAILED' ? 'お支払いが完了しませんでした。' : 'QRコードの有効期限が切れました。'}</p>
      <button class="btn btn-paypay btn-block btn-lg" id="pp-renew">QRコードを再発行</button>${backButton()}`;
    $('#pp-renew').onclick = (e) => pick(e.currentTarget, 'paypay');
    return bindBack();
  }
  const openBtn = `<a class="btn btn-paypay btn-block btn-lg" href="${esc(a.url)}" target="_blank" rel="noopener">PayPayアプリで支払う</a>`;
  box.innerHTML = `<div class="h">PayPay</div>
    <div class="grand" style="margin:0 0 8px"><span>お支払い金額</span><span class="v">${yen(sale.total)}</span></div>
    ${a.demo ? '<div class="notice" style="margin-bottom:8px">デモモードです。QRを読み取るかボタンを押すと、デモ用の支払い画面が開きます。</div>' : ''}
    ${mobile ? `${openBtn}<p class="muted small center" style="margin-top:10px">別のスマホでお支払いの場合はこちらのQRを読み取ってください</p>` : '<p class="small center">スマホの PayPay アプリで QR コードを読み取ってください</p>'}
    <img class="qr" src="${esc(a.qr)}" alt="PayPay 支払い用QRコード" style="${mobile ? 'width:150px' : ''}">
    <p class="muted small center" id="pp-left"></p>
    ${mobile ? '' : `<div style="margin-top:6px">${openBtn.replace('btn-lg', '')}</div>`}
    <p class="muted small center" style="margin-top:8px">お支払いが完了すると、自動でこの画面が切り替わります。</p>
    ${backButton()}`;
  bindBack();
  const tick = () => {
    const left = Math.max(0, Math.floor((Date.parse(a.expiresAt) - Date.now()) / 1000));
    const el = $('#pp-left');
    if (el) el.textContent = `有効期限まで ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left === 0) {
      clearInterval(countdownTimer);
      payViewKey = '';
      renderPay();
    }
  };
  if (a.expiresAt) {
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
}

init();

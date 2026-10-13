import { $, api, yen, esc, toast, totalsHtml, linesHtml, ICONS, METHOD_LABEL } from './common.js';
import { Call, getLocalMedia, wsBase } from './call.js';

const roomId = location.pathname.split('/').pop();
let call;
let state = null;
let products = [];
let category = null;
let online = false;
let remotePresent = false;
let peerMedia = { mic: true, cam: true };

function send(msg) {
  if (!online) return toast('サーバーに接続していません', true);
  call.send(msg);
}

async function init() {
  const me = await api('/api/staff/me');
  if (!me.loggedIn) return location.replace(`/staff?next=${encodeURIComponent(location.pathname)}`);
  $('#store-name').textContent = me.store;
  let room;
  try {
    room = await api(`/api/staff/rooms/${roomId}`);
  } catch (e) {
    alert(e.message);
    return location.replace('/staff');
  }
  if (room.status === 'closed') {
    alert('この接客は終了しています');
    return location.replace('/staff');
  }
  $('#invite-qr').src = room.qr;
  $('#invite-code').textContent = room.code.replace(/(\d{3})(\d{3})/, '$1 $2');
  $('#copy-link').onclick = () => navigator.clipboard.writeText(room.inviteUrl).then(() => toast('リンクをコピーしました'), () => prompt('このリンクをお客様に送ってください', room.inviteUrl));
  if (navigator.share) {
    $('#share-link').hidden = false;
    $('#share-link').onclick = () => navigator.share({ title: `${me.store} ビデオでお会計`, url: room.inviteUrl }).catch(() => {});
  }
  products = (await api('/api/staff/products')).products;
  renderProducts();
  $('#start').hidden = false;
  $('#start-btn').onclick = start;
}

async function start() {
  $('#start').hidden = true;
  $('#main').hidden = false;
  const stream = await getLocalMedia();
  $('#local').srcObject = stream;
  call = new Call({ role: 'staff', wsUrl: `${wsBase()}?role=staff&room=${encodeURIComponent(roomId)}`, stream, remoteVideo: $('#remote') });
  call.addEventListener('message', (e) => onMessage(e.detail));
  call.addEventListener('connection', (e) => {
    online = e.detail.online;
    updateStage();
    // 繋がらない間に接客が終了していたらダッシュボードへ
    if (!online) api(`/api/staff/rooms/${roomId}`).then((r) => r.status === 'closed' && location.replace('/staff'), (err) => err.status === 404 && location.replace('/staff'));
  });
  call.addEventListener('remote', (e) => { remotePresent = e.detail.present; updateStage(); });
  call.addEventListener('peer-media', (e) => { peerMedia = e.detail; updateStage(); });
  call.addEventListener('autoplay-blocked', () => toast('画面をクリックすると音声が流れます'));
  call.addEventListener('screen-ended', () => refreshCtl());
  call.addEventListener('ended', (e) => {
    if (e.detail.reason === 'replaced') {
      alert('別の画面でこの接客が開かれたため、この画面を閉じます');
      location.replace('/staff');
    } else location.replace('/staff');
  });
  call.connect();
  document.body.addEventListener('click', () => $('#remote').paused && $('#remote').play().catch(() => {}), { once: true });

  const refreshCtl = () => {
    $('#mic').innerHTML = call.micOn ? ICONS.mic : ICONS.micOff;
    $('#mic').classList.toggle('off', !call.micOn);
    $('#mic').disabled = !call.hasMic;
    $('#cam').innerHTML = call.camOn ? ICONS.cam : ICONS.camOff;
    $('#cam').classList.toggle('off', !call.camOn);
    $('#cam').disabled = !call.hasCam;
    $('#screen').innerHTML = ICONS.screen;
    $('#screen').classList.toggle('on', !!call.screenTrack);
    $('#screen').hidden = !navigator.mediaDevices?.getDisplayMedia;
    const local = $('#local');
    local.classList.toggle('screen', !!call.screenTrack);
    if (!call.screenTrack) local.srcObject = call.stream;
    local.style.visibility = call.camOn || call.screenTrack ? 'visible' : 'hidden';
  };
  $('#mic').onclick = () => { call.toggleMic(); refreshCtl(); };
  $('#cam').onclick = () => { call.toggleCam(); refreshCtl(); };
  $('#screen').onclick = async () => {
    try {
      const display = await call.toggleScreen();
      if (display) $('#local').srcObject = display;
    } catch (e) {
      if (e.name !== 'NotAllowedError') toast('画面共有を開始できませんでした', true);
    }
    refreshCtl();
  };
  refreshCtl();

  $('#custom-btn').onclick = () => $('#custom-dialog').showModal();
  $('#custom-form').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    const f = new FormData(e.target);
    send({ type: 'cart:custom', name: f.get('name'), price: Number(f.get('price')), taxRate: Number(f.get('taxRate')) });
    e.target.reset();
  });
  $('#clear-btn').onclick = () => state?.cart.length && confirm('カートを空にしますか？') && send({ type: 'cart:clear' });
  $('#checkout').onclick = () => {
    if (!state.peers.customer && !confirm('お客様が接続していません。お会計を開始しますか？')) return;
    send({ type: 'checkout:start' });
  };
  $('#cart').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.line').dataset.id;
    const line = state.cart.find((l) => l.id === id);
    if (!line) return;
    if (btn.dataset.act === 'del') send({ type: 'cart:remove', lineId: id });
    else send({ type: 'cart:qty', lineId: id, qty: line.qty + (btn.dataset.act === 'inc' ? 1 : -1) });
  });
  $('#close-room').onclick = () => {
    if (state?.sale?.status === 'pending') return toast('お会計の途中です。先にお会計を取り消してください', true);
    if (confirm('接客を終了して通話を切りますか？')) send({ type: 'room:close' });
  };
}

function updateStage() {
  let msg = '';
  let spin = true;
  if (!online) msg = 'サーバーに接続しています…';
  else if (state && !state.peers.customer) { msg = 'お客様の入室を待っています'; spin = false; }
  else if (!remotePresent) msg = '映像をつないでいます…';
  else if (!peerMedia.cam) { msg = 'お客様のカメラはオフです（音声のみ）'; spin = false; }
  $('#stage-overlay').hidden = !msg;
  $('#stage-overlay .spinner').hidden = !spin;
  $('#stage-msg').textContent = msg;
  $('#remote-badge').hidden = !(remotePresent && !peerMedia.mic);
  $('#remote-badge').textContent = 'お客様のマイクはミュート中';
  const present = state?.peers.customer;
  $('#peer-status').textContent = state ? (present ? '● お客様 接続中' : '○ お客様 未接続') : '';
  $('#invite').hidden = !!present;
}

function onMessage(msg) {
  if (msg.type === 'error') return toast(msg.message, true);
  if (msg.type !== 'state') return;
  state = msg;
  updateStage();
  renderCart();
  renderSale();
}

function renderProducts() {
  const cats = [...new Set(products.map((p) => p.category || 'その他'))];
  if (!cats.includes(category)) category = cats[0] ?? null;
  $('#cats').innerHTML = cats.length > 1 ? cats.map((c) => `<button class="${c === category ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('') : '';
  $('#cats').onclick = (e) => {
    const b = e.target.closest('button[data-cat]');
    if (b) { category = b.dataset.cat; renderProducts(); }
  };
  const list = products.filter((p) => (p.category || 'その他') === category);
  $('#products').innerHTML = list.map((p) => `<button class="prod" data-id="${p.id}"><b>${esc(p.name)}</b><span>${yen(p.price)}${p.taxRate === 8 ? ' ※' : ''}</span></button>`).join('')
    || '<div class="empty" style="grid-column:1/-1">商品が登録されていません（ダッシュボードの「商品」から登録）</div>';
  $('#products').onclick = (e) => {
    const b = e.target.closest('.prod');
    if (b) send({ type: 'cart:add', productId: Number(b.dataset.id) });
  };
}

function renderCart() {
  $('#cart').innerHTML = linesHtml(state.cart, { editable: true }) || '<div class="empty">商品をタップしてカートに追加</div>';
  $('#totals').innerHTML = state.cart.length ? totalsHtml(state.totals) : '';
  $('#checkout').disabled = !state.cart.length;
  $('#checkout').textContent = state.cart.length ? `お会計 ${yen(state.totals.total)}` : 'お会計';
}

const isExpiredAttempt = (a) => !!a.failed || (a.expiresAt && Date.parse(a.expiresAt) < Date.now());

function renderSale() {
  const sale = state.sale;
  const inSale = sale && (sale.status === 'pending' || sale.status === 'paid');
  $('#cart-view').hidden = !!inSale;
  $('#sale-view').hidden = !inSale;
  $('#close-room').disabled = sale?.status === 'pending';
  if (!inSale) return;
  const view = $('#sale-view');
  const items = `<div class="receipt" style="text-align:left;max-height:28vh;overflow:auto">${linesHtml(sale.items)}</div><div style="text-align:left">${totalsHtml(sale)}</div>`;
  if (sale.status === 'paid') {
    view.innerHTML = `<div class="done"><div class="check">✓</div><h2 style="font-size:18px">会計完了</h2></div>
      <div class="big">${yen(sale.total)}</div>
      <div><span class="tag ${sale.method}">${METHOD_LABEL[sale.method]}</span> ${sale.demo ? '<span class="tag demo">デモ</span>' : ''} <span class="muted small">No. ${esc(sale.receiptNo)}</span></div>
      ${items}
      <a class="btn btn-ghost" href="${esc(sale.receiptUrl)}" target="_blank" rel="noopener">領収書を表示</a>
      <button class="btn btn-gold btn-lg" id="next">次のお会計へ</button>`;
    $('#next').onclick = () => send({ type: 'checkout:next' });
    return;
  }
  const a = sale.attempt;
  let status = 'お客様が支払い方法を選んでいます';
  if (a?.method === 'card') status = isExpiredAttempt(a) ? 'カード決済の QR コードが期限切れになりました（お客様が再発行できます）' : 'お客様がご自分のスマホでカード決済をしています';
  if (a?.method === 'paypay') status = isExpiredAttempt(a) ? 'PayPay の QR コードが期限切れ／失敗しました（お客様が再発行できます）' : 'お客様が PayPay で支払っています';
  view.innerHTML = `<div class="muted small">お会計中</div><div class="big">${yen(sale.total)}</div>
    <div class="row" style="justify-content:center"><div class="spinner dark"></div><span>${status}</span></div>
    ${a?.demo ? '<div class="notice">デモモード（実際の決済は行われません）</div>' : ''}
    ${items}
    <button class="btn btn-danger" id="cancel-sale">お会計を取り消す（カートに戻る）</button>`;
  $('#cancel-sale').onclick = () => confirm('お会計を取り消しますか？') && send({ type: 'checkout:cancel' });
}

init().catch((e) => toast(e.message, true));

import { $, api, yen, esc, toast, METHOD_LABEL } from './common.js';
import { wsBase } from './call.js';

const next = new URLSearchParams(location.search).get('next');
let me;

async function init() {
  me = await api('/api/staff/me');
  $('#store-name').textContent = me.store;
  if (!me.loggedIn) return showLogin();
  if (next && next.startsWith('/staff/room/')) return location.replace(next);
  showApp();
}

function showLogin() {
  $('#login').hidden = false;
  $('#login-demo').hidden = !me.passwordless;
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/staff/login', { method: 'POST', body: { password: new FormData(e.target).get('password') } });
      location.reload();
    } catch (err) {
      $('#login-error').hidden = false;
      $('#login-error').textContent = err.message;
    }
  };
}

function showApp() {
  $('#app').hidden = false;
  $('#logout').hidden = false;
  $('#logout').onclick = async () => {
    await api('/api/staff/logout', { method: 'POST' });
    location.reload();
  };
  const demo = [me.cardDemo && 'クレジットカード', me.paypayDemo && 'PayPay'].filter(Boolean);
  if (demo.length) {
    $('#demo-note').hidden = false;
    $('#demo-note').textContent = `${demo.join('・')} はデモモードです（実際の決済は行われません）。本番の鍵を .env に設定すると実決済になります。`;
  }
  $('#entry-link').href = $('#entry-link').textContent = `${location.origin}/`;
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
  setupRooms();
  setupProducts();
  setupSales();
}

function openTab(name) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  if (name === 'products') loadProducts();
  if (name === 'sales') loadSales();
}

// ---------- 接客 ----------
let audio;
let knownWaiting = new Set();
let ringTimer;

function beep() {
  if (!$('#sound').checked) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [i, f] of [880, 660, 880].entries()) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.22);
      o.stop(t + i * 0.22 + 0.21);
    }
  } catch {}
}

const elapsed = (iso) => {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}秒前` : `${Math.floor(s / 60)}分前`;
};

async function loadRooms() {
  const { rooms } = await api('/api/staff/rooms');
  // 呼び出し中＝お客様が画面を開いて待っているもの
  const waiting = rooms.filter((r) => r.status === 'waiting' && r.peers.customer);
  const open = rooms.filter((r) => r.status === 'open');
  $('#waiting').innerHTML = waiting.map((r) => `
    <div class="roomrow ringing"><span style="font-size:22px">🔔</span>
      <div class="grow"><b>お客様が呼び出しています</b><div class="small muted">${elapsed(r.createdAt)}から待機中</div></div>
      <a class="btn btn-gold" href="/staff/room/${esc(r.id)}">応答する</a></div>`).join('') || '<div class="empty">呼び出し中のお客様はいません</div>';
  $('#open').innerHTML = open.map((r) => `
    <div class="roomrow">
      <div class="grow"><b>${r.origin === 'staff' ? `招待（コード ${esc(r.code)}）` : 'お客様からの呼び出し'}</b>
        <div class="small muted">店員 ${r.peers.staff ? '接続中' : '未接続'} ・ お客様 ${r.peers.customer ? '接続中' : '未接続'} ・ ${elapsed(r.createdAt)}に開始</div></div>
      <a class="btn btn-dark btn-sm" href="/staff/room/${esc(r.id)}">${r.peers.staff ? '開く' : '戻る'}</a>
      <button class="btn btn-danger btn-sm" data-close="${esc(r.id)}">終了</button></div>`).join('') || '<div class="empty">接客中のルームはありません</div>';

  const ids = new Set(waiting.map((r) => r.id));
  if ([...ids].some((id) => !knownWaiting.has(id))) beep();
  knownWaiting = ids;
  clearInterval(ringTimer);
  if (ids.size) ringTimer = setInterval(beep, 6000);
  document.title = `${ids.size ? `(${ids.size}) 呼び出し中 - ` : ''}店員ダッシュボード - リモレジ`;
}

function setupRooms() {
  $('#new-room').onclick = async () => {
    try {
      const r = await api('/api/staff/rooms', { method: 'POST' });
      location.href = `/staff/room/${r.id}`;
    } catch (e) {
      toast(e.message, true);
    }
  };
  $('#open').onclick = async (e) => {
    const id = e.target.closest('[data-close]')?.dataset.close;
    if (!id || !confirm('この接客を終了しますか？')) return;
    try {
      await api(`/api/staff/rooms/${id}/close`, { method: 'POST' });
      loadRooms();
    } catch (err) {
      toast(err.message, true);
    }
  };
  loadRooms().catch((e) => toast(e.message, true));
  // 呼び出しをリアルタイムに受け取る（WebSocket が使えない時のために定期取得も）
  let retry = 0;
  const connect = () => {
    const ws = new WebSocket(`${wsBase()}?role=dashboard`);
    ws.onopen = () => (retry = 0);
    ws.onmessage = () => loadRooms().catch(() => {});
    ws.onclose = () => setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
  };
  connect();
  setInterval(() => loadRooms().catch(() => {}), 10000);
  document.addEventListener('click', () => (audio ??= new AudioContext()), { once: true });
}

// ---------- 商品 ----------
let productList = [];

async function loadProducts() {
  productList = (await api('/api/staff/products')).products;
  $('#prod-list').innerHTML = productList.map((p) => `
    <tr data-id="${p.id}">
      <td>${esc(p.category)}</td><td>${esc(p.name)}</td><td class="r">${yen(p.price)}</td><td>${p.taxRate}%</td><td class="r">${p.sort}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="edit">編集</button> <button class="btn btn-danger btn-sm" data-act="del">削除</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">商品がありません</td></tr>';
}

function editRow(tr, p) {
  tr.innerHTML = `
    <td><input class="input" name="category" value="${esc(p.category)}" maxlength="30"></td>
    <td><input class="input" name="name" value="${esc(p.name)}" maxlength="60" required></td>
    <td><input class="input" name="price" type="number" min="0" step="1" value="${p.price}" style="width:100px"></td>
    <td><select class="input" name="taxRate"><option value="8" ${p.taxRate === 8 ? 'selected' : ''}>8%</option><option value="10" ${p.taxRate === 10 ? 'selected' : ''}>10%</option></select></td>
    <td><input class="input" name="sort" type="number" step="1" value="${p.sort}" style="width:70px"></td>
    <td style="white-space:nowrap"><button class="btn btn-gold btn-sm" data-act="save">保存</button> <button class="btn btn-ghost btn-sm" data-act="cancel">戻す</button></td>`;
}

function setupProducts() {
  $('#prod-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api('/api/staff/products', { method: 'POST', body: { ...f, price: Number(f.price), taxRate: Number(f.taxRate), sort: productList.length } });
      e.target.reset();
      toast('追加しました');
      loadProducts();
    } catch (err) {
      toast(err.message, true);
    }
  };
  $('#prod-list').onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const p = productList.find((x) => x.id === Number(tr.dataset.id));
    try {
      if (btn.dataset.act === 'edit') return editRow(tr, p);
      if (btn.dataset.act === 'cancel') return loadProducts();
      if (btn.dataset.act === 'save') {
        const v = (n) => tr.querySelector(`[name=${n}]`).value;
        await api(`/api/staff/products/${p.id}`, { method: 'PUT', body: { category: v('category'), name: v('name'), price: Number(v('price')), taxRate: Number(v('taxRate')), sort: Number(v('sort')) } });
        toast('保存しました');
      }
      if (btn.dataset.act === 'del') {
        if (!confirm(`「${p.name}」を削除しますか？（過去の売上記録は残ります）`)) return;
        await api(`/api/staff/products/${p.id}`, { method: 'DELETE' });
      }
      loadProducts();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ---------- 売上 ----------
function todayJst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

async function loadSales() {
  const day = $('#sales-day').value || todayJst();
  $('#csv').href = `/api/staff/sales.csv?day=${day}`;
  const { sales, summary } = await api(`/api/staff/sales?day=${day}`);
  const stat = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  $('#stats').innerHTML = [
    stat('売上合計', yen(summary.total)),
    stat('会計件数', `${summary.count}件`),
    stat('クレジットカード', yen(summary.card)),
    stat('PayPay', yen(summary.paypay)),
    stat('10%対象（内税）', `${yen(summary.taxes[10].amount)}<div class="small muted">税 ${yen(summary.taxes[10].tax)}</div>`),
    stat('8%対象（内税）', `${yen(summary.taxes[8].amount)}<div class="small muted">税 ${yen(summary.taxes[8].tax)}</div>`),
    summary.refunded ? stat('返金', yen(summary.refunded)) : '',
  ].join('');
  const time = (iso) => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  $('#sales-list').innerHTML = sales.slice().reverse().map((s) => `
    <tr data-id="${s.id}">
      <td>${time(s.paidAt)}</td>
      <td class="small"><a href="${esc(s.receiptUrl)}" target="_blank" rel="noopener">${esc(s.receiptNo)}</a></td>
      <td><span class="tag ${s.method}">${METHOD_LABEL[s.method]}</span> ${s.demo ? '<span class="tag demo">デモ</span>' : ''}</td>
      <td class="r">${s.status === 'refunded' ? `<s>${yen(s.total)}</s>` : yen(s.total)}</td>
      <td class="small muted">${esc(s.items.map((i) => `${i.name}×${i.qty}`).join('、'))}</td>
      <td>${s.status === 'refunded' ? '<span class="tag refunded">返金済み</span>' : '<button class="btn btn-danger btn-sm" data-refund>返金</button>'}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">この日の売上はありません</td></tr>';
}

function setupSales() {
  $('#sales-day').value = todayJst();
  $('#sales-day').onchange = () => loadSales().catch((e) => toast(e.message, true));
  $('#sales-list').onclick = async (e) => {
    if (!e.target.closest('[data-refund]')) return;
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('この取引を全額返金しますか？（取り消せません）')) return;
    e.target.disabled = true;
    try {
      await api(`/api/staff/sales/${id}/refund`, { method: 'POST' });
      toast('返金しました');
    } catch (err) {
      toast(err.message, true);
    }
    loadSales();
  };
}

init().catch((e) => toast(e.message, true));

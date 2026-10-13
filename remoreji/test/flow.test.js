import './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer } from '../src/server.js';

let server;
let base;
let cookie;

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
const sockets = [];
after(() => {
  sockets.forEach((ws) => ws.terminate());
  server.closeAllConnections();
  server.close();
});

const req = async (path, { method = 'GET', body, headers = {}, auth = true } = {}) => {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, json, text, headers: res.headers };
};

/** WebSocket で繋いで、届いたメッセージを貯める */
function connect(query, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?${query}`, { headers });
    sockets.push(ws);
    ws.msgs = [];
    ws.cursor = 0; // ここまでのメッセージは確認済み
    let wake = () => {};
    ws.on('message', (raw) => {
      ws.msgs.push(JSON.parse(raw));
      wake();
    });
    // まだ確認していないメッセージ（すでに届いたものを含む）から条件に合うものを待つ
    ws.next = async (pred, ms = 3000) => {
      const deadline = Date.now() + ms;
      for (;;) {
        const i = ws.msgs.findIndex((m, idx) => idx >= ws.cursor && pred(m));
        if (i >= 0) {
          ws.cursor = i + 1;
          return ws.msgs[i];
        }
        if (Date.now() > deadline) throw new Error(`timeout waiting message; got ${JSON.stringify(ws.msgs.slice(ws.cursor).map((m) => m.type))}`);
        await new Promise((r) => {
          wake = r;
          setTimeout(r, 50);
        });
      }
    };
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on('error', reject);
  });
}
const send = (ws, m) => ws.send(JSON.stringify(m));
const stateWhere = (ws, f) => ws.next((m) => m.type === 'state' && f(m));

test('ログインしないと店員APIもWebSocketも使えない', async () => {
  assert.equal((await req('/api/staff/rooms', { auth: false })).status, 401);
  await assert.rejects(connect('role=staff&room=x'), /HTTP 403/);
  const login = await req('/api/staff/login', { method: 'POST', body: {} });
  assert.equal(login.status, 200); // デモモードはパスワードなし
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/staff/me')).json.loggedIn, true);
  // 改ざんした Cookie は通らない
  assert.equal((await req('/api/staff/rooms', { auth: false, headers: { Cookie: cookie.slice(0, -2) + 'xx' } })).status, 401);
  // 別サイトからの POST は拒否
  assert.equal((await req('/api/staff/rooms', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('招待 → 入室 → 商品登録 → カード払い（デモ）→ 領収書・売上・返金', async () => {
  const room = (await req('/api/staff/rooms', { method: 'POST' })).json;
  assert.match(room.code, /^\d{6}$/);
  const token = room.inviteUrl.split('/r/')[1];

  const joined = await req('/api/join', { method: 'POST', body: { code: room.code }, auth: false });
  assert.equal(joined.json.token, token);
  assert.equal((await req('/api/join', { method: 'POST', body: { code: '000000' === room.code ? '111111' : '000000' }, auth: false })).status, 404);

  const staff = await connect(`role=staff&room=${room.id}`, { Cookie: cookie });
  const cust = await connect(`role=customer&token=${token}`);
  await staff.next((m) => m.type === 'peer-joined');
  const products = (await req('/api/staff/products')).json.products;

  send(staff, { type: 'cart:add', productId: products[0].id });
  send(staff, { type: 'cart:add', productId: products[0].id });
  send(staff, { type: 'cart:add', productId: products[6].id }); // 10% の雑貨
  send(staff, { type: 'cart:custom', name: '値引き', price: -100, taxRate: 10 });
  const s = await stateWhere(cust, (m) => m.cart.length === 3);
  assert.equal(s.cart[0].qty, 2);
  assert.equal(s.totals.total, products[0].price * 2 + products[6].price - 100);
  assert.equal(s.room.code, undefined, 'お客様には入室コードを見せない');

  // お客様からはカートを操作できない
  send(cust, { type: 'cart:clear' });
  send(cust, { type: 'checkout:start' });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(cust.msgs.findLast((m) => m.type === 'state').sale, null);

  // 会計前は支払えない
  assert.equal((await req(`/api/r/${token}/pay/card`, { method: 'POST', auth: false })).status, 400);

  send(staff, { type: 'checkout:start' });
  const pending = await stateWhere(cust, (m) => m.sale?.status === 'pending');
  assert.equal(pending.sale.total, s.totals.total);

  // 会計中はカートを変更できず、接客も終了できない
  send(staff, { type: 'cart:add', productId: products[1].id });
  assert.match((await staff.next((m) => m.type === 'error')).message, /お会計中/);
  send(staff, { type: 'room:close' });
  assert.match((await staff.next((m) => m.type === 'error')).message, /お会計の途中/);

  // 別サイトからの支払い操作は拒否
  assert.equal((await req(`/api/r/${token}/pay/card`, { method: 'POST', auth: false, headers: { Origin: 'https://evil.example' } })).status, 403);

  const card = await req(`/api/r/${token}/pay/card`, { method: 'POST', auth: false });
  assert.deepEqual(card.json, { demo: true });
  await stateWhere(staff, (m) => m.sale?.attempt?.method === 'card');
  assert.equal((await req(`/api/r/${token}/pay/card/demo`, { method: 'POST', auth: false })).status, 200);
  const paid = await stateWhere(cust, (m) => m.sale?.status === 'paid');
  assert.match(paid.sale.receiptNo, /^\d{8}-0001$/);
  assert.equal(paid.cart.length, 0, '会計後はカートが空になる');
  // 二重に支払っても1回分
  assert.equal((await req(`/api/r/${token}/pay/card/demo`, { method: 'POST', auth: false })).status, 400);

  const receipt = await req(paid.sale.receiptUrl, { auth: false });
  assert.equal(receipt.status, 200);
  assert.match(receipt.text, /領収書/);
  assert.match(receipt.text, /10%対象/);
  assert.match(receipt.text, /8%対象/);

  const sales = (await req('/api/staff/sales')).json;
  assert.equal(sales.summary.count, 1);
  assert.equal(sales.summary.card, paid.sale.total);
  const csv = await req('/api/staff/sales.csv');
  assert.match(csv.text, new RegExp(paid.sale.receiptNo));

  const refunded = await req(`/api/staff/sales/${paid.sale.id}/refund`, { method: 'POST' });
  assert.equal(refunded.json.status, 'refunded');
  assert.equal((await req(`/api/staff/sales/${paid.sale.id}/refund`, { method: 'POST' })).status, 400);
  assert.equal((await req('/api/staff/sales')).json.summary.total, 0);

  // 次のお会計 → PayPay（デモ）。途中で支払い方法を変えても最後の方法で1回だけ支払われる
  send(staff, { type: 'checkout:next' });
  await stateWhere(staff, (m) => m.sale === null);
  send(staff, { type: 'cart:add', productId: products[1].id });
  await stateWhere(staff, (m) => m.cart.length === 1);
  send(staff, { type: 'checkout:start' });
  await stateWhere(cust, (m) => m.sale?.status === 'pending');
  await req(`/api/r/${token}/pay/card`, { method: 'POST', auth: false });
  await req(`/api/r/${token}/pay/paypay`, { method: 'POST', auth: false });
  const pp = await stateWhere(cust, (m) => m.sale?.attempt?.method === 'paypay');
  assert.match(pp.sale.attempt.qr, /^data:image\/png;base64,/);
  const staffView = staff.msgs.findLast((m) => m.type === 'state' && m.sale?.attempt?.method === 'paypay');
  assert.equal(staffView?.sale.attempt.qr, undefined, '店員側には支払いQRを送らない');
  assert.equal((await req(`/api/r/${token}/pay/card/demo`, { method: 'POST', auth: false })).status, 400, '取り下げたカード決済では支払えない');
  const demoPath = new URL(pp.sale.attempt.url).pathname;
  assert.match((await req(demoPath, { auth: false })).text, /支払う（デモ）/);
  assert.equal((await req(demoPath, { method: 'POST', auth: false })).status, 303);
  const pp2 = await stateWhere(staff, (m) => m.sale?.status === 'paid');
  assert.equal(pp2.sale.method, 'paypay');
  assert.match(pp2.sale.receiptNo, /-0002$/);

  // 取消
  send(staff, { type: 'cart:add', productId: products[2].id });
  await stateWhere(staff, (m) => m.sale === null && m.cart.length === 1);
  send(staff, { type: 'checkout:start' });
  await stateWhere(staff, (m) => m.sale?.status === 'pending');
  await stateWhere(cust, (m) => m.sale?.status === 'pending');
  send(staff, { type: 'checkout:cancel' });
  const canceled = await stateWhere(cust, (m) => m.sale === null);
  assert.equal(canceled.cart.length, 1, '取消するとカートに戻る');

  // 終了するとお客様の接続も切れ、リンクも入室コードも使えなくなる
  const closed = new Promise((r) => cust.on('close', (code) => r(code)));
  send(staff, { type: 'room:close' });
  assert.equal(await closed, 4000);
  assert.equal((await req(`/api/r/${token}`, { auth: false })).status, 404);
  assert.equal((await req('/api/join', { method: 'POST', body: { code: room.code }, auth: false })).status, 404);
  await assert.rejects(connect(`role=customer&token=${token}`), /HTTP 404/);
  staff.close();
});

test('お客様からの呼び出し → 店員が応答', async () => {
  const { token } = (await req('/api/call', { method: 'POST', auth: false })).json;
  const dash = await connect('role=dashboard', { Cookie: cookie });
  const cust = await connect(`role=customer&token=${token}`);
  const first = await stateWhere(cust, () => true);
  assert.equal(first.room.status, 'waiting');
  await dash.next((m) => m.type === 'rooms-changed');
  const waiting = (await req('/api/staff/rooms')).json.rooms.find((r) => r.status === 'waiting' && r.peers.customer);
  assert.ok(waiting);
  const staff = await connect(`role=staff&room=${waiting.id}`, { Cookie: cookie });
  await stateWhere(cust, (m) => m.room.status === 'open' && m.peers.staff);
  // 通話の接続情報は相手にそのまま中継される
  send(cust, { type: 'signal', data: { candidate: 'c1' } });
  assert.deepEqual((await staff.next((m) => m.type === 'signal')).data, { candidate: 'c1' });
  // 同じ役割で入り直すと古い接続は置き換えられる
  const closed = new Promise((r) => cust.on('close', (code) => r(code)));
  const cust2 = await connect(`role=customer&token=${token}`);
  assert.equal(await closed, 4001);
  for (const ws of [dash, staff, cust2]) ws.close();
});

test('入室コードの総当たりはレート制限される', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await req('/api/join', { method: 'POST', body: { code: '999999' }, auth: false });
  assert.equal(last.status, 429);
});

// 本番モード（PayPay の鍵あり）の決済処理を、外部APIを模したモックで確かめる。カード（Airペイ）は API を呼ばないことも確かめる
import './setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.AIRPAY_LINK_URL = 'https://airpay.example/link/fixed';
process.env.PAYPAY_API_KEY = 'pp_key';
process.env.PAYPAY_API_SECRET = 'pp_secret';
process.env.PAYPAY_MERCHANT_ID = 'm_1';
process.env.REMOREJI_PAYPAY_POLL_MS = '20';

const rooms = await import('../src/rooms.js');
const payments = await import('../src/payments.js');
const { getDb } = await import('../src/db.js');

// ---- 外部APIのモック ----
let calls = [];
let paypayStatus = 'CREATED';
let paypayAmount = null;

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const body = opts.body ? JSON.parse(opts.body) : undefined;
  calls.push({ method: opts.method, host: u.host, path: u.pathname, headers: opts.headers, body });
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'apigw.sandbox.paypay.ne.jp') {
    const ok = (data) => json(200, { resultInfo: { code: 'SUCCESS', message: 'Success' }, data });
    if (opts.method === 'POST' && u.pathname === '/v2/codes') {
      return ok({ codeId: 'code_1', url: 'https://qr-stg.sandbox.paypay.ne.jp/abc', deeplink: 'paypay://payment?link_key=abc', expiryDate: Math.floor(Date.now() / 1000) + 300, merchantPaymentId: body.merchantPaymentId });
    }
    if (opts.method === 'GET' && u.pathname.startsWith('/v2/codes/payments/')) {
      return ok({ status: paypayStatus, paymentId: 'pp_pay_1', amount: { amount: paypayAmount, currency: 'JPY' } });
    }
    if (opts.method === 'DELETE') return ok(null);
    if (u.pathname === '/v2/refunds') return ok({ status: 'CREATED' });
  }
  throw new Error(`unexpected fetch ${opts.method} ${url}`);
};

const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

let room;
let saleId;
beforeEach(() => {
  calls = [];
  paypayStatus = 'CREATED';
  room = rooms.createRoom('staff');
  const [p1, p2] = getDb().prepare('SELECT id FROM products ORDER BY id').all();
  rooms.addProduct(room.id, p1.id);
  rooms.addProduct(room.id, p2.id);
  saleId = payments.startCheckout(room.id);
  room = rooms.getRoom(room.id);
});

test('カード（Airペイ）：固定の決済リンクが設定されていればすぐ出し、外部 API は呼ばない。入金確認は店員', async () => {
  await payments.selectCard(room);
  const a = payments.getSale(saleId).attempt;
  assert.equal(a.url, 'https://airpay.example/link/fixed');
  assert.equal(a.demo, false);
  assert.equal(calls.length, 0);
  payments.reportCardPaid(rooms.getRoom(room.id));
  assert.equal(payments.getSale(saleId).status, 'pending');
  payments.confirmCardPaid(room.id, ' AP-1 ');
  const paid = payments.getSale(saleId);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.provider_ref, 'AP-1');
  await payments.refundSale(saleId);
  assert.equal(payments.getSale(saleId).status, 'refunded');
  assert.equal(calls.length, 0, 'カードの返金は Airペイ管理画面で行い、記録だけする');
  // 本番ではデモ用リンクを受け付けない
  assert.throws(() => payments.demoAirPayPay(a.ref), /無効/);
});

test('カード → PayPay → カード に切り替えても、最後に選んだ方法だけが有効', async () => {
  await payments.selectCard(room);
  await payments.selectPayPay(room, 'UA');
  assert.equal(payments.getSale(saleId).method, 'paypay');
  await payments.selectCard(room);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/v2/codes/code_1'), 'PayPay の QR は削除する');
  assert.equal(payments.getSale(saleId).method, 'card');
});

test('PayPay：署名付きで QR を作り、支払い完了をポーリングで検知する', async () => {
  const sale = payments.getSale(saleId);
  await payments.selectPayPay(room, 'Mozilla/5.0 (iPhone)');
  const create = calls.find((c) => c.path === '/v2/codes');
  assert.match(create.headers.Authorization, /^hmac OPA-Auth:pp_key:[^:]+:[^:]+:\d+:[A-Za-z0-9+/=]+$/);
  assert.equal(create.headers['X-ASSUME-MERCHANT'], 'm_1');
  assert.equal(create.body.amount.amount, sale.total);
  assert.equal(create.body.codeType, 'ORDER_QR');
  assert.equal(create.body.redirectType, 'WEB_LINK');
  assert.equal(create.body.redirectUrl, `${process.env.BASE_URL}/r/${room.token}`);
  const attempt = payments.getSale(saleId).attempt;
  assert.match(attempt.qr, /^data:image\/png/);
  assert.equal(attempt.url, 'https://qr-stg.sandbox.paypay.ne.jp/abc');

  // まだ支払われていない間は待ち続ける
  await until(() => calls.filter((c) => c.path.startsWith('/v2/codes/payments/')).length >= 2);
  assert.equal(payments.getSale(saleId).status, 'pending');

  paypayAmount = sale.total;
  paypayStatus = 'COMPLETED';
  await until(() => payments.getSale(saleId).status === 'paid');
  const paid = payments.getSale(saleId);
  assert.equal(paid.method, 'paypay');
  assert.equal(paid.provider_payment_id, 'pp_pay_1');

  await payments.refundSale(saleId);
  const refund = calls.find((c) => c.path === '/v2/refunds');
  assert.equal(refund.body.paymentId, 'pp_pay_1');
  assert.equal(refund.body.amount.amount, sale.total);
  assert.equal(refund.body.merchantRefundId, `rmjr-${saleId}`);
  assert.throws(() => payments.demoPayPayPay(paid.provider_ref), /デモモードではありません/);
});

test('PayPay：お会計を取り消すと QR を削除する', async () => {
  await payments.selectPayPay(room, 'UA');
  await payments.cancelCheckout(room.id);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/v2/codes/code_1'));
  assert.equal(payments.getSale(saleId).status, 'canceled');
  assert.equal(rooms.getRoom(room.id).cart.length, 2, 'カートに戻る');
});

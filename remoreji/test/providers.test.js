// 本番モード（Stripe / PayPay の鍵あり）の決済処理を、外部APIを模したモックで確かめる
import './setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_x';
process.env.PAYPAY_API_KEY = 'pp_key';
process.env.PAYPAY_API_SECRET = 'pp_secret';
process.env.PAYPAY_MERCHANT_ID = 'm_1';
process.env.REMOREJI_PAYPAY_POLL_MS = '20';

const rooms = await import('../src/rooms.js');
const payments = await import('../src/payments.js');
const { getDb } = await import('../src/db.js');

// ---- 外部APIのモック ----
let calls = [];
let pi = {}; // Stripe PaymentIntent の状態
let paypayStatus = 'CREATED';
let paypayAmount = null;
let cancelFails = false;

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const body = opts.body ? (u.host === 'api.stripe.com' ? Object.fromEntries(new URLSearchParams(opts.body.toString())) : JSON.parse(opts.body)) : undefined;
  calls.push({ method: opts.method, host: u.host, path: u.pathname, headers: opts.headers, body });
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'api.stripe.com') {
    if (opts.method === 'POST' && u.pathname === '/v1/payment_intents') {
      pi = { object: 'payment_intent', id: `pi_${calls.length}`, client_secret: `pi_${calls.length}_secret`, status: 'requires_payment_method', amount: Number(body.amount), amount_received: 0, currency: body.currency, metadata: { app: body['metadata[app]'], sale_id: body['metadata[sale_id]'] } };
      return json(200, pi);
    }
    if (opts.method === 'GET' && u.pathname === `/v1/payment_intents/${pi.id}`) return json(200, pi);
    if (u.pathname === `/v1/payment_intents/${pi.id}/cancel`) {
      if (cancelFails) return json(400, { error: { message: 'cannot cancel succeeded' } });
      pi.status = 'canceled';
      return json(200, pi);
    }
    if (u.pathname === '/v1/refunds') return json(200, { id: 're_1', status: 'succeeded' });
  }
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
  cancelFails = false;
  paypayStatus = 'CREATED';
  room = rooms.createRoom('staff');
  const [p1, p2] = getDb().prepare('SELECT id FROM products ORDER BY id').all();
  rooms.addProduct(room.id, p1.id);
  rooms.addProduct(room.id, p2.id);
  saleId = payments.startCheckout(room.id);
  room = rooms.getRoom(room.id);
});

test('カード：金額はサーバーのカートから計算し、カードだけの PaymentIntent を作る', async () => {
  const sale = payments.getSale(saleId);
  const r = await payments.selectCard(room);
  assert.deepEqual(r, { clientSecret: pi.client_secret, publishableKey: 'pk_test_x' });
  const create = calls.find((c) => c.path === '/v1/payment_intents');
  assert.equal(create.body.amount, String(sale.total));
  assert.equal(create.body.currency, 'jpy');
  assert.equal(create.body['payment_method_types[0]'], 'card');
  assert.equal(create.body['payment_method_types[1]'], undefined, 'カード以外の支払い方法は出さない');
  assert.equal(create.body['metadata[app]'], 'remoreji');
  assert.ok(create.headers['Idempotency-Key']);
  assert.match(create.headers.Authorization, /^Bearer sk_test_x$/);

  // 連打しても PaymentIntent は1つ
  await payments.selectCard(room);
  assert.equal(calls.filter((c) => c.path === '/v1/payment_intents').length, 1);

  // 未払いのうちは会計済みにならない
  assert.deepEqual(await payments.confirmCard(room), { paid: false });
  // 金額が合わなければ会計済みにしない
  Object.assign(pi, { status: 'succeeded', amount_received: sale.total - 1 });
  assert.deepEqual(await payments.confirmCard(room), { paid: false });
  Object.assign(pi, { amount_received: sale.total });
  assert.deepEqual(await payments.confirmCard(room), { paid: true });
  const paid = payments.getSale(saleId);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.provider_ref, pi.id);
  assert.equal(paid.attempt.clientSecret, undefined, '会計後は client_secret を残さない');

  // デモ用の擬似決済は本番では使えない
  assert.throws(() => payments.demoPayCard(rooms.getRoom(room.id)), /デモモードではありません/);

  await payments.refundSale(saleId);
  const refund = calls.find((c) => c.path === '/v1/refunds');
  assert.equal(refund.body.payment_intent, pi.id);
  assert.equal(payments.getSale(saleId).status, 'refunded');
});

test('Stripe Webhook：他システムの決済は無視し、リモレジの決済は API で確かめてから記録する', async () => {
  await payments.selectCard(room);
  assert.deepEqual(await payments.handleStripeEvent({ type: 'payment_intent.succeeded', data: { object: { object: 'payment_intent', id: 'pi_other', metadata: { app: 'shomai' } } } }), { ignored: true });
  Object.assign(pi, { status: 'succeeded', amount_received: pi.amount });
  const r = await payments.handleStripeEvent({ type: 'payment_intent.succeeded', data: { object: { ...pi, status: 'requires_payment_method' } } });
  assert.deepEqual(r, { paid: true });
  assert.equal(payments.getSale(saleId).status, 'paid');
});

test('カード → PayPay に切り替え：PaymentIntent を取り消す。取り消す前に支払われていたら会計済みにする', async () => {
  await payments.selectCard(room);
  await payments.selectPayPay(room, 'UA');
  assert.ok(calls.some((c) => c.path === `/v1/payment_intents/${pi.id}/cancel`));
  assert.equal(payments.getSale(saleId).method, 'paypay');

  // 別の会計で、切り替えの瞬間にカード決済が完了していたケース
  await payments.cancelCheckout(room.id);
  rooms.addProduct(room.id, getDb().prepare('SELECT id FROM products LIMIT 1').get().id);
  const id2 = payments.startCheckout(room.id);
  const r2 = rooms.getRoom(room.id);
  await payments.selectCard(r2);
  cancelFails = true;
  Object.assign(pi, { status: 'succeeded', amount_received: pi.amount });
  await payments.backToMethods(r2);
  assert.equal(payments.getSale(id2).status, 'paid');
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

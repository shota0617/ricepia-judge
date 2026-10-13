// 本番モード（Stripe / PayPay の鍵あり）の決済処理を、外部APIを模したモックで確かめる
import './setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.PAYPAY_API_KEY = 'pp_key';
process.env.PAYPAY_API_SECRET = 'pp_secret';
process.env.PAYPAY_MERCHANT_ID = 'm_1';
process.env.REMOREJI_POLL_MS = '20';

const rooms = await import('../src/rooms.js');
const payments = await import('../src/payments.js');
const { getDb } = await import('../src/db.js');

// ---- 外部APIのモック ----
let calls = [];
let cs = {}; // Stripe 決済ページ（Checkout Session）の状態
let paypayStatus = 'CREATED';
let paypayAmount = null;
let expireFails = false;

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const body = opts.body ? (u.host === 'api.stripe.com' ? Object.fromEntries(new URLSearchParams(opts.body.toString())) : JSON.parse(opts.body)) : undefined;
  calls.push({ method: opts.method, host: u.host, path: u.pathname, headers: opts.headers, body });
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'api.stripe.com') {
    if (opts.method === 'POST' && u.pathname === '/v1/checkout/sessions') {
      cs = {
        object: 'checkout.session', id: `cs_${calls.length}`, url: `https://checkout.stripe.com/c/pay/cs_${calls.length}`, status: 'open', payment_status: 'unpaid',
        amount_total: Number(body['line_items[0][price_data][unit_amount]']), currency: body['line_items[0][price_data][currency]'],
        expires_at: Number(body.expires_at), payment_intent: null, metadata: { app: body['metadata[app]'], sale_id: body['metadata[sale_id]'] },
      };
      return json(200, cs);
    }
    if (opts.method === 'GET' && u.pathname === `/v1/checkout/sessions/${cs.id}`) return json(200, cs);
    if (u.pathname === `/v1/checkout/sessions/${cs.id}/expire`) {
      if (expireFails) return json(400, { error: { message: 'Only Checkout Sessions with a status in [open] can be expired.' } });
      cs.status = 'expired';
      return json(200, cs);
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
  expireFails = false;
  paypayStatus = 'CREATED';
  room = rooms.createRoom('staff');
  const [p1, p2] = getDb().prepare('SELECT id FROM products ORDER BY id').all();
  rooms.addProduct(room.id, p1.id);
  rooms.addProduct(room.id, p2.id);
  saleId = payments.startCheckout(room.id);
  room = rooms.getRoom(room.id);
});

test('カード：お客様のスマホで開く Stripe の決済ページを作り、支払い完了を自動で検知する', async () => {
  const sale = payments.getSale(saleId);
  await payments.selectCard(room);
  const create = calls.find((c) => c.path === '/v1/checkout/sessions');
  assert.equal(create.body.mode, 'payment');
  assert.equal(create.body['line_items[0][price_data][unit_amount]'], String(sale.total), '金額はサーバーのカートから');
  assert.equal(create.body['line_items[0][price_data][currency]'], 'jpy');
  assert.equal(create.body['payment_method_types[0]'], 'card');
  assert.equal(create.body['payment_method_types[1]'], undefined, 'カード以外の支払い方法は出さない');
  assert.equal(create.body['metadata[app]'], 'remoreji');
  assert.ok(Number(create.body.expires_at) - Date.now() / 1000 >= 30 * 60, 'Stripe の最短期限（30分）以上');
  assert.ok(create.headers['Idempotency-Key']);
  const a = payments.getSale(saleId).attempt;
  assert.equal(a.url, cs.url, 'お客様の画面には Stripe のページへのリンクだけ');
  assert.match(a.qr, /^data:image\/png/);

  // 連打しても決済ページは1つ
  await payments.selectCard(room);
  assert.equal(calls.filter((c) => c.path === '/v1/checkout/sessions').length, 1);

  // 未払いのうちは待つ
  await until(() => calls.filter((c) => c.method === 'GET' && c.path === `/v1/checkout/sessions/${cs.id}`).length >= 2);
  assert.equal(payments.getSale(saleId).status, 'pending');
  // 金額が合わなければ会計済みにしない
  Object.assign(cs, { status: 'complete', payment_status: 'paid', amount_total: sale.total - 1, payment_intent: 'pi_9' });
  assert.equal(await payments.checkCard(cs.id), 'mismatch');
  Object.assign(cs, { amount_total: sale.total });
  await until(() => payments.getSale(saleId).status === 'paid');
  const paid = payments.getSale(saleId);
  assert.equal(paid.method, 'card');
  assert.equal(paid.provider_payment_id, 'pi_9');
  assert.equal(paid.attempt.qr, undefined, '会計後は QR を残さない');
  assert.throws(() => payments.demoPayCard(cs.id), /デモモードではありません/);

  await payments.refundSale(saleId);
  const refund = calls.find((c) => c.path === '/v1/refunds');
  assert.equal(refund.body.payment_intent, 'pi_9');
  assert.equal(payments.getSale(saleId).status, 'refunded');
});

test('Stripe Webhook：他システムの決済は無視し、リモレジの決済は API で確かめてから記録する', async () => {
  await payments.selectCard(room);
  assert.deepEqual(await payments.handleStripeEvent({ type: 'checkout.session.completed', data: { object: { object: 'checkout.session', id: 'cs_other', metadata: { app: 'shomai' } } } }), { ignored: true });
  Object.assign(cs, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' });
  const r = await payments.handleStripeEvent({ type: 'checkout.session.completed', data: { object: { ...cs, payment_status: 'unpaid' } } });
  assert.deepEqual(r, { status: 'paid' });
  assert.equal(payments.getSale(saleId).status, 'paid');
});

test('カード → PayPay に切り替え：決済ページを無効にする。無効にする前に支払われていたら会計済みにする', async () => {
  await payments.selectCard(room);
  await payments.selectPayPay(room, 'UA');
  assert.ok(calls.some((c) => c.path === `/v1/checkout/sessions/${cs.id}/expire`));
  assert.equal(payments.getSale(saleId).method, 'paypay');

  // 別の会計で、切り替えの瞬間にカード決済が完了していたケース
  await payments.cancelCheckout(room.id);
  rooms.addProduct(room.id, getDb().prepare('SELECT id FROM products LIMIT 1').get().id);
  const id2 = payments.startCheckout(room.id);
  const r2 = rooms.getRoom(room.id);
  await payments.selectCard(r2);
  expireFails = true;
  Object.assign(cs, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_2' });
  await payments.backToMethods(r2);
  assert.equal(payments.getSale(id2).status, 'paid');
});

test('カード：決済ページの期限切れを検知して、お客様が QR を再発行できるようにする', async () => {
  await payments.selectCard(room);
  const first = cs.id;
  cs.status = 'expired';
  await until(() => payments.getSale(saleId).attempt?.failed === 'EXPIRED');
  await payments.selectCard(room);
  assert.notEqual(cs.id, first, '新しい決済ページを作る');
  assert.equal(payments.getSale(saleId).attempt.ref, cs.id);
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

import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { computeTotals, jst, jstDayRange, yen } from '../src/util.js';
import { authHeader } from '../src/paypay.js';
import { verifyWebhook, encodeForm } from '../src/stripe.js';

test('税込価格から税率ごとに1回だけ切り捨てで内税を計算する', () => {
  const r = computeTotals([
    { price: 1980, qty: 2, taxRate: 8 },
    { price: 4280, qty: 1, taxRate: 8 },
    { price: 2980, qty: 1, taxRate: 10 },
    { price: -500, qty: 1, taxRate: 8 },
  ]);
  assert.equal(r.total, 3960 + 4280 + 2980 - 500);
  assert.deepEqual(r.taxes, [
    { rate: 10, amount: 2980, tax: Math.floor((2980 * 10) / 110) }, // 270
    { rate: 8, amount: 7740, tax: Math.floor((7740 * 8) / 108) }, // 573
  ]);
  assert.equal(r.count, 5);
  assert.deepEqual(computeTotals([]), { total: 0, taxes: [], count: 0 });
});

test('日本時間の日付と1日の範囲', () => {
  assert.deepEqual(jst(new Date('2026-10-12T15:30:00Z')), { day: '2026-10-13', time: '00:30:00' });
  assert.deepEqual(jstDayRange('2026-10-13'), ['2026-10-12T15:00:00.000Z', '2026-10-13T15:00:00.000Z']);
  assert.throws(() => jstDayRange('bad'));
  assert.equal(yen(-500), '-¥500');
  assert.equal(yen(12345), '¥12,345');
});

test('PayPay の署名ヘッダーは公式 SDK と同じ手順で作る', () => {
  const body = JSON.stringify({ merchantPaymentId: 'x', amount: { amount: 100, currency: 'JPY' } });
  const h = authHeader({ method: 'POST', path: '/v2/codes', body, apiKey: 'KEY', apiSecret: 'SECRET', nonce: 'n1', epoch: 1700000000 });
  const digest = crypto.createHash('md5').update('application/json' + body).digest('base64');
  const mac = crypto.createHmac('sha256', 'SECRET').update(['/v2/codes', 'POST', 'n1', 1700000000, 'application/json', digest].join('\n')).digest('base64');
  assert.equal(h, `hmac OPA-Auth:KEY:${mac}:n1:1700000000:${digest}`);

  const g = authHeader({ method: 'GET', path: '/v2/codes/payments/x', apiKey: 'KEY', apiSecret: 'SECRET', nonce: 'n2', epoch: 1 });
  const mac2 = crypto.createHmac('sha256', 'SECRET').update(['/v2/codes/payments/x', 'GET', 'n2', 1, 'empty', 'empty'].join('\n')).digest('base64');
  assert.equal(g, `hmac OPA-Auth:KEY:${mac2}:n2:1:empty`);
});

test('Stripe Webhook の署名検証', () => {
  const raw = JSON.stringify({ type: 'payment_intent.succeeded' });
  const t = 1700000000;
  const sig = crypto.createHmac('sha256', 'whsec_x').update(`${t}.${raw}`).digest('hex');
  assert.equal(verifyWebhook(raw, `t=${t},v1=${sig}`, 'whsec_x', 300, t).type, 'payment_intent.succeeded');
  assert.throws(() => verifyWebhook(raw, `t=${t},v1=${sig}`, 'whsec_other', 300, t), /一致しません/);
  assert.throws(() => verifyWebhook(raw, `t=${t},v1=${sig}`, 'whsec_x', 300, t + 1000), /期限切れ/);
  assert.equal(encodeForm({ payment_method_types: ['card'], metadata: { a: 1 } }).toString(), 'payment_method_types%5B0%5D=card&metadata%5Ba%5D=1');
});

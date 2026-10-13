// お会計（取引）と決済。カード＝Stripe、PayPay＝PayPay ウェブペイメント。
// 金額は必ずサーバー側のカートから計算し、画面から送られた金額は使わない。
import QRCode from 'qrcode';
import { config, cardIsDemo, paypayIsDemo } from './config.js';
import { getDb, tx } from './db.js';
import { getRoom, emitChange } from './rooms.js';
import { UserError, computeTotals, jst, jstDayRange, nowIso, randomToken } from './util.js';
import * as stripe from './stripe.js';
import * as paypay from './paypay.js';

export const APP_TAG = 'remoreji'; // 同じ Stripe アカウントの他システムの決済と区別する印
export const STRIPE_MIN_JPY = 50; // Stripe のカード決済の最低金額
const PAYPAY_POLL_MS = Number(process.env.REMOREJI_PAYPAY_POLL_MS || 4500); // PayPay 推奨 4〜5 秒

function parseSale(row) {
  return row && { ...row, items: JSON.parse(row.items_json), taxes: JSON.parse(row.taxes_json), attempt: row.attempt_json ? JSON.parse(row.attempt_json) : null };
}

export const getSale = (id) => parseSale(getDb().prepare('SELECT * FROM sales WHERE id = ?').get(id));
export const getSaleByReceiptToken = (t) => parseSale(getDb().prepare('SELECT * FROM sales WHERE receipt_token = ? AND receipt_no IS NOT NULL').get(String(t)));
const getSaleByRef = (ref) => parseSale(getDb().prepare('SELECT * FROM sales WHERE provider_ref = ?').get(String(ref)));
const setAttempt = (saleId, attempt) =>
  getDb().prepare('UPDATE sales SET attempt_json = ?, method = ?, provider_ref = ? WHERE id = ?').run(
    attempt ? JSON.stringify(attempt) : null, attempt?.method ?? null, attempt?.ref ?? null, saleId,
  );

// 同じお会計への操作（ボタン連打・Webhook とポーリングの同時到着など）を1つずつ順番に処理する
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => locks.get(key) === tail && locks.delete(key));
  return run;
}

// ---------- 会計の開始・取消 ----------

/** 店員が「お会計」を押した：カートの内容で取引を作り、お客様に支払い方法の選択を出す */
export function startCheckout(roomId) {
  const saleId = tx((d) => {
    const room = getRoom(roomId);
    if (!room || room.status !== 'open') throw new UserError('この接客ではお会計できません');
    if (room.sale_id && d.prepare("SELECT 1 FROM sales WHERE id = ? AND status = 'pending'").get(room.sale_id)) throw new UserError('すでにお会計中です');
    if (room.cart.length === 0) throw new UserError('カートが空です');
    const { total, taxes } = computeTotals(room.cart);
    if (taxes.some((t) => t.amount < 0)) throw new UserError('値引きが税率ごとの合計を超えています');
    if (total < 1) throw new UserError('合計が 0 円以下です');
    const items = room.cart.map(({ name, price, qty, taxRate }) => ({ name, price, qty, taxRate }));
    const r = d.prepare('INSERT INTO sales (room_id, status, items_json, total, taxes_json, receipt_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      roomId, 'pending', JSON.stringify(items), total, JSON.stringify(taxes), randomToken(18), nowIso(),
    );
    d.prepare('UPDATE rooms SET sale_id = ? WHERE id = ?').run(r.lastInsertRowid, roomId);
    return Number(r.lastInsertRowid);
  });
  emitChange(roomId);
  return saleId;
}

/** 店員がお会計を取り消した（カートに戻る）。実はすでに支払われていたら会計済みにする。 */
export function cancelCheckout(roomId) {
  const room = getRoom(roomId);
  const saleId = room?.sale_id;
  if (!saleId) return;
  return withLock(saleId, async () => {
    const sale = getSale(saleId);
    if (sale.status !== 'pending') return;
    if ((await stopAttempt(sale)) === 'paid') return;
    tx((d) => {
      d.prepare("UPDATE sales SET status = 'canceled', attempt_json = NULL WHERE id = ? AND status = 'pending'").run(saleId);
      d.prepare('UPDATE rooms SET sale_id = NULL WHERE id = ? AND sale_id = ?').run(roomId, saleId);
    });
    emitChange(roomId);
  });
}

/** 会計完了画面から次のお客様／次のお会計へ */
export function nextCheckout(roomId) {
  const room = getRoom(roomId);
  const sale = room?.sale_id && getSale(room.sale_id);
  if (sale?.status === 'pending') throw new UserError('お会計中です');
  getDb().prepare('UPDATE rooms SET sale_id = NULL WHERE id = ?').run(roomId);
  emitChange(roomId);
}

/** 進行中の決済（PaymentIntent / PayPay QR）を止める。止める前に支払い済みだったら 'paid' を返す。 */
async function stopAttempt(sale) {
  const a = sale.attempt;
  if (!a) return 'none';
  if (a.method === 'card' && !a.demo) {
    try {
      await stripe.cancelPaymentIntent(a.ref);
    } catch {
      const pi = await stripe.retrievePaymentIntent(a.ref);
      if (pi.status === 'succeeded') return markPaid(sale.id, { method: 'card', ref: pi.id }) && 'paid';
      if (pi.status !== 'canceled') throw new UserError('カード決済の処理中です。少し待ってからもう一度お試しください');
    }
  }
  if (a.method === 'paypay' && !a.demo) {
    await paypay.deleteCode(a.codeId).catch(() => {});
    const p = await paypay.getPaymentDetails(a.ref).catch(() => null);
    if (p?.status === 'COMPLETED') return markPaid(sale.id, { method: 'paypay', ref: a.ref, paymentId: p.paymentId }) && 'paid';
  }
  setAttempt(sale.id, null);
  return 'stopped';
}

// ---------- お客様の操作 ----------

function pendingSaleOf(room) {
  if (!room || room.status !== 'open') throw new UserError('この接客は終了しています');
  const sale = room.sale_id && getSale(room.sale_id);
  if (!sale || sale.status !== 'pending') throw new UserError('お支払いを受け付けていません');
  return sale;
}

/** 支払い方法の選択に戻る */
export function backToMethods(room) {
  const { id } = pendingSaleOf(room);
  return withLock(id, async () => {
    const sale = getSale(id);
    if (sale.status !== 'pending') return;
    await stopAttempt(sale);
    emitChange(room.id);
  });
}

/** クレジットカードを選んだ：Stripe の PaymentIntent を作り、カード入力欄用の client_secret を返す */
export function selectCard(room) {
  const { id } = pendingSaleOf(room);
  return withLock(id, async () => {
    let sale = getSale(id);
    if (sale.status !== 'pending') throw new UserError('お支払いを受け付けていません');
    if (sale.total < STRIPE_MIN_JPY) throw new UserError(`クレジットカードは ${STRIPE_MIN_JPY} 円以上からご利用いただけます`);
    if (sale.attempt?.method === 'card') return cardClientInfo(sale.attempt);
    if ((await stopAttempt(sale)) === 'paid') return { paid: true };

    let attempt;
    if (cardIsDemo()) {
      attempt = { method: 'card', demo: true, ref: `demo_card_${id}_${randomToken(6)}` };
    } else {
      const pi = await stripe.createPaymentIntent({
        amount: sale.total,
        currency: 'jpy',
        payment_method_types: ['card'],
        description: `${config.store.name} お会計 #${id}`,
        metadata: { app: APP_TAG, sale_id: String(id) },
      }, `remoreji-sale-${id}-${randomToken(6)}`);
      attempt = { method: 'card', ref: pi.id, clientSecret: pi.client_secret };
    }
    setAttempt(id, attempt);
    emitChange(room.id);
    return cardClientInfo(attempt);
  });
}

const cardClientInfo = (a) => (a.demo ? { demo: true } : { clientSecret: a.clientSecret, publishableKey: config.stripe.publishableKey });

/** カード入力後：Stripe に問い合わせて本当に支払われたか確かめる（画面の申告は信用しない） */
export function confirmCard(room) {
  const sale = room?.sale_id && getSale(room.sale_id);
  if (!sale) throw new UserError('お会計が見つかりません');
  return withLock(sale.id, async () => {
    const s = getSale(sale.id);
    if (s.status === 'paid') return { paid: true };
    if (s.attempt?.method !== 'card' || s.attempt.demo) throw new UserError('カード決済が開始されていません');
    return { paid: await checkStripe(s.attempt.ref) };
  });
}

async function checkStripe(piId) {
  const pi = await stripe.retrievePaymentIntent(piId);
  const sale = getSale(Number(pi.metadata?.sale_id));
  if (pi.metadata?.app !== APP_TAG || !sale || pi.status !== 'succeeded') return false;
  if (pi.amount_received !== sale.total || pi.currency !== 'jpy') {
    console.error(`[stripe] 金額不一致 sale=${sale.id} total=${sale.total} received=${pi.amount_received} ${pi.currency}`);
    return false;
  }
  markPaid(sale.id, { method: 'card', ref: pi.id });
  return true;
}

/** デモ用：カード決済を擬似的に完了する */
export function demoPayCard(room) {
  if (!cardIsDemo()) throw new UserError('デモモードではありません', 403);
  const sale = pendingSaleOf(room);
  if (sale.attempt?.method !== 'card' || !sale.attempt.demo) throw new UserError('カード決済が開始されていません');
  markPaid(sale.id, { method: 'card', ref: sale.attempt.ref, demo: true });
}

/** PayPay を選んだ：支払い用 QR（スマホではアプリが開くリンク）を作る */
export function selectPayPay(room, userAgent = '') {
  const { id } = pendingSaleOf(room);
  return withLock(id, async () => {
    const sale = getSale(id);
    if (sale.status !== 'pending') throw new UserError('お支払いを受け付けていません');
    const live = sale.attempt?.method === 'paypay' && !sale.attempt.failed && !(sale.attempt.expiresAt && Date.parse(sale.attempt.expiresAt) < Date.now());
    if (live) return;
    if ((await stopAttempt(sale)) === 'paid') return;

    const ref = `rmj-${id}-${randomToken(8)}`;
    let attempt;
    if (paypayIsDemo()) {
      attempt = { method: 'paypay', demo: true, ref, url: `${config.baseUrl}/demo/paypay/${ref}`, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
    } else {
      const data = await paypay.createCode({
        merchantPaymentId: ref,
        amount: sale.total,
        orderDescription: `${config.store.name} お会計`,
        redirectUrl: `${config.baseUrl}/r/${room.token}`,
        userAgent: String(userAgent).slice(0, 500),
      });
      const expiresAt = data.expiryDate ? new Date(data.expiryDate * 1000).toISOString() : new Date(Date.now() + 5 * 60_000).toISOString();
      attempt = { method: 'paypay', ref, codeId: data.codeId, url: data.url, deeplink: data.deeplink, expiresAt };
    }
    attempt.qr = await QRCode.toDataURL(attempt.url, { margin: 1, width: 320 });
    setAttempt(id, attempt);
    emitChange(room.id);
    if (!attempt.demo) pollPayPay(id, ref);
  });
}

// PayPay は支払い完了を自分で取りに行く（Webhook が届かなくても確実に検知するため）
const polling = new Set();
function pollPayPay(saleId, ref) {
  if (polling.has(ref)) return;
  polling.add(ref);
  const tick = async () => {
    const sale = getSale(saleId);
    if (sale?.status !== 'pending' || sale.attempt?.ref !== ref) return polling.delete(ref);
    await checkPayPay(ref).catch((e) => console.error('[paypay] 状態確認に失敗:', e.message));
    const after = getSale(saleId);
    const expired = Date.parse(after.attempt?.expiresAt ?? 0) + 60_000 < Date.now();
    if (after.status !== 'pending' || after.attempt?.ref !== ref || expired) return polling.delete(ref);
    setTimeout(tick, PAYPAY_POLL_MS).unref();
  };
  setTimeout(tick, PAYPAY_POLL_MS).unref();
}

/** PayPay に支払い状況を問い合わせ、完了していれば会計済みにする */
export function checkPayPay(ref) {
  const sale = getSaleByRef(ref);
  if (!sale || sale.method !== 'paypay') return Promise.resolve(false);
  return withLock(sale.id, async () => {
    const s = getSale(sale.id);
    if (s.status === 'paid') return true;
    const p = await paypay.getPaymentDetails(ref);
    if (p.status === 'COMPLETED') {
      if (p.amount?.amount !== undefined && Number(p.amount.amount) !== s.total) {
        console.error(`[paypay] 金額不一致 sale=${s.id} total=${s.total} paid=${p.amount.amount}`);
        return false;
      }
      markPaid(s.id, { method: 'paypay', ref, paymentId: p.paymentId });
      return true;
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(p.status) && s.attempt?.ref === ref) {
      setAttempt(s.id, { ...s.attempt, failed: p.status });
      emitChange(s.room_id);
    }
    return false;
  });
}

/** デモ用：PayPay 決済を擬似的に完了する（デモ用 QR をスマホで読むと開くページから呼ばれる） */
export function demoPayPayPay(ref) {
  if (!paypayIsDemo()) throw new UserError('デモモードではありません', 403);
  const sale = getSaleByRef(ref);
  if (!sale || sale.status !== 'pending' || sale.attempt?.ref !== ref) throw new UserError('このQRコードは無効です');
  markPaid(sale.id, { method: 'paypay', ref, paymentId: `demo-${ref}`, demo: true });
}

export const demoPayPayInfo = (ref) => {
  const sale = getSaleByRef(ref);
  return sale && sale.attempt?.ref === ref ? { total: sale.total, status: sale.status } : null;
};

/** サーバー再起動時：支払い待ちの PayPay を見張り直す */
export function resumePolling() {
  for (const row of getDb().prepare("SELECT id, attempt_json FROM sales WHERE status = 'pending' AND method = 'paypay'").all()) {
    const a = JSON.parse(row.attempt_json ?? 'null');
    if (a && !a.demo) pollPayPay(row.id, a.ref);
  }
}

// ---------- 会計済み・返金 ----------

/** 支払い完了を記録してレシート番号を振る。何度呼ばれても1回分しか記録しない。 */
function markPaid(saleId, { method, ref, paymentId = null, demo = false }) {
  const roomId = tx((d) => {
    const sale = getSale(saleId);
    if (!sale || sale.status === 'paid' || sale.status === 'refunded') return null;
    if (sale.status === 'canceled') console.warn(`[sale ${saleId}] 取消後に支払いを検知したため会計済みにします`);
    const day = jst().day;
    d.prepare('INSERT INTO receipt_seq (day, last) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET last = last + 1').run(day);
    const seq = d.prepare('SELECT last FROM receipt_seq WHERE day = ?').get(day).last;
    const receiptNo = `${day.replaceAll('-', '')}-${String(seq).padStart(4, '0')}`;
    d.prepare(`UPDATE sales SET status = 'paid', method = ?, provider_ref = ?, provider_payment_id = ?, demo = ?, receipt_no = ?, paid_at = ?,
      attempt_json = json_remove(attempt_json, '$.clientSecret', '$.qr') WHERE id = ?`).run(method, ref, paymentId, demo ? 1 : 0, receiptNo, nowIso(), saleId);
    // 会計が済んだらカートを空にする（取消後に入金された古い取引では今のカートに触れない）
    d.prepare("UPDATE rooms SET cart_json = '[]' WHERE id = ? AND sale_id = ?").run(sale.room_id, saleId);
    return sale.room_id;
  });
  if (roomId) emitChange(roomId);
  return true;
}

export function handleStripeEvent(event) {
  const obj = event.data?.object;
  if (obj?.object !== 'payment_intent' || obj.metadata?.app !== APP_TAG) return Promise.resolve({ ignored: true });
  if (event.type !== 'payment_intent.succeeded') return Promise.resolve({ ok: true });
  // イベント本文ではなく API から最新の状態を取り直す
  return withLock(Number(obj.metadata.sale_id), () => checkStripe(obj.id)).then((paid) => ({ paid }));
}

export function refundSale(saleId) {
  return withLock(saleId, async () => {
    const sale = getSale(saleId);
    if (!sale) throw new UserError('取引が見つかりません', 404);
    if (sale.status !== 'paid') throw new UserError('会計済みの取引だけ返金できます');
    if (!sale.demo) {
      if (sale.method === 'card') await stripe.createRefund({ payment_intent: sale.provider_ref, metadata: { app: APP_TAG, sale_id: String(sale.id) } }, `remoreji-refund-${sale.id}`);
      else await paypay.refund({ merchantRefundId: `rmjr-${sale.id}`, paymentId: sale.provider_payment_id, amount: sale.total, reason: '店舗による返金' });
    }
    getDb().prepare("UPDATE sales SET status = 'refunded', refunded_at = ? WHERE id = ?").run(nowIso(), saleId);
    return getSale(saleId);
  });
}

/** 日本時間のその日に会計した取引（返金済み含む）と集計 */
export function salesOfDay(day = jst().day) {
  const [from, to] = jstDayRange(day);
  const sales = getDb().prepare("SELECT * FROM sales WHERE paid_at >= ? AND paid_at < ? AND receipt_no IS NOT NULL ORDER BY paid_at").all(from, to).map(parseSale);
  const summary = { count: 0, total: 0, card: 0, paypay: 0, refunded: 0, taxes: { 10: { amount: 0, tax: 0 }, 8: { amount: 0, tax: 0 } } };
  for (const s of sales) {
    if (s.status === 'refunded') {
      summary.refunded += s.total;
      continue;
    }
    summary.count++;
    summary.total += s.total;
    summary[s.method] += s.total;
    for (const t of s.taxes) {
      summary.taxes[t.rate].amount += t.amount;
      summary.taxes[t.rate].tax += t.tax;
    }
  }
  return { day, sales, summary };
}

/** 画面に出すお会計の状態。role によって見せる情報を変える。 */
export function saleView(sale, role) {
  if (!sale) return null;
  const a = sale.attempt;
  return {
    id: sale.id,
    status: sale.status,
    items: sale.items,
    total: sale.total,
    taxes: sale.taxes,
    method: sale.method,
    receiptNo: sale.receipt_no,
    receiptUrl: sale.receipt_no ? `/receipt/${sale.receipt_token}` : null,
    demo: !!sale.demo,
    attempt: a && {
      method: a.method,
      demo: !!a.demo,
      expiresAt: a.expiresAt ?? null,
      failed: a.failed ?? null,
      ...(role === 'customer' && a.method === 'paypay' ? { url: a.url, qr: a.qr } : {}),
    },
  };
}

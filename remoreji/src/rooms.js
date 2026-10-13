// 接客ルーム（1回のビデオ通話）とレジのカート。
import crypto from 'node:crypto';
import { config } from './config.js';
import { getDb, tx } from './db.js';
import { UserError, computeTotals, nowIso, randomToken, TAX_RATES } from './util.js';

const listeners = new Set();
/** ルームの状態が変わったら呼ばれる（WebSocket で画面へ配信するため） */
export const onRoomChange = (fn) => listeners.add(fn);
export const emitChange = (roomId) => listeners.forEach((fn) => fn(roomId));

const MAX_LINES = 200;
const MAX_QTY = 999;
const MAX_PRICE = 10_000_000;

function parseRoom(row) {
  return row && { ...row, cart: JSON.parse(row.cart_json) };
}

export const getRoom = (id) => parseRoom(getDb().prepare('SELECT * FROM rooms WHERE id = ?').get(id));
export const getRoomByToken = (token) => parseRoom(getDb().prepare('SELECT * FROM rooms WHERE token = ?').get(String(token)));

export function getRoomByCode(code) {
  if (!/^\d{6}$/.test(String(code))) return undefined;
  return parseRoom(getDb().prepare("SELECT * FROM rooms WHERE code = ? AND status != 'closed'").get(String(code)));
}

export const inviteUrl = (room) => `${config.baseUrl}/r/${room.token}`;

/** origin: staff（店員が招待リンクを発行）| customer（お客様がお店を呼び出し） */
export function createRoom(origin) {
  return tx((d) => {
    let code;
    do code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    while (d.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code));
    const id = randomToken(9);
    d.prepare('INSERT INTO rooms (id, token, code, status, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, randomToken(24), code, origin === 'customer' ? 'waiting' : 'open', origin, nowIso(),
    );
    return getRoom(id);
  });
}

export function listActiveRooms() {
  return getDb().prepare("SELECT * FROM rooms WHERE status != 'closed' ORDER BY created_at").all().map(parseRoom);
}

/** 店員が応答した */
export function answerRoom(id) {
  const r = getDb().prepare("UPDATE rooms SET status = 'open', answered_at = ? WHERE id = ? AND status = 'waiting'").run(nowIso(), id);
  if (r.changes) emitChange(id);
}

export function closeRoom(id) {
  const room = getRoom(id);
  if (!room || room.status === 'closed') return;
  if (room.sale_id && getDb().prepare("SELECT 1 FROM sales WHERE id = ? AND status = 'pending'").get(room.sale_id)) {
    throw new UserError('お会計の途中です。先にお会計を取り消してください');
  }
  getDb().prepare("UPDATE rooms SET status = 'closed', code = NULL, closed_at = ? WHERE id = ?").run(nowIso(), id);
  emitChange(id);
}

// ---------- カート（会計中は変更できない） ----------

function mutateCart(roomId, fn) {
  tx((d) => {
    const room = getRoom(roomId);
    if (!room || room.status === 'closed') throw new UserError('この接客は終了しています');
    const sale = room.sale_id && d.prepare('SELECT status FROM sales WHERE id = ?').get(room.sale_id);
    if (sale?.status === 'pending') throw new UserError('お会計中はカートを変更できません');
    // 会計済みの画面のまま次の商品を入れ始めたら、新しいお会計に切り替える
    if (sale) d.prepare('UPDATE rooms SET sale_id = NULL WHERE id = ?').run(roomId);
    const cart = fn(room.cart);
    if (cart.length > MAX_LINES) throw new UserError('明細が多すぎます');
    d.prepare('UPDATE rooms SET cart_json = ? WHERE id = ?').run(JSON.stringify(cart), roomId);
  });
  emitChange(roomId);
}

function validLine({ name, price, taxRate }) {
  name = String(name ?? '').trim().slice(0, 60);
  price = Number(price);
  taxRate = Number(taxRate);
  if (!name) throw new UserError('品名を入力してください');
  if (!Number.isInteger(price) || Math.abs(price) > MAX_PRICE) throw new UserError('金額が不正です');
  if (!TAX_RATES.includes(taxRate)) throw new UserError('税率は 10% か 8% です');
  return { name, price, taxRate };
}

export function addProduct(roomId, productId) {
  const p = getDb().prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(productId));
  if (!p) throw new UserError('商品が見つかりません');
  mutateCart(roomId, (cart) => {
    const same = cart.find((l) => l.productId === p.id && l.price === p.price && l.taxRate === p.tax_rate);
    if (same) {
      same.qty = Math.min(MAX_QTY, same.qty + 1);
      return cart;
    }
    return [...cart, { id: randomToken(6), productId: p.id, name: p.name, price: p.price, taxRate: p.tax_rate, qty: 1 }];
  });
}

/** 商品マスタにないもの（自由入力）や値引き（マイナス金額）を追加 */
export function addCustom(roomId, line) {
  const v = validLine(line);
  mutateCart(roomId, (cart) => [...cart, { id: randomToken(6), productId: null, ...v, qty: 1 }]);
}

export function setQty(roomId, lineId, qty) {
  qty = Number(qty);
  if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) throw new UserError('数量が不正です');
  mutateCart(roomId, (cart) => (qty === 0 ? cart.filter((l) => l.id !== lineId) : cart.map((l) => (l.id === lineId ? { ...l, qty } : l))));
}

export const removeLine = (roomId, lineId) => mutateCart(roomId, (cart) => cart.filter((l) => l.id !== lineId));
export const clearCart = (roomId) => mutateCart(roomId, () => []);

export const cartTotals = (cart) => computeTotals(cart);

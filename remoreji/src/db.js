import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let db;

const SAMPLE_PRODUCTS = [
  ['お米', 'コシヒカリ 2kg', 1980, 8],
  ['お米', 'コシヒカリ 5kg', 4280, 8],
  ['お米', 'コシヒカリ 10kg', 8280, 8],
  ['お米', 'ミルキークイーン 5kg', 4580, 8],
  ['加工品', '米粉 500g', 480, 8],
  ['加工品', '玄米茶', 650, 8],
  ['雑貨', '米びつ 10kg用', 2980, 10],
  ['雑貨', 'ギフト箱', 300, 10],
];

export function getDb() {
  if (db) return db;
  const file = process.env.REMOREJI_DB === ':memory:' ? ':memory:' : path.join(config.dataDir, 'remoreji.db');
  if (file !== ':memory:') mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      category   TEXT NOT NULL DEFAULT '',
      name       TEXT NOT NULL,
      price      INTEGER NOT NULL,          -- 税込価格（円）
      tax_rate   INTEGER NOT NULL,          -- 10 または 8（軽減税率）
      sort       INTEGER NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id           TEXT PRIMARY KEY,
      token        TEXT UNIQUE NOT NULL,      -- お客様用URLに入る推測不能な文字列
      code         TEXT,                      -- 6桁の入室コード（開いている間だけ有効）
      status       TEXT NOT NULL,             -- waiting（お客様が呼び出し中）| open | closed
      origin       TEXT NOT NULL,             -- staff（店員が招待）| customer（お客様が呼び出し）
      cart_json    TEXT NOT NULL DEFAULT '[]',
      sale_id      INTEGER,                   -- 会計中／会計済みの取引
      created_at   TEXT NOT NULL,
      answered_at  TEXT,
      closed_at    TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS rooms_code ON rooms(code) WHERE code IS NOT NULL;
    CREATE TABLE IF NOT EXISTS sales (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id             TEXT NOT NULL,
      status              TEXT NOT NULL,      -- pending | paid | canceled | refunded
      method              TEXT,               -- card | paypay
      attempt_json        TEXT,               -- 進行中の決済（カードの決済ページ / PayPay QR）
      items_json          TEXT NOT NULL,
      total               INTEGER NOT NULL,
      taxes_json          TEXT NOT NULL,
      receipt_no          TEXT UNIQUE,
      receipt_token       TEXT UNIQUE NOT NULL,
      provider_ref        TEXT,               -- Stripe 決済ページ（Checkout Session）ID / PayPay merchantPaymentId
      provider_payment_id TEXT,               -- Stripe PaymentIntent ID / PayPay paymentId（返金に使う）
      demo                INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL,
      paid_at             TEXT,
      refunded_at         TEXT
    );
    CREATE INDEX IF NOT EXISTS sales_paid_at ON sales(paid_at);
    CREATE TABLE IF NOT EXISTS receipt_seq (
      day  TEXT PRIMARY KEY,
      last INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0 && !process.env.REMOREJI_NO_SAMPLE) {
    const ins = db.prepare('INSERT INTO products (category, name, price, tax_rate, sort) VALUES (?, ?, ?, ?, ?)');
    SAMPLE_PRODUCTS.forEach(([c, n, p, t], i) => ins.run(c, n, p, t, i));
  }
  return db;
}

export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/** テスト用：DBを作り直す */
export function resetDb() {
  if (db) db.close();
  db = undefined;
}

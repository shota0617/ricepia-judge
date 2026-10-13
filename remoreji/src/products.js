// 商品マスタ。価格は税込。消した商品も過去の取引には名前・価格が残る（取引側に写しを持つため）。
import { getDb } from './db.js';
import { UserError, TAX_RATES } from './util.js';

const view = (p) => ({ id: p.id, category: p.category, name: p.name, price: p.price, taxRate: p.tax_rate, sort: p.sort });

export const listProducts = () => getDb().prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort, id').all().map(view);

function validate(input) {
  const name = String(input.name ?? '').trim().slice(0, 60);
  const category = String(input.category ?? '').trim().slice(0, 30);
  const price = Number(input.price);
  const taxRate = Number(input.taxRate);
  const sort = Number(input.sort ?? 0);
  if (!name) throw new UserError('商品名を入力してください');
  if (!Number.isInteger(price) || price < 0 || price > 10_000_000) throw new UserError('価格は 0 円以上の整数で入力してください');
  if (!TAX_RATES.includes(taxRate)) throw new UserError('税率は 10% か 8% です');
  if (!Number.isInteger(sort)) throw new UserError('並び順が不正です');
  return { name, category, price, taxRate, sort };
}

export function createProduct(input) {
  const v = validate(input);
  const r = getDb().prepare('INSERT INTO products (category, name, price, tax_rate, sort) VALUES (?, ?, ?, ?, ?)').run(v.category, v.name, v.price, v.taxRate, v.sort);
  return view(getDb().prepare('SELECT * FROM products WHERE id = ?').get(r.lastInsertRowid));
}

export function updateProduct(id, input) {
  const v = validate(input);
  const r = getDb().prepare('UPDATE products SET category = ?, name = ?, price = ?, tax_rate = ?, sort = ? WHERE id = ? AND active = 1').run(v.category, v.name, v.price, v.taxRate, v.sort, Number(id));
  if (!r.changes) throw new UserError('商品が見つかりません', 404);
  return view(getDb().prepare('SELECT * FROM products WHERE id = ?').get(Number(id)));
}

export function deleteProduct(id) {
  const r = getDb().prepare('UPDATE products SET active = 0 WHERE id = ?').run(Number(id));
  if (!r.changes) throw new UserError('商品が見つかりません', 404);
}

import crypto from 'node:crypto';
import { config } from './config.js';

/** お客様・店員にそのまま見せてよいエラー */
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const nowIso = () => new Date().toISOString();

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const yen = (n) => `${n < 0 ? '-' : ''}¥${Math.abs(Number(n)).toLocaleString('ja-JP')}`;

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** 日本時間の { day: 'YYYY-MM-DD', time: 'HH:MM:SS' } */
export function jst(date = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map(({ type, value }) => [type, value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

/** 日本時間のその日の 0:00〜翌0:00 を ISO 文字列で */
export function jstDayRange(day) {
  const start = new Date(`${day}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) throw new UserError('日付が不正です');
  const end = new Date(start.getTime() + 86_400_000);
  return [start.toISOString(), end.toISOString()];
}

export const TAX_RATES = [10, 8];

/**
 * 明細から合計と税額を計算する（価格はすべて税込）。
 * インボイス制度に合わせ、税率ごとに合計してから1回だけ端数（切り捨て）処理する。
 */
export function computeTotals(items) {
  const groups = Object.fromEntries(TAX_RATES.map((r) => [r, 0]));
  let count = 0;
  for (const it of items) {
    groups[it.taxRate] += it.price * it.qty;
    count += it.qty;
  }
  const taxes = TAX_RATES.filter((r) => groups[r] !== 0).map((rate) => ({
    rate,
    amount: groups[rate], // 税率ごとの税込対象額
    tax: Math.floor((groups[rate] * rate) / (100 + rate)),
  }));
  const total = taxes.reduce((s, t) => s + t.amount, 0);
  return { total, taxes, count };
}

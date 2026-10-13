// 店員ログイン（共有パスワード＋署名付き Cookie）と簡易レート制限。
import crypto from 'node:crypto';
import { config, isDemo } from './config.js';
import { getDb } from './db.js';
import { UserError } from './util.js';

const COOKIE = 'rmj_staff';
const SESSION_DAYS = 14;

function secret() {
  if (config.sessionSecret) return config.sessionSecret;
  const d = getDb();
  let row = d.prepare("SELECT value FROM kv WHERE key = 'session_secret'").get();
  if (!row) {
    d.prepare("INSERT OR IGNORE INTO kv (key, value) VALUES ('session_secret', ?)").run(crypto.randomBytes(32).toString('hex'));
    row = d.prepare("SELECT value FROM kv WHERE key = 'session_secret'").get();
  }
  return row.value;
}

const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/** パスワードが正しければ Set-Cookie ヘッダー値を返す */
export function login(password) {
  if (!config.staffPassword) {
    if (!isDemo()) throw new UserError('STAFF_PASSWORD が設定されていません', 500);
  } else if (!safeEqual(password ?? '', config.staffPassword)) {
    throw new UserError('パスワードが違います', 401);
  }
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const value = `${exp}.${sign(String(exp))}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${config.baseUrl.startsWith('https:') ? '; Secure' : ''}`;
}

export const logoutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function isStaff(req) {
  const cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k));
  const [exp, mac] = (cookies[COOKIE] ?? '').split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, sign(exp));
}

/** 別サイトからの操作（CSRF / WebSocket 乗っ取り）を防ぐため、Origin が自サイトか確かめる */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 同一オリジンの GET / 非ブラウザ
  try {
    const o = new URL(origin);
    return o.origin === new URL(config.baseUrl).origin || o.host === req.headers.host;
  } catch {
    return false;
  }
}

// ---------- レート制限（メモリ上・1プロセス想定） ----------
const buckets = new Map();
/** key ごとに windowMs あたり max 回まで */
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  if (++b.n > max) throw new UserError('操作が多すぎます。しばらくしてからお試しください', 429);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

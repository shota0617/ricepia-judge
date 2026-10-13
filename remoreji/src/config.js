// リモレジの設定。秘密情報は .env（環境変数）で管理する。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (existsSync(envFile) && !process.env.REMOREJI_SKIP_DOTENV) process.loadEnvFile(envFile);

const env = (key, fallback = '') => process.env[key] || fallback;
const list = (key) => env(key).split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(env('PORT', '3000')),
  baseUrl: env('BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  dataDir: path.resolve(ROOT, env('DATA_DIR', 'data')),

  // 店員ログイン用パスワード。本番では必須（未設定だとデモモード以外ではログインできない）。
  staffPassword: env('STAFF_PASSWORD'),
  // Cookie 署名用の鍵。未設定なら data/ に自動生成して保存する。
  sessionSecret: env('SESSION_SECRET'),

  store: {
    name: env('STORE_NAME', 'らいすぴあ'),
    address: env('STORE_ADDRESS', ''),
    tel: env('STORE_TEL', ''),
    // 適格請求書発行事業者の登録番号（T + 13桁）。レシートに印字する。
    invoiceNo: env('INVOICE_NO', ''),
  },

  // クレジットカード（Stripe）。未設定ならカード決済はデモ（擬似決済）になる。
  stripe: {
    secretKey: env('STRIPE_SECRET_KEY'),
    publishableKey: env('STRIPE_PUBLISHABLE_KEY'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
  },

  // PayPay（PayPay for Developers のウェブペイメント）。未設定なら PayPay 決済はデモになる。
  paypay: {
    apiKey: env('PAYPAY_API_KEY'),
    apiSecret: env('PAYPAY_API_SECRET'),
    merchantId: env('PAYPAY_MERCHANT_ID'),
    production: env('PAYPAY_ENV', 'sandbox') === 'production',
  },

  // ビデオ通話の接続補助サーバー（WebRTC の ICE）。
  // 携帯回線や社内ネットワーク同士だと STUN だけでは繋がらないことがあるので、本番では TURN を設定する。
  ice: {
    stunUrls: list('STUN_URLS').length ? list('STUN_URLS') : ['stun:stun.l.google.com:19302'],
    turnUrls: list('TURN_URLS'),
    turnUsername: env('TURN_USERNAME'),
    turnCredential: env('TURN_CREDENTIAL'),
  },

  timeZone: 'Asia/Tokyo',
};

export const cardIsDemo = () => !config.stripe.secretKey;
export const paypayIsDemo = () => !(config.paypay.apiKey && config.paypay.apiSecret && config.paypay.merchantId);
/** 決済の鍵が未設定で、自分のパソコンだけで試している状態（店員パスワードなしでログイン可） */
export const isDemo = () => cardIsDemo() && paypayIsDemo() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(config.baseUrl);

export function iceServers() {
  const servers = [{ urls: config.ice.stunUrls }];
  if (config.ice.turnUrls.length) {
    servers.push({ urls: config.ice.turnUrls, username: config.ice.turnUsername, credential: config.ice.turnCredential });
  }
  return servers;
}

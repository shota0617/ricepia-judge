import http from 'node:http';
import QRCode from 'qrcode';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config, cardIsDemo, paypayIsDemo, isDemo, iceServers, ROOT } from './config.js';
import { getDb } from './db.js';
import { UserError, esc, yen, jst } from './util.js';
import * as auth from './auth.js';
import * as rooms from './rooms.js';
import * as payments from './payments.js';
import * as products from './products.js';
import { verifyWebhook } from './stripe.js';
import { createHub, peers } from './hub.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  // カメラ・マイクは自サイトだけ。決済（Payment Request）は Stripe の枠でも使えるように
  'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), payment=(self "https://js.stripe.com")',
};

const send = (res, status, body, type = 'application/json; charset=utf-8', headers = {}) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function readBody(req, limit = 200_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new UserError('リクエストが大きすぎます', 413);
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch {
    throw new UserError('JSONが不正です');
  }
}

const clientIp = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress;

async function serveFile(res, file) {
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
  try {
    send(res, 200, await readFile(full), MIME[path.extname(full)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
  }
}

// ---------- レシート（領収書） ----------

const METHOD_LABEL = { card: 'クレジットカード', paypay: 'PayPay' };

function renderReceipt(sale) {
  const paid = new Date(sale.paid_at);
  const { day, time } = jst(paid);
  const s = config.store;
  const rows = sale.items.map((it) => `<tr><td>${esc(it.name)}${it.taxRate === 8 ? ' ※' : ''}${it.qty > 1 ? `<br><small>${yen(it.price)} × ${it.qty}</small>` : ''}</td><td class="r">${yen(it.price * it.qty)}</td></tr>`).join('');
  const taxRows = sale.taxes.map((t) => `<tr><td>${t.rate}%対象${t.rate === 8 ? '（※軽減税率）' : ''}</td><td class="r">${yen(t.amount)}<br><small>内消費税 ${yen(t.tax)}</small></td></tr>`).join('');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>領収書 ${esc(sale.receipt_no)} - ${esc(s.name)}</title>
<style>body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;background:#f4f1ea;margin:0;padding:16px;color:#222}
.paper{max-width:380px;margin:0 auto;background:#fff;padding:22px 20px;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
h1{font-size:20px;text-align:center;letter-spacing:.3em;margin:0 0 6px}.c{text-align:center}.store{font-weight:700;font-size:16px}
small{color:#666}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:5px 0;vertical-align:top}.r{text-align:right;white-space:nowrap}
hr{border:0;border-top:1px dashed #aaa;margin:12px 0}.total td{font-size:20px;font-weight:700}.refunded{color:#b00;text-align:center;font-weight:700;border:2px solid #b00;padding:6px;margin:10px 0}
.demo{background:#fff3cd;padding:6px;text-align:center;font-size:12px;margin-bottom:10px}button{margin:16px auto 0;display:block;padding:10px 24px;font-size:14px;border-radius:8px;border:1px solid #999;background:#fff}
@media print{body{background:#fff;padding:0}.paper{box-shadow:none}button{display:none}}</style></head><body><div class="paper">
${sale.demo ? '<div class="demo">デモ取引（実際の決済は行われていません）</div>' : ''}
<h1>領収書</h1>
<p class="c store">${esc(s.name)}</p>
<p class="c"><small>${[s.address, s.tel && `TEL ${s.tel}`].filter(Boolean).map(esc).join('<br>')}${s.invoiceNo ? `<br>登録番号 ${esc(s.invoiceNo)}` : ''}</small></p>
<p><small>${day.replaceAll('-', '/')} ${time.slice(0, 5)}<br>No. ${esc(sale.receipt_no)}</small></p>
${sale.status === 'refunded' ? '<div class="refunded">返金済み</div>' : ''}
<hr><table>${rows}</table><hr>
<table class="total"><tr><td>合計</td><td class="r">${yen(sale.total)}</td></tr></table>
<table>${taxRows}<tr><td>お支払い</td><td class="r">${METHOD_LABEL[sale.method] ?? ''}</td></tr></table>
${sale.taxes.some((t) => t.rate === 8) ? '<p><small>※印は軽減税率（8%）対象商品です</small></p>' : ''}
<p class="c"><small>上記正に領収いたしました</small></p>
<button onclick="print()">印刷 / PDFで保存</button></div></body></html>`;
}

function demoPayPayPage(ref, info) {
  const body = !info
    ? '<p>このQRコードは無効です。</p>'
    : info.status === 'paid'
      ? '<p class="ok">お支払いが完了しました ✓</p>'
      : `<p>お支払い金額</p><p class="amt">${yen(info.total)}</p><form method="post"><button>支払う（デモ）</button></form>`;
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayPay（デモ）</title>
<style>body{font-family:sans-serif;background:#f2f2f2;margin:0;padding:24px;text-align:center}.box{max-width:360px;margin:auto;background:#fff;border-radius:14px;padding:24px}
.logo{background:#ff0033;color:#fff;font-weight:900;font-size:22px;border-radius:10px;padding:10px}.amt{font-size:34px;font-weight:700}.ok{color:#0a7d32;font-size:20px;font-weight:700}
button{width:100%;padding:16px;background:#ff0033;color:#fff;border:0;border-radius:10px;font-size:17px;font-weight:700}.n{font-size:12px;color:#777;margin-top:16px}</style></head>
<body><div class="box"><div class="logo">PayPay（デモ）</div>${body}<p class="n">これはデモ用の擬似決済画面です。本番では PayPay アプリが開きます。</p></div></body></html>`;
}

function salesCsv(day) {
  const { sales } = payments.salesOfDay(day);
  const q = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lines = [['レシート番号', '日時', '状態', '支払方法', '合計', '10%対象', '10%消費税', '8%対象', '8%消費税', '明細'].map(q).join(',')];
  for (const s of sales) {
    const t = Object.fromEntries(s.taxes.map((x) => [x.rate, x]));
    const { day: d, time } = jst(new Date(s.paid_at));
    lines.push([s.receipt_no, `${d} ${time}`, s.status === 'refunded' ? '返金済み' : '会計済み', METHOD_LABEL[s.method], s.total,
      t[10]?.amount ?? 0, t[10]?.tax ?? 0, t[8]?.amount ?? 0, t[8]?.tax ?? 0, s.items.map((i) => `${i.name}×${i.qty}`).join(' / ')].map(q).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n'; // Excel で文字化けしないよう BOM 付き UTF-8
}

// ---------- ルーティング ----------

function requireStaff(req) {
  if (!auth.isStaff(req)) throw new UserError('ログインしてください', 401);
  if (req.method !== 'GET' && !auth.sameOrigin(req)) throw new UserError('不正なリクエストです', 403);
}

function customerRoom(token) {
  const room = rooms.getRoomByToken(token);
  if (!room || room.status === 'closed') throw new UserError('この接客は終了しました', 404);
  return room;
}

const roomSummary = (r) => ({ id: r.id, status: r.status, origin: r.origin, code: r.code, createdAt: r.created_at, peers: peers(r.id), inviteUrl: rooms.inviteUrl(r) });

async function route(req, res) {
  const url = new URL(req.url, config.baseUrl);
  const { pathname } = url;
  const method = req.method;
  let m;

  // ---- 画面 ----
  if (method === 'GET') {
    if (pathname === '/') return serveFile(res, 'index.html');
    if (pathname === '/staff') return serveFile(res, 'staff.html');
    if (/^\/staff\/room\/[\w-]+$/.test(pathname)) return serveFile(res, 'register.html');
    if (/^\/r\/[\w-]+$/.test(pathname)) return serveFile(res, 'customer.html');
    if ((m = pathname.match(/^\/receipt\/([\w-]+)$/))) {
      const sale = payments.getSaleByReceiptToken(m[1]);
      return sale ? send(res, 200, renderReceipt(sale), MIME['.html']) : send(res, 404, '領収書が見つかりません', 'text/plain; charset=utf-8');
    }
    if ((m = pathname.match(/^\/demo\/paypay\/([\w-]+)$/))) {
      if (!paypayIsDemo()) return send(res, 404, 'Not Found', 'text/plain');
      return send(res, 200, demoPayPayPage(m[1], payments.demoPayPayInfo(m[1])), MIME['.html']);
    }
    if (/^\/[\w-]+\.(css|js|svg|png|ico|mp3)$/.test(pathname)) return serveFile(res, pathname.slice(1));
  }

  if (method === 'POST' && (m = pathname.match(/^\/demo\/paypay\/([\w-]+)$/))) {
    if (!paypayIsDemo()) return send(res, 404, 'Not Found', 'text/plain');
    try {
      payments.demoPayPayPay(m[1]);
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
    }
    return send(res, 303, '', 'text/plain', { Location: pathname });
  }

  // ---- Webhook ----
  if (method === 'POST' && pathname === '/webhooks/stripe') {
    if (!config.stripe.webhookSecret) return send(res, 404, { error: 'Webhook は未設定です' });
    let event;
    try {
      event = verifyWebhook(await readBody(req, 1_000_000), req.headers['stripe-signature'], config.stripe.webhookSecret);
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
    return send(res, 200, { received: true, ...(await payments.handleStripeEvent(event)) });
  }
  if (method === 'POST' && pathname === '/webhooks/paypay') {
    // 本文は信用せず、書かれている取引番号について PayPay API に問い合わせ直す
    const body = await readJson(req).catch(() => ({}));
    const ref = body.merchant_order_id ?? body.merchantPaymentId;
    if (ref && !paypayIsDemo()) await payments.checkPayPay(String(ref)).catch((e) => console.error('[paypay webhook]', e.message));
    return send(res, 200, { received: true });
  }

  // ---- お客様 ----
  if (method === 'POST' && pathname === '/api/call') {
    // お客様が「店員を呼ぶ」：呼び出し中のルームを作る
    auth.rateLimit(`call:${clientIp(req)}`, 5, 10 * 60_000);
    const room = rooms.createRoom('customer');
    return send(res, 200, { token: room.token });
  }
  if (method === 'POST' && pathname === '/api/join') {
    auth.rateLimit(`join:${clientIp(req)}`, 10, 60_000);
    const room = rooms.getRoomByCode(String((await readJson(req)).code ?? '').trim());
    if (!room) throw new UserError('入室コードが見つかりません', 404);
    return send(res, 200, { token: room.token });
  }
  if ((m = pathname.match(/^\/api\/r\/([\w-]+)(\/.*)?$/))) {
    const [, token, sub = ''] = m;
    if (method === 'GET' && sub === '') {
      const room = customerRoom(token);
      return send(res, 200, { store: config.store.name, status: room.status, cardDemo: cardIsDemo(), paypayDemo: paypayIsDemo(), iceServers: iceServers() });
    }
    if (method !== 'POST') throw new UserError('Not Found', 404);
    if (!auth.sameOrigin(req)) throw new UserError('不正なリクエストです', 403);
    auth.rateLimit(`pay:${token}`, 30, 60_000);
    const room = customerRoom(token);
    switch (sub) {
      case '/pay/card': return send(res, 200, await payments.selectCard(room));
      case '/pay/card/confirm': return send(res, 200, await payments.confirmCard(room));
      case '/pay/card/demo': payments.demoPayCard(room); return send(res, 200, { ok: true });
      case '/pay/paypay': await payments.selectPayPay(room, req.headers['user-agent']); return send(res, 200, { ok: true });
      case '/pay/back': await payments.backToMethods(room); return send(res, 200, { ok: true });
    }
    throw new UserError('Not Found', 404);
  }

  // ---- 店員 ----
  if (method === 'POST' && pathname === '/api/staff/login') {
    if (!auth.sameOrigin(req)) throw new UserError('不正なリクエストです', 403);
    auth.rateLimit(`login:${clientIp(req)}`, 10, 10 * 60_000);
    const cookie = auth.login((await readJson(req)).password);
    return send(res, 200, { ok: true }, undefined, { 'Set-Cookie': cookie });
  }
  if (method === 'POST' && pathname === '/api/staff/logout') return send(res, 200, { ok: true }, undefined, { 'Set-Cookie': auth.logoutCookie() });
  if (method === 'GET' && pathname === '/api/staff/me') {
    return send(res, 200, {
      loggedIn: auth.isStaff(req), demo: isDemo(), passwordless: !config.staffPassword && isDemo(),
      store: config.store.name, cardDemo: cardIsDemo(), paypayDemo: paypayIsDemo(),
      iceServers: auth.isStaff(req) ? iceServers() : undefined,
    });
  }
  if (pathname.startsWith('/api/staff/')) {
    requireStaff(req);
    const sub = pathname.slice('/api/staff'.length);
    if (method === 'GET' && sub === '/rooms') return send(res, 200, { rooms: rooms.listActiveRooms().map(roomSummary) });
    if (method === 'POST' && sub === '/rooms') return send(res, 200, roomSummary(rooms.createRoom('staff')));
    if ((m = sub.match(/^\/rooms\/([\w-]+)$/)) && method === 'GET') {
      const room = rooms.getRoom(m[1]);
      if (!room) throw new UserError('接客が見つかりません', 404);
      return send(res, 200, { ...roomSummary(room), qr: await QRCode.toDataURL(rooms.inviteUrl(room), { margin: 1, width: 280 }) });
    }
    if ((m = sub.match(/^\/rooms\/([\w-]+)\/close$/)) && method === 'POST') {
      rooms.closeRoom(m[1]);
      return send(res, 200, { ok: true });
    }
    if (sub === '/products' && method === 'GET') return send(res, 200, { products: products.listProducts() });
    if (sub === '/products' && method === 'POST') return send(res, 200, products.createProduct(await readJson(req)));
    if ((m = sub.match(/^\/products\/(\d+)$/))) {
      if (method === 'PUT') return send(res, 200, products.updateProduct(m[1], await readJson(req)));
      if (method === 'DELETE') {
        products.deleteProduct(m[1]);
        return send(res, 200, { ok: true });
      }
    }
    if (sub === '/sales' && method === 'GET') {
      const day = url.searchParams.get('day') || jst().day;
      const r = payments.salesOfDay(day);
      return send(res, 200, { ...r, sales: r.sales.map((s) => ({ ...payments.saleView(s, 'staff'), paidAt: s.paid_at, refundedAt: s.refunded_at })) });
    }
    if (sub === '/sales.csv' && method === 'GET') {
      const day = url.searchParams.get('day') || jst().day;
      return send(res, 200, salesCsv(day), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="sales-${day.replace(/[^\d-]/g, '')}.csv"` });
    }
    if ((m = sub.match(/^\/sales\/(\d+)\/refund$/)) && method === 'POST') return send(res, 200, payments.saleView(await payments.refundSale(Number(m[1])), 'staff'));
  }

  send(res, 404, { error: 'Not Found' });
}

export function createServer() {
  getDb();
  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (e) {
      if (e instanceof UserError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'サーバーでエラーが発生しました。もう一度お試しください' });
    }
  });
  createHub(server);
  payments.resumePolling();
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'src', 'server.js')) {
  createServer().listen(config.port, () => {
    console.log(`リモレジ起動: ${config.baseUrl}  （店員画面 ${config.baseUrl}/staff）`);
    if (cardIsDemo()) console.log('  カード決済: デモモード（STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY 未設定）');
    if (paypayIsDemo()) console.log('  PayPay決済: デモモード（PAYPAY_API_KEY / PAYPAY_API_SECRET / PAYPAY_MERCHANT_ID 未設定）');
    if (!config.staffPassword) console.log(isDemo() ? '  店員ログイン: パスワードなし（デモ）' : '  ⚠ STAFF_PASSWORD が未設定のため店員ログインできません');
  });
}

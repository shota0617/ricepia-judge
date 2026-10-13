// PayPay for Developers（Open Payment API / ウェブペイメント）の最小クライアント（SDK不要）。
// 署名方式は公式 SDK（@paypayopa/paypayopa-sdk-node）の createAuthHeader と同じ。
import crypto from 'node:crypto';
import { config } from './config.js';

const host = () => (config.paypay.production ? 'https://apigw.paypay.ne.jp' : 'https://apigw.sandbox.paypay.ne.jp');

export class PayPayError extends Error {
  constructor(message, resultInfo) {
    super(message);
    this.code = resultInfo?.code;
  }
}

/** Authorization: hmac OPA-Auth:... ヘッダーを作る */
export function authHeader({ method, path, body, apiKey, apiSecret, nonce = crypto.randomUUID(), epoch = Math.floor(Date.now() / 1000) }) {
  let contentType = 'empty';
  let digest = 'empty';
  if (body !== undefined && body !== null) {
    contentType = 'application/json';
    digest = crypto.createHash('md5').update(contentType).update(body).digest('base64');
  }
  const raw = [path, method, nonce, epoch, contentType, digest].join('\n');
  const mac = crypto.createHmac('sha256', apiSecret).update(raw).digest('base64');
  return `hmac OPA-Auth:${[apiKey, mac, nonce, epoch, digest].join(':')}`;
}

async function call(method, path, payload) {
  const body = payload ? JSON.stringify({ ...payload, requestedAt: Math.floor(Date.now() / 1000) }) : undefined;
  const res = await fetch(host() + path, {
    method,
    headers: {
      Authorization: authHeader({ method, path, body, apiKey: config.paypay.apiKey, apiSecret: config.paypay.apiSecret }),
      'X-ASSUME-MERCHANT': config.paypay.merchantId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  const info = json.resultInfo;
  if (!res.ok || (info && info.code !== 'SUCCESS' && info.code !== 'REQUEST_ACCEPTED')) {
    throw new PayPayError(`PayPay ${method} ${path} 失敗: ${info?.code ?? res.status} ${info?.message ?? ''}`.trim(), info);
  }
  return json.data ?? {};
}

/** 支払い用の QR コード（スマホならアプリが開くリンク）を作る */
export const createCode = ({ merchantPaymentId, amount, orderDescription, redirectUrl, userAgent }) =>
  call('POST', '/v2/codes', {
    merchantPaymentId,
    amount: { amount, currency: 'JPY' },
    codeType: 'ORDER_QR',
    orderDescription,
    isAuthorization: false,
    redirectUrl,
    redirectType: 'WEB_LINK',
    userAgent,
  });

/** 支払い状況。status: CREATED | COMPLETED | FAILED | CANCELED | EXPIRED など */
export const getPaymentDetails = (merchantPaymentId) => call('GET', `/v2/codes/payments/${encodeURIComponent(merchantPaymentId)}`);
export const deleteCode = (codeId) => call('DELETE', `/v2/codes/${encodeURIComponent(codeId)}`);
export const refund = ({ merchantRefundId, paymentId, amount, reason }) =>
  call('POST', '/v2/refunds', { merchantRefundId, paymentId, amount: { amount, currency: 'JPY' }, reason });

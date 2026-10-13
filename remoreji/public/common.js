// 画面共通の小物
export const $ = (sel, root = document) => root.querySelector(sel);
export const yen = (n) => `${n < 0 ? '-' : ''}¥${Math.abs(Number(n)).toLocaleString('ja-JP')}`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `通信エラー（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
export function toast(message, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.className = isError ? 'err' : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 5000 : 2500);
}

/** 税率ごとの内訳と合計の HTML */
export function totalsHtml({ total, taxes }) {
  const rows = taxes.map((t) => `<div class="row"><span>${t.rate}%対象${t.rate === 8 ? '（軽減）' : ''} ${yen(t.amount)}</span><span>内税 ${yen(t.tax)}</span></div>`).join('');
  return `<div class="totals">${rows}</div><div class="grand"><span>合計</span><span class="v">${yen(total)}</span></div>`;
}

export function linesHtml(lines, { editable = false } = {}) {
  if (!lines.length) return '';
  return lines.map((l) => `
    <div class="line" data-id="${esc(l.id ?? '')}">
      <div class="name">${esc(l.name)}${l.taxRate === 8 ? ' <span class="muted small">※</span>' : ''}
        <small>${yen(l.price)}${editable ? '' : ` × ${l.qty}`}</small></div>
      ${editable ? `<div class="row" style="gap:4px">
        <button class="btn btn-ghost btn-sm" data-act="dec" aria-label="減らす">−</button>
        <span style="min-width:24px;text-align:center">${l.qty}</span>
        <button class="btn btn-ghost btn-sm" data-act="inc" aria-label="増やす">＋</button></div>` : ''}
      <div class="amt">${yen(l.price * l.qty)}</div>
      ${editable ? '<button class="btn btn-ghost btn-sm" data-act="del" aria-label="削除">×</button>' : ''}
    </div>`).join('');
}

export const METHOD_LABEL = { card: 'クレジットカード', paypay: 'PayPay' };

export const ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M5 10a7 7 0 0 0 11.6 5.3M19 10a7 7 0 0 1-.4 2.3M12 17v5M3 3l18 18"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>',
  camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2m5 0h5a1 1 0 0 1 1 1v3.5l6-3.5v10M3 3l18 18"/></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/></svg>',
  hangup: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.77 7.46 7 12 7s8.66 1.77 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>',
};

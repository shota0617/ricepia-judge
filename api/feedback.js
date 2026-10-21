// にしおさんぽGO：おたより（名所のおしらせ・まちがい・ごいけん）を受けとって、運営者の非公開リポジトリに Issue として置く（Vercel の関数）
// 環境変数：FEEDBACK_REPO（owner/name。非公開のリポジトリ）、FEEDBACK_TOKEN（そのリポジトリの Issues だけ読み書きできるトークン）、
//           FEEDBACK_DAILY_MAX（24時間に受けつける数。ふだん40）。設定が無いあいだは 503 を返す（docs/feedback.md）
// IPアドレス・ブラウザの種類は Issue に書かない（連続投稿を止めるために、この関数のメモリの中で数えるだけ）
'use strict';

const KINDS = { spot: '名所のおしらせ', fun: 'こうしたらもっと面白い', fix: 'スポットの情報のまちがい', idea: 'こまった・使いにくい' };
const BOX = [[34.6, 136.8], [35.1, 137.4]];   // 遊べる範囲（西尾市と となりの市町）をゆったり囲む
const MAX_BODY = 4096, PER_IP = 5, IP_WINDOW = 3600e3, MIN_FILL_MS = 3000;
const hits = new Map();   // IP → 送った時刻の一覧（関数が起きているあいだだけ）

// 制御文字を消し、@（メンション）・#数字（Issue へのリンク）・< > を全角にして、長さを切る
function clean(v, max, multi) {
  if (typeof v !== 'string') return '';
  let s = v.normalize('NFC').replace(multi ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g : /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '');
  s = s.replace(/@/g, '＠').replace(/#(?=\d)/g, '＃').replace(/</g, '＜').replace(/>/g, '＞').trim();   // < > も全角に（HTML・本文に埋めるデータのしるしを まねできないように）
  return [...s].slice(0, max).join('');
}

function originOk(req) {
  const o = req.headers.origin;
  if (!o) return false;
  let h;
  try { h = new URL(o); } catch (_) { return false; }
  if (h.protocol === 'http:' && (h.hostname === 'localhost' || h.hostname === '127.0.0.1')) return true;
  if (h.protocol !== 'https:') return false;
  return h.host === req.headers.host || h.hostname === 'go.ricepia.jp' || /^ricepia-judge(-[a-z0-9-]+)?\.vercel\.app$/.test(h.hostname);
}

function rateOk(ip, now) {
  const list = (hits.get(ip) || []).filter(t => now - t < IP_WINDOW);
  if (list.length >= PER_IP) { hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < IP_WINDOW)) hits.delete(k);
  return true;
}

// 送られてきた内容を確かめて、Issue に書く形にする（だめなら null）
function parse(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const kind = typeof b.kind === 'string' && Object.hasOwn(KINDS, b.kind) ? b.kind : null;
  if (!kind) return null;
  const out = { kind, name: kind === 'spot' ? clean(b.name, 40) : '', text: clean(b.text, 400, true), url: '' };
  if (!out.text || (kind === 'spot' && !out.name)) return null;
  if (typeof b.url === 'string' && b.url.trim()) {
    const u = b.url.trim();
    if (u.length > 200 || !/^https:\/\/[^\s<>"]+$/.test(u)) return null;
    try { out.url = new URL(u).href; } catch (_) { return null; }
  }
  if (b.lat != null || b.lng != null) {
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < BOX[0][0] || lat > BOX[1][0] || lng < BOX[0][1] || lng > BOX[1][1]) return null;
    out.lat = Math.round(lat * 1000) / 1000; out.lng = Math.round(lng * 1000) / 1000;   // 約100mに丸める（ゲームでも丸めてから送る）
  }
  if (kind === 'fix' && b.spot && typeof b.spot === 'object' && typeof b.spot.id === 'string' && /^[\w-]{1,60}$/.test(b.spot.id))
    out.spot = { id: b.spot.id, name: clean(b.spot.name, 60) };
  out.mode = b.mode === 'demo' ? 'demo' : 'real';
  out.ed = typeof b.ed === 'string' && /^[\w-]{0,20}$/.test(b.ed) ? b.ed : '';
  return out;
}

const quote = s => s.split('\n').map(l => '> ' + l).join('\n');
function issueOf(f) {
  const head = f.kind === 'spot' ? f.name : f.kind === 'fix' && f.spot ? f.spot.name : [...f.text.replace(/\s+/g, ' ')].slice(0, 30).join('');
  const lines = [`**${KINDS[f.kind]}**`, ''];
  if (f.name) lines.push(`- 名所の名前：${f.name}`);
  if (f.spot) lines.push(`- スポット：${f.spot.name}（${f.spot.id}）`);
  if (f.lat != null) lines.push(`- だいたいの位置（約100m）：[${f.lat}, ${f.lng}](https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=17/${f.lat}/${f.lng})`);
  if (f.url) lines.push(`- ページ：<${f.url}>`);
  lines.push(`- 遊びかた：${f.mode === 'demo' ? '操作して移動' : 'あるいて移動'}${f.ed ? `（${f.ed} 版）` : ''}`, '', quote(f.text), '',
    '<!-- nsg-feedback:' + Buffer.from(JSON.stringify(f)).toString('base64') + ' -->');
  return { title: `[おたより] ${KINDS[f.kind]}：${head}`, body: lines.join('\n'), labels: ['feedback', 'kind:' + f.kind] };
}

async function gh(path, opt = {}) {
  const r = await fetch('https://api.github.com/repos/' + process.env.FEEDBACK_REPO + path, {
    ...opt,
    headers: { Authorization: 'Bearer ' + process.env.FEEDBACK_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nishio-go-feedback', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return r.json();
}

// 24時間に受けつけた数（新しいじゅんに並べて数える。上限より多くは数えない）
async function recentCount(max, now) {
  const list = await gh(`/issues?labels=feedback&state=all&sort=created&direction=desc&per_page=${Math.min(100, max)}`);
  return list.filter(i => now - Date.parse(i.created_at) < 86400e3).length;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
  if (!/^[\w.-]+\/[\w.-]+$/.test(process.env.FEEDBACK_REPO || '') || !process.env.FEEDBACK_TOKEN)
    return res.status(503).json({ error: 'off' });
  if (!originOk(req)) return res.status(403).json({ error: 'origin' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'type' });
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) return res.status(413).json({ error: 'size' });
  let b = req.body;
  if (typeof b === 'string') { if (b.length > MAX_BODY) return res.status(413).json({ error: 'size' }); try { b = JSON.parse(b); } catch (_) { b = null; } }
  // わな（人には見えない欄）に何か入っている・早すぎる送信は、受けとったふりをして捨てる
  if (b && typeof b === 'object' && ((typeof b.hp === 'string' && b.hp) || !(Number(b.t) >= MIN_FILL_MS))) return res.status(200).json({ ok: true });
  const f = parse(b);
  if (!f) return res.status(400).json({ error: 'bad' });
  const now = Date.now();
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!rateOk(ip, now)) return res.status(429).json({ error: 'rate' });
  const max = Math.max(1, Math.min(100, Number(process.env.FEEDBACK_DAILY_MAX) || 40));
  try {
    if (await recentCount(max, now) >= max) return res.status(429).json({ error: 'daily' });
    await gh('/issues', { method: 'POST', body: JSON.stringify(issueOf(f)) });
  } catch (e) {
    console.error('feedback:', e.message);
    return res.status(502).json({ error: 'store' });
  }
  return res.status(200).json({ ok: true });
};
module.exports.parse = parse;
module.exports.issueOf = issueOf;

// 異常・異常課金の監視スクリプト（GitHub Actions から15分おきに実行）
// 依存パッケージなし。Node 20+ の fetch のみ使用。
//
// 公開リポジトリのため Actions のログは誰でも見られる。
// ログには「どのチェックがOK/NGか」だけを出し、金額などの詳細はメール本文にだけ書く。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const env = process.env;
const num = (k, d) => (env[k] !== undefined && env[k] !== "" ? Number(env[k]) : d);

const ALERT_TO = env.ALERT_EMAIL_TO || "ricepiaricepiaricepia@gmail.com";
const STATE_FILE = env.MONITOR_STATE_FILE || ".monitor-state/state.json";
// 同じ異常が続いている間に再通知する間隔（時間）
const REMIND_HOURS = num("ALERT_REMIND_HOURS", 6);

const LIMITS = {
  anthropicDailyUsd: num("ANTHROPIC_DAILY_USD_LIMIT", 10),
  anthropicMonthlyUsd: num("ANTHROPIC_MONTHLY_USD_LIMIT", 190),
  cfWorkerReq1h: num("CF_WORKER_REQ_1H_LIMIT", 20000),
  cfWorkerReq24h: num("CF_WORKER_REQ_24H_LIMIT", 80000),
  cfWorkerErrorRate: num("CF_WORKER_ERROR_RATE_LIMIT", 0.05),
  cfWorkerErrorMinReq: num("CF_WORKER_ERROR_MIN_REQUESTS", 100),
  cfR2Ops24h: num("CF_R2_OPS_24H_LIMIT", 300000),
  cfD1SizeMb: num("CF_D1_SIZE_MB_LIMIT", 400),
};

// 自動停止。AUTO_STOP=false で無効化（通知のみ）
const AUTO_STOP = env.AUTO_STOP !== "false";
const list = (k) => (env[k] || "").split(",").map((x) => x.trim()).filter(Boolean);

const findings = []; // { key, title, detail }
const stops = new Map(); // key -> { label, fn }  fn は実行した操作の説明配列を返す
const report = []; // ログ用（詳細なし）

function alert(key, title, detail) {
  findings.push({ key, title, detail });
}

async function http(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

async function runCheck(name, enabled, fn) {
  if (!enabled) { report.push(`- ${name}: skip（未設定）`); return; }
  const before = findings.length;
  try {
    await fn();
  } catch (e) {
    alert(`${name}:error`, `${name} の監視自体が失敗しました`, String(e && e.message || e));
  }
  report.push(`- ${name}: ${findings.length > before ? "NG" : "OK"}`);
}

// ---------- サイト死活 ----------
async function checkSites() {
  const urls = (env.MONITOR_URLS || "https://ricepia-judge.vercel.app/")
    .split(",").map((s) => s.trim()).filter(Boolean);
  for (const url of urls) {
    try {
      const r = await http(url, { redirect: "follow" });
      if (!r.ok) alert(`site:${url}`, `サイトが応答しません: ${url}`, `HTTP ${r.status}`);
    } catch (e) {
      alert(`site:${url}`, `サイトに接続できません: ${url}`, String(e.message || e));
    }
  }
}

// ---------- Anthropic API 課金 ----------
// Admin API キー（sk-ant-admin...）が必要。amount は「セント単位の小数文字列」。
async function anthropicCostCents(startIso, endIso) {
  let total = 0;
  let page = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ starting_at: startIso, ending_at: endIso, bucket_width: "1d", limit: "31" });
    if (page) q.set("page", page);
    const r = await http(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
      headers: { "x-api-key": env.ANTHROPIC_ADMIN_KEY, "anthropic-version": "2023-06-01" },
    });
    if (!r.ok) throw new Error(`cost_report HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    for (const b of r.json.data || []) for (const x of b.results || []) total += Number(x.amount) || 0;
    if (!r.json.has_more) break;
    page = r.json.next_page;
  }
  return total;
}

async function checkAnthropic() {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const tomorrow = new Date(dayStart.getTime() + 86400000);

  const todayUsd = (await anthropicCostCents(dayStart.toISOString(), tomorrow.toISOString())) / 100;
  const monthUsd = (await anthropicCostCents(monthStart.toISOString(), tomorrow.toISOString())) / 100;

  if (todayUsd > LIMITS.anthropicDailyUsd || monthUsd > LIMITS.anthropicMonthlyUsd) {
    stops.set("anthropic", { label: "Anthropic API キーを無効化", fn: stopAnthropicKeys });
  }
  if (todayUsd > LIMITS.anthropicDailyUsd) {
    alert("anthropic:daily", "Anthropic API の本日の利用額が上限を超えました",
      `本日(UTC) $${todayUsd.toFixed(2)} / 上限 $${LIMITS.anthropicDailyUsd}`);
  }
  if (monthUsd > LIMITS.anthropicMonthlyUsd) {
    alert("anthropic:monthly", "Anthropic API の今月の利用額が上限を超えました",
      `今月(UTC) $${monthUsd.toFixed(2)} / 上限 $${LIMITS.anthropicMonthlyUsd}`);
  }
}

// ---------- Cloudflare ----------
async function cfGraphql(query, variables) {
  const r = await http("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok || r.json?.errors?.length) {
    throw new Error(`GraphQL HTTP ${r.status}: ${JSON.stringify(r.json?.errors || r.text).slice(0, 300)}`);
  }
  return r.json.data.viewer.accounts[0] || {};
}

async function cfWorkers(sinceMs) {
  const until = new Date();
  const since = new Date(until.getTime() - sinceMs);
  const acc = await cfGraphql(
    `query($a: string!, $s: Time!, $u: Time!) { viewer { accounts(filter: {accountTag: $a}) {
       workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: $s, datetime_leq: $u}) {
         sum { requests errors } dimensions { scriptName } } } } }`,
    { a: env.CLOUDFLARE_ACCOUNT_ID, s: since.toISOString(), u: until.toISOString() },
  );
  const per = {};
  for (const row of acc.workersInvocationsAdaptive || []) {
    const n = row.dimensions.scriptName;
    per[n] ??= { requests: 0, errors: 0 };
    per[n].requests += row.sum.requests;
    per[n].errors += row.sum.errors;
  }
  return per;
}

async function checkCloudflare() {
  // Workers リクエスト数（無料枠は1日10万。ループや攻撃で急増すると課金・停止の原因）
  const h1 = await cfWorkers(3600e3);
  const h24 = await cfWorkers(86400e3);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b.requests, 0);
  const top = (o) => Object.entries(o).sort((a, b) => b[1].requests - a[1].requests).slice(0, 5)
    .map(([n, v]) => `  ${n}: ${v.requests} req / ${v.errors} err`).join("\n");

  if (sum(h1) > LIMITS.cfWorkerReq1h) {
    alert("cf:workers:1h", "Cloudflare Workers のリクエストが急増しています（直近1時間）",
      `合計 ${sum(h1)} / 上限 ${LIMITS.cfWorkerReq1h}\n${top(h1)}`);
  }
  if (sum(h24) > LIMITS.cfWorkerReq24h) {
    alert("cf:workers:24h", "Cloudflare Workers のリクエストが多すぎます（直近24時間）",
      `合計 ${sum(h24)} / 上限 ${LIMITS.cfWorkerReq24h}\n${top(h24)}`);
  }
  // 個別の Worker が上限を超えたら、その Worker を外部から呼べなくする
  const exclude = list("AUTO_STOP_EXCLUDE_WORKERS");
  for (const name of new Set([...Object.keys(h1), ...Object.keys(h24)])) {
    const r1 = h1[name]?.requests || 0;
    const r24 = h24[name]?.requests || 0;
    if ((r1 > LIMITS.cfWorkerReq1h || r24 > LIMITS.cfWorkerReq24h) && !exclude.includes(name)) {
      stops.set(`cf:${name}`, { label: `Worker「${name}」を停止（1h ${r1} / 24h ${r24} req）`, fn: () => stopWorker(name) });
    }
  }
  for (const [name, v] of Object.entries(h1)) {
    if (v.requests >= LIMITS.cfWorkerErrorMinReq && v.errors / v.requests > LIMITS.cfWorkerErrorRate) {
      alert(`cf:worker-errors:${name}`, `Worker「${name}」でエラーが多発しています`,
        `直近1時間 ${v.errors}/${v.requests} 件がエラー（${(v.errors / v.requests * 100).toFixed(1)}%）`);
    }
  }

  // R2 操作数（Class A/B 操作は従量課金）
  const until = new Date();
  const since = new Date(until.getTime() - 86400e3);
  const r2 = await cfGraphql(
    `query($a: string!, $s: Time!, $u: Time!) { viewer { accounts(filter: {accountTag: $a}) {
       r2OperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $s, datetime_leq: $u}) {
         sum { requests } dimensions { bucketName } } } } }`,
    { a: env.CLOUDFLARE_ACCOUNT_ID, s: since.toISOString(), u: until.toISOString() },
  );
  const r2ops = (r2.r2OperationsAdaptiveGroups || []).reduce((a, b) => a + b.sum.requests, 0);
  if (r2ops > LIMITS.cfR2Ops24h) {
    alert("cf:r2:24h", "Cloudflare R2 の操作数が多すぎます（直近24時間）",
      `合計 ${r2ops} 回 / 上限 ${LIMITS.cfR2Ops24h}`);
  }

  // D1 データベース容量
  const d1 = await http(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database?per_page=100`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!d1.ok) throw new Error(`D1 list HTTP ${d1.status}`);
  for (const db of d1.json.result || []) {
    const mb = (db.file_size || 0) / 1024 / 1024;
    if (mb > LIMITS.cfD1SizeMb) {
      alert(`cf:d1:${db.name}`, `D1「${db.name}」の容量が大きくなっています`,
        `${mb.toFixed(1)} MB / 上限 ${LIMITS.cfD1SizeMb} MB`);
    }
  }
}

// ---------- 自動停止 ----------
// Anthropic: 組織内の有効な API キーを inactive にする（Admin キー自体は対象外なので監視は続く）
async function stopAnthropicKeys() {
  const h = { "x-api-key": env.ANTHROPIC_ADMIN_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" };
  const exclude = list("AUTO_STOP_EXCLUDE_ANTHROPIC_KEY_IDS");
  const done = [];
  let after = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ status: "active", limit: "100" });
    if (after) q.set("after_id", after);
    const r = await http(`https://api.anthropic.com/v1/organizations/api_keys?${q}`, { headers: h });
    if (!r.ok) throw new Error(`api_keys list HTTP ${r.status}`);
    for (const k of r.json.data || []) {
      if (exclude.includes(k.id)) continue;
      const u = await http(`https://api.anthropic.com/v1/organizations/api_keys/${k.id}`, {
        method: "POST", headers: h, body: JSON.stringify({ status: "inactive" }),
      });
      if (!u.ok) throw new Error(`api_key ${k.id} 無効化 HTTP ${u.status}`);
      done.push(`API キー「${k.name}」(${k.id}) を無効化`);
    }
    if (!r.json.has_more) break;
    after = r.json.last_id;
  }
  return done;
}

// Cloudflare: workers.dev を無効化し、カスタムドメインとルートを外す（コードとデータは残る）
async function stopWorker(name) {
  const H = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" };
  const CF = "https://api.cloudflare.com/client/v4";
  const A = `${CF}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`;
  const must = (r, what) => { if (!r.ok) throw new Error(`${what} HTTP ${r.status}: ${r.text.slice(0, 200)}`); return r.json; };
  const done = [];

  const sd = must(await http(`${A}/workers/scripts/${name}/subdomain`, { headers: H }), "subdomain 取得");
  if (sd.result?.enabled) {
    must(await http(`${A}/workers/scripts/${name}/subdomain`, {
      method: "POST", headers: H, body: JSON.stringify({ enabled: false, previews_enabled: false }),
    }), "subdomain 無効化");
    done.push(`${name}.*.workers.dev を無効化`);
  }

  const doms = must(await http(`${A}/workers/domains?service=${encodeURIComponent(name)}`, { headers: H }), "domains 取得");
  for (const d of doms.result || []) {
    must(await http(`${A}/workers/domains/${d.id}`, { method: "DELETE", headers: H }), "domain 切り離し");
    done.push(`カスタムドメイン ${d.hostname} を切り離し（zone: ${d.zone_name}）`);
  }

  const zones = must(await http(`${CF}/zones?account.id=${env.CLOUDFLARE_ACCOUNT_ID}&per_page=50`, { headers: H }), "zones 取得");
  for (const z of zones.result || []) {
    const routes = must(await http(`${CF}/zones/${z.id}/workers/routes`, { headers: H }), "routes 取得");
    for (const rt of routes.result || []) {
      if (rt.script !== name) continue;
      must(await http(`${CF}/zones/${z.id}/workers/routes/${rt.id}`, { method: "DELETE", headers: H }), "route 削除");
      done.push(`ルート ${rt.pattern} を削除（zone: ${z.name}）`);
    }
  }
  return done;
}

// ---------- Supabase ----------
async function checkSupabase() {
  const h = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` };
  const r = await http("https://api.supabase.com/v1/projects", { headers: h });
  if (!r.ok) throw new Error(`projects HTTP ${r.status}`);
  const only = (env.SUPABASE_PROJECT_REFS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const projects = (r.json || []).filter((p) => !only.length || only.includes(p.id || p.ref));

  for (const p of projects) {
    const ref = p.id || p.ref;
    // 一時停止中(INACTIVE)は課金されないので対象外
    if (p.status === "INACTIVE") continue;
    if (p.status !== "ACTIVE_HEALTHY") {
      alert(`supabase:${ref}:status`, `Supabase「${p.name}」の状態が異常です`, `status: ${p.status}`);
      continue;
    }
    const q = "services=auth&services=db&services=rest&services=storage&services=realtime";
    const hr = await http(`https://api.supabase.com/v1/projects/${ref}/health?${q}`, { headers: h });
    if (!hr.ok) throw new Error(`health(${p.name}) HTTP ${hr.status}`);
    const bad = (hr.json || []).filter((s) => !s.healthy);
    if (bad.length) {
      alert(`supabase:${ref}:health`, `Supabase「${p.name}」の一部サービスが不調です`,
        bad.map((s) => `  ${s.name}: ${s.status}${s.error ? ` (${s.error})` : ""}`).join("\n"));
    }
  }
}

// ---------- 各社の障害情報（status page）----------
async function checkStatusPages() {
  const pages = {
    Anthropic: "https://status.claude.com/api/v2/summary.json",
    Cloudflare: "https://www.cloudflarestatus.com/api/v2/summary.json",
    Supabase: "https://status.supabase.com/api/v2/summary.json",
    Vercel: "https://www.vercel-status.com/api/v2/summary.json",
  };
  for (const [name, url] of Object.entries(pages)) {
    try {
      const r = await http(url);
      const ind = r.json?.status?.indicator;
      // minor は頻繁に出るので major / critical のみ通知。
      // major（Partial System Outage）は「一部の機能・地域」の障害で、Cloudflare では日常的に出る。
      // 自分のサイトに影響があるか判断できるよう、障害の件名も本文に入れる。
      if (ind === "major" || ind === "critical") {
        const title = ind === "critical"
          ? `${name} で大規模障害が発生中です`
          : `${name} の一部サービスで障害が発生中です`;
        const incidents = (r.json.incidents || [])
          .filter((i) => i.status !== "resolved" && i.status !== "postmortem")
          .slice(0, 5)
          .map((i) => `  - ${i.name}（影響度: ${i.impact}）${i.shortlink ? ` ${i.shortlink}` : ""}`);
        alert(`status:${name}`, title, [
          r.json.status.description,
          ...(incidents.length ? ["発生中の障害:", ...incidents] : []),
          url.replace("/api/v2/summary.json", ""),
        ].join("\n"));
      }
    } catch {
      // ステータスページ自体の取得失敗は通知しない（ノイズ防止）
    }
  }
}

// ---------- 通知 ----------
async function sendEmail(subject, text) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY が未設定のためメールを送れません");
  const r = await http("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.ALERT_EMAIL_FROM || "Ricepia Monitor <onboarding@resend.dev>",
      to: ALERT_TO.split(",").map((s) => s.trim()),
      subject,
      text,
    }),
  });
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${r.text.slice(0, 200)}`);
}

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { active: {} }; }
}
function saveState(s) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ---------- main ----------
await runCheck("サイト死活", true, checkSites);
await runCheck("Anthropic API 課金", !!env.ANTHROPIC_ADMIN_KEY, checkAnthropic);
await runCheck("Cloudflare", !!(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID), checkCloudflare);
await runCheck("Supabase", !!env.SUPABASE_ACCESS_TOKEN, checkSupabase);
await runCheck("各社障害情報", true, checkStatusPages);

console.log(report.join("\n"));

const stopResults = []; // 実際に何かを止めたものだけ
if (stops.size && !AUTO_STOP) console.log("- 自動停止: 無効（AUTO_STOP=false）");
if (AUTO_STOP) {
  for (const [key, s] of stops) {
    try {
      const done = await s.fn();
      if (done.length) stopResults.push({ label: s.label, done });
    } catch (e) {
      alert(`stop:${key}:error`, `自動停止に失敗しました: ${s.label}`, String(e.message || e));
    }
  }
  if (stops.size) console.log(`- 自動停止: 対象 ${stops.size} / 実行 ${stopResults.length}`);
}

const state = loadState();
const now = Date.now();
const current = Object.fromEntries(findings.map((f) => [f.key, f]));

// 新規の異常、または再通知間隔を過ぎた継続中の異常だけを通知する
const toNotify = findings.filter((f) => {
  const prev = state.active[f.key];
  return !prev || now - prev.notifiedAt > REMIND_HOURS * 3600e3;
});
const recovered = Object.keys(state.active).filter((k) => !current[k]);

let exitCode = 0;
if (env.MONITOR_TEST_EMAIL === "true") {
  try {
    await sendEmail("【らいすぴあ監視】テスト送信", `監視メールのテスト送信です。\n\n${report.join("\n")}`);
    console.log("テストメールを送信しました");
  } catch (e) { console.error(String(e.message)); exitCode = 1; }
}

if (toNotify.length || recovered.length || stopResults.length) {
  const lines = [];
  if (stopResults.length) {
    lines.push("■ 課金を止めるため自動停止しました（再開は docs/MONITORING.md の「再開手順」）", "");
    for (const r of stopResults) lines.push(`● ${r.label}`, ...r.done.map((d) => `  - ${d}`), "");
  }
  if (toNotify.length) {
    lines.push("■ 異常を検知しました", "");
    for (const f of toNotify) lines.push(`● ${f.title}`, f.detail, "");
  }
  if (recovered.length) {
    lines.push("■ 復旧しました", "");
    for (const k of recovered) lines.push(`✓ ${state.active[k].title}`);
    lines.push("");
  }
  lines.push("---", "チェック結果:", ...report, "",
    `実行ログ: ${env.GITHUB_SERVER_URL || ""}/${env.GITHUB_REPOSITORY || ""}/actions/runs/${env.GITHUB_RUN_ID || ""}`,
    "課金を止めるには docs/MONITORING.md の「緊急停止手順」を参照してください。");

  const subject = stopResults.length
    ? `【らいすぴあ監視】自動停止 ${stopResults.length}件: ${stopResults[0].label}`
    : toNotify.length
    ? `【らいすぴあ監視】異常 ${toNotify.length}件: ${toNotify[0].title}`
    : `【らいすぴあ監視】復旧 ${recovered.length}件`;

  try {
    await sendEmail(subject, lines.join("\n"));
    console.log(`通知メールを送信しました（異常 ${toNotify.length} / 復旧 ${recovered.length}）`);
    for (const f of toNotify) state.active[f.key] = { title: f.title, notifiedAt: now };
    for (const k of recovered) delete state.active[k];
  } catch (e) {
    // メールが送れない場合はジョブを失敗させ、GitHub からの失敗通知メールを予備の通知手段にする
    console.error(`メール送信失敗: ${e.message}`);
    exitCode = 1;
  }
}

saveState(state);
process.exit(exitCode);

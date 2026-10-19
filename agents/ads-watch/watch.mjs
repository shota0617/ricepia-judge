// 広告監視エージェント（Mac Studio の launchd から30分おきに実行）
// Google 広告と Meta 広告の数字を読み取り専用で集め、決めたルールで異常を見つけて LINE / メールで知らせる。
// 広告の設定は一切変えない（API は読み取りだけ）。ここでは AI を使わない（朝と夜のまとめは report.sh）。
// 依存パッケージなし。Node 20+ の fetch のみ使用。
//
//   node watch.mjs                     集めて、異常があれば通知
//   node watch.mjs --dry-run           通知を送らず画面に出す（状態ファイルも更新しない）
//   node watch.mjs --fixture test/fixture.json --now 2026-10-19T14:00:00+09:00 --dry-run
//                                      API を呼ばずに見本のデータで判定を試す（--print-digest で要約も表示）
//   node watch.mjs --test-notify       通知のテスト送信だけ
//
// 集めた数字は ADS_WATCH_DATA_DIR（既定 ~/ricepia-agents/ads-watch）に保存する。
// digest.json は report.sh が Claude Code に渡す要約。

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { notify } from "./notify.mjs";

const env = process.env;
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ""; };
const num = (k, d) => (env[k] !== undefined && env[k] !== "" ? Number(env[k]) : d);
const list = (k, d = "") => (env[k] ?? d).split(",").map((x) => x.trim()).filter(Boolean);

const DATA_DIR = env.ADS_WATCH_DATA_DIR || join(homedir(), "ricepia-agents", "ads-watch");
const STATE_FILE = join(DATA_DIR, "state.json");

const LIMITS = {
  // 日予算の何倍で知らせるか。Google は1日に日予算の最大2倍、Meta は最大1.75倍まで使うことがあるので、
  // それに近づいたときだけ知らせる。本当の歯止めは全媒体の合計上限（ADS_DAILY_TOTAL_LIMIT_YEN）
  overBudget: { google: num("ADS_OVER_BUDGET_RATIO_GOOGLE", 1.8), meta: num("ADS_OVER_BUDGET_RATIO_META", 1.6) },
  // 全媒体の1日の合計の上限。空なら自動（直近7日の1日平均の autoLimitRatio 倍。下限 autoLimitMinYen）、0 なら見ない
  dailyTotalYen: env.ADS_DAILY_TOTAL_LIMIT_YEN ? Number(env.ADS_DAILY_TOTAL_LIMIT_YEN) : null,
  autoLimitRatio: num("ADS_AUTO_LIMIT_RATIO", 2),
  autoLimitMinYen: num("ADS_AUTO_LIMIT_MIN_YEN", 3000),
  noConvSpendYen: num("ADS_NO_CONV_SPEND_YEN", 3000), // 今日これだけ使って成果0なら知らせる
  cpaSpikeRatio: num("ADS_CPA_SPIKE_RATIO", 2), // 昨日のCPAが直前7日平均の何倍で知らせるか
  cpaMinConversions: num("ADS_CPA_MIN_CONVERSIONS", 3), // 直前7日の成果がこれ未満なら CPA は比べない
  stalledAfterHour: num("ADS_STALLED_AFTER_HOUR", 11), // この時刻を過ぎても表示0なら「止まっている」
};
const QUIET = { start: num("ADS_QUIET_START_HOUR", 22), end: num("ADS_QUIET_END_HOUR", 7) };
const REMIND_HOURS = num("ADS_REMIND_HOURS", 6);
const KEEP_DAYS = num("ADS_KEEP_DAYS", 60);
const PLATFORM = { google: "Google広告", meta: "Meta広告" };

// ---------- 日付（日本時間） ----------
function jst(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), hhmm: `${p.hour}${p.minute}` };
}
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

const NOW = opt("--now") ? new Date(opt("--now")) : new Date();
const T = jst(NOW);
const TODAY = T.date, YESTERDAY = addDays(TODAY, -1), SINCE = addDays(TODAY, -8);

async function http(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

// 媒体ごとのデータはこの形にそろえる
// { platform, id, name, active, dailyBudgetYen, days: { "YYYY-MM-DD": { cost, impressions, clicks, conversions } } }
function campaign(platform, id, name) {
  return { platform, id: String(id), name, active: false, dailyBudgetYen: null, days: {} };
}
function day(c, date) {
  return (c.days[date] ||= { cost: 0, impressions: 0, clicks: 0, conversions: 0 });
}

// ---------- Google 広告（tools/google-ads-run.js と同じ認証情報。search だけ使う） ----------
// 試験用に GOOGLE_ADS_TOKEN_URL / GOOGLE_ADS_API_ENDPOINT / META_GRAPH_ENDPOINT で送り先を変えられる
async function fetchGoogle() {
  const form = new URLSearchParams({
    client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: "refresh_token",
  });
  const tok = await http(env.GOOGLE_ADS_TOKEN_URL || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  if (!tok.ok || !tok.json?.access_token) {
    throw new Error(`アクセストークンを取得できません（HTTP ${tok.status} ${tok.json?.error || ""}）。クライアントID・シークレット・リフレッシュトークンを確認してください`);
  }
  const cid = env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, "");
  const login = (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, "");
  const headers = {
    Authorization: `Bearer ${tok.json.access_token}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
    ...(login ? { "login-customer-id": login } : {}),
  };
  const url = `${env.GOOGLE_ADS_API_ENDPOINT || "https://googleads.googleapis.com"}/${env.GOOGLE_ADS_API_VERSION || "v25"}/customers/${cid}/googleAds:search`;
  const query = "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, segments.date, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign " +
    `WHERE campaign.status = 'ENABLED' AND segments.date BETWEEN '${SINCE}' AND '${TODAY}'`;

  const byId = new Map();
  let pageToken;
  do {
    const r = await http(url, { method: "POST", headers, body: JSON.stringify(pageToken ? { query, pageToken } : { query }) });
    if (!r.ok) throw new Error(`検索に失敗しました（HTTP ${r.status}: ${r.json?.error?.message || r.text.slice(0, 200)}）`);
    for (const row of r.json.results || []) {
      const c = byId.get(row.campaign.id) || campaign("google", row.campaign.id, row.campaign.name);
      byId.set(row.campaign.id, c);
      c.active = row.campaign.status === "ENABLED";
      if (row.campaignBudget?.amountMicros) c.dailyBudgetYen = Number(row.campaignBudget.amountMicros) / 1e6;
      const d = day(c, row.segments.date);
      d.cost += Number(row.metrics.costMicros || 0) / 1e6;
      d.impressions += Number(row.metrics.impressions || 0);
      d.clicks += Number(row.metrics.clicks || 0);
      d.conversions += Number(row.metrics.conversions || 0);
    }
    pageToken = r.json.nextPageToken;
  } while (pageToken);
  return [...byId.values()];
}

// ---------- Meta 広告（Marketing API。ads_read 権限のトークンで読むだけ） ----------
async function fetchMeta() {
  const base = `${env.META_GRAPH_ENDPOINT || "https://graph.facebook.com"}/${env.META_GRAPH_VERSION || "v24.0"}/act_${env.META_AD_ACCOUNT_ID.replace(/^act_/, "")}`;
  // 予算の単位。円は最小単位が1円なので1（他の通貨なら100など）
  const unit = num("META_BUDGET_UNIT", 1);
  const convTypes = new Set(list("META_CONVERSION_ACTIONS", "lead,omni_purchase,omni_complete_registration"));

  async function getAll(path, params) {
    const out = [];
    let url = `${base}/${path}?${new URLSearchParams({ ...params, limit: "500", access_token: env.META_ACCESS_TOKEN })}`;
    for (let i = 0; url && i < 20; i++) {
      const r = await http(url);
      // URL にトークンが入るので、エラーには URL を載せない
      if (!r.ok) throw new Error(`${path} の取得に失敗しました（HTTP ${r.status}: ${r.json?.error?.message || ""}）`);
      out.push(...(r.json.data || []));
      url = r.json.paging?.next;
    }
    return out;
  }

  const [camps, adsets, insights] = await Promise.all([
    getAll("campaigns", { fields: "id,name,effective_status,daily_budget" }),
    getAll("adsets", { fields: "campaign_id,effective_status,daily_budget" }),
    getAll("insights", {
      level: "campaign", time_increment: "1",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      time_range: JSON.stringify({ since: SINCE, until: TODAY }),
    }),
  ]);

  const byId = new Map();
  for (const x of camps) {
    const c = campaign("meta", x.id, x.name);
    c.active = x.effective_status === "ACTIVE";
    if (x.daily_budget) c.dailyBudgetYen = Number(x.daily_budget) / unit;
    byId.set(x.id, c);
  }
  // 広告セットで予算を決めているキャンペーンは、配信中の広告セットの日予算を足す
  for (const s of adsets) {
    const c = byId.get(s.campaign_id);
    if (!c || !s.daily_budget || s.effective_status !== "ACTIVE" || camps.find((x) => x.id === c.id)?.daily_budget) continue;
    c.dailyBudgetYen = (c.dailyBudgetYen || 0) + Number(s.daily_budget) / unit;
  }
  for (const x of insights) {
    const c = byId.get(x.campaign_id) || campaign("meta", x.campaign_id, x.campaign_name);
    byId.set(x.campaign_id, c);
    const d = day(c, x.date_start);
    d.cost += Number(x.spend || 0);
    d.impressions += Number(x.impressions || 0);
    d.clicks += Number(x.clicks || 0);
    // 成果にする行動が決まっていなければ、成果は「不明」として扱う
    d.conversions = convTypes.size
      ? (x.actions || []).filter((a) => convTypes.has(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0)
      : null;
  }
  // 配信中か、この期間に費用が出たものだけを見る
  return [...byId.values()].filter((c) => c.active || Object.values(c.days).some((d) => d.cost > 0));
}

// ---------- 判定 ----------
const findings = []; // { key, urgent, title, detail }
const yen = (n) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

function sumDays(c, from, to) {
  const s = { cost: 0, conversions: 0 };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const x = c.days[d];
    if (!x) continue;
    s.cost += x.cost;
    s.conversions = x.conversions === null || s.conversions === null ? null : s.conversions + x.conversions;
  }
  return s;
}

// 1日の合計の上限。決まった金額がなければ、直近7日の1日平均の2倍にする。
// 予算の打ち間違い（桁違い）などで使い方が急に増えたときに気づくため。日予算ではなく実際の費用を基準にするのは、
// 日予算そのものを間違えたときにも上限が一緒に上がってしまわないようにするため
function totalLimit(all) {
  if (LIMITS.dailyTotalYen !== null) return LIMITS.dailyTotalYen;
  let cost7 = 0;
  for (const c of all) cost7 += sumDays(c, addDays(YESTERDAY, -6), YESTERDAY).cost;
  // 始めたばかりで実績がないときだけ、配信中の日予算の合計を基準にする
  const base = cost7 > 0 ? cost7 / 7 : all.filter((c) => c.active).reduce((s, c) => s + (c.dailyBudgetYen || 0), 0);
  return Math.max(Math.round(base * LIMITS.autoLimitRatio), LIMITS.autoLimitMinYen);
}

function judge(all) {
  let total = 0;
  for (const c of all) {
    const label = `${PLATFORM[c.platform]}「${c.name}」`;
    const today = c.days[TODAY] || { cost: 0, impressions: 0, conversions: c.platform === "meta" ? null : 0 };
    const yday = c.days[YESTERDAY];
    total += today.cost;

    const ratio = LIMITS.overBudget[c.platform];
    if (c.active && c.dailyBudgetYen > 0 && today.cost >= c.dailyBudgetYen * ratio) {
      findings.push({
        key: `${c.platform}:${c.id}:budget:${TODAY}`, urgent: false,
        title: `予算の使い過ぎ: ${label}`,
        detail: `本日 ${yen(today.cost)} / 日予算 ${yen(c.dailyBudgetYen)}（${Math.round((today.cost / c.dailyBudgetYen) * 100)}%）`,
      });
    }
    if (c.active && T.hour >= LIMITS.stalledAfterHour && today.impressions === 0 && yday?.impressions > 0) {
      findings.push({
        key: `${c.platform}:${c.id}:stalled:${TODAY}`, urgent: false,
        title: `配信が止まっている可能性: ${label}`,
        detail: `本日 ${T.hour}時まで表示0回（昨日 ${yday.impressions.toLocaleString("ja-JP")}回）。審査落ち・支払い・予算切れを確認してください`,
      });
    }
    if (today.conversions === 0 && today.cost >= LIMITS.noConvSpendYen) {
      findings.push({
        key: `${c.platform}:${c.id}:noconv:${TODAY}`, urgent: false,
        title: `費用は出ているのに成果0: ${label}`,
        detail: `本日 ${yen(today.cost)} 使って成果0件`,
      });
    }
    // CPA は日中だと数字が揺れるので、締まった昨日の分を直前7日と比べる
    const prev = sumDays(c, addDays(YESTERDAY, -7), addDays(YESTERDAY, -1));
    if (yday?.conversions > 0 && prev.conversions >= LIMITS.cpaMinConversions) {
      const cpa = yday.cost / yday.conversions, avg = prev.cost / prev.conversions;
      if (cpa >= avg * LIMITS.cpaSpikeRatio) {
        findings.push({
          key: `${c.platform}:${c.id}:cpa:${YESTERDAY}`, urgent: false,
          title: `成果1件あたりの費用が急に上がりました: ${label}`,
          detail: `昨日のCPA ${yen(cpa)}（直前7日の平均 ${yen(avg)} の ${(cpa / avg).toFixed(1)}倍）`,
        });
      }
    }
  }
  const limit = totalLimit(all);
  if (limit > 0 && total >= limit) {
    findings.push({
      key: `total:${TODAY}`, urgent: true,
      title: "本日の広告費の合計が上限を超えました",
      detail: `全媒体の合計 ${yen(total)} / 上限 ${yen(limit)}${LIMITS.dailyTotalYen === null ? "（直近7日の平均から自動で決めた上限）" : ""}。必要なら各媒体の管理画面で止めてください`,
    });
  }
  return total;
}

// report.sh が Claude Code に渡す要約（媒体・キャンペーンごとに今日・昨日・直前7日）
function digest(all, total, errors) {
  const r = (n) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    generatedAt: NOW.toISOString(), today: TODAY, nowHourJst: T.hour,
    totalCostToday: Math.round(total),
    dailyTotalLimit: totalLimit(all) || null,
    fetchErrors: errors,
    alerts: findings.map(({ title, detail }) => ({ title, detail })),
    campaigns: all.map((c) => {
      const pick = (d) => d && { cost: Math.round(d.cost), impressions: d.impressions, clicks: d.clicks, conversions: r(d.conversions) };
      const last7 = sumDays(c, addDays(YESTERDAY, -6), YESTERDAY);
      return {
        platform: PLATFORM[c.platform], name: c.name, active: c.active,
        dailyBudget: c.dailyBudgetYen && Math.round(c.dailyBudgetYen),
        today: pick(c.days[TODAY]) || null, yesterday: pick(c.days[YESTERDAY]) || null,
        last7days: { cost: Math.round(last7.cost), conversions: r(last7.conversions),
          cpa: last7.conversions ? Math.round(last7.cost / last7.conversions) : null },
      };
    }),
  };
}

// ---------- 保存 ----------
function save(name, obj) {
  const file = join(DATA_DIR, name);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
}
function prune() {
  const dir = join(DATA_DIR, "snapshots"), oldest = addDays(TODAY, -KEEP_DAYS);
  try {
    for (const d of readdirSync(dir)) if (d < oldest) rmSync(join(dir, d), { recursive: true, force: true });
  } catch {}
}
function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { active: {} }; }
}

// ---------- main ----------
if (args.includes("--test-notify")) {
  await notify("【広告監視】テスト送信", "広告監視エージェントの通知テストです。これが届けば通知の設定は完了です。", { dryRun: DRY });
  process.exit(0);
}

const sources = [
  ["google", ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"], fetchGoogle],
  ["meta", ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"], fetchMeta],
];
const fixture = opt("--fixture") ? JSON.parse(readFileSync(opt("--fixture"), "utf8")) : null;
const all = [], errors = [];
for (const [p, keys, fetcher] of sources) {
  if (fixture) { all.push(...(fixture[p] || [])); continue; }
  if (keys.some((k) => !env[k])) { console.log(`- ${PLATFORM[p]}: skip（未設定）`); continue; }
  try {
    const got = await fetcher();
    all.push(...got);
    console.log(`- ${PLATFORM[p]}: OK（${got.length}件）`);
  } catch (e) {
    errors.push(`${PLATFORM[p]}: ${e.message}`);
    findings.push({ key: `${p}:fetch-error`, urgent: false, title: `${PLATFORM[p]}の数字を取得できません`, detail: e.message });
    console.log(`- ${PLATFORM[p]}: NG`);
  }
}

const total = judge(all);
if (args.includes("--print-digest")) console.log(JSON.stringify(digest(all, total, errors), null, 2));
if (!DRY) {
  save(join("snapshots", TODAY, `${T.hhmm}.json`), { at: NOW.toISOString(), campaigns: all });
  save("digest.json", digest(all, total, errors));
  prune();
}

// 新しい異常、または再通知の間隔を過ぎたものだけ送る。夜（静かな時間）は急ぎのものだけ送り、残りは朝に回す
const state = DRY ? { active: {} } : loadState();
const now = NOW.getTime();
const quiet = QUIET.start > QUIET.end ? T.hour >= QUIET.start || T.hour < QUIET.end : T.hour >= QUIET.start && T.hour < QUIET.end;
const due = findings.filter((f) => {
  const prev = state.active[f.key];
  return (!prev || now - prev.notifiedAt > REMIND_HOURS * 3600e3) && (f.urgent || !quiet);
}).sort((a, b) => b.urgent - a.urgent);
console.log(`判定: 異常 ${findings.length}件 / 今回通知 ${due.length}件${quiet ? "（夜間のため急ぎ以外は朝に回します）" : ""}`);

let exitCode = 0;
if (due.length) {
  const lines = [];
  for (const f of due) lines.push(`${f.urgent ? "🚨" : "⚠️"} ${f.title}`, `  ${f.detail}`, "");
  lines.push(`本日の広告費（取得できた分の合計）: ${yen(total)}`, "※このエージェントは広告の設定を変えません。止める・予算を変えるのは管理画面で行ってください。");
  try {
    await notify(`【広告監視】${due.some((f) => f.urgent) ? "至急 " : ""}${due.length}件: ${due[0].title}`, lines.join("\n"), { dryRun: DRY });
    for (const f of due) state.active[f.key] = { title: f.title, notifiedAt: now };
  } catch (e) {
    console.error(e.message);
    exitCode = 1;
  }
}

if (!DRY) {
  // 3日より前の記録は消す（日付つきの異常は日が変われば別物になる）
  for (const [k, v] of Object.entries(state.active)) if (now - v.notifiedAt > 3 * 86400e3) delete state.active[k];
  save("state.json", state);
  // 死活監視サービス（Healthchecks.io など）に「動いています」を送る。届かなくなれば向こうが知らせてくれる
  if (env.HEARTBEAT_URL) await fetch(env.HEARTBEAT_URL, { signal: AbortSignal.timeout(10000) }).catch(() => {});
}
process.exit(exitCode);

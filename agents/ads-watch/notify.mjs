// 広告監視エージェントの通知（LINE と メール）
// 設定されている送り先すべてに送る。どれも設定されていなければ画面に出すだけ。
//
//   LINE  : LINE_CHANNEL_ACCESS_TOKEN と LINE_TO_USER_ID（LINE公式アカウントの Messaging API）
//   メール: RESEND_API_KEY と ALERT_EMAIL_TO（docs/MONITORING.md の監視メールと同じ Resend）
//
// コマンドとしても使える（report.sh から呼ぶ）:
//   node notify.mjs "件名" 本文ファイル [--dry-run]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const env = process.env;
const LINE_TEXT_MAX = 4900; // LINE のテキストは 5000 文字まで

async function post(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendLine(subject, text) {
  const message = `${subject}\n\n${text}`;
  await post("https://api.line.me/v2/bot/message/push",
    { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    { to: env.LINE_TO_USER_ID, messages: [{ type: "text", text: message.slice(0, LINE_TEXT_MAX) }] });
}

async function sendEmail(subject, text) {
  await post("https://api.resend.com/emails",
    { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    {
      from: env.ALERT_EMAIL_FROM || "Ricepia Ads Watch <onboarding@resend.dev>",
      to: env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()),
      subject,
      text,
    });
}

export function channels() {
  const out = [];
  if (env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_TO_USER_ID) out.push(["LINE", sendLine]);
  if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO) out.push(["メール", sendEmail]);
  return out;
}

// 1つでも届けば成功。設定した送り先がすべて失敗したときだけ例外を投げる
export async function notify(subject, text, { dryRun = false } = {}) {
  const chs = channels();
  if (dryRun || !chs.length) {
    console.log(`----- ${dryRun ? "通知（送信しない）" : "通知先が未設定のため画面に出します"} -----`);
    console.log(subject, "\n", text);
    return;
  }
  const errors = [];
  for (const [name, send] of chs) {
    try {
      await send(subject, text);
      console.log(`${name}に送信しました`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  if (errors.length === chs.length) throw new Error(`通知を送れませんでした（${errors.join(" / ")}）`);
  for (const e of errors) console.error(`一部の通知に失敗: ${e}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [subject, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!subject || !file) {
    console.error('使い方: node notify.mjs "件名" 本文ファイル [--dry-run]');
    process.exit(2);
  }
  try {
    await notify(subject, readFileSync(file, "utf8").trim(), { dryRun: process.argv.includes("--dry-run") });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

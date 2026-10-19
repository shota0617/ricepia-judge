// 週1回の市場リサーチ（GitHub Actions から毎週月曜の朝に実行）
// Claude の web 検索で米価・米穀店の販促事例・地域の動きを調べ、店主向けにまとめてメールで送る。
// 依存パッケージなし。Node 20+ の fetch のみ使用。
//
// 公開リポジトリのため Actions のログは誰でも見られる。
// ログには成否と件数だけを出し、リサーチ本文はメールにだけ書く。

const env = process.env;

const ALERT_TO = env.ALERT_EMAIL_TO || "ricepiaricepiaricepia@gmail.com";
const MODEL = env.RESEARCH_MODEL || "claude-opus-5-5";
const MAX_SEARCHES = Number(env.RESEARCH_MAX_SEARCHES || 8);

const today = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" });

// 手動実行でテーマを指定したときはそれだけを調べる
const topic = (env.RESEARCH_TOPIC || "").trim();

const SHOP = `愛知県西尾市の米穀店「らいすぴあ」（近藤米穀店）。精米したてのお米の店頭販売、ギフト、飲食店向けの業務用米、EC、LINE・Instagram での発信をしている。`;

const prompt = topic ? `次のテーマについてWeb検索で最新情報を調べ、米穀店の店主向けにまとめてください。今日は${today}です。

# お店
${SHOP}

# テーマ
${topic}

# 出力形式（Markdown）
## 要点
3行で結論。
## 詳しく
事実・数字（いつ時点の情報かを明記）。信頼できる情報源（公的機関・業界団体・大手メディア）を優先。
## 当店への示唆
すぐ試せる具体的な打ち手を3つ。
情報が見つからない・古い場合は推測で埋めず、その旨を書く。` : `この1週間ほどの動きをWeb検索で調べ、米穀店の店主が月曜の朝に読む「週刊リサーチ」をまとめてください。今日は${today}です。

# お店
${SHOP}

# 調べること
1. 米価・流通：新米や銘柄米の店頭価格、相場、備蓄米・政策など、米の値段と仕入れにかかわる動き
2. 売り場・販促：米穀店・お米専門店・産直の、SNS・ギフト・定期便などの目立った取り組み
3. 地域：愛知県・西尾市まわりの食やお米のニュース、これから2〜3週間の行事・イベント
4. 季節：この時期に合う販促の切り口（行事・贈答・料理）

# 出力形式（Markdown）
## 今週の3行
いちばん大事なことを3行で。
## 米価・流通
## 売り場・販促の事例
## 地域の動き・行事
## 今週の打ち手
この店ですぐ試せる具体的な打ち手を3つ（だれに・なにを・どのチャネルで）。

各項目の事実・数字には、いつ時点の情報かを書く。信頼できる情報源（公的機関・業界団体・大手メディア）を優先する。
1週間以内の新しい情報が見つからない項目は、推測で埋めずに「目立った動きなし」と書く。`;

async function http(url, opts = {}, timeoutMs = 20000) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

// web 検索は長くかかると pause_turn で止まるので、返ってきた内容を足して続きを頼む
async function research() {
  const tools = [{
    type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES,
    user_location: { type: "approximate", country: "JP", timezone: "Asia/Tokyo" },
  }];
  const messages = [{ role: "user", content: prompt }];
  const usage = { in: 0, out: 0, searches: 0 };
  for (let i = 0; i < 5; i++) {
    const r = await http("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 16000, tools, messages,
        thinking: { type: "adaptive" }, output_config: { effort: "medium" },
        fallbacks: "default",
      }),
    }, 10 * 60 * 1000);
    if (!r.ok) throw new Error(`Claude API HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    const m = r.json;
    usage.in += (m.usage?.input_tokens || 0) + (m.usage?.cache_read_input_tokens || 0) + (m.usage?.cache_creation_input_tokens || 0);
    usage.out += m.usage?.output_tokens || 0;
    usage.searches += m.usage?.server_tool_use?.web_search_requests || 0;
    if (m.stop_reason === "refusal") throw new Error("Claude がこのリサーチを断りました");
    if (m.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: m.content }); continue; }
    return { message: m, messages: [...messages, { role: "assistant", content: m.content }], usage };
  }
  throw new Error("リサーチが終わりませんでした（pause_turn が続きました）");
}

function collect(messages) {
  let text = "";
  const sources = new Map();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const b of msg.content) {
      if (b.type === "text") {
        text += b.text;
        for (const c of b.citations || []) if (c.url) sources.set(c.url, c.title || c.url);
      }
    }
  }
  return { text: text.trim(), sources };
}

async function sendEmail(subject, text) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY が未設定のためメールを送れません");
  const r = await http("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.ALERT_EMAIL_FROM || "Ricepia Research <onboarding@resend.dev>",
      to: ALERT_TO.split(",").map((s) => s.trim()),
      subject,
      text,
    }),
  });
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${r.text.slice(0, 200)}`);
}

// ---------- main ----------
if (!env.ANTHROPIC_API_KEY) {
  console.log("- 週刊リサーチ: skip（ANTHROPIC_API_KEY 未設定）");
  process.exit(0);
}

const { messages, usage } = await research();
const { text, sources } = collect(messages);
if (!text) throw new Error("リサーチ結果が空でした");

const src = [...sources].slice(0, 30).map(([url, title]) => `- ${title}\n  ${url}`).join("\n");
const body = `${text}

${src ? `---\n出典（${sources.size}件）\n${src}\n` : ""}
---
モデル ${MODEL} / 入力 ${usage.in.toLocaleString()} トークン・出力 ${usage.out.toLocaleString()} トークン・web 検索 ${usage.searches} 回
（毎週月曜に .github/workflows/weekly-research.yml から送信）`;

const subject = topic ? `【リサーチ】${topic.slice(0, 40)}` : `【週刊リサーチ】${today}`;
await sendEmail(subject, body);
console.log(`- 週刊リサーチ: OK（検索 ${usage.searches} 回・出典 ${sources.size} 件）`);

# 異常・課金監視と自動停止

`.github/workflows/monitor.yml` が **15分ごと** に `monitor/check.mjs` を実行し、異常があれば
**ricepiaricepiaricepia@gmail.com** にメールします。課金が上限を超えたときは **自動で停止** します。

| 監視対象 | 異常とみなす条件（初期値） | 自動停止 |
|---|---|---|
| サイト（ricepia-judge.vercel.app） | HTTP エラー・接続不可 | なし |
| Anthropic API 利用額 | 本日 $10 超 / 今月 $190 超 | **組織の API キーをすべて無効化** |
| Cloudflare Workers リクエスト | 1時間 2万 / 24時間 8万 超（合計・Worker ごと） | **その Worker を外部から切り離し** |
| Cloudflare Workers エラー率 | 1時間で 100件以上かつ 5% 超 | なし（通知のみ） |
| Cloudflare R2 操作数 | 24時間 30万回超 | なし（通知のみ） |
| Cloudflare D1 容量 | 1DB 400MB 超 | なし（通知のみ） |
| Supabase | プロジェクト状態・各サービスのヘルス | なし（通知のみ） |
| Anthropic / Cloudflare / Supabase / Vercel 障害情報 | 公式ステータスが major（一部で障害）/ critical（大規模障害）。本文に障害の件名を載せる | なし |

- 同じ異常は **6時間ごと** にしか再通知しません。復旧したら「復旧」メールが届きます。
- メールが送れないときはジョブが失敗し、GitHub から失敗通知メールが届きます（予備の通知手段）。
- リポジトリは公開なので Actions のログは誰でも見られます。ログには OK/NG だけを出し、金額などはメールにだけ書きます。

---

## 初期設定（GitHub → Settings → Secrets and variables → Actions）

### Secrets（必須のものから）

| 名前 | 取得方法 | 必要な権限 |
|---|---|---|
| `RESEND_API_KEY` | [resend.com](https://resend.com) に **ricepiaricepiaricepia@gmail.com** で登録 → API Keys | Sending access |
| `ANTHROPIC_ADMIN_KEY` | Claude Console → Settings → **Admin keys**（`sk-ant-admin...`。通常の API キーでは動きません） | 組織 admin |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Custom Token | 下記 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボード右側の Account ID | — |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens | — |

Cloudflare トークンの権限:
- Account → **Account Analytics: Read**
- Account → **D1: Read**
- Account → **Workers Scripts: Edit**（自動停止で workers.dev を無効化・カスタムドメインを外すため）
- Zone → **Workers Routes: Edit**、Zone → **Zone: Read**（自動停止でルートを外すため。Zone Resources は All zones）

> Resend の送信元 `onboarding@resend.dev` は、Resend に登録したメールアドレス宛てにしか送れません。
> 必ず ricepiaricepiaricepia@gmail.com で Resend に登録してください（独自ドメインを認証すれば `ALERT_EMAIL_FROM` で変更可）。

設定していない Secret のチェックはスキップされます（ログに「skip（未設定）」と出ます）。

### Variables（任意。未設定なら初期値）

| 名前 | 初期値 | 説明 |
|---|---|---|
| `ANTHROPIC_DAILY_USD_LIMIT` | 10 | 1日（UTC）の上限ドル |
| `ANTHROPIC_MONTHLY_USD_LIMIT` | 190 | 1か月（UTC）の上限ドル。毎月の API クレジット $200 の手前で止める（15分おきの監視なので少し余裕をみている） |
| `CF_WORKER_REQ_1H_LIMIT` | 20000 | Workers 1時間のリクエスト上限 |
| `CF_WORKER_REQ_24H_LIMIT` | 80000 | Workers 24時間のリクエスト上限 |
| `CF_WORKER_ERROR_RATE_LIMIT` | 0.05 | Worker のエラー率上限 |
| `CF_R2_OPS_24H_LIMIT` | 300000 | R2 24時間の操作数上限 |
| `CF_D1_SIZE_MB_LIMIT` | 400 | D1 1DB あたりの容量上限（MB） |
| `SUPABASE_PROJECT_REFS` | 全プロジェクト | 監視するプロジェクト ref（カンマ区切り） |
| `MONITOR_URLS` | https://ricepia-judge.vercel.app/ | 死活監視する URL（カンマ区切り） |
| `ALERT_REMIND_HOURS` | 6 | 継続中の異常の再通知間隔 |
| `AUTO_STOP` | true | `false` にすると通知だけで止めない |
| `AUTO_STOP_EXCLUDE_WORKERS` | なし | 自動停止しない Worker 名（カンマ区切り） |
| `AUTO_STOP_EXCLUDE_ANTHROPIC_KEY_IDS` | なし | 無効化しない API キー ID（`apikey_...`） |

### 動作確認

Actions → 「異常・課金監視」→ Run workflow →「テストメールを送信する」にチェック → 実行。
メールが届けば設定完了です（迷惑メールフォルダも確認）。

---

## 自動停止の中身

**Anthropic**: 利用額が上限を超えると、Admin API で組織内の有効な API キーを `inactive` にします。
キーは削除されないので、Console で再び有効にできます。Admin キーは対象外なので監視は続きます。

**Cloudflare Workers**: リクエストが上限を超えた Worker について
1. `*.workers.dev` の公開を無効化
2. カスタムドメインを切り離し
3. その Worker に向いたルートを削除

を行います。**コード・D1・KV・R2 のデータはそのまま** です。メールに外したドメイン・ルートが書かれるので、それを見て戻します。

> LINE / Meta の Webhook を受ける Worker（raispia-points、meta-inbox-webhook など）を止めると、その間のメッセージは受け取れません。
> 止めたくない Worker は `AUTO_STOP_EXCLUDE_WORKERS` に入れてください（通知は届きます）。

## 再開手順

1. メールで原因を確認する（攻撃・無限ループ・設定ミスなど）。原因を直す。
2. **上限を引き上げるか、期間が過ぎるのを待つ**。上限を超えたままだと、15分後にまた止まります。
   - Anthropic の「本日」は UTC 0時（日本時間 9時）、「今月」は毎月1日 UTC 0時にリセット。
   - Cloudflare は直近1時間／24時間の値なので、時間が経てば下がります。
3. 元に戻す
   - Anthropic: Console → API keys → 該当キーを有効化
   - Cloudflare: Workers & Pages → 該当 Worker → Settings → Domains & Routes で workers.dev を有効化し、メールに書かれたドメイン・ルートを追加し直す（または `wrangler deploy` で再デプロイ）

## 緊急停止手順（手動）

- Anthropic: Console → API keys → すべて無効化
- Cloudflare: 上の「再開手順」の逆で、workers.dev を無効化しルートを外す
- Supabase: Project Settings → General → Pause project
- Vercel: Project → Settings → 一番下 → Pause / Delete

---

## 各サービスの料金上限設定（必ず確認）

監視・自動停止は15分おきなので、その間に増えた分は止められません。**各サービス側の上限設定が一番確実な防御** です。

| サービス | 確認場所 | 推奨設定 |
|---|---|---|
| Anthropic | Console → Settings → **Limits** → Spend limits | 月の上限を設定（超えると API が止まる）。ワークスペースごとにも設定可 |
| Anthropic | Console → Settings → **Billing** | **自動チャージ（Auto reload）をオフ** にするか上限額を低く |
| OpenAI（seimai-log が使用） | platform.openai.com → Settings → Limits | Budget を設定、Auto recharge をオフ |
| Cloudflare | Manage Account → **Billing → Subscriptions** | Workers **Free** なら1日10万リクエストで止まり課金なし。**Paid** の場合は上限がないので監視が重要 |
| Cloudflare | Notifications → Add → **Usage Based Billing** | 使用量の通知を ricepiaricepiaricepia@gmail.com 宛てに設定 |
| Supabase | Organization → **Billing → Cost Control** | **Spend Cap をオン**（Pro プランの初期値はオン。オフだと超過分が課金される） |
| Vercel | Settings → **Billing → Spend Management** | 上限額を設定し「上限で本番を一時停止」をオン |
| Google Cloud（使っていれば） | Billing → Budgets & alerts | 予算アラートを設定 |

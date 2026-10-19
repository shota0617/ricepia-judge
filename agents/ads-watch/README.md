# 広告監視エージェント（Mac Studio で24時間）

Google広告とMeta広告（Facebook・Instagram）を **30分おき** に見張り、異常があれば LINE かメールで知らせます。
**朝7:30** に「朝の報告」、**夜20:00** に「1日のまとめ」を、Claude Code が書いて送ります。

| ファイル | 役割 |
|---|---|
| `watch.mjs` | 数字を集めて、決めたルールで異常を見つけ、通知する（AIは使わない・無料） |
| `report.sh` | `watch.mjs` が作った要約（`digest.json`）を Claude Code に読ませ、報告を書かせて送る |
| `CLAUDE.md` | 報告を書く Claude への業務マニュアル（書き方・してはいけないこと） |
| `notify.mjs` | LINE（Messaging API）とメール（Resend）への送信 |
| `install.sh` | launchd（Macの「決まった時刻に動かす」仕組み）に登録する |
| `ads-watch.env.example` | 設定ファイルの見本（値は書かない） |

## 安全のための決まり

- **広告の設定は一切変えません。** Google広告は検索（search）だけ、Meta広告は読み取り（ads_read）だけを使います。止める・予算を変えるのは店主が管理画面で行います
- 報告を書く Claude Code には、ファイルを読む・書く・コマンドを実行する道具を渡しません（要約を標準入力で渡すだけ）
- 認証情報は `~/.config/ricepia-agents/ads-watch.env`（本人だけが読める設定）に置き、リポジトリには書きません

## 見張りのルール

| 異常 | 条件（初期値） | 夜間（22時〜7時） |
|---|---|---|
| **1日の広告費の合計が上限超え** | 全媒体の合計が `ADS_DAILY_TOTAL_LIMIT_YEN` 以上（初期値0＝見ない。**必ず設定**） | **すぐ知らせる** |
| 予算の使い過ぎ | 本日の費用が日予算の 1.8倍（Google）／1.6倍（Meta）以上 | 朝に回す |
| 配信が止まっている | 11時を過ぎても表示0回（昨日は表示あり） | 朝に回す |
| 費用は出ているのに成果0 | 本日 ¥3,000 以上使って成果0件 | 朝に回す |
| CPA（成果1件あたりの費用）の急上昇 | 昨日のCPAが直前7日の平均の2倍以上（7日の成果が3件以上のとき） | 朝に回す |
| 数字を取れない | 認証の期限切れ・APIの障害など | 朝に回す |

- Google は1日に日予算の最大2倍、Meta は最大1.75倍まで使うことがあり（月や週で調整される）、予算の使い過ぎだけでは異常と言い切れません。**本当の歯止めは「1日の合計の上限」です**
- 同じ異常は6時間ごとにしか再通知しません。日付が変われば別の異常として扱います
- 基準はすべて設定ファイルで変えられます（`ads-watch.env.example` を参照）

## 設定の手順（Mac Studio の AI 用ユーザーで）

### 1. 必要なものを入れる
```bash
brew install node            # Node.js 20 以上
# Claude Code を入れてログインしておく（report.sh が使う）
git clone https://github.com/shota0617/ricepia-judge.git ~/projects/ricepia-judge
cd ~/projects/ricepia-judge/agents/ads-watch
```

### 2. 設定ファイルを作る
```bash
mkdir -p ~/.config/ricepia-agents
cp ads-watch.env.example ~/.config/ricepia-agents/ads-watch.env
chmod 600 ~/.config/ricepia-agents/ads-watch.env
open -e ~/.config/ricepia-agents/ads-watch.env   # テキストエディットで値を入れる
```

| 項目 | 取り方 |
|---|---|
| `GOOGLE_ADS_*` | `tools/google-ads-run.js` で使っているものと同じ |
| `META_ACCESS_TOKEN` | Meta ビジネス設定 → ユーザー → **システムユーザー** → トークンを生成（広告アカウントを割り当て、権限は **ads_read** だけ） |
| `META_AD_ACCOUNT_ID` | 広告マネージャのURLや設定にある広告アカウントID（`act_` はあってもなくてもよい） |
| `META_CONVERSION_ACTIONS` | 「成果」として数える行動。LINE友だち追加などを成果にしているなら、そのイベント名に変える |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_TO_USER_ID` | LINE Developers → Messaging API のチャネル →「チャネルアクセストークン（長期）」と、チャネル基本設定の「あなたのユーザーID」。店主のLINEでその公式アカウントを友だち追加しておく |
| `RESEND_API_KEY` / `ALERT_EMAIL_TO` | メールでも受け取るなら（docs/MONITORING.md と同じ Resend） |
| `ADS_DAILY_TOTAL_LIMIT_YEN` | **1日の広告費の上限（円）。必ず入れる** |
| `HEARTBEAT_URL` | Healthchecks.io などで「30分ごと・猶予30分」のチェックを作り、その URL を入れる。Mac が止まると向こうから知らせてくれる |

> LINE Notify は2025年3月に終了しているため、LINE公式アカウントの Messaging API を使います。

### 3. 試す（ここで問題がないことを確かめてから登録する）
```bash
zsh run-watch.sh --test-notify                 # 通知が LINE・メールに届くか
zsh run-watch.sh --dry-run                     # 数字が取れるか（通知は送らず画面に出す）
zsh report.sh morning                          # 朝の報告を実際に作って送る
```
API を使わずにルールだけ試すときは:
```bash
ADS_DAILY_TOTAL_LIMIT_YEN=7000 node watch.mjs --fixture test/fixture.json --now 2026-10-19T14:00:00+09:00 --dry-run
```

### 4. 登録する
```bash
zsh install.sh               # 見張り（30分おき）と報告（7:30・20:00）を登録
zsh install.sh --uninstall   # 止める
```

## 日々の確認

| 見たいもの | 場所 |
|---|---|
| 動いた記録 | `~/ricepia-agents/ads-watch/logs/watch.log`、`report.log` |
| 送った報告 | `~/ricepia-agents/ads-watch/reports/` |
| 集めた数字 | `~/ricepia-agents/ads-watch/snapshots/日付/時刻.json`（60日分） |
| 今の要約 | `~/ricepia-agents/ads-watch/digest.json` |

- 報告が届かないときは `logs/report-error.log` を見ます（Claude Code のログイン切れ・利用枠の上限が多い）
- 「数字を取得できません」が続くときは、Google のリフレッシュトークンや Meta のトークンを作り直します
- Mac Studio を再起動しても、AI 用ユーザーがログインすれば自動で動き出します

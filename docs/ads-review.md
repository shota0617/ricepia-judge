# 配信中の広告を 3社のAI でレビューする（Opus・Fable・Codex）

いま出している広告ぜんぶを、Claude Opus・Claude Fable（Anthropic）と Codex（OpenAI）が、同じ一覧・同じ頼み方で別々にレビューします。
3つの答えを並べると、1社だけの思い込みや見落としがわかります（3社とも言うことは、まず直す）。アカウントは変えません。

## 道具

| 道具 | すること |
| --- | --- |
| `tools/google-ads-serving-2026-10.js` | Google広告スクリプト（読むだけ）。有効なキャンペーン・広告・P-MAX のアセットグループ・サイトリンクなど・キーワードを、直近30日の数字つきで書き出す。お客様IDと電話番号は出さない |
| `.github/workflows/ads-review.yml` | Actions の「Ads review (Opus · Fable · Codex)」。3つのレビューを同時に動かし、まとめを Summary と artifact（ads-review）に出す |
| `tools/ads-review-prompt.md` | 3社に同じように渡す頼み方（ポリシー・景品表示法・季節・LINE 重視の目標・広告の出来・数字。must／should／nit） |
| `tools/ads-review.js` | 頼み方に一覧を入れる・Claude を読むだけで動かす・3つをまとめる |
| `mkt/ads/google-ads-serving.md` | 前に取った一覧（いまの一覧が無いときに使う。古いことがある） |

## 動かし方

1. Google広告 → ツールと設定 → 一括操作 → スクリプト → ＋ → `tools/google-ads-serving-2026-10.js` の中身を全部貼る → 承認 →「プレビュー」
2. ログをぜんぶコピーする
3. GitHub → Actions →「Ads review (Opus · Fable · Codex)」→ Run workflow →「広告の一覧」に貼って実行
4. 終わったら、その実行の Summary（または artifact の ads-review）を読む

- Secrets に `GOOGLE_ADS_*`（`tools/google-ads-run.js` と同じ）を入れておけば、1〜2 はいらない（API から いまの広告を読む）
- 何も貼らず API も無いときは `mkt/ads/google-ads-serving.md` を使う（Summary に注意が出る）。いまの一覧で回したら、このファイルも新しくしておく
- 要る Secrets：`ANTHROPIC_API_KEY` か `CLAUDE_CODE_OAUTH_TOKEN`（Opus・Fable）、`OPENAI_API_KEY`（Codex）。無いものは飛ばして、まとめに「動かなかった」と出る
- Codex のモデルは Variables の `CODEX_MODEL`（X サイクルと同じ）

## 気をつけること

- 公開リポジトリなので、ログ・Summary はだれでも見られます。広告の文と費用（docs にも載せているもの）までにして、お客様IDや電話番号は貼らないでください
- 3社とも、ファイルを読むだけです（書く・シェル・ウェブは使えない）。一覧は「データ」として読ませています
- AI のレビューは下書きです。事実（創業年・産年・価格・在庫など）は、お店で確かめてから直してください（docs/google-ads-review-2026-10.md の 5-4）

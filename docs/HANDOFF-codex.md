# Codex への引き継ぎメモ（SEO / LLMO 改善）

ブランチ: `claude/sweet-lovelace-bb8ocq`（`main` から 5 コミット先行、未 PR）
引き継ぎ日: 2026-10-15

## 1. 依頼内容

このブランチの変更を**レビュー**し、問題があれば修正した上で、未完了項目を**引き続き実装**する。
背景・分析・優先度は `docs/seo-llmo-analysis.md` を参照（進捗表あり）。

## 2. このブランチで済んでいること

| コミット | 内容 |
|---|---|
| `84340e1` | 分析レポート `docs/seo-llmo-analysis.md` |
| `a3907a3` | `index.html` viewport の `maximum-scale` 削除、外部リンクに `rel="noopener noreferrer"`、両ページの Web フォントを `media="print" onload` で非同期化＋`fonts.gstatic.com` preconnect |
| `5f1a1ba` | `meta-ads.html` に `noindex,nofollow`、`sitemap.xml`・`llms.txt` から除外 |
| `2175d14` | 本文の品種一覧を `varietySelect` の分類と一致させ、`llms.txt` も同表記に |
| `8a45afb` | `guide/index.html`（CollectionPage）＋記事 2 本（Article / BreadcrumbList / FAQPage）、index からの内部リンク、`sitemap.xml`・`llms.txt` 更新、`llms-full.txt` 新設、README に更新チェックリスト |

検証済み: 全ページの JSON-LD は `json.loads` でパース可。ヘッドレス Chrome（600px 幅）で描画確認済み。

## 3. レビューで特に見てほしい点

1. **`guide/grading-vs-inspection.html` の事実関係**: 農産物検査法・整粒歩合の目安（1等 70% / 2等 60% / 3等 45%）、着色粒・水分の記述、食味ランキング（特A）との区別。最新の「農産物規格規程」と矛盾がないか。
2. **`guide/rice-quality-12-points.html` の農学的記述**: 乳白粒・胴割れ・着色粒の原因説明が一般的な理解と合っているか。
3. **`llms-full.txt`**: `index.html` の `#about` と `guide/*.html` の本文を簡易 HTML→Markdown 変換したもの。変換漏れ・崩れがないか（生成スクリプトはリポジトリ外。再生成が必要なら本文から手で起こすか、変換スクリプトを `scripts/` に置いてほしい）。
4. **`index.html` の JSON-LD `WebPage.relatedLink`**: schema.org 的に妥当か。不要なら削除可。
5. **フォント非同期化**: `media="print" onload=...` で FOUT が許容範囲か。問題なら `system-ui` スタックへの置き換えも選択肢。
6. **`meta-ads.html` の noindex**: 推奨案で実装済み。公開ツールにしたい場合は差し戻し。

## 4. 未完了（続きの実装）

### A-1. 店の実体情報（最優先・ユーザー入力待ち）
Web 検索で確認できなかったため未実装。**捏造しないこと。** ユーザーから以下が得られたら実装する。
- 住所（番地）、電話、公式サイト URL、Instagram / Facebook / Google マップ URL、創業年、5代目の氏名（公開可否）

実装先:
- `index.html` JSON-LD の `Organization`（`streetAddress` / `postalCode` / `telephone` / `foundingDate` / `sameAs`、可能なら `@type: ["Organization","Store"]`）
- `index.html` footer と `guide/*.html` footer に住所・電話・公式サイトリンク
- `llms.txt` の「運営」行、`llms-full.txt`
- 5代目を `Person` として `founder` / `author` に

### B-2. 解説ページの追加（任意・店側レビュー前提）
候補: 胴割れ米・砕米の原因と見分け方／着色粒・カメムシ被害粒とは／お米の撮影のコツ／らいすぴあの品種一覧。
テンプレは既存の `guide/*.html` をコピー。追加時は `guide/index.html` の一覧と `hasPart`、`sitemap.xml`、`llms.txt`、`llms-full.txt` も更新（README のチェックリスト参照）。

### 本番確認（セッション環境からは vercel.app に到達不可だった）
- `/robots.txt` `/sitemap.xml` `/llms.txt` `/llms-full.txt` `/guide/` が 200 で返るか
- Search Console への登録と sitemap 送信
- Rich Results Test / Schema Markup Validator、PageSpeed Insights（モバイル）
- 独自ドメイン化の予定があれば canonical / OGP / sitemap / llms の URL を一括差し替え

## 5. 運用ルール

- 日付は手書き（4 箇所）。更新時は `README.md` のチェックリストに従う。
- `index.html` の本文 `#about`・JSON-LD・`llms.txt`・`guide/` は文言を一致させる（LLM は不一致で信頼度を下げる）。
- コミットメッセージは日本語、1 コミット 1 目的。

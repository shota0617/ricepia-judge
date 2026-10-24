# サイトの SEO / LLMO 点検チェックリスト（らいすぴあ）

LLMO = AI検索（ChatGPT 検索、Perplexity、Google AI Overview、Claude 等）に正しく理解され、引用されるための最適化。
SEO の基礎の上に「事実が一貫していて、構造化されていて、LLM が読みやすい」を足す。

## 0. まず確認すること

- 本番URL（canonical の基準）。独自ドメイン化の予定があれば URL を一括で差し替える前提で設計する
- 何のページか：ツール／EC／店舗案内／記事。ページの主題（トピック）を1つに絞る
- **店の実体情報**（住所・電話・公式サイト・SNS・Googleマップ・創業年・代表者名）は**ユーザーから貰う。Web検索で裏が取れないものを埋めない**。LLM は不一致・虚偽を見つけると信頼度を下げ、法的にも問題になる

## 1. ページ単体の技術的SEO（必須）

| 項目 | 合格ライン |
|---|---|
| `<title>` | 主要キーワード＋ブランド。60字以内目安。「精米品質AI判定｜写真で白度・光沢・割れを12項目採点 - らいすぴあ（近藤米穀店）」の型 |
| `meta description` | 120字前後。誰が・何を・どうする、が入る |
| `canonical` / `og:*` / `twitter:*` | 本番URLで統一。`og:image` は 1200×630 の実ファイル |
| `lang="ja"`、`viewport` | `maximum-scale=1` はピンチズーム禁止になりアクセシビリティ減点 → 付けない |
| 外部リンク | `target="_blank"` には `rel="noopener noreferrer"` |
| フォント | Google Fonts は `fonts.gstatic.com` に `preconnect crossorigin`、CSS は `media="print" onload="this.media='all'"` で非同期化＋`<noscript>`。または `system-ui` にする |
| 本文 | JS無しでも読める本文（見出し `h1`〜`h3`、リスト、`<details>` FAQ）が初期HTMLにあること。SPA の中身だけだとクローラーに空に見える |
| `robots.txt` | `Allow: /` に加え、GPTBot / OAI-SearchBot / ChatGPT-User / ClaudeBot / Claude-SearchBot / Claude-User / PerplexityBot / Google-Extended を明示許可。`Sitemap:` 行 |
| `sitemap.xml` | 公開ページのみ。`lastmod` を更新 |
| 社内用ページ | `noindex,nofollow` を付け、sitemap と llms.txt から外す（トピックの希釈を防ぐ） |

## 2. 構造化データ（JSON-LD、`@graph` で1ブロック）

- `Organization`（`@id` を付けて各ページから参照）：`name`、`alternateName`、`url`、`address`、`telephone`、`foundingDate`、`sameAs`（公式サイト・Instagram・Facebook・Googleマップ）、`brand`、`knowsAbout`。実店舗なら `@type: ["Organization","Store"]` と `openingHours`
- `WebSite` / `WebPage`（`dateModified`、`publisher`、`inLanguage: ja`）
- ツールページは `WebApplication`（`applicationCategory`、`isAccessibleForFree`、`offers`、`featureList`）
- 記事は `Article`（`headline`、`datePublished/Modified`、`author`→Organization or Person、`image`、`keywords`）＋ `BreadcrumbList`
- `FAQPage` / `HowTo`：Google のリッチリザルトにはもう効かない（FAQ は政府・医療のみ、HowTo は廃止）が、**LLM が構造を読む材料になる**ので本文と一致させて置く
- **本文と構造化データと llms.txt の文言を一致させる**。これが LLMO の肝

## 3. llms.txt / llms-full.txt

- `/llms.txt`：H1、`>` の1段落要約、事実の箇条書き（URL・運営・料金・言語・最終更新）、できること、基準・仕様、FAQ（Q/A 1行）、ページ一覧、`## Optional`
- `/llms-full.txt`：本文の全文 Markdown。記事を足したらここにも追記
- 各ページの `<head>` から `<link rel="alternate" type="text/markdown" href=".../llms.txt">` で参照

## 4. 事業体（E-E-A-T）とコンテンツ

- footer に運営者・所在地・連絡先・最終更新日（`<time datetime>`）
- 「誰の基準か」「公的な制度とどう違うか」を明記（例：S〜D は店独自、農産物検査の1等〜3等とは別）。LLM の誤解を防ぐ
- サイトが実質1ページなら、検索意図に答える解説ページを `/guide/` に足す（1,500〜3,000字、Article + Breadcrumb + FAQ、ツールへの導線、一覧ページ）。内容は店側が事実確認する
- 内部リンク：トップ ⇄ 記事 ⇄ 一覧 を相互に。孤立ページを作らない

## 5. 運用

- ビルド工程が無いサイトは日付が手書きになる（JSON-LD `dateModified`、`<time>`、`sitemap lastmod`、`llms.txt` 最終更新）。README にチェックリストを置く
- 本番で確認：各 URL が 200、Search Console 登録と sitemap 送信、Rich Results Test / Schema Markup Validator、PageSpeed Insights（モバイル）
- 判定結果は「できていること／優先度順の改善案（規模・必要なユーザー入力つき）／確認事項」で返す

## 参考：ricepia-judge で実装済みの型

`shota0617/ricepia-judge` の `index.html`（JSON-LD @graph、about 本文）、`llms.txt`、`llms-full.txt`、`guide/*.html`（Article テンプレ）、`robots.txt`、`docs/seo-llmo-analysis.md`（分析レポートの書式）をそのまま雛形にできる。

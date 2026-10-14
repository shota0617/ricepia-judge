# SEO / LLMO 分析レポートと改善案（Codexレビュー用）

対象: https://ricepia-judge.vercel.app/（`index.html`、`meta-ads.html`、`llms.txt`、`robots.txt`、`sitemap.xml`、`ogp.png`）
作成日: 2026-10-14
状態: **実装中。進捗は下表。**

| 項目 | 状態 |
|---|---|
| D-1 viewport / D-3 rel / D-2 フォント | ✅ 実装済み |
| C-1 meta-ads.html の noindex・sitemap/llms.txt から除外 | ✅ 実装済み（推奨案を採用。公開ツールとして育てる場合は差し戻し可） |
| A-2 品種表記の統一 | ✅ 実装済み（本文を select の分類と一致させた） |
| A-1 店の実体情報（住所・電話・sameAs・5代目） | ⏸ **保留。公開情報から確認できず、捏造を避けるためユーザー提供待ち** |
| D-5 llms-full.txt / D-7 更新チェックリスト（README） | ✅ 実装済み |
| B-2 解説ページ（1「12のポイント」・4「等級と精米品質の違い」）+ guide/ 一覧 + D-4 Breadcrumb | ✅ 下書き実装済み。**内容は店側（5代目）の事実確認を推奨** |
| B-1 index → 関連ページの内部リンク | ✅ about セクションと footer から guide/ へリンク |

> 注: このセッションの実行環境からは vercel.app への外部アクセスがネットワークポリシーで遮断されており（プロキシ 403）、本番サイトの実レスポンス（ヘッダ・HTTPステータス・インデックス状況）は確認できていません。以下はリポジトリ内のソースに基づく分析です。本番側の確認は「§5 手元で確認してほしいこと」にまとめました。

---

## 1. 現状の評価（すでに出来ていること）

前回の対策（commit `3f486ac`, `1dd4b8d`, `e7aacbf`）で基礎は整っています。

| 項目 | 状態 |
|---|---|
| title / description / canonical / robots meta | ✅ `index.html` にあり。タイトルはキーワード（精米・品質・AI判定・白度・光沢・割れ）を含み、ブランド名で終わる良い形 |
| OGP / Twitter Card / og:image 1200×630 | ✅ `ogp.png` は実寸 1200×630 で一致 |
| 構造化データ | ✅ Organization / WebSite / WebPage / WebApplication / HowTo / FAQPage を `@graph` で定義。FAQ は本文の `<details>` と文言一致 |
| 本文コンテンツ | ✅ 初期表示の `#apiscreen` 内に `<article id="about">`（概要・12項目・グレード基準・使い方・FAQ・footer）。JS 無しでも読める |
| llms.txt | ✅ 要約・事実リスト・FAQ・Optional 区分あり。`<link rel="alternate" type="text/markdown">` で参照 |
| robots.txt | ✅ 主要 AI クローラー（GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended）を明示許可、Sitemap 行あり |
| sitemap.xml | ✅ 2 URL、lastmod あり |
| 言語・日付 | ✅ `lang="ja"`、`<time datetime>`、`dateModified` |

**結論: 「ページ単体の技術的SEO/LLMO」はおおむね合格。残る課題は (A) 事業体（店）の実体情報の薄さ、(B) サイト全体のコンテンツ量と内部リンク、(C) `meta-ads.html` の扱い、(D) 細かな技術修正、の4つ。**

---

## 2. 改善案（優先度順）

### 【高】A-1. Organization に店の実体情報（NAP・sameAs）を追加 — LLMO の最重要項目
**問題**: `Organization` が「西尾市・愛知県」までしかなく、番地・電話・公式サイト・SNS・Googleビジネスプロフィールへの `sameAs` が無い。LLM／Google は「近藤米穀店 らいすぴあ」という実体を他のソースと結び付けられず、引用時の信頼度が上がらない。本文 footer にも住所・連絡先が無い。
**提案**:
- `Organization` に `streetAddress` / `postalCode` / `telephone` / `foundingDate`（創業年が分かれば）/ `sameAs`（公式サイト、Instagram、Facebook、Googleマップ、食べログ等の既存プロフィール）を追加。可能なら `@type` を `["Organization","Store"]` にして `openingHours` も。
- footer に住所・電話・公式サイトへのリンクを表示（構造化データと本文の一致）。
- `Organization.founder` または `WebPage.author` に 5代目の `Person`（氏名が公開可なら）を追加 → E-E-A-T。
**必要な情報（ユーザー提供）**: 住所、電話、公式サイトURL、SNS URL、創業年、5代目の公開可否・氏名。
**対象**: `index.html` の JSON-LD と footer、`llms.txt` の「運営」行。

### 【高】B-1. index.html → meta-ads.html の内部リンクが無い（孤立ページ）
**問題**: `meta-ads.html` から index への戻りリンクはあるが逆方向が無い。sitemap にしか載っていない。
**提案**: C-1 の判断次第。index から残すなら footer に「関連ツール」として 1 リンク追加。noindex にするなら内部リンクは不要。

### 【高】C-1. meta-ads.html の SEO 方針を決める（推奨: noindex）
**問題**: `meta-ads.html` は「らいすぴあ自身の Meta 広告の成果診断」用の社内ツール。OGP・構造化データ・`<h1>`・robots meta が無く、タイトルも `らいすぴあ Meta広告分析` のみ。中途半端にインデックスされると「米店なのに広告分析？」とサイトのトピック（精米・米）が薄まり、LLM の理解もぶれる。
**提案（推奨）**: `<meta name="robots" content="noindex,nofollow">` を付け、`sitemap.xml` から外し、`llms.txt` の Optional からも外す（または「社内用」と明記）。
**代替案**: 一般公開ツールとして育てるなら、index と同等の title/OGP/構造化データ（SoftwareApplication）、本文説明、FAQ を追加する。ただしサイトのトピック集中は失われる。
**ユーザー判断が必要**: どちらにするか。

### 【中】B-2. コンテンツ・ハブの追加（SEO の「量」と LLM の引用機会を増やす）
**問題**: 検索・LLM から見るとサイトは実質 1 ページ。「精米 品質 判定」「胴割れ 原因」「着色粒 とは」「米 等級 違い」等の検索意図に答えるページが無く、流入と引用の入口が1つしかない。
**提案**: 以下のような解説ページ（各 1,500〜3,000 字、JSON-LD `Article` + `BreadcrumbList`、FAQ 付き、ツールへの導線）を `/guide/` 配下に追加。各ページを `sitemap.xml`、`llms.txt`、index の footer／about セクションからリンクする。
1. `精米の品質を見分ける12のポイント`（ツールの12項目を一般向けに解説。写真の見本があるとさらに良い）
2. `胴割れ米・砕米とは？原因と見分け方`
3. `着色粒・カメムシ被害粒とは`
4. `農産物検査の等級（1等・2等）と精米品質の違い`（既存FAQの深掘り。誤解されやすいので LLM 引用価値が高い）
5. `お米の撮影のコツ（AI判定の精度を上げる）`
6. `らいすぴあが扱う品種一覧`（秀幸米・翔米・オリジナルブレンドの説明。店の実体情報と連動）
**注意**: 内容の正確性は店側（5代目）の確認が必須。AI の生成文をそのまま載せると E-E-A-T を損なう。
**実装規模**: 大（ページ 6 枚）。まずは 1・4 の 2 枚から始めるのを推奨。

### 【中】A-2. 本文「対応している主な品種」と llms.txt / select の不一致
**問題**: 本文は「あいちのこころ」を挙げているが、`llms.txt` と `varietySelect` には無い（`llms.txt` には「つやっ子」「のどか愛知コシヒカリ」「おにぎりがうまい米」等がある）。LLM は不一致を見つけると信頼度を下げる。
**提案**: 本文の品種段落を `varietySelect` の実際の選択肢（llms.txt と同じ分類）に揃える。品種名は店の商品名なので表記揺れを店側で確認。

### 【中】D-1. `meta viewport` の `maximum-scale=1.0` を削除
**問題**: ピンチズーム禁止は Lighthouse アクセシビリティで減点され、Google のページ体験評価にも不利。
**提案**: `index.html` の viewport を `width=device-width, initial-scale=1.0` に（`meta-ads.html` は既にこの形）。

### 【中】D-2. Web フォント読み込みの最適化
**問題**: `fonts.googleapis.com` に `preconnect` しているが、実際のフォントファイルは `fonts.gstatic.com` から配信される。render-blocking の CSS でもある。
**提案**:
- `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` を追加。
- CSS を `media="print" onload="this.media='all'"` パターンで非同期化し、`<noscript>` でフォールバック。
- 代替案: フォント自体をやめて `system-ui` スタックにする（LCP 改善、FOUT 回避）。

### 【中】D-3. `index.html` の `console.anthropic.com` リンクに `rel="noopener noreferrer"`
**問題**: `target="_blank"` に `rel` が無い（`meta-ads.html` 側は付いている）。セキュリティ・Lighthouse の指摘。

### 【低】D-4. BreadcrumbList / WebSite.potentialAction の追加
- `BreadcrumbList`（ホーム › 精米品質AI判定）は B-2 でページが増えた時点で必須。
- 検索機能が無いので `SearchAction` は不要。

### 【低】D-5. llms-full.txt の追加
**提案**: `llms.txt` は要約版として維持し、本文（12項目の詳細・グレード基準・FAQ全文）を Markdown で書き出した `llms-full.txt` を追加。B-2 の解説ページを作る場合はそれらの全文も含める。

### 【低】D-6. HowTo / FAQPage リッチリザルトの期待値を整理
Google は 2023年以降 HowTo リッチリザルトを廃止、FAQ リッチリザルトも政府・医療サイトに限定している。したがってこれらの JSON-LD は **検索結果の見栄えには効かない**。ただし LLM・AI Overview が構造を読む材料にはなるので削除はしない（維持で OK。期待値の共有のみ）。

### 【低】D-7. 日付の手動更新リスク
`dateModified`、`<time>`、`sitemap.xml` の `lastmod`、`llms.txt` の「最終更新」が 4 箇所で手書き。ビルド工程が無いので、更新漏れが起きる。
**提案**: 更新時のチェックリストを README に記載する。または GitHub Actions で push 時に日付を書き換える小スクリプトを置く。

### 【低】D-8. `#about` セクションの位置
API キー入力後は `#apiscreen` 全体が `display:none` になり、about 本文も消える。クローラーは初期状態を見るので SEO 上は問題なし。ただし「キーを入れた後に説明を読み返せない」のは UX 課題なので、app 側 footer から「このツールについて」で about を再表示できるとよい（任意）。

---

## 3. 実装順の提案

| 順 | 項目 | 規模 | ユーザー入力 |
|---|---|---|---|
| 1 | D-1, D-3, D-2（技術修正） | 小 | 不要 |
| 2 | C-1 meta-ads の noindex 化 + sitemap/llms.txt 修正 | 小 | 方針の決定 |
| 3 | A-2 品種の表記統一 | 小 | 品種名の確認 |
| 4 | A-1 店の実体情報（NAP / sameAs / footer） | 小〜中 | 住所・電話・URL 等 |
| 5 | D-5 llms-full.txt, D-7 更新チェックリスト | 小 | 不要 |
| 6 | B-2 解説ページ（まず 2 枚） + D-4 Breadcrumb | 大 | 内容の店側レビュー |

---

## 4. ユーザーに確認したいこと

1. **meta-ads.html** は検索から隠す（noindex）でよいか。
2. **店の公開情報**: 住所（番地まで）、電話、公式サイト URL、Instagram / Facebook / Google マップの URL、創業年。
3. **5代目**の氏名を `author` / `founder` として公開してよいか。
4. **品種名**の正式表記（「あいちのこころ」は実在の取扱い品種か、「つやっ子」等との関係）。
5. **解説ページ**（B-2）を作る場合、どのテーマから始めるか。内容は店側でレビューできるか。

---

## 5. 手元で確認してほしいこと（このセッションからは到達不可）

- `https://ricepia-judge.vercel.app/robots.txt` `/sitemap.xml` `/llms.txt` `/ogp.png` が 200 で返るか（Vercel の静的配信は通常問題なし）。
- Google Search Console にプロパティ登録済みか。未登録なら登録して sitemap を送信（インデックス状況・検索クエリが見える唯一の手段）。
- Rich Results Test / Schema Markup Validator で JSON-LD にエラーが無いか。
- PageSpeed Insights のモバイルスコア（フォント読み込みの影響を確認）。
- `ricepia-judge.vercel.app` を独自ドメイン（店の公式ドメインのサブドメイン等）に載せ替える予定があるか。あるなら canonical/OGP/sitemap/llms.txt の URL をまとめて差し替える必要があり、ドメインの信頼が店本体と統合されるので SEO/LLMO 上は大きなプラス。

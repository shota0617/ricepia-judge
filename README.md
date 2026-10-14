らいすぴあ 品質判定AI

- `index.html` … 精米の写真から品質を判定するAI
- `guide/` … お米の品質ガイド（解説記事。`guide/index.html` が一覧）
- `meta-ads.html` … Meta（Facebook / Instagram）広告の成果診断（社内用。`noindex` で検索対象外）
- `llms.txt` / `llms-full.txt` … AI検索・LLM向けのサイト要約と本文全文（LLMO）
- `robots.txt` / `sitemap.xml` / `ogp.png` … クローラー・SNS共有用
- `docs/seo-llmo-analysis.md` … SEO/LLMO 分析レポートと改善の進捗

## 更新時のチェックリスト

ビルド工程が無いため、日付は手書きです。内容を更新したら以下をまとめて直す。

1. `index.html`：JSON-LD の `"dateModified"`、footer の `<time datetime>` と表示日付
2. `sitemap.xml`：更新したページの `<lastmod>`
3. `llms.txt`：「最終更新」行。FAQ・品種・グレード基準を変えたら本文側（`index.html` の `#about`、JSON-LD の FAQPage）と文言を一致させる
4. `llms-full.txt`：本文を変えたら再生成する（`index.html` の `#about` と `guide/*.html` の本文を Markdown 化したもの）
5. `guide/*.html`：JSON-LD の `datePublished` / `dateModified`、`<time>`、`article:modified_time`
6. 判定12項目・グレード基準・品種の選択肢を変えたら、`index.html` の本文・JSON-LD・`llms.txt`・`guide/` の記述を全て揃える

らいすぴあ 品質判定AI

- `index.html` … 精米の写真から品質を判定するAI
- `guide/` … お米の品質ガイド（解説記事。`guide/index.html` が一覧）
- `meta-ads.html` … Meta（Facebook / Instagram）広告の成果診断（社内用。`noindex` で検索対象外）
- `llms.txt` / `llms-full.txt` … AI検索・LLM向けのサイト要約と本文全文（LLMO）
- `robots.txt` / `sitemap.xml` / `ogp.png` … クローラー・SNS共有用
- `docs/seo-llmo-analysis.md` … SEO/LLMO 分析レポートと改善の進捗
- `skills/kokoku-shindan/` … 広告診断スキル（Meta広告CSVの判定スクリプト＋SEO/LLMOチェックリスト）。`skills/kokoku-shindan.skill` を Claude にアップロードすると使える

## 更新時のチェックリスト

ビルド工程が無いため、日付は手書きです。内容を更新したら以下をまとめて直す。

1. `index.html`：JSON-LD の `"dateModified"`、footer の `<time datetime>` と表示日付
2. `sitemap.xml`：更新したページの `<lastmod>`
3. `llms.txt`：「最終更新」行。FAQ・品種・グレード基準を変えたら本文側（`index.html` の `#about`、JSON-LD の FAQPage）と文言を一致させる
4. `llms-full.txt`：`python3 scripts/generate_llms_full.py` で再生成する（`index.html` の `#about` と `guide/*.html` の本文を Markdown 化したもの）
5. `guide/*.html`：JSON-LD の `datePublished` / `dateModified`、`<time>`、`article:modified_time`
6. 判定12項目・グレード基準・品種の選択肢を変えたら、`index.html` の本文・JSON-LD・`llms.txt`・`guide/` の記述を全て揃える

## ローカル検証

Python 3 の標準ライブラリだけで実行できます。

```sh
python3 scripts/generate_llms_full.py
python3 scripts/generate_llms_full.py --check
python3 -m unittest discover -s tests -v
git diff --check
```

全文版にはトップの `#about`、ガイド一覧・全記事、運営情報を収録します。リンクは絶対URLに変換し、表・定義リスト・番号・FAQを保持します。`--check` は未更新なら終了コード1を返します。FAQの表示本文とJSON-LD、canonical・サイトマップ・日付・内部リンクもテストします。

記事の `datePublished` は初出日なので、既存記事の更新時には変更しません。`dateModified` と表示日付を更新してください。公開前に店側で内容をレビューしてください。

# Codexレビューと実装記録

日付: 2026-10-15（日本時間）
対象: `claude/sweet-lovelace-bb8ocq`、レビュー開始時 `f2b7740`。比較先は `origin/main`（`8bd65de`）。

## §3 レビュー

| 重要度 | 問題・判定 | 対応 |
|---|---|---|
| P2 | 水分を「おおむね15%前後が上限」と記載し、現行規程の附の加算を欠落 | 水稲うるち玄米の表15.0%＋附1.0ポイント＝16.0%、保管推奨値とは別と明記 |
| P2 | 70/60/45%を目安とし、整粒歩合だけで等級が決まるように読める | 最低限度と明記。形質・水分・混入限度を併せる条件、着色粒0.1/0.3/0.7%、機械鑑定規格の存在を追記 |
| P2 | 白濁を一律に未熟と説明し、低アミロース米・もち米を誤評価するおそれ | 白未熟粒の位置・原因を整理し、品種特性による白濁との区別を追加 |
| P2 | 着色の原因・選別不良・安全性を写真から断定する表現 | 斑点米は一例とし、黒米入り商品・病害・写真判定の限界を明記。胴割れと砕米も区別 |
| P2 | 品種分類を統一したはずだが、selectの「愛知コシヒカリ」が特殊米に残存 | 本文・llmsに合わせて愛知産へ移動（選択肢の値は維持） |
| P2 | llms-full.txtのリンク先欠落、ガイド一覧・運営情報未収録、再生成方法なし | 標準ライブラリの生成スクリプトを追加。リンク・表・定義リスト・連番・FAQ・全ガイド・footerを収録 |
| P2 | 店側未レビューの原稿に「執筆・監修」と表示 | 「編集」に変更。公開前の店側レビューをREADMEに明記 |
| P3 | ガイドCTAの「無料」だけではAPI利用料を誤認し得る | ツール無料・API利用料別を表示 |
| 確認済み | WebPage.relatedLink | schema.orgでWebPageに適用可能、値はURL。維持 |
| 確認済み | 非同期フォント | 375/1280pxで表示確認。CSSを2秒遅延させても本文可読、読込後media=all。ローカル1回のレイアウトシフト合計0.00504。継続利用 |
| 確認済み | meta-ads.htmlのnoindex | 維持。sitemapとLLMファイルから除外。robots.txtではクロールを妨げず、noindexの取得を許可 |

法令は農林水産省の[現行法令一覧](https://www.maff.go.jp/j/seisan/syoryu/kensa/hourei.html)から、[国内産農産物・令和8年7月30日施行版](https://www.maff.go.jp/j/seisan/syoryu/kensa/attach/pdf/hourei-247.pdf)の20・22ページを照合した。食味ランキングは[日本穀物検定協会](https://www.kokken.or.jp/test.html)で確認。農学の出典リンクは記事末尾の参考資料に記載。

## §4 進めた項目

- A-1: ユーザーの「gbpなどを参照して」に従い、公式サイト・会社案内・日本郵便で確認した本店の住所、電話、創業年、SNSをJSON-LDと全ページfooter、LLM向けファイルに反映。根拠と保留項目は `store-information-sources.md`。
- 公式と同じ店舗・Personの@idを採用。五代目を創業者にせず、未レビュー記事の個人著者・監修者にも指定していない。
- B-2: `guide/rice-photo-tips.html` を追加。新たな商売情報を必要としない撮影方法とツールの限界を説明。ガイド一覧・hasPart・トップの内部リンク・sitemap・llmsを更新。
- 本番の5URLを各1回GET。結果は下表。現行公開サイトと作業ブランチの結果を分離した。

| 本番URLのパス | HTTP |
|---|---|
| /robots.txt | 200 |
| /sitemap.xml | 200 |
| /llms.txt | 200 |
| /llms-full.txt | 404 |
| /guide/ | 404 |

未公開ブランチの追加ページは本番にまだない。404を直すための自動公開は行っていない。

## 検証

- `python3 -m unittest discover -s tests -v`: 6テスト成功。JSON-LDの構文、本文とFAQ一致、canonical/sitemap/日付、内部リンク、全文の生成一致、店舗情報の同一性を確認。
- `python3 scripts/generate_llms_full.py --check`: 成功。
- `git diff --check`: 成功。
- Chromeでトップ、全ガイド4ページ、meta-adsの計6ページを375/1280pxで確認。全件200・横はみ出しなし・JS例外なし。ガイド一覧はJavaScript無効でも表示。
- Schema Markup Validatorに5公開対象HTMLのJSON-LDをまとめてコード検証：エラー0・警告0。構造化データの意味・プロパティを検証したもので、本番クロールやGoogleへの掲載保証ではない。
- Google Rich Results Test（スマートフォン、トップのJSON-LDコードのみ）：3件の有効なアイテム。重大な問題なし。任意の不足はStoreのpriceRange/image、WebApplicationのaggregateRating。評価点は捏造せず未設定。ガイド個別のGoogleテスト・本番URLのクロール検証は公開後に行う。結果URL: https://search.google.com/test/rich-results/result?id=VqA9Dc32Zi4qZ8miauoT6Q
- PageSpeed Insights公式APIをモバイルで1回実行：HTTP 429（Queries per dayの上限超過）。スコア未取得、再試行なし。新しいAPIキー・課金設定の追加なし。
- APIキー入力・判定API呼び出し・広告CSV処理は変更対象外。課金を伴うAI判定は実行していない。

証跡: `verification/browser-results.json`、`verification/production-check.json`、`verification/schema-validator.png`、`verification/rich-results.png`。

## 残タスク

1. 店側で記事内容を確認し、個人の著者・監修者を付ける場合は担当者を確定。
2. Facebookの正式URLを確定。取得時に制限表示があり保留。GoogleマップURLは公式サイトのリンクを採用し、GBP管理値そのものとの一致は未確認。
3. 独自ドメイン化の予定がある場合、移行先確定後にcanonical・OGP・sitemap・llmsを一括変更。
4. 店主の承認後にpush・PR/マージ・本番公開。Search Consoleは新Googleアカウント `ricepiaricepiaricepia@gmail.com` の対象プロパティ所有確認後に、公開版sitemapを送信する。今回登録・送信は行っていない。
5. 公開後、今回404だった2パスを再確認し、PageSpeedを再測定。AI引用への効果は今回未測定。次回確認の目安は公開から4〜8週間後（仮に10月15日公開なら11月12日以降）。自動実行は未設定。

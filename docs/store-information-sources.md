# 店舗情報の根拠（2026-10-15）

ユーザーから「gbpなどを参照して」と指示。推測せず、取得できた公式情報に限定して反映した。

| 項目 | 採用値 | 根拠 |
|---|---|---|
| 運営・本店 | 近藤米穀店 らいすぴあ | https://ricepia.jp/ の店舗情報・LocalBusiness |
| 住所 | 愛知県西尾市米津町蓮台３−１ | 公式トップ・https://ricepia.jp/about.html |
| 郵便番号 | 445-0802 | 公式トップJSON-LD、日本郵便の米津町の郵便番号 |
| 電話 | 0563-54-4001（2店舗共通） | 公式トップ・会社案内 |
| 創業 | 1892年（明治25年） | 会社案内の沿革 |
| Googleマップ | https://maps.app.goo.gl/jwSHhSN4M6YjR8Av7 | 公式トップの「近藤米穀店」の地図リンク |
| Instagram | https://www.instagram.com/ricepiablog/ | 公式トップのSNS欄・sameAs |
| YouTube | https://www.youtube.com/@ricepia | 公式トップのSNS欄・sameAs |
| LINE | https://line.me/R/ti/p/@wxh6702b | 公式トップのsameAs |
| 五代目 | 近藤翔太 | 公式トップの可視文・Person、https://ricepia.jp/shomai/ |

日本郵便: https://www.post.japanpost.jp/cgi-zip/zipcode.php?addr=%E6%84%9B%E7%9F%A5%E7%9C%8C%E8%A5%BF%E5%B0%BE%E5%B8%82

運営者は公式サイトと同じ `https://ricepia.jp/#business` を使用し、本店と永吉の店舗情報を混同しない。`Store` はOrganizationの下位型。電話はJSON-LDでは国際形式、可視文では国内形式。Personも公式の `https://ricepia.jp/#shota` を参照する。

Googleマップの短縮URLの取得はCache missで、GBP管理画面・APIの現在値は未確認。上記は「公式サイトで確認できた店舗情報」であり、「GBPと完全一致を確認済み」という報告ではない。Googleアカウントへのログイン・切替は行っていない。

Facebookは過去のローカル作業ログに `https://www.facebook.com/ricepia/` があるが、今回の検索ツールによる取得結果には制限表示があったため再アクセスしていない。現在のページ内容を確認できず、sameAsへの追加は保留（ユーザーのアカウントがロックされたと判断できる証拠ではない）。

五代目を1892年創業の `founder` とするのは不適切なので採用しない。氏名と「五代目店主」のみを公式情報に基づき掲載し、記事の著者・監修者としての指定は店主の確認後に行う。

残確認: Facebookの正式URL、記事の監修・著者の扱い、独自ドメイン化の予定。

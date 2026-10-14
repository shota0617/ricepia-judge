#!/usr/bin/env python3
"""Google広告 秋冬の直し（2026年10月）を一括で当てる。

内容は同じフォルダの「2026-10_秋冬の直し.md」のとおり。
既定は --dry-run（何も変えずに、やることを並べるだけ）。本当に変えるときは --apply。

使い方:
  pip install google-ads
  ~/google-ads.yaml に developer_token / client_id / client_secret / refresh_token / login_customer_id を置く
  python apply_autumn_fix.py --diagnose                 # 業務用米_検索が出ない理由と、付属情報の一覧
  python apply_autumn_fix.py                            # 乾いた実行（変更なし）
  python apply_autumn_fix.py --apply                    # 1〜5 を当てる
  python apply_autumn_fix.py --apply --price-10kg 4500 --price-5kg 2250   # 価格の行も直す
  python apply_autumn_fix.py --apply --remove-old-price-images --pause-generic-keywords --remove-old-pmax

このスクリプトは実アカウントで動かして確かめてはいない。まず --dry-run の出力を読んでから --apply すること。
"""
import argparse
import sys

CUSTOMER_ID = "3573025294"

# ---- 9/22 の棚卸しから取った ID ----
PMAX2 = "24130007886"              # 西尾の米屋 らいすぴあ #2
PMAX_OLD = "24038490867"           # 西尾の米屋 らいすぴあ（停止中）
SHINMAI2 = "24135835856"           # 新米２（検索）
GYOMU_NAME = "業務用米_検索"

AG1 = "6740277665"                 # #2 / アセット グループ 1
AG_SHINMAI = "6740411688"          # #2 / 新米産地レポート

# 1. 夏の文言 → 秋冬（アセット グループ 1）。(field_type, 古いアセットid, 新しい文)
AG1_SWAPS = [
    ("HEADLINE",      "398479352542", "雨の日も車に乗ったまま受取"),
    ("DESCRIPTION",   "398479352572", "車に乗ったままお米を受取。雨でも寒くても、西尾の米屋・翔米。"),
    ("LONG_HEADLINE", "398479352581", "車に乗ったまま、重いお米もそのまま積み込み。お米のドライブスルーは西尾の米屋・翔米"),
    ("LONG_HEADLINE", "398479352584", "当日精米のできたてを、降りずに受け取れる。秋冬の買い出しがラクになる米屋です"),
]
AG1_BUSINESS_NAME = ("395056990363", "407068771599")   # らいすぴあ・秀幸 → 近藤米穀店 らいすぴあ

# 2. 新米産地レポート
SHINMAI_REMOVE = [("HEADLINE", "414269975017")]       # 8月29日から販売開始
SHINMAI_SWAPS = [
    ("LONG_HEADLINE", "414162220913", "愛知の新米が入荷しました。のどかとミルキークイーン、ただいま販売中です"),
]
SHINMAI_LOGO = ("406892474564", "394960122746")
SHINMAI_ADD_IMAGES = [
    ("MARKETING_IMAGE",          "420597798893"),   # v4 横1200x628
    ("PORTRAIT_MARKETING_IMAGE", "420781426374"),   # v4 縦960x1200
    ("SQUARE_MARKETING_IMAGE",   "420781426803"),   # v4 正方1200
]
SHINMAI_PRICE_LH = "420601614881"
SHINMAI_OLD_PRICE_IMAGES = [
    ("SQUARE_MARKETING_IMAGE",   "414160391021"),
    ("PORTRAIT_MARKETING_IMAGE", "414160391033"),
    ("MARKETING_IMAGE",          "414268044907"),
]

# 3. 新米２（検索）
RSA_HEADLINE_SWAP = ("新米予約・入荷速報公開中", "新米入荷速報を公開中")
GENERIC_KEYWORDS = ["米 安い", "お米 格安", "米 30kg 安い"]

# 付属情報。(field_type, asset_id)
CONSUMER_SITELINKS = ["398470447660", "398542808304", "398542808307", "398542808310",
                      "398542808313", "398542808316", "398542808319"]
NEWER_SITELINKS = ["416753448637", "416753451211", "416827840359", "416827868535"]   # 文面は --diagnose で確認
CALLOUTS = ["416649165608", "416755020619", "416829398700", "416829398706", "416829403434", "416829404643"]
CALL = "395057014114"
LOCATIONS = ["395108071545", "395108071548"]

# 5. コンバージョン
CONV_DIRECTIONS = "7689006169"
CONV_YOUTUBE_SECONDARY = ["7727779375", "7727569844"]
CONV_CALLS_FROM_ADS = "7731838687"


def rn(kind, *ids):
    return f"customers/{CUSTOMER_ID}/{kind}/" + "~".join(str(i) for i in ids)


class Runner:
    def __init__(self, client, apply):
        self.c = client
        self.apply = apply
        self.gas = client.get_service("GoogleAdsService")

    def log(self, msg):
        print(("[apply] " if self.apply else "[dry]   ") + msg)

    def query(self, gaql):
        rows = []
        for batch in self.gas.search_stream(customer_id=CUSTOMER_ID, query=gaql):
            rows.extend(batch.results)
        return rows

    def mutate(self, service_name, method, ops, what):
        self.log(f"{what}  ({len(ops)}件)")
        if not self.apply or not ops:
            return None
        svc = self.c.get_service(service_name)
        return getattr(svc, method)(customer_id=CUSTOMER_ID, operations=ops)

    # ---- 部品 ----
    def create_text_asset(self, text):
        op = self.c.get_type("AssetOperation")
        op.create.text_asset.text = text
        res = self.mutate("AssetService", "mutate_assets", [op], f"文のアセットを作る: 「{text}」")
        return res.results[0].resource_name if res else f"customers/{CUSTOMER_ID}/assets/NEW"

    def ag_link(self, ag, field_type, asset_rn):
        op = self.c.get_type("AssetGroupAssetOperation")
        op.create.asset_group = rn("assetGroups", ag)
        op.create.asset = asset_rn
        op.create.field_type = self.c.enums.AssetFieldTypeEnum[field_type]
        return op

    def ag_unlink(self, ag, field_type, asset_id):
        op = self.c.get_type("AssetGroupAssetOperation")
        op.remove = rn("assetGroupAssets", f"{ag}~{asset_id}~{field_type}")
        return op

    def swap_in_group(self, ag, field_type, old_id, new_asset_rn, label):
        ops = [self.ag_link(ag, field_type, new_asset_rn), self.ag_unlink(ag, field_type, old_id)]
        self.mutate("AssetGroupAssetService", "mutate_asset_group_assets", ops, label)

    # ---- 1. アセット グループ 1 ----
    def fix_ag1(self):
        for ft, old, text in AG1_SWAPS:
            new = self.create_text_asset(text)
            self.swap_in_group(AG1, ft, old, new, f"AG1 {ft}: id{old} → 「{text}」")
        old, new = AG1_BUSINESS_NAME
        self.swap_in_group(AG1, "BUSINESS_NAME", old, rn("assets", new), "AG1 会社名を「近藤米穀店 らいすぴあ」に")

    # ---- 2. 新米産地レポート ----
    def fix_shinmai(self, price10, price5, remove_old_price_images):
        ops = [self.ag_unlink(AG_SHINMAI, ft, a) for ft, a in SHINMAI_REMOVE]
        self.mutate("AssetGroupAssetService", "mutate_asset_group_assets", ops, "新米: 「8月29日から販売開始」を外す")
        for ft, old, text in SHINMAI_SWAPS:
            new = self.create_text_asset(text)
            self.swap_in_group(AG_SHINMAI, ft, old, new, f"新米 {ft}: id{old} → 「{text}」")
        old, new = SHINMAI_LOGO
        self.swap_in_group(AG_SHINMAI, "LOGO", old, rn("assets", new), "新米: ロゴを1024pxのものに")
        ops = [self.ag_link(AG_SHINMAI, ft, rn("assets", a)) for ft, a in SHINMAI_ADD_IMAGES]
        self.mutate("AssetGroupAssetService", "mutate_asset_group_assets", ops, "新米: v4 の画像3枚を入れる")
        if price10 and price5:
            text = f"新米のどか10kg{price10:,}円・5kg{price5:,}円(税込)。ただいま販売中です"
            new = self.create_text_asset(text)
            self.swap_in_group(AG_SHINMAI, "LONG_HEADLINE", SHINMAI_PRICE_LH, new, f"新米: 価格の行を「{text}」に")
        else:
            self.log("新米: 価格の行 id420601614881 はそのまま（--price-10kg/--price-5kg を付ければ直す）")
        if remove_old_price_images:
            ops = [self.ag_unlink(AG_SHINMAI, ft, a) for ft, a in SHINMAI_OLD_PRICE_IMAGES]
            self.mutate("AssetGroupAssetService", "mutate_asset_group_assets", ops, "新米: 価格入りの古い画像3枚を外す")

    # ---- 3. 新米２ ----
    def fix_shinmai2(self, pause_generic):
        rows = self.query(f"""
            SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.final_urls,
                   ad_group_ad.ad.responsive_search_ad.headlines,
                   ad_group_ad.ad.responsive_search_ad.descriptions,
                   ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2
            FROM ad_group_ad
            WHERE campaign.id = {SHINMAI2} AND ad_group_ad.status = 'ENABLED'
              AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'""")
        old_text, new_text = RSA_HEADLINE_SWAP
        for r in rows:
            ad = r.ad_group_ad.ad
            texts = [h.text for h in ad.responsive_search_ad.headlines]
            if old_text not in texts:
                self.log(f"新米２ 広告id{ad.id}: 「{old_text}」は無いので触らない")
                continue
            # 広告の文は書き換えられないので、同じ中身で見出しだけ替えた広告を作り、古い方を止める
            op = self.c.get_type("AdGroupAdOperation")
            na = op.create
            na.ad_group = rn("adGroups", r.ad_group.id)
            na.status = self.c.enums.AdGroupAdStatusEnum.ENABLED
            na.ad.final_urls.extend(list(ad.final_urls))
            rsa = na.ad.responsive_search_ad
            for h in ad.responsive_search_ad.headlines:
                nh = self.c.get_type("AdTextAsset")
                nh.text = new_text if h.text == old_text else h.text
                if h.pinned_field:
                    nh.pinned_field = h.pinned_field
                rsa.headlines.append(nh)
            for d in ad.responsive_search_ad.descriptions:
                nd = self.c.get_type("AdTextAsset")
                nd.text = d.text
                if d.pinned_field:
                    nd.pinned_field = d.pinned_field
                rsa.descriptions.append(nd)
            rsa.path1 = ad.responsive_search_ad.path1
            rsa.path2 = ad.responsive_search_ad.path2
            self.mutate("AdGroupAdService", "mutate_ad_group_ads", [op],
                        f"新米２ 広告id{ad.id}: 「{old_text}」→「{new_text}」の新しい広告を作る")
            pop = self.c.get_type("AdGroupAdOperation")
            pop.update.resource_name = rn("adGroupAds", f"{r.ad_group.id}~{ad.id}")
            pop.update.status = self.c.enums.AdGroupAdStatusEnum.PAUSED
            self.c.copy_from(pop.update_mask, self.c.get_type("FieldMask")(paths=["status"]))
            self.mutate("AdGroupAdService", "mutate_ad_group_ads", [pop], f"新米２ 古い広告id{ad.id}を止める")

        # 地域設定を「所在地」のみに
        op = self.c.get_type("CampaignOperation")
        op.update.resource_name = rn("campaigns", SHINMAI2)
        op.update.geo_target_type_setting.positive_geo_target_type = \
            self.c.enums.PositiveGeoTargetTypeEnum.PRESENCE
        self.c.copy_from(op.update_mask, self.c.get_type("FieldMask")(
            paths=["geo_target_type_setting.positive_geo_target_type"]))
        self.mutate("CampaignService", "mutate_campaigns", [op], "新米２: 地域設定を「所在地」のみに")

        if pause_generic:
            rows = self.query(f"""
                SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text
                FROM keyword_view WHERE campaign.id = {SHINMAI2} AND ad_group_criterion.status = 'ENABLED'""")
            ops = []
            for r in rows:
                if r.ad_group_criterion.keyword.text in GENERIC_KEYWORDS:
                    op = self.c.get_type("AdGroupCriterionOperation")
                    op.update.resource_name = rn("adGroupCriteria", f"{r.ad_group.id}~{r.ad_group_criterion.criterion_id}")
                    op.update.status = self.c.enums.AdGroupCriterionStatusEnum.PAUSED
                    self.c.copy_from(op.update_mask, self.c.get_type("FieldMask")(paths=["status"]))
                    ops.append(op)
                    self.log(f"  止める語句: {r.ad_group_criterion.keyword.text}")
            self.mutate("AdGroupCriterionService", "mutate_ad_group_criteria", ops, "新米２: 地名のない値段狙いの語句を止める")

    # ---- 付属情報 ----
    def campaign_id_by_name(self, name):
        rows = self.query(f"SELECT campaign.id FROM campaign WHERE campaign.name = '{name}'")
        return str(rows[0].campaign.id) if rows else None

    def link_campaign_assets(self, campaign_id, items, label):
        have = {(r.campaign_asset.field_type.name, r.campaign_asset.asset.split("/")[-1]) for r in self.query(f"""
            SELECT campaign_asset.field_type, campaign_asset.asset FROM campaign_asset
            WHERE campaign.id = {campaign_id} AND campaign_asset.status != 'REMOVED'""")}
        ops = []
        for ft, a in items:
            if (ft, a) in have:
                continue
            op = self.c.get_type("CampaignAssetOperation")
            op.create.campaign = rn("campaigns", campaign_id)
            op.create.asset = rn("assets", a)
            op.create.field_type = self.c.enums.AssetFieldTypeEnum[ft]
            ops.append(op)
        self.mutate("CampaignAssetService", "mutate_campaign_assets", ops, label)

    def fix_extensions(self):
        common = [("CALL", CALL)] + [("LOCATION", a) for a in LOCATIONS] + [("CALLOUT", a) for a in CALLOUTS]
        self.link_campaign_assets(SHINMAI2, [("SITELINK", a) for a in CONSUMER_SITELINKS] + common,
                                  "新米２: サイトリンク・電話・住所・コールアウトを付ける")
        gyomu = self.campaign_id_by_name(GYOMU_NAME)
        if gyomu:
            self.link_campaign_assets(gyomu, [("SITELINK", a) for a in NEWER_SITELINKS] + common,
                                      f"{GYOMU_NAME}: 新しいサイトリンク4本・電話・住所・コールアウトを付ける")
        else:
            self.log(f"{GYOMU_NAME} が見つからない")

    # ---- 5. コンバージョン ----
    def fix_conversions(self):
        def upd(cid, paths, setter, label):
            op = self.c.get_type("ConversionActionOperation")
            op.update.resource_name = rn("conversionActions", cid)
            setter(op.update)
            self.c.copy_from(op.update_mask, self.c.get_type("FieldMask")(paths=paths))
            try:
                self.mutate("ConversionActionService", "mutate_conversion_actions", [op], label)
            except Exception as e:   # Google が自動で作ったものは変えられないことがある
                self.log(f"  変えられなかった: {label}: {e}")

        upd(CONV_DIRECTIONS, ["counting_type"],
            lambda u: setattr(u, "counting_type", self.c.enums.ConversionActionCountingTypeEnum.ONE_PER_CLICK),
            "経路: 1クリックにつき1回に")
        for cid in CONV_YOUTUBE_SECONDARY:
            upd(cid, ["primary_for_goal"], lambda u: setattr(u, "primary_for_goal", False),
                f"YouTube id{cid}: サブに下げる")
        upd(CONV_CALLS_FROM_ADS, ["value_settings.default_currency_code"],
            lambda u: setattr(u.value_settings, "default_currency_code", "JPY"),
            "Calls from ads: 通貨を JPY に")

    # ---- 6. 片付け ----
    def remove_old_pmax(self):
        op = self.c.get_type("CampaignOperation")
        op.remove = rn("campaigns", PMAX_OLD)
        self.mutate("CampaignService", "mutate_campaigns", [op], "旧 P-MAX（停止中）を削除")

    # ---- 診断 ----
    def diagnose(self):
        print("■ 付属情報の文面（ID と合っているか確認）")
        for r in self.query("""SELECT asset.id, asset.type, asset.sitelink_asset.link_text, asset.sitelink_asset.description1,
                                      asset.callout_asset.callout_text, asset.final_urls
                               FROM asset WHERE asset.type IN ('SITELINK','CALLOUT','CALL','LOCATION')"""):
            a = r.asset
            txt = a.sitelink_asset.link_text or a.callout_asset.callout_text or ""
            print(f"  {a.type_.name:9} id{a.id}  {txt}  {list(a.final_urls)}")
        gyomu = self.campaign_id_by_name(GYOMU_NAME)
        print(f"\n■ {GYOMU_NAME}（id{gyomu}）が出ない理由を探す")
        if not gyomu:
            return
        for r in self.query(f"""SELECT campaign.status, campaign.serving_status, campaign.primary_status, campaign.primary_status_reasons,
                                       campaign.bidding_strategy_type, campaign_budget.amount_micros, campaign.geo_target_type_setting.positive_geo_target_type
                                FROM campaign WHERE campaign.id = {gyomu}"""):
            c = r.campaign
            print(f"  状態={c.status.name} 配信={c.serving_status.name} 主={c.primary_status.name} 理由={[x.name for x in c.primary_status_reasons]}")
            print(f"  入札={c.bidding_strategy_type.name} 日予算=¥{r.campaign_budget.amount_micros/1e6:.0f} 地域={c.geo_target_type_setting.positive_geo_target_type.name}")
        for r in self.query(f"""SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros
                                FROM ad_group WHERE campaign.id = {gyomu}"""):
            g = r.ad_group
            print(f"  広告グループ id{g.id} {g.name} 状態={g.status.name} 上限CPC=¥{g.cpc_bid_micros/1e6:.0f}")
        kws = self.query(f"""SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status,
                                    ad_group_criterion.approval_status, ad_group_criterion.quality_info.quality_score
                             FROM keyword_view WHERE campaign.id = {gyomu}""")
        print(f"  キーワード {len(kws)}本")
        for r in kws:
            k = r.ad_group_criterion
            print(f"    {k.keyword.text} [{k.keyword.match_type.name}] 状態={k.status.name} 承認={k.approval_status.name} 品質={k.quality_info.quality_score}")
        for r in self.query(f"""SELECT campaign_criterion.location.geo_target_constant, campaign_criterion.negative
                                FROM campaign_criterion WHERE campaign.id = {gyomu} AND campaign_criterion.type = 'LOCATION'"""):
            print(f"  地域: {r.campaign_criterion.location.geo_target_constant} 除外={r.campaign_criterion.negative}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="本当に変える（付けなければ乾いた実行）")
    ap.add_argument("--diagnose", action="store_true", help="業務用米_検索の状態と付属情報を一覧して終わる")
    ap.add_argument("--price-10kg", type=int, help="新米のどか 10kg の税込価格（例 4500）")
    ap.add_argument("--price-5kg", type=int, help="新米のどか 5kg の税込価格（例 2250）")
    ap.add_argument("--remove-old-price-images", action="store_true", help="価格入りの古い画像3枚を外す")
    ap.add_argument("--pause-generic-keywords", action="store_true", help="米 安い／お米 格安／米 30kg 安い を止める")
    ap.add_argument("--remove-old-pmax", action="store_true", help="停止中の旧 P-MAX を削除する")
    ap.add_argument("--config", default=None, help="google-ads.yaml の場所（既定 ~/google-ads.yaml）")
    args = ap.parse_args()
    if bool(args.price_10kg) != bool(args.price_5kg):
        ap.error("--price-10kg と --price-5kg は両方いる")

    try:
        from google.ads.googleads.client import GoogleAdsClient
    except ImportError:
        sys.exit("pip install google-ads が要る")
    client = GoogleAdsClient.load_from_storage(args.config) if args.config else GoogleAdsClient.load_from_storage()
    r = Runner(client, args.apply)

    if args.diagnose:
        r.diagnose()
        return
    print("=== 1. 夏の文言を秋冬に ===");            r.fix_ag1()
    print("=== 2. 新米の古い日付・ロゴ・画像 ===");   r.fix_shinmai(args.price_10kg, args.price_5kg, args.remove_old_price_images)
    print("=== 3. 新米２ ===");                      r.fix_shinmai2(args.pause_generic_keywords)
    print("=== 4. 付属情報 ===");                    r.fix_extensions()
    print("=== 5. コンバージョン ===");               r.fix_conversions()
    if args.remove_old_pmax:
        print("=== 6. 片付け ===");                  r.remove_old_pmax()
    if not args.apply:
        print("\n（乾いた実行。変更なし。本当に当てるなら --apply）")


if __name__ == "__main__":
    main()

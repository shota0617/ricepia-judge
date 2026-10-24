// らいすぴあ Google広告：いま配信中の広告をぜんぶ書き出す Google広告スクリプト（読むだけ・アカウントは変えない）。
// 3社のAI（Claude Opus・Claude Fable・OpenAI Codex）のレビュー（.github/workflows/ads-review.yml）に渡す一覧を作る。
//   使い方: Google広告 → ツールと設定 → 一括操作 → スクリプト → ＋ → このファイルの中身を全部貼り付け
//          → 承認 →「プレビュー」→ ログをぜんぶコピー → Actions の「Ads review (Opus · Fable · Codex)」の「広告の一覧」に貼る
//   または: node tools/google-ads-run.js --job serving --out ads-serving.md（API の認証情報があるとき）
//   書き出すもの: 有効なキャンペーン（直近30日の数字）・広告（見出し・説明文・リンク先・有効性・審査）・
//                P-MAX のアセットグループの中身・サイトリンクなどのアセット・キーワード
//   お客様IDは書き出さない（一覧は公開の場所に貼ることがあるため）

const report = { done: [], skipped: [], failed: [], text: '' };
const out = [];
function main() {
  const tz = typeof AdsApp.currentAccount().getTimeZone === 'function' ? AdsApp.currentAccount().getTimeZone() : 'Asia/Tokyo';
  const today = typeof Utilities.formatDate === 'function' ? Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') : new Date().toISOString().slice(0, 10);
  out.push('# 配信中の広告一覧（Google広告・近藤米穀店 らいすぴあ）', '', '- 取得：' + today + '（Google広告スクリプト tools/google-ads-serving-2026-10.js）',
    '- 対象：状態が「有効」のキャンペーン・広告グループ・広告・アセットだけ。数字は直近30日', '');
  section('キャンペーン', campaigns);
  section('検索・ディスプレイ・デマンド ジェネレーションの広告', ads);
  section('P-MAX のアセットグループ', assetGroups);
  section('キャンペーン・アカウントに付いているアセット（サイトリンク・コールアウトなど）', extensions);
  section('キーワード', keywords);
  report.text = out.join('\n') + '\n';
  Logger.log(report.text);
  if (report.failed.length) Logger.log('読めなかった:\n  ' + report.failed.join('\n  '));
}
// 一つの節で失敗しても、ほかの節は書き出す
function section(title, fn) {
  out.push('## ' + title, '');
  try { fn(); } catch (e) { report.failed.push(title + ' … ' + e.message); out.push('（読めなかった：' + e.message + '）'); }
  out.push('');
}
function rows(query) { const r = [], it = AdsApp.search(query); while (it.hasNext()) r.push(it.next()); return r; }
function width(s) { let w = 0; for (const c of String(s)) w += /[\u0000-ÿ｡-ﾟ]/.test(c) ? 1 : 2; return w; }
function yen(micros) { return '¥' + Math.round(Number(micros || 0) / 1e6).toLocaleString('en-US'); }
function num(x) { return Math.round(Number(x || 0) * 10) / 10; }
function texts(list, limit) { return (list || []).map(a => a.text + '（' + width(a.text) + '/' + limit + (a.pinnedField ? '・' + a.pinnedField : '') + '）'); }
function metricsBy(query, key) {
  const m = {};
  rows(query).forEach(r => { m[key(r)] = r.metrics || {}; });
  return m;
}
function stat(m) {
  if (!m) return '表示0';
  return '表示' + (m.impressions || 0) + '・クリック' + (m.clicks || 0) + '・' + yen(m.costMicros) + '・CV' + num(m.conversions);
}
const LIVE = "campaign.status = 'ENABLED'";

function campaigns() {
  const m = metricsBy('SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE ' + LIVE +
    ' AND segments.date DURING LAST_30_DAYS', r => r.campaign.id);
  out.push('| キャンペーン | 種類 | 配信 | 入札 | 30日 |', '|---|---|---|---|---|');
  rows('SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.serving_status, campaign.bidding_strategy_type FROM campaign WHERE ' + LIVE)
    .forEach(r => { const c = r.campaign; out.push('| ' + [c.name, c.advertisingChannelType, c.servingStatus, c.biddingStrategyType, stat(m[c.id])].join(' | ') + ' |'); });
}

function ads() {
  const where = ' WHERE ' + LIVE + " AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'";
  const m = metricsBy('SELECT ad_group_ad.ad.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad' + where +
    ' AND segments.date DURING LAST_30_DAYS', r => r.adGroupAd.ad.id);
  const base = 'campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status';
  const kinds = [
    ['RESPONSIVE_SEARCH_AD', 'ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2',
      a => { const x = a.responsiveSearchAd || {}; return [['見出し', texts(x.headlines, 30)], ['説明文', texts(x.descriptions, 90)], ['表示URLのパス', [x.path1, x.path2].filter(Boolean)]]; }],
    ['RESPONSIVE_DISPLAY_AD', 'ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline, ad_group_ad.ad.responsive_display_ad.descriptions, ad_group_ad.ad.responsive_display_ad.business_name',
      a => { const x = a.responsiveDisplayAd || {}; return [['見出し', texts(x.headlines, 30)], ['長い見出し', texts(x.longHeadline ? [x.longHeadline] : [], 90)], ['説明文', texts(x.descriptions, 90)], ['ビジネス名', [x.businessName].filter(Boolean)]]; }],
    ['DEMAND_GEN_MULTI_ASSET_AD', 'ad_group_ad.ad.demand_gen_multi_asset_ad.headlines, ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions, ad_group_ad.ad.demand_gen_multi_asset_ad.business_name',
      a => { const x = a.demandGenMultiAssetAd || {}; return [['見出し', texts(x.headlines, 30)], ['説明文', texts(x.descriptions, 90)], ['ビジネス名', [x.businessName].filter(Boolean)]]; }],
  ];
  let n = 0;
  kinds.forEach(([type, fields, body]) => {
    let list;
    try { list = rows('SELECT ' + base + ', ' + fields + ' FROM ad_group_ad' + where + " AND ad_group_ad.ad.type = '" + type + "'"); }
    catch (e) { report.failed.push(type + ' … ' + e.message); out.push('（' + type + ' を読めなかった：' + e.message + '）', ''); return; }
    list.forEach(r => {
      n++;
      const a = r.adGroupAd.ad;
      out.push('### ' + r.campaign.name + ' / ' + r.adGroup.name + '（' + type + '）', '',
        '- 有効性 ' + (r.adGroupAd.adStrength || '-') + '・審査 ' + ((r.adGroupAd.policySummary || {}).approvalStatus || '-') + '・30日 ' + stat(m[a.id]),
        '- リンク先：' + (a.finalUrls || []).join(' '));
      body(a).forEach(([label, list2]) => { if (list2.length) out.push('- ' + label + '：' + list2.join('／')); });
      out.push('');
    });
  });
  // ほかの種類の広告は、種類と数だけ
  rows('SELECT ad_group_ad.ad.type, campaign.name FROM ad_group_ad' + where).forEach(r => {
    if (!kinds.some(k => k[0] === r.adGroupAd.ad.type)) { n++; out.push('- ' + r.campaign.name + '：' + r.adGroupAd.ad.type + '（中身は書き出していない）'); }
  });
  if (!n) out.push('（なし）');
}

function assetGroups() {
  const live = ' WHERE ' + LIVE + " AND asset_group.status = 'ENABLED'";
  const groups = rows('SELECT campaign.name, asset_group.id, asset_group.name, asset_group.ad_strength, asset_group.final_urls FROM asset_group' + live);
  if (!groups.length) { out.push('（なし）'); return; }
  const assets = rows('SELECT asset_group.id, asset_group_asset.field_type, asset.id, asset.type, asset.name, asset.text_asset.text, ' +
    'asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels, asset.youtube_video_asset.youtube_video_id FROM asset_group_asset' +
    live + " AND asset_group_asset.status = 'ENABLED'");
  const LIM = { HEADLINE: 30, LONG_HEADLINE: 90, DESCRIPTION: 90, BUSINESS_NAME: 25 };
  groups.forEach(g => {
    const ag = g.assetGroup;
    out.push('### ' + g.campaign.name + ' / ' + ag.name, '', '- 有効性 ' + (ag.adStrength || '-') + '・リンク先：' + (ag.finalUrls || []).join(' '));
    const by = {};
    assets.filter(r => r.assetGroup.id === ag.id).forEach(r => {
      const f = r.assetGroupAsset.fieldType, a = r.asset;
      let s;
      if (a.textAsset) s = a.textAsset.text + (LIM[f] ? '（' + width(a.textAsset.text) + '/' + (f === 'DESCRIPTION' && width(a.textAsset.text) <= 60 ? '60・90' : LIM[f]) + '）' : '');
      else if (a.imageAsset) s = (a.name || 'id' + a.id) + '（' + ((a.imageAsset.fullSize || {}).widthPixels || '?') + '×' + ((a.imageAsset.fullSize || {}).heightPixels || '?') + '）';
      else if (a.youtubeVideoAsset) s = 'YouTube ' + a.youtubeVideoAsset.youtubeVideoId;
      else s = a.type + ' id' + a.id;
      (by[f] = by[f] || []).push(s);
    });
    Object.keys(by).sort().forEach(f => out.push('- ' + f + '（' + by[f].length + '）：' + by[f].join('／')));
    out.push('');
  });
}

function extensions() {
  const fields = 'asset.id, asset.type, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, ' +
    'asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, asset.call_asset.phone_number';
  function describe(a) {
    if (a.sitelinkAsset) return 'サイトリンク「' + a.sitelinkAsset.linkText + '」' + [a.sitelinkAsset.description1, a.sitelinkAsset.description2].filter(Boolean).map(s => '／' + s).join('') + ' → ' + (a.finalUrls || []).join(' ');
    if (a.calloutAsset) return 'コールアウト「' + a.calloutAsset.calloutText + '」';
    if (a.structuredSnippetAsset) return '構造化スニペット ' + a.structuredSnippetAsset.header + '：' + (a.structuredSnippetAsset.values || []).join('、');
    if (a.callAsset) return '電話';   // 番号は書かない
    return a.type;
  }
  const m = metricsBy('SELECT campaign.id, asset.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign_asset WHERE ' + LIVE +
    " AND campaign_asset.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS", r => r.campaign.id + '/' + r.asset.id);
  const byCamp = {};
  rows('SELECT campaign.id, campaign.name, ' + fields + ' FROM campaign_asset WHERE ' + LIVE + " AND campaign_asset.status = 'ENABLED'")
    .forEach(r => (byCamp[r.campaign.name] = byCamp[r.campaign.name] || []).push(describe(r.asset) + '（' + stat(m[r.campaign.id + '/' + r.asset.id]) + '）'));
  rows('SELECT campaign.name FROM campaign WHERE ' + LIVE).forEach(r => { byCamp[r.campaign.name] = byCamp[r.campaign.name] || []; });
  Object.keys(byCamp).forEach(c => out.push('- ' + c + '：' + (byCamp[c].join('／') || 'なし')));
  const acct = rows('SELECT ' + fields + " FROM customer_asset WHERE customer_asset.status = 'ENABLED'").map(r => describe(r.asset));
  out.push('- アカウント全体：' + (acct.join('／') || 'なし'));
  const ag = rows('SELECT campaign.name, ad_group.name, ' + fields + ' FROM ad_group_asset WHERE ' + LIVE + " AND ad_group.status = 'ENABLED' AND ad_group_asset.status = 'ENABLED'")
    .map(r => r.campaign.name + ' / ' + r.adGroup.name + '：' + describe(r.asset));
  if (ag.length) out.push('- 広告グループ：' + ag.join('／'));
}

function keywords() {
  const m = metricsBy('SELECT ad_group_criterion.criterion_id, ad_group.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ' + LIVE +
    " AND ad_group.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS", r => r.adGroup.id + '/' + r.adGroupCriterion.criterionId);
  const list = rows('SELECT campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative ' +
    'FROM ad_group_criterion WHERE ' + LIVE + " AND ad_group.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.type = 'KEYWORD'");
  const neg = rows('SELECT campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE ' + LIVE +
    " AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE");
  if (!list.length && !neg.length) { out.push('（なし）'); return; }
  const byGroup = {};
  list.forEach(r => {
    const k = r.adGroupCriterion;
    (byGroup[r.campaign.name + ' / ' + r.adGroup.name] = byGroup[r.campaign.name + ' / ' + r.adGroup.name] || [])
      .push((k.negative ? '除外 ' : '') + k.keyword.text + '［' + k.keyword.matchType + '］' + (k.negative ? '' : '（' + stat(m[r.adGroup.id + '/' + k.criterionId]) + '）'));
  });
  Object.keys(byGroup).forEach(g => out.push('- ' + g + '：' + byGroup[g].join('／')));
  const negBy = {};
  neg.forEach(r => (negBy[r.campaign.name] = negBy[r.campaign.name] || []).push(r.campaignCriterion.keyword.text + '［' + r.campaignCriterion.keyword.matchType + '］'));
  Object.keys(negBy).forEach(c => out.push('- ' + c + ' の除外キーワード：' + negBy[c].join('、')));
}
if (typeof module !== 'undefined') module.exports = { main, _report: report };

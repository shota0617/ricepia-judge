// らいすぴあ Google広告：docs/google-ads-review-2026-10.md の改善を、アカウントに反映する Google広告スクリプト。
//   使い方: Google広告 → ツールと設定 → 一括操作 → スクリプト → ＋ → このファイルの中身を全部貼り付け
//          → 承認 →「プレビュー」（変更されない試し実行）→ ログを確認 →「実行」
//   段階: 第1週は STEP1 だけ true で実行。1週間後に STEP2 を true（STEP1 は false）にして、もう一度実行する。
//   何度実行しても同じ結果になるように作ってある（もう直っている所は飛ばす）。
//   価格入りの文・「雨の日も」・入札戦略・予算・地域の半径は、お店の確認が要るので、このスクリプトでは変えない。

const CONFIG = {
  STEP1_COPY_AND_ASSETS: true,  // 第1週：広告文の差し替え、新米２のアセット・除外キーワード・地域の設定
  STEP2_LINE_GOALS: false,      // 第2週：入札に使う成果を「LINE友だち追加クリック」だけにする
  PMAX_CAMPAIGN: '西尾の米屋 らいすぴあ #2',
  SEARCH_CAMPAIGN: '新米２',
};

// P-MAX アセットグループ1：夏向けの文と重複を差し替える（5-1）
const PMAX_AG1 = 'アセット グループ 1';
const PMAX_AG1_REPLACE = [
  { field: 'HEADLINE', from: '車に乗ったまま涼しくお米受取', to: '車に乗ったままお米を受取' },
  { field: 'LONG_HEADLINE', from: '当日精米のできたてを、降りずに受け取れる。夏の買い出しがラクになる米屋です', to: '当日精米のできたてを、車を降りずに受け取れる。重いお米の買い出しがラクになる米屋です' },
  { field: 'LONG_HEADLINE', from: '車に乗ったままで涼しく。お米のドライブスルーは西尾の米屋・翔米', to: '寒い日も車に乗ったまま。お米のドライブスルーは西尾の米屋・らいすぴあ' },
  { field: 'LONG_HEADLINE', from: '西尾の米屋 らいすぴあ', to: '一年360日毎日精米。精米したてのお米を西尾の米屋・らいすぴあから' },
  { field: 'DESCRIPTION', from: '車に乗ったまま涼しくお米を受取。西尾の米屋・翔米です。', to: '寒い日も、車に乗ったままお米を受け取れます。西尾の米屋・らいすぴあです。' },
  { field: 'BUSINESS_NAME', from: 'らいすぴあ・秀幸', to: '近藤米穀店 らいすぴあ' },
];
// P-MAX 新米産地レポート：説明文を足す（5-2）
const PMAX_SHINMAI = '新米産地レポート';
const PMAX_SHINMAI_ADD = [
  { field: 'DESCRIPTION', text: '新米は15℃の大型低温倉庫で保管。必要な分だけ、毎日精米してお渡しします。' },
  { field: 'DESCRIPTION', text: '重いお米は車まで積み込みます。西尾・安城・岡崎・碧南からも通いやすい米屋です。' },
];
// 新米２（検索）のレスポンシブ検索広告（5-3）。説明文は先頭の一致で探す
const RSA_HEADLINES = {
  '新米予約・入荷速報公開中': '2026年産 新米 販売中',
  '新米シーズン到来': '愛知の新米 のどか販売中',
  '米30kgまとめ買いも安い': '米30kgのまとめ買いもOK',
};
const RSA_DESCRIPTIONS = [
  { startsWith: '新米の産地レポートと入荷速報を公開中', to: '2026年産の新米が入荷。のどか・ミルキークイーンを精米したてでお渡しします。' },
];
// 新米２の除外キーワード（4章）。1語の部分一致なので、その語を含む検索すべてで出なくなる
const SEARCH_NEGATIVES = ['通販', '送料無料', '楽天', 'amazon', 'アマゾン', 'ふるさと納税', 'コストコ', '業務スーパー',
  '相場', '推移', 'ニュース', '備蓄米', '高騰', 'なぜ', '炊き方', '保存方法', '求人', 'バイト', '業務用', '卸', '飲食店'];
// P-MAX #2 から新米２にも付けるアセットの種類
const SHARE_ASSET_FIELDS = ['SITELINK', 'CALL'];
// 入札に使う成果として残すもの（STEP2）。これ以外の目標は「入札に使わない」にする
const KEEP_GOAL = { category: 'SIGNUP', origin: 'WEBSITE', actionName: /LINE/ };

const LIMITS = { HEADLINE: 30, LONG_HEADLINE: 90, DESCRIPTION: 90, BUSINESS_NAME: 25 };
const report = { done: [], skipped: [], failed: [] };
let CID = '';

function main() {
  CID = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  Logger.log((AdsApp.getExecutionInfo().isPreview() ? '【プレビュー：変更はされません】' : '【実行：アカウントを変更します】') + ' お客様ID ' + CID);
  checkLengths();
  const pmax = findCampaign(CONFIG.PMAX_CAMPAIGN, 'PERFORMANCE_MAX');
  const search = findCampaign(CONFIG.SEARCH_CAMPAIGN, 'SEARCH');
  if (CONFIG.STEP1_COPY_AND_ASSETS) {
    if (pmax) {
      const ag1 = findAssetGroup(pmax, PMAX_AG1);
      if (ag1) PMAX_AG1_REPLACE.forEach(r => replaceAssetGroupText(ag1, r));
      const shinmai = findAssetGroup(pmax, PMAX_SHINMAI);
      if (shinmai) PMAX_SHINMAI_ADD.forEach(a => addAssetGroupText(shinmai, a));
    }
    if (search) {
      updateSearchAds(search);
      if (pmax) shareCampaignAssets(pmax, search);
      addNegatives(search);
      setPresenceOnly(search);
    }
  }
  if (CONFIG.STEP2_LINE_GOALS) {
    // アカウントの目標が LINE だけになったときに限って、P-MAX をアカウントの目標に切り替える
    if (setLineOnlyGoals() && pmax) useAccountGoals(pmax);
  }
  Logger.log('\n===== 結果 =====');
  Logger.log('反映 ' + report.done.length + ' 件\n  ' + report.done.join('\n  '));
  Logger.log('飛ばした ' + report.skipped.length + ' 件\n  ' + report.skipped.join('\n  '));
  Logger.log('失敗 ' + report.failed.length + ' 件\n  ' + report.failed.join('\n  '));
  if (report.failed.length) Logger.log('失敗した項目は、管理画面で手で直してください（docs/google-ads-review-2026-10.md の5章）。');
}

// ---- 共通 ----
function width(s) { let w = 0; for (const c of s) w += /[\u0000-ÿ｡-ﾟ]/.test(c) ? 1 : 2; return w; }
function checkLengths() {
  const all = PMAX_AG1_REPLACE.map(r => [r.field, r.to]).concat(PMAX_SHINMAI_ADD.map(a => [a.field, a.text]),
    Object.keys(RSA_HEADLINES).map(k => ['HEADLINE', RSA_HEADLINES[k]]), RSA_DESCRIPTIONS.map(d => ['DESCRIPTION', d.to]));
  all.forEach(([f, t]) => { if (width(t) > LIMITS[f]) throw new Error('文字数オーバー（' + f + ' ' + width(t) + '/' + LIMITS[f] + '）: ' + t); });
}
function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function rows(query) { const out = [], it = AdsApp.search(query); while (it.hasNext()) out.push(it.next()); return out; }
// 1回分の変更をまとめて送る（全部成功するか、全部やめるか）
function apply(label, ops) {
  if (!ops.length) return true;
  const results = AdsApp.mutateAll(ops, { partialFailure: false });
  const errs = [];
  results.forEach(r => { if (!r.isSuccessful()) errs.push.apply(errs, r.getErrorMessages()); });
  if (errs.length) { report.failed.push(label + ' … ' + errs.join(' / ')); return false; }
  report.done.push(label);
  return true;
}
function findCampaign(name, type) {
  const r = rows('SELECT campaign.id, campaign.resource_name, campaign.advertising_channel_type FROM campaign ' +
    'WHERE campaign.name = ' + q(name) + " AND campaign.status != 'REMOVED'");
  if (r.length !== 1 || r[0].campaign.advertisingChannelType !== type) {
    report.failed.push('キャンペーン「' + name + '」が見つからない（' + r.length + '件）'); return null;
  }
  return { id: r[0].campaign.id, rn: r[0].campaign.resourceName, name: name };
}
function findAssetGroup(camp, name) {
  const r = rows('SELECT asset_group.id, asset_group.resource_name FROM asset_group WHERE campaign.id = ' + camp.id +
    ' AND asset_group.name = ' + q(name) + " AND asset_group.status != 'REMOVED'");
  if (r.length !== 1) { report.failed.push('アセットグループ「' + name + '」が見つからない（' + r.length + '件）'); return null; }
  return { id: r[0].assetGroup.id, rn: r[0].assetGroup.resourceName, name: camp.name + ' / ' + name };
}
function groupTexts(ag) {
  return rows('SELECT asset_group_asset.resource_name, asset_group_asset.field_type, asset.resource_name, asset.text_asset.text ' +
    'FROM asset_group_asset WHERE asset_group.id = ' + ag.id + " AND asset_group_asset.status != 'REMOVED' AND asset.type = 'TEXT'")
    .map(r => ({ rn: r.assetGroupAsset.resourceName, field: r.assetGroupAsset.fieldType, asset: r.asset.resourceName, text: r.asset.textAsset.text }));
}
// 同じ文のテキストアセットがあれば使い回し、なければ作る操作を足す
let tempId = -1;
function textAssetFor(text, ops) {
  const r = rows("SELECT asset.resource_name FROM asset WHERE asset.type = 'TEXT' AND asset.text_asset.text = " + q(text));
  if (r.length) return r[0].asset.resourceName;
  const rn = 'customers/' + CID + '/assets/' + (tempId--);
  ops.push({ assetOperation: { create: { resourceName: rn, textAsset: { text: text } } } });
  return rn;
}
function linkOp(ag, assetRn, field) { return { assetGroupAssetOperation: { create: { assetGroup: ag.rn, asset: assetRn, fieldType: field } } }; }

// ---- STEP1 ----
function replaceAssetGroupText(ag, r) {
  const label = ag.name + ' ' + r.field + '「' + r.from + '」→「' + r.to + '」';
  const cur = groupTexts(ag);
  const old = cur.find(a => a.field === r.field && a.text === r.from);
  const already = cur.some(a => a.field === r.field && a.text === r.to);
  if (!old) { report.skipped.push(label + '（元の文がもう無い）'); return; }
  const ops = [];
  // ビジネス名は1つしか付けられないので、先に外してから付ける。ほかは最低本数を割らないよう、先に付けてから外す
  const remove = { assetGroupAssetOperation: { remove: old.rn } };
  if (r.field === 'BUSINESS_NAME') ops.push(remove);
  if (!already) { const rn = textAssetFor(r.to, ops); ops.push(linkOp(ag, rn, r.field)); }
  if (r.field !== 'BUSINESS_NAME') ops.push(remove);
  // P-MAX は60文字（全角30字）以内の短い説明文が最低1本いる。差し替え後もそれが残るかを確かめる
  if (r.field === 'DESCRIPTION') {
    const after = cur.filter(a => a.field === 'DESCRIPTION' && a !== old).map(a => a.text).concat(already ? [] : [r.to]);
    if (!after.some(t => width(t) <= 60)) { report.failed.push(label + ' … 60文字以内の短い説明文が無くなるので中止'); return; }
  }
  apply(label, ops);
}
function addAssetGroupText(ag, a) {
  const label = ag.name + ' ' + a.field + ' 追加「' + a.text + '」';
  const cur = groupTexts(ag);
  if (cur.some(x => x.field === a.field && x.text === a.text)) { report.skipped.push(label + '（もう入っている）'); return; }
  if (a.field === 'DESCRIPTION' && cur.filter(x => x.field === 'DESCRIPTION').length >= 5) { report.skipped.push(label + '（説明文が上限の5本）'); return; }
  const ops = []; const rn = textAssetFor(a.text, ops); ops.push(linkOp(ag, rn, a.field));
  apply(label, ops);
}
function updateSearchAds(camp) {
  const ads = rows('SELECT ad_group_ad.ad.resource_name, ad_group_ad.ad.id, ad_group_ad.ad.responsive_search_ad.headlines, ' +
    'ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE campaign.id = ' + camp.id +
    " AND ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'");
  if (!ads.length) { report.skipped.push(camp.name + '：レスポンシブ検索広告が無い'); return; }
  ads.forEach(row => {
    const ad = row.adGroupAd.ad, rsa = ad.responsiveSearchAd || {};
    const changes = [];
    const keep = p => (p.pinnedField ? { pinnedField: p.pinnedField } : {});
    const heads = (rsa.headlines || []).map(h => {
      const to = RSA_HEADLINES[h.text];
      if (to) { changes.push('見出し「' + h.text + '」→「' + to + '」'); return Object.assign({ text: to }, keep(h)); }
      return Object.assign({ text: h.text }, keep(h));
    });
    const descs = (rsa.descriptions || []).map(d => {
      const hit = RSA_DESCRIPTIONS.find(x => d.text.indexOf(x.startsWith) === 0);
      if (hit) { changes.push('説明文「' + d.text + '」→「' + hit.to + '」'); return Object.assign({ text: hit.to }, keep(d)); }
      return Object.assign({ text: d.text }, keep(d));
    });
    const label = camp.name + ' 広告' + ad.id + '：' + changes.join('、');
    const texts = heads.map(h => h.text);
    if (!changes.length) { report.skipped.push(camp.name + ' 広告' + ad.id + '（差し替える文がもう無い）'); return; }
    if (new Set(texts).size !== texts.length) { report.failed.push(label + ' … 見出しが重複するので中止'); return; }
    apply(label, [{ adOperation: {
      update: { resourceName: ad.resourceName, responsiveSearchAd: { headlines: heads, descriptions: descs } },
      updateMask: 'responsiveSearchAd.headlines,responsiveSearchAd.descriptions' } }]);
  });
}
function campaignAssets(camp) {
  return rows('SELECT campaign_asset.asset, campaign_asset.field_type FROM campaign_asset WHERE campaign.id = ' + camp.id +
    " AND campaign_asset.status != 'REMOVED'").map(r => ({ asset: r.campaignAsset.asset, field: r.campaignAsset.fieldType }));
}
function shareCampaignAssets(from, to) {
  const have = new Set(campaignAssets(to).map(a => a.field + ' ' + a.asset));
  const ops = campaignAssets(from)
    .filter(a => SHARE_ASSET_FIELDS.indexOf(a.field) >= 0 && !have.has(a.field + ' ' + a.asset))
    .map(a => ({ campaignAssetOperation: { create: { campaign: to.rn, asset: a.asset, fieldType: a.field } } }));
  if (!ops.length) { report.skipped.push(to.name + '：サイトリンク・電話（もう付いている）'); return; }
  apply(to.name + '：' + from.name + ' のサイトリンク・電話を ' + ops.length + ' 件付ける', ops);
}
function addNegatives(camp) {
  const have = new Set(rows('SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = ' + camp.id +
    " AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.status != 'REMOVED'")
    .map(r => r.campaignCriterion.keyword.text.toLowerCase()));
  const add = SEARCH_NEGATIVES.filter(w => !have.has(w.toLowerCase()));
  if (!add.length) { report.skipped.push(camp.name + '：除外キーワード（もう全部ある）'); return; }
  apply(camp.name + '：除外キーワード ' + add.length + ' 語（' + add.join('、') + '）', add.map(w => ({ campaignCriterionOperation: {
    create: { campaign: camp.rn, negative: true, keyword: { text: w, matchType: 'BROAD' } } } })));
}
function setPresenceOnly(camp) {
  const r = rows('SELECT campaign.geo_target_type_setting.positive_geo_target_type FROM campaign WHERE campaign.id = ' + camp.id);
  const cur = r.length && r[0].campaign.geoTargetTypeSetting ? r[0].campaign.geoTargetTypeSetting.positiveGeoTargetType : '';
  if (cur === 'PRESENCE') { report.skipped.push(camp.name + '：地域は「所在地にいるユーザー」（もう設定済み）'); return; }
  apply(camp.name + '：地域を「所在地にいるユーザー」だけにする（' + (cur || '不明') + ' → PRESENCE）', [{ campaignOperation: {
    update: { resourceName: camp.rn, geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' } },
    updateMask: 'geoTargetTypeSetting.positiveGeoTargetType' } }]);
}

// ---- STEP2 ----
function setLineOnlyGoals() {
  // 「登録・ウェブサイト」の目標には、同じ種類のアクションが全部入る。LINE 以外のメインのアクションがあれば止める
  const actions = rows("SELECT conversion_action.name, conversion_action.primary_for_goal FROM conversion_action " +
    "WHERE conversion_action.status = 'ENABLED' AND conversion_action.category = " + q(KEEP_GOAL.category) +
    ' AND conversion_action.origin = ' + q(KEEP_GOAL.origin)).map(r => r.conversionAction).filter(a => a.primaryForGoal);
  const others = actions.filter(a => !KEEP_GOAL.actionName.test(a.name));
  if (!actions.some(a => KEEP_GOAL.actionName.test(a.name)) || others.length) {
    report.failed.push('登録・ウェブサイトの目標に LINE 以外のアクションがある（' + others.map(a => a.name).join('、') +
      '）、または LINE のアクションが無いので、目標は変えずに中止。管理画面で確認してください'); return false;
  }
  const goals = rows('SELECT customer_conversion_goal.resource_name, customer_conversion_goal.category, ' +
    'customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal')
    .map(r => r.customerConversionGoal);
  const keep = goals.find(g => g.category === KEEP_GOAL.category && g.origin === KEEP_GOAL.origin);
  if (!keep) { report.failed.push('LINE（登録・ウェブサイト）の目標が見つからないので、目標は変えずに中止'); return false; }
  const ops = [];
  goals.forEach(g => {
    const want = g === keep;
    if (!!g.biddable !== want) ops.push({ customerConversionGoalOperation: {
      update: { resourceName: g.resourceName, biddable: want }, updateMask: 'biddable' } });
  });
  if (!ops.length) { report.skipped.push('アカウントの目標（もう LINE だけ）'); return true; }
  return apply('アカウントの目標を LINE だけにする（' + goals.filter(g => g !== keep && g.biddable)
    .map(g => g.category + '/' + g.origin).join('、') + ' を入札に使わない）', ops);
}
function useAccountGoals(camp) {
  const r = rows('SELECT conversion_goal_campaign_config.resource_name, conversion_goal_campaign_config.goal_config_level ' +
    'FROM conversion_goal_campaign_config WHERE campaign.id = ' + camp.id);
  if (!r.length) { report.failed.push(camp.name + '：目標の設定が取れない'); return; }
  const cfg = r[0].conversionGoalCampaignConfig;
  if (cfg.goalConfigLevel === 'CUSTOMER') { report.skipped.push(camp.name + '：もうアカウントの目標を使用'); return; }
  apply(camp.name + '：キャンペーン独自の目標をやめ、アカウントの目標を使う', [{ conversionGoalCampaignConfigOperation: {
    update: { resourceName: cfg.resourceName, goalConfigLevel: 'CUSTOMER' }, updateMask: 'goalConfigLevel' } }]);
}

if (typeof module !== 'undefined') module.exports = { main, CONFIG, width, _report: report };

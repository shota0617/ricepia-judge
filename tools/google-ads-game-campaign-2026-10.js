// らいすぴあ Google広告：にしおさんぽGO（go.ricepia.jp）専用のキャンペーンを作る Google広告スクリプト（docs/ads-game-kit.md の3章）。
//   使い方: Google広告 → ツールと設定 → 一括操作 → スクリプト → ＋ → このファイルの中身を全部貼り付け
//          → 承認 →「プレビュー」（変更されない試し実行）→ ログを確認 →「実行」
//   または: node tools/google-ads-run.js --job game-campaign（検証だけ）／ --job game-campaign --apply（反映）
//   すること（何度実行しても同じ結果。もうある所は飛ばす）:
//     1) コンバージョン「にしおさんぽGO ゲーム開始」（ウェブサイト・エンゲージメント）を作る。
//        アカウントの目標の「エンゲージメント（ウェブサイト）」は入札に使わない（いまのキャンペーンは LINE 重視のまま）
//     2) デマンド ジェネレーション（YouTube・Discover・Gmail）のキャンペーンを、一時停止の状態で作る
//        予算 1日 CONFIG.DAILY_BUDGET_YEN 円・コンバージョン数の最大化・遊べる7市町・日本語・画像は mkt/nishio-go/ と nishio-go/icon-512.png
//     3) そのキャンペーンだけ、入札に使う成果を「ゲーム開始」にする
//     4) ゲームに入れるコンバージョンラベルをログに出す（nishio-go/analytics.js の CFG.adsGameStart に入れる）
//   配信は始めない。ラベルをゲームに入れてから、管理画面でキャンペーンを「有効」にする。いまのキャンペーンは変えない。

const CONFIG = {
  CAMPAIGN: 'にしおさんぽGO ゲーム',
  DAILY_BUDGET_YEN: 1000,
  CONVERSION: 'にしおさんぽGO ゲーム開始',
  FINAL_URL: 'https://go.ricepia.jp/?utm_source=google&utm_medium=cpc&utm_campaign=game_demandgen&play=1',
  IMAGE_BASE: 'https://go.ricepia.jp/',
  // 遊べる市町（nishio-go/region.js の cities）。地域の名前は英語（canonical_name の先頭）
  CITIES: ['Nishio', 'Okazaki', 'Anjo', 'Hekinan', 'Kota', 'Gamagori', 'Takahama'],
  LANGUAGE: 'languageConstants/1005', // 日本語
};
// 画像（tools/make-promo.js が作る広告画像と、ゲームのアイコン）
const IMAGES = [
  { field: 'marketingImages', path: 'mkt/nishio-go/ad-1200x628.png', name: 'にしおさんぽGO 横長 1200x628' },
  { field: 'squareMarketingImages', path: 'mkt/nishio-go/ad-1200x1200.png', name: 'にしおさんぽGO 正方形 1200x1200' },
  { field: 'portraitMarketingImages', path: 'mkt/nishio-go/ad-960x1200.png', name: 'にしおさんぽGO 縦長 960x1200' },
  { field: 'logoImages', path: 'nishio-go/icon-512.png', name: 'にしおさんぽGO アイコン 512x512' },
];
// 文は docs/ads-game-kit.md の1章（無料・登録なしは本当）
// いまのゲーム（スマホを傾けて お米を転がす、西尾の地図の めいろ）に合わせた 文（2026-10。前の「歩くゲーム・おまかせ歩き」は もう ない）
const HEADLINES = ['傾けて転がす西尾の迷路', '西尾の米屋がつくったゲーム', 'お米ころころ迷路ゲーム', '登録なしですぐ遊べる', '名所から名所へころころ'];
const DESCRIPTIONS = [
  'スマホを傾けて、お米を転がす。西尾の地図ぜんぶが、本物の道でできた迷路に。',
  '西尾のお米屋さんがつくった、お米を転がす迷路ゲーム。無料・登録なし',
  'ゴールは西尾の名所。まちの人の話で、次のゴールが決まる。スマホですぐ遊べる。',
];
const BUSINESS_NAME = '近藤米穀店 らいすぴあ';
const GOAL = { category: 'ENGAGEMENT', origin: 'WEBSITE' };
const LIMITS = { headline: 30, description: 90, businessName: 25 };

const report = { done: [], skipped: [], failed: [] };
let CID = '', PREVIEW = true;
function main() {
  CID = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  PREVIEW = AdsApp.getExecutionInfo().isPreview();
  Logger.log((PREVIEW ? '【プレビュー：変更はされません】' : '【実行：アカウントを変更します】') + ' お客様ID ' + CID);
  checkLengths();
  const action = conversionAction();
  if (action) keepAccountGoalsOff(action);
  let camp = findCampaign();
  if (!camp && createCampaign()) camp = findCampaign();
  if (camp && action) useGameGoal(camp);
  if (action) logLabel(action);
  Logger.log('\n反映した:\n  ' + (report.done.join('\n  ') || 'なし'));
  Logger.log('飛ばした（もう済んでいる）:\n  ' + (report.skipped.join('\n  ') || 'なし'));
  Logger.log('できなかった:\n  ' + (report.failed.join('\n  ') || 'なし'));
}
function width(s) { let w = 0; for (const c of s) w += /[\u0000-ÿ｡-ﾟ]/.test(c) ? 1 : 2; return w; }
function checkLengths() {
  HEADLINES.map(t => [t, LIMITS.headline]).concat(DESCRIPTIONS.map(t => [t, LIMITS.description]), [[BUSINESS_NAME, LIMITS.businessName]])
    .forEach(([t, n]) => { if (width(t) > n) throw new Error('文字数オーバー（' + width(t) + '/' + n + '）: ' + t); });
}
function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function rows(query) { const out = [], it = AdsApp.search(query); while (it.hasNext()) out.push(it.next()); return out; }
function apply(label, ops) {
  const results = AdsApp.mutateAll(ops, { partialFailure: false });
  const errs = [];
  results.forEach(r => { if (!r.isSuccessful()) errs.push.apply(errs, r.getErrorMessages()); });
  if (errs.length) { report.failed.push(label + ' … ' + errs.join(' / ')); return null; }
  report.done.push(label);
  return results;
}

// 1) コンバージョン。プレビューでは作れないので null を返し、目標とラベルは「実行」のときにする
function findConversion() {
  const r = rows('SELECT conversion_action.id, conversion_action.resource_name FROM conversion_action ' +
    'WHERE conversion_action.name = ' + q(CONFIG.CONVERSION) + " AND conversion_action.status != 'REMOVED'");
  return r.length ? { id: r[0].conversionAction.id, rn: r[0].conversionAction.resourceName } : null;
}
function conversionAction() {
  const have = findConversion();
  if (have) { report.skipped.push('コンバージョン「' + CONFIG.CONVERSION + '」を作る（もうある）'); return have; }
  const res = apply('コンバージョン「' + CONFIG.CONVERSION + '」を作る（ウェブサイト・エンゲージメント・1クリックにつき1回）', [{ conversionActionOperation: { create: {
    name: CONFIG.CONVERSION, type: 'WEBPAGE', category: GOAL.category, status: 'ENABLED', countingType: 'ONE_PER_CLICK', primaryForGoal: true } } }]);
  return res && !PREVIEW ? findConversion() : null;
}
// 「エンゲージメント（ウェブサイト）」をアカウントの目標で入札に使うと、いまのキャンペーン（LINE 重視）にもゲーム開始が混ざるので、使わない
function keepAccountGoalsOff(action) {
  const g = rows('SELECT customer_conversion_goal.resource_name, customer_conversion_goal.biddable FROM customer_conversion_goal ' +
    'WHERE customer_conversion_goal.category = ' + q(GOAL.category) + ' AND customer_conversion_goal.origin = ' + q(GOAL.origin));
  if (!g.length) { report.failed.push('アカウントの目標「エンゲージメント（ウェブサイト）」が見つからない。管理画面で確認してください'); return; }
  if (!g[0].customerConversionGoal.biddable) { report.skipped.push('アカウントの目標「エンゲージメント（ウェブサイト）」は入札に使わない（もうそうなっている）'); return; }
  const others = rows('SELECT conversion_action.name FROM conversion_action WHERE conversion_action.category = ' + q(GOAL.category) +
    " AND conversion_action.origin = 'WEBSITE' AND conversion_action.status = 'ENABLED' AND conversion_action.primary_for_goal = TRUE")
    .map(r => r.conversionAction.name).filter(n => n !== CONFIG.CONVERSION);
  if (others.length) { report.failed.push('アカウントの目標「エンゲージメント（ウェブサイト）」に、ほかのアクション（' + others.join('、') + '）も入っていて入札に使われている。いまのキャンペーンが変わるので、変えずに中止'); return; }
  apply('アカウントの目標「エンゲージメント（ウェブサイト）」を入札に使わない（いまのキャンペーンは LINE 重視のまま）', [{ customerConversionGoalOperation: {
    update: { resourceName: g[0].customerConversionGoal.resourceName, biddable: false }, updateMask: 'biddable' } }]);
}

// 2) キャンペーン。予算・キャンペーン・画像・広告グループ・地域・言語・広告を、1回の変更でまとめて作る（どれか失敗したら何も作られない）
function findCampaign() {
  const r = rows('SELECT campaign.id, campaign.resource_name, campaign.advertising_channel_type, campaign.status FROM campaign ' +
    'WHERE campaign.name = ' + q(CONFIG.CAMPAIGN) + " AND campaign.status != 'REMOVED'");
  if (!r.length) return null;
  if (r[0].campaign.advertisingChannelType !== 'DEMAND_GEN') { report.failed.push('キャンペーン「' + CONFIG.CAMPAIGN + '」が別の種類（' + r[0].campaign.advertisingChannelType + '）でもうある'); return null; }
  return { id: r[0].campaign.id, rn: r[0].campaign.resourceName, status: r[0].campaign.status };
}
function geoTargets() {
  const all = rows("SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name FROM geo_target_constant " +
    "WHERE geo_target_constant.country_code = 'JP' AND geo_target_constant.canonical_name LIKE '%,Aichi,Japan' AND geo_target_constant.status = 'ENABLED'")
    .map(r => r.geoTargetConstant);
  const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const found = [], missing = [];
  CONFIG.CITIES.forEach(c => { const g = all.find(x => plain(x.name) === plain(c)); if (g) found.push(g); else missing.push(c); });
  if (missing.length) report.failed.push('地域が見つからない（' + missing.join('、') + '）。見つかった市町だけで作るので、あとで管理画面で足してください');
  return found;
}
function imageAssets(ops) {
  return IMAGES.map((img, i) => {
    const r = rows("SELECT asset.resource_name FROM asset WHERE asset.type = 'IMAGE' AND asset.name = " + q(img.name));
    if (r.length) { report.skipped.push('画像「' + img.name + '」を上げる（もうある）'); return r[0].asset.resourceName; }
    const rn = 'customers/' + CID + '/assets/-' + (21 + i);
    const data = Utilities.base64Encode(UrlFetchApp.fetch(CONFIG.IMAGE_BASE + img.path).getBlob().getBytes());
    ops.push({ assetOperation: { create: { resourceName: rn, name: img.name, imageAsset: { data: data } } } });
    return rn;
  });
}
function createCampaign() {
  const geos = geoTargets();
  if (!geos.some(g => g.name === 'Nishio')) { report.failed.push('西尾市の地域が見つからないので、キャンペーンは作らずに中止'); return false; }
  const ops = [], c = 'customers/' + CID;
  const imgs = imageAssets(ops);
  const budget = c + '/campaignBudgets/-11', camp = c + '/campaigns/-12', ag = c + '/adGroups/-13';
  ops.push({ campaignBudgetOperation: { create: { resourceName: budget, name: CONFIG.CAMPAIGN + ' 予算',
    amountMicros: String(CONFIG.DAILY_BUDGET_YEN * 1000000), deliveryMethod: 'STANDARD', explicitlyShared: false } } });
  ops.push({ campaignOperation: { create: { resourceName: camp, name: CONFIG.CAMPAIGN, advertisingChannelType: 'DEMAND_GEN', status: 'PAUSED',
    campaignBudget: budget, maximizeConversions: {}, containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING' } } });
  ops.push({ adGroupOperation: { create: { resourceName: ag, name: CONFIG.CAMPAIGN + ' 広告グループ', campaign: camp, status: 'ENABLED' } } });
  // デマンド ジェネレーションの地域と言語は広告グループに付ける
  geos.forEach(g => ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, location: { geoTargetConstant: g.resourceName } } } }));
  ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, language: { languageConstant: CONFIG.LANGUAGE } } } });
  const ad = { businessName: BUSINESS_NAME, headlines: HEADLINES.map(t => ({ text: t })), descriptions: DESCRIPTIONS.map(t => ({ text: t })) };
  IMAGES.forEach((img, i) => { (ad[img.field] = ad[img.field] || []).push({ asset: imgs[i] }); });
  ops.push({ adGroupAdOperation: { create: { adGroup: ag, status: 'ENABLED',
    ad: { name: CONFIG.CAMPAIGN + ' 画像広告', finalUrls: [CONFIG.FINAL_URL], demandGenMultiAssetAd: ad } } } });
  return !!apply('キャンペーン「' + CONFIG.CAMPAIGN + '」を一時停止で作る（デマンド ジェネレーション・1日 ' + CONFIG.DAILY_BUDGET_YEN + '円・コンバージョン数の最大化・' +
    geos.map(g => g.name).join('/') + '・日本語・画像 ' + IMAGES.length + ' 枚・見出し ' + HEADLINES.length + '・説明 ' + DESCRIPTIONS.length + '）', ops) && !PREVIEW;
}

// 3) このキャンペーンだけ、入札に使う成果を「エンゲージメント（ウェブサイト）」＝ゲーム開始にする
function useGameGoal(camp) {
  const goals = rows('SELECT campaign_conversion_goal.resource_name, campaign_conversion_goal.category, campaign_conversion_goal.origin, ' +
    'campaign_conversion_goal.biddable FROM campaign_conversion_goal WHERE campaign.id = ' + camp.id).map(r => r.campaignConversionGoal);
  if (!goals.some(g => g.category === GOAL.category && g.origin === GOAL.origin)) { report.failed.push(CONFIG.CAMPAIGN + '：目標「エンゲージメント（ウェブサイト）」が見つからない'); return; }
  const ops = [];
  goals.forEach(g => {
    const want = g.category === GOAL.category && g.origin === GOAL.origin;
    if (!!g.biddable !== want) ops.push({ campaignConversionGoalOperation: { update: { resourceName: g.resourceName, biddable: want }, updateMask: 'biddable' } });
  });
  const cfg = rows('SELECT conversion_goal_campaign_config.resource_name, conversion_goal_campaign_config.goal_config_level ' +
    'FROM conversion_goal_campaign_config WHERE campaign.id = ' + camp.id).map(r => r.conversionGoalCampaignConfig)[0];
  if (cfg && cfg.goalConfigLevel !== 'CAMPAIGN') ops.unshift({ conversionGoalCampaignConfigOperation: {
    update: { resourceName: cfg.resourceName, goalConfigLevel: 'CAMPAIGN' }, updateMask: 'goalConfigLevel' } });
  if (!ops.length) { report.skipped.push(CONFIG.CAMPAIGN + '：入札に使う成果は「ゲーム開始」だけ（もうそうなっている）'); return; }
  apply(CONFIG.CAMPAIGN + '：入札に使う成果を「ゲーム開始」（エンゲージメント・ウェブサイト）だけにする', ops);
}

// 4) ゲームに入れるラベル（send_to の「AW-…/」のあと）
function logLabel(action) {
  const r = rows('SELECT conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.id = ' + action.id);
  const snippets = (r.length && r[0].conversionAction.tagSnippets) || [];
  const m = snippets.map(s => /send_to'?\s*:\s*'(AW-[^'\/]+)\/([^']+)'/.exec(s.eventSnippet || '')).find(Boolean);
  if (!m) { report.failed.push('コンバージョンラベルが取れない。管理画面 → 目標 → コンバージョン →「' + CONFIG.CONVERSION + '」→ タグを設定する で確認してください'); return; }
  Logger.log('\n★ ゲームに入れるラベル: ' + m[2] + '（' + m[1] + '）\n  nishio-go/analytics.js の CFG.adsGameStart に入れてから、キャンペーンを「有効」にしてください');
}

if (typeof module !== 'undefined') module.exports = { main, CONFIG, width, _report: report };

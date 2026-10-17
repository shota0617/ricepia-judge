// らいすぴあ Google広告：にしおさんぽGO（go.ricepia.jp）を、いま出している広告に足す Google広告スクリプト（docs/ads-game-kit.md）。
//   使い方: Google広告 → ツールと設定 → 一括操作 → スクリプト → ＋ → このファイルの中身を全部貼り付け
//          → 承認 →「プレビュー」（変更されない試し実行）→ ログを確認 →「実行」
//   または: node tools/google-ads-run.js --job game（検証だけ）／ --job game --apply（反映）
//   すること（何度実行しても同じ結果。もう付いている所は飛ばす）:
//     1) サイトリンク「お散歩ゲーム（無料）」を作り、P-MAX #2 と 新米２ に付ける（リンク先は UTM 付きのゲーム）
//     2) コールアウト「お散歩ゲームも無料公開」を作り、同じ2つのキャンペーンに付ける
//   広告文・入札・予算・目標（LINE重視）は変えない。ゲームのページには LINE のコンバージョンが無いので、
//   ゲーム専用のアセットグループやキャンペーンは作らない（作るなら目標を決めてから。docs/ads-game-kit.md）。

const CONFIG = {
  CAMPAIGNS: [['西尾の米屋 らいすぴあ #2', 'PERFORMANCE_MAX'], ['新米２', 'SEARCH']],
  GAME_URL: 'https://go.ricepia.jp/?utm_source=google&utm_medium=cpc&utm_campaign=game_sitelink&play=1',
};
const SITELINK = { linkText: 'お散歩ゲーム（無料）', description1: '西尾の米屋がつくったゲーム', description2: '無料・登録なしですぐ遊べる' };
const CALLOUT = 'お散歩ゲームも無料公開';
const LIMITS = { linkText: 25, description: 35, callout: 25 };

const report = { done: [], skipped: [], failed: [] };
let CID = '';
function main() {
  CID = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  Logger.log((AdsApp.getExecutionInfo().isPreview() ? '【プレビュー：変更はされません】' : '【実行：アカウントを変更します】') + ' お客様ID ' + CID);
  checkLengths();
  const camps = CONFIG.CAMPAIGNS.map(([n, t]) => findCampaign(n, t)).filter(Boolean);
  if (camps.length) {
    const sl = sitelinkAsset();
    if (sl) camps.forEach(c => attach(c, sl, 'SITELINK', 'サイトリンク「' + SITELINK.linkText + '」'));
    const co = calloutAsset();
    if (co) camps.forEach(c => attach(c, co, 'CALLOUT', 'コールアウト「' + CALLOUT + '」'));
  }
  Logger.log('\n反映した:\n  ' + (report.done.join('\n  ') || 'なし'));
  Logger.log('飛ばした（もう済んでいる）:\n  ' + (report.skipped.join('\n  ') || 'なし'));
  Logger.log('できなかった:\n  ' + (report.failed.join('\n  ') || 'なし'));
}
function width(s) { let w = 0; for (const c of s) w += /[\u0000-ÿ｡-ﾟ]/.test(c) ? 1 : 2; return w; }
function checkLengths() {
  [[SITELINK.linkText, LIMITS.linkText], [SITELINK.description1, LIMITS.description], [SITELINK.description2, LIMITS.description], [CALLOUT, LIMITS.callout]]
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
function findCampaign(name, type) {
  const r = rows('SELECT campaign.id, campaign.resource_name, campaign.advertising_channel_type FROM campaign ' +
    'WHERE campaign.name = ' + q(name) + " AND campaign.status != 'REMOVED'");
  if (r.length !== 1 || r[0].campaign.advertisingChannelType !== type) { report.failed.push('キャンペーン「' + name + '」が見つからない（' + r.length + '件）'); return null; }
  return { id: r[0].campaign.id, rn: r[0].campaign.resourceName, name: name };
}
// 同じ文のアセットがあれば使い回し、なければ作る。プレビュー（検証だけ）では仮の名前を返す
function sitelinkAsset() {
  const r = rows("SELECT asset.resource_name, asset.final_urls FROM asset WHERE asset.type = 'SITELINK' AND asset.sitelink_asset.link_text = " + q(SITELINK.linkText));
  if (r.length) { report.skipped.push('サイトリンク「' + SITELINK.linkText + '」を作る（もうある）'); return r[0].asset.resourceName; }
  const rn = 'customers/' + CID + '/assets/-1';
  const res = apply('サイトリンク「' + SITELINK.linkText + '」を作る（' + CONFIG.GAME_URL + '）',
    [{ assetOperation: { create: { resourceName: rn, finalUrls: [CONFIG.GAME_URL], sitelinkAsset: SITELINK } } }]);
  return res ? (res[0].getResourceName && res[0].getResourceName()) || rn : null;
}
function calloutAsset() {
  const r = rows("SELECT asset.resource_name FROM asset WHERE asset.type = 'CALLOUT' AND asset.callout_asset.callout_text = " + q(CALLOUT));
  if (r.length) { report.skipped.push('コールアウト「' + CALLOUT + '」を作る（もうある）'); return r[0].asset.resourceName; }
  const rn = 'customers/' + CID + '/assets/-2';
  const res = apply('コールアウト「' + CALLOUT + '」を作る', [{ assetOperation: { create: { resourceName: rn, calloutAsset: { calloutText: CALLOUT } } } }]);
  return res ? (res[0].getResourceName && res[0].getResourceName()) || rn : null;
}
function attach(camp, assetRn, field, label) {
  if (/\/assets\/-\d+$/.test(assetRn)) { report.skipped.push(camp.name + '：' + label + ' を付ける（検証だけなので、アセットがまだ無い）'); return; }
  const have = rows('SELECT campaign_asset.asset FROM campaign_asset WHERE campaign.id = ' + camp.id + " AND campaign_asset.field_type = '" + field + "' AND campaign_asset.status != 'REMOVED'")
    .some(r => r.campaignAsset.asset === assetRn);
  if (have) { report.skipped.push(camp.name + '：' + label + '（もう付いている）'); return; }
  apply(camp.name + '：' + label + ' を付ける', [{ campaignAssetOperation: { create: { campaign: camp.rn, asset: assetRn, fieldType: field } } }]);
}
if (typeof module !== 'undefined') module.exports = { main, CONFIG, _report: report };

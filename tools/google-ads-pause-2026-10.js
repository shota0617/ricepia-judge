// らいすぴあ Google広告：効果の悪いものを止める Google広告スクリプト（docs/google-ads-effect-review-2026-10.md の色分けで 🔴 のもの）。
//   使い方: Google広告 → ツールと設定 → 一括操作 → スクリプト → ＋ → このファイルの中身を全部貼り付け
//          → 承認 →「プレビュー」（変更されない試し実行）→ ログを確認 →「実行」
//   または: node tools/google-ads-run.js --job pause（検証だけ）／ --job pause --apply（反映）
//   すること（何度実行しても同じ結果。もう止まっている所は飛ばす）:
//     1) キャンペーン「新米２」を一時停止（LINE 1件 ¥2,069。8/3〜9/1）
//     2) キャンペーン「業務用米_検索」を一時停止（30日 表示0回）
//     3) P-MAX #2 からサイトリンク「無洗米Q&A」（クリック率 9.6%）・「コスパ米 穂のぼの」（8.8%）を外す
//        （アセットはアカウントに残るので、管理画面で付け直せる）
//   止めないもの: P-MAX #2（広告費の8割・LINE 1件 ¥786。止めると広告がほぼ全部止まる）。予算・入札・目標は変えない
//   元に戻す: 管理画面でキャンペーンを「有効」にする／#2 の「アセット」→ サイトリンクで付け直す

const CONFIG = {
  PAUSE_CAMPAIGNS: [['新米２', 'SEARCH'], ['業務用米_検索', 'SEARCH']],
  SITELINK_CAMPAIGN: '西尾の米屋 らいすぴあ #2',
  REMOVE_SITELINKS: ['無洗米Q&A', 'コスパ米 穂のぼの'],
};
const report = { done: [], skipped: [], failed: [] };
function main() {
  const preview = AdsApp.getExecutionInfo().isPreview();
  Logger.log((preview ? '【プレビュー：変更はされません】' : '【実行：アカウントを変更します】') + ' 効果の悪いものを止める');
  CONFIG.PAUSE_CAMPAIGNS.forEach(([name, type]) => pauseCampaign(name, type));
  CONFIG.REMOVE_SITELINKS.forEach(text => removeSitelink(CONFIG.SITELINK_CAMPAIGN, text));
  Logger.log('\n反映した:\n  ' + (report.done.join('\n  ') || 'なし'));
  Logger.log('飛ばした（もう済んでいる）:\n  ' + (report.skipped.join('\n  ') || 'なし'));
  Logger.log('できなかった:\n  ' + (report.failed.join('\n  ') || 'なし'));
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
function pauseCampaign(name, type) {
  const r = rows('SELECT campaign.resource_name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.name = ' + q(name) + " AND campaign.status != 'REMOVED'");
  if (r.length !== 1 || r[0].campaign.advertisingChannelType !== type) { report.failed.push('キャンペーン「' + name + '」が見つからない（' + r.length + '件）'); return; }
  const c = r[0].campaign;
  if (c.status === 'PAUSED') { report.skipped.push('「' + name + '」を一時停止（もう止まっている）'); return; }
  apply('「' + name + '」を一時停止', [{ campaignOperation: { update: { resourceName: c.resourceName, status: 'PAUSED' }, updateMask: 'status' } }]);
}
function removeSitelink(campaign, text) {
  const r = rows('SELECT campaign_asset.resource_name FROM campaign_asset WHERE campaign.name = ' + q(campaign) +
    " AND campaign_asset.field_type = 'SITELINK' AND campaign_asset.status != 'REMOVED' AND asset.sitelink_asset.link_text = " + q(text));
  if (!r.length) { report.skipped.push(campaign + '：サイトリンク「' + text + '」を外す（付いていない）'); return; }
  apply(campaign + '：サイトリンク「' + text + '」を外す', r.map(x => ({ campaignAssetOperation: { remove: x.campaignAsset.resourceName } })));
}
if (typeof module !== 'undefined') module.exports = { main, CONFIG, _report: report };

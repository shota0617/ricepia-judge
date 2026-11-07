// らいすぴあ Google広告：広告の効果を見る数字を Google ドライブに書き出す Google広告スクリプト（読むだけ・アカウントは変えない）。
// 3社のAIの「広告効果のレビュー」（docs/google-ads-effect-review-2026-10.md）で足りなかったデータを、1回でそろえる。
//   使い方: Google広告 → ツールと設定 → 一括操作 → スクリプト → ＋ → このファイルの中身を全部貼り付け → 承認 →「プレビュー」
//          → マイドライブに ricepia_google_ads_effect_<日付>.txt ができる（プレビューでも作られる。広告のアカウントは変わらない）
//   または: node tools/google-ads-run.js --job effect --out effect.txt（API の認証情報があるとき）
//   書き出すもの:
//     1) キャンペーン（入札・予算・状態）と、コンバージョンの設定（どれがメインか・数え方・アトリビューション）と、入札に使う目標
//     2) 週ごと・日ごとの キャンペーン × 成果の種類（LINE・ルート検索 など）と費用・クリック（8/1 から昨日まで。10/15 の前後を比べる）
//     3) 変更履歴（直近30日。いつ・何が変わったか。だれが変えたかは出さない）
//     4) 検索語句（検索キャンペーン）と、P-MAX の検索カテゴリ（直近30日）
//   お客様ID・メールアドレス・電話番号は書き出さない

const CONFIG = {
  START: '2026-08-01',        // 比べはじめる日
  CHANGE_DATE: '2026-10-15',  // LINE 重視に決めた日（この前後で分ける）
  FILE_PREFIX: 'ricepia_google_ads_effect_',
};
const report = { done: [], skipped: [], failed: [], text: '' };
const out = [];
let TODAY = '', YESTERDAY = '';
function main() {
  const now = new Date(), tz = 'Asia/Tokyo';
  const fmt = d => (typeof Utilities.formatDate === 'function' ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10));
  TODAY = fmt(now); YESTERDAY = fmt(new Date(now.getTime() - 86400e3));
  out.push('# Google広告 効果のデータ（近藤米穀店 らいすぴあ）', '', '- 取得：' + TODAY + '（tools/google-ads-effect-2026-10.js・読むだけ）',
    '- 期間：' + CONFIG.START + '〜' + YESTERDAY + '（' + CONFIG.CHANGE_DATE + ' に LINE 重視に決定）',
    '- CV は「コンバージョン」列（入札に使うもの）、全CV は「すべてのコンバージョン」列。LINE は lin.ee ボタンのクリックで、友だち追加の完了ではない', '');
  section('1. キャンペーン', campaigns);
  section('2. コンバージョンの設定', conversionActions);
  section('3. 入札に使う目標（アカウント・キャンペーン）', goals);
  section('4. 変更の前と後（キャンペーンごと）', beforeAfter);
  section('5. 週ごと：キャンペーン × 成果の種類', weekly);
  section('6. 日ごと：キャンペーン × 成果の種類（CSV）', daily);
  section('7. 変更履歴（直近30日）', changes);
  section('8. 検索語句（検索キャンペーン・直近30日・クリックの多い順）', searchTerms);
  section('9. P-MAX の検索カテゴリ（直近30日）', pmaxCategories);
  report.text = out.join('\n') + '\n';
  if (typeof DriveApp !== 'undefined') {
    const f = DriveApp.createFile(CONFIG.FILE_PREFIX + TODAY + '.txt', report.text, 'text/plain');
    Logger.log('Google ドライブに書き出しました: ' + f.getName() + '（' + f.getUrl() + '）');
  } else {
    Logger.log(report.text);
  }
  if (report.failed.length) Logger.log('読めなかった:\n  ' + report.failed.join('\n  '));
}
function section(title, fn) {
  out.push('## ' + title, '');
  try { fn(); } catch (e) { report.failed.push(title + ' … ' + e.message); out.push('（読めなかった：' + e.message + '）'); }
  out.push('');
}
function rows(query) { const r = [], it = AdsApp.search(query); while (it.hasNext()) r.push(it.next()); return r; }
function yen(micros) { return Math.round(Number(micros || 0) / 1e6); }
function num(x) { return Math.round(Number(x || 0) * 100) / 100; }
function between() { return " segments.date BETWEEN '" + CONFIG.START + "' AND '" + YESTERDAY + "'"; }
function last30() { return ' segments.date DURING LAST_30_DAYS'; }
const NOT_REMOVED = "campaign.status != 'REMOVED'";
// 成果の名前を短く（表を読みやすく）
function shortName(n) {
  if (/LINE/.test(n)) return 'LINE';
  if (/経路|direction/i.test(n)) return 'ルート検索';
  if (/call/i.test(n) || /電話/.test(n)) return '電話';
  if (/ゲーム|game/i.test(n)) return 'ゲーム開始';
  return 'その他';
}
const KINDS = ['LINE', 'ルート検索', '電話', 'ゲーム開始', 'その他'];

function campaigns() {
  out.push('| キャンペーン | 種類 | 状態 | 配信 | 入札 | 目標CPA | 1日の予算 |', '|---|---|---|---|---|---:|---:|');
  rows('SELECT campaign.name, campaign.advertising_channel_type, campaign.status, campaign.serving_status, campaign.bidding_strategy_type, ' +
    'campaign.maximize_conversions.target_cpa_micros, campaign_budget.amount_micros FROM campaign WHERE ' + NOT_REMOVED)
    .forEach(r => { const c = r.campaign, mc = c.maximizeConversions || {};
      out.push('| ' + [c.name, c.advertisingChannelType, c.status, c.servingStatus, c.biddingStrategyType,
        mc.targetCpaMicros ? '¥' + yen(mc.targetCpaMicros) : '-', '¥' + yen((r.campaignBudget || {}).amountMicros)].join(' | ') + ' |'); });
}

function conversionActions() {
  out.push('| 成果 | 状態 | 分類 | メイン | CV列に入る | 数え方 | アトリビューション | 計測期間（日） | 値 |', '|---|---|---|---|---|---|---|---:|---:|');
  rows("SELECT conversion_action.name, conversion_action.status, conversion_action.category, conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric, " +
    'conversion_action.counting_type, conversion_action.attribution_model_settings.attribution_model, conversion_action.click_through_lookback_window_days, ' +
    "conversion_action.value_settings.default_value FROM conversion_action WHERE conversion_action.status != 'REMOVED'")
    .forEach(r => { const a = r.conversionAction;
      out.push('| ' + [a.name, a.status, a.category, a.primaryForGoal, a.includeInConversionsMetric, a.countingType,
        (a.attributionModelSettings || {}).attributionModel || '-', a.clickThroughLookbackWindowDays || '-', (a.valueSettings || {}).defaultValue || '-'].join(' | ') + ' |'); });
}

function goals() {
  const acct = rows('SELECT customer_conversion_goal.category, customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal')
    .filter(r => r.customerConversionGoal.biddable).map(r => r.customerConversionGoal.category + '/' + r.customerConversionGoal.origin);
  out.push('- アカウントの目標（入札に使う）：' + (acct.join('、') || 'なし'));
  const level = {};
  rows('SELECT campaign.name, conversion_goal_campaign_config.goal_config_level FROM conversion_goal_campaign_config WHERE ' + NOT_REMOVED)
    .forEach(r => { level[r.campaign.name] = r.conversionGoalCampaignConfig.goalConfigLevel; });
  const byCamp = {};
  rows('SELECT campaign.name, campaign_conversion_goal.category, campaign_conversion_goal.origin, campaign_conversion_goal.biddable FROM campaign_conversion_goal WHERE ' + NOT_REMOVED)
    .forEach(r => { const g = r.campaignConversionGoal; byCamp[r.campaign.name] = byCamp[r.campaign.name] || [];
      if (g.biddable) byCamp[r.campaign.name].push(g.category + '/' + g.origin); });
  Object.keys(Object.assign({}, level, byCamp)).forEach(c =>
    out.push('- ' + c + '（' + (level[c] || '?') + '）：' + ((byCamp[c] || []).join('、') || 'なし')));
}

// キャンペーン × 日 の費用・クリックと、成果の種類ごとの CV・全CV
let cache = null;
function dailyData() {
  if (cache) return cache;
  const d = {};   // key: 日付|キャンペーン
  const get = (date, camp) => (d[date + '|' + camp] = d[date + '|' + camp] || { date, camp, cost: 0, clicks: 0, impr: 0, cv: {}, all: {} });
  rows('SELECT segments.date, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE ' + NOT_REMOVED + ' AND' + between())
    .forEach(r => { const x = get(r.segments.date, r.campaign.name); x.cost += yen(r.metrics.costMicros); x.clicks += Number(r.metrics.clicks || 0); x.impr += Number(r.metrics.impressions || 0); });
  rows('SELECT segments.date, campaign.name, segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM campaign WHERE ' + NOT_REMOVED + ' AND' + between())
    .forEach(r => { const x = get(r.segments.date, r.campaign.name), k = shortName(r.segments.conversionActionName);
      x.cv[k] = (x.cv[k] || 0) + Number(r.metrics.conversions || 0); x.all[k] = (x.all[k] || 0) + Number(r.metrics.allConversions || 0); });
  cache = Object.keys(d).sort().map(k => d[k]);
  return cache;
}
function beforeAfter() {
  const p = {};
  dailyData().forEach(x => {
    const side = x.date < CONFIG.CHANGE_DATE ? '前' : '後', k = x.camp + '|' + side;
    const y = (p[k] = p[k] || { camp: x.camp, side, days: {}, cost: 0, clicks: 0, line: 0, route: 0 });
    y.days[x.date] = 1; y.cost += x.cost; y.clicks += x.clicks; y.line += x.all.LINE || 0; y.route += x.all['ルート検索'] || 0;
  });
  out.push('- 前＝' + CONFIG.START + '〜' + CONFIG.CHANGE_DATE + ' の前日、後＝' + CONFIG.CHANGE_DATE + '〜' + YESTERDAY + '（後の最初の約2週間は自動入札の学習期間）。日数は費用か成果があった日',
    '- LINE・ルート検索は全CV（メインかどうかに関係なく数えたもの）', '',
    '| キャンペーン | 前後 | 日数 | 費用 | 1日の費用 | クリック | LINE | 1日の LINE | LINE 1件 | ルート検索 | 1日のルート検索 |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  Object.keys(p).sort().forEach(k => { const y = p[k], n = Object.keys(y.days).length || 1;
    out.push('| ' + [y.camp, y.side, n, '¥' + y.cost, '¥' + Math.round(y.cost / n), y.clicks, num(y.line), num(y.line / n),
      y.line ? '¥' + Math.round(y.cost / y.line) : '-', num(y.route), num(y.route / n)].join(' | ') + ' |'); });
}
function monday(date) {
  const t = new Date(date + 'T00:00:00Z'), w = (t.getUTCDay() + 6) % 7;
  return new Date(t.getTime() - w * 86400e3).toISOString().slice(0, 10);
}
function weekly() {
  const w = {};
  dailyData().forEach(x => {
    const k = monday(x.date) + '|' + x.camp;
    const y = (w[k] = w[k] || { week: monday(x.date), camp: x.camp, cost: 0, clicks: 0, cv: {}, all: {} });
    y.cost += x.cost; y.clicks += x.clicks;
    KINDS.forEach(n => { y.cv[n] = (y.cv[n] || 0) + (x.cv[n] || 0); y.all[n] = (y.all[n] || 0) + (x.all[n] || 0); });
  });
  out.push('- 「LINE 1件」＝ 費用 ÷ LINE（全CV）。LINE がメインから外れていても数えられるよう、全CV で割る', '',
    '| 週（月曜から） | キャンペーン | 費用 | クリック | LINE（CV/全CV） | LINE 1件 | ルート検索（CV/全CV） | 電話（全CV） | ゲーム開始（全CV） | その他（CV/全CV） |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  Object.keys(w).sort().forEach(k => { const y = w[k], line = y.all.LINE || 0;
    out.push('| ' + [y.week + (y.week >= monday(CONFIG.CHANGE_DATE) ? (y.week === monday(CONFIG.CHANGE_DATE) ? ' ◆変更' : ' 後') : ''), y.camp, '¥' + y.cost, y.clicks,
      num(y.cv.LINE) + '/' + num(line), line ? '¥' + Math.round(y.cost / line) : '-', num(y.cv['ルート検索']) + '/' + num(y.all['ルート検索']),
      num(y.all['電話']), num(y.all['ゲーム開始']), num(y.cv['その他']) + '/' + num(y.all['その他'])].join(' | ') + ' |'); });
}
function daily() {
  out.push('```', 'date,campaign,cost,clicks,impressions,' + KINDS.map(n => n + '_cv,' + n + '_all').join(','));
  dailyData().forEach(x => out.push([x.date, '"' + x.camp + '"', x.cost, x.clicks, x.impr].concat(KINDS.map(n => num(x.cv[n]) + ',' + num(x.all[n]))).join(',')));
  out.push('```');
}

function changes() {
  const from = new Date(Date.now() - 29 * 86400e3 + 9 * 3600e3).toISOString().slice(0, 10);
  const list = rows('SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields, ' +
    "change_event.client_type, campaign.name FROM change_event WHERE change_event.change_date_time >= '" + from + "' AND change_event.change_date_time <= '" + TODAY + " 23:59:59' " +
    'ORDER BY change_event.change_date_time DESC LIMIT 500');
  if (!list.length) { out.push('（なし）'); return; }
  out.push('| 日時 | どこから | 何を | どう | キャンペーン | 変わった項目 |', '|---|---|---|---|---|---|');
  list.forEach(r => { const e = r.changeEvent;
    out.push('| ' + [String(e.changeDateTime).slice(0, 16), e.clientType, e.changeResourceType, e.resourceChangeOperation, (r.campaign || {}).name || '-',
      String(e.changedFields || '').slice(0, 120)].join(' | ') + ' |'); });
}

function searchTerms() {
  const list = rows('SELECT campaign.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.all_conversions ' +
    "FROM search_term_view WHERE campaign.status = 'ENABLED' AND" + last30() + ' ORDER BY metrics.clicks DESC LIMIT 150');
  if (!list.length) { out.push('（なし）'); return; }
  out.push('| キャンペーン | 検索語句 | 表示 | クリック | 費用 | CV | 全CV |', '|---|---|---:|---:|---:|---:|---:|');
  list.forEach(r => out.push('| ' + [r.campaign.name, r.searchTermView.searchTerm, r.metrics.impressions || 0, r.metrics.clicks || 0,
    '¥' + yen(r.metrics.costMicros), num(r.metrics.conversions), num(r.metrics.allConversions)].join(' | ') + ' |'));
}

function pmaxCategories() {
  const camps = rows("SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'");
  if (!camps.length) { out.push('（なし）'); return; }
  camps.forEach(c => {
    out.push('### ' + c.campaign.name, '', '| 検索カテゴリ | 表示 | クリック | CV |', '|---|---:|---:|---:|');
    rows('SELECT campaign_search_term_insight.category_label, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign_search_term_insight WHERE' +
      last30() + " AND campaign_search_term_insight.campaign_id = '" + c.campaign.id + "' ORDER BY metrics.clicks DESC LIMIT 50")
      .forEach(r => out.push('| ' + [r.campaignSearchTermInsight.categoryLabel || '（その他）', r.metrics.impressions || 0, r.metrics.clicks || 0, num(r.metrics.conversions)].join(' | ') + ' |'));
    out.push('');
  });
}
if (typeof module !== 'undefined') module.exports = { main, CONFIG, _report: report };

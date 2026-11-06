/* 米づくり365 計算エンジン(ブラウザと Node の両方で動く)
 * 数値の出典は ../数値表_ゲーム用.md。【計算】=資料の数値から当店が計算、【設定】=資料に数値がなくゲームとして決めた値。
 * 単位: 収量 kg/10a(= g/㎡)、窒素 kg/10a、気温 ℃、日付は年内通算日(1/1=1、平年)。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Kome365 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- 名古屋の旬別平年値(1991〜2020, 気象庁) ----
  const NORM = {
    mean: [5.0,4.9,4.5, 4.6,5.4,6.8, 7.9,9.0,10.5, 12.8,14.7,16.2, 18.2,19.0,20.7, 21.8,23.0,24.2, 25.7,26.9,28.0, 28.7,28.4,27.5, 26.4,24.7,22.4, 20.7,18.9,16.6, 14.6,12.4,10.7, 8.8,6.9,5.9],
    max:  [9.6,9.3,9.1, 9.4,10.5,12.0, 13.0,14.6,15.9, 18.4,20.3,21.7, 23.6,24.2,26.0, 26.8,27.5,28.4, 29.9,31.4,32.7, 33.8,33.5,32.5, 31.2,29.3,26.8, 25.2,23.6,21.3, 19.5,17.0,15.5, 13.3,11.4,10.5],
    prec: [12.8,16.5,21.5, 14.9,24.8,25.1, 38.5,33.7,44.0, 39.9,44.5,43.2, 48.0,54.1,48.2, 39.7,67.0,79.8, 74.8,73.8,62.8, 33.1,43.3,63.1, 61.0,100.9,69.7, 61.5,51.7,51.4, 20.3,32.9,25.9, 18.9,16.1,21.6],
  };
  const JOB = { dsow: '田んぼに種まき', flood: '入水', buy: '苗を買う', oneshot: '一発肥料', salt: '塩水選', box: '育苗箱の薬', sow: '種まき', till: '田起こし', puddle: '代かき', basal: '基肥', plant: '田植え', herb: '除草剤', herb2: '中後期の除草剤', weed: '草とり', mizo: '溝切り', water: '水の深さ', mid: '中干し', top: '追肥', mow: '畦の草刈り', spray: '防除', flush: 'かけ流し', drain: '落水', harvest: '稲刈り' };
  const MDAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
  const MSTART = MDAYS.reduce((a, d, i) => (a.push(a[i] + d), a), [1]); // 各月1日の通算日
  const doyOf = (m, d) => MSTART[m - 1] + d - 1;
  const dateOf = (doy) => { let m = 0; while (m < 11 && doy >= MSTART[m + 1]) m++; return { m: m + 1, d: doy - MSTART[m] + 1 }; };
  const fmt = (doy) => { const { m, d } = dateOf(doy); return m + '/' + d; };
  const junOf = (doy) => { const { m, d } = dateOf(doy); return (m - 1) * 3 + (d <= 10 ? 0 : d <= 20 ? 1 : 2); };
  const junMid = (i) => doyOf(Math.floor(i / 3) + 1, [5, 15, 25][i % 3]);
  function interp(arr, doy) {
    for (let i = 0; i < 35; i++) {
      const a = junMid(i), b = junMid(i + 1);
      if (doy >= a && doy <= b) return arr[i] + (arr[i + 1] - arr[i]) * (doy - a) / (b - a);
    }
    return doy < junMid(0) ? arr[0] : arr[35];
  }
  // 旬の始まり(1日・11日・21日)= ターンの区切り
  const isTurnDay = (doy) => { const d = dateOf(doy).d; return d === 1 || d === 11 || d === 21; };

  // ---- 品種 ----
  // 出穂: 田植え翌日から Σ(日平均−10℃) が a + b×田植え日 に届いた日【計算: 県の田植え日→出穂表と名古屋平年値, 誤差±2日】
  // 成熟: 出穂翌日から Σ日平均気温 が ripe に届いた日【計算】
  const VARIETIES = {
    koshi: { name: 'コシヒカリ', early: true, a: 565, b: 3.70, ripe: 885,
      window: [doyOf(4, 5), doyOf(5, 20)], stdPlant: doyOf(4, 25), // 3/21開始+育苗15日=4/5が最短
      fert: { basal: 4, p1: 2, p1d: 18, p2: 2, p2d: 10, oneshot: 4.5, direct: 7 }, directH: 1368, dsowEnd: doyOf(5, 5), // 直播: 3/25まき→8月上旬出穂【愛知 施肥基準の暦から計算】。directH は出芽の翌日からの Σ(T−10)。まける晩限【愛知 V直マニュアル 表2】 // 県の施肥基準(地力中庸)。oneshot=側条施肥の一発肥料
      panRef: 418, sppBase: 78.6, gw: 21.5,                // 穂数=試験場実測。1穂籾数・千粒重は【設定】(収量549に合わせる)
      targetYield: 549, lodge: 1.0, blast: 1.0,           // 倒伏 弱(3.0)、いもち 弱/弱
      heatK: 0.50, coldTc: 19.5 },                        // 白未熟 場内29%・高温検定(28.3℃)24%, 耐冷性 極強
    kokoro: { name: 'あいちのこころ', a: 1334, b: -0.72, ripe: 972,
      window: [doyOf(4, 15), doyOf(6, 15)], stdPlant: doyOf(5, 15),
      fert: { basal: 5.5, p1: 2.5, p1d: 25, p2: 2.5, p2d: 15, oneshot: 8, direct: 10 }, directH: 1554, dsowEnd: doyOf(5, 20), // 直播: こころのV直は「あさひの夢・ゆめまつりに準ずる」【愛知 こころ安定栽培マニュアル】→晩限5/20・成熟9/15〜10/5(あさひの夢)【V直マニュアル 表2】。出穂8月中旬はこの成熟に合わせた【設定】
      panRef: 418, sppBase: 81.0, gw: 22.0,
      targetYield: 588, lodge: 0.6, blast: 0.6,
      heatK: 0.20, coldTc: 20.0 },                        // 白未熟 場内11%(登熟27.5℃)・高温検定(28.6℃)7%
    kaori: { name: 'あいちのかおりSBL', a: 1882, b: -3.44, ripe: 1019,
      window: [doyOf(5, 1), doyOf(6, 20)], stdPlant: doyOf(5, 25),
      fert: { basal: 5.5, p1: 2.5, p1d: 23, p2: 2.5, p2d: 13, oneshot: 8, direct: 10 }, directH: 1733, dsowEnd: doyOf(5, 25), // 直播: 3/25まき→8月下旬出穂【愛知】・晩限5/25【愛知 V直マニュアル 表2】
      panRef: 409, sppBase: 71.6, gw: 22.0,
      targetYield: 516, lodge: 0.5, blast: 0.4,
      heatK: 0.45, coldTc: 20.0 },                        // 白未熟 場内15%・高温検定25%
    // ---- 当店の銘柄の品種(2026-10-23 追加)。愛知の施肥基準に欄がないので、量は各県の資料に準じた【設定】 ----
    milky: { name: 'ミルキークイーン', early: true, a: 565, b: 3.70, ripe: 885,    // コシヒカリの突然変異の低アミロース米。出穂期はコシヒカリと同じ・稈長+3cm・収量同程度【福岡県 研究成果】
      window: [doyOf(4, 5), doyOf(5, 20)], stdPlant: doyOf(4, 25),
      fert: { basal: 4, p1: 2, p1d: 18, p2: 2, p2d: 10, oneshot: 4.5, direct: 7 }, directH: 1368, dsowEnd: doyOf(5, 5),   // 施肥はコシヒカリと同様【鳥取県 低アミロース品種の指導・設定】
      panRef: 418, sppBase: 78.6, gw: 21.5,
      targetYield: 549, lodge: 1.05, blast: 1.0,          // 長稈で倒れやすく、病害虫に弱い(コシヒカリ並み以下)
      heatK: 0.15, baseWhite: 10, coldTc: 19.5 },          // 愛知の実際の1等比率は年によらず約3割(令和6年27.8%・7年34.4%)【農水省 検査結果】。暑さより、もとの見た目の分が大きいとして合わせた【設定】(理由は資料で確かめられていない)
    niko: { name: 'にこまる', a: 2124, b: -4.96, ripe: 1050,   // 中生。ヒノヒカリより出穂2〜3日・成熟3〜5日遅い。早植えは高温登熟の危険【農研機構 にこまる栽培マニュアル】。愛知での出穂(6/5植え→8/27)は【設定】
      window: [doyOf(5, 15), doyOf(6, 25)], stdPlant: doyOf(6, 1),
      fert: { basal: 4, p1: 2, p1d: 18, p2: 2, p2d: 12, oneshot: 7, direct: 9 }, directH: 1781, dsowEnd: doyOf(5, 25),   // 基肥4+穂肥2+2(出穂18〜16日前・7〜10日前)【農研機構】。2回目は出穂の予想のずれを見て12日前に【設定】
      panRef: 340, sppBase: 88, gw: 23.0,                  // 穂数やや少・1穂籾数80〜90・千粒重23g【農研機構】
      targetYield: 560, lodge: 0.45, blast: 0.8,          // 耐倒伏性 中(コシより強)・いもち やや弱【農研機構】。収量はヒノヒカリ+5〜10%
      heatK: 0.25, coldTc: 20.0 },                        // 高温登熟性に優れる【農研機構】。愛知の1等比率(令和6年74.4%・7年48.4%)に合わせた【設定】
    hatsu: { name: 'ハツシモ', a: 2050, b: -4.40, ripe: 950,   // 晩生。早植5/10→出穂8/19、普通期6/10→出穂8/30・成熟10/4【岐阜県 令和8年度 奨励品種特性表】
      window: [doyOf(5, 20), doyOf(6, 25)], stdPlant: doyOf(6, 5),
      fert: { basal: 4.5, p1: 2.5, p1d: 25, p2: 2, p2d: 15, oneshot: 7.5, direct: 9 }, directH: 1659, dsowEnd: doyOf(6, 5),   // 穂肥は出穂前25日ごろ・多肥にしない【岐阜県】/直播の晩限6/5【愛知 V直マニュアル 表2】
      panRef: 360, sppBase: 76, gw: 24.0,                  // 大粒(千粒重23.8〜24.8g)【岐阜県】
      targetYield: 520, lodge: 0.75, blast: 0.8,          // 長稈・多肥でやや倒れやすい【岐阜県】
      heatK: 0.32, coldTc: 20.0 },                        // 愛知の1等比率(令和6年89.4%・7年35.6%)に合わせた【設定】
  };
  const SOIL = { low: { name: '地力 低', N: 5.5, basalAdj: +1.5 }, mid: { name: '地力 ふつう', N: 7.0, basalAdj: 0 }, high: { name: '地力 高', N: 8.5, basalAdj: -1.5 } };

  // ---- 年の種類 ----
  const YEARS = {
    recent: { name: '最近の夏', anom: { 6: 0.8, 7: 1.3, 8: 1.3, 9: 1.2 }, rain: 0.9, bph: 1.2, bug: 1.1, kame: 1.3 }, // 名古屋 2025年の年平均は平年+1.3℃【JMA】
    normal: { name: '平年', anom: {}, rain: 1, bph: 1, bug: 1, kame: 1 },
    hot:    { name: '暑い夏', anom: { 6: 0.8, 7: 2.2, 8: 2.0, 9: 1.2 }, rain: 0.75, bph: 1.5, bug: 1.3, kame: 1.5 }, // 2026年7月 名古屋+2.1℃
    unka:   { name: 'ウンカの年', anom: {}, rain: 1, bph: 8, bug: 1, kame: 1 },                                 // 2020年 西尾市で坪枯れ
    cool:   { name: '涼しい夏', anom: { 6: -1.0, 7: -2.0, 8: -2.2, 9: -1.0 }, rain: 1.2, bph: 0.7, bug: 0.8, kame: 0.8 }, // 愛知では−2℃でも冷害の温度(減数分裂期17℃前後)まで下がらない
  };

  function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(R) { let u = 0, v = 0; while (u === 0) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function makeWeather(yearKey, R) {
    const Y = YEARS[yearKey];
    const mAnom = [];
    for (let m = 1; m <= 12; m++) mAnom[m] = (Y.anom[m] || 0) + gauss(R) * 0.6;
    const T = [], Tmax = [], rain = [];
    let e = 0;
    for (let doy = 1; doy <= 365; doy++) {
      const { m, d } = dateOf(doy);
      // 月の偏差は月の境目でなめらかにつなぐ
      const frac = (d - 1) / MDAYS[m - 1];
      const a0 = frac < 0.5 ? mAnom[m - 1] ?? mAnom[m] : mAnom[m];
      const a1 = frac < 0.5 ? mAnom[m] : mAnom[m + 1] ?? mAnom[m];
      const w = frac < 0.5 ? frac + 0.5 : frac - 0.5;
      const anom = a0 + (a1 - a0) * w;
      e = 0.7 * e + gauss(R) * 1.0; // 日ごとのゆらぎ(標準偏差 約1.4℃)
      T[doy] = interp(NORM.mean, doy) + anom + e;
      Tmax[doy] = interp(NORM.max, doy) + anom + e * 1.2;
      const p = clamp(NORM.prec[junOf(doy)] / 120 * Y.rain, 0.05, 0.75); // 1雨日≒12mmとして旬の雨日数を出す【設定】
      rain[doy] = R() < p;
    }
    // 台風: 東海への接近 平年 8月0.8・9月1.2個。影響が大きいのはその一部【設定】
    const typhoons = [];
    for (let j = 21; j <= 26; j++) if (R() < (j <= 23 ? 0.8 : 1.2) / 3 * 0.35) typhoons.push(junMid(j) + Math.floor(R() * 9) - 4);
    return { T, Tmax, rain, typhoons, yearKey };
  }

  // ---- 作業時間(東海の10a当たり実績, 令和6年産 米生産費)----
  const LABOR = { flushDay: 0.05, /* かけ流し中は水口の見回り・水の調整に1日3分ほど【設定】 */ dsow: 0.8, flood: 0.3, oneshot: 0.3, prep: 0.15, nursery: 1.52, till: 2.6, puddle: 1.59, /* 耕起整地4.19時間を田起こしと代かきに分けた【設定】 */ basal: 0.91, plant: 2.56, top: 0.13, herb: 1.27, manage: 7.11, spray: 0.37, mow: 0.4, harvest: 2.92, dry: 1.48, mizo: 0.6, weed: 1.0 };   // 手取り除草は1回10aあたり約1時間【設定・有機の田は年10時間(農水省)】   // 溝切りは溝切り機で10aあたり約40分【設定】

  class Farm {
    constructor(opt) {
      opt = opt || {};
      this.v = VARIETIES[opt.variety || 'kaori'];
      this.vKey = opt.variety || 'kaori';
      this.soil = SOIL[opt.soil || 'mid'];
      this.yearKey = opt.year || 'normal';
      this.Y = YEARS[this.yearKey];
      const sd = opt.seed == null ? (Math.random() * 2 ** 31) | 0 : opt.seed;
      this.R = rng(sd); this.seedP = sd;   // 見回りの発見は別の乱数で決める(天気・病気の乱数を動かさない)
      this.pEv = []; this.pEvDoy = -1; this.patrolLog = { patrols: 0, fixed: { float: 0, leak: 0, hie: 0, bird: 0, snail: 0, egg: 0, vent: 0, konagi: 0, omodaka: 0, kurogwai: 0, ibokusa: 0 }, missed: { float: 0, leak: 0, hie: 0, bird: 0, snail: 0, egg: 0, vent: 0, konagi: 0, omodaka: 0, kurogwai: 0, ibokusa: 0 }, life: [] };
      this.snailLoss = 0; this.ventLoss = 0; this.floatLoss = 0; this.floated = false;
      { const h = ((sd * 2246822519) >>> 0) % 100; this.omoField = h < 40; this.kuroField = h % 7 < 2; }   // 多年生雑草のいる田: オモダカ約4割・クログワイ約3割【設定】
      this.herbDoy = null; this.herbLeak = false; this.herb2 = false; this.weedSeen = []; this.snailField = ((sd * 2654435761) >>> 0) % 100 < 35;   // ジャンボタニシのいる田(約3分の1)【設定】。乱数の列は動かさない
      this.leakOpen = false; this.leakDays = 0; this.leakDaysH = 0; this.birdLoss = 0; this.birdNet = 0; this.weedExtra = 0; this.weedPulled = 0; this.nagaeLv = 0; this.nagaeDone = false;
      this.w = makeWeather(this.yearKey, this.R);
      this.doy = doyOf(3, 21);
      this.phase = 'prep';
      this.log = []; this.msgs = []; this.daily = [];
      this.queue = [];
      this.labor = LABOR.manage; // 水管理・見回りは1年を通してかかる
      // 状態
      Object.assign(this, {
        salt: false, box: false, sowDoy: null, tillDepth: null, basal: 0, herb: false,
        transDoy: null, density: 60, stems: 0, maxStems: 0, tillerStop: false, piDoy: null, meiDoy: null,
        panicles: 0, accH: 0, Hneed: 0, headDoy: null, accR: 0, matDoy: null, harvestDoy: null,
        water: 'none', midStart: null, midLen: 0, midExtend: false, midEnd: null, drainDoy: null, flush: false,
        tops: [], sprays: [], mows: [],
        blast: 0, blastProt: -1, sheath: 0, bph: 0, bphMax: 0, bphArr: null, bphProt: -1, lodged: false, typhoonHit: 0,
        stemsAtMid: null,
      });
      this.method = opt.method === 'direct' ? 'direct' : 'transplant';   // 植え方: 田植え / 直播(乾田V溝直播)
      this.contract = !!opt.contract;                                    // 防除をJA(地域一斉のドローン)にまかせる
      this.herbs = [];
      this.bugIndex = Math.exp(gauss(this.R) * 0.4) * this.Y.bug;
      this.bphArr = doyOf(6, 21) + Math.floor(this.R() * 18);           // 6月下旬に飛来
      this.bphSeed = 0.01 * this.Y.bph * Math.exp(gauss(this.R) * 0.7);
      this.done = false;
    }

    // ---- 予想(平年値で先を読む。プレイヤーに見せる「出穂まであと○日」)----
    // 直播の出芽の見込み(平年の気温で数える)
    forecastEmerge() {
      if (this.method !== 'direct' || !this.transDoy) return null;
      if (this.emergeDoy) return this.emergeDoy;
      let acc = this.accE || 0, d = Math.max(this.doy, this.transDoy + 1);
      for (; d < 330; d++) { acc += Math.max(interp(NORM.mean, d) - 10, 0); if (acc >= Farm.EMERGE) break; }
      return d;
    }
    forecastHeading() {
      if (this.headDoy) return this.headDoy;
      if (!this.transDoy) return null;
      let acc = this.accH, d = Math.max(this.doy, this.transDoy + 1);
      if (this.method === 'direct' && !this.emergeDoy) d = this.forecastEmerge() + 1;   // 直播は出芽してから数える
      for (; d < 330; d++) { acc += Math.max(interp(NORM.mean, d) + (this.Y.anom[dateOf(d).m] || 0) * 0.5 - 10, 0); if (acc >= this.Hneed) break; }
      return d;
    }
    // この日に植えたら、穂が出るのはいつごろか(平年の気温と、その年の傾向の半分で見積もる。実際の天気は使わない)
    headingIfPlanted(p) {
      let acc = 0, d = p; const need = this.v.a + this.v.b * p;
      for (; d < 330; d++) { acc += Math.max(interp(NORM.mean, d) + (this.Y.anom[dateOf(d).m] || 0) * 0.5 - 10, 0); if (acc >= need) break; }
      return d;
    }
    forecastMaturity() {
      if (this.matDoy) return this.matDoy;
      const h = this.forecastHeading(); if (!h) return null;
      let acc = this.accR, d = Math.max(this.doy, h + 1);
      for (; d < 360; d++) { acc += interp(NORM.mean, d) + (this.Y.anom[dateOf(d).m] || 0) * 0.5; if (acc >= this.v.ripe) break; } // 出穂の予想と同じく、年の暑さを半分だけ見込む
      return d;
    }

    // ---- 行動 ----
    schedule(delay, name, p) { if (this.done) return '稲刈りは終わりました'; this.queue.push({ id: (this._qid = (this._qid || 0) + 1), doy: this.doy + (delay | 0), name, p: p || {} }); return null; }
    cancel(id) { this.queue = this.queue.filter((q) => q.id !== id); }
    queued(name) { return this.queue.some((q) => q.name === name); }
    act(name, p) {
      p = p || {};
      if (this.done) return '稲刈りは終わりました';
      if (this.pDone !== this.doy) this.pEvDoy = -1;   // まだ見回っていない旬は、作業のあとの田んぼで見つかるものを決めなおす(3Dの画面が先に読んでも結果が変わらない)
      const f = this['a_' + name];
      if (!f) return 'その作業はありません';
      const err = f.call(this, p);
      if (!err) this.log.push({ doy: this.doy, name, p });
      return err || null;
    }
    a_salt() { if (this.sowDoy) return '種まきの後です'; this.salt = true; this.labor += LABOR.prep; }
    a_box() { if (this.transDoy) return '田植えの後です'; this.box = true; }
    // 直播(乾田V溝直播): 冬に整地した田に、3〜4月に種を直接まく。苗は作らない・代かきもしない【愛知】
    a_dsow(p) {
      if (this.method !== 'direct') return '田植えのやり方です';
      if (this.transDoy) return 'もう種をまきました';
      if (this.doy < doyOf(3, 10) || this.doy > this.v.dsowEnd) return '直播の種まきは3月中旬〜' + fmt(this.v.dsowEnd) + 'です';
      const kg = p.kg || 7; this.dsowKg = kg;
      this.sowDoy = this.transDoy = this.doy; this.phase = 'field'; this.density = 60; this.salt = true;
      this.stems = kg * 1000 / 30 * 0.6 * (this.doy < doyOf(4, 1) ? 0.9 : 1); // 乾籾30mg・苗立ち6割。6kg=200粒/㎡に対し目標の出芽数は100〜150本/㎡、早まきほど播種量を増やす【愛知 V直マニュアル】
      this.accE = 0; this.emergeDoy = null;   // 出芽は気温しだい(下の step)
      this.Hneed = this.v.directH; this.water = 'dryfield'; this.tillDepth = 15; this.puddleDoy = this.doy;
      this.labor += LABOR.dsow;
    }
    // 入水: 直播の田に水を入れる(5月末〜6月上旬)【愛知】
    a_flood() {
      if (this.method !== 'direct' || !this.transDoy) return '直播の田に種をまいてから';
      if (this.flooded) return 'もう水を入れています';
      if (!this.emergeDoy) return '芽が出てから(土の中の芽は水につかると死にます)';
      this.flooded = this.doy; this.water = 'shallow'; this.labor += LABOR.flood;
    }
    // 苗を買う(JAの育苗センターなど。東海では田植え面積の約46%が買い苗【農水省 米生産費】)。そろった苗が届く
    a_buy() {
      if (this.method === 'direct') return '直播では苗はいりません';
      if (this.sowDoy) return 'もう苗があります';
      // 買う苗は予約して、田植えの時期に届く(早く予約しても苗は古くならない)【JAの育苗センター】
      this.bought = true; this.salt = true; this.buyArrive = Math.max(this.doy, this.v.window[0]); this.sowDoy = this.buyArrive - 20; this.phase = 'nursery';
    }
    // 一発肥料: 田植えのときに1回まけば穂肥の要らない肥料(全量基肥・側条施肥)。愛知の水稲の主流【愛知県・JA】
    a_oneshot(p) {
      if (this.transDoy && !(this.method === 'direct' && !this.flooded)) return this.method === 'direct' ? '入水の前にまきます' : '田植えの後です';
      if (this.basalDone) return 'もう肥料を決めました';
      this.basalDone = true; this.oneshot = p.kg || 0; if (this.oneshot > 0) this.labor += LABOR.oneshot;
    }
    a_sow() {
      if (this.method === 'direct') return '直播は「田んぼに種まき」です';
      const e = this.checkAt('sow', this.doy); if (e) return e;
      this.sowDoy = this.doy; this.phase = 'nursery'; this.labor += LABOR.nursery;
    }
    a_till(p) { if (this.transDoy) return '田植えの後です'; if (this.tillDepth != null) return 'もう田起こしをしました'; this.tillDepth = p.depth || 15; this.labor += LABOR.till + (this.tillDepth > 15 ? 0.5 : this.tillDepth < 15 ? -0.6 : 0); }
    // 代かき: 田起こしの後、田植えの2〜3日前に水を入れて土を細かく平らにする【農水省 水稲栽培のポイント】
    a_puddle() {
      if (this.method === 'direct') return '直播は代かきしません(冬に整地ずみ)';
      if (this.doy < doyOf(4, 1)) return '用水が来るのは4月からです(代かきは4月に入ってから)';
      if (this.transDoy) return '田植えの後です';
      if (this.puddleDoy) return 'もう代かきをしました';
      if (this.tillDepth == null) return '先に田起こしをしてください';
      this.puddleDoy = this.doy; this.labor += LABOR.puddle;
    }
    a_basal(p) { if (this.transDoy) return '田植えの後です'; if (this.basalDone) return 'もう基肥を決めました'; this.basalDone = true; this.basal = p.kg || 0; if (this.basal > 0) this.labor += LABOR.basal; }
    // その日にその作業ができるか(できなければ理由)。予約するときにも使う
    checkAt(name, doy) {
      const v = this.v;
      if (this.done) return '稲刈りは終わりました';
      if (name === 'sow') { if (this.sowDoy) return 'もう種をまいています'; if (doy > v.window[1] - 15) return 'この品種の種まきは' + fmt(v.window[1] - 15) + 'までです(田植えに間に合いません)'; }
      if (name === 'puddle' && this.method !== 'direct' && doy < doyOf(4, 1)) return '用水が来るのは4月からです(代かきは4月に入ってから)';   // 4月に田植え準備で用水の取水が増え始める【矢作川研究所 平成19・20年度の水収支】
      if (name === 'puddle' && this.tillDepth == null && !this.queue.some((q) => q.name === 'till' && q.doy <= doy)) return '先に田起こしをしてください';
      if ((name === 'till' || name === 'basal' || name === 'puddle') && this.queue.some((q) => q.name === 'plant' && q.doy < doy)) return '田植えの予約(' + fmt(this.queue.find((q) => q.name === 'plant').doy) + ')より前の日にしてください';
      if (name === 'plant') { const pre = this.queue.find((q) => (q.name === 'till' || q.name === 'basal' || q.name === 'puddle') && q.doy > doy); if (pre) return JOB[pre.name] + 'の予約(' + fmt(pre.doy) + ')より後の日にしてください'; return this.plantCheck(doy); }
      if (name === 'herb' && this.method !== 'direct' && this.transDoy && doy > this.transDoy + 20) return '除草剤は田植えから20日以内(' + fmt(this.transDoy + 20) + 'まで)に使います';
      if (name === 'herb' && this.method === 'direct') { if (this.herbs.length + this.queue.filter((q) => q.name === 'herb').length >= 3) return '除草剤は3回までです'; const last = Math.max(-99, ...this.herbs, ...this.queue.filter((q) => q.name === 'herb').map((q) => q.doy)); if (doy - last < 10) return '前の除草剤から10日はあけます'; }
      if ((name === 'weed' || name === 'herb2') && this.headDoy) return '穂が出たあとは使いません';
      if (name === 'herb2' && this.transDoy && doy < this.transDoy + 20) return '中後期の除草剤は、最初の除草剤から20日ほどあけて(' + fmt(this.transDoy + 20) + 'から)';
      if (name === 'flood' && (this.method !== 'direct' || !this.transDoy)) return '直播の田に種をまいてから';
      if (name === 'flood' && !this.emergeDoy) return '芽が出てから(土の中の芽は水につかると死にます)';
      if (name === 'dsow' && (doy < doyOf(3, 10) || doy > this.v.dsowEnd)) return '直播の種まきは3月中旬〜' + fmt(this.v.dsowEnd) + 'です';
      if (name === 'harvest' && this.headDoy && doy < this.headDoy + 25) return 'まだ実っていません';
      return null;
    }
    regionHeading() {
      if (this._rh) return this._rh;
      const start = this.method === 'direct' ? doyOf(3, 25) : this.v.stdPlant, need = this.method === 'direct' ? this.v.directH + Farm.EMERGE : this.v.a + this.v.b * this.v.stdPlant;
      let acc = 0, d = start; while (acc < need && d < 330) { d++; acc += Math.max(this.w.T[d] - 10, 0); }   // 同じ年の天気で数える(JAは出穂期予測ツールで実際の年の出穂を見て計画する【愛知 Agrilookの活用】)
      return (this._rh = d);
    }
    // まわりの田んぼの出穂日。まわりと出穂がずれた田に、出穂期のカメムシが集まる【愛知 こころ安定栽培マニュアル】
    // まわり=地域の標準(移植の田は品種の標準の田植え、直播の田はV直の団地の標準の種まき)を同じ年の天気で育てた田
    nbrHeading() { return this.regionHeading(); }
    contractPlan() { const R = this.regionHeading(); return [[R - 7, 'blast'], [R + 1, 'bug'], [R + 10, 'bug'], [R + 15, 'bph']]; } // 穂いもち予防・カメムシは出穂期とその7〜14日後(イネカメムシ対策)【愛知 2025年10大成果・海部の一斉防除】・ウンカ
    plantCheck(doy) {
      doy = doy == null ? this.doy : doy;
      if (!this.sowDoy) return 'まだ苗がありません';
      if (this.transDoy) return 'もう植えています';
      if (this.bought && doy < this.buyArrive) return '予約した苗は' + fmt(this.buyArrive) + 'ごろ届きます';
      if (doy - this.sowDoy < 15) return '苗がまだ小さすぎます(育苗は15日以上)';
      if (doy < this.v.window[0]) return 'この品種の田植えは' + fmt(this.v.window[0]) + 'からです';
      if (doy > this.v.window[1]) return 'この品種の田植えの時期(' + fmt(this.v.window[1]) + 'まで)を過ぎました';
      if (interp(NORM.mean, doy) < 12) return 'まだ寒すぎます(田植えは12〜13℃以上)';
      return null;
    }
    a_plant(p) {
      if (this.method === 'direct') return '直播では田植えはしません';
      const e = this.plantCheck(); if (e) return e;
      this.transDoy = this.doy; this.phase = 'field'; this.density = p.density || 60;
      const age = this.doy - this.sowDoy;
      // 老化苗: 稚苗の育苗は15〜20日が適正。26日を過ぎると老化が進み、31日以上では田植え後の初期生育がにぶる【栃木県 研究成果集41・東北農業研究74(山形)】。減り方の量は【設定】(買い苗は田植えに合わせて届く)
      const ageF = this.bought ? 1 : clamp(1 - 0.015 * Math.max(0, age - 25), 0.7, 1);
      this.ageLag = !this.bought && age > 30 ? 3 : 0;   // 根づきが3日おくれる【設定】
      this.stems = this.density / 3.3 * 3.5 * (this.salt ? 1 : 0.9) * ageF; // 1株3〜4本
      this.Hneed = this.v.a + this.v.b * this.doy;
      this.water = 'shallow';
      if (this.tillDepth == null) this.tillDepth = 12;
      if (this.method !== 'direct' && this.windy(this.doy)) { this.floated = true; this.msg('強い風の日に植えたので、苗が浮いて流されたところがあります(浮き苗)'); }   // 強風の日は植えない、が農家の基本【新潟・わたか農園など農家の声】
      this.labor += LABOR.plant;
    }
    a_herb() { if (this.method === 'direct') { if (!this.transDoy) return '種をまいてから'; if (this.herbs.length >= 3) return '除草剤は3回までです'; if (this.herbs.length && this.doy - this.herbs[this.herbs.length - 1] < 10) return '前の除草剤から10日はあけます'; this.herbs.push(this.doy); this.herb = true; this.labor += LABOR.herb * 0.4; return; } if (this.herb) return 'もう除草剤を使いました'; if (!this.transDoy || this.doy > this.transDoy + 20) return '除草剤は田植えの前後に使います'; this.herb = true; this.herbDoy = this.doy; this.labor += LABOR.herb * 0.4; }
    // 中後期の除草剤: 最初の除草剤のあとに出る、オモダカ・クログワイなどの多年生の草に【宮城県 水稲の雑草】
    // 溝切り: 中干しの前に、8〜10条(約2.5m)おきに深さ10cm以上の溝を切り、水口・水尻につなぐ。中干しの水がよく抜け、秋に田が固くなる【新潟県・岩手県・富山県の稲作指導】
    a_mizo() { if (!this.transDoy || this.headDoy) return '田植えのあと、穂が出る前に'; if (this.mizo) return 'もう溝を切りました'; if (this.doy < this.transDoy + 10) return '苗がしっかり根づいてから(田植えから10日ほど)'; this.mizo = this.doy; this.labor += LABOR.mizo; }
    // 草とり(手で): 田に入って、稲の間の草を抜く。何回でもできるが、効き目はだんだん小さくなる(残った草ほど抜きやすい)。穂が出たら田に入らない(根や穂を傷める)【農家の声】
    a_weed() { if (!this.transDoy) return '田植え(種まき)のあとに'; if (this.headDoy) return '穂が出たあとは田に入りません'; if (this.doy - (this.lastWeed ?? -99) < 5) return '前の草とりから5日はあけます';
      this.lastWeed = this.doy; this.weeds = (this.weeds || 0) + 1; this.weedPulled = Math.min(0.06, this.weedPulled + 0.012 / this.weeds); this.labor += LABOR.weed;
      for (const e of this.patrolEvents()) if (!e.fixed && ['hie', 'konagi', 'ibokusa'].includes(e.kind)) { e.fixed = true; e.how = 'weed'; this.patrolLog.fixed[e.kind]++; } }   // 見回りで見つけたヒエ・コナギ・イボクサも抜ける
    a_herb2() { if (!this.transDoy || this.headDoy) return '田植えのあと、穂が出る前に'; if (this.herb2) return 'もう使いました'; if (this.doy < this.transDoy + 20) return '最初の除草剤から20日ほどあけます'; this.herb2 = true; this.labor += LABOR.herb * 0.4; }
    a_water(p) { if (!this.transDoy || this.harvestDoy) return '田んぼに水がありません'; if (this.method === 'direct' && !this.flooded) return '先に入水を'; if (this.water === 'mid') return '中干し中です'; this.water = p.mode; }
    a_mid(p) {
      if (this.method === 'direct' && !this.flooded) return 'まだ水を入れていません';
      if (!this.transDoy || this.headDoy) return 'いまは中干しできません';
      if (this.midStart) return 'もう中干しをしました';
      this.midStart = this.doy; this.midExtend = !!p.extend; this.midLen = this.midExtend ? 19 : 12; // 標準12日・延長+7日
      this.water = 'mid'; this.stemsAtMid = this.stems;
    }
    a_top(p) { if (!this.transDoy || this.harvestDoy) return '追肥できません'; this.tops.push({ doy: this.doy, kg: p.kg }); this.labor += LABOR.top; }
    a_spray(p) {
      if (!this.transDoy || this.harvestDoy) return '散布できません';
      const t = p.target, before = { blast: this.blast, sheath: this.sheath, bph: this.bph }[t] || 0;
      this.sprays.push({ doy: this.doy, target: t, contract: !!p.contract }); if (!p.contract) this.labor += LABOR.spray;
      if (t === 'blast') { this.blast *= 0.3; this.blastProt = this.doy + 14; }
      if (t === 'sheath') { this.sheath *= 0.3; }
      if (t === 'bph') { this.bph *= 0.1; this.bphProt = this.doy + 10; }
      if (!p.contract) this.msg('🧪 ' + this.sprayNote(t, before));    /* 薬が何に効いたかを、その場で知らせる(画面だけ。計算は変えない) */
    }
    sprayNote(t, b) {
      const d = this.doy, H = this.headDoy;
      if (t === 'blast') return b >= 0.003 ? 'いもち病の広がりを約3割におさえました。' + fmt(d + 14) + 'までは広がりにくくなります。' : 'いもち病はまだ出ていませんでした。予防として' + fmt(d + 14) + 'まで効きます。';
      if (t === 'bph') return b >= 1 ? 'ウンカを約1割にへらしました。' + fmt(d + 10) + 'までは、ふえにくくなります。' : 'ウンカはいませんでした。' + fmt(d + 10) + 'までは、来てもふえにくくなります。';
      if (t === 'sheath') return b < 0.05 ? '紋枯病は出ていなかったので、今回は効き目がありませんでした(このゲームでは、出ている紋枯病をへらす薬です)。' : '紋枯病を約3割にへらしました。' + (H ? '穂が出たあとなので、収量・品質へのききめは小さめです。' : '株がこみあうと、また広がることがあります。');
      if (t === 'bug') return !H ? 'カメムシの薬は、穂が出る2日前から穂が出て' + Farm.BUG_LAST + '日後までにまいた分が効きます(このゲームの設定)。' + (this.headingIfPlanted ? '穂が出る見こみは' + fmt(this.headingIfPlanted(this.transDoy)) + 'ごろなので、' : '') + (this.headingIfPlanted && d < this.headingIfPlanted(this.transDoy) - 2 ? '今回は早すぎて効き目はありません。' : '今回の分は効きます。') : d <= H + Farm.BUG_LAST ? '穂の汁を吸うカメムシをへらし、斑点のある粒をふせぎます(効くのは' + fmt(H + Farm.BUG_LAST) + 'まで)。' : '穂が出て' + Farm.BUG_LAST + '日を過ぎたので、カメムシの薬の効き目はありません。';
      return '';
    }
    a_mow() { this.mows.push(this.doy); this.labor += LABOR.mow; }
    a_flush(p) { if (this.drainDoy) return '落水した後です'; this.flush = !!p.on; }
    a_drain() { if (!this.transDoy || this.drainDoy) return '落水できません'; this.drainDoy = this.doy; this.water = 'drained'; this.flush = false; }
    // 見回りの時刻(朝・昼・夕): 旬ごとに変わる。雨の日は昼。3Dの光と見回りの文で同じものを使う(乱数の列は使わない)
    timeOfDay(d) { d = d == null ? this.doy : d; const last = this.daily && this.daily[this.daily.length - 1]; if (last && last.rain && d === this.doy) return 1; return [0, 1, 1, 2, 1, 0, 1, 2][(Math.imul(d ^ 0x5bd1, 2246822519) >>> 13) % 8]; }
    // 風と天気予報: 強い風の日は乱数の列を動かさないよう、日付と田の番号から決める【設定】。予報は5日先だと外れることがある
    windy(d) { const m = dateOf(d).m, h = (Math.imul((this.seedP ^ Math.imul(d, 40503)) >>> 0, 2654435761) >>> 0) % 100; return this.w.typhoons.some((t) => Math.abs(t - d) <= 1) || h < (m >= 4 && m <= 6 ? 9 : 4); }
    forecast(d) {
      const ahead = d - this.doy, h = (Math.imul((this.seedP ^ Math.imul(d, 69069)) >>> 0, 2246822519) >>> 0) % 100, r = this.w.rain[d] || 0;
      if (ahead <= 0) return { rain: r, wind: this.windy(d), sure: true };
      const miss = h < 30;   // 5日先の予報は3割ほど外れる【設定】
      return { rain: miss ? (r >= 5 ? 0 : 12) : r, wind: miss ? !this.windy(d) && h < 8 : this.windy(d), sure: false };
    }
    a_harvest(p) {
      if (!this.headDoy) return 'まだ穂が出ていません';
      if (this.doy < this.headDoy + 25) return 'まだ実っていません';
      this.dry = p && p.dry ? p.dry : 'ce';
      this.wetHarvest = (this.w.rain[this.doy] || 0) >= 5 || (this.w.rain[this.doy - 1] || 0) >= 20;   // 雨の日・大雨の翌日に刈ると、濡れた稲でコンバインが詰まり、取りこぼしもふえる【農家の声(2026年秋の長雨ほか)】
      if (this.wetHarvest) this.msg('雨で濡れた稲を刈ったので、コンバインが詰まりやすく、取りこぼしもふえました');
      this.harvestDoy = this.doy; this.phase = 'harvested'; this.softField = this.method !== 'direct' && (!this.midStart || (!this.mizo && (this.midRain || 0) >= 40));   // 中干しをしないと秋まで田がやわらかく、コンバインが沈む【農家の声】
      this.labor += LABOR.harvest * (this.lodged ? 1.9 : 1) * (this.softField ? 1.25 : 1) * (this.wetHarvest ? 1.3 : 1) *   /* 倒れた稲は倒れた向きに沿って刈り、速さは半分。詰まりやすい【広島・新潟の農家の声】 */ (1 + Math.min(0.3, 0.06 * this.nagaeLv)) + (this.dry === 'ce' ? 0 : this.dry === 'fast' ? LABOR.dry * 0.6 : LABOR.dry);
      this.done = true;
    }

    // ---- 1日進める ----
    step() {
      if (this.done) return;
      const d = this.doy, T = this.w.T[d], Tx = this.w.Tmax[d], rain = this.w.rain[d];
      // JAの一斉防除: 前日から雨が続いている日は飛ばさずに延ばす(雨の合間なら朝のうちにまく)。5日待っても飛べなければその回は中止【海部の一斉防除の報告「梅雨時期で計画どおり防除できない日があった」を元に設定】
      if (this.contract && this.transDoy && !this.harvestDoy) {
        const TG = { blast: 'いもち病', bug: 'カメムシ', bph: 'ウンカ' };
        this.cWait = this.cWait || [];
        for (const [cd, tg] of this.contractPlan()) if (cd === d) this.cWait.push({ cd, tg });
        const wetSpell = rain && this.w.rain[d - 1];
        this.cWait = this.cWait.filter((c) => {
          if (!wetSpell) { this.act('spray', { target: c.tg, contract: true }); this.msg('JAのドローンで一斉防除(' + TG[c.tg] + ')' + (d > c.cd ? '・雨で' + (d - c.cd) + '日おくれ' : '')); return false; }
          if (d - c.cd >= 5) { this.msg('雨が続き、JAの一斉防除(' + TG[c.tg] + ')は中止になりました'); return false; }
          if (d === c.cd) this.msg('雨のため、JAの一斉防除(' + TG[c.tg] + ')は延期です');
          return true;
        });
      }
      const ORDER = { dsow: 5, flood: 6.5, salt: 0, box: 1, buy: 1.5, sow: 2, till: 3, basal: 4, oneshot: 4, puddle: 4.5, plant: 5, herb: 6, herb2: 6.2, weed: 6.4, water: 7, mizo: 7.5, mid: 8, top: 9, mow: 10, spray: 11, flush: 12, drain: 13, harvest: 14 }; // 同じ日は作業の順番どおりに
      for (const q of this.queue.filter((q) => q.doy === d).sort((a, b) => (ORDER[a.name] - ORDER[b.name]) || (a.id - b.id))) { const n0 = this.msgs.length, e = this.act(q.name, q.p); if (e) this.msg('予約していた「' + (JOB[q.name] || q.name) + '」ができませんでした: ' + e); else if (this.msgs.length === n0) this.msg('✅ 予約していた「' + (JOB[q.name] || q.name) + '」がすみました'); }   /* 任せた作業の完了を報告(Codex13回目⑦)。文だけ */
      this.queue = this.queue.filter((q) => q.doy > d);
      const rec = { doy: d, T, Tmax: Tx, rain, stems: 0, phase: this.phase, flush: false };
      if (this.phase === 'field' && !this.harvestDoy) {
        rec.flush = this.flush; if (this.flush) this.labor += LABOR.flushDay;
        if (this.water === 'deep' && d - this.transDoy <= 30) this.deepDays = (this.deepDays || 0) + 1;
        if (this.herbDoy != null && d - this.herbDoy < 7 && (this.leakOpen || this.water === 'mid') && !this.herbLeak) { this.herbLeak = true; this.msg('除草剤をまいたあとの7日間に田の水が抜けて、除草剤の効きが落ちました(止水が基本)'); }   // 除草剤は水に溶けて田面に膜をつくる。7日は水を止めて落とさない【各県の使用の注意】
        const v = this.v, days = d - this.transDoy;
        // 中干しの終わり
        if (this.water === 'mid') this.midRain = (this.midRain || 0) + (rain || 0);   // 中干し中の雨。溝がないと、雨で田が乾かない
        if (this.water === 'mid' && d >= this.midStart + this.midLen) { this.water = 'intermittent'; this.midEnd = d; if (!this.mizo && (this.midRain || 0) >= 40) this.msg('中干し中に雨が多く、溝がないので田がよく乾きませんでした'); }
        // 直播の出芽: 種まきの翌日から Σ(日平均−10℃) が80に届いた日。早くまいても芽が出るのは4月20日ごろから、5/5まきは5/15ごろ【愛知 V直マニュアル 表2・図40に合わせた設定】
        if (this.method === 'direct' && !this.emergeDoy) {
          if (d > this.transDoy) this.accE += Math.max(T - 10, 0);
          // 湿害: 種が動き出す4月中旬から出芽までに、田に水たまりが4日以上続くと土の中の芽が窒息する。4月中旬より前は長く水につかっても死なない【愛知 V直マニュアル】
          // 雨の日が4日続いたら水たまりが4日続いたとみなし、苗立ちが4割減る(6日以上で6割減)【設定】
          if (d >= doyOf(4, 15)) {
            this.wetRun = rain ? (this.wetRun || 0) + 1 : 0;
            if (this.wetRun === 4 || this.wetRun === 6) { this.stems *= this.wetRun === 4 ? 0.6 : 0.4 / 0.6; this.wetHit = (this.wetHit || 0) + 1; this.msg(this.wetRun === 4 ? '雨が4日続いて田に水がたまり、土の中の芽が一部だめになりました(湿害)' : '雨がさらに続き、芽がだいぶ減りました'); }
          }
          if (this.accE >= Farm.EMERGE) { this.emergeDoy = d; this.msg('芽が出そろいました(出芽)'); }
        }
        const grow = this.method !== 'direct' || (this.emergeDoy != null && d > this.emergeDoy);   // 直播は出芽までは育たない
        // 出穂・成熟
        if (!this.headDoy) {
          if (d > this.transDoy && grow) this.accH += Math.max(T - 10, 0);
          if (!this.piDoy && this.accH >= this.Hneed - 420) { this.piDoy = d; this.tillerStop = true; this.panicles = this.maxStems * (this.midStart || this.method === 'direct' ? 0.78 : 0.70); this.msg('幼穂ができはじめました(出穂のおよそ25日前)'); }
          if (!this.meiDoy && this.accH >= this.Hneed - 180) this.meiDoy = d;
          if (this.accH >= this.Hneed) { this.headDoy = d; this.msg('穂が出ました!(出穂)'); }
        } else if (!this.matDoy) {
          this.accR += T;
          if (this.accR >= v.ripe) { this.matDoy = d; this.msg('実りました。刈りどきです(成熟期)'); }
        }
        // 茎(分げつ): 活着(約1週間)のあと、12℃を超えた分の積算で増える。田植えから Σ(T−12) が TILL_END に届いたら頭打ち(最高分げつ期)【設定】
        if (this.leakOpen && ['shallow', 'deep', 'intermittent'].includes(this.water)) { this.leakDays++; if (this.headDoy) this.leakDaysH++; }   // 畦の穴から水が抜けた日
        if (grow) this.accTill = (this.accTill || 0) + Math.max(T - 12, 0);
        if ((this.method === 'direct' ? d - this.emergeDoy > 7 : days > (this.puddleOK() ? 7 : 11) + (this.ageLag || 0)) && grow && !this.tillerStop && this.accTill < Farm.TILL_END) { // 直播は出芽の約1週間後から(地上に出たときに本葉2枚)【設定】 // 代かきをしないと根づきが遅れる【設定】
          const fW = (this.leakOpen && ['shallow', 'deep', 'intermittent'].includes(this.water) ? 0.75 : 1) * ({ shallow: 1, deep: 0.6, mid: 0.35, intermittent: 0.7, drained: 0.2, dryfield: 0.6 }[this.water] ?? 1);
          const fN = clamp(this.nVeg() / this.nVegOpt(), 0.4, 1.5);
          const Smax = 680 * Math.sqrt(fN);
          this.stems += Farm.TILL_K * (this.method === 'direct' ? Farm.DIRECT_TILL : (60 / this.density) ** Farm.SPARSE) * Math.max(T - 12, 0) * fW * fN * this.stems * (1 - this.stems / Smax); // 直播は苗が密に立つぶん分げつが少ない【推測】
        }
        this.maxStems = Math.max(this.maxStems, this.stems);
        // いもち病: 雨の日で15〜25℃が感染に向く(葉が10時間以上ぬれる条件の代わり)。直播は芽が出るまで葉がないので起きない
        if (grow && (!this.headDoy || d <= this.headDoy + 5)) {
          const prot = d <= this.blastProt || (this.box && days <= 50);
          const sus = v.blast * clamp(this.nVeg() / this.nVegOpt(), 0.7, 1.5) * (this.tillDepth < 15 ? 1.3 : 1) * (this.salt ? 1 : 1.2);
          if (!prot) {
            if (rain && T >= 15 && T <= 25) { this.blast += 0.0005 * sus; this.blast *= 1 + 0.06 * sus; }
            else if (this.blast > 0) this.blast *= T > 28 ? 0.98 : 1 + 0.01 * sus;
          }
          this.blast = Math.min(this.blast, 1);
          if (d === this.headDoy + 5 || (this.headDoy && this.blastHead == null && d > this.headDoy + 5)) this.blastHead = this.blast;
        }
        // 紋枯病: 平均22℃以上で広がる。茎が多い・肥料が多いと出やすい
        if (days > 30 && T >= 22) this.sheath = Math.min(1, this.sheath + 0.0012 * (this.stems / 450) ** 2 * (this.headDoy ? 1.5 : 1));
        this.sheathMax = Math.max(this.sheathMax || 0, this.sheath);
        // トビイロウンカ: 6月下旬に飛来。1世代=10℃を超えた分の積算500℃日【NARO】、1世代で約10倍【設定】
        if (d === this.bphArr) this.bph += this.bphSeed;
        if (this.bph > 0) {
          const prot = d <= this.bphProt || (this.box && days <= 50);
          this.bph *= prot ? 0.9 : Math.pow(10, Math.max(T - 10, 0) / 500) * (this.nTotal() > this.nTotalOpt() * 1.1 ? 1.002 : 1);
          this.bphMax = Math.max(this.bphMax, this.bph);
          if (this.bph > 40 && !this._bphWarn) { this._bphWarn = true; this.msg('ウンカで稲が丸く枯れはじめました(坪枯れ)'); }
        }
        // 台風
        if (this.w.typhoons.includes(d)) { this.typhoonHit++; this.msg('台風が来ました'); if (this.headDoy && this.lodgeIndex() > 0.8) { this.lodged = true; this.msg('稲が倒れました(倒伏)'); } }
        if (this.headDoy && !this.lodged && d > this.headDoy + 15 && this.lodgeIndex() > 1.25) { this.lodged = true; this.msg('稲が重さで倒れました(倒伏)'); }
        rec.stems = this.stems;
      }
      this.daily.push(rec);
      this.doy++;
      if (this.doy > 330 && !this.done) { // 11月下旬で強制終了
        if (this.headDoy) this.act('harvest'); if (!this.done) this.done = true;
      }
    }
    msg(t) { this.msgs.push({ doy: this.doy, t }); }

    // ---- 窒素 ----
    // 地力から出る窒素は 前半45%・後半55%【設定】。基肥の利用率0.35・追肥0.6【設定】
    // 直播の一発肥料は効きが悪い(乾いた田の期間がある)。県が直播に移植より多く(コシ7/4.5・ほか10/8)決めている比を効きの差とみなす【愛知 施肥基準の比から設定】
    osAmt() { return (this.oneshot || 0) * (this.method === 'direct' ? this.v.fert.oneshot / this.v.fert.direct : 1); }
    nVeg() { return this.soil.N * 0.45 + this.basal * 0.35 + this.osAmt() * 0.45 * Farm.OS_V + this.tops.filter((t) => !this.piDoy || t.doy < this.piDoy).reduce((s, t) => s + t.kg * 0.6, 0); }
    nVegOpt() { return SOIL.mid.N * 0.45 + this.v.fert.basal * 0.35; }
    nTotal() { return this.soil.N + this.basal * 0.35 + this.osAmt() * (0.45 * Farm.OS_V + 0.55 * Farm.OS_R) + this.tops.reduce((s, t) => s + t.kg * 0.6, 0); }
    nTotalOpt() { const f = this.v.fert; return SOIL.mid.N + f.basal * 0.35 + (f.p1 + f.p2) * 0.6; }
    // 代かきが田植えの7日前以内なら効く(早すぎると雑草が生え直す)【設定】
    puddleOK() { return this.method === 'direct' || (this.puddleDoy != null && this.transDoy != null && this.transDoy - this.puddleDoy <= 7); }
    lodgeIndex() {
      return this.v.lodge * (this.panicles / this.v.panRef) ** 2 * (this.nTotal() / this.nTotalOpt()) ** 2 * (this.midStart ? (this.midExtend ? 0.85 : 0.95) * (this.mizo ? 0.94 : (this.midRain || 0) >= 40 ? 1.06 : 1) : this.method === 'direct' ? Farm.DIRECT_LODGE : 1.25);  // V溝直播は田が固く倒れにくい【愛知】(強さは推測)
    }

    // ---- 1ターン(旬)進める: 次の旬の始まりまで ----
    // ---- 見回り(お世話) ----
    // 旬のはじめに、田んぼで起きていることを決める(見回らなくても起きる)。見回ると気づけて、その場で手を打てる
    patrolEvents() {
      if (this.pEvDoy === this.doy) return this.pEv;
      const d = this.doy, R = rng((this.seedP ^ Math.imul(d, 2654435761)) >>> 0), ev = [], H = this.headDoy, m = dateOf(d).m;
      const add = (kind, text, extra) => ev.push(Object.assign({ id: d * 10 + ev.length, kind, text, fixed: false }, extra || {}));
      // 育苗ハウス: 晴れた朝に開けないと、昼には中が高温になって苗が焼ける(ハウス1棟の苗箱が全部だめになった例も)。寒い日の翌日の急な晴れはムレ苗【農家の声・JAささかみ・長野県/確率と害の大きさは設定】
      if (this.sowDoy && !this.transDoy && !this.bought && this.method !== 'direct' && this.w.Tmax[d] >= 20 && R() < 0.6) add('vent', (this.w.rain[d] || 0) >= 1 ? '☔ 雨の日でも、ハウスの中は昼に蒸し暑くなります。少し開けて風を通し、夕方は冷えないうちに閉めます。' : this.w.Tmax[d] >= 25 ? '☀️ よく晴れた朝。育苗ハウスを開けて風を通さないと、昼には中が40℃をこえて苗が焼けます。' : '☀️ 晴れた朝。育苗ハウスを少し開けて、苗がむれないように。夕方は冷えないうちに閉めます。', { care: '換気する(朝に開けて、夕方に閉めるまで。この1回で今日の分はすみます・約10分)', labor: 0.15 });
      if (this.sowDoy && !this.transDoy && d % 3 !== 0) { const SP = ['🐦 ツバメが田の上を飛びまわっています。', '🐦 「キリッ」とケリ。田んぼに巣をつくる鳥です。', '🌼 畦にタンポポ。', '🐸 アマガエルが、苗箱のふちでひなたぼっこ。', '🦋 モンシロチョウがひらひら。']; add('life', SP[(d * 7) % SP.length]); }   /* 苗を育てる間の生き物(乱数を使わない=結果を変えない・ループ9 k1) */
      if (this.transDoy && !this.harvestDoy) {
        const wet = ['shallow', 'deep', 'intermittent'].includes(this.water);
        // 畦の穴: アメリカザリガニの巣穴(モグラの穴も)から水が漏れる。入水〜落水のあいだ。8〜9月は大きな個体・繁殖期でふえる【愛知県・東海農政局 ザリガニ防除の手引(2026)/頻度は設定】
        if (wet && d >= doyOf(6, 1) && !this.drainDoy && R() < (m >= 8 ? 0.3 : 0.2)) add('leak', this.patrolLog.fixed.leak + this.patrolLog.missed.leak ? '🕳️ また畦の外側から水がしみ出しています(この田で' + (this.patrolLog.fixed.leak + this.patrolLog.missed.leak + 1) + '回目)。' + (this.patrolLog.missed.leak ? '前に見のがした穴が広がったか、新しく掘った穴です。' : '前にふさいだ穴からまた漏れたか、ザリガニが新しく掘った穴です。') + '穴はまた出るもの(東海農政局・愛知県の手引)。同じ所もふくめて入口を探してふさぎ、水が止まったか確かめます。' : '🕳️ 畦の外側から水がしみ出しています。ザリガニが掘った穴から、田の水が抜けています(はじめはじわじわ、だんだん水の道が広がります)。', { care: '田の側の入口を探して、ふさいで踏み固める(約10分)', labor: 0.15 });
        // ヒエの取り残し: 除草剤のあとも少し残る。手で抜く(手取り除草)
        const days = d - this.transDoy, noHerb = this.method === 'direct' ? this.herbs.length < 3 : !this.herb;
        if (!H && days >= 15 && days <= 70 && R() < (noHerb ? 0.7 : this.herbLeak ? 0.45 : 0.2) * ((this.deepDays || 0) >= 10 ? 0.6 : 1)) add('hie', '🌿 稲の株にまぎれてヒエが残っています(近づくまで気づきません。葉のつけ根に、稲にはある「葉舌」がない)。穂が出る前に手で抜いて、田の外へ。', { care: 'ヒエを抜く(約20分)', labor: 0.3 });
        // スズメ: 乳熟期(出穂10〜15日後)からの穂をつつく。まわりより早く実る田に集まりやすい【岩手県農業研究センター】。防鳥テープは鳥が慣れるので効き目は約20日【農水省 鳥類被害防止マニュアル/日数は設定】
        if (H && d >= H + 10 && !(this.birdNet && d - this.birdNet < 20) && R() < 0.3 * (1 + Math.min(10, Math.max(0, this.nbrHeading() - H)) / 10)) add('bird', this.birdNet ? '🐦 スズメがまた来ています。防鳥テープに慣れてしまったようです。' : '🐦 スズメが穂をついばんでいます。まわりより早く実る田に集まりやすい鳥です。', { care: this.birdNet ? '防鳥テープを張りなおす(約30分)' : '防鳥テープを張る(約30分・鳥はだんだん慣れます)', labor: 0.5 });
        // ナガエツルノゲイトウ(特定外来生物の難防除雑草)。1cmの茎のかけらから再生し、稲に寄りかかって伸び、倒れた稲に覆いかぶさるとコンバインで刈れない。愛知では東浦町の河川と、2025年5月に尾張地域の水田で確認(西三河の水田では確認情報なし)→まれに出る【愛知県 特殊報(2025)・農研機構 防除マニュアル/頻度は設定】
        // 見つけたら抜かずに連絡(田んぼなら県の農業総合試験場・JA、田んぼの外なら県の自然環境課・市町村)。引き抜くと、ちぎれたかけらから広がる
        if (!this.nagaeDone && m >= 6 && m <= 9 && (this.nagaeLv > 0 || R() < 0.01)) add('nagae', this.nagaeLv > 0 ? '🌱 水路のそばのナガエツルノゲイトウが広がっています(' + ['', '少し', 'かなり', 'たくさん'][Math.min(3, this.nagaeLv)] + ')。茎のかけらからも根を出す外来の雑草です。' : '🌱 水路のそばに見なれない草。中が空洞の茎が水面を這い、向かい合った細長い葉、長い柄の先に白い丸い花。外来の雑草「ナガエツルノゲイトウ」かもしれません(愛知県でも、2025年に尾張の田んぼで見つかっています)。', { care: '試験場・JA・役場に連絡する(抜かない・約5分)', labor: 0.08, alt: { key: 'pull', label: '自分で引き抜く(約20分)', labor: 0.3 } });
        // 病害虫のはじまり(気づくと防除の判断が早くなる)
        // ジャンボタニシ(スクミリンゴガイ): 殻が15mm以上の貝が、田植え後2〜3週間のやわらかい苗を食べる。水を浅く(4cm以下)すると食べにくい。卵はピンクで、水に落とすとかえらない。愛知の実証試験地の1つが西尾市一色町【愛知県・農水省 防除対策マニュアル・香川県】
        const dT = this.transDoy ? d - this.transDoy : -1;
        if (this.floated && !this.floatFixed && dT >= 1 && dT <= 20) add('float', '🌬️ 植えた日の強い風で、苗が浮いて流され、ところどころ抜けています(浮き苗)。続けて抜けている所だけ、残した苗で植えなおします(田植えから3週間まで)。', { care: '補植する(約1時間)', labor: 1.0 });
        if (this.snailField && !this.snailCared && this.method !== 'direct' && dT >= 3 && dT <= 21 && R() < 0.8) { const hold = this.herbDoy != null && d - this.herbDoy < 7, deep = this.water === 'deep';   /* 水の指示がぶつかるときの順番(Codex12回目②)。文だけ・乱数は動かさない */
          add('snail', '🐌 植えたばかりの苗が、ところどころ抜けています。水面にジャンボタニシ(西尾市でも被害の多い地区があります)。田植えのあと3週間は、水を浅く(4cmほど)すると苗を食べにくくなります。'
            + (hold ? '💧 どれを先に? 除草剤をまいて7日のあいだは「水を抜かない(止水)」が先。水は抜かずに、足し水をひかえて自然に浅くします。' : deep ? '💧 どれを先に? 雑草よけの深水の途中でも、苗が食べられている間は浅水が先。田植えから3週間をすぎて苗がかたくなったら、深水にもどせます。' : ''),
            { care: hold ? '足し水をひかえて浅くし、貝をとる(水は抜かない・約20分)' : '浅水にして、貝をとる(約20分)', labor: 0.3 }); }
        if (this.snailField && m >= 6 && m <= 8 && wet && R() < 0.5) add('egg', '🩷 稲の茎や水路の壁に、ピンクのつぶつぶ。ジャンボタニシの卵です。水の中に落とすと、かえりません。', { care: '卵を水に落とす(約10分)', labor: 0.15 });
        // 雑草との戦い【宮城県 水稲の雑草・宮城県古川農試(ノビエ本数と収量)・農研機構】
        //  コナギ: 一年生。田植えのあとすぐ〜1か月に出る。除草剤がよく効く/オモダカ・クログワイ: 多年生。土の中のイモ(塊茎)から長くばらばら出て、最初の除草剤では止まりにくい→中後期の除草剤/イボクサ: 畦ぎわから這って入る
        const herbOK = this.herb && !this.herbLeak;
        if (!herbOK && this.method !== 'direct' && dT >= 12 && dT <= 45 && R() < (this.herb ? 0.35 : 0.6)) add('konagi', '🍃 稲の間に、ハート形のつやのある葉の草。コナギです(根が紫色)。稲と肥料を取り合って、穂の数がへります。', { care: '手で取る(約1時間)', labor: 1.0 });
        if (this.omoField && !this.herb2 && !H && dT >= 30 && dT <= 70 && R() < 0.55) add('omodaka', '🏹 やじり形の葉の草が、あちこちから。オモダカです。土の中の小さなイモから、田植えのあともばらばら出てきます。最初の除草剤では止まりにくい草です。', { care: '中後期の除草剤をまく(約30分)', labor: 0.5, alt: { key: 'pull', label: '手で抜く(約1時間・イモが残ってまた出ます)', labor: 1.0 } });
        if (this.kuroField && !this.herb2 && !H && dT >= 25 && dT <= 70 && R() < 0.5) add('kurogwai', '🎋 丸くて中が空洞の茎が、つんつん立っています。クログワイです(指でつぶすとパチパチ鳴ります)。ふえると3割へることもある、手ごわい草です。', { care: '中後期の除草剤をまく(約30分)', labor: 0.5, alt: { key: 'pull', label: '手で抜く(約1時間・イモが残ってまた出ます)', labor: 1.0 } });
        if (m >= 7 && m <= 8 && !H && this.mows.filter((x) => x >= d - 40).length === 0 && R() < 0.35) add('ibokusa', '🌱 畦ぎわから、這うように田に入ってくる草。イボクサです。種が玄米にまじると、等級が下がることがあります。', { care: '畦ぎわを抜く(約30分)', labor: 0.5 });
        // 病気・害虫の見つけ方【島根県・石川県(いもち病)・愛知県病害虫防除所・島根県/熊本県(ウンカの払い落とし)・京都府/埼玉県(紋枯病)・愛知県(イネカメムシのすくい取り)】
        if (!H && this.blast > 0.004 && R() < 0.9) add('blast', '🍂 葉に、両はしのとがった細長い斑点。まん中が灰色で、ふちは茶色、まわりが黄色い。いもち病(葉いもち)のはじまりです。', { spray: 'blast' });
        else if (H && d <= H + 15 && this.blast > 0.004 && R() < 0.9) add('blast', '🍂 穂の首が茶色くなり、白っぽい穂がまじっています。穂いもちです。', { spray: 'blast' });
        if (m >= 7 && (!H || d <= H + 20) && this.sheath > 0.05 && R() < 0.8) add('sheath', '🍂 株元の水ぎわに、ふちが茶色で中が灰色の、楕円のしみ。紋枯病です。上の葉へのぼっていないか見ましょう。', { spray: 'sheath' });
        if (H && d >= H - 3 && d <= H + 12 && this.bugIndex * (this.Y.kame || 1) > 1.05 && R() < 0.7) add('kame', '🪲 網を20回ふると、細長い茶色のカメムシが入りました。イネカメムシです。穂が出るころに籾の汁を吸われると、実りません。', { spray: 'bug' });
        if (H && this.bph > 3 && R() < 0.9) add('bph', this.bph > 40 ? '🟤 田の一部が、丸く枯れています(坪枯れ)。株元にトビイロウンカがびっしり。放っておくと、円が外へ広がります(2020年には西尾市・岡崎市でも)。' : '🦗 株元をたたくと、茶色の小さな虫が水面にパラパラ落ちました。トビイロウンカです。坪枯れになる前に防除を。', { spray: 'bph' });
        // 中干しの田に足を入れてみる: 乾き具合の見きわめ。小さなひびが入り、足あとがつく程度(長ぐつが沈まない)で終わりの目安。大きなひびは入れすぎ【各県の稲作指導(新潟県・岩手県)・農家の声】。乱数は使わない
        if (this.water === 'mid' && this.midStart != null) { const k = d - this.midStart, dry = k + (this.mizo ? 2 : 0) - Math.min(4, Math.floor((this.midRain || 0) / 15));
          add('soil', dry <= 3 ? '👣 田に足を入れると、まだ長ぐつがずぶっと沈みます。中干しは始まったばかり。' + (this.mizo ? '' : '溝を切っておくと、水がよく抜けます。') : dry <= 14 ? '👣 細かいひびと足あと。ちょうどよい乾き具合です。水は予定の日に自動でもどるので、このままで大丈夫。' : '👣 田に大きなひびが入っています。乾かしすぎると根が切れます。そろそろ水を入れるころ(決まった日に自動でもどります)。'); }
        // 生き物(お世話はいらない。見回りの楽しみ)
        // 生き物: 田んぼの水生昆虫など。時期と水のようすで変わる。圃場整備(乾田化・用排水の分離・コンクリート水路)で減ったものは「まれ」にする。区分は環境省レッドリスト2020・レッドリストあいち2025
        //  タガメ: 国VU・県EN・特定第二種国内希少野生動植物種 / ゲンゴロウ: 国VU・県CR / ミズスマシ: 国VU・県CR / ガムシ: 国NT・県CR / ドジョウ: 国NT・県VU / ミナミメダカ: 国VU・県VU
        const sinceWater = d - (this.method === 'direct' ? (this.flooded || 999) : (this.puddleDoy ?? this.transDoy)), wetNow = ['shallow', 'deep', 'intermittent'].includes(this.water);
        let L;
        /* 生き物の文は短く(店主 10/28「文字を減らして」)。図鑑は名前で拾う */
        if (H && d <= H + 8) L = ['🌼 稲の花。午前中だけ、白いおしべが顔を出します。'];
        else if (this.water === 'mid') L = ['🐸 水たまりにオタマジャクシが集まっています。', '🐸 小さなカエルがぴょんぴょん。'];
        else if (wetNow && sinceWater >= 0 && sinceWater <= 35) L = (sinceWater >= 10 ? ['🦐 ホウネンエビ。さかさまで泳ぎます。'] : []).concat(['🫧 ミジンコがいっぱい。', '🐸 オタマジャクシの群れ。', '💧 アメンボがすいすい。', '🦞 ザリガニが水の中をのそのそ。']);
        else if (wetNow && m >= 6 && m <= 8) L = ['🪲 マツモムシが背泳ぎ。', '🪲 ヒメゲンゴロウがすいすい。', '🍃 稲にヤゴの抜けがら。', '🐸 トノサマガエルがジャンプ。', '🐦 白いサギが、田んぼをゆっくり歩いています。', '🐸 苗の葉に、緑のアマガエルがちょこん。', '🐸 「ブォー」と低い声。ウシガエルです。', '🦆 カルガモの親子が一列に。', '🔵 シオカラトンボが稲の先に。', '💧 アメンボがすいすい。', '🦞 ザリガニがはさみを上げています。'];
        else if (m <= 5) L = ['🐸 アマガエルの合唱。', '🐦 ツバメが田の上を飛びまわっています。', '🐦 「キリッ」とケリ。田んぼに巣をつくる鳥です。'];
        else if (m === 8) L = ['🦗 バッタがぴょんぴょん。', '🕷️ 稲のあいだに、まるいクモの巣。', '🕷️ クモの巣に朝露がきらきら。'];
        else L = ['🦗 イナゴが稲の葉に。', '🔴 赤とんぼが田の上に。', '🌺 畦に彼岸花。モグラよけに植えられてきた花です。'];
        if (wetNow && m >= 6 && m <= 8) { const r = R();
          if (r < 0.0005) L = ['✨ ゲンゴロウ!愛知ではまぼろしの虫です。'];
          else if (r < 0.0015) L = ['✨ タガメ!いちばん大きな水生昆虫。見るだけに。'];
          else if (r < 0.03) L = ['🐟 ドジョウが顔を出しました。', '🐟 メダカの群れ(愛知の絶滅危惧種)。', '🌀 ミズスマシがくるくる(愛知ではめずらしい虫)。']; }
        if (R() < 0.7) add('life', L[Math.floor(R() * L.length)]);
      }
      this.pEvDoy = d; this.pEv = ev;
      return ev;
    }
    patrol() { const ev = this.patrolEvents(); if (this.pDone !== this.doy) { this.pDone = this.doy; this.patrolLog.patrols++; for (const e of ev) if (e.kind === 'life' && !this.patrolLog.life.includes(e.text)) this.patrolLog.life.push(e.text); } return ev; }
    care(id, opt) {
      const e = this.patrolEvents().find((x) => x.id === id);
      if (!e || e.fixed || !e.care) return '手を打てるものがありません';
      if (e.kind === 'nagae') {   // 連絡すれば専門家と駆除(この年はおしまい)。引き抜くとかけらが流れて広がる
        e.fixed = true; e.how = opt === 'pull' ? 'pull' : 'report';
        if (e.how === 'pull') { this.labor += e.alt.labor; this.nagaeLv = Math.min(5, this.nagaeLv + 2); this.patrolLog.nagae = 'pull'; this.msg('引き抜いたナガエツルノゲイトウのちぎれた茎が水に流れ、あちこちで根を出してしまいました'); }
        else { this.labor += e.labor; this.nagaeDone = true; this.nagaeLv = 0; this.patrolLog.nagae = 'report'; this.msg('ナガエツルノゲイトウを県・役場に連絡しました。専門家と封じ込めます'); }
        return null;
      }
      const alt = e.alt && opt === e.alt.key;
      e.fixed = true; e.how = alt ? opt : 'main'; this.labor += alt ? e.alt.labor : e.labor; this.patrolLog.fixed[e.kind]++;
      if (e.kind === 'bird') this.birdNet = this.doy; if (e.kind === 'float') { this.floatFixed = true; this.floatLoss = 0.003; } if (e.kind === 'snail') this.snailCared = true;   // 浅水にしたあとは食べられにくい
      if (e.kind === 'hie') this.weedPulled = Math.min(0.06, this.weedPulled + 0.01);   // 手で抜いた分だけ雑草の害が減る(除草剤なしでも)
      if (e.kind === 'konagi') this.weedPulled = Math.min(0.06, this.weedPulled + 0.008);
      if (e.kind === 'omodaka' || e.kind === 'kurogwai') { if (alt) this.weedPulled = Math.min(0.06, this.weedPulled + 0.004); else this.herb2 = true; }   // 手で抜いても土の中のイモ(塊茎)が残り、また出る。中後期の除草剤なら止まる
      return null;
    }
    runTurn() {
      if (this.done) return;
      // 見回りで手を打たなかったものは、この旬のあいだに効く【設定】
      const ev = this.patrolEvents();
      this.leakOpen = ev.some((e) => e.kind === 'leak' && !e.fixed);
      if (ev.some((e) => e.kind === 'nagae' && !e.fixed)) { this.nagaeLv = Math.min(5, this.nagaeLv + 1); this.patrolLog.nagaeMissed = (this.patrolLog.nagaeMissed || 0) + 1; }   // 見のがすと毎旬ひろがる
      for (const e of ev) if (!e.fixed && e.care && e.kind !== 'nagae') { this.patrolLog.missed[e.kind]++; if (e.kind === 'hie') this.weedExtra = Math.min(0.1, this.weedExtra + 0.008); if (e.kind === 'konagi') this.weedExtra = Math.min(0.1, this.weedExtra + 0.01); if (e.kind === 'omodaka' || e.kind === 'kurogwai') this.weedExtra = Math.min(0.1, this.weedExtra + (e.kind === 'kurogwai' ? 0.02 : 0.012)); if (e.kind === 'ibokusa') this.weedExtra = Math.min(0.1, this.weedExtra + 0.004); /* 見のがすと草がふえる【設定・クログワイは200g/㎡で3割減(宮城県)】 */ if (e.kind === 'bird') this.birdLoss = Math.min(0.04, this.birdLoss + 0.01); if (e.kind === 'snail') this.snailLoss = Math.min(0.05, this.snailLoss + 0.015); if (e.kind === 'float') this.floatLoss = Math.min(0.03, this.floatLoss + 0.012); if (e.kind === 'vent') this.ventLoss = Math.min(0.04, this.ventLoss + (this.w.Tmax[this.doy] >= 25 ? 0.02 : 0.008)); }   // タニシ: 見のがすと欠株がふえる【設定】
      do { this.step(); } while (!this.done && !isTurnDay(this.doy));
      this.leakOpen = false;
    }

    // ---- 結果 ----
    result() {
      const v = this.v, w = this.w;
      if (!this.headDoy || !this.harvestDoy) return { ok: false, reason: '収穫できませんでした' };
      const H = this.headDoy, hv = this.harvestDoy;
      let mat = this.matDoy;
      if (!mat) { let acc = this.accR, d = hv; for (; d < 365; d++) { acc += w.T[d]; if (acc >= v.ripe) break; } mat = d; } // 成熟前に刈ったとき
      const blastH = this.blastHead != null ? this.blastHead : this.blast, sheathM = this.sheathMax || this.sheath;
      const flushOn = (d) => { const r = this.daily[d - this.daily[0].doy]; return r && r.flush ? 0.5 : 0; };
      const sumOver = (a, b, f) => { let s = 0; for (let d = a; d <= b; d++) s += f(d); return s; };
      const meanOver = (a, b, f) => sumOver(a, b, f) / (b - a + 1);
      // 追肥を出穂からの日数で分ける(負=出穂前)
      let nSpk = 0, nFill = 0, nLate = 0, nAfter = 0;
      const O = this.osAmt(), rel = O * 0.275 * (Farm.OS_R / 0.6);    // 一発肥料が穂の時期に溶け出す分(追肥に直すと)
      for (const t of this.tops.concat(O ? [{ doy: H - 20, kg: rel }, { doy: H - 12, kg: rel }] : [])) {
        const k = H - t.doy; // 出穂前の日数
        if (k > 30) nSpk += t.kg * 0.3;              // 早すぎ: 茎が増えるだけ
        else if (k >= 18) { nSpk += t.kg * 1.0; nFill += t.kg * 0.5; }
        else if (k >= 8) { nSpk += t.kg * 0.5; nFill += t.kg * 1.0; }
        else if (k >= 0) { nFill += t.kg * 0.6; nLate += t.kg; }
        else nAfter += t.kg;                         // 実肥(出穂後)
      }
      const f = v.fert;
      const nSpkOpt = (f.p1d >= 18 ? f.p1 : f.p1 * 0.5) + (f.p2d >= 18 ? f.p2 : f.p2 * 0.5);
      const nFillOpt = (f.p1d >= 18 ? f.p1 * 0.5 : f.p1) + (f.p2d >= 18 ? f.p2 * 0.5 : f.p2);
      const soilR = this.soil.N / SOIL.mid.N;
      const nRep = (soilR * 3 + nSpk) / (3 + nSpkOpt);         // 生殖期の窒素(1.0=基準どおり)
      const nFil = (soilR * 3 + nFill) / (3 + nFillOpt);
      const U = this.nTotal() / this.nTotalOpt();
      // 穂数・籾数
      const pan = this.panicles;
      const spp = v.sppBase * (0.85 + 0.15 * clamp(nRep, 0.3, 1.4)) * Math.pow(pan / v.panRef, -0.4);
      // 田植えの時期: 標準より10日以上遅いと生育期間が短く籾が減る(あいちのこころ 5/19植え561kg→6/8植え533kg)、14日以上早いと低温で少し減る【計算: 愛知 安定栽培マニュアル表4】
      const plantDev = this.transDoy - v.stdPlant;
      const plantF = this.method === 'direct'
        ? 1 - 0.004 * Math.max(0, this.transDoy - (v.dsowEnd - 15))   // 直播: 早まきは出芽がそろうだけで損はない。晩限の半月前より遅いと減る【愛知 V直マニュアル: 晩限に近いと生育量と収量が不足】【設定】
        : 1 - 0.004 * Math.max(0, plantDev - 10) - 0.003 * Math.max(0, -plantDev - 14);
      const spk = pan * spp * plantF; // 粒/㎡
      const spkOpt = v.panRef * v.sppBase;
      // 登熟歩合
      const sterHeat = clamp(meanOver(H, H + 4, (d) => Math.max(0, w.Tmax[d] - 35)) * 0.04, 0, 0.4);   // 室内は35℃超で1℃ごと約16%、田んぼは2018猛暑の東海で11%(平常5%)【NARO→計算】
      const coldSum = this.meiDoy ? sumOver(H - 14, H - 7, (d) => Math.max(0, v.coldTc - w.T[d])) : 0;
      const sterCold = clamp(coldSum * 0.026, 0, 0.9);                                                // 平均17℃×7日で55%【NARO】
      const excess = Math.max(0, spk / spkOpt - 1.0) * 0.9;
      const pBlast = clamp(blastH * 2, 0, 0.5) * (this.sprays.some((s) => s.target === 'blast' && s.doy >= H - 10 && s.doy <= H + 3) ? 0.3 : 1);
      const midOverPI = this.midStart && this.piDoy && (this.midStart + this.midLen > this.piDoy + 3) ? 0.93 : 1; // 幼穂形成期の水不足は減収【愛知】
      const extLoss = this.midExtend ? 0.97 : 1;                                                       // 中干し延長は平均3%減収【MAFF】
      const drainOK = Math.max(H + 25, mat - 7);                                                        // 落水は出穂後25日ごろ以降【農水省 水稲栽培のポイント】かつ収穫7日前までは水を切らない【愛知】
      const drainEarly = this.drainDoy ? Math.max(0, drainOK - this.drainDoy) : 0;
      const flowerDry = this.drainDoy && this.drainDoy < H + 10 ? 0.95 : 1;
      let rr = 0.86 * (1 - sterHeat) * (1 - sterCold) * (1 - excess) * (1 - pBlast) * (1 - 0.3 * sheathM) * (this.lodged ? 0.9 : 1)
        * (1 - 0.004 * drainEarly) * midOverPI * extLoss * flowerDry * (this.midStart || this.method === 'direct' ? 1 : 0.96) * (0.92 + 0.08 * clamp(nFil, 0, 1));
      // イネカメムシ: 出穂直後の籾を吸って不稔にする(愛知では2021年から急増)。出穂期(前2日〜後4日)の防除で大きく防げ、遅れた防除は一部だけ【愛知 2025年10大成果・令和6年注意報】。量は【設定】(防除なしで平年4%前後の減収)
      const kameS = this.sprays.filter((s) => s.target === 'bug').map((s) => s.doy - H);
      const kameP = kameS.some((k) => k >= -2 && k <= 4) ? 0.2 : kameS.some((k) => k >= 5 && k <= 10) ? 0.6 : 1;
      const sterKame = clamp(Farm.KAME * this.bugIndex * (this.Y.kame || 1) * kameP * (1 + 0.04 * Math.min(10, Math.abs(H - this.nbrHeading()))), 0, 0.3);
      rr *= 1 - sterKame;
      rr = clamp(rr, 0.05, 0.92);
      // 千粒重: 登熟期が暑いと軽くなる【NARO: 約23℃以上で急に減る。当地の平年に合わせて27.5℃を基準に】
      const t20 = meanOver(H, H + 19, (d) => w.T[d]);                                                // 実際の気温(表示用)
      const t20eff = meanOver(H, H + 19, (d) => w.T[d] - flushOn(d));                                  // かけ流しで下がった水温を考えた値(計算用)
      const flushDays = sumOver(H, H + 19, (d) => (flushOn(d) ? 1 : 0));
      const gw = v.gw * (1 - 0.02 * Math.max(0, t20eff - 27.5)) * (0.97 + 0.03 * clamp(nFil, 0, 1.2));
      // 収穫時期
      const late = hv - mat, early = mat - hv;
      const harvestF = early > 0 ? 1 - 0.0033 * early - (early > 10 ? 0.01 * (early - 10) : 0) : 1; // 6日早いと約2%減【NARO】
      const weedBase = this.herb ? (this.herbLeak ? 0.03 : 0) : (this.deepDays || 0) >= 10 ? 0.04 : 0.08;                     // 【設定】深水で雑草が減る【NARO】
      const weedLoss = this.method === 'direct' ? [0.25, 0.1, 0.04, 0][Math.min(3, this.herbs.length)] + (this.flooded ? 0 : 0.1) : this.puddleOK() ? weedBase : this.puddleDoy != null ? weedBase + 0.02 : weedBase * 1.5 + 0.03; // 代かきなし・早すぎは雑草が多い【設定】
      const bphLoss = clamp((this.bphMax - 40) / 300, 0, 0.6);
      const weedNet = Math.max(0, weedLoss + this.weedExtra - this.weedPulled);   // 見回りでヒエを見のがすと増え、手で抜くと減る
      const yieldKg = spk * rr * gw / 1000 * harvestF * (1 - weedNet) * (1 - 0.001 * this.leakDays) * (1 - this.birdLoss) * (1 - this.snailLoss) * (1 - this.ventLoss) * (1 - this.floatLoss) * (this.wetHarvest ? 0.98 : 1) * (1 - Math.min(0.05, 0.01 * this.nagaeLv)) * (1 - bphLoss) * (this.method === 'direct' && !this.flooded ? 0.6 : 1);
      // 品質
      const HD = sumOver(H, H + 19, (d) => Math.max(0, w.T[d] - flushOn(d) - 26));         // 26℃超過の積算【NARO】
      const nShort = Math.max(0, 1 - nFil);
      let white = ((v.baseWhite ?? 2) + v.heatK * HD + 0.2 * this.leakDaysH) * (1 + 0.8 * nShort) * (1 + 0.5 * sheathM) * Math.max(1, spk / spkOpt) ** 1.5;
      white = clamp(white, 1, 80);
      const tmax10 = meanOver(H, H + 9, (d) => w.Tmax[d]);
      const crack = clamp(1 + 0.6 * Math.max(0, tmax10 - 32) + 0.4 * Math.max(0, late - 6) + 0.1 * drainEarly + (this.dry === 'fast' ? 2 + 0.5 * Math.max(0, tmax10 - 32) : 0), 0, 30); // 急な乾燥(高い熱風で毎時の乾き方が大きい)は胴割れが増え、暑さで傷んだ年ほど増える【茨城県農業総合センター・乾燥機メーカーの解説=傾向のみ。量は推測】 // 32〜33℃以上で増える【MAFF/NARO】
      // 斑点米: 畦の草刈りは出穂10日前までに【MAFF/NARO】
      const mowOK = this.mows.some((m) => m >= H - 25 && m <= H - 10);
      const mowBad = this.mows.some((m) => m > H - 10 && m <= H + 10);
      const weedF = mowBad ? 1.6 : mowOK ? 0.5 : this.mows.length ? 1.1 : 1.3;
      const bugSprays = this.sprays.filter((s) => s.target === 'bug' && s.doy >= H - 2 && s.doy <= H + Farm.BUG_LAST).map((s) => s.doy).sort((a, b) => a - b);
      let sprayF = 1;
      if (bugSprays.length) {
        sprayF = Math.min(...bugSprays.map((s) => (s - H >= 5 && s - H <= 12 ? 0.3 : 0.45)));        // 出穂8日後が最も効く(参考)
        if (bugSprays.some((a) => bugSprays.some((b) => b - a >= 6 && b - a <= 14))) sprayF *= 0.5;   // 7〜14日後の2回目【愛知】
      }
      const offDays = Math.abs(H - this.nbrHeading()), offF = 1 + 0.04 * Math.min(10, offDays);   // ずれ1日で4%・最大4割増し【設定】
      const color = clamp(0.12 * this.bugIndex * offF * weedF * sprayF, 0, 5);
      const green = early > 3 ? Math.min(15, (early - 3) * 1.0) : 0;
      const dead = 1 + (sterHeat > 0.1 ? 1 : 0);
      const other = 6; // その他の未熟粒・被害粒【設定】
      const seiryuRaw = clamp(100 - white - crack - color - dead - green - other, 0, 100);
      // 玄米の検査規格: 整粒の最低・被害粒等(被害粒・死米・着色粒など)の合計の最高・死米・着色粒【MAFF】
      const damagedRaw = crack + color + dead + 2; // 胴割粒は被害粒。その他の被害粒2%は【設定】
      const GR = [['1等', 70, 15, 7, 0.1], ['2等', 60, 20, 10, 0.3], ['3等', 45, 30, 20, 0.7]];
      let grade = '規格外'; const gradeWhy = [];
      for (const [g, sm, dm, dd, cm] of GR) { if (seiryuRaw >= sm && damagedRaw <= dm && dead <= dd && color <= cm) { grade = g; break; } }
      if (grade !== '1等') { if (seiryuRaw < 70) gradeWhy.push('seiryu'); if (damagedRaw > 15) gradeWhy.push('damaged'); if (color > 0.1) gradeWhy.push('color'); }
      const up = (x, k) => Math.ceil(x * k - 1e-9) / k, down = (x, k) => Math.floor(x * k + 1e-9) / k; // 表示が判定と食い違わないように
      const seiryu = down(seiryuRaw, 10), colorR = up(color, 100), crackR = Math.round(crack * 10) / 10;
      white = Math.round(white * 10) / 10;
      // 食味: 玄米タンパク(水分15%)で星を付ける。6.5%以下=コシヒカリ並み【NARO】。1kg/10aの窒素で約0.1ポイント【NARO】
      const nApplied = this.basal + this.osAmt() / 0.9 + this.tops.reduce((a, t) => a + t.kg, 0), nRec = f.basal + f.p1 + f.p2; // 側条は約1割少ない量で同じ効き(愛知)
      const prot = clamp(6.3 + 0.1 * (nApplied - nRec) + 0.1 * (this.soil.N - SOIL.mid.N) + 0.15 * nLate + 0.3 * nAfter + 1.0 * Math.max(0, spk / spkOpt - 1) - (this.midExtend ? 0.15 : 0) + (this.lodged ? 0.1 : 0) - (nShort > 0.2 ? 0.2 : 0), 5.2, 8.5);
      const stars = prot <= 5.9 ? 5 : prot <= 6.3 ? 4 : prot <= 6.7 ? 3 : prot <= 7.1 ? 2 : 1;
      return {
        ok: true, variety: v.name, year: this.Y.name, soil: this.soil.name,
        transplant: fmt(this.transDoy), heading: fmt(H), maturity: fmt(mat), harvest: fmt(hv), earlyDays: Math.max(0, early), lateDays: Math.max(0, late), drainEarly, oneshot: this.oneshot || 0, bought: !!this.bought, method: this.method, contract: this.contract, dry: this.dry || 'ce', herbs: this.herbs.length, flooded: !!this.flooded, puddled: this.puddleDoy != null, puddleOK: this.puddleOK(), weedLoss: +weedLoss.toFixed(3),
        panicles: Math.round(pan), spp: Math.round(spp), spikelets: Math.round(spk), ripening: +(rr * 100).toFixed(1), grainWt: +gw.toFixed(1),
        yield: Math.round(yieldKg), white, crack: crackR, color: colorR, seiryu, grade, gradeWhy, green, colorRaw: color, seiryuRaw, damagedRaw, damaged: Math.ceil(damagedRaw * 10 - 1e-9) / 10,
        protein: +prot.toFixed(2), stars, labor: +this.labor.toFixed(1),
        HD: +HD.toFixed(1), t20: +t20.toFixed(1), flushDays, tmax10: +tmax10.toFixed(1),
        lodged: this.lodged, blast: +blastH.toFixed(3), sheath: +sheathM.toFixed(3), bphMax: +this.bphMax.toFixed(1), sterHeat: +sterHeat.toFixed(3), sterCold: +sterCold.toFixed(3), sterKame: +sterKame.toFixed(3), patrol: JSON.parse(JSON.stringify(this.patrolLog)), leakDays: this.leakDays, nagaeLv: this.nagaeLv, birdLoss: this.birdLoss, snailLoss: this.snailLoss, ventLoss: this.ventLoss, floatLoss: this.floatLoss, wetHarvest: !!this.wetHarvest, weedNet: +weedNet.toFixed(3), offDays,
        methaneCut: this.midExtend, msgs: this.msgs.map((m) => fmt(m.doy) + ' ' + m.t),
      };
    }
  }

  Farm.TILL_K = 0.0115; Farm.TILL_END = 450; Farm.BUG_LAST = 22; // カメムシ防除が効くのは出穂22日後まで【設定】
  // 一発肥料(側条施肥)の利用率: 田植え〜穂のもとができるまで=OS_V、その後=OS_R【設定】(愛知: 側条施肥は全層分施より約1割少ない量で同じ効き)
  Farm.OS_V = 0.5; Farm.OS_R = 0.75;
  Farm.SPARSE = 0.3; // 疎植ほど1株の分げつが多い(坪37〜70株で収量に差なし【愛知 こころ安定栽培マニュアル】に合わせる)
  Farm.KAME = 0.04; Farm.EMERGE = 80; Farm.DIRECT_TILL = 0.8; Farm.DIRECT_LODGE = 0.5; // 直播の分げつ: 土が固く分げつが出にくい【愛知 V直マニュアル・量は推測】/ 倒れやすさ: 冬に固めた田は倒伏しにくく、コシヒカリも問題なく作れる【愛知 V直マニュアル・東海農政局 2026・量は設定】
  return { Farm, VARIETIES, SOIL, YEARS, NORM, doyOf, dateOf, fmt, isTurnDay, interp, LABOR };
});

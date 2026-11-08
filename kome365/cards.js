/* 米づくり365 カード生成。cardFor(f) は必ず1枚返す。
   card = { key, tag, icon, title, text, left:{label,hint}, right:{label,hint}, apply(side,f), focus? }
   優先順位: 1 季節の必須作業 → 2 天気 → 3 見回り事件 → 4 平穏な日 → フォールバック */
(function () {
  'use strict';
  var K = window.Kome365, fmt = K.fmt, dateOf = K.dateOf, doyOf = K.doyOf;

  // ---------- 小道具 ----------
  function snoozed(f, k) { return !!(f._sn && f._sn[k] > f.doy); }
  function snooze(f, k, n) { (f._sn = f._sn || {})[k] = f.doy + n; }
  function run(f, name, p) { var e = f.act(name, p); if (e) f.msg('⚠ ' + e); return e; }
  // ver: その選択が「良い/悪い」の判定。{ok, why} か f→{ok, why}。選んだ直後に一言で返す(選ぶ前の田んぼの状態で判定する)
  function Y(why) { return { ok: true, why: why }; }
  function N(why) { return { ok: false, why: why }; }
  function opt(label, hint, fn, ver) { return { label: label, hint: hint || '', fn: fn || function () {}, ver: ver }; }
  // 期限の作業の右側: 同じ作業をしたあと、田を見て回る(作業が失敗したときは何も足さない)
  function afterWalk(fn, key, msg) { return function (f) { var r = fn(f); if (!r) return r; f.patrol(); mark(f, key, 'walk'); return msg; }; }
  function card(key, tag, icon, title, text, L, R, extra) {
    var c = { key: key, tag: tag, icon: icon, title: title, text: text,
      left: { label: L.label, hint: L.hint }, right: { label: R.label, hint: R.hint }, judged: !!(L.ver || R.ver),
      verdict: function (side, f) { var o = side === 'left' ? L : R, v = typeof o.ver === 'function' ? o.ver(f) : o.ver; return v ? v.ok : null; },   // 検証用: その側が正解か(判定のない側は null)
      apply: function (side, f) {
        var o = side === 'left' ? L : R, v = typeof o.ver === 'function' ? o.ver(f) : o.ver, r = o.fn(f) || '';
        if (!v || !r) return r;   // エラー(r='')のときは判定しない
        var j = f._judge = f._judge || { ok: 0, ng: 0 }; if (v.ok) j.ok++; else j.ng++;
        return (v.ok ? '⭕ ' : '❌ ') + v.why;
      } };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }
  // 暦の日(1〜365)。本編(エンジンの季節中)は f.doy と同じ。準備(1〜79日目)と収穫後は f._cal だけが進む
  function day(f) { if (f._cal == null) f._cal = 1; return f._cal >= 80 && !f.done ? f.doy : f._cal; }
  function wx(f) {
    var d = day(f), T = f.w.T[d], Tx = f.w.Tmax[d], r = f.w.rain[d] ? 1 : 0, ic, s;   // 雨は「降った日か」だけ(mmの数値はない)
    var ty = f.w.typhoons.some(function (t) { return d - t >= 0 && d - t <= 2; });   // Field3D も台風の当日から2日後まで雨を描く。HUDの文もそろえる
    if (ty) { ic = '🌀'; s = '台風の雨風'; r = 1; } else if (r) { ic = '🌧️'; s = '雨'; }
    else if (Tx >= 33) { ic = '🔥'; s = '猛暑'; } else if (Tx >= 28) { ic = '☀️'; s = '暑い晴れ'; } else if (T < 2) { ic = '🥶'; s = '底冷え・霜'; } else if (T < 8) { ic = '🥶'; s = '寒い'; }
    else if (Tx < 18) { ic = '☁️'; s = 'くもり、ひんやり'; } else { ic = '🌤️'; s = '晴れ'; }
    if (!ty && f.windy(d)) { ic = '🌬️'; s += '・風が強い'; }
    return { icon: ic, text: s, temp: Math.round(T * 10) / 10, tmax: Math.round(Tx), rain: r };
  }
  function dayStr(f) { var x = dateOf(day(f)); return x.m + '月' + x.d + '日'; }
  function lead(f) { var w = wx(f); return dayStr(f) + '、' + w.text + '(平均' + w.temp + '℃)。'; }
  function waterName(f) { return { shallow: '浅水', deep: '深水', intermittent: '間断かんがい(水を切らして入れる)', mid: '中干し中', drained: '落水ずみ', dryfield: '乾いた田', none: '水なし' }[f.water] || f.water; }
  function planP(f) { return Math.max(f.v.stdPlant, f.v.window[0]); }
  function oneshotKg(f) { return (f.method === 'direct' ? f.v.fert.direct : f.v.fert.oneshot) + Math.round(f.soil.basalAdj * 2 / 3 * 2) / 2; }
  function headEst(f) { return f.headDoy || f.forecastHeading(); }
  function fertMode(f) { return f.method === 'direct' ? 'oneshot' : (f._fert || 'oneshot'); }

  // ---------- 1. 季節の必須作業 ----------
  // どの選択にも「状態から分かる正解」がある。正解(⭕)・不正解(❌)は選んだ直後に一言で返す
  function sowCard(f) {
    if (f.method === 'direct' || f.sowDoy || f.doy < planP(f) - 20 || f.checkAt('sow', f.doy)) return null;
    var early = !!(f._prep && f._prep.seed === 'early');   // 冬のうちに種もみを用意した年は、塩水選までの準備がすんでいる
    return card('sow', '必須作業', '🌱', '種まき(育苗)',
      lead(f) + '田植えの20日ほど前、苗づくりをはじめるころ。' + f.v.name + 'の田植えの目安は' + fmt(planP(f)) + 'ごろ。' + (early ? '冬のうちに種もみを用意してあります。' : '') + '種もみをどう用意する?',
      opt('選んで薬入れ', '重い種だけ選び、育苗箱に薬を入れる。手間はふえるが苗がそろい、病気に強い', function (f) { run(f, 'salt'); run(f, 'box'); return run(f, 'sow') ? '' : '塩水選をして種をまきました'; }, Y('塩水選と箱の薬で、苗がそろい病気にも強くなりました')),
      early ? opt('塩水選だけ', '冬の準備で塩水選はすませてある。箱の薬は入れない', function (f) { run(f, 'salt'); return run(f, 'sow') ? '' : '準備ずみの種もみで、種をまきました'; }, N('箱の薬がないと、田植え後50日ほどのいもち病・ウンカへの守りがありません'))
        : opt('そのまままく', '塩水選をしない。苗の立ちが落ちる(茎1割減)・いもち病にも弱くなる', function (f) { return run(f, 'sow') ? '' : '種をまきました'; }, N('塩水選をしなかったので、苗の立ちが落ち、いもち病にも弱くなります')));
  }
  function dsowCard(f) {
    if (f.method !== 'direct' || f.transDoy || f.doy < doyOf(3, 25) || f.checkAt('dsow', f.doy)) return null;
    var cold = f.doy < doyOf(4, 1);
    return card('dsow', '必須作業', '🌱', '田んぼに種まき(直播)',
      lead(f) + '冬に整地した乾いた田に、種を直接まく時期。' + f.v.name + 'は' + fmt(f.v.dsowEnd) + 'までに。遅いほど穂が出るのが遅れます。' + (cold ? '早まきは苗立ちが減ります。' : ''),
      opt('7kgまく', '10aあたり7kg。県の目安', function (f) { return run(f, 'dsow', { kg: 7 }) ? '' : '種を7kgまきました'; }, Y('標準の量で苗立ちが足り、穂数がそろいます')),
      opt('6kgにへらす', '種代と手間は減るが、苗立ちが少ない', function (f) { return run(f, 'dsow', { kg: 6 }) ? '' : '種を6kgまきました'; }, N('苗立ちが足りず、穂数が不足しがちです')));
  }
  function tillCard(f) {
    if (f.method === 'direct' || !f.sowDoy || f.transDoy || f.tillDepth != null || f.doy < planP(f) - 12) return null;
    return card('till', '必須作業', '🚜', '田起こし',
      lead(f) + '苗を育てている間に、田んぼの土をおこして空気を入れます。' + f.v.name + 'は、いもち病に' + (f.v.blast >= 1 ? '弱い' : f.v.blast >= 0.7 ? 'やや弱い' : '強め') + '品種です。深さはどうする?',
      opt('浅耕10cm', '手間は少し減る。土に空気が入りにくい', function (f) { return run(f, 'till', { depth: 10 }) ? '' : '浅く耕しました'; }, N('浅い耕起は土に空気が入らず、いもち病が出やすくなります')),
      opt('深耕15cm', '標準の深さ。しっかり耕す', function (f) { return run(f, 'till', { depth: 15 }) ? '' : '15cmで耕しました'; }, Y('15cmしっかり耕して、いもち病の出にくい土になりました')));
  }
  function basalCard(f) {
    if (f.basalDone || f.doy >= 400) return null;
    var direct = f.method === 'direct', mode = fertMode(f);
    if (direct ? (!f.transDoy || f.flooded) : (!f.sowDoy || f.transDoy || f.doy < planP(f) - 9)) return null;
    var r = mode === 'oneshot' ? oneshotKg(f) : f.v.fert.basal + f.soil.basalAdj, lo = Math.max(0, r - 2), name = mode === 'oneshot' ? 'oneshot' : 'basal';
    return card('basal', '必須作業', '🧺', mode === 'oneshot' ? '一発肥料' : '基肥(元肥)',
      lead(f) + (mode === 'oneshot' ? '1回まけば穂肥のいらない肥料。' : '最初の肥料。') + 'この田(' + f.soil.name + ')の目安は窒素' + r + 'kg。',
      opt(r + 'kgまく', '県の基準に地力の分を足し引きした量', function (f) { return run(f, name, { kg: r }) ? '' : '窒素' + r + 'kgをまきました'; }, Y('目安の量で、稲が育つ肥料がそろいました')),
      opt(lo + 'kgに減', '倒れにくいが、実りは減りやすい', function (f) { return run(f, name, { kg: lo }) ? '' : '窒素' + lo + 'kgをまきました'; }, N('肥料が足りず、茎が少なく実りが減りやすくなります')));
  }
  function puddleCard(f) {
    if (f.method === 'direct' || f.transDoy || f.puddleDoy || f._noPuddle || f.tillDepth == null || !f.sowDoy || f.doy < Math.max(doyOf(4, 1), planP(f) - 3) || f.checkAt('puddle', f.doy)) return null;
    return card('puddle', '必須作業', '💧', '代かき',
      lead(f) + '田植えの2〜3日前に水を入れ、土を細かく平らにします(田植えの目安' + fmt(planP(f)) + ')。代かきから7日以内に植えると、草が出にくくなります。',
      opt('代かきを省く', '水と手間は減るが、土がならず草が出やすい', function (f) { f._noPuddle = true; return '代かきを省きました'; }, N('代かきを省くと土がならず、雑草がふえやすくなります')),
      opt('代かきをする', '水を入れて土を平らにする', function (f) { return run(f, 'puddle') ? '' : '代かきをしました'; }, Y('田植え直前の代かきで、雑草の出にくい田になりました')));
  }
  function plantCard(f) {
    if (f.method === 'direct' || !f.sowDoy || f.transDoy || f.doy < planP(f) || f.plantCheck()) return null;
    if (!f.puddleDoy && !f._noPuddle && f.doy < f.v.window[1] - 5) return null;
    var last = f.doy >= f.v.window[1] - 3, age = f.doy - f.sowDoy, wind = f.windy(f.doy), ageN = !f.bought && age >= 22 ? '苗は' + age + '日目。26日を過ぎると老化します。' : '苗は' + age + '日目。';
    var plant = function (f) { return run(f, 'plant', { density: 60 }) ? '' : '田植えをしました'; };
    if (last) return card('plant', '必須作業', '🌾', '田植え(ぎりぎり)', lead(f) + ageN + '田植えの時期(' + fmt(f.v.window[1]) + 'まで)が終わります。今日植えます。',
      opt('今日植える', '', plant), opt('植えて、苗の浮きを見る', '', afterWalk(plant, 'plant', '田植えをして、苗の浮きを見て回りました')));
    if (wind) {
      if (snoozed(f, 'plant')) return null;
      return card('plant', '必須作業', '🌬️', '田植え:風が強い', lead(f) + ageN + '強い風の日に植えると、苗が浮いて流されます(浮き苗)。',
        opt('それでも植える', '浮き苗になって、あとで植え直しが要る', plant, N('強い風の日に植えたので、苗が浮いて欠株が出ました')),
        opt('風待ちする', '2日後にまた考える', function (f) { snooze(f, 'plant', 2); return '田植えを見送りました'; }, Y('強風の日を避けて、浮き苗をふせぎました')));
    }
    if (snoozed(f, 'plant')) return null;
    return card('plant', '必須作業', '🌾', '田植え', lead(f) + ageN + '田植えの時期は' + fmt(f.v.window[0]) + '〜' + fmt(f.v.window[1]) + '。目安は' + fmt(planP(f)) + 'ごろ。' + (f.v.early ? f.v.name + 'は早く植えるほど暑さの前に穂が出ます。' : ''),
      opt('あと3日待つ', '苗は20日前後が植えどき。待つほど老化と遅れが心配', function (f) { snooze(f, 'plant', 3); return '田植えを3日待ちます'; }, N('植えどきをのがすと、苗が老化して穂が出るのも遅れます')),
      opt('今日植える', '株間を標準(60株/坪)で', plant, Y('風もなく適期。苗が元気なうちに植えられました')));
  }
  function herbCard(f) {
    if (!f.transDoy || f.headDoy || f.harvestDoy) return null;
    if (f.method === 'direct') {
      var n = f.herbs.length, last = n ? f.herbs[n - 1] : -99;
      if (n >= 3 || f.doy - last < 10 || snoozed(f, 'herb')) return null;
      var first = n === 0 && !f.flooded && f.doy >= f.transDoy + 2, after = f.flooded && n <= 2 && f.doy <= f.flooded + 15 && n < 2;
      if (!first && !after) return null;
      return card('herb', '必須作業', '🌿', n === 0 ? '除草剤(草枯らし)' : '除草剤(入水後の一発剤)', lead(f) + (n === 0 ? '芽が出る前に、先に出た草をおさえます。' : '入水したら、' + (n + 1) + '回目の除草剤。') + '雑草が残ると収量が減ります。',
        opt('2日待つ', '芽の出方を見て決める', function (f) { snooze(f, 'herb', 2); return '除草剤を見送りました'; }, N('草が大きくなると、除草剤が効きにくくなります')),
        opt('まく', '草をおさえる。次まで10日あける', function (f) { return run(f, 'herb') ? '' : '除草剤をまきました'; }, Y('草が小さいうちにおさえて、雑草の害が減りました')));
    }
    if (f.herb || f._noHerb || f.doy < f.transDoy + 3 || f.doy > f.transDoy + 20) return null;
    return card('herb', '必須作業', '🌿', '雑草対策', lead(f) + '田植えから' + (f.doy - f.transDoy) + '日。除草剤は田植えから20日以内(' + fmt(f.transDoy + 20) + 'まで)に使います。',
      opt('手で草とり', '手間はかかるが薬は使わない。取り残しが出る', function (f) { f._noHerb = true; return run(f, 'weed') ? '' : '田に入って草をとりました'; }, N('手では取りきれず、雑草が残ります(薬より効きは小さい)')),
      opt('除草剤をまく', '草をおさえる。まいた後7日は水を漏らさない', function (f) { return run(f, 'herb') ? '' : '除草剤をまきました'; }, Y('除草剤で草の芽をまとめておさえました')));
  }
  function floodCard(f) {
    if (f.method !== 'direct' || !f.transDoy || !f.emergeDoy || f.flooded || f.checkAt('flood', f.doy)) return null;
    var late = f.doy >= f.emergeDoy + 8, go = function (f) { return run(f, 'flood') ? '' : '入水しました'; };
    if (late) return card('flood', '必須作業', '🚰', '入水', lead(f) + '芽が出てしばらくたちました。水を入れます。', opt('入水する', '', go), opt('入水して、水口を見る', '', afterWalk(go, 'flood', '入水して、水口を見て回りました')));
    if (snoozed(f, 'flood')) return null;
    return card('flood', '必須作業', '🚰', '入水', lead(f) + '芽が出そろいました(' + fmt(f.emergeDoy) + ')。田に水を入れる時期です。',
      opt('2日待つ', '草の様子を見てから', function (f) { snooze(f, 'flood', 2); return '入水を見送りました'; }, N('水がないと、草が稲より先に伸びてしまいます')),
      opt('入水する', '浅水ではじめる', go, Y('芽が出そろったところで入水。水が草をおさえます')));
  }
  function mizoCard(f) {
    if (f.method === 'direct' || !f.transDoy || f.headDoy || f.midStart || f.mizo || f._noMizo || f.doy < f.transDoy + 10) return null;
    if (!(f.stems >= 0.6 * f.v.panRef || f.doy - f.transDoy >= 25)) return null;
    return card('mizo', '必須作業', '⛏️', '溝切り', lead(f) + '中干しの前に、田に溝を切っておくと水がよく抜けます(雨の多い年でも田が乾く)。',
      opt('しない', '雨が多いと田が乾きにくくなる', function (f) { f._noMizo = true; return '溝切りは見送りました'; }, N('溝がないと水が抜けきらず、田が固まらずに倒れやすくなります')),
      opt('溝を切る', '手間はふえるが、中干しがよく効く', function (f) { return run(f, 'mizo') ? '' : '溝を切りました'; }, Y('溝を切ったので、中干しで水がよく抜けます')));
  }
  function midCard(f) {
    if (f.method === 'direct' || !f.transDoy || f.headDoy || f.midStart || f.water === 'mid') return null;
    var v = f.v, days = f.doy - f.transDoy, ready = f.stems >= 0.8 * v.panRef || days >= 35;
    if (!ready) return null;
    var H = headEst(f), pass = H - f.doy < 28 || days >= 50, many = f.stems >= 1.1 * v.panRef, pct = Math.round(f.stems / v.panRef * 100);
    var txt = lead(f) + '茎は' + Math.round(f.stems) + '本(穂の目安' + v.panRef + '本の' + pct + '%)。田植えから' + days + '日。' + '水を抜いて土を固め、根を強くする「中干し」の時期です。';
    var go = function (ext) { return function (f) { return run(f, 'mid', { extend: ext }) ? '' : '中干しをはじめました(' + (ext ? '19' : '12') + '日)'; }; };
    if (pass) return card('mid', '必須作業', '🏜️', '中干し(今がぎりぎり)', txt + 'これ以上待つと穂のもとができる時期にかかります。' + (many ? '茎が目安より多すぎます。' : '茎は多すぎません。'),
      opt('12日干す', '', go(false), many ? N('茎が多いのに標準の日数では、まだ倒れやすいままです') : Y('茎の数にちょうどよい日数で、減収なしに根を強くできました')),
      opt('19日干す', '茎が多すぎるときに。ただし約3%減収', go(true), many ? Y('茎が多すぎたので長めに干して、倒れにくくなりました') : N('茎が多くないのに長く干したので、約3%減収します')));
    if (snoozed(f, 'mid')) return null;
    return card('mid', '必須作業', '🏜️', '中干し', txt + '茎が穂の目安の8割をこえたら始めます。',
      opt('2日待つ', '待ちすぎると穂のもとの時期にかかる', function (f) { snooze(f, 'mid', 2); return '中干しを見送りました'; }, N('茎がふえすぎて、倒れやすくなります')),
      opt('始める', '標準は12日ほど', go(false), Y('茎が目安に届いた、中干しどきです')));
  }
  function topCard(f) {
    if (f.method === 'direct' || fertMode(f) !== 'split' || f.headDoy || !f.transDoy) return null;
    var n = f.tops.length + (f._topSkips || 0), fe = f.v.fert, H = f.forecastHeading();
    if (n > 1 || !H) return null;
    var before = n === 0 ? fe.p1d : fe.p2d, kg = n === 0 ? fe.p1 : fe.p2;
    if (f.doy < H - before - 2 || H - f.doy < 8) return null;
    return card('top', '必須作業', '🧺', '穂肥(' + (n + 1) + '回目)', lead(f) + '穂が出る約' + before + '日前(' + fmt(H - before) + 'ごろ)に、穂を育てる肥料をまきます。窒素' + kg + 'kg。',
      opt('見送る', '実りは減りやすい', function (f) { f._topSkips = (f._topSkips || 0) + 1; return '穂肥は見送りました'; }, N('穂肥がないと、穂が小さくなって実りが減ります')),
      opt(kg + 'kgまく', '穂のもとを充実させる。出穂10日前を過ぎるとまけない', function (f) { return run(f, 'top', { kg: kg }) ? '' : '穂肥をまきました'; }, Y('穂が育つ時期の穂肥で、粒がしっかり実ります')));
  }
  function mowCard(f) {
    if (f.headDoy || !f.transDoy || snoozed(f, 'mow')) return null;
    var H = f.forecastHeading(); if (!H) return null;
    if (f.mows.some(function (m) { return m >= H - 25 && m <= H - 10; })) return null;
    if (f.doy < H - 22 || f.doy > H - 14) return null;
    return card('mow', '必須作業', '🌾', '畦の草刈り', lead(f) + '出穂(' + fmt(H) + 'ごろ)の2週間前までに畦の草を刈ります。穂が出る前後10日に刈るとカメムシが田に入ります。',
      opt('刈る', 'カメムシのすみかを減らす', function (f) { return run(f, 'mow') ? '' : '畦の草を刈りました'; }, Y('穂が出る前に畦の草を刈って、カメムシのすみかを減らしました')),
      opt('今回はやめる', '出穂の14日前までが期限。今を逃すと次は穂が出る前後になる', function (f) { snooze(f, 'mow', 99); return '草刈りを見送りました'; }, N('出穂前の草刈りを逃し、畦の草がカメムシのすみかとして残ります')));
  }
  function kameCard(f) {
    if (f.contract || !f.transDoy || f.harvestDoy) return null;
    var H = f.headDoy || f.forecastHeading(); if (!H) return null;
    var bugs = f.sprays.filter(function (s) { return s.target === 'bug' && s.doy >= H - 2; });
    var spray = function (f) { return run(f, 'spray', { target: 'bug' }) ? '' : 'カメムシの薬をまきました'; };
    var from = bugs.length === 0 ? H - 2 : bugs[0].doy + 7, to = bugs.length === 0 ? H + 12 : Math.min(bugs[0].doy + 14, H + K.Farm.BUG_LAST);
    if (bugs.length > 1 || f.doy < from || f.doy > to) return null;
    var txt = lead(f) + (bugs.length === 0 ? '出穂期(' + fmt(H) + 'ごろ)。イネカメムシは、穂が出た直後の籾を吸って実らなくします。' : '1回目から1週間。2回目は斑点のある粒を防ぎます。');
    if (f.doy >= to - 1) return card('kame', '必須作業', '🪲', 'カメムシ防除', txt + '防除の期限です。', opt('防除する', '', spray), opt('防除して、穂を見る', '', afterWalk(spray, 'kame', '防除して、穂を見て回りました')));
    if (snoozed(f, 'kame')) return null;
    return card('kame', '必須作業', '🪲', 'カメムシ防除', txt,
      opt('様子を見る', '1日待つ。実らない籾がふえるおそれ', function (f) { snooze(f, 'kame', 1); return '防除は見送りました'; }, N('防除が遅れると、吸われて実らない籾がふえます')),
      opt('防除する', '薬をまく。出穂期とその7〜14日後が目安(愛知)', spray, Y('出穂期にあわせた防除で、実らない籾をふせぎました')));
  }
  function drainCard(f) {
    if (!f.headDoy || f.drainDoy || f.harvestDoy) return null;
    var M = f.forecastMaturity(), ok = Math.max(f.headDoy + 25, M - 7), early = f.doy < ok;
    if (f.doy < ok - 8) return null;
    var go = function (f) { return run(f, 'drain') ? '' : '水を落としました'; };
    if (f.doy >= M + 3) return card('drain', '必須作業', '🌊', '落水', lead(f) + '刈りどきが近いのに、まだ水が張ったままです。', opt('落水する', '', go), opt('落水して、水尻を見る', '', afterWalk(go, 'drain', '落水して、水尻を見て回りました')));
    if (snoozed(f, 'drain')) return null;
    var txt = lead(f) + '出穂から' + (f.doy - f.headDoy) + '日。刈りどき(' + fmt(M) + 'ごろ)の約1週間前(' + fmt(ok) + 'ごろ)に、田の水を落として地面を固めます。';
    if (early) return card('drain', '必須作業', '🌊', '落水(まだ早い?)', txt + 'いまはまだ実っている途中です。',
      opt('いま落とす', '地面は早く固まるが、実りの途中で水が切れる', go, N('まだ早い落水で、実りが1日ごとに約0.4%ずつ落ちました')),
      opt('水を残す', '2日待つ', function (f) { snooze(f, 'drain', 2); return '落水を見送りました'; }, Y('実っている間は水を残して、粒をしっかりふくらませます')));
    return card('drain', '必須作業', '🌊', '落水', txt + '今が適期です。',
      opt('水を残す', '2日待つ', function (f) { f.labor += 0.2; snooze(f, 'drain', 2); return '落水を見送りました'; }, N('落水が遅れて田がぬかるみ、刈るのに手間がふえます')),
      opt('落とす', '刈りどきの約1週間前の落水', go, Y('適期の落水で、刈りどきに地面が固まりました')));
  }
  function harvestCard(f) {
    if (!f.headDoy || f.done || f.checkAt('harvest', f.doy)) return null;
    var M = f.forecastMaturity(); if (f.doy < M - 3) return null;
    var wet = (f.w.rain[f.doy] || 0) >= 5 || (f.w.rain[f.doy - 1] || 0) >= 20, w = wx(f), tm = f.forecast(f.doy + 1), early = f.doy < M - 1;
    var go = function (f) { return run(f, 'harvest', {}) ? '' : '稲刈りをしました'; };
    var txt = lead(f) + '刈りどきは' + fmt(M) + 'ごろ。籾の8〜9割が黄色になったら刈りどきです。早いと青い粒、遅いと割れた粒がふえます。' + (wet ? '⚠ 雨で稲がぬれています。いま刈るとコンバインが詰まりやすく、取りこぼしもふえます。' : (tm.rain >= 1 ? 'あしたは雨の予報。' : ''));
    if (f.doy > M + 5) return card('harvest', '必須作業', '🌾', '稲刈り(刈りおくれ)', txt, opt('刈る', '', go), opt('刈って、落ち穂を見る', '', afterWalk(go, 'harvest', '刈り取って、落ち穂を見て回りました')));
    if (snoozed(f, 'harvest')) return null;
    var wait = function (f) { snooze(f, 'harvest', 1); return '稲刈りを1日待ちます'; };
    var vGo, vWait;
    if (wet) { vGo = N('ぬれた稲はコンバインが詰まり、取りこぼしもふえました'); vWait = Y('晴れを待って、ぬれていない稲を刈れます'); }
    else if (early) { vGo = N('まだ青い粒が多いうちの早刈りで、収量が減ります'); vWait = Y('刈りどきまで待って、粒がそろいます'); }
    else if (tm.rain >= 1) { vGo = Y('雨の前に刈り取れました'); vWait = N('あしたの雨で稲がぬれ、刈りにくくなります'); }
    else { vGo = Y('刈りどきを迎えた稲を、ちょうどよく刈り取れました'); vWait = N('刈りおくれで、割れた粒がふえていきます'); }
    return card('harvest', '必須作業', '🚜', '稲刈り', txt,
      opt('今日刈る', wet ? 'ぬれた稲は刈りにくい' : early ? 'まだ刈りどきの前' : '晴れた日の刈り取りが理想', go, vGo),
      opt('もう1日待つ', wet ? '晴れるのを待つ' : '台風や雨に注意', wait, vWait));
  }
  var MAND = [sowCard, dsowCard, tillCard, basalCard, puddleCard, plantCard, herbCard, floodCard, mizoCard, midCard, topCard, mowCard, kameCard, drainCard, harvestCard];

  // ---------- 2. 天気イベント ----------
  // 台風以外は、水位やかけ流しなど「エンジンに効きめがある」選択だけを出す(効きめのない深水・見回りの選択は出さない)
  function lodgeWord(f) { var x = f.lodgeIndex(); return x > 0.8 ? '穂が重く、倒れやすい状態(危険)' : x > 0.6 ? '少し倒れやすい状態' : 'しっかり立っていて倒れにくい状態'; }
  function weatherCard(f) {
    var d = f.doy, H = f.headDoy, a;
    // 台風接近(1〜3日前に予報)。刈れる稲(出穂から25日以降)があるときだけ、先に刈るか待つかの選択になる
    var ty = f.w.typhoons.filter(function (t) { return t > d && t <= d + 3; })[0];
    if (ty && !(f._tyKnown && f._tyKnown[ty])) {
      (f._tyKnown = f._tyKnown || {})[ty] = 1;
      if (H && d >= H + 25 && !f.checkAt('harvest', d)) {
        var risk = f.lodgeIndex() > 0.8;
        return card('typhoon', '天気', '🌀', '台風が近づいています', lead(f) + '台風が' + fmt(ty) + 'ごろ来る予報。稲は刈りどき(' + fmt(f.forecastMaturity()) + 'ごろ)に向かっています。稲は' + lodgeWord(f) + '。',
          opt('待つ', '倒れると実りが1割へり、稲刈りの時間が約2倍', function () { return '台風に備えて待ちます'; }, risk ? N('台風で稲が倒れ、実りが1割減って刈るのも大変になります') : Y('稲がしっかり立っていたので、台風でも倒れませんでした')),
          opt('先に刈る', '早刈りは収量がへるが、倒れる心配はなし', function (f) { return run(f, 'harvest', {}) ? '' : '台風の前に刈り取りました'; }, risk ? Y('倒れやすい稲を、台風の前に刈り取れました') : N('倒れにくい稲を早刈りして、必要のない減収になりました')));
      }
    }
    // 猛暑: 穂が出たあと20日
    if (H && !f.flush && !f.drainDoy && !f.harvestDoy && !f._heatDecided && (a = d - H) >= 0 && a <= 18) {
      var hot = 0, n = 0; for (var x = d + 1; x <= Math.min(H + 19, d + 10); x++) { n++; if (f.w.T[x] > 26) hot++; }
      if (n && hot >= 4) return card('heat', '天気', '🔥', '暑さの予報', lead(f) + 'この先10日のうち' + hot + '日が日平均26℃をこえそう。実るいま暑いと、白く濁った粒がふえます。',
        opt('しない', '手間は変わらない。暑さの害はそのまま', function (f) { f._heatDecided = 1; return '水管理はそのままにします'; }, N('暑さの害がそのまま出て、白く濁った粒がふえます')),
        opt('かけ流しにする', '冷たい水を入れ続ける。白い粒が減る。水口の見回りの手間がふえる', function (f) { f._heatDecided = 1; return run(f, 'flush', { on: true }) ? '' : 'かけ流しをはじめました'; }, Y('かけ流しで水温を下げ、白く濁った粒をへらせます')));
    }
    // 暑さがおさまったらかけ流しを止める
    if (f.flush && !f.drainDoy && f.w.T[d] < 24) return card('heatEnd', '天気', '🍃', '涼しくなってきた', lead(f) + 'かけ流しを続けていますが、暑さはおさまりました。',
      opt('続ける', '念のため。毎日水口の見回りが要る', function () { return '続けます'; }, N('涼しいのにかけ流しを続けて、水と手間をむだにしました')),
      opt('かけ流し中止', '水と手間をへらす', function (f) { return run(f, 'flush', { on: false }) ? '' : 'かけ流しをやめました'; }, Y('暑さがおさまったので止めて、水と手間を節約しました')));
    return null;
  }

  // ---------- 2.5 状態のチェック(田んぼの状態を読んで、手を入れるか決める) ----------
  function checkCard(f) {
    var d = f.doy, H = f.headDoy, Hf = H || f.forecastHeading(), pan = f.v.panRef;
    if (!f.transDoy || f.harvestDoy || (f.method === 'direct' && !f.flooded)) return null;
    // 葉色: 一発肥料の田。出穂の約30〜12日前に、色を見て追肥するか決める(足りないときだけ足す)
    if (!H && Hf && Hf - d <= 30 && Hf - d >= 12 && !f.tops.length && !f._leafDone && fertMode(f) === 'oneshot' && f.oneshot > 0) {
      f._leafDone = 1;
      var r = f.nVeg() / f.nVegOpt(), thin = r < 0.8, word = r < 0.8 ? 'うすい黄緑(肥料が足りない色)' : r < 1.1 ? 'ほどよい緑' : 'こい緑(肥料がきいている色)';
      return card('leaf', '田んぼの様子', '🍃', '葉の色を見る', lead(f) + '出穂(' + fmt(Hf) + 'ごろ)の約' + (Hf - d) + '日前。稲の葉の色は「' + word + '」です。追肥を1kg足す?',
        opt('足さない', 'このまま様子を見る', function () { return 'そのままにしました'; }, thin ? N('肥料が足りないまま。穂が小さく、実りが減ります') : Y('葉の色がよいので、足さずに倒れにくく育てます')),
        opt('1kg足す', '色は戻るが、足しすぎは倒れやすい', function (f) { return run(f, 'top', { kg: 1 }) ? '' : '窒素1kgを足しました'; }, thin ? Y('うすい葉の色に追肥で、穂のもとが充実します') : N('肥料は足りているのに足したので、倒れやすくなります')));
    }
    // 水の深さ: 茎をふやす時期は浅水。深い水や水切りは、茎のふえ方をおさえてしまう
    if (!H && !f.midStart && f.water !== 'mid' && d - f.transDoy >= 4 && d - f.transDoy <= 40 && f.stems < 0.8 * pan && !(f._wChk > d - 8)) {
      f._wChk = d;
      var cur = f.water, shallow = cur === 'shallow';
      var txt = lead(f) + '田植えから' + (d - f.transDoy) + '日。茎は' + Math.round(f.stems) + '本(穂の目安' + pan + '本の' + Math.round(f.stems / pan * 100) + '%)で、まだふやしたい時期。いまの水は「' + waterName(f) + '」。';
      if (shallow) return card('c_water', '田んぼの様子', '💧', '水の深さ', txt + '水の深さを変える?',
        opt('深水にする', '寒さ・暑さ・雑草に強いが、茎がふえにくい', function (f) { return run(f, 'water', { mode: 'deep' }) ? '' : '深水にしました'; }, N('深い水は茎のふえ方をおさえます。茎が足りない時期なのに、分げつが遅れます')),
        opt('浅水のまま', '分げつ(茎の数)がふえやすい', function () { return '浅水のままにします'; }, Y('茎が足りない時期は浅水が一番。分げつがぐんぐんふえます')));
      return card('c_water', '田んぼの様子', '💧', '水の深さ', txt + '茎がまだ足りません。',
        opt('このまま', '', function () { return 'そのままにします'; }, N(f.water === 'deep' ? '深水のままでは、茎が足りない時期に分げつが進みません' : '浅水でないままでは、茎が足りない時期に分げつが進みません')),
        opt('浅水にもどす', '分げつがふえやすい', function (f) { return run(f, 'water', { mode: 'shallow' }) ? '' : '浅水にもどしました'; }, Y('浅水にもどして、茎がふえやすくなりました')));
    }
    // 畦ぎわの草: 刈らないと、イボクサが畦ぎわから田に入ってくる(穂が出る前後は刈らない)
    var Dm = dateOf(d).m;
    if (!H && Hf && Hf - d > 28 && Dm >= 6 && Dm <= 8 && !f.mows.some(function (m) { return m >= d - 35; }) && !snoozed(f, 'cmow')) {
      return card('c_mow', '田んぼの様子', '🌿', '畦の草', lead(f) + '畦の草がのびて、田に這いこみそうです。出穂まで' + (Hf - d) + '日あり、刈っても大丈夫な時期です。',
        opt('今は刈らない', '手間はかからない', function (f) { snooze(f, 'cmow', 10); return 'そのままにしました'; }, N('伸びた草から、イボクサが田に入りこみやすくなります')),
        opt('刈る', '手間がかかるが、草が田に入りにくい', function (f) { return run(f, 'mow') ? '' : '畦の草を刈りました'; }, Y('畦ぎわの草を刈って、田への這いこみをふせぎました')));
    }
    return null;
  }

  // ---------- 3. 見回り事件 ----------
  var EV = {
    leak: ['🕳️', '畦の穴', '穴をふさぐ', '約10分。水もれが止まる', '様子を見る', '水がもれて、水位が下がる'],
    float: ['🌬️', '浮き苗', '植え直す', '抜けたところに苗を足す', '様子を見る', '欠株が残る'],
    vent: ['🏠', '育苗ハウス', '窓をあける', '苗が焼けたりムレたりしない', '様子を見る', '苗が弱るおそれ'],
    snail: ['🐌', 'ジャンボタニシ', '貝をとる', '浅水にして貝をとる(約20分)', '様子を見る', '苗が食べられて欠株がふえる'],
    egg: ['🩷', 'タニシの卵', '卵を落とす', '水に落とすとふ化しにくい', '見守る', '貝がふえる'],
    hie: ['🌿', 'ヒエ', '手で抜く', '稲にまぎれた草を抜く', '様子を見る', 'ヒエがふえて収量が下がる'],
    konagi: ['🍃', 'コナギ', '手で抜く', '稲の間の草を抜く', '様子を見る', '草がふえる'],
    ibokusa: ['🍃', 'イボクサ', '手で抜く', '畦ぎわの草を抜く', '様子を見る', '草がふえる'],
    omodaka: ['🏹', 'オモダカ', '中後期の除草剤', '多年生の草をまとめておさえる', '手で抜く', '土の中のイモが残り、また出る'],
    kurogwai: ['🏹', 'クログワイ', '中後期の除草剤', '多年生の草をまとめておさえる', '手で抜く', '土の中のイモが残り、また出る'],
    bird: ['🐦', 'スズメ', '防鳥テープ張る', '約20日は効く', '様子を見る', '穂をつつかれる'],
    nagae: ['⚠️', 'ナガエツルノゲイトウ', '県・役場に連絡', '特定外来生物。専門家と封じこめる(抜かない)', '様子を見る', 'ひろがってしまう']
  };
  // 見回りの事件ごとの一言: [手を打ったとき, 見のがしたとき]
  var EVWHY = {
    leak: ['穴をふさいで、水が逃げるのを止めました', '穴から水がもれ続け、水位が下がって収量が落ちます'],
    float: ['苗を足して、欠株を補いました', '欠株が残って、その分の穂が減ります'],
    vent: ['ハウスの窓をあけて、苗が焼けるのをふせぎました', '苗が焼けたりムレたりして、植えられる苗が減ります'],
    snail: ['貝をとって、苗が食べられるのをふせぎました', '苗が食べられて、欠株がふえます'],
    egg: ['卵を落として、貝がふえるのをふせぎました', '卵がふ化して、貝がふえます'],
    hie: ['ヒエを抜いて、雑草の害をおさえました', 'ヒエがふえて、収量が下がります'],
    konagi: ['コナギを抜いて、雑草の害をおさえました', 'コナギがふえて、収量が下がります'],
    ibokusa: ['イボクサを抜いて、玄米へのまじりをふせぎました', 'イボクサがふえて、等級が下がるおそれがあります'],
    omodaka: ['中後期の除草剤で、土の中のイモまでおさえました', '手で抜いても土の中のイモが残り、また生えてきます'],
    kurogwai: ['中後期の除草剤で、土の中のイモまでおさえました', '手で抜いても土の中のイモが残り、また生えてきます'],
    bird: ['防鳥テープで、穂をつつかれるのをふせぎました', '穂をつつかれて、収量が落ちます'],
    nagae: ['連絡して、専門家と広がりをふせぎました(抜かないのが正解)', '見のがすと毎旬ひろがり、稲刈りの手間もふえます']
  };
  // 育苗ハウス: 暑い晴れの日は「焼ける」、雨や涼しい日は「ムレる」(エンジンの事件文と同じ分け方)
  var VENT_HUMID = ['ハウスの窓をあけて、苗のムレをふせぎました', '窓を閉めたままで苗がムレて、植えられる苗が減ります'];
  var ORDER = ['leak', 'float', 'vent', 'nagae', 'snail', 'egg', 'bird', 'hie', 'konagi', 'omodaka', 'kurogwai', 'ibokusa', 'blast', 'sheath', 'bph', 'kame'];
  var SPR = { blast: ['🍂', 'いもち病', 'いもち病'], sheath: ['🍂', '紋枯病', '紋枯病'], bph: ['🦗', 'ウンカ', 'ウンカ'], kame: ['🪲', 'カメムシ', 'カメムシ'] };
  function penalize(f, e) {   // 見のがしたときの害(runTurn の旬ごとの集計と同じ数値)
    if (e._pen || e.fixed) return; e._pen = true;
    if (e.kind === 'nagae') { f.nagaeLv = Math.min(5, f.nagaeLv + 1); f.patrolLog.nagaeMissed = (f.patrolLog.nagaeMissed || 0) + 1; return; }
    if (!e.care) return;
    f.patrolLog.missed[e.kind]++; var k = e.kind;
    if (k === 'hie') f.weedExtra = Math.min(0.1, f.weedExtra + 0.008);
    if (k === 'konagi') f.weedExtra = Math.min(0.1, f.weedExtra + 0.01);
    if (k === 'omodaka' || k === 'kurogwai') f.weedExtra = Math.min(0.1, f.weedExtra + (k === 'kurogwai' ? 0.02 : 0.012));
    if (k === 'ibokusa') f.weedExtra = Math.min(0.1, f.weedExtra + 0.004);
    if (k === 'bird') f.birdLoss = Math.min(0.04, f.birdLoss + 0.01);
    if (k === 'snail') f.snailLoss = Math.min(0.05, f.snailLoss + 0.015);
    if (k === 'float') f.floatLoss = Math.min(0.03, f.floatLoss + 0.012);
    if (k === 'vent') f.ventLoss = Math.min(0.04, f.ventLoss + (f.w.Tmax[f.doy] >= 25 ? 0.02 : 0.008));
  }
  function evByKind(f, kind) { f.patrol(); return f.patrolEvents().filter(function (e) { return e.kind === kind && !e.fixed; })[0]; }
  function eventCard(f) {
    var cool = f._evCool = f._evCool || {}, evs = f.patrolEvents().filter(function (e) { return !e.fixed && !e._pen && !(cool[e.kind] > f.doy - 4); }), e = null, i, k;
    for (i = 0; i < ORDER.length && !e; i++) e = evs.filter(function (x) { return x.kind === ORDER[i]; })[0] || null;
    if (e && SPR[e.kind]) {   // 病害虫: 防除できる状態か
      k = e.kind; var tg = e.spray || (k === 'kame' ? 'bug' : k), d = f.doy;
      var near = f.headDoy && d >= f.forecastMaturity() - 4, rec = f.sprays.some(function (s) { return s.target === tg && s.doy > d - 7; });
      var prot = (k === 'blast' && d <= f.blastProt) || (k === 'bph' && d <= f.bphProt);
      if (f.contract || near || rec || prot) e = null;
    }
    if (e && !SPR[e.kind] && !e.care) e = null;
    if (e) {
      k = e.kind; var kind = e.kind; cool[kind] = f.doy;
      if (SPR[kind]) {
        var tgt = e.spray || (kind === 'kame' ? 'bug' : kind), s = SPR[kind];
        return card('ev_' + kind, '見回り', s[0], s[1] + 'を見つけた', lead(f) + e.text,
          opt('様子を見る', 'ひろがるかもしれない', function () { return '様子を見ます'; }, N(s[2] + 'が広がって、収量が落ちるおそれがあります')),
          opt('防除する', '薬をまく(手間あり)', function (f) { f.patrol(); return run(f, 'spray', { target: tgt }) ? '' : '薬をまきました'; }, Y(s[2] + 'を、広がる前に薬でおさえました')), { focus: kind });
      }
      var m = EV[kind] || ['👀', '田んぼの異変', '手を打つ', e.care || '', '様子を見る', '見のがすと害がふえる'];
      var alt = m[4] === '手で抜く', why = kind === 'vent' && ((f.w.rain[f.doy] || 0) >= 1 || f.w.Tmax[f.doy] < 25) ? VENT_HUMID : EVWHY[kind] || ['手を打ったので、害がふえるのをふせげました', '見のがした分だけ、害がふえます'];
      var main = opt(m[2], m[3], function (f) { var x = evByKind(f, kind); if (!x) return ''; var err = f.care(x.id, kind === 'nagae' ? 'report' : undefined); if (err) f.msg('⚠ ' + err); return err ? '' : '対処しました'; }, Y(why[0]));
      var other = opt(m[4], m[5], function (f) {
        var x = evByKind(f, kind); if (!x) return '';
        if (alt) { var er = f.care(x.id, 'pull'); if (er) f.msg('⚠ ' + er); return er ? '' : '手で抜きました'; }
        penalize(f, x); return '様子を見ました';
      }, N(why[1]));
      return card('ev_' + kind, '見回り', m[0], m[1] + 'を見つけた', lead(f) + e.text, other, main, { focus: kind });
    }
    // 害のない出会い(生き物・土のようす)
    var lives = f.patrolEvents().filter(function (x) { return (x.kind === 'life' || x.kind === 'soil') && !x.fixed; });
    if (lives.length && !(f._liveAt > f.doy - 3)) {
      var lv = lives[0];
      return calm('ev_life', '見回り', '👀', lv.kind === 'soil' ? '田んぼの土' : '田んぼの生き物', lead(f) + lv.text, ['そっと見守る', '見回りの記録に残しました'], ['近づいてよく見る', '近づいてじっくり観察し、記録に残しました'], function (f) { f._liveAt = f.doy; });
    }
    return null;
  }

  // ---------- 4. 平穏な日 ----------
  // 判断することのない日も、左右は別の行動にする。どちらも見回りの記録は残り、「何をしたか」が f._rec に残る
  function walk(f) { f.patrol(); }
  function mark(f, k, v) { (f._rec = f._rec || {})[k] = v; }
  // 行動ふたつ。a=[ラベル, 選んだあとの一言]。fx=どちらを選んでも付く処理(省略可)
  function calm(key, tag, icon, title, text, L, R, fx) {
    function o(a) { return opt(a[0], '', function (f) { walk(f); if (fx) fx(f); mark(f, key, a[0]); return a[1]; }); }
    return card(key, tag, icon, title, text, o(L), o(R));
  }
  var CALM = [
    { key: 'c_look', ok: function (f) { return f.transDoy && !f.harvestDoy; },
      make: function (f) { return calm('c_look', 'ふだんの日', '🌾', '稲の様子', lead(f) + '株を見ると茎は約' + Math.round(f.stems) + '本。いまのところ、手を入れることはなさそうです。', ['株もとを見る', '株もとを見て回りました'], ['葉の色を見る', '葉の色を見て回りました']); } },
    { key: 'c_rain', ok: function (f) { return (f.w.rain[f.doy] || 0) >= 1 && f.transDoy && !f.harvestDoy; },
      make: function (f) { return calm('c_rain', 'ふだんの日', '☔', '雨の日', lead(f) + '雨が田をぬらしています。今日は田んぼの作業はありません。', ['水口を見て回る', '水口を見て回りました'], ['排水口を見て回る', '田の排水口を見て回りました']); } },
    { key: 'c_sun', ok: function (f) { return f.transDoy && !f.harvestDoy && (f.w.rain[f.doy] || 0) < 1; },
      make: function (f) { var w = wx(f); return calm('c_sun', 'ふだんの日', w.icon, '朝の田んぼ', lead(f) + '朝いちばんに田んぼへ。水面に空がうつっています。', ['畦を歩く', '畦を一周しました'], ['水面をのぞく', '水面に空がうつるのを眺めました']); } },
    { key: 'c_head', ok: function (f) { return f.headDoy && !f.harvestDoy; },
      make: function (f) { return calm('c_head', 'ふだんの日', '🌾', '出穂のあと', lead(f) + '穂が出て' + (f.doy - f.headDoy) + '日。穂は少しずつ重くなっています。', ['穂を見て回る', '穂がふくらんでいます'], ['穂を手にとる', '穂を手にとって、重みを確かめました']); } },
    { key: 'c_prep', ok: function (f) { return !f.transDoy && f.sowDoy; },
      make: function (f) { return calm('c_prep', 'ふだんの日', '🏠', '育苗のようす', lead(f) + '苗は' + (f.doy - f.sowDoy) + '日目。小さな緑が育っています。', ['ハウスを見る', '苗の様子を見ました'], ['苗の根もとを見る', '苗の根もとを確かめました']); } },
    { key: 'c_spring', ok: function (f) { return !f.sowDoy && !f.transDoy; },
      make: function (f) { return calm('c_spring', 'ふだんの日', '🌸', '春の準備', lead(f) + '田んぼのまわりを歩く。畦の草が芽吹きはじめています。', ['水路を見て回る', '水路を見て回りました'], ['畦の草を見る', '畦の草の芽を見つけました']); } },
    { key: 'c_wait', ok: function (f) { return f.method === 'direct' && f.transDoy && !f.emergeDoy; },
      make: function (f) { return calm('c_wait', 'ふだんの日', '🌱', '芽が出るのを待つ', lead(f) + '種をまいて' + (f.doy - f.transDoy) + '日。芽が出るのは' + fmt(f.forecastEmerge()) + 'ごろの見込み。', ['畝を見に行く', '畝を見て回りました'], ['土にさわる', '土のしめり具合を確かめました']); } },
    { key: 'c_spring2', ok: function (f) { return !f.sowDoy && !f.transDoy; },
      make: function (f) { return calm('c_spring2', 'ふだんの日', '🌤️', '春のたより', lead(f) + 'ツバメが戻ってくるころ。種まきまであと' + Math.max(0, (f.method === 'direct' ? doyOf(3, 25) : f.v.stdPlant - 20) - f.doy) + '日ほど。', ['畦を歩く', '畦を歩きました'], ['種まきの田の土を見る', '種まきの田の土の乾きを確かめました']); } },
    { key: 'c_wind', ok: function (f) { return f.windy(f.doy) && f.transDoy; },
      make: function (f) { return calm('c_wind', 'ふだんの日', '🌬️', '風が強い日', lead(f) + '稲が大きくゆれています。今日は作業を見あわせます。', ['畦を見て回る', '畦を確かめました'], ['稲のゆれを見守る', '稲のゆれを遠くから見守りました']); } },
    { key: 'c_heat', ok: function (f) { return f.w.Tmax[f.doy] >= 31 && f.transDoy && !f.harvestDoy; },
      make: function (f) { return calm('c_heat', 'ふだんの日', '🥵', '暑い日', lead(f) + '最高気温は' + Math.round(f.w.Tmax[f.doy]) + '℃。水の深さと温かさが気になる日です。', ['朝のうちに見回る', '朝に見回りました'], ['水の温かさを確かめる', '水口で水の温かさを確かめました']); } },
    // 西尾の季節の話題(左右で別の行動・記録にする)
    { key: 'c_shincha', ok: function (f) { return f.transDoy && !f.harvestDoy && f.doy >= doyOf(4, 25) && f.doy <= doyOf(5, 25); },
      make: function (f) { return calm('c_shincha', 'ふだんの日', '🍵', '新茶のころ', lead(f) + '西尾は抹茶やお茶で知られるまち。田んぼのそばを通ると、茶畑の若葉がやわらかく光っています。', ['畦を歩く', '畦を歩きました'], ['田の水の深さを見る', '田の水の深さを見て回りました']); } },
    { key: 'c_swallow', ok: function (f) { return f.transDoy && !f.harvestDoy && f.doy >= doyOf(5, 10) && f.doy <= doyOf(7, 20) && f.w.rain[f.doy] < 1; },
      make: function (f) { return calm('c_swallow', 'ふだんの日', '🐦', 'ツバメの子育て', lead(f) + '作業小屋の軒先で、ツバメが田んぼと巣を行ったり来たり。虫をとってくれる、ありがたいお隣さんです。', ['田の虫を見て回る', '株もとの虫を見て回りました'], ['ツバメの飛ぶ田を見守る', '虫をとるツバメの田を見守りました']); } },
    { key: 'c_sea', ok: function (f) { return f.transDoy && !f.harvestDoy && f.doy >= doyOf(5, 1) && f.doy <= doyOf(9, 30) && (f.w.rain[f.doy] || 0) < 1 && !f.windy(f.doy); },
      make: function (f) { return calm('c_sea', 'ふだんの日', '🌊', '海からの風', lead(f) + '西尾の南は三河湾。一色の海のほうから、ほのかに潮のにおいがする風がふいてきます。', ['畦に立って稲を見る', '畦に立って稲の伸びを見ました'], ['稲の葉の色を見る', '稲の葉の色を見ました']); } },
    { key: 'c_kira', ok: function (f) { return f.transDoy && !f.harvestDoy && f.doy >= doyOf(6, 1) && f.doy <= doyOf(9, 10); },
      make: function (f) { return calm('c_kira', 'ふだんの日', '🌾', '吉良の田園', lead(f) + '吉良のあたりまで、田んぼが緑のじゅうたんのように続いています。となりの田んぼの稲も、そろってのびています。', ['自分の田の稲を見て回る', '自分の田の稲を見て回りました'], ['となりの稲と比べる', 'となりの田の稲の背たけと見比べました']); } },
    { key: 'c_cicada', ok: function (f) { return f.transDoy && !f.harvestDoy && f.doy >= doyOf(7, 15) && f.doy <= doyOf(8, 31) && (f.w.rain[f.doy] || 0) < 1; },
      make: function (f) { return calm('c_cicada', 'ふだんの日', '🦗', 'セミの声', lead(f) + '朝からセミが鳴いています。畦の木かげまで、セミの声が響きます。', ['畦を歩いて株を見る', '畦を歩いて株を見て回りました'], ['葉の色を見て回る', '葉の色を見て回りました']); } },
    { key: 'c_dragonfly', ok: function (f) { return f.transDoy && !f.harvestDoy && f.doy >= doyOf(8, 15) && f.doy <= doyOf(10, 15); },
      make: function (f) { return calm('c_dragonfly', 'ふだんの日', '🪰', '赤とんぼ', lead(f) + '田んぼの上を赤とんぼが飛んでいます。空が高くなってきました。', ['田の上を飛ぶ赤とんぼを見る', '田の上を飛ぶ赤とんぼを見ました'], ['株もとの虫を見る', '株もとの虫を見て回りました']); } },
    { key: 'c_tide', ok: function (f) { return f.transDoy && !f.harvestDoy && f.doy >= doyOf(4, 15) && f.doy <= doyOf(6, 15) && f.w.rain[f.doy] < 1; },
      make: function (f) { return calm('c_tide', 'ふだんの日', '🐚', '干潟のにぎわい', lead(f) + '一色の海の干潟は、この季節、貝や鳥でにぎやかになると聞きます。田の水は、遠くの海へとつながっています。', ['水口を見て回る', '水口を見て回りました'], ['水の深さを見て回る', '田の水の深さを見て回りました']); } },
    { key: 'c_tea', ok: function (f) { return f.transDoy && !f.harvestDoy && f.w.Tmax[f.doy] < 24; },
      make: function (f) { return calm('c_tea', 'ふだんの日', '🍵', 'すずしい日の見回り', lead(f) + 'すずしい風のふく日。稲の様子がよく見える日です。', ['畦を歩く', '畦を歩きました'], ['株もとを見て回る', '株もとを見て回りました']); } }
  ];
  function calmCard(f) {
    var list = CALM.filter(function (c) { return c.ok(f) && c.key !== f._lastCalm; });
    if (!list.length) list = CALM.filter(function (c) { return c.ok(f); });
    if (!list.length) return null;
    var c = list[(f.doy * 7 + (f.seedP & 255)) % list.length];
    f._lastCalm = c.key;
    return c.make(f);
  }

  function fallback(f) {
    return calm('fallback', 'ふだんの日', '🌾', 'いつもの一日', dayStr(f) + '。田んぼをぐるっと見てまわる。', ['田を一周する', '田を一周しました'], ['畦から眺める', '畦から田全体を眺めました']);
  }

  // ---------- 5. 準備の季節(1〜79日目)と収穫後の季節 ----------
  // 準備と収穫後はエンジンを動かさず(f.step() を呼ばない)、選んだことを f._prep / f._post に記録するだけ。
  // 例外: 冬に種もみを早く用意した年(_prep.seed='early')は、種まきカードで塩水選がすんでいる(sowCard)。
  var D = doyOf, NORMAL_KG = 493;   // 西三河の平均(令和7年産・東海農政局)。結果画面と同じ数字
  function note(l) { return '「' + l + '」にしました'; }
  // 行: {k, w:[はじめの日,おわりの日], i:アイコン, t:題, x:本文(文字列か f→文字列), L/R:[ラベル, ヒント, 結果の一言, 記録キー, 記録の値]}
  // 選んだことが、あとの田んぼに本当に効くのは次の2枚だけ(ほかの準備・収穫後の日は、選択肢のない「ようす」カード)
  //  種もみの注文: 早い→塩水選が冬にすむ(種まきカード) / 遅い→春の手配に手間(作業時間 +0.2時間)
  //  畦の点検: 冬にふさぐ→春の最初の水もれが自然にふさがる(beforeStep)
  // 冬の世話カウンタ: 準備期の判定つき選択で増減する net(○=+1・×=-1、-6〜+8で頭打ち=頭打ち後も逆の選択がすぐ効く)。status() の準備期の水・稲にだけ効き、本編のバランスには触れない(サイクル66)
  function wcG(f) { var w = f._wc = f._wc || { n: 0 }; w.n = Math.min(8, w.n + 1); }
  function wcB(f) { var w = f._wc = f._wc || { n: 0 }; w.n = Math.max(-6, w.n - 1); }
  // 準備期(冬)の判定(軸00D: 1〜3月の正しい世話は畦・水路の点検補修、土の確認、種もみの保管と早めの注文、暦と計画。誤りは時期尚早の水入れ・種まき・施肥、土を踏み固めること、点検の放置)
  var REAL = {
    p_seedorder: [Y('冬のうちに種もみが手元へ。塩水選まで落ち着いてできます'), N('春の注文は手配がせわしなく、手間がふえます(作業 +0.2時間)'), wcG, function (f) { wcB(f); f.labor += 0.2; }],
    p_aze: [Y('冬のうちに穴をふさいだので、春の水もれがおさえられます'), N('穴を残したので、水を入れてから水もれのもとになります'), wcG, wcB],
    p_newyear: [Y('年の初めに田を見て回ると、畦の傷みに早く気づけます'), N('田を見ないでいると、畦の傷みや穴に気づけません'), wcG, wcB],
    p_frost: [Y('霜の畦を歩くと、畦の締まり具合が足で分かります'), N('霜でほぐれた田の中を踏み歩くと、土が固まってしまいます'), wcG, wcB],
    p_shokan: [Y('寒い日も見回ると、水たまりの氷や畦の様子が分かります'), N('見回りを休むと、冬の田の変化に気づけません'), wcG, wcB],
    p_snow: [Y('川の水の量を見ると、春の用水の見通しが立ちます'), N('水のもとを見ないと、春の用水の備えが後手になります'), wcG, wcB],
    p_daikan: [N('種もみを見ないでいると、湿気やネズミの傷みに気づけません'), Y('大寒のころに種もみを確かめると、春の種まきが安心です'), wcB, wcG],
    p_seedstore: [Y('乾いて涼しい棚なら、種もみが傷みません'), N('湿った土間では、種もみが湿気を吸って傷みます'), wcG, wcB],
    p_plan: [Y('去年のノートが、今年の田に合った計画のもとになります'), N('去年どおりでは、土も天気も違う今年の田に合いません'), wcG, wcB],
    p_calendar: [Y('目安を書きこむと、注文や準備が落ち着いて進みます'), N('目安がないと、種もみの注文や準備が後手になります'), wcG, wcB],
    kou_0: [Y('田を見て回ると、畦の傷みに早く気づけます'), N('この田は冬のあいだ乾かして休ませます。水を入れるのは春の用水からです'), wcG, wcB],
    kou_1: [Y('土の様子を見ると、春の田起こしの具合が読めます'), N('肥料は稲に合わせて春から入れます。稲のない今入れては、実りに届きません'), wcG, wcB],
    kou_2: [Y('畦の草を見ると、春の芽吹きと田の様子が読めます'), N('寒い今の時期に種をまいても、芽が出ずに腐ってしまいます'), wcG, wcB],
    kou_3: [Y('田を見て回ると、畦の傷みに早く気づけます'), N('この田は冬のあいだ乾かして休ませます。水を入れるのは春の用水からです'), wcG, wcB],
    kou_4: [Y('土の様子を見ると、春の田起こしの具合が読めます'), N('肥料は稲に合わせて春から入れます。稲のない今入れては、実りに届きません'), wcG, wcB],
    kou_5: [Y('畦の草を見ると、春の芽吹きと田の様子が読めます'), N('寒い今の時期に種をまいても、芽が出ずに腐ってしまいます'), wcG, wcB],
    kou_6: [Y('田を見て回ると、畦の傷みに早く気づけます'), N('この田は冬のあいだ乾かして休ませます。水を入れるのは春の用水からです'), wcG, wcB],
    kou_7: [Y('土の様子を見ると、春の田起こしの具合が読めます'), N('肥料は稲に合わせて春から入れます。稲のない今入れては、実りに届きません'), wcG, wcB],
    kou_8: [Y('畦の草を見ると、春の芽吹きと田の様子が読めます'), N('寒い今の時期に種をまいても、芽が出ずに腐ってしまいます'), wcG, wcB],
    kou_9: [Y('田を見て回ると、畦の傷みに早く気づけます'), N('この田は冬のあいだ乾かして休ませます。水を入れるのは春の用水からです'), wcG, wcB],
    kou_10: [Y('土の様子を見ると、春の田起こしの具合が読めます'), N('肥料は稲に合わせて春から入れます。稲のない今入れては、実りに届きません'), wcG, wcB],
    kou_11: [Y('畦の草を見ると、春の芽吹きと田の様子が読めます'), N('寒い今の時期に種をまいても、芽が出ずに腐ってしまいます'), wcG, wcB],
    kou_12: [Y('田を見て回ると、畦の傷みに早く気づけます'), N('この田は冬のあいだ乾かして休ませます。水を入れるのは春の用水からです'), wcG, wcB],
    kou_13: [Y('土の様子を見ると、春の田起こしの具合が読めます'), N('肥料は稲に合わせて春から入れます。稲のない今入れては、実りに届きません'), wcG, wcB],
    kou_14: [Y('畦の草を見ると、春の芽吹きと田の様子が読めます'), N('寒い今の時期に種をまいても、芽が出ずに腐ってしまいます'), wcG, wcB],
    pf_frost: [Y('畦を歩くと、畦の締まり具合が足で分かります'), N('霜でほぐれた田の中を踏み歩くと、土が固まってしまいます'), wcG, wcB],
    pf_sky: [N('田を見て回らないと、畦の傷みに気づけません'), Y('土の乾きを見ると、春の田起こしの具合が読めます'), wcB, wcG],
    pf_stubble: [Y('刈り株を見ると、土の具合や株の残り方が分かります'), N('野焼きは煙も出て、土の生きものにもよくありません'), wcG, wcB],
    pf_ice: [Y('田のくぼみの氷を見ると、水のたまり方が分かります'), N('田の氷を踏み歩くと、ほぐれた土が固まってしまいます'), wcG, wcB],
    pf_sunset: [Y('夕方の田を見て回ると、その日の畦の様子が残らず分かります'), N('田を見ないで帰ると、畦の傷みに気づけません'), wcG, wcB],
    pf_quiet: [Y('土の湿りを手で見ると、田の乾き具合が分かります'), N('稲のない冬の田に薬は要りません。土の生きものも静かに過ごしています'), wcG, wcB],
    pf_heron: [Y('そっと見守れば、サギは田の虫や貝を食べてくれます'), N('サギは田の虫や貝を食べてくれます。近づいて驚かせないほうが田のためです'), wcG, wcB],
    pf_crack: [Y('ひびを指で見ると、土の乾き具合が分かります'), N('乾いた土を足で踏むと締まって、春の田起こしがしにくくなります'), wcG, wcB],
    pf_farmbook: [Y('本で読んだ目安は、畦を見てこそ今年の田に合います'), N('本だけでは、畦の傷みや水路の詰まりに気づけません'), wcG, wcB],
    pf_notice: [Y('用水の当番を確かめると、春の水の段取りが立ちます'), N('回覧板を見ないと、用水の当番や集まりを逃します'), wcG, wcB],
    pf_oldrice: [Y('刈り株を見ると、去年の稲の育ち方が思い出せます'), N('田を見ないでいると、今年の備えが後手になります'), wcG, wcB],
    pf_neighbor: [Y('立ち話で、近くの田の冬の様子や水の話が聞けます'), N('声をかけないと、水路や用水の相談のきっかけを逃します'), wcG, wcB],
    pf_mist: [Y('もやの日も田を歩くと、畦や水路の様子が分かります'), N('見回りをやめると、冬の田の変化に気づけません'), wcG, wcB],
    pf_mikan: [Y('田を見て回ると、畦の様子がそのまま分かります'), N('みかん畑だけでは、田の畦の傷みに気づけません'), wcG, wcB],
    pf_bird2: [N('冬の田の落ち籾はハトの餌です。追い払う必要はありません'), Y('追い払わなければ、ハトは落ち籾を静かに食べてくれます'), wcB, wcG],
    pf_night: [N('田を見ない夜が続くと、畦の様子が分からなくなります'), Y('夜の畦を歩くと、水たまりや畦の様子が静かに分かります'), wcB, wcG],
    pf_cat: [N('猫は畦のネズミを見てくれます。そっとしておくほうが田のためです'), Y('そっとしておけば、猫が畦のネズミを見てくれます'), wcB, wcG],
    pf_rainw: [N('雨で見回りをやめると、水路の詰まりに気づけません'), Y('雨の日の水路の流れを見ると、詰まりやあふれが分かります'), wcB, wcG],
    pf_cold: [N('凍った田を踏み歩くと、ほぐれた土が固まってしまいます'), Y('畦の霜を見ると、田の冷え方や土の様子が分かります'), wcB, wcG],
    pf_clear: [Y('霜のとける畦を見ると、土の乾きと冷え方が分かります'), N('霜の田は乾かして休ませる時期です。水は春の用水から入れます'), wcG, wcB],
    pf_mild: [N('小春日和でも種まきはまだ早いです。寒さで芽が腐ります'), Y('土を手に取ると、湿り気やかたさが分かります'), wcB, wcG],
    pf_kaze: [Y('わらくずを集めると、水路の詰まりを防げます'), N('わらくずを水路に流すと、下流で詰まってしまいます'), wcG, wcB],
    p_risshun: [Y('畦の草の芽を見ると、春の芽吹きと畦の様子が読めます'), N('立春でもまだ寒さが戻ります。今まくと寒さで芽が傷み、腐りやすくなります'), wcG, wcB],
    p_soil: [N('土を見ないで去年の収量だけで決めると、今年の土の力に合いません'), Y('土の色や手ざわりを見ると、今年の土の具合が読めます'), wcB, wcG],
    p_ditch: [Y('用水の前に泥を上げておくと、春の水がよく通ります'), N('泥を残したままでは、春の水が詰まってあふれます'), wcG, wcB],
    p_usui: [Y('水路の流れを見ると、詰まりやあふれが早く分かります'), N('水でゆるんだ田の中を踏み歩くと、土が固まってしまいます'), wcG, wcB],
    p_machine: [Y('田植えの前に整備に出すと、不具合を直す時間が取れます'), N('手入れを後回しにすると、田植えの時期に止まって困ります'), wcG, wcB],
    p_birds: [Y('ヒバリの声を聞くと、春の近さと田の様子が分かります'), N('鳥は田の虫も食べてくれます。追い払う必要はありません'), wcG, wcB],
    p_mizo: [Y('自分でそうじすると、自分の田の水路の詰まりが分かります'), N('誰も行かないと、この地区の水路の詰まりが残ります'), wcG, wcB],
    p_seedtreat: [Y('お湯の消毒で、種まきの前に病気のもとをへらせます'), N('消毒をしないでまくと、いもち病やばか苗病が出やすくなります'), wcG, wcB],
    p_keichitsu: [Y('土の中を見ると、冬ごもりの虫やミミズの様子が分かります'), N('稲のない今、薬は要りません。土の生きものが目をさましはじめたところです'), wcG, wcB],
    p_shunbun: [Y('水路を最後に確かめると、あしたからの作業が落ち着いてはじめられます'), N('用水は4月からです。今田に水を入れても、行き場のない水が土を冷やします'), wcG, wcB],
    pf_ume: [Y('畦を歩くと、草の芽や畦の傷みが分かります'), N('水路にたまった落ち葉を残すと、春の水が詰まります'), wcG, wcB],
    pf_tsukushi: [Y('つくしの出た畦を見て回ると、春の芽吹きと畦の様子が分かります'), N('春先のゆるんだ田の中を踏み歩くと、土が固まってしまいます'), wcG, wcB],
    pf_wind: [Y('畦の土の乾きを見ると、田起こしの具合が読めます'), N('水路の入口にたまったわらくずを残すと、春の水が詰まります'), wcG, wcB],
    pf_swallow: [Y('畦の春の草を見ると、季節の進みと畦の様子が分かります'), N('用水は4月からです。今入れても、行き場のない水が土を冷やします'), wcG, wcB],
    pf_frog: [Y('水路をのぞくと、水の通りや詰まりが分かります'), N('水を入れるのは用水が来る4月からです。今入れても、行き場のない水が土を冷やします'), wcG, wcB],
    pf_dandelion: [Y('畦を歩くと、春の草や畦の様子が分かります'), N('種まきは田植えの20日ほど前からです。今まくと寒さで芽が傷みます'), wcG, wcB],
    pf_rain: [Y('雨の日も見に行くと、水路の流れや水たまりの増え方が分かります'), N('雨で見回りをやめると、水路の詰まりに気づけません'), wcG, wcB],
    pf_seedbag: [Y('袋の手ざわりで、種もみの乾き具合が分かります'), N('確かめないで置くと、湿気やネズミの傷みに気づけません'), wcG, wcB],
    pf_warmrain: [Y('ゆるんだ土を見ると、春の田起こしの具合が読めます'), N('雨でゆるんだ田の中を踏み歩くと、土が固まってしまいます'), wcG, wcB],
    pf_sun: [N('田に水を入れるのは、用水が来る春からです。今は乾かして休ませます'), Y('草の芽を見ると、春の近さと畦の様子が分かります'), wcB, wcG]
  };
  // 状態に応じた文面: 行に vs=[{c:条件(f), x:本文, t?:題, i?:アイコン}] があれば、あてはまる最初のものを本文に使う(選択肢・記録は変えない)
  function pickVar(r, f) { var i; if (r.vs) for (i = 0; i < r.vs.length; i++) { try { if (r.vs[i].c(f)) return r.vs[i]; } catch (e) {} } return null; }
  function dcard(tag, store, r, f) {
    var vr = pickVar(r, f), x = vr ? (typeof vr.x === 'function' ? vr.x(f) : vr.x) : typeof r.x === 'function' ? r.x(f) : r.x, text = lead(f) + String(x).replace(/\{v\}/g, f.v.name), rl = REAL[r.k];
    if (vr && vr.t) r = { k: r.k, i: vr.i || r.i, t: vr.t, L: r.L, R: r.R };
    if (!rl) {   // 判定のない日: 左右で別の行動を記録する(記録キーがなければカードの名前で残す)
      var plain = function (a) { return opt(a[0], '', function (f) { (f[store] = f[store] || {})[a[3] || r.k] = a[4] || a[0]; return a[2] || note(a[0]); }); };
      return card(r.k, tag, r.i, r.t, text, plain(r.L), plain(r.R));
    }
    function o(a, ver, fx) { return opt(a[0], a[1], function (f) { (f[store] = f[store] || {})[a[3] || r.k] = a[4] || a[0]; if (fx) fx(f); return a[2] || note(a[0]); }, ver); }
    return card(r.k, tag, r.i, r.t, text, o(r.L, rl[0], rl[2]), o(r.R, rl[1], rl[3]));
  }
  // 日ごとの割りつけ: 期限の近い単発カードから先に、あいた日はふだんのカードを使用回数の少ない順に回す。f と seed だけで決まる(再開で同じになる)
  function schedule(ones, fills, from, to, seed, f) {
    var used = {}, cnt = {}, out = {}, prev = '', t;
    for (t = from; t <= to; t++) {
      var best = null;
      ones.forEach(function (r) { if (used[r.k] || t < r.w[0] || t > r.w[1]) return; if (!best || r.w[1] < best.w[1]) best = r; });
      if (best) { used[best.k] = 1; out[t] = best; prev = best.k; continue; }
      var c = fills.filter(function (r) { return t >= r.w[0] && t <= r.w[1] && (!r.ok || r.ok(f, t)); }); if (!c.length) c = fills.filter(function (r) { return !r.ok; });   // r.ok(f,t)=その日の天気などで出せる行
      var m = Math.min.apply(null, c.map(function (r) { return cnt[r.k] || 0; }));
      c = c.filter(function (r) { return (cnt[r.k] || 0) === m; });
      if (c.length > 1) c = c.filter(function (r) { return r.k !== prev; });
      var p = c[(t * 7 + seed) % c.length]; cnt[p.k] = (cnt[p.k] || 0) + 1; out[t] = p; prev = p.k;
    }
    return out;
  }
  function F(k, lo, hi, i, t, x, L, R) { return { k: k, w: [lo, hi], i: i, t: t, x: x, L: [L[0], L[1] || '', L[2]], R: [R[0], R[1] || '', R[2]] }; }
  function X(row, o) { for (var k in o) row[k] = o[k]; return row; }   // 行に ok(天気の条件)・vs(状態別の文面)を足す
  function WD(f, t) { return { T: f.w.T[t], Tx: f.w.Tmax[t], rain: f.w.rain[t] || 0 }; }
  function pr(f, k, v) { return !!(f._prep && f._prep[k] === v); }
  function po(f, k, v) { return !!(f._post && f._post[k] === v); }
  function O(k, lo, hi, i, t, x, L, R) { return { k: k, w: [lo, hi], i: i, t: t, x: x, L: L, R: R }; }

  // 七十二候(5日ごとの季節のことば)。日付は年によって1日ほどずれる
  var KOU = [[1, 5, '芹乃栄', 'せりすなわちさかう', 'セリが群れて生えはじめるころ'], [1, 10, '水泉動', 'しみずあたたかをふくむ', '地中で凍っていた泉が動きはじめるころ'], [1, 15, '雉始雊', 'きじはじめてなく', 'キジのオスが鳴きはじめるころ'],
    [1, 20, '款冬華', 'ふきのはなさく', 'フキのとうが雪の下から顔を出すころ'], [1, 25, '水沢腹堅', 'さわみずこおりつめる', '沢の水が厚く凍るころ'], [1, 30, '鶏始乳', 'にわとりはじめてとやにつく', 'ニワトリが卵を産みはじめるころ'],
    [2, 4, '東風解凍', 'はるかぜこおりをとく', '春風が氷をとかしはじめるころ'], [2, 9, '黄鶯睍睆', 'うぐいすなく', 'ウグイスが鳴きはじめるころ'], [2, 14, '魚上氷', 'うおこおりをいずる', '割れた氷の間から魚がはねるころ'],
    [2, 19, '土脉潤起', 'つちのしょううるおいおこる', '雨が降って土がしっとりうるおうころ'], [2, 24, '霞始靆', 'かすみはじめてたなびく', '春がすみがたなびきはじめるころ'], [3, 1, '草木萌動', 'そうもくめばえいずる', '草や木が芽吹きはじめるころ'],
    [3, 6, '蟄虫啓戸', 'すごもりむしとをひらく', '冬ごもりの虫が土から出てくるころ'], [3, 11, '桃始笑', 'ももはじめてさく', '桃の花が咲きはじめるころ'], [3, 16, '菜虫化蝶', 'なむしちょうとなる', 'さなぎがモンシロチョウになるころ'],
    [8, 7, '涼風至', 'すずかぜいたる', '涼しい風が吹きはじめるころ'], [8, 12, '寒蝉鳴', 'ひぐらしなく', 'ヒグラシが鳴きはじめるころ'], [8, 17, '蒙霧升降', 'ふかききりまとう', '深い霧がたちこめるころ'],
    [8, 23, '綿柎開', 'わたのはなしべひらく', '綿の実がはじけて白い綿が出るころ'], [8, 28, '天地始粛', 'てんちはじめてさむし', '暑さがおさまりはじめるころ'], [9, 2, '禾乃登', 'こくものすなわちみのる', '稲が実って穂を垂れるころ'],
    [9, 7, '草露白', 'くさのつゆしろし', '草の露が白く光るころ'], [9, 12, '鶺鴒鳴', 'せきれいなく', 'セキレイが鳴きはじめるころ'], [9, 17, '玄鳥去', 'つばめさる', 'ツバメが南へ帰っていくころ'],
    [9, 22, '雷乃収声', 'かみなりすなわちこえをおさむ', '夕立の雷が鳴らなくなるころ'], [9, 28, '蟄虫坏戸', 'むしかくれてとをふさぐ', '虫が土にもぐって戸をふさぐころ'], [10, 3, '水始涸', 'みずはじめてかるる', '田の水を落として稲刈りをするころ'],
    [10, 8, '鴻雁来', 'こうがんきたる', '雁が北から渡ってくるころ'], [10, 13, '菊花開', 'きくのはなひらく', '菊の花が咲きはじめるころ'], [10, 18, '蟋蟀在戸', 'きりぎりすとにあり', 'コオロギが戸口で鳴くころ'],
    [10, 23, '霜始降', 'しもはじめてふる', '霜がおりはじめるころ'], [10, 28, '霎時施', 'こさめときどきふる', '小雨がときどき降るころ'], [11, 2, '楓蔦黄', 'もみじつたきばむ', 'もみじやツタが色づくころ'],
    [11, 7, '山茶始開', 'つばきはじめてひらく', '山茶花が咲きはじめるころ'], [11, 12, '地始凍', 'ちはじめてこおる', '大地が凍りはじめるころ'], [11, 17, '金盞香', 'きんせんかさく', '水仙の花が咲くころ'],
    [11, 22, '虹蔵不見', 'にじかくれてみえず', '虹を見かけなくなるころ'], [11, 27, '朔風払葉', 'きたかぜこのはをはらう', '北風が木の葉を払うころ'], [12, 2, '橘始黄', 'たちばなはじめてきばむ', 'みかんの仲間の実が色づくころ'],
    [12, 7, '閉塞成冬', 'そらさむくふゆとなる', '空が閉ざされ冬になるころ'], [12, 12, '熊蟄穴', 'くまあなにこもる', 'クマが冬ごもりに入るころ'], [12, 17, '鱖魚群', 'さけのうおむらがる', 'サケが群れて川をのぼるころ'],
    [12, 22, '乃東生', 'なつかれくさしょうず', '夏枯草が芽を出すころ'], [12, 27, '麋角解', 'さわしかのつのおつる', 'シカの角が落ちるころ']];
  var KOU_PAIRS = [
    [['田を見て回る', '', '田を見て回りました'], ['田に水を入れる', '', '田に水を入れました']],
    [['土の様子を見る', '', '土の様子を見ました'], ['肥料をまく', '', '肥料をまきました']],
    [['畦の草を見る', '', '畦の草を見ました'], ['種をまく', '', '種をまきました']]
  ];
  function kouRows() {
    return KOU.map(function (k, i) {
      var lo = D(k[0], k[1]), nx = KOU[i + 1], hi = !nx ? 365 : nx[0] === 8 && k[0] === 3 ? D(3, 21) - 1 : D(nx[0], nx[1]) - 1;   // 3/16の候は春分(3/21)の前日まで
      var pr = KOU_PAIRS[i % KOU_PAIRS.length];
      return O('kou_' + i, lo, hi, '🍃', '七十二候「' + k[2] + '」', '七十二候は、季節を5日ごとに分けた昔のことば。いまは「' + k[2] + '」(' + k[3] + ')。' + k[4] + 'です。',
        pr[0], pr[1]);
    });
  }
  // --- 準備(1〜79日目): 単発 ---
  var PREP_ONE0 = [
    O('p_newyear', 1, 1, '🎍', '元日の田んぼ', '元日。田んぼは白い霜をかぶって、しんと静かです。今年の米づくりのはじめに、田の様子を確かめます。',
      ['畦から田見る', '霜の田を一周する', '畦を歩いて田を見て回りました'], ['田へ行かない', '霜の田は確かめない', '田は見に行きませんでした']),
    O('p_frost', 2, 8, '🥶', '霜柱の朝', '朝の田んぼは霜柱でザクザク。稲刈りのあとの土は、冬のあいだに凍ってはゆるむのをくり返して、ほぐれていきます。',
      ['霜の畦を歩く', '霜柱の立つ畦を歩く', '霜の畦を歩いて回りました'], ['田を踏み歩く', '霜の田の中へ入る', '田の中を踏み歩きました']),
    O('p_shokan', 5, 5, '❄️', '小寒(寒の入り)', '今日は小寒。ここから「寒」の季節で、寒さがだんだん厳しくなっていきます。',
      ['厚着で見回る', '上着を重ねて田へ', '厚着をして田を見て回りました'], ['見回りを休む', '寒いので田へは行かない', '見回りは休みました']),
    O('p_seedorder', 7, 19, '📦', '種もみの注文', '{v}の種もみを注文する時期です。種もみは、病気を持ちこまないよう毎年新しい種を用意するのが基本。いつ頼む?',
      ['早めに注文する', '冬のうちに手元へ。塩水選などの準備も落ち着いてできる', '種もみを早めに注文しました', 'seed', 'early'], ['春になってから', '急がず、種まきの前に。あわてることも', '種もみは春になってから頼みます', 'seed', 'late']),
    O('p_snow', 10, 17, '🏔️', '山の雪と用水', '西尾はめったに雪が積もりませんが、矢作川の上流の山では雪が降ります。春の用水は、山に降った雨や雪が集まった川から来ます。',
      ['川の水量見る', '春の用水のもとを確かめる', '川の水の量を見てきました'], ['水源を見ない', '川も水路も確かめない', '水のことは考えませんでした']),
    O('p_daikan', 20, 20, '🧊', '大寒', '大寒。1年でいちばん寒いころ、といわれます。この寒さを越えた種もみや土が、春の田をつくります。',
      ['種もみを見ない', '', '種もみは見ませんでした'], ['種もみを見る', '湿気とネズミの跡を見る', '納屋で種もみの袋を確かめました']),
    O('p_seedstore', 21, 27, '🌾', '種もみの置き場所', '種もみは、湿気とネズミが大敵です。温度の低い、乾いた場所に置きます。',
      ['風通しの棚へ', '乾いて涼しい納屋の棚', '種もみを棚に置きました'], ['湿った土間へ', '納屋の土間にそのまま', '種もみを土間に置きました']),
    O('p_plan', 24, 33, '🗒️', '今年の計画', '{v}で、今年の計画を立てます。作り方をどう決めるかで、1年の見通しが変わります。',
      ['ノートを読む', 'うまくいったこと・失敗したこと', '去年のノートを読み返しました', 'plan', 'notes'], ['ノート見ず進む', '去年と同じ作り方に決める', '去年どおりに決めました', 'plan', 'same']),
    O('p_calendar', 29, 35, '📅', '田んぼの暦を書く', function (f) { return '{v}の田植えの目安は' + fmt(planP(f)) + 'ごろ。そこから逆算すると、種まきは20日ほど前です。カレンダーに書きこみます。'; },
      ['目安に丸つけ', '', '目安の日に丸をつけました', 'calendar', 'written'], ['目安は書かない', '準備は近づいてから', '目安は書かずにおきました', 'calendar', 'flex']),
    O('p_risshun', 35, 35, '🌸', '立春', '暦のうえでは今日から春。寒さはまだ続きますが、日が少しずつのびています。',
      ['草の芽を探す', '', '畦の草の小さな芽を見つけました'], ['陽気に種まく', '日がのびてきたので', '種をまきました']),
    O('p_soil', 33, 42, '🧪', '田の土のこと', function (f) { return 'この田の土は「' + f.soil.name + '」。肥料の量は、土の力(地力)に合わせて足し引きします。'; },
      ['量だけで決める', '去年の出来だけを頼りに', '去年の収量だけで決めました', 'soilnote', 'yield'], ['土をじっと見る', '色や粒の細かさ', '土の色と手ざわりを確かめました', 'soilnote', 'look']),
    O('p_ditch', 36, 45, '🚰', '水路の点検', '4月に用水が来る前に、水路の泥や落ち葉を上げておきます。水が止まったり、あふれたりしないように。',
      ['泥を上げる', '手間はかかるが、春の水の通りがよくなる', '水路の泥を上げました', 'ditch', 'cleared'], ['詰まりを放置', '用水が来てから考える', '水路の詰まりは放っておきました', 'ditch', 'left']),
    O('p_aze', 46, 55, '🕳️', '畦の点検', '畦にザリガニやモグラの穴がないか、冬のうちに歩いて確かめます。穴は水もれのもとになります。',
      ['穴をふさぐ', '春の水もれを防ぐ', '畦の穴をふさぎました', 'aze', 'fixed'], ['水を入れてから', '水の様子を見てから直す', '畦は春に直すことにしました', 'aze', 'later']),
    O('p_usui', 50, 50, '💧', '雨水', '雨水。雪が雨に変わりはじめるころ、という意味の日です。',
      ['水路の流れ見る', '', '水路の水の流れを見てきました'], ['ぬかるみを踏む', '', '水たまりの田を踏み歩きました']),
    O('p_machine', 53, 60, '🚜', '農機具の手入れ', 'トラクターや田植機のエンジンをかけて、刃・ベルト・油を点検します。',
      ['整備に出す', 'プロに見てもらう', '農機具を整備に出しました', 'machine', 'shop'], ['点検は直前に', '今はまだ早いので後回し', '農機具の点検は後回しにしました', 'machine', 'later']),
    O('p_birds', 56, 62, '🐦', '冬の田んぼの鳥', '冬の田んぼには、えさをさがしに鳥が来ることがあります。ヒバリのさえずりが聞こえはじめるころでもあります。',
      ['耳をすませる', '', '空の高いところでヒバリの声がしました'], ['鳥を追い払う', '', '鳥を追い払いました']),
    O('p_mizo', 58, 64, '🧹', '地区の水路そうじ', '春の用水の前に、地区のみんなで水路をそうじする集まりがあります。田んぼは、近所の人と水でつながっています。',
      ['参加する', '', '水路そうじに参加しました', 'mizo', 'joined'], ['誰も行かず休む', '集まりには参加しない', '水路そうじには誰も行きませんでした', 'mizo', 'skipped']),
    O('p_seedtreat', 63, 72, '🌡️', '種もみの消毒', '種もみの病気(いもち病・ばか苗病など)を防ぐため、種まきの前に消毒します。60℃ほどのお湯に10分つける「温湯消毒」もあります。',
      ['温湯消毒', 'お湯だけ。薬を使わない', '温湯消毒にしました', 'seedTreat', 'hot'], ['消毒せずにまく', '手間をかけない', '消毒はしないことにしました', 'seedTreat', 'none']),
    O('p_keichitsu', 65, 65, '🐛', '啓蟄', '啓蟄。土の中で冬ごもりしていた虫が出てくる、という意味の日です。',
      ['土をほって見る', '', 'ミミズが一匹、土の中にいました'], ['虫に薬をまく', '', '薬をまきました']),
    O('p_shunbun', 79, 79, '🌅', '春分・あしたから田の暦', function (f) { return '春分の日。昼と夜の長さがほぼ同じになります。あしたの3月21日から、田んぼの本格的な作業がはじまります。' + (f._prep && f._prep.seed === 'early' ? '冬のうちに種もみを用意した分、あわてずに始められそうです。' : ''); },
      ['水路の最終確認', '', '水路を最後に確かめました', 'ready', 'yes'], ['田に水を入れる', '用水の前に先に', '田に水を入れました', 'ready', 'water'])
  ];
  var PREP_ONE = PREP_ONE0.concat(kouRows().filter(function (r) { return r.w[0] < 80; }));
  // --- 準備: ふだんの冬の日 ---
  var PREP_FILL = [
    F('pf_frost', 1, 45, '🥶', '朝の霜', '畦の草が白く霜をかぶっています。足を踏み出すと、ざくっと音がします。', ['畦を歩く'], ['田を踏み歩く']),
    F('pf_sky', 1, 60, '🌤️', '冬の空', '空が高く澄んで、遠くの山がくっきり見えます。', ['田は見回らない'], ['土の乾き見る']),
    X(F('pf_stubble', 1, 60, '🌾', '刈り株の列', '稲刈りのあとの株が、茶色く並んでいます。わらの切れはしが土にまじっています。', ['株を拾ってみる'], ['株を燃やす']), { vs: [{ c: function (f) { return pr(f, 'ditch', 'cleared'); }, x: '刈り株が茶色く並ぶ田んぼのそばで、上げた泥が水路の脇に積まれています。春の用水に備えて、すっきりしました。' }, { c: function (f) { return pr(f, 'machine', 'shop') || pr(f, 'machine', 'self'); }, x: '刈り株が茶色く並ぶ田んぼ。手入れをしたトラクターが納屋で出番を待っています。' }] }),
    F('pf_ice', 1, 50, '🧊', '薄氷', '田のくぼみに薄氷が張っています。割れる音が澄んで聞こえます。', ['くぼみの氷見る'], ['氷を踏み歩く']),
    F('pf_sunset', 1, 79, '🌇', '冬の夕焼け', '田んぼの向こうに日が沈んでいきます。空が赤くなり、すぐに冷えこんできます。', ['夕方の田を見る'], ['田を見ずに帰る']),
    F('pf_quiet', 1, 60, '🤫', '田んぼの静けさ', 'いまの田んぼは、何も植わっていない静かな時期。それでも土の中では、小さな生きものが暮らしています。', ['土の湿りを見る'], ['土に薬をまく']),
    F('pf_heron', 1, 79, '🦢', 'サギが一羽', '乾いた田のすみに、白いサギが一羽立っています。えさをさがしているようです。', ['そっと見守る'], ['近づいて追う']),
    X(F('pf_ume', 36, 60, '🌸', '梅の便り', '近くの庭の梅が咲きはじめました。ほんのり甘い香りがします。', ['畦の草芽を見る'], ['水路に落ち葉']), { vs: [{ c: function (f) { return WD(f, f._cal).rain > 0; }, x: '雨にぬれた梅の花が、しっとり咲いています。ほんのり甘い香りが、雨のなかでも届きます。' }] }),
    F('pf_tsukushi', 55, 79, '🌱', 'つくしを見つけた', '畦の日なたで、つくしが顔を出していました。雨のあとで、田の土はゆるんでいます。', ['畦で芽を見る'], ['田を踏み歩く']),
    F('pf_wind', 40, 79, '🌬️', '春一番のころ', '南から強めの風が吹く日があります。乾いた土ぼこりが舞います。', ['畦の乾きを見る'], ['わらくずを残す']),
    X(F('pf_swallow', 60, 79, '🐦', 'ツバメはまだ', 'ツバメが南から戻ってくるのは、3月の終わりから4月ごろ。まだ姿は見えません。', ['畦の春草を見る'], ['田に水を入れる']), { vs: [{ c: function (f) { return f._cal >= 70 && WD(f, f._cal).Tx >= 16; }, x: 'ぽかぽか陽気で、もうツバメがいてもよさそうな日。でも、戻ってくるのは3月の終わりから4月ごろ。まだ姿は見えません。' }] }),
    F('pf_frog', 62, 79, '🐸', 'カエルはまだ', '田んぼにまだ水はなく、カエルの声もしません。水が入るのは4月からです。', ['水路をのぞく'], ['カエル呼ぶ水']),
    X(F('pf_crack', 1, 55, '🏜️', '乾いた田', '水のない田んぼの土は、冬の風でかわき、細かいひびが入っています。', ['ひびをなぞる'], ['足で踏んでみる']), { vs: [{ c: function (f) { return pr(f, 'aze', 'fixed'); }, x: '水のない田の土には細かいひびが入っています。ふさいだ畦の泥は、冬の寒さでかたく締まっていました。' }, { c: function (f) { return pr(f, 'aze', 'later'); }, x: '水のない田の土には細かいひびが入っています。春まで残した畦の穴が、ぽっかり口を開けています。' }] }),
    F('pf_farmbook', 1, 60, '📖', '農業の本', 'こたつに稲作の手引きを広げます。県の指導資料には、田植えの時期や肥料の目安がのっています。畦と水路を見て回る日です。', ['畦を見に行く', '', '畦を見て回りました'], ['本だけ読む', '', '本を読んで過ごしました']),
    X(F('pf_notice', 15, 70, '📮', '回覧板', '地区の回覧板が回ってきました。用水の当番や集まりの日程がのっています。', ['当番日を見る'], ['回覧板を見ない']), { vs: [{ c: function (f) { return pr(f, 'mizo', 'skipped'); }, x: '地区の回覧板が回ってきました。水路そうじを家の人に頼んだ分、用水の当番の日程はよく確かめておきます。' }, { c: function (f) { return pr(f, 'calendar', 'written'); }, x: '地区の回覧板が回ってきました。暦に書いた田植えの目安と、用水の日程を見くらべます。' }] }),
    F('pf_oldrice', 1, 79, '🍚', '去年のお米', '刈り株の並ぶ田を見ると、去年のお米の出来を思い出します。', ['刈り株を見る'], ['田を見ず過ごす']),
    X(F('pf_neighbor', 10, 79, '🧑‍🌾', 'ご近所の田', 'となりの田んぼのおじさんも、道具の手入れをしています。「今年もよろしく」とあいさつを交わしました。', ['立ち話をする'], ['声かけず通る']), { vs: [{ c: function (f) { return pr(f, 'mizo', 'joined'); }, x: '水路そうじで一緒だったとなりのおじさんと、また顔を合わせました。「春はもうすぐやなあ」と笑います。' }, { c: function (f) { return pr(f, 'plan', 'talk'); }, x: '聞いた話を思い出しながら、となりの田んぼのおじさんにあいさつ。「今年もよろしく」と声を返してくれました。' }] }),
    F('pf_mist', 5, 50, '🌫️', '朝もや', '朝のもやが、田んぼと川の方からのぼってきます。', ['もやの田を歩く'], ['もやで中止']),
    F('pf_mikan', 1, 40, '🍊', 'みかんの季節', '田んぼのそばの畑では、みかんが色づいています。田の見回りのついでの景色です。', ['田を見て回る'], ['みかんだけ見る']),
    F('pf_bird2', 20, 70, '🕊️', 'ハトの群れ', 'ハトの群れが田んぼにおりて、落ちた籾をついばんでいます。', ['追い払う'], ['追い払わない']),
    F('pf_dandelion', 62, 79, '🌼', 'タンポポ', '畦のすみに、タンポポの黄色い花がひとつ咲いています。', ['畦の草を見る'], ['暖かくて種まき']),
    F('pf_night', 1, 60, '🌌', '冬の星空', '夜の田んぼは明かりがなく、星がよく見えます。', ['夜は行かない'], ['夜の畦を歩く']),
    F('pf_rain', 40, 79, '🌦️', '春の雨', 'しとしと雨が田んぼをぬらしています。冬の土がゆるんで、においが変わりました。', ['傘で見に行く'], ['雨で中止する']),
    X(F('pf_seedbag', 35, 79, '🧺', '種もみの袋', '納屋の種もみの袋に手を入れてみます。さらさらと乾いた音がします。', ['手ざわりを確かめる'], ['確かめずに置く']), { ok: function (f, t) { return pr(f, 'seed', 'early'); }, vs: [{ c: function (f) { return pr(f, 'seed', 'early'); }, x: '冬のうちに注文した種もみの袋が、納屋に届いています。手を入れると、さらさらと乾いた音がします。春の準備は落ち着いて進められそうです。' }, { c: function (f) { return pr(f, 'seed', 'late'); }, x: '種もみは、春になってから頼むことにしました。納屋の棚はまだ空き。注文を忘れないようにしないと。' }] }),
    F('pf_cat', 1, 79, '🐈', '田んぼの猫', '近所の猫が畦を歩いています。ネズミをさがしているのかもしれません。', ['追い払う'], ['そっとしておく']),
    X(F('pf_rainw', 1, 79, '🌧️', '冬の雨', '冷たい雨が、乾いた田んぼをぬらしています。土の色が黒っぽく変わりました。', ['雨で見回り休み'], ['水の流れを見る']), { ok: function (f, t) { return WD(f, t).rain > 0; } }),
    X(F('pf_cold', 1, 45, '🥶', '底冷えの朝', '空気がぴんと張りつめる、冷えこんだ朝。吐く息が白く、田の水たまりは厚く凍っています。', ['凍った田を踏み歩く'], ['畦の霜を確かめる']), { ok: function (f, t) { var w = WD(f, t); return w.T < 3 && !w.rain; } }),
    X(F('pf_clear', 1, 60, '🌅', '放射冷却の朝', '雲のない晴れた夜明け。地面の熱がにげて、朝はとくに冷えます。日がのぼると霜がとけて、畦がきらきら光ります。', ['霜解けの畦'], ['霜の田に入水']), { ok: function (f, t) { var w = WD(f, t); return w.T < 6 && !w.rain && w.Tx >= 8; } }),
    X(F('pf_mild', 25, 79, '🌤️', '冬のなかの小春日和', '風もなく、日ざしがやわらかい日。上着がいらないほどあたたかく、冬の田んぼも気持ちよさそうです。', ['暖かくて種まき'], ['土を手で見る']), { ok: function (f, t) { var w = WD(f, t); return w.Tx >= 13 && !w.rain; } }),
    X(F('pf_kaze', 1, 79, '🍃', '北風の日', '冷たい風が田んぼをふきぬけます。乾いた土ぼこりと、わらくずが舞っています。', ['わらくず集め'], ['水路にわら流す']), { ok: function (f, t) { return f.windy(t); } }),
    X(F('pf_warmrain', 50, 79, '☔', '春の雨', 'あたたかい雨がふっています。この雨で、畦の草や田の土が目をさましていきます。', ['ゆるい土を見る'], ['ゆるい田を踏む']), { ok: function (f, t) { var w = WD(f, t); return w.rain > 0 && w.Tx >= 11; } }),
    F('pf_sun', 30, 79, '☀️', 'ぽかぽかの日', '日なたは春のようにあたたかい日です。上着を脱いで畦に座ります。', ['暖かいので入水'], ['草の芽を見る'])
  ];

  // --- 収穫後: 単発(pd=収穫の翌日からの日数、d=暦の日) ---
  function pdw(a, b) { return { pd: [a, b] }; }
  function POST_ONE(f, from) {
    var r = resOf(f), L = [], ok = r && r.ok;
    function P(k, a, b) { return [k, [from + a, from + b]]; }
    function add(spec, i, t, x, l, rr) { L.push({ k: spec[0], w: spec[1], i: i, t: t, x: x, L: l, R: rr }); }
    if (ok) add(P('q_dry', 0, 1), '♨️', '乾燥機に入れる', '刈った籾は、水分が多いと蒸れて傷みます。乾燥機に入れて、水分を15%ほどまで下げます。',
      ['ゆっくり乾かす', '低めの温度で。粒が割れにくい', '低めの温度でゆっくり乾かしました', 'dry', 'slow'], ['急いで乾かす', '早く終わるが、割れた粒がふえやすい', '温度を上げて急いで乾かしました', 'dry', 'fast']);
    if (ok) add(P('q_hull', 1, 3), '🌾', 'もみすり', '乾いた籾から、もみ殻をとって玄米にします。もみ殻は、できた籾の重さのおよそ2割です。',
      ['もみ殻を畑にまく', '土をふかふかにする', 'もみ殻は畑にまきました', 'husk', 'field'], ['堆肥にまぜる', 'じっくり発酵させる', 'もみ殻は堆肥にまぜました', 'husk', 'compost']);
    add(P('q_grade', 2, 7), '🏷️', '検査と等級の知らせ', ok ? '検査の結果は「' + r.grade + '」、10aあたり' + r.yield + 'kg。' + (r.yield >= NORMAL_KG ? '西三河の平均(' + NORMAL_KG + 'kg)より' + (r.yield - NORMAL_KG) + 'kg多くとれました。' : '西三河の平均(' + NORMAL_KG + 'kg)には、あと' + (NORMAL_KG - r.yield) + 'kg。') : '今年は、お米を収穫することができませんでした。それでも、田んぼから学んだことはたくさんあります。',
      ['結果を作業日誌に書く', '', '検査の結果を作業日誌に書きました'], ['来年の課題をメモ', '', '来年の課題をノートに書きました', 'tell', 'memo']);
    if (ok) add(P('q_ship', 5, 12), '🚚', '出荷のしかた', 'できた米を、どこへ届けましょう。', ['JAに出荷', '検査と集荷にまかせる', 'JAに出荷しました', 'ship', 'ja'], ['お客さんに直接', '精米して届ける', 'お客さんに直接届けることにしました', 'ship', 'direct']);
    if (ok) add(P('q_straw', 2, 14), '🌾', 'わらの処理', '稲刈りのとき細かく切ったわらが田に散っています。土にすき込むか、田から出すか。', ['すき込む', '土の栄養になる', 'わらを土にすき込みました', 'straw', 'plow'], ['田から出す', '堆肥や敷きわらに使う', 'わらを田から出しました', 'straw', 'out']);
    add(P('q_wash', 3, 17), '🧽', '機械を洗う', 'コンバインやトラクターを洗って、土とわらくずを落とします。来年も働いてくれる相棒です。', ['ていねいに洗う', '', '機械をていねいに洗いました', 'wash', 'good'], ['水洗いだけにする', '', '機械を水洗いしました', 'wash', 'quick']);
    if (ok) add(P('q_newrice', 4, 12), '🍚', '新米を味わう', '自分でつくったお米を、はじめて炊きます。つやつやの湯気が上がります。', ['おにぎりにする', '塩だけで', '塩むすびにしました', 'meal', 'onigiri'], ['白いごはんで', '何ものせずに', '炊きたてのごはんをそのまま味わいました', 'meal', 'plain']);
    add(P('q_recall', 3, 12), '📔', '稲刈りの日を思い出す', function (f) { return f.harvestDoy ? '稲刈りは' + fmt(f.harvestDoy) + '。穂が出た' + fmt(f.headDoy) + 'から' + (f.harvestDoy - f.headDoy) + '日でした。' + (f.lodged ? '稲が倒れて、刈るのが大変でした。' : '稲はまっすぐ立って、刈りやすい田でした。') : '稲刈りの季節は、いつのまにか過ぎてしまいました。'; },
      ['作業日誌に書く', '', '作業日誌に書きました', 'recall', 'diary'], ['写真を見返す', '', '写真を見返しました', 'recall', 'photo']);
    if (ok) add(P('q_gift', 8, 20), '🎁', '新米をくばる', 'お世話になった人に、新米をおすそ分けします。', ['親戚に送る', '', '親戚に新米を送りました', 'gift', 'family'], ['お隣さんに', '田んぼのことを教えてくれた人へ', 'お隣さんに新米を届けました', 'gift', 'neighbor']);
    add(P('q_diary', 14, 30), '📝', '作業日誌をつける', '今年の作業をノートにまとめます。来年の自分が読んで役に立つように。', ['日にちを中心に', '', '日にちを中心にまとめました', 'diaryStyle', 'dates'], ['気づきを中心に', '', '気づきを中心にまとめました', 'diaryStyle', 'notes']);
    // 見回りの思い出・出来事の回想(f.msgs と patrolLog から)
    var memo = f.msgs.filter(function (m) { return m && m.t && !/^✅/.test(m.t) && !/^⚠/.test(m.t) && m.doy > 80; });   // 80日目の最初の一言(土の話)は「はじめる」の処理で入る文なので、つづきからでは入らない。回想には使わない
    var picks = memo.length >= 3 ? [memo[0], memo[Math.floor(memo.length / 2)], memo[memo.length - 1]] : memo;
    picks.forEach(function (m, n) {
      add(['q_mem' + n, [from + 12 + n * 14, from + 38 + n * 20]], '💭', 'あの日のこと', fmt(m.doy) + ':「' + m.t + '」。1年をふりかえると、こんな日もありました。', ['日誌に書き足す', '', 'その日を日誌に書き足しました'], ['来年変える作業を日誌に書く', '', '来年変える作業を日誌に書きました']);
    });
    var life = (f.patrolLog && f.patrolLog.life) || [];
    life.slice(0, 2).forEach(function (t, n) {
      add(['q_life' + n, [from + 10 + n * 25, from + 50 + n * 25]], '📖', '出会った生きもの', '見回りのとき、こんな出会いがありました。' + t, ['見回り記録を見返す', '', '見回り記録を見返しました'], ['見つけた場所を日誌に書く', '', '見つけた場所を日誌に書きました']);
    });
    add(['q_tilling', [from + 10, D(12, 5)]], '🚜', '秋の田起こし', '稲刈りのあと、土を耕して稲株とわらを混ぜておく農家もいます。春までに少しずつ分解して、土になじみます。', ['耕しておく', '手間はかかるが、わらの分解がすすむ', '稲株を土に混ぜました', 'tilling', 'done'], ['春まで置く', '', '田は春まで置いておくことにしました', 'tilling', 'later']);
    add(['q_higanbana', [D(9, 15), D(10, 5)]], '🌺', '彼岸花', '畦に彼岸花が赤く咲いています。秋のお彼岸のころに咲きそろいます。', ['畦道を歩く', '', '赤い花の道を歩きました'], ['しゃがんで見る', '', '花をじっくり見ました']);
    add(['q_soukou', [D(10, 23), D(10, 23)]], '🍂', '霜降', '霜降。朝晩に霜がおりはじめるころの日です。', ['朝の畦の霜を見る', '', '朝の畦の霜を見ました'], ['霜の田を見て回る', '', '霜の田を見て回りました']);
    add(['q_ritto', [D(11, 7), D(11, 7)]], '🍁', '立冬', '立冬。暦のうえで冬のはじまりです。田んぼはすっかり静かになりました。', ['田を見に行く', '', '静かな田を見に行きました'], ['水路の様子を確かめる', '', '水路の様子を確かめました']);
    add(['q_soildo', [D(11, 1), D(12, 5)]], '🧺', '冬の土づくり', '土が疲れないように、冬のあいだに土づくりをします。堆肥を入れたり、ケイ酸という稲に必要な成分の資材をまいたりします。', ['堆肥を入れる', '土がふかふかになる', '堆肥を田に入れました', 'soilDo', 'compost'], ['ケイ酸資材をまく', '稲の茎が丈夫になる', 'ケイ酸資材をまきました', 'soilDo', 'silica']);
    add(['q_winterwater', [D(11, 5), D(12, 10)]], '💧', '冬の水管理', '稲刈りのあとの田に、冬は水を張る農家もいます。水を張ると、冬の田に生きものが集まります。張らずに乾かす田が多いなかで、どうしますか。', ['水を張らず乾かす', 'ふつうの管理', '田は水を張らずに乾かしました', 'winterwater', 'dry'], ['水を張ってみる', '生きものが集まる(冬のふゆみずたんぼ)', '冬の田に水を張りました', 'winterwater', 'flood']);
    add(['q_shosetsu', [D(11, 22), D(11, 22)]], '🌥️', '小雪', '小雪。冷たい雨が雪に変わりはじめるころ、といわれます。', ['田を見て回る', '', '田を見て回りました'], ['畦の草の霜を見る', '', '畦の草の霜を見ました']);
    add(['q_niiname', [D(11, 23), D(11, 23)]], '🎊', '新嘗祭・勤労感謝の日', '11月23日は、その年の収穫を神さまに感謝する「新嘗祭」の日です。今年のお米にも感謝を。', ['新米の水分を確かめる', '', '新米の水分を確かめました'], ['新米の味を確かめる', '', '新米を炊いて味を確かめました']);
    add(['q_taisetsu', [D(12, 7), D(12, 7)]], '🌨️', '大雪', '大雪。北の地方では雪が積もりはじめるころ、といわれます。西尾は晴れの多い冬です。', ['静かな田を見て回る', '', '静かな田を見て回りました'], ['水路を見て回る', '', '水路を見て回りました']);
    add(['q_nextyear', [D(12, 15), D(12, 24)]], '🔭', '来年への申し送り', function (f) { return ok ? '今年の出来(' + r.grade + '・' + r.yield + 'kg)を見て、来年いちばん気をつけたいことを決めます。' : '来年こそ収穫まで届けたい。いちばん気をつけたいことを決めます。'; },
      ['水の管理を見直す', '', '来年は水の管理を見直します', 'next', 'water'], ['肥料を見直す', '', '来年は肥料を見直します', 'next', 'fert']);
    add(['q_toji', [D(12, 22), D(12, 22)]], '🍊', '冬至', '冬至。1年でいちばん昼が短い日です。ゆず湯に入り、かぼちゃを食べる習わしがあります。', ['冬至の田を見て回る', '', '冬至の田を見て回りました'], ['水路の水を確かめる', '', '水路の水を確かめました']);
    add(['q_osouji', [D(12, 25), D(12, 27)]], '🧹', '1年の道具じまい', '年末の大そうじ。1年使った道具をしまい、倉庫の棚を整えます。', ['きれいに整える', '', '道具をきれいに整えました'], ['来年のために目印を', '', '来年のために目印をつけました']);
    add(['q_review', [D(12, 28), D(12, 30)]], '📔', '1年のふり返り', function (f) { return (ok ? '今年は「' + r.variety + '」で' + r.grade + '・' + r.yield + 'kg。' : '今年は収穫に届きませんでした。') + reflectLine(f); },
      ['今年の作業を日誌にまとめる', '', '今年の作業を日誌にまとめました'], ['来年の課題を日誌に書く', '', '来年の課題を日誌に書きました']);
    add(['q_omisoka', [365, 365]], '🔔', '大晦日', function (f) { return '大晦日。1年の最後の日です。1月1日にはじまった米づくりの365日が、もうすぐ終わります。' + (ok ? '今年のお米は' + r.grade + '、' + r.yield + 'kg。' : '') + 'あしたからは、また新しい年。'; },
      ['静かな田を見て回る', '', '静かな田を見て回り、1年を終えました'], ['来年の田の計画を書く', '', '来年の田の計画を書いて1年を終えました']);
    return L.concat(kouRows().filter(function (r) { return r.w[0] >= 200 && r.w[1] >= from; }));
  }
  // --- 収穫後: ふだんの日 ---
  var POST_FILL = [
    X(F('qf_stubble', 200, 330, '🌾', '稲刈りあとの田', '刈り株とわらが残る田んぼ。さっきまでの黄金色がうそのようです。', ['田を一周する'], ['畦から眺める']), { vs: [{ c: function (f) { return po(f, 'straw', 'plow'); }, x: '刈り株とわらが残る田んぼ。すき込んだわらの切れはしが、土のなかにまじっています。' }, { c: function (f) { return po(f, 'straw', 'out'); }, x: '刈り株が並ぶだけの、すっきりした田んぼ。わらを出したので、土の色がよく見えます。' }, { c: function (f) { return !!f.lodged; }, x: '刈り株が不ぞろいに並ぶ田んぼ。倒れた稲を刈った跡が、まだ残っています。' }] }),
    X(F('qf_sparrow', 220, 300, '🐦', 'スズメの群れ', 'スズメが落ち穂をついばんでいます。大群で、ぱっと飛び立つ音がします。', ['そっと見守る'], ['数えてみる']), { vs: [{ c: function (f) { return po(f, 'straw', 'plow'); }, x: 'スズメが、すき込んだ土のなかの落ち穂をつついています。大群で、ぱっと飛び立つ音がします。' }] }),
    F('qf_dragonfly', 240, 300, '🦟', '赤とんぼ', '赤とんぼが畦の上を群れて飛んでいます。', ['田の上を飛ぶ赤とんぼを見る'], ['畦を歩いて刈り株を見る']),
    F('qf_aki', 230, 310, '🍂', '秋晴れ', '空が高く、風がさわやか。秋の田は、作業がひと息ついた静けさです。', ['刈り株の田を歩く'], ['水路の水を見る']),
    F('qf_ochibo', 225, 310, '🌾', '落ち穂ひろい', '刈りとり機でこぼれた落ち穂が、田に少し残っています。', ['拾ってみる'], ['鳥にあげる']),
    F('qf_insect', 235, 300, '🦗', '秋の虫の声', '夜の畦から、コオロギやスズムシの声が聞こえます。', ['畦で虫の声を聞く'], ['夜の田を見て回る']),
    F('qf_festival', 270, 310, '🏮', '秋祭り', '地域の秋祭り。太鼓の音が遠くから聞こえてきます。', ['祭りの日に田を見て回る'], ['畦の草を確かめる']),
    F('qf_kaki', 280, 330, '🍊', '柿の実', '庭の柿が色づきました。', ['刈り株の田を見て回る'], ['畦の草を見る']),
    F('qf_wintbird', 285, 340, '🦆', '冬鳥の季節', '北から冬鳥が渡ってくるころ。田んぼや川のそばで、見慣れない鳥に出会うことがあります。', ['双眼鏡で冬鳥をさがす'], ['田の足あとを見る']),
    F('qf_koyo', 305, 335, '🍁', '紅葉', '近くの木々が色づいています。', ['色づく木の下の畦を歩く'], ['田を見て回る']),
    F('qf_hatsujimo', 300, 345, '🥶', '初霜', '朝、畦の草が白くなっていました。冬が近づいています。', ['草を触る'], ['霜の田を歩く']),
    F('qf_kitakaze', 310, 365, '🌬️', '北風', '冷たい北風が吹くようになりました。', ['北風の田を見て回る'], ['水路の水の減りを見る']),
    F('qf_mikan', 310, 365, '🍊', 'みかんとこたつ', '田んぼのそばの畑では、みかんが色づいています。', ['田を見て回る'], ['畦の草の霜を見る']),
    F('qf_star', 315, 365, '🌌', '冬の星空', '夜の田んぼは真っ暗で、星がよく見えます。', ['夜の田の水たまりを見る'], ['夜の畦を歩く']),
    X(F('qf_waterdown', 320, 365, '🚰', '水路の水が減る', '用水の水が止まり、水路の水が少なくなっています。来年4月まで、田んぼは水を必要としません。', ['水路をのぞく'], ['記録しておく']), { vs: [{ c: function (f) { return po(f, 'winterwater', 'flood'); }, x: '用水の水は止まりましたが、冬の水を張った田には、まだ水が光っています。生きものが集まるでしょうか。' }] }),
    X(F('qf_dry', 320, 365, '🏜️', '乾いた土', '水を落とした田の土は、固くしまって乾いています。', ['足で踏んでみる'], ['手にとる']), { vs: [{ c: function (f) { return po(f, 'soilDo', 'compost'); }, x: '水を落とした田の土は、固くしまって乾いています。入れた堆肥のおかげか、土の色は黒ずんでいます。' }, { c: function (f) { return po(f, 'soilDo', 'silica'); }, x: '水を落とした田の土は、固くしまって乾いています。まいたケイ酸資材が、土にとけこんでいきます。' }] }),
    F('qf_sunset2', 320, 365, '🌇', '冬の夕焼け', '田んぼの向こうの空が、真っ赤に染まります。', ['夕方の田を見る'], ['刈り株の列を見る']),
    F('qf_kotatsu', 330, 365, '📒', 'こたつと帳簿', 'こたつにあたりながら、1年の収支を帳簿に整えます。', ['数字を足していく'], ['明日に回す']),
    F('qf_snowfore', 335, 365, '🌨️', '雪の予報', '山のほうでは雪の予報。西尾は晴れて、空気がキンと冷えています。', ['雪の前の田を見て回る'], ['水路を確かめる']),
    F('qf_shopping', 350, 364, '🛒', '年末の買い出し', '年末の買い出し。お餅やお正月の用意をします。', ['米袋の破れを確かめる'], ['保管場所の湿気を確かめる']),
    F('qf_mochi', 355, 364, '🍡', '餅つき', 'もち米の湯気が上がります。つきたてのお餅は、やわらかくて熱いです。', ['杵を持つ'], ['丸めるのを手伝う']),
    F('qf_shime', 350, 364, '🎍', 'しめ縄のわら', '稲わらは、お正月のしめ縄にも使われます。田んぼで育った稲の一部が、家の玄関を飾ります。', ['しめ縄をなう'], ['飾りを選ぶ']),
    X(F('qf_rain', 200, 365, '🌧️', '稲刈りあとの雨', '雨が刈り株の田をぬらしています。田の土はぬかるみ、水たまりに空がうつっています。', ['雨の田の水たまりを見る'], ['水の流れを見る']), { ok: function (f, t) { return WD(f, t).rain > 0; },
      vs: [{ c: function (f) { return po(f, 'straw', 'plow'); }, x: '雨が田をぬらしています。すき込んだわらが水をふくんで、少しずつ土になじんでいきます。' }, { c: function (f) { return po(f, 'tilling', 'done'); }, x: '雨が田をぬらしています。耕しておいた土が黒く湿って、稲株の分解がすすみそうです。' }] }),
    X(F('qf_coldmorn', 290, 365, '🥶', '冷えこむ朝', '空気がぴんと冷えた朝。吐く息が白く、畦の草は霜で固まっています。', ['霜の畦を歩く'], ['凍った水たまりを見る']), { ok: function (f, t) { var w = WD(f, t); return w.T < 4 && !w.rain; } }),
    X(F('qf_indian', 200, 300, '☀️', '秋の暑さ', '秋なのに、昼は夏のような暑さ。刈り株の田から、乾いたわらのにおいが立ちのぼります。', ['刈り株の田の乾きを見る'], ['水路の水を見る']), { ok: function (f, t) { return WD(f, t).Tx >= 27; } }),
    X(F('qf_cool', 230, 330, '🍃', 'さわやかな日', '風が澄んで、秋らしい気持ちのよい日。田んぼの向こうの山が、くっきり見えます。', ['畦を歩く'], ['刈り株を見て回る']), { ok: function (f, t) { var w = WD(f, t); return w.Tx >= 17 && w.Tx < 25 && !w.rain; } }),
    X(F('qf_kaze', 250, 365, '🍂', '風の強い日', '強い風で、木の葉やわらくずが田に舞っています。', ['わらくず集め'], ['畦の土を確かめる']), { ok: function (f, t) { return f.windy(t); } }),
    X(F('qf_typhoon', 200, 290, '🌀', '台風のあと', '台風が通りすぎたあとの田んぼ。稲刈りがすんでいて、ほっとします。', ['田を見回る'], ['水路のごみを取りのぞく']), { ok: function (f, t) { return f.w.typhoons.some(function (d) { return t - d >= 1 && t - d <= 3; }); } }),
    X(F('qf_cook', 0, 400, '🍙', '新米の炊き方', '新米は水が多いので、水加減を少なめにするとおいしく炊けるといわれます。', ['水を少なめに'], ['いつもどおり']), { vs: [{ c: function (f) { return po(f, 'ship', 'direct'); }, x: 'お客さんに届けるお米。新米は水が多いので、水加減を少なめにするとおいしい、と一言そえて送ります。' }] }),
    F('qf_go', 0, 400, '🥣', '一合は何グラム', 'お米1合は約150g。炊くと、お茶わん2杯ぶんほどになります。', ['量ってみる'], ['炊いてみる']),
    F('qf_hyo', 0, 400, '⚖️', '1俵は60kg', 'お米の重さの単位「1俵」は60kg。10aの田んぼから、およそ8〜9俵ほどがとれる計算です。', ['計算してみる'], ['米袋を持ってみる']),
    F('qf_genmai', 0, 400, '🍚', '玄米と白米', '玄米を精米すると、白米は9割ほどに減ります。ぬかを落とした分、軽くなります。', ['玄米を炊く'], ['白米で食べる']),
    F('qf_hozon', 0, 400, '🧊', 'お米の保存', 'お米は、湿気と暑さが苦手。冷蔵庫の野菜室など、涼しい場所に置くと風味が保たれます。', ['袋を整理する'], ['冷蔵庫に入れる']),
    F('qf_nokazu', 0, 400, '🍙', 'おにぎりの日', '田んぼで育てたお米のおにぎりは、ひと味ちがって感じます。', ['塩だけで'], ['具をのせる']),
    F('qf_oneperson', 0, 400, '🍽️', 'ひとり年間約50kg', '日本人がひとり1年に食べるお米は、およそ50kg前後です。この田んぼ1枚(10a)でも、十数人ぶんです。', ['計算してみる'], ['俵の数を数える']),
    F('qf_gohan', 0, 400, '🥢', 'ごはんのおとも', '炊きたてに合うおかず。梅干し、のり、たまご……。', ['梅干しで'], ['たまごで']),
    F('qf_compare', 0, 400, '🍚', '食べくらべ', '去年のお米と、今年の新米を食べくらべてみます。', ['香りを比べる'], ['甘みを比べる']),
    X(F('qf_nokori', 0, 400, '📦', '倉庫のお米', '倉庫には今年のお米の袋が積まれています。', ['数えてみる'], ['棚を整える']), { vs: [{ c: function (f) { return po(f, 'ship', 'ja'); }, x: '倉庫は、JAに出荷したあとでがらんとしています。手元に残したお米の袋が、すみに積まれています。' }, { c: function (f) { return po(f, 'ship', 'direct'); }, x: '倉庫には、お客さんに送る分のお米の袋が積まれています。伝票と数を確かめます。' }] })
  ];
  var NEED_HARVEST = { qf_stubble: 1, qf_ochibo: 1, qf_cook: 1, qf_go: 1, qf_hyo: 1, qf_genmai: 1, qf_hozon: 1, qf_nokazu: 1, qf_oneperson: 1, qf_gohan: 1, qf_compare: 1, qf_nokori: 1, qf_shime: 1, qf_mochi: 1 };
  function resOf(f) { if (f._res === undefined) { try { f._res = f.result(); } catch (e) { f._res = null; } } return f._res; }

  // --- 準備の記録・収穫後の記録をふり返りの文にする ---
  var PREP_NAME = { seed: { early: '種もみを冬のうちに注文', late: '種もみは春に注文' }, aze: { fixed: '畦の穴ふさぎ', later: '畦の穴は春まで放置' } };
  function names(obj, tbl) { var out = []; for (var k in tbl) if (obj && tbl[k][obj[k]]) out.push(tbl[k][obj[k]]); return out; }
  function reflectLines(f) {
    var a = names(f._prep, PREP_NAME), L = [], j = f._judge;
    if (j && j.ok + j.ng > 0) L.push('🎯 今年の判断: 状態を読んで正しく選べた日が ' + j.ok + '回、よくない選択が ' + j.ng + '回でした。');
    if (a.length) L.push('📝 冬の準備: ' + a.join('・') + '。' + (f._prep && f._prep.seed === 'early' && f.method !== 'direct' ? '早めに用意した種もみのおかげで、春の種まきは塩水選がすんだ状態ではじめられました。' : '') + (f._prep && f._prep.aze === 'fixed' ? '冬にふさいだ畦の穴のおかげで、春の水もれは小さくてすみました。' : ''));
    return L;
  }
  function reflectLine(f) { return reflectLines(f).join(' '); }

  function cache(f, key, from, make) { var c = f[key]; if (!c || c.from !== from) c = f[key] = { from: from, sch: make() }; return c.sch; }
  // 周回117(F1・お手本3枚): 最初の3枚は種(seedP)によらず固定し、全員が同じ順で「弾き方→×がありうる→○で取り戻せる」を通る。正解の側も固定(1日=左・2日=右・3日=左、1枚目と2枚目で必ず逆)
  var FIRST3 = { 1: 'p_newyear', 2: 'p_frost', 3: 'pf_crack' };
  var FIRST3_SIDE = { 1: 'left', 2: 'right', 3: 'left' };
  var FIRST3_KEYS = { p_newyear: 1, p_frost: 1, pf_crack: 1 };
  function first3Row(cal) {
    var k = FIRST3[cal], i;
    if (!k) return null;
    for (i = 0; i < PREP_ONE.length; i++) if (PREP_ONE[i].k === k) return PREP_ONE[i];
    for (i = 0; i < PREP_FILL.length; i++) if (PREP_FILL[i].k === k) return PREP_FILL[i];
    return null;
  }
  function prepCard(f) {
    var cal = f._cal == null ? 1 : f._cal, fr = first3Row(cal);
    if (fr) return dcard('準備', '_prep', fr, f);
    var sch = cache(f, '_prsch', 1, function () { return schedule(PREP_ONE, PREP_FILL, 1, 79, f.seedP & 255, f); }), r = sch[f._cal];
    return dcard('準備', '_prep', r, f);
  }
  function postCard(f) {
    var from = f._postFrom || f._cal, ones = POST_ONE(f, from);
    var sch = cache(f, '_posch', from, function () { return schedule(ones, POST_FILL.filter(function (r) { return !NEED_HARVEST[r.k] || (resOf(f) && resOf(f).ok); }), from, 365, f.seedP & 255, f); }), r = sch[f._cal];
    if (!r) { r = POST_FILL[0]; }
    return dcard('収穫後', '_post', r, f);
  }

  var lastKey = '';
  function phase(f) { var c = f._cal == null ? 1 : f._cal; return c < 80 ? 'prep' : f.done ? 'post' : 'main'; }
  function cardFor(f) {
    var c = null, i, ph = phase(f), steps = ph === 'prep' ? [prepCard] : ph === 'post' ? [postCard] : [mandatory, weatherCard, checkCard, eventCard, calmCard];
    function mandatory(f) { for (i = 0; i < MAND.length; i++) { var m = MAND[i](f); if (m) return m; } return null; }
    day(f);
    for (var s = 0; s < steps.length && !c; s++) { try { c = steps[s](f); } catch (e) { if (window.console) console.error('card error', e); c = null; } }
    if (!c) c = fallback(f);
    lastKey = c.key;
    return shuffleSides(c, f);
  }
  // 正解がいつも同じ側にならないよう、判定つきのカードは左右を日ごとに入れかえる(f・日・カードだけで決まるので、つづきからでも同じになる)
  function shuffleSides(c, f) {
    if (!c.judged || c.left.label === c.right.label) return c;
    function swap() {
      var L = c.left, R = c.right, ap = c.apply;
      c.left = R; c.right = L;
      var vd = c.verdict;
      c.apply = function (side, f) { return ap(side === 'left' ? 'right' : 'left', f); };
      c.verdict = function (side, f) { return vd(side === 'left' ? 'right' : 'left', f); };
    }
    // 周回117(F1): 最初の3枚だけは正解の側を固定する(1日=左・2日=右・3日=左)。それ以外は従来のハッシュ方式
    var cal117 = f._cal == null ? 1 : f._cal;
    if (FIRST3_SIDE[cal117] && FIRST3_KEYS[c.key]) {
      var okSide = null;
      try { okSide = c.verdict('left', f) ? 'left' : c.verdict('right', f) ? 'right' : null; } catch (e) { okSide = null; }
      if (okSide && okSide !== FIRST3_SIDE[cal117]) swap();
      return c;
    }
    var h = 0, s = c.key + ':' + (f._cal == null ? 1 : f._cal) + ':' + (f.seedP & 65535), i;
    for (i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;   // 下位の桁までよく混ぜる
    if (!(h & 1)) return c;
    swap();
    return c;
  }
  // 1日すすめる。本編(80日目〜稲刈り)だけエンジンを動かし、準備と収穫後は暦だけが進む
  function advance(f) {
    var cal = f._cal == null ? 1 : f._cal;
    if (cal >= 80 && !f.done) { beforeStep(f); f.step(); }
    f._cal = cal + 1;
    if (f.done && f._postFrom == null) f._postFrom = f._cal;   // 稲刈りの翌日(強制終了なら終了日)から収穫後
    return f._cal;
  }
  function over(f) { return (f._cal == null ? 1 : f._cal) > 365; }

  // ---------- 日の始まり(旬ごとの集計を1日単位にした分) ----------
  function beforeStep(f) {
    var ev = f.patrolEvents();
    if (f._prep && f._prep.aze === 'fixed' && !f._azeUsed) {   // 冬に畦の穴をふさいだ年は、春の最初の水もれがすぐに止まる
      var lk = ev.filter(function (e) { return e.kind === 'leak' && !e.fixed; })[0];
      if (lk) { f._azeUsed = 1; lk.fixed = true; lk.how = 'main'; f.patrolLog.fixed.leak++; f.msg('冬にふさいだ畦のおかげで、水もれはすぐに止まりました'); }
    }
    f.leakOpen = ev.some(function (e) { return e.kind === 'leak' && !e.fixed; });
    var dd = dateOf(f.doy).d;
    if (dd === 1 || dd === 11 || dd === 21) ev.forEach(function (e) { penalize(f, e); });   // 手を打てなかった事件は旬ごとに害になる(エンジンの旬単位と同じ)
  }

  // ---------- HUD用の簡易ステータス(0〜1) ----------
  function status(f) {
    var cl = function (x) { return Math.max(0, Math.min(1, x)); }, s = {};
    try {
      var pan = f.v.panRef, tiller = f.transDoy && !f.midStart && !f.headDoy && f.stems < 0.8 * pan;   // 茎をふやす時期は、浅水がいちばん。深水・水切りだと茎がふえにくい
      var wm = f.water, wv = tiller ? ({ shallow: 1, intermittent: 0.65, deep: 0.5 }[wm] || 0.3) : (['shallow', 'deep', 'intermittent'].indexOf(wm) >= 0 ? 1 : wm === 'mid' ? 0.5 : wm === 'drained' ? 0.2 : 0.3);
      s.water = { v: wv, label: waterName(f).replace(/\(.*\)/, '') };
      var wd = f.transDoy ? f.weedExtra / 0.1 + (f.herb || f.herbs.length ? 0 : 0.25) + (f.method !== 'direct' && !f.puddleDoy ? 0.15 : 0) - 3 * (f.weedPulled || 0) : 0; s.weed = { v: cl(1 - wd), label: wd < 0.3 ? '少ない' : wd < 0.6 ? 'ふつう' : '多い' };
      var pest = Math.max(f.blast * 20, f.sheath, Math.min(1, f.bph / 40)); s.bug = { v: cl(1 - pest), label: pest < 0.15 ? '安心' : pest < 0.5 ? '注意' : '要対策' };
      var nr = f.transDoy ? f.nVeg() / f.nVegOpt() : 0.8; s.fert = { v: cl(nr), label: nr < 0.7 ? '足りない' : nr < 1.2 ? 'ちょうどよい' : '多め' };
      var vig = f.transDoy ? (f.lodged ? 0.2 : cl(f.stems / (f.v.panRef * 1.2) + 0.2)) : 0.5; s.vigor = { v: vig, label: f.lodged ? '倒れた' : vig < 0.4 ? '育ちかけ' : vig < 0.8 ? '元気' : 'ぐんぐん' };
      // 準備期(冬)は、判定つきの世話の積み重ねで水の備えと田の元気が少しずつ動く(サイクル66)。本編の計算には触れない
      if (!f.transDoy && !f.sowDoy && (f._cal == null || f._cal < 80) && f._wc) { var wnet = f._wc.n || 0; s.water = { v: cl(s.water.v + wnet * 0.03), label: s.water.label }; s.vigor = { v: cl(s.vigor.v + wnet * 0.04), label: s.vigor.label }; }
      if (f.harvestDoy) s.vigor = { v: 1, label: '収穫ずみ' };
    } catch (e) { s.error = String(e); }
    return s;
  }

  window.KomeCards = { cardFor: cardFor, advance: advance, over: over, day: day, phase: phase, reflectLines: reflectLines, beforeStep: beforeStep, status: status, weather: wx, lastKey: function () { return lastKey; } };
})();

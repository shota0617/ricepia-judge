"""回答日の実関数・注入ブラウザfixture。自然操作の検証ではない。"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(os.environ.get("KOME365_ROOT", Path(__file__).resolve().parents[1]))
HTML = Path(os.environ.get("KOME365_HTML", ROOT / "kome365/index.html"))

JS = r"""
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const [htmlPath, root] = process.argv.slice(1);
const html = fs.readFileSync(htmlPath, 'utf8');
const K = require(root + '/kome365/engine.js');
const cards = fs.readFileSync(root + '/kome365/cards.js', 'utf8');
function section(from, to) {
  const a = html.indexOf(from), b = html.indexOf(to, a + from.length);
  assert(a >= 0 && b > a, 'missing product function boundaries: ' + from);
  assert(html.indexOf(from, a + 1) < 0, 'ambiguous function: ' + from);
  return html.slice(a, b);
}
const why = section('  function whyShow(', '  var whyTimer =');
const hideAt = html.indexOf('  function whyHide(');
assert(hideAt >= 0, 'missing whyHide');
const hide = html.slice(hideAt, html.indexOf('\n', hideAt));
const advance = section('  function advanceTurn(', '  function ksStep(');
const dates = [
  [1, 1, '1月1日', '1月2日', false],
  [1, 31, '1月31日', '2月1日', false],
  [2, 28, '2月28日', '3月1日', false],
  [5, 31, '5月31日', '6月1日', false],
  [8, 31, '8月31日', '9月1日', false],
  [11, 30, '11月30日', '12月1日', true]
];
const rows = [];
for (const [month, day, answered, next, post] of dates) for (const ok of [true, false]) {
  const elements = {}, errors = [], frames = [], timers = new Map();
  let now = 0, timerId = 0, saves = 0, renderCount = 0, tallyDay = null;
  const marks = [], traces = [];
  const $ = id => elements[id] || (elements[id] = {
    textContent: '', innerHTML: '', style: {}, offsetWidth: 100, attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    classList: { values: new Set(), add(...ks) { ks.forEach(k => this.values.add(k)); },
      remove(...ks) { ks.forEach(k => this.values.delete(k)); }, contains(k) { return this.values.has(k); } }
  });
  const noop = () => {};
  const c = { K, Kome365: K, $, console: { error: (...xs) => errors.push(xs.map(String).join(' ')) },
    choices: '', whyTimer: null, whyKeep: false, whyPend: false, whyWatch: null,
    markVer: 0, paddyInfo: { base: '', wet: false }, stageTintInfo: { idx: 0 },
    streak: 0, streakBest: 0, recDone: false, lifeCnt: 0, busy: true,
    fieldTimer: null, fieldFin: null, fieldSide: null, lastTurnFrom: null,
    store: { set: noop }, ksSameScreen: () => false, pvClear: noop, finishFx: noop,
    rwTake: noop, lifeNew: () => null, markShow: k => marks.push(k),
    traceAdd: value => traces.push(value), esc: String, impactCalc: () => ({}),
    tallyAdd: d => { tallyDay = d; }, save: () => { saves++; }, drawField: noop,
    careAvg: () => 0, careWorst: () => 0, careSet: noop, rippleSet: noop,
    pulseBars: noop, vibJudge: noop, danceCalc: () => ({ count: 0 }),
    whyFit: noop, whyWatchOn: noop,
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: noop,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, due: now + ms, ms }); return id; },
    clearTimeout: id => timers.delete(id) };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(cards, c, { filename: 'kome365/cards.js' });
  c.f = new K.Farm({ seed: 142, year: 'normal', variety: 'kaori', soil: 'mid' });
  const doy = K.doyOf(month, day);
  c.f._cal = doy;
  if (doy >= 80) c.f.doy = post ? K.doyOf(10, 15) : doy;
  c.f.done = post;
  c.choices = 'L'.repeat(doy - 1);
  const engineDayBefore = c.f.doy;
  c.card = { key: 'test-reason', title: '理由の対象日', left: { label: '左' }, right: { label: '右' },
    apply: () => (ok ? '⭕ ' : '❌ ') + 'この回答の理由です。次の文は出さない。' };
  c.render = () => {
    const d = K.dateOf(c.KomeCards.day(c.f));
    $('swBigDate').textContent = d.m + '月' + d.d + '日'; renderCount++;
  };
  vm.runInContext(why + '\n' + hide + '\n' + advance, c, { filename: 'extracted-index-functions.js' });
  c.advanceTurn('left', 1);
  const textBeforeFrame = $('swWhy').textContent;
  now = 16;
  frames.splice(0).forEach(fn => fn());
  const shown = $('swWhy').classList.contains('on');
  const timer = timers.get(c.whyTimer);
  const advanceClock = target => {
    while (true) {
      const due = [...timers].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      now = due[1].due; timers.delete(due[0]); due[1].fn();
    }
    now = target;
  };
  advanceClock(16 + 1999);
  const keptBeforeTimeout = $('swWhy').classList.contains('on');
  const visibleText = $('swWhy').textContent, keepFirstThree = c.whyKeep;
  advanceClock(16 + 2100);
  rows.push({ answered, next, ok, doy, engineDayBefore, currentDay: c.KomeCards.day(c.f),
    text: visibleText, textBeforeFrame, displayedDate: $('swBigDate').textContent,
    kind: $('swWhy').attrs['data-k'], marks, traces, saves, renderCount, tallyDay,
    shown, keptBeforeTimeout, keepFirstThree, hiddenAfterTimeout: !$('swWhy').classList.contains('on'),
    fallbackTimerMs: timer ? timer.ms : null, choices: c.choices.length, busy: c.busy, errors });
}
console.log(JSON.stringify(rows));
"""


class TestKome365WhyAnsweredDate(unittest.TestCase):
    def test_reason_uses_answered_calendar_date_after_advance(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required; missing runtime is not a pass or skip")
        out = subprocess.run([node, "-e", JS, str(HTML), str(ROOT)],
                             capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        rows = json.loads(out.stdout)
        self.assertEqual(len(rows), 12)
        print("why-date fixture: " + json.dumps(rows, ensure_ascii=False))
        compact_dates = {"1月1日": "1/1", "1月31日": "1/31", "2月28日": "2/28", "5月31日": "5/31", "8月31日": "8/31", "11月30日": "11/30"}
        for row in rows:
            with self.subTest(answered=row["answered"], ok=row["ok"]):
                self.assertEqual(row["errors"], [])
                self.assertEqual(row["currentDay"], row["doy"] + 1)
                self.assertEqual(row["displayedDate"], row["next"])
                self.assertEqual(row["tallyDay"], row["doy"])
                if row["doy"] < 80 or row["answered"] == "11月30日":
                    self.assertNotEqual(row["engineDayBefore"], row["doy"])
                self.assertEqual([row["saves"], row["renderCount"]], [1, 1])
                self.assertEqual(row["choices"], row["doy"])
                self.assertFalse(row["busy"])
                mark, kind = ("○", "ok") if row["ok"] else ("✗", "ng")
                self.assertEqual(row["marks"], [kind])
                self.assertEqual(row["traces"], [row["ok"]])
                self.assertEqual(row["kind"], kind)
                self.assertTrue(row["shown"] and row["keptBeforeTimeout"])
                self.assertEqual(row["keepFirstThree"], row["doy"] <= 3)
                self.assertEqual(row["fallbackTimerMs"], 2100)
                self.assertTrue(row["hiddenAfterTimeout"])
                self.assertEqual(row["textBeforeFrame"], row["text"])
                self.assertEqual(row["text"], f"{mark} {compact_dates[row['answered']]}：この回答の理由です。")


    def test_reason_wrap_keeps_a_readable_last_line(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("kome_why_browser_fixture", ROOT / "tests/test_kome365_firstmin.py")
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        self.assertEqual(Path(helper.HTML_PATH).resolve(), HTML.resolve())
        sentence = "✗ 1/10：肥料は稲に合わせて春から入れます。"
        script = r"""(async () => {
          const w = document.getElementById('swWhy');
          if (!w) throw new Error('swWhy missing');
          await document.fonts.ready;
          w.textContent = '✗ 1/10：肥料は稲に合わせて春から入れます。';
          w.setAttribute('data-k', 'ng'); w.classList.add('on');
          await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
          const text = w.firstChild, range = document.createRange(), rows = [];
          for (let i = 0; i < text.length; i++) {
            range.setStart(text, i); range.setEnd(text, i + 1);
            const b = range.getBoundingClientRect();
            if (!(b.height > 0)) throw new Error('character has no rendered range');
            let row = rows.find(r => Math.abs(r.top - b.top) < 1);
            if (!row) { row = { top: b.top, text: '' }; rows.push(row); }
            row.text += text.data[i];
          }
          rows.sort((a, b) => a.top - b.top);
          const b = w.getBoundingClientRect(), cs = getComputedStyle(w);
          return { text: w.textContent, lines: rows.map(r => r.text.trim()), viewport: [innerWidth, innerHeight],
            on: w.classList.contains('on'), rendered: b.width > 0 && b.height > 0 && cs.visibility === 'visible', fontSize: cs.fontSize };
        })()"""
        try:
            result = helper.sound_run([{"name": "reason-wrap", "w": 390, "h": 844, "acts": ["js:" + script]}])
        except unittest.SkipTest as error:
            self.fail("Browser fixture unavailable; not a passing check: " + str(error))
        self.assertEqual(result["reason-wrap"]["errs"], [])
        rows = result["reason-wrap"]["js"]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        print("why-wrap fixture: " + json.dumps(row, ensure_ascii=False))
        self.assertEqual(row["viewport"], [390, 844])
        self.assertTrue(row["on"] and row["rendered"])
        self.assertEqual(row["fontSize"], "15px")
        self.assertEqual(row["text"], sentence)
        self.assertEqual("".join(row["lines"]).replace(" ", ""), sentence.replace(" ", ""))
        self.assertEqual(len(row["lines"]), 2)
        self.assertGreaterEqual(min(len(line) for line in row["lines"]), 4, row["lines"])


    def test_first_three_reasons_fit_landscape_on_one_line(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("kome_why_landscape_fixture", ROOT / "tests/test_kome365_firstmin.py")
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        self.assertEqual(Path(helper.HTML_PATH).resolve(), HTML.resolve())
        sentences = [
            "○ 1/1：年の初めに田を見て回ると、畦の傷みに早く気づけます",
            "○ 1/2：霜の畦を歩くと、畦の締まり具合が足で分かります",
            "○ 1/3：ひびを指で見ると、土の乾き具合が分かります",
        ]
        script = r"""(async () => {
          const sentences = __SENTENCES__, w = document.getElementById('swWhy'), samples = [];
          if (!w) throw new Error('swWhy missing');
          await document.fonts.ready;
          for (const sentence of sentences) {
            w.classList.remove('on'); w.textContent = sentence; w.setAttribute('data-k', 'ok');
            void w.offsetWidth; w.classList.add('on');
            const deadline = performance.now() + 1000;
            window.dispatchEvent(new Event('resize'));
            const opacityReady = await new Promise(resolve => {
              let frame = 0, done = false;
              const finish = ok => { if (done) return; done = true; clearTimeout(timer); cancelAnimationFrame(frame); resolve(ok); };
              const timer = setTimeout(() => finish(false), 1000);
              const tick = () => {
                if (performance.now() >= deadline) return finish(false);
                if (Number(getComputedStyle(w).opacity) > 0.1) return finish(true);
                frame = requestAnimationFrame(tick);
              };
              frame = requestAnimationFrame(tick);
            });
            const text = w.firstChild, range = document.createRange(), rows = [];
            let inside = true, measured = '';
            for (let i = 0; i < text.length; i++) {
              range.setStart(text, i); range.setEnd(text, i + 1);
              const b = range.getBoundingClientRect();
              if (!(b.width > 0 && b.height > 0)) throw new Error('character has no rendered range');
              inside = inside && b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
              let row = rows.find(r => Math.abs(r.top - b.top) < 1);
              if (!row) { row = { top: b.top, text: '' }; rows.push(row); }
              row.text += text.data[i]; measured += text.data[i];
            }
            rows.sort((a, b) => a.top - b.top);
            const cs = getComputedStyle(w);
            samples.push({ text: w.textContent, measured, lines: rows.map(r => r.text), inside,
              viewport: [innerWidth, innerHeight], fontSize: cs.fontSize,
              opacityReady, opacity: Number(cs.opacity),
              visible: opacityReady && w.classList.contains('on') && cs.visibility === 'visible' && Number(cs.opacity) > 0.1 });
          }
          return samples;
        })()""".replace("__SENTENCES__", json.dumps(sentences, ensure_ascii=False))
        sizes = [(568, 320), (844, 390)]
        plans = [{"name": f"landscape-{w}x{h}", "w": w, "h": h, "acts": ["js:" + script]} for w, h in sizes]
        try:
            result = helper.sound_run(plans)
        except unittest.SkipTest as error:
            self.fail("Browser fixture unavailable; not a passing check: " + str(error))
        for w, h in sizes:
            case = result[f"landscape-{w}x{h}"]
            self.assertEqual(case["errs"], [])
            self.assertEqual(len(case["js"]), 1)
            samples = case["js"][0]
            self.assertEqual(len(samples), len(sentences))
            for sentence, row in zip(sentences, samples):
                with self.subTest(viewport=[w, h], reason=sentence):
                    print("why-landscape fixture: " + json.dumps(row, ensure_ascii=False))
                    self.assertEqual(row["viewport"], [w, h])
                    self.assertTrue(row["visible"])
                    self.assertEqual(row["fontSize"], "15px")
                    self.assertEqual(row["text"], sentence)
                    self.assertEqual(row["measured"], sentence)
                    self.assertEqual(row["lines"], [sentence])
                    self.assertTrue(row["inside"], row)


if __name__ == "__main__":
    unittest.main()

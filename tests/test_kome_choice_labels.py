"""米づくり365: 小さい画面でも否定の語尾を同じ行で読めること。"""
import json
import os
import shutil
import subprocess
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_PATH = os.environ.get("KOME365_HTML") or os.path.join(ROOT, "kome365", "index.html")

# 実際のタッチで18枚めくった1月19日の保存。内部の choose は呼ばず、
# この続きから左へスワイプして「大寒」の左右の札を調べる。
JAN19_STORAGE = {
    "kome365_demo_seen": "1",
    "kome365_visits": '["カルガモ","クモの巣の朝露","サギ"]',
    "kome365_streak": "2",
    "kome365_rewind": '{"s":76800634,"ch":"LRLRLRLRLRLRLRLRL","st":1,"rd":0,"gs":{},"ls":[],"bd":0}',
    "kome365_streak_best": "6",
    "kome365_vib": "0",
    "kome365_ghost_seen": "1",
    "kome365_swipe_save": '{"v":"kokoro","y":"recent","so":"low","m":"transplant","c":0,"s":76800634,"fm":"oneshot","yh":0,"ch":"LRLRLRLRLRLRLRLRLR"}',
}

BROWSER_JS = r"""
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log(JSON.stringify({ skip: 'playwright がない' })); process.exit(0); }
const [htmlArg, rootArg, storageJSON] = process.argv.slice(1);
const htmlPath = path.resolve(htmlArg), root = path.resolve(rootArg);
const origin = 'http://localhost';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function measure() {
  const rect = e => {
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height };
  };
  const card = rect(document.getElementById('swCard'));
  const outside = (r, box) => r.left < box.left - .5 || r.top < box.top - .5 ||
    r.right > box.right + .5 || r.bottom > box.bottom + .5;
  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const labels = [...document.querySelectorAll('#swEdge .eLb')].map(label => {
    const choice = rect(label.closest('#swEdge > span'));
    const style = getComputedStyle(label), glyphs = [], lines = [];
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      let offset = 0;
      for (const character of node.textContent) {
        const range = document.createRange();
        range.setStart(node, offset);
        offset += character.length;
        range.setEnd(node, offset);
        const r = rect(range);
        glyphs.push({ character, ...r });
        let line = lines.find(line => Math.abs(line.top - r.top) < .5);
        if (!line) { line = { top: r.top, text: '' }; lines.push(line); }
        line.text += character;
      }
    }
    return { text: label.textContent, fontSize: parseFloat(style.fontSize),
      lines: lines.map(line => line.text), glyphs,
      outsideChoice: glyphs.some(r => outside(r, choice)),
      outsideCard: glyphs.some(r => outside(r, card)),
      outsideViewport: glyphs.some(r => outside(r, viewport)),
      horizontalOverflow: label.scrollWidth > label.clientWidth + 1 };
  });
  return { date: document.getElementById('swBigDate').textContent,
    title: document.getElementById('swTitle').textContent, card, labels,
    horizontalScroll: document.documentElement.scrollWidth > innerWidth };
}

(async () => {
  const executablePath = process.env.CHROMIUM ||
    (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-background-networking'] });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const served = [], missing = [], blocked = [], errors = [];
    // ローカルの実ファイルだけ返す。仮想URLなのでHTTPサーバーも外部通信も不要。
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        blocked.push(url.href);
        return route.fulfill({ status: 204, body: '' });
      }
      const file = url.pathname === '/kome365/index.html' ? htmlPath :
        path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (file !== htmlPath && !file.startsWith(root + path.sep)) return route.abort();
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
        missing.push(url.pathname);
        return route.fulfill({ status: 404, body: '' });
      }
      served.push(url.pathname);
      return route.fulfill({ status: 200,
        contentType: types[path.extname(file)] || 'application/octet-stream',
        body: fs.readFileSync(file) });
    });
    await context.addInitScript(storage => {
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
      window.__choiceLabelEvents = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
        document.addEventListener(type, event => window.__choiceLabelEvents.push({
          type, trusted: event.isTrusted, pointerType: event.pointerType,
          x: event.clientX, y: event.clientY,
        }), { capture: true, passive: true });
      }
    }, JSON.parse(storageJSON));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/kome365/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('swBigDate')?.textContent === '1月19日',
      null, { timeout: 60000 });
    await page.waitForTimeout(700);
    const before = await page.evaluate(measure);
    const cdp = await context.newCDPSession(page);
    const x = before.card.left + before.card.width / 2;
    const y = before.card.top + before.card.height * .55;
    const send = (type, px) => cdp.send('Input.dispatchTouchEvent', {
      type, timestamp: Date.now() / 1000,
      touchPoints: type === 'touchEnd' ? [] : [{ x: px, y, id: 1 }],
    });
    // CDPの応答待ちを6回足さず、120msまでの送信を予約する（到着は遅れる場合がある）。
    const pending = [send('touchStart', x)];
    for (let step = 1; step <= 6; step++) pending.push(new Promise((resolve, reject) => {
      setTimeout(() => send('touchMove', x - 100 * step / 6).then(resolve, reject), 120 * step / 7);
    }));
    pending.push(new Promise((resolve, reject) => {
      setTimeout(() => send('touchEnd', x - 100).then(resolve, reject), 120);
    }));
    await Promise.all(pending);
    await page.waitForFunction(() => document.getElementById('swBigDate')?.textContent === '1月20日',
      null, { timeout: 60000 });
    // no3dや代用品を使わず、同梱された3Dのファイルの読み込みも待つ。
    await page.waitForFunction(() => window.THREE && window.Field3D, null, { timeout: 60000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.fonts.ready);
    const after = await page.evaluate(measure);
    const events = await page.evaluate(() => window.__choiceLabelEvents);
    const revision = await page.evaluate(() => window.THREE.REVISION);
    console.log(JSON.stringify({ before, after, events, revision, served, missing, blocked, errors }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
"""


class TestKomeChoiceLabels(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        node = shutil.which("node")
        if not node:
            raise unittest.SkipTest("node がないので実表示の確認は飛ばす")
        result = subprocess.run(
            [node, "-e", BROWSER_JS, HTML_PATH, ROOT, json.dumps(JAN19_STORAGE)],
            cwd=ROOT, capture_output=True, text=True, timeout=240,
        )
        if result.returncode:
            raise AssertionError(result.stderr[-4000:])
        cls.result = json.loads(result.stdout.strip().splitlines()[-1])
        if cls.result.get("skip"):
            raise unittest.SkipTest(cls.result["skip"])

    def label(self, text):
        result = self.result
        self.assertEqual(result["before"]["date"], "1月19日")
        self.assertEqual(result["after"]["date"], "1月20日")
        self.assertEqual(result["after"]["title"], "大寒")
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["missing"], [])
        self.assertEqual(result["revision"], "128")
        for resource in ("/kome365/field3d.js", "/kome365/vendor/three.min.js"):
            self.assertIn(resource, result["served"])
        self.assertEqual([e["type"] for e in result["events"]], ["pointerdown", "pointerup"])
        self.assertTrue(all(e["trusted"] and e["pointerType"] == "touch" for e in result["events"]))
        self.assertFalse(result["after"]["horizontalScroll"])
        matches = [label for label in result["after"]["labels"] if label["text"] == text]
        self.assertEqual(len(matches), 1, "全文を保った札が1つ必要: " + text)
        label = matches[0]
        self.assertEqual(label["fontSize"], 19)
        self.assertEqual("".join(label["lines"]), text)
        self.assertEqual(len(label["glyphs"]), len(text))
        self.assertTrue(all(g["width"] > 0 and g["height"] > 0 for g in label["glyphs"]))
        for key in ("outsideChoice", "outsideCard", "outsideViewport", "horizontalOverflow"):
            self.assertFalse(label[key], text + ": " + key)
        return label

    def test_negative_ending_stays_on_one_line(self):
        label = self.label("種もみを見ない")
        self.assertEqual(len(label["lines"]), 2, label["lines"])
        self.assertTrue(any("見ない" in line for line in label["lines"]), label["lines"])
        self.assertGreater(len(label["lines"][-1]), 1, label["lines"])

    def test_short_choice_keeps_one_line_and_size(self):
        label = self.label("種もみを見る")
        self.assertEqual(label["lines"], ["種もみを見る"])


if __name__ == "__main__":
    unittest.main()

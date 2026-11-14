"""実 CSS の行割りと箱を測る。ゲームを遊んだ記録には使わない。"""
import ast
import json
import os
from pathlib import Path
import re
import subprocess
import unittest
from html.parser import HTMLParser


ROOT = Path(os.environ.get("KOME_SOURCE_ROOT", Path(__file__).resolve().parents[1]))
TARGET = "寒い今の時期に種をまいても、芽が出ずに腐ってしまいます"
VIEWPORTS = [(320, 568), (390, 844), (568, 320), (844, 390), (820, 1180)]


class StyleBlocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.blocks = []
        self.active = None

    def handle_starttag(self, tag, attrs):
        if tag == "style":
            attrs = dict(attrs)
            if set(attrs) - {"media", "type"}:
                raise ValueError("fixture does not support these style attributes")
            self.active = {"media": attrs.get("media") or "", "css": ""}
            self.blocks.append(self.active)

    def handle_data(self, data):
        if self.active is not None:
            self.active["css"] += data

    def handle_endtag(self, tag):
        if tag == "style":
            self.active = None


BROWSER = r"""
const fs = require('fs');
const { chromium } = require('playwright');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => {
  const executablePath = process.env.CHROMIUM ||
    (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath,
    args: ['--no-sandbox', '--disable-background-networking',
      '--disable-component-update', '--disable-sync',
      '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const out = [];
  try {
    for (const [width, height] of input.viewports) for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height },
        isMobile: true, hasTouch: true, deviceScaleFactor: 1,
        serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
      try {
        await context.route('**/*', route => route.abort('blockedbyclient'));
        const page = await context.newPage();
        await page.setContent('<!doctype html><html lang="ja"><head>' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '</head><body><div class="wrap"><section id="sGame" class="swipeMode">' +
          '<div id="swipe"><div id="swWhy" class="on" aria-hidden="true"></div>' +
          '</div></section></div></body></html>');
        await page.evaluate(blocks => {
          for (const block of blocks) {
            const style = document.createElement('style');
            style.media = block.media;
            style.textContent = block.css;
            document.head.appendChild(style);
          }
        }, input.styles);
        await page.evaluate(() => document.fonts.ready);
        const rows = await page.evaluate(({ texts, target }) => {
          if (!CSS.supports('text-wrap', 'balance'))
            throw new Error('This rendering test requires text-wrap:balance support');
          const e = document.getElementById('swWhy');
          const box = r => ({ x: r.x, y: r.y, width: r.width, height: r.height,
            left: r.left, top: r.top, right: r.right, bottom: r.bottom });
          function measure(linesWanted) {
            const rect = box(e.getBoundingClientRect());
            const range = document.createRange();
            range.selectNodeContents(e);
            const ink = box(range.getBoundingClientRect());
            const lines = [];
            if (linesWanted) {
              let offset = 0;
              for (const character of e.textContent) {
                range.setStart(e.firstChild, offset);
                offset += character.length;
                range.setEnd(e.firstChild, offset);
                const r = range.getBoundingClientRect();
                let line = lines.find(row => Math.abs(row.top - r.top) < 0.5);
                if (!line) { line = { top: r.top, text: '' }; lines.push(line); }
                line.text += character;
              }
            }
            const style = getComputedStyle(e);
            return { rect, ink, lines,
              animationDuration: style.animationDuration,
              animationName: style.animationName, pointerEvents: style.pointerEvents };
          }
          return texts.map(text => {
            e.textContent = text;
            e.style.removeProperty('text-wrap');
            const actual = measure(text === target);
            // 対照は同じ実 CSS・同じ文字を通常の折り返しに戻すだけ。
            e.style.setProperty('text-wrap', 'wrap');
            const control = measure(text === target);
            e.style.removeProperty('text-wrap');
            return { text, actual, control };
          });
        }, { texts: reduced ? [input.target] : input.texts, target: input.target });
        out.push({ width, height, reduced, rows });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(out));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
"""


class WhyLineWrapping(unittest.TestCase):
    def test_reason_lines_keep_the_last_character_with_its_sentence(self):
        html = (ROOT / "kome365/index.html").read_text(encoding="utf-8")
        cards = (ROOT / "kome365/cards.js").read_text(encoding="utf-8")
        parser = StyleBlocks()
        parser.feed(html)
        parser.close()
        self.assertTrue(parser.blocks, "No actual source style blocks were read")
        self.assertIsNone(parser.active, "Unclosed source style block")
        # 定数 N('…') の最初の一文だけ。動的な理由の全網羅ではない。
        texts = []
        for match in re.finditer(r"\bN\(\s*('(?:\\.|[^'\\])*')\s*\)", cards):
            text = ast.literal_eval(match.group(1))
            stop = text.find("。")
            if stop >= 0:
                text = text[:stop + 1]
            if text not in texts:
                texts.append(text)
        self.assertIn(TARGET, texts, "Recorded reason must exist in the real cards file")
        payload = {"styles": parser.blocks, "target": TARGET,
                   "texts": texts, "viewports": VIEWPORTS}
        run = subprocess.run(["node", "-e", BROWSER], cwd=ROOT,
                             input=json.dumps(payload, ensure_ascii=False),
                             text=True, capture_output=True, timeout=90)
        self.assertEqual(run.returncode, 0, run.stderr[-3000:])
        groups = json.loads(run.stdout)
        self.assertEqual(len(groups), 2 * len(VIEWPORTS))
        for group in groups:
            label = (group["width"], group["height"], group["reduced"])
            self.assertEqual(len(group["rows"]), 1 if group["reduced"] else len(texts))
            for row in group["rows"]:
                actual, control = row["actual"], row["control"]
                with self.subTest(screen=label, reason=row["text"]):
                    for measured in (actual, control):
                        for part in ("rect", "ink"):
                            self.assertGreater(measured[part]["width"], 0, part)
                            self.assertGreater(measured[part]["height"], 0, part)
                    for key in ("x", "y", "width", "height"):
                        self.assertAlmostEqual(actual["rect"][key], control["rect"][key],
                                               delta=0.05, msg=key)
                    for edge in ("left", "top"):
                        self.assertGreaterEqual(actual["ink"][edge] + 0.5,
                                                actual["rect"][edge], edge)
                    for edge in ("right", "bottom"):
                        self.assertLessEqual(actual["ink"][edge] - 0.5,
                                             actual["rect"][edge], edge)
                    self.assertEqual(actual["animationDuration"], "2s")
                    self.assertEqual(actual["animationName"],
                                     "swWhyFade" if group["reduced"] else "swWhyIn")
                    self.assertEqual(actual["pointerEvents"], "none")
                    if row["text"] == TARGET:
                        lines = actual["lines"]
                        self.assertTrue(lines)
                        self.assertEqual("".join(line["text"] for line in lines), TARGET)
                        if len(lines) > 1:
                            self.assertGreater(len(lines[-1]["text"].strip()), 1,
                                               "The last character is alone on its line")


if __name__ == "__main__":
    unittest.main()

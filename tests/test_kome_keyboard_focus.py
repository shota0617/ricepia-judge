"""Route answer keys without taking them from another focused control."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = Path(os.environ.get("KOME_KEYBOARD_HTML", str(ROOT / "kome365/index.html")))

NODE_CHECK = r"""
'use strict';
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[1], 'utf8');
const begin = html.indexOf('/* キーボードの左右キーは');
const end = begin < 0 ? -1 : html.indexOf("$('swHome').onclick =", begin);
if (begin < 0 || end <= begin) throw new Error('Keyboard registration extraction boundary missing');
const actualRegistration = html.slice(begin, end);

// A small DOM tree fixture, not a browser. Selector results are derived from
// each node's own tag/attributes and ancestors, never from the case name.
class Element {
  constructor(tagName, attributes = {}, parent = null) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.attributes = { ...attributes };
    this.id = attributes.id || '';
    this.parentElement = parent;
    this.parentNode = parent;
    this.children = [];
    this.isConnected = true;
    if (parent) parent.children.push(this);
    const tokens = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = { contains: name => tokens.has(name) };
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  contains(other) {
    for (let n = other; n; n = n.parentElement) if (n === this) return true;
    return false;
  }
  matches(selector) {
    const s = selector.trim();
    if (/^#[\w-]+$/.test(s)) return this.id === s.slice(1);
    const m = /^([a-z][\w-]*)?(?:\[([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\])?$/i.exec(s);
    if (!m || (!m[1] && !m[2])) throw new Error('Unsupported fixture selector: ' + s);
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    if (!m[2]) return true;
    const value = this.getAttribute(m[2]);
    if (value === null) return false;
    const expected = m[3] ?? m[4] ?? m[5];
    return expected === undefined || value === expected;
  }
  closest(selectors) {
    const parts = selectors.split(',');
    for (let n = this; n; n = n.parentElement) if (parts.some(s => n.matches(s))) return n;
    return null;
  }
  get contentEditable() {
    const value = this.getAttribute('contenteditable');
    if (value === null) return 'inherit';
    const normalized = value.toLowerCase();
    if (normalized === '') return 'true';
    return ['true', 'false', 'plaintext-only'].includes(normalized) ? normalized : 'inherit';
  }
  get isContentEditable() {
    for (let n = this; n; n = n.parentElement) {
      if (n.contentEditable === 'false') return false;
      if (n.contentEditable === 'true' || n.contentEditable === 'plaintext-only') return true;
    }
    return false;
  }
}

const blocked = [
  'sound', 'home', 'buttonChild', 'link', 'linkChild', 'input', 'select', 'textarea',
  'roleButton', 'roleButtonChild', 'editable', 'editableChild', 'plaintextChild',
  'invalidInheritedEditable', 'editableInsideFalse'
];
const allowed = [
  'body', 'card', 'cardChild', 'falseEditableAlone', 'falseBoundary',
  'falseBoundaryChild', 'invalidAlone'
];
const cases = [];
for (const target of blocked.concat(allowed)) {
  for (const key of ['ArrowLeft', 'ArrowRight']) {
    cases.push({ target, key, allowed: allowed.includes(target), screenHidden: false, sheetOpen: false });
  }
}
for (const target of ['body', 'card']) {
  for (const key of ['ArrowLeft', 'ArrowRight']) {
    cases.push({ target, key, allowed: false, screenHidden: true, sheetOpen: false });
    cases.push({ target, key, allowed: false, screenHidden: false, sheetOpen: true });
  }
}
for (const target of ['body', 'card', 'sound']) {
  for (const key of ['Enter', ' ', 'Escape']) {
    cases.push({ target, key, allowed: false, screenHidden: false, sheetOpen: false });
  }
}

function runCase(c) {
  const name = [c.target, JSON.stringify(c.key), c.screenHidden ? 'game-hidden' : 'game-visible', c.sheetOpen ? 'sheet-open' : 'sheet-closed'].join('/');
  const chosen = [];
  let preventCalls = 0;
  try {
    const htmlElement = new Element('html');
    const body = new Element('body', {}, htmlElement);
    const card = new Element('div', { id: 'swCard', tabindex: '0', role: 'group' }, body);
    const sound = new Element('button', { id: 'swSnd', type: 'button' }, body);
    const home = new Element('button', { id: 'swHome', type: 'button' }, body);
    const link = new Element('a', { id: 'testLink', href: '#local-only' }, body);
    const roleButton = new Element('div', { role: 'button', tabindex: '0' }, body);
    const editable = new Element('div', { contenteditable: '' }, body);
    const falseBoundary = new Element('div', { contenteditable: 'false' }, editable);
    const plaintext = new Element('div', { contenteditable: 'plaintext-only' }, body);
    const targets = {
      body, card, sound, home, link, roleButton, editable, falseBoundary,
      cardChild: new Element('span', {}, card),
      buttonChild: new Element('span', {}, sound),
      linkChild: new Element('span', {}, link),
      input: new Element('input', { type: 'text' }, body),
      select: new Element('select', {}, body),
      textarea: new Element('textarea', {}, body),
      roleButtonChild: new Element('span', {}, roleButton),
      editableChild: new Element('span', {}, editable),
      plaintextChild: new Element('span', {}, plaintext),
      invalidInheritedEditable: new Element('span', { contenteditable: 'invalid' }, editable),
      editableInsideFalse: new Element('span', { contenteditable: 'true' }, falseBoundary),
      falseEditableAlone: new Element('div', { contenteditable: 'false' }, body),
      falseBoundaryChild: new Element('span', {}, falseBoundary),
      invalidAlone: new Element('div', { contenteditable: 'invalid' }, body)
    };
    const target = targets[c.target];
    const nodes = {
      swCard: card,
      sGame: new Element('section', { id: 'sGame', class: c.screenHidden ? 'hidden' : '' }, body),
      sheetBg: new Element('div', { id: 'sheetBg', class: c.sheetOpen ? '' : 'hidden' }, body)
    };
    const listeners = [];
    const document = {
      body, documentElement: htmlElement, activeElement: target, hidden: false,
      getElementById(id) { return nodes[id] || null; },
      addEventListener(type, fn) {
        if (type !== 'keydown') throw new Error('Unexpected registration type: ' + type);
        listeners.push(fn);
      }
    };
    const globals = { document, Element, HTMLElement: Element, el: { card }, $: id => nodes[id], choose: side => chosen.push(side) };
    vm.runInNewContext("'use strict';\n" + actualRegistration, globals, { timeout: 1000 });
    if (listeners.length !== 1) throw new Error('Expected exactly one real keyboard listener, got ' + listeners.length);
    const event = {
      type: 'keydown', key: c.key, target, currentTarget: document,
      repeat: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
      isComposing: false, defaultPrevented: false,
      preventDefault() { preventCalls++; this.defaultPrevented = true; }
    };
    listeners[0](event);
    const expectedChosen = c.allowed ? [c.key === 'ArrowLeft' ? 'left' : 'right'] : [];
    const expectedPreventCalls = c.allowed ? 1 : 0;
    const pass = JSON.stringify(chosen) === JSON.stringify(expectedChosen) && preventCalls === expectedPreventCalls;
    return { name, status: pass ? 'PASS' : 'BEHAVIOR_FAIL', chosen, expectedChosen, preventCalls, expectedPreventCalls };
  } catch (error) {
    return { name, status: 'FIXTURE_ERROR', chosen, preventCalls, error: String(error.stack || error) };
  }
}
const results = cases.map(runCase);
console.log(JSON.stringify({ sourceRegion: 'actual keyboard registration', designedCases: cases.length, results }));
"""


class TestKomeKeyboardFocus(unittest.TestCase):
    def test_answer_keys_respect_interactive_focus(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "node is required to evaluate the real keyboard listener")
        self.assertTrue(HTML_PATH.is_file(), "HTML under test is missing: " + str(HTML_PATH))
        run = subprocess.run(
            [node, "-e", NODE_CHECK, str(HTML_PATH)],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(run.returncode, 0, "Listener fixture failed before cases: " + run.stderr)
        report = json.loads(run.stdout)
        self.assertEqual(report["designedCases"], 61)
        self.assertEqual(len(report["results"]), 61)
        counts = {kind: sum(r["status"] == kind for r in report["results"])
                  for kind in ("PASS", "BEHAVIOR_FAIL", "FIXTURE_ERROR")}
        print("KOME_KEYBOARD_CASE_COUNTS " + json.dumps(counts, sort_keys=True))
        for result in report["results"]:
            with self.subTest(case=result["name"]):
                self.assertEqual(result["status"], "PASS", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()

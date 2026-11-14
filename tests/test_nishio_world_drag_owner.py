"""世界地図: 操作中の指を別の接触で取り替えず、通常タップを保つ。"""
import json
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


def section(source, start, end):
    first = source.index(start)
    return source[first:source.index(end, first)]


def product_sections(source):
    # Existing section boundaries work before the fix; no new helper/field name is required.
    return "\n".join([
        section(source, "function setWorld(on) {", "// お米の そばを 2回"),
        section(source, "function setActive(on) {", "\nfunction updatePad()"),
        section(source, "const swipeS = ", "// スポットをタップすると"),
        section(source, "cv.addEventListener('click', e => {\n", "\nfunction mzGoalOnCanvas("),
    ])


FIXTURE = r"""
let clock = 1000, nextTimer = 0, nextFrame = 0;
const timers = new Map(), captures = new Set(), captureCalls = [], releases = [];
let captureFailure = false, releaseFailure = false, consumed = 0;
const performance = { now: () => clock };
const setTimeout = (fn, ms) => { const id = ++nextTimer; timers.set(id, {fn, at: clock + ms}); return id; };
const clearTimeout = id => timers.delete(id);
const requestAnimationFrame = () => ++nextFrame, cancelAnimationFrame = () => {};
function advance(ms) {
  const end = clock + ms;
  for (let n = 0; n < 1000; n++) {
    const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) { clock = end; return; }
    timers.delete(due[0]); clock = due[1].at; due[1].fn();
  }
  throw Error('fixture timer bound exceeded');
}
function target(id) {
  const classes = new Set();
  return { id, hidden: true, innerHTML: '', title: '', style: {}, listeners: new Map(),
    classList: { contains: x => classes.has(x), toggle: (x, yes) => yes ? classes.add(x) : classes.delete(x) },
    addEventListener(type, fn, opts) {
      const list = this.listeners.get(type) || [];
      list.push({fn, capture: opts === true || !!(opts && opts.capture)}); this.listeners.set(type, list);
    },
    closest: () => null };
}
const cv = target('pxCanvas');
Object.assign(cv, {width: 390, height: 844,
  getBoundingClientRect: () => ({left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844}),
  setPointerCapture(id) {
    captureCalls.push(id);
    if (captureFailure) throw Error('fixture capture failure');
    captures.add(id);
  },
  hasPointerCapture: id => captures.has(id),
  releasePointerCapture(id) {
    releases.push(id);
    if (releaseFailure) throw Error('fixture release failure');
    if (captures.delete(id)) emit('lostpointercapture', id, 0, 0);
  },
  dispatchEvent: e => click(e)
});
const document = target('document'), window = target('window');
document.hidden = false; document.body = target('body'); window.devicePixelRatio = 1;
const elements = new Map([['pxCanvas', cv]]);
const $ = id => { if (!elements.has(id)) elements.set(id, target(id)); return elements.get(id); };
const localStorage = {setItem: () => {}};
const MouseEvent = function(type, values) { return {type, isTrusted: false, ...values}; };
const ICO = () => '', firstWalk = () => false, mazeBack = () => false;
const worldCamStart = () => ({x: 100, y: 200}), buildWorld = () => {};
const updatePad = () => {}, updateHarvestBtn = () => {}, updateDankyuBtn = () => {};
const updateCover = () => {}, frame = () => {}, setDriving = () => {};
let worldMode = true, wcam = {x: 100, y: 200}, wcamOnMe = true, wscale = 2;
const WSIZES = [2, 3, 4, 6, 10, 16, 24];
let active = true, driving = false, raf = 0, lastT = 0, cover = 0;
const mzNext = {hold: false}, howtoEl = {hidden: true}, tapS = {goal: null};
let fieldCy = 422;
const walks = [], popupCalls = [];
const G = {me: null, guide: null, demo: true, spots: [],
  popupHtml: value => { popupCalls.push(value.id); return value.id; },
  invalidateMap: () => {}, toastFlush: () => {}, sound: {scene: () => {}}};
const mapCovered = () => false, fieldT = () => 32, camTile = () => ({x: 0, y: 0});
const tapWalkStop = () => { tapS.goal = null; };
const tapWalk = (x, y) => { walks.push([x, y]); tapS.goal = {x, y}; return true; };
const mazeOn = () => false, wT = dpr => Math.round(WSIZES[wscale] * dpr);
let shopHits = [[0, 0, 390, 844, {id: 'shop'}]], areaBoxes = [];
const worldSpotShown = () => true, worldPois = [], llToW = (lat, lng) => ({x: lng, y: lat});
const areaHtml = value => { popupCalls.push(value.id); return value.id; }, poiHtml = () => '';
function dispatch(to, type, e, capture) {
  for (const item of to.listeners.get(type) || []) {
    if (capture === undefined || item.capture === capture) { e.currentTarget = to; item.fn(e); }
  }
}
function emit(type, id, x, y, extra = {}) {
  const e = {type, pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: x, clientY: y, target: cv, isTrusted: true,
    preventDefault: () => consumed++, stopPropagation: () => consumed++, stopImmediatePropagation: () => consumed++, ...extra};
  dispatch(document, type, e, true);
  if (e.target === cv || captures.has(id)) {
    dispatch(cv, type, e, true); dispatch(cv, type, e, false);
  }
  dispatch(document, type, e, false);
  if ((type === 'pointerup' || type === 'pointercancel') && captures.delete(id)) emit('lostpointercapture', id, x, y, extra);
  return e;
}
function signal(to, type) { dispatch(to, type, {type, target: to}); }
function click(extra = {}) {
  const e = {type: 'click', clientX: 180, clientY: 100, target: cv, isTrusted: true,
    preventDefault: () => consumed++, stopPropagation: () => consumed++, stopImmediatePropagation: () => consumed++, ...extra};
  dispatch(document, 'click', e, true); dispatch(cv, 'click', e, true);
  dispatch(cv, 'click', e, false); dispatch(document, 'click', e, false);
}
const camera = () => [wcam.x, wcam.y];
const expectCamera = (x, y, why) => {
  assert.ok(Math.abs(wcam.x - x) < 1e-9 && Math.abs(wcam.y - y) < 1e-9,
    `${why}: actual ${JSON.stringify(camera())}, expected [${x},${y}]`);
};
function prefix(extra = {}) {
  emit('pointerdown', 1, 100, 100, extra); emit('pointermove', 1, 140, 100, extra);
  expectCamera(90, 200, 'single pointer prefix is a product control');
}
"""

# Each case receives a fresh VM and the real product listener blocks above.
# These are event sequences and observable assertions, not replacement handlers.
CASES = [
    {"name": "single touch control", "run": """
prefix(); emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'single touch 80px');
emit('pointerup', 1, 180, 100); emit('pointermove', 1, 220, 100); expectCamera(80, 200, 'released touch');
"""},
    {"name": "single mouse control", "run": """
const mouse = {pointerType: 'mouse'}; prefix(mouse);
emit('pointermove', 1, 180, 100, mouse); expectCamera(80, 200, 'single mouse 80px'); emit('pointerup', 1, 180, 100, mouse);
"""},
    {"name": "single pen control", "run": """
const pen = {pointerType: 'pen'}; prefix(pen);
emit('pointermove', 1, 180, 100, pen); expectCamera(80, 200, 'single pen 80px'); emit('pointerup', 1, 180, 100, pen);
"""},
    {"name": "other contact after 40ms", "run": """
prefix(); advance(40); emit('pointerdown', 2, 280, 260);
emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'P2 must not replace the camera origin');
"""},
    {"name": "other contact after 700ms", "run": """
prefix(); advance(700); emit('pointerdown', 2, 280, 260);
emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'waiting does not transfer the active drag');
"""},
    {"name": "third contact and foreign motion", "run": """
prefix(); emit('pointerdown', 2, 280, 260); emit('pointerdown', 3, 300, 400);
emit('pointermove', 2, 240, 220); emit('pointermove', 3, 320, 440);
expectCamera(90, 200, 'foreign moves do not pan'); emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'P1 continues');
"""},
    {"name": "foreign up preserves owner", "run": """
prefix(); emit('pointerdown', 2, 280, 260); emit('pointerup', 2, 280, 260);
emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'foreign up does not stop P1');
"""},
    {"name": "foreign cancel preserves owner", "run": """
prefix(); emit('pointerdown', 2, 280, 260); emit('pointercancel', 2, 280, 260);
emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'foreign cancel does not stop P1');
"""},
    {"name": "foreign lost capture preserves owner", "run": """
prefix(); emit('lostpointercapture', 2, 280, 260);
emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'foreign capture loss does not stop P1');
"""},
    {"name": "owner up does not transfer to remaining fingers", "run": """
prefix(); emit('pointerdown', 2, 280, 260); emit('pointerdown', 3, 300, 400); emit('pointerup', 1, 140, 100);
emit('pointermove', 2, 320, 260); emit('pointermove', 3, 340, 400); expectCamera(90, 200, 'remaining contacts do not take over');
emit('pointerdown', 4, 100, 100); emit('pointermove', 4, 140, 100); expectCamera(80, 200, 'fresh down works after owner up');
"""},
    {"name": "owner cancel clears stale motion and recovers", "run": """
prefix(); emit('pointercancel', 1, 140, 100); emit('pointermove', 1, 180, 100);
expectCamera(90, 200, 'cancelled pointer cannot resume'); emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100); expectCamera(80, 200, 'fresh down after cancel');
"""},
    {"name": "owner lost capture clears stale motion and recovers", "run": """
prefix(); captures.delete(1); emit('lostpointercapture', 1, 140, 100); emit('pointermove', 1, 180, 100);
expectCamera(90, 200, 'lost capture ends old drag'); emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100); expectCamera(80, 200, 'fresh down after lost capture');
emit('lostpointercapture', 1, 180, 100); emit('pointermove', 2, 180, 100); expectCamera(70, 200, 'late old-id loss cannot end new drag');
"""},
    {"name": "non-primary contact can start when no map owner exists", "run": """
emit('pointerdown', 1, 20, 800, {target: $('outside')}); advance(400);
emit('pointerdown', 2, 100, 100, {isPrimary: false}); emit('pointermove', 2, 140, 100, {isPrimary: false});
expectCamera(90, 200, 'resting outside finger does not prevent world drag');
"""},
    {"name": "stationary first contact yields to a new contact", "run": """
emit('pointerdown', 1, 100, 100); advance(400); emit('pointerdown', 2, 280, 260);
emit('pointermove', 2, 320, 260); expectCamera(90, 200, 'stationary P1 still allows P2 to pan');
"""},
    {"name": "sub-threshold contact can yield before movement starts", "run": """
emit('pointerdown', 1, 100, 100); emit('pointermove', 1, 102, 100); expectCamera(100, 200, 'below existing drag threshold');
emit('pointerdown', 2, 280, 260); emit('pointermove', 2, 320, 260); expectCamera(90, 200, 'sub-threshold P1 still allows P2 to pan');
"""},
    {"name": "old contact events cannot end or move a handed-off drag", "run": """
emit('pointerdown', 1, 100, 100); emit('pointerdown', 2, 280, 260);
emit('pointermove', 1, 180, 100); expectCamera(100, 200, 'old P1 movement is not the new origin');
emit('pointerup', 1, 180, 100); emit('lostpointercapture', 1, 180, 100);
emit('pointermove', 2, 320, 260); expectCamera(90, 200, 'late old contact end does not cancel P2');
"""},
    {"name": "pointer identifier zero is valid", "run": """
emit('pointerdown', 0, 100, 100); emit('pointermove', 0, 140, 100); expectCamera(90, 200, 'id zero can start a pan');
emit('pointerdown', 2, 280, 260); emit('pointermove', 0, 180, 100); expectCamera(80, 200, 'moving id zero remains the owner');
"""},
    {"name": "primary mouse does not steal active touch", "run": """
prefix(); const mouse = {pointerType: 'mouse', isPrimary: true};
emit('pointerdown', 2, 280, 260, mouse); emit('pointermove', 2, 320, 260, mouse);
expectCamera(90, 200, 'foreign mouse must not pan before its release');
emit('pointerup', 2, 320, 260, mouse);
emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'primary of another device is not the owner');
"""},
    {"name": "blur ends old drag without blocking the next", "run": """
prefix(); signal(window, 'blur'); emit('pointermove', 1, 180, 100); expectCamera(90, 200, 'blur old motion');
emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100); expectCamera(80, 200, 'blur recovery');
"""},
    {"name": "hidden ends old drag without blocking the next", "run": """
prefix(); document.hidden = true; signal(document, 'visibilitychange'); document.hidden = false; signal(document, 'visibilitychange');
emit('pointermove', 1, 180, 100); expectCamera(90, 200, 'hidden old motion');
emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100); expectCamera(80, 200, 'hidden recovery');
"""},
    {"name": "visible notification alone keeps the drag", "run": """
prefix(); document.hidden = false; signal(document, 'visibilitychange'); emit('pointermove', 1, 180, 100);
expectCamera(80, 200, 'visible notification is not a hidden transition');
"""},
    {"name": "setWorld round trip discards the old gesture", "run": """
prefix(); setWorld(false); setWorld(true); expectCamera(100, 200, 'real setWorld resets camera fixture');
emit('pointermove', 1, 180, 100); expectCamera(100, 200, 'old pointer cannot move reopened world');
emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100); expectCamera(90, 200, 'new pointer in reopened world');
"""},
    {"name": "setActive round trip discards the old gesture", "run": """
prefix(); setActive(false); setActive(true); emit('pointermove', 1, 180, 100); expectCamera(90, 200, 'inactive old motion');
emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100); expectCamera(80, 200, 'active recovery');
"""},
    {"name": "capture failure does not leave a permanent owner", "run": """
captureFailure = true; assert.doesNotThrow(() => emit('pointerdown', 1, 100, 100), 'capture exception must be contained');
captureFailure = false; emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100);
expectCamera(90, 200, 'fresh contact after failed capture');
"""},
    {"name": "release failure does not leave a permanent owner", "run": """
prefix(); releaseFailure = true; assert.doesNotThrow(() => signal(window, 'blur'), 'release exception must be contained');
releaseFailure = false; emit('pointermove', 1, 180, 100); expectCamera(90, 200, 'release failure old motion');
emit('pointerdown', 2, 100, 100); emit('pointermove', 2, 140, 100); expectCamera(80, 200, 'fresh contact after failed release');
"""},
    {"name": "mouse hover terminates a stale held record", "run": """
const mouse = {pointerType: 'mouse'}; prefix(mouse); emit('pointermove', 1, 180, 100, {...mouse, buttons: 0});
expectCamera(90, 200, 'mouse hovering is not a drag'); emit('pointermove', 1, 220, 100, mouse); expectCamera(90, 200, 'requires a new down');
emit('pointerdown', 1, 100, 100, mouse); emit('pointermove', 1, 140, 100, mouse); expectCamera(80, 200, 'new mouse down recovers');
"""},
    {"name": "pen hover and another device hover", "run": """
const pen = {pointerType: 'pen'}; prefix(pen); emit('pointermove', 2, 280, 260, {pointerType: 'mouse', buttons: 0});
emit('pointermove', 1, 180, 100, pen); expectCamera(80, 200, 'foreign hover leaves pen owner intact');
emit('pointermove', 1, 220, 100, {...pen, buttons: 0}); expectCamera(80, 200, 'pen hovering is not a drag');
"""},
    {"name": "captured owner survives pointerleave", "run": """
prefix(); emit('pointerleave', 1, 140, 100); emit('pointerleave', 2, 280, 260);
emit('pointermove', 1, 180, 100); expectCamera(80, 200, 'capture can continue outside the canvas');
"""},
    {"name": "world tap opens shop, drag click does not, next tap works", "run": """
emit('pointerdown', 1, 100, 100); emit('pointermove', 1, 102, 100); emit('pointerup', 1, 102, 100); click();
assert.deepEqual(popupCalls, ['shop'], 'ordinary world tap'); $('pxInfo').hidden = true; popupCalls.length = 0;
prefix(); emit('pointerup', 1, 140, 100); click(); assert.equal(popupCalls.length, 0, 'post-drag click');
emit('pointerdown', 1, 100, 100); emit('pointerup', 1, 100, 100); click(); assert.deepEqual(popupCalls, ['shop'], 'next fresh tap');
"""},
    {"name": "world tap still opens area popup", "run": """
shopHits = []; areaBoxes = [[[0, 0, 390, 844], {id: 'area'}]];
emit('pointerdown', 1, 100, 100); emit('pointerup', 1, 100, 100); click(); assert.deepEqual(popupCalls, ['area']);
"""},
    {"name": "foreign pen contact cannot erase mouse drag click suppression", "run": """
const mouse = {pointerType: 'mouse'}, pen = {pointerType: 'pen', isPrimary: true}; prefix(mouse);
emit('pointerdown', 2, 280, 260, pen); emit('pointerup', 2, 280, 260, pen); emit('pointerup', 1, 140, 100, mouse); click();
assert.equal(popupCalls.length, 0, 'unrelated contact must not turn a completed drag into a tap');
"""},
    {"name": "walking mode does not acquire world capture or pan", "run": """
setWorld(false); const before = camera(); emit('pointerdown', 1, 100, 100); emit('pointermove', 1, 140, 100); emit('pointerup', 1, 140, 100);
assert.deepEqual(camera(), before); assert.equal(captureCalls.length, 0, 'walking input does not acquire world capture');
"""},
    {"name": "foreign capture exception cannot interrupt moving owner", "run": """
prefix(); captureFailure = true;
assert.doesNotThrow(() => emit('pointerdown', 2, 280, 260), 'foreign P2 cannot interrupt the moving owner');
assert.doesNotThrow(() => emit('pointerdown', 3, 300, 400), 'foreign P3 cannot interrupt the moving owner');
captureFailure = false; emit('pointermove', 1, 180, 100);
expectCamera(80, 200, 'P1 continues after foreign contacts even if capture would fail');
"""},
]

DRIVER = r"""
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const payload = JSON.parse(fs.readFileSync(0, 'utf8')), results = [];
for (const item of payload.cases) {
  try {
    const context = vm.createContext({assert});
    vm.runInContext(payload.fixture + '\n' + payload.source + '\n' + item.run +
      '\nassert.equal(consumed, 0, "must not consume unrelated DOM input");', context, {timeout: 2000});
    results.push({name: item.name, ok: true});
  } catch (error) {
    results.push({name: item.name, ok: false, error: String(error.stack || error)});
  }
}
process.stdout.write(JSON.stringify(results));
"""


class WorldDragOwner(unittest.TestCase):
    def test_real_handlers_keep_world_drag_with_the_accepted_pointer(self):
        source = (ROOT / 'nishio-go' / 'pixel.js').read_text(encoding='utf-8')
        payload = {'fixture': FIXTURE, 'source': product_sections(source), 'cases': CASES}
        result = subprocess.run(['node', '-e', DRIVER], input=json.dumps(payload),
                                text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        results = json.loads(result.stdout)
        self.assertEqual([item['name'] for item in results], [item['name'] for item in CASES])
        for item in results:
            with self.subTest(case=item['name']):
                self.assertTrue(item['ok'], item.get('error', 'missing outcome'))


if __name__ == '__main__':
    unittest.main()

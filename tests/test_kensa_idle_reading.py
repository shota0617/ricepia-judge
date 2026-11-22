"""The 45 second card waits while the player reads the notes (cycle 186).

The old clock kept running while the page was scrolled down to the notes (html.scrolled).
About 44 seconds after opening the notes at the start of the second bag, the card came up
out of sight and its sound played once, which made no sense to someone reading.
While reading, the card is not shown and the sound does not play. After coming back to
the game the clock starts again from 45 seconds (never at the moment of coming back).

Runs the real idle-clock code from kensa.html in Node with a fake clock, the same way as
the cycle 159 idle tests in test_kensa.py. KENSA_HTML or KENSA_ROOT selects the product HTML.
"""
import os
from pathlib import Path
import shutil
import subprocess
import unittest


def _html():
    default_root = Path(__file__).resolve().parents[1]
    root = Path(os.environ.get('KENSA_ROOT', default_root)).resolve()
    return Path(os.environ.get('KENSA_HTML', root / 'kensa.html')).resolve().read_text(encoding='utf-8')


HARNESS = """
const assert = require('node:assert/strict');
let now = 0, timers = [], seq = 0, scrolled = false, sounds = 0;
globalThis.performance = { now: () => now }; Date.now = () => now;
const setTimeout = (f, ms) => { const id = ++seq; timers.push({ id, at:now + ms, f }); return id; }, clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
const advance = ms => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.f(); } now = end; };
const cls = new Set(); const idleCard = { inert:true, style:{}, classList:{ add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
const likeBtn = { addEventListener() {} }, returnLink = { addEventListener() {} };
const $ = id => ({ idleCard, likeBtn, returnLink })[id];
const listeners = {}, winListeners = {};
const document = { hidden:false, body:{}, documentElement:{ classList:{ contains: c => c === 'scrolled' && scrolled } }, addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
const sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
let keyUser = false; const idleSound = () => { sounds++; }, idleOutSound = () => {}, likeSound = () => {}, likeOutSound = () => {}, setFace = () => {};
const cookedReturns = [], hint = null, nextBtn = null, window = { addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); } };
const touch = () => (listeners.pointerdown || []).forEach(f => f({ target:{ closest: () => null } }));
const scrollTo = down => { scrolled = down; (winListeners.scroll || []).forEach(f => f()); };   // 📖 で 下へ・ゲームへ 戻る（syncScrolled が class を 合わせた あと）
const setHidden = h => { document.hidden = h; (listeners.visibilitychange || []).forEach(f => f()); };
"""

SCENARIO = """
cookedReturns.push('1等'); touch();                 // 1ふくろめの はんこの あと（2ふくろめ の はじめ）
advance(3000); scrollTo(true);                       // 📖 を 開いて 読む
advance(50000);
assert.equal(cls.has('on'), false, '📖 を 読んで いる 間に 45秒の カードが 出た');
assert.equal(sounds, 0, '📖 を 読んで いる 間に カードの 音が 鳴った');
touch(); advance(60000);                             // 説明の 中を さわって も
assert.equal(cls.has('on'), false); assert.equal(sounds, 0);
setHidden(true); setHidden(false); advance(60000);  // かくれて もどって も
assert.equal(cls.has('on'), false); assert.equal(sounds, 0);
scrollTo(false);                                      // ゲームへ 戻る
advance(100); assert.equal(cls.has('on'), false, '戻った しゅんかんに カードが 出た');
advance(44700); assert.equal(cls.has('on'), false, '戻って 45秒 より 前に カードが 出た');
advance(300); assert.equal(cls.has('on'), true, '戻って 45秒 手を 止めても カードが 出ない'); assert.equal(sounds, 1);
// 開いたり 閉じたり を くり返しても 時計は 1つ
cls.delete('on'); touch();
for (let k = 0; k < 4; k++) { scrollTo(true); advance(500); scrollTo(false); advance(500); }
assert.equal(timers.length, 1, '時計が 2重に なった');
advance(44400); assert.equal(cls.has('on'), false); advance(200); assert.equal(cls.has('on'), true); assert.equal(sounds, 2);
// 📖 を 開かない ときは 今までどおり 45秒
cls.delete('on'); touch(); advance(44900); assert.equal(cls.has('on'), false); advance(200); assert.equal(cls.has('on'), true); assert.equal(sounds, 3);
"""


class IdleCardWhileReadingTests(unittest.TestCase):
    def test_card_and_sound_wait_while_reading_the_notes(self):
        node = shutil.which('node')
        if not node:
            if os.environ.get('KENSA_REQUIRE_BROWSER') == '1':
                self.fail('KENSA_REQUIRE_BROWSER=1 but Node is unavailable')
            self.skipTest('Node unavailable')
        html = _html()
        idle = html[html.index("const IDLE_MS = 45000"):html.index('returnLink.addEventListener("click",')]
        r = subprocess.run([node, '-e', HARNESS + idle + SCENARIO], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr[-1500:])


if __name__ == '__main__':
    unittest.main()

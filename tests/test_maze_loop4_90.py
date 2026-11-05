"""第4弾サイクル90：手が止まったら、穏やかにカードを出してサイトへ戻る"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = (ROOT / "nishio-go" / "idlecard.js").read_text(encoding="utf-8")
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")


class TestIdleCard(unittest.TestCase):
    def test_constants_and_conditions(self):
        self.assertIn("IDLE_CARD_SEC = 45", JS)
        for w in ("started", "visible", "covered", "shown"):
            self.assertIn("s." + w, JS)
        self.assertIn("window.NISHIO_IDLE_CARD", JS)

    @unittest.skipUnless(shutil.which("node"), "node が無い")
    def test_should_show_pure(self):
        code = ("global.window={};global.document={readyState:'complete',addEventListener(){},getElementById(){return null},"
                "querySelectorAll(){return []},hidden:false};global.setInterval=()=>0;"
                "require(process.argv[1]);const f=window.NISHIO_IDLE_CARD.shouldShow;"
                "const b={idleSec:45,started:true,visible:true,covered:false,shown:false};"
                "console.log(JSON.stringify([f(b),f({...b,idleSec:44.9}),f({...b,covered:true}),f({...b,started:false}),"
                "f({...b,visible:false}),f({...b,shown:true}),f(null),f({}),f({...b,idleSec:'x'}),window.NISHIO_IDLE_CARD.IDLE_CARD_SEC]))")
        out = subprocess.run(["node", "-e", code, str(ROOT / "nishio-go" / "idlecard.js")],
                             capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(out), [True, False, False, False, False, False, False, False, False, 45])

    def test_tracking_events(self):
        self.assertIn("window.nsgTrack", JS)
        self.assertIn("typeof window.nsgTrack === 'function'", JS)
        for ev in ("idle_card_show", "idle_card_like", "idle_card_site"):
            self.assertRegex(JS, r"track\('%s'\)" % ev)

    def test_html(self):
        for i in ("idleCard", "idleLike", "idleSite", "idleKeep"):
            self.assertIn('id="%s"' % i, HTML)
        a = re.search(r'<a [^>]*id="idleSite"[^>]*>', HTML).group(0)
        self.assertIn("https://ricepia.jp/", a)
        self.assertIn("campaign=idle_card", a)
        self.assertNotIn("target", a)
        self.assertRegex(HTML, r'<script src="nishio-go/idlecard\.js"></script>')

    def test_visibility_resets_idle(self):
        self.assertIn("visibilitychange", JS)
        self.assertIn("if (!document.hidden)", JS)

    def test_css_no_scrim(self):
        m = re.search(r"\.idle-card\{([^}]*)\}", CSS)
        self.assertIsNotNone(m)
        body = m.group(1)
        self.assertNotIn("inset", body)
        self.assertNotIn("100vh", body)
        self.assertNotRegex(body, r"top:\s*0")

    def test_no_banned_words(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = "\n".join(l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("\u307c\u304f", "\u3060\u306b", "\u7d0420%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()

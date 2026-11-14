"""にしおさんぽGO サイクル215：読みこみを 早く する。最初に 同期で 読む 4つ（pixel.js・game.js・meiro.js・style.css）は、
コメント だけ を ぬいた 配る 用の コピー（nishio-go/min/）を 読む。コピーは tools/strip-nishio.js で 元から 作り直す。

(a) 置いて ある コピーが 元から 作り直した ものと 1字も ちがわない（--check）
(b) nishio-go.html が 4つ とも min の ほうを、前と 同じ 順・同じ 形で 読む
(c) コピーの gzip が 元より 小さい（pixel.js は 3割 以上）
(d) コピーに コメントが のこって いない・行の 数は 元と 同じ・node --check が 通る
(e) コピーを 1字 こわすと --check が 落ちる（作り直し 忘れを 見のがさない）
(f) 手元に acorn が あれば、元と コピーの 字句の 列が 同じ（道具と 別の やり方での 確かめ）
"""
import gzip
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "tools" / "strip-nishio.js"
FILES = ["pixel.js", "game.js", "meiro.js", "style.css"]
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")


def gz(b):
    return len(gzip.compress(b, 9))


def find_acorn():
    for d in [os.environ.get("NODE_PATH", "")] + ["/opt/node-tools/node_modules", str(ROOT / "node_modules")]:
        for p in d.split(os.pathsep):
            if p and (Path(p) / "acorn").is_dir():
                return p
    return None


class NishioMin215(unittest.TestCase):
    def test_a_copies_match_sources(self):
        r = subprocess.run(["node", str(TOOL), "--check"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("自信が ない", r.stderr)   # 見分けられずに コメントを のこした 所が ない

    def test_b_html_reads_min(self):
        self.assertIn('<link rel="stylesheet" href="nishio-go/min/style.css"/>', HTML)
        self.assertNotIn('href="nishio-go/style.css"', HTML)
        tags = re.findall(r'<script src="([^"]+)"', HTML)
        for n in ["game", "pixel", "meiro"]:
            self.assertIn("nishio-go/min/%s.js" % n, tags, n)
            self.assertNotIn("nishio-go/%s.js" % n, tags, n)
        # 読む 順は 前と 同じ（game → landmark-gen → korostyle → pixel → meiro → share）
        i = tags.index("nishio-go/min/game.js")
        self.assertEqual(tags[i:i + 6], ["nishio-go/min/game.js", "nishio-go/landmark-gen.js", "nishio-go/korostyle.js",
                                         "nishio-go/min/pixel.js", "nishio-go/min/meiro.js", "nishio-go/share.js"])
        # 同期の まま（async・defer を 付けない）
        for n in ["game", "pixel", "meiro"]:
            self.assertIn('<script src="nishio-go/min/%s.js"></script>' % n, HTML)

    def test_c_smaller(self):
        for f in FILES:
            a = (ROOT / "nishio-go" / f).read_bytes()
            b = (ROOT / "nishio-go" / "min" / f).read_bytes()
            self.assertLess(gz(b), gz(a), f)
            self.assertLess(len(b), len(a), f)
        a = gz((ROOT / "nishio-go/pixel.js").read_bytes())
        b = gz((ROOT / "nishio-go/min/pixel.js").read_bytes())
        self.assertLessEqual(b, a * 0.7, (a, b))

    def test_d_comments_gone_lines_kept(self):
        for f in FILES:
            src = (ROOT / "nishio-go" / f).read_text(encoding="utf-8")
            out = (ROOT / "nishio-go" / "min" / f).read_text(encoding="utf-8")
            self.assertEqual(src.count("\n"), out.count("\n"), f)   # 行番号が 元と そろう
            lines = out.split("\n")
            self.assertFalse([l for l in lines if l.lstrip().startswith("//")], f)
            self.assertFalse([l for l in lines if l.lstrip().startswith("/*")], f)
            self.assertFalse([l for l in lines if l.rstrip() != l and l.strip() == ""], f)   # コメントを ぬいた あとの 空白だけの 行は 空行
            if f.endswith(".js"):
                subprocess.run(["node", "--check", str(ROOT / "nishio-go" / "min" / f)], check=True)
        css = (ROOT / "nishio-go/min/style.css").read_text(encoding="utf-8")
        self.assertNotIn("/*", css)
        # 絵は min/ から 見て ../art/ に ある（元の art/ と 同じ 所）
        self.assertIn("url(../art/rice-logo.png)", css)
        self.assertIn("url(../art/medal.png)", css)
        self.assertNotRegex(css, r"url\((?!\.\./|data:|\"data:|'data:)")

    def test_e_broken_copy_is_caught(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "tools").mkdir()
            (d / "nishio-go" / "min").mkdir(parents=True)
            shutil.copy(TOOL, d / "tools")
            for f in FILES:
                shutil.copy(ROOT / "nishio-go" / f, d / "nishio-go" / f)
                shutil.copy(ROOT / "nishio-go" / "min" / f, d / "nishio-go" / "min" / f)
            ok = subprocess.run(["node", str(d / "tools/strip-nishio.js"), "--check"], capture_output=True, text=True)
            self.assertEqual(ok.returncode, 0, ok.stderr)
            # コピーを 1字 こわす
            p = d / "nishio-go/min/meiro.js"
            t = p.read_text(encoding="utf-8")
            i = t.index("function")
            p.write_text(t[:i] + "F" + t[i + 1:], encoding="utf-8")
            r = subprocess.run(["node", str(d / "tools/strip-nishio.js"), "--check"], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1)
            self.assertIn("node tools/strip-nishio.js", r.stderr)
            # 元だけ 変えて 作り直し 忘れ も 落ちる
            subprocess.run(["node", str(d / "tools/strip-nishio.js"), "--quiet"], check=True)
            s = d / "nishio-go/pixel.js"
            s.write_text(s.read_text(encoding="utf-8") + "\nvar __x215 = 1;\n", encoding="utf-8")
            r = subprocess.run(["node", str(d / "tools/strip-nishio.js"), "--check"], capture_output=True, text=True)
            self.assertEqual(r.returncode, 1)
            # コピーが 無い ときも 落ちる
            (d / "nishio-go/min/style.css").unlink()
            subprocess.run(["node", str(d / "tools/strip-nishio.js"), "--quiet"], check=True)
            self.assertTrue((d / "nishio-go/min/style.css").exists())

    def test_e2_tricky_tokens_kept(self):
        """文字列・テンプレート（入れ子の ${}）・正規表現の 中の // や /* は ぬかない。決められない「/」の あとは のこす"""
        js = r"""
const { stripJs, stripCss } = require(process.argv[1]);
const cases = [
  ["var u = 'http://x' // c\n", "var u = 'http://x'\n"],
  ["var r = /\\/\\/[/*]x/g; // c", "var r = /\\/\\/[/*]x/g;"],
  ["var t = `a // b ${ {x:1}.x } /* d */ ${`in ${'//'}`}` // e\n", "var t = `a // b ${ {x:1}.x } /* d */ ${`in ${'//'}`}`\n"],
  ["a = b / c / d // e", "a = b / c / d"],
  ["if (x) /re\\/*/.test(y) // z", "if (x) /re\\/*/.test(y)"],
  ["return/*x*/1", "return 1"],
  ["a\n/* x\ny */b", "a\n\nb"],
  ["x = `line  \n`; // c", "x = `line  \n`;"],
  ["  // whole\n  code(); // t \n", "\n  code();\n"],
  ["/*! keep */ a", "/*! keep */ a"],
  ["x = a.return / 2 // c", "x = a.return / 2"],
];
const out = cases.map(([i, o]) => stripJs(i).text === o);
const amb = stripJs("x = {} \n/a/g.test(s) // c");
const css = stripCss("a{b:url(art/x.png);c:url('data:a/*b*/');d:'/* no */'} /* c */\n").text;
console.log(JSON.stringify({ out, amb: amb.text, ambStop: amb.stopAt, css }));
"""
        r = subprocess.run(["node", "-e", js, str(TOOL)], capture_output=True, text=True, check=True)
        import json
        o = json.loads(r.stdout)
        self.assertTrue(all(o["out"]), o["out"])
        self.assertGreaterEqual(o["ambStop"], 0)
        self.assertEqual(o["amb"], "x = {} \n/a/g.test(s) // c")   # 見分けられない 所から 先は そのまま
        self.assertEqual(o["css"], "a{b:url(../art/x.png);c:url('data:a/*b*/');d:'/* no */'}\n")

    def test_g_css_comment_keeps_selector(self):
        """PR #1189 の 指摘：CSS の コメントを 空白（や 改行）に すると .a/*c*/.b が .a .b（べつの セレクター）に なる。前後が 空白で ない コメントは のこす"""
        js = r"""
const { stripCss } = require(process.argv[1]);
const norm = t => t.replace(/\/\*[\s\S]*?\*\//g, '');   // のこした コメントを 外して 見る（ブラウザの 読み方と 同じ）
const a = stripCss('.a/*c*/.b{color:red}').text, b = stripCss('.a/*c\nd*/.b{color:red}').text, c = stripCss('.a /* c */ .b{x:1} /* d */\n').text;
console.log(JSON.stringify({ a: norm(a), b: norm(b), c }));
"""
        import json
        o = json.loads(subprocess.run(["node", "-e", js, str(TOOL)], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o["a"], ".a.b{color:red}", "コメントが 子孫の えらび方に かわった: %r" % o)
        self.assertEqual(o["b"], ".a.b{color:red}")
        self.assertEqual(o["c"], ".a  .b{x:1}\n")   # 前後に 空白が ある コメントは これまでどおり ぬく

    def test_h_regex_after_asi_kept(self):
        """PR #1189 の 指摘：debugger・break・continue の あとの 改行の つぎの「/」は 正規表現（ASI）。中の /* を コメントと して ぬかない"""
        js = r"""
const { stripJs } = require(process.argv[1]);
const a = stripJs('debugger\n/[/*x*/]/.test("x");');
const b = stripJs('function f(){ for(;;){ break\n/[/*y*/]/.test("y") } }');
const c = stripJs('debugger /[/*x*/]/;');
console.log(JSON.stringify({ a: a.text, aRes: eval(a.text), b: b.text, cText: c.text, cStop: c.stopAt }));
"""
        import json
        o = json.loads(subprocess.run(["node", "-e", js, str(TOOL)], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o["a"], 'debugger\n/[/*x*/]/.test("x");', "正規表現の 中を コメントと して ぬいた: %r" % o)
        self.assertTrue(o["aRes"])
        self.assertIn("/[/*y*/]/", o["b"])
        self.assertEqual(o["cText"], "debugger /[/*x*/]/;")   # 決められない 所は のこす

    def test_i_precommit_sees_deleted_copy(self):
        """PR #1189 の 指摘：コピーを 消した だけ（ほかの ファイルと いっしょに ステージ）でも、コミットの 前の 見はりが 一致の 確かめを 起こして 止める"""
        pc = ROOT / ".claude" / "skills" / "nishio-go-dev" / "scripts" / "precommit.sh"
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "tools").mkdir(); (d / "nishio-go" / "min").mkdir(parents=True); (d / "tests").mkdir()
            (d / ".claude/skills/nishio-go-dev/scripts").mkdir(parents=True)
            shutil.copy(TOOL, d / "tools"); shutil.copy(pc, d / ".claude/skills/nishio-go-dev/scripts/precommit.sh")
            for f in FILES:
                shutil.copy(ROOT / "nishio-go" / f, d / "nishio-go" / f)
                shutil.copy(ROOT / "nishio-go" / "min" / f, d / "nishio-go" / "min" / f)
            g = lambda *a: subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", *a], cwd=d, capture_output=True, text=True, check=True)
            g("init", "-q"); g("add", "-A"); g("commit", "-qm", "x")
            g("rm", "-q", "nishio-go/min/meiro.js")
            (d / "tests" / "test_zz.py").write_text("# x\n", encoding="utf-8"); g("add", "tests/test_zz.py")
            r = subprocess.run(["bash", str(d / ".claude/skills/nishio-go-dev/scripts/precommit.sh")], cwd=d, capture_output=True, text=True)
            self.assertEqual(r.returncode, 1, "コピーを 消しても 見はりが 通った: %r" % (r.stdout + r.stderr))
            self.assertIn("nishio-go/min", r.stderr)

    def test_f_same_tokens_by_acorn(self):
        np = find_acorn()
        if not np:
            self.skipTest("acorn が 手元に ない")
        js = r"""
const acorn = require('acorn'), fs = require('fs');
const res = {};
for (const f of ['pixel.js', 'game.js', 'meiro.js']) {
  const t = s => { const c = []; const k = []; for (const x of acorn.tokenizer(s, { ecmaVersion: 'latest', locations: true, onComment: () => c.push(1) })) k.push(x.type.label + '\u0001' + String(x.value) + '\u0001' + x.loc.start.line); return { k, c: c.length }; };
  const a = t(fs.readFileSync('nishio-go/' + f, 'utf8')), b = t(fs.readFileSync('nishio-go/min/' + f, 'utf8'));
  res[f] = { same: a.k.length === b.k.length && a.k.every((x, i) => x === b.k[i]), left: b.c, had: a.c };
}
console.log(JSON.stringify(res));
"""
        env = dict(os.environ, NODE_PATH=np)
        r = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, env=env, check=True)
        import json
        for f, v in json.loads(r.stdout).items():
            self.assertTrue(v["same"], f)   # 字句（種類・値・行番号）が 1つ のこらず 同じ
            self.assertEqual(v["left"], 0, f)
            self.assertGreater(v["had"], 100, f)


if __name__ == "__main__":
    unittest.main()

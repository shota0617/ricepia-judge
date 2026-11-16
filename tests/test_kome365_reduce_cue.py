"""Initial reduced-motion arrows: real HTML/DOM layout, without game-state fixtures."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(os.environ.get("KOME365_ROOT") or Path(__file__).resolve().parents[1])
HTML_PATH = Path(os.environ.get("KOME365_HTML") or ROOT / "kome365/index.html")

BROWSER_JS = r"""
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const [htmlPath, root] = process.argv.slice(1);
const origin = 'http://kome.test', rows = [];
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript',
  '.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
function measure() {
  const rect = r => ({x:r.x,y:r.y,width:r.width,height:r.height,
    left:r.left,top:r.top,right:r.right,bottom:r.bottom});
  function layout(e, anchor) {
    const size={width:e.offsetWidth,height:e.offsetHeight};
    if(!anchor)return {...size,left:e.offsetLeft,top:e.offsetTop,
      offsetParent:e.offsetParent?e.offsetParent.tagName+'#'+e.offsetParent.id:null};
    let left=0, top=0;
    const chain=[];
    for(let n=e;n!==anchor;){
      const p=n.offsetParent;
      if(!p)throw Error('Layout chain did not reach #swCard');
      chain.push({tag:n.tagName,id:n.id,left:n.offsetLeft,top:n.offsetTop,
        parentBorderLeft:p?.clientLeft||0,parentBorderTop:p?.clientTop||0});
      left+=n.offsetLeft;top+=n.offsetTop;
      if(p!==anchor){left+=p.clientLeft;top+=p.clientTop;}
      n=p;
    }
    for(let n=e;n;n=n.parentElement){
      if(n.scrollLeft||n.scrollTop)throw Error('Scrolled layout chain');
      if(n===anchor)break;
    }
    return {...size,left,top,reference:'#swCard padding edge',chain};
  }
  function read(selector, anchor) {
    const e = document.querySelector(selector);
    if (!e) throw Error('Missing actual product element: ' + selector);
    const r=e.getBoundingClientRect(), s=getComputedStyle(e), characters=[];
    let visible=r.width>0&&r.height>0, opacity=1;
    for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n);
      visible=visible&&c.display!=='none'&&c.visibility!=='hidden'&&c.visibility!=='collapse';
      opacity*=Number(c.opacity);}
    const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
    for(let n;(n=walker.nextNode());)for(let a=0;a<n.length;){
      const character=String.fromCodePoint(n.data.codePointAt(a)), z=a+character.length;
      const range=document.createRange();range.setStart(n,a);range.setEnd(n,z);
      characters.push({character,rects:Array.from(range.getClientRects(),rect)});a=z;
    }
    return {text:e.textContent,rect:rect(r),visible:visible&&opacity>0.01,
      layout:layout(e,anchor),
      opacity,fontSize:parseFloat(s.fontSize),characters,
      inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};
  }
  const cardElement=document.querySelector('#swCard'),card=read('#swCard');
  const labels=['.eL','.eR'].map(k=>read('#swEdge '+k+' .eLb',cardElement));
  const dateText=read('#swBigDate'),titleText=read('#swTitle');
  const textTargets=[...labels,dateText,titleText],targetNames=['left','right','date','title'];
  const arrows=['.gdL','.gdR'].map(k=>read('#swGuide '+k)), intersections=[];
  arrows.forEach((a,ai)=>textTargets.forEach((l,li)=>l.characters.forEach((ch,ci)=>
    ch.rects.forEach(r=>{const w=Math.min(a.rect.right,r.right)-Math.max(a.rect.left,r.left);
      const h=Math.min(a.rect.bottom,r.bottom)-Math.max(a.rect.top,r.top);
      if(a.visible&&l.visible&&w>0.5&&h>0.5)
        intersections.push({arrow:ai,target:targetNames[li],character:ci,text:ch.character,width:w,height:h});}))));
  return {reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
    viewport:[innerWidth,innerHeight],date:document.querySelector('#swBigDate').textContent,
    title:document.querySelector('#swTitle').textContent,choices:window.__swipe.choices(),
    card,labels,dateText,titleText,arrows,intersections};
}
(async()=>{
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,
      headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--no-sandbox']});
    for(const mode of ['no-preference','reduce']) {
      const context=await browser.newContext({viewport:{width:844,height:390},
        isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:mode});
      try {
        const errors=[], diagnostics={consoleErrors:[],httpErrors:[],requestFailures:[]};
        await context.route('**/*',async route=>{
          const u=new URL(route.request().url());
          if(u.origin!==origin)return route.abort('blockedbyclient');
          // Preserve the known missing favicon as transport evidence, not a layout failure.
          if(u.pathname==='/favicon.ico')return route.fulfill({status:404,body:''});
          const file=u.pathname==='/kome365/index.html'?htmlPath:path.resolve(root,'.'+u.pathname);
          if(file!==htmlPath&&!file.startsWith(path.resolve(root)+path.sep))
            throw Error('Unexpected local path: '+u.pathname);
          if(!fs.existsSync(file)||!fs.statSync(file).isFile())
            throw Error('Missing real product asset: '+file);
          return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',
            body:fs.readFileSync(file)});
        });
        const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
        page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push({text:m.text(),location:m.location()});});
        page.on('response',r=>{if(r.status()>=400)diagnostics.httpErrors.push({url:r.url(),status:r.status()});});
        page.on('requestfailed',r=>diagnostics.requestFailures.push({url:r.url(),failure:r.failure()}));
        const cdp=await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
        await page.goto(origin+'/kome365/index.html',{waitUntil:'load',timeout:20000});
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForFunction(mode=>window.__swipe&&document.querySelector('#swCard')?.offsetWidth>0
          &&document.querySelector('#swBigDate')?.textContent==='1月1日'
          &&document.querySelector('#swTitle')?.textContent==='元日の田んぼ'
          &&document.querySelector('#swEdge .eL .eLb')?.textContent==='畦から田見る'
          &&document.querySelector('#swEdge .eR .eLb')?.textContent==='田へ行かない'
          &&document.fonts.status==='loaded'&&document.querySelector('#swWrap')?.classList.contains('demoOn')
          &&matchMedia('(prefers-reduced-motion: reduce)').matches===(mode==='reduce'),mode,{timeout:10000});
        await page.waitForTimeout(1000);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        rows.push({mode,errors,diagnostics,...await page.evaluate(measure)});
      } finally { await context.close(); }
    }
  } finally { if(browser)await browser.close(); }
  console.log(JSON.stringify(rows));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
"""


class TestKome365ReduceCue(unittest.TestCase):
    def test_reduced_arrows_leave_initial_choice_text_clear(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node.js is required; missing environment is not a pass")
        self.assertTrue(HTML_PATH.is_file(), f"HTML not found: {HTML_PATH}")
        result = subprocess.run(
            [node, "-e", BROWSER_JS, str(HTML_PATH.resolve()), str(ROOT.resolve())],
            capture_output=True, text=True, timeout=90,
        )
        self.assertEqual(result.returncode, 0, result.stderr[-6000:])
        rows = json.loads(result.stdout.strip().splitlines()[-1])
        print("Kome layout transport evidence: " + json.dumps(
            [{"mode": r["mode"], **r["diagnostics"]} for r in rows], ensure_ascii=False))
        self.assertEqual([r["mode"] for r in rows], ["no-preference", "reduce"])
        for r in rows:
            with self.subTest(mode=r["mode"]):
                self.assertEqual(r["errors"], [])
                self.assertEqual(r["diagnostics"]["requestFailures"], [])
                self.assertTrue(all(e["status"] == 404 and e["url"] == "http://kome.test/favicon.ico"
                                    for e in r["diagnostics"]["httpErrors"]))
                self.assertEqual(r["viewport"], [844, 390])
                self.assertEqual((r["date"], r["title"], r["choices"]),
                                 ("1月1日", "元日の田んぼ", ""))
                self.assertEqual([l["text"] for l in r["labels"]], ["畦から田見る", "田へ行かない"])
                self.assertTrue(r["card"]["visible"])
                for label in r["labels"]:
                    self.assertTrue(label["visible"] and label["inside"])
                    self.assertEqual(label["fontSize"], 19)
                    self.assertEqual(len(label["characters"]), 6)
                    self.assertTrue(all(ch["rects"] for ch in label["characters"]))
                for text in (r["dateText"], r["titleText"]):
                    self.assertTrue(text["visible"] and text["inside"])
                    self.assertTrue(text["characters"] and all(ch["rects"] for ch in text["characters"]))
        normal, reduced = rows
        self.assertFalse(normal["reduced"])
        self.assertTrue(reduced["reduced"])
        self.assertTrue(all(not a["visible"] for a in normal["arrows"]))
        self.assertEqual([a["text"] for a in reduced["arrows"]], ["◀", "▶"])
        self.assertTrue(all(a["visible"] and a["inside"] for a in reduced["arrows"]))
        for arrow in reduced["arrows"]:
            self.assertEqual(arrow["fontSize"], 40)
            # 丸い ◀▶ の 箱の 大きさは 字の 形(フォント)で かわる(この 作業場は 66.7×54)。大きさは ここでは 見ない
            self.assertGreater(arrow["rect"]["width"], 40)
            self.assertGreater(arrow["rect"]["height"], 40)
        self.assertEqual(normal["card"]["layout"], reduced["card"]["layout"])
        for a, b in zip(normal["labels"], reduced["labels"]):
            self.assertEqual(a["layout"]["reference"], b["layout"]["reference"])
            for key in ("width", "height"):
                self.assertEqual(a["layout"][key], b["layout"][key])
            for key in ("left", "top"):
                self.assertAlmostEqual(a["layout"][key], b["layout"][key], delta=1,
                                       msg=f"Common layout coordinates differ: {a['layout']} / {b['layout']}")
        self.assertEqual(reduced["intersections"], [],
                         "Reduced-motion arrows overlap actual initial choice/date/title character ranges")


if __name__ == "__main__":
    unittest.main()

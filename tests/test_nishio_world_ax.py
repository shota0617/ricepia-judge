"""Real HTML/min browser regression with an explicit goals=3 storage fixture.

Set NISHIO_ROOT, NODE_PATH, LEAFLET_DIR and optionally CHROMIUM_EXECUTABLE.
Dependencies are required: missing browser/tooling is a failure, never a pass/skip.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


BROWSER_JS = r"""
const fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright');
const [root, leaflet, executable] = process.argv.slice(1);
const origin = 'http://nishio.test';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript',
  '.css':'text/css','.json':'application/json','.png':'image/png',
  '.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:executable || undefined,
    ignoreDefaultArgs:['--mute-audio'], args:['--no-sandbox','--disable-background-networking']});
  try {
    const context = await browser.newContext({viewport:{width:320,height:568},
      isMobile:true, hasTouch:true, serviceWorkers:'block'});
    try {
      const served = [], external = [], errors = [];
      await context.route('**/*', async route => {
        const u = new URL(route.request().url());
        let base, rel;
        if (u.origin === origin) { base=root; rel=u.pathname; }
        else if (u.origin === 'https://unpkg.com' && u.pathname.startsWith('/leaflet@1.9.4/dist/')) {
          base=leaflet; rel=u.pathname.slice('/leaflet@1.9.4/dist'.length);
        } else { external.push(u.href); return route.fulfill({status:204,body:''}); }
        const file = path.resolve(base, '.' + decodeURIComponent(rel));
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
          return route.fulfill({status:404,body:''});
        served.push(file);
        return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},
          contentType:types[path.extname(file)] || 'application/octet-stream',body:fs.readFileSync(file)});
      });
      await context.addInitScript(() => {
        // Deliberate saved-state fixture; no time/audio/render/input-function replacement.
        for (const [k,v] of Object.entries({nsg_world_on:'0',nsg_mzgoals:'0'}))
          localStorage.setItem(k,v);
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(origin + '/nishio-go.html',{waitUntil:'load',timeout:30000});
      await page.waitForFunction(() => {
        const intro=document.getElementById('intro');
        return intro && intro.hidden && window.nishioPixel &&
          typeof nishioPixel.setWorld==='function' && document.getElementById('pxWorld');
      }); // Product closes its own intro; the fixture never hides a product element.
      const cdp = await context.newCDPSession(page);
      const read = async () => {
        const dom = await page.evaluate(() => {
          const b=document.getElementById('pxWorld'), r=b.getBoundingClientRect(), img=b.querySelector('img');
          return {world:nishioPixel.worldMode,bodyWorld:document.body.classList.contains('pxw'),
            hidden:b.hidden,visible:!!b.getClientRects().length,title:b.title,introHidden:document.getElementById('intro').hidden,
            iconSrc:img && img.getAttribute('src'),iconAlt:img && img.alt,
            stored:localStorage.getItem('nsg_world_on'),box:{x:r.x,y:r.y,width:r.width,height:r.height}};
        });
        const {root:doc} = await cdp.send('DOM.getDocument',{depth:0});
        const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#pxWorld'});
        if (!nodeId) throw new Error('Real #pxWorld button was not found');
        const {node} = await cdp.send('DOM.describeNode',{nodeId});
        const ax = await cdp.send('Accessibility.getPartialAXTree',
          {backendNodeId:node.backendNodeId,fetchRelatives:false});
        return {...dom,backendNodeId:node.backendNodeId,
          ax:ax.nodes.find(n => n.backendDOMNodeId === node.backendNodeId) || null};
      };
      const firstHidden = await read(); // Initial false/hidden is not an AX-name failure.
      await page.evaluate(() => {
        // Existing public API only sets up the goals=3 fixture; measured transitions use touch.
        localStorage.setItem('nsg_mzgoals','3'); nishioPixel.setWorld(false);
        window.__worldAxClicks=[];
        document.getElementById('pxWorld').addEventListener('click',e =>
          __worldAxClicks.push({trusted:e.isTrusted,world:nishioPixel.worldMode}));
      });
      await page.locator('#pxWorld').waitFor({state:'visible'});
      const walking = await read();
      const touch = async expectedWorld => {
        const b=await page.locator('#pxWorld').boundingBox();
        if (!b) throw new Error('Visible world button missing');
        const x=b.x+b.width/2,y=b.y+b.height/2;
        const hit=await page.evaluate(({x,y}) => {
          const b=document.getElementById('pxWorld'),e=document.elementFromPoint(x,y);
          return !!e && (e===b || b.contains(e));
        },{x,y});
        if (!hit) throw new Error('World button center is covered');
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
        await page.waitForTimeout(60);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForFunction(value => nishioPixel.worldMode===value,expectedWorld);
      };
      await touch(true);
      const world = await read();
      await touch(false);
      const returned = await read();
      const clicks = await page.evaluate(() => __worldAxClicks);
      await cdp.detach();
      console.log(JSON.stringify({firstHidden,walking,world,returned,clicks,errors,
        externalResponses204:external,served:[...new Set(served)]}));
    } finally { await context.close(); }
  } finally { await browser.close(); }
})().catch(e => { console.error(String(e.stack || e)); process.exitCode=1; });
"""


class NishioWorldAccessibleName(unittest.TestCase):
    def test_visible_world_button_names_its_return_action(self):
        root = Path(os.environ.get('NISHIO_ROOT', Path(__file__).resolve().parents[1])).resolve()
        leaflet = Path(os.environ.get('LEAFLET_DIR', root / 'node_modules/leaflet/dist')).resolve()
        node = shutil.which('node')
        self.assertIsNotNone(node, 'Node is required; browser regression was not executed')
        for rel in ['nishio-go.html','nishio-go/pixel.js','nishio-go/min/pixel.js','tools/strip-nishio.js']:
            self.assertTrue((root / rel).is_file(), 'Missing product source: ' + rel)
        assets = ['leaflet.js','leaflet.css','images/layers.png','images/layers-2x.png',
                  'images/marker-icon.png','images/marker-icon-2x.png','images/marker-shadow.png']
        for rel in assets:
            self.assertTrue((leaflet / rel).is_file(), 'Required local Leaflet asset missing: ' + rel)
        check = subprocess.run([node, str(root / 'tools/strip-nishio.js'),'--check','--quiet'],
                               cwd=root, capture_output=True, text=True, timeout=30)
        self.assertEqual(check.returncode, 0, 'Source/min differ; no regeneration here: ' + check.stderr + check.stdout)
        executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or ''
        run = subprocess.run([node,'-e',BROWSER_JS,str(root),str(leaflet),executable],
                             cwd=root,capture_output=True,text=True,timeout=90)
        self.assertEqual(run.returncode, 0, run.stderr[-5000:])
        self.assertTrue(run.stdout.strip(), 'No browser diagnostics; not GREEN')
        data = json.loads(run.stdout.strip().splitlines()[-1])
        print('world-AX fixture: ' + json.dumps(data, ensure_ascii=False))
        self.assertEqual(data['errors'], [], 'Browser pageerror; not an AX-name result')
        self.assertIn(str(root / 'nishio-go/min/pixel.js'), data['served'])
        self.assertEqual(data['clicks'], [{'trusted':True,'world':True},{'trusted':True,'world':False}])
        self.assertTrue(all(data[k]['introHidden'] for k in ['firstHidden','walking','world','returned']))
        first = data['firstHidden']
        self.assertEqual((first['world'],first['hidden'],first['visible']), (False,True,False))
        for key, on, title, icon in [('world',True,'歩く地図にもどる','stat-feet.png'),
                                     ('returned',False,'西尾市ぜんたいの地図','btn-globe.png')]:
            state = data[key]
            self.assertEqual((state['world'],state['bodyWorld'],state['hidden'],state['visible']), (on,on,False,True))
            self.assertEqual(state['stored'], '1' if on else '0')
            self.assertEqual(state['title'], title)
            self.assertTrue((state['iconSrc'] or '').endswith('/'+icon))
            self.assertEqual(state['backendNodeId'],data['walking']['backendNodeId'])
        # Main old-RED assertion: actual button AX name, not title/HTML/source text.
        for key, expected in [('world','歩く地図にもどる'),('returned','せかいちず（西尾市と となりの市町）')]:
            ax=data[key]['ax']
            self.assertIsNotNone(ax, 'Visible button is absent from AX tree')
            self.assertFalse(ax['ignored'], ax)
            self.assertEqual(ax['role']['value'], 'button')
            self.assertEqual(ax.get('name',{}).get('value'), expected, key + ' button AX name')


if __name__ == '__main__':
    unittest.main()

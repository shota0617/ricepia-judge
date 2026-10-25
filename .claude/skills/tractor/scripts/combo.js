const {chromium}=require('playwright'); const fs=require('fs'); const http=require('http'); const path=require('path');
const ROOT=path.resolve(__dirname, '../../../..'), TN=process.env.THREE_NM || path.join(__dirname, 'node_modules/three'), PORT=8907;
const srv=http.createServer((r,s)=>{const u=decodeURIComponent(r.url.split('?')[0]); fs.readFile(path.join(ROOT,u),(e,d)=>{if(e){s.writeHead(404);s.end();return;} s.writeHead(200,{'Content-Type':u.endsWith('.html')?'text/html':'application/octet-stream'}); s.end(d);});}).listen(PORT, async()=>{
  const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const out=[];
  for (const season of ['haru','aki','shirokaki']) for (const time of ['asa','hiru','yu','yoru']) for (const w of ['hare','kumori','ame']) {
    const ctx=await b.newContext({viewport:{width:640,height:360}}); const p=await ctx.newPage(); p.setDefaultTimeout(240000);
    const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120));});
    await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({path:TN+'/build/three.min.js',contentType:'text/javascript'}));
    await p.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({path:TN+r.request().url().split('/three@0.128.0')[1],contentType:'text/javascript'}));
    try {
      await p.goto(`http://localhost:${PORT}/tractor.html?season=${season}&time=${time}&w=${w}&noshadow`);
      await p.waitForFunction(()=>!document.getElementById('bStart').disabled,null,{timeout:240000});
      await p.click('#bStart'); await p.waitForTimeout(800);
      await p.evaluate(()=>{ const g=game; g.sim(2); g.toggleRotary(); g.key.fwd=1; g.sim(6); g.key.left=1; g.sim(1); g.key.left=0; g.key.fwd=0; g.toggleRotary(); g.sim(1); g.nextCam(); });
      await p.waitForTimeout(1500);
      const st=await p.evaluate(()=>({pct:document.getElementById('pct').textContent, snd:!!game.audio}));
      out.push(`${season}/${time}/${w}: ${errs.length?'ERR '+JSON.stringify(errs.slice(0,2)):'ok'} ${JSON.stringify(st)}`);
    } catch(e) { out.push(`${season}/${time}/${w}: EXC ${String(e).slice(0,100)}`); }
    console.log(out[out.length-1]);
    await ctx.close();
  }
  await b.close(); srv.close();
});

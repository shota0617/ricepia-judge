// 通しのテスト：node tooshi.js <season> <out> [mobile] [qs]
// まん中を往復して耕し（枕地で上げて大きく切って U ターン）、外周を回って、おわり（Enter）まで
const {chromium}=require('playwright'); const fs=require('fs'); const http=require('http'); const path=require('path');
const ROOT=path.resolve(__dirname, '../../../..'), TN=process.env.THREE_NM || path.join(__dirname, 'node_modules/three'), season=process.argv[2]||'haru', out=process.argv[3]||'t', mobile=process.argv[4]==='mobile', qs=process.argv[5]||'', PORT=+(process.env.PORT||8890);
const srv=http.createServer((r,s)=>{const u=decodeURIComponent(r.url.split('?')[0]); fs.readFile(path.join(ROOT,u),(e,d)=>{if(e){s.writeHead(404);s.end();return;} s.writeHead(200,{'Content-Type':u.endsWith('.html')?'text/html':'application/octet-stream'}); s.end(d);});}).listen(PORT, async()=>{
  const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true}:{viewport:{width:1280,height:720}});
  const p=await ctx.newPage(); p.setDefaultTimeout(900000);
  const errs=[]; p.on('pageerror',e=>errs.push('pageerror '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console '+m.text());});
  await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({path:TN+'/build/three.min.js',contentType:'text/javascript'}));
  await p.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({path:TN+r.request().url().split('/three@0.128.0')[1],contentType:'text/javascript'}));
  await p.goto(`http://localhost:${PORT}/tractor.html?season=${season}&time=hiru&noshadow&art=none${qs}`);
  await p.waitForFunction(()=>!document.getElementById('bStart').disabled,null,{timeout:180000});
  await p.click('#bStart'); await p.waitForTimeout(1500);
  const res=await p.evaluate(()=>{
    const g=game,S=g.S,K=g.key, HX=15, HZ=25; g.sim(3);
    const log={turns:0, dblSeen:0, levee0:g.SCORE.st.levee, stuck:0};
    const ang=a=>Math.atan2(Math.sin(a),Math.cos(a));
    // はじめの場所から田んぼの南西へ
    Object.assign(S,{x:-HX+6.5, z:-HZ+7.5, yaw:0, v:0, steer:0}); g.sim(0.5);
    let dir=1, x0=S.x, xt=x0;
    for(let row=0; row<11; row++){
      const follow=()=>{ const ex=Math.max(-1,Math.min(1,xt-S.x)), want=(dir>0?0:Math.PI)+dir*0.35*ex; S.steer=Math.max(-0.3,Math.min(0.3,-1.5*ang(want-S.yaw))); };
      K.fwd=1; for(let i=0;i<16;i++){ follow(); g.sim(0.05); }
      if(!S.rotDown) g.toggleRotary(); let k=0;
      while((dir>0? S.z < HZ-7 : S.z > -HZ+7) && k<2000){ const ex=Math.max(-1,Math.min(1,xt-S.x)), want=(dir>0?0:Math.PI)+dir*0.35*ex; S.steer=Math.max(-0.3,Math.min(0.3,-1.5*ang(want-S.yaw))); g.sim(0.05); k++; if(Math.abs(S.v)<0.01&&k>40) {log.stuck++; break;} }
      K.left=K.right=0; K.fwd=0; g.toggleRotary(); g.sim(1.2); K.fwd=1; if(row===10) break;
      // U ターン（東へまわる）：北むきなら右、南むきなら左
      const side = dir>0 ? 'left' : 'right', target = dir>0 ? Math.PI : 0; K[side]=1; k=0;
      const tr=[]; while(Math.abs(ang(target-S.yaw))>0.15 && k<600){ g.sim(0.05); if(S.dblAct) log.dblSeen++; if(row===1&&k%8==0) tr.push([+S.x.toFixed(2),+S.z.toFixed(2),+S.yaw.toFixed(2),+S.steer.toFixed(2),+S.v.toFixed(2)]); k++; } if(row===1) log.tr=tr;
      K[side]=0; log.turns++; (log.rows=log.rows||[]).push([+S.x.toFixed(1),+S.z.toFixed(1),+S.yaw.toFixed(2)]); dir=-dir; xt+=2.0; g.sim(0.3);
    }
    K.fwd=0; g.sim(1);
    const pct=g.SCORE ? document.getElementById('pct')?.textContent : '';
    g.finish && g.finish();
    return {...log, tr:undefined, rows:undefined, turnsDown:g.SCORE.st.turnsDown, parts:g.SCORE.parts, levee:g.SCORE.st.levee-log.levee0, x:+S.x.toFixed(1), z:+S.z.toFixed(1), done:S.done, sc:document.getElementById('sc')?.textContent, pct, heard:Object.keys(g.heard||{}).join(','), dame:JSON.stringify(g.FARMER.said||{})};
  });
  await p.waitForTimeout(2500);
  await p.screenshot({path:out+'_done.png'});
  const doneTxt = await p.evaluate(()=>{ const d=document.getElementById('done'); return d && getComputedStyle(d).display!=='none' ? d.innerText.slice(0,300) : 'hidden'; });
  console.log(season, mobile?'mobile':'pc', JSON.stringify(res)); console.log('done:', JSON.stringify(doneTxt));
  console.log('errors', JSON.stringify(errs)); await b.close(); srv.close();
});

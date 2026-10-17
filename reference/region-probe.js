// 調査（一時的）：西尾市・安城市の境界が、本店（米津町）のあたりで正しく輪になるか
const fs = require('fs');
const { overpassFromNode } = require('../tools/bake-common');
const M_LAT = 110950, M_LNG = 111320 * Math.cos(34.86 * Math.PI / 180), P = { lat: 34.891717, lon: 137.059249 };
const out = [];
const log = (...a) => { const s = a.join(' '); console.log(s); out.push(s); };
function inRing(lat, lon, r) { let a = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i].lat > lat) !== (r[j].lat > lat) && lon < (r[j].lon - r[i].lon) * (lat - r[i].lat) / (r[j].lat - r[i].lat) + r[i].lon) a = !a; } return a; }
const near = (p, q) => Math.hypot((p.lon - q.lon) * M_LNG, (p.lat - q.lat) * M_LAT) < 10;
(async () => {
  const q = `[out:json][timeout:180];rel["boundary"="administrative"]["admin_level"="7"]["name"~"^(西尾市|安城市)$"];out geom;`;
  const ask = async body => { for (let t = 0; ; t++) { try { return await overpassFromNode(body); } catch (e) { if (t >= 4) throw e; await new Promise(r => setTimeout(r, 60000)); } } };
  // OSM では本店の地点がどの区域に入っているか（町の境界 admin_level 9/10 も含めて）
  const isIn = JSON.parse(await ask('data=' + encodeURIComponent(`[out:json][timeout:60];is_in(${P.lat},${P.lon})->.a;area.a["boundary"="administrative"];out tags;`)));
  for (const a of isIn.elements) log(`is_in: level ${a.tags.admin_level} ${a.tags.name} (area ${a.id})`);
  const json = JSON.parse(await ask('data=' + encodeURIComponent(q)));
  for (const rel of json.elements.filter(e => e.type === 'relation')) {
    log(`== ${rel.tags.name} rel ${rel.id} members ${rel.members.length} roles ${[...new Set(rel.members.map(m => m.type + ':' + m.role))].join(' ')}`);
    const ways = rel.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length > 1);
    ways.forEach((m, i) => {
      const g = m.geometry, inBox = g.filter(p => p.lat > 34.875 && p.lat < 34.91 && p.lon > 137.03 && p.lon < 137.09);
      if (inBox.length) log(`way#${i} ref ${m.ref} role ${m.role} pts ${g.length} start ${g[0].lat},${g[0].lon} end ${g[g.length - 1].lat},${g[g.length - 1].lon} inBox ${inBox.length}: ${inBox.map(p => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(' ')}`);
    });
    // つなぎ方（bake-region と同じ）
    const left = ways.map(m => m.geometry.filter(Boolean)), rings = [];
    while (left.length) {
      let ring = left.shift();
      for (let grew = true; grew && !(ring.length > 3 && near(ring[0], ring[ring.length - 1]));) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const w = left[i], end = ring[ring.length - 1], start = ring[0];
          if (near(w[0], end)) ring = ring.concat(w.slice(1)); else if (near(w[w.length - 1], end)) ring = ring.concat(w.slice(0, -1).reverse());
          else if (near(w[w.length - 1], start)) ring = w.slice(0, -1).concat(ring); else if (near(w[0], start)) ring = w.slice(1).reverse().concat(ring);
          else continue;
          left.splice(i, 1); grew = true; break;
        }
      }
      rings.push(ring);
    }
    rings.forEach((r, i) => {
      const gap = Math.hypot((r[0].lon - r[r.length - 1].lon) * M_LNG, (r[0].lat - r[r.length - 1].lat) * M_LAT);
      log(`ring#${i} pts ${r.length} gap ${Math.round(gap)}m containsShop ${inRing(P.lat, P.lon, r)}`);
      // 本店のまわり1kmの輪の線分（長い線分は、つなぎまちがいのしるし）
      for (let k = 0; k + 1 < r.length; k++) {
        const a = r[k], b = r[k + 1], L = Math.hypot((a.lon - b.lon) * M_LNG, (a.lat - b.lat) * M_LAT);
        const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }, d = Math.hypot((mid.lon - P.lon) * M_LNG, (mid.lat - P.lat) * M_LAT);
        if (d < 1500 && L > 150) log(`  long seg ${Math.round(L)}m ${a.lat},${a.lon} -> ${b.lat},${b.lon}`);
      }
    });
  }
  fs.writeFileSync('reference/region-probe.txt', out.join('\n') + '\n');
})().catch(e => { console.error(e); process.exit(1); });

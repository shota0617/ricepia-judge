"""未取得の地図背景をまとめても、前景と元の画素を保つ実ブラウザ回帰テスト。"""

import json
import os
from pathlib import Path
import subprocess
import unittest


# Like tests/test_kome365_firstmin.py, Python launches an embedded Playwright
# script, serves exact disk bytes through routes, then asserts returned data.
# Missing dependencies/fixtures FAIL here; a zero-opportunity run is not a pass.
BROWSER_JS = r"""
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { chromium } = require('playwright');
const root = fs.realpathSync(process.argv[1]), reducedMotion = process.argv[2], patternMode = process.argv[3];
const leafRoot = fs.realpathSync(process.env.LEAFLET_DIR || path.join(root, 'node_modules/leaflet/dist'));
const ORIGIN = 'http://nishio-pattern.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHashes = () => Object.fromEntries(['nishio-go.html', 'nishio-go/pixel.js'].map(f => [f, hash(path.join(root, f))]));
const beforeHashes = sourceHashes();
function localFile(base, relative) {
  const file = path.resolve(base, relative);
  if (file !== base && !file.startsWith(base + path.sep)) throw Error('Path escapes local root: ' + relative);
  const real = fs.realpathSync(file);
  if (real !== base && !real.startsWith(base + path.sep)) throw Error('Symlink escapes local root: ' + relative);
  if (!fs.statSync(real).isFile()) throw Error('Not a local file: ' + relative);
  return real;
}

function observe(patternMode) {
  const audit = window.__fogPatternAudit = {
    frames: [], errors: [], dropped: 0, dcl: false, active: true,
    contextCount: 0, outsideRAF: 0, nativeThrows: 0, patternCreations: [], backgroundCaptures: [],
    patternUnavailableContexts: 0,
    storageInitiallyEmpty: localStorage.length === 0 && sessionStorage.length === 0
  };
  document.addEventListener('DOMContentLoaded', () => { audit.dcl = true; }, { once: true });
  const failure = (stage, error) => audit.errors.push({ stage, message: String(error?.message || error) });
  const state = () => {
    const P = window.nishioPixel, c = document.getElementById('bootCover'), cv = document.getElementById('pxCanvas');
    const s = c && getComputedStyle(c), r = c?.getBoundingClientRect(), cr = cv?.getBoundingClientRect();
    const hit = cr && document.elementFromPoint((cr.left + cr.right) / 2, (cr.top + cr.bottom) / 2);
    return {
      at: performance.now(), dcl: audit.dcl, readyState: document.readyState,
      pixel: !!P, worldMode: P?.worldMode === true, worldNull: !!P && P.world === null,
      worldState: P?.worldState, trailCells: P?.trailCells, bake: !!window.NSG_BAKE,
      regionRings: window.nishioGo?.REGION?.reduce((n, city) => n + city.rings.length, 0) || 0,
      dpr: Math.min(devicePixelRatio || 1, 3),
      canvasWidth: cv?.width || 0, canvasHeight: cv?.height || 0,
      covered: !!c?.isConnected && !c.classList.contains('off') && s.opacity === '1'
        && s.display !== 'none' && s.visibility === 'visible' && s.pointerEvents !== 'none'
        && s.backgroundColor === 'rgb(246, 244, 236)'
        && r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight
        && !!cr && cr.width > 0 && cr.height > 0
        && r.left <= cr.left && r.top <= cr.top && r.right >= cr.right && r.bottom >= cr.bottom
        && !!hit && (hit === c || c.contains(hit)),
      motion: matchMedia('(prefers-reduced-motion: reduce)').matches
    };
  };
  const eligibleState = s => s.pixel && s.worldMode && s.worldNull && s.worldState === 'building'
    && s.trailCells === 0 && !s.bake && s.covered && !s.dcl && s.readyState === 'loading'
    && s.canvasWidth > 0 && s.canvasHeight > 0;
  let current = null, callbackSequence = 0, sequence = 0;
  const callbacks = new WeakMap(), contexts = new WeakSet(), patterns = new WeakMap();
  const originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback, ...rest) {
    if (typeof callback !== 'function') return Reflect.apply(originalRAF, this, [callback, ...rest]);
    let identity = callbacks.get(callback);
    if (!identity) {
      identity = { id: ++callbackSequence, name: callback.name, registeredAt: new Error('raf-registration').stack || '' };
      callbacks.set(callback, identity);
    }
    return Reflect.apply(originalRAF, this, [function (...args) {
      if (!audit.active) return Reflect.apply(callback, this, args);
      let row;
      try {
        row = {
          sequence: ++sequence, callback: identity, entry: state(), exit: null, completed: false,
          rafTimestamp: args[0], f: Math.floor(args[0] / 600) % 2,
          firstTargetStack: '', targetReturned: 0, prefix: { drawImage: 0, fillRect: 0, fill: 0 },
          patternFills: [], boundarySeen: false, dashReturned: 0, strokeReturned: 0,
          firstBoundaryStack: '', firstRegionStrokeStack: '', prefixFogTiles4: 0, firstFogTile: null, threw: false,
          regionPairs: [], pendingRegionDash: null, regionPairError: false
        };
      } catch (error) { failure('raf-entry', error); }
      const previous = current; current = row || null;
      try {
        const value = Reflect.apply(callback, this, args);
        if (row) row.completed = true;
        return value;
      } catch (error) { if (row) row.threw = true; throw error; }
      finally {
        try {
          if (row) {
            row.exit = state();
            // Drawing is deliberately NOT part of eligibility. Keep zero-draw
            // pixel frames: whole-frame/drawWorld returns must fail assertions.
            row.eligible = identity.name === 'frame'
              && identity.registeredAt.includes('/nishio-go/pixel.js:')
              && eligibleState(row.entry) && eligibleState(row.exit);
            if (row.pendingCapture) {
              if (row.eligible && row.completed && !row.threw
                && !audit.backgroundCaptures.some(c => c.f === row.f)) {
                audit.backgroundCaptures.push(row.pendingCapture);
                row.capturedBackground = true;
              }
              delete row.pendingCapture;
            }
            if (audit.frames.length < 2000) audit.frames.push(row); else audit.dropped++;
          }
        } catch (error) { failure('raf-exit', error); }
        finally { current = previous; }
      }
    }, ...rest]);
  };

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalGetTransform = CanvasRenderingContext2D.prototype.getTransform;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const result = Reflect.apply(originalGetContext, this, args);
    try {
      if (audit.active && args[0] === '2d' && this.id === 'pxCanvas' && result?.canvas === this && !contexts.has(result)) {
        contexts.add(result); audit.contextCount++;
        // Explicit capability-failure fixture, only on the target context.
        // Production HTML/pixel bytes and all drawing methods stay unchanged.
        if (patternMode === 'unavailable') { result.createPattern = undefined; audit.patternUnavailableContexts++; }
        for (const method of ['createPattern', 'drawImage', 'fillRect', 'fill', 'fillText', 'strokeText', 'setLineDash', 'stroke']) {
          const original = result[method];
          if (typeof original !== 'function') continue;
          result[method] = function (...paintArgs) {
            const target = audit.active && this === result, row = target && current;
            let patternFill = null;
            if (target && row && !row.boundarySeen && (method === 'fillRect' || method === 'fill')) {
              try {
                const provenance = patterns.get(this.fillStyle);
                if (provenance?.context === this) {
                  const m = Reflect.apply(originalGetTransform, this, []);
                  // The candidate uses one translated, axis-aligned fillRect.
                  // A zero-size substitute cannot satisfy coverage. The separate
                  // pre-region RGBA comparison also catches a clipped/blank fill.
                  const [x, y, w, h] = paintArgs;
                  const finite = [x, y, w, h].every(n => typeof n === 'number' && Number.isFinite(n));
                  const fullCanvas = method === 'fillRect' && finite && w > 0 && h > 0
                    && m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1
                    && Math.abs(x + m.e) < 1e-7 && Math.abs(y + m.f) < 1e-7
                    && w === this.canvas.width && h === this.canvas.height;
                  const mod = (v, T) => ((v % T) + T) % T;
                  patternFill = { method, fullCanvas, args: method === 'fillRect' ? paintArgs.slice() : [],
                    patternID: provenance.id, T: provenance.width, phase: [mod(m.e, provenance.width), mod(m.f, provenance.height)] };
                }
              } catch (error) { failure('pattern-fill-observation', error); }
            }
            if (target && row && method === 'setLineDash' && !row.boundarySeen
              && eligibleState(row.entry) && !audit.backgroundCaptures.some(c => c.f === row.f)) {
              try {
                // Exactly once per animation phase, BEFORE the native region
                // dash/stroke. No foreground drawing has occurred at this point.
                const width = this.canvas.width, height = this.canvas.height;
                const bytes = Reflect.apply(originalGetImageData, this, [0, 0, width, height]).data;
                let binary = '';
                for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
                const basis = row.patternFills[0] || row.firstFogTile;
                row.pendingCapture = { sequence: row.sequence, f: row.f, rafTimestamp: row.rafTimestamp,
                  width, height, T: basis?.T, phase: basis?.phase, rgbaBase64: btoa(binary) };
              } catch (error) { failure('pre-region-background-readback', error); }
            }
            let value;
            try { value = Reflect.apply(original, this, paintArgs); }
            catch (error) { if (target) audit.nativeThrows++; throw error; }
            if (target) {
              try {
                if (method === 'createPattern') {
                  if (value instanceof CanvasPattern) {
                    const id = audit.patternCreations.length + 1;
                    const width = paintArgs[0].width, height = paintArgs[0].height;
                    patterns.set(value, { context: this, id, width, height });
                    audit.patternCreations.push({ id, repeat: paintArgs[1], width, height, sequence: row?.sequence ?? null });
                  }
                } else if (!row) audit.outsideRAF++;
                else {
                  row.targetReturned++;
                  if (!row.firstTargetStack) row.firstTargetStack = new Error('first-target-native-return').stack || '';
                  if (method === 'setLineDash') {
                    if (!row.boundarySeen) {
                      row.boundarySeen = true;
                      row.firstBoundaryStack = new Error('first-region-dash').stack || '';
                      row.firstDash = Array.from(paintArgs[0]);
                    }
                    if (row.regionPairs.length < 2 * row.entry.regionRings) {
                      if (row.pendingRegionDash !== null) row.regionPairError = true;
                      row.pendingRegionDash = Array.from(paintArgs[0]);
                    }
                    row.dashReturned++;
                  } else if (method === 'stroke' && row.boundarySeen) {
                    row.strokeReturned++;
                    if (!row.firstRegionStrokeStack) row.firstRegionStrokeStack = new Error('first-region-stroke').stack || '';
                    if (row.regionPairs.length < 2 * row.entry.regionRings) {
                      const white = row.regionPairs.length % 2 === 1, dpr = row.entry.dpr;
                      const expectedDash = white ? [5 * dpr, 4 * dpr] : [];
                      const style = String(this.strokeStyle).replace(/\s/g, '');
                      const ok = JSON.stringify(row.pendingRegionDash) === JSON.stringify(expectedDash)
                        && style === (white ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.45)')
                        && Math.abs(this.lineWidth - (white ? 1.6 : 3.5) * dpr) < 1e-7;
                      row.regionPairs.push({ dash: row.pendingRegionDash, style, lineWidth: this.lineWidth, ok });
                      row.pendingRegionDash = null;
                    }
                  } else if (!row.boundarySeen && Object.hasOwn(row.prefix, method)) {
                    row.prefix[method]++;
                    if (patternFill) row.patternFills.push(patternFill);
                    if (method === 'drawImage' && paintArgs.length === 5 && paintArgs[0].width === 16
                      && paintArgs[0].height === 16 && paintArgs[3] === 4 && paintArgs[4] === 4) {
                      row.prefixFogTiles4++;
                      if (!row.firstFogTile) {
                        const mod = v => ((v % 4) + 4) % 4;
                        row.firstFogTile = { T: 4, phase: [mod(paintArgs[1]), mod(paintArgs[2])], firstTileXY: paintArgs.slice(1, 3) };
                      }
                    }
                  }
                }
              } catch (error) { failure('native-return-observation', error); }
            }
            return value;
          };
        }
      }
    } catch (error) { failure('getContext-observation', error); }
    return result;
  };
  audit.stop = () => { audit.active = false; return { ...audit, stop: undefined, final: state() }; };
}

(async () => {
  let browser, context, page, report, caught;
  const routes = { local: 0, leaflet: 0, blockedExternal: [], held: {}, errors: [], unexpectedResponses: [] };
  const pageErrors = [], heldRoutes = new Set();
  let closing = false, releaseHolds;
  const hold = new Promise(resolve => { releaseHolds = resolve; });
  try {
    for (const file of ['leaflet.js', 'leaflet.css']) localFile(leafRoot, file);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
    context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, reducedMotion, serviceWorkers: 'block' });
    await context.addInitScript(observe, patternMode);
    context.on('response', response => {
      const u = new URL(response.url());
      if (u.origin !== ORIGIN && !(u.origin === 'https://unpkg.com' && u.pathname.startsWith('/leaflet@1.9.4/dist/'))) routes.unexpectedResponses.push(u.href);
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      try {
        let base, relative;
        if (url.origin === ORIGIN) {
          base = root; relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
          // Hold these responses, not pixel.js/Leaflet. No source bytes change.
          if (['nishio-go/meiro.js', 'nishio-go/share.js', 'nishio-go/world.json'].includes(relative)) {
            routes.held[relative] = (routes.held[relative] || 0) + 1;
            heldRoutes.add(route); await hold; heldRoutes.delete(route);
            await route.abort('aborted'); return;
          }
          routes.local++;
        } else if (url.origin === 'https://unpkg.com' && url.pathname.startsWith('/leaflet@1.9.4/dist/')) {
          base = leafRoot; relative = decodeURIComponent(url.pathname.slice('/leaflet@1.9.4/dist/'.length));
          routes.leaflet++;
        } else {
          routes.blockedExternal.push(url.href); await route.abort('blockedbyclient'); return;
        }
        const file = localFile(base, relative);
        await route.fulfill({ status: 200, body: fs.readFileSync(file),
          contentType: TYPES[path.extname(file)] || 'application/octet-stream',
          headers: { 'access-control-allow-origin': '*' } });
      } catch (error) {
        if (!closing) routes.errors.push(String(error?.stack || error));
        await route.abort('failed').catch(() => {});
      }
    });
    page = await context.newPage(); page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(ORIGIN + '/nishio-go.html', { waitUntil: 'commit', timeout: 30000 });
    // Eligibility deliberately ignores the result under test. Three completed
    // zero-paint rows are enough to collect evidence, then FAIL below.
    await page.waitForFunction(() => {
      const a = window.__fogPatternAudit, rows = a?.frames.filter(f => f.eligible) || [];
      return rows.length >= 3 && (rows.some(f => !f.boundarySeen)
        || (a.backgroundCaptures.some(c => c.f === 0) && a.backgroundCaptures.some(c => c.f === 1)));
    },
      null, { polling: 100, timeout: 30000 });
    report = await page.evaluate(() => window.__fogPatternAudit.stop());
  } catch (error) {
    caught = String(error?.stack || error);
    if (page) report = await page.evaluate(() => window.__fogPatternAudit?.stop()).catch(() => null);
  } finally {
    // Keep all held responses unresolved until after the evidence is frozen.
    closing = true;
    releaseHolds();
    if (context) await context.close().catch(error => { caught = [caught, 'context.close: ' + error].filter(Boolean).join('\n'); });
    if (browser) await browser.close().catch(error => { caught = [caught, 'browser.close: ' + error].filter(Boolean).join('\n'); });
  }
  if (report) report.backgroundCaptures = report.backgroundCaptures.map(({ rgbaBase64, ...capture }) => {
    const rgba = Buffer.from(rgbaBase64, 'base64');
    return { ...capture, rgbaBytes: rgba.length, rgbaSHA256: crypto.createHash('sha256').update(rgba).digest('hex') };
  });
  if (report) report.backgroundAnimationFramesEqual = report.backgroundCaptures.length === 2
    ? report.backgroundCaptures[0].rgbaSHA256 === report.backgroundCaptures[1].rgbaSHA256 : null;
  const out = { reducedMotion, patternMode, sourceRoot: root, beforeHashes, afterHashes: sourceHashes(),
    routes, pageErrors, report, browserClosed: !!browser && !browser.isConnected(), error: caught || null };
  console.log(JSON.stringify(out));
  if (caught) process.exitCode = 1;
})().catch(error => { console.error(error?.stack || String(error)); process.exitCode = 1; });
"""


class NishioFogPatternBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results = {}
        for motion, pattern_mode in [("no-preference", "native"), ("reduce", "native"), ("no-preference", "unavailable")]:
            configured = os.environ.get("NISHIO_PATTERN_ROOT", Path(__file__).resolve().parent.parent)
            root = Path(configured).resolve()
            if not (root / "nishio-go.html").is_file():
                raise AssertionError("Missing real page: " + str(root))
            result = subprocess.run(
                ["node", "-e", BROWSER_JS, str(root), motion, pattern_mode], cwd=root,
                text=True, capture_output=True, timeout=80,
            )
            lines = result.stdout.strip().splitlines()
            if not lines:
                raise AssertionError("Browser fixture produced no JSON: " + result.stderr[-3000:])
            cls.results[(motion, pattern_mode)] = (result, json.loads(lines[-1]))

    def check_mode(self, motion, pattern_mode="native"):
        configured = os.environ.get("NISHIO_PATTERN_ROOT", Path(__file__).resolve().parent.parent)
        root = Path(configured).resolve()
        self.assertTrue((root / "nishio-go.html").is_file(), str(root))
        result, data = self.results[(motion, pattern_mode)]
        detail = json.dumps(data, ensure_ascii=False)
        self.assertEqual(result.returncode, 0, detail + result.stderr[-3000:])
        self.assertIsNone(data["error"], detail)
        self.assertTrue(data["browserClosed"], detail)
        self.assertEqual(data["beforeHashes"], data["afterHashes"], detail)
        self.assertEqual(data["beforeHashes"], self.results[("no-preference", "native")][1]["beforeHashes"], detail)
        self.assertEqual(data["routes"]["errors"], [], detail)
        self.assertEqual(data["routes"]["unexpectedResponses"], [], detail)
        self.assertGreaterEqual(data["routes"]["leaflet"], 2, detail)
        self.assertGreaterEqual(data["routes"]["held"].get("nishio-go/meiro.js", 0), 1, detail)
        self.assertGreaterEqual(data["routes"]["held"].get("nishio-go/world.json", 0), 1, detail)
        self.assertEqual(data["pageErrors"], [], detail)
        audit = data["report"]
        self.assertTrue(audit["storageInitiallyEmpty"], detail)
        self.assertFalse(audit["dcl"], detail)
        self.assertEqual(audit["errors"], [], detail)
        self.assertEqual(audit["dropped"], 0, detail)
        self.assertEqual(audit["nativeThrows"], 0, detail)
        self.assertEqual(audit["contextCount"], 1, detail)
        self.assertEqual(audit["patternUnavailableContexts"], 1 if pattern_mode == "unavailable" else 0, detail)
        frames = [f for f in audit["frames"] if f["eligible"]]
        self.assertGreaterEqual(len(frames), 3, detail)
        self.assertEqual(len({f["callback"]["id"] for f in frames}), 1, detail)
        for f in frames:
            with self.subTest(motion=motion, sequence=f["sequence"]):
                self.assertTrue(f["completed"], detail)
                self.assertFalse(f["threw"], detail)
                self.assertEqual(f["entry"]["motion"], motion == "reduce", detail)
                self.assertEqual(f["exit"]["motion"], motion == "reduce", detail)
                self.assertTrue(f["boundarySeen"], detail)
                self.assertIn("drawWorld", f["firstTargetStack"], detail)
                self.assertIn("/nishio-go/pixel.js:", f["firstTargetStack"], detail)
                self.assertEqual(f["firstDash"], [], detail)
                self.assertIn("drawWorld", f["firstBoundaryStack"], detail)
                self.assertIn("drawWorld", f["firstRegionStrokeStack"], detail)
                ring_count = f["entry"]["regionRings"]
                self.assertGreater(ring_count, 0, detail)
                self.assertEqual(f["exit"]["regionRings"], ring_count, detail)
                self.assertGreaterEqual(f["dashReturned"], 2 * ring_count, detail)
                self.assertGreaterEqual(f["strokeReturned"], 2 * ring_count, detail)
                self.assertEqual(len(f["regionPairs"]), 2 * ring_count, detail)
                self.assertFalse(f["regionPairError"], detail)
                self.assertTrue(all(pair["ok"] for pair in f["regionPairs"]), detail)
                # Decisive old518 RED: its unloaded-world prefix is thousands of
                # native drawImage calls, not a returned native pattern fill.
                # Foreground images after the boundary are intentionally free.
                if pattern_mode == "native":
                    self.assertLessEqual(f["prefix"]["drawImage"], 2, detail)
                    self.assertGreaterEqual(len(f["patternFills"]), 1, detail)
                    self.assertLessEqual(f["prefix"]["fillRect"] + f["prefix"]["fill"], 2, detail)
                    self.assertTrue(all(p["fullCanvas"] and p["T"] == 4 for p in f["patternFills"]), detail)
                else:
                    self.assertEqual(f["patternFills"], [], detail)
                    self.assertGreater(f["prefixFogTiles4"], 100, detail)
                    self.assertEqual(f["prefixFogTiles4"], f["prefix"]["drawImage"], detail)
        if pattern_mode == "native":
            self.assertTrue(audit["patternCreations"], detail)
            self.assertTrue(all(p["repeat"] == "repeat" and p["width"] == p["height"] == 4 for p in audit["patternCreations"]), detail)
        else:
            self.assertEqual(audit["patternCreations"], [], detail)
        captures = {c["f"]: c for c in audit["backgroundCaptures"]}
        self.assertEqual(set(captures), {0, 1}, detail)
        for capture in captures.values():
            self.assertEqual(capture["T"], 4, detail)
            self.assertEqual(capture["rgbaBytes"], capture["width"] * capture["height"] * 4, detail)
            self.assertGreater(capture["rgbaBytes"], 0, detail)
        return captures

    def test_unloaded_world_uses_pattern_and_keeps_regions_normal_and_reduced(self):
        self.check_mode("no-preference")
        self.check_mode("reduce")

    def test_pattern_unavailable_keeps_original_tiles_and_identical_background(self):
        normal = self.check_mode("no-preference")
        reduced = self.check_mode("reduce")
        fallback = self.check_mode("no-preference", "unavailable")
        for phase in (0, 1):
            for candidate in (normal[phase], reduced[phase]):
                with self.subTest(phase=phase, candidate=candidate):
                    # Absolute private ox/oy is not exposed. At this unloaded
                    # repeating background, actual phase modulo T determines
                    # the visible pixels; compare it before comparing RGBA.
                    for key in ("width", "height", "T", "phase", "rgbaBytes", "rgbaSHA256"):
                        self.assertEqual(candidate[key], fallback[phase][key], key)


if __name__ == "__main__":
    unittest.main()

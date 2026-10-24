// ricepia-flow の スクリプトが 使う 共通の したく：リポジトリの 場所、Leaflet（ネットに つながらない 所でも ゲームを 開く）、Chromium の 場所
// Leaflet は npm から --ignore-scripts で 取りだし、キャッシュの 中の 専用の フォルダに 広げる（取りだした パッケージは 信用しない：中の スクリプトは 動かさない）
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ricepia-flow');
const LEAFLET_VER = '1.9.4';   // nishio-go.html が unpkg から 読む 版と そろえる

function leafletDir() {
  if (process.env.LEAFLET_DIR && fs.existsSync(path.join(process.env.LEAFLET_DIR, 'leaflet.js'))) return process.env.LEAFLET_DIR;
  const base = path.join(CACHE, `leaflet-${LEAFLET_VER}`), dist = path.join(base, 'package', 'dist');
  if (fs.existsSync(path.join(dist, 'leaflet.js'))) return dist;
  fs.mkdirSync(base, { recursive: true });
  const tgz = execFileSync('npm', ['pack', `leaflet@${LEAFLET_VER}`, '--ignore-scripts', '--silent', '--pack-destination', base], { encoding: 'utf8' }).trim().split('\n').pop();
  execFileSync('tar', ['-xzf', path.join(base, tgz), '-C', base]);
  return dist;
}

function chromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const p = '/opt/pw-browsers/chromium';   // クラウドの 作業場所に 入っている Chromium（なければ Playwright の 既定）
  return fs.existsSync(p) ? p : '';
}

// 子プロセスに わたす 環境変数（tools/playtest.js が 読む もの）
function playEnv(extra = {}) {
  const env = { ...process.env, LEAFLET_DIR: leafletDir(), ...extra };
  const c = chromium();
  if (c) env.CHROMIUM = c;
  return env;
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

module.exports = { ROOT, CACHE, leafletDir, chromium, playEnv, git };

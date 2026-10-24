#!/usr/bin/env bash
# にしおさんぽGO の 通しプレイテスト（tools/playtest.js）を 回して、結果を 短く 出す。
# つかいかた：playtest.sh [見たい チェック名 ...]   例）playtest.sh mazePad mazeDots
#   出力は リポジトリの 外（$PLAYTEST_OUT か 一時フォルダ）。Leaflet は 1回だけ npm pack して $NISHIO_CACHE に おく。
#   終了コード：合格 0・不合格 1・動かせない 2
set -uo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
CACHE="${NISHIO_CACHE:-${HOME}/.cache/nishio-go}"
LF="$CACHE/leaflet/package/dist"
if [ ! -f "$LF/leaflet.js" ]; then
  mkdir -p "$CACHE/leaflet" && (cd "$CACHE/leaflet" && npm pack leaflet@1.9.4 --silent >/dev/null && tar xzf leaflet-1.9.4.tgz) || { echo "Leaflet を 用意できない（npm pack leaflet@1.9.4）" >&2; exit 2; }
fi
OUT="${PLAYTEST_OUT:-$(mktemp -d "${TMPDIR:-/tmp}/nishio-pt.XXXXXX")}"
mkdir -p "$OUT"
cd "$ROOT"
LEAFLET_DIR="$LF" NODE_PATH="$(npm root -g)" timeout "${PLAYTEST_TIMEOUT:-590}" node tools/playtest.js "$OUT" > "$OUT/playtest.log" 2>&1
code=$?
if [ ! -f "$OUT/playtest.json" ]; then
  echo "プレイテストが 最後まで 動かなかった（終了コード $code）。ログの おわり：" >&2
  tail -25 "$OUT/playtest.log" >&2
  exit 2
fi
node - "$OUT/playtest.json" "$@" <<'JS'
const [file, ...want] = process.argv.slice(2);
const j = JSON.parse(require('fs').readFileSync(file, 'utf8'));
const bad = Object.entries(j.checks || {}).filter(([, v]) => v && typeof v === 'object' && v.ok === false).map(([k]) => k);
console.log(`ok: ${j.ok}  failures: ${j.failures.length}  errors: ${(j.errors || []).length}`);
for (const f of j.failures) console.log(`  ✗ ${f}`);
for (const e of j.errors || []) console.log(`  ! ${typeof e === 'string' ? e : JSON.stringify(e)}`);
for (const k of [...new Set([...want, ...bad])]) console.log(`  ${k}: ${JSON.stringify(j.checks[k])}`);
console.log(`(くわしくは ${file})`);
process.exit(j.ok ? 0 : 1);
JS

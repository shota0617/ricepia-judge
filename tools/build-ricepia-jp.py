# ricepia.jp のトップページに「にしおさんぽGO」と「トラクターで田んぼを耕そう」のお知らせ欄を入れる
#   python3 tools/build-ricepia-jp.py [もとの index.html] [出力先]
#   （省略時は ricepia-jp/current.html → ricepia-jp/index.html）
# お知らせ欄（ricepia-jp/game-section.html・tractor-section.html）を、この順で「動画で見る らいすぴあ」の欄のすぐ上に入れる。
# すでに入っているときは、いったん取り除いてから入れ直す（何度実行しても1つずつだけになる）。
# 米づくり365 のお知らせ欄（<!-- kome365:start 〜 <!-- kome365:end -->）はこのリポジトリでは持たず、ページにあるものを
# そのまま取り出して、トラクターの欄のすぐ下（ゲームの3番め）に置きなおす（2026-10-24 店主指示）。
import os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'ricepia-jp')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'current.html')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'index.html')
ANCHOR = '<!-- ▼ 動画コーナー（ここから） -->'

html = open(src, encoding='utf-8').read()
sections = [open(os.path.join(ROOT, f), encoding='utf-8').read().strip() for f in ('game-section.html', 'tractor-section.html')]
kome365 = re.search(r'<!-- kome365:start.*?<!-- kome365:end -->', html, flags=re.S)
if kome365:
    sections.append(kome365.group(0).replace('トップの冒頭(にしおさんぽGOの上)に置く。', 'ゲームの3番め(トラクターの下)に置く(2026-10-24 店主指示で冒頭から移動)。'))
for mark in ('nishio-go', 'tractor', 'kome365'):
    html = re.sub(r'<!-- ' + mark + r':start.*?<!-- ' + mark + r':end -->\n?', '', html, flags=re.S)
if html.count(ANCHOR) != 1:
    sys.exit(f'「{ANCHOR}」が {html.count(ANCHOR)} か所あります（1か所のはず）。ページの作りが変わったので、入れる場所を見直してください')
html = html.replace(ANCHOR, '\n'.join(sections) + '\n' + ANCHOR)
with open(out, 'w', encoding='utf-8', newline='') as f:
    f.write(html)
print(f'{out}: {len(html.encode())} bytes')

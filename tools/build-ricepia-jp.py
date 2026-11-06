# ricepia.jp のトップページの「らいすぴあのゲーム」の並びに「ミシン糸 一本どり」のカードを入れる
#   python3 tools/build-ricepia-jp.py [もとの index.html] [出力先]
#   （省略時は ricepia-jp/current.html → ricepia-jp/index.html）
# カード（ricepia-jp/mishin-card.html）は、農産物検査ゲームのカードの すぐ前に入れる（運営者の 指示：2026-11-06「サイトの農産物検査ゲームの上に公開」）。
# すでに入っているときは、いったん取り除いてから入れ直す（何度実行しても1つだけになる）。
# 2026-11-05 に 店主の 指示で、にしおさんぽGO・トラクターの 大きな お知らせ欄は カードの 並びに まとめられた。
# なので 前の お知らせ欄（game-section.html・tractor-section.html）は もう 入れない（入れると 店主が 消した 欄が もどる）。
import os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'ricepia-jp')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'current.html')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'index.html')

html = open(src, encoding='utf-8').read()
card = open(os.path.join(ROOT, 'mishin-card.html'), encoding='utf-8').read().strip()
html = re.sub(r'[ \t]*<!-- mishin-card:start.*?<!-- mishin-card:end -->\n?', '', html, flags=re.S)

m = re.search(r'<!-- games-compact:start.*?<!-- games-compact:end -->', html, flags=re.S)
if not m:
    sys.exit('「らいすぴあのゲーム」の並び（<!-- games-compact:start 〜 end -->）が ありません。ページの作りが変わったので、入れる場所を見直してください')
games = m.group(0)
cards = [c for c in re.finditer(r'[ \t]*<article class="rp-games__card">.*?</article>', games, flags=re.S) if '農産物検査ゲーム' in c.group(0)]
if len(cards) != 1:
    sys.exit(f'農産物検査ゲームの カードが {len(cards)} 枚 あります（1枚の はず）。入れる場所を見直してください')
at = m.start() + cards[0].start()
html = html[:at] + card + '\n' + html[at:]
with open(out, 'w', encoding='utf-8', newline='') as f:
    f.write(html)
print(f'{out}: {len(html.encode())} bytes')

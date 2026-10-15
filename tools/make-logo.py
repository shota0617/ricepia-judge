# にしおさんぽGO のタイトルロゴ（ドット絵の SVG）を作る：python3 tools/make-logo.py
# 文字は 16px のビットマップフォント Unifont-JP を使い、太字・黒ふち・影を付けて <rect> だけで描く（<text> は使わない）。
# 西尾城（ゲームのドット絵と同じ）と抹茶の茶葉を添える。出力：nishio-go/logo.svg
import os
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/opentype/unifont/unifont_jp.otf'
OUT = os.path.join(os.path.dirname(__file__), '..', 'nishio-go', 'logo.svg')
font = ImageFont.truetype(FONT, 16)


def glyphs(text):
    """文字列を 16px の白黒ビットマップ（行の集合）にする"""
    w = int(font.getlength(text)) + 2
    img = Image.new('1', (w, 18), 0)
    ImageDraw.Draw(img).text((0, 0), text, font=font, fill=1)
    px = img.load()
    return {(x, y) for x in range(w) for y in range(18) if px[x, y]}


def bold(cells):
    return cells | {(x + 1, y) for x, y in cells}


def scale(cells, k):
    return {(x * k + i, y * k + j) for x, y in cells for i in range(k) for j in range(k)}


def shift(cells, dx, dy):
    return {(x + dx, y + dy) for x, y in cells}


def dilate(cells):
    return {(x + i, y + j) for x, y in cells for i in (-1, 0, 1) for j in (-1, 0, 1)}


def bbox(cells):
    xs, ys = [c[0] for c in cells], [c[1] for c in cells]
    return min(xs), min(ys), max(xs), max(ys)


canvas = {}   # (x, y) -> 色。あとから描いたものが上


def paint(cells, color):
    for c in cells:
        canvas[c] = color


# 1) 文字：16px のドットを2倍にして、横に1ドット太らせる（ぽ の丸などのすき間はつぶれない）
kana = bold(scale(glyphs('にしおさんぽ'), 2))
x0, y0, x1, y1 = bbox(kana)
kana = shift(kana, -x0, -y0)
kh = y1 - y0 + 1
go = bold(scale(glyphs('GO'), 3))   # GO は3倍で大きく
gx0, gy0, gx1, gy1 = bbox(go)
go = shift(go, -gx0, -gy0)
gh = gy1 - gy0 + 1

CASTLE_W = 34                      # 左に西尾城（2倍）
TOP = 6                            # 上の余白（茶葉と黒ふち）
base = TOP + gh                    # 文字の下端をそろえる
kana = shift(kana, CASTLE_W + 2, base - kh)
kx1 = bbox(kana)[2]
go = shift(go, kx1 + 6, base - gh)

# 2) 影（濃い緑）→ 黒ふち → 文字の色（上半分と下半分で2色）
letters = kana | go
outline = dilate(letters)
paint(shift(outline, 1, 1) | shift(outline, 2, 2) | shift(outline, 3, 3), '#14301c')
paint(outline, '#000000')
ky0, ky1 = bbox(kana)[1], bbox(kana)[3]
for x, y in kana:
    canvas[(x, y)] = '#fff3b0' if y <= ky0 + 1 else '#ffd54f' if y < (ky0 + ky1) / 2 else '#f2a516'
gy0b, gy1b = bbox(go)[1], bbox(go)[3]
for x, y in go:
    canvas[(x, y)] = '#ffffff' if y <= gy0b + 2 else '#8fd16f' if y < (gy0b + gy1b) / 2 else '#3f9b3c'

# 3) 西尾城（pixel.js の castle と同じドット絵）
PAL = {'k': '#000000', 'r': '#d23a2e', 'g': '#a8a8a8', 'G': '#686868', 'N': '#5d3a1a'}
CASTLE = ['................', '...r........r...', '...rr......rr...', '...k........k...', '..kgk.kkkk.kgk..', '..kgkkggggkkgk..',
          '..kgggGggGgggk..', '..kgGgggggggGk..', '..kggggkkggggk..', '..kgGgkNNkgGgk..', '..kggkNNNNkggk..', '..kgGkNNNNkGgk..',
          '..kggkNNNNkggk..', '..kkkkkkkkkkkk..', '................', '................']
cy = base - 28
for j, row in enumerate(CASTLE):
    for i, ch in enumerate(row):
        if ch in PAL:
            for a in (0, 1):
                for b in (0, 1):
                    canvas[(i * 2 + a, cy + j * 2 + b)] = PAL[ch]

# 4) 抹茶の茶葉（GO の右上）
LEAF = ['....kk', '..kkll', '.kllLk', 'kllLk.', 'klLk..', '.kk...']
lx = bbox(go)[2] - 6
for j, row in enumerate(LEAF):
    for i, ch in enumerate(row):
        if ch != '.':
            for a in (0, 1):
                for b in (0, 1):
                    canvas[(lx + i * 2 + a, j * 2 + b)] = {'k': '#000000', 'l': '#7cc04a', 'L': '#2f7a34'}[ch]

# 5) SVG に書き出す（同じ色が横に続くところを1本の横棒にし、色ごとに1つの path にまとめる）
mx, my, Mx, My = bbox(set(canvas))
W, H = Mx - mx + 1, My - my + 1
paths = {}
for y in range(my, My + 1):
    x = mx
    while x <= Mx:
        c = canvas.get((x, y))
        if not c:
            x += 1
            continue
        s = x
        while x + 1 <= Mx and canvas.get((x + 1, y)) == c:
            x += 1
        paths.setdefault(c, []).append(f'M{s - mx} {y - my}h{x - s + 1}v1h-{x - s + 1}z')
        x += 1
body = '\n'.join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in paths.items())
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W * 2}" height="{H * 2}" '
       f'shape-rendering="crispEdges" role="img" aria-label="にしおさんぽGO">\n'
       '<!-- にしおさんぽGO タイトルロゴ（tools/make-logo.py で生成。文字は Unifont-JP（SIL OFL）のビットマップから） -->\n'
       + body + '\n</svg>\n')
with open(OUT, 'w') as f:
    f.write(svg)
print(f'{OUT}: {W}x{H} px, {len(paths)} colors, {len(svg)} bytes')

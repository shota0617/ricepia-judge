# にしおさんぽGO のタイトルロゴ（ドット絵の SVG）を作る：python3 tools/make-logo.py
# 文字は 太い丸ゴシック M PLUS Rounded 1c Black（SIL OFL。tools/fonts/m-plus-rounded-1c/）を、ぼかさずに ドットで描き、
# 黒ふち・深い緑の影をつけて <rect> 相当の path だけで描く（<text> は使わない）。
# かなは お米の白 → 稲穂の金色、1文字ごとに 上下にずらして ころころ転がる感じに。
# GO の O は 主人公のお米（art/rice-logo.png の 口をあけた にっこり顔。ゲームと同じ絵）で、頭から 芽（ふた葉）が出ている。
# 大きさは前のロゴと同じ 272×40（2倍の 544×80 で表示。ricepia.jp・OGP・宣伝の画像も同じ大きさで読む）。出力：nishio-go/logo.svg
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
FONTS = os.path.join(HERE, 'fonts', 'm-plus-rounded-1c')
KANA_FONT = ImageFont.truetype(os.path.join(FONTS, 'm-plus-rounded-1c-119-900-normal.woff'), 34)   # ひらがな の入った分
LATIN_FONT = ImageFont.truetype(os.path.join(FONTS, 'm-plus-rounded-1c-latin-900-normal.woff'), 42)
RICE = os.path.join(HERE, '..', 'nishio-go', 'art', 'rice-logo.png')
OUT = os.path.join(HERE, '..', 'nishio-go', 'logo.svg')
W, H = 272, 40


def glyph(ch, font):
    """1文字を ぼかさずに 白黒のドットにして、左上を (0,0) にそろえた マスの集合を返す"""
    img = Image.new('1', (80, 80), 0)
    d = ImageDraw.Draw(img)
    d.fontmode = '1'
    d.text((10, 10), ch, font=font, fill=1)
    px = img.load()
    cells = {(x, y) for x in range(80) for y in range(80) if px[x, y]}
    return shift(cells, -min(x for x, _ in cells), -min(y for _, y in cells))


def shift(cells, dx, dy):
    return {(x + dx, y + dy) for x, y in cells}


def dilate(cells, r=1):
    return {(x + i, y + j) for x, y in cells for i in range(-r, r + 1) for j in range(-r, r + 1) if abs(i) + abs(j) <= r + (r > 1)}


def bbox(cells):
    xs, ys = [c[0] for c in cells], [c[1] for c in cells]
    return min(xs), min(ys), max(xs), max(ys)


canvas = {}   # (x, y) -> 色。あとから描いたものが上


def paint(cells, color):
    for c in cells:
        canvas[c] = color


# 1) かな：1文字ずつ並べ、上下に 2マスずつ ずらす（転がる お米のように はずむ）
BASE = 37                 # 文字の下の線
BOUNCE = [0, -2, 0, -2, 0, -2]
kana_cells, x = [], 3
for i, ch in enumerate('にしおさんぽ'):
    g = glyph(ch, KANA_FONT)
    gx0, gy0, gx1, gy1 = bbox(g)
    # 字の高さが ちがう（し・ん は低い）ので、下の線に そろえる。字と字の あいだは 1マス（ふちが くっついて ひとつながりに）
    g = shift(g, x, BASE - gy1 + BOUNCE[i])
    kana_cells.append(g)
    x = bbox(g)[2] + 3
kana = set().union(*kana_cells)

# 2) GO の G（大きめ・抹茶の緑）
G = glyph('G', LATIN_FONT)
gx0, gy0, gx1, gy1 = bbox(G)
G = shift(G, x + 2, BASE - gy1)
x = bbox(G)[2] + 3

# 3) 影（深い緑）→ 黒ふち（2マス）→ 文字の色
letters = kana | G
outline = dilate(letters, 2)
paint(shift(outline, 2, 2) | shift(outline, 1, 1), '#1f4d2b')
paint(outline, '#000000')
for cells in kana_cells:
    y0, y1 = bbox(cells)[1], bbox(cells)[3]
    for cx, cy in cells:
        t = (cy - y0) / max(1, y1 - y0)
        canvas[(cx, cy)] = '#ffffff' if t < 0.28 else '#fff4d6' if t < 0.55 else '#ffd978' if t < 0.8 else '#f2b23a'
y0, y1 = bbox(G)[1], bbox(G)[3]
for cx, cy in G:
    t = (cy - y0) / max(1, y1 - y0)
    canvas[(cx, cy)] = '#e9ffd6' if t < 0.2 else '#9bdc6b' if t < 0.5 else '#5cb043' if t < 0.8 else '#2f8a3a'

# 4) O：主人公のお米（rice-logo.png の 2行め1コマめ、32×32）。下の線を G と そろえ、影と黒ふちを足す
rice = Image.open(RICE).convert('RGBA').crop((0, 32, 32, 64))
rpx = rice.load()
rcells = {(i, j): '#%02x%02x%02x' % rpx[i, j][:3] for i in range(32) for j in range(32) if rpx[i, j][3] > 128}
rx0, ry0, rx1, ry1 = bbox(set(rcells))
ox, oy = x - rx0, BASE + 1 - ry1
rset = shift(set(rcells), ox, oy)
routline = dilate(rset, 1)
paint(shift(routline, 2, 2) | shift(routline, 1, 1), '#1f4d2b')
paint(routline - rset, '#000000')
for (i, j), c in rcells.items():
    canvas[(i + ox, j + oy)] = c

# 5) 芽（ふた葉）：お米の頭から
SPROUT = ['.kk...kk.', 'kllk.kLLk', 'klllkLLLk', '.kllkLLk.', '..kkskk..', '....s....', '....s....']
top = bbox(rset)[1]
sx = (bbox(rset)[0] + bbox(rset)[2]) // 2 - 4 + 2
for j, row in enumerate(SPROUT):
    for i, ch in enumerate(row):
        if ch != '.':
            canvas[(sx + i, top - len(SPROUT) + 1 + j)] = {'k': '#000000', 'l': '#9bdc6b', 'L': '#4fa83d', 's': '#2f7a34'}[ch]

# 6) 272×40 の まん中に置き、SVG に書き出す（同じ色が横に続くところを1本の横棒にし、色ごとに1つの path にまとめる）
mx, my, Mx, My = bbox(set(canvas))
assert Mx - mx + 1 <= W and My - my + 1 <= H, f'ロゴが大きすぎる：{Mx - mx + 1}×{My - my + 1}'
dx, dy = (W - (Mx - mx + 1)) // 2 - mx, (H - (My - my + 1)) // 2 - my
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
        paths.setdefault(c, []).append(f'M{s + dx} {y + dy}h{x - s + 1}v1h-{x - s + 1}z')
        x += 1
body = '\n'.join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in paths.items())
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W * 2}" height="{H * 2}" '
       f'shape-rendering="crispEdges" role="img" aria-label="にしおさんぽGO">\n'
       '<!-- にしおさんぽGO タイトルロゴ（tools/make-logo.py で生成。文字は M PLUS Rounded 1c（SIL OFL）、O は 主人公のお米 art/rice-logo.png） -->\n'
       + body + '\n</svg>\n')
with open(OUT, 'w') as f:
    f.write(svg)
print(f'{OUT}: {Mx - mx + 1}x{My - my + 1} px in {W}x{H}, {len(paths)} colors, {len(svg)} bytes')

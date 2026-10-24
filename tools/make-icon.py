# にしおさんぽGO のアイコン（ホーム画面・Google広告のロゴ）を作る：python3 tools/make-icon.py
# タイトルロゴ（tools/make-logo.py）の O と同じ 主人公のお米（art/rice-logo.png の 2行め1コマめ）と 芽（ふた葉）を、
# 前のアイコンと同じ 深い緑と クリーム色の上に、ドットのまま大きく描く。
# 「maskable」（丸や角丸に切り抜かれる）でも欠けないよう、絵は まん中の 8割の中に入れる。
# 出力：nishio-go/icon-512.png・icon-192.png
import os
from PIL import Image

HERE = os.path.dirname(__file__)
RICE = os.path.join(HERE, '..', 'nishio-go', 'art', 'rice-logo.png')
OUT = os.path.join(HERE, '..', 'nishio-go')
N = 44                      # ドットのマス（44×44）
BG, PLATE, SHADOW = '#2f5d3a', '#fff8e6', '#1f4d2b'


def dilate(cells, r=1):
    return {(x + i, y + j) for x, y in cells for i in range(-r, r + 1) for j in range(-r, r + 1) if abs(i) + abs(j) <= r}


def shift(cells, dx, dy):
    return {(x + dx, y + dy) for x, y in cells}


def bbox(cells):
    xs, ys = [c[0] for c in cells], [c[1] for c in cells]
    return min(xs), min(ys), max(xs), max(ys)


canvas = {}


def paint(cells, color):
    for c in cells:
        canvas[c] = color


# お米（ロゴと同じ絵）
rice = Image.open(RICE).convert('RGBA').crop((0, 32, 32, 64))
rpx = rice.load()
rcells = {(i, j): '#%02x%02x%02x' % rpx[i, j][:3] for i in range(32) for j in range(32) if rpx[i, j][3] > 128}
rset = set(rcells)
# 芽（ロゴと同じ形）。お米の頭の まん中から
SPROUT = ['.kk...kk.', 'kllk.kLLk', 'klllkLLLk', '.kllkLLk.', '..kkskk..', '....s....', '....s....']
top = bbox(rset)[1]
sx = (bbox(rset)[0] + bbox(rset)[2]) // 2 - 4 + 2
sprout = {(sx + i, top - len(SPROUT) + 1 + j): {'k': '#000000', 'l': '#9bdc6b', 'L': '#4fa83d', 's': '#2f7a34'}[ch]
          for j, row in enumerate(SPROUT) for i, ch in enumerate(row) if ch != '.'}

# 影（深い緑）→ 黒ふち → お米 → 芽
routline = dilate(rset, 1)
paint(shift(routline, 1, 1), SHADOW)
paint(routline - rset, '#000000')
for c, col in rcells.items():
    canvas[c] = col
for c, col in sprout.items():
    canvas[c] = col

# 44×44 の まん中へ
mx, my, Mx, My = bbox(set(canvas))
w, h = Mx - mx + 1, My - my + 1
assert w <= N * 0.8 and h <= N * 0.8, f'絵が大きすぎる：{w}×{h}'
dx, dy = (N - w) // 2 - mx, (N - h) // 2 - my
img = Image.new('RGB', (N, N), BG)
px = img.load()
# クリーム色の台（角を1マス落とした四角。丸く切り抜かれても まわりは深い緑）
for y in range(4, N - 4):
    for x in range(4, N - 4):
        if (x in (4, N - 5)) and (y in (4, N - 5)):
            continue
        px[x, y] = tuple(int(PLATE[k:k + 2], 16) for k in (1, 3, 5))
for (x, y), col in canvas.items():
    px[x + dx, y + dy] = tuple(int(col[k:k + 2], 16) for k in (1, 3, 5))

# ドットをぼかさずに拡大し、あまりは 地の色で うめる
for size in (512, 192):
    k = size // N
    big = img.resize((N * k, N * k), Image.NEAREST)
    out = Image.new('RGB', (size, size), BG)
    off = (size - N * k) // 2
    out.paste(big, (off, off))
    path = os.path.join(OUT, f'icon-{size}.png')
    out.save(path, optimize=True)
    print(f'{path}: 絵 {w}×{h} マス（{N}×{N} の中）、1マス {k}px')

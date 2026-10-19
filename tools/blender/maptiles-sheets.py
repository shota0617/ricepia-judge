# にしおさんぽGO：Blender で描いた地図のマス（tools/blender/maptiles.py の結果）に色をのせて、シートにまとめる
# - 家：50の立体 × 屋根の色10 × 壁の色5 ＝ 2500マス を、季節4つ（桜のころ・ふだん・紅葉のころ・冬）ぶん ＝ 10000マス
#   nishio-go/maptiles/house-<季節>.png：16×16 のマスが 50×50 に並ぶ。番号 i ＝ 立体 g × 50 ＋ 屋根 × 5 ＋ 壁（左上から右へ）
#   季節で変わるもの：庭木と植木の色（桜・紅葉）、地面にちる花びら・落ち葉・霜。どの季節のシートを使うかは nishio-go/pixel.js の mapSeason
# - 木（森のマス）：10の立体 × 葉の色3 ＝ 30マス を季節4つぶん。nishio-go/maptiles/tree-<季節>.png（30×2。下の段は風で葉がゆれた2コマ目）
# 使い方：python tools/blender/maptiles.py（bpy）→ python3 tools/blender/maptiles-sheets.py（numpy・Pillow）
import os
import random

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-maptiles')
OUT = os.path.join(HERE, '..', '..', 'nishio-go', 'maptiles')
N = 16


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tones(h, k=0.72, up=1.18):   # 影・ふつう・明るい
    r, g, b = rgb(h)
    dark = (int(r * k * 0.95), int(g * k * 0.97), int(min(255, b * k * 1.08)))
    light = tuple(min(255, int(c * up + 8)) for c in (r, g, b))
    return [dark, (r, g, b), light]


# 屋根の色10（いまの地図の6色 ＋ 赤茶・黒・銅の緑・朱）。壁の色5
ROOFS = ['#4f5763', '#8c3d2a', '#5d6c8c', '#6b5a4a', '#3f4a44', '#9a8f84', '#c86a3a', '#2e2e33', '#4f8a7a', '#b03a2e']
WALLS = ['#efe6d2', '#f6f4ee', '#d8c8a8', '#c8ccd0', '#a07850']
OUTLINE = rgb('#2a2420')
GROUND = {'jimen': '#cdbf9e', 'kusa': '#3f9b3c'}
# 地面にちらばる点：春は桜の花びら、夏はふつう、秋は落ち葉、冬は霜
SPECK = {
    'jimen': [['#b8aa88', '#ddd1b4', '#f7b6cc', '#fde0ea'], ['#b8aa88', '#ddd1b4'], ['#b8aa88', '#ddd1b4', '#c8641e', '#c99a1e'], ['#b8aa88', '#eeeae0', '#ffffff']],
    'kusa': [['#2f7f2e', '#56b552', '#f7b6cc'], ['#2f7f2e', '#56b552'], ['#2f7f2e', '#56b552', '#c8641e', '#c99a1e'], ['#3d7f3a', '#56915a', '#e8efe8']],
}
GROUND_BASE = {'jimen': ['#cdbf9e', '#cdbf9e', '#cbbb98', '#d2c8ae'], 'kusa': ['#43a03e', '#3f9b3c', '#4d9440', '#4f8a4a']}
# 庭木・森の葉の色：季節 × 3通り
LEAF = [
    ['#2e8a38', '#f2a9c4', '#1d6e2a'],   # 桜のころ：緑・桜・こい緑
    ['#1d5e26', '#2e7a30', '#24683a'],   # ふだん（草の色より こく）
    ['#c8641e', '#b03a24', '#c99a1e'],   # 秋：だいだい・赤・黄
    ['#2f5a2e', '#3d5a34', '#46633a'],   # 冬：くすんだ緑
]
FIXED = {
    'mado': '#86b8e0', 'to': '#5c4030', 'miki': '#5b3a1e', 'kuruma': '#d8dde2', 'kuro': '#2a2a2e', 'hachi': '#b86a3c', 'panel': '#2c3e66',
    'matsu': '#2a6a3a', 'sugi': '#2f5a34', 'iwa': '#8f8d88', 'take': '#7fae4a', 'takeha': '#5f9a3a',
}
CAR = ['#d8dde2', '#c0392b', '#2c5aa0', '#f2f2f2', '#2e2e33']
LEAFY = {'ki', 'yabu', 'matsu', 'sugi', 'takeha'}


def load(name):
    d = np.load(os.path.join(TMP, name + '.npz'))
    return d['mat'], d['band'], [str(x) for x in d['names']]


def color(mat, band, names, pal, rnd, ground, s, forest=False):
    """材質の番号と明るさの段に色をのせる。pal：材質の名前 → 色（#rrggbb）"""
    img = np.zeros((N, N, 3), np.uint8)
    gname = ground
    base = rgb(GROUND_BASE[gname][s])
    sp = [rgb(c) for c in SPECK[gname][s]]
    gi = names.index(gname) if gname in names else -1
    gmask = (mat == 255) | (mat == gi)
    for y in range(N):
        for x in range(N):
            if gmask[y, x]:
                c = base
                if rnd.random() < 0.09:
                    c = sp[rnd.randrange(len(sp))]
                if mat[y, x] != 255 and band[y, x] == 0:   # 家や木の影
                    c = tuple(int(v * 0.74) for v in c)
                img[y, x] = c
                continue
            n = names[mat[y, x]]
            t = tones(pal.get(n, FIXED.get(n, '#ff00ff')))
            img[y, x] = t[band[y, x]]
            if n == 'yane' and y % 2 == 1 and band[y, x] > 0:   # 瓦の段
                img[y, x] = tuple(int(v * 0.88) for v in img[y, x])
    # まわりのふちどり：家（地面と木の葉いがい）のまわりの地面を黒っぽく
    obj = ~gmask
    for n in LEAFY | {'miki', 'kuro', 'hachi'}:
        if n in names:
            obj &= mat != names.index(n)
    edge = np.zeros_like(obj)
    edge[1:] |= obj[:-1]
    edge[:-1] |= obj[1:]
    edge[:, 1:] |= obj[:, :-1]
    edge[:, :-1] |= obj[:, 1:]
    img[edge & gmask] = OUTLINE
    if forest:   # 森のマス：木のまわりを こい緑でふちどって、草の上でも木の形が分かるように
        tree = ~gmask
        e2 = np.zeros_like(tree)
        e2[1:] |= tree[:-1]
        e2[:-1] |= tree[1:]
        e2[:, 1:] |= tree[:, :-1]
        e2[:, :-1] |= tree[:, 1:]
        img[e2 & gmask] = rgb('#173d1c')
    return img


def sway(mat, names):
    """風で葉がゆれた2コマ目：葉の上半分を1つ右へ"""
    leaf = np.zeros_like(mat, bool)
    for n in LEAFY:
        if n in names:
            leaf |= mat == names.index(n)
    ys = np.where(leaf.any(axis=1))[0]
    if not len(ys):
        return mat.copy()
    out = mat.copy()
    top = ys[0] + (ys[-1] - ys[0]) // 2
    g = names.index('kusa') if 'kusa' in names else 255
    for y in range(ys[0], top + 1):
        row = mat[y].copy()
        lr = leaf[y]
        for x in range(N - 1, -1, -1):
            if lr[x]:
                if x + 1 < N:
                    out[y, x + 1] = row[x]
                if x == 0 or not lr[x - 1]:
                    out[y, x] = g
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    geos = [f'house-{a}-{e}-{f}' for a in range(5) for e in range(5) for f in range(2)]
    data = {g: load(g) for g in geos}
    seen = set()
    for s in range(4):
        sheet = Image.new('RGB', (50 * N, 50 * N))
        for gi, g in enumerate(geos):
            mat, band, names = data[g]
            for c in range(50):
                ri, wi = divmod(c, 5)
                rnd = random.Random(f'h{s}-{gi}-{c}')
                pal = {'yane': ROOFS[ri], 'kabe': WALLS[wi], 'ki': LEAF[s][(gi + c) % 3 if s != 1 else (gi + c) % 2],
                       'yabu': LEAF[s][(gi + c + 1) % 3], 'kuruma': CAR[(gi * 3 + c) % len(CAR)]}
                img = color(mat, band, names, pal, rnd, 'jimen', s)
                seen.add(img.tobytes())
                i = gi * 50 + c
                sheet.paste(Image.fromarray(img), ((i % 50) * N, (i // 50) * N))
        save(sheet, f'house-{s}.png')
        tsheet = Image.new('RGB', (30 * N, 2 * N))
        for k in range(10):
            mat, band, names = load(f'tree-{k}')
            mat2 = sway(mat, names)
            for v in range(3):
                pal = {'ki': LEAF[s][v], 'yabu': LEAF[s][(v + 1) % 3]}
                for fr, m in enumerate((mat, mat2)):
                    img = color(m, band, names, pal, random.Random(f't{s}-{k}-{v}'), 'kusa', s, forest=True)
                    tsheet.paste(Image.fromarray(img), ((k * 3 + v) * N, fr * N))
        save(tsheet, f'tree-{s}.png')
    print('家のマス（ちがう絵）:', len(seen), '/ 10000')


def save(im, name):
    cols = im.getcolors(256)   # 256色までなら色の数をへらさずパレットに（軽くなる）。こえたらそのまま
    q = im.quantize(colors=len(cols), method=Image.Quantize.MAXCOVERAGE) if cols else im
    if cols and np.array_equal(np.asarray(q.convert('RGB')), np.asarray(im)) is False:
        q = im
    q.save(os.path.join(OUT, name), optimize=True)
    print(name, os.path.getsize(os.path.join(OUT, name)))


if __name__ == '__main__':
    main()

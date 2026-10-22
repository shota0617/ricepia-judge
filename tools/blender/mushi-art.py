# にしおさんぽGO：イベントの虫・石・林の場所の絵を Blender で作り、ドット絵のシートに焼く
# - 虫の名前あて（mushi.js）の6ぴき・八ツ面山の昆虫さがし（yatsumushi.js）の14ひき・雲母石を探せ（kirara.js）の石と雲母石・林の5つの場所
# - 虫の形と色は、本の写真をなぞらず、かたち（カブト・クワガタ・オサムシ・ゴミムシ・シデムシ・コガネ・丸い虫）と、
#   名前や本文にある見た目（ミスジ＝3本のすじ・ムツボシ＝6つの星・赤銅色・セアカ・キイロ など）だけで作る。mushi.js・yatsumushi.js の手描きの絵と同じ決め方
# - 雲母石は、銀色の うすい六角の板が重なった石。ほかの石は、場所ごとの色（kirara.js の tone）で4つの形
# - pixel-art.py と同じ焼き方（Cycles で4倍に描く→材質ごとに3色→黒いふちどり）。できたシートは nishio-go/art/ev/ に
#     bugs.png（32×32 を横に20こ。並びは BUGS）・stones.png（24×24。場所3つ×4形＋雲母石）・places.png（32×32 を5こ）
# 使い方：python tools/blender/mushi-art.py （ぜんぶ）／ python tools/blender/mushi-art.py bugs （シートひとつ）
import importlib.util
import math
import os
import random
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)
bpy, bmesh = pa.bpy, pa.bmesh
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
OUT = os.path.join(pa.ROOT, 'nishio-go', 'art', 'ev')

pa.MATS.update({
    'bLeg': '#3a2e26', 'mYellow': '#efd25a', 'mBlack': '#25272b', 'mBrown': '#6b3b1e', 'mDot': '#ecd59a', 'mGray': '#8f948c',
    'mBlackR': '#1f1b19', 'mSame': '#7d5c33', 'mSameD': '#4f3a1f', 'mKubi': '#3a2a22', 'mHead': '#c97a3c',
    'yKobu': '#4b4741', 'yCopper': '#9a5232', 'yRed': '#b8442e', 'yAo': '#3c4a3a', 'yKubi': '#4a3a32', 'yArame': '#3b302a',
    'yShide': '#2b2b2b', 'yKabuto': '#5a3220', 'yKuwa': '#2e2622', 'yHira': '#26241f', 'yAka': '#3a1f1a', 'yAkaS': '#c0392b', 'yKiiro': '#c9a04a',
    'ishiA': '#8a7356', 'ishiB': '#8d9190', 'ishiC': '#93918a', 'unmo': '#c9ced3', 'unmoL': '#e9ecef', 'unmoD': '#9aa2aa',
    'tsuchi': '#7a5a3a', 'ochiba': '#c08a3a', 'ochibaR': '#b5522a', 'kusa': '#4f8a2e', 'kusaL': '#7ab04a', 'miki': '#6b4a2e', 'jueki': '#c98a1e',
    'kinoko': '#c0a070', 'kinokoW': '#e8dcc0', 'ha': '#3f7a32', 'haL': '#5a9a44',
})


# ---------- 虫の部品 ----------
def legs(cx, y0, y1, half_w, mat='bLeg', reach=0.16, r=0.018):
    """左右に3本ずつの足（体のわきから外へ、前の足は前へ・うしろの足はうしろへ）"""
    for i, y in enumerate((y0, (y0 + y1) / 2, y1)):
        dy = (1 - i) * 0.10
        for s in (-1, 1):
            a = (cx + s * half_w * 0.8, y, 0.03)
            b = (cx + s * (half_w + reach), y + dy, 0.0)
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.05)
            pa.tube(f'leg{i}{s}', mat, [a, mid, b], r)


def antennae(y, spread=0.10, length=0.20, mat='bLeg', r=0.014):
    for s in (-1, 1):
        pa.tube(f'ant{s}', mat, [(s * 0.03, y, 0.06), (s * spread * 0.6, y + length * 0.6, 0.06), (s * spread, y + length, 0.05)], r)


def bug(body, length=0.62, width=0.42, pron=None, pron_w=None, pron_l=0.16, head=None, head_r=0.08, neck=0.0, flat=1.0, gloss=False,
        stripes=None, dots=None, bumps=None, striae=None, spots=None, horn=False, jaws=0.0, ant=True):
    """虫：うしろの羽（だ円）・前胸（pron）・頭。上から見て頭が上"""
    by = -0.10
    sphere('elytra', body, 1.0, (0, by, 0.10 * flat), (width / 2, length / 2, 0.14 * flat))
    if stripes:   # すじ（たて）
        for i, x in enumerate(stripes):
            box(f'st{i}', 'mBlack', (0.05, length * 0.78, 0.04), (x * width / 2, by - 0.02, 0.21 * flat))
    if striae:    # こまかい たてみぞ
        for i in range(-2, 3):
            box(f'sr{i}', striae, (0.018, length * 0.75, 0.02), (i * width * 0.17, by, 0.235 * flat))
    if dots:      # うすい色の てん
        for i, (x, y) in enumerate(dots):
            sphere(f'dot{i}', 'mDot', 0.035, (x * width / 2, by + y * length / 2, 0.22 * flat))
    if spots:     # 赤い紋
        for i, (x, y) in enumerate(spots):
            sphere(f'spot{i}', 'yAkaS', 0.045, (x * width / 2, by + y * length / 2, 0.21 * flat))
    if bumps:     # ざらざら・こぶ
        rnd = random.Random(7)
        for i in range(bumps):
            x, y = rnd.uniform(-0.75, 0.75), rnd.uniform(-0.8, 0.75)
            if x * x + y * y < 0.8:
                sphere(f'bm{i}', body + 'D' if body + 'D' in pa.MATS else 'mSameD', 0.026, (x * width / 2, by + y * length / 2, 0.20 * flat))
    if gloss:
        sphere('gl', 'unmoL', 0.03, (width * 0.18, by + length * 0.22, 0.24 * flat))
    py = by + length / 2 + pron_l / 2 - 0.02
    pw = pron_w if pron_w is not None else width * 0.78
    sphere('pron', pron or body, 1.0, (0, py, 0.09 * flat), (pw / 2, pron_l / 2, 0.10 * flat))
    hy = py + pron_l / 2 + neck + head_r * 0.7
    if neck:
        cyl('neck', pron or body, 0.035, neck + 0.04, (0, py + pron_l / 2 + neck / 2, 0.07), (math.radians(90), 0, 0), 12)
    sphere('head', head or pron or body, head_r, (0, hy, 0.07 * flat), (1, 0.9, 0.7))
    if horn:      # カブトの角（前へのびて、先が上へ）
        pa.tube('horn', body, [(0, hy, 0.10), (0, hy + 0.14, 0.14), (0, hy + 0.24, 0.22)], 0.03)
        sphere('horntip', body, 0.04, (0, hy + 0.25, 0.23), (1.6, 0.8, 0.6))
    if jaws:      # クワガタの大あご（外へひらいて、先が内へ）
        for s in (-1, 1):
            pa.tube(f'jaw{s}', body, [(s * 0.04, hy + 0.04, 0.07), (s * 0.12, hy + jaws * 0.55, 0.07), (s * 0.05, hy + jaws, 0.07)], 0.026)
    legs(0, by + length * 0.30, by - length * 0.28, width / 2)
    if ant and not horn and not jaws:
        antennae(hy + head_r * 0.6)
    return dict(target=(0, 0.02, 0.05), scale=1.15, el=78, az=0, size=32)


# 並びは mushi.js の BUGS → yatsumushi.js の BUGS（JS の BUG_SHEET と同じ）
BUGS = [
    ('misuji', lambda: bug('mYellow', 0.56, 0.52, pron='mHead', stripes=(-0.5, 0, 0.5))),
    ('mutsuboshi', lambda: bug('mBrown', 0.46, 0.34, dots=((-0.5, 0.4), (0.5, 0.4), (-0.5, -0.05), (0.5, -0.05), (-0.35, -0.5), (0.35, -0.5)), gloss=True)),
    ('haiiro', lambda: bug('mGray', 0.62, 0.40)),
    ('oomaru', lambda: bug('mBlackR', 0.66, 0.64, gloss=True)),
    ('samehada', lambda: bug('mSame', 0.54, 0.50, bumps=40)),
    ('kubinaga', lambda: bug('mKubi', 0.50, 0.26, pron_w=0.12, pron_l=0.10, neck=0.16, head_r=0.06)),
    ('hime-kobusuji', lambda: bug('yKobu', 0.52, 0.42, bumps=30)),
    ('mikawa-osamushi', lambda: bug('yCopper', 0.62, 0.36, pron_w=0.24, striae='mBlackR')),
    ('ookurotsuya', lambda: bug('mBlack', 0.60, 0.34, pron_w=0.28, gloss=True, flat=0.7)),
    ('seaka', lambda: bug('mBlack', 0.58, 0.34, pron='yRed', pron_w=0.28, flat=0.7)),
    ('atowa', lambda: bug('yAo', 0.56, 0.32, pron_w=0.26, flat=0.7)),
    ('kubiboso', lambda: bug('yKubi', 0.52, 0.30, pron_w=0.12, pron_l=0.14, head_r=0.06)),
    ('arame', lambda: bug('yArame', 0.58, 0.30, pron_w=0.24, flat=0.8)),
    ('oohiratashide', lambda: bug('yShide', 0.62, 0.52, pron_w=0.40, flat=0.45, striae='mBlackR')),
    ('kabuto', lambda: bug('yKabuto', 0.62, 0.48, pron_w=0.42, pron_l=0.20, head_r=0.07, horn=True, gloss=True)),
    ('kokuwa', lambda: bug('yKuwa', 0.50, 0.36, pron_w=0.34, head_r=0.08, jaws=0.16)),
    ('hiratakuwa', lambda: bug('yHira', 0.58, 0.42, pron_w=0.40, head_r=0.10, jaws=0.22, flat=0.7)),
    ('chibikuwa', lambda: bug('yKuwa', 0.40, 0.28, pron_w=0.26, head_r=0.06, jaws=0.10)),
    ('kinoko-akamaru', lambda: bug('yAka', 0.48, 0.48, pron_w=0.36, spots=((-0.45, 0.25), (0.45, 0.25), (-0.4, -0.35), (0.4, -0.35)), gloss=True)),
    ('kiiro-atokiri', lambda: bug('yKiiro', 0.50, 0.32, pron_w=0.22, flat=0.6)),
]


# ---------- 石 ----------
def rock(mat, seed):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.4, location=(0, 0, 0.18))
    o = bpy.context.object
    rnd = random.Random(seed)
    sx, sy, sz = rnd.uniform(0.9, 1.25), rnd.uniform(0.7, 1.0), rnd.uniform(0.5, 0.7)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for v in bm.verts:
        k = 1 + rnd.uniform(-0.12, 0.12)
        v.co.x *= sx * k
        v.co.y *= sy * k
        v.co.z *= sz * k
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.append(pa.material(mat))
    return dict(target=(0, 0, 0.12), scale=1.15, el=35, az=-25, size=24)


def mica():
    """雲母石：うすい六角の板が重なった石（銀色）"""
    rnd = random.Random(3)
    for i in range(7):
        mat = ('unmo', 'unmoL', 'unmoD')[i % 3]
        o = cyl(f'p{i}', mat, 0.34 - i * 0.02, 0.045, (rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), 0.03 + i * 0.045), (0, 0, rnd.uniform(0, 1)), 6)
        o.rotation_euler = (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), rnd.uniform(0, 1))
    return dict(target=(0, 0, 0.14), scale=1.0, el=35, az=-25, size=24)


STONES = [(f'{t}{k}', (lambda m=m, k=k: rock(m, k * 11 + 5))) for t, m in (('a', 'ishiA'), ('b', 'ishiB'), ('c', 'ishiC')) for k in range(4)] + [('mica', mica)]


# ---------- 林の場所 ----------
def place_ground():
    box('tsuchi', 'tsuchi', (0.9, 0.9, 0.08), (0, 0, 0.04))
    rnd = random.Random(2)
    for i in range(14):
        box(f'ha{i}', 'ochiba' if i % 3 else 'ochibaR', (0.12, 0.07, 0.02), (rnd.uniform(-0.36, 0.36), rnd.uniform(-0.36, 0.36), 0.09), (0, 0, rnd.uniform(0, 3)))
    return dict(target=(0, 0, 0.05), scale=1.25, el=45, az=-25, size=32)


def place_grass():
    box('tsuchi', 'tsuchi', (0.9, 0.9, 0.06), (0, 0, 0.03))
    rnd = random.Random(4)
    for i in range(40):
        h = rnd.uniform(0.2, 0.45)
        box(f'k{i}', 'kusa' if i % 3 else 'kusaL', (0.035, 0.035, h), (rnd.uniform(-0.38, 0.38), rnd.uniform(-0.38, 0.38), h / 2 + 0.05), (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0))
    return dict(target=(0, 0, 0.2), scale=1.3, el=30, az=-25, size=32)


def place_sap():
    cyl('miki', 'miki', 0.2, 1.1, (0, 0, 0.55), verts=16)
    sphere('jueki', 'jueki', 0.07, (0, -0.19, 0.6), (1, 0.6, 1.4))
    pa.tube('tare', 'jueki', [(0, -0.2, 0.55), (0.01, -0.205, 0.45), (0, -0.2, 0.38)], 0.025)
    return dict(target=(0, 0, 0.5), scale=1.25, el=20, az=-20, size=32)


def place_log():
    cyl('log', 'miki', 0.16, 0.9, (0, 0, 0.16), (0, math.radians(90), 0.3), 16)
    for i, (x, y) in enumerate(((-0.2, -0.12), (0.05, -0.08), (0.22, -0.02))):
        cyl(f'e{i}', 'kinokoW', 0.025, 0.08, (x, y, 0.32), verts=8)
        sphere(f'c{i}', 'kinoko', 0.08, (x, y, 0.36), (1, 1, 0.45))
    return dict(target=(0, 0, 0.2), scale=1.15, el=30, az=-20, size=32)


def place_tree():
    cyl('miki', 'miki', 0.08, 0.5, (0, 0, 0.25), verts=12)
    for i, (x, y, z, r) in enumerate(((0, 0, 0.62, 0.32), (-0.18, 0.02, 0.55, 0.2), (0.18, 0.0, 0.56, 0.21), (0, 0.05, 0.82, 0.2))):
        sphere(f'ha{i}', 'ha' if i % 2 == 0 else 'haL', r, (x, y, z))
    return dict(target=(0, 0, 0.5), scale=1.25, el=25, az=-20, size=32)


PLACES = [('ground', place_ground), ('grass', place_grass), ('sap', place_sap), ('log', place_log), ('tree', place_tree)]
SHEETS = {'bugs': BUGS, 'stones': STONES, 'places': PLACES}


def bake(fn, tag):
    sc = pa.setup_scene()
    opts = fn()
    n = opts.get('size', 32)
    sc.render.resolution_x = sc.render.resolution_y = n * pa.SS
    pa.add_camera_light(sc, opts['target'], opts['scale'], opts.get('el', 28), opts.get('az', -35))
    os.makedirs(pa.TMP, exist_ok=True)
    names = pa.set_materials('id')
    ids = pa.render(sc, os.path.join(pa.TMP, f'ev-{tag}-id.png'), 1)
    pa.set_materials('light')
    light = pa.render(sc, os.path.join(pa.TMP, f'ev-{tag}-light.png'), 64)
    return pa.to_pixel(light, ids, names, n)


def save_sheet(arrs, path):
    n = arrs[0].shape[0]
    sheet = np.zeros((n, n * len(arrs), 4), dtype=np.uint8)
    for i, a in enumerate(arrs):
        sheet[:, i * n:(i + 1) * n] = a
    h, w = sheet.shape[:2]
    img = bpy.data.images.new('sheet', w, h, alpha=True)
    img.pixels[:] = (sheet[::-1].astype(np.float32) / 255).ravel()
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    os.makedirs(OUT, exist_ok=True)
    for name in args or SHEETS:
        arrs = [bake(fn, f'{name}-{tag}') for tag, fn in SHEETS[name]]
        p = os.path.join(OUT, f'{name}.png')
        save_sheet(arrs, p)
        print('wrote', os.path.relpath(p, pa.ROOT), len(arrs))

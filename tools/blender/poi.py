# にしおさんぽGO：歩く地図の「街並みの目印」（コンビニ・スーパー・病院・学校など17種類）を Blender で作り、32×32 のドット絵に焼く
# - 名前のあるお店や施設（nishio-go/landmarks.json）を描く絵。看板の文字やお店のマークは描かない（どのお店にも使えるふつうの形）
# - できた絵は1枚のシート nishio-go/art/poi.png（32×32 が横に並ぶ。並びは下の KINDS ＝ pixel.js の POI_ORDER）
# 使い方：python tools/blender/poi.py
import importlib.util
import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
TMPD = os.path.join(pa.TMP, 'poi')
pa.OUT = TMPD
KINDS = ['townhall', 'hospital', 'school', 'library', 'police', 'fire', 'post', 'shop', 'konbini', 'super', 'home', 'drug', 'fuel', 'bank', 'food', 'cafe', 'station']

pa.MATS.update({'tWall': '#f2efe8', 'tRoof': '#7a8088', 'tGlass': '#7fb8e0', 'tRed': '#d23a2e', 'tGreen': '#3a9a5a', 'tBlue': '#2f74b8',
                'tOrange': '#e8781e', 'tBrown': '#8a5a3a', 'tStone': '#c8c0b0', 'tAsph': '#7a7c80', 'tLine': '#f4f4f0', 'tYellow': '#f2c230',
                'tBrick': '#a8583a', 'tCream': '#efe2c0', 'tDark': '#3a3a3a', 'tTree': '#4f9a3e'})


def ground(mat='tAsph', w=1.0, d=0.8):
    box('ground', mat, (w, d, 0.03), (0, 0, -0.015))


def windows(prefix, x0, x1, y, z0, rows, rh, cols, mat='tGlass'):
    for r in range(rows):
        for c in range(cols):
            box(f'{prefix}{r}{c}', mat, ((x1 - x0) / cols * 0.6, 0.012, rh * 0.5), (x0 + (c + 0.5) * (x1 - x0) / cols, y, z0 + (r + 0.5) * rh))


def store(band, w=0.7, d=0.45, h=0.26, parking=True):
    """平屋のお店（大きなガラス・色の帯・駐車場の白線）"""
    ground()
    if parking:
        for i in range(5):
            box(f'pk{i}', 'tLine', (0.01, 0.14, 0.006), (-0.32 + i * 0.16, -0.30, 0.003))
    box('tate', 'tWall', (w, d, h), (0, 0.12, h / 2))
    box('band', band, (w + 0.004, d + 0.004, 0.06), (0, 0.12, h - 0.03))
    box('roof', 'tRoof', (w - 0.03, d - 0.03, 0.012), (0, 0.12, h + 0.006))   # 屋上（帯の色が屋根に出ないように）
    box('glass', 'tGlass', (w * 0.7, 0.012, h * 0.45), (0, 0.12 - d / 2 - 0.004, h * 0.27))
    box('door', 'tDark', (0.08, 0.014, h * 0.45), (w * 0.2, 0.12 - d / 2 - 0.006, h * 0.27))


def m_townhall():
    ground('tStone')
    box('tate', 'tWall', (0.70, 0.40, 0.40), (0, 0.12, 0.20))
    windows('m', -0.32, 0.32, -0.081, 0.04, 4, 0.09, 6)
    box('to', 'tWall', (0.16, 0.16, 0.22), (0, 0.12, 0.51))
    cyl('tokei', 'tLine', 0.05, 0.02, (0, 0.035, 0.54), (math.pi / 2, 0, 0), 16)
    box('toY', 'tRoof', (0.18, 0.18, 0.03), (0, 0.12, 0.635))
    cyl('pole', 'tRoof', 0.008, 0.36, (-0.42, -0.25, 0.18), verts=6)
    box('flag', 'tRed', (0.08, 0.005, 0.05), (-0.38, -0.25, 0.33))
    return dict(target=(0, 0, 0.26), scale=1.2, size=32)


def m_hospital():
    ground()
    box('tate', 'tWall', (0.66, 0.40, 0.46), (0, 0.12, 0.23))
    windows('m', -0.30, 0.30, -0.081, 0.04, 4, 0.10, 5)
    box('crossV', 'tRed', (0.05, 0.02, 0.16), (0.22, -0.09, 0.56))
    box('crossH', 'tRed', (0.16, 0.02, 0.05), (0.22, -0.09, 0.56))
    box('sign', 'tLine', (0.20, 0.015, 0.20), (0.22, -0.08, 0.56))
    box('genkan', 'tWall', (0.20, 0.10, 0.02), (-0.15, -0.13, 0.12))
    return dict(target=(0, 0, 0.28), scale=1.2, size=32)


def m_school():
    ground('tBrown')
    box('tate', 'tCream', (0.86, 0.26, 0.34), (0, 0.20, 0.17))
    windows('m', -0.40, 0.40, 0.068, 0.03, 3, 0.10, 8)
    box('to', 'tCream', (0.14, 0.27, 0.42), (0, 0.20, 0.21))
    cyl('tokei', 'tLine', 0.045, 0.02, (0, 0.06, 0.36), (math.pi / 2, 0, 0), 16)
    for dx in (-0.3, 0.3):
        box(f'goal{dx}', 'tLine', (0.012, 0.08, 0.06), (dx, -0.25, 0.03))
    return dict(target=(0, 0, 0.18), scale=1.2, size=32)


def m_library():
    ground('tStone')
    box('tate', 'tBrick', (0.66, 0.40, 0.30), (0, 0.12, 0.15))
    windows('m', -0.28, 0.28, -0.081, 0.04, 2, 0.12, 4, 'tCream')
    pa.cyl('yane', 'tRoof', 0.50, 0.14, (0, 0.12, 0.37), (0, 0, math.pi / 4), 4, r2=0.30)
    box('hon', 'tBlue', (0.10, 0.02, 0.12), (0, -0.095, 0.16))
    box('honP', 'tLine', (0.01, 0.022, 0.12), (0, -0.096, 0.16))
    return dict(target=(0, 0, 0.2), scale=1.15, size=32)


def m_police():
    ground()
    box('koban', 'tWall', (0.40, 0.32, 0.28), (0, 0.06, 0.14))
    box('yane', 'tRoof', (0.46, 0.38, 0.04), (0, 0.06, 0.30))
    cyl('lamp', 'tRed', 0.04, 0.06, (0, -0.06, 0.35), verts=12)
    box('door', 'tGlass', (0.14, 0.012, 0.16), (0, -0.105, 0.08))
    box('band', 'tBlue', (0.402, 0.322, 0.03), (0, 0.06, 0.22))
    return dict(target=(0, 0, 0.18), scale=1.0, size=32)


def m_fire():
    ground()
    box('tate', 'tWall', (0.62, 0.40, 0.30), (0.06, 0.12, 0.15))
    box('garage', 'tDark', (0.40, 0.012, 0.18), (0.0, -0.08, 0.09))
    box('truck', 'tRed', (0.30, 0.16, 0.12), (0.0, -0.18, 0.07), bevel=0.02)
    box('truckM', 'tGlass', (0.08, 0.162, 0.05), (-0.12, -0.18, 0.10))
    box('to', 'tRed', (0.10, 0.10, 0.50), (-0.34, 0.20, 0.25))
    box('toY', 'tRoof', (0.14, 0.14, 0.03), (-0.34, 0.20, 0.515))
    return dict(target=(0, 0, 0.22), scale=1.15, size=32)


def m_post():
    store('tRed', w=0.6, d=0.38, h=0.26, parking=False)
    cyl('post', 'tRed', 0.04, 0.14, (-0.36, -0.20, 0.07), verts=12)
    box('postT', 'tRed', (0.09, 0.09, 0.02), (-0.36, -0.20, 0.15))
    return dict(target=(0, 0, 0.14), scale=1.0, size=32)


def m_shop():
    ground('tStone')
    box('tate', 'tCream', (0.46, 0.34, 0.34), (0, 0.10, 0.17))
    box('yane', 'tRoof', (0.50, 0.38, 0.04), (0, 0.10, 0.36))
    box('awning', 'tGreen', (0.44, 0.10, 0.02), (0, -0.10, 0.20), (math.radians(-20), 0, 0))
    box('glass', 'tGlass', (0.32, 0.012, 0.12), (0, -0.075, 0.09))
    return dict(target=(0, 0, 0.18), scale=1.0, size=32)


def m_konbini():
    store('tGreen')
    box('band2', 'tOrange', (0.706, 0.456, 0.02), (0, 0.12, 0.19))
    return dict(target=(0, 0, 0.12), scale=1.15, size=32)


def m_super():
    store('tRed', w=0.86, d=0.50, h=0.30)
    for i in range(3):
        box(f'cart{i}', 'tLine', (0.04, 0.06, 0.04), (-0.38 + i * 0.05, -0.18, 0.02))
    return dict(target=(0, 0, 0.14), scale=1.25, size=32)


def m_home():
    store('tOrange', w=0.86, d=0.52, h=0.34)
    box('yard', 'tTree', (0.16, 0.10, 0.04), (0.36, -0.20, 0.02))
    return dict(target=(0, 0, 0.15), scale=1.25, size=32)


def m_drug():
    store('tBlue', w=0.74, d=0.46, h=0.26)
    box('band2', 'tYellow', (0.746, 0.466, 0.02), (0, 0.12, 0.19))
    return dict(target=(0, 0, 0.12), scale=1.15, size=32)


def m_fuel():
    ground()
    for dx in (-0.25, 0.25):
        for dy in (-0.15, 0.10):
            box(f'p{dx}{dy}', 'tLine', (0.03, 0.03, 0.26), (dx, dy, 0.13))
    box('canopy', 'tRed', (0.70, 0.40, 0.05), (0, -0.02, 0.285))
    box('canopyW', 'tLine', (0.702, 0.402, 0.015), (0, -0.02, 0.26))
    for dx in (-0.12, 0.12):
        box(f'pump{dx}', 'tYellow', (0.06, 0.05, 0.12), (dx, -0.02, 0.06))
    box('shop', 'tWall', (0.26, 0.18, 0.18), (0.30, 0.28, 0.09))
    return dict(target=(0, 0, 0.15), scale=1.15, size=32)


def m_bank():
    ground('tStone')
    box('tate', 'tStone', (0.62, 0.38, 0.32), (0, 0.12, 0.16))
    for i in range(4):
        cyl(f'col{i}', 'tLine', 0.025, 0.26, (-0.21 + i * 0.14, -0.10, 0.13), verts=10)
    o = pa.cyl('pedi', 'tStone', 0.36, 0.08, (0, -0.02, 0.36), (0, -math.pi / 2, math.pi / 2), 3)   # 三角の破風（低め）
    o.scale = (0.4, 1, 1)
    box('step', 'tStone', (0.56, 0.08, 0.03), (0, -0.16, 0.015))
    return dict(target=(0, 0, 0.18), scale=1.05, size=32)


def m_food():
    ground('tStone')
    box('tate', 'tCream', (0.50, 0.36, 0.26), (0, 0.10, 0.13))
    pa.cyl('yane', 'tRoof', 0.42, 0.12, (0, 0.10, 0.32), (0, 0, math.pi / 4), 4, r2=0.24)
    box('noren', 'tRed', (0.20, 0.012, 0.08), (0, -0.085, 0.17))
    for dx in (-0.18, 0.18):
        sphere(f'chochin{dx}', 'tRed', 0.035, (dx, -0.10, 0.16), (1, 1, 1.3))
    return dict(target=(0, 0, 0.18), scale=1.0, size=32)


def m_cafe():
    ground('tStone')
    box('tate', 'tWall', (0.46, 0.34, 0.28), (0, 0.10, 0.14))
    box('yane', 'tBrown', (0.50, 0.38, 0.04), (0, 0.10, 0.30))
    box('awning', 'tBrown', (0.44, 0.10, 0.02), (0, -0.10, 0.18), (math.radians(-20), 0, 0))
    box('glass', 'tGlass', (0.30, 0.012, 0.10), (0, -0.075, 0.08))
    cyl('cup', 'tLine', 0.035, 0.05, (0.30, -0.22, 0.06), verts=12)
    box('table', 'tBrown', (0.10, 0.10, 0.01), (-0.30, -0.22, 0.06))
    return dict(target=(0, 0, 0.15), scale=1.0, size=32)


def m_station():
    ground()
    box('home', 'tStone', (0.86, 0.14, 0.06), (0, 0.24, 0.03))
    box('tate', 'tWall', (0.46, 0.24, 0.22), (0, 0.02, 0.11))
    pa.cyl('yane', 'tRoof', 0.40, 0.10, (0, 0.02, 0.26), (0, 0, math.pi / 4), 4, r2=0.30)
    box('glass', 'tGlass', (0.30, 0.012, 0.08), (0, -0.103, 0.08))
    box('sign', 'tLine', (0.16, 0.012, 0.04), (0, -0.105, 0.18))
    return dict(target=(0, 0, 0.14), scale=1.15, size=32)


def compose():
    script = (
        'import sys,os\nfrom PIL import Image\n'
        'src,dst,names=sys.argv[1],sys.argv[2],sys.argv[3].split(",")\n'
        'W=Image.new("RGBA",(32*len(names),32),(0,0,0,0))\n'
        'for i,n in enumerate(names): W.paste(Image.open(os.path.join(src,n+".png")),(32*i,0))\n'
        'W.save(dst)\n')
    dst = os.path.join(pa.ROOT, 'nishio-go', 'art', 'poi.png')
    subprocess.run(['python3', '-c', script, TMPD, dst, ','.join(KINDS)], check=True)
    print('wrote', os.path.relpath(dst, pa.ROOT), len(KINDS), 'sprites')


if __name__ == '__main__':
    pa.MODELS.clear()
    for k in KINDS:
        pa.MODELS[k] = globals()['m_' + k]
    os.makedirs(TMPD, exist_ok=True)
    for k in KINDS:
        pa.make(k)
    compose()

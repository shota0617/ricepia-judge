# にしおさんぽGO：ミニゲーム「段丘をのぼる」の絵を Blender で作り、ドット絵に焼く
# - dankyu.js でこれまで JS で描いていたもの：台地と自然堤防の上の家（白い壁・灰色の屋根。2通り）・露頭（碧海層が見える所。白っぽい地層の帯）・
#   下の田んぼ（実った稲）・ゴールの旗・落ちてくる小石。色は今までの手描きに合わせる
# - 焼き方は mushi-art.py と同じ（pixel-art.py の Cycles で4倍→材質ごとに3色→ふちどり）
# - できるもの（nishio-go/art/ev/）：dankyu.png（16×16 を横に：家1・家2・露頭・田んぼ）・dankyu-flag.png（16×32）・dankyu-rock.png（8×8）
# 使い方：python tools/blender/dankyu-art.py
import importlib.util
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mushi_art', os.path.join(HERE, 'mushi-art.py'))
ma = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ma)
pa = ma.pa
box, cyl, sphere = pa.box, pa.cyl, pa.sphere

pa.MATS.update({
    'dKabe': '#f1e6c8', 'dYane': '#59606a', 'dYaneD': '#454b54', 'dMado': '#6a8ab0', 'dTo': '#8a6a3e',
    'dSou1': '#f4f0e0', 'dSou2': '#c8a870', 'dSou3': '#a88a5a', 'dSou4': '#d8c090',
    'dIne': '#d8c060', 'dIneD': '#b89a3a', 'dHo': '#e8c048', 'dPole': '#8a6a3e', 'dHata': '#c0281e', 'dIshi': '#7a7268', 'dIshiL': '#a8a094',
})
SIDE = dict(target=(0, 0, 0.4), scale=1.0, el=12, az=0, size=16)   # ほぼ横から（崖を横から見る遊びなので）


def gable(name, mat, w, d, h, z):
    """切妻の屋根（棟は y の向き。正面から三角の妻が見える）"""
    bpy = pa.bpy
    me = bpy.data.meshes.new(name)
    v = [(-w / 2, -d / 2, z), (w / 2, -d / 2, z), (w / 2, d / 2, z), (-w / 2, d / 2, z), (0, -d / 2, z + h), (0, d / 2, z + h)]
    me.from_pydata(v, [], [(0, 4, 5, 3), (1, 2, 5, 4), (0, 1, 4), (3, 5, 2), (0, 3, 2, 1)])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(pa.material(mat))
    return o


def house(variant):
    w = 0.8 if variant == 0 else 0.7
    box('kabe', 'dKabe', (w, 0.5, 0.44), (0, 0, 0.22))
    gable('yane', 'dYane' if variant == 0 else 'dYaneD', w + 0.14, 0.62, 0.32 if variant == 0 else 0.4, 0.44)
    gable('tsuma', 'dKabe', w - 0.02, 0.5, (0.32 if variant == 0 else 0.4) - 0.06, 0.44)   # 妻の白い壁（屋根の下の三角）
    if variant == 0:
        box('mado', 'dMado', (0.2, 0.02, 0.16), (-0.18, -0.255, 0.26))
        box('to', 'dTo', (0.16, 0.02, 0.3), (0.2, -0.255, 0.15))
    else:
        box('mado', 'dMado', (0.16, 0.02, 0.14), (0.14, -0.255, 0.28))
        box('mado2', 'dMado', (0.16, 0.02, 0.14), (-0.14, -0.255, 0.28))
    return dict(target=(0, 0, 0.42), scale=1.0, el=12, az=0, size=16)


def outcrop():
    """露頭：崖に見える白っぽい地層の帯（4段）。少しでこぼこ"""
    cols = ('dSou1', 'dSou2', 'dSou4', 'dSou3', 'dSou1')
    for i, m in enumerate(cols):
        box(f's{i}', m, (0.86 - (i % 2) * 0.06, 0.2, 0.17), (0.02 * (i % 2), 0, 0.09 + i * 0.17), bevel=0.02)
    return dict(target=(0, 0, 0.45), scale=1.0, el=8, az=0, size=16)


def paddy():
    """下の田んぼ：実った稲（横から。穂が たれる）。マスの左右はとなりと つながる"""
    box('tsuchi', 'dIneD', (1.4, 0.4, 0.18), (0, 0, 0.09))
    box('oku', 'dIne', (1.4, 0.05, 1.2), (0, 0.18, 0.6))   # うしろの稲のしげみ（すきまを うめる）
    for i in range(5):
        x = -0.4 + i * 0.2
        box(f'kuki{i}', 'dIne', (0.06, 0.06, 0.62), (x, 0, 0.45))
        sphere(f'ho{i}', 'dHo', 0.07, (x + 0.05, -0.02, 0.74), (0.8, 0.8, 1.4))
    return dict(target=(0, 0, 0.5), scale=1.0, el=8, az=0, size=16, full=True)


def flag():
    cyl('pole', 'dPole', 0.035, 1.9, (-0.22, 0, 0.95), verts=8)
    box('hata', 'dHata', (0.5, 0.03, 0.32), (0.04, 0, 1.68))
    return dict(target=(0, 0, 0.95), scale=2.0, el=10, az=0, size=32)


def rock():
    bpy = pa.bpy
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.38, location=(0, 0, 0))
    o = bpy.context.object
    o.scale = (1.0, 0.9, 0.85)
    o.data.materials.append(pa.material('dIshi'))
    sphere('hi', 'dIshiL', 0.12, (-0.12, -0.25, 0.14), (1, 0.5, 0.8))
    return dict(target=(0, 0, 0), scale=0.95, el=20, az=-20, size=8)


def save_any(arr, path):
    """大きさが たてよこ ちがう絵も そのまま PNG に"""
    h, w = arr.shape[:2]
    img = pa.bpy.data.images.new('any', w, h, alpha=True)
    img.pixels[:] = (arr[::-1].astype(np.float32) / 255).ravel()
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    pa.bpy.data.images.remove(img)


def bake_full(fn, tag):
    """田んぼ：マスの左右いっぱい。ふちどりは上だけ（左右は となりのマスへ つづく）"""
    a = ma.bake(fn, tag)
    n = a.shape[0]
    a = a.copy()
    for x in (0, n - 1):   # 左右のはしの列は、となりの列の色にする（黒いふちどりを消す）
        src = 1 if x == 0 else n - 2
        a[:, x] = a[:, src]
    return a


if __name__ == '__main__':
    os.makedirs(ma.OUT, exist_ok=True)
    cells = [ma.bake(lambda: house(0), 'dk-house0'), ma.bake(lambda: house(1), 'dk-house1'), ma.bake(outcrop, 'dk-outcrop'), bake_full(paddy, 'dk-paddy')]
    ma.save_sheet(cells, os.path.join(ma.OUT, 'dankyu.png'))
    f = ma.bake(flag, 'dk-flag')
    save_any(f[:, 8:24], os.path.join(ma.OUT, 'dankyu-flag.png'))   # 旗は まん中の 16 列（16×32）
    save_any(ma.bake(rock, 'dk-rock'), os.path.join(ma.OUT, 'dankyu-rock.png'))
    print('wrote nishio-go/art/ev/dankyu.png dankyu-flag.png dankyu-rock.png')

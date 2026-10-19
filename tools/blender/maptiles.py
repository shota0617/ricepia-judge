# にしおさんぽGO：ドット絵の地図のマス（16×16）の家と木を Blender で作る
# - 家：形5（切妻・寄棟・2階建て・陸屋根・L字）× 小物5（なし・庭木・車・自転車と植木鉢・屋根の太陽光パネル）× 向き2 ＝ 50の立体
#   → tools/blender/maptiles-sheets.py で 屋根の色10 × 壁の色5 × 季節4 をのせて 1万通り（10000マス）
# - 木：10の立体（広葉樹・松・杉・竹・植えこみ など）。風でゆれる2コマ目は、シートにする段で葉をずらして作る
# - 斜め上（南）から見下ろす。4倍の大きさに2回描き（光の当たり具合／材質ごとの色分け）、16×16 の材質の番号と明るさの段を TMP に保存する
# - 公園・ビニールハウス・墓地・工場の敷地・丘・山：それぞれ6つの立体（季節と色はシートにする段で）
# 使い方：python tools/blender/maptiles.py [種類…]（bpy が要る）→ python3 tools/blender/maptiles-sheets.py
import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('dots3d', os.path.join(HERE, 'dots3d.py'))
D3 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D3)   # 立体を作る道具（box・cyl・sphere・roof）と、描く道具を借りる
PA = D3.PA
box, cyl, sphere, roof = D3.box, D3.cyl, D3.sphere, D3.roof
import bpy  # noqa: E402

N, SS = 16, 4
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-maptiles')
BANDS = (0.42, 0.80)


# ---------- 家 ----------
def house(shape, extra, face):
    box('jimen', 'jimen', (3.0, 3.0, 0.02), (0, 0, -0.01))   # 地面は広めに（マスの上の方に、奥の地面が写る）
    rot = face * math.pi / 2
    root = []

    def add(o):
        root.append(o)
        return o
    if shape == 0:   # 切妻の平屋
        add(box('kabe', 'kabe', (0.62, 0.46, 0.34), (0, 0.04, 0.17)))
        add(roof('yane', 'yane', 0, 0.04, 0.34, 0.74, 0.58, 0.2))
    elif shape == 1:   # 寄棟の平屋
        add(box('kabe', 'kabe', (0.6, 0.48, 0.34), (0, 0.04, 0.17)))
        add(roof('yane', 'yane', 0, 0.04, 0.34, 0.72, 0.6, 0.2, hip=True))
    elif shape == 2:   # 2階建て
        add(box('kabe', 'kabe', (0.54, 0.44, 0.5), (0, 0.06, 0.25)))
        add(roof('yane', 'yane', 0, 0.06, 0.5, 0.66, 0.56, 0.18))
        add(box('mado2', 'mado', (0.12, 0.01, 0.08), (-0.12, -0.166, 0.4)))
    elif shape == 3:   # 陸屋根（四角い家）
        add(box('kabe', 'kabe', (0.6, 0.48, 0.44), (0, 0.04, 0.22)))
        add(box('yane', 'yane', (0.62, 0.5, 0.04), (0, 0.04, 0.46)))
        add(box('fuchi', 'kabe', (0.6, 0.48, 0.05), (0, 0.04, 0.5)))
        add(box('naka', 'yane', (0.5, 0.38, 0.01), (0, 0.04, 0.53)))   # ふちの内がわの屋上（ふちより少し上に見える）
    else:   # L字の家
        add(box('kabe', 'kabe', (0.62, 0.3, 0.34), (0, 0.13, 0.17)))
        add(box('kabe2', 'kabe', (0.28, 0.3, 0.34), (-0.17, -0.12, 0.17)))
        add(roof('yane', 'yane', 0, 0.13, 0.34, 0.72, 0.4, 0.17))
        add(roof('yane2', 'yane', -0.17, -0.12, 0.34, 0.36, 0.36, 0.15, hip=True))
    front = {0: -0.196, 1: -0.206, 2: -0.166, 3: -0.206, 4: -0.276}[shape]   # 前の壁の面（戸と窓が壁にうもれないよう少し前）
    add(box('to', 'to', (0.1, 0.01, 0.2), (0.12, front, 0.1)))
    for x in (-0.18, 0.04):
        add(box(f'mado{x}', 'mado', (0.1, 0.01, 0.08), (x, front, 0.21) if shape != 4 else (x + 0.2, -0.026, 0.21)))
    if extra == 1:   # 庭木
        cyl('miki', 'miki', 0.025, 0.2, (0.36, -0.34, 0.1), verts=6)
        sphere('ha', 'ki', 0.13, (0.36, -0.34, 0.26))
    elif extra == 2:   # 車
        box('kuruma', 'kuruma', (0.22, 0.13, 0.08), (-0.3, -0.36, 0.07), bevel=0.02)
        box('kurumaU', 'kuruma', (0.12, 0.11, 0.06), (-0.31, -0.36, 0.14), bevel=0.015)
        box('kurumaM', 'mado', (0.11, 0.115, 0.03), (-0.31, -0.36, 0.15))
    elif extra == 3:   # 自転車と植木鉢
        box('jitensha', 'kuro', (0.14, 0.02, 0.06), (-0.3, -0.36, 0.05))
        for x in (-0.36, -0.24):
            cyl(f'wa{x}', 'kuro', 0.035, 0.01, (x, -0.36, 0.035), (math.pi / 2, 0, 0), 8)
        cyl('hachi', 'hachi', 0.05, 0.06, (0.36, -0.36, 0.03), verts=8)
        sphere('ueki', 'ki', 0.06, (0.36, -0.36, 0.09))
    elif extra == 4:   # 太陽光パネル
        top = {0: 0.46, 1: 0.46, 2: 0.6, 3: 0.53, 4: 0.44}[shape]
        add(box('panel', 'panel', (0.34, 0.16, 0.015), (0.0, -0.06 if shape != 3 else 0.04, top), (0.35 if shape != 3 else 0.15, 0, 0)))
    for o in root:   # 向き：家だけをまわす（庭の小物は手前のまま）
        o.rotation_euler.z += rot
        o.location.x, o.location.y = (o.location.x * math.cos(rot) - o.location.y * math.sin(rot), o.location.x * math.sin(rot) + o.location.y * math.cos(rot))
    return dict(target=(0, 0.06, 0.22))


# ---------- 木（森のマス） ----------
def tree(k):
    box('jimen', 'kusa', (3.0, 3.0, 0.02), (0, 0, -0.01))

    def broad(x, y, r, h=0.22, m='ki'):
        cyl(f'miki{x}{y}', 'miki', 0.035, h, (x, y, h / 2), verts=6)
        sphere(f'ha{x}{y}', m, r, (x, y, h + r * 0.7), (1, 1, 0.85))
        sphere(f'ha2{x}{y}', m, r * 0.6, (x + r * 0.45, y - r * 0.3, h + r * 0.4))

    def cone(x, y, r, h, m):
        cyl(f'miki{x}{y}', 'miki', 0.03, 0.12, (x, y, 0.06), verts=6)
        cyl(f'ha{x}{y}', m, r, h, (x, y, 0.1 + h / 2), verts=10, r2=0.0)
    if k == 0:
        broad(0, 0, 0.3)
    elif k == 1:
        broad(-0.18, 0.1, 0.2)
        broad(0.2, -0.12, 0.18)
    elif k == 2:
        broad(0, 0.02, 0.36, 0.26)
    elif k == 3:   # 松
        cyl('miki', 'miki', 0.04, 0.32, (0, 0, 0.16), (0, 0.25, 0), 6)
        for i, (x, z, r) in enumerate(((-0.1, 0.32, 0.22), (0.1, 0.44, 0.18), (0.02, 0.54, 0.13))):
            sphere(f'matsu{i}', 'matsu', r, (x, 0, z), (1.4, 1.1, 0.45))
    elif k == 4:   # 杉
        cone(0, 0, 0.2, 0.6, 'sugi')
    elif k == 5:
        broad(-0.1, 0.06, 0.24)
        sphere('yabu', 'yabu', 0.14, (0.28, -0.28, 0.08), (1.3, 1, 0.6))
    elif k == 6:   # 植えこみ
        for i, (x, y) in enumerate(((-0.22, 0.12), (0.12, 0.18), (-0.05, -0.18), (0.26, -0.12))):
            sphere(f'yabu{i}', 'yabu' if i % 2 else 'ki', 0.15, (x, y, 0.1), (1.2, 1, 0.7))
    elif k == 7:
        cone(-0.16, 0.06, 0.15, 0.46, 'sugi')
        cone(0.18, -0.08, 0.13, 0.4, 'sugi')
    elif k == 8:
        broad(0.06, 0.08, 0.27)
        sphere('iwa', 'iwa', 0.09, (-0.3, -0.3, 0.04), (1.3, 1, 0.6))
    else:   # 竹
        for i, (x, y) in enumerate(((-0.12, 0.08), (0.04, 0.14), (0.16, -0.02), (-0.04, -0.1))):
            cyl(f'take{i}', 'take', 0.025, 0.6, (x, y, 0.3), verts=6)
            sphere(f'takeha{i}', 'takeha', 0.1, (x + 0.04, y, 0.6), (1.4, 1, 0.7))
    return dict(target=(0, 0, 0.2))


# ---------- 公園・ビニールハウス・墓地・工場の敷地・丘・山（どれも 0〜5 の6通り） ----------
def park(k):
    box('jimen', 'shiba', (3.0, 3.0, 0.02), (0, 0, -0.01))
    # 小道は描かない（となりのマスとつながらず、しまもようになるので）

    def bench(x, y):
        box(f'bench{x}', 'bench', (0.24, 0.07, 0.02), (x, y, 0.09))
        box(f'benchB{x}', 'bench', (0.24, 0.02, 0.07), (x, y + 0.04, 0.14))
        for dx in (-0.1, 0.1):
            box(f'benchL{x}{dx}', 'kuro', (0.02, 0.06, 0.08), (x + dx, y, 0.04))

    def flowers(x, y, w=0.26):
        box(f'kadan{x}', 'renga', (w, 0.14, 0.05), (x, y, 0.025))
        for i in range(5):
            sphere(f'hana{x}{i}', 'hana' if i % 2 else 'hana2', 0.03, (x - w / 2 + 0.03 + i * (w - 0.06) / 4, y, 0.07))

    def tree(x, y, r=0.2, m='ki'):
        cyl(f'miki{x}', 'miki', 0.03, 0.22, (x, y, 0.11), verts=6)
        sphere(f'ha{x}', m, r, (x, y, 0.22 + r * 0.7), (1, 1, 0.85))
    if k == 0:
        bench(0.22, -0.2)
        tree(0.25, 0.25, 0.22, 'sakura')
        flowers(-0.32, -0.32)
    elif k == 1:   # すべり台
        box('dai', 'yugu', (0.12, 0.12, 0.3), (-0.15, 0.1, 0.15))
        box('suberi', 'yugu2', (0.12, 0.42, 0.015), (-0.15, -0.12, 0.15), (-0.62, 0, 0))
        tree(0.28, 0.22, 0.18)
        flowers(0.22, -0.3, 0.22)
    elif k == 2:   # ブランコ
        for x in (-0.28, 0.08):
            cyl(f'po{x}', 'yugu', 0.015, 0.34, (x, 0.05, 0.17), verts=6)
        cyl('bar', 'yugu', 0.015, 0.4, (-0.1, 0.05, 0.34), (0, math.pi / 2, 0), 6)
        for x in (-0.2, 0.0):
            box(f'za{x}', 'bench', (0.08, 0.05, 0.015), (x, 0.05, 0.1))
        tree(0.3, -0.25, 0.17, 'sakura')
    elif k == 3:
        tree(0.22, 0.12, 0.26, 'sakura')
        bench(-0.32, -0.3)
    elif k == 4:   # 池と噴水
        cyl('ike', 'mizu', 0.3, 0.02, (0, 0, 0.01), verts=20)
        cyl('fuchi', 'iwa', 0.33, 0.015, (0, 0, 0.005), verts=20)
        cyl('funsui', 'iwa', 0.05, 0.12, (0, 0, 0.06), verts=8)
        sphere('mizu2', 'mizu', 0.05, (0, 0, 0.15))
    else:   # 街灯と花だん
        cyl('toh', 'kuro', 0.015, 0.4, (-0.3, 0.2, 0.2), verts=6)
        sphere('akari', 'akari', 0.04, (-0.3, 0.2, 0.42))
        flowers(-0.25, -0.25)
        tree(-0.15, 0.32, 0.16)
    return dict(target=(0, 0.06, 0.16))


def greenhouse(k):
    """ビニールハウス（西尾のカーネーションなど）。南北に長いハウスがマスの上下につながる"""
    box('jimen', 'tsuchi', (3.0, 3.0, 0.02), (0, 0, -0.01))
    w = (0.78, 0.7, 0.82, 0.74, 0.66, 0.8)[k]
    h = (0.34, 0.3, 0.38, 0.32, 0.28, 0.36)[k]
    x0 = (0, -0.04, 0.03, 0.0, -0.06, 0.02)[k]
    cyl('house', 'vinyl', w / 2, 3.0, (x0, 0, 0), (math.pi / 2, 0, 0), 20)
    o = bpy.context.object
    o.scale = (1, h / (w / 2), 1)
    for i in range(-6, 7):   # 骨組み
        y = i * 0.25 + (0.12 if k % 2 else 0)
        cyl(f'hone{i}', 'hone', w / 2 + 0.006, 0.012, (x0, y, 0), (math.pi / 2, 0, 0), 20).scale = (1, h / (w / 2), 1)
    if k in (1, 4):   # 横の窓をあけている（中のカーネーションが見える）
        box('mado', 'hana', (0.02, 3.0, 0.06), (x0 - w / 2 + 0.03, 0, 0.06))
    return dict(target=(0, 0.06, 0.14))


def cemetery(k):
    box('jimen', 'jari', (3.0, 3.0, 0.02), (0, 0, -0.01))
    rnd = __import__('random').Random(k)
    rows = (3, 2, 3, 2, 3, 2)[k]
    for j in range(rows):
        y = 0.3 - j * (0.6 / max(1, rows - 1)) if rows > 1 else 0
        for i in range(3):
            if rnd.random() < 0.15:
                continue
            x = -0.3 + i * 0.3 + rnd.uniform(-0.03, 0.03)
            box(f'dai{j}{i}', 'ishi2', (0.18, 0.14, 0.04), (x, y, 0.02))
            hgt = rnd.choice((0.16, 0.2, 0.24))
            box(f'haka{j}{i}', 'ishi' if rnd.random() < 0.7 else 'kuroishi', (0.09, 0.07, hgt), (x, y + 0.02, 0.04 + hgt / 2))
            if rnd.random() < 0.4:
                sphere(f'hana{j}{i}', 'hana', 0.025, (x - 0.06, y - 0.05, 0.07))
    if k in (2, 5):
        cyl('miki', 'miki', 0.03, 0.2, (0.38, -0.36, 0.1), verts=6)
        sphere('ha', 'matsu', 0.15, (0.38, -0.36, 0.26), (1.3, 1, 0.6))
    return dict(target=(0, 0.06, 0.12))


def factory(k):
    """工場の敷地：コンクリートの地面に、コンテナ・タンク・トラック・パレットなど"""
    box('jimen', 'concrete', (3.0, 3.0, 0.02), (0, 0, -0.01))
    box('sen', 'sen', (3.0, 0.015, 0.002), (0, -0.42, 0.001))
    if k == 0:
        for i, m in enumerate(('container', 'container2')):
            box(f'cont{i}', m, (0.6, 0.2, 0.2), (0, 0.2 - i * 0.24, 0.1 + 0 * i))
        box('cont2', 'container3', (0.6, 0.2, 0.2), (0, 0.2, 0.3))
    elif k == 1:
        for i, x in enumerate((-0.2, 0.2)):
            cyl(f'tank{i}', 'tank', 0.17, 0.4, (x, 0.1, 0.2), verts=16)
            cyl(f'tankU{i}', 'tank', 0.17, 0.04, (x, 0.1, 0.42), verts=16, r2=0.12)
        box('pipe', 'hone', (0.5, 0.03, 0.03), (0, -0.12, 0.25))
    elif k == 2:   # トラック
        box('nidai', 'container', (0.2, 0.46, 0.2), (0.05, 0.1, 0.14))
        box('cab', 'truck', (0.2, 0.14, 0.16), (0.05, -0.22, 0.12))
        box('cabM', 'mado', (0.18, 0.01, 0.06), (0.05, -0.295, 0.15))
        for y in (-0.2, 0.0, 0.24):
            for x in (-0.06, 0.16):
                cyl(f'wa{x}{y}', 'kuro', 0.04, 0.03, (x, y, 0.04), (0, math.pi / 2, 0), 8)
    elif k == 3:   # パレットと荷物
        for i in range(3):
            for j in range(2):
                box(f'pal{i}{j}', 'pallet', (0.2, 0.2, 0.03), (-0.28 + i * 0.26, 0.15 - j * 0.32, 0.015))
                if (i + j) % 3:
                    box(f'ni{i}{j}', 'danbo', (0.17, 0.17, 0.12), (-0.28 + i * 0.26, 0.15 - j * 0.32, 0.09))
    elif k == 4:   # 小屋と煙突
        box('koya', 'koujou', (0.56, 0.4, 0.26), (0, 0.12, 0.13))
        for i in range(3):   # のこぎり屋根
            roof(f'nok{i}', 'yaneK', -0.19 + i * 0.19, 0.12, 0.26, 0.19, 0.4, 0.08)
        cyl('entotsu', 'renga', 0.04, 0.5, (0.32, 0.3, 0.25), verts=8)
    else:   # フォークリフト
        box('fl', 'truck', (0.14, 0.2, 0.1), (0, 0, 0.08))
        box('flM', 'kuro', (0.12, 0.01, 0.2), (0, -0.12, 0.14))
        box('flT', 'kuro', (0.12, 0.12, 0.01), (0, -0.18, 0.04))
        box('flY', 'kuro', (0.14, 0.14, 0.01), (0, 0.02, 0.24))
        box('pal', 'pallet', (0.2, 0.2, 0.03), (0.3, 0.2, 0.015))
        box('ni', 'danbo', (0.17, 0.17, 0.14), (0.3, 0.2, 0.1))
    return dict(target=(0, 0.06, 0.14))


def hill(k):
    box('jimen', 'kusa', (3.0, 3.0, 0.02), (0, 0, -0.01))
    sphere('oka', 'oka', 0.42, (0, 0.04, -0.06), (1.05, 0.95, (0.5, 0.42, 0.56, 0.46, 0.4, 0.52)[k]))
    if k in (1, 3, 5):
        cyl('miki', 'miki', 0.02, 0.14, (0.08, 0.06, 0.2), verts=6)
        sphere('ha', 'ki', 0.08, (0.08, 0.06, 0.3))
    if k in (2, 4):
        for i in range(3):
            sphere(f'iwa{i}', 'iwa', 0.04, (-0.15 + i * 0.12, -0.12 - (i % 2) * 0.05, 0.1), (1.2, 1, 0.6))
    return dict(target=(0, 0.04, 0.12))


def mountain(k):
    box('jimen', 'kusa', (3.0, 3.0, 0.02), (0, 0, -0.01))
    hgt = (0.78, 0.68, 0.86, 0.72, 0.64, 0.8)[k]
    cyl('yama', 'yama', 0.48, hgt, (0, 0.05, hgt / 2), verts=(7, 9, 8, 6, 10, 7)[k], r2=0.04)
    o = bpy.context.object
    o.rotation_euler.z = k * 0.7
    cyl('iwaU', 'iwayama', 0.14, 0.14, (0, 0.05, hgt - 0.07), verts=7, r2=0.02)
    rnd = __import__('random').Random(100 + k)
    for i in range(5):   # すそに木
        a = rnd.uniform(-2.6, -0.5)
        x, y = 0.4 * math.cos(a), 0.05 + 0.4 * math.sin(a)
        sphere(f'ki{i}', 'yamaki', 0.07, (x, y, 0.06), (1, 1, 1.2))
    return dict(target=(0, 0.06, 0.24))


FRAME = {'park', 'cemetery', 'factory', 'hill', 'mountain'}
MISC = {'park': park, 'greenhouse': greenhouse, 'cemetery': cemetery, 'factory': factory, 'hill': hill, 'mountain': mountain}


def render_one(kind, args, out):
    sc = PA.setup_scene()
    sc.render.resolution_x = sc.render.resolution_y = N * SS
    opts = house(*args) if kind == 'house' else tree(*args) if kind == 'tree' else MISC[kind](*args)
    target, scale = opts['target'], 1.0
    if kind in FRAME:   # 小物のマス：写るものの上下のまん中にカメラを向け、少し大きく写す（マスからはみ出さない大きさまで）
        el = math.radians(42)
        vs = [v.co.y * math.sin(el) + v.co.z * math.cos(el) for o in bpy.data.objects if o.type == 'MESH' and o.name != 'jimen'
              for v in (o.matrix_world @ p.co for p in o.data.vertices) for v in [type('V', (), {'co': v})]]
        lo, hi = min(vs), max(vs)
        scale = min(1.0, max(0.8, (hi - lo) + 0.1))
        target = (0, 0, (lo + hi) / 2 / math.cos(el))
    PA.add_camera_light(sc, target, scale, el=42, az=0)   # 南の斜め上から（地図の家と同じ向き。前の壁が見えるくらい）
    names = PA.set_materials('id')
    ids = PA.render(sc, os.path.join(TMP, f'_{os.getpid()}-id.png'), 1)
    PA.set_materials('light')
    light = PA.render(sc, os.path.join(TMP, f'_{os.getpid()}-light.png'), 32)
    c = SS // 2
    I = ids[c::SS, c::SS][:N, :N]
    L = light.reshape(N, SS, N, SS, 4).mean(axis=(1, 3))
    id_srgb = np.array([PA.srgb((i + 1) / (len(names) + 1)) for i in range(len(names))])
    mat = np.argmin(np.abs(id_srgb[None, None, :] - I[..., :1]), axis=2).astype(np.uint8)
    mat[I[..., 3] < 0.5] = 255
    lum = L[..., :3].mean(axis=2) / np.maximum(L[..., 3], 1e-4)
    band = np.where(lum < BANDS[0], 0, np.where(lum < BANDS[1], 1, 2)).astype(np.uint8)
    np.savez_compressed(out, mat=mat, band=band, names=np.array(names))


def main():
    os.makedirs(TMP, exist_ok=True)
    jobs = [('house', (s, e, f)) for s in range(5) for e in range(5) for f in range(2)] + [('tree', (k,)) for k in range(10)]
    jobs += [(m, (k,)) for m in MISC for k in range(6)]
    only = sys.argv[1:]   # 名前を書くと、その種類だけ描く（例：python tools/blender/maptiles.py park cemetery）
    if only:
        jobs = [j for j in jobs if j[0] in only]
    for kind, args in jobs:
        render_one(kind, args, os.path.join(TMP, f'{kind}-' + '-'.join(map(str, args)) + '.npz'))
    print('rendered', len(jobs))


if __name__ == '__main__':
    main()

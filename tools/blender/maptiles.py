# にしおさんぽGO：ドット絵の地図のマス（16×16）の家と木を Blender で作る
# - 家：形5（切妻・寄棟・2階建て・陸屋根・L字）× 小物5（なし・庭木・車・自転車と植木鉢・屋根の太陽光パネル）× 向き2 ＝ 50の立体
#   → tools/blender/maptiles-sheets.py で 屋根の色10 × 壁の色5 × 季節4 をのせて 1万通り（10000マス）
# - 木：10の立体（広葉樹・松・杉・竹・植えこみ など）。風でゆれる2コマ目は、シートにする段で葉をずらして作る
# - 斜め上（南）から見下ろす。4倍の大きさに2回描き（光の当たり具合／材質ごとの色分け）、16×16 の材質の番号と明るさの段を TMP に保存する
# - 芝生（公園など）・ビニールハウス・墓地・工場の敷地・丘・山：それぞれ6つの立体（季節と色はシートにする段で）
# - 田んぼ：こよみの田んぼのようす5つ（青田・黄金色・田植え・田おこし・刈田）× 3通り。上下左右のマスとつながるよう、景色をマスの大きさでくり返す
# - 茶畑・畑・砂浜・境内の砂利・草地：茶畑と畑と砂利はくり返す景色（となりとつながる）、砂浜と草地はマスの中の小物
# - 水：さざ波の列をくり返す景色を3通り × 2コマ（波を半分ずらす）。町なかの地面：6通り（たいていは何もなく、ときどき小物）
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
    """芝生（公園のほか、湿地・運動場・ゴルフ場なども同じマスなので、遊具は置かず芝生と花と木だけ）"""
    box('jimen', 'shiba', (3.0, 3.0, 0.02), (0, 0, -0.01))
    rnd = __import__('random').Random(400 + k)
    b0 = cyl('kabu', 'kusaK', 0.05, 0.1, (0, 0, -5), verts=5, r2=0.0)
    for i in range(3 + k % 3):   # 草の株
        dup(b0, f'kabu{i}', (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.3), 0.05))
    if k in (1, 3):   # 小さな花のかたまり
        for i in range(4):
            sphere(f'hana{i}', 'hana' if i % 2 else 'hana2', 0.03, (rnd.uniform(-0.35, 0.35), rnd.uniform(-0.35, 0.25), 0.03))
    if k == 4:   # 低い植えこみ
        sphere('yabu', 'ki', 0.12, (0.2, -0.15, 0.05), (1.4, 1, 0.6))
    if k == 5:   # 木（桜のころは花）
        cyl('miki', 'miki', 0.03, 0.22, (0.05, 0.12, 0.11), verts=6)
        sphere('ha', 'sakura', 0.22, (0.05, 0.12, 0.37), (1, 1, 0.85))
    return dict(target=(0, 0.06, 0.12))


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


# ---------- 田んぼ（こよみの田んぼのようす5つ × 3通り） ----------
# 田んぼのマスはとなりとすきまなくつながるよう、景色を「1マスぶんの大きさ」でくり返す（くり返す景色なら、どこを切りとっても上下左右がつながる）
EL = math.radians(42)
PX, PY = 0.25, (1.0 / math.sin(EL)) / 4   # 稲の株の間（横に4つ・たてに4つで1マス）
PADDY = ['green', 'gold', 'flooded', 'soil', 'stubble']


def paddy(stage, k):
    base = {'green': 'mizuta', 'gold': 'tsuchiD', 'flooded': 'mizu', 'soil': 'tsuchi', 'stubble': 'karita'}[stage]
    box('jimen', base, (4.0, 4.0, 0.02), (0, 0, -0.01))
    ox = (0, PX / 2, PX / 4)[k]   # 列のずらし方
    rows = range(-8, 9)
    for j in rows:
        y = j * PY
        sh = (j % 2) * PX / 2 if k == 1 else 0
        for i in range(-16, 17):   # 稲は列に植わっているので、横は半分の間で（列が横すじに見える）
            x = i * PX / 2 + ox + sh
            if stage == 'green':
                cyl(f'i{i}_{j}', 'ine', 0.065, 0.17, (x, y, 0.085), verts=6, r2=0.025)
            elif stage == 'gold':
                cyl(f'i{i}_{j}', 'ine', 0.06, 0.15, (x, y, 0.075), verts=6, r2=0.03)
                sphere(f'h{i}_{j}', 'ho', 0.045, (x + 0.02, y - 0.015, 0.16), (1.2, 1, 0.8))
            elif stage == 'flooded':
                if i % 2 == 0:
                    cyl(f'i{i}_{j}', 'nae', 0.03, 0.09, (x, y, 0.045), verts=5, r2=0.01)
            elif stage == 'stubble' and i % 2 == 0:
                cyl(f'i{i}_{j}', 'kabu', 0.03, 0.045, (x, y, 0.022), verts=5)
        if stage == 'soil' and j % 1 == 0:   # たがやしたうね
            box(f'une{j}', 'tsuchiU', (4.0, PY * 0.45, 0.035), (0, y, 0.017))   # うねの高さは3通りとも同じ（となりのマスとつながるように）
            for i in range(-8, 9):   # 土のかたまり（通りごとに置く所をかえる）
                if (i * 3 + j * 5 + k) % 7 == 0:
                    sphere(f'tsuchi{i}_{j}', 'tsuchiU', 0.03, (i * PX + PX * 0.3, y - PY * 0.45, 0.01), (1.3, 1, 0.6))
    if stage == 'stubble':   # わらの山（マスごとに1つ。くり返しても目立たないよう、横に4マスぶんの間をあける）
        for j in (-4, 0, 4):
            for i in (-4, 0, 4):
                sphere(f'wara{i}{j}', 'wara', 0.07, (i * PX + PX * (k + 1) * 0.5, j * PY + PY * 0.5, 0.03), (1.4, 1, 0.5))
    return dict(target=(0, 0, 0))


# ---------- 茶畑・畑・砂浜・境内の砂利・草地 ----------
def dup(o, name, loc):   # 同じ形をたくさん並べるときは、写しを置く（ひとつずつ作るより速い）
    c = o.copy()
    c.name = name
    c.location = loc
    bpy.context.scene.collection.objects.link(c)
    return c


def tea(k):
    """茶畑（西尾の抹茶）：丸く刈りこんだ茶の木の列が、横にどこまでもつづく"""
    box('jimen', 'tsuchiD', (4.0, 4.0, 0.02), (0, 0, -0.01))
    for j in range(-6, 7):
        y = j * PY * 2   # 1マスに2列
        o = cyl(f'une{j}', 'cha', 0.28, 4.0, (0, y, 0.0), (0, math.pi / 2, 0), 20)   # 丸く刈りこんだ列（あいだに細い通路）
        o.scale = (0.75, 1.0, 1.0)
        if k:   # もこもこ（新芽のかたまり）
            b0 = sphere(f'mo{j}', 'chaS', 0.07, (0, y - 0.06, 0.2), (1.4, 1, 0.5))
            for i in range(-8, 9):
                if (i + j * k) % (2 + k) == 0:
                    dup(b0, f'mo{j}_{i}', (i * PX + k * 0.05, y - 0.06, 0.2))
    return dict(target=(0, 0, 0))


def veg(k):
    """畑：うねに野菜（キャベツ・ねぎ・にんじん・マルチ）"""
    box('jimen', 'tsuchi', (4.0, 4.0, 0.02), (0, 0, -0.01))
    for j in range(-8, 9):
        y = j * PY
        box(f'une{j}', 'tsuchiU' if k != 3 else 'maruchi', (4.0, PY * 0.55, 0.04), (0, y, 0.02))
        if k == 0:
            b0 = sphere(f'c{j}', 'kyabetsu', 0.07, (0, y, 0.08), (1, 1, 0.8))
            for i in range(-8, 9):
                dup(b0, f'c{j}_{i}', (i * PX, y, 0.08))
        elif k == 1:
            b0 = cyl(f'n{j}', 'negi', 0.015, 0.18, (0, y, 0.13), verts=5)
            for i in range(-16, 17):
                dup(b0, f'n{j}_{i}', (i * PX / 2, y, 0.13))
        elif k == 2:
            b0 = sphere(f'h{j}', 'happa', 0.045, (0, y, 0.07), (1.2, 1, 0.7))
            for i in range(-16, 17):
                dup(b0, f'h{j}_{i}', (i * PX / 2 + (j % 2) * PX / 4, y, 0.07))
        elif k == 3 and j % 2 == 0:   # マルチの穴から苗
            b0 = sphere(f'm{j}', 'happa', 0.035, (0, y, 0.05))
            for i in range(-8, 9):
                dup(b0, f'm{j}_{i}', (i * PX, y, 0.05))
    return dict(target=(0, 0, 0))


def sand(k):
    """砂浜：貝・小石・流木・海草（マスの中におさまる小物）"""
    box('jimen', 'suna', (4.0, 4.0, 0.02), (0, 0, -0.01))
    rnd = __import__('random').Random(200 + k)
    for i in range(3 + k):
        x, y = rnd.uniform(-0.38, 0.38), rnd.uniform(-0.38, 0.32)
        if i % 3 == 0:
            sphere(f'kai{i}', 'kai', 0.035, (x, y, 0.01), (1.3, 1, 0.5))
        elif i % 3 == 1:
            sphere(f'ishi{i}', 'koishi', 0.03, (x, y, 0.01), (1.1, 1, 0.6))
        else:
            sphere(f'mo{i}', 'kaiso', 0.04, (x, y, 0.005), (1.6, 0.8, 0.25))
    if k == 2:
        cyl('ryuboku', 'ryuboku', 0.025, 0.4, (0.0, -0.05, 0.02), (0, math.pi / 2, 0.4), 6)
    if k == 3:
        for x in (-0.22, 0.0, 0.22):   # 足あと
            box(f'ashi{x}', 'sunaK', (0.04, 0.07, 0.005), (x, -0.1 + x * 0.6, 0.002))
    return dict(target=(0, 0, 0))


def gravel(k):
    """境内の砂利：ほうきの目（横すじ）と、ところどころに飛び石"""
    box('jimen', 'jari', (4.0, 4.0, 0.02), (0, 0, -0.01))
    b0 = box('suji', 'jariK', (4.0, 0.07, 0.012), (0, 0, 0.006))
    for j in range(-16, 17):
        dup(b0, f'suji{j}', (0, j * PY / 2, 0.003))
    if k == 1:
        for i, (x, y) in enumerate(((-0.2, 0.15), (0.05, -0.05), (0.28, -0.25))):
            cyl(f'tobi{i}', 'tobiishi', 0.09, 0.03, (x, y, 0.015), verts=10)
    if k == 2:
        cyl('toro', 'tobiishi', 0.04, 0.2, (0.2, 0.1, 0.1), verts=6)
        box('toroH', 'tobiishi', (0.12, 0.12, 0.08), (0.2, 0.1, 0.24))
        box('toroK', 'tobiishi', (0.16, 0.16, 0.03), (0.2, 0.1, 0.3))
    return dict(target=(0, 0, 0))


def grass(k):
    """草地：草の株と、ときどき花（マスの中におさまる）"""
    box('jimen', 'kusa', (4.0, 4.0, 0.02), (0, 0, -0.01))
    rnd = __import__('random').Random(300 + k)
    b0 = cyl('kabu', 'kusaK', 0.055, 0.13, (0, 0, -5), verts=5, r2=0.0)
    for i in range(5 + k):
        dup(b0, f'kabu{i}', (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.3), 0.065))
    for i in range(k % 3):
        sphere(f'hana{i}', 'hana', 0.025, (rnd.uniform(-0.38, 0.38), rnd.uniform(-0.38, 0.3), 0.06))
    return dict(target=(0, 0, 0))


def water(k, f):
    """水（海・川・池）：さざ波の列をくり返す景色。2コマ目は波を半分ずらして描く"""
    box('jimen', 'mizu', (4.0, 4.0, 0.02), (0, 0, -0.01))
    b0 = sphere('nami', 'nami', 0.06, (0, 0, -5), (1.8, 0.9, 0.4))
    for j in range(-16, 17):
        y = j * PY / 2
        sh = ((j * (k + 2)) % 4) * PX / 4 + f * PX / 2   # 列ごとのずれ（k で3通り）と、2コマ目の動き
        for i in range(-8, 9):
            if (i + j + k) % 3 == 0:
                dup(b0, f'nami{i}_{j}', (i * PX + sh, y, 0.012))
    return dict(target=(0, 0, 0))


def town(k):
    """町なかの地面：たいていは何もなく、ときどきマンホール・植木鉢・自販機・電柱・自転車"""
    box('jimen', 'machi', (4.0, 4.0, 0.02), (0, 0, -0.01))
    if k == 1:
        cyl('manhole', 'manhole', 0.09, 0.006, (0.1, -0.1, 0.003), verts=12)
    elif k == 2:
        for i, x in enumerate((-0.3, -0.18)):
            cyl(f'hachi{i}', 'hachi', 0.05, 0.07, (x, 0.2, 0.035), verts=8)
            sphere(f'ueki{i}', 'ki', 0.06, (x, 0.2, 0.1))
    elif k == 3:
        box('jihan', 'jihan', (0.16, 0.1, 0.3), (0.28, 0.25, 0.15))
        box('jihanM', 'mado', (0.12, 0.01, 0.12), (0.28, 0.195, 0.2))
    elif k == 4:
        cyl('denchu', 'concreteP', 0.03, 0.7, (-0.35, 0.3, 0.35), verts=8)
        box('udegi', 'kuro', (0.3, 0.02, 0.02), (-0.35, 0.3, 0.66))
    elif k == 5:
        box('jitensha', 'kuro', (0.16, 0.02, 0.06), (0.15, -0.2, 0.06))
        for x in (0.08, 0.22):
            cyl(f'wa{x}', 'kuro', 0.04, 0.01, (x, -0.2, 0.04), (math.pi / 2, 0, 0), 8)
    return dict(target=(0, 0, 0.1) if k in (3, 4) else (0, 0, 0))


FIELD = {'tea': (tea, 3), 'veg': (veg, 4), 'sand': (sand, 4), 'gravel': (gravel, 3), 'grass': (grass, 6)}
FRAME = {'cemetery', 'factory', 'hill', 'mountain'}
MISC = {'park': park, 'greenhouse': greenhouse, 'cemetery': cemetery, 'factory': factory, 'hill': hill, 'mountain': mountain}


def render_one(kind, args, out):
    sc = PA.setup_scene()
    sc.render.resolution_x = sc.render.resolution_y = N * SS
    opts = (house(*args) if kind == 'house' else tree(*args) if kind == 'tree' else paddy(*args) if kind == 'paddy'
            else water(*args) if kind == 'water' else town(*args) if kind == 'town'
            else FIELD[kind][0](*args) if kind in FIELD else MISC[kind](*args))
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
    jobs += [('paddy', (st, k)) for st in PADDY for k in range(3)]
    jobs += [(f, (k,)) for f, (_, n) in FIELD.items() for k in range(n)]
    jobs += [('water', (k, f)) for k in range(3) for f in range(2)] + [('town', (k,)) for k in range(6)]
    only = sys.argv[1:]   # 名前を書くと、その種類だけ描く（例：python tools/blender/maptiles.py park cemetery）
    if only:
        jobs = [j for j in jobs if j[0] in only]
    for kind, args in jobs:
        render_one(kind, args, os.path.join(TMP, f'{kind}-' + '-'.join(map(str, args)) + '.npz'))
    print('rendered', len(jobs))


if __name__ == '__main__':
    main()

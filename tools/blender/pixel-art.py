# にしおさんぽGO：Blender で立体を作り、ドット絵（48×48 の PNG）に焼く
# - 文字のかわりに使う大きめの絵（とくてん の品物など）。できた PNG は nishio-go/art/ に置き、ゲームはその PNG だけを読む（Blender は要らない）
# - しくみ：Cycles で 4倍の大きさに2回描く（光の当たり具合／材質ごとの色分け）→ 4×4 の真ん中の点を取って 48×48 に
#           → 明るさを3段（影・ふつう・明るい）に分け、材質ごとの3色に置きかえ → まわりに黒いふちどり
# 使い方：pip install bpy（Blender 5.1 の Python 版。Python 3.13）
#         python tools/blender/pixel-art.py            （ぜんぶ）
#         python tools/blender/pixel-art.py ricebag     （ひとつだけ）
import math
import os
import sys

import bpy
import bmesh  # bpy を読んでから
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'nishio-go', 'art')
SIZE, SS = 48, 4                      # できあがりの大きさ（絵ごとに size で変えられる）と、描くときの倍率
OUTLINE = (0x1a, 0x1a, 0x1a)
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-pixel-art')

# 材質：ふつうの色（影と明るい色は、ここから作る）
MATS = {
    'kraft': '#d9b98a', 'kraftD': '#b8925e', 'red': '#d23a2e', 'white': '#f4f1e8', 'green': '#5c9e3a', 'rice': '#fffdf5',
    'blue': '#3f7fbf', 'navy': '#203a63', 'steel': '#b8c0c8', 'dark': '#3a3a3a', 'yellow': '#f2c230', 'gold': '#f2b81f',
    'goldL': '#ffe07a', 'glass': '#9fd3ff',
    # 地区の名物
    'raku': '#3b2a24', 'matcha': '#7fb04a', 'foam': '#b9d97a', 'eel': '#4b4a2a', 'eelB': '#c9b46a', 'wood': '#a06a3a', 'woodD': '#6b4424',
    'water': '#4aa3df', 'steam': '#f2f2f2', 'leaf': '#3f8f3a', 'ajisai': '#7b7fd6', 'ajisaiP': '#c07ad0', 'sand': '#e8d29a', 'kurokabe': '#2b2b2b',
    'stone': '#9a9a94', 'roof': '#3e4a5a', 'straw': '#e0b84a', 'carrot': '#f07a1e', 'kawara': '#6f7884', 'kaki': '#e8641c', 'sea': '#3d86c6',
    'torii': '#d8402e', 'pine': '#2f6b33',
    # こよみ（田んぼと天気）
    'aze': '#8a6a3e', 'soil': '#7a5434', 'soilD': '#5e3f26', 'mizu': '#8cc8ee', 'nae': '#7ccf5a', 'ine': '#4f9e3a', 'inaho': '#e8c048',
    'kabu': '#c9a46a', 'wara': '#e6cf8f', 'sun': '#ffc93c', 'sunR': '#ff9f1c', 'kumo': '#f4f6f8', 'kumoD': '#9aa4b0', 'ame': '#3d8fe0', 'yuki': '#ffffff',
    # おまかせ強化・たからばこ
    'shoe': '#2f7fd6', 'sole': '#f2f2f2', 'lace': '#ffffff', 'bag': '#d23a2e', 'bagD': '#8f2018', 'wall': '#f1e6c8', 'yaneR': '#c0392b',
    'door': '#7a4a2a', 'zzz': '#7ec8ff', 'chest': '#9c5b2e', 'chestD': '#5d3a1a', 'band': '#d8a326', 'gem': '#e94b6a',
    # バッジのメダル
    'medal': '#f2b81f', 'medalL': '#ffe58a', 'ribbonR': '#d23a2e', 'ribbonW': '#f4f1e8',
    # 町の人（pixel.js の NPC_COLORS に合わせる）
    'skin': '#f4c9a0', 'eye': '#2a2a2a', 'cheek': '#f29b9b', 'hairGray': '#c8c8c8', 'hairWhite': '#eeeeee', 'hairBlack': '#2b2018',
    'hairBrown': '#5a3418', 'hairDark': '#1d1d1d', 'hairTea': '#3b2a1a', 'cElder': '#6d5a44', 'cGranny': '#8e5a9e', 'cMan': '#3f7fbf',
    'cWoman': '#e57373', 'cKid': '#ffb300', 'cStudent': '#203a63', 'cFisher': '#3a7bd5', 'cStaff': '#2e7d32', 'cGuide': '#f2c230',
    'cMonk': '#2b2b2b', 'kesa': '#b88a12', 'towel': '#ffffff', 'capY': '#ffcc00', 'collar': '#ffffff',
    # 下のタブと上のバー
    'mapG': '#7cc04a', 'mapB': '#5aa9e6', 'mapY': '#f2d36b', 'note': '#2f7a34', 'paper': '#fff8e0', 'ring': '#b8c0c8',
    'giftR': '#d23a2e', 'giftY': '#ffd54f', 'gear': '#9aa4b0', 'gearD': '#3a3a3a', 'chawan': '#c0392b', 'gohan': '#ffffff', 'hashi': '#8a5a2b',
    # きろく の数字の札
    'hoshi': '#ffd54f', 'hon': '#2f5d9a', 'flagR': '#d23a2e', 'pole': '#8a6a3e', 'pinR': '#e0453a', 'fire': '#ff8a1c', 'fireY': '#ffd54f', 'ashi': '#7a4a2a',
    # 地図の上のボタン
    # スポットの種類
    'hasu': '#f29bbf', 'hasuL': '#ffd0e0', 'hasuHa': '#4f9e3a', 'kamera': '#3a3a3a', 'lens': '#5a8ad0', 'bench': '#a06a3a', 'parasol': '#e8504a', 'parasolW': '#f4f1e8',
    'zou': '#a8a49a', 'asahi': '#ff9f1c', 'densha': '#c8102e', 'hata': '#2f7a34',
    'furoshiki': '#3f9a5a', 'furoshikiD': '#2a6e3e', 'combine': '#e0602a', 'combineD': '#a8401c', 'crawler': '#2e2e30', 'reaper': '#e8c048',
    'umi': '#3d86c6', 'riku': '#6fbf4a', 'truck': '#f4f4f4', 'tire': '#2a2a2a', 'hari': '#d23a2e', 'hariB': '#2f5d9a', 'hairY': '#f2c230', 'shirt': '#3f7fbf', 'pants': '#2d3a55',
}


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tones(h):   # 影（少し青みに寄せて暗く）・ふつう・明るい
    r, g, b = hex2rgb(h)
    shadow = (int(r * 0.62), int(g * 0.62), int(min(255, b * 0.72 + 12)))
    k = 0.38 if (r + g + b) / 765 > 0.3 else 0.16   # 黒っぽい色（髪など）は、明るい所も白っぽくしすぎない
    light = tuple(int(c + (255 - c) * k) for c in (r, g, b))
    return [shadow, (r, g, b), light]


# ---------- 立体をつくる道具 ----------
def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m['nsg'] = name
    return m


def box(name, mat, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    o.data.materials.append(material(mat))
    return o


def cyl(name, mat, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), verts=32, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material(mat))
    return o


def sphere(name, mat, r, loc, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=16, ring_count=8)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.data.materials.append(material(mat))
    return o


def tube(name, mat, pts, r):
    """点をなめらかにつないだ管（うなぎなど）"""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, co in zip(sp.bezier_points, pts):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    cu.materials.append(material(mat))
    return o


# ---------- 品物 ----------
def ricebag():
    """お米の袋（クラフト紙の米袋。赤い帯と白いラベル、ラベルに稲穂）"""
    body = box('body', 'kraft', (0.62, 0.40, 0.86), (0, 0, 0.43), bevel=0.05)
    bm = bmesh.new()   # 上を少しすぼめる（袋のふくらみ）
    bm.from_mesh(body.data)
    for v in bm.verts:
        if v.co.z > 0.6:
            v.co.x *= 0.92
            v.co.y *= 0.85
        elif 0.15 < v.co.z < 0.6:
            v.co.y *= 1.06
    bm.to_mesh(body.data)
    bm.free()
    box('top', 'kraftD', (0.58, 0.10, 0.16), (0, 0, 0.92), bevel=0.02)          # 折り返した口
    box('band', 'red', (0.645, 0.43, 0.10), (0, 0, 0.62))                      # 赤い帯
    box('label', 'white', (0.40, 0.02, 0.36), (0, -0.215, 0.33), bevel=0.01)  # 白いラベル
    for i in range(5):                                                         # 稲穂
        sphere(f'ear{i}', 'green' if i < 4 else 'green', 0.035, (0.02 * i - 0.03, -0.235, 0.24 + 0.045 * i), (1, 0.6, 1.4))
    for i in range(4):
        sphere(f'grain{i}', 'yellow', 0.028, (0.07 + 0.012 * i, -0.235, 0.30 + 0.045 * i), (1.2, 0.6, 1))
    return dict(target=(0, 0, 0.47), scale=1.2)


def coin():
    """ポイントのコイン（金色。少し横を向けて厚みを見せる。まんなかに一段高い面と星）"""
    rot = (math.radians(90), 0, math.radians(-62))
    cyl('coin', 'gold', 0.5, 0.14, (0, 0, 0), rot, 48)
    cyl('face', 'goldL', 0.38, 0.16, (0, 0, 0), rot, 48)
    star = cyl('star', 'gold', 0.2, 0.18, (0, 0, 0), rot, 5)   # 五角の山（星のかわり）
    star.scale = (1, 1, 1)
    return dict(target=(0, 0, 0), scale=1.25)


# ---------- 地区の名物（areas.json の specialties・icon から。地区の窓と きろく の一覧に出す） ----------
def area_nishio():
    """西尾：抹茶（黒い茶わんに、泡だった抹茶）"""
    cyl('bowl', 'raku', 0.30, 0.42, (0, 0, 0.21), verts=40, r2=0.46)
    cyl('foot', 'raku', 0.20, 0.08, (0, 0, 0.0), verts=32)
    cyl('tea', 'matcha', 0.43, 0.02, (0, 0, 0.425), verts=40)   # 口いっぱいの抹茶（ふちより少し上にして見えるように）
    sphere('foam', 'foam', 0.20, (0.04, -0.03, 0.435), (1, 1, 0.1))
    return dict(target=(0, 0, 0.2), scale=1.2)


def area_isshiki():
    """一色：うなぎ（くねった体。腹は黄色っぽく）"""
    pts = [(-0.55, 0.0, 0.10), (-0.28, -0.18, 0.12), (0.0, 0.10, 0.12), (0.26, -0.12, 0.12), (0.52, 0.06, 0.14)]
    tube('eel', 'eel', pts, 0.085)
    tube('belly', 'eelB', [(x, y - 0.03, z - 0.05) for x, y, z in pts], 0.055)
    sphere('eye', 'white', 0.03, (0.56, -0.02, 0.21))
    sphere('pupil', 'dark', 0.016, (0.575, -0.04, 0.215))
    return dict(target=(0, 0, 0.1), scale=1.35)


def area_kira():
    """吉良：温泉（木のおけに湯、ゆげ）"""
    cyl('tub', 'wood', 0.42, 0.36, (0, 0, 0.18), verts=24)
    for z in (0.07, 0.29):
        cyl(f'hoop{z}', 'woodD', 0.435, 0.04, (0, 0, z), verts=24)
    cyl('yu', 'water', 0.39, 0.02, (0, 0, 0.34), verts=24)
    for i, (x, z) in enumerate(((-0.14, 0.55), (0.06, 0.68), (0.18, 0.52))):
        sphere(f'steam{i}', 'steam', 0.10, (x, 0.0, z), (1, 1, 1.3))
    return dict(target=(0, 0, 0.32), scale=1.2)


def area_hazu():
    """幡豆：三ヶ根山のあじさい（緑の山に、青とむらさきのあじさい）"""
    cyl('yama', 'leaf', 0.55, 0.62, (0, 0, 0.31), verts=7, r2=0.06)
    cyl('umi', 'sea', 0.62, 0.04, (0, 0, 0.0), verts=32)
    for i, (x, y, z) in enumerate(((-0.24, -0.26, 0.16), (0.10, -0.34, 0.12), (0.30, -0.12, 0.14), (-0.06, -0.18, 0.32), (0.18, -0.06, 0.36))):
        sphere(f'aj{i}', 'ajisai' if i % 2 == 0 else 'ajisaiP', 0.09, (x, y, z))
    return dict(target=(0, 0, 0.28), scale=1.35)


def area_sakushima():
    """佐久島：黒壁の家がある島"""
    sphere('island', 'sand', 0.55, (0, 0, -0.05), (1, 0.8, 0.28))
    box('house', 'kurokabe', (0.30, 0.22, 0.20), (-0.06, -0.02, 0.18))
    cyl('yane', 'roof', 0.24, 0.12, (-0.06, -0.02, 0.34), (0, 0, math.pi / 4), 4, r2=0.02)
    cyl('trunk', 'wood', 0.03, 0.22, (0.28, 0.06, 0.18), verts=8)
    sphere('tree', 'pine', 0.13, (0.28, 0.06, 0.34), (1, 1, 0.8))
    return dict(target=(0, 0, 0.14), scale=1.35)


def area_okazaki():
    """岡崎：お城（石垣に白い壁と黒っぽい屋根）"""
    cyl('ishigaki', 'stone', 0.46, 0.22, (0, 0, 0.11), (0, 0, math.pi / 4), 4, r2=0.36)
    box('w1', 'white', (0.40, 0.32, 0.18), (0, 0, 0.31))
    cyl('r1', 'roof', 0.36, 0.10, (0, 0, 0.45), (0, 0, math.pi / 4), 4, r2=0.22)
    box('w2', 'white', (0.26, 0.22, 0.14), (0, 0, 0.56))
    cyl('r2', 'roof', 0.26, 0.10, (0, 0, 0.68), (0, 0, math.pi / 4), 4, r2=0.04)
    for x in (-0.04, 0.04):
        box(f'shachi{x}', 'gold', (0.02, 0.02, 0.05), (x * 2.5, 0, 0.75))
    return dict(target=(0, 0, 0.38), scale=1.15)


def area_anjo():
    """安城：稲の束（米どころ）"""
    for i in range(9):
        a = i / 9 * math.tau
        x, y = 0.07 * math.cos(a), 0.07 * math.sin(a)
        cyl(f'stalk{i}', 'straw', 0.022, 0.62, (x, y, 0.31), (0.22 * math.sin(a), -0.22 * math.cos(a), 0), 6)
        sphere(f'ho{i}', 'gold', 0.05, (x * 3.2, y * 3.2, 0.66), (1, 1, 1.8))
    cyl('band', 'red', 0.11, 0.06, (0, 0, 0.30), verts=16)
    return dict(target=(0, 0, 0.36), scale=1.15)


def area_hekinan():
    """碧南：にんじん（オレンジの根と、緑の葉）"""
    c = cyl('ninjin', 'carrot', 0.16, 0.70, (0, 0, 0.0), (0, math.radians(-30), 0), 16, r2=0.02)
    c.location = (0.06, 0, 0.30)
    c.rotation_euler = (0, math.radians(150), 0)
    for i, a in enumerate((-0.5, 0, 0.5)):
        cyl(f'ha{i}', 'leaf', 0.05, 0.36, (-0.16 + a * 0.12, a * 0.06, 0.72), (0, math.radians(-30) + a * 0.5, a * 0.6), 6, r2=0.0)
    return dict(target=(0, 0, 0.36), scale=1.2)


def area_takahama():
    """高浜：鬼瓦（灰色の瓦に、つのと大きな目）"""
    box('ita', 'kawara', (0.62, 0.16, 0.56), (0, 0, 0.28), bevel=0.05)
    for x in (-0.20, 0.20):
        cyl(f'tsuno{x}', 'kawara', 0.07, 0.24, (x, 0, 0.64), (0, math.copysign(0.4, x), 0), 8, r2=0.0)
        sphere(f'me{x}', 'white', 0.07, (x * 0.7, -0.09, 0.38))
        sphere(f'hitomi{x}', 'dark', 0.035, (x * 0.7, -0.15, 0.38))
    box('kuchi', 'dark', (0.30, 0.04, 0.07), (0, -0.09, 0.16))
    for x in (-0.11, 0.11):
        cyl(f'kiba{x}', 'white', 0.03, 0.08, (x, -0.11, 0.21), (math.pi, 0, 0), 6, r2=0.0)
    return dict(target=(0, 0, 0.36), scale=1.15)


def area_kota():
    """幸田：筆柿（筆の先のようにとがった柿と、へた）"""
    sphere('kaki', 'kaki', 0.26, (0, 0, 0.36), (1, 1, 0.85))
    cyl('saki', 'kaki', 0.24, 0.30, (0, 0, 0.16), (math.pi, 0, 0), 24, r2=0.03)   # 筆の先のようにとがった下
    for i in range(4):
        a = i / 4 * math.tau + 0.3
        box(f'heta{i}', 'leaf', (0.16, 0.07, 0.02), (0.08 * math.cos(a), 0.08 * math.sin(a), 0.58), (0, 0, a))
    cyl('jiku', 'woodD', 0.02, 0.10, (0, 0, 0.63), verts=6)
    return dict(target=(0, 0, 0.32), scale=1.0)


def area_gamagori():
    """蒲郡：三河湾にうかぶ竹島（緑の小島と赤い鳥居、海）"""
    cyl('umi', 'sea', 0.62, 0.04, (0, 0, 0.0), verts=32)
    sphere('shima', 'pine', 0.36, (0.12, 0.10, 0.06), (1, 0.9, 0.75))
    sphere('iso', 'stone', 0.38, (0.12, 0.10, 0.02), (1, 0.9, 0.2))
    for x in (-0.36, -0.22):
        cyl(f'hashira{x}', 'torii', 0.02, 0.26, (x, -0.24, 0.15), verts=8)
    box('kasagi', 'torii', (0.24, 0.04, 0.04), (-0.29, -0.24, 0.29))
    box('nuki', 'torii', (0.18, 0.03, 0.03), (-0.29, -0.24, 0.23))
    return dict(target=(0, 0, 0.12), scale=1.35)


# ---------- こよみ：田んぼの1年（season.js の PADDY の tile）と天気（weather.js の kind） ----------
def paddy_field(inner):
    """あぜに囲まれた四角い田んぼ。inner は中の地面の材質"""
    box('aze', 'aze', (1.0, 1.0, 0.10), (0, 0, 0.05))
    box('ta', inner, (0.86, 0.86, 0.10), (0, 0, 0.06))
    return dict(target=(0, 0, 0.08), scale=1.25, el=38)


def grid(n=4, step=0.19):
    o = (n - 1) * step / 2
    return [(i * step - o, j * step - o) for i in range(n) for j in range(n)]


def paddy_stubble():
    """冬の田んぼ・刈田：刈ったあとの株と、わらの山"""
    opts = paddy_field('soil')
    for i, (x, y) in enumerate(grid()):
        cyl(f'kabu{i}', 'kabu', 0.035, 0.07, (x, y, 0.14), verts=8)
    sphere('wara', 'wara', 0.14, (0.22, 0.22, 0.17), (1, 1, 1.1))
    cyl('waraTop', 'wara', 0.10, 0.14, (0.22, 0.22, 0.30), verts=12, r2=0.0)
    return opts


def paddy_soil():
    """田おこし：たがやした土のうね"""
    opts = paddy_field('soil')
    for i in range(5):
        box(f'une{i}', 'soilD', (0.84, 0.06, 0.04), (0, -0.34 + i * 0.17, 0.13))
    return opts


def paddy_flooded():
    """田植え：水をはった田んぼに、植えたばかりの苗"""
    opts = paddy_field('mizu')
    for i, (x, y) in enumerate(grid()):
        cyl(f'nae{i}', 'nae', 0.03, 0.09, (x, y, 0.15), verts=6, r2=0.0)
    return opts


def paddy_green():
    """青田：緑の稲が育った田んぼ"""
    opts = paddy_field('mizu')
    for i, (x, y) in enumerate(grid()):
        cyl(f'ine{i}', 'ine', 0.08, 0.24, (x, y, 0.22), verts=7, r2=0.01)
    return opts


def paddy_gold():
    """稲刈り：稲穂が黄金色にみのった田んぼ"""
    opts = paddy_field('soil')
    for i, (x, y) in enumerate(grid()):
        cyl(f'ine{i}', 'kabu', 0.07, 0.22, (x, y, 0.21), verts=7, r2=0.02)
        sphere(f'ho{i}', 'inaho', 0.06, (x + 0.03, y - 0.02, 0.32), (1.4, 1, 0.8))
    return opts


def wx_sun():
    """晴れ：お日さまと光"""
    sphere('hi', 'sun', 0.32, (0, 0, 0))
    for i in range(8):
        a = i / 8 * math.tau
        cyl(f'ray{i}', 'sunR', 0.06, 0.16, (0.46 * math.cos(a), -0.05, 0.46 * math.sin(a)), (0, -a + math.pi / 2, 0), 6, r2=0.0)
    return dict(target=(0, 0, 0), scale=1.3, el=0, az=0)


def cloud(mat='kumo', z=0.0):
    for i, (x, zz, r) in enumerate(((-0.26, 0.0, 0.20), (0.0, 0.10, 0.27), (0.26, 0.0, 0.20), (0.0, -0.06, 0.22))):
        sphere(f'kumo{i}', mat, r, (x, 0, z + zz), (1, 0.8, 1))


def wx_cloudy():
    """くもり：くも"""
    cloud()
    sphere('kumoB', 'kumoD', 0.18, (0.30, 0.15, 0.12), (1, 0.8, 1))
    return dict(target=(0, 0, 0.02), scale=1.15, el=0, az=0)


def wx_rain():
    """雨：灰色のくもと雨つぶ"""
    cloud('kumoD', 0.18)
    for i, x in enumerate((-0.24, -0.05, 0.14, 0.30)):
        sphere(f'ame{i}', 'ame', 0.045, (x, -0.2, -0.22 - 0.08 * (i % 2)), (0.7, 0.7, 1.6))
    return dict(target=(0, 0, 0.0), scale=1.15, el=0, az=0)


def wx_snow():
    """雪：くもと雪のつぶ"""
    cloud('kumoD', 0.18)
    for i, (x, z) in enumerate(((-0.26, -0.22), (-0.04, -0.32), (0.16, -0.20), (0.32, -0.34))):
        sphere(f'yuki{i}', 'yuki', 0.06, (x, -0.2, z))
    return dict(target=(0, 0, 0.0), scale=1.15, el=0, az=0)


# ---------- おまかせ強化（game.js の IDLE.ups）とたからばこ ----------
def up_spd():
    """はやあし：青いスニーカー（白い靴底とひも）"""
    box('sole', 'sole', (0.80, 0.34, 0.08), (0.02, 0, 0.04), bevel=0.04)
    body = box('upper', 'shoe', (0.62, 0.30, 0.24), (-0.06, 0, 0.20), bevel=0.08)
    sphere('toe', 'shoe', 0.17, (0.26, 0, 0.14), (1.2, 0.9, 0.8))
    box('heel', 'shoe', (0.18, 0.28, 0.34), (-0.30, 0, 0.26), bevel=0.06)
    for i in range(3):
        box(f'lace{i}', 'lace', (0.03, 0.22, 0.025), (-0.06 + i * 0.1, 0, 0.33 - i * 0.03))
    box('stripe', 'sole', (0.30, 0.01, 0.04), (-0.04, -0.155, 0.18), (0, 0, 0))
    return dict(target=(0, 0, 0.18), scale=1.1, az=-20)


def up_bag():
    """おおきなリュック：赤いリュック（ふたと前ポケット）"""
    box('body', 'bag', (0.56, 0.34, 0.66), (0, 0, 0.33), bevel=0.10)
    box('flap', 'bagD', (0.56, 0.36, 0.20), (0, -0.01, 0.62), bevel=0.06)
    box('pocket', 'bagD', (0.38, 0.10, 0.24), (0, -0.20, 0.22), bevel=0.05)
    box('buckle', 'band', (0.08, 0.02, 0.06), (0, -0.20, 0.53))
    tube('handle', 'bagD', [(-0.10, 0.02, 0.70), (0, 0.02, 0.80), (0.10, 0.02, 0.70)], 0.025)
    return dict(target=(0, 0, 0.38), scale=1.15)


def omiyage():
    """おみやげ袋：唐草の緑の風呂敷で包んだ箱（上で結んだ耳が2つ）。歩くと開く袋（docs/location-game-essence.md）"""
    box('hako', 'furoshiki', (0.62, 0.5, 0.4), (0, 0, 0.22), bevel=0.14)
    for i, x in enumerate((-0.15, 0.15)):   # 結んだ耳（上へぴんと立つ）
        sphere(f'mimi{i}', 'furoshiki', 0.12, (x, 0, 0.56), (0.7, 0.6, 1.5)).rotation_euler = (0, (-0.7 if x < 0 else 0.7), 0)
    sphere('musubi', 'furoshikiD', 0.1, (0, -0.02, 0.45), (1.2, 1.0, 0.8))
    for i, (x, z) in enumerate(((-0.17, 0.3), (0.15, 0.14), (0.05, 0.3), (-0.08, 0.12))):   # 唐草の白いうず
        sphere(f'uzu{i}', 'white', 0.05, (x, -0.25, z), (1.3, 0.5, 1.0))
    return dict(target=(0, 0, 0.32), scale=1.0)


def up_nap():
    """るすばん上手：赤い屋根の家と、すやすや（Zの形の青い札）"""
    box('kabe', 'wall', (0.56, 0.48, 0.38), (0, 0, 0.19))
    cyl('yane', 'yaneR', 0.42, 0.26, (0, 0, 0.51), (0, 0, math.pi / 4), 4, r2=0.02)
    box('door', 'door', (0.14, 0.02, 0.22), (0.08, -0.245, 0.11))
    box('mado', 'glass', (0.12, 0.02, 0.10), (-0.14, -0.245, 0.22))
    for i, (x, z, sz) in enumerate(((0.30, 0.66, 0.10), (0.40, 0.80, 0.08), (0.48, 0.92, 0.06))):
        box(f'z{i}', 'zzz', (sz, 0.02, sz), (x, -0.1, z), (0, math.radians(15), 0))
    return dict(target=(0.06, 0, 0.42), scale=1.3)


def chest():
    """たからばこ（ふたを少し開けて、中から金色の光）"""
    box('hako', 'chest', (0.70, 0.44, 0.36), (0, 0, 0.18), bevel=0.02)
    for x in (-0.24, 0.24):
        box(f'obi{x}', 'band', (0.07, 0.46, 0.38), (x, 0, 0.19))
    futa = cyl('futa', 'chest', 0.22, 0.70, (0, 0, 0), (0, math.pi / 2, 0), 16)
    futa.scale = (1, 1, 1)
    futa.location = (0, 0.02, 0.40)
    futa.rotation_euler = (math.radians(-18), math.pi / 2, 0)
    box('waku', 'chestD', (0.72, 0.46, 0.04), (0, 0, 0.36))
    box('jo', 'band', (0.10, 0.03, 0.12), (0, -0.235, 0.32))
    sphere('gem', 'gem', 0.035, (0, -0.255, 0.33))
    for i, x in enumerate((-0.12, 0.0, 0.14)):
        sphere(f'kin{i}', 'gold', 0.06, (x, -0.06, 0.40))
    return dict(target=(0, 0, 0.26), scale=1.15)


def npc_bust(coat, hair=None, bald=False, extra=None):
    """町の人の胸から上（丸い頭、目とほお、服）。extra で髪型や帽子を足す"""
    sphere('body', coat, 0.40, (0, 0, -0.30), (1, 0.75, 0.8))
    cyl('neck', 'skin', 0.09, 0.12, (0, 0, 0.0), verts=12)
    sphere('head', 'skin', 0.27, (0, 0, 0.26))
    for x in (-0.09, 0.09):
        sphere(f'eye{x}', 'eye', 0.03, (x, -0.245, 0.27), (1, 0.6, 1.3))
        sphere(f'cheek{x}', 'cheek', 0.035, (x * 1.6, -0.22, 0.19), (1, 0.5, 0.7))
    if hair:
        sphere('hair', hair, 0.285, (0, 0.035, 0.31), (1.02, 1, 0.92))   # 頭の後ろと上
        box('bang', hair, (0.42, 0.10, 0.10), (0, -0.17, 0.46), bevel=0.04)
    if extra:
        extra()
    return dict(target=(0, 0, 0.10), scale=1.12, el=6, az=-12)


def npc_elder():
    """おじいさん：頭の横だけ白い髪、茶色の上着"""
    def ex():
        for x in (-0.25, 0.25):
            sphere(f'side{x}', 'hairGray', 0.09, (x, 0.02, 0.27), (0.7, 1, 1))
    return npc_bust('cElder', extra=ex)


def npc_granny():
    """おばあさん：白い髪にお団子、むらさきの服"""
    return npc_bust('cGranny', 'hairWhite', extra=lambda: sphere('bun', 'hairWhite', 0.11, (0, 0.17, 0.48)))


def npc_man():
    """男の人：黒い短い髪、青い服"""
    return npc_bust('cMan', 'hairBlack')


def npc_woman():
    """女の人：茶色の長い髪、赤い服"""
    def ex():
        box('long', 'hairBrown', (0.56, 0.24, 0.40), (0, 0.10, 0.12), bevel=0.08)
    return npc_bust('cWoman', 'hairBrown', extra=ex)


def npc_kid():
    """子ども：黄色い帽子、黄色い服"""
    def ex():
        sphere('cap', 'capY', 0.29, (0, 0.02, 0.36), (1.02, 1.02, 0.7))
        box('tsuba', 'capY', (0.30, 0.16, 0.03), (0, -0.25, 0.40))
    return npc_bust('cKid', 'hairBlack', extra=ex)


def npc_student():
    """学生：黒い髪、紺の制服と白いえり"""
    return npc_bust('cStudent', 'hairDark', extra=lambda: box('eri', 'collar', (0.24, 0.05, 0.10), (0, -0.27, -0.06), (0.4, 0, 0)))


def npc_fisher():
    """漁師さん：白いねじりはちまき、青い服"""
    return npc_bust('cFisher', 'hairBlack', extra=lambda: cyl('hachimaki', 'towel', 0.29, 0.07, (0, 0, 0.40), verts=20))


def npc_staff():
    """お店の人・農家さん：茶色の髪、緑の服と白い前かけのひも"""
    return npc_bust('cStaff', 'hairTea', extra=lambda: box('himo', 'collar', (0.36, 0.05, 0.04), (0, -0.29, -0.18)))


def npc_guide():
    """ガイドさん：茶色の髪、黄色い上着、赤い名札"""
    return npc_bust('cGuide', 'hairTea', extra=lambda: box('fuda', 'ribbonR', (0.10, 0.03, 0.07), (0.14, -0.29, -0.14)))


def npc_monk():
    """お坊さん：髪のない頭、黒い衣に金色のけさ"""
    return npc_bust('cMonk', extra=lambda: box('kesa', 'kesa', (0.12, 0.05, 0.62), (0.08, -0.25, -0.26), (0, -0.6, 0)))


# ---------- 下のタブ（マップ・きろく・とくてん・せってい）と上のバー（お城・当店）：32×32 ----------
def tab_map():
    """マップ：三つ折りの地図（緑の陸・青い川・黄色い道）と赤いピン"""
    for i, (x, m, a) in enumerate(((-0.30, 'mapG', 0.25), (0.0, 'mapB', -0.25), (0.30, 'mapG', 0.25))):
        box(f'p{i}', m, (0.30, 0.62, 0.03), (x, 0, 0.05 + (0.04 if i == 1 else 0)), (0, a, 0))
    box('road', 'mapY', (0.88, 0.06, 0.035), (0, 0.05, 0.08), (0, 0, 0.3))
    sphere('pin', 'red', 0.10, (0.06, -0.06, 0.34))
    cyl('pinB', 'red', 0.06, 0.18, (0.06, -0.06, 0.20), verts=12, r2=0.0)
    return dict(target=(0, 0, 0.12), scale=1.1, el=40, size=32)


def tab_note():
    """きろく：緑の表紙のノート（リングとしおり）"""
    box('cover', 'note', (0.58, 0.10, 0.78), (0, 0, 0.39), bevel=0.03)
    box('page', 'paper', (0.50, 0.02, 0.66), (0.03, -0.055, 0.39))
    for i in range(4):
        box(f'line{i}', 'note', (0.34, 0.01, 0.025), (0.06, -0.066, 0.56 - i * 0.12))
    for i in range(4):
        cyl(f'ring{i}', 'ring', 0.05, 0.12, (-0.28, -0.03, 0.66 - i * 0.18), (0, math.pi / 2, 0), 10)
    box('shiori', 'red', (0.06, 0.02, 0.12), (0.18, 0.0, 0.80))
    return dict(target=(0, 0, 0.42), scale=1.05, el=10, az=-20, size=32)


def tab_gift():
    """とくてん：赤いプレゼントの箱と、黄色いリボン"""
    box('hako', 'giftR', (0.60, 0.60, 0.46), (0, 0, 0.23))
    box('futa', 'giftR', (0.66, 0.66, 0.12), (0, 0, 0.50))
    box('rx', 'giftY', (0.14, 0.68, 0.60), (0, 0, 0.29))
    box('ry', 'giftY', (0.68, 0.14, 0.60), (0, 0, 0.29))
    for x in (-0.14, 0.14):
        sphere(f'bow{x}', 'giftY', 0.16, (x * 1.2, 0, 0.66), (1, 0.7, 0.75))
    return dict(target=(0, 0, 0.34), scale=1.1, size=32)


def tab_gear():
    """せってい：歯車"""
    rot = (math.pi / 2, 0, 0)
    cyl('wa', 'gear', 0.34, 0.16, (0, 0, 0), rot, 32)
    for i in range(8):
        a = i / 8 * math.tau
        box(f'ha{i}', 'gear', (0.14, 0.16, 0.14), (0.40 * math.cos(a), 0, 0.40 * math.sin(a)), (0, -a, 0))
    cyl('ana', 'gearD', 0.12, 0.18, (0, 0, 0), rot, 20)
    return dict(target=(0, 0, 0), scale=1.15, el=8, az=-15, size=32)


def bar_castle():
    """上のバー：西尾城（石垣に白い壁と屋根）"""
    opts = area_okazaki()
    opts['size'] = 32
    return opts


def bar_bowl():
    """上のバー（当店）：お茶わんに白いごはん、おはし"""
    cyl('chawan', 'chawan', 0.24, 0.30, (0, 0, 0.15), verts=32, r2=0.40)
    cyl('dai', 'chawan', 0.16, 0.06, (0, 0, -0.02), verts=24)
    sphere('gohan', 'gohan', 0.37, (0, 0, 0.30), (1, 1, 0.55))
    for x in (-0.05, 0.05):
        cyl(f'hashi{x}', 'hashi', 0.025, 0.62, (x + 0.10, 0.05, 0.46), (0, 0.9, 0), 6)
    return dict(target=(0, 0, 0.28), scale=1.1, size=32)


# ---------- きろく の数字の札（game.js の STAT_PI の順）：32×32 ----------
def small(fn):
    """48×48 の絵を、同じ形のまま 32×32 で作る"""
    def f():
        opts = fn()
        opts['size'] = 32
        return opts
    return f


def stat_star():
    """レベル：金の星（立体の五角の星）"""
    bm = bmesh.new()
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = 0.48 if i % 2 == 0 else 0.20
        pts.append((r * math.cos(a), 0, r * math.sin(a)))
    top = [bm.verts.new((x, -0.08, z)) for x, _, z in pts]
    bot = [bm.verts.new((x, 0.08, z)) for x, _, z in pts]
    cf, cb = bm.verts.new((0, -0.16, 0)), bm.verts.new((0, 0.16, 0))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((top[i], top[j], cf))
        bm.faces.new((bot[j], bot[i], cb))
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    me = bpy.data.meshes.new('star')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('star', me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material('hoshi'))
    return dict(target=(0, 0, 0), scale=1.1, el=10, az=-15, size=32)


def stat_book():
    """まちメモ：青い表紙の本（ページが見える）"""
    box('hyoshi', 'hon', (0.58, 0.74, 0.16), (0, 0, 0.08), bevel=0.02)
    box('pages', 'paper', (0.54, 0.70, 0.12), (0.03, 0, 0.08))
    box('obi', 'giftY', (0.58, 0.10, 0.165), (0, -0.18, 0.08))
    return dict(target=(0, 0, 0.06), scale=1.05, el=45, size=32)


def stat_flag():
    """めぐったスポット：赤い旗"""
    cyl('pole', 'pole', 0.03, 0.90, (-0.22, 0, 0.45), verts=8)
    sphere('tama', 'giftY', 0.05, (-0.22, 0, 0.92))
    box('hata', 'flagR', (0.46, 0.03, 0.30), (0.02, 0, 0.72), (0, 0, 0.15))
    return dict(target=(0, 0, 0.46), scale=1.05, el=10, size=32)


def stat_pin():
    """チェックイン：地図のピン（赤い玉としずくの形）"""
    sphere('pin', 'pinR', 0.30, (0, 0, 0.52))
    cyl('saki', 'pinR', 0.26, 0.42, (0, 0, 0.22), (math.pi, 0, 0), 24, r2=0.0)
    sphere('ana', 'white', 0.11, (0, -0.24, 0.55), (1, 0.4, 1))
    return dict(target=(0, 0, 0.40), scale=1.0, el=10, size=32)


def stat_fire():
    """連続日数：ほのお（オレンジの外と黄色い中）"""
    sphere('soto', 'fire', 0.30, (0, 0, 0.26), (1, 0.8, 1.0))
    cyl('soto2', 'fire', 0.27, 0.44, (0, 0, 0.58), verts=16, r2=0.0)
    sphere('naka', 'fireY', 0.16, (0, -0.16, 0.24), (1, 0.6, 1))
    cyl('naka2', 'fireY', 0.14, 0.26, (0, -0.16, 0.44), verts=12, r2=0.0)
    return dict(target=(0, 0, 0.40), scale=1.0, el=8, size=32)


def stat_feet():
    """歩いた距離：二つの足あと"""
    for side, (x, y) in ((-1, (-0.16, 0.12)), (1, (0.16, -0.14))):
        sphere(f'kakato{side}', 'ashi', 0.12, (x, y + 0.14, 0.03), (0.9, 1.1, 0.35))
        sphere(f'tsuchi{side}', 'ashi', 0.15, (x, y - 0.08, 0.03), (0.9, 1.0, 0.35))
        for k in range(3):
            sphere(f'yubi{side}{k}', 'ashi', 0.05, (x - 0.08 + k * 0.08, y - 0.28, 0.03), (1, 1, 0.5))
    return dict(target=(0, 0, 0.02), scale=1.0, el=60, size=32)


def quest():
    """今日のクエスト：ひらいた巻物（上下に木の軸、赤いひも、文字の線）"""
    box('kami', 'paper', (0.56, 0.03, 0.62), (0, 0, 0.40))
    for z in (0.08, 0.72):
        cyl(f'jiku{z}', 'wood', 0.06, 0.72, (0, 0, z), (0, math.pi / 2, 0), 12)
        for x in (-0.38, 0.38):
            sphere(f'tama{z}{x}', 'woodD', 0.06, (x, 0, z))
    for i in range(4):
        box(f'gyo{i}', 'aze', (0.36 - (0.12 if i == 3 else 0), 0.01, 0.035), (-0.04 if i == 3 else 0, -0.02, 0.58 - i * 0.11))
    box('himo', 'red', (0.04, 0.02, 0.22), (0.20, -0.03, 0.0))
    return dict(target=(0, 0, 0.38), scale=1.05, el=8, az=-15, size=32)


# ---------- 地図の上の丸いボタン（せかいちず・車・おまかせ歩き）：32×32 ----------
def btn_globe():
    """せかいちず：青い地球に緑の陸"""
    sphere('chikyu', 'umi', 0.42, (0, 0, 0))
    for i, (x, y, z, r) in enumerate(((-0.12, -0.30, 0.16, 0.16), (0.16, -0.32, -0.06, 0.14), (-0.20, -0.28, -0.18, 0.10), (0.05, -0.36, 0.22, 0.08))):
        sphere(f'riku{i}', 'riku', r, (x, y, z), (1.3, 0.5, 1))
    return dict(target=(0, 0, 0), scale=1.0, el=10, az=-10, size=32)


def btn_car():
    """車に乗る：白い軽トラック（運転席と荷台、黒いタイヤ）"""
    box('cab', 'truck', (0.30, 0.42, 0.34), (0.26, 0, 0.30), bevel=0.04)
    box('mado', 'glass', (0.02, 0.36, 0.14), (0.415, 0, 0.36))
    box('dai', 'truck', (0.80, 0.44, 0.10), (0.0, 0, 0.14))
    box('aori', 'truck', (0.50, 0.44, 0.12), (-0.16, 0, 0.24))
    box('kome', 'kraft', (0.30, 0.30, 0.12), (-0.16, 0, 0.32), bevel=0.03)
    for x in (0.26, -0.26):
        for y in (0.22, -0.22):
            cyl(f'tire{x}{y}', 'tire', 0.09, 0.06, (x, y, 0.09), (math.pi / 2, 0, 0), 16)
    return dict(target=(0, 0, 0.22), scale=1.0, el=20, az=-40, size=32)


def btn_combine():
    """稲刈り：コンバイン（だいだいの車体と運転席、前に稲を刈る刈り取り部、黒いクローラー）"""
    for y in (0.2, -0.2):
        box(f'crawler{y}', 'crawler', (0.66, 0.14, 0.16), (0, y, 0.09), bevel=0.05)
    box('body', 'combine', (0.56, 0.46, 0.26), (-0.04, 0, 0.3), bevel=0.03)
    box('tank', 'combineD', (0.26, 0.22, 0.2), (-0.16, -0.1, 0.52), bevel=0.03)
    box('cab', 'combine', (0.22, 0.2, 0.22), (0.12, 0.12, 0.54), bevel=0.03)
    box('cabG', 'glass', (0.02, 0.17, 0.15), (0.235, 0.12, 0.56))
    box('reaper', 'reaper', (0.18, 0.56, 0.08), (0.42, 0, 0.12), (0, -0.35, 0))
    for y in (-0.22, -0.07, 0.07, 0.22):
        cyl(f'bunri{y}', 'reaper', 0.025, 0.12, (0.53, y, 0.08), (0, 1.2, 0), 6, r2=0.0)
    cyl('auger', 'combineD', 0.03, 0.5, (-0.1, -0.2, 0.62), (0, math.pi / 2, 0.3), 8)
    return dict(target=(0.02, 0, 0.3), scale=1.1, el=22, az=-40, size=32)


def btn_walker():
    """降りる（歩く）：黄色い髪に青い服の主人公が歩くところ"""
    sphere('atama', 'skin', 0.13, (0, 0, 0.78))
    sphere('kami', 'hairY', 0.14, (0, 0.03, 0.82), (1, 1, 0.8))
    box('karada', 'shirt', (0.22, 0.14, 0.30), (0, 0, 0.50), bevel=0.04)
    for side in (-1, 1):
        box(f'ashi{side}', 'pants', (0.08, 0.09, 0.30), (side * 0.06, side * 0.06, 0.20), (side * 0.35, 0, 0))
        box(f'ude{side}', 'shirt', (0.06, 0.07, 0.24), (side * 0.15, -side * 0.05, 0.52), (-side * 0.4, 0, 0))
    return dict(target=(0, 0, 0.48), scale=1.05, el=8, az=-70, size=32)


def btn_compass():
    """おまかせ歩き：方位磁石（金のふち、白い文字盤、赤と青の針）"""
    rot = (math.pi / 2, 0, 0)
    cyl('fuchi', 'gold', 0.44, 0.10, (0, 0, 0), rot, 40)
    cyl('ban', 'white', 0.36, 0.11, (0, 0, 0), rot, 40)
    cyl('kita', 'hari', 0.07, 0.30, (0, -0.07, 0.15), (0, 0, 0), 4, r2=0.0)
    cyl('minami', 'hariB', 0.07, 0.30, (0, -0.07, -0.15), (math.pi, 0, 0), 4, r2=0.0)
    sphere('jiku', 'gold', 0.04, (0, -0.08, 0))
    return dict(target=(0, 0, 0), scale=1.0, el=6, az=-10, size=32)


def calendar():
    """行事・あした：めくりカレンダー（赤い上の帯、白い紙に日付のます、金のリング）"""
    box('kami', 'white', (0.70, 0.06, 0.66), (0, 0, 0.33))
    box('obi', 'red', (0.72, 0.07, 0.18), (0, 0, 0.62))
    for x in (-0.18, 0.18):
        cyl(f'ring{x}', 'gold', 0.035, 0.18, (x, -0.02, 0.72), verts=10)
    for r in range(3):
        for c in range(4):
            box(f'masu{r}{c}', 'dark' if (r, c) != (1, 2) else 'red', (0.09, 0.02, 0.07), (-0.21 + c * 0.14, -0.04, 0.43 - r * 0.13))
    return dict(target=(0, 0, 0.38), scale=1.0, el=6, az=-12, size=32)


def card():
    """西尾ドット絵帳：金の額に入った、空と田んぼとお城の絵"""
    box('waku', 'gold', (0.74, 0.06, 0.62), (0, 0, 0.31), bevel=0.02)
    box('sora', 'glass', (0.62, 0.065, 0.30), (0, 0, 0.42))
    box('ta', 'riku', (0.62, 0.065, 0.20), (0, 0, 0.17))
    box('shiro', 'white', (0.12, 0.07, 0.12), (0.12, 0, 0.32))
    cyl('yane', 'roof', 0.10, 0.06, (0.12, -0.005, 0.41), (0, 0, math.pi / 4), 4, r2=0.02)
    sphere('hi', 'sun', 0.05, (-0.18, -0.01, 0.48))
    return dict(target=(0, 0, 0.31), scale=1.0, el=6, az=-12, size=32)


def medal():
    """バッジのメダル（赤と白のリボンに、金のメダル。まんなかは平らにして、バッジの絵を上にのせる）"""
    rot = (math.pi / 2, 0, 0)
    for side in (-1, 1):   # V の字のリボン（赤・白・赤）
        for j, (dx, m) in enumerate(((-0.07, 'ribbonR'), (0.0, 'ribbonW'), (0.07, 'ribbonR'))):
            box(f'rib{side}{j}', m, (0.07, 0.03, 0.40), (side * 0.13 + dx, 0.06, 0.40), (0, side * 0.35, 0))
    cyl('rim', 'medal', 0.40, 0.10, (0, 0, -0.08), rot, 48)
    cyl('face', 'medalL', 0.31, 0.11, (0, 0, -0.08), rot, 48)
    for i in range(16):   # ふちのぎざぎざ
        a = i / 16 * math.tau
        sphere(f'g{i}', 'medal', 0.045, (0.40 * math.cos(a), 0, -0.08 + 0.40 * math.sin(a)), (1, 0.8, 1))
    return dict(target=(0, 0, 0.06), scale=1.28, el=8, az=0)


def talk():
    """話しかける：白い吹き出し（下に小さなしっぽ、なかに点が三つ）"""
    rot = (math.pi / 2, 0, 0)
    cyl('fukidashi', 'white', 0.42, 0.10, (0, 0, 0.46), rot, 40).scale = (1.0, 0.72, 1.0)   # 横長のだ円に
    cyl('shippo', 'white', 0.12, 0.30, (-0.20, 0, 0.12), (0, -0.5, 0), 3, r2=0.0)
    for i, x in enumerate((-0.18, 0, 0.18)):
        sphere(f'ten{i}', 'dark', 0.07, (x, -0.07, 0.46), (1, 0.6, 1))
    return dict(target=(0, 0, 0.36), scale=1.0, el=6, az=-12, size=32)


def clock():
    """時間・あした：目ざまし時計（赤いふち、白い文字盤、黒い針、上に金のベル）"""
    rot = (math.pi / 2, 0, 0)
    cyl('fuchi', 'red', 0.38, 0.16, (0, 0, 0.42), rot, 40)
    cyl('ban', 'white', 0.30, 0.17, (0, 0, 0.42), rot, 40)
    for x in (-0.24, 0.24):
        sphere(f'bell{x}', 'gold', 0.12, (x, 0, 0.80), (1, 1, 0.8))
        cyl(f'ashi{x}', 'dark', 0.03, 0.14, (x * 0.9, 0, 0.06), (0, x * 1.6, 0), 8)
    box('nagai', 'dark', (0.035, 0.02, 0.22), (0, -0.09, 0.51))
    box('mijikai', 'dark', (0.16, 0.02, 0.035), (0.07, -0.09, 0.42))
    sphere('jiku', 'red', 0.035, (0, -0.10, 0.42))
    return dict(target=(0, 0, 0.44), scale=1.0, el=6, az=-12, size=32)


def lock():
    """まだ見つけていない題材：南京錠（銀のつると金の本体、黒い鍵穴）"""
    tube('tsuru', 'steel', [(-0.2, 0, 0.42), (-0.2, 0, 0.66), (0, 0, 0.82), (0.2, 0, 0.66), (0.2, 0, 0.42)], 0.06)
    box('hontai', 'gold', (0.62, 0.22, 0.5), (0, 0, 0.25), bevel=0.05)
    cyl('kagiana', 'dark', 0.06, 0.05, (0, -0.11, 0.3), (math.pi / 2, 0, 0), 12)
    box('kagiana2', 'dark', (0.04, 0.05, 0.14), (0, -0.11, 0.2))
    return dict(target=(0, 0, 0.42), scale=1.05, el=8, az=-15)


def ticket():
    """クーポン：赤い帯の券（点線の切り取り線）"""
    box('kami', 'white', (0.86, 0.04, 0.48), (0, 0, 0.3), (0, 0, 0))
    box('obi', 'red', (0.24, 0.045, 0.48), (-0.31, 0, 0.3))
    for i in range(5):
        box(f'kiri{i}', 'dark', (0.02, 0.05, 0.05), (-0.16, 0, 0.12 + i * 0.09))
    for i in range(3):
        box(f'gyo{i}', 'kraftD', (0.36 - i * 0.08, 0.045, 0.04), (0.12 - i * 0.04, 0, 0.42 - i * 0.1))
    return dict(target=(0, 0, 0.3), scale=1.0, el=6, az=-12, size=32)


def new_badge():
    """はじめて：金にかがやく四つ角のきらめき（大と小）"""
    for j, (x, z, r) in enumerate(((0.0, 0.45, 0.42), (0.32, 0.78, 0.16))):
        bm = bmesh.new()
        pts = [(math.cos(i * math.pi / 4 + math.pi / 2) * (r if i % 2 == 0 else r * 0.28), math.sin(i * math.pi / 4 + math.pi / 2) * (r if i % 2 == 0 else r * 0.28)) for i in range(8)]
        f = [bm.verts.new((x + px, -0.05, z + pz)) for px, pz in pts]
        b_ = [bm.verts.new((x + px, 0.05, z + pz)) for px, pz in pts]
        cf, cb = bm.verts.new((x, -0.12, z)), bm.verts.new((x, 0.12, z))
        for i in range(8):
            k = (i + 1) % 8
            bm.faces.new((f[i], f[k], cf))
            bm.faces.new((b_[k], b_[i], cb))
            bm.faces.new((f[i], b_[i], b_[k], f[k]))
        me = bpy.data.meshes.new(f'kira{j}')
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f'kira{j}', me)
        bpy.context.scene.collection.objects.link(o)
        me.materials.append(material('goldL' if j else 'gold'))
    return dict(target=(0.05, 0, 0.5), scale=1.05, el=6, az=-12, size=32)


# ---------- スポットの種類（game.js の CATS）：32×32 ----------
def cat_shrine():
    """神社：赤い鳥居"""
    for x in (-0.3, 0.3):
        cyl(f'hashira{x}', 'torii', 0.05, 0.8, (x, 0, 0.4), verts=10)
    box('kasagi', 'torii', (0.9, 0.1, 0.08), (0, 0, 0.84), bevel=0.02)
    box('kasagiK', 'dark', (0.92, 0.11, 0.03), (0, 0, 0.89))
    box('nuki', 'torii', (0.72, 0.07, 0.06), (0, 0, 0.66))
    box('gakuT', 'gold', (0.1, 0.03, 0.12), (0, -0.04, 0.75))
    return dict(target=(0, 0, 0.45), scale=1.05, el=8, az=-12, size=32)


def cat_temple():
    """お寺：はすの花"""
    for i in range(8):
        a = i * math.tau / 8
        sphere(f'ben{i}', 'hasu', 0.13, (0.18 * math.cos(a), 0.18 * math.sin(a), 0.3), (1.6, 0.7, 0.8)).rotation_euler = (0, 0.5, a)
    for i in range(5):
        a = i * math.tau / 5 + 0.3
        sphere(f'uchi{i}', 'hasuL', 0.1, (0.08 * math.cos(a), 0.08 * math.sin(a), 0.4), (1.3, 0.7, 1.0)).rotation_euler = (0, 0.3, a)
    sphere('ha', 'hasuHa', 0.42, (0, 0.05, 0.15), (1.2, 1.0, 0.15))
    sphere('shin', 'gold', 0.06, (0, 0, 0.44))
    return dict(target=(0, 0, 0.3), scale=1.0, el=30, az=-15, size=32)


def cat_worship():
    """祈りの場：小さなほこら（石の台に木の祠）"""
    box('dai', 'stone', (0.6, 0.5, 0.16), (0, 0, 0.08))
    box('hokora', 'wood', (0.4, 0.34, 0.34), (0, 0, 0.33))
    box('to', 'woodD', (0.2, 0.02, 0.24), (0, -0.17, 0.3))
    cyl('yane', 'roof', 0.36, 0.22, (0, 0, 0.6), (0, 0, math.pi / 4), 4, r2=0.02)
    box('shime', 'white', (0.44, 0.02, 0.04), (0, -0.18, 0.47))
    return dict(target=(0, 0, 0.36), scale=1.0, el=10, az=-20, size=32)


def cat_castle():
    """城跡：石垣の上の白い天守"""
    box('ishigaki', 'stone', (0.8, 0.6, 0.22), (0, 0, 0.11))
    box('kai1', 'white', (0.6, 0.44, 0.24), (0, 0, 0.34))
    cyl('yane1', 'kawara', 0.5, 0.14, (0, 0, 0.52), (0, 0, math.pi / 4), 4, r2=0.3)
    box('kai2', 'white', (0.36, 0.28, 0.18), (0, 0, 0.66))
    cyl('yane2', 'kawara', 0.32, 0.18, (0, 0, 0.84), (0, 0, math.pi / 4), 4, r2=0.03)
    for x in (-0.12, 0.12):
        box(f'mado{x}', 'dark', (0.06, 0.02, 0.06), (x, -0.23, 0.36))
    sphere('shachi', 'gold', 0.035, (0, 0, 0.95))
    return dict(target=(0, 0, 0.48), scale=1.05, el=10, az=-20, size=32)


def cat_historic():
    """史跡：石碑"""
    box('dai', 'stone', (0.56, 0.4, 0.12), (0, 0, 0.06))
    box('hi', 'zou', (0.3, 0.14, 0.7), (0, 0, 0.47), bevel=0.03)
    for i in range(3):
        box(f'moji{i}', 'dark', (0.04, 0.02, 0.4 - i * 0.1), (-0.07 + i * 0.07, -0.075, 0.5 + i * 0.03))
    return dict(target=(0, 0, 0.42), scale=1.0, el=10, az=-20, size=32)


def cat_museum():
    """博物館・資料館：柱の並んだ建物と三角の屋根"""
    box('kidan', 'stone', (0.86, 0.5, 0.1), (0, 0, 0.05))
    for i in range(4):
        cyl(f'hashira{i}', 'white', 0.05, 0.42, (-0.3 + i * 0.2, -0.12, 0.31), verts=10)
    box('oku', 'paper', (0.76, 0.3, 0.42), (0, 0.1, 0.31))
    box('hari', 'white', (0.86, 0.5, 0.08), (0, 0, 0.56))
    cyl('sankaku', 'white', 0.5, 0.42, (0, 0, 0.68), (math.pi / 2, 0, 0), 3, r2=0.5).scale = (1, 0.5, 1)
    return dict(target=(0, 0, 0.42), scale=1.05, el=8, az=-15, size=32)


def cat_view():
    """展望スポット：山と朝日"""
    sphere('hi', 'asahi', 0.2, (0.12, 0.2, 0.62))
    sphere('yama', 'riku', 0.45, (-0.15, 0, 0.0), (1.2, 0.6, 1.1))
    sphere('yama2', 'leaf', 0.35, (0.3, -0.1, 0.0), (1.1, 0.6, 1.0))
    return dict(target=(0.02, 0, 0.36), scale=1.4, el=6, az=-10, size=32)


def cat_art():
    """アート：台の上の石の像"""
    box('dai', 'woodD', (0.44, 0.44, 0.24), (0, 0, 0.12))
    sphere('do', 'zou', 0.18, (0, 0, 0.4), (1, 0.8, 1.2))
    sphere('atama', 'zou', 0.11, (0, 0, 0.66))
    return dict(target=(0, 0, 0.4), scale=1.0, el=10, az=-20, size=32)


def cat_sight():
    """名所：カメラ"""
    box('hontai', 'kamera', (0.7, 0.3, 0.42), (0, 0, 0.3), bevel=0.04)
    box('ue', 'kamera', (0.24, 0.26, 0.12), (-0.12, 0, 0.56), bevel=0.02)
    cyl('lens', 'steel', 0.15, 0.14, (0.04, -0.18, 0.3), (math.pi / 2, 0, 0), 20)
    cyl('lensG', 'lens', 0.1, 0.15, (0.04, -0.19, 0.3), (math.pi / 2, 0, 0), 20)
    box('flash', 'white', (0.1, 0.02, 0.06), (0.24, -0.16, 0.44))
    return dict(target=(0, 0, 0.34), scale=1.0, el=10, az=-15, size=32)


def cat_park():
    """公園：木とベンチ"""
    cyl('miki', 'woodD', 0.05, 0.5, (-0.18, 0.1, 0.25), verts=8)
    sphere('ha', 'leaf', 0.3, (-0.18, 0.1, 0.62))
    box('za', 'bench', (0.44, 0.16, 0.04), (0.2, -0.08, 0.2))
    box('se', 'bench', (0.44, 0.04, 0.14), (0.2, 0.0, 0.3))
    for x in (0.02, 0.38):
        box(f'ashi{x}', 'dark', (0.03, 0.14, 0.18), (x, -0.06, 0.09))
    return dict(target=(0.02, 0, 0.36), scale=1.05, el=12, az=-20, size=32)


def cat_library():
    """図書館：立てて並んだ本"""
    for i, m in enumerate(('red', 'hon', 'giftY', 'note', 'navy')):
        h = 0.5 + (i % 3) * 0.08
        box(f'hon{i}', m, (0.12, 0.4, h), (-0.28 + i * 0.14, 0, h / 2), (0, 0.12 if i == 4 else 0, 0))
    return dict(target=(0, 0, 0.3), scale=1.0, el=10, az=-25, size=32)


def cat_station():
    """駅：赤い電車の正面"""
    box('sha', 'densha', (0.6, 0.5, 0.62), (0, 0, 0.36), bevel=0.06)
    box('mado', 'glass', (0.44, 0.02, 0.2), (0, -0.25, 0.5))
    for x in (-0.18, 0.18):
        sphere(f'light{x}', 'yellow', 0.04, (x, -0.26, 0.2))
    box('obi', 'white', (0.61, 0.51, 0.04), (0, 0, 0.3))
    box('pan', 'dark', (0.06, 0.06, 0.16), (0, 0, 0.75))
    box('rail', 'steel', (0.8, 0.06, 0.03), (0, -0.2, 0.02))
    return dict(target=(0, 0, 0.38), scale=1.0, el=8, az=-15, size=32)


def cat_townhall():
    """市役所・支所：旗の立つ四角い建物"""
    box('tatemono', 'paper', (0.7, 0.4, 0.5), (0, 0, 0.25))
    for r in range(2):
        for c in range(4):
            box(f'mado{r}{c}', 'glass', (0.1, 0.02, 0.1), (-0.24 + c * 0.16, -0.21, 0.16 + r * 0.18))
    box('iriguchi', 'dark', (0.14, 0.02, 0.12), (0, -0.21, 0.06))
    cyl('pole', 'dark', 0.025, 0.42, (0.22, 0, 0.7), verts=6)
    box('hata', 'hata', (0.2, 0.03, 0.13), (0.32, 0, 0.84))
    return dict(target=(0, 0, 0.42), scale=1.05, el=10, az=-20, size=32)


def cat_beach():
    """海岸：砂浜と海とパラソル"""
    box('suna', 'sand', (0.9, 0.5, 0.06), (0, -0.1, 0.03))
    box('umi', 'sea', (0.9, 0.3, 0.05), (0, 0.3, 0.025))
    cyl('pole', 'white', 0.015, 0.6, (0.05, -0.1, 0.33), (0, 0.2, 0), 6)
    cyl('kasa', 'parasol', 0.34, 0.16, (0.1, -0.1, 0.62), (0, 0.2, 0), 8, r2=0.02)
    cyl('kasaW', 'parasolW', 0.345, 0.04, (0.1, -0.1, 0.56), (0, 0.2, 0), 8)
    return dict(target=(0, 0, 0.32), scale=1.05, el=14, az=-20, size=32)


def pixmap():
    """ドット絵の地図に切りかえる：四角いブロックを並べた小さな地図（田・海・家）"""
    cols = [['mapG', 'mapG', 'mapB'], ['mapY', 'mapG', 'mapB'], ['mapG', 'yaneR', 'mapG']]
    for r, row in enumerate(cols):
        for c, m in enumerate(row):
            h = 0.18 if m == 'yaneR' else 0.08 if m != 'mapB' else 0.05
            box(f'b{r}{c}', m, (0.26, 0.26, h), (-0.27 + c * 0.27, -0.27 + r * 0.27, h / 2))
    box('kabe', 'wall', (0.2, 0.2, 0.12), (0, 0.27, 0.06))
    return dict(target=(0, 0, 0.06), scale=1.15, el=40, az=-30, size=32)


MODELS = {'ricebag': ricebag, 'coin': coin, 'up-spd': up_spd, 'up-bag': up_bag, 'up-nap': up_nap, 'chest': chest, 'medal': medal, 'omiyage': small(omiyage)}
MODELS.update({'stat-coin': small(coin), 'stat-star': stat_star, 'stat-book': stat_book, 'stat-face': small(lambda: npc_bust('cMan', 'hairBlack')),
               'stat-flag': stat_flag, 'stat-pin': stat_pin, 'stat-feet': stat_feet, 'stat-fire': stat_fire, 'stat-medal': small(lambda: medal()),
               'stat-chest': small(lambda: chest()), 'quest': quest, 'home': small(lambda: up_nap())})
MODELS.update({'calendar': calendar, 'card': card, 'talk': talk, 'clock': clock, 'lock': lock, 'ticket': ticket, 'new': new_badge, 'pixmap': pixmap})
MODELS.update({f'cat-{k}': v for k, v in (('shrine', cat_shrine), ('temple', cat_temple), ('worship', cat_worship), ('castle', cat_castle), ('historic', cat_historic),
               ('museum', cat_museum), ('view', cat_view), ('art', cat_art), ('sight', cat_sight), ('park', cat_park), ('library', cat_library),
               ('station', cat_station), ('townhall', cat_townhall), ('beach', cat_beach))})
MODELS.update({'btn-combine': btn_combine})
MODELS.update({'btn-globe': btn_globe, 'btn-car': btn_car, 'btn-walker': btn_walker, 'btn-compass': btn_compass})
MODELS.update({'tab-map': tab_map, 'tab-note': tab_note, 'tab-gift': tab_gift, 'tab-gear': tab_gear, 'bar-castle': bar_castle, 'bar-bowl': bar_bowl})
MODELS.update({f'npc-{k}': v for k, v in (('elder', npc_elder), ('granny', npc_granny), ('man', npc_man), ('woman', npc_woman), ('kid', npc_kid),
    ('student', npc_student), ('fisher', npc_fisher), ('staff', npc_staff), ('guide', npc_guide), ('monk', npc_monk))})
MODELS.update({f'paddy-{k}': v for k, v in (('stubble', paddy_stubble), ('soil', paddy_soil), ('flooded', paddy_flooded), ('green', paddy_green), ('gold', paddy_gold))})
MODELS.update({f'wx-{k}': v for k, v in (('sunny', wx_sun), ('cloudy', wx_cloudy), ('rain', wx_rain), ('snow', wx_snow))})
MODELS.update({f'area-{k}': v for k, v in (
    ('nishio', area_nishio), ('isshiki', area_isshiki), ('kira', area_kira), ('hazu', area_hazu), ('sakushima', area_sakushima),
    ('okazaki', area_okazaki), ('anjo', area_anjo), ('hekinan', area_hekinan), ('takahama', area_takahama), ('kota', area_kota),
    ('gamagori', area_gamagori))})


# ---------- 描いて、ドット絵にする ----------
def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    sc.cycles.use_denoising = False
    sc.render.film_transparent = True
    sc.render.filter_size = 0.01   # 材質の境目をまぜない
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    return sc


def add_camera_light(sc, target, scale, el=28, az=-35):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = scale
    d, el, az = 10, math.radians(el), math.radians(az)   # 斜め上（左前）から見る
    cam.location = (target[0] + d * math.cos(el) * math.sin(az), target[1] - d * math.cos(el) * math.cos(az), target[2] + d * math.sin(el))
    cam.rotation_euler = (math.pi / 2 - el, 0, az)
    sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.angle = math.radians(3)
    sun.rotation_euler = Vector((2.5, 6, -8)).to_track_quat('-Z', 'Y').to_euler()   # 左上の前から（前の面はふつう、上は明るい、右の面は影）


def set_materials(mode):
    names = sorted({m.get('nsg') for m in bpy.data.materials if m.get('nsg')})   # この絵で使っている材質だけ
    for m in bpy.data.materials:
        key = m.get('nsg')
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        if mode == 'light':   # みな同じ白で、光の当たり具合だけを見る
            sh = nt.nodes.new('ShaderNodeBsdfDiffuse')
            sh.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
            nt.links.new(sh.outputs[0], out.inputs['Surface'])
        else:                 # 材質ごとに決まった色（光なし）
            i = names.index(key) + 1
            sh = nt.nodes.new('ShaderNodeEmission')
            sh.inputs['Color'].default_value = (i / (len(names) + 1), 0, 0, 1)
            nt.links.new(sh.outputs[0], out.inputs['Surface'])
    return names


def render(sc, path, samples):
    sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)[::-1]
    bpy.data.images.remove(img)
    return a


def srgb(v):
    return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


def tones5(h):   # 5段（影・影より・ふつう・明るめ・明るい）：細かく作りこむ絵（当店など）用
    t = tones(h)
    return [t[0], [(a + b) / 2 for a, b in zip(t[0], t[1])], t[1], [(a + b) / 2 for a, b in zip(t[1], t[2])], t[2]]


def to_pixel(light, ids, names, n=SIZE, opts=None):
    # opts（細かく作りこむ絵だけ）：vote 4×4 の中で いちばん多い材質にする（細い字や線が 消えたり 出たりしない）・
    #   bands 5 なら 5段の明るさ・inner 材質の さかいの点を 少し暗く（窓・看板・ひさしの くぎりが 見えるように）
    opts = opts or {}
    c = SS // 2   # 4×4 の真ん中の点
    L = light[c::SS, c::SS][:n, :n]
    I = ids[c::SS, c::SS][:n, :n]
    alpha = (I[..., 3] > 0.5)
    id_srgb = np.array([srgb((i + 1) / (len(names) + 1)) for i in range(len(names))])   # 材質の色分けが PNG に入ったときの値
    lum = L[..., :3].mean(axis=2) / np.maximum(L[..., 3], 1e-4)
    kmap = np.full((n, n), -1, dtype=np.int32)
    if opts.get('vote'):
        B = ids[:n * SS, :n * SS]
        kk = np.abs(id_srgb[None, None, :] - B[..., 0:1]).argmin(axis=2)
        kk[B[..., 3] <= 0.5] = -1
        Lb = light[:n * SS, :n * SS]
        lumb = Lb[..., :3].mean(axis=2) / np.maximum(Lb[..., 3], 1e-4)
        kk = kk.reshape(n, SS, n, SS).transpose(0, 2, 1, 3).reshape(n, n, SS * SS)
        lumb = lumb.reshape(n, SS, n, SS).transpose(0, 2, 1, 3).reshape(n, n, SS * SS)
        for y in range(n):
            for x in range(n):
                v = kk[y, x]
                op = v[v >= 0]
                if len(op) * 2 < len(v):
                    alpha[y, x] = False
                    continue
                alpha[y, x] = True
                k = int(np.bincount(op).argmax())
                kmap[y, x] = k
                lum[y, x] = float(lumb[y, x][v == k].mean())
    out = np.zeros((n, n, 4), dtype=np.uint8)
    five = opts.get('bands') == 5
    for y in range(n):
        for x in range(n):
            if not alpha[y, x]:
                continue
            k = kmap[y, x] if kmap[y, x] >= 0 else int(np.argmin(np.abs(id_srgb - I[y, x, 0])))
            kmap[y, x] = k
            if five:
                l = lum[y, x]
                band = 0 if l < 0.24 else 1 if l < 0.42 else 2 if l < 0.66 else 3 if l < 0.80 else 4
                out[y, x, :3] = [int(v) for v in tones5(MATS[names[k]])[band]]
            else:
                band = 0 if lum[y, x] < 0.28 else 1 if lum[y, x] < 0.70 else 2
                out[y, x, :3] = tones(MATS[names[k]])[band]
            out[y, x, 3] = 255
    if opts.get('inner'):   # 材質の さかい（上か左が ちがう材質）の点を 少し暗く
        f = opts['inner'] if isinstance(opts['inner'], float) else 0.86
        for y in range(n):
            for x in range(n):
                if not alpha[y, x]:
                    continue
                k = kmap[y, x]
                if (y > 0 and alpha[y - 1, x] and kmap[y - 1, x] != k) or (x > 0 and alpha[y, x - 1] and kmap[y, x - 1] != k):
                    out[y, x, :3] = (out[y, x, :3] * f).astype(np.uint8)
    # ふちどり：絵のすぐ外側の点を黒く
    a = out[..., 3] > 0
    edge = np.zeros_like(a)
    edge[1:, :] |= a[:-1, :]
    edge[:-1, :] |= a[1:, :]
    edge[:, 1:] |= a[:, :-1]
    edge[:, :-1] |= a[:, 1:]
    edge &= ~a
    out[edge, :3] = OUTLINE
    out[edge, 3] = 255
    return out


def save_png(arr, path):
    n = arr.shape[0]
    img = bpy.data.images.new('out', n, n, alpha=True)
    img.pixels[:] = (arr[::-1].astype(np.float32) / 255).ravel()
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def make(name):
    sc = setup_scene()
    opts = MODELS[name]()
    n = opts.get('size', SIZE)
    sc.render.resolution_x = sc.render.resolution_y = n * SS
    add_camera_light(sc, opts['target'], opts['scale'], opts.get('el', 28), opts.get('az', -35))
    os.makedirs(TMP, exist_ok=True)
    names = set_materials('id')
    sc.view_settings.view_transform = 'Standard'
    ids = render(sc, os.path.join(TMP, f'{name}-id.png'), 1)
    set_materials('light')
    light = render(sc, os.path.join(TMP, f'{name}-light.png'), 64)
    px = to_pixel(light, ids, names, n, opts)
    os.makedirs(OUT, exist_ok=True)
    save_png(px, os.path.join(OUT, f'{name}.png'))
    print('wrote', os.path.relpath(os.path.join(OUT, f'{name}.png'), ROOT))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        make(name)

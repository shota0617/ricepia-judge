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
SIZE, SS = 48, 4                      # できあがりの大きさと、描くときの倍率
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
}


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tones(h):   # 影（少し青みに寄せて暗く）・ふつう・明るい
    r, g, b = hex2rgb(h)
    shadow = (int(r * 0.62), int(g * 0.62), int(min(255, b * 0.72 + 12)))
    light = tuple(int(c + (255 - c) * 0.38) for c in (r, g, b))
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


def mill():
    """コイン精米機（青い箱。上にお米を入れる口、前にお金を入れる所と赤いボタン、下に精米したお米の出口）"""
    box('cab', 'blue', (0.62, 0.52, 1.00), (0, 0, 0.50), bevel=0.03)
    box('panel', 'white', (0.50, 0.02, 0.34), (0, -0.265, 0.70), bevel=0.01)
    box('slot', 'dark', (0.10, 0.02, 0.05), (-0.12, -0.28, 0.76))
    cyl('btn', 'red', 0.045, 0.03, (0.10, -0.28, 0.76), (math.pi / 2, 0, 0), 16)
    box('coinwin', 'glass', (0.14, 0.02, 0.07), (0, -0.28, 0.62))
    box('chute', 'steel', (0.24, 0.20, 0.08), (0, -0.30, 0.26), (0.35, 0, 0), bevel=0.01)
    box('base', 'navy', (0.66, 0.56, 0.08), (0, 0, 0.04))
    cyl('hopper', 'steel', 0.34, 0.26, (0, 0.02, 1.13), (0, 0, math.pi / 4), 4, r2=0.14)   # 逆さのじょうご
    box('rim', 'yellow', (0.50, 0.50, 0.04), (0, 0.02, 1.27), (0, 0, 0))
    for i in range(6):   # 口に入ったお米
        sphere(f'r{i}', 'rice', 0.05, (0.08 * (i % 3) - 0.08, 0.02 + 0.06 * (i // 3) - 0.03, 1.28), (1, 1, 0.6))
    return dict(target=(0, 0, 0.66), scale=1.5)


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


MODELS = {'ricebag': ricebag, 'mill': mill, 'coin': coin}
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
    sc.render.resolution_x = sc.render.resolution_y = SIZE * SS
    sc.render.filter_size = 0.01   # 材質の境目をまぜない
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    return sc


def add_camera_light(sc, target, scale):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = scale
    d, el, az = 10, math.radians(28), math.radians(-35)   # 斜め上（左前）から見る
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


def to_pixel(light, ids, names):
    n = SIZE
    c = SS // 2   # 4×4 の真ん中の点
    L = light[c::SS, c::SS][:n, :n]
    I = ids[c::SS, c::SS][:n, :n]
    alpha = (I[..., 3] > 0.5)
    id_srgb = np.array([srgb((i + 1) / (len(names) + 1)) for i in range(len(names))])   # 材質の色分けが PNG に入ったときの値
    lum = L[..., :3].mean(axis=2) / np.maximum(L[..., 3], 1e-4)
    out = np.zeros((n, n, 4), dtype=np.uint8)
    for y in range(n):
        for x in range(n):
            if not alpha[y, x]:
                continue
            k = int(np.argmin(np.abs(id_srgb - I[y, x, 0])))
            band = 0 if lum[y, x] < 0.28 else 1 if lum[y, x] < 0.70 else 2
            out[y, x, :3] = tones(MATS[names[k]])[band]
            out[y, x, 3] = 255
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
    add_camera_light(sc, opts['target'], opts['scale'])
    os.makedirs(TMP, exist_ok=True)
    names = set_materials('id')
    sc.view_settings.view_transform = 'Standard'
    ids = render(sc, os.path.join(TMP, f'{name}-id.png'), 1)
    set_materials('light')
    light = render(sc, os.path.join(TMP, f'{name}-light.png'), 64)
    px = to_pixel(light, ids, names)
    os.makedirs(OUT, exist_ok=True)
    save_png(px, os.path.join(OUT, f'{name}.png'))
    print('wrote', os.path.relpath(os.path.join(OUT, f'{name}.png'), ROOT))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        make(name)

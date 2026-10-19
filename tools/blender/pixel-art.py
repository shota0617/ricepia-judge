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


MODELS = {'ricebag': ricebag, 'mill': mill, 'coin': coin}


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
    names = sorted(MATS)
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
            sh.inputs['Color'].default_value = (i / 16, 0, 0, 1)
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


ID_SRGB = np.array([srgb((i + 1) / 16) for i in range(15)])   # 材質の色分け（1/16 ずつ）が PNG に入ったときの値


def to_pixel(light, ids, names):
    n = SIZE
    c = SS // 2   # 4×4 の真ん中の点
    L = light[c::SS, c::SS][:n, :n]
    I = ids[c::SS, c::SS][:n, :n]
    alpha = (I[..., 3] > 0.5)
    lum = L[..., :3].mean(axis=2) / np.maximum(L[..., 3], 1e-4)
    out = np.zeros((n, n, 4), dtype=np.uint8)
    for y in range(n):
        for x in range(n):
            if not alpha[y, x]:
                continue
            k = int(np.argmin(np.abs(ID_SRGB[:len(names)] - I[y, x, 0])))
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

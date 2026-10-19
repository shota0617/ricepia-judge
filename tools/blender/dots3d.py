# にしおさんぽGO：西尾ドット絵帳 No.1〜10000 を Blender で作る（25題材 × 季節と時間帯16 × 置き方25）
# - 題材ごとに立体の景色を作り（置き方 a：見る向き・位置、b：小物、s：季節）、Cycles で 4倍の大きさに2回描く（光の当たり具合／材質ごとの色分け）
#   → 4×4 の真ん中の点を取って 48×48 に。材質の番号と明るさの段（影・ふつう・明るい）だけを TMP に保存する（この1段目に bpy が要る）
# - 2段目（tools/blender/dots3d-sheets.py。bpy は要らない）で、季節の色・時間帯の色あい・空（日・月・星・雲）をのせて PNG のシート（題材・季節・時間帯ごと）にする
# - 題材・番号・季節と時間帯の意味は nishio-go/dots.js と同じ（行事は s が場面、t が人出か時間）。題材の事実は dots.js の注のとおり
# 使い方：pip install bpy（Blender 5.1 の Python 版。Python 3.13）
#         python tools/blender/dots3d.py                 （ぜんぶ。--jobs 3 で3つに分けて並べて描く）
#         python tools/blender/dots3d.py tanbo jissoji   （題材をえらんで）
#         python tools/blender/dots3d-sheets.py          （シートにする → nishio-go/dots3d/）
import importlib.util
import math
import os
import random
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
PA = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(PA)   # 立体を作る道具（box・cyl・sphere・tube・material）と、描く道具を借りる
import bpy  # noqa: E402  （pixel-art.py が先に読み込んでいる）
from mathutils import Vector  # noqa: E402

box, cyl, sphere, tube, material = PA.box, PA.cyl, PA.sphere, PA.tube, PA.material
N, SS = 48, 4
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-dots3d')


# ---------- 景色の部品 ----------
def lifted(fn):
    """部品を z だけ上に置けるようにする（土手の上の松など）"""
    def f(*args, z=0.0, **kw):
        before = set(bpy.data.objects)
        fn(*args, **kw)
        for o in set(bpy.data.objects) - before:
            o.location.z += z
    return f

def ground(mat='shiba', size=400, z=0.0):
    box('ground', mat, (size, size, 0.02), (0, size / 2 - 20, z - 0.01))


def sea(y0, mat='umi', z=-0.05):
    box('sea', mat, (400, 400, 0.02), (0, y0 + 200, z))


@lifted
def tree(x, y, s, size=1.0, kind='ki'):
    """丸い木。kind='ki' は季節で色がかわる木（冬は葉を落とした枝だけ）、'matsu' は一年中みどりの松"""
    h = 1.6 * size
    cyl('miki', 'miki', 0.10 * size, h, (x, y, h / 2), verts=8)
    if kind == 'matsu':
        for i, (dz, r) in enumerate(((0.55, 0.75), (0.95, 0.6), (1.3, 0.42))):
            sphere(f'ha{i}', 'matsu', r * size, (x + (i % 2 - 0.5) * 0.25 * size, y, h * 0.55 + dz * size), (1.3, 1.1, 0.45))
        return
    if s == 3:
        for i, a in enumerate((-0.6, 0.0, 0.6)):
            cyl(f'eda{i}', 'miki', 0.04 * size, 0.9 * size, (x + math.sin(a) * 0.35 * size, y, h + 0.1 * size), (0, a, 0), 6)
        return
    sphere('ha', 'ki', 0.85 * size, (x, y, h + 0.45 * size), (1, 1, 0.9))
    sphere('ha2', 'ki', 0.55 * size, (x + 0.5 * size, y - 0.2 * size, h + 0.1 * size))


@lifted
def person(x, y, cloth='fuku1', hat=None, face='hada', leg='zubon', scale=1.0, rot=0.0):
    """立っている人（足・胴・腕・頭、帽子）"""
    s = scale
    for side in (-1, 1):
        box(f'ashi{side}', leg, (0.09 * s, 0.10 * s, 0.42 * s), (x + side * 0.07 * s, y, 0.21 * s))
        box(f'ude{side}', cloth, (0.07 * s, 0.08 * s, 0.34 * s), (x + side * 0.19 * s, y, 0.66 * s), (0, side * 0.12, 0))
    box('do', cloth, (0.30 * s, 0.18 * s, 0.40 * s), (x, y, 0.62 * s), (0, 0, rot), bevel=0.02)
    sphere('atama', face, 0.12 * s, (x, y, 0.95 * s))
    if hat:
        cyl('kasa', hat, 0.2 * s, 0.05 * s, (x, y, 1.07 * s), verts=12, r2=0.02 * s)
    else:
        sphere('kami', 'kami', 0.125 * s, (x, y + 0.02 * s, 0.99 * s), (1, 1, 0.75))


def roof(name, mat, x, y, z, w, d, h, hip=False):
    """瓦の屋根（切妻。hip=True で寄棟）"""
    bm_v = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0)]
    r = w / 2 - (d / 2 if hip else 0)
    top = [(-max(r, 0.05), 0, h), (max(r, 0.05), 0, h)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(bm_v + top, [], [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)])
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = (x, y, z)
    me.materials.append(material(mat))
    sol = o.modifiers.new('t', 'SOLIDIFY')
    sol.thickness = 0.06
    return o


def house(x, y, w, d, hgt, wall='kabe', rmat='kawara', rh=0.7, hip=False, door=None, eave=0.18):
    box('kabe', wall, (w, d, hgt), (x, y, hgt / 2))
    roof('yane', rmat, x, y, hgt, w + eave * 2, d + eave * 2, rh, hip)
    if door:
        box('to', door, (w * 0.3, 0.02, hgt * 0.7), (x, y - d / 2 - 0.01, hgt * 0.35))


def cam(target, dist, el, az, lens=35):
    """target を、距離 dist・見下ろす角度 el・向き az（度）から見る"""
    sc = bpy.context.scene
    c = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(c)
    c.data.lens = lens
    c.data.clip_end = 1000
    e, a = math.radians(el), math.radians(az)
    c.location = (target[0] + dist * math.cos(e) * math.sin(a), target[1] - dist * math.cos(e) * math.cos(a), target[2] + dist * math.sin(e))
    c.rotation_euler = (Vector(target) - c.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = c


def sun_light(az=-40, el=40, energy=3.0):
    sc = bpy.context.scene
    s = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sc.collection.objects.link(s)
    s.data.energy = energy
    s.data.angle = math.radians(2)
    e, a = math.radians(el), math.radians(az)
    d = Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
    s.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()


# ---------- 題材（build(a, b, s, t)。a 置き方 0〜4・b 小物 0〜4・s 季節（行事は場面）・t 時間帯（行事だけ形がかわる：人出や炎の大きさ）） ----------
MOTIFS = []


def motif(key, crowd=False):
    def deco(fn):
        MOTIFS.append((key, fn, crowd))
        return fn
    return deco


# 実相寺：文永8年（1271）創建。開祖の聖一国師が境内に茶の種をまいたのが西尾茶のはじまりといわれる。中心に釈迦堂
@motif('jissoji')
def jissoji(a, b, s, t, R):
    ground('shiba')
    box('keidai', 'keidai', (12, 9, 0.02), (0, 0.5, 0.005))   # 境内（土）
    box('kidan', 'ishi', (5.4, 3.6, 0.3), (0, 2, 0.15))
    box('do', 'ita', (4.2, 2.8, 1.8), (0, 2, 1.2))
    for i in range(6):
        box(f'hashira{i}', 'itaD', (0.12, 0.05, 1.8), (-2.0 + i * 0.8, 0.59, 1.2))
    box('to', 'koshi', (1.3, 0.04, 1.4), (0, 0.58, 1.0))
    roof('yane', 'kawara', 0, 2, 2.1, 5.6, 4.2, 1.5, hip=True)
    box('michi', 'jari', (1.2, 8, 0.02), (0, -3.5, 0.01))
    for i in range(3 + b % 3):   # 茶の木（秋は白い花）
        x = -3.6 + ((i * 2.7 + a * 0.9) % 7.2)
        sphere(f'cha{i}', 'cha', 0.55, (x if abs(x) > 0.9 else x + 1.8, -1.6 - (i % 2) * 1.4, 0.3), (1.4, 0.9, 0.7))
        if s == 2:
            for j in range(3):
                sphere(f'hana{i}{j}', 'shiro', 0.07, (x + (j - 1) * 0.3, -2.05 - (i % 2) * 1.4, 0.55))
    tree(-4.2, 3.5, s, 1.2, 'matsu')
    if b % 2 == 0:
        tree(4.0, 4.0, s, 1.3, 'matsu')
    tree(5.5, 1.0, s, 1.0)
    if b >= 3:
        person(0.2, -2.5, 'fuku2')
    return dict(cam=((0, 1.2, 1.3), 10.5, 12, (a - 2) * 9), sun=(-40, 40))




def wall_window(x, y, w, h, wx, wz, ww, wh, mat='kabeIn', frame='itaD'):
    """窓のあいた奥の壁（窓の外は空と、季節の木）。wx, wz は窓のまん中"""
    box('kL', mat, ((wx - ww / 2) - (x - w / 2), 0.1, h), ((x - w / 2 + wx - ww / 2) / 2, y, h / 2))
    box('kR', mat, ((x + w / 2) - (wx + ww / 2), 0.1, h), ((wx + ww / 2 + x + w / 2) / 2, y, h / 2))
    box('kD', mat, (ww, 0.1, wz - wh / 2), (wx, y, (wz - wh / 2) / 2))
    box('kU', mat, (ww, 0.1, h - (wz + wh / 2)), (wx, y, (h + wz + wh / 2) / 2))
    for i, (sx, sz, px, pz) in enumerate(((ww + 0.1, 0.06, wx, wz - wh / 2), (ww + 0.1, 0.06, wx, wz + wh / 2), (0.06, wh, wx - ww / 2, wz),
                                           (0.06, wh, wx + ww / 2, wz), (0.04, wh, wx, wz), (ww, 0.04, wx, wz))):
        box(f'waku{i}', frame, (sx, 0.12, sz), (px, y - 0.02, pz))


def outside(y, s, x=0.0):
    """窓の外：地面と季節の木"""
    ground('shiba', size=60)
    tree(x - 0.8, y + 3, s, 1.6)
    tree(x + 1.6, y + 5, s, 1.4, 'matsu')


def table(z=0.7, w=8, d=4, mat='tsukue', y=0.0):
    box('tsukue', mat, (w, d, 0.08), (0, y, z - 0.04))
    box('ashi', mat, (w - 0.4, d - 0.4, z - 0.08), (0, y, (z - 0.08) / 2))


def bowl(x, y, z, r, mat, inside=None, h=None):
    h = h or r * 0.9
    cyl('wan', mat, r, h, (x, y, z + h / 2), verts=24, r2=r * 0.62)
    o = bpy.context.object
    o.rotation_euler = (math.pi, 0, 0)
    if inside:
        cyl('naka', inside, r * 0.88, 0.02, (x, y, z + h + 0.005), verts=24)
    cyl('kodai', mat, r * 0.4, 0.06, (x, y, z + 0.03), verts=16)


@motif('kabuse')
def kabuse(a, b, s, t, R):
    ground('tsuchi')
    covered, tana = s <= 1, b % 2 == 1
    for i in range(7):   # 茶のうね（かまぼこ形）
        y = -3 + i * 1.5
        cyl(f'une{i}', 'cha', 0.55, 14, (0, y, 0.25), (0, math.pi / 2, 0), 16).scale = (1, 1, 1)
        bpy.context.object.scale = (0.9, 1, 1)
        if covered and not tana:   # じかに黒い布をかける
            cyl(f'nuno{i}', 'kabuseNet', 0.6, 14, (0, y, 0.28), (0, math.pi / 2, 0), 16)
            bpy.context.object.scale = (0.95, 1, 1)
    poles = [(x, y) for x in range(-6, 7, 3) for y in (-3.8, -0.8, 2.2, 5.2)]
    if covered and tana:   # 棚がけ：柱の上に黒い網
        for x, y in poles:
            cyl(f'p{x}{y}', 'hashiraK', 0.05, 2.0, (x + a * 0.3, y, 1.0), verts=6)
        box('tana', 'kabuseNet', (14, 10, 0.04), (0, 0.7, 2.0))
    elif not covered:
        for x, y in poles[::2]:
            cyl(f'p{x}{y}', 'hashiraK', 0.05, 1.4, (x + a * 0.3, y, 0.7), verts=6)
    tree(-5 + a * 0.6, 9, s, 1.6)
    tree(6 - a * 0.4, 10, s, 1.4)
    if b >= 2:   # 摘んだ葉のかご
        cyl('kago', 'take', 0.35, 0.35, (-2 + a * 1.0, -4.3, 0.18), verts=12)
        sphere('ha', 'chaL', 0.3, (-2 + a * 1.0, -4.3, 0.36), (1, 1, 0.4))
    if b == 4:
        person(1.0 + a * 0.3, -4.0, 'fuku1', hat='mugi')
    if covered and tana:   # 棚の下から見る（上に黒い網）
        return dict(cam=((0, 2, 1.0), 7, 4, (a - 2) * 8), sun=(-45, 45))
    return dict(cam=((0, 2, 0.6), 10, 14, (a - 2) * 8), sun=(-45, 45))


@motif('matcha')
def matcha(a, b, s, t, R):
    ground('shiba', size=80)
    tree(-2.5 + a * 0.6, 6, s, 1.6)
    tree(3.5 - a * 0.4, 7.5, s, 1.5, 'matsu')
    box('engawa', 'ita', (9, 3, 0.1), (0, 0.5, 0.65))
    box('nokishita', 'itaD', (9, 0.12, 0.12), (0, 2.6, 2.3))
    for x in (-3.5, 3.5):
        box(f'hashira{x}', 'itaD', (0.14, 0.14, 1.7), (x, 2.0, 1.5))
    box('mosen', 'mosen', (3.6, 1.6, 0.03), (0, -0.2, 0.71))   # 赤い毛せん
    bx = -0.9 + (a - 2) * 0.2
    bowl(bx, -0.3, 0.72, 0.42, f'chawan{b}', 'matcha')
    cyl('chasen', 'take', 0.12, 0.35, (bx + 0.85, -0.1, 0.9), verts=12, r2=0.05)
    sphere('chasen2', 'take', 0.15, (bx + 0.85, -0.1, 0.78), (1, 1, 0.8))
    cyl('sara', 'shiro', 0.32, 0.03, (bx + 1.7, -0.4, 0.74), verts=20)
    sphere('kashi', 'kashi', 0.2, (bx + 1.7, -0.4, 0.85), (1.2, 1, 0.7))
    sphere('kashiA', 'kashiA', 0.07, (bx + 1.62, -0.55, 0.95))
    return dict(cam=((0, 0.2, 0.95), 3.6, 24, (a - 2) * 7), sun=(-35, 40))


@motif('ishiusu')
def ishiusu(a, b, s, t, R):
    box('tatami', 'tatami', (8, 6, 0.04), (0, 0, 0.02))
    for i in range(4):
        box(f'heri{i}', 'heri', (8, 0.06, 0.045), (0, -2.2 + i * 1.5, 0.02))
    wx = -1.6 + a * 0.8
    wall_window(0, 2.5, 8, 3, wx, 1.7, 1.3, 1.1)
    outside(2.5, s, wx)
    x = 0.2 + (a - 2) * 0.15
    cyl('shita', 'ishiusu', 0.55, 0.32, (x, 0.2, 0.2), verts=24)
    cyl('ue', 'ishiusu', 0.5, 0.34, (x, 0.2, 0.53), verts=24)
    for i in range(6):
        ang = i * math.pi / 3
        box(f'mizo{i}', 'ishiD', (0.03, 0.02, 0.26), (x + 0.5 * math.cos(ang), 0.2 + 0.5 * math.sin(ang), 0.53), (0, 0, ang))
    cyl('shin', 'itaD', 0.05, 0.25, (x, 0.2, 0.8), verts=8)
    box('totte', 'ita', (0.08, 0.08, 0.32), (x + 0.6, 0.0, 0.75))
    cyl('kona', 'matcha', 0.72, 0.02, (x, 0.2, 0.05), verts=24)
    nx = -1.6 + ((a + 3) % 5) * 0.8
    cyl('natsume', f'natsume{b}', 0.16, 0.26, (nx, -0.8, 0.17), verts=16)
    sphere('futa', f'natsume{b}', 0.16, (nx, -0.8, 0.3), (1, 1, 0.35))
    return dict(cam=((x * 0.5, 0.8, 0.9), 3.4, 16, (a - 2) * 6), sun=(-30, 35))


# てんてこ祭：熱池八幡社、1月3日。赤装束の厄男が大根を腰に下げ、太鼓に合わせて練り歩き、藁灰をまく。愛知県の無形民俗文化財
@motif('tenteko', crowd=True)
def tenteko(a, b, s, t, R):
    ground('keidai')
    tx = 2.5 - a * 0.6   # 赤い鳥居
    for x in (-1.1, 1.1):
        cyl(f'torii{x}', 'shu', 0.12, 3.0, (tx + x, 6, 1.5), verts=10)
    box('kasagi', 'shu', (3.2, 0.25, 0.2), (tx, 6, 3.05))
    box('nuki', 'shu', (2.6, 0.15, 0.15), (tx, 6, 2.5))
    tree(-3, 9, 3, 1.8, 'matsu')
    tree(5, 9, 3, 1.6, 'matsu')
    n = 6 if s == 3 else 3 + s
    for i in range(n):   # 赤装束の厄男。腰に大根
        x, y = -3.2 + a * 0.3 + i * 1.1, 1.5 + (i % 2) * 0.5
        person(x, y, 'yakuotoko', hat='yakuotoko', leg='yakuotoko')
        if i % 2 == 0:
            cyl(f'daikon{i}', 'daikon', 0.07, 0.4, (x + 0.12, y - 0.12, 0.42), verts=8)
            sphere(f'daikonH{i}', 'daikonH', 0.07, (x + 0.12, y - 0.12, 0.66))
    if s in (1, 3):   # 太鼓
        dx = -3.2 + a * 0.3 + n * 1.1
        cyl('taiko', 'taiko', 0.35, 0.45, (dx, 1.8, 0.75), (math.pi / 2, 0, 0), 16)
        cyl('taikoK', 'kawaT', 0.33, 0.47, (dx, 1.8, 0.75), (math.pi / 2, 0, 0), 16)
    if s >= 2:   # 藁灰をまく
        for i in range(40):
            box(f'hai{i}', 'hai', (0.06, 0.06, 0.06), (R.uniform(-4, 4), R.uniform(0.5, 3), R.uniform(0.1, 1.4)))
    for i in range(3 + t * 5 + b):   # 見物の人
        person(-4.2 + ((i * 1.37 + a * 0.5) % 8.6), -1.2 - (i % 3) * 0.5, f'fukuK{i % 3}', scale=0.95)
    return dict(cam=((0, 1.8, 0.8), 9, 12, (a - 2) * 7), sun=(-35, 32))


@motif('ike')
def ike(a, b, s, t, R):
    ground('jari')
    for j, y in enumerate((0.0, 4.2)):   # 二つの池（コンクリートのふち）
        box(f'fuchi{j}', 'concrete', (12, 3.4, 0.3), (0, y, 0.0))
        box(f'mizu{j}', 'ikeMizu', (11.6, 3.0, 0.3), (0, y, 0.02))
        for i in range(1 + b % 3):   # 水車（池に空気を入れる）と水しぶき
            x = -4 + ((a * 2.2 + i * 3.1) % 8)
            box(f'suisha{j}{i}', 'shiro', (0.6, 0.5, 0.35), (x, y - 0.8, 0.35))
            for k in range(4):
                box(f'hane{j}{i}{k}', 'suishaB', (0.04, 0.5, 0.35), (x - 0.25 + k * 0.17, y - 0.8, 0.25), (0, k * 0.8, 0))
            sphere(f'shibuki{j}{i}', 'shibuki', 0.45, (x, y - 0.3, 0.18), (1.5, 0.8, 0.25))
    if b >= 3:   # ビニールハウスの骨組み
        for i in range(7):
            o = tube(f'hone{i}', 'vinyl', [(-6 + i * 2, -1.8, 0.1), (-6 + i * 2, 0, 2.2), (-6 + i * 2, 1.8, 0.1)], 0.04)
    if b == 2:
        person(4 - a * 0.5, -2.4, 'fuku1', hat='shiro')
    tree(-5, 9, s, 1.5)
    return dict(cam=((0, 1.5, 0.3), 8, 32, (a - 2) * 8), sun=(-40, 42))


@motif('unaju')
def unaju(a, b, s, t, R):
    box('yuka', 'tatami', (8, 6, 0.04), (0, 0, 0.0))
    wx = 1.6 - a * 0.8
    wall_window(0, 2.2, 8, 3.2, wx, 1.9, 1.6, 1.2, 'kabeIn2')
    outside(2.2, s, wx)
    table(0.7, 6, 3, 'tsukueD')
    x = -0.6 + (a - 2) * 0.25
    box('ju', 'urushi', (1.3, 1.0, 0.36), (x, -0.2, 0.88), bevel=0.03)   # 重箱
    box('juR', 'urushiR', (1.2, 0.9, 0.02), (x, -0.2, 1.07))
    box('gohan', 'gohan', (1.12, 0.82, 0.02), (x, -0.2, 1.08))
    for i in range(2 + b % 2):   # うなぎのかば焼き
        w = 1.0 / (2 + b % 2)
        box(f'unagi{i}', 'unagi', (w * 0.9, 0.7, 0.05), (x - 0.5 + w / 2 + i * w, -0.2, 1.11), bevel=0.015)
        for k in range(3):
            box(f'koge{i}{k}', 'unagiD', (0.02, 0.6, 0.055), (x - 0.5 + w / 2 + i * w - 0.1 + k * 0.1, -0.2, 1.115))
    bowl(x + 1.25, -0.3, 0.72, 0.28, f'shiru{b}', 'suimono')
    if b >= 3:
        box('hashi', 'hashi', (0.9, 0.04, 0.03), (x + 0.2, -0.95, 0.74))
    return dict(cam=((x * 0.4, 0.0, 1.05), 2.9, 30, (a - 2) * 6), sun=(-30, 40))


@motif('kabayaki')
def kabayaki(a, b, s, t, R):
    ground('michi')
    house(0, 3.5, 10, 2.5, 2.6, 'kabeK', 'kawara', 0.9)
    for i in range(4):   # のれん
        box(f'noren{i}', f'noren{b}', (1.2, 0.03, 0.9), (-3.5 + a * 0.2 + i * 2.2, 2.22, 1.9))
        box(f'monji{i}', 'shiro', (0.25, 0.035, 0.3), (-3.5 + a * 0.2 + i * 2.2, 2.21, 1.95))
    x = (a - 2) * 0.4
    box('konro', 'konro', (3.6, 1.0, 0.9), (x, 0.2, 0.45))
    box('sumi', 'sumi', (3.4, 0.8, 0.05), (x, 0.2, 0.92))
    for i in range(12):
        box(f'hi{i}', 'hi', (0.12, 0.12, 0.04), (x - 1.5 + R.random() * 3, 0.2 + R.uniform(-0.3, 0.3), 0.95))
    for i in range(3 + b % 2):   # 串に刺したうなぎ
        box(f'unagi{i}', 'unagi', (2.8, 0.18, 0.04), (x, -0.15 + i * 0.22, 1.05), bevel=0.01)
        box(f'kushi{i}', 'take', (3.4, 0.02, 0.02), (x, -0.15 + i * 0.22, 1.03))
    for i in range(5):   # けむり
        sphere(f'kemuri{i}', 'kemuri', 0.14 + R.random() * 0.1, (x - 1.2 + i * 0.6, 0.4, 1.4 + R.random() * 0.9))
    return dict(cam=((0, 1.0, 1.5), 6.5, 12, (a - 2) * 7), sun=(-35, 42))


@motif('ebisen')
def ebisen(a, b, s, t, R):
    box('yuka', 'ita', (8, 6, 0.04), (0, 0, 0.0))
    wx = -2 + a * 1.0
    wall_window(0, 2.2, 8, 3.0, wx, 1.9, 1.4, 1.0, 'kabeIn2')
    outside(2.2, s, wx)
    table(0.7, 6, 3, 'tsukueL')
    x = (a - 2) * 0.15
    box('hako', 'hakoK', (2.4, 1.2, 0.2), (x, -0.1, 0.8))
    box('hakoN', 'hakoN', (2.3, 1.1, 0.02), (x, -0.1, 0.89))
    for i in range(9):   # えびせんべい（色いろ）
        cx, cy = x - 0.85 + (i % 5) * 0.42 + (0.2 if i >= 5 else 0), -0.35 + (0.45 if i >= 5 else 0)
        cyl(f'sen{i}', f'sen{b}{i % 3}', 0.2, 0.03, (cx, cy, 0.92), (R.uniform(-0.25, 0.25), R.uniform(-0.25, 0.25), 0), 16)
        sphere(f'ebi{i}', 'ebiR', 0.05, (cx, cy, 0.94), (1.5, 0.6, 0.3))
    ex = x + 1.6 - a * 0.25   # えび
    tube('ebi', 'ebi', [(ex - 0.3, -0.7, 0.75), (ex, -0.85, 0.78), (ex + 0.25, -0.65, 0.76)], 0.07)
    return dict(cam=((0, 0.1, 0.95), 3.4, 30, (a - 2) * 6), sun=(-30, 40))


@motif('asari')
def asari(a, b, s, t, R):
    sea(3 + (a % 3) * 0.6)
    box('higata', 'higata', (60, 30, 0.02), (0, -12 + 3 + (a % 3) * 0.6, 0.0))
    for i in range(5):
        box(f'mizutamari{i}', 'mizutamari', (R.uniform(1, 2.5), R.uniform(0.3, 0.6), 0.02), (R.uniform(-5, 5), R.uniform(-1, 2.5), 0.012))
    for i in range(6 + b):   # あさり
        x, y = R.uniform(-3, 3), R.uniform(-3, -0.8)
        sphere(f'kai{i}', 'kai', 0.17, (x, y, 0.05), (1.2, 1, 0.5))
        box(f'shima{i}', 'kaiD', (0.3, 0.02, 0.06), (x, y - 0.14, 0.06))
    bx = 1.8 - a * 0.6
    cyl('baketsu', 'baketsu', 0.32, 0.5, (bx, -1.6, 0.25), verts=16, r2=0.26)
    cyl('kumade', 'take', 0.025, 1.4, (bx + 0.8, -1.4, 0.7), (0.3, 0, 0), 6)
    box('tsume', 'kane', (0.4, 0.06, 0.08), (bx + 0.8, -1.6, 0.05))
    if s <= 1 and b % 2 == 0:
        person(-1.5 + a * 0.4, 0.3, 'fuku4', hat='mugi')
    return dict(cam=((0, -0.5, 0.3), 5.5, 20, (a - 2) * 8), sun=(-40, 40))


# 一色さかな広場：一色漁港のとなりの海鮮市場。朝市広場、えびせんべい、三河湾の魚介
@motif('sakanahiroba')
def sakanahiroba(a, b, s, t, R):
    ground('concrete')
    sea(6)
    bx = 2 - a * 0.6   # 港の船
    box('fune', 'shiro', (3, 1.0, 0.6), (bx, 9, 0.2))
    box('funeS', 'fuku1', (3.02, 1.02, 0.1), (bx, 9, 0.35))
    box('funeK', 'shiro', (1.0, 0.8, 0.6), (bx + 0.5, 9, 0.8))
    cyl('mast', 'kane', 0.04, 1.5, (bx - 0.6, 9, 1.2), verts=6)
    for i in range(2):   # 屋台（日よけ）
        x = -2.6 + i * 5.2
        box(f'dai{i}', 'ita', (4, 1.4, 0.8), (x, 1.5, 0.4))
        box(f'kori{i}', 'kori', (3.8, 1.2, 0.05), (x, 1.5, 0.82))
        for k in range(5):
            mat = 'sakana' if (k + i + a) % 3 else 'ebiR'
            sphere(f'sakana{i}{k}', mat, 0.16, (x - 1.4 + k * 0.7, 1.3, 0.88), (2.0, 0.8, 0.5))
        for k in range(4):
            cyl(f'senbei{i}{k}', 'sen0' + str(k % 2 + 1), 0.15, 0.04, (x - 1.2 + k * 0.8, 1.85, 0.86), verts=12)
        for k in range(6):
            box(f'tent{i}{k}', f'tent{(b + i) % 5}' if k % 2 == 0 else 'shiro', (4.2 / 6, 1.8, 0.05), (x - 2.1 + 4.2 / 12 + k * 4.2 / 6, 1.4, 2.0), (0.25, 0, 0))
        for px in (-1.9, 1.9):
            cyl(f'pole{i}{px}', 'kane', 0.04, 2.0, (x + px, 0.8, 1.0), verts=6)
    for i in range(3 + b):
        person(-4 + ((i * 1.9 + a * 0.8) % 8), -0.6 - (i % 2) * 0.5, f'fuku{1 + i % 5}')
    return dict(cam=((0, 2.5, 1.0), 9.5, 14, (a - 2) * 7), sun=(-40, 40))


@motif('fune')
def fune(a, b, s, t, R):
    sea(-30)
    for i, (x, y, r, h) in enumerate(((6 - a * 1.5, 40, 9, 3.0), (14 - a * 1.5, 46, 7, 2.2))):   # 佐久島の山
        sphere(f'shima{i}', 'yama', r, (x, y, 0), (1.3, 0.6, h / r))
    x = -2 + a * 0.9   # 船（白い船体、青い線、客室の窓）
    box('sentai', 'shiro', (4.4, 1.3, 0.9), (x, 3, 0.35), bevel=0.1)
    box('sen', 'fuku1', (4.42, 1.32, 0.15), (x, 3, 0.5))
    box('kyakushitsu', 'shiro', (2.4, 1.0, 0.7), (x + 0.2, 3, 1.15))
    for i in range(4):
        box(f'mado{i}', 'madoF', (0.35, 0.02, 0.3), (x - 0.7 + i * 0.6, 2.49, 1.2))
    box('ue', 'shiro', (0.8, 0.8, 0.5), (x + 0.5, 3, 1.75))
    for i in range(5):   # 船のあとの白い波
        box(f'nami{i}', 'nami', (0.8, 0.25, 0.03), (x - 2.8 - i * 0.9, 3 + (i % 2) * 0.3 - 0.15, 0.0))
    sphere('kamome', 'shiro', 0.08, (2 - b * 0.5, 2, 3.2 + b * 0.2), (2.5, 0.6, 0.4))
    if b >= 2:
        cyl('bui', 'aka', 0.18, 0.3, (3.5, 0, 0.1), verts=10)
    return dict(cam=((0, 4, 1.0), 10, 8, (a - 2) * 6), sun=(-40, 35))


@motif('kurokabe')
def kurokabe(a, b, s, t, R):
    ground('michiS')
    n = 2 + b % 2
    for i in range(n):   # 黒壁の家（左右に並ぶ）
        for side in (-1, 1):
            y = 1 + i * 3.2
            x = side * (2.2 + (a - 2) * 0.15)
            box(f'ie{i}{side}', 'kurokabe', (2, 3, 2.4), (x + side * 1.0, y, 1.2))
            roof(f'yane{i}{side}', 'kawara', x + side * 1.0, y, 2.4, 2.4, 3.4, 0.8)
            for k in range(4):
                box(f'ita{i}{side}{k}', 'kurokabeL', (0.02, 3, 0.04), (x, y, 0.5 + k * 0.5))
            box(f'to{i}{side}', 'itaD', (0.03, 0.7, 1.4), (x - side * 0.0, y - 0.6, 0.7))
    box('michi', 'ishiMichi', (2.4, 14, 0.02), (0, 3, 0.01))
    if b >= 2:   # 鉢植え
        cyl('hachi', 'hachi', 0.2, 0.3, (-0.8 + a * 0.3, -0.5, 0.15), verts=10)
        sphere('ueki', 'matsu' if s == 3 else 'ki' if s == 1 else 'matsu', 0.25, (-0.8 + a * 0.3, -0.5, 0.45))
    if b == 4:   # 猫
        sphere('neko', 'shiro', 0.16, (0.6 - a * 0.2, -0.8, 0.12), (1.5, 0.9, 0.8))
        sphere('nekoA', 'shiro', 0.1, (0.8 - a * 0.2, -0.85, 0.28))
    return dict(cam=((0, 4, 1.3), 9, 10, (a - 2) * 4), sun=(-30, 50))


@motif('okinoshima')
def okinoshima(a, b, s, t, R):
    sea(-2)
    box('hama', 'suna', (60, 20, 0.02), (0, -12, 0.0))
    box('namiuchi', 'nami', (60, 0.25, 0.03), (0, -2.1, 0.01))
    ix = -4 + a * 1.2
    for i, (x, y, r, h) in enumerate(((ix, 22, 4, 2.2), (ix + 9, 26, 3, 1.5))):   # 沖の島
        sphere(f'shima{i}', 'yama', r, (x, y, 0), (1.4, 0.8, h / r))
    tree(3.6 - a * 0.3, -2.6, s, 0.8, 'matsu')
    if b % 2:
        tree(-3.8 + a * 0.2, -3.0, s, 0.8, 'matsu')
    if b >= 2:
        box('kobune', 'shiro', (1.0, 0.4, 0.25), (1 + a * 0.4, 6, 0.1))
    if b == 4:
        sphere('kamome', 'shiro', 0.06, (-1.5, 0, 2.6), (2.5, 0.6, 0.4))
    return dict(cam=((0, 4, 0.6), 10, 8, (a - 2) * 6), sun=(-40, 35))


@motif('ushitora')
def ushitora(a, b, s, t, R):
    ground('shiba')
    if b >= 3:
        box('hori', 'hori', (60, 3, 0.02), (0, -2.2, 0.01))
    for i in range(4):   # 石垣（上ほど細く）
        box(f'ishigaki{i}', 'ishigaki', (5.6 - i * 0.3, 3.6 - i * 0.3, 0.3), (0, 2, 0.15 + i * 0.3))
    box('kai1', 'kabe', (4.4, 2.6, 1.2), (0, 2, 1.8))
    box('koshi1', 'kurokabe', (4.42, 2.62, 0.4), (0, 2, 1.4))
    roof('yane1', 'kawaraL', 0, 2, 2.4, 5.2, 3.4, 0.7, hip=True)
    box('kai2', 'kabe', (2.6, 1.8, 0.9), (0, 2, 2.95))
    roof('yane2', 'kawaraL', 0, 2, 3.4, 3.4, 2.6, 0.9, hip=True)
    for x in (-1.0, 1.0):
        box(f'mado{x}', 'koshi', (0.4, 0.02, 0.25), (x, 0.69, 1.9))
    box('mado2', 'koshi', (0.5, 0.02, 0.25), (0, 1.09, 3.05))
    for x in (-1.7, 1.7):
        sphere(f'shachi{x}', 'kin', 0.08, (x, 2, 3.4))
    if b % 2 == 0:
        tree(-4.5, 1.5, s, 1.5)
        tree(4.6, 2, s, 1.4)
    if b in (1, 4):
        person(-2.5 + a * 0.9, -0.8, 'fuku3')
    return dict(cam=((0, 1.6, 1.8), 10, 12, (a - 2) * 9), sun=(-40, 40))


@motif('machiya')
def machiya(a, b, s, t, R):
    ground('michiS')
    for i, x in enumerate((-2.1, 2.1)):   # 町家（2軒）
        box(f'ue{i}', 'kabeM', (4.0, 2.5, 1.0), (x, 2, 2.0))
        box(f'shita{i}', 'koshi', (4.0, 2.5, 1.5), (x, 2, 0.75))
        for k in range(18):
            box(f'koshi{i}{k}', 'ita', (0.06, 0.02, 1.2), (x - 1.9 + k * 0.22, 0.74, 0.75))
        roof(f'yane{i}', 'kawara', x, 2, 2.5, 4.2, 3.0, 0.8)
        box(f'hisashi{i}', 'kawara', (4.2, 0.6, 0.06), (x, 0.55, 1.55), (0.35, 0, 0))
        box(f'noren{i}', f'noren{(b + i) % 5}', (1.4, 0.03, 0.7), (x - 0.6 + a * 0.15, 0.7, 1.05))
    lx = -0.2 + a * 0.2   # 提灯（夜は灯る）
    cyl('chochin', 'akari', 0.14, 0.35, (lx, 0.6, 1.8), verts=12)
    cyl('chochinU', 'kuro', 0.1, 0.04, (lx, 0.6, 2.0), verts=12)
    box('michi', 'ishiMichi', (40, 3, 0.02), (0, -1.5, 0.01))
    if b >= 3:
        person(1.6 - a * 0.5, -0.5, 'fukuM')
    return dict(cam=((0, 1.5, 1.3), 7, 6, (a - 2) * 6), sun=(-35, 45))


@motif('densha')
def densha(a, b, s, t, R):
    ground('shiba')
    box('jari', 'balast', (60, 1.6, 0.15), (0, 1, 0.07))
    for y in (0.7, 1.3):
        box(f'rail{y}', 'kane', (60, 0.06, 0.06), (0, y, 0.18))
    for x in range(-8, 9, 4):   # 架線の柱と線
        cyl(f'hashira{x}', 'kaneD', 0.06, 3.2, (x + a * 0.3, 2.2, 1.6), verts=6)
        box(f'ude{x}', 'kaneD', (0.06, 1.4, 0.06), (x + a * 0.3, 1.6, 3.0))
    box('kasen', 'kuro', (60, 0.02, 0.02), (0, 1.0, 2.8))
    cars, x = 1 + b % 2, -3 + a * 0.8
    for i in range(cars):   # 名鉄の赤い電車
        cx = x + i * 4.6
        box(f'sha{i}', 'meitetsu', (4.4, 1.4, 1.5), (cx, 1, 1.15), bevel=0.08)
        box(f'yane{i}', 'kaneL', (4.2, 1.2, 0.1), (cx, 1, 1.95))
        for k in range(5):
            box(f'mado{i}{k}', 'madoD', (0.5, 0.02, 0.45), (cx - 1.6 + k * 0.8, 0.29, 1.45))
        for k in (-1.4, 1.4):
            cyl(f'sharin{i}{k}', 'kuro', 0.18, 1.2, (cx + k, 1, 0.3), (math.pi / 2, 0, 0), 12)
    box('pan', 'kuro', (0.6, 0.4, 0.4), (x, 1, 2.2))
    if b >= 2:
        box('light', 'akari', (0.15, 0.02, 0.12), (x - 2.0, 0.29, 0.75))
    tree(5 - a * 0.4, 5, s, 1.6)
    if b >= 3:
        box('hanabatake', 'nanohana' if s == 0 else 'mugi', (3, 1.5, 0.15), (3 + a * 0.3, -1.6, 0.07))
    return dict(cam=((0, 1, 1.2), 8, 8, (a - 2) * 8), sun=(-40, 45))


@motif('akauma')
def akauma(a, b, s, t, R):
    box('yuka', 'tatami', (8, 6, 0.04), (0, 0, 0.0))
    wx = 1.8 - a * 0.9
    wall_window(0, 2.2, 8, 3.0, wx, 1.9, 1.4, 1.1, 'kabeIn2')
    outside(2.2, s, wx)
    table(0.7, 6, 3, 'tsukueD')
    box('nuno', f'nuno{b}', (4.4, 1.6, 0.02), (0, -0.2, 0.71))
    x = (a - 2) * 0.2
    box('do', 'akauma', (0.9, 0.35, 0.35), (x, -0.2, 1.05), bevel=0.06)   # 赤い馬（郷土玩具）
    box('kubi', 'akauma', (0.22, 0.25, 0.5), (x + 0.45, -0.2, 1.35), (0, 0.4, 0), bevel=0.04)
    box('kao', 'akauma', (0.35, 0.22, 0.18), (x + 0.65, -0.2, 1.58), (0, 0.3, 0), bevel=0.04)
    for dx in (-0.32, 0.32):
        for dy in (-0.1, 0.1):
            box(f'ashi{dx}{dy}', 'akaumaD', (0.09, 0.09, 0.3), (x + dx, -0.2 + dy, 0.85))
    box('kura', 'kuro', (0.4, 0.37, 0.12), (x - 0.05, -0.2, 1.24))
    box('kuraK', 'kin', (0.3, 0.38, 0.03), (x - 0.05, -0.2, 1.21))
    for i, m in enumerate(('ao', 'ki2', 'midori')):
        sphere(f'tama{i}', m, 0.05, (x - 0.3 + i * 0.25, -0.38, 1.0))
    box('o', 'kuro', (0.06, 0.06, 0.35), (x - 0.5, -0.2, 1.0), (0, -0.3, 0))
    return dict(cam=((0, -0.1, 1.1), 3.2, 22, (a - 2) * 7), sun=(-30, 40))


@motif('kogane')
def kogane(a, b, s, t, R):
    ground('shiba')
    ty = 1.5 + (a >> 1) * 0.3
    me = bpy.data.meshes.new('tsutsumi')   # 黄金堤（台形の土手）
    me.from_pydata([(-30, ty - 1.5, 0), (30, ty - 1.5, 0), (30, ty + 1.5, 0), (-30, ty + 1.5, 0), (-30, ty - 0.5, 1.0), (30, ty - 0.5, 1.0), (30, ty + 0.5, 1.0), (-30, ty + 0.5, 1.0)], [],
                   [(0, 1, 5, 4), (4, 5, 6, 7), (7, 6, 2, 3), (0, 4, 7, 3), (1, 2, 6, 5)])
    o = bpy.data.objects.new('tsutsumi', me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material('dote'))
    box('michi', 'dotemichi', (60, 0.6, 0.02), (0, ty, 1.01))
    for i in range(5 + b % 2):
        tree(-6 + i * 2.4 + (a % 2) * 0.6, ty + 0.25, s, 0.9, 'matsu', z=1.0)
    box('kawa', 'kawa', (60, 4, 0.02), (0, ty - 4.2, 0.01))
    if b >= 2:
        person(-1 + a * 0.6, ty - 0.1, 'fuku4', z=1.0)
    if b == 4:
        cyl('kanban', 'itaD', 0.04, 1.0, (2.5, ty - 0.45, 1.5), verts=6)
        box('kanbanI', 'shiro', (0.7, 0.04, 0.4), (2.5, ty - 0.47, 1.9))
    return dict(cam=((0, ty, 0.8), 9, 10, (a - 2) * 6), sun=(-40, 40))


@motif('enden')
def enden(a, b, s, t, R):
    sea(4)
    box('enden', 'enden', (60, 20, 0.02), (0, -6, 0.0))
    for i in range(12):   # 砂をならした筋
        box(f'suji{i}', 'endenD', (60, 0.05, 0.022), (0, -3 + i * 0.6, 0.002))
    for i in range(4):
        box(f'aze{i}', 'itaD', (0.08, 9, 0.06), (-6 + i * 4 + a * 0.3, -1.5, 0.03))
    hx = 3 - a * 0.7   # 釜屋（塩をにつめる小屋）とけむり
    house(hx, 2.5, 2.4, 1.8, 1.4, 'ita', 'kaya', 0.9)
    cyl('entotsu', 'itaD', 0.12, 1.2, (hx + 0.7, 2.5, 2.3), verts=8)
    for i in range(3):
        sphere(f'kemuri{i}', 'kemuri', 0.22 + i * 0.07, (hx + 0.8 + i * 0.15, 2.5, 3.0 + i * 0.4))
    px = -2 + a * 0.8
    person(px, -1.0, 'fuku2', hat='mugi')
    cyl('ebu', 'take', 0.025, 1.4, (px + 0.3, -1.3, 0.55), (0.8, 0, 0), 6)
    if b >= 1:
        cyl('shio', 'shio', 0.35, 0.4, (-3.5 + ((a + b) % 5) * 1.6, -2.4, 0.2), verts=12, r2=0.0)
    if b >= 3:
        cyl('shio2', 'shio', 0.3, 0.35, (b - 1.5, -3.2, 0.18), verts=12, r2=0.0)
    return dict(cam=((0, 0.5, 0.6), 8, 14, (a - 2) * 7), sun=(-40, 40))


# 西尾祇園祭（伊文神社の祭礼。7月。2日目に神輿の渡御と大名行列、3日目に市民総踊り）。s は場面、t は人出
@motif('gion', crowd=True)
def gion(a, b, s, t, R):
    ground('michiS')
    for side in (-1, 1):   # 通りの両がわの家と、ちょうちんの列
        x = side * 4.2
        box(f'ie{side}', 'kabeM', (2.4, 12, 2.2), (x, 4, 1.1))
        box(f'ieS{side}', 'koshi', (2.42, 12, 1.0), (x, 4, 0.5))
        roof(f'yane{side}', 'kawara', x, 4, 2.2, 2.8, 12.4, 0.7)
    for i in range(14):
        for side in (-1, 1):
            cyl(f'chochin{i}{side}', 'chochinR' if (i + b) % 2 else 'chochinW', 0.13, 0.3, (side * 2.9, -1 + i * 0.9, 2.0), verts=10)
    box('nawa1', 'kuro', (0.02, 14, 0.02), (-2.9, 5, 2.2))
    box('nawa2', 'kuro', (0.02, 14, 0.02), (2.9, 5, 2.2))
    x0 = -1.6 + a * 0.6
    if s == 0:   # 大名行列の毛槍
        for i in range(4):
            y = 0.5 + i * 1.2
            person(x0 * 0.3, y, f'kami{(i + b) % 4}', hat='kuro', leg='shiro')
            cyl(f'yari{i}', 'ita', 0.03, 2.4, (x0 * 0.3 + 0.25, y, 1.2), verts=6)
            sphere(f'keyari{i}', 'kuro', 0.2, (x0 * 0.3 + 0.25, y, 2.4), (1, 1, 1.3))
    elif s == 1:   # 大名行列の駕籠
        box('kago', 'kuro', (0.9, 1.2, 0.8), (x0 * 0.3, 2, 0.9))
        box('kagoK', 'kin', (0.92, 1.22, 0.06), (x0 * 0.3, 2, 1.32))
        box('bo', 'ita', (0.08, 3.4, 0.08), (x0 * 0.3, 2, 1.45))
        for y in (0.6, 3.4):
            person(x0 * 0.3, y, f'kami{b % 4}', hat='kuro')
    elif s == 2:   # 神輿の渡御
        box('mikoshi', 'urushi', (1.0, 1.0, 0.7), (x0 * 0.3, 2, 1.4))
        roof('mikoshiY', 'kin', x0 * 0.3, 2, 1.75, 1.4, 1.4, 0.5, hip=True)
        sphere('hoo', 'kin', 0.12, (x0 * 0.3, 2, 2.35))
        for dx in (-0.6, 0.6):
            box(f'bo{dx}', 'ita', (0.08, 3.0, 0.08), (x0 * 0.3 + dx, 2, 1.05))
        for i in range(6):
            person(x0 * 0.3 + (-0.6 if i % 2 else 0.6), 0.9 + (i // 2) * 1.1, 'shiro', leg='kuro')
    else:   # 市民総踊り
        for i in range(6):
            person(-1.5 + i * 0.6 + a * 0.1, 1 + (i % 2) * 0.8, f'odori{(i + b) % 6}')
    for i in range(4 + t * 3 + b):   # 見物の人
        side = -1 if i % 2 else 1
        person(side * (2.2 + (i % 3) * 0.3), -0.5 + ((i * 1.3) % 9), f'fukuK{i % 3}', scale=0.95)
    return dict(cam=((0, 3, 0.9), 8.5, 14, (a - 2) * 5), sun=(-30, 55))


# 鳥羽の火祭り（2月。大たいまつ「すずみ」を燃やし、神男が火の中の神木と十二縄を取り出す）。s は炎の大きさ、t は時間（夕暮れ〜夜ふけ）
@motif('toba', crowd=True)
def toba(a, b, s, t, R):
    ground('keidaiY')
    for i in range(2):   # すずみ（竹と茅の大たいまつ）
        x, top = -1.7 + i * 3.4 + (a % 3) * 0.2, 4.4 - (s % 2) * 0.5 - i * 0.2
        cyl(f'suzumi{i}', 'wara', 0.7, top, (x, 3, top / 2), verts=16)
        for k in range(5):
            cyl(f'nawa{i}{k}', 'waraD', 0.72, 0.1, (x, 3, 0.6 + k * (top - 1) / 5), verts=16)
        fh = 1.2 + s * 0.5 + t * 0.15   # 炎
        for k in range(26):
            sphere(f'hi{i}{k}', ('hiR', 'hi', 'hiY')[k % 3], 0.25 + R.random() * 0.25, (x + R.uniform(-0.7, 0.7), 3 + R.uniform(-0.4, 0.4), top + R.random() * fh))
        ny = 0.5 + (b % 3) * 0.4   # 神男（古い幟でつくった衣装）
        person(x + 0.9, 2 - ny, 'shinotoko', face='hadaY')
    for i in range(5 + t + b):   # 見物の人（影）
        person(-4 + ((i * 1.6 + a * 0.7) % 8), -1.4 - (i % 2) * 0.4, 'kage', face='kage', leg='kage')
    for i in range(16):   # 火の粉
        box(f'hinoko{i}', 'hiY', (0.06, 0.06, 0.06), (R.uniform(-4, 4), R.uniform(1, 5), R.uniform(4.5, 8)))
    return dict(cam=((0, 2.5, 2.6), 11, 6, (a - 2) * 5), sun=(-30, 30))


# 三河一色大提灯まつり（8月、諏訪神社。高さ10m前後の大提灯に武者絵などをえがく）。s は絵、t は時間（夕暮れ〜夜ふけ）
@motif('chochin', crowd=True)
def chochin(a, b, s, t, R):
    ground('keidaiY')
    box('haiden', 'itaD', (12, 2, 1.6), (0, 6, 0.8))
    roof('haidenY', 'kawara', 0, 6, 1.6, 12.4, 2.8, 1.0)
    n = 2 + b % 2
    for i in range(n):
        x = -2.6 + i * (5.2 / (n - 1)) + (a - 2) * 0.2
        h = 5.0 - (i % 2) * 0.5
        cyl(f'chochin{i}', 'chochinW', 0.9, h, (x, 2.5 + (i % 2) * 0.6, h / 2 + 1.2), verts=24)
        cyl(f'chochinU{i}', 'kuro', 0.7, 0.2, (x, 2.5 + (i % 2) * 0.6, h + 1.3), verts=24)
        cyl(f'chochinD{i}', 'kuro', 0.7, 0.2, (x, 2.5 + (i % 2) * 0.6, 1.1), verts=24)
        for k in range(6):
            cyl(f'hone{i}{k}', 'chochinL', 0.905, 0.04, (x, 2.5 + (i % 2) * 0.6, 1.5 + k * h / 6), verts=24)
        box(f'e{i}', f'cpan{i % 3}', (1.0, 0.1, 1.8), (x, 2.5 + (i % 2) * 0.6 - 0.85, 1.2 + h * 0.55))   # 絵
        box(f'e2{i}', f'cpan{(i + 1) % 3}', (0.4, 0.11, 0.6), (x + 0.2, 2.5 + (i % 2) * 0.6 - 0.86, 1.2 + h * 0.3))
        cyl(f'tsuri{i}', 'kuro', 0.03, 1.0, (x, 2.5 + (i % 2) * 0.6, h + 1.9), verts=6)
    for i in range(3 + t + b):
        person(-4 + ((i * 1.5 + a * 0.9) % 8), -0.8 - (i % 2) * 0.4, 'kage', face='kage', leg='kage')
    return dict(cam=((0, 2.5, 3.0), 12, 4, (a - 2) * 5), sun=(-30, 30))


# 三ヶ根山のあじさい（6月ごろ。山の上から三河湾が見える）。s はあじさいの色、t は時間帯
@motif('ajisai')
def ajisai(a, b, s, t, R):
    sea(8)
    sphere('yama', 'yamaB', 14, (8 - a * 2, 40, -3), (1.6, 0.6, 0.45))
    box('shamen', 'shiba', (60, 14, 0.02), (0, 0, 0.0))
    for i in range(9 + b):
        x, y = R.uniform(-4.5, 4.5), R.uniform(-2, 5)
        sphere(f'ha{i}', 'ajisaiHa', 0.55, (x, y, 0.3), (1.2, 1, 0.7))
        for k in range(3):
            sphere(f'hana{i}{k}', 'ajisai' if k else 'ajisaiL', 0.28, (x + (k - 1) * 0.35, y - 0.25, 0.65 + (k % 2) * 0.1))
    if b >= 3:
        person(-0.5 + a * 0.4, -0.5, 'shiro', hat='ajisai')
    return dict(cam=((0, 2, 0.8), 9, 16, (a - 2) * 6), sun=(-40, 40))


# 西尾の田んぼ：春は水を張って田植え、夏は青い稲、秋は黄金色の稲穂、冬は刈り取ったあとの田
@motif('tanbo')
def tanbo(a, b, s, t, R):
    sphere('yama', 'yamaB', 16, (-8 + a * 4, 60, -4), (1.8, 0.6, 0.4))
    ground(['ta0', 'ta1', 'ta2', 'ta3'][s])
    for i in range(14):   # 稲のうね
        y = -3 + i * 0.6 + (0.0 if i < 8 else (i - 8) * 0.25)
        if s == 0:
            for k in range(14):
                box(f'nae{i}{k}', 'nae', (0.06, 0.06, 0.12), (-6 + k * 0.9 + (i % 2) * 0.45, y, 0.06))
        elif s == 1:
            box(f'ine{i}', 'ine', (14, 0.3, 0.45), (0, y, 0.22))
        elif s == 2:
            box(f'ine{i}', 'inaho', (14, 0.32, 0.5), (0, y, 0.25))
            box(f'ho{i}', 'inahoL', (14, 0.2, 0.06), (0, y - 0.05, 0.52))
        else:
            for k in range(10):
                box(f'kabu{i}{k}', 'kabu', (0.08, 0.08, 0.08), (-6 + k * 1.3 + (i % 2) * 0.6, y, 0.04))
    box('aze', 'aze', (60, 0.4, 0.12), (0, 0.6 + a * 0.4, 0.06))
    if b == 1:   # かかし
        cyl('kakashi', 'itaD', 0.04, 1.3, (1.5 - a * 0.5, 0, 0.65), verts=6)
        box('kakashiU', 'itaD', (0.9, 0.05, 0.05), (1.5 - a * 0.5, 0, 0.95))
        box('kakashiF', 'fuku1', (0.4, 0.15, 0.35), (1.5 - a * 0.5, 0, 0.85))
        sphere('kakashiA', 'mugi', 0.13, (1.5 - a * 0.5, 0, 1.2))
        cyl('kakashiK', 'kin', 0.2, 0.05, (1.5 - a * 0.5, 0, 1.33), verts=10, r2=0.02)
    if b == 2:   # さぎ
        x = -2 + a * 0.9
        sphere('sagi', 'shiro', 0.2, (x, -1, 0.5), (1.6, 0.8, 0.8))
        cyl('sagiK', 'shiro', 0.04, 0.35, (x + 0.25, -1, 0.75), (0, 0.3, 0), 6)
        cyl('sagiA', 'kuro', 0.015, 0.35, (x, -1, 0.17), verts=4)
    if b == 3:   # 農家
        house(3.5 - a * 0.8, 9, 2.6, 1.8, 1.4, 'kabeM', 'kawara', 0.8)
    if b == 4 and s == 2:   # はざかけ
        box('haza', 'inaho', (5, 0.25, 0.6), (-1 + a * 0.5, -1.0, 0.75))
        for x in (-3.4, -1, 1.4):
            cyl(f'hazaP{x}', 'itaD', 0.04, 1.2, (x + a * 0.5, -1.0, 0.6), verts=6)
    elif b == 4:
        person(-1.5 + a * 0.6, -1.2, 'fuku1', hat='mugi')
    return dict(cam=((0, 2, 0.4), 9, 14, (a - 2) * 6), sun=(-40, 40))

# ---------- 描く ----------
def render_one(key, fn, a, b, s, t, out):
    sc = PA.setup_scene()
    sc.render.resolution_x = sc.render.resolution_y = N * SS
    sc.render.film_transparent = True
    R = random.Random(f'{key}:{a}:{b}:{s}:{t}')
    opts = fn(a, b, s, t, R)
    tgt, dist, el, az = opts['cam'][:4]
    cam(tgt, dist, el, az, opts.get('lens', 35))
    sun_light(*opts.get('sun', (-40, 40)))
    os.makedirs(TMP, exist_ok=True)
    names = set_id_materials()
    sc.render.image_settings.color_depth = '16'
    ids = PA.render(sc, os.path.join(TMP, f'_{os.getpid()}-id.png'), 1)
    sc.render.image_settings.color_depth = '8'
    PA.set_materials('light')
    light = PA.render(sc, os.path.join(TMP, f'_{os.getpid()}-light.png'), 32)
    c = SS // 2
    I = ids[c::SS, c::SS][:N, :N]
    L = light.reshape(N, SS, N, SS, 4).mean(axis=(1, 3))   # 明るさは 4×4 の平均（ざらつきを消す）
    id_lin = np.array([(i + 1) / (len(names) + 1) for i in range(len(names))])
    lin = np.asarray   # 16ビットの PNG は、読みこむと光の強さ（linear）にもどっている
    mat = np.argmin(np.abs(id_lin[None, None, :] - lin(I[..., :1])), axis=2).astype(np.uint8)
    sky = I[..., 3] < 0.5
    mat[sky] = 255   # 空（なにもない所）
    depth = np.where(sky, 1e4, lin(I[..., 1]) * FAR).astype(np.float32)
    lum = L[..., :3].mean(axis=2) / np.maximum(L[..., 3], 1e-4)
    band = np.where(lum < BANDS[0], 0, np.where(lum < BANDS[1], 1, 2)).astype(np.uint8)
    np.savez_compressed(out, mat=mat, band=band, depth=depth.astype(np.float16), lum=lum.astype(np.float16), names=np.array(names))


FAR = 120.0   # 奥行きの、いちばん遠いところ（それより遠いのは同じ）


def set_id_materials():
    """材質ごとの番号（赤）と、カメラからの奥行き（緑）を、光なしで描く"""
    names = sorted({m.get('nsg') for m in bpy.data.materials if m.get('nsg')})
    for m in bpy.data.materials:
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        cd = nt.nodes.new('ShaderNodeCameraData')
        dv = nt.nodes.new('ShaderNodeMath')
        dv.operation = 'DIVIDE'
        dv.inputs[1].default_value = FAR
        dv.use_clamp = True
        cmb = nt.nodes.new('ShaderNodeCombineColor')
        cmb.inputs[0].default_value = (names.index(m.get('nsg')) + 1) / (len(names) + 1)
        nt.links.new(cd.outputs['View Z Depth'], dv.inputs[0])
        nt.links.new(dv.outputs[0], cmb.inputs[1])
        nt.links.new(cmb.outputs[0], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    return names


BANDS = (0.45, 0.83)   # 明るさの段の境目（影 ／ ふつう ／ 明るい）。上を向いた地面がふつう、日の当たる面が明るい


def jobs_for(keys):
    for m, (key, fn, crowd) in enumerate(MOTIFS):
        if keys and key not in keys:
            continue
        for s in range(4):
            for t in (range(4) if crowd else (0,)):
                for c in range(25):
                    yield key, fn, c // 5, c % 5, s, t


def main():
    args = sys.argv[1:]
    jobs = int(args[args.index('--jobs') + 1]) if '--jobs' in args else 1
    part = args[args.index('--part') + 1] if '--part' in args else None
    keys = [x for x in args if not x.startswith('-') and not x.replace('/', '').isdigit()]
    if jobs > 1 and part is None:
        ps = [subprocess.Popen([sys.executable, __file__, *keys, '--part', f'{i}/{jobs}']) for i in range(jobs)]
        sys.exit(max(p.wait() for p in ps))
    i0, n0 = map(int, part.split('/')) if part else (0, 1)
    todo = [j for k, j in enumerate(jobs_for(keys)) if k % n0 == i0]
    for n, (key, fn, a, b, s, t) in enumerate(todo):
        out = os.path.join(TMP, f'{key}-{a}{b}{s}{t}.npz')
        if os.path.exists(out) and '--force' not in args:
            continue
        render_one(key, fn, a, b, s, t, out)
        if n % 25 == 0:
            print(f'[{i0}] {n}/{len(todo)} {key}', flush=True)


if __name__ == '__main__':
    main()

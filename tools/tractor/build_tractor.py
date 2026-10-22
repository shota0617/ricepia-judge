# ヤンマー YT460A（直進アシスト仕様・キャビン）風の 60 馬力トラクターを Blender で作り、glTF（.glb）に書き出す
# - トラクター運転ゲーム（three.js r128・素の GLTFLoader）の車体用。メーカーのロゴや文字は入れない
# - 単位はメートル。原点＝後輪車軸中心の真下の地面。Blender 上で 前＝-Y・左＝+X・上＝+Z
#   （glTF は +Y up で書き出すので three.js では 前＝+Z・左＝+X・上＝+Y）
# - 動く部品は名前つきの別オブジェクト（README.md の表）。止まっている所は Body・Interior・Glass にまとめる
# - 確認用の絵 preview_*.png を Cycles で出してから tractor_yt.glb を書き出す
# 使い方：python tools/tractor/build_tractor.py [--no-render | --fast]
#   （pip で bpy==5.2.2 を入れた Python 3.13。画面は要らない）
import math
import os
import sys

import bpy  # bpy を先に読むと bmesh・mathutils が使える
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_GLB = os.path.join(HERE, 'tractor_yt.glb')
RENDER = '--no-render' not in sys.argv
FAST = '--fast' in sys.argv          # 試し用（荒い絵）

# ---- 諸元（公式：全長 3.96・全幅 1.85・全高 2.635・軸距 2.15・輪距 前後 1.32） ----
WB = 2.15                         # 軸距
TR = 1.32 / 2                     # 輪距の半分（前後とも）
R_OD, R_W, R_RIM = 1.32, 0.38, 0.711 / 2   # 後タイヤ 14.9-28
F_OD, F_W, F_RIM = 0.89, 0.21, 0.508 / 2   # 前タイヤ 8.3-20
RZ = R_OD / 2                     # 後輪車軸の高さ
FZ = F_OD / 2                     # 前輪車軸の高さ
FY = -WB                          # 前輪車軸の Y
KP = 0.56                         # 前輪かじ取り中心（キングピン）の X
FLOOR = 1.32                      # キャビン床
ROOF_IN = 2.47                    # 屋根の内側
CAB_X = 0.645                     # キャビンの側面（幅 1.29）
GLASS_F = -0.62                   # 前ガラス（まん中）
GLASS_F_SIDE = -0.54              # 前ガラスの両はし（Aピラー）
GLASS_R = 0.82                    # 後ガラス
EYE = Vector((0.0, 0.46, 2.27))   # 運転者の目
ROTARY_Y = 1.38                   # ロータリーの原点（後輪車軸の後ろ）
TILL_W = 2.2                      # 耕うん幅

# ---- 色と材質（名前はそのまま glTF の材質名になる） ----
PAL = {
    'paint_red': dict(c='#c3141b', r=0.28, coat=0.5),
    'black': dict(c='#161616', r=0.55),
    'black_gloss': dict(c='#0c0c0c', r=0.22),
    'darkgray': dict(c='#35383b', r=0.5, m=0.3),
    'chrome': dict(c='#e8e8e8', r=0.08, m=1.0),
    'silver': dict(c='#b9bdc1', r=0.28, m=0.85),
    'wheel_cream': dict(c='#e6d9b0', r=0.35),
    'tire': dict(c='#1b1b1b', r=0.85),
    'white': dict(c='#f2f2ef', r=0.3),
    'glass': dict(c='#b4c6c4', r=0.04, a=0.16),
    'visor': dict(c='#202a2a', r=0.1, a=0.65),
    'lamp_head': dict(c='#e9eef2', r=0.06, m=0.3),
    'lamp_work': dict(c='#e9eef2', r=0.06, m=0.3),
    'winker_L': dict(c='#ee8c12', r=0.15),
    'winker_R': dict(c='#ee8c12', r=0.15),
    'tail': dict(c='#b0111b', r=0.15),
    'room_lamp': dict(c='#f2f1e8', r=0.2),
    'reflector': dict(c='#e43a12', r=0.2),
    'smv_red': dict(c='#c0101a', r=0.2),
    'gray': dict(c='#70757a', r=0.45),
    'trim': dict(c='#4d5054', r=0.6),
    'trim_light': dict(c='#9a9ea2', r=0.6),
    'headliner': dict(c='#bdbdb6', r=0.8),
    'rubber_mat': dict(c='#262626', r=0.9),
    'seat': dict(c='#2a2b2e', r=0.85),
    'orange': dict(c='#ff6f00', r=0.35),
    'yellow': dict(c='#f4c400', r=0.35),
    'beige': dict(c='#d9c9a3', r=0.45),
    'blue': dict(c='#1f5fc4', r=0.35),
    'led_green': dict(c='#2cff5a', r=0.3, e=3.0),
    'mirror': dict(c='#dfe3e6', r=0.02, m=1.0),
    'meter_screen': dict(c='#ffffff', r=0.25, tex='meter'),
    'monitor_screen': dict(c='#ffffff', r=0.15, tex='monitor'),
}


def lin(h):
    """#rrggbb（sRGB）→ 線形の RGB"""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def make_tex(kind):
    """メーター・モニターの仮の絵（ゲーム側で描き直してよい）。UV は 0〜1、下が v=0"""
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    img = np.zeros((S, S, 4), np.float32)
    img[..., 3] = 1
    if kind == 'meter':
        u, v = (xx + 0.5) / S * 2 - 1, (yy + 0.5) / S * 2 - 1
        rr, ang = np.hypot(u, v), np.degrees(np.arctan2(v, u))
        img[..., :3] = 0.0
        img[rr < 0.98, :3] = (0.012, 0.014, 0.018)
        img[(rr > 0.94) & (rr < 0.98), :3] = (0.5, 0.52, 0.55)        # 銀の縁
        sweep = (ang < 225) & (ang > -45) | (ang > 135) | (ang < -45)
        arc = (rr > 0.80) & (rr < 0.84)
        a2 = np.where(ang < -45, ang + 360, ang)                       # 225°（左下）から -45°（右下）へ 270° の目盛り
        on = arc & (a2 <= 225) & (a2 >= -45)
        img[on, :3] = (0.75, 0.78, 0.8)
        red = arc & (a2 >= -45) & (a2 < 0)
        img[red, :3] = (0.9, 0.08, 0.05)
        for k in range(28):                                             # 目盛り
            a = math.radians(225 - k * 10)
            L = 0.12 if k % 3 == 0 else 0.06
            for t in np.linspace(0.82 - L, 0.84, 30):
                px, py = int((math.cos(a) * t + 1) / 2 * S), int((math.sin(a) * t + 1) / 2 * S)
                img[max(py - 2, 0):py + 2, max(px - 2, 0):px + 2, :3] = (0.85, 0.86, 0.88)
        lcd = (np.abs(u) < 0.42) & (v > -0.62) & (v < -0.18)            # まん中下の液晶
        img[lcd, :3] = (0.05, 0.11, 0.13)
        img[lcd & (np.abs(u) < 0.36) & (np.abs(v + 0.40) < 0.05), :3] = (0.35, 0.8, 0.9)
        a = math.radians(160)                                           # 針
        for t in np.linspace(0, 0.78, 160):
            px, py = int((math.cos(a) * t + 1) / 2 * S), int((math.sin(a) * t + 1) / 2 * S)
            img[py - 3:py + 3, px - 3:px + 3, :3] = (1.0, 0.25, 0.05)
        img[rr < 0.07, :3] = (0.2, 0.2, 0.22)
        for i, (cx, cy, col) in enumerate([(-0.55, 0.45, (0.1, 0.8, 0.2)), (0.55, 0.45, (0.1, 0.8, 0.2)),
                                           (-0.25, 0.55, (0.95, 0.6, 0.05)), (0.25, 0.55, (0.2, 0.5, 1.0))]):
            img[np.hypot(u - cx, v - cy) < 0.05, :3] = col              # 表示灯
    else:
        u, v = (xx + 0.5) / S, (yy + 0.5) / S
        img[..., :3] = (0.02, 0.05, 0.09)
        img[(v > 0.86), :3] = (0.08, 0.12, 0.18)                        # 上の帯
        field = (u > 0.05) & (u < 0.68) & (v > 0.08) & (v < 0.82)
        img[field, :3] = (0.08, 0.2, 0.08)
        for k in range(7):                                              # 走る筋（直進アシストの線）
            x0 = 0.1 + k * 0.08
            img[field & (np.abs(u - x0 - (v - 0.08) * 0.05) < 0.004), :3] = (0.3, 0.6, 0.3)
        img[field & (np.abs(u - 0.34 - (v - 0.08) * 0.05) < 0.009), :3] = (0.2, 0.9, 1.0)
        tri = field & (np.abs(u - 0.355) < (0.30 - v) * 0.4) & (v > 0.18) & (v < 0.30)
        img[tri, :3] = (1.0, 0.5, 0.1)
        for k in range(5):                                              # 右のボタン
            b = (u > 0.73) & (u < 0.95) & (np.abs(v - (0.75 - k * 0.15)) < 0.055)
            img[b, :3] = (0.12, 0.2, 0.32)
        img[(u > 0.73) & (u < 0.95) & (np.abs(v - 0.75) < 0.055), :3] = (0.1, 0.45, 0.2)
    im = bpy.data.images.new(kind, S, S, alpha=False)
    im.pixels.foreach_set(img.ravel())
    im.file_format = 'PNG'
    im.pack()
    return im


def M(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    p = PAL[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*lin(p['c']), 1)
    bs.inputs['Roughness'].default_value = p['r']
    bs.inputs['Metallic'].default_value = p.get('m', 0.0)
    if 'coat' in p:
        bs.inputs['Coat Weight'].default_value = p['coat']
        bs.inputs['Coat Roughness'].default_value = 0.05
    if 'a' in p:
        bs.inputs['Alpha'].default_value = p['a']
        m.surface_render_method = 'BLENDED'
    if 'e' in p:
        bs.inputs['Emission Color'].default_value = (*lin(p['c']), 1)
        bs.inputs['Emission Strength'].default_value = p['e']
    if 'tex' in p:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = make_tex(p['tex'])
        nt.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
        nt.links.new(tn.outputs['Color'], bs.inputs['Emission Color'])
        bs.inputs['Emission Strength'].default_value = 1.0
    m.diffuse_color = (*lin(p['c']), p.get('a', 1))
    return m


# ---- 部品をまとめる入れ物（with part('名前'): の中で作った物は、あとで 1 つのオブジェクトになる） ----
CUR = ['Body']
GROUPS = {}


class part:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.prev = CUR[0]
        CUR[0] = self.name

    def __exit__(self, *a):
        CUR[0] = self.prev


def _obj(bm, mat, smooth=None, bevel=None, recalc=True):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(CUR[0])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(CUR[0], me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(M(mat))
    if smooth is not None or bevel:
        me.shade_smooth()
    if smooth is not None:
        me.set_sharp_from_angle(angle=math.radians(smooth))
    if bevel:
        md = ob.modifiers.new('bevel', 'BEVEL')
        md.width, md.segments = bevel[0], bevel[1] if len(bevel) > 1 else 2
        md.limit_method = 'ANGLE'
        md.harden_normals = True
    GROUPS.setdefault(CUR[0], []).append(ob)
    return ob


def T(loc=(0, 0, 0), rot=(0, 0, 0), scl=(1, 1, 1)):
    """位置・回転（度）・大きさ → 行列"""
    r = Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
    return Matrix.Translation(loc) @ r @ Matrix.Diagonal((*scl, 1))


def along(p0, p1, roll_up=(0, 0, 1)):
    """p0 から p1 へ向かう向きを局所 +Z にする行列（原点は p0）"""
    p0, p1 = Vector(p0), Vector(p1)
    z = (p1 - p0).normalized()
    up = Vector(roll_up)
    if abs(z.dot(up)) > 0.98:
        up = Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))
    x = up.cross(z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = p0
    return m


def box(mat, size, loc, rot=(0, 0, 0), bev=None, mtx=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = (T(loc, rot) if mtx is None else mtx @ T(loc, rot)) @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return _obj(bm, mat, bevel=bev)


def cyl(mat, r, h, loc, rot=(0, 0, 0), n=24, r2=None, caps=True, smooth=40, mtx=None):
    """円柱（局所 Z 方向。loc はまん中）"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=h)
    m = T(loc, rot) if mtx is None else mtx @ T(loc, rot)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return _obj(bm, mat, smooth=smooth)


def cyl_x(mat, r, x0, x1, y, z, n=24, r2=None, smooth=40):
    """X 方向の円柱（x0〜x1）"""
    return cyl(mat, r, abs(x1 - x0), ((x0 + x1) / 2, y, z), (0, 90, 0), n, r2, smooth=smooth)


def sph(mat, r, loc, scl=(1, 1, 1), rot=(0, 0, 0), n=16, mtx=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=n, v_segments=max(n // 2, 4), radius=r)
    m = T(loc, rot, scl) if mtx is None else mtx @ T(loc, rot, scl)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return _obj(bm, mat, smooth=80)


def tor(mat, R, r, mtx, n1=40, n2=10, a0=0.0, a1=360.0):
    """輪（局所 XY 面、局所 Z が軸）。a0〜a1 度だけの弧にもできる"""
    full = abs(a1 - a0) >= 360
    bm = bmesh.new()
    rings = []
    cnt = n1 if full else n1 + 1
    for i in range(cnt):
        a = math.radians(a0 + (a1 - a0) * i / n1)
        c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(mtx @ Vector(((R + r * math.cos(b)) * c, (R + r * math.cos(b)) * s, r * math.sin(b))))
                      for b in [2 * math.pi * k / n2 for k in range(n2)]])
    for i in range(cnt if full else cnt - 1):
        A, B = rings[i], rings[(i + 1) % cnt]
        for k in range(n2):
            bm.faces.new((A[k], B[k], B[(k + 1) % n2], A[(k + 1) % n2]))
    return _obj(bm, mat, smooth=60)


def lathe(mat, prof, cy, cz, n=48, a0=None, a1=None, closed_prof=False, smooth=40):
    """X 軸（y=cy, z=cz を通る）のまわりに断面 prof＝[(x, 半径)…] を回す。
    角度 φ は 0 が真上、＋が後ろ（+Y）。a0・a1（度）を渡すとその間だけ"""
    full = a0 is None
    bm = bmesh.new()
    cnt = n if full else n + 1
    rings = []
    for i in range(cnt):
        ph = 2 * math.pi * i / n if full else math.radians(a0 + (a1 - a0) * i / n)
        rings.append([bm.verts.new((x, cy + r * math.sin(ph), cz + r * math.cos(ph))) for x, r in prof])
    P = len(prof)
    for i in range(cnt if full else cnt - 1):
        A, B = rings[i], rings[(i + 1) % cnt]
        for k in range(P if closed_prof else P - 1):
            k2 = (k + 1) % P
            bm.faces.new((A[k], A[k2], B[k2], B[k]))
    return _obj(bm, mat, smooth=smooth)


def loft(mat, secs, cap0=False, cap1=False, smooth=45, closed=False):
    """同じ点数の断面（3D 点のリスト）を順につないだ面"""
    bm = bmesh.new()
    rows = [[bm.verts.new(p) for p in s] for s in secs]
    P = len(secs[0])
    for a, b in zip(rows, rows[1:]):
        for k in range(P if closed else P - 1):
            k2 = (k + 1) % P
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if cap0:
        bm.faces.new(rows[0])
    if cap1:
        bm.faces.new(rows[-1])
    return _obj(bm, mat, smooth=smooth)


def pipe(mat, pts, r, n=10, cap=True, smooth=70):
    """折れ線にそった管"""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    nrm = t0.cross(ref).normalized()
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - p).normalized() + (p - pts[i - 1]).normalized()
        t.normalize()
        nrm = (nrm - t * nrm.dot(t)).normalized()
        b = t.cross(nrm)
        rings.append([bm.verts.new(p + (nrm * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r)
                      for k in range(n)])
    for A, B in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]))
    if cap:
        bm.faces.new(rings[0])
        bm.faces.new(rings[-1])
    return _obj(bm, mat, smooth=smooth)


def prism(mat, poly, th, mtx, bev=None, smooth=None):
    """局所 XY 面の多角形 poly を局所 Z に厚さ th で押し出す（厚さのまん中が z=0）"""
    bm = bmesh.new()
    lo = [bm.verts.new(mtx @ Vector((x, y, -th / 2))) for x, y in poly]
    hi = [bm.verts.new(mtx @ Vector((x, y, th / 2))) for x, y in poly]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(poly)
    for k in range(n):
        bm.faces.new((lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]))
    return _obj(bm, mat, smooth=smooth, bevel=bev)


def face_mtx(center, normal, up=(0, 0, 1)):
    """局所 +Z を normal に、局所 +Y をなるべく up に向けた行列"""
    z = Vector(normal).normalized()
    u = Vector(up)
    if abs(z.dot(u.normalized())) > 0.98:
        u = Vector((0, 1, 0))
    x = u.cross(z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(center)
    return m


def screen(name, w, h, center, normal, up, mat):
    """表示面（四角い平面・UV 0〜1。見る人から見て右が u、上が v）。単独のオブジェクト"""
    m = face_mtx(center, normal, up)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(m @ Vector((x * w / 2, y * h / 2, 0))) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    for lp, (a, b) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lp[uv].uv = (a, b)
    with part(name):
        _obj(bm, mat, recalc=False)
    # 原点は面のまん中。three.js では PlaneGeometry と同じ向き（局所 +Z が表、+Y が上）になるよう、Blender では局所 -Y を表にする
    SCREENS[name] = Matrix((m.col[0].xyz, -m.col[2].xyz, m.col[1].xyz)).transposed().to_4x4()
    SCREENS[name].translation = m.translation
    return m


SCREENS = {}


def tri_count():
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            me = ob.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            n += len(me.loop_triangles)
            ob.evaluated_get(dg).to_mesh_clear()
    return n


# ================================================================
#  タイヤとホイール
# ================================================================
TIRE_SIDE = [(0.40, 0.00), (0.47, 0.10), (0.50, 0.35), (0.49, 0.64), (0.455, 0.87), (0.37, 0.965), (0.22, 1.0), (0.0, 1.0)]


def tire_profile(W, rim, ro):
    side = [(f * W, rim + g * (ro - rim)) for f, g in TIRE_SIDE]
    return side + [(-x, r) for x, r in reversed(side[:-1])]


def r_on_tire(xf, W, rim, ro):
    """タイヤの面の半径（xf はまん中からの距離÷幅）"""
    pts = list(reversed(TIRE_SIDE))
    for (f0, g0), (f1, g1) in zip(pts, pts[1:]):
        if f0 <= xf <= f1 or f1 <= xf <= f0:
            t = (xf - f0) / (f1 - f0) if f1 != f0 else 0
            return rim + (g0 + (g1 - g0) * t) * (ro - rim)
    return rim + 0.35 * (ro - rim)


def lugs(cx, cy, cz, W, rim, ro, h, count, thick, slope):
    """ハイラグ（V 字に互い違いの山）。地面に着く所で V の先が前を向く"""
    bm = bmesh.new()
    steps = 5
    for side in (1, -1):
        for k in range(count):
            th0 = 2 * math.pi * (k + (0.5 if side < 0 else 0)) / count
            rows = []
            for i in range(steps + 1):
                t = i / steps
                xf = 0.03 + t * 0.47                   # まん中のそば → 肩
                x = side * xf * W
                rb = r_on_tire(min(xf, 0.5), W, rim, ro) - 0.004
                hh = h * (1 - 0.35 * max(0, t - 0.75) / 0.25)
                th = th0 - xf * W * slope / ro          # 肩へ行くほど遅れる（V 字）
                dth = thick / ro / 2
                q = []
                for tt, rr in ((th - dth, rb), (th + dth, rb), (th + dth * 0.8, rb + hh), (th - dth * 0.8, rb + hh)):
                    q.append(bm.verts.new((cx + x, cy + rr * math.sin(tt), cz + rr * math.cos(tt))))
                rows.append(q)
            for a, b in zip(rows, rows[1:]):
                for j in range(4):
                    bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
            bm.faces.new(rows[0])
            bm.faces.new(rows[-1][::-1])
    return _obj(bm, 'tire', smooth=35)


def wheel(cx, cy, cz, OD, W, rim, rear):
    s = 1 if cx > 0 else -1                       # 外側の向き
    lug_h = 0.04 if rear else 0.028
    ro = OD / 2 - lug_h
    prof = [(cx + x, r) for x, r in tire_profile(W, rim, ro)]
    lathe('tire', prof, cy, cz, n=72 if rear else 56, smooth=50)
    lugs(cx, cy, cz, W, rim, ro, lug_h, 22 if rear else 19, 0.05 if rear else 0.036, 0.85)
    # リム（クリーム色）：かさね目と左右のふち
    rp = [(-0.47, 0.035), (-0.44, 0.0), (-0.30, -0.012), (-0.18, -0.045), (0.18, -0.045), (0.30, -0.012), (0.44, 0.0), (0.47, 0.035)]
    lathe('wheel_cream', [(cx + f * W, rim + d) for f, d in rp], cy, cz, n=48, smooth=50)
    # 皿（ディスク）：外へふくらむ。まん中にハブ
    off = -0.10 * s if rear else 0.02 * s
    dp = [(cx + off - 0.02 * s, rim - 0.04), (cx + off + 0.03 * s, rim * 0.62), (cx + off + 0.05 * s, 0.13), (cx + off + 0.05 * s, 0.0)]
    lathe('wheel_cream', dp, cy, cz, n=40, smooth=35)
    for k in range(8 if rear else 6):              # 皿の穴（飾り）
        a = 2 * math.pi * (k + 0.5) / (8 if rear else 6)
        rr = rim * 0.70
        cyl('black', 0.045 if rear else 0.03, 0.012, (cx + off + 0.022 * s, cy + rr * math.sin(a), cz + rr * math.cos(a)), (0, 90, 0), 14)
    hub_x = cx + off + 0.05 * s
    cyl_x('wheel_cream', 0.11 if rear else 0.075, hub_x, hub_x + 0.07 * s, cy, cz, 24)
    cyl_x('darkgray', 0.06 if rear else 0.045, hub_x + 0.07 * s, hub_x + 0.11 * s, cy, cz, 16)
    for k in range(8 if rear else 6):              # ナット
        a = 2 * math.pi * k / (8 if rear else 6)
        rr = 0.085 if rear else 0.058
        cyl_x('silver', 0.012, hub_x + 0.07 * s, hub_x + 0.085 * s, cy + rr * math.sin(a), cz + rr * math.cos(a), 6)


# ================================================================
#  外装
# ================================================================
def hood_sec(y, w, t, b, rc, n=6):
    pts = [(-w, b)]
    for i in range(n + 1):
        a = math.pi - (math.pi / 2) * i / n
        pts.append((-w + rc + rc * math.cos(a), t - rc + rc * math.sin(a)))
    for i in range(n + 1):
        a = math.pi / 2 - (math.pi / 2) * i / n
        pts.append((w - rc + rc * math.cos(a), t - rc + rc * math.sin(a)))
    pts.append((w, b))
    return [(x, y, z) for x, z in pts]


def hood():
    """赤い鋼板のボンネット（前下がり）と黒いグリル・V 字メッキ・吊り目ヘッドライト"""
    secs = []
    N = 13
    y0, y1 = GLASS_F + 0.01, -2.80
    for i in range(N):
        s = i / (N - 1)
        y = y0 + (y1 - y0) * s
        secs.append((y, 0.385 - 0.04 * s, 1.585 - 0.20 * s - 0.06 * s ** 2.5, 0.86, 0.15 - 0.04 * s))
    for dy, dt, dw in ((0.04, 0.012, 0.006), (0.07, 0.035, 0.018), (0.085, 0.065, 0.034)):   # 鼻先を丸める
        y, w, t, b, rc = secs[N - 1]
        secs.append((y1 - dy, w - dw, t - dt, b, rc))
    loft('paint_red', [hood_sec(*s) for s in secs], smooth=50)
    yF = secs[-1][0]
    front = [(x, z) for x, _, z in hood_sec(*secs[-1])]
    face = T((0, yF - 0.004, 0), (90, 0, 0))                                     # 鼻先の面（局所 x＝X、局所 y＝Z）
    prism('paint_red', front, 0.01, face)
    gy = yF - 0.012
    # 黒いグリル（下半分）：横桟と V 字メッキ
    gw = 0.27
    prism('black', [(-gw, 0.875), (gw, 0.875), (gw, 1.075), (gw - 0.04, 1.105), (-gw + 0.04, 1.105), (-gw, 1.075)], 0.014, T((0, gy, 0), (90, 0, 0)), bev=(0.006,))
    for k in range(5):
        box('darkgray', (2 * gw - 0.05, 0.01, 0.012), (0, gy - 0.008, 0.905 + k * 0.038))
    pipe('chrome', [(-0.21, gy - 0.014, 1.085), (0, gy - 0.014, 0.915), (0.21, gy - 0.014, 1.085)], 0.011, 8)
    pipe('chrome', [(-0.17, gy - 0.012, 1.085), (0, gy - 0.012, 0.95), (0.17, gy - 0.012, 1.085)], 0.006, 6)
    # 吊り目ヘッドライト（外のはしが上がった細長い灯。黒い縁の中）
    for s in (1, -1):
        poly = [(0.075, 1.125), (0.27, 1.175), (0.275, 1.205), (0.07, 1.153)]
        rim_ = [(0.055, 1.112), (0.285, 1.165), (0.29, 1.218), (0.05, 1.167)]
        prism('black_gloss', [(s * x, z) for x, z in rim_], 0.012, T((0, gy + 0.002, 0), (90, 0, 0)))
        prism('lamp_head', [(s * x, z) for x, z in poly], 0.012, T((0, gy - 0.003, 0), (90, 0, 0)))
    # ボンネット横の通気口
    for s in (1, -1):
        for k in range(5):
            box('black', (0.008, 0.20, 0.016), (s * (0.375), -1.05 - k * 0.0, 1.06 + k * 0.035))
        prism('black', [(-2.30, 0.90), (-2.76, 0.90), (-2.80, 1.02), (-2.40, 1.07)], 0.008, T((s * 0.348, 0, 0), (90, 0, 90)))
        for k in range(4):
            box('darkgray', (0.006, 0.36 - 0.03 * k, 0.012), (s * 0.353, -2.55 - 0.005 * k, 0.925 + k * 0.032))
    # ボンネットの下：エンジン・前の枠・前車軸
    box('darkgray', (0.56, 2.0, 0.40), (0, -1.70, 0.80), bev=(0.03,))
    box('darkgray', (0.46, 1.4, 0.18), (0, -1.45, 0.52), bev=(0.03,))
    box('darkgray', (0.50, 0.70, 0.36), (0, -2.58, 0.66), bev=(0.02,))           # 前の枠（バンパー台）
    box('black', (0.60, 0.15, 0.30), (0, -2.86, 0.62), bev=(0.015,))             # ウェイトの台
    for k in range(8):                                                           # 黒いフロントウェイト
        x = -0.385 + k * 0.11
        box('black_gloss', (0.098, 0.17, 0.36), (x, -2.995, 0.62), bev=(0.012,))
        box('black_gloss', (0.03, 0.06, 0.06), (x, -3.04, 0.83), bev=(0.006,))
    pipe('black', [(-0.30, -3.02, 0.85), (-0.30, -3.055, 0.89), (0.30, -3.055, 0.89), (0.30, -3.02, 0.85)], 0.016, 8)  # 持ち手
    cyl_x('darkgray', 0.075, -KP + 0.06, KP - 0.06, FY, FZ, 20)                     # 前車軸
    sph('darkgray', 0.15, (0, FY, FZ), (1.0, 1.1, 0.95))
    cyl('darkgray', 0.03, 1.2, (0, -1.5, 0.47), (90, 0, 0), 12)                   # 前輪へのシャフト
    box('darkgray', (0.20, 0.30, 0.10), (0, FY, FZ + 0.12))


def cab():
    """4 本柱のキャビン・屋根・ガラス・ライト・排気管・ステップ"""
    fy = lambda x: GLASS_F_SIDE + (GLASS_F - GLASS_F_SIDE) * (1 - (abs(x) / CAB_X) ** 2.4)   # 前ガラスの曲がり
    # 柱（黒）
    for s in (1, -1):
        pipe('black', [(s * CAB_X, fy(CAB_X) + 0.01, FLOOR + 0.02), (s * CAB_X, fy(CAB_X) + 0.01, ROOF_IN)], 0.03, 8)
        box('black', (0.06, 0.06, ROOF_IN - FLOOR - 0.04), (s * CAB_X, GLASS_R - 0.01, (FLOOR + ROOF_IN) / 2 + 0.01), bev=(0.01,))
        # 横の下の板（後輪の上）
        prism('black', [(-0.25, FLOOR), (GLASS_R, FLOOR), (GLASS_R, 1.62), (-0.25, 1.62)], 0.03, T((s * CAB_X, 0, 0), (90, 0, 90)))
        # ドアの枠
        pipe('black', [(s * CAB_X, -0.50, 1.36), (s * CAB_X, -0.28, 1.36), (s * CAB_X, -0.22, 1.62), (s * CAB_X, GLASS_R - 0.03, 1.62)], 0.012, 6, cap=False)
        pipe('black', [(s * CAB_X, -0.50, ROOF_IN - 0.02), (s * CAB_X, GLASS_R - 0.03, ROOF_IN - 0.02)], 0.012, 6)
        # ドアの取っ手・ちょうつがい
        box('black', (0.03, 0.12, 0.025), (s * (CAB_X + 0.02), -0.40, 1.80), bev=(0.006,))
        for z in (1.75, 2.25):
            box('black', (0.03, 0.04, 0.06), (s * (CAB_X + 0.015), GLASS_R - 0.05, z))
    # 前の下（ボンネットとガラスのあいだ）
    box('black', (1.24, 0.06, 0.08), (0, GLASS_F_SIDE + 0.02, FLOOR + 0.04))
    box('black', (0.60, 0.06, 0.30), (0, GLASS_F + 0.02, FLOOR + 0.15))
    box('black', (1.28, 0.08, 0.30), (0, GLASS_R, FLOOR + 0.14))                  # 後ろの下
    # 屋根（赤）と黒い庇
    box('paint_red', (1.48, 1.62, 0.10), (0, 0.06, ROOF_IN + 0.055), bev=(0.045, 3))
    box('paint_red', (1.30, 1.32, 0.03), (0, 0.08, ROOF_IN + 0.10), bev=(0.015, 2))
    box('black', (1.46, 0.15, 0.03), (0, -0.80, ROOF_IN + 0.03), (-10, 0, 0), bev=(0.01,))
    box('black', (1.50, 0.05, 0.05), (0, 0.85, ROOF_IN + 0.03), bev=(0.01,))
    # GNSS アンテナ（白い傘）
    cyl('white', 0.05, 0.04, (0, -0.25, ROOF_IN + 0.135), n=20)
    sph('white', 0.085, (0, -0.25, ROOF_IN + 0.13), (1, 1, 0.41), n=24)
    # LED ワークランプ（前後 2 灯ずつ）
    for s in (1, -1):
        box('black', (0.11, 0.06, 0.06), (s * 0.48, -0.79, ROOF_IN - 0.01), (-10, 0, 0), bev=(0.008,))
        box('lamp_work', (0.09, 0.008, 0.04), (s * 0.48, -0.822, ROOF_IN - 0.016), (-10, 0, 0))
        box('black', (0.11, 0.05, 0.06), (s * 0.52, 0.85, ROOF_IN - 0.03), (10, 0, 0), bev=(0.008,))
        box('lamp_work', (0.09, 0.008, 0.04), (s * 0.52, 0.877, ROOF_IN - 0.03), (10, 0, 0))
    # 右 A ピラーに沿う黒い排気管（ボンネットの右から上へ）
    ex = -CAB_X - 0.07
    pipe('black', [(-0.33, -0.95, 1.12), (-0.50, -0.80, 1.14), (ex, -0.66, 1.30), (ex, -0.64, 1.55), (ex, -0.64, 2.30), (ex - 0.005, -0.645, 2.42)], 0.035, 14)
    cyl('black', 0.058, 0.55, (ex, -0.64, 1.86), n=18)                         # マフラーのカバー
    for z in (1.62, 2.10):
        box('black', (0.07, 0.03, 0.02), (ex + 0.035, -0.62, z))
    # 前のウインカー（Aピラーの下の外）
    for s, nm in ((1, 'winker_L'), (-1, 'winker_R')):
        box('black', (0.07, 0.07, 0.08), (s * (CAB_X + 0.05), fy(CAB_X) - 0.02, 1.46), bev=(0.01,))
        box(nm, (0.06, 0.02, 0.06), (s * (CAB_X + 0.055), fy(CAB_X) - 0.06, 1.46), bev=(0.008,))
    # ミラー（外）：ステーと黒い枠。鏡の面は MirrorL・MirrorR
    for s in (1, -1):
        pipe('black', [(s * (CAB_X + 0.02), fy(CAB_X) + 0.02, 2.30), (s * 0.80, fy(CAB_X) + 0.0, 2.26), (s * 0.86, fy(CAB_X) + 0.03, 2.17)], 0.012, 8)
        box('black', (0.13, 0.035, 0.21), (s * 0.861, fy(CAB_X) + 0.05, 2.06), (0, 0, s * 12), bev=(0.015,))
    # 左の乗降ステップ
    for z, y in ((0.48, -0.78), (0.86, -0.77), (1.25, -0.70)):
        box('darkgray', (0.27, 0.13 if z < 1 else 0.17, 0.025), (0.68, y, z), bev=(0.006,))
    for x in (0.545, 0.815):
        prism('black', [(-0.86, 0.44), (-0.70, 0.44), (-0.60, FLOOR), (-0.80, FLOOR)], 0.012, T((x, 0, 0), (90, 0, 90)))
    pipe('black', [(0.71, -0.62, 1.45), (0.73, -0.62, 1.60), (0.73, -0.60, 2.15), (0.70, -0.58, 2.22)], 0.015, 8)   # 乗降グリップ（外）
    # 床の下
    box('darkgray', (1.20, 1.38, 0.10), (0, 0.13, FLOOR - 0.06))


def glass():
    """曲面一枚の前ガラス・ドアのガラス・後ガラス（材質 glass）"""
    fy = lambda x: GLASS_F_SIDE + (GLASS_F - GLASS_F_SIDE) * (1 - (abs(x) / CAB_X) ** 2.4)
    secs = []
    for i in range(25):
        x = -CAB_X + 2 * CAB_X * i / 24
        zb = 1.40 + 0.20 * max(0.0, min(1.0, (0.42 - abs(x)) / 0.12))           # まん中はボンネットの上から
        secs.append([(x, fy(x), zb), (x, fy(x), ROOF_IN - 0.01)])
    with part('Glass'):
        loft('glass', secs, smooth=60)
        for s in (1, -1):
            prism('glass', [(fy(CAB_X) + 0.03, 1.37), (-0.28, 1.37), (-0.22, 1.625), (GLASS_R - 0.03, 1.625), (GLASS_R - 0.03, ROOF_IN - 0.01),
                            (fy(CAB_X) + 0.03, ROOF_IN - 0.01)], 0.008, T((s * CAB_X, 0, 0), (90, 0, 90)))
        box('glass', (2 * CAB_X - 0.04, 0.008, ROOF_IN - 1.62), (0, GLASS_R, (ROOF_IN + 1.61) / 2))


def fenders_lamps():
    """赤い大型リヤフェンダー・スマートリヤコンビランプ・低速車マーク・後ろの三点リンクの腕"""
    for s, wk in ((1, 'winker_L'), (-1, 'winker_R')):
        prof = [(0.47, 0.70), (0.47, 0.775), (0.86, 0.79), (0.905, 0.765), (0.91, 0.69), (0.895, 0.69), (0.89, 0.755), (0.855, 0.775), (0.485, 0.762), (0.485, 0.70)]
        lathe('paint_red', [(s * x, r) for x, r in prof], 0.0, RZ, n=40, a0=-58, a1=82, closed_prof=True, smooth=40)
        # フェンダーの後ろのはしの黒い縁
        # スマートリヤコンビランプ（上がテール、下がウインカー）
        ph = math.radians(48)
        cy, cz = 0.80 * math.sin(ph), RZ + 0.80 * math.cos(ph)
        mt = T((s * 0.83, cy, cz), (-48 + 90, 0, 0))
        box('black', (0.10, 0.20, 0.035), (0, 0, 0), mtx=mt, bev=(0.012,))
        box('tail', (0.085, 0.11, 0.012), (0, 0.04, 0.02), mtx=mt, bev=(0.004,))
        box(wk, (0.085, 0.06, 0.012), (0, -0.065, 0.02), mtx=mt, bev=(0.004,))
        box('reflector', (0.04, 0.03, 0.01), (0, 0, 0.04), (90, 0, 0), mtx=T((s * 0.86, 0.79, RZ + 0.08)))
    # 低速車マーク（後ろの窓の下）
    m = T((0, GLASS_R + 0.045, FLOOR + 0.15), (90, 0, 180))
    tri = lambda a: [(0, a * 0.866 * 2 / 3), (-a / 2, -a * 0.866 / 3), (a / 2, -a * 0.866 / 3)]
    prism('smv_red', tri(0.30), 0.008, m)
    prism('reflector', tri(0.20), 0.012, m)
    # 後ろ：ミッションと車軸、リフトアーム、PTO、けん引の板
    box('darkgray', (0.60, 1.0, 0.55), (0, 0.05, 0.66), bev=(0.04,))
    for s in (1, -1):
        cyl_x('darkgray', 0.13, s * 0.28, s * 0.42, 0, RZ, 24)
        cyl_x('darkgray', 0.19, s * 0.40, s * 0.47, 0, RZ, 28)
        pipe('paint_red', [(s * 0.20, 0.35, 0.98), (s * 0.24, 0.62, 0.92)], 0.03, 8)
        pipe('darkgray', [(s * 0.24, 0.62, 0.90), (s * 0.27, 0.66, 0.62)], 0.018, 8)
    box('darkgray', (0.30, 0.20, 0.22), (0, 0.50, 0.95), bev=(0.02,))
    cyl('silver', 0.018, 0.12, (0, 0.62, 0.62), (90, 0, 0), 10)
    box('darkgray', (0.12, 0.30, 0.04), (0, 0.72, 0.40))
    box('black', (0.30, 0.05, 0.20), (0, 0.64, 0.70), (20, 0, 0))                 # PTO カバー


# ================================================================
#  運転席（いちばん大事）
# ================================================================
COL_TILT = 35.0
WHEEL_C = Vector((0.0, 0.0, 1.89))
WN = Vector((0, math.sin(math.radians(COL_TILT)), math.cos(math.radians(COL_TILT))))   # ハンドル面の法線（運転者のほう）
W_UP = Vector((0, -math.cos(math.radians(COL_TILT)), math.sin(math.radians(COL_TILT))))  # ハンドルの 12 時の向き
WHEEL_R = 0.165                   # リムの中心までの半径（外径 約 0.37）
W_MTX = Matrix.Translation(WHEEL_C) @ Euler((math.radians(-COL_TILT), 0, 0)).to_matrix().to_4x4() @ Matrix.Rotation(math.pi, 4, 'Z')


def interior():
    # 床とゴムマット（溝）
    box('trim', (1.24, 1.30, 0.02), (0, 0.13, FLOOR - 0.01))
    box('rubber_mat', (0.84, 0.72, 0.008), (0, -0.16, FLOOR + 0.004))
    for k in range(18):
        box('rubber_mat', (0.80, 0.012, 0.007), (0, -0.50 + k * 0.038, FLOOR + 0.011))
    # 座席横のタイヤハウス内張り
    for s in (1, -1):
        ph = math.degrees(math.acos((FLOOR - RZ) / 0.80))
        lathe('trim', [(s * 0.43, 0.80), (s * 0.62, 0.80)], 0.0, RZ, n=20, a0=-ph, a1=ph, smooth=50)
        arc = [(0.80 * math.sin(math.radians(-ph + 2 * ph * i / 20)), RZ + 0.80 * math.cos(math.radians(-ph + 2 * ph * i / 20))) for i in range(21)]
        prism('trim', arc, 0.01, T((s * 0.43, 0, 0), (90, 0, 90)))
        box('trim_light', (0.20, 0.80, 0.01), (s * 0.53, 0.42, 1.48), (0, 0, 0))   # 後ろのほうの棚
    # 内側の壁・天井
    box('headliner', (2 * CAB_X - 0.04, 1.32, 0.02), (0, 0.14, ROOF_IN - 0.01))
    box('trim', (2 * CAB_X - 0.06, 0.02, 0.26), (0, GLASS_R - 0.03, FLOOR + 0.14))
    # 前のコンソール（ハンドル柱の根元）
    box('trim', (0.30, 0.24, 0.24), (0, -0.48, FLOOR + 0.12), bev=(0.02,))
    box('black', (0.26, 0.20, 0.06), (0, -0.46, FLOOR + 0.27), (-20, 0, 0), bev=(0.015,))
    # チルトハンドル柱（赤い側面カバー）
    col_m = Matrix.Translation(WHEEL_C) @ Euler((math.radians(-COL_TILT), 0, 0)).to_matrix().to_4x4()
    box('black', (0.17, 0.13, 0.42), (0, 0, -0.30), mtx=col_m, bev=(0.025, 3))
    for s in (1, -1):
        box('paint_red', (0.012, 0.12, 0.34), (s * 0.088, -0.005, -0.30), mtx=col_m, bev=(0.004,))
    box('black', (0.26, 0.17, 0.10), (0, -0.04, -0.10), mtx=col_m, bev=(0.03, 3))       # 上のふくらみ（メーターの台）
    cyl('black', 0.03, 0.10, (0, 0, -0.06), mtx=col_m, n=12)
    # スイッチ列（柱の左右の肩）
    for s in (1, -1):
        for k in range(3):
            box('gray', (0.022, 0.016, 0.03), (s * (0.07 + k * 0.027), 0.035, -0.07), mtx=col_m, bev=(0.004,))
        box('black', (0.10, 0.012, 0.04), (s * 0.095, 0.03, -0.07), mtx=col_m)
    # 丸型メーター：目からハンドルの上の窓を通して見える所に置く
    P = WHEEL_C + W_UP * (WHEEL_R * 0.56)
    d = (P - EYE).normalized()
    MC = P + d * 0.17
    up = Vector((0, 0, 1)) - d * d.z
    mm = face_mtx(MC, -d, up)
    cyl('black', 0.098, 0.06, (0, 0, -0.03), mtx=mm, n=32)
    tor('silver', 0.096, 0.006, mm @ Matrix.Translation((0, 0, 0.002)), 40, 6)
    tor('black_gloss', 0.105, 0.012, mm @ Matrix.Translation((0, 0, -0.004)), 40, 6, 200, 340)
    # メーターフード（黒い庇）
    bm = bmesh.new()
    rows = []
    for i in range(17):
        a = math.radians(-20 + 220 * i / 16)
        rows.append([bm.verts.new(mm @ Vector((0.115 * math.cos(a), 0.115 * math.sin(a), z))) for z in (-0.05, 0.035 + 0.035 * math.sin(a))])
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], b[0], b[1], a[1]))
    _obj(bm, 'black', smooth=60)
    screen('MeterScreen', 0.18, 0.18, mm @ Vector((0, 0, 0.004)), -d, up, 'meter_screen')
    # ペダル軸・アクセル（床から生える）
    cyl_x('darkgray', 0.012, -0.36, 0.30, -0.52, FLOOR + 0.27, 10)
    mt = T((-0.40, -0.40, FLOOR + 0.07), (-55, 0, 0))
    box('black', (0.07, 0.20, 0.015), (0, 0, 0), mtx=mt, bev=(0.005,))
    for k in range(6):
        box('rubber_mat', (0.06, 0.008, 0.006), (0, -0.08 + k * 0.032, 0.009), mtx=mt)
    # シート（サスペンション付き）
    box('darkgray', (0.40, 0.46, 0.04), (0, 0.42, FLOOR + 0.03), bev=(0.01,))
    for k in range(5):
        cyl('black', 0.13 - 0.008 * (k % 2), 0.028, (0, 0.42, FLOOR + 0.065 + k * 0.026), n=24)
    box('darkgray', (0.42, 0.40, 0.03), (0, 0.42, FLOOR + 0.21), bev=(0.01,))
    box('seat', (0.50, 0.46, 0.10), (0, 0.42, FLOOR + 0.275), bev=(0.04, 3))
    box('seat', (0.40, 0.36, 0.02), (0, 0.40, FLOOR + 0.33), bev=(0.009, 2))
    box('seat', (0.48, 0.11, 0.56), (0, 0.69, FLOOR + 0.58), (-12, 0, 0), bev=(0.04, 3))
    box('seat', (0.28, 0.08, 0.13), (0, 0.765, FLOOR + 0.94), (-12, 0, 0), bev=(0.03, 3))
    box('trim', (0.08, 0.06, 0.30), (0, 0.66, FLOOR + 0.16))
    # 左のひじかけ（はね上げ式）
    box('seat', (0.07, 0.30, 0.05), (0.28, 0.53, FLOOR + 0.48), bev=(0.02, 2))
    box('darkgray', (0.03, 0.04, 0.18), (0.28, 0.66, FLOOR + 0.40))
    # 右のアームレスト型操作盤
    box('black', (0.17, 0.66, 0.15), (-0.365, 0.36, FLOOR + 0.39), bev=(0.03, 3))
    box('trim', (0.15, 0.32, 0.012), (-0.365, 0.21, FLOOR + 0.467), bev=(0.004,))
    box('seat', (0.13, 0.27, 0.05), (-0.365, 0.55, FLOOR + 0.49), bev=(0.02, 3))
    box('darkgray', (0.06, 0.08, 0.30), (-0.33, 0.50, FLOOR + 0.20))
    top = FLOOR + 0.474
    cyl('silver', 0.022, 0.025, (-0.41, 0.22, top + 0.012), n=24)              # 銀ダイヤル＋オレンジのリング
    tor('orange', 0.027, 0.005, T((-0.41, 0.22, top + 0.004)), 28, 6)
    for k in range(10):
        a = 2 * math.pi * k / 10
        box('silver', (0.004, 0.006, 0.02), (-0.41 + 0.022 * math.cos(a), 0.22 + 0.022 * math.sin(a), top + 0.012), (0, 0, math.degrees(a)))
    for k, (x, y, c) in enumerate(((-0.42, 0.29, 'beige'), (-0.42, 0.335, 'blue'))):   # サブコンレバー
        box('black', (0.03, 0.06, 0.006), (x, y, top + 0.003))
        pipe('silver', [(x, y, top), (x, y - 0.012, top + 0.05)], 0.004, 6)
        box(c, (0.03, 0.022, 0.018), (x, y - 0.014, top + 0.058), bev=(0.007, 2))
    cyl('yellow', 0.016, 0.02, (-0.325, 0.31, top + 0.01), n=20)               # 黄色い PTO つまみ
    cyl('black', 0.02, 0.004, (-0.325, 0.31, top + 0.001), n=20)
    for k in range(3):                                                         # 緑の LED
        box('led_green', (0.008, 0.006, 0.004), (-0.33 + k * 0.0 - 0.02 * k, 0.255, top + 0.002))
    for k in range(4):                                                         # 小さいスイッチ
        box('gray', (0.022, 0.016, 0.008), (-0.395 + (k % 2) * 0.04, 0.10 + (k // 2) * 0.03 + 0.24, top + 0.004))
    # 右前のタッチモニター（支柱付き）
    MON = Vector((-0.43, -0.20, 1.97))
    nrm = (EYE - MON).normalized()
    mon = face_mtx(MON, nrm)
    pipe('black', [(-0.47, -0.30, FLOOR + 0.02), (-0.47, -0.30, 1.80), (-0.45, -0.24, 1.90), MON - nrm * 0.03], 0.016, 8)
    box('black', (0.25, 0.165, 0.03), (0, 0, -0.012), mtx=mon, bev=(0.01, 2))
    screen('MonitorScreen', 0.22, 0.135, mon @ Vector((0, 0, 0.0045)), nrm, (0, 0, 1), 'monitor_screen')
    # 左の副変速まわり：台とカップホルダー
    box('trim', (0.14, 0.46, 0.22), (0.35, 0.24, FLOOR + 0.11), bev=(0.02,))
    box('black', (0.04, 0.16, 0.006), (0.35, 0.24, FLOOR + 0.222))
    cyl('black', 0.042, 0.09, (0.35, 0.42, FLOOR + 0.20), n=24, caps=False)
    cyl('black', 0.036, 0.004, (0.35, 0.42, FLOOR + 0.17), n=24)
    # 乗降グリップ（左 A ピラー）・サンバイザ・ルームミラー・天井のエアコン・室内灯
    pipe('black', [(0.60, -0.50, 1.70), (0.585, -0.48, 1.75), (0.585, -0.48, 2.12), (0.60, -0.50, 2.17)], 0.013, 8)
    box('visor', (0.80, 0.24, 0.006), (0.12, -0.45, ROOF_IN - 0.05), (25, 0, 0))
    pipe('black', [(-0.30, -0.56, ROOF_IN - 0.015), (-0.30, -0.54, ROOF_IN - 0.05)], 0.006, 6)
    pipe('black', [(0, -0.50, ROOF_IN - 0.01), (0, -0.49, ROOF_IN - 0.08)], 0.008, 6)
    RM = Vector((0, -0.48, ROOF_IN - 0.11))
    rn = (EYE - RM).normalized()
    rmm = face_mtx(RM, rn)
    box('black', (0.23, 0.075, 0.025), (0, 0, -0.012), mtx=rmm, bev=(0.01, 2))
    screen('RoomMirror', 0.21, 0.058, rmm @ Vector((0, 0, 0.002)), rn, (0, 0, 1), 'mirror')
    box('black', (0.46, 0.18, 0.04), (-0.05, -0.30, ROOF_IN - 0.03), bev=(0.012, 2))   # エアコン操作部
    for k in range(3):
        cyl('silver', 0.016, 0.014, (-0.20 + k * 0.08, -0.30, ROOF_IN - 0.055), n=16)
    for k in range(2):
        box('darkgray', (0.12, 0.04, 0.01), (0.10 + k * 0.0, -0.33 + k * 0.06, ROOF_IN - 0.051))
    for s in (1, -1):
        box('darkgray', (0.14, 0.05, 0.02), (s * 0.40, -0.40, ROOF_IN - 0.02))       # 吹き出し口
    box('room_lamp', (0.14, 0.07, 0.012), (0, 0.32, ROOF_IN - 0.022), bev=(0.004,))
    box('black', (0.16, 0.09, 0.012), (0, 0.32, ROOF_IN - 0.016))


def steering_wheel():
    with part('SteeringWheel'):
        L = W_MTX
        tor('black', WHEEL_R, 0.019, L, 56, 12)                                   # 黒い太いリム
        for a in (35, 145, 270):                                                   # Y 字の 3 本スポーク（赤）
            r = math.radians(a)
            p1 = L @ Vector((math.cos(r) * (WHEEL_R - 0.01), math.sin(r) * (WHEEL_R - 0.01), 0))
            p0 = L @ Vector((math.cos(r) * 0.04, math.sin(r) * 0.04, -0.03))
            m = along(p0, p1, WN)
            box('paint_red', (0.036, 0.011, (p1 - p0).length), (0, 0, (p1 - p0).length / 2), mtx=m, bev=(0.005,))
        cyl('paint_red', 0.048, 0.04, (0, 0, -0.026), mtx=L, n=28)
        cyl('black', 0.034, 0.012, (0, 0, -0.004), mtx=L, n=24)


def levers_pedals():
    # 左手のオレンジのリバーサレバー（ハンドル柱の左から）
    col_m = Matrix.Translation(WHEEL_C) @ Euler((math.radians(-COL_TILT), 0, 0)).to_matrix().to_4x4()
    root = col_m @ Vector((0.12, -0.02, -0.11))
    with part('LeverShuttle'):
        tip = root + Vector((0.13, -0.02, 0.03))
        pipe('black', [root, root + Vector((0.05, 0, 0.005)), tip], 0.007, 8)
        sph('orange', 0.026, tip + Vector((0.015, 0, 0.004)), (1.5, 0.75, 0.75), n=16)
    LEVERS['LeverShuttle'] = root
    # 右操作盤の主変速ジョイスティック（灰色＋オレンジのリング）
    top = FLOOR + 0.474
    root = Vector((-0.345, 0.14, top))
    with part('LeverJoy'):
        box('black', (0.06, 0.06, 0.006), root + Vector((0, 0, 0.003)), bev=(0.01,))
        cyl('black', 0.022, 0.02, root + Vector((0, 0, 0.01)), n=16, r2=0.014)
        tor('orange', 0.019, 0.006, Matrix.Translation(root + Vector((0, 0, 0.03))), 24, 8)
        sph('gray', 0.033, root + Vector((0, -0.006, 0.075)), (0.85, 1.15, 1.45), (-10, 0, 0), n=20)
        sph('gray', 0.022, root + Vector((0, 0.022, 0.06)), (1.0, 1.0, 1.0), n=12)   # 手のひら側
        cyl('orange', 0.008, 0.008, root + Vector((0.012, -0.03, 0.113)), (-35, 0, 0), n=10)
        cyl('black', 0.007, 0.008, root + Vector((-0.012, -0.03, 0.113)), (-35, 0, 0), n=10)
    LEVERS['LeverJoy'] = root
    # 右操作盤の外のオレンジの PTO 変速レバー
    root = Vector((-0.465, 0.37, FLOOR + 0.42))
    with part('LeverPtoSel'):
        box('black', (0.02, 0.10, 0.03), root, bev=(0.006,))
        pipe('silver', [root, root + Vector((-0.012, -0.005, 0.10))], 0.006, 8)
        cyl('orange', 0.014, 0.06, root + Vector((-0.014, -0.006, 0.13)), (-3, -7, 0), n=14)
        sph('orange', 0.014, root + Vector((-0.017, -0.007, 0.16)), n=12)
    LEVERS['LeverPtoSel'] = root
    # 左の黄色い副変速レバー
    root = Vector((0.35, 0.22, FLOOR + 0.225))
    with part('LeverRange'):
        pipe('silver', [root, root + Vector((0.01, 0.03, 0.18)), root + Vector((0.0, 0.05, 0.25))], 0.008, 8)
        cyl('yellow', 0.017, 0.075, root + Vector((0.0, 0.055, 0.29)), (-12, 0, 0), n=16)
        sph('yellow', 0.017, root + Vector((0.0, 0.063, 0.33)), n=12)
        box('black', (0.03, 0.03, 0.02), root + Vector((0, 0, 0.01)), bev=(0.006,))
    LEVERS['LeverRange'] = root
    # ペダル（クラッチ 1 ＋ ブレーキ 2）。原点は支点（X まわりに回る）
    for nm, x in (('PedalClutch', 0.24), ('PedalBrakeL', -0.20), ('PedalBrakeR', -0.29)):
        piv = Vector((x, -0.52, FLOOR + 0.27))
        with part(nm):
            pad = piv + Vector((0, 0.13, -0.19))
            cyl_x('darkgray', 0.02, x - 0.025, x + 0.025, piv.y, piv.z, 12)
            pipe('darkgray', [piv, piv + Vector((0, 0.03, -0.10)), pad], 0.011, 8)
            mt = Matrix.Translation(pad) @ Euler((math.radians(-40), 0, 0)).to_matrix().to_4x4()
            box('black', (0.075, 0.10, 0.018), (0, 0, 0), mtx=mt, bev=(0.006,))
            for k in range(5):
                box('rubber_mat', (0.065, 0.007, 0.006), (0, -0.04 + k * 0.02, 0.011), mtx=mt)
            if nm == 'PedalBrakeL':
                box('silver', (0.06, 0.012, 0.012), pad + Vector((-0.045, 0.02, 0.03)))   # 左右ブレーキの連結
        LEVERS[nm] = piv


LEVERS = {}


def wiper():
    W0 = Vector((0.0, GLASS_F - 0.035, ROOF_IN - 0.06))
    with part('Wiper'):
        cyl('black', 0.022, 0.03, W0, (90, 0, 0), n=14)
        pipe('black', [W0 + Vector((0, -0.02, 0)), W0 + Vector((0, -0.03, -0.60))], 0.006, 6)
        box('black', (0.02, 0.012, 0.52), W0 + Vector((0, -0.024, -0.36)))
        box('rubber_mat', (0.008, 0.008, 0.50), W0 + Vector((0, -0.014, -0.36)))
    return W0


# ================================================================
#  ロータリー（別オブジェクト）
# ================================================================
def rotary():
    oy = ROTARY_Y
    ay, az = oy, 0.25                    # 爪軸
    with part('Rotary'):
        # 赤いカバー（爪のまわりの半円筒）・両側の板
        lathe('paint_red', [(-TILL_W / 2 - 0.02, 0.31), (TILL_W / 2 + 0.02, 0.31)], ay, az, n=24, a0=-75, a1=60, smooth=50)
        for s in (1, -1):
            arc = [(0.33 * math.sin(math.radians(a)), az + 0.33 * math.cos(math.radians(a))) for a in range(-80, 66, 10)]
            prism('paint_red', [(0.0 + p[0], p[1]) for p in arc] + [(0.25, 0.02), (-0.25, 0.02)], 0.012,
                  T((s * (TILL_W / 2 + 0.03), ay, 0), (90, 0, 90)))
            box('darkgray', (0.03, 0.55, 0.04), (s * (TILL_W / 2 + 0.03), ay + 0.02, 0.03), bev=(0.01,))   # そり
        box('paint_red', (TILL_W + 0.04, 0.10, 0.03), (0, ay - 0.22, az + 0.25), (-35, 0, 0))
        # まん中のギヤボックス・横のチェーンケース・マスト
        box('paint_red', (0.26, 0.30, 0.24), (0, ay - 0.06, 0.70), bev=(0.03,))
        box('paint_red', (0.12, 0.30, 0.10), (0, ay - 0.06, 0.57), bev=(0.02,))
        box('paint_red', (0.08, 0.26, 0.60), (TILL_W / 2 + 0.07, ay - 0.02, 0.45), bev=(0.03,))
        cyl_x('darkgray', 0.05, 0.10, TILL_W / 2 + 0.05, ay - 0.08, 0.72, 14)
        cyl('darkgray', 0.045, 0.08, (0, ay - 0.24, 0.70), (90, 0, 0), 14)
        for s in (1, -1):
            pipe('paint_red', [(s * 0.42, oy - 0.26, 0.42), (s * 0.20, oy - 0.20, 0.82), (0, oy - 0.26, 0.96)], 0.025, 8)
            pipe('paint_red', [(s * 0.42, oy - 0.26, 0.42), (s * 0.45, oy - 0.10, 0.50)], 0.025, 8)
            cyl_x('silver', 0.016, s * 0.39, s * 0.47, oy - 0.26, 0.42, 8)
        # 三点リンク（トラクターの後ろへ）と PTO の軸
        for s in (1, -1):
            pipe('darkgray', [(s * 0.30, 0.48, 0.45), (s * 0.43, oy - 0.26, 0.42)], 0.022, 8)
        pipe('darkgray', [(0, 0.56, 1.00), (0, oy - 0.26, 0.96)], 0.022, 8)
        cyl('silver', 0.03, 0.10, (0, 0.92, 0.66), (90, 0, 0), 12)
        cyl('darkgray', 0.022, 0.40, (0, 0.88, 0.65), (93, 0, 0), 12)
        cyl('black', 0.045, 0.30, (0, 0.86, 0.65), (93, 0, 0), 14)               # 軸の覆い
    with part('Rotor'):
        cyl_x('darkgray', 0.032, -TILL_W / 2, TILL_W / 2, ay, az, 16)
        nf = 17
        for i in range(nf):
            x = -TILL_W / 2 + 0.06 + i * (TILL_W - 0.12) / (nf - 1)
            cyl_x('darkgray', 0.07, x - 0.006, x + 0.006, ay, az, 12)
            for j in range(4):
                a = 2 * math.pi * (j / 4 + i * 0.137)
                side = 1 if (i + j) % 2 else -1
                ca, sa = math.cos(a), math.sin(a)
                rad = lambda r: Vector((x, ay + r * sa, az + r * ca))
                tng = Vector((0, ca, -sa))
                p0, p1 = rad(0.055), rad(0.19)
                box('silver', (0.008, 0.045, (p1 - p0).length), (0, 0, (p1 - p0).length / 2), mtx=along(p0, p1, tng))
                q0 = p1
                q1 = rad(0.245) + Vector((side * 0.05, 0, 0)) - tng * 0.03
                box('silver', (0.008, 0.045, (q1 - q0).length), (0, 0, (q1 - q0).length / 2), mtx=along(q0, q1, tng))
    flap_h = Vector((0, ay + 0.31 * math.sin(math.radians(60)), az + 0.31 * math.cos(math.radians(60))))
    with part('Flap'):
        end = Vector((0, flap_h.y + 0.23, 0.05))
        m = along(flap_h, end, (0, 1, 0))
        L = (end - flap_h).length
        box('paint_red', (TILL_W, 0.012, L), (0, 0, L / 2), mtx=m)
        for x in (-0.8, -0.3, 0.3, 0.8):
            box('paint_red', (0.03, 0.04, L * 0.9), (x, -0.02, L / 2), mtx=m)
        cyl_x('darkgray', 0.018, -TILL_W / 2, TILL_W / 2, flap_h.y, flap_h.z, 10)
    return Vector((0, oy, 0)), Vector((0, ay, az)), flap_h


# ================================================================
#  まとめ・確認の絵・書き出し
# ================================================================
def finalize(name, mw, parent=None):
    objs = GROUPS.pop(name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    ob.data.transform(mw.inverted())
    if parent is not None:
        ob.parent = parent
        ob.matrix_parent_inverse = Matrix()
    ob.matrix_world = mw
    return ob


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    with part('Body'):
        hood()
        cab()
        fenders_lamps()
        # 前輪のかじ取り部（キングピン）は SteerFL・SteerFR
    glass()
    with part('Interior'):
        interior()
    steering_wheel()
    levers_pedals()
    w0 = wiper()
    for nm, cx, cy, cz, od, w, rim, rear in (('WheelRL', TR, 0, RZ, R_OD, R_W, R_RIM, True), ('WheelRR', -TR, 0, RZ, R_OD, R_W, R_RIM, True),
                                             ('WheelFL', TR, FY, FZ, F_OD, F_W, F_RIM, False), ('WheelFR', -TR, FY, FZ, F_OD, F_W, F_RIM, False)):
        with part(nm):
            wheel(cx, cy, cz, od, w, rim, rear)
    for nm, s in (('SteerFL', 1), ('SteerFR', -1)):
        with part(nm):
            cyl('darkgray', 0.06, 0.26, (s * KP, FY, FZ), n=16)
            cyl_x('darkgray', 0.075, s * (KP - 0.05), s * (TR - F_W * 0.1), FY, FZ, 18)
            box('darkgray', (0.06, 0.12, 0.05), (s * KP, FY + 0.10, FZ + 0.05))
    # 外のミラーの面
    for nm, s in (('MirrorL', 1), ('MirrorR', -1)):
        mp = Vector((s * 0.861, GLASS_F_SIDE + 0.05, 2.06))
        n = Vector((-s * math.sin(math.radians(12)), math.cos(math.radians(12)), 0))   # 枠の後ろの面（少し内へ向く）
        screen(nm, 0.105, 0.18, mp + n * 0.019, n, (0, 0, 1), 'mirror')
    rot_o, rotor_o, flap_o = rotary()

    root = bpy.data.objects.new('Tractor', None)
    sc.collection.objects.link(root)
    I = Matrix()
    for nm in ('Body', 'Interior', 'Glass'):
        finalize(nm, I, root)
    for nm, mw in SCREENS.items():
        finalize(nm, mw, root)
    finalize('WheelRL', Matrix.Translation((TR, 0, RZ)), root)
    finalize('WheelRR', Matrix.Translation((-TR, 0, RZ)), root)
    for nm, s in (('FL', 1), ('FR', -1)):
        st = finalize('Steer' + nm, Matrix.Translation((s * KP, FY, FZ)), root)
        finalize('Wheel' + nm, Matrix.Translation((s * TR, FY, FZ)), st)
    finalize('SteeringWheel', W_MTX, root)
    for nm, p in LEVERS.items():
        finalize(nm, Matrix.Translation(p), root)
    wp = finalize('Wiper', Matrix.Translation(w0), root)
    wp.matrix_world = Matrix.Translation(w0) @ Matrix.Rotation(math.radians(85), 4, 'Y')   # ふだんは右へ寝かせておく
    rot = finalize('Rotary', Matrix.Translation(rot_o))
    finalize('Rotor', Matrix.Translation(rotor_o), rot)
    finalize('Flap', Matrix.Translation(flap_o), rot)
    assert not GROUPS, GROUPS.keys()
    return root, rot


def preview():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 12 if FAST else 64
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.transparent_max_bounces = 16
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.resolution_percentage = 50 if FAST else 100
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('sky')
    sc.world = w
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.55, 0.70, 0.95, 1)
    bg.inputs['Strength'].default_value = 0.9
    tmp = []
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.0
    sun.data.angle = math.radians(3)
    sun.rotation_euler = Euler((math.radians(42), math.radians(-18), math.radians(-35)))
    sc.collection.objects.link(sun)
    tmp.append(sun)
    gm = bpy.data.materials.new('ground')
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin('#6b5a3e'), 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    bpy.ops.mesh.primitive_plane_add(size=60)
    g = bpy.context.active_object
    g.data.materials.append(gm)
    tmp.append(g)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    tmp.append(cam)

    def shot(fn, loc, target=None, rot=None, lens=None, fov_v=None):
        cam.location = loc
        if target is not None:
            cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        else:
            cam.rotation_euler = rot
        cd = cam.data
        cd.clip_start = 0.02
        if fov_v:
            cd.sensor_fit = 'VERTICAL'
            cd.angle_y = math.radians(fov_v)
        else:
            cd.sensor_fit = 'AUTO'
            cd.lens = lens
        sc.render.filepath = os.path.join(HERE, fn)
        bpy.ops.render.render(write_still=True)
        print('wrote', fn)

    shots = {
        'exterior': dict(loc=(3.7, -5.9, 2.35), target=(0.0, -1.0, 1.05), lens=40),
        # 運転者の目から：前（-Y）を向いて 12°下・縦の画角 60°
        'driver': dict(loc=EYE, rot=Euler((math.radians(90 - 12), 0, math.pi)), fov_v=60),
        'console': dict(loc=(-0.12, 0.60, 2.08), target=(-0.37, 0.24, 1.80), lens=28),
    }
    extra = {   # 直すとき用（--shot=名前 で出す。preview_ には残さない）
        'front': dict(loc=(0.9, -4.6, 1.5), target=(0, -2.8, 1.0), lens=50),
        'rear': dict(loc=(-3.2, 4.6, 2.2), target=(0, 0.6, 1.0), lens=35),
        'side': dict(loc=(7.0, -0.8, 1.3), target=(0, -0.8, 1.1), lens=35),
        'top': dict(loc=(0.0, -0.3, 9.0), target=(0, -0.3, 0), lens=35),
        'left': dict(loc=(0.15, 0.40, 2.2), target=(0.4, 0.1, 1.6), lens=24),
    }
    only = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--shot=')]
    for k, v in ({k: v for k, v in {**shots, **extra}.items() if k in only} if only else shots).items():
        shot(f'preview_{k}.png' if k in shots else f'_debug_{k}.png', v['loc'], v.get('target'), v.get('rot'), v.get('lens'), v.get('fov_v'))
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)


def export():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_draco_mesh_compression_enable=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_image_format='AUTO')
    print('glb', os.path.getsize(OUT_GLB), 'bytes')


if __name__ == '__main__':
    build()
    print('triangles', tri_count())
    if RENDER:
        preview()
    export()

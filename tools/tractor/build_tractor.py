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

DOOR_BULGE = 0.05                 # ドアの曲面一枚ガラスの外へのふくらみ


def front_y(x):
    """前ガラスの Y（まん中が前へ出て、両はしの A ピラーへ回りこむ）"""
    return GLASS_F_SIDE + (GLASS_F - GLASS_F_SIDE) * (1 - (abs(x) / CAB_X) ** 2.4)


DOOR_Y0, DOOR_Y1 = front_y(CAB_X) + 0.03, GLASS_R - 0.03


def door_x(y):
    """ドアのガラスの X の大きさ（前後のはしは柱の所、まん中ほど外へふくらむ）"""
    t = min(1.0, max(0.0, (y - DOOR_Y0) / (DOOR_Y1 - DOOR_Y0)))
    return CAB_X + DOOR_BULGE * math.sin(math.pi * t)


def door_bottom(y):
    """ドアのガラスの下の線（前は低く、後輪の上は高い）"""
    return 1.37 + (1.625 - 1.37) * min(1.0, max(0.0, (y + 0.28) / 0.06))


# ---- 色と材質（名前はそのまま glTF の材質名になる） ----
PAL = {
    'paint_red': dict(c='#a3122a', r=0.26, coat=0.6),   # 実車の写真のような、深いワインがかった赤（つやのあるメタリック）
    'black': dict(c='#161616', r=0.55),
    'black_gloss': dict(c='#0c0c0c', r=0.22),
    'darkgray': dict(c='#35383b', r=0.5, m=0.3),
    'chrome': dict(c='#e8e8e8', r=0.08, m=1.0),
    'silver': dict(c='#b9bdc1', r=0.28, m=0.85),
    'wheel_cream': dict(c='#ebe6d2', r=0.35),           # 白っぽいアイボリー（X の農家さんの写真 3 人が「白い・白っぽいホイール」）
    'tire': dict(c='#1b1b1b', r=0.85),
    'white': dict(c='#f2f2ef', r=0.3),
    'glass': dict(c='#6f9f93', r=0.03, a=0.26, m=0.2),    # 青みがかった緑の色ガラス（環境マップがあれば空が映る）
    'glass_glint': dict(c='#ffffff', r=0.1, a=0.09, e=0.6),   # 前ガラスの うすい映りこみの すじ
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
    'rust': dict(c='#6e3b22', r=0.85, m=0.15),        # さびた鉄（下リンク・そり。X の写真では連結まわりがさびている）
    'tine_steel': dict(c='#3d3d3c', r=0.6, m=0.6),    # 土で黒ずんだ爪の鋼（光るのは刃先だけ）
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
    'pet': dict(c='#e4eef2', r=0.05, a=0.35),          # ペットボトル（すきとおったプラスチック）
    'tea': dict(c='#b8a24a', r=0.1, a=0.75),           # 中のお茶
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
    if kind == 'meter':                                                 # 黒い縁、白い輪に黒い目盛り、まん中に黒い液晶（公式写真の形）
        u, v = (xx + 0.5) / S * 2 - 1, (yy + 0.5) / S * 2 - 1
        rr, ang = np.hypot(u, v), np.degrees(np.arctan2(v, u))
        a2 = np.where(ang < -45, ang + 360, ang)                       # 225°（左下）から -45°（右下）へ 270° の目盛り
        img[..., :3] = 0.0
        img[rr < 0.98, :3] = (0.02, 0.02, 0.025)
        img[(rr > 0.93) & (rr < 0.98), :3] = (0.55, 0.57, 0.6)         # 銀の縁
        ring = (rr > 0.52) & (rr < 0.88)
        img[ring, :3] = (0.86, 0.87, 0.88)                              # 白い目盛りの輪
        for k in range(55):                                             # 黒い目盛り（5 本ごとに長い）
            a = math.radians(225 - k * 5)
            L0 = 0.70 if k % 5 == 0 else 0.78
            for t in np.linspace(L0, 0.87, 24):
                px, py = int((math.cos(a) * t + 1) / 2 * S), int((math.sin(a) * t + 1) / 2 * S)
                w = 3 if k % 5 == 0 else 2
                img[max(py - w, 0):py + w, max(px - w, 0):px + w, :3] = (0.05, 0.05, 0.06)
        red = ring & (rr > 0.80) & (a2 >= -45) & (a2 < -5)
        img[red, :3] = (0.85, 0.08, 0.05)
        img[ring & ((a2 < -45) | (a2 > 225)) & (v < 0), :3] = (0.02, 0.02, 0.025)   # 下のすきま
        lcd = rr < 0.50                                                 # まん中の黒い液晶
        img[lcd, :3] = (0.03, 0.04, 0.045)
        for (cx, cy, w, h) in ((0.0, 0.18, 0.26, 0.10), (-0.12, -0.05, 0.08, 0.05), (0.12, -0.05, 0.08, 0.05), (0.0, -0.25, 0.30, 0.04)):
            seg = (np.abs(u - cx) < w / 2) & (np.abs(v - cy) < h / 2)
            img[seg & lcd, :3] = (0.7, 0.74, 0.76)                     # 数字の板
        a = math.radians(170)                                           # 赤い針
        for t in np.linspace(0.50, 0.86, 80):
            px, py = int((math.cos(a) * t + 1) / 2 * S), int((math.sin(a) * t + 1) / 2 * S)
            img[py - 3:py + 3, px - 3:px + 3, :3] = (0.95, 0.2, 0.05)
        for cx, cy, col in ((-0.62, -0.62, (0.1, 0.8, 0.2)), (0.62, -0.62, (0.95, 0.6, 0.05))):
            img[np.hypot(u - cx, v - cy) < 0.06, :3] = col              # 表示灯
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
    if not ({'a', 'e', 'tex'} & p.keys()) and name != 'mirror':
        va = nt.nodes.new('ShaderNodeVertexColor')
        va.layer_name = 'ao'
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = (*lin(p['c']), 1)
        nt.links.new(va.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bs.inputs['Base Color'])
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


GRID = 0.12                       # 大きい面はこの間隔で割る（頂点に焼く AO が面の中でも変わるように）


def box(mat, size, loc, rot=(0, 0, 0), bev=None, mtx=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for a in range(3):
        cuts = math.ceil(size[a] / GRID) - 1
        if cuts > 0:
            es = [e for e in bm.edges if abs(e.verts[0].co[a] - e.verts[1].co[a]) > 1e-6]
            bmesh.ops.subdivide_edges(bm, edges=es, cuts=min(cuts, 14), use_grid_fill=True)
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


def side_panel_mtx():
    """右の横のパネルの面（局所 +Z が面の外向き。運転者のほう＝+X へ 38° 傾く。局所 +Y がうしろ）"""
    return T((-0.545, 0.45, FLOOR + 0.43), (-5, 38, 0))


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
    for f in (0.30, 0.78):                          # サイドウォール（外側）の筋
        xf = 0.5 if f < 0.5 else 0.47
        tor('tire', rim + f * (ro - rim), 0.0045, T((cx + s * xf * W, cy, cz), (0, 90, 0)), 72, 5)
    nb = 12 if rear else 8                          # 皿とリムをとめるボルト
    for k in range(nb):
        a = 2 * math.pi * (k + 0.25) / nb
        rr = rim - 0.065
        cyl_x('silver', 0.011, cx + off + 0.0 * s, cx + off + 0.035 * s, cy + rr * math.sin(a), cz + rr * math.cos(a), 6)
    a = math.radians(200)                           # 空気を入れるバルブ
    pipe('black', [(cx + off, cy + (rim - 0.03) * math.sin(a), cz + (rim - 0.03) * math.cos(a)),
                   (cx + off + 0.05 * s, cy + (rim - 0.035) * math.sin(a), cz + (rim - 0.035) * math.cos(a))], 0.006, 6)
    for k in range(8 if rear else 6):              # ナット
        a = 2 * math.pi * k / (8 if rear else 6)
        rr = 0.085 if rear else 0.058
        cyl_x('silver', 0.012, hub_x + 0.07 * s, hub_x + 0.085 * s, cy + rr * math.sin(a), cz + rr * math.cos(a), 6)


# ================================================================
#  外装
# ================================================================
CROWN = 0.04                      # ボンネット上面のまん中の盛り上がり


def hood_sec(y, w, t, b, rc, n=8):
    pts = [(-w, b + (t - rc - b) * k / 4) for k in range(4)]
    for i in range(n + 1):
        a = math.pi - (math.pi / 2) * i / n
        pts.append((-w + rc + rc * math.cos(a), t - rc + rc * math.sin(a)))
    for k in range(1, 10):                          # 上の面はまん中がゆるやかに盛り上がる（両はしへ丸く落ちる）
        x = -(w - rc) + 2 * (w - rc) * k / 10
        pts.append((x, t + CROWN * (1 - (x / (w - rc)) ** 2)))
    for i in range(n + 1):
        a = math.pi / 2 - (math.pi / 2) * i / n
        pts.append((w - rc + rc * math.cos(a), t - rc + rc * math.sin(a)))
    pts += [(w, b + (t - rc - b) * k / 4) for k in (3, 2, 1, 0)]
    return [(x, y, z) for x, z in pts]


def hood():
    """赤い鋼板のボンネット（前下がり）と黒いグリル・V 字メッキ・吊り目ヘッドライト"""
    secs = []
    N = 13
    y0, y1 = GLASS_F + 0.01, -2.80
    for i in range(N):
        s = i / (N - 1)
        y = y0 + (y1 - y0) * s
        secs.append((y, 0.385 - 0.04 * s, 1.565 - 0.20 * s - 0.06 * s ** 2.5 - CROWN * 0.5 * (1 - s) ** 2, 0.86, 0.17 - 0.05 * s))
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
    # 吊り目ヘッドライト：黒いランプハウスが鼻先から出て、中に銀のリフレクタ、前へふくらむレンズ
    for s in (1, -1):
        rim_ = [(0.050, 1.108), (0.290, 1.160), (0.296, 1.226), (0.046, 1.172)]
        refl = [(0.068, 1.121), (0.274, 1.166), (0.278, 1.212), (0.064, 1.162)]
        prism('black_gloss', [(s * x, z) for x, z in rim_], 0.05, T((0, gy - 0.005, 0), (90, 0, 0)), bev=(0.01, 2))
        prism('silver', [(s * x, z) for x, z in refl], 0.02, T((0, gy - 0.026, 0), (90, 0, 0)))
        sph('lamp_head', 0.5, (s * 0.172, gy - 0.034, 1.1675), (0.206, 0.046, 0.046), (0, -13 * s, 0), n=24)     # レンズ（平たい楕円体）
        sph('chrome', 0.5, (s * 0.115, gy - 0.036, 1.148), (0.05, 0.03, 0.05), n=12)                         # 内側の丸い玉（ロービーム）
    # ボンネットの横の下半分は黒いパネル（実車は赤い上半分と黒い下半分の 2 色。境目は前で低く、運転席のほうへ上がる）
    for sd in (1, -1):
        rows = []
        for i in range(N):
            y, w, t, bb, rc = secs[i]
            ztop = 1.03 + 0.13 * (1 - i / (N - 1)) ** 1.3
            rows.append([(sd * (w + 0.004), y, bb + 0.005), (sd * (w + 0.004), y, ztop)])
        loft('black', rows if sd > 0 else [r[::-1] for r in rows], smooth=50)
        pipe('black_gloss', [(sd * (secs[i][1] + 0.006), secs[i][0], 1.03 + 0.13 * (1 - i / (N - 1)) ** 1.3) for i in range(N)], 0.006, 6)   # 境目の線
    # ボンネット横の通気口
    for s in (1, -1):
        for k in range(5):
            box('black', (0.008, 0.20, 0.016), (s * (0.375), -1.05 - k * 0.0, 1.06 + k * 0.035))
        prism('black', [(-2.30, 0.90), (-2.76, 0.90), (-2.80, 1.02), (-2.40, 1.07)], 0.008, T((s * 0.348, 0, 0), (90, 0, 90)))
        for k in range(4):
            box('darkgray', (0.006, 0.36 - 0.03 * k, 0.012), (s * 0.353, -2.55 - 0.005 * k, 0.925 + k * 0.032))
    # ボンネットの窓寄りのまん中の金具：持ち手のくぼみと丸い金具・小さなボルト（X の運転席からの写真 4 枚に共通。運転席から真正面に見える）
    hy = -0.76
    hs = (hy - y0) / (y1 - y0)
    hz = 1.565 - 0.20 * hs - 0.06 * hs ** 2.5 - CROWN * 0.5 * (1 - hs) ** 2 + CROWN                          # 上の面（まん中の盛り上がりの上）
    tilt = math.degrees(math.atan2(0.20 + 0.15 * hs ** 1.5, y0 - y1))           # 前下がりの傾き
    hm = T((0, hy, hz), (-tilt, 0, 0))
    oval = [(0.055 * math.cos(2 * math.pi * k / 20), 0.028 * math.sin(2 * math.pi * k / 20)) for k in range(20)]
    prism('black', [(x, -y) for x, y in oval], 0.003, hm @ T((0, 0, 0.0005)))                 # 持ち手のくぼみ（黒い影。横長）
    cyl('silver', 0.016, 0.012, (0, 0.035, 0.006), mtx=hm, n=16)                # 丸い金具
    cyl('darkgray', 0.006, 0.008, (0, -0.035, 0.004), mtx=hm, n=8)              # 小さなボルト
    # ボンネットの下：エンジン・前の枠・前車軸
    box('darkgray', (0.56, 2.0, 0.40), (0, -1.70, 0.80), bev=(0.03,))
    box('darkgray', (0.46, 1.4, 0.18), (0, -1.45, 0.52), bev=(0.03,))
    box('darkgray', (0.50, 0.70, 0.36), (0, -2.58, 0.66), bev=(0.02,))           # 前の枠（バンパー台）
    box('black', (0.60, 0.15, 0.30), (0, -2.86, 0.62), bev=(0.015,))             # ウェイトの台
    for k in range(5):                                                           # 積み重ねた鋳鉄のフロントウェイト（板 5 枚。ふちが丸い）
        z = 0.47 + k * 0.077
        box('black_gloss', (0.80 - 0.01 * (k % 2), 0.17, 0.068), (0, -2.995, z), bev=(0.016, 3))
        box('darkgray', (0.20, 0.012, 0.022), (0, -3.085, z), bev=(0.006,))       # 持ち手の穴（くぼみ）
    for x in (-0.15, 0.15):                                                      # 板をつらぬくボルトの頭
        cyl('silver', 0.018, 0.02, (x, -2.995, 0.855), n=6)
    box('black', (0.86, 0.19, 0.03), (0, -2.995, 0.435), bev=(0.01,))             # いちばん下の受け板
    pipe('black', [(-0.30, -3.02, 0.87), (-0.30, -3.055, 0.91), (0.30, -3.055, 0.91), (0.30, -3.02, 0.87)], 0.016, 8)  # 持ち手
    cyl_x('darkgray', 0.075, -KP + 0.06, KP - 0.06, FY, FZ, 20)                     # 前車軸
    sph('darkgray', 0.15, (0, FY, FZ), (1.0, 1.1, 0.95))
    cyl('darkgray', 0.03, 1.2, (0, -1.5, 0.47), (90, 0, 0), 12)                   # 前輪へのシャフト
    box('darkgray', (0.20, 0.30, 0.10), (0, FY, FZ + 0.12))
    cyl_x('darkgray', 0.03, -0.36, 0.36, FY + 0.13, FZ + 0.03, 12)                 # ステアリングシリンダ
    cyl_x('silver', 0.014, -0.50, 0.50, FY + 0.13, FZ + 0.03, 8)
    cyl('silver', 0.06, 0.09, (0.30, -2.30, 0.76), (90, 0, 0), 18)                 # オルタネータ
    cyl('white', 0.045, 0.11, (-0.31, -1.70, 0.68), (0, 90, 0), 16)                # オイルフィルタ
    pipe('black', [(-0.26, -2.55, 1.00), (-0.31, -2.40, 0.98), (-0.31, -1.95, 0.95)], 0.03, 10)   # 吸気のホース
    for k in range(4):                                                            # 燃料噴射の管
        pipe('silver', [(0.25, -1.55 - 0.12 * k, 1.00), (0.29, -1.50 - 0.12 * k, 0.92), (0.29, -1.40, 0.82)], 0.005, 5)
    box('black', (0.20, 0.36, 0.30), (0.40, -0.42, 1.06), bev=(0.04, 3))          # 燃料タンク（左のステップの奥）
    cyl('silver', 0.045, 0.016, (0.40, -0.50, 1.215), n=20)                       # 給油口（ふた）
    cyl('black', 0.034, 0.024, (0.40, -0.50, 1.225), n=16)
    box('silver', (0.05, 0.012, 0.012), (0.40, -0.50, 1.240))                     # ふたのつまみ


def cab():
    """4 本柱のキャビン・屋根・ガラス・ライト・排気管・ステップ"""
    fy = front_y
    # 柱（黒）
    for s in (1, -1):
        pipe('black', [(s * CAB_X, fy(CAB_X) + 0.01, FLOOR + 0.02), (s * CAB_X, fy(CAB_X) + 0.01, ROOF_IN)], 0.03, 8)
        box('black', (0.06, 0.06, ROOF_IN - FLOOR - 0.04), (s * CAB_X, GLASS_R - 0.01, (FLOOR + ROOF_IN) / 2 + 0.01), bev=(0.01,))
        # 横の下の板（後輪の上）
        prism('black', [(-0.25, FLOOR), (GLASS_R, FLOOR), (GLASS_R, 1.62), (-0.25, 1.62)], 0.03, T((s * CAB_X, 0, 0), (90, 0, 90)))
        # ドアの枠（曲面ガラスのふちに沿う）
        ys = [DOOR_Y0 + (DOOR_Y1 - DOOR_Y0) * i / 24 for i in range(25)]
        pipe('black', [(s * door_x(y), y, door_bottom(y) - 0.01) for y in ys], 0.012, 6, cap=False)
        pipe('black', [(s * door_x(y), y, ROOF_IN - 0.02) for y in ys], 0.012, 6)
        for z in (door_bottom, lambda y: ROOF_IN - 0.012):                    # ふくらんだガラスと柱の線のあいだのふさぎ
            loft('black', [[(s * CAB_X, y, z(y) - 0.012), (s * door_x(y), y, z(y) - 0.012)] for y in ys], smooth=60)
        # ドアの取っ手・ちょうつがい
        box('black', (0.03, 0.12, 0.025), (s * (door_x(-0.40) + 0.02), -0.40, 1.80), bev=(0.006,))
        for z in (1.75, 2.25):
            box('black', (0.03, 0.04, 0.06), (s * (door_x(GLASS_R - 0.05) + 0.015), GLASS_R - 0.05, z))
    # 前の下（ボンネットとガラスのあいだ）
    box('black', (1.24, 0.06, 0.08), (0, GLASS_F_SIDE + 0.02, FLOOR + 0.04))
    box('black', (0.60, 0.06, 0.30), (0, GLASS_F + 0.02, FLOOR + 0.15))
    box('black', (1.28, 0.08, 0.30), (0, GLASS_R, FLOOR + 0.14))                  # 後ろの下
    # 屋根（赤）と黒い庇
    box('paint_red', (1.50, 1.64, 0.16), (0, 0.06, ROOF_IN + 0.085), bev=(0.07, 4))   # 実車の屋根は厚みのある丸い赤い殻
    box('paint_red', (1.30, 1.32, 0.03), (0, 0.08, ROOF_IN + 0.165), bev=(0.015, 2))
    x, y0, y1 = 0.728, -0.74, 0.86                                                # 屋根のふちの雨どい
    pipe('black', [(-x, y0, ROOF_IN + 0.012), (x, y0, ROOF_IN + 0.012), (x, y1, ROOF_IN + 0.012), (-x, y1, ROOF_IN + 0.012), (-x, y0, ROOF_IN + 0.012)], 0.009, 6)
    box('black', (1.46, 0.15, 0.03), (0, -0.80, ROOF_IN + 0.03), (-10, 0, 0), bev=(0.01,))
    box('black', (1.50, 0.05, 0.05), (0, 0.85, ROOF_IN + 0.03), bev=(0.01,))
    # GNSS アンテナ（白い傘）
    cyl('white', 0.05, 0.04, (0, -0.25, ROOF_IN + 0.195), n=20)
    sph('white', 0.085, (0, -0.25, ROOF_IN + 0.19), (1, 1, 0.41), n=24)
    # LED ワークランプ（前後 2 灯ずつ）
    for s in (1, -1):
        box('black', (0.11, 0.06, 0.06), (s * 0.48, -0.79, ROOF_IN - 0.01), (-10, 0, 0), bev=(0.008,))
        box('lamp_work', (0.09, 0.008, 0.04), (s * 0.48, -0.822, ROOF_IN - 0.016), (-10, 0, 0))
        box('black', (0.11, 0.05, 0.06), (s * 0.52, 0.85, ROOF_IN - 0.03), (10, 0, 0), bev=(0.008,))
        box('lamp_work', (0.09, 0.008, 0.04), (s * 0.52, 0.877, ROOF_IN - 0.03), (10, 0, 0))
    # 右 A ピラーに沿う黒い排気管（ボンネットの右から上へ）
    ex = -CAB_X - 0.07
    # （右のステップの前を通るよう、前で外へ出してから A ピラーの前を上がる。実車は太いマフラーが屋根の高さまで立つ）
    pipe('black', [(-0.33, -0.95, 1.12), (-0.55, -0.94, 1.14), (ex, -0.87, 1.24), (ex, -0.72, 1.48), (ex, -0.64, 1.62), (ex, -0.64, 2.30), (ex - 0.005, -0.645, 2.44)], 0.042, 14)
    cyl('black', 0.075, 0.80, (ex, -0.64, 1.98), n=20)                         # マフラーの太いカバー
    cyl('black_gloss', 0.05, 0.05, (ex, -0.645, 2.45), n=16)                   # 先の口
    for z in (1.70, 2.28):
        box('black', (0.07, 0.03, 0.02), (ex + 0.045, -0.615, z))
    # 前のウインカー（Aピラーの下の外）
    for s, nm in ((1, 'winker_L'), (-1, 'winker_R')):
        box('black', (0.07, 0.07, 0.08), (s * (CAB_X + 0.05), fy(CAB_X) - 0.02, 1.46), bev=(0.01,))
        box(nm, (0.06, 0.02, 0.06), (s * (CAB_X + 0.055), fy(CAB_X) - 0.06, 1.46), bev=(0.008,))
    # ミラー（外）：ステーと黒い枠。鏡の面は MirrorL・MirrorR
    for s in (1, -1):
        pipe('black', [(s * (CAB_X + 0.02), fy(CAB_X) + 0.02, 2.30), (s * 0.80, fy(CAB_X) + 0.0, 2.26), (s * 0.86, fy(CAB_X) + 0.03, 2.17)], 0.012, 8)
        box('black', (0.13, 0.035, 0.21), (s * 0.861, fy(CAB_X) + 0.05, 2.06), (0, 0, s * 12), bev=(0.015,))
    # 乗降ステップ（左右とも。ドアは両側にある）
    for s in (1, -1):
        for z, y in ((0.48, -0.78), (0.86, -0.77), (1.25, -0.70)):
            sd = 0.13 if z < 1 else 0.17
            box('darkgray', (0.27, sd, 0.025), (s * 0.68, y, z), bev=(0.006,))
            for k in range(4):                                                  # 滑り止めの横みぞ（細い山）
                box('black', (0.25, 0.012, 0.008), (s * 0.68, y - sd * 0.36 + sd * 0.24 * k, z + 0.0165))
        for x in (0.545, 0.815):
            prism('black', [(-0.86, 0.44), (-0.70, 0.44), (-0.60, FLOOR), (-0.80, FLOOR)], 0.012, T((s * x, 0, 0), (90, 0, 90)))
        pipe('black', [(s * 0.71, -0.62, 1.45), (s * 0.73, -0.62, 1.60), (s * 0.73, -0.60, 2.15), (s * 0.70, -0.58, 2.22)], 0.015, 8)   # 乗降グリップ（外）
    # 床の下
    box('darkgray', (1.20, 1.38, 0.10), (0, 0.13, FLOOR - 0.06))


def glass():
    """継ぎ目のない曲面一枚の前ガラスと両ドアのガラス・後ガラス（材質 glass）"""
    fy = front_y
    secs = []
    for i in range(25):
        x = -CAB_X + 2 * CAB_X * i / 24
        zb = 1.40 + 0.20 * max(0.0, min(1.0, (0.42 - abs(x)) / 0.12))           # まん中はボンネットの上から
        secs.append([(x, fy(x), zb), (x, fy(x), ROOF_IN - 0.01)])
    with part('Glass'):
        loft('glass', secs, smooth=60)
        for s in (1, -1):
            ys = [DOOR_Y0 + (DOOR_Y1 - DOOR_Y0) * i / 24 for i in range(25)]
            loft('glass', [[(s * door_x(y), y, door_bottom(y)), (s * door_x(y), y, ROOF_IN - 0.01)] for y in ys], smooth=60)
        box('glass', (2 * CAB_X - 0.04, 0.008, ROOF_IN - 1.62), (0, GLASS_R, (ROOF_IN + 1.61) / 2))
    # 前ガラスの映りこみ：ななめのうすい白いすじ 2 本（外へ 6mm。Body に入れて Glass の材質は glass だけに保つ）
    for x0, x1, w in ((-0.40, 0.05, 0.10), (0.12, 0.30, 0.045)):
        gs = []
        for i in range(13):
            x = x0 + (x1 - x0) * i / 12
            zc = 1.78 + (x - x0) * 0.9 + 0.30 * (x0 + 0.4)
            gs.append([(x, fy(x) - 0.006, zc - w), (x, fy(x) - 0.006, zc + w)])
        with part('Body'):
            loft('glass_glint', gs, smooth=60)


def fenders_lamps():
    """赤い大型リヤフェンダー・スマートリヤコンビランプ・低速車マーク・後ろの三点リンクの腕"""
    for s, wk in ((1, 'winker_L'), (-1, 'winker_R')):
        prof = [(0.47, 0.70), (0.47, 0.775), (0.86, 0.79), (0.905, 0.765), (0.91, 0.69), (0.895, 0.69), (0.89, 0.755), (0.855, 0.775), (0.485, 0.762), (0.485, 0.70)]
        lathe('paint_red', [(s * x, r) for x, r in prof], 0.0, RZ, n=40, a0=-58, a1=82, closed_prof=True, smooth=40)
        # フェンダーの後ろのはしの黒い泥よけフラップ（後輪の後ろ側。下はじ z=0.30 で地面に届かない）
        box('black', (0.40, 0.014, 0.46), (s * 0.68, 0.755, 0.55), (-5, 0, 0), bev=(0.005,))
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
        pipe('rust', [(s * 0.24, 0.62, 0.90), (s * 0.29, 0.68, 0.47)], 0.016, 8)            # リフトロッド（さびている）
        cyl('silver', 0.024, 0.12, (s * 0.265, 0.65, 0.70), (5, -s * 6, 0), 10)           # 長さの調整

    box('darkgray', (0.30, 0.20, 0.22), (0, 0.50, 0.95), bev=(0.02,))
    cyl('silver', 0.018, 0.12, (0, 0.62, 0.62), (90, 0, 0), 10)
    box('darkgray', (0.12, 0.30, 0.04), (0, 0.72, 0.40))
    box('black', (0.30, 0.05, 0.20), (0, 0.64, 0.70), (20, 0, 0))                 # PTO カバー
    for k, c in enumerate(('paint_red', 'paint_red', 'blue', 'blue')):           # 油圧の取り出し口
        x = -0.135 + 0.09 * k
        box('darkgray', (0.07, 0.05, 0.05), (x, 0.58, 1.04))
        cyl('silver', 0.016, 0.06, (x, 0.63, 1.04), (90, 0, 0), 10)
        cyl(c, 0.02, 0.02, (x, 0.665, 1.04), (90, 0, 0), 10)
    cyl('silver', 0.016, 0.12, (0, 0.80, 0.42), n=10)                             # けん引ピン



# ================================================================
#  運転席（いちばん大事）
# ================================================================
COL_TILT = 35.0
WHEEL_C = Vector((0.0, 0.0, 1.89))
WN = Vector((0, math.sin(math.radians(COL_TILT)), math.cos(math.radians(COL_TILT))))   # ハンドル面の法線（運転者のほう）
W_UP = Vector((0, -math.cos(math.radians(COL_TILT)), math.sin(math.radians(COL_TILT))))  # ハンドルの 12 時の向き
WHEEL_R = 0.165                   # リムの中心までの半径（外径 約 0.37）
W_MTX = Matrix.Translation(WHEEL_C) @ Euler((math.radians(-COL_TILT), 0, 0)).to_matrix().to_4x4() @ Matrix.Rotation(math.pi, 4, 'Z')


def front_fender(s):
    """前輪の赤いフェンダー（Steer の中に入れる。転がり回転には付かず、転舵だけ一緒に動く）。
    後輪フェンダーと同じ lathe。幅は前タイヤの外側面（TR+F_W/2）までで、内側へ余裕をとる"""
    xi, xo = TR - F_W / 2 - 0.03, TR + F_W / 2
    ro = F_OD / 2
    prof = [(xi, ro + 0.012), (xi, ro + 0.050), (xo - 0.02, ro + 0.060), (xo, ro + 0.045), (xo, ro + 0.012),
            (xo - 0.012, ro + 0.012), (xo - 0.012, ro + 0.040), (xo - 0.02, ro + 0.048), (xi + 0.012, ro + 0.038), (xi + 0.012, ro + 0.012)]
    lathe('paint_red', [(s * x, r) for x, r in prof], FY, FZ, n=24, a0=-55, a1=70, closed_prof=True, smooth=40)
    # ステー：キングピンの上から、フェンダーの前と後ろの内側へ
    for ph in (-38, 45):
        a = math.radians(ph)
        pipe('darkgray', [(s * (xi + 0.02), FY, FZ + 0.13), (s * (xi + 0.02), FY + (ro + 0.035) * math.sin(a), FZ + (ro + 0.035) * math.cos(a))], 0.011, 8)


def interior():
    # 床とゴムマット（溝）
    box('trim', (1.24, 1.30, 0.02), (0, 0.13, FLOOR - 0.01))
    box('rubber_mat', (0.84, 0.72, 0.008), (0, -0.16, FLOOR + 0.004))
    for k in range(18):                                                          # 滑り止め：ななめの長い溝が まん中で山形（ハの字）に向きあう（公式の運転席の写真）
        for j in range(6):
            s = 1 if j < 3 else -1
            x = s * (0.065 + (j % 3) * 0.125)
            box('rubber_mat', (0.11, 0.012, 0.006), (x, -0.50 + k * 0.04, FLOOR + 0.011), (0, 0, s * 32))
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
    # 前の塔（床からメーターまで。黒い芯の左右を、運転者へ少し向いた大きな赤いカバーがはさむ）
    tower = [(-0.60, FLOOR), (-0.28, FLOOR), (-0.24, 1.47), (-0.13, 1.66), (-0.17, 1.80), (-0.30, 1.88), (-0.46, 1.74), (-0.60, 1.52)]
    prism('black', tower, 0.28, T((0, 0, 0), (90, 0, 90)), bev=(0.02, 3))
    YC, YAW = -0.32, 30.0                                                        # 赤いカバーのまん中の Y と、運転者へ向ける角度
    for s in (1, -1):
        red = [(-0.56 - YC, 1.44), (-0.27 - YC, 1.44), (-0.13 - YC, 1.64), (-0.14 - YC, 1.80), (-0.21 - YC, 1.93), (-0.36 - YC, 1.93), (-0.47 - YC, 1.74)]
        rm = T((s * 0.185, YC, 0), (0, 0, s * YAW)) @ T((0, 0, 0), (90, 0, 90))  # まん中を軸に、後ろのはしを内へ回す
        prism('paint_red', red, 0.024, rm, bev=(0.008, 3))
        # 赤いカバーの上の黒いスイッチ板（左：N/R の表示とハザード、右：赤い丸ボタンと四角いスイッチ）
        pm = rm @ T((0.10, 1.70, s * 0.016))
        box('black', (0.10, 0.075, 0.012), (0, 0, s * 0.008), mtx=pm, bev=(0.004,))
        if s > 0:
            prism('paint_red', [(-0.016, -0.012), (0.016, -0.012), (0.0, 0.016)], 0.008, pm @ T((0.02, 0.0, 0.018)))
            box('white', (0.022, 0.03, 0.006), (-0.025, 0.0, 0.018), mtx=pm)
        else:
            cyl('paint_red', 0.014, 0.012, (0.025, 0.0, -0.02), mtx=pm, n=16)
            for k in range(2):
                box('gray', (0.018, 0.018, 0.008), (-0.02 - k * 0.024, 0.0, -0.018), mtx=pm, bev=(0.003,))
    # ハンドルの下の丸いスイッチ（左右に 2 段ずつ）
    for s in (1, -1):
        for r in range(2):
            for k in range(2):
                p = Vector((s * (0.055 + k * 0.03), -0.150 - r * 0.02, 1.70 - r * 0.035))
                cyl('gray', 0.011, 0.01, p, (55, 0, 0), n=14)
                cyl('led_green' if (r + k) % 3 == 0 else 'white', 0.006, 0.012, p + Vector((0, 0.002, 0.001)), (55, 0, 0), n=10)
    # ハンドル柱（チルト）：塔から出て、ゴムの蛇腹と、ペダルのばね
    col_m = Matrix.Translation(WHEEL_C) @ Euler((math.radians(-COL_TILT), 0, 0)).to_matrix().to_4x4()
    cyl('black', 0.035, 0.22, (0, 0, -0.14), mtx=col_m, n=14)
    # リバーサレバーの根もとの 前後の印の板（字は入れず、上に前進のオレンジ、下に後進の赤、あいだに白い矢印の線）
    sr = col_m @ Vector((0.12, -0.02, -0.11))
    box('black', (0.008, 0.032, 0.12), sr + Vector((-0.004, 0.004, 0.0)), bev=(0.003,))
    box('orange', (0.004, 0.018, 0.018), sr + Vector((0.0005, 0.004, 0.042)))
    box('paint_red', (0.004, 0.018, 0.018), sr + Vector((0.0005, 0.004, -0.042)))
    box('white', (0.004, 0.003, 0.05), sr + Vector((0.0005, 0.012, 0.0)))
    for k in range(5):
        tor('black', 0.05 - 0.003 * (k % 2), 0.012, col_m @ Matrix.Translation((0, 0, -0.27 - k * 0.022)), 20, 6)
    pipe('black', [col_m @ Vector((0.09, 0.02, -0.33)), col_m @ Vector((0.15, 0.05, -0.30))], 0.006, 6)   # チルトレバー
    sph('black', 0.014, col_m @ Vector((0.155, 0.052, -0.30)), (1.4, 1, 1), n=10)
    for x in (0.12, -0.12):
        pts = [(x + 0.016 * math.sin(t), -0.46 + 0.016 * math.cos(t), 1.36 + 0.13 * t / (8 * math.pi)) for t in np.linspace(0, 8 * math.pi, 49)]
        pipe('black', pts, 0.003, 5, smooth=60)
    # 右のコンビネーションスイッチ（ライト・ウインカーのレバー）
    sp = col_m @ Vector((-0.07, -0.02, -0.10))
    pipe('black', [sp, sp + Vector((-0.10, 0.03, 0.02))], 0.008, 8)
    cyl('black', 0.012, 0.04, sp + Vector((-0.115, 0.034, 0.022)), (0, 90, -15), n=10)
    # メーター：幅の広い黒い枠に、まん中の丸いメーターと左右の小さな計器。上に黒い庇。ハンドルの上の窓から見える
    P = WHEEL_C + W_UP * (WHEEL_R * 0.56)
    d = (P - EYE).normalized()
    MC = P + d * 0.17
    up = Vector((0, 0, 1)) - d * d.z
    mm = face_mtx(MC, -d, up)
    box('black', (0.32, 0.17, 0.10), (0, -0.01, -0.055), mtx=mm, bev=(0.03, 3))
    cyl('black_gloss', 0.098, 0.012, (0, 0, -0.004), mtx=mm, n=40)
    tor('silver', 0.096, 0.006, mm @ Matrix.Translation((0, 0, 0.003)), 40, 6)
    for sx in (1, -1):                                                           # 左右の小さな計器（燃料・水温）
        g = mm @ Matrix.Translation((sx * 0.128, -0.015, 0.0))
        cyl('black_gloss', 0.032, 0.01, (0, 0, -0.002), mtx=g, n=24)
        tor('white', 0.025, 0.002, g @ Matrix.Translation((0, 0, 0.004)), 16, 4, 200, 340)
        tor('paint_red', 0.025, 0.0025, g @ Matrix.Translation((0, 0, 0.004)), 4, 4, 200, 225)
        box('orange', (0.003, 0.022, 0.002), (0.006, 0.008, 0.006), (0, 0, 30), mtx=g)
        tor('silver', 0.032, 0.003, g @ Matrix.Translation((0, 0, 0.003)), 24, 4)
    bm = bmesh.new()                                                             # 庇：横に長い半円の筒
    rows = []
    for i in range(21):
        a = math.radians(-8 + 196 * i / 20)
        rows.append([bm.verts.new(mm @ Vector((0.17 * math.cos(a), 0.012 + 0.10 * math.sin(a), z))) for z in (-0.07, 0.03 + 0.03 * math.sin(a))])
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], b[0], b[1], a[1]))
    _obj(bm, 'black', smooth=60)
    screen('MeterScreen', 0.18, 0.18, mm @ Vector((0, 0, 0.005)), -d, up, 'meter_screen')
    # ペダル軸・アクセル（床から生える、銀色の穴あき板）
    cyl_x('darkgray', 0.012, -0.34, 0.28, -0.50, 1.58, 10)
    mt = T((-0.40, -0.24, FLOOR + 0.07), (-52, 0, 0))
    box('silver', (0.085, 0.22, 0.012), (0, 0, 0), mtx=mt, bev=(0.006,))
    for k in range(5):
        box('black', (0.05, 0.012, 0.004), (0, -0.08 + k * 0.04, 0.007), mtx=mt)
    box('darkgray', (0.07, 0.05, 0.05), (-0.40, -0.32, FLOOR + 0.025))
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
    for x in (0.205, -0.205):                                                      # 座面・背もたれの横のふくらみ
        box('seat', (0.07, 0.40, 0.05), (x, 0.42, FLOOR + 0.33), bev=(0.02, 2))
        box('seat', (0.07, 0.10, 0.44), (x, 0.665, FLOOR + 0.60), (-12, 0, 0), bev=(0.025, 2))
    bk = T((0, 0.69, FLOOR + 0.58), (-12, 0, 0))
    for x in (-0.075, -0.025, 0.025, 0.075):                                      # 背もたれの縦のみぞ（写真の布のシート）
        box('black', (0.008, 0.006, 0.36), (x, -0.056, 0.03), mtx=bk)
    box('black', (0.32, 0.006, 0.008), (0, -0.056, -0.17), mtx=bk)                  # 腰の所の横の縫い目
    box('black', (0.05, 0.03, 0.025), (0.27, 0.56, FLOOR + 0.34), bev=(0.006,))   # シートベルトの留め具
    box('silver', (0.03, 0.035, 0.012), (0.27, 0.54, FLOOR + 0.355))
    pipe('silver', [(-0.12, 0.19, FLOOR + 0.215), (-0.02, 0.17, FLOOR + 0.215), (0.12, 0.19, FLOOR + 0.215)], 0.006, 6)   # 前後調整のレバー
    for x in (0.45, -0.45):                                                       # 天井のスピーカー
        cyl('black', 0.065, 0.01, (x, 0.50, ROOF_IN - 0.022), n=24)
        tor('darkgray', 0.065, 0.005, T((x, 0.50, ROOF_IN - 0.028)), 24, 5)
    # 左のひじかけ（はね上げ式）
    box('seat', (0.07, 0.30, 0.05), (0.28, 0.53, FLOOR + 0.48), bev=(0.02, 2))
    box('darkgray', (0.03, 0.04, 0.18), (0.28, 0.66, FLOOR + 0.40))
    # 右のアームレスト一体型の操作盤（公式の運転席の写真）：うしろは ひじを置くクッション、前は 高く盛り上がった台に
    # 主変速のジョイスティック。台の外がわに 緑の LED が ななめに並ぶ。昇降スイッチとダイヤルは ジョイスティックのうしろ
    box('black', (0.17, 0.40, 0.15), (-0.365, 0.49, FLOOR + 0.39), bev=(0.03, 3))
    box('trim', (0.15, 0.10, 0.012), (-0.365, 0.35, FLOOR + 0.467), bev=(0.004,))
    box('seat', (0.13, 0.27, 0.05), (-0.365, 0.55, FLOOR + 0.49), bev=(0.02, 3))
    box('darkgray', (0.06, 0.08, 0.30), (-0.33, 0.50, FLOOR + 0.20))
    top = FLOOR + 0.474
    pod = [(0.31, FLOOR + 0.32), (0.31, FLOOR + 0.465), (0.22, FLOOR + 0.52), (0.10, FLOOR + 0.575),
           (0.045, FLOOR + 0.565), (0.025, FLOOR + 0.50), (0.035, FLOOR + 0.32)]
    prism('black', pod, 0.16, T((-0.36, 0, 0), (90, 0, 90)), bev=(0.02, 3))
    prism('trim', [(y, z + 0.004) for y, z in pod[1:5]] + [(0.05, FLOOR + 0.54), (0.29, FLOOR + 0.455)], 0.14, T((-0.36, 0, 0), (90, 0, 90)))   # 上の灰色の面
    pz = lambda y: FLOOR + 0.52 + (0.22 - y) / 0.12 * 0.055 if y < 0.22 else FLOOR + 0.465 + (0.31 - y) / 0.09 * 0.055   # 台の上の高さ
    tilt = lambda y: -math.degrees(math.atan(0.055 / (0.12 if y < 0.22 else 0.09)))   # 台の上の面の傾き（前が高い）
    on_pod = lambda x, y: T((x, y, pz(y)), (tilt(y), 0, 0))                    # 台の上の面にのせる（局所 +Z が面の外向き）
    for k in range(6):                                                         # 緑の LED（台の上の外がわのふちに ななめに並ぶ）
        y = 0.28 - k * 0.026
        box('led_green', (0.008, 0.012, 0.006), (0, 0, 0.002), mtx=on_pod(-0.428, y))
    dm = on_pod(-0.375, 0.262)                                                 # 銀ダイヤル＋オレンジのリング（LED の列から はなす）
    cyl('silver', 0.02, 0.022, (0, 0, 0.011), mtx=dm, n=24)
    tor('orange', 0.025, 0.005, dm @ Matrix.Translation((0, 0, 0.004)), 28, 6)
    for k in range(10):
        a = 2 * math.pi * k / 10
        box('silver', (0.004, 0.006, 0.018), (0.02 * math.cos(a), 0.02 * math.sin(a), 0.011), (0, 0, math.degrees(a)), mtx=dm)
    # 作業機昇降スイッチ（前後に倒す黒いシーソー）と、チョイ上げ・チョイ下げのボタン。台の上の面にそって取りつける
    sm = on_pod(-0.312, 0.255)
    box('darkgray', (0.045, 0.07, 0.008), (0, 0, 0.004), mtx=sm, bev=(0.004,))
    box('black', (0.032, 0.055, 0.016), (0, 0, 0.014), (8, 0, 0), mtx=sm, bev=(0.008, 2))
    box('gray', (0.022, 0.006, 0.004), (0, -0.02, 0.023), (8, 0, 0), mtx=sm)
    for k in range(2):
        cyl('gray', 0.009, 0.01, (-0.355 + 0.03 * k, 0.345, top + 0.006), n=14)
        cyl('black', 0.012, 0.003, (-0.355 + 0.03 * k, 0.345, top + 0.0015), n=14)
    # 右の横のパネル（タイヤハウスの上・ひじかけの外）：操作盤のうしろの面が運転者へ少し傾いている。
    # 番号は公式「操作性」（YT3R）の運転席の写真：前から 黄色い PTO 駆動スイッチ（⑪）、みぞの サブコントロールレバー（⑫。
    # 作業機の油圧シリンダーを動かす。このモデルは 2 連）、電源ソケットと PTO 連動切替スイッチ（⑬）
    prism('trim', [(0.20, 1.47), (0.70, 1.47), (0.70, FLOOR + 0.39), (0.24, FLOOR + 0.43), (0.20, FLOOR + 0.41)], 0.15, T((-0.545, 0, 0), (90, 0, 90)), bev=(0.015, 2))
    pm = side_panel_mtx()
    box('black', (0.13, 0.46, 0.012), (0, 0.0, 0.0), mtx=pm, bev=(0.006, 2))
    cyl('black', 0.03, 0.006, (0, -0.16, 0.008), mtx=pm, n=24)
    cyl('yellow', 0.022, 0.024, (0, -0.16, 0.022), mtx=pm, n=24)
    sph('yellow', 0.022, (0, -0.16, 0.034), (1, 1, 0.35), mtx=pm, n=16)
    up = (pm.to_3x3() @ Vector((0, 0, 1))).normalized()
    for lx, c in ((-0.024, 'beige'), (0.024, 'blue')):                         # サブコントロールレバー 2 本（みぞから出る短い柄と T 字のにぎり）
        box('black_gloss', (0.016, 0.16, 0.006), (lx, 0.0, 0.004), mtx=pm)
        r0 = pm @ Vector((lx, 0.01, 0.006))
        pipe('silver', [r0, r0 + up * 0.065], 0.005, 8)
        cyl(c, 0.011, 0.04, r0 + up * 0.065, (0, 90, 0), n=12)
    cyl('black', 0.019, 0.016, (0.025, 0.17, 0.008), mtx=pm, n=18)              # 電源ソケット
    cyl('darkgray', 0.012, 0.018, (0.025, 0.17, 0.010), mtx=pm, n=14)
    for k in range(2):                                                         # スイッチ（シーソー）
        box('darkgray', (0.026, 0.034, 0.012), (-0.03, 0.14 + k * 0.05, 0.008), mtx=pm, bev=(0.004,))
        box('led_green' if k == 0 else 'gray', (0.006, 0.006, 0.003), (-0.03, 0.125 + k * 0.05, 0.015), mtx=pm)
    # 右のタッチモニター：操作盤の前のはしに台で立てる。上のふちに青いボタン 5 つ、右上に回すつまみ
    MON = Vector((-0.45, -0.02, 1.96))
    nrm = (EYE - MON).normalized()
    mon = face_mtx(MON, nrm)
    pipe('black', [(-0.40, 0.07, FLOOR + 0.52), (-0.42, 0.04, 1.90), MON - nrm * 0.04], 0.022, 10)   # 操作盤の前の台から立てる
    box('black', (0.26, 0.19, 0.04), (0, -0.005, -0.017), mtx=mon, bev=(0.015, 3))
    for k in range(5):
        cyl('blue', 0.009, 0.012, (-0.08 + k * 0.035, 0.083, 0.004), mtx=mon, n=12)
        cyl('room_lamp', 0.006, 0.014, (-0.08 + k * 0.035, 0.083, 0.004), mtx=mon, n=10)
    cyl('black', 0.022, 0.03, (0.115, 0.085, 0.012), (-60, 0, 0), mtx=mon, n=16)
    for k in range(12):
        a = 2 * math.pi * k / 12
        box('darkgray', (0.004, 0.004, 0.028), (0.115 + 0.022 * math.cos(a), 0.085 + 0.011 * math.sin(a), 0.012 + 0.019 * math.sin(a)), (-60, 0, 0), mtx=mon)
    screen('MonitorScreen', 0.22, 0.135, mon @ Vector((0, -0.012, 0.0045)), nrm, (0, 0, 1), 'monitor_screen')
    # 左の台：前に PTO 変速レバー（③）、そのうしろ シートの横に 副変速レバー（②）、カップホルダー。
    # みぞの横の印は 字を入れず色だけ（PTO は 4 段と逆転の黄色、副変速は 低速のオレンジと N の白）
    box('trim', (0.14, 0.46, 0.22), (0.35, 0.24, FLOOR + 0.11), bev=(0.02,))
    box('black', (0.03, 0.12, 0.006), (0.37, 0.10, FLOOR + 0.222))
    for k in range(5):
        box('yellow', (0.010, 0.010, 0.003), (0.395, 0.055 + k * 0.022, FLOOR + 0.2235))
    box('black', (0.03, 0.12, 0.006), (0.33, 0.29, FLOOR + 0.222))
    box('orange', (0.014, 0.014, 0.003), (0.305, 0.25, FLOOR + 0.2235))
    box('white', (0.010, 0.010, 0.003), (0.305, 0.29, FLOOR + 0.2235))
    cyl('black', 0.042, 0.09, (0.35, 0.42, FLOOR + 0.20), n=24, caps=False)
    cyl('black', 0.036, 0.004, (0.35, 0.42, FLOOR + 0.17), n=24)
    # カップホルダーのペットボトルのお茶（農家さんの運転席にはたいてい飲みものがある）
    b0 = FLOOR + 0.175
    cyl('tea', 0.029, 0.15, (0.35, 0.42, b0 + 0.075), n=20)
    cyl('pet', 0.031, 0.17, (0.35, 0.42, b0 + 0.085), n=20)
    cyl('blue', 0.0315, 0.06, (0.35, 0.42, b0 + 0.11), n=20, caps=False)           # 帯のラベル
    cyl('pet', 0.031, 0.04, (0.35, 0.42, b0 + 0.19), n=20, r2=0.013)              # 肩
    cyl('white', 0.015, 0.02, (0.35, 0.42, b0 + 0.22), n=16)                       # キャップ
    # 右のうしろの柱の内側に、安全の注意ラベル（字は描かず、色の帯と灰色の行だけ）
    lx = -CAB_X + 0.033
    for k, (h, head) in enumerate(((0.12, 'orange'), (0.08, 'yellow'), (0.10, 'orange'), (0.07, 'yellow'))):
        zc = 2.28 - sum((0.12, 0.08, 0.10, 0.07)[:k]) - 0.015 * k - h / 2
        box('white', (0.003, 0.05, h), (lx, GLASS_R - 0.01, zc))
        box(head, (0.004, 0.05, 0.016), (lx + 0.0005, GLASS_R - 0.01, zc + h / 2 - 0.008))
        for r in range(int((h - 0.03) / 0.012)):
            box('gray', (0.004, 0.038, 0.004), (lx + 0.0005, GLASS_R - 0.01, zc + h / 2 - 0.026 - r * 0.012))
    # 乗降グリップ（左 A ピラー）・サンバイザ・ルームミラー・天井のエアコン・室内灯
    for s in (1, -1):
        gx = s * (CAB_X - 0.05)
        pipe('silver', [(s * (CAB_X - 0.015), -0.50, 1.58), (gx, -0.47, 1.62), (gx, -0.47, 2.26), (s * (CAB_X - 0.015), -0.50, 2.30)], 0.014, 10)
        box('black', (0.05, 0.07, 0.16), (s * (CAB_X - 0.03), -0.44, 1.88), bev=(0.012, 2))    # ドアの取っ手（受け）
        pipe('black', [(s * (CAB_X - 0.045), -0.42, 1.86), (s * (door_x(-0.1) - 0.05), -0.10, 1.80), (s * (door_x(0.2) - 0.05), 0.20, 1.74)], 0.012, 8)
    box('visor', (0.80, 0.24, 0.006), (0.12, -0.45, ROOF_IN - 0.05), (25, 0, 0))
    pipe('black', [(-0.30, -0.56, ROOF_IN - 0.015), (-0.30, -0.54, ROOF_IN - 0.05)], 0.006, 6)
    pipe('black', [(0, -0.50, ROOF_IN - 0.01), (0, -0.49, ROOF_IN - 0.08)], 0.008, 6)
    RM = Vector((0, -0.48, ROOF_IN - 0.11))
    rn = (EYE - RM).normalized()
    rmm = face_mtx(RM, rn)
    box('black', (0.32, 0.085, 0.025), (0, 0, -0.012), mtx=rmm, bev=(0.012, 2))         # 大型ルームミラー
    screen('RoomMirror', 0.30, 0.068, rmm @ Vector((0, 0, 0.002)), rn, (0, 0, 1), 'mirror')
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
        tor('black', WHEEL_R, 0.021, L, 64, 12)                                   # 黒い太いリム
        for k in range(24):                                                        # 握りの凹凸
            a = 2 * math.pi * (k + 0.5) / 24
            tor('black_gloss', 0.0215, 0.003, L @ Matrix.Translation((WHEEL_R * math.cos(a), WHEEL_R * math.sin(a), 0))
                @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), 10, 4, 200, 340)
        for a in (40, 140, 270):                                                   # Y 字の 3 本スポーク（赤・ハブで太く、リムで細い）
            r = math.radians(a)
            dl = Vector((math.cos(r), math.sin(r), 0))
            p0, p1 = L @ (dl * 0.045 + Vector((0, 0, -0.028))), L @ (dl * (WHEEL_R - 0.012))
            y = (p1 - p0).normalized()
            z = (L.to_3x3() @ Vector((0, 0, 1))).normalized()
            x = y.cross(z).normalized()
            z = x.cross(y)
            m = Matrix((x, y, z)).transposed().to_4x4()
            m.translation = p0
            ln = (p1 - p0).length
            prism('paint_red', [(-0.036, 0.0), (0.036, 0.0), (0.018, ln), (-0.018, ln)], 0.016, m, bev=(0.006, 3))
        cyl('black', 0.064, 0.02, (0, 0, -0.04), mtx=L, n=32)
        sph('paint_red', 0.062, (0, 0, -0.028), (1, 1, 0.5), mtx=L, n=32)                # 大きな赤いハブ
        tor('paint_red', 0.058, 0.008, L @ Matrix.Translation((0, 0, -0.03)), 32, 6)


def levers_pedals():
    # 左手のオレンジのリバーサレバー（ハンドルのすぐ左手元から外へ出る平たいへら。先は四角いくぼみのある つまみ。
    # 指先で前後へ動かす：公式「操作性」の写真と説明）
    col_m = Matrix.Translation(WHEEL_C) @ Euler((math.radians(-COL_TILT), 0, 0)).to_matrix().to_4x4()
    root = col_m @ Vector((0.12, -0.02, -0.11))
    with part('LeverShuttle'):
        tip = root + Vector((0.13, -0.02, 0.03))
        d = (tip - root).normalized()
        pipe('black', [root, root + d * 0.03], 0.008, 8)
        bm_ = along(root + d * 0.02, tip)
        prism('orange', [(-0.011, 0.0), (0.011, 0.0), (0.017, 0.10), (-0.017, 0.10)], 0.011, bm_ @ Matrix.Rotation(math.pi / 2, 4, 'X'), bev=(0.003, 2))   # 先へ広がる へら
        pad = tip + d * 0.012
        box('orange', (0.042, 0.036, 0.013), pad, bev=(0.006, 2))                 # 先の つまみ
        box('black', (0.02, 0.02, 0.004), pad + Vector((0.0, 0.0, 0.006)), bev=(0.002,))   # 指をかける くぼみ
    LEVERS['LeverShuttle'] = root
    # 右操作盤の前の台の上の 主変速レバー（⑦。右ひじをかけたまま、手で軽く無段に変速する：公式「操作性」）
    root = Vector((-0.345, 0.13, FLOOR + 0.561))
    with part('LeverJoy'):
        box('black', (0.06, 0.06, 0.006), root + Vector((0, 0, 0.003)), bev=(0.01,))
        cyl('black', 0.022, 0.02, root + Vector((0, 0, 0.01)), n=16, r2=0.014)
        tor('orange', 0.019, 0.006, Matrix.Translation(root + Vector((0, 0, 0.03))), 24, 8)
        sph('gray', 0.033, root + Vector((0, -0.006, 0.075)), (0.85, 1.15, 1.45), (-10, 0, 0), n=20)
        sph('gray', 0.022, root + Vector((0, 0.022, 0.06)), (1.0, 1.0, 1.0), n=12)   # 手のひら側
        cyl('orange', 0.008, 0.008, root + Vector((0.012, -0.03, 0.113)), (-35, 0, 0), n=10)
        cyl('black', 0.007, 0.008, root + Vector((-0.012, -0.03, 0.113)), (-35, 0, 0), n=10)
    LEVERS['LeverJoy'] = root
    # 左の台の前の PTO 変速レバー（③。PTO の回転を 4 段と逆転に変える。黄色いにぎり：公式「操作性」の写真）
    root = Vector((0.37, 0.10, FLOOR + 0.225))
    with part('LeverPtoSel'):
        pipe('silver', [root, root + Vector((0.004, 0.02, 0.17)), root + Vector((0.0, 0.03, 0.23))], 0.007, 8)
        sph('yellow', 0.021, root + Vector((0.0, 0.032, 0.25)), (1, 1, 1.1), n=14)
        box('black', (0.026, 0.026, 0.016), root + Vector((0, 0, 0.008)), bev=(0.005,))
    LEVERS['LeverPtoSel'] = root
    # 左の台の シートの横の 副変速レバー（②。3 段。黒い柄に、上にオレンジの帯の入った黒いにぎり：公式「操作性」の写真）
    root = Vector((0.33, 0.29, FLOOR + 0.225))
    with part('LeverRange'):
        cyl('black', 0.02, 0.05, root + Vector((0, 0, 0.025)), n=14, r2=0.012)   # ゴムのブーツ
        pipe('black', [root, root + Vector((0.005, 0.02, 0.16)), root + Vector((0.0, 0.035, 0.24))], 0.009, 8)
        cyl('black', 0.018, 0.07, root + Vector((0.0, 0.04, 0.27)), (-8, 0, 0), n=16, r2=0.022)
        cyl('orange', 0.0225, 0.022, root + Vector((0.0, 0.044, 0.312)), (-8, 0, 0), n=16)
        sph('black', 0.0225, root + Vector((0.0, 0.046, 0.323)), (1, 1, 0.8), n=14)
    LEVERS['LeverRange'] = root
    # ペダル（クラッチ 1 ＋ ブレーキ 2）。原点は支点（X まわりに回る）
    for nm, x in (('PedalClutch', 0.20), ('PedalBrakeL', -0.135), ('PedalBrakeR', -0.262)):
        piv = Vector((x, -0.50, 1.58))
        with part(nm):
            pad = piv + Vector((0, 0.19, -0.16))
            cyl_x('darkgray', 0.02, x - 0.025, x + 0.025, piv.y, piv.z, 12)
            pipe('darkgray', [piv, piv + Vector((0, 0.05, -0.09)), pad + Vector((0, -0.02, 0.0))], 0.012, 8)
            mt = Matrix.Translation(pad) @ Euler((math.radians(-62), 0, 0)).to_matrix().to_4x4()
            box('black', (0.12, 0.09, 0.016), (0, 0, 0), mtx=mt, bev=(0.006,))
            for i in range(6):                                                     # 菱形の滑り止め
                for j in range(4):
                    box('rubber_mat', (0.014, 0.014, 0.005), (-0.05 + i * 0.02 + (0.01 if j % 2 else 0), -0.03 + j * 0.02, 0.009), (0, 0, 45), mtx=mt)
            if nm == 'PedalBrakeL':
                box('silver', (0.05, 0.012, 0.012), pad + Vector((-0.063, 0.02, 0.03)))   # 左右ブレーキの連結
        LEVERS[nm] = piv


LEVERS = {}


WIPER_REST = 90.0                 # ふだんは根元から右（-X）へ横に寝かせる


def wiper():
    """前ガラスの左下が根元（外側）。腕は根元から真下に作り、ふだんの向きはオブジェクトの回転で持つ"""
    W0 = Vector((0.46, front_y(0.46) - 0.035, 1.62))
    with part('Wiper'):
        cyl('black', 0.022, 0.03, W0, (90, 0, 0), n=14)
        pipe('black', [W0 + Vector((0, -0.02, 0)), W0 + Vector((0, -0.03, -0.48))], 0.006, 6)
        box('black', (0.02, 0.012, 0.42), W0 + Vector((0, -0.024, -0.28)))
        box('rubber_mat', (0.008, 0.008, 0.40), W0 + Vector((0, -0.014, -0.28)))
    return W0


# ================================================================
#  ロータリー（別オブジェクト）
# ================================================================
def implement_lamps(xs, y0, z0):
    """作業機用の灯火器：作業機をつけて道を走るとトラクターのうしろの灯火が かくれるので、作業機のうしろの両はしにも
    テール（上）・ウインカー（下）・赤い反射器をつける（農水省の公道走行ガイドブック）。カバーの上から立てた支柱の先"""
    for x in xs:
        s = 1 if x > 0 else -1
        pipe('darkgray', [(x, y0 - 0.08, z0 - 0.02), (x, y0, z0 + 0.16)], 0.014, 8)
        box('black', (0.11, 0.035, 0.17), (x, y0 + 0.015, z0 + 0.23), bev=(0.01,))
        box('tail', (0.09, 0.012, 0.065), (x, y0 + 0.035, z0 + 0.265), bev=(0.004,))
        box('winker_L' if s > 0 else 'winker_R', (0.09, 0.012, 0.045), (x, y0 + 0.035, z0 + 0.195), bev=(0.004,))
        cyl('reflector', 0.03, 0.01, (x, y0 + 0.036, z0 + 0.12), (90, 0, 0), 16)   # 丸い反射器（支柱）


def rotary():
    oy = ROTARY_Y
    ay, az = oy, 0.25                    # 爪軸
    with part('Rotary'):
        # 赤いカバー（爪のまわりの半円筒）・両側の板
        lathe('paint_red', [(-TILL_W / 2 - 0.02 + (TILL_W + 0.04) * k / 16, 0.31) for k in range(17)], ay, az, n=24, a0=-75, a1=60, smooth=50)
        for s in (1, -1):
            arc = [(0.33 * math.sin(math.radians(a)), az + 0.33 * math.cos(math.radians(a))) for a in range(-80, 66, 10)]
            prism('paint_red', [(0.0 + p[0], p[1]) for p in arc] + [(0.25, 0.02), (-0.25, 0.02)], 0.012,
                  T((s * (TILL_W / 2 + 0.03), ay, 0), (90, 0, 90)))
            box('rust', (0.03, 0.55, 0.04), (s * (TILL_W / 2 + 0.03), ay + 0.02, 0.03), bev=(0.01,))       # そり（土にこすれて、さびている）
            box('rust', (0.016, 0.50, 0.03), (s * (TILL_W / 2 + 0.03), ay + 0.02, 0.06))                    # 側板の下の縁のさび
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
        # 三点リンク（トラクターの後ろへ）と PTO の軸。下リンクはさびている（X の農家さんの写真：連結まわりのさび）
        for s in (1, -1):
            pipe('rust', [(s * 0.30, 0.48, 0.45), (s * 0.43, oy - 0.26, 0.42)], 0.022, 8)
        pipe('darkgray', [(0, 0.56, 1.00), (0, oy - 0.26, 0.96)], 0.022, 8)
        cyl('silver', 0.03, 0.10, (0, 0.92, 0.66), (90, 0, 0), 12)
        cyl('darkgray', 0.022, 0.40, (0, 0.88, 0.65), (93, 0, 0), 12)
        cyl('yellow', 0.045, 0.30, (0, 0.86, 0.65), (93, 0, 0), 14)              # 軸の覆い（黄色い筒。X の写真）
        for y in (0.70, 1.02):                                                    # 両はしのじょうご形の覆い
            cyl('yellow', 0.056, 0.05, (0, y, 0.65 + (y - 0.86) * 0.052), (93, 0, 0), 14)
        implement_lamps((TILL_W / 2 - 0.12, -TILL_W / 2 + 0.12), ay + 0.12, az + 0.30)
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
                box('tine_steel', (0.008, 0.045, (p1 - p0).length), (0, 0, (p1 - p0).length / 2), mtx=along(p0, p1, tng))
                q0 = p1
                q1 = rad(0.245) + Vector((side * 0.05, 0, 0)) - tng * 0.03
                qm = q0.lerp(q1, 0.55)                                             # 曲がった先の半分から先（刃先）だけが土で みがかれて光る
                box('tine_steel', (0.008, 0.045, (qm - q0).length), (0, 0, (qm - q0).length / 2), mtx=along(q0, qm, tng))
                box('silver', (0.008, 0.045, (q1 - qm).length), (0, 0, (q1 - qm).length / 2), mtx=along(qm, q1, tng))
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
#  代かき用のウイングハロー（別の glb：harrow_yt.glb）。作業幅 3.4m（60 馬力向けの一般的な幅の例）。
#  まん中 1.6m と左右の翼 0.9m ずつ。道を走るときは翼を上へ折りたたむ。名前はロータリーと同じ Rotary・Rotor・Flap
#  （ゲームで差しかえる）に、翼の WingL・WingR（ちょうつがいが原点）と翼の爪軸 RotorL・RotorR
# ================================================================
HARROW_W, HARROW_C = 3.4, 1.6


def harrow():
    oy = ROTARY_Y
    ay, az, R = oy + 0.02, 0.21, 0.25                # 爪軸と、カバーの半径
    wc, ww = HARROW_C / 2, (HARROW_W - HARROW_C) / 2
    hz = az + R + 0.02                               # ちょうつがいの高さ

    def cover(x0, x1):
        lathe('paint_red', [(x0 + (x1 - x0) * k / 8, R) for k in range(9)], ay, az, n=20, a0=-70, a1=70, smooth=50)
        box('paint_red', (x1 - x0, 0.08, 0.025), ((x0 + x1) / 2, ay - 0.27, az + 0.12), (-60, 0, 0))   # 前の泥よけ

    def tines(x0, x1, nf):
        cyl_x('darkgray', 0.028, x0, x1, ay, az, 14)
        for i in range(nf):
            x = x0 + 0.05 + i * (x1 - x0 - 0.10) / (nf - 1)
            for j in range(3):                       # 代かき爪は短くて幅が広い
                a = 2 * math.pi * (j / 3 + i * 0.211)
                ca, sa = math.cos(a), math.sin(a)
                p0 = Vector((x, ay + 0.05 * sa, az + 0.05 * ca))
                p1 = Vector((x, ay + 0.20 * sa, az + 0.20 * ca))
                box('silver', (0.010, 0.07, (p1 - p0).length), (0, 0, (p1 - p0).length / 2), mtx=along(p0, p1, Vector((0, ca, -sa))))

    def board(x0, x1):                               # 均平板（うしろの長い板）とレーキ
        y0 = ay + R * math.sin(math.radians(68))
        box('paint_red', (x1 - x0, 0.36, 0.012), ((x0 + x1) / 2, y0 + 0.16, 0.06), (-14, 0, 0))
        box('darkgray', (x1 - x0, 0.03, 0.03), ((x0 + x1) / 2, y0 + 0.34, 0.025))
        for k in range(int((x1 - x0) / 0.12)):
            x = x0 + 0.06 + k * 0.12
            pipe('silver', [(x, y0 + 0.30, 0.07), (x, y0 + 0.44, -0.02)], 0.006, 5)

    with part('Rotary'):
        cover(-wc, wc)
        for s in (1, -1):
            box('darkgray', (0.04, 0.10, 0.10), (s * wc, ay - 0.05, hz), bev=(0.01,))           # ちょうつがい
            pipe('darkgray', [(s * 0.35, ay - 0.15, hz + 0.05), (s * 0.70, ay - 0.10, hz + 0.45)], 0.03, 8)   # 翼を上げる油圧シリンダー
            cyl('silver', 0.018, 0.30, (s * 0.60, ay - 0.115, hz + 0.33), (0, s * 48, 0), 8)
        box('paint_red', (0.30, 0.30, 0.26), (0, ay - 0.10, 0.64), bev=(0.03,))                  # まん中のギヤボックス
        cyl('darkgray', 0.045, 0.08, (0, ay - 0.28, 0.64), (90, 0, 0), 14)
        for s in (1, -1):                                                                        # マストと三点リンク
            pipe('paint_red', [(s * 0.42, oy - 0.26, 0.42), (s * 0.20, oy - 0.20, 0.82), (0, oy - 0.26, 0.96)], 0.025, 8)
            pipe('paint_red', [(s * 0.42, oy - 0.26, 0.42), (s * 0.45, oy - 0.05, hz)], 0.025, 8)
            cyl_x('silver', 0.016, s * 0.39, s * 0.47, oy - 0.26, 0.42, 8)
            pipe('darkgray', [(s * 0.30, 0.48, 0.45), (s * 0.43, oy - 0.26, 0.42)], 0.022, 8)
        pipe('darkgray', [(0, 0.56, 1.00), (0, oy - 0.26, 0.96)], 0.022, 8)
        box('paint_red', (HARROW_C, 0.06, 0.05), (0, ay - 0.08, hz), bev=(0.01,))                 # 横のはり
        cyl('silver', 0.03, 0.10, (0, 0.92, 0.66), (90, 0, 0), 12)
        cyl('darkgray', 0.022, 0.40, (0, 0.88, 0.65), (93, 0, 0), 12)
        cyl('black', 0.045, 0.30, (0, 0.86, 0.65), (93, 0, 0), 14)
        implement_lamps((wc - 0.12, -wc + 0.12), ay + 0.10, az + R + 0.01)
    with part('Rotor'):
        tines(-wc + 0.02, wc - 0.02, 12)
    with part('Flap'):
        board(-wc, wc)
    for nm, s in (('WingL', 1), ('WingR', -1)):
        x0, x1 = sorted((s * wc, s * (wc + ww)))
        with part(nm):
            cover(x0, x1)
            board(x0, x1)
            box('paint_red', (x1 - x0, 0.06, 0.05), ((x0 + x1) / 2, ay - 0.08, hz), bev=(0.01,))
            xe = s * (wc + ww + 0.015)
            arc = [(0.27 * math.sin(math.radians(a)), az + 0.27 * math.cos(math.radians(a))) for a in range(-80, 81, 10)]
            prism('paint_red', [(p[0], p[1]) for p in arc] + [(0.27, 0.02), (-0.27, 0.02)], 0.012, T((xe, ay, 0), (90, 0, 90)))   # はしの板
            box('darkgray', (0.03, 0.55, 0.04), (xe, ay + 0.02, 0.03), bev=(0.01,))   # そり
        with part('Rotor' + nm[-1]):
            tines(x0 + 0.02, x1 - 0.02, 7)
    return Vector((0, oy, 0)), Vector((0, ay, az)), Vector((0, ay + R * math.sin(math.radians(68)), 0.06)), hz, wc


def build_harrow():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rot_o, rotor_o, flap_o, hz, wc = harrow()
    rot = finalize('Rotary', Matrix.Translation(rot_o))
    finalize('Rotor', Matrix.Translation(rotor_o), rot)
    finalize('Flap', Matrix.Translation(flap_o), rot)
    for nm, s in (('WingL', 1), ('WingR', -1)):
        w = finalize(nm, Matrix.Translation((s * wc, rotor_o.y - 0.05, hz)), rot)
        finalize('Rotor' + nm[-1], Matrix.Translation(rotor_o), w)
    assert not GROUPS, GROUPS.keys()
    return rot


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
            front_fender(s)
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
    wp.matrix_world = Matrix.Translation(w0) @ Matrix.Rotation(math.radians(WIPER_REST), 4, 'Y')   # ふだんは右へ寝かせておく
    rot = finalize('Rotary', Matrix.Translation(rot_o))
    finalize('Rotor', Matrix.Translation(rotor_o), rot)
    finalize('Flap', Matrix.Translation(flap_o), rot)
    assert not GROUPS, GROUPS.keys()
    return root, rot


SUN_ROT = 150.0
SKY_STRENGTH = 0.06


def bake_ao():
    """すき間や奥の暗さ（AO）を頂点色 'ao' に焼く。three.js には AO が無いので、これで影の感じを出す"""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 64 if FAST else 256
    w = bpy.data.worlds.new('ao')
    sc.world = w
    w.light_settings.distance = 0.45
    skip = {'Glass', 'MeterScreen', 'MonitorScreen', 'MirrorL', 'MirrorR', 'RoomMirror'}
    targets = [o for o in sc.objects if o.type == 'MESH' and o.name not in skip]
    for o in sc.objects:
        if o.name in skip:
            o.hide_render = True
    bpy.ops.object.select_all(action='DESELECT')
    for o in targets:
        a = o.data.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
        o.data.color_attributes.active_color = a
        o.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    small = {'SteeringWheel', 'PedalClutch', 'PedalBrakeL', 'PedalBrakeR', 'LeverJoy', 'LeverRange', 'LeverShuttle', 'LeverPtoSel', 'Wiper'}
    for o in targets:                                                          # 真っ黒にしない（0.3〜1。手で触る小さな部品は 0.65〜1）
        a = o.data.color_attributes['ao']
        v = np.empty(len(a.data) * 4, np.float32)
        a.data.foreach_get('color', v)
        v = v.reshape(-1, 4)
        lo = 0.65 if o.name in small else 0.3
        v[:, :3] = lo + (1 - lo) * np.clip(v[:, :3], 0, 1) ** 1.2
        v[:, 3] = 1
        a.data.foreach_set('color', v.ravel())
    for o in sc.objects:
        o.hide_render = False
    print('baked AO', len(targets), 'objects')


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
    sky = w.node_tree.nodes.new('ShaderNodeTexSky')                              # 晴れた昼の空（太陽つき）
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_elevation = math.radians(48)
    sky.sun_rotation = math.radians(SUN_ROT)
    w.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = SKY_STRENGTH
    tmp = []
    gm = bpy.data.materials.new('ground')
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin('#6b5a3e'), 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    bpy.ops.mesh.primitive_plane_add(size=600)
    g = bpy.context.active_object
    g.data.materials.append(gm)
    tmp.append(g)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    tmp.append(cam)

    def shot(fn, loc, target=None, rot=None, lens=None, fov_v=None, fov_h=None):
        cam.location = loc
        if target is not None:
            cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        else:
            cam.rotation_euler = rot
        cd = cam.data
        cd.clip_start = 0.02
        if fov_h:
            cd.sensor_fit = 'HORIZONTAL'
            cd.angle_x = math.radians(fov_h)
        elif fov_v:
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
        # 公式「快適性」の運転席の写真に近い所から（頭のうしろ・横の画角 88°・21°下向き。ペダルまで入る）
        'cockpit': dict(loc=(0.0, 0.62, 2.21), rot=Euler((math.radians(90 - 21), 0, math.pi)), fov_h=88),
    }
    extra = {   # 直すとき用（--shot=名前 で出す。preview_ には残さない）
        'front': dict(loc=(0.9, -4.6, 1.5), target=(0, -2.8, 1.0), lens=50),
        'rear': dict(loc=(-3.2, 4.6, 2.2), target=(0, 0.6, 1.0), lens=35),
        'side': dict(loc=(7.0, -0.8, 1.3), target=(0, -0.8, 1.1), lens=35),
        'top': dict(loc=(0.0, -0.3, 9.0), target=(0, -0.3, 0), lens=35),
        'left': dict(loc=(0.15, 0.40, 2.2), target=(0.4, 0.1, 1.6), lens=24),
        'photo': dict(loc=(-4.4, -5.6, 1.45), target=(0, -1.0, 1.25), lens=30),   # 右の前ななめ・人の目の高さ（実車の写真とくらべる）
        'seat': dict(loc=(0.42, -0.52, 2.20), target=(-0.20, 0.40, 1.55), lens=16),   # キャビンの中、左前から座席と右のコンソール
        'pillar': dict(loc=(0.15, 0.05, 2.05), target=(-0.62, 0.80, 2.0), lens=24),
        'cup': dict(loc=(0.05, -0.05, 2.0), target=(0.35, 0.42, 1.58), lens=30),
        'above': dict(loc=(0.0, 0.78, 2.42), target=(0.0, 0.0, 1.38), fov_h=96),   # 天井の下から見下ろす（公式の運転席の写真に近い向き）
        'right': dict(loc=(0.02, 0.66, 2.30), target=(-0.47, 0.22, 1.66), lens=20),   # 右の操作盤と横のパネル（上から）
        'shuttle': dict(loc=(0.12, -0.05, 2.12), target=(0.17, -0.42, 1.72), lens=26),   # ハンドルの左のリバーサレバーと前後の印
        'hitch': dict(loc=(1.9, 2.3, 1.55), target=(0.0, 0.95, 0.55), lens=40),   # うしろの連結まわり（下リンク・PTO の軸の覆い・爪）
    }
    only = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--shot=')]
    for k, v in ({k: v for k, v in {**shots, **extra}.items() if k in only} if only else shots).items():
        shot(f'preview_{k}.png' if k in shots else f'_debug_{k}.png', v['loc'], v.get('target'), v.get('rot'), v.get('lens'), v.get('fov_v'), v.get('fov_h'))
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)


def export():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_draco_mesh_compression_enable=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_image_format='AUTO')
    print('glb', os.path.getsize(OUT_GLB), 'bytes')


if __name__ == '__main__':
    if '--harrow' in sys.argv:                       # 代かき用のウイングハローだけを harrow_yt.glb に
        OUT_GLB = os.path.join(HERE, 'harrow_yt.glb')
        build_harrow()
        print('triangles', tri_count())
        bake_ao()
        export()
    else:
        build()
        print('triangles', tri_count())
        bake_ao()
        if RENDER:
            preview()
        export()

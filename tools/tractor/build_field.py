# トラクター運転ゲーム用の田んぼ（耕す前の切り株の田んぼ・耕したあとの土・畦・農道・用水路・排水路・まわりの田んぼ・電柱・遠くの山）
# - build_tractor.py と同じく bpy 5.2.2 で作り、field_tanbo.glb に書き出す（three.js r128・素の GLTFLoader 用。Draco なし）
# - 単位はメートル。原点＝耕す田んぼ（30m×50m）のまん中の地面。Blender 上で 前＝-Y・左＝+X・上＝+Z
#   （トラクターの原点を田んぼの地面に置けばそのまま走れる。three.js では X はそのまま、Blender の Y が -Z になる）
# - 土・草・砂利・コンクリートの絵は numpy で作る（つなぎ目なく並ぶ 1024px 以下。JPEG で埋めこむ）
# - 確認の絵 preview_field*.png は、トラクター（tractor_yt.glb）を置き、半分ほど耕した様子を Cycles で出す
# 使い方：python tools/tractor/build_field.py [--no-render | --fast]（先に build_tractor.py で tractor_yt.glb を作っておく）
import math
import os
import sys

import bpy  # bpy を先に読むと bmesh・mathutils が使える
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_tractor as bt  # noqa: E402  部品の関数（pipe・box・cyl・part・finalize など）を借りる

OUT_GLB = os.path.join(HERE, 'field_tanbo.glb')
TRACTOR_GLB = os.path.join(HERE, 'tractor_yt.glb')
TEXDIR = os.path.join(bpy.app.tempdir or '/tmp', 'tanbo_tex')
RENDER = '--no-render' not in sys.argv
FAST = '--fast' in sys.argv

# ---- 田んぼの寸法 ----
FW, FL = 30.0, 50.0               # 耕す田んぼ（X 幅 30m・Y 長さ 50m。18 アール）
HX, HY = FW / 2, FL / 2
LEVEE_H = 0.30                    # 畦の高さ
ROAD_Z = 0.50                     # 農道の高さ（田んぼの面より 50cm 高い）
ROAD_X0, ROAD_X1 = 16.7, 20.7     # 農道（東＝-X ではなく +X 側。幅 4m）
RAMP_Y0, RAMP_Y1 = -22.0, -18.0   # 田んぼへの進入路（農道から下りる）
EXT = 420.0                       # 地面の広さ（±）
GRID_EXT = 250.0                  # まわりの田んぼの畦を引く広さ（±）
PLOT_PITCH_Y = FL + 1.1           # 田んぼ＋畦の並び
PLOT_PITCH_X = FW + 1.1
T_UNTILLED, T_TILLED, T_GRASS, T_GRAVEL, T_CONC = 3.0, 2.0, 2.0, 1.0, 2.0   # 絵の 1 枚が何 m 四方か
ROW, HILL = 0.30, T_UNTILLED / 17  # 稲の条間 30cm・株間 約 17.6cm（切り株の並び。絵と切り株の置き方で同じ）


# ================================================================
#  絵（つなぎ目なく並ぶように作る）
# ================================================================
def fnoise(n, beta, seed):
    """1/f^beta のなめらかな雑音（周期的なのでつなぎ目が出ない）。平均 0・標準偏差 1"""
    rng = np.random.default_rng(seed)
    F = np.fft.fft2(rng.standard_normal((n, n)))
    fy, fx = np.fft.fftfreq(n)[:, None], np.fft.fftfreq(n)[None, :]
    f = np.hypot(fx, fy)
    f[0, 0] = 1
    F = F / f ** beta
    F[0, 0] = 0
    r = np.real(np.fft.ifft2(F)).astype(np.float32)
    return (r - r.mean()) / r.std()


def voronoi(n, k, seed):
    """周期的なボロノイ：いちばん近い点までの距離 f1・2 番目 f2（絵の幅を 1 とする）と、いちばん近い点の番号"""
    rng = np.random.default_rng(seed)
    pts = rng.random((k, 2)).astype(np.float32)
    yy, xx = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    f1 = np.full((n, n), 9.0, np.float32)
    f2 = np.full((n, n), 9.0, np.float32)
    idx = np.zeros((n, n), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px)
        dx = np.minimum(dx, 1 - dx)
        dy = np.abs(yy - py)
        dy = np.minimum(dy, 1 - dy)
        d = dx * dx + dy * dy
        m = d < f1
        f2 = np.where(m, f1, np.minimum(f2, d))
        idx = np.where(m, i, idx)
        f1 = np.where(m, d, f1)
    return np.sqrt(f1), np.sqrt(f2), idx


def hexc(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)


def lerp_col(c0, c1, t):
    return hexc(c0) * (1 - t[..., None]) + hexc(c1) * t[..., None]


def strokes(col, hgt, n, count, length, width, colors, seed, angle=None, bend=0.3, h=1.0):
    """藁や草の葉のような細い線をたくさん描く（はみ出した所は反対側に回す）"""
    rng = np.random.default_rng(seed)
    for _ in range(count):
        L = rng.uniform(*length)
        a = rng.uniform(0, math.pi) if angle is None else rng.normal(*angle)
        cx, cy = rng.uniform(0, n, 2)
        w = rng.uniform(*width)
        c = hexc(colors[rng.integers(len(colors))]) * rng.uniform(0.85, 1.1)
        t = np.linspace(-0.5, 0.5, max(int(L * 1.5), 2))
        b = bend * L * (t ** 2 - 0.25) * rng.uniform(-1, 1)
        px = cx + np.cos(a) * t * L - np.sin(a) * b
        py = cy + np.sin(a) * t * L + np.cos(a) * b
        r = int(math.ceil(w / 2))
        for ox in range(-r, r + 1):
            for oy in range(-r, r + 1):
                if ox * ox + oy * oy > (w / 2) ** 2 + 0.25:
                    continue
                X = (px.astype(int) + ox) % n
                Y = (py.astype(int) + oy) % n
                col[Y, X] = c
                hgt[Y, X] = np.maximum(hgt[Y, X], h * (1 - (ox * ox + oy * oy) / (r * r + 1)))


def normal_from(h, strength):
    """高さ → 法線の絵（OpenGL 向き：+Y が上）"""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nz = np.ones_like(h)
    L = np.sqrt(gx * gx + gy * gy + 1)
    return np.stack([-gx / L, -gy / L, nz / L], -1) * 0.5 + 0.5


def tex_untilled(n=1024):
    """耕す前：乾きかけの灰色がかった土・ひび・切り株の列・散らばった藁"""
    lo, hi = fnoise(n, 1.4, 1), fnoise(n, 0.9, 2)
    damp = np.clip(fnoise(n, 1.8, 3) * 0.5 + 0.5, 0, 1)
    col = lerp_col('#7a6d5a', '#94866e', np.clip(0.5 + 0.18 * lo + 0.08 * hi, 0, 1))
    col *= (1 - 0.18 * damp)[..., None]
    hgt = 0.15 * lo + 0.05 * hi
    f1, f2, _ = voronoi(n, 70, 4)                                     # 乾いてできたひび
    crack = np.clip(1 - (f2 - f1) * n / 3.0, 0, 1) * (np.clip(lo, -1, 2) * 0.3 + 0.7)
    col *= (1 - 0.35 * crack)[..., None]
    hgt -= 0.6 * crack
    strokes(col, hgt, n, 900, (15, 80), (1.5, 3.0), ('#c9b27a', '#b49c63', '#d8c894', '#8f7c52'), 5, h=0.8)   # 藁
    rng = np.random.default_rng(6)
    px_m = n / T_UNTILLED
    nr, nh = int(round(T_UNTILLED / ROW)), int(round(T_UNTILLED / HILL))
    yy, xx = np.mgrid[0:n, 0:n]
    for i in range(nr):                                               # 切り株の根元（列は V 方向＝田んぼの長い向き）
        for j in range(nh):
            cx = ((i + 0.5) * ROW + rng.normal(0, 0.012)) * px_m
            cy = ((j + 0.5) * HILL + rng.normal(0, 0.012)) * px_m
            r0 = 0.045 * px_m
            x0, y0 = int(cx - r0 * 1.6), int(cy - r0 * 1.6)
            X = (np.arange(x0, x0 + int(r0 * 3.2)) % n)
            Y = (np.arange(y0, y0 + int(r0 * 3.2)) % n)
            gx, gy = np.meshgrid(np.arange(x0, x0 + int(r0 * 3.2)), np.arange(y0, y0 + int(r0 * 3.2)))
            d = np.hypot(gx - cx, gy - cy) / r0
            m = np.clip(1.2 - d, 0, 1)
            col[np.ix_(Y, X)] *= (1 - 0.25 * m)[..., None]           # 株のまわりは湿って暗い
            for k in range(rng.integers(9, 15)):                     # 刈った茎の切り口
                a, rr = rng.uniform(0, 2 * math.pi), rng.uniform(0, 0.022) * px_m
                sx, sy = int(cx + math.cos(a) * rr), int(cy + math.sin(a) * rr)
                c = hexc('#d9c58c') * rng.uniform(0.8, 1.05)
                col[np.ix_(np.arange(sy - 2, sy + 2) % n, np.arange(sx - 2, sx + 2) % n)] = c
                hgt[np.ix_(np.arange(sy - 2, sy + 2) % n, np.arange(sx - 2, sx + 2) % n)] = 1.2
    return np.clip(col, 0, 1), normal_from(hgt, 3.0)


def tex_tilled(n=1024):
    """耕したあと：湿った濃い茶色の土のかたまり（上は少し乾いて明るい）・混ざった藁"""
    f1, _, idx = voronoi(n, 700, 11)
    rng = np.random.default_rng(12)
    ch = rng.uniform(0.3, 1.0, 700).astype(np.float32)[idx]
    cs = rng.uniform(0.6, 1.4, 700).astype(np.float32)[idx]
    fine = fnoise(n, 0.7, 13)
    mid = fnoise(n, 1.3, 14)
    lump = ch * np.clip(1 - (f1 * n / (24 * cs)) ** 2, 0, 1)            # 土くれ
    hgt = 0.9 * lump + 0.12 * fine + 0.25 * mid
    t = np.clip(0.35 + 0.5 * lump + 0.08 * fine + 0.1 * mid, 0, 1)
    col = lerp_col('#30231a', '#6a543d', t)
    col *= (1 - 0.3 * np.clip(-mid, 0, 1))[..., None]
    strokes(col, hgt, n, 260, (10, 45), (1.5, 2.5), ('#9a8456', '#8a764c', '#b09a66'), 15, h=0.9)   # 藁のかけら
    return np.clip(col, 0, 1), normal_from(hgt, 5.0)


def tex_grass(n=1024):
    """畦・土手の草（春の若草に枯れ草が混ざる）"""
    lo = fnoise(n, 1.5, 21)
    dry = np.clip(fnoise(n, 1.7, 22) * 0.6 + 0.1, 0, 1)
    col = lerp_col('#4c6b2c', '#76913f', np.clip(0.5 + 0.25 * lo, 0, 1))
    col = col * (1 - dry[..., None]) + hexc('#a39a63') * dry[..., None]
    hgt = 0.2 * lo
    strokes(col, hgt, n, 6000, (10, 34), (1.2, 2.4), ('#5f8a32', '#7da540', '#3f5f24', '#9aa860', '#b5ad78'), 23, angle=(math.pi / 2, 0.5), bend=0.5)
    return np.clip(col, 0, 1), normal_from(hgt, 2.5)


def tex_gravel(n=512):
    f1, f2, idx = voronoi(n, 420, 31)
    rng = np.random.default_rng(32)
    tone = rng.uniform(0.75, 1.15, 420).astype(np.float32)[idx]
    edge = np.clip(1 - (f2 - f1) * n / 2.5, 0, 1)
    col = lerp_col('#7d786e', '#a8a294', np.clip(0.5 + 0.3 * fnoise(n, 1.2, 33), 0, 1)) * tone[..., None]
    col *= (1 - 0.45 * edge)[..., None]
    hgt = np.clip(1 - f1 * n / 14, 0, 1) - edge
    return np.clip(col, 0, 1), normal_from(hgt, 2.0)


def tex_concrete(n=512):
    lo, hi = fnoise(n, 1.6, 41), fnoise(n, 0.6, 42)
    col = lerp_col('#9a9890', '#b8b6ad', np.clip(0.5 + 0.2 * lo + 0.08 * hi, 0, 1))
    col *= (1 - 0.25 * np.clip(fnoise(n, 1.9, 43) * 0.5, 0, 1))[..., None]
    joint = (np.abs((np.arange(n)[None, :] / n) - 0.5) < 0.003)          # 2m ごとの目地
    col[np.broadcast_to(joint, (n, n))] *= 0.6
    return np.clip(col, 0, 1), normal_from(0.1 * hi - 1.0 * joint, 2.0)


def tex_tuft(n=512):
    """草むらの板（アルファで切り抜く）"""
    col = np.zeros((n, n, 4), np.float32)
    rng = np.random.default_rng(51)
    for _ in range(55):
        x0 = n / 2 + rng.normal(0, n * 0.12)
        lean = rng.normal(0, n * 0.22)
        top = rng.uniform(0.45, 0.97) * n
        w0 = rng.uniform(5, 11)
        c0 = hexc(['#4f7a2a', '#6a9636', '#87a84a', '#a6a565', '#3d6022'][rng.integers(5)])
        for y in range(int(top)):
            t = y / top
            xc = x0 + lean * t ** 1.8
            hw = w0 * (1 - t) ** 0.8 / 2 + 0.4
            xa, xb = int(max(xc - hw, 0)), int(min(xc + hw + 1, n))
            if xb > xa:
                col[y, xa:xb, :3] = c0 * (0.65 + 0.45 * t)
                col[y, xa:xb, 3] = 1
    return col


def save_img(name, arr, fmt='JPEG'):
    """numpy の絵を JPEG／PNG のファイルにして読みこみ、glb に埋めこめるよう pack する"""
    os.makedirs(TEXDIR, exist_ok=True)
    h, w = arr.shape[:2]
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :arr.shape[2]] = arr
    im = bpy.data.images.new(name, w, h, alpha=(fmt == 'PNG'))
    im.pixels.foreach_set(rgba.ravel())
    path = os.path.join(TEXDIR, name + ('.jpg' if fmt == 'JPEG' else '.png'))
    im.filepath_raw = path
    im.file_format = fmt
    sc = bpy.context.scene
    sc.render.image_settings.quality = 85
    im.save()
    im.pack()
    return im


# ================================================================
#  材質
# ================================================================
def mat_tex(name, col_img, nrm_img=None, rough=0.9, nstr=1.0, clip=False, macro=False):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Specular IOR Level'].default_value = 0.3
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = col_img
    out = t.outputs['Color']
    if macro:                                                          # 頂点色 'macro'（ムラ・湿り）をかける
        va = nt.nodes.new('ShaderNodeVertexColor')
        va.layer_name = 'macro'
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        nt.links.new(out, mix.inputs['A'])
        nt.links.new(va.outputs['Color'], mix.inputs['B'])
        out = mix.outputs['Result']
    nt.links.new(out, bs.inputs['Base Color'])
    if nrm_img is not None:
        nrm_img.colorspace_settings.name = 'Non-Color'
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = nrm_img
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = nstr
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    if clip:
        mt = nt.nodes.new('ShaderNodeMath')
        mt.operation = 'ROUND'
        nt.links.new(t.outputs['Alpha'], mt.inputs[0])
        nt.links.new(mt.outputs[0], bs.inputs['Alpha'])
    return m


def mat_flat(name, hexcol, rough=0.8, metal=0.0, alpha=None):
    m = bpy.data.materials.new(name)
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*bt.lin(hexcol), 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if alpha is not None:
        bs.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def make_materials():
    c, n = tex_untilled()
    mat_tex('soil_untilled', save_img('soil_untilled', c), save_img('soil_untilled_n', n), 0.92, 1.0, macro=True)
    c, n = tex_tilled()
    mat_tex('soil_tilled', save_img('soil_tilled', c), save_img('soil_tilled_n', n), 0.95, 1.8, macro=True)
    c, n = tex_grass()
    mat_tex('grass', save_img('grass', c), save_img('grass_n', n[::2, ::2]), 0.9, 0.8, macro=True)   # 草の凹凸は 512px で足りる
    c, n = tex_gravel()
    mat_tex('gravel', save_img('gravel', c), save_img('gravel_n', n), 0.85, 1.0, macro=True)
    c, n = tex_concrete()
    mat_tex('concrete', save_img('concrete', c), save_img('concrete_n', n), 0.85, 0.6)
    mat_tex('grass_tuft', save_img('grass_tuft', tex_tuft(), 'PNG'), None, 0.85, clip=True)
    mat_flat('water', '#3c4a42', 0.04, alpha=0.78)
    mat_flat('stubble', '#a28f63', 0.85)
    mat_flat('pole', '#a4a49c', 0.75)
    mat_flat('wire', '#1c1c1c', 0.5)
    mat_flat('pvc', '#7f8f99', 0.4)
    mat_flat('wood', '#6d5338', 0.85)
    mat_flat('white_insulator', '#e8e6e0', 0.3)
    mat_flat('concrete_box', '#a7a59c', 0.85)
    mat_flat('tree', '#3f5a30', 0.9)
    mat_flat('cedar', '#2a3d27', 0.9)
    mat_flat('trunk', '#4a3a2c', 0.9)
    mat_flat('hill', '#5c7564', 1.0)
    mat_flat('hill_far', '#8395a0', 1.0)


# ================================================================
#  形を作る道具（UV は「世界の座標 ÷ 絵の大きさ」。three.js でも同じ式で後から帯を足せる）
# ================================================================
def new_obj(bm, mat, smooth=80, face_up=True):
    """UV 付きの bmesh を部品にする。face_up なら下を向いた面を上へ返す（地面・畦は上が表）"""
    if face_up:
        bm.normal_update()
        for f in bm.faces:
            if f.normal.z < -0.01:
                f.normal_flip()
    return bt._obj(bm, mat, smooth=smooth, recalc=False)


def grid(mat, x0, x1, y0, y1, step, tile, zf=None):
    """地面の格子（上向き）。zf(x, y) で高さ"""
    nx, ny = max(1, round((x1 - x0) / step)), max(1, round((y1 - y0) / step))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    vs = [[bm.verts.new((x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny,
                         zf(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny) if zf else 0.0))
           for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.x / tile, lp.vert.co.y / tile)
    return new_obj(bm, mat)


def sweep(mat, path, prof, tile, wob=0.0, seed=0, closed=False):
    """2D の道すじ path［(x, y)…］にそって、横断面 prof［(d, z)…］（d は進む向きの左が＋）を引く"""
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rows, svals = [], []
    s = 0.0
    for k, (x, y) in enumerate(path):
        if k:
            s += math.hypot(x - path[k - 1][0], y - path[k - 1][1])
        a = path[min(k + 1, len(path) - 1)]
        b = path[max(k - 1, 0)]
        tx, ty = a[0] - b[0], a[1] - b[1]
        L = math.hypot(tx, ty)
        nx, ny = -ty / L, tx / L
        w = 1 + rng.normal(0, wob) if wob else 1
        dz = rng.normal(0, wob * 0.15) if wob else 0
        row = []
        for i, (d, z) in enumerate(prof):
            edge = i in (0, len(prof) - 1)
            row.append(bm.verts.new((x + nx * d * (1 if edge else w), y + ny * d * (1 if edge else w), z + (0 if edge else dz))))
        rows.append(row)
        svals.append(s)
    cross = [0.0]
    for (d0, z0), (d1, z1) in zip(prof, prof[1:]):
        cross.append(cross[-1] + math.hypot(d1 - d0, z1 - z0))
    P = len(prof)
    for k in range(len(rows) - 1):
        A, B = rows[k], rows[k + 1]
        for i in range(P if closed else P - 1):
            i2 = (i + 1) % P
            f = bm.faces.new((A[i], B[i], B[i2], A[i2]))
            for lp, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i2), (k, i2))):
                cv = cross[ii] if not (closed and ii == 0 and i2 == 0) else cross[-1]
                lp[uv].uv = (svals[kk] / tile, cv / tile)
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(bm, mat, smooth=50, face_up=not closed)


def line(p0, p1, step):
    n = max(1, round(math.dist(p0, p1) / step))
    return [(p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n) for i in range(n + 1)]


def levee_prof(z_in=0.0, z_out=0.0, h=LEVEE_H):
    """畦の横断面（左＝内側の田んぼ、右＝外側）。下の幅 1.1m・上の幅 0.45m"""
    return [(0.55, z_in), (0.22, h), (-0.22, h), (-0.55, z_out)]


def add_macro(ob, fn):
    """頂点色 'macro'（地の色にかける明るさ）を fn(x, y) から入れる"""
    me = ob.data
    a = me.color_attributes.new('macro', 'FLOAT_COLOR', 'POINT')
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    mw = ob.matrix_world
    v = np.array([fn(*(mw @ Vector(p)).xy) for p in co], np.float32).reshape(-1, 3)
    out = np.ones((len(co), 4), np.float32)
    out[:, :3] = np.clip(v, 0, 1.5)
    a.data.foreach_set('color', out.ravel())


# ================================================================
#  田んぼとまわり
# ================================================================
def low_noise(x, y, s=12.0):
    """場所で変わるゆるいムラ（-1〜1 くらい）"""
    return (math.sin(x / s * 1.7 + 0.3) * math.sin(y / s * 1.3 - 0.7) + 0.5 * math.sin((x + 2 * y) / s * 2.9)
            + 0.3 * math.sin((3 * x - y) / s * 4.3 + 1.0)) / 1.8


def field_height(x, y):
    """田んぼの面のわずかな凸凹（±2cm）"""
    return 0.012 * low_noise(x, y, 6.0) + 0.006 * math.sin(x * 2.3 + y * 1.1)


def untilled_macro(x, y):
    """耕す前の土のムラ：畦ぎわと進入路のそば（わだち）は湿って暗い"""
    v = 0.86 + 0.12 * low_noise(x, y)
    edge = min(HX - abs(x), HY - abs(y))
    v *= 1 - 0.18 * max(0.0, 1 - edge / 2.5)
    for rx in (12.6, 11.2):                                            # 進入路から入った車のわだち
        if abs(x - rx) < 0.3 and y < -8:
            v *= 0.8
    v = max(0.5, v)
    return (v, v * 0.98, v * 0.95)


def build_field():
    with bt.part('Field'):
        grid('soil_untilled', -HX, HX, -HY, HY, 1.0, T_UNTILLED, field_height)
    with bt.part('FieldTilled'):
        grid('soil_tilled', -HX, HX, -HY, HY, 1.0, T_TILLED, lambda x, y: field_height(x, y) + 0.03)
    with bt.part('Levees'):
        # 北・南の畦（となりの田んぼと共有）
        for sy in (1, -1):
            y = sy * (HY + 0.55)
            path = line((-HX - 0.6, y), (HX + 0.4, y), 2.0) if sy > 0 else line((HX + 0.4, y), (-HX - 0.6, y), 2.0)
            sweep('grass', path, levee_prof(), T_GRASS, wob=0.04, seed=1 + sy)
        # 西：畦・排水路の土手・となりの田んぼの畦（ひとつの横断面で全長）
        west = [(0.0, 0.0), (-0.33, LEVEE_H), (-0.77, LEVEE_H), (-1.0, 0.12), (-1.35, -0.45), (-1.85, -0.45), (-2.2, 0.05),
                (-2.45, LEVEE_H), (-2.85, LEVEE_H), (-3.3, 0.0)]
        sweep('grass', line((-HX, EXT), (-HX, -EXT), 4.0), west, T_GRASS, wob=0.03, seed=5)
        # 東：畦（進入路の所は切れる）
        east = [(0.0, 0.0), (0.33, LEVEE_H), (0.77, LEVEE_H), (0.85, 0.33)]
        for y0, y1 in ((-EXT, RAMP_Y0), (RAMP_Y1, EXT)):
            sweep('grass', line((HX, y0), (HX, y1), 4.0), [(-d, z) for d, z in east], T_GRASS, wob=0.03, seed=7)
        # 農道の両側の土手（用水路側・東の田んぼ側）
        sweep('grass', line((HX, -EXT), (HX, EXT), 8.0), [(-1.45, 0.35), (-1.7, ROAD_Z)], T_GRASS)
        sweep('grass', line((HX, -EXT), (HX, EXT), 8.0),
              [(-(ROAD_X1 - HX), ROAD_Z), (-6.4, 0.05), (-6.75, LEVEE_H), (-7.1, LEVEE_H), (-7.5, 0.0)], T_GRASS)
    with bt.part('Road'):
        # 砂利の農道（まん中が少し高い）と進入路
        sweep('gravel', line((ROAD_X0 + 2, EXT), (ROAD_X0 + 2, -EXT), 4.0), [(-2.0, ROAD_Z), (0.0, ROAD_Z + 0.03), (2.0, ROAD_Z)], T_GRAVEL)
        ramp = [(ROAD_X0 + 0.2, ROAD_Z), (HX + 0.85, ROAD_Z - 0.02), (HX + 0.3, 0.36), (HX - 3.0, 0.0)]
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new('UVMap')
        vs = [[bm.verts.new((x, y, z)) for (x, z) in ramp] for y in (RAMP_Y0, (RAMP_Y0 + RAMP_Y1) / 2, RAMP_Y1)]
        for j in range(2):
            for i in range(len(ramp) - 1):
                f = bm.faces.new((vs[j][i + 1], vs[j][i], vs[j + 1][i], vs[j + 1][i + 1]))
                for lp in f.loops:
                    lp[uvl].uv = (lp.vert.co.x / T_GRAVEL, lp.vert.co.y / T_GRAVEL)
        new_obj(bm, 'gravel', smooth=30)
        for y, sgn in ((RAMP_Y0, -1), (RAMP_Y1, 1)):                      # 進入路の横の土手
            bm = bmesh.new()
            uvl = bm.loops.layers.uv.new('UVMap')
            top = [bm.verts.new((x, y, z)) for (x, z) in ramp]
            bot = [bm.verts.new((x, y + sgn * 0.9, 0.0 if x < HX + 0.1 else 0.3)) for (x, z) in ramp]
            for i in range(len(ramp) - 1):
                f = bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i]) if sgn > 0 else (top[i + 1], top[i], bot[i], bot[i + 1]))
                for lp in f.loops:
                    lp[uvl].uv = (lp.vert.co.x / T_GRASS, lp.vert.co.z / T_GRASS + lp.vert.co.y / T_GRASS)
            new_obj(bm, 'grass', smooth=30)
        bt.box('concrete_box', (0.9, RAMP_Y1 - RAMP_Y0 + 0.4, 0.12), (HX + 1.15, (RAMP_Y0 + RAMP_Y1) / 2, ROAD_Z - 0.08))   # 用水路の上のふた
    with bt.part('Canal'):
        # コンクリートの U 字の用水路（農道と畦のあいだ）と水
        cx0 = HX + 0.85
        u = [(0.0, 0.35), (0.0, -0.2), (0.6, -0.2), (0.6, 0.35), (0.52, 0.35), (0.52, -0.12), (0.08, -0.12), (0.08, 0.35)]
        sweep('concrete', line((cx0, -EXT), (cx0, EXT), 6.0), [(-d, z) for d, z in u], T_CONC, closed=True)
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in ((cx0 + 0.08, -EXT, 0.12), (cx0 + 0.52, -EXT, 0.12), (cx0 + 0.52, EXT, 0.12), (cx0 + 0.08, EXT, 0.12))]
        bm.faces.new(vs)
        new_obj(bm, 'water', smooth=None)
        # 排水路の水
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in ((-HX - 1.45, -EXT, -0.36), (-HX - 1.75, -EXT, -0.36), (-HX - 1.75, EXT, -0.36), (-HX - 1.45, EXT, -0.36))][::-1]
        bm.faces.new(vs)
        new_obj(bm, 'water', smooth=None)
    with bt.part('Facilities'):
        # 水口（用水路から田んぼへ水を入れる所）：コンクリートの升・塩ビ管・止め板
        y = 18.0
        bt.box('concrete_box', (0.5, 0.5, 0.45), (HX + 0.62, y, 0.18), bev=(0.02,))
        bt.pipe('pvc', [(HX + 0.75, y, 0.12), (HX - 0.15, y, 0.10), (HX - 0.45, y, 0.06)], 0.075, 14)
        bt.box('wood', (0.04, 0.42, 0.30), (HX + 0.88, y, 0.25))
        # 落水口（西の畦。排水路へ落とす升と板）
        y = -20.0
        bt.box('concrete_box', (0.55, 0.45, 0.62), (-HX - 0.55, y, 0.02), bev=(0.02,))
        for k in range(3):
            bt.box('wood', (0.03, 0.40, 0.09), (-HX - 0.30, y, 0.06 + k * 0.095))
        bt.pipe('pvc', [(-HX - 0.75, y, -0.15), (-HX - 1.35, y, -0.30)], 0.08, 14)
        # 水たまり（わだちの低い所）
        rng = np.random.default_rng(71)
        for cx, cy, r in ((12.6, -14.0, 0.5), (11.2, -11.5, 0.35), (12.5, -9.0, 0.3), (-13.8, 22.5, 0.7), (-14.2, -23.6, 0.6)):
            bm = bmesh.new()
            pts = []
            for k in range(14):
                a = 2 * math.pi * k / 14
                rr = r * (1 + 0.3 * rng.normal())
                pts.append(bm.verts.new((cx + rr * math.cos(a) * 0.6, cy + rr * math.sin(a) * 1.6, 0.012)))
            bm.faces.new(pts)
            new_obj(bm, 'water', smooth=None)


def plots_x(sign):
    """東（+）・西（-）のとなりの田んぼの X の範囲"""
    out = []
    x = (HX + 7.5) if sign > 0 else (-HX - 3.3)
    while abs(x) < GRID_EXT:
        x1 = x + sign * FW
        out.append((min(x, x1), max(x, x1)))
        x = x1 + sign * 1.1
    return out


def build_surroundings():
    with bt.part('Neighbors'):
        mac = lambda x, y: (0.85 + 0.12 * low_noise(x, y, 25.0),) * 3
        # 地面（耕す田んぼ・道・水路の所はあける）
        regions = [(-EXT, -HX - 3.3, -EXT, EXT), (HX + 7.5, EXT, -EXT, EXT), (-HX, HX, HY + 1.1, EXT), (-HX, HX, -EXT, -HY - 1.1)]
        for x0, x1, y0, y1 in regions:
            grid('soil_untilled', x0, x1, y0, y1, 10.0, T_UNTILLED)
        # となりの田んぼの畦
        for sgn in (1, -1):
            xs = plots_x(sgn)
            for (a, b), (c, d) in zip(xs, xs[1:]):                       # 南北の畦
                xm = (b + c) / 2 if sgn > 0 else (a + d) / 2
                sweep('grass', line((xm, -GRID_EXT), (xm, GRID_EXT), 10.0), levee_prof(), T_GRASS)
            x_lo, x_hi = (xs[0][0], xs[-1][1]) if sgn > 0 else (xs[-1][0], xs[0][1])
            for k in range(-5, 6):                                         # 東西の畦
                y = (HY + 0.55) + k * PLOT_PITCH_Y if k >= 0 else -(HY + 0.55) + (k + 1) * PLOT_PITCH_Y
                sweep('grass', line((x_lo, y), (x_hi, y), 10.0), levee_prof(), T_GRASS)
        for k in range(1, 5):                                               # まん中の列（耕す田んぼの南北）
            for sy in (1, -1):
                y = sy * ((HY + 0.55) + k * PLOT_PITCH_Y)
                sweep('grass', line((-HX - 0.4, y), (HX + 0.4, y), 3.0), levee_prof(), T_GRASS)
    with bt.part('NeighborsTilled'):                                        # 何枚かは耕してある・水を張ってある
        for x0, x1, y0, y1 in ((-HX - 3.3 - FW, -HX - 3.3, -HY, HY), (-HX, HX, HY + 1.1, HY + 1.1 + FL),
                               (HX + 7.5 + FW + 1.1, HX + 7.5 + 2 * FW + 1.1, HY + 1.1, HY + 1.1 + FL)):
            grid('soil_tilled', x0, x1, y0, y1, 5.0, T_TILLED, lambda x, y: 0.03)
        for x0, x1, y0, y1 in ((HX + 7.5, HX + 7.5 + FW, -HY, HY), (-HX - 3.3 - 2 * FW - 1.1, -HX - 3.3 - FW - 1.1, HY + 1.1, HY + 1.1 + FL)):
            grid('water', x0, x1, y0, y1, 10.0, 10.0, lambda x, y: 0.06)
    with bt.part('Poles'):
        # 電柱（農道の東の肩。35m ごと）と電線
        tops = []
        for k in range(-11, 12):
            x, y = ROAD_X1 + 0.35, k * 35.0 + 6.0
            z0 = ROAD_Z - 0.05
            bt.cyl('pole', 0.15, 10.0, (x, y, z0 + 5.0), n=10, r2=0.11, smooth=60)
            bt.box('pole', (1.6, 0.10, 0.10), (x, y, z0 + 9.4))
            for dx in (-0.65, 0.0, 0.65):
                bt.cyl('white_insulator', 0.035, 0.12, (x + dx, y, z0 + 9.52), n=8)
            tops.append((x, y, z0 + 9.58))
        for (x0, y0, z0), (x1, y1, z1) in zip(tops, tops[1:]):
            for dx in (-0.65, 0.0, 0.65):
                pts = [(x0 + dx, y0 + (y1 - y0) * t, z0 - 0.45 * 4 * t * (1 - t)) for t in np.linspace(0, 1, 9)]
                bt.pipe('wire', pts, 0.008, 4, cap=False, smooth=None)
    with bt.part('Trees'):
        rng = np.random.default_rng(81)
        spots = [(-95, 140), (-60, 175), (110, 120), (150, 60), (-170, -40), (-130, -150), (90, -170), (200, -110), (-210, 70), (40, 230), (-30, -240)]
        for cx, cy in spots:
            cedar = rng.random() < 0.5
            for k in range(rng.integers(5, 12)):
                x, y = cx + rng.normal(0, 8), cy + rng.normal(0, 8)
                h = rng.uniform(12, 22) if cedar else rng.uniform(7, 13)
                bt.cyl('trunk', 0.22, h * 0.5, (x, y, h * 0.25), n=6, smooth=None)
                if cedar:                                                         # 杉（細長い円すい）
                    bt.cyl('cedar', h * 0.17, h * 0.8, (x, y, h * 0.58), n=8, r2=0.0, smooth=None)
                else:                                                             # 広葉樹（いくつかの丸いかたまり）
                    for m in range(4):
                        bt.sph('tree', h * rng.uniform(0.18, 0.28), (x + rng.normal(0, h * 0.12), y + rng.normal(0, h * 0.12), h * rng.uniform(0.5, 0.8)),
                               (1, 1, 0.85), n=7)
    with bt.part('Hills'):
        # 遠くの山並み（二重。外はかすんだ色）
        rng = np.random.default_rng(91)
        for R, H, mat in ((520.0, 55.0, 'hill'), (690.0, 130.0, 'hill_far')):
            n = 240
            a = np.linspace(0, 2 * math.pi, n, endpoint=False)
            hs = np.zeros(n)
            for k, amp in ((3, 0.5), (7, 0.3), (17, 0.15), (41, 0.07)):      # 大きなうねりに小さな峰を重ねる
                hs += amp * np.sin(k * a + rng.uniform(0, 6.3)) + amp * 0.6 * np.sin((k + 1) * a + rng.uniform(0, 6.3))
            hs = np.clip(0.55 + hs, 0.08, 1.4)
            bm = bmesh.new()
            rows = []
            for f in (0.0, 0.55, 1.0):                                        # すそ・中腹・峰
                rows.append([bm.verts.new(((R + H * hs[i] * 2.2 * f) * math.cos(a[i]), (R + H * hs[i] * 2.2 * f) * math.sin(a[i]),
                                           -3.0 + (H * hs[i] + 3.0) * (f ** 0.7 if f < 1 else 1.0)))
                             for i in range(n)])
            for r0, r1 in zip(rows, rows[1:]):
                for i in range(n):
                    j = (i + 1) % n
                    bm.faces.new((r0[i], r1[i], r1[j], r0[j]))
            new_obj(bm, mat, smooth=50, face_up=False)


def grass_tufts():
    """畦と土手に草むら（十字の板）"""
    with bt.part('GrassTufts'):
        rng = np.random.default_rng(101)
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new('UVMap')
        spots = []
        for k in range(1400):                                        # 耕す田んぼのまわりの畦の上と斜面
            side = rng.integers(4)
            t = rng.uniform(-1, 1)
            off = rng.uniform(0.0, 0.5)
            if side < 2:
                x, y = t * (HX + 0.3), (1 if side else -1) * (HY + 0.25 + off)
            else:
                x, y = (1 if side == 2 else -1) * (HX + 0.25 + off), t * (HY + 0.3)
                if side == 2 and RAMP_Y0 - 0.5 < y < RAMP_Y1 + 0.5:
                    continue
            d = 0.25 + off                                           # 田んぼのふちからの距離 → 畦の高さ
            z = LEVEE_H * min(1.0, d / 0.33, max(0.0, (1.1 - d) / 0.33))
            spots.append((x, y, z - 0.02))
        for k in range(700):                                          # 農道の肩
            y = rng.uniform(-70, 70)
            x = rng.choice([ROAD_X0 - 0.12, ROAD_X1 + 0.2]) + rng.normal(0, 0.06)
            spots.append((x, y, ROAD_Z - 0.06))
        for x, y, z in spots:
            s = rng.uniform(0.18, 0.42)
            a = rng.uniform(0, math.pi)
            for b in (a, a + math.pi / 2):
                dx, dy = math.cos(b) * s / 2, math.sin(b) * s / 2
                q = [bm.verts.new(p) for p in ((x - dx, y - dy, z), (x + dx, y + dy, z), (x + dx, y + dy, z + s), (x - dx, y - dy, z + s))]
                f = bm.faces.new(q)
                for lp, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                    lp[uv].uv = c
        new_obj(bm, 'grass_tuft', smooth=None)


def stubble_mesh():
    """切り株ひと株（刈ったあとの茎 9〜10 本）：頂点と面"""
    rng = np.random.default_rng(111)
    V, F = [], []
    for k in range(10):
        a, rr = rng.uniform(0, 2 * math.pi), rng.uniform(0, 0.022)
        cx, cy = rr * math.cos(a), rr * math.sin(a)
        h = rng.uniform(0.06, 0.12)
        lx, ly = rng.normal(0, 0.015) + cx * 0.8, rng.normal(0, 0.015) + cy * 0.8   # 外へ少し開く
        r = 0.0028
        b = len(V)
        for zz, ox, oy in ((0.0, 0, 0), (h, lx, ly)):
            for j in range(4):
                t = 2 * math.pi * j / 4
                V.append((cx + ox + r * math.cos(t), cy + oy + r * math.sin(t), zz))
        for j in range(4):
            j2 = (j + 1) % 4
            F.append((b + j, b + j2, b + 4 + j2, b + 4 + j))
        F.append((b + 4, b + 5, b + 6, b + 7))
    return np.array(V, np.float32), F


def stubble_template():
    V, F = stubble_mesh()
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in V]
    for f in F:
        bm.faces.new([vs[i] for i in f])
    with bt.part('StubbleHill'):
        new_obj(bm, 'stubble', smooth=None)


# ================================================================
#  確認の絵（トラクターを置き、半分ほど耕した様子）
# ================================================================
TRACTOR_AT = Vector((3.1, -2.0, 0.0))     # 後輪車軸の真下。-Y（前）へ進みながら耕している
TILLED = [(-HX + 0.5, 2.0, -HY + 4.0, HY - 4.0), (2.0, 4.2, TRACTOR_AT.y + 1.45, HY - 4.0)]   # 耕し終わった所（両はしの枕地は残す）


def tilled_here(x, y, rag=0.0):
    return any(x0 - rag < x < x1 + rag and y0 - rag < y < y1 + rag for x0, x1, y0, y1 in TILLED)


def preview_scene():
    tmp = []
    sc = bpy.context.scene
    # 耕した所（見本）：ふちを少しぎざぎざに
    with bt.part('_tilled'):
        for x0, x1, y0, y1 in TILLED:
            grid('soil_tilled', x0, x1, y0, y1, 0.25, T_TILLED,
                 lambda x, y: field_height(x, y) + 0.035 + 0.012 * math.sin(x * 9.1 + y * 3.3) * math.sin(y * 7.7))
    t = bt.finalize('_tilled', Matrix())
    add_macro(t, lambda x, y: (0.9 + 0.08 * low_noise(x, y, 4.0),) * 3)
    tmp.append(t)
    # 切り株（耕していない所）
    V, F = stubble_mesh()
    rng = np.random.default_rng(5)
    allV, allF = [], []
    nv = len(V)
    xs = np.arange(-HX + ROW / 2, HX, ROW)
    ys = np.arange(-HY + HILL / 2, HY, HILL)
    k = 0
    for x in xs:
        for y in ys:
            if tilled_here(x, y, 0.05) or (abs(x - 12.6) < 0.25 or abs(x - 11.2) < 0.25) and y < -8:
                continue
            a = rng.uniform(0, 2 * math.pi)
            ca, sa = math.cos(a), math.sin(a)
            s = rng.uniform(0.85, 1.15)
            px, py = x + rng.normal(0, 0.012), y + rng.normal(0, 0.012)
            R = np.array([[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]], np.float32) * s
            allV.append(V @ R.T + np.array([px, py, field_height(px, py)], np.float32))
            allF.append(np.array(F, np.int64) + k * nv)
            k += 1
    me = bpy.data.meshes.new('_stubble')
    Vs = np.concatenate(allV)
    me.vertices.add(len(Vs))
    me.vertices.foreach_set('co', Vs.ravel())
    Fs = np.concatenate(allF)
    me.loops.add(Fs.size)
    me.loops.foreach_set('vertex_index', Fs.ravel().astype(np.int32))
    me.polygons.add(len(Fs))
    me.polygons.foreach_set('loop_start', np.arange(0, Fs.size, 4, dtype=np.int32))
    me.update()
    me.materials.append(bpy.data.materials['stubble'])
    st = bpy.data.objects.new('_stubble', me)
    sc.collection.objects.link(st)
    tmp.append(st)
    print('preview stubble hills', k)
    # トラクター（tractor_yt.glb）を置く
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=TRACTOR_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    tmp += new
    for o in new:
        if o.parent is None and o.name.startswith('Tractor'):
            o.location = TRACTOR_AT
        if o.parent is None and o.name.startswith('Rotary'):
            o.location = TRACTOR_AT + Vector((0, bt.ROTARY_Y, -0.06))
    bpy.context.view_layer.update()
    return tmp


def preview():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 12 if FAST else 64
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.resolution_percentage = 50 if FAST else 100
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('sky')
    sc.world = w
    sky = w.node_tree.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_elevation = math.radians(38)
    sky.sun_rotation = math.radians(bt.SUN_ROT)
    bg = w.node_tree.nodes['Background']
    w.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = bt.SKY_STRENGTH
    hide = [bpy.data.objects[n] for n in ('FieldTilled', 'StubbleHill')]
    for o in hide:
        o.hide_render = True
    tmp = preview_scene()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    tmp.append(cam)
    cam.data.clip_end = 2000
    eye = TRACTOR_AT + bt.EYE
    shots = {
        'field': dict(loc=(19.0, -33.0, 3.4), target=(1.0, 0.0, 0.3), lens=26),
        'field_driver': dict(loc=eye, rot=Euler((math.radians(90 - 12), 0, math.pi)), fov_v=60),
        'field_ground': dict(loc=(TRACTOR_AT.x - 2.2, TRACTOR_AT.y + 4.6, 1.15), target=(TRACTOR_AT.x + 0.4, TRACTOR_AT.y + 1.2, 0.1), lens=30),
    }
    only = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--shot=')]
    for k, v in shots.items():
        if only and k not in only:
            continue
        cam.location = v['loc']
        if 'target' in v:
            cam.rotation_euler = (Vector(v['target']) - Vector(v['loc'])).to_track_quat('-Z', 'Y').to_euler()
            cam.data.sensor_fit, cam.data.lens = 'AUTO', v['lens']
        else:
            cam.rotation_euler = v['rot']
            cam.data.sensor_fit, cam.data.angle_y = 'VERTICAL', math.radians(v['fov_v'])
        cam.data.clip_start = 0.02
        sc.render.filepath = os.path.join(HERE, f'preview_{k}.png')
        bpy.ops.render.render(write_still=True)
        print('wrote', k)
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in hide:
        o.hide_render = False


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_materials()
    build_field()
    build_surroundings()
    grass_tufts()
    stubble_template()
    root = bpy.data.objects.new('Tanbo', None)
    bpy.context.scene.collection.objects.link(root)
    I = Matrix()
    for nm in ('Field', 'FieldTilled', 'Levees', 'Road', 'Canal', 'Facilities', 'Neighbors', 'NeighborsTilled', 'Poles', 'Trees', 'Hills', 'GrassTufts'):
        bt.finalize(nm, I, root)
    ob = bpy.data.objects
    bt.finalize('StubbleHill', Matrix(), root).location.z = -5.0         # 型（ゲームで並べる。原点＝株の根元）。地面の下にしまっておく
    me = ob['GrassTufts'].data                                           # 草の板は法線を上に向け、地面と同じように明るくする
    me.normals_split_custom_set_from_vertices([(0.0, 0.0, 1.0)] * len(me.vertices))
    add_macro(ob['Field'], untilled_macro)
    add_macro(ob['FieldTilled'], lambda x, y: (0.88 + 0.1 * low_noise(x, y, 5.0),) * 3)
    add_macro(ob['Neighbors'], lambda x, y: (0.82 + 0.14 * low_noise(x, y, 30.0),) * 3)
    add_macro(ob['NeighborsTilled'], lambda x, y: (0.85 + 0.1 * low_noise(x, y, 9.0),) * 3)
    add_macro(ob['Levees'], lambda x, y: (0.9 + 0.1 * low_noise(x, y, 5.0),) * 3)
    road_macro = lambda x, y: (0.85 if any(abs(x - r) < 0.35 for r in (ROAD_X0 + 1.1, ROAD_X1 - 1.1)) else 1.0,) * 3   # 車の通る 2 本の筋
    add_macro(ob['Road'], road_macro)
    print('triangles', bt.tri_count())


def export():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_draco_mesh_compression_enable=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_image_format='AUTO')
    print('glb', os.path.getsize(OUT_GLB), 'bytes')


if __name__ == '__main__':
    build()
    if RENDER:
        preview()
    export()

# トラクター運転ゲーム用の田んぼ（耕す前の切り株の田んぼ・耕したあとの土・畦・農道・用水路・排水路・まわりの田んぼ・電柱・遠くの山）
# - build_tractor.py と同じく bpy 5.2.2 で作り、field_tanbo.glb に書き出す（three.js r128・素の GLTFLoader 用。Draco なし）
# - 単位はメートル。原点＝耕す田んぼ（30m×50m）のまん中の地面。Blender 上で 前＝-Y・左＝+X・上＝+Z
#   （トラクターの原点を田んぼの地面に置けばそのまま走れる。three.js では X はそのまま、Blender の Y が -Z になる）
# - 土・草・砂利・コンクリートの絵は numpy で作る（つなぎ目なく並ぶ 1024px 以下。JPEG で埋めこむ）
# - 確認の絵 preview_field*.png は、トラクター（tractor_yt.glb）を置き、半分ほど耕した様子を Cycles で出す
# 使い方：python tools/tractor/build_field.py [--season=haru|aki|shirokaki|all] [--no-render | --fast]
#   （先に build_tractor.py で tractor_yt.glb を作っておく。季節を省くと 3 つとも作る）
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

TRACTOR_GLB = os.path.join(HERE, 'tractor_yt.glb')
TEXDIR = os.path.join(bpy.app.tempdir or '/tmp', 'tanbo_tex')
RENDER = '--no-render' not in sys.argv
FAST = '--fast' in sys.argv
# 季節：haru（春・耕す前の切り株の田んぼ）・aki（秋・稲刈り直後）・shirokaki（水を張った代かきの田んぼ）
SEASONS = {'haru': '', 'aki': '_aki', 'shirokaki': '_shirokaki'}   # 書き出す名前につける文字
_arg = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--season=')), 'all')
SEASON_LIST = list(SEASONS) if _arg == 'all' else [_arg]
SEASON = 'haru'

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
    """耕す前：土・ひび・切り株の列・散らばった藁。
    春は乾きかけの灰色がかった土に古い藁、秋は刈ったばかりで湿った土にコンバインがまいた新しい藁がたくさん"""
    aki = SEASON == 'aki'
    lo, hi = fnoise(n, 1.4, 1), fnoise(n, 0.9, 2)
    damp = np.clip(fnoise(n, 1.8, 3) * 0.5 + 0.5, 0, 1)
    col = lerp_col(*(('#5c4f3d', '#76664e') if aki else ('#7a6d5a', '#94866e')), np.clip(0.5 + 0.18 * lo + 0.08 * hi, 0, 1))
    col *= (1 - 0.18 * damp)[..., None]
    hgt = 0.15 * lo + 0.05 * hi
    f1, f2, _ = voronoi(n, 70, 4)                                     # 乾いてできたひび（秋はまだ湿っていてほとんど無い）
    crack = np.clip(1 - (f2 - f1) * n / 3.0, 0, 1) * (np.clip(lo, -1, 2) * 0.3 + 0.7) * (0.15 if aki else 1.0)
    col *= (1 - 0.35 * crack)[..., None]
    hgt -= 0.6 * crack
    if aki:                                                            # 刻んだ藁（刈って 2〜3 週間。金色が少し抜けて灰色がかる）
        strokes(col, hgt, n, 2300, (20, 95), (1.6, 3.2), ('#cdb980', '#b9a368', '#d9cc9e', '#a8996a', '#9d9a70', '#857550'), 5, h=0.9)
    else:
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
                c = hexc('#d4cf8c' if aki else '#d9c58c') * rng.uniform(0.8, 1.05)
                col[np.ix_(np.arange(sy - 2, sy + 2) % n, np.arange(sx - 2, sx + 2) % n)] = c
                hgt[np.ix_(np.arange(sy - 2, sy + 2) % n, np.arange(sx - 2, sx + 2) % n)] = 1.2
            if aki:                                                   # ひこばえ：株から外へ開く青い葉（上から見た形）
                for k in range(rng.integers(11, 17)):
                    a = rng.uniform(0, 2 * math.pi)
                    L = rng.uniform(0.06, 0.16) * px_m
                    c = hexc(('#5f8f2e', '#73a03a', '#4d7a26', '#86ad45', '#679836')[rng.integers(5)]) * rng.uniform(0.85, 1.1)
                    for t in np.linspace(0.15, 1, int(L)):
                        wd = 1 if t > 0.7 else 2
                        sx, sy = int(cx + math.cos(a) * L * t), int(cy + math.sin(a) * L * t + 0.25 * L * t * t)
                        col[np.ix_(np.arange(sy - wd + 1, sy + wd) % n, np.arange(sx - wd + 1, sx + wd) % n)] = c * (0.8 + 0.3 * t)
                        hgt[np.ix_(np.arange(sy - wd + 1, sy + wd) % n, np.arange(sx - wd + 1, sx + wd) % n)] = 1.0
    return np.clip(col, 0, 1), normal_from(hgt, 3.0)


def tex_tilled(n=1024):
    """耕したあと：湿った濃い茶色の土のかたまり（上は少し乾いて明るい）・混ざった藁"""
    aki = SEASON == 'aki'                                               # 秋起こしは、刈り株とひこばえをすきこむので土くれが大きい（動画で見た荒さ）
    nc, rad = (430, 31) if aki else (700, 24)
    f1, _, idx = voronoi(n, nc, 11)
    rng = np.random.default_rng(12)
    ch = rng.uniform(0.3, 1.0, nc).astype(np.float32)[idx]
    cs = rng.uniform(0.6, 1.4, nc).astype(np.float32)[idx]
    fine = fnoise(n, 0.7, 13)
    mid = fnoise(n, 1.3, 14)
    lump = ch * np.clip(1 - (f1 * n / (rad * cs)) ** 2, 0, 1)           # 土くれ
    hgt = 0.9 * lump + 0.12 * fine + 0.25 * mid
    t = np.clip(0.35 + 0.5 * lump + 0.08 * fine + 0.1 * mid, 0, 1)
    col = lerp_col(*(('#2b2018', '#77614a') if aki else ('#30231a', '#6a543d')), t)   # 秋は土くれの上が乾いて明るい
    col *= (1 - 0.3 * np.clip(-mid, 0, 1))[..., None]
    if SEASON == 'aki':                                                 # 秋起こし：すきこんだ新しい藁がよく見える
        strokes(col, hgt, n, 700, (12, 60), (1.5, 2.8), ('#c9ad62', '#b39a58', '#d8c27f', '#8f7c4a'), 15, h=0.9)
        strokes(col, hgt, n, 260, (8, 30), (1.4, 2.4), ('#6f9a3a', '#5c8530', '#83aa45', '#4f6f2c'), 16, h=0.8)   # ひこばえの切れはし
    else:
        strokes(col, hgt, n, 260, (10, 45), (1.5, 2.5), ('#9a8456', '#8a764c', '#b09a66'), 15, h=0.9)   # 藁のかけら
    return np.clip(col, 0, 1), normal_from(hgt, 6.5 if aki else 5.0)


def tex_grass(n=1024):
    """畦・土手の草（春の若草に枯れ草が混ざる）"""
    lo = fnoise(n, 1.5, 21)
    dry = np.clip(fnoise(n, 1.7, 22) * 0.6 + (0.35 if SEASON == 'aki' else 0.1), 0, 1)
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


def tex_renge(n=1024):
    """春の緑肥のレンゲ畑（上から）：みっしりした丸い小葉と、赤紫の花。2m 四方"""
    rng = np.random.default_rng(81)
    lo = fnoise(n, 1.4, 82)
    col = lerp_col('#3e6424', '#5c8a32', np.clip(0.5 + 0.25 * lo, 0, 1))
    hgt = 0.3 * lo
    yy, xx = np.mgrid[0:n, 0:n]
    def dots(count, rmin, rmax, colors, h, seed):
        r_ = np.random.default_rng(seed)
        for _ in range(count):
            cx, cy, r = r_.uniform(0, n), r_.uniform(0, n), r_.uniform(rmin, rmax)
            x0, y0 = int(cx - r - 1), int(cy - r - 1)
            X = np.arange(x0, x0 + int(2 * r + 3)) % n
            Y = np.arange(y0, y0 + int(2 * r + 3)) % n
            gx, gy = np.meshgrid(np.arange(x0, x0 + int(2 * r + 3)), np.arange(y0, y0 + int(2 * r + 3)))
            m = (gx - cx) ** 2 + (gy - cy) ** 2 <= r * r
            c = hexc(colors[r_.integers(len(colors))]) * r_.uniform(0.85, 1.1)
            sub = col[np.ix_(Y, X)]
            sub[m] = c
            col[np.ix_(Y, X)] = sub
            hs = hgt[np.ix_(Y, X)]
            hs[m] = np.maximum(hs[m], h)
            hgt[np.ix_(Y, X)] = hs
    dots(16000, 2.0, 4.0, ('#4f7d2a', '#679637', '#5a8a30', '#76a640', '#456f26'), 0.8, 83)   # 小葉
    dots(4200, 4.5, 8.0, ('#c4609f', '#d27fb7', '#b04c8f', '#dc95c4'), 1.2, 84)               # 花（輪になった赤紫。花の時期）
    dots(1500, 1.5, 2.5, ('#f3e6ef', '#efd4e6'), 1.3, 85)                                      # 花のまん中の白
    return np.clip(col, 0, 1), normal_from(hgt, 2.0)


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


def tex_clods_wet(n=1024):
    """代かき前：水の下の荒く起こした土（濡れて黒っぽい）"""
    f1, _, idx = voronoi(n, 500, 61)
    rng = np.random.default_rng(62)
    ch = rng.uniform(0.3, 1.0, 500).astype(np.float32)[idx]
    lump = ch * np.clip(1 - (f1 * n / 30) ** 2, 0, 1)
    fine = fnoise(n, 0.8, 63)
    hgt = 0.9 * lump + 0.1 * fine
    col = lerp_col('#251c14', '#4e3d2c', np.clip(0.3 + 0.5 * lump + 0.1 * fine, 0, 1))
    strokes(col, hgt, n, 250, (12, 50), (1.5, 2.5), ('#6e5e3c', '#857248', '#5a4c32'), 64, h=0.9)
    return np.clip(col, 0, 1), normal_from(hgt, 4.0)


def tex_mud_water(n=1024):
    """代かきしたあと：にごった泥水（渦を巻いた濃淡・細かい波）"""
    wx, wy = fnoise(n, 1.8, 65) * 18, fnoise(n, 1.8, 66) * 18          # 雑音で雑音をゆがめて渦のように
    base = fnoise(n, 1.5, 67)
    yy, xx = np.mgrid[0:n, 0:n]
    warped = base[(yy + wy.astype(int)) % n, (xx + wx.astype(int)) % n]
    col = lerp_col('#4b3b2a', '#7a6650', np.clip(0.5 + 0.22 * warped, 0, 1))
    silt = np.clip(fnoise(n, 1.1, 68) - 1.2, 0, 1)                      # 浮いた細かい泥のすじ
    col = col * (1 - 0.5 * silt[..., None]) + hexc('#9b8a70') * 0.5 * silt[..., None]
    hgt = 0.05 * fnoise(n, 0.9, 69)
    strokes(col, hgt, n, 120, (10, 40), (1.5, 2.2), ('#8c7a50', '#a08c5e'), 70, h=0.3)   # 浮いた藁くず
    return np.clip(col, 0, 1), normal_from(hgt, 1.0)


def tex_levee_mud(n=512):
    """畦塗り：塗りつけた濡れた泥（こてのすじ）"""
    lo = fnoise(n, 1.5, 71)
    streak = np.sin((np.arange(n)[:, None] / n) * 2 * math.pi * 9 + fnoise(n, 1.6, 72) * 1.2) * 0.5 + 0.5
    col = lerp_col('#2e2319', '#4a3a2a', np.clip(0.4 + 0.2 * lo + 0.2 * streak, 0, 1))
    return np.clip(col, 0, 1), normal_from(0.3 * streak + 0.1 * lo, 2.0)


def tex_straw_float(n=1024):
    """水に浮いた藁（アルファで切り抜く）"""
    col = np.zeros((n, n, 3), np.float32)
    hgt = np.zeros((n, n), np.float32)
    strokes(col, hgt, n, 380, (15, 70), (1.6, 3.0), ('#a8935e', '#8f7c4e', '#bda86e'), 73, h=1.0)
    return np.dstack([col, (hgt > 0).astype(np.float32)])


def tex_seedlings(n=1024):
    """田植えしたばかりの苗の列（上から見た株。アルファで切り抜く）。並びは切り株と同じ"""
    out = np.zeros((n, n, 4), np.float32)
    rng = np.random.default_rng(74)
    px_m = n / T_UNTILLED
    for i in range(int(round(T_UNTILLED / ROW))):
        for j in range(int(round(T_UNTILLED / HILL))):
            cx, cy = ((i + 0.5) * ROW + rng.normal(0, 0.01)) * px_m, ((j + 0.5) * HILL + rng.normal(0, 0.01)) * px_m
            for k in range(rng.integers(6, 10)):
                a = rng.uniform(0, 2 * math.pi)
                L = rng.uniform(0.04, 0.085) * px_m
                c = hexc(['#4f8a2c', '#6aa53a', '#86b84c', '#3f7224'][rng.integers(4)])
                for t in np.linspace(0, 1, int(L)):
                    x, y = int(cx + math.cos(a) * L * t) % n, int(cy + math.sin(a) * L * t) % n
                    out[y - 1:y + 1, x - 1:x + 1, :3] = c * (0.7 + 0.4 * t)
                    out[y - 1:y + 1, x - 1:x + 1, 3] = 1
    return out


def tex_track(n=512):
    """コンバインのクローラの跡（固められた濃い土に横の溝・つぶれた藁）。1m 四方"""
    lo = fnoise(n, 1.4, 75)
    v = np.arange(n)[:, None] / n
    lug = (np.sin(v * 2 * math.pi * 11) > 0.55).astype(np.float32)    # 9cm ごとの横の溝
    col = lerp_col('#4a3c2c', '#64533c', np.clip(0.5 + 0.2 * lo, 0, 1))   # 刈って 2〜3 週間。表は少し乾いている
    col = col * (1 - 0.25 * lug[..., None] * np.ones((1, n, 1)))
    hgt = -0.6 * np.broadcast_to(lug, (n, n)) + 0.1 * lo
    strokes(col, hgt, n, 160, (10, 40), (1.5, 2.5), ('#9c8a58', '#7f6f46'), 76, angle=(0.0, 0.25), h=0.6)
    strokes(col, hgt, n, 90, (8, 26), (1.4, 2.2), ('#5f8f2e', '#4d7a26', '#73a03a'), 77, h=0.5)   # つぶされたひこばえ
    return np.clip(col, 0, 1), normal_from(hgt, 2.5)


T_RICE = 2.1                      # 実った稲の絵の大きさ（条間 30cm の 7 列）


def tex_rice_top(n=1024):
    """実った稲を上から（垂れた金色の穂と葉。列のあいだは暗い）"""
    col = lerp_col('#6e6430', '#8c7d3c', np.clip(0.5 + 0.2 * fnoise(n, 1.3, 77), 0, 1))
    u = (np.arange(n)[None, :] + 0.5) / n * (T_RICE / ROW)
    gap = np.broadcast_to(np.clip(1 - np.abs(np.sin(math.pi * u)) * 1.6, 0, 1), (n, n))   # 列のあいだ
    hgt = np.zeros((n, n), np.float32)
    strokes(col, hgt, n, 1800, (10, 40), (1.5, 3.0), ('#93964a', '#7c8740', '#a8a157'), 78, bend=0.6, h=0.5)   # 葉
    strokes(col, hgt, n, 4200, (8, 26), (2.5, 4.5), ('#d8b75a', '#c9a24a', '#e3c873', '#b8913c'), 79, bend=0.9, h=1.0)   # 穂
    col *= (1 - 0.55 * gap)[..., None]
    hgt = hgt - 1.2 * gap
    return np.clip(col, 0, 1), normal_from(hgt, 3.0)


def tex_rice_side(n=512):
    """実った稲を横から（下は茎、上 1/3 に垂れた穂。上のふちはアルファでぎざぎざに）。v＝0 が根元・1 が穂先"""
    out = np.zeros((n, n, 4), np.float32)
    rng = np.random.default_rng(80)
    v = (np.arange(n)[:, None] + 0.5) / n
    out[..., :3] = lerp_col('#3c3a1e', '#7a6f34', np.broadcast_to(v, (n, n)) ** 0.8)
    out[..., 3] = 1
    top = 0.86 + 0.08 * np.convolve(rng.uniform(-1, 1, n + 16), np.ones(9) / 9, 'same')[8:8 + n]
    out[np.arange(n)[:, None] > (top * n)[None, :], 3] = 0              # 上のふち
    for _ in range(900):                                                # 茎と穂
        x = rng.uniform(0, n)
        lean = rng.normal(0, 18)
        c = hexc(['#cfae54', '#bf9c45', '#ddc06c'][rng.integers(3)])
        for t in np.linspace(0.55, 0.95, 40):
            y = int(t * n)
            xx = int(x + lean * (t - 0.55) ** 2 * 3) % n
            if out[min(y, n - 1), xx, 3] > 0:
                out[max(y - 2, 0):y + 1, xx:xx + 2, :3] = c * (0.8 + 0.3 * t)
    return out


def tex_higanbana(n=512):
    """彼岸花（緑の茎の先に赤い花。アルファで切り抜く）"""
    out = np.zeros((n, n, 4), np.float32)
    rng = np.random.default_rng(81)
    for _ in range(7):
        x0, top = n / 2 + rng.normal(0, n * 0.14), rng.uniform(0.55, 0.85) * n
        lean = rng.normal(0, n * 0.04)
        for y in range(int(top)):                                       # 茎（葉は無い）
            x = int(x0 + lean * y / top)
            out[y, x - 2:x + 2, :3] = hexc('#4e7a2a')
            out[y, x - 2:x + 2, 3] = 1
        cx, cy = x0 + lean, top
        for k in range(14):                                             # 反り返った花びらと長いしべ
            a = 2 * math.pi * k / 14 + rng.normal(0, 0.2)
            L = rng.uniform(0.07, 0.13) * n * (1.5 if k % 2 else 1.0)
            for t in np.linspace(0, 1, int(L)):
                x = int(cx + math.cos(a) * L * t)
                y = int(cy + math.sin(a) * L * t * 0.7 + (t * t) * L * 0.4)
                if 0 <= x < n - 2 and 0 <= y < n - 2:
                    out[y:y + 2, x:x + 2, :3] = hexc('#d0141c') * (0.75 + 0.35 * (1 - t))
                    out[y:y + 2, x:x + 2, 3] = 1
    return out


def tex_tree(kind, n=512):
    """遠くの木の板（アルファで切り抜く）。kind：broad（広葉樹のこんもりした木）・cedar（杉）。上から光が当たる"""
    out = np.zeros((n, n, 4), np.float32)
    rng = np.random.default_rng(201 if kind == 'broad' else 202)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    trunk = (np.abs(xx - n / 2) < n * 0.022) & (yy < n * 0.45)
    out[trunk, :3] = hexc('#4a3a2c')
    out[trunk, 3] = 1
    blobs = []
    if kind == 'broad':
        for _ in range(320):
            a, r = rng.uniform(0, 2 * math.pi), math.sqrt(rng.random())
            cx, cy = n / 2 + math.cos(a) * r * n * 0.43, n * 0.6 + math.sin(a) * r * n * 0.37
            blobs.append((rng.random(), cx, cy, rng.uniform(0.035, 0.075) * n,
                          hexc(['#3f6a2c', '#4d7a34', '#36592a', '#5a843a', '#2f5226'][rng.integers(5)])))
    else:
        for _ in range(1100):
            y = rng.uniform(0.12, 0.98)
            hw = 0.30 * (1 - (y - 0.12) / 0.86) ** 0.9 + 0.015
            blobs.append((rng.random(), n / 2 + rng.uniform(-hw, hw) * n, y * n, rng.uniform(0.012, 0.03) * n,
                          hexc(['#23361f', '#2c4426', '#344f2c', '#1d2e1b'][rng.integers(4)])))
    for z, cx, cy, r, c in sorted(blobs):                                  # 奥（暗い）から手前へ重ねる
        x0, x1, y0, y1 = int(max(cx - r, 0)), int(min(cx + r + 1, n)), int(max(cy - r, 0)), int(min(cy + r + 1, n))
        nx, ny = (xx[y0:y1, x0:x1] - cx) / r, (yy[y0:y1, x0:x1] - cy) / r
        d2 = nx * nx + ny * ny
        m = d2 < 1
        lit = np.clip(0.35 * -nx + 0.55 * ny + 0.6 * np.sqrt(np.clip(1 - d2, 0, 1)), 0, 1)
        shade = (0.45 + 0.6 * lit) * (0.65 + 0.45 * z) * (0.75 + 0.3 * cy / n)
        reg = out[y0:y1, x0:x1]
        reg[m, :3] = (c[None, :] * shade[m][:, None])
        reg[m, 3] = 1
    return np.clip(out, 0, 1)


def tex_forest(n=512):
    """山の森を遠くから（木のかたまりの粒。少しかすんだ色）"""
    f1, _, idx = voronoi(n, 650, 211)
    rng = np.random.default_rng(212)
    tone = rng.uniform(0.75, 1.2, 650).astype(np.float32)[idx]
    crown = np.clip(1 - (f1 * n / 13) ** 2, 0, 1)
    col = lerp_col('#33472f', '#577553', np.clip(0.25 + 0.5 * crown * tone + 0.1 * fnoise(n, 1.4, 213), 0, 1))
    return np.clip(col, 0, 1), normal_from(crown, 3.0)


def tex_kawara(n=512):
    """瓦屋根（いぶし銀。縦の山と横の段）"""
    u = (np.arange(n)[None, :] + 0.5) / n
    v = (np.arange(n)[:, None] + 0.5) / n
    ridge = 0.5 + 0.5 * np.cos(u * 2 * math.pi * 4)
    step = (np.mod(v * 5, 1.0) < 0.12).astype(np.float32)
    col = lerp_col('#3a3f46', '#626a73', np.clip(0.3 + 0.5 * ridge - 0.4 * step + 0.08 * fnoise(n, 1.3, 214), 0, 1))
    return np.clip(col, 0, 1), normal_from(0.8 * ridge - 0.8 * step, 3.0)


def save_img(name, arr, fmt='JPEG', q=85):
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
    im.save(quality=q)
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
    """材質。名前は季節で変えない（ゲームのコードを同じにするため）。中の絵だけ季節で変わる"""
    shiro = SEASON == 'shirokaki'
    if shiro:                                                          # Field＝水の下の荒い土、FieldTilled＝代かきした泥水
        c, n = tex_clods_wet()
        mat_tex('soil_untilled', save_img('soil_untilled', c), save_img('soil_untilled_n', n, q=72), 0.55, 1.2, macro=True)
        c, n = tex_mud_water()
        mat_tex('soil_tilled', save_img('soil_tilled', c), save_img('soil_tilled_n', n[::2, ::2], q=72), 0.16, 0.5, macro=True)
        c, n = tex_levee_mud()
        mat_tex('levee_mud', save_img('levee_mud', c), save_img('levee_mud_n', n, q=72), 0.35, 1.0, macro=True)
        mat_tex('straw_float', save_img('straw_float', tex_straw_float(), 'PNG'), None, 0.7, clip=True)
        mat_tex('seedlings', save_img('seedlings', tex_seedlings(), 'PNG'), None, 0.7, clip=True)
        mat_flat('paddy_water', '#7d8f98', 0.03, alpha=0.62)            # 空を映した色（環境マップが無くても水らしく）
    else:
        k = 2 if SEASON == 'aki' else 1                                 # 秋は絵が多いので土の凹凸は 512px にして軽くする
        c, n = tex_untilled()
        mat_tex('soil_untilled', save_img('soil_untilled', c), save_img('soil_untilled_n', n[::k, ::k], q=72), 0.92, 1.0, macro=True)
        c, n = tex_tilled()
        mat_tex('soil_tilled', save_img('soil_tilled', c), save_img('soil_tilled_n', n[::k, ::k], q=72), 0.95, 1.8, macro=True)
    if SEASON == 'aki':
        c, n = tex_track()
        mat_tex('track', save_img('track', c), save_img('track_n', n, q=72), 0.8, 1.2)
        c, n = tex_rice_top()
        mat_tex('rice_top', save_img('rice_top', c[::2, ::2]), save_img('rice_top_n', n[::2, ::2], q=72), 0.85, 1.0)
        mat_tex('rice_side', save_img('rice_side', tex_rice_side(), 'PNG'), None, 0.85, clip=True)
        mat_tex('higanbana', save_img('higanbana', tex_higanbana(), 'PNG'), None, 0.6, clip=True)
    if SEASON == 'haru':
        c, n = tex_renge()
        mat_tex('renge', save_img('renge', c), save_img('renge_n', n[::2, ::2], q=72), 0.85, 1.0, macro=True)
    c, n = tex_grass()
    mat_tex('grass', save_img('grass', c), save_img('grass_n', n[::2, ::2], q=72), 0.9, 0.8, macro=True)   # 草の凹凸は 512px で足りる
    c, n = tex_gravel()
    mat_tex('gravel', save_img('gravel', c), save_img('gravel_n', n, q=72), 0.85, 1.0, macro=True)
    c, n = tex_concrete()
    mat_tex('concrete', save_img('concrete', c), save_img('concrete_n', n, q=72), 0.85, 0.6)
    mat_tex('grass_tuft', save_img('grass_tuft', tex_tuft(), 'PNG'), None, 0.85, clip=True)
    mat_flat('water', '#3c4a42', 0.04, alpha=0.78)
    mat_flat('stubble', '#b3a466' if SEASON == 'aki' else '#a28f63', 0.85)
    if SEASON == 'aki':
        mat_flat('hikobae', '#4a7a22', 0.85)                           # 刈り株から伸びた青い芽（ひこばえ）
    mat_flat('pole', '#a4a49c', 0.75)
    mat_flat('wire', '#1c1c1c', 0.5)
    mat_flat('pvc', '#7f8f99', 0.4)
    mat_flat('wood', '#6d5338', 0.85)
    mat_flat('white_insulator', '#e8e6e0', 0.3)
    mat_flat('kei_white', '#f0f1ee', 0.3)                               # 軽トラ
    mat_flat('kei_dark', '#2a2c2f', 0.6)
    mat_flat('kei_glass', '#1b2126', 0.08)
    mat_flat('kei_silver', '#b4b8bb', 0.35, metal=0.6)
    mat_flat('kei_tire', '#1a1a1a', 0.9)
    mat_flat('lamp_kei', '#dfe4e8', 0.1)
    mat_flat('lamp_tail', '#9a1018', 0.2)
    mat_flat('bag_white', '#e6e2d6', 0.8)
    mat_flat('plate_kei', '#e3c43c', 0.4)
    mat_flat('bag_brown', '#a78a5c', 0.8)
    mat_flat('concrete_box', '#a7a59c', 0.85)
    mat_flat('tree', '#3f5a30', 0.9)
    mat_flat('cedar', '#2a3d27', 0.9)
    mat_flat('trunk', '#4a3a2c', 0.9)
    c, n = tex_forest()
    if SEASON == 'aki':                                                 # 秋は森が少し黄みがかる
        c = c * np.array([1.08, 1.0, 0.82], np.float32)
    mat_tex('hill', save_img('forest', np.clip(c, 0, 1)), None, 0.95, macro=True)              # 遠いので凹凸の絵は無し
    mat_flat('hill_far', '#8a9ba6', 1.0)
    mat_tex('tree_card', save_img('tree_broad', tex_tree('broad')[::2, ::2], 'PNG'), None, 0.9, clip=True)   # 遠くの木は 256px
    mat_tex('cedar_card', save_img('tree_cedar', tex_tree('cedar')[::2, ::2], 'PNG'), None, 0.9, clip=True)
    c, n = tex_kawara()
    mat_tex('kawara', save_img('kawara', c[::2, ::2]), None, 0.55)
    mat_flat('wall_white', '#e9e5da', 0.8)
    mat_flat('wall_wood', '#6b4f36', 0.85)
    mat_flat('house_base', '#5d5a55', 0.9)
    mat_flat('window', '#23282d', 0.15)
    mat_flat('roof_black', '#2b2e33', 0.6)
    mat_flat('roof_metal', '#61717c', 0.45, 0.4)
    mat_flat('roof_rust', '#7f4e34', 0.75, 0.2)
    mat_flat('shed_wall', '#8d9296', 0.6, 0.3)
    mat_flat('vinyl', '#eef1f1', 0.3, alpha=0.5)


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
    out[:, :3] = np.clip(v, 0, 1.0)                                          # glTF の頂点色は 0〜1
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


CANAL_Z = {'haru': 0.12, 'aki': -0.05, 'shirokaki': 0.25}        # 用水路の水面（秋は水を止めてほとんど空）
DITCH_Z = {'haru': -0.36, 'aki': -0.40, 'shirokaki': -0.25}
PADDY_WATER_Z = 0.025                                              # 代かきの田んぼの水面
MUD_Z = 0.045                                                      # 代かきしたあとの泥水の面（FieldTilled）
FIELD_WATER_Z = 0.006                                              # 耕す田んぼの代かき前の水面：浅水で「土が 8 割・水が 2 割見える」くらい


def clod_height(x, y):
    """代かき前の荒い土の凸凹。浅い水から 7〜8 割が頭を出す（代かきしたあとの泥水 MUD_Z より下におさえる）"""
    return min(MUD_Z - 0.005, field_height(x, y) + 0.016 + 0.024 * math.sin(x * 3.1 + 0.7 * math.sin(y * 1.9)) * math.sin(y * 2.7 + x * 0.6)
               + 0.008 * low_noise(x, y, 1.5))


def build_field():
    shiro = SEASON == 'shirokaki'
    with bt.part('Field'):
        if shiro:                                                      # 水の下の荒い土・水面・浮いた藁
            grid('soil_untilled', -HX, HX, -HY, HY, 0.33, T_TILLED, clod_height)   # 土くれの山がわかる細かさ
            grid('paddy_water', -HX, HX, -HY, HY, 5.0, 5.0, lambda x, y: FIELD_WATER_Z)
            grid('straw_float', -HX, HX, -HY, HY, 5.0, T_UNTILLED, lambda x, y: FIELD_WATER_Z + 0.002)
        else:
            grid('soil_untilled', -HX, HX, -HY, HY, 1.0, T_UNTILLED, field_height)
    with bt.part('FieldTilled'):
        if shiro:
            grid('soil_tilled', -HX, HX, -HY, HY, 5.0, T_TILLED, lambda x, y: MUD_Z)
        else:
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
        if shiro:                                                      # 畦塗り：内側の斜面と上を塗った泥（草より 1cm 上）
            mud = [(0.555, 0.004), (0.215, LEVEE_H + 0.012), (-0.06, LEVEE_H + 0.012)]
            for sy in (1, -1):
                y = sy * (HY + 0.55)
                path = line((-HX - 0.3, y), (HX + 0.3, y), 2.0)
                sweep('levee_mud', path if sy > 0 else path[::-1], mud, T_GRASS, seed=11)
            wm = [(0.004, 0.004), (-0.335, LEVEE_H + 0.012), (-0.61, LEVEE_H + 0.012)]
            sweep('levee_mud', line((-HX, HY + 0.3), (-HX, -HY - 0.3), 2.0), wm, T_GRASS, seed=12)
            for y0, y1 in ((-HY - 0.3, RAMP_Y0), (RAMP_Y1, HY + 0.3)):
                sweep('levee_mud', line((HX, y0), (HX, y1), 2.0), wm, T_GRASS, seed=13)
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
        cz = CANAL_Z[SEASON]
        vs = [bm.verts.new(p) for p in ((cx0 + 0.08, -EXT, cz), (cx0 + 0.52, -EXT, cz), (cx0 + 0.52, EXT, cz), (cx0 + 0.08, EXT, cz))]
        bm.faces.new(vs)
        new_obj(bm, 'water', smooth=None)
        # 排水路の水
        bm = bmesh.new()
        dz = DITCH_Z[SEASON]
        w = 0.15 + 0.5 * (dz + 0.45)                                     # 水が多いほど水面が広い
        vs = [bm.verts.new(p) for p in ((-HX - 1.6 + w, -EXT, dz), (-HX - 1.6 - w, -EXT, dz), (-HX - 1.6 - w, EXT, dz), (-HX - 1.6 + w, EXT, dz))][::-1]
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
        kei_truck()
        # 水たまり（わだちの低い所。秋はコンバインのクローラの跡に）
        rng = np.random.default_rng(71)
        pud = {'haru': ((12.6, -14.0, 0.5), (11.2, -11.5, 0.35), (12.5, -9.0, 0.3), (-13.8, 22.5, 0.7), (-14.2, -23.6, 0.6)),
               'aki': tuple((tx, ty, rng.uniform(0.25, 0.55)) for tx in track_xs()[::5] for ty in rng.uniform(-20, 20, 2)) + ((-13.8, 22.5, 0.9),),
               'shirokaki': ()}[SEASON]
        for cx, cy, r in pud:
            bm = bmesh.new()
            pts = []
            for k in range(14):
                a = 2 * math.pi * k / 14
                rr = r * (1 + 0.3 * rng.normal())
                pts.append(bm.verts.new((cx + rr * math.cos(a) * (0.35 if SEASON == 'aki' else 0.6), cy + rr * math.sin(a) * 1.6, 0.014)))
            bm.faces.new(pts)
            new_obj(bm, 'water', smooth=None)


def track_xs():
    """コンバインのクローラの跡の X（刈り幅 2m ごとに左右 2 本）"""
    out = []
    for k in range(14):
        xc = -HX + 2.0 + k * 2.0
        out += [xc - 0.575, xc + 0.575]
    return out


def build_tracks():
    """秋：コンバインが走った跡（固められた溝）。田んぼの長い向きに往復し、枕地はぐるりと回る"""
    with bt.part('Tracks'):
        for x in track_xs():
            grid('track', x - 0.2, x + 0.2, -HY + 3.0, HY - 3.0, 2.0, 1.0, lambda x_, y_: field_height(x_, y_) + 0.006)
        for d in (1.0, 2.2):                                            # 枕地を回った跡
            for sy in (1, -1):
                y = sy * (HY - d)
                grid('track', -HX + d - 0.2, HX - d + 0.2, y - 0.2, y + 0.2, 2.0, 1.0, lambda x_, y_: field_height(x_, y_) + 0.007)
            for sx in (1, -1):
                x = sx * (HX - d)
                grid('track', x - 0.2, x + 0.2, -HY + d - 0.2, HY - d + 0.2, 2.0, 1.0, lambda x_, y_: field_height(x_, y_) + 0.007)


def in_track(x, y):
    return any(abs(x - t) < 0.24 for t in track_xs()) and abs(y) < HY - 3.0 or \
        any(abs(abs(y) - (HY - d)) < 0.24 or abs(abs(x) - (HX - d)) < 0.24 for d in (1.0, 2.2))


def rice_block(x0, x1, y0, y1, seed):
    """まだ刈っていない実った稲（上の面と、まわりの横の面）。高さ 0.85m くらい"""
    rng = np.random.default_rng(seed)
    lodge = [(rng.uniform(x0 + 3, x1 - 3), rng.uniform(y0 + 3, y1 - 3), rng.uniform(1.5, 3.5)) for _ in range(3)]   # 倒れた所

    def hgt(x, y):
        h = 0.84 + 0.05 * low_noise(x * 3, y * 3, 4.0) + 0.02 * math.sin(x * 4.1) * math.sin(y * 3.7)
        for lx, ly, lr in lodge:
            d = math.hypot((x - lx) / lr, (y - ly) / (lr * 1.6))
            if d < 1:
                h -= 0.45 * (1 - d * d)
        return h
    grid('rice_top', x0, x1, y0, y1, 1.5, T_RICE, hgt)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    s = 0.0
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, round(L / 2.0))
        for k in range(n):
            p0 = (ax + (bx - ax) * k / n, ay + (by - ay) * k / n)
            p1 = (ax + (bx - ax) * (k + 1) / n, ay + (by - ay) * (k + 1) / n)
            h0, h1 = hgt(*p0) + 0.06, hgt(*p1) + 0.06
            q = [bm.verts.new((*p0, 0.0)), bm.verts.new((*p1, 0.0)), bm.verts.new((*p1, h1)), bm.verts.new((*p0, h0))]
            f = bm.faces.new(q)
            u0, u1 = s + L * k / n, s + L * (k + 1) / n
            for lp, c in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
                lp[uv].uv = c
        s += L
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):                       # ふちの少し内側に穂の並び（上のぎざぎざ）
        L = math.hypot(bx - ax, by - ay)
        nx, ny = -(by - ay) / L * 0.3, (bx - ax) / L * 0.3
        n = max(1, round(L / 2.0))
        for k in range(n):
            p0 = (ax + (bx - ax) * k / n + nx, ay + (by - ay) * k / n + ny)
            p1 = (ax + (bx - ax) * (k + 1) / n + nx, ay + (by - ay) * (k + 1) / n + ny)
            q = [bm.verts.new((*p0, 0.5)), bm.verts.new((*p1, 0.5)), bm.verts.new((*p1, hgt(*p1) + 0.12)), bm.verts.new((*p0, hgt(*p0) + 0.12))]
            f = bm.faces.new(q)
            for lp, c in zip(f.loops, ((k * 2.0, 0.45), ((k + 1) * 2.0, 0.45), ((k + 1) * 2.0, 1), (k * 2.0, 1))):
                lp[uv].uv = c
    new_obj(bm, 'rice_side', smooth=None, face_up=False)


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
            grid('soil_untilled', x0, x1, y0, y1, 20.0, T_UNTILLED)
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
    W1 = (-HX - 3.3 - FW, -HX - 3.3)                                    # となりの田んぼの X の範囲（西 1・2 枚目、東 1・2 枚目）
    W2 = (-HX - 3.3 - 2 * FW - 1.1, -HX - 3.3 - FW - 1.1)
    E1 = (HX + 7.5, HX + 7.5 + FW)
    E2 = (HX + 7.5 + FW + 1.1, HX + 7.5 + 2 * FW + 1.1)
    C = (-HX, HX)
    MID, N1, S1 = (-HY, HY), (HY + 1.1, HY + 1.1 + FL), (-HY - 1.1 - FL, -HY - 1.1)
    with bt.part('NeighborsTilled'):                                    # 何枚かは耕してある・水を張ってある・稲が立っている
        if SEASON == 'haru':
            for (x0, x1), (y0, y1) in ((W1, MID), (C, N1), (E2, N1)):
                grid('soil_tilled', x0, x1, y0, y1, 5.0, T_TILLED, lambda x, y: 0.03)
            for (x0, x1), (y0, y1) in ((E1, MID), (W2, N1)):
                grid('water', x0, x1, y0, y1, 10.0, 10.0, lambda x, y: 0.06)
            # 緑肥のレンゲ畑（花の時期にすき込む。高さ 15cm くらい、畦ぎわは低い）
            for (x0, x1), (y0, y1) in ((C, S1), (W2, MID), (E2, MID)):
                def rh(x, y, x0=x0, x1=x1, y0=y0, y1=y1):
                    e = min(x - x0, x1 - x, y - y0, y1 - y)
                    return 0.02 + (0.13 + 0.03 * low_noise(x, y, 3.0)) * min(1.0, max(0.0, e) / 0.5)
                grid('renge', x0 + 0.2, x1 - 0.2, y0 + 0.2, y1 - 0.2, 1.0, 2.0, rh)
        elif SEASON == 'aki':                                           # 秋起こしした田んぼと、まだ刈っていない田んぼ
            for (x0, x1), (y0, y1) in ((C, N1), (E1, N1)):
                grid('soil_tilled', x0, x1, y0, y1, 5.0, T_TILLED, lambda x, y: 0.03)
            for k, ((x0, x1), (y0, y1)) in enumerate(((W1, MID), (C, S1), (E2, MID), (W2, N1), (E1, S1))):
                rice_block(x0 + 0.35, x1 - 0.35, y0 + 0.35, y1 - 0.35, 90 + k)
        else:                                                           # 代かき：どこも水を張り、何枚かは代かき済み・田植え済み
            for x0, x1, y0, y1 in regions:
                grid('paddy_water', x0, x1, y0, y1, 20.0, 20.0, lambda x, y: PADDY_WATER_Z)
            for (x0, x1), (y0, y1) in ((W1, MID), (C, N1), (E2, MID)):
                grid('soil_tilled', x0, x1, y0, y1, 5.0, T_TILLED, lambda x, y: MUD_Z)
            for (x0, x1), (y0, y1) in ((E1, MID), (W2, N1), (C, S1), (E1, N1)):
                grid('soil_tilled', x0, x1, y0, y1, 5.0, T_TILLED, lambda x, y: MUD_Z)
                grid('seedlings', x0 + 0.2, x1 - 0.2, y0 + 0.2, y1 - 0.2, 5.0, T_UNTILLED, lambda x, y: MUD_Z + 0.07)
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
    build_landscape()


def tree_cards(bm, uv, x, y, z0, h, w, normals):
    """木 1 本＝3 枚の板（60°ずつ）。法線は木のまん中から外へ向け、丸く見えるように"""
    c = Vector((x, y, z0 + h * 0.58))
    for k in range(3):
        a = math.pi * k / 3
        dx, dy = math.cos(a) * w / 2, math.sin(a) * w / 2
        q = [bm.verts.new(p) for p in ((x - dx, y - dy, z0), (x + dx, y + dy, z0), (x + dx, y + dy, z0 + h), (x - dx, y - dy, z0 + h))]
        f = bm.faces.new(q)
        for lp, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            lp[uv].uv = t
        for v in q:
            nrm = (v.co - c)
            nrm.z = nrm.z * 0.5 + h * 0.25
            normals.append(nrm.normalized())


def forest(spots, seed):
    """木立（広葉樹と杉の板）。spots：[(x, y, z0, 本数, 広がり, 杉の割合)]"""
    rng = np.random.default_rng(seed)
    for mat, cedar in (('tree_card', False), ('cedar_card', True)):
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new('UVMap')
        normals = []
        for cx, cy, z0, cnt, spread, ratio in spots:
            for _ in range(cnt):
                if (rng.random() < ratio) != cedar:
                    continue
                x, y = cx + rng.normal(0, spread), cy + rng.normal(0, spread)
                h = rng.uniform(11, 19) if cedar else rng.uniform(7, 14)
                tree_cards(bm, uv, x, y, z0, h, h * (0.62 if cedar else 0.95), normals)
        if not normals:
            bm.free()
            continue
        ob = new_obj(bm, mat, smooth=80, face_up=False)
        ob.data.normals_split_custom_set_from_vertices([tuple(n) for n in normals])


def gable_roof(mat, M, w, d, z, pitch, o):
    """切妻の屋根（棟は局所 X の向き）。o は軒の出"""
    rh = (d / 2 + o) * pitch
    R = M @ Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # 局所 (X,Y,Z) → (y, z, x)
    bt.prism(mat, [(-d / 2 - o, z - o * pitch), (d / 2 + o, z - o * pitch), (0, z + d / 2 * pitch)], w + 2 * o, R)
    return rh


def building(kind, x, y, rot, z0, rng):
    M = T3((x, y, 0), rot)
    if kind == 'house':                                               # 母屋：白い壁に木の帯・瓦屋根
        w, d, h = rng.uniform(11, 15), rng.uniform(8, 10), 5.4
        bt.box('house_base', (w + 0.1, d + 0.1, 0.6), (0, 0, z0 + 0.3), mtx=M)
        bt.box('wall_white', (w, d, h - 0.6), (0, 0, z0 + 0.6 + (h - 0.6) / 2), mtx=M)
        bt.box('wall_wood', (w + 0.05, d + 0.05, 0.35), (0, 0, z0 + 2.9), mtx=M)
        bt.box('window', (w * 0.7, 0.06, 1.9), (0, -d / 2, z0 + 1.6), mtx=M)          # 南：掃き出しのガラス戸が並ぶ
        bt.box('window', (w * 0.5, 0.06, 1.0), (0, d / 2, z0 + 1.8), mtx=M)           # 北
        bt.box('window', (w * 0.55, 0.06, 0.9), (0, -d / 2, z0 + 4.2), mtx=M)         # 二階
        bt.box('kawara', (w + 1.6, 0.9, 0.12), (0, -d / 2 - 0.5, z0 + 3.2), (-25, 0, 0), mtx=M)   # 一階の庇
        gable_roof('kawara', M, w, d, z0 + h, 0.5, 0.9)
        bt.box('roof_black', (w + 1.9, 0.35, 0.3), (0, 0, z0 + h + d / 2 * 0.5 + 0.1), mtx=M)    # 棟
    elif kind == 'kura':                                              # 蔵：白い壁・黒い腰と屋根
        w, d, h = 6.5, 5.0, 6.5
        bt.box('roof_black', (w + 0.1, d + 0.1, 1.4), (0, 0, z0 + 0.7), mtx=M)
        bt.box('wall_white', (w, d, h - 1.4), (0, 0, z0 + 1.4 + (h - 1.4) / 2), mtx=M)
        bt.box('window', (0.8, 0.06, 0.8), (1.2, -d / 2, z0 + 4.8), mtx=M)
        gable_roof('roof_black', M, w, d, z0 + h, 0.55, 0.6)
    elif kind == 'shed':                                              # 納屋・作業場：トタン屋根と壁、大きな入口
        w, d, h = rng.uniform(9, 14), rng.uniform(6, 8), 4.2
        bt.box('shed_wall', (w, d, h), (0, 0, z0 + h / 2), mtx=M)
        bt.box('window', (w * 0.55, 0.06, 3.2), (-w * 0.15, -d / 2, z0 + 1.6), mtx=M)
        gable_roof('roof_rust' if rng.random() < 0.5 else 'roof_metal', M, w, d, z0 + h, 0.3, 0.5)
    else:                                                             # ビニールハウス（かまぼこ形）
        L, r = rng.uniform(25, 40), 2.7
        bm = bmesh.new()
        rings = []
        for t in (-L / 2, L / 2):
            rings.append([bm.verts.new(M @ Vector((t, r * math.cos(a), z0 + r * 1.1 * math.sin(a)))) for a in np.linspace(0, math.pi, 13)])
        for k in range(12):
            bm.faces.new((rings[0][k], rings[0][k + 1], rings[1][k + 1], rings[1][k]))
        for ring in rings:
            bm.faces.new(ring)
        new_obj(bm, 'vinyl', smooth=60, face_up=False)


def T3(loc, rot_deg):
    return Matrix.Translation(loc) @ Matrix.Rotation(math.radians(rot_deg), 4, 'Z')


VILLAGES = [(-120.0, 128.0, 8.0), (128.0, 108.0, -6.0), (-165.0, -70.0, 84.0), (190.0, -125.0, 2.0), (55.0, -205.0, 28.0), (-55.0, 215.0, -3.0)]


KEI_AT = (19.65, -14.0)                   # 軽トラを止めておく所（農道の東より・進入路の少し南。ゲームでは x 19.65・z 14）


def kei_truck():
    """白い軽トラ（長さ 3.4m・幅 1.47m・高さ 1.8m。前に運転席、うしろに荷台。荷台に肥料・土壌改良材の袋）。
    農家の運搬の定番。局所は -Y が前・Z が上"""
    M = Matrix.Translation((KEI_AT[0], KEI_AT[1], ROAD_Z + 0.03)) @ Euler((0, 0, math.radians(1.5))).to_matrix().to_4x4()
    B = lambda mat, size, loc, rot=(0, 0, 0), bev=None: bt.box(mat, size, loc, rot, bev=bev, mtx=M)
    B('kei_dark', (1.30, 3.20, 0.12), (0, 0.05, 0.40))                            # 車台
    B('kei_white', (1.47, 1.22, 0.62), (0, -1.08, 0.80), bev=(0.06, 3))           # 運転席の下半分
    B('kei_white', (1.42, 1.02, 0.56), (0, -1.00, 1.38), bev=(0.09, 3))           # 運転席の上（屋根）
    B('kei_glass', (1.26, 0.03, 0.46), (0, -1.515, 1.36), (-8, 0, 0))             # 前の窓
    for sx in (1, -1):
        B('kei_glass', (0.03, 0.70, 0.40), (sx * 0.712, -1.00, 1.38))               # 横の窓
        B('kei_dark', (0.012, 0.02, 0.56), (sx * 0.716, -0.62, 0.84))               # ドアのすき間
        B('lamp_kei', (0.20, 0.03, 0.12), (sx * 0.55, -1.69, 0.86), bev=(0.02,))    # ヘッドライト
        B('kei_dark', (0.05, 0.10, 0.10), (sx * 0.78, -1.40, 1.15))                 # ドアミラー
        B('kei_glass', (0.012, 0.07, 0.13), (sx * 0.81, -1.40, 1.15))
    B('kei_dark', (1.45, 0.10, 0.16), (0, -1.68, 0.56), bev=(0.03,))              # バンパー
    B('kei_glass', (1.12, 0.03, 0.30), (0, -0.485, 1.42))                         # うしろの窓
    B('plate_kei', (0.33, 0.012, 0.165), (0, -1.735, 0.56))                       # 黄色いナンバー（文字なし）
    B('plate_kei', (0.33, 0.012, 0.165), (0, 1.735, 0.50))
    B('kei_dark', (0.70, 0.02, 0.18), (0, -1.70, 0.80))                           # グリル
    # 荷台：床・あおり（左右・うしろ）・鳥居（運転席のうしろの柵）
    B('kei_white', (1.41, 1.94, 0.05), (0, 0.74, 0.66))
    for sx in (1, -1):
        B('kei_white', (0.035, 1.94, 0.30), (sx * 0.70, 0.74, 0.83), bev=(0.01,))
        B('kei_silver', (0.04, 0.04, 0.80), (sx * 0.66, -0.25, 1.06))
        B('lamp_tail', (0.04, 0.03, 0.14), (sx * 0.60, 1.725, 0.60))                # テールランプ
    B('kei_white', (1.41, 0.035, 0.30), (0, 1.71, 0.83), bev=(0.01,))
    B('kei_white', (1.41, 0.035, 0.32), (0, -0.24, 0.84))
    B('kei_silver', (1.36, 0.04, 0.04), (0, -0.25, 1.46))
    for k in range(4):
        B('kei_silver', (1.32, 0.02, 0.02), (0, -0.25, 1.06 + k * 0.10))
    # 車輪（12 インチ）
    for sx in (1, -1):
        for y in (-1.07, 0.85):
            bt.cyl('kei_tire', 0.28, 0.165, (sx * 0.60, y, 0.28), (0, 90, 0), n=20, mtx=M)
            bt.cyl('kei_silver', 0.13, 0.17, (sx * 0.60, y, 0.28), (0, 90, 0), n=12, mtx=M)
            B('kei_dark', (0.20, 0.62, 0.05), (sx * 0.60, y, 0.60))                   # タイヤハウスの上
    # 荷台の袋（20kg の肥料・土壌改良材。白と茶）
    rng = np.random.default_rng(401)
    for k, (x, y, z) in enumerate(((-0.33, 0.25, 0.75), (0.33, 0.25, 0.75), (-0.33, 0.95, 0.75), (0.33, 0.95, 0.75), (0.0, 0.6, 0.87))):
        B('bag_white' if k % 3 else 'bag_brown', (0.48, 0.66, 0.13), (x, y, z), (rng.uniform(-3, 3), rng.uniform(-3, 3), rng.uniform(-8, 8)), bev=(0.04, 2))


def build_landscape():
    """遠くの景色：集落（屋敷林・母屋・蔵・納屋・ビニールハウス）・木立・山並み"""
    with bt.part('Houses'):
        rng = np.random.default_rng(301)
        for k, (vx, vy, rot) in enumerate(VILLAGES):
            z0 = 0.45                                                   # 屋敷は田んぼより少し高い
            grid('grass', vx - 38, vx + 38, vy - 30, vy + 30, 8.0, T_GRASS, lambda x, y: z0 - 0.02)
            M = T3((vx, vy, 0), rot)
            lots = [(-20, 4), (6, 8), (24, -6), (-8, -16)][:2 + k % 3]
            for lx, ly in lots:
                p = M @ Vector((lx, ly, 0))
                building('house', p.x, p.y, rot + rng.normal(0, 4), z0, rng)
                q = M @ Vector((lx + 11, ly + 9, 0))
                building('kura' if rng.random() < 0.5 else 'shed', q.x, q.y, rot + 90 * rng.integers(2), z0, rng)
            for g in range(k % 3):                                      # ビニールハウス
                p = M @ Vector((-26 + 7 * g, -24, 0))
                building('greenhouse', p.x, p.y, rot, z0, rng)
    with bt.part('Trees'):
        spots = []
        for vx, vy, rot in VILLAGES:                                    # 屋敷林（北と西を杉で囲う）
            M = T3((vx, vy, 0), rot)
            for t in np.linspace(-34, 34, 8):
                for p in (M @ Vector((t, 26, 0)), M @ Vector((-34, t * 0.8, 0))):
                    spots.append((p.x, p.y, 0.43, 3, 2.5, 0.8))
            spots.append((vx, vy, 0.43, 6, 14, 0.2))
        for cx, cy in ((-95, 140), (-60, 175), (110, 120), (150, 60), (-170, -40), (-130, -150), (90, -170), (200, -110),
                       (-210, 70), (40, 230), (-30, -240), (-240, 160), (240, 30), (-80, -300), (160, 260), (300, -230)):
            spots.append((cx, cy, 0.0, 14, 9, 0.5))
        forest(spots, 81)
    with bt.part('Hills'):
        # 遠くの山並み（森の絵・尾根と谷の明暗）と、そのむこうのかすんだ山
        rng = np.random.default_rng(91)
        for R, H, mat in ((520.0, 60.0, 'hill'), (700.0, 135.0, 'hill_far')):
            n = 360
            a = np.linspace(0, 2 * math.pi, n, endpoint=False)
            hs = np.zeros(n)
            for k, amp in ((3, 0.5), (7, 0.3), (17, 0.15), (41, 0.08), (97, 0.04)):
                hs += amp * np.sin(k * a + rng.uniform(0, 6.3)) + amp * 0.6 * np.sin((k + 1) * a + rng.uniform(0, 6.3))
            hs = np.clip(0.55 + hs, 0.08, 1.45)
            fr = (0.0, 0.22, 0.45, 0.68, 0.86, 1.0)
            bm = bmesh.new()
            uvl = bm.loops.layers.uv.new('UVMap')
            rows = []
            for f in fr:                                                 # すそから峰へ。中腹は谷・尾根で少し出入り
                wob = rng.normal(0, 0.05, n) * (f * (1 - f)) * 4
                rows.append([bm.verts.new(((R + H * hs[i] * 2.2 * (f + wob[i])) * math.cos(a[i]),
                                           (R + H * hs[i] * 2.2 * (f + wob[i])) * math.sin(a[i]),
                                           -3.0 + (H * hs[i] + 3.0) * (f ** 0.75 if f < 1 else 1.0) * (1 + 0.6 * wob[i])))
                             for i in range(n)])
            for r0, r1 in zip(rows, rows[1:]):
                for i in range(n):
                    j = (i + 1) % n
                    fc = bm.faces.new((r0[i], r1[i], r1[j], r0[j]))
                    for lp in fc.loops:
                        lp[uvl].uv = (math.atan2(lp.vert.co.y, lp.vert.co.x) * R / 25.0, lp.vert.co.z / 25.0)
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
    if SEASON != 'aki':
        return
    with bt.part('GrassTufts'):                                        # 秋：畦に彼岸花のかたまり
        rng = np.random.default_rng(102)
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new('UVMap')
        for k in range(160):
            side = rng.integers(4)
            t = rng.uniform(-0.95, 0.95)
            d = rng.uniform(0.4, 1.0)
            if side < 2:
                x, y = t * HX, (1 if side else -1) * (HY + d)
            else:
                x, y = (1 if side == 2 else -1) * (HX + d), t * HY
                if side == 2 and RAMP_Y0 - 0.5 < y < RAMP_Y1 + 0.5:
                    continue
            z = LEVEE_H * min(1.0, d / 0.33, max(0.0, (1.1 - d) / 0.33)) - 0.02
            for m in range(rng.integers(1, 4)):
                xx, yy = x + rng.normal(0, 0.15), y + rng.normal(0, 0.15)
                sz = rng.uniform(0.35, 0.5)
                a = rng.uniform(0, math.pi)
                for b in (a, a + math.pi / 2):
                    dx, dy = math.cos(b) * sz / 2, math.sin(b) * sz / 2
                    q = [bm.verts.new(p) for p in ((xx - dx, yy - dy, z), (xx + dx, yy + dy, z), (xx + dx, yy + dy, z + sz), (xx - dx, yy - dy, z + sz))]
                    f = bm.faces.new(q)
                    for lp, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                        lp[uv].uv = c
        new_obj(bm, 'higanbana', smooth=None)


def stubble_mesh():
    """切り株ひと株（刈ったあとの茎 9〜10 本）：頂点と面"""
    rng = np.random.default_rng(111)
    V, F = [], []
    for k in range(10):
        a, rr = rng.uniform(0, 2 * math.pi), rng.uniform(0, 0.022)
        cx, cy = rr * math.cos(a), rr * math.sin(a)
        h = rng.uniform(0.12, 0.19) if SEASON == 'aki' else rng.uniform(0.06, 0.12)   # 秋は刈ったばかりで高い
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


def hikobae_mesh():
    """ひこばえひと株：刈った茎のあいだから外へ大きく開いて伸びる葉 8 枚（長さ 10〜24cm）。四角 2 枚ずつ、先は細い。
    苗のように立たず、株のまわりにふさっと広がる。ゲームでは型の先頭から何枚かだけ使う（パソコン 6 枚・スマホ 4 枚）"""
    rng = np.random.default_rng(112)
    V, F = [], []
    for k in range(8):
        a = 2 * math.pi * (k * 3 % 8) / 8 + rng.uniform(-0.35, 0.35)   # 先頭の何枚かでも、まわりに散らばるように
        L = rng.uniform(0.10, 0.24)
        lean = rng.uniform(0.6, 1.3)                                   # 根元から外へたおれる大きさ
        ca, sa = math.cos(a), math.sin(a)
        b = len(V)
        for t, w in ((0.0, 0.0045), (0.55, 0.0040), (1.0, 0.0006)):
            r = 0.012 + L * lean * 0.55 * t * t                         # 外へ（先ほど寝る）
            z = 0.015 + L * t * (1 - 0.35 * lean * t)
            V += [(ca * r - sa * w, sa * r + ca * w, z), (ca * r + sa * w, sa * r - ca * w, z)]
        F += [(b, b + 1, b + 3, b + 2), (b + 2, b + 3, b + 5, b + 4)]
    return np.array(V, np.float32), F


def stubble_template():
    V, F = stubble_mesh()
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in V]
    for f in F:
        bm.faces.new([vs[i] for i in f])
    with bt.part('StubbleHill'):
        new_obj(bm, 'stubble', smooth=None)
    if SEASON == 'aki':
        V, F = hikobae_mesh()
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in V]
        for f in F:
            bm.faces.new([vs[i] for i in f])
        with bt.part('HikobaeHill'):
            new_obj(bm, 'hikobae', smooth=None, face_up=False)


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
            if SEASON == 'shirokaki':
                grid('soil_tilled', x0, x1, y0, y1, 0.5, T_TILLED, lambda x, y: MUD_Z)
            else:
                grid('soil_tilled', x0, x1, y0, y1, 0.25, T_TILLED,
                     lambda x, y: field_height(x, y) + 0.035 + 0.012 * math.sin(x * 9.1 + y * 3.3) * math.sin(y * 7.7))
    t = bt.finalize('_tilled', Matrix())
    add_macro(t, lambda x, y: (0.9 + 0.08 * low_noise(x, y, 4.0),) * 3)
    tmp.append(t)
    # 切り株（耕していない所。代かきの田んぼには無い・秋はクローラの跡でつぶれている）
    V, F = stubble_mesh()
    if SEASON == 'shirokaki':
        V = V[:0]
    HV, HF = hikobae_mesh() if SEASON == 'aki' else (V[:0], [])
    rng = np.random.default_rng(5)
    allV, allF, hV, hF = [], [], [], []
    nv = len(V)
    xs = np.arange(-HX + ROW / 2, HX, ROW)
    ys = np.arange(-HY + HILL / 2, HY, HILL)
    k = 0
    for x in xs:
        for y in ys:
            if len(V) == 0 or tilled_here(x, y, 0.05) or (abs(x - 12.6) < 0.25 or abs(x - 11.2) < 0.25) and y < -8 and SEASON == 'haru':
                continue
            if SEASON == 'aki' and in_track(x, y):
                continue
            a = rng.uniform(0, 2 * math.pi)
            ca, sa = math.cos(a), math.sin(a)
            s = rng.uniform(0.85, 1.15)
            px, py = x + rng.normal(0, 0.012), y + rng.normal(0, 0.012)
            R = np.array([[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]], np.float32) * s
            allV.append(V @ R.T + np.array([px, py, field_height(px, py)], np.float32))
            allF.append(np.array(F, np.int64) + k * nv)
            if len(HV):
                hV.append(HV @ R.T + np.array([px, py, field_height(px, py)], np.float32))
                hF.append(np.array(HF, np.int64) + k * len(HV))
            k += 1
    for name, mat, Vl, Fl in (('_stubble', 'stubble', allV, allF), ('_hikobae', 'hikobae', hV, hF)):
        if not Vl:
            continue
        me = bpy.data.meshes.new(name)
        Vs = np.concatenate(Vl)
        me.vertices.add(len(Vs))
        me.vertices.foreach_set('co', Vs.ravel())
        Fs = np.concatenate(Fl)
        me.loops.add(Fs.size)
        me.loops.foreach_set('vertex_index', Fs.ravel().astype(np.int32))
        me.polygons.add(len(Fs))
        me.polygons.foreach_set('loop_start', np.arange(0, Fs.size, 4, dtype=np.int32))
        me.update()
        me.materials.append(bpy.data.materials[mat])
        st = bpy.data.objects.new(name, me)
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
            o.location = TRACTOR_AT + Vector((0, 0, -0.09 if SEASON == 'shirokaki' else 0.0))   # 代かきは泥に少し沈む
        if o.parent is None and o.name.startswith('Rotary'):
            o.location = TRACTOR_AT + Vector((0, bt.ROTARY_Y, -0.12 if SEASON == 'shirokaki' else -0.06))
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
    sky.sun_elevation = math.radians({'haru': 38, 'aki': 27, 'shirokaki': 52}[SEASON])
    sky.sun_rotation = math.radians(bt.SUN_ROT)
    bg = w.node_tree.nodes['Background']
    w.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = bt.SKY_STRENGTH
    hide = [bpy.data.objects[n] for n in ('FieldTilled', 'StubbleHill', 'HikobaeHill') if n in bpy.data.objects]
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
        sc.render.filepath = os.path.join(HERE, 'preview_' + k.replace('field', 'field' + SEASONS[SEASON], 1) + '.png')
        bpy.ops.render.render(write_still=True)
        print('wrote', k)
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in hide:
        o.hide_render = False


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bt.GRID = 1e6                                                       # 田んぼでは箱を細かく割らない（AO を焼かない）
    make_materials()
    build_field()
    build_surroundings()
    grass_tufts()
    if SEASON == 'aki':
        build_tracks()
    if SEASON != 'shirokaki':                                           # 代かきの田んぼには切り株は無い
        stubble_template()
    root = bpy.data.objects.new('Tanbo', None)
    bpy.context.scene.collection.objects.link(root)
    I = Matrix()
    for nm in ('Field', 'FieldTilled', 'Levees', 'Road', 'Canal', 'Facilities', 'Neighbors', 'NeighborsTilled', 'Poles', 'Trees', 'Houses', 'Hills', 'GrassTufts', 'Tracks'):
        if nm in bt.GROUPS:
            bt.finalize(nm, I, root)
    ob = bpy.data.objects
    if 'StubbleHill' in bt.GROUPS:
        bt.finalize('StubbleHill', Matrix(), root).location.z = -5.0     # 型（ゲームで並べる。原点＝株の根元）。地面の下にしまっておく
    if 'HikobaeHill' in bt.GROUPS:                                       # ひこばえの型も同じ。法線は上へ向けて草と同じ明るさに
        h = bt.finalize('HikobaeHill', Matrix(), root)
        h.location.z = -5.0
        h.data.normals_split_custom_set_from_vertices([(0.0, 0.0, 1.0)] * len(h.data.vertices))
    me = ob['GrassTufts'].data                                           # 草の板は法線を上に向け、地面と同じように明るくする
    me.normals_split_custom_set_from_vertices([(0.0, 0.0, 1.0)] * len(me.vertices))
    add_macro(ob['Field'], untilled_macro)
    add_macro(ob['FieldTilled'], lambda x, y: (0.88 + 0.1 * low_noise(x, y, 5.0),) * 3)
    add_macro(ob['Neighbors'], lambda x, y: (0.82 + 0.14 * low_noise(x, y, 30.0),) * 3)
    add_macro(ob['NeighborsTilled'], lambda x, y: (0.85 + 0.1 * low_noise(x, y, 9.0),) * 3)
    add_macro(ob['Levees'], lambda x, y: (0.9 + 0.1 * low_noise(x, y, 5.0),) * 3)
    road_macro = lambda x, y: (0.85 if any(abs(x - r) < 0.35 for r in (ROAD_X0 + 1.1, ROAD_X1 - 1.1)) else 1.0,) * 3   # 車の通る 2 本の筋
    add_macro(ob['Road'], road_macro)
    add_macro(ob['Houses'], lambda x, y: (0.85 + 0.12 * low_noise(x, y, 6.0),) * 3)
    def hill_macro(x, y):                                               # 山：谷は暗く、ところどころ色のちがう林
        a = math.atan2(y, x)
        v = 0.78 + 0.16 * math.sin(a * 23 + 1.3) * math.sin(a * 7.1) + 0.06 * math.sin(a * 61)
        return (v, v, v * 1.02)
    add_macro(ob['Hills'], hill_macro)
    print('triangles', bt.tri_count())


def export():
    out = os.path.join(HERE, f'field_tanbo{SEASONS[SEASON]}.glb')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_draco_mesh_compression_enable=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_image_format='AUTO')
    print('glb', os.path.basename(out), os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    for SEASON in SEASON_LIST:
        print('season', SEASON)
        build()
        if RENDER:
            preview()
        export()

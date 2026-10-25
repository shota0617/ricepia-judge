# にしおさんぽGO：めいろの 壁（生け垣）を Blender で作り、ドット絵の シートに 焼く → nishio-go/art/hedge.png
# - 地図の めいろの 壁は マスの さかいに 0.5マスの 厚み（pixel.js の drawMaze）。地図の 1マス＝16点 なので、厚み 8点
# - 横の 生け垣・たての 生け垣：8マスぶんの 長さで くり返す 帯（はしと はしが つながる）。ゲームは 地図の 位置で 帯を 切りとって 貼るので、
#   どんなに 長い 生け垣でも つなぎ目が 出ない。花の 帯は 同じ 葉っぱに つつじの 花を のせたもの（春に 使う）
# - 株：生け垣の かど（マスの すみ）に 置く 丸い 植えこみ（12×12。4通り）
# - 真上から 見下ろす（地図の 当たりの 形と ぴったり 同じ）。光は 左上から（上と 左の 葉が 明るく、右下が 影）
# - しくみは pixel-art.py と 同じ：Cycles で 4倍の 大きさに 2回 描き（光の 当たり具合／材質ごとの 色分け）、明るさを 段に 分けて 材質の 色に 置きかえる
# 使い方：pip install bpy（Blender 5.x の Python 版）→ python tools/blender/hedge.py
import importlib.util
import math
import os
import random

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('pixelart', os.path.join(HERE, 'pixel-art.py'))
PA = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(PA)   # 立体を作る道具（sphere・box）と、描く道具（setup_scene・set_materials・render）を借りる
import bpy  # noqa: E402

ROOT = PA.ROOT
OUT = os.path.join(ROOT, 'nishio-go', 'art', 'hedge.png')
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-hedge')
U, SS = 16, 4            # 1マスの 点の数・描く ときの 倍率
L = 8                    # 帯の 長さ（マス）
TH = 0.5                 # 生け垣の 厚み（マス）
POST, NPOST = 12, 4      # 株の 大きさ（点）と 数
OUTLINE = (0x0d, 0x22, 0x19)   # いまの 壁の 黒い ふちと 同じ 色
# 材質の 色：段の 数だけ（暗い → 明るい）。葉は 4段、花は 3段
COLS = {
    'ha': ['#1d5a3e', '#2f7a58', '#4c9c62', '#86cc7e'],
    'hana': ['#c2477c', '#ef7aa8', '#ffc3dc'],
    'shin': ['#5a3a22', '#7a5434', '#7a5434'],   # 株の 根もと（すきまから 見える 幹）
}
BANDS = {'ha': (0.30, 0.55, 0.80), 'hana': (0.45, 0.78), 'shin': (0.5, 0.9)}


def hex2rgb(h):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def clumps(rng, length, horiz, z0=0.0):
    """生け垣の 葉の かたまり：帯の 中に 小さな 球を たくさん。くり返しで つながるよう、はしの 近くの 球は 反対の はしにも 置く"""
    out = []
    n = int(length * 24)
    for _ in range(n):
        a = rng.uniform(0, length)
        b = rng.uniform(-TH / 2 + 0.08, TH / 2 - 0.08)
        r = rng.uniform(0.13, 0.2)   # ひとつの かたまりが 2〜3点（ドット絵で 葉の かたまりが 見える 大きさ）
        z = z0 + rng.uniform(0.38, 0.52) - (abs(b) / (TH / 2)) ** 2 * 0.1   # まん中が 高く、へりが 少し 低い（こんもり）
        out.append((a, b, z, r))
    return out


def place(cl, length, horiz, mat):
    for i, (a, b, z, r) in enumerate(cl):
        for sh in (-length, 0, length):   # くり返しの ための 写し
            x = a + sh
            if not (-0.3 <= x <= length + 0.3):
                continue
            loc = (x, b, z) if horiz else (b, x, z)
            PA.sphere(f'{mat}{i}_{sh}', mat, r, loc, (1, 1, 0.8))


def camera(sc, cx, cy, w, h):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w, h)
    cam.location = (cx, cy, 10)
    cam.rotation_euler = (0, 0, 0)   # 真上から
    sc.camera = cam
    sc.render.resolution_x = int(round(w * U * SS))
    sc.render.resolution_y = int(round(h * U * SS))
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.4
    sun.data.angle = math.radians(4)
    sun.rotation_euler = (math.radians(38), math.radians(-30), math.radians(-35))   # 左上から


def bake(name, build, w, h, cx, cy):
    """build() で 立体を 作り、w×h マスを 真上から 描いて、材質と 明るさの 段から 色を 決める（RGBA の 配列）"""
    sc = PA.setup_scene()
    build()
    camera(sc, cx, cy, w, h)
    os.makedirs(TMP, exist_ok=True)
    names = PA.set_materials('id')
    ids = PA.render(sc, os.path.join(TMP, f'{name}-id.png'), 1)
    PA.set_materials('light')
    light = PA.render(sc, os.path.join(TMP, f'{name}-light.png'), 48)
    c = SS // 2
    Ls, Is = light[c::SS, c::SS], ids[c::SS, c::SS]
    hh, ww = Ls.shape[:2]
    id_srgb = np.array([PA.srgb((i + 1) / (len(names) + 1)) for i in range(len(names))])
    lum = Ls[..., :3].mean(axis=2) / np.maximum(Ls[..., 3], 1e-4)
    out = np.zeros((hh, ww, 4), dtype=np.uint8)
    for y in range(hh):
        for x in range(ww):
            if Is[y, x, 3] <= 0.5:
                continue
            k = names[int(np.argmin(np.abs(id_srgb - Is[y, x, 0])))]
            band = sum(lum[y, x] >= t for t in BANDS[k])
            out[y, x, :3] = hex2rgb(COLS[k][min(band, len(COLS[k]) - 1)])
            out[y, x, 3] = 255
    return out


def strip(horiz, flowers, seed=7):
    rng = random.Random(seed)
    cl = clumps(rng, L, horiz)
    fl = [(a, b * 0.7, z + r * 0.75, 0.075) for (a, b, z, r) in random.Random(seed + 1).sample(cl, len(cl) // 3)] if flowers else []   # 花は 葉の かたまりの 上に

    def build():
        PA.MATS.setdefault('ha', COLS['ha'][1]); PA.MATS.setdefault('hana', COLS['hana'][1])
        PA.box('dodai', 'ha', ((L + 1, TH, 0.36) if horiz else (TH, L + 1, 0.36)), ((L / 2, 0, 0.18) if horiz else (0, L / 2, 0.18)))   # 土台（すきまから 下が 見えない ように）
        place(cl, L, horiz, 'ha')
        if fl:
            place(fl, L, horiz, 'hana')
    if horiz:
        return bake(f'h{int(flowers)}', build, L, TH, L / 2, 0)
    return bake(f'v{int(flowers)}', build, TH, L, 0, L / 2)


def post(i):
    rng = random.Random(100 + i)
    R = POST / U / 2   # 株の 半径（マス）

    def build():
        PA.MATS.setdefault('ha', COLS['ha'][1]); PA.MATS.setdefault('shin', COLS['shin'][1]); PA.MATS.setdefault('hana', COLS['hana'][1])
        PA.sphere('base', 'shin', R * 0.35, (0, 0, 0.15))
        for j in range(60):
            a, d = rng.uniform(0, math.tau), R * math.sqrt(rng.random()) * 0.82
            z = 0.62 - (d / R) ** 2 * 0.2
            PA.sphere(f'p{j}', 'ha', rng.uniform(0.07, 0.12), (math.cos(a) * d, math.sin(a) * d, z), (1, 1, 0.8))
        if i == 3:   # 1つは 花の 株（春の かど）
            for j in range(9):
                a, d = rng.uniform(0, math.tau), R * rng.uniform(0.2, 0.7)
                PA.sphere(f'f{j}', 'hana', 0.05, (math.cos(a) * d, math.sin(a) * d, 0.7))
    return bake(f'p{i}', build, POST / U, POST / U, 0, 0)


def outline_long(arr, horiz):
    """帯の 長い 2辺（横なら 上と 下、たてなら 左と 右）に 黒い ふち。はしは つなぐので ふちを 付けない"""
    a = arr.copy()
    if horiz:
        a[0, :, :3] = OUTLINE; a[-1, :, :3] = OUTLINE; a[0, :, 3] = a[-1, :, 3] = 255
    else:
        a[:, 0, :3] = OUTLINE; a[:, -1, :3] = OUTLINE; a[:, 0, 3] = a[:, -1, 3] = 255
    return a


def outline_round(arr):
    a = arr.copy()
    op = a[..., 3] > 0
    edge = np.zeros_like(op)
    edge[1:, :] |= ~op[:-1, :]; edge[:-1, :] |= ~op[1:, :]; edge[:, 1:] |= ~op[:, :-1]; edge[:, :-1] |= ~op[:, 1:]
    edge[0, :] = edge[-1, :] = True; edge[:, 0] = edge[:, -1] = True
    edge &= op
    a[edge, :3] = OUTLINE
    return a


if __name__ == '__main__':
    # シートの 並び（左上から）：横の 帯（128×8）・横の 花の 帯・たての 帯（8×128）・たての 花の 帯・株 4つ（12×12）
    LW, TW = L * U, int(TH * U)
    h0, h1 = outline_long(strip(True, False), True), outline_long(strip(True, True), True)
    v0, v1 = outline_long(strip(False, False, 11), False), outline_long(strip(False, True, 11), False)
    posts = [outline_round(post(i)) for i in range(NPOST)]
    W, H = LW, TW * 2 + LW
    sheet = np.zeros((H, W, 4), dtype=np.uint8)
    sheet[0:TW, 0:LW] = h0[:TW, :LW]
    sheet[TW:2 * TW, 0:LW] = h1[:TW, :LW]
    sheet[2 * TW:2 * TW + LW, 0:TW] = v0[:LW, :TW]
    sheet[2 * TW:2 * TW + LW, TW:2 * TW] = v1[:LW, :TW]
    for i, p in enumerate(posts):
        x0, y0 = 2 * TW + 4 + i * (POST + 2), 2 * TW + 4
        sheet[y0:y0 + POST, x0:x0 + POST] = p[:POST, :POST]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img = bpy.data.images.new('hedge', W, H, alpha=True)   # Blender で PNG に 書く（ほかの 道具は いらない）
    img.pixels[:] = (sheet[::-1].astype(np.float32) / 255).ravel()
    img.filepath_raw = OUT
    img.file_format = 'PNG'
    img.save()
    print('wrote', os.path.relpath(OUT, ROOT), sheet.shape[1], 'x', sheet.shape[0])

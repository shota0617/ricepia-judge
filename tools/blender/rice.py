# にしおさんぽGO：主人公の「お米」（ひと粒の白いお米）を Blender で作り、転がる 32×32 のドット絵に焼く
# - 立った たて長のつぶ（右上の かたに 胚芽のところの くぼみ）に、丸い目と にっこりの口。歩く地図の主人公の代わりに、転がって進む
# - 転がる絵は、つぶが はしからはしへ でんぐり返る 8コマ（45度ずつ）。2つの向き：
#     side  … 右へ進むとき（奥行きの軸のまわりに回る）。左へ進むときは、左右を反転して逆の順で使う
#     front … 下（手前）へ進むとき（横の軸のまわりに回る）。上（奥）へ進むときは逆の順で使う
#   止まっているときは 1コマめ（立って、こっちを見て にっこり）
# - できた絵は1枚のシート nishio-go/art/rice.png（32×32 が 横8 × たて2。1行め side・2行め front）
# 使い方：pip install bpy（Blender 5.1 の Python 版。Python 3.13）
#         python tools/blender/rice.py
import importlib.util
import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)
import bpy  # noqa: E402  （pixel-art.py が先に読み込んでいる）

box, sphere = pa.box, pa.sphere
_tones = pa.tones
RICE_TONES = {'#f7f6f0': [(214, 218, 230), (246, 245, 238), (255, 255, 255)], '#0e0e0e': [(14, 14, 14)] * 3}   # お米は影を やわらかい白に、目と口は まっ黒のまま
pa.tones = lambda h: RICE_TONES.get(h) or _tones(h)
TMPD = os.path.join(pa.TMP, 'rice')
pa.OUT = TMPD
pa.MATS.update({'kome': '#f7f6f0', 'riceEye': '#0e0e0e'})
FRAMES = 8
N = 32   # 1コマの大きさ（32×32。歩く地図には 2マスで描くので、ドットの大きさは ほかの絵と同じ）
CENTER_Z = 0.43   # つぶのまん中の高さ（立って地面につく高さ。回っても 同じ高さ。影はゲームのほうで描く）


def grain():
    """立った お米のつぶ（たて長の だ円。右上の かたに 胚芽のところの くぼみ）。顔は手前（-y）の面に：丸い目2つと、にっこりの口"""
    kome = smooth_sphere('kome', 'kome', 0.30, (0, 0, 0), (1.0, 0.85, 1.42))   # なめらかな丸み（細かい球）
    cut = smooth_sphere('cut', 'kome', 0.19, (0.22, 0, 0.47), (1, 1.6, 1.15))   # 胚芽のところの くぼみ（右上を けずる）
    m = kome.modifiers.new('notch', 'BOOLEAN')
    m.operation, m.object = 'DIFFERENCE', cut
    bpy.context.view_layer.objects.active = kome
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cut, do_unlink=True)
    parts = [kome]
    bpy.ops.object.shade_smooth()
    for x in (-0.085, 0.085):
        parts.append(smooth_sphere(f'eye{x}', 'riceEye', 0.04, (x, -0.245, 0.03), (1, 0.6, 1)))   # 丸い目（転がる絵のため。止まった絵は compose で描きなおす）
    for k in range(11):   # にっこりの口（はしが上がった 細い弧）
        u = (k - 5) / 5
        parts.append(smooth_sphere(f'kuchi{k}', 'riceEye', 0.022, (0.15 * u, -0.25, -0.09 + 0.07 * u * u)))
    return parts


def smooth_sphere(name, mat, r, loc, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=64, ring_count=32)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.data.materials.append(pa.material(mat))
    bpy.ops.object.shade_smooth()
    return o


def rolled(kind, i):
    def model():
        piv = bpy.data.objects.new('piv', None)
        bpy.context.scene.collection.objects.link(piv)
        for o in grain():
            o.parent = piv
        a = -i * 2 * math.pi / FRAMES
        piv.location = (0, 0, CENTER_Z)
        piv.rotation_euler = (0, -a, 0) if kind == 'side' else (a, 0, 0)   # side：右へ転がる（y 軸まわり）・front：手前へ転がる（x 軸まわり）
        return dict(target=(0, 0, CENTER_Z), scale=1.02, el=16, az=0, size=N)
    return model


ORDER = [f'{k}-{i}' for k in ('side', 'front') for i in range(FRAMES)]


# 止まっている絵（side・front の1コマめ）の顔は、見本のイメージどおりに 点で描く：丸い目2つ（2×2）と、はしが上がった 細くて広い にっこりの口
FACE = r"""
im = Image.open(dst).convert('RGBA'); px = im.load()
EYE = (14, 14, 14, 255); BODY = (246, 245, 238, 255); OUT = (26, 26, 26, 255)
# まわりの線を なめらかに：つぶの形（ふちどりの内がわ）を 3×3 の多数決で ならし、でこぼこの1点を けずって・うめてから、ふちどりを描きなおす
for r in (0, 1):
    for c in range(8):
        x0, y0 = c * N, r * N
        inside = lambda x, y: x0 <= x < x0 + N and y0 <= y < y0 + N and px[x, y][3] and px[x, y][:3] != OUT[:3]
        m = {(x, y): inside(x, y) for y in range(y0, y0 + N) for x in range(x0, x0 + N)}
        for _ in range(2):
            n = {}
            for (x, y), v in m.items():
                k = sum(m.get((x + i, y + j), False) for i in (-1, 0, 1) for j in (-1, 0, 1))
                n[(x, y)] = k >= 5
            m = n
        for (x, y), v in m.items():
            if v and not inside(x, y):   # うめた所は、となりの つぶの色
                near = [px[x + i, y + j] for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1)) if (x + i, y + j) in m and inside(x + i, y + j)]
                px[x, y] = near[0] if near else BODY
            elif not v:
                px[x, y] = (0, 0, 0, 0)
        for (x, y), v in m.items():
            if not v and any(m.get((x + i, y + j), False) for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = OUT
for r in (0, 1):
    x0, y0 = 0, r * N
    for y in range(y0, y0 + N):   # 描いた顔を消す（目と口の まっ黒な点）
        for x in range(x0, x0 + N):
            if px[x, y] == EYE: px[x, y] = BODY
    body = [(x, y) for y in range(y0, y0 + N) for x in range(x0, x0 + N) if px[x, y][3] and px[x, y][:3] != OUT[:3]]
    xs = [p[0] for p in body]; ys = [p[1] for p in body]
    cx = (min(xs) + max(xs)) // 2 - 1; ey = min(ys) + (max(ys) - min(ys)) * 50 // 100
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):   # 目
        px[cx - 3 + dx, ey + dy] = EYE; px[cx + 3 + dx, ey + dy] = EYE
    for dx, dy in ((-4, 3), (-3, 4), (-2, 5), (-1, 5), (0, 5), (1, 5), (2, 5), (3, 5), (4, 4), (5, 3)):   # にっこりの口
        px[cx + dx, ey + dy] = EYE
im.save(dst)
"""


def compose():
    script = (
        'import sys,os\nfrom PIL import Image\n'
        'src,dst,n=sys.argv[1],sys.argv[2],int(sys.argv[3])\n'
        'N=int(sys.argv[4])\nW=Image.new("RGBA",(N*n,N*2),(0,0,0,0))\n'
        'for r,k in enumerate(("side","front")):\n'
        '  for i in range(n): W.paste(Image.open(os.path.join(src,f"{k}-{i}.png")),(N*i,N*r))\n'
        'W.save(dst)\n'
        + FACE)
    dst = os.path.join(pa.ROOT, 'nishio-go', 'art', 'rice.png')
    subprocess.run(['python3', '-c', script, TMPD, dst, str(FRAMES), str(N)], check=True)
    print('wrote', os.path.relpath(dst, pa.ROOT))


if __name__ == '__main__':
    pa.MODELS.clear()
    for name in ORDER:
        k, i = name.split('-')
        pa.MODELS[name] = rolled(k, int(i))
    os.makedirs(TMPD, exist_ok=True)
    for name in ORDER:
        pa.make(name)
    compose()

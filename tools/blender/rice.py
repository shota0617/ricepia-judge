# にしおさんぽGO：主人公の「お米」（ひと粒の白いお米）を Blender で作り、転がる 16×16 のドット絵に焼く
# - たて長のつぶ（はしに胚芽のくぼみ、たてのすじ4本）に、ポケモンの歩く人と同じ大きさの目（黒・横1×縦2）。歩く地図の主人公の代わりに、転がって進む
# - 転がる絵は、つぶが はしからはしへ でんぐり返る 8コマ（45度ずつ）。2つの向き：
#     side  … 右へ進むとき（奥行きの軸のまわりに回る）。左へ進むときは、左右を反転して逆の順で使う
#     front … 下（手前）へ進むとき（横の軸のまわりに回る）。上（奥）へ進むときは逆の順で使う
#   止まっているときは 1コマめ（寝ころんで、こっちを見ている）
# - できた絵は1枚のシート nishio-go/art/rice.png（16×16 が 横8 × たて2。1行め side・2行め front）
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
TMPD = os.path.join(pa.TMP, 'rice')
pa.OUT = TMPD
pa.MATS.update({'kome': '#f7f5ec', 'haiga': '#e2d29a', 'riceEye': '#1a1a1a', 'hoho': '#f4a8a8', 'suji': '#d8cfae'})
FRAMES = 8
CENTER_Z = 0.30   # つぶのまん中の高さ（回っても 同じ高さ。影はゲームのほうで描く）


def grain():
    """寝ころんだ お米のつぶ（長い軸は x）。目は手前（-y）の面に"""
    parts = [sphere('kome', 'kome', 0.30, (0, 0, 0), (1.55, 1.0, 0.92))]
    parts.append(sphere('haiga', 'haiga', 0.085, (-0.43, -0.12, 0.05), (0.8, 1.0, 1.1)))   # はしの胚芽のくぼみ
    for k in range(4):   # お米の たてのすじ（つぶの長い向きに4本。回ると動いて見えるので、手前・奥へ転がるときも ころころが分かる）
        a = math.pi / 4 + k * math.pi / 2
        parts.append(box(f'suji{k}', 'suji', (0.62, 0.035, 0.035), (0, 0.285 * math.cos(a), 0.262 * math.sin(a)), (a, 0, 0)))
    for x in (-0.10, 0.10):
        parts.append(box(f'eye{x}', 'riceEye', (0.08, 0.04, 0.16), (x, -0.29, 0.05)))   # 目（ポケモンの歩く人と同じ 横1×縦2）
    for x in (-0.20, 0.20):
        parts.append(sphere(f'hoho{x}', 'hoho', 0.04, (x, -0.27, -0.06), (1.2, 0.5, 0.8)))   # ほっぺ
    return parts


def rolled(kind, i):
    def model():
        piv = bpy.data.objects.new('piv', None)
        bpy.context.scene.collection.objects.link(piv)
        for o in grain():
            o.parent = piv
        a = -i * 2 * math.pi / FRAMES
        piv.location = (0, 0, CENTER_Z)
        piv.rotation_euler = (0, -a, 0) if kind == 'side' else (a, 0, 0)   # side：右へ転がる（y 軸まわり）・front：手前へ転がる（x 軸まわり）
        return dict(target=(0, 0, CENTER_Z), scale=1.25, el=24, az=0, size=16)
    return model


ORDER = [f'{k}-{i}' for k in ('side', 'front') for i in range(FRAMES)]


def compose():
    script = (
        'import sys,os\nfrom PIL import Image\n'
        'src,dst,n=sys.argv[1],sys.argv[2],int(sys.argv[3])\n'
        'W=Image.new("RGBA",(16*n,32),(0,0,0,0))\n'
        'for r,k in enumerate(("side","front")):\n'
        '  for i in range(n): W.paste(Image.open(os.path.join(src,f"{k}-{i}.png")),(16*i,16*r))\n'
        'W.save(dst)\n')
    dst = os.path.join(pa.ROOT, 'nishio-go', 'art', 'rice.png')
    subprocess.run(['python3', '-c', script, TMPD, dst, str(FRAMES)], check=True)
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

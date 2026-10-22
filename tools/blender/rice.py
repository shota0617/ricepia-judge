# にしおさんぽGO：主人公の「お米」（ひと粒の白いお米）を Blender で作り、転がる 24×24 のドット絵に焼く
# - 立った たて長のつぶ（右上の かたに 胚芽のところの くぼみ）に、丸い目と にっこりの口。歩く地図の主人公の代わりに、転がって進む
# - 転がる絵は、つぶが はしからはしへ でんぐり返る 8コマ（45度ずつ）。2つの向き：
#     side  … 右へ進むとき（奥行きの軸のまわりに回る）。左へ進むときは、左右を反転して逆の順で使う
#     front … 下（手前）へ進むとき（横の軸のまわりに回る）。上（奥）へ進むときは逆の順で使う
#   止まっているときは 1コマめ（立って、こっちを見て にっこり）
# - できた絵は1枚のシート nishio-go/art/rice.png（24×24 が 横8 × たて2。1行め side・2行め front）
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
N = 24   # 1コマの大きさ（24×24。歩く地図には 1.5マスで描くので、ドットの大きさは ほかの絵と同じ）
CENTER_Z = 0.43   # つぶのまん中の高さ（立って地面につく高さ。回っても 同じ高さ。影はゲームのほうで描く）


def grain():
    """立った お米のつぶ（たて長の だ円。右上の かたに 胚芽のところの くぼみ）。顔は手前（-y）の面に：丸い目2つと、にっこりの口"""
    kome = sphere('kome', 'kome', 0.30, (0, 0, 0), (1.0, 0.85, 1.42))
    cut = sphere('cut', 'kome', 0.19, (0.22, 0, 0.47), (1, 1.6, 1.15))   # 胚芽のところの くぼみ（右上を けずる）
    m = kome.modifiers.new('notch', 'BOOLEAN')
    m.operation, m.object = 'DIFFERENCE', cut
    bpy.context.view_layer.objects.active = kome
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cut, do_unlink=True)
    parts = [kome]
    for x in (-0.09, 0.09):
        parts.append(sphere(f'eye{x}', 'riceEye', 0.05, (x, -0.245, 0.05), (1, 0.6, 1.1)))   # 丸い目
    for k in range(7):   # にっこりの口（まん中が下がった弧）
        u = (k - 3) / 3
        parts.append(box(f'kuchi{k}', 'riceEye', (0.05, 0.03, 0.055), (0.12 * u, -0.25, -0.07 - 0.06 * (1 - u * u))))
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
        return dict(target=(0, 0, CENTER_Z), scale=1.25, el=16, az=0, size=N)
    return model


ORDER = [f'{k}-{i}' for k in ('side', 'front') for i in range(FRAMES)]


def compose():
    script = (
        'import sys,os\nfrom PIL import Image\n'
        'src,dst,n=sys.argv[1],sys.argv[2],int(sys.argv[3])\n'
        'N=int(sys.argv[4])\nW=Image.new("RGBA",(N*n,N*2),(0,0,0,0))\n'
        'for r,k in enumerate(("side","front")):\n'
        '  for i in range(n): W.paste(Image.open(os.path.join(src,f"{k}-{i}.png")),(N*i,N*r))\n'
        'W.save(dst)\n')
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

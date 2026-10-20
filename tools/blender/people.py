# にしおさんぽGO：歩く地図の人（主人公と西尾の人たち10種類）を Blender で作り、16×16 のドット絵に焼く
# - 2頭身の立体（大きな頭・胴・腕・足）。歩く2コマ（足と腕を前後に）。主人公は 下・上・横 の3方向
# - 色は pixel.js の NPC_COLORS と主人公の色に合わせる。人ごとの小物：おじいさんの杖・おばあさんのおだんご髪・子どもの帽子・
#   学生の帽子とえり・漁師さんの はちまき・お店の人のエプロン・ガイドさんの旗・お坊さんの袈裟
# - できた絵は1枚のシート nishio-go/art/people.png（16×16 が横に並ぶ。並びは pixel.js の PEOPLE_ORDER）
# 使い方：python tools/blender/people.py
import importlib.util
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
TMPD = os.path.join(pa.TMP, 'people')
pa.OUT = TMPD

NPC = {   # pixel.js の NPC_COLORS（h 髪・c 服・p ズボン・a 小物）
    'elder': ('#c8c8c8', '#6d5a44', '#4a4a4a', '#6d5a44'), 'granny': ('#eeeeee', '#8e5a9e', '#5b3f66', '#8e5a9e'),
    'man': ('#2b2018', '#3f7fbf', '#2d3a55', '#3f7fbf'), 'woman': ('#5a3418', '#e57373', '#6b4b3a', '#e57373'),
    'kid': ('#2b2018', '#ffb300', '#3b6fd1', '#ffb300'), 'student': ('#1d1d1d', '#203a63', '#203a63', '#ffffff'),
    'fisher': ('#ffffff', '#3a7bd5', '#2a2a2a', '#ffcc00'), 'staff': ('#3b2a1a', '#2e7d32', '#3e3e3e', '#ffffff'),
    'guide': ('#3b2a1a', '#f2c230', '#4a4a4a', '#d23a2e'), 'monk': ('#f4c58f', '#2b2b2b', '#2b2b2b', '#b88a12'),
}
HERO = ('#f2c230', '#3f7fbf', '#2d3a55', '#3f7fbf')   # 主人公：黄色い髪・青い服
ORDER = [f'{k}-{f}' for k in NPC for f in (0, 1)] + [f'hero-{d}-{f}' for d in ('down', 'up', 'right') for f in (0, 1)]


def person(look, frame, facing='down'):
    h, c, p, a = HERO if look == 'hero' else NPC[look]
    pa.MATS.update({'pHair': h, 'pCloth': c, 'pPants': p, 'pAcc': a, 'pSkin': '#f4c9a0', 'pShoe': '#3a2a20', 'pEye': '#2a2a2a'})
    sw = 0.10 if frame else -0.10                                   # 歩く：足と腕を前後に
    kid = look == 'kid'
    s = 0.85 if kid else 1.0
    for side, d in ((-1, sw), (1, -sw)):                            # 足（ズボン）と くつ
        box(f'leg{side}', 'pPants', (0.13 * s, 0.13 * s, 0.24 * s), (side * 0.08 * s, d, 0.12 * s))
        box(f'shoe{side}', 'pShoe', (0.14 * s, 0.17 * s, 0.05 * s), (side * 0.08 * s, d - 0.02, 0.025))
    box('body', 'pCloth', (0.34 * s, 0.24 * s, 0.30 * s), (0, 0, 0.38 * s), bevel=0.04)
    for side, d in ((-1, -sw), (1, sw)):                            # 腕（服）と手
        box(f'arm{side}', 'pCloth', (0.09 * s, 0.10 * s, 0.24 * s), (side * 0.22 * s, d * 0.8, 0.38 * s), bevel=0.02)
        sphere(f'hand{side}', 'pSkin', 0.05 * s, (side * 0.22 * s, d * 0.8, 0.25 * s))
    hz = 0.53 * s + 0.21 * s
    sphere('head', 'pSkin', 0.21 * s, (0, 0, hz), (1.05, 1, 0.95))
    face = -1 if facing == 'down' else 1 if facing == 'up' else 0  # 顔の向き（-y がカメラ側）
    if look == 'monk':                                               # お坊さん：髪なし、袈裟
        box('kesa', 'pAcc', (0.06, 0.25, 0.32), (0.06, 0, 0.39), (0, 0.6, 0))
    else:
        # 髪は頭の上とうしろ（顔の向きと反対へずらす）。前から見ると顔が出る
        back = {'down': (0, 0.07), 'up': (0, -0.02), 'right': (-0.07, 0.0)}[facing]
        sphere('hair', 'pHair', 0.225 * s, (back[0] * s, back[1] * s, hz + 0.06 * s), (1.07, 1.02, 0.85))
        if facing == 'down':
            box('bang', 'pHair', (0.34 * s, 0.08, 0.07 * s), (0, -0.15 * s, hz + 0.12 * s))   # 前髪
        if look == 'granny':
            sphere('bun', 'pHair', 0.09, (0, 0.12, hz + 0.18))
        if look in ('woman',):
            box('long', 'pHair', (0.38 * s, 0.14, 0.26), (0, 0.10, hz - 0.12))
    if facing == 'down':   # 目（16×16 で1点になる大きさ）
        for side in (-1, 1):
            box(f'eye{side}', 'pEye', (0.065, 0.03, 0.075), (side * 0.085 * s, -0.20 * s, hz - 0.01))
    elif facing == 'right':
        box('eye', 'pEye', (0.03, 0.065, 0.075), (0.21 * s, -0.05, hz - 0.01))
    # 小物
    if look == 'elder':
        cyl('cane', 'woodD', 0.015, 0.45, (0.30, -0.06, 0.22), (0, 0.15, 0), 6)
    elif look == 'kid':
        cyl('cap', 'capY', 0.21 * s, 0.07, (0, 0, hz + 0.15 * s), verts=16)
        box('brim', 'capY', (0.22, 0.14, 0.02), (0, -0.20 * s, hz + 0.12 * s))
    elif look == 'student':
        cyl('cap', 'pCloth', 0.22, 0.06, (0, 0, hz + 0.17), verts=16)
        box('collar', 'collar', (0.20, 0.03, 0.05), (0, -0.125, 0.51))
    elif look == 'fisher':
        cyl('hachimaki', 'towel', 0.235, 0.05, (0, 0, hz + 0.07), verts=16)
    elif look == 'staff':
        box('apron', 'pAcc', (0.28, 0.02, 0.30), (0, -0.13, 0.32))
    elif look == 'guide':
        cyl('pole', 'woodD', 0.012, 0.55, (0.30, 0, 0.45), verts=6)
        box('flag', 'pAcc', (0.14, 0.01, 0.10), (0.37, 0, 0.66))
    az = {'down': 0, 'up': 180, 'right': 90}[facing]
    return dict(target=(0, 0, 0.45), scale=1.22, el=24, az=az, size=16)


def compose():
    """16×16 の絵を ORDER の順に横へ並べて people.png にする（Pillow があるふつうの Python で）"""
    script = (
        'import sys,os\nfrom PIL import Image\n'
        'src,dst,names=sys.argv[1],sys.argv[2],sys.argv[3].split(",")\n'
        'W=Image.new("RGBA",(16*len(names),16),(0,0,0,0))\n'
        'for i,n in enumerate(names): W.paste(Image.open(os.path.join(src,n+".png")),(16*i,0))\n'
        'W.save(dst)\n')
    dst = os.path.join(pa.ROOT, 'nishio-go', 'art', 'people.png')
    subprocess.run(['python3', '-c', script, TMPD, dst, ','.join(ORDER)], check=True)
    print('wrote', os.path.relpath(dst, pa.ROOT), len(ORDER), 'sprites')


if __name__ == '__main__':
    pa.MODELS.clear()
    for name in ORDER:
        parts = name.split('-')
        if parts[0] == 'hero':
            pa.MODELS[name] = (lambda d=parts[1], f=int(parts[2]): person('hero', f, d))
        else:
            pa.MODELS[name] = (lambda k=parts[0], f=int(parts[1]): person(k, f))
    os.makedirs(TMPD, exist_ok=True)
    for name in ORDER:
        pa.make(name)
    compose()

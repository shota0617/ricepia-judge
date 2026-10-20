# にしおさんぽGO：歩く地図の名所（専用の絵がない ふつうの名所）の絵を、名所の種類ごとに Blender で作り、24×24 のドット絵に焼く
# - これまでは公園・史跡・展望などが ぜんぶ同じ手描きの「たからばこ」の絵で、道ばたのたからばこと見分けがつかなかった
# - 公園は とても多い（約1000か所）ので4通り（木とベンチ・すべり台・ブランコ・ジャングルジム）。どれになるかは名所の id で決まる（pixel.js）
# - 注目スポットの型の絵（鳥居・お寺・城・町）もここで作る
# - できた絵は1枚のシート nishio-go/art/spots.png（24×24 が横に並ぶ。並びは下の KINDS ＝ pixel.js の SPOT_ORDER）
#   地図では ふつうの名所は1.5マス（マスと同じ細かさ：16点で1マス）、注目スポットの型の絵は2マスの大きさで描く
# 使い方：python tools/blender/spots.py
import importlib.util
import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
TMPD = os.path.join(pa.TMP, 'spots')
pa.OUT = TMPD
KINDS = ['park0', 'park1', 'park2', 'park3', 'historic', 'view', 'sight', 'art', 'beach', 'museum', 'torii', 'temple', 'castle', 'town']
N = 24

pa.MATS.update({'sSlide': '#e8504a', 'sBarB': '#2f74b8', 'sBarY': '#f2c230', 'sBarR': '#d23a2e', 'sBronze': '#8a6a3a', 'sSign': '#fff8e0',
                'sTile': '#5a6270', 'sPillar': '#b8442e', 'sWall': '#f4f1e8', 'sCrown': '#3f8f3a', 'sNoren': '#2f5d9a'})
CAM = dict(el=30, az=-30, size=N)   # ほかの地図の絵と同じく、左前の斜め上から


def tree(x, y, h=0.5, r=0.24):
    cyl(f'miki{x}{y}', 'woodD', 0.05, h, (x, y, h / 2), verts=8)
    sphere(f'ha{x}{y}', 'sCrown', r, (x, y, h + r * 0.6))


def m_park0():
    """公園：木とベンチ"""
    tree(-0.16, 0.16, 0.36, 0.26)
    box('za', 'bench', (0.44, 0.16, 0.05), (0.16, -0.16, 0.18))
    box('se', 'bench', (0.44, 0.05, 0.16), (0.16, -0.07, 0.3))
    for x in (-0.02, 0.34):
        box(f'ashi{x}', 'dark', (0.04, 0.14, 0.16), (x, -0.15, 0.08))
    return dict(target=(-0.04, 0, 0.32), scale=1.25, **CAM)


def m_park1():
    """公園：すべり台（うしろに階段、上の黄色い台、前へ幅の広い赤いすべる所）"""
    for i in range(4):   # 階段（うしろ）
        box(f'dan{i}', 'steel', (0.3, 0.12, 0.05), (0, 0.44 - i * 0.11, 0.08 + i * 0.12))
    for x in (-0.17, 0.17):
        box(f'tesuri{x}', 'steel', (0.05, 0.05, 0.62), (x, 0.3, 0.31))
        for y in (0.04, 0.2):
            box(f'ashi{x}{y}', 'steel', (0.05, 0.05, 0.5), (x, y, 0.25))
    box('dai', 'sBarY', (0.4, 0.26, 0.07), (0, 0.12, 0.52))
    s = box('suberi', 'sSlide', (0.34, 0.8, 0.06), (0, -0.24, 0.27))
    s.rotation_euler = (-0.66, 0, 0)
    for x in (-0.18, 0.18):
        f = box(f'fuchi{x}', 'sSlide', (0.05, 0.8, 0.1), (x, -0.24, 0.3))
        f.rotation_euler = (-0.66, 0, 0)
    return dict(target=(0, 0, 0.28), scale=1.15, **CAM)


def m_park2():
    """公園：ブランコ（青い柱と横の棒、黄色い板が2つ）"""
    for x in (-0.36, 0.36):
        for sy in (-1, 1):
            box(f'hashira{x}{sy}', 'sBarB', (0.06, 0.06, 0.74), (x, sy * 0.12, 0.35), (sy * 0.32, 0, 0))
    box('yoko', 'sBarB', (0.8, 0.06, 0.06), (0, 0, 0.71))
    for x in (-0.17, 0.17):
        for dx in (-0.08, 0.08):
            box(f'kusari{x}{dx}', 'dark', (0.02, 0.02, 0.44), (x + dx, 0, 0.48))
        box(f'ita{x}', 'sBarY', (0.22, 0.14, 0.04), (x, 0, 0.25))
    return dict(target=(0, 0, 0.36), scale=1.2, **CAM)


def m_park3():
    """公園：ジャングルジム（赤・黄・青の太い棒の箱）"""
    n, s = 2, 0.36
    cols = ('sBarR', 'sBarY', 'sBarB')
    for i in range(n + 1):
        for j in range(n + 1):
            x, y = -s * n / 2 + i * s, -s * n / 2 + j * s
            box(f'tate{i}{j}', cols[(i + j) % 3], (0.05, 0.05, s * n), (x, y, s * n / 2))
            for k in range(1, n + 1):
                if i < n:
                    box(f'yx{i}{j}{k}', cols[k % 3], (s, 0.045, 0.045), (x + s / 2, y, k * s))
                if j < n:
                    box(f'yy{i}{j}{k}', cols[(k + 1) % 3], (0.045, s, 0.045), (x, y + s / 2, k * s))
    return dict(target=(0, 0, 0.36), scale=1.3, **CAM)


def m_historic():
    """史跡：台の上の石碑と、横に小さな石灯ろう"""
    box('dai', 'stone', (0.46, 0.34, 0.1), (-0.08, 0.04, 0.05))
    box('hi', 'zou', (0.24, 0.12, 0.62), (-0.08, 0.04, 0.41), bevel=0.03)
    for i in range(2):
        box(f'moji{i}', 'dark', (0.035, 0.02, 0.38), (-0.13 + i * 0.09, -0.025, 0.44))
    box('tourou0', 'stone', (0.1, 0.1, 0.2), (0.3, -0.2, 0.1))
    box('tourou1', 'stone', (0.18, 0.18, 0.1), (0.3, -0.2, 0.25))
    cyl('tourou2', 'stone', 0.15, 0.1, (0.3, -0.2, 0.35), (0, 0, math.pi / 4), 4, r2=0.02)
    return dict(target=(0, -0.04, 0.32), scale=1.1, **CAM)


def m_view():
    """展望スポット：木の台とさく、まん中に青い双眼鏡（遠めがね）"""
    box('yuka', 'wood', (0.8, 0.56, 0.06), (0, 0, 0.03))
    for x in (-0.37, 0, 0.37):
        box(f'saku{x}', 'woodD', (0.05, 0.05, 0.3), (x, 0.24, 0.18))
    box('sakuY', 'woodD', (0.8, 0.05, 0.05), (0, 0.24, 0.32))
    cyl('pole', 'steel', 0.04, 0.4, (0, -0.04, 0.26), verts=8)
    box('kyou', 'sBarB', (0.34, 0.2, 0.16), (0, -0.04, 0.52), bevel=0.04)
    for x in (-0.08, 0.08):
        cyl(f'lens{x}', 'dark', 0.055, 0.12, (x, 0.08, 0.54), (math.pi / 2, 0, 0), 10)
    return dict(target=(0, 0, 0.3), scale=1.1, **CAM)


def m_sight():
    """名所：屋根のついた案内板（白い板に文字の線）"""
    for x in (-0.3, 0.3):
        box(f'hashira{x}', 'woodD', (0.07, 0.07, 0.64), (x, 0, 0.32))
    box('ita', 'sSign', (0.54, 0.05, 0.36), (0, -0.01, 0.4))
    for i in range(3):
        box(f'moji{i}', 'dark', (0.36 - i * 0.08, 0.02, 0.035), (-0.04 + i * 0.04, -0.04, 0.5 - i * 0.09))
    box('yane', 'sTile', (0.76, 0.24, 0.05), (0, -0.02, 0.68), (0.25, 0, 0), bevel=0.01)
    return dict(target=(0, 0, 0.36), scale=1.05, **CAM)


def m_art():
    """アート：台の上の銅像"""
    box('dai', 'stone', (0.4, 0.4, 0.3), (0, 0, 0.15), bevel=0.02)
    sphere('do', 'sBronze', 0.14, (0, 0, 0.48), (1, 0.8, 1.4))
    sphere('atama', 'sBronze', 0.09, (0, 0, 0.72))
    box('ude', 'sBronze', (0.05, 0.05, 0.22), (0.12, 0, 0.6), (0, -0.7, 0))
    return dict(target=(0, 0, 0.4), scale=1.0, **CAM)


def m_beach():
    """海岸：砂浜と青い海とパラソル"""
    box('umi', 'sea', (0.9, 0.36, 0.04), (0, 0.28, 0.02))
    box('suna', 'sand', (0.9, 0.5, 0.06), (0, -0.14, 0.03))
    cyl('pole', 'white', 0.02, 0.56, (0.02, -0.12, 0.32), (0, 0.15, 0), 6)
    cyl('kasa', 'parasol', 0.34, 0.16, (0.06, -0.12, 0.6), (0, 0.15, 0), 8, r2=0.02)
    cyl('kasaW', 'parasolW', 0.345, 0.04, (0.06, -0.12, 0.53), (0, 0.15, 0), 8)
    return dict(target=(0, 0, 0.3), scale=1.15, **CAM)


def m_museum():
    """資料館：柱の並んだ建物と三角の屋根"""
    box('kidan', 'stone', (0.82, 0.52, 0.08), (0, 0, 0.04))
    for i in range(4):
        cyl(f'hashira{i}', 'sWall', 0.04, 0.34, (-0.27 + i * 0.18, -0.18, 0.25), verts=8)
    box('oku', 'paper', (0.7, 0.28, 0.34), (0, 0.06, 0.25))
    box('to', 'woodD', (0.12, 0.02, 0.2), (0, -0.085, 0.18))
    box('hari', 'sWall', (0.82, 0.48, 0.07), (0, 0, 0.45))
    cyl('sankaku', 'sTile', 0.47, 0.48, (0, 0, 0.56), (math.pi / 2, 0, 0), 3, r2=0.47).scale = (1, 0.36, 1)
    return dict(target=(0, 0, 0.32), scale=1.1, **CAM)


def m_torii():
    """神社：赤い鳥居と石の道"""
    box('michi', 'stone', (0.26, 0.7, 0.03), (0, -0.05, 0.015))
    for x in (-0.3, 0.3):
        cyl(f'hashira{x}', 'torii', 0.055, 0.72, (x, 0, 0.36), verts=10)
    box('kasagi', 'torii', (0.9, 0.1, 0.08), (0, 0, 0.76), bevel=0.02)
    box('kasagiK', 'dark', (0.92, 0.11, 0.03), (0, 0, 0.81))
    box('nuki', 'torii', (0.7, 0.07, 0.06), (0, 0, 0.6))
    box('gaku', 'gold', (0.1, 0.03, 0.12), (0, -0.04, 0.68))
    return dict(target=(0, 0, 0.42), scale=1.12, **CAM)


def m_temple():
    """お寺：石の台の上の本堂（朱の柱・白い壁・瓦屋根）"""
    box('kidan', 'stone', (0.84, 0.62, 0.08), (0, 0, 0.04))
    box('kabe', 'sWall', (0.62, 0.42, 0.3), (0, 0, 0.23))
    for x in (-0.3, -0.1, 0.1, 0.3):
        box(f'hashira{x}', 'sPillar', (0.045, 0.045, 0.3), (x, -0.22, 0.23))
    box('to', 'woodD', (0.2, 0.02, 0.22), (0, -0.215, 0.19))
    cyl('yane', 'kawara', 0.58, 0.24, (0, 0, 0.5), (0, 0, math.pi / 4), 4, r2=0.12).scale = (1.0, 0.8, 1.0)
    box('mune', 'dark', (0.24, 0.05, 0.04), (0, 0, 0.63))
    return dict(target=(0, 0, 0.34), scale=1.1, **CAM)


def m_castle():
    """城：石垣の上の白い天守（2段の屋根と金のしゃちほこ）"""
    box('ishigaki', 'stone', (0.76, 0.58, 0.2), (0, 0, 0.1))
    box('kai1', 'white', (0.54, 0.4, 0.22), (0, 0, 0.31))
    cyl('yane1', 'kawara', 0.46, 0.14, (0, 0, 0.48), (0, 0, math.pi / 4), 4, r2=0.3)
    box('kai2', 'white', (0.32, 0.24, 0.18), (0, 0, 0.62))
    cyl('yane2', 'kawara', 0.28, 0.18, (0, 0, 0.8), (0, 0, math.pi / 4), 4, r2=0.03)
    for x in (-0.12, 0.12):
        box(f'mado{x}', 'dark', (0.06, 0.02, 0.06), (x, -0.21, 0.32))
    box('mado2', 'dark', (0.06, 0.02, 0.05), (0, -0.13, 0.63))
    sphere('shachi', 'gold', 0.04, (0, 0, 0.91))
    return dict(target=(0, 0, 0.46), scale=1.1, **CAM)


def m_town():
    """町（注目スポットの型）：のれんの下がった町家と、のぼり旗"""
    box('kabe', 'sWall', (0.58, 0.42, 0.3), (-0.08, 0.04, 0.15))
    box('koushi', 'woodD', (0.58, 0.02, 0.12), (-0.08, -0.175, 0.15))
    box('noren', 'sNoren', (0.24, 0.02, 0.1), (-0.08, -0.18, 0.24))
    cyl('yane', 'kawara', 0.48, 0.18, (-0.08, 0.04, 0.38), (0, 0, math.pi / 4), 4, r2=0.06).scale = (1.0, 0.78, 1.0)
    cyl('nobori', 'woodD', 0.02, 0.7, (0.34, -0.2, 0.35), verts=6)
    box('hata', 'sBarR', (0.03, 0.13, 0.38), (0.34, -0.13, 0.48))
    return dict(target=(0, 0, 0.32), scale=1.12, **CAM)


def compose():
    """24×24 の絵を KINDS の順に横へ並べて spots.png にする（Pillow があるふつうの Python で）"""
    script = (
        'import sys,os\nfrom PIL import Image\n'
        'src,dst,n,names=sys.argv[1],sys.argv[2],int(sys.argv[3]),sys.argv[4].split(",")\n'
        'W=Image.new("RGBA",(n*len(names),n),(0,0,0,0))\n'
        'for i,k in enumerate(names): W.paste(Image.open(os.path.join(src,k+".png")),(n*i,0))\n'
        'W.save(dst)\n')
    dst = os.path.join(pa.ROOT, 'nishio-go', 'art', 'spots.png')
    subprocess.run(['python3', '-c', script, TMPD, dst, str(N), ','.join(KINDS)], check=True)
    print('wrote', os.path.relpath(dst, pa.ROOT), len(KINDS), 'sprites')


if __name__ == '__main__':
    pa.MODELS.clear()
    for k in KINDS:
        pa.MODELS[k] = globals()['m_' + k]
    os.makedirs(TMPD, exist_ok=True)
    for k in KINDS:
        pa.make(k)
    compose()

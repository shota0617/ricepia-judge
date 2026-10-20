# にしおさんぽGO：ミニゲーム「にしおジャンプ」（nishio-go/runner.js）の絵を Blender で作り、ドット絵に焼く
# - 横から見た絵（カメラは南から少し見下ろす）。右を向いた絵だけ作り、左向きは runner.js で反転する
# - 主人公（立つ・走る2コマ・ジャンプ。黄色い髪・青い服）、カラス（はばたき2コマ）、コイン（回る4コマ）
# - マス：地面（草のある上の段・土）・石垣・米俵（たたく前・たたいたあと）・茶畑の段（となりのマスとつながる）、
#   石灯籠（1マス×2段）、まん中ののぼり（1マス×2段）、ゴール（のぼりと西尾城。6マス四方）
# - できた絵は1枚のシート nishio-go/art/runner.png（並びは runner.js の ART と同じ。下の compose）
# 使い方：python tools/blender/runner.py（bpy が要る。まとめるのは Pillow のあるふつうの Python）
import importlib.util
import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
TMPD = os.path.join(pa.TMP, 'runner')
pa.OUT = TMPD

pa.MATS.update({
    'rHair': '#f2c230', 'rSkin': '#f4c9a0', 'rCloth': '#3f7fbf', 'rPants': '#2d3a55', 'rShoe': '#7a4a2a', 'rEye': '#2a2a2a',
    'crow': '#2a2a32', 'crowW': '#3e3e4a', 'crowB': '#f0a020', 'crowE': '#ffffff',
    'coin': '#f2b81f', 'coinD': '#c8901a',
    'dirt': '#6e4426', 'dirtD': '#6e4628', 'kusa': '#4d9a3c', 'kusaL': '#7cc04a',
    'ishi': '#9b968a', 'ishiD': '#7a756b',
    'tawara': '#e0c070', 'tawaraN': '#a8803e', 'tawaraE': '#c8a050', 'tawaraU': '#8a6a3e', 'tawaraUN': '#5e4626', 'tawaraUE': '#6e5432',
    'cha': '#3f8a34', 'chaL': '#86c650', 'une': '#5e3f26',
    'toro': '#a8a49a', 'toroD': '#8a857a', 'hi': '#ffd27a',
    'pole': '#6a4a30', 'nobori': '#d23a2e', 'noboriW': '#f4f1e8',
    'shiro': '#f3f1ea', 'shiroY': '#62666e', 'shiroM': '#3a3230', 'shachi': '#c8a040',
})
SIDE = dict(el=8, az=0)   # 横から（南から少し見下ろす）。+x が画面の右


def hero(pose):
    """主人公（右を向く。2頭身）。pose：stand・run1・run2・jump"""
    legs = {'stand': (0, 0), 'run1': (0.75, -0.75), 'run2': (0.2, -0.2), 'jump': (1.1, -0.4)}[pose]   # 前の足・うしろの足の角度（ラジアン、前が＋）
    arms = {'stand': (0.1, -0.1), 'run1': (-0.7, 0.7), 'run2': (-0.2, 0.2), 'jump': (2.7, 2.3)}[pose]
    hip = 0.22
    L = 0.18
    for i, (a, y) in enumerate(zip(legs, (0.07, -0.07))):   # 足（ズボン）と くつ。角度 a で前へふる
        box(f'leg{i}', 'rPants', (0.12, 0.11, L), (math.sin(a) * L / 2, y, hip - math.cos(a) * L / 2), (0, -a, 0))
        box(f'shoe{i}', 'rShoe', (0.17, 0.12, 0.06), (math.sin(a) * L + 0.03, y, hip - math.cos(a) * L - 0.01), (0, -a * 0.5, 0))
    box('body', 'rCloth', (0.28, 0.3, 0.26), (0, 0, hip + 0.12), bevel=0.05)
    sh = hip + 0.22
    for i, (a, y) in enumerate(zip(arms, (0.17, -0.17))):   # うで（服）と手。肩から角度 a で前へ
        A = 0.18
        box(f'arm{i}', 'rCloth', (0.09, 0.09, A), (math.sin(a) * A / 2, y, sh - math.cos(a) * A / 2), (0, -a, 0), bevel=0.02)
        sphere(f'hand{i}', 'rSkin', 0.05, (math.sin(a) * A, y, sh - math.cos(a) * A))
    hz = 0.66
    sphere('head', 'rSkin', 0.23, (0.02, 0, hz), (1, 1, 0.92))
    sphere('hair', 'rHair', 0.25, (-0.05, 0, hz + 0.04), (1.0, 1.05, 0.78))   # 髪は頭の上とうしろ（顔は右）
    box('bang', 'rHair', (0.1, 0.38, 0.07), (0.16, 0, hz + 0.12))
    box('eye', 'rEye', (0.03, 0.06, 0.09), (0.24, 0.07, hz - 0.02))
    return dict(target=(0, 0, 0.47), scale=1.0, size=16, **SIDE)


def crow(frame):
    """カラス（右を向く）。frame：0 はねを上げる・1 はねを下げる"""
    sphere('dou', 'crow', 0.2, (0, 0, 0.36), (1.45, 0.8, 0.85))
    sphere('atama', 'crow', 0.13, (0.25, 0, 0.47))
    cyl('kuchi', 'crowB', 0.05, 0.14, (0.42, 0, 0.45), (0, math.pi / 2, 0), 8, r2=0.0)
    box('me', 'crowE', (0.04, 0.03, 0.04), (0.31, 0.11, 0.5))
    box('o', 'crow', (0.2, 0.12, 0.05), (-0.33, 0, 0.4), (0, -0.4, 0))
    up = frame == 0
    box('hane', 'crowW', (0.3, 0.06, 0.08), (-0.02, -0.14, 0.5 if up else 0.3), (0, 0, 0) if False else (0.0, (-0.7 if up else 0.5), 0))
    box('hane2', 'crowW', (0.26, 0.06, 0.08), (-0.02, 0.14, 0.52 if up else 0.32), (0.0, (-0.8 if up else 0.6), 0))
    for y in (-0.05, 0.05):
        box(f'ashi{y}', 'crowB', (0.03, 0.03, 0.12), (0.03, y, 0.12))
    return dict(target=(0, 0, 0.44), scale=1.0, size=16, **SIDE)


def coin(frame):
    """回るコイン（4コマ：正面・ななめ・ほぼ横・ななめ）"""
    ang = [0, 55, 82, 125][frame]
    a = math.radians(ang)
    cyl('kane', 'coin', 0.32, 0.07, (0, 0, 0.5), (math.pi / 2, 0, a), 24)
    cyl('waku', 'coinD', 0.2, 0.08, (0, 0, 0.5), (math.pi / 2, 0, a), 20)   # まん中の くぼみ
    cyl('naka', 'coin', 0.14, 0.09, (0, 0, 0.5), (math.pi / 2, 0, a), 16)
    return dict(target=(0, 0, 0.5), scale=1.0, size=16, **SIDE)


def tiled(fn):
    """となりのマスとつながるように、1マス（はば1）ごとに同じものを並べる"""
    for k in range(-2, 3):
        fn(k)


def ground(top):
    """地面：土に小石。top なら上に草（その下の段は土だけ）"""
    box('tsuchi', 'dirt', (6, 1, 3), (0, 0, -1.5 + (0.78 if top else 1.5)))

    def stones(k):
        for x, z, s in ((0.18, 0.55, 0.11), (0.62, 0.3, 0.09), (0.85, 0.66, 0.08), (0.4, 0.12, 0.1)):
            if top and z > 0.6:
                continue
            box(f'ko{k}{x}', 'dirtD', (s * 1.4, 0.1, s), (k + x - 0.5, -0.5, z), bevel=0.02)
    tiled(stones)
    if top:
        box('kusa', 'kusa', (6, 1.02, 0.24), (0, 0, 0.88))

        def tufts(k):
            for x in (0.22, 0.68):
                box(f'ha{k}{x}', 'kusaL', (0.12, 0.06, 0.1), (k + x - 0.5, -0.52, 0.74))
            box(f'hb{k}', 'kusaL', (1.0, 0.06, 0.05), (k, -0.52, 0.985))
        tiled(tufts)
    return dict(target=(0, 0, 0.5), scale=1.0, size=16, **SIDE)


def wall():
    """石垣：切り石を2段、上下の段で半分ずらして積む"""
    box('meji', 'ishiD', (6, 1, 2), (0, 0, 0.5))

    def stones(k):   # 下の段は 1マスに2つ（はしがマスのさかい）、上の段は半分ずらす
        for row, xs in ((0, (-0.25, 0.25)), (1, (0.0, 0.5))):
            for x in xs:
                box(f'i{k}{row}{x}', 'ishi', (0.46, 0.2, 0.44), (k + x, -0.5, 0.25 + row * 0.5), bevel=0.04)
    tiled(stones)
    return dict(target=(0, 0, 0.5), scale=1.0, size=16, **SIDE)


def bale(used):
    """米俵（横に寝かせた俵。縄が2本と、両はしの さんだわら）。used：たたいたあと（茶色くくすむ）"""
    m, n, e = ('tawaraU', 'tawaraUN', 'tawaraUE') if used else ('tawara', 'tawaraN', 'tawaraE')
    t = cyl('tawara', m, 0.42, 0.8, (0, 0, 0.47), (0, math.pi / 2, 0), 20)
    t.scale = (1, 1, 1)
    for x in (-0.18, 0.18):
        cyl(f'nawa{x}', n, 0.435, 0.07, (x, 0, 0.47), (0, math.pi / 2, 0), 20)
    for x in (-0.42, 0.42):
        cyl(f'saki{x}', e, 0.36, 0.06, (x, 0, 0.47), (0, math.pi / 2, 0), 16)
    box('obi', n, (0.8, 0.86, 0.06), (0, 0, 0.47))
    return dict(target=(0, 0, 0.5), scale=1.0, size=16, **SIDE)


def tea():
    """茶畑の段：かまぼこ形に刈りこんだ茶の木（となりのマスとつながる）と、下に土"""
    c = cyl('cha', 'cha', 0.5, 6, (0, 0.05, 0.12), (0, math.pi / 2, 0), 24)
    c.scale = (1.75, 1, 1)   # 上へ高く（回したあとの z の向き）
    box('une', 'une', (6, 1.2, 0.12), (0, 0, 0.06))

    def leaves(k):
        for x, z in ((0.1, 0.9), (0.45, 0.93), (0.8, 0.88), (0.28, 0.72), (0.66, 0.74)):
            sphere(f'ha{k}{x}{z}', 'chaL', 0.08, (k + x - 0.5, -0.42, z), (1.3, 0.6, 0.6))
    tiled(leaves)
    return dict(target=(0, 0, 0.5), scale=1.0, size=16, **SIDE)


def lantern():
    """石灯籠（2マスの高さ）：台・竿・火袋（あかり）・笠・宝珠"""
    box('dai', 'toro', (0.62, 0.62, 0.18), (0, 0, 0.09), bevel=0.02)
    cyl('sao', 'toroD', 0.12, 0.62, (0, 0, 0.49), verts=10)
    box('chudai', 'toro', (0.5, 0.5, 0.12), (0, 0, 0.86), bevel=0.02)
    box('hibukuro', 'toro', (0.4, 0.4, 0.38), (0, 0, 1.11))
    box('mado', 'hi', (0.2, 0.42, 0.2), (0, 0, 1.12))
    cyl('kasa', 'toroD', 0.46, 0.26, (0, 0, 1.43), verts=4, r2=0.06)
    sphere('hoju', 'toro', 0.08, (0, 0, 1.62), (1, 1, 1.2))
    return dict(target=(0, 0, 1.0), scale=2.0, size=32, **SIDE)


def flag():
    """まん中ののぼり（2マスの高さ）：木の竿に赤いのぼり、まん中が白"""
    cyl('sao', 'pole', 0.035, 1.9, (-0.06, 0, 0.95), verts=8)
    box('nobori', 'nobori', (0.42, 0.03, 0.62), (0.18, 0, 1.45))
    box('shiro', 'noboriW', (0.2, 0.035, 0.38), (0.18, 0, 1.45))
    return dict(target=(0, 0, 1.0), scale=2.0, size=32, **SIDE)


def goal():
    """ゴール（6マス四方）：左に高いのぼり、右に西尾城（石垣・白い壁・灰色の屋根・金のしゃちほこ）"""
    px = -2.55
    cyl('sao', 'pole', 0.06, 5.0, (px, 0, 2.5), verts=8)
    box('nobori', 'nobori', (0.62, 0.04, 1.9), (px + 0.36, 0, 3.95))
    box('shiro', 'noboriW', (0.36, 0.045, 1.4), (px + 0.36, 0, 3.95))
    cx = 0.7
    box('ishigaki', 'ishi', (3.9, 1.6, 1.1), (cx, 0, 0.55))
    for i in range(8):
        box(f'meji{i}', 'ishiD', (0.04, 1.62, 1.1), (cx - 1.9 + i * 0.5, 0, 0.55))
    box('kabe1', 'shiro', (3.0, 1.2, 1.35), (cx, 0, 1.78))
    box('yane1', 'shiroY', (3.5, 1.5, 0.22), (cx, 0, 2.55))
    box('yane1b', 'shiroY', (3.0, 1.3, 0.2), (cx, 0, 2.75))
    box('kabe2', 'shiro', (1.75, 1.0, 0.95), (cx, 0, 3.3))
    box('yane2', 'shiroY', (2.3, 1.2, 0.2), (cx, 0, 3.86))
    box('yane3', 'shiroY', (1.5, 0.9, 0.18), (cx, 0, 4.05))
    for x in (-0.55, 0.55):
        box(f'mado1{x}', 'shiroM', (0.34, 1.22, 0.3), (cx + x * 1.6, 0, 1.95))
    box('mado2', 'shiroM', (0.34, 1.02, 0.3), (cx, 0, 3.35))
    for x in (-0.6, 0.6):
        box(f'shachi{x}', 'shachi', (0.12, 0.12, 0.18), (cx + x, 0, 4.22))
    return dict(target=(0, 0, 3.0), scale=6.0, size=96, **SIDE)


SPRITES16 = [('stand', lambda: hero('stand')), ('run1', lambda: hero('run1')), ('run2', lambda: hero('run2')), ('jump', lambda: hero('jump')),
             ('crow0', lambda: crow(0)), ('crow1', lambda: crow(1))] + [(f'coin{i}', (lambda i=i: coin(i))) for i in range(4)] + [
             ('groundTop', lambda: ground(True)), ('ground', lambda: ground(False)), ('wall', wall),
             ('bale', lambda: bale(False)), ('baleUsed', lambda: bale(True)), ('tea', tea)]
TALL = [('lantern', lantern), ('flag', flag)]   # 32×32 に描いて、まん中の 16×32 を使う


def compose():
    """runner.js の ART と同じ並びの1枚のシートにする：1段目に 16×16 が16、その下に 16×32 が2つ、その下にゴール（96×96）"""
    names16 = ','.join(n for n, _ in SPRITES16)
    script = (
        'import sys,os\nfrom PIL import Image\n'
        'src,dst,n16=sys.argv[1],sys.argv[2],sys.argv[3].split(",")\n'
        'W=Image.new("RGBA",(256,144),(0,0,0,0))\n'
        'for i,n in enumerate(n16): W.paste(Image.open(os.path.join(src,n+".png")),(16*i,0))\n'
        'for i,n in enumerate(["lantern","flag"]): W.paste(Image.open(os.path.join(src,n+".png")).crop((8,0,24,32)),(16*i,16))\n'
        'W.paste(Image.open(os.path.join(src,"goal.png")),(0,48))\n'
        'W.save(dst)\n')
    dst = os.path.join(pa.ROOT, 'nishio-go', 'art', 'runner.png')
    subprocess.run(['python3', '-c', script, TMPD, dst, names16], check=True)
    print('wrote', os.path.relpath(dst, pa.ROOT))


if __name__ == '__main__':
    pa.MODELS.clear()
    for n, fn in SPRITES16 + TALL + [('goal', goal)]:
        pa.MODELS[n] = fn
    os.makedirs(TMPD, exist_ok=True)
    for n in pa.MODELS:
        pa.make(n)
    compose()

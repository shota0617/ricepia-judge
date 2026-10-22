# にしおさんぽGO：ミニゲーム「肥料山の草刈り」のマスの絵と、イベント「芽出しの見きわめ」の種もみの絵を Blender で作り、ドット絵のシートに焼く
# - 草刈り（hiryoyama.js）：16×16 のマス。刈る草（2通り：風でゆれる）・刈ったあと・田んぼ・あぜ道・岩・木と、せおう草の束
#   地面はマスいっぱいに描く（となりのマスと つながる）。いままで JS で描いていた色に合わせる
# - 種もみ（medashi.js）：32×32。だ円のもみに、白い芽と根だけを変える（OK＝芽と根が少しふくらむ・ギリギリOK＝芽が少し大きくふくらむ・伸び過ぎ＝芽が長く伸びる）。
#   3つの名前は本（農文協の米づくりの本 2ページ）のとおり。絵は本の写真をなぞらない
# - 焼き方は mushi-art.py と同じ（pixel-art.py の Cycles で4倍→材質ごとに3色→ふちどり）。シートは nishio-go/art/ev/hiryo.png・seeds.png
# 使い方：python tools/blender/hiryo-art.py （ぜんぶ）／ python tools/blender/hiryo-art.py hiryo （シートひとつ）
import importlib.util
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mushi_art', os.path.join(HERE, 'mushi-art.py'))
ma = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ma)
pa = ma.pa
box, cyl, sphere = pa.box, pa.cyl, pa.sphere

pa.MATS.update({
    'shamen': '#4f8e34', 'kusaD': '#3a7a2a', 'kusaL2': '#6ab04a', 'karikabu': '#9cc46a', 'karikabuD': '#7aa850',
    'ta': '#7a9a3a', 'taD': '#5c7a2a', 'michi': '#c8b48a', 'michiD': '#b09c72', 'iwa': '#8e8a80', 'iwaL': '#b8b4aa',
    'mikiH': '#6b4a30', 'haH': '#2f6b33', 'haHL': '#3f8a3a', 'taba': '#a8c050', 'himoT': '#8a6a3e',
    'momi': '#e6cf92', 'momiD': '#9c7b3c', 'momiL': '#f3e2b0', 'me': '#fbfbf6', 'ne': '#ecece4',
})

TILE = dict(target=(0, 0, 0), scale=1.0, el=90, az=0, size=16)   # 真上から。地面の箱はマスより少し大きく、ふちは出さない


def ground(mat, h=0.04):
    box('ji', mat, (1.3, 1.3, h), (0, 0, -h / 2))


def blades(n, seed, sway=0.0, h=0.5, mats=('kusaD', 'kusaL2')):
    """草の葉（細い板）。真上から見るので、少し たおして長さを見せる"""
    rnd = random.Random(seed)
    for i in range(n):
        x, y = -0.38 + (i % 4) * 0.25 + rnd.uniform(-0.05, 0.05), -0.32 + (i // 4) * 0.3 + rnd.uniform(-0.05, 0.05)
        tilt = math.radians(55 + rnd.uniform(-8, 8))
        box(f'b{i}', mats[i % 2], (0.06, 0.04, h), (x + sway * (1 if i % 2 else 0), y + 0.12, h * 0.25), (tilt, 0, rnd.uniform(-0.2, 0.2) + sway * 2))


def t_grass():
    ground('shamen')
    blades(12, 3)
    return dict(TILE)


def t_grass2():   # 風でゆれる
    ground('shamen')
    blades(12, 3, sway=0.05)
    return dict(TILE)


def t_cut():
    ground('karikabu')
    rnd = random.Random(5)
    for i in range(10):
        box(f'k{i}', 'karikabuD', (0.05, 0.05, 0.08), (-0.38 + (i % 4) * 0.25 + rnd.uniform(-0.04, 0.04), -0.3 + (i // 4) * 0.3, 0.04))
    return dict(TILE)


def t_field():
    ground('ta')
    for i in range(4):   # 苗の列（たて）
        for j in range(4):
            box(f'n{i}{j}', 'taD', (0.06, 0.12, 0.1), (-0.375 + i * 0.25, -0.375 + j * 0.25, 0.05))
    return dict(TILE)


def t_path():
    ground('michi')
    rnd = random.Random(8)
    for i in range(5):
        box(f's{i}', 'michiD', (0.1, 0.05, 0.02), (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0.01))
    return dict(TILE)


def t_rock():
    ground('shamen')
    bpy = pa.bpy
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.34, location=(0, -0.05, 0.12))
    o = bpy.context.object
    o.scale = (1.15, 0.9, 0.7)
    o.data.materials.append(pa.material('iwa'))
    sphere('hi', 'iwaL', 0.12, (-0.12, 0.02, 0.3), (1.4, 0.8, 0.4))
    return dict(TILE)


def t_tree():
    ground('shamen')
    sphere('kage', 'kusaD', 0.32, (0.08, -0.1, 0.0), (1, 1, 0.05))
    for i, (x, y, r, m) in enumerate(((0, -0.02, 0.3, 'haH'), (-0.1, 0.05, 0.16, 'haHL'), (0.09, 0.07, 0.13, 'haHL'))):
        sphere(f'ha{i}', m, r, (x, y, 0.4 + i * 0.05))
    return dict(TILE)


def bundle():
    """せおう草の束（すきとおった地に）：ななめの束を ひもで しばる"""
    for i in range(5):
        cyl(f'w{i}', 'taba', 0.05, 0.7, (-0.12 + i * 0.06, 0, 0.1), (math.radians(90), 0, math.radians(35)), 8)
    cyl('himo', 'himoT', 0.17, 0.08, (0, 0, 0.1), (math.radians(90), 0, math.radians(35)), 12)
    return dict(target=(0, 0, 0.1), scale=1.05, el=60, az=0, size=16)


def seed(kind):
    """種もみ：ななめに置いた だ円のもみ。上の先に白い芽、横に根"""
    ang = math.radians(-25)
    body = sphere('momi', 'momi', 1.0, (0, -0.06, 0.1), (0.2, 0.33, 0.14))
    body.rotation_euler = (0, 0, ang)
    for s in (-1, 1):   # もみの すじ
        st = sphere(f'suji{s}', 'momiD', 1.0, (s * 0.07, -0.06, 0.13), (0.02, 0.3, 0.12))
        st.rotation_euler = (0, 0, ang)
    hi = sphere('hikari', 'momiL', 1.0, (-0.07, 0.02, 0.2), (0.05, 0.12, 0.05))
    hi.rotation_euler = (0, 0, ang)
    tip = (math.sin(-ang) * 0.33, -0.06 + math.cos(ang) * 0.33, 0.12)
    if kind == 0:     # 芽と根が いっしょに少しだけ ふくらむ
        sphere('me', 'me', 0.05, tip)
        sphere('ne', 'ne', 0.05, (tip[0] + 0.12, tip[1] - 0.09, 0.12))   # 根：芽の わきから、もみの外へ
    elif kind == 1:   # 芽が少し大きく ふくらむ
        sphere('me', 'me', 1.0, (tip[0], tip[1] + 0.03, 0.12), (0.08, 0.1, 0.07))
    else:             # 芽が長く伸びる
        pa.tube('me', 'me', [tip, (tip[0] - 0.06, tip[1] + 0.18, 0.14), (tip[0] - 0.16, tip[1] + 0.34, 0.14)], 0.035)
        sphere('ne', 'ne', 0.045, (tip[0] + 0.12, tip[1] - 0.09, 0.12))
    return dict(target=(0, 0, 0.08), scale=1.0, el=75, az=0, size=32, fit=True)


HIRYO = [('g', t_grass), ('g2', t_grass2), ('c', t_cut), ('f', t_field), ('p', t_path), ('r', t_rock), ('t', t_tree), ('bundle', bundle)]
SEEDS = [('ok', lambda: seed(0)), ('girigiri', lambda: seed(1)), ('nobisugi', lambda: seed(2))]
SHEETS = {'hiryo': HIRYO, 'seeds': SEEDS}

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    os.makedirs(ma.OUT, exist_ok=True)
    for name in args or SHEETS:
        arrs = [ma.bake(fn, f'{name}-{tag}') for tag, fn in SHEETS[name]]
        p = os.path.join(ma.OUT, f'{name}.png')
        ma.save_sheet(arrs, p)
        print('wrote', os.path.relpath(p, pa.ROOT), len(arrs))

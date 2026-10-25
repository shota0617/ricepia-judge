# にしおさんぽGO：名所1011か所の特大のドット絵（96×96）を、Blender の型で作る
# - 一覧は tools/blender/giant-list.json（giant-list.py が作る：id・名前・形の種類・屋根／壁／差し色）
# - 種類ごとの型（神社・稲荷・お寺・駅・城跡・博物館など・史跡・古墳・見どころ・山・教会・公園・海水浴場・像・温泉・水族館）に、
#   名所ごとに決まった乱数（id から）で 大きさ・向き・木や灯籠の数と場所・塔や鐘つき堂のあるなし などを変え、色は写真から測った色。
#   1枚ずつ全部ちがう絵になる。できた PNG は nishio-go/art/giant/<id>.png
# - --poi：街の主な建物500か所（学校・病院・交番や警察署・消防署・郵便局・役所・図書館。giant-poi-list.py が作る giant-poi.json）
# 使い方：python tools/blender/giant-gen.py [--poi] [--part=i/n] [--new] [id ...]
import importlib.util
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('giant', os.path.join(HERE, 'giant.py'))
gi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gi)
pa = gi.pa
box, cyl, sphere, roof = pa.box, pa.cyl, pa.sphere, gi.roof
# --poi のときは、街の主な建物500か所（giant-poi-list.py が作る giant-poi.json）
LIST = json.load(open(os.path.join(HERE, 'giant-poi.json' if '--poi' in sys.argv else 'giant-list.json')))

BASE = {'shrine': ['#5a6068', '#8a6a4a', '#c8382c'], 'temple': ['#4e535e', '#eeeae0', '#7a5a3c'], 'station': ['#6a7480', '#e8e6e0', '#2f74b8'],
        'castle': ['#4a4f57', '#f3f1ea', '#9b968a'], 'public': ['#7a7e84', '#d8d4cc', '#5e7f99'], 'historic': ['#5a6068', '#e8e2d2', '#8a6a4a'],
        'view': ['#5a6068', '#f4f2ec', '#b08850'], 'church': ['#7a4a3a', '#f0ece4', '#6f8fa8'],
        # 街の主な建物（屋根・壁・差し色）
        'school': ['#7a7e84', '#ece6d6', '#3f8a5a'], 'hospital': ['#8a8e94', '#f2f2ee', '#3f9aa0'], 'police': ['#5a6068', '#e8e4dc', '#2a4a8a'],
        'fire': ['#6a6e74', '#e8e4dc', '#d23a2e'], 'post': ['#7a7e84', '#f0ece4', '#d8342c']}
BASE_OF = {'shrine': 'shrine', 'inari': 'shrine', 'temple': 'temple', 'station': 'station', 'castle': 'castle', 'museum': 'public', 'library': 'public',
           'townhall': 'public', 'art': 'public', 'aquarium': 'public', 'onsen': 'public', 'historic': 'historic', 'kofun': 'historic', 'statue': 'historic',
           'view': 'view', 'hill': 'view', 'park': 'view', 'beach': 'view', 'church': 'church',
           'school': 'school', 'hospital': 'hospital', 'police': 'police', 'fire': 'fire', 'post': 'post',
           'playpark': 'view', 'plaza': 'view', 'sports': 'view', 'pondpark': 'view', 'forest': 'view', 'garden': 'view', 'lighthouse': 'view'}
YUGU = ['#d23a2e', '#2f74b8', '#f2c230', '#3f9a4a', '#e8781e', '#8a5ac8']   # 遊具の色
TRAIN = {'meitetsu': ('#c8162a', '#f4f4f4'), 'jr': ('#c8ccd0', '#e8781e'), 'aikan': ('#c8ccd0', '#8cc63f')}

pa.MATS.update({'gTree': '#4f9a3e', 'gTreeD': '#2f6b33', 'sugi': '#2c5a32', 'momiji': '#c8502e', 'sakura': '#f0b8c8', 'toro': '#a8a49a',
                'ishi': '#8e8a80', 'asphalt': '#7a7c80', 'shibaG': '#6aa84a', 'kanban': '#f4f2e8', 'kanbanT': '#3a5a8a', 'kitsune': '#f4f0e6',
                'senro': '#5a4a3a', 'rail': '#9aa0a8', 'umiB': '#3d86c6', 'nami': '#a8d8f0', 'yu': '#e8f4f8', 'kane': '#7a6a3a', 'juji': '#d8b048',
                'ike': '#4aa3df', 'hasuH': '#4f9e3a', 'benchW': '#a06a3a', 'parasol2': '#2f74b8', 'sakana': '#f2a03a',
                'sunaba': '#e8d6a6', 'tetsu': '#9aa0a8', 'tsuchiG': '#c8a878', 'net': '#5a6068', 'line': '#f4f4f0', 'toire': '#d8d0c0',
                'todai': '#f4f4f0', 'todaiR': '#d23a2e', 'teibo': '#b8b4ac', 'hashiR': '#c8382c',
                # 街の主な建物
                'pool': '#4ab0e8', 'tokei': '#f4f4f0', 'roofG': '#4f8a6a', 'carW': '#f2f2f0', 'carS': '#b8bcc2', 'carB': '#2c5aa0',
                'akaR': '#e8302a', 'shobo': '#d8302a', 'posuto': '#d8342c', 'kyuR': '#e04a3a', 'heli': '#e8e4d8'})


def clamp_hex(h, lo=0, hi=255):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % tuple(max(lo, min(hi, c)) for c in (r, g, b))


def jitter(h, rng, amt=14):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    d = rng.randint(-amt, amt)
    return '#%02x%02x%02x' % tuple(max(0, min(255, c + d + rng.randint(-4, 4))) for c in (r, g, b))


def gable(name, mat, length, width, h, zb, x=0.0, y=0.0, rz=0.0):
    """切妻の屋根（棟は x の向き。rz で回す）"""
    sx, sy = h / 1.5, width / 1.732
    o = cyl(name, mat, 1.0, length, (x, y, zb + 0.5 * sx), (0, -math.pi / 2, rz), 3)   # 三角の柱を横にたおす（Y のあと Z で回る）
    o.scale = (sx, sy, 1)
    return o


def tree(n, x, y, s, kind):
    if kind == 'sugi':
        cyl(f'tm{n}', 'miki', 0.02 * s, 0.10 * s, (x, y, 0.05 * s), verts=8)
        cyl(f'tc{n}', 'sugi', 0.09 * s, 0.42 * s, (x, y, 0.30 * s), verts=10, r2=0.0)
    elif kind == 'pine':
        gi.pine(n, x, y, s * 1.1)
    else:
        mat = {'momiji': 'momiji', 'sakura': 'sakura'}.get(kind, 'gTree')
        cyl(f'tm{n}', 'miki', 0.025 * s, 0.16 * s, (x, y, 0.08 * s), verts=8)
        for i, (dx, dy, dz, r) in enumerate(((0, 0, 0.24, 0.12), (0.07, 0.03, 0.20, 0.09), (-0.06, -0.02, 0.21, 0.09), (0.0, 0.04, 0.31, 0.08))):
            sphere(f'tl{n}{i}', mat if i else ('gTreeD' if mat == 'gTree' else mat), r * s, (x + dx * s, y + dy * s, dz * s))


def trees(rng, n, spots, kinds, s=(0.8, 1.15)):
    """木を n 本。桜と紅葉はたまにだけ（一年じゅう出るので）"""
    rng.shuffle(spots)
    green = [k for k in kinds if k not in ('sakura', 'momiji')] or ['round']
    for i, (x, y) in enumerate(spots[:n]):
        k = rng.choice(kinds) if rng.random() < 0.25 else rng.choice(green)
        tree(i, x * 0.94 + rng.uniform(-0.03, 0.03), y * 0.94 + rng.uniform(-0.03, 0.03), rng.uniform(*s), k)


def ground(mat, w=0.92, d=0.72):
    box('ground', mat, (w, d, 0.03), (0, 0, -0.015))


def toro(n, x, y, s=1.0):
    box(f'toroB{n}', 'toro', (0.04 * s, 0.04 * s, 0.03 * s), (x, y, 0.015 * s))
    cyl(f'toroP{n}', 'toro', 0.012 * s, 0.10 * s, (x, y, 0.08 * s), verts=6)
    box(f'toroH{n}', 'toro', (0.05 * s, 0.05 * s, 0.04 * s), (x, y, 0.15 * s))
    cyl(f'toroK{n}', 'toro', 0.045 * s, 0.03 * s, (x, y, 0.185 * s), (0, 0, math.pi / 4), 4, r2=0.005)


def torii(n, x, y, w, h, mat):
    for dx in (-w / 2, w / 2):
        cyl(f'trP{n}{dx}', mat, 0.016, h, (x + dx, y, h / 2), verts=8)
    box(f'trK{n}', mat, (w + 0.10, 0.03, 0.025), (x, y, h + 0.01))
    box(f'trN{n}', mat, (w + 0.02, 0.02, 0.018), (x, y, h * 0.8))
    if mat != 'ishi':
        box(f'trT{n}', 'kuro', (w + 0.11, 0.032, 0.008), (x, y, h + 0.025))


def sign(x, y, z=0.0):
    for dx in (-0.04, 0.04):
        cyl(f'sgP{dx}', 'miki', 0.006, 0.10, (x + dx, y, z + 0.05), verts=6)
    box('sgB', 'kanban', (0.11, 0.012, 0.06), (x, y - 0.006, z + 0.10))
    box('sgT', 'kanbanT', (0.07, 0.014, 0.012), (x, y - 0.008, z + 0.11))


def windows_grid(prefix, x0, x1, y, z0, floors, fh, cols, mat='mado'):
    for f in range(floors):
        for c in range(cols):
            x = x0 + (c + 0.5) * (x1 - x0) / cols
            box(f'{prefix}{f}_{c}', mat, ((x1 - x0) / cols * 0.55, 0.012, fh * 0.45), (x, y, z0 + (f + 0.55) * fh))


# ---------- 型 ----------
def m_shrine(rng, R, W, A, inari=False):
    ground('jari')
    box('sando', 'ishi', (0.10, 0.62, 0.012), (0, -0.08, 0.006))
    s = rng.uniform(0.85, 1.1)
    hy = rng.uniform(0.10, 0.18)
    box('kidan', 'ishi', (0.34 * s, 0.26 * s, 0.04), (0, hy, 0.02))
    box('honden', 'wood', (0.26 * s, 0.18 * s, 0.14 * s), (0, hy, 0.04 + 0.07 * s))
    box('hondenF', 'kuro', (0.12 * s, 0.01, 0.07 * s), (0, hy - 0.091 * s, 0.04 + 0.06 * s))
    gable('yane', 'roofP', 0.34 * s, 0.30 * s, 0.12 * s, 0.04 + 0.14 * s, 0, hy)
    for dx in (-0.06, 0.06):   # 千木
        cyl(f'chigi{dx}', 'woodD', 0.008, 0.10 * s, (dx * s * 2.2, hy, 0.04 + 0.27 * s), (0, math.copysign(0.5, dx), 0), 6)
    if rng.random() < 0.6:   # 拝殿
        py = hy - 0.17 * s
        box('haiden', 'wallP', (0.30 * s, 0.10 * s, 0.10 * s), (0, py, 0.05 * s + 0.02))
        gable('yaneH', 'roofP', 0.36 * s, 0.16 * s, 0.08 * s, 0.10 * s + 0.02, 0, py)
    tmat = 'ishi' if (not inari and rng.random() < 0.3) else 'accP'
    if inari:
        for i in range(rng.randint(3, 5)):
            torii(i, 0, -0.34 + i * 0.07, 0.14, 0.17, 'accP')
        for dx in (-0.12, 0.12):
            sphere(f'kitsune{dx}', 'kitsune', 0.025, (dx, -0.12, 0.05), (0.8, 1.2, 1.4))
            box(f'kitsuneB{dx}', 'ishi', (0.05, 0.05, 0.03), (dx, -0.12, 0.015))
    else:
        torii(0, 0, -0.30, rng.uniform(0.16, 0.22), rng.uniform(0.20, 0.26), tmat)
    if rng.random() < 0.7:
        for i, dx in enumerate((-0.11, 0.11)):
            toro(i, dx, -0.18, rng.uniform(0.9, 1.2))
    trees(rng, rng.randint(2, 5), [(-0.38, 0.22), (0.38, 0.20), (-0.30, 0.32), (0.32, 0.32), (-0.42, -0.05), (0.42, -0.02)], ['sugi', 'sugi', 'round'])
    return dict(target=(0, 0, 0.16), scale=1.01, el=rng.uniform(26, 32), az=rng.uniform(-40, -28), size=96)


def m_temple(rng, R, W, A):
    ground('jari')
    s = rng.uniform(0.85, 1.05)
    hy = rng.uniform(0.04, 0.12)
    box('kidan', 'ishi', (0.48 * s, 0.36 * s, 0.05), (0, hy, 0.025))
    box('hondo', 'wallP', (0.38 * s, 0.28 * s, 0.16 * s), (0, hy, 0.05 + 0.08 * s))
    for i in range(5):
        box(f'hashira{i}', 'woodD', (0.02, 0.02, 0.16 * s), ((-0.17 + i * 0.085) * s, hy - 0.141 * s, 0.05 + 0.08 * s))
    box('kosi', 'woodD', (0.38 * s, 0.01, 0.025), (0, hy - 0.142 * s, 0.07))
    roof('yane', 'roofP', 0.56 * s, 0.46 * s, rng.uniform(0.18, 0.24) * s, 0.05 + 0.16 * s, rng.uniform(0.3, 0.45), y=hy)
    box('mune', 'munaG', (0.2 * s, 0.03, 0.03), (0, hy, 0.05 + 0.16 * s + 0.21 * s))
    box('dan', 'ishi', (0.14, 0.08, 0.03), (0, hy - 0.22 * s, 0.015))
    extra = rng.random()
    if extra < 0.25:   # 三重塔
        tx = rng.choice((-0.36, 0.36))
        for k in range(3):
            z = 0.02 + k * 0.13
            box(f'to{k}', 'woodD', (0.10 - k * 0.012, 0.10 - k * 0.012, 0.08), (tx, 0.18, z + 0.04))
            roof(f'toY{k}', 'roofP', 0.20 - k * 0.02, 0.20 - k * 0.02, 0.05, z + 0.08, 0.3, x=tx, y=0.18)
        cyl('sorin', 'kane', 0.008, 0.12, (tx, 0.18, 0.53), verts=6)
    elif extra < 0.6:  # 鐘つき堂
        tx = rng.choice((-0.34, 0.34))
        for dx in (-0.05, 0.05):
            for dy in (-0.05, 0.05):
                box(f'sh{dx}{dy}', 'woodD', (0.014, 0.014, 0.16), (tx + dx, -0.20 + dy, 0.08))
        roof('shY', 'roofP', 0.18, 0.18, 0.07, 0.16, 0.2, x=tx, y=-0.20)
        cyl('kane', 'kane', 0.03, 0.06, (tx, -0.20, 0.12), verts=12)
    if rng.random() < 0.5:   # 山門
        box('mon', 'woodD', (0.16, 0.05, 0.10), (0, -0.33, 0.05))
        box('monD', 'kuro', (0.07, 0.052, 0.08), (0, -0.33, 0.04))
        roof('monY', 'roofP', 0.24, 0.12, 0.06, 0.10, 0.4, y=-0.33)
    elif rng.random() < 0.6:
        toro(0, -0.09, -0.24)
        toro(1, 0.09, -0.24)
    trees(rng, rng.randint(2, 4), [(-0.40, 0.25), (0.40, 0.26), (-0.42, -0.25), (0.42, -0.22), (-0.30, 0.34), (0.30, 0.34)], ['pine', 'round', 'momiji', 'pine'])
    return dict(target=(0, 0, 0.18), scale=1.03, el=rng.uniform(25, 31), az=rng.uniform(-40, -28), size=96)


def m_station(rng, R, W, A, train='meitetsu'):
    ground('asphalt')
    body, band = TRAIN[train]
    pa.MATS['trainB'], pa.MATS['trainS'] = body, band
    box('senro', 'senro', (1.0, 0.16, 0.015), (0, 0.04, 0.008))
    for dy in (-0.035, 0.035):
        box(f'rail{dy}', 'rail', (1.0, 0.01, 0.01), (0, 0.04 + dy, 0.02))
    box('home', 'home', (0.9, 0.14, 0.07), (0, 0.20, 0.035))
    n = rng.randint(1, 2)
    L = 0.42 if n == 1 else 0.38
    for i in range(n):
        x = (-0.21 + i * 0.40) if n == 2 else rng.uniform(-0.15, 0.15)
        box(f'train{i}', 'trainB', (L, 0.13, 0.17), (x, 0.04, 0.115), bevel=0.02)
        box(f'trainS{i}', 'trainS', (L + 0.004, 0.134, 0.02), (x, 0.04, 0.07))
        for j in range(4):
            box(f'mado{i}{j}', 'mado', (0.06, 0.01, 0.05), (x - L / 2 + 0.07 + j * (L - 0.14) / 3, -0.027, 0.15))
    for x in (-0.3, 0.0, 0.3):
        box(f'hP{x}', 'hashira', (0.015, 0.015, 0.14), (x, 0.24, 0.14))
    box('hY', 'yane2', (0.86, 0.12, 0.015), (0, 0.22, 0.215), (math.radians(-6), 0, 0))
    s = rng.uniform(0.8, 1.15)
    sx = rng.uniform(-0.18, 0.18)
    style = rng.random()
    box('eki', 'wallP', (0.36 * s, 0.18, 0.16 * s), (sx, -0.22, 0.08 * s))
    windows_grid('ekiM', sx - 0.15 * s, sx + 0.15 * s, -0.312, 0.0, 1, 0.16 * s, 4)
    if style < 0.5:
        gable('ekiY', 'roofP', 0.42 * s, 0.24, 0.08, 0.16 * s, sx, -0.22)
    else:
        box('ekiY', 'roofP', (0.38 * s, 0.20, 0.025), (sx, -0.22, 0.16 * s + 0.012))
    box('ekiK', 'kanban', (0.16, 0.012, 0.035), (sx, -0.315, 0.13 * s))
    box('ekiKT', 'accP', (0.04, 0.014, 0.02), (sx - 0.05, -0.316, 0.13 * s))
    return dict(target=(0, 0, 0.12), scale=1.03, el=rng.uniform(27, 33), az=rng.uniform(-40, -28), size=96)


def m_castle(rng, R, W, A):
    ground('shibaG')
    s = rng.uniform(0.8, 1.1)
    k = rng.random()
    cyl('ishigaki', 'ishigaki', 0.36 * s * math.sqrt(2), 0.12, (0.05, 0.12, 0.06), (0, 0, math.pi / 4), 4, r2=0.31 * s * math.sqrt(2))
    if k < 0.4:   # 隅櫓か門を復元した所
        box('yagura', 'wallP', (0.24 * s, 0.20 * s, 0.12), (0.05, 0.12, 0.18))
        box('yaguraS', 'shitami', (0.244 * s, 0.204 * s, 0.04), (0.05, 0.12, 0.14))
        roof('yaguraY', 'roofP', 0.34 * s, 0.30 * s, 0.10, 0.24, 0.4, x=0.05, y=0.12)
    else:          # 石碑と土塁
        box('hi', 'ishi', (0.06, 0.03, 0.22), (0.0, 0.0, 0.23))
        box('hiB', 'ishi', (0.12, 0.08, 0.03), (0.0, 0.0, 0.135))
        box('hiT', 'kuro', (0.012, 0.032, 0.14), (0.0, -0.002, 0.25))
    sign(-0.25, -0.25)
    trees(rng, rng.randint(2, 4), [(-0.38, 0.22), (0.40, 0.20), (-0.36, -0.12), (0.40, -0.18), (0.30, 0.34)], ['pine', 'pine', 'sakura', 'round'])
    return dict(target=(0, 0, 0.14), scale=0.99, el=rng.uniform(25, 31), az=rng.uniform(-40, -28), size=96)


def m_public(rng, R, W, A, kind='museum'):
    ground('jari')
    floors = rng.randint(1, 3) if kind != 'townhall' else rng.randint(3, 5)
    fh = 0.075
    w, d = rng.uniform(0.42, 0.62), rng.uniform(0.26, 0.36)
    x0 = rng.uniform(-0.08, 0.08)
    box('tate', 'wallP', (w, d, floors * fh), (x0, 0.06, floors * fh / 2))
    windows_grid('mado', x0 - w / 2 + 0.03, x0 + w / 2 - 0.03, 0.06 - d / 2 - 0.002, 0, floors, fh, rng.randint(4, 7))
    box('okujo', 'roofP', (w + 0.02, d + 0.02, 0.02), (x0, 0.06, floors * fh + 0.01))
    if kind == 'townhall' or rng.random() < 0.25:   # 塔
        th = rng.uniform(0.10, 0.18)
        box('to', 'wallP', (0.10, 0.10, th), (x0 + w * 0.3, 0.06, floors * fh + th / 2))
        box('toY', 'roofP', (0.12, 0.12, 0.02), (x0 + w * 0.3, 0.06, floors * fh + th + 0.01))
    elif kind in ('museum', 'art') and rng.random() < 0.4:   # 大きな屋根
        roof('yaneM', 'roofP', w + 0.08, d + 0.08, 0.10, floors * fh, 0.6, x=x0, y=0.06)
    elif kind == 'aquarium':
        sphere('dome', 'umiB', 0.14, (x0, 0.06, floors * fh), (1.4, 1, 0.6))
        box('sakana', 'sakana', (0.12, 0.012, 0.05), (x0 - 0.1, 0.06 - d / 2 - 0.01, floors * fh * 0.6))
    elif kind == 'onsen':
        for i in range(3):
            sphere(f'yuge{i}', 'yu', 0.05, (x0 - 0.08 + i * 0.08, 0.06, floors * fh + 0.08 + 0.04 * (i % 2)), (1, 1, 1.4))
    box('genkan', 'accP', (0.14, 0.08, 0.015), (x0, 0.06 - d / 2 - 0.04, 0.08))
    for dx in (-0.06, 0.06):
        box(f'gP{dx}', 'hashira', (0.01, 0.01, 0.08), (x0 + dx, 0.06 - d / 2 - 0.07, 0.04))
    if kind == 'townhall' or rng.random() < 0.3:
        for i in range(rng.randint(1, 3)):
            cyl(f'pole{i}', 'hashira', 0.006, 0.28, (-0.40 + i * 0.05, -0.28, 0.14), verts=6)
            box(f'flag{i}', ['accP', 'obi', 'kanbanT'][i % 3], (0.05, 0.005, 0.03), (-0.375 + i * 0.05, -0.28, 0.26))
    if kind == 'art':
        sphere('chokoku', 'kane', 0.05, (0.36, -0.26, 0.08), (0.7, 0.7, 1.6))
    trees(rng, rng.randint(2, 5), [(-0.42, 0.25), (0.42, 0.26), (-0.42, -0.25), (0.42, -0.22), (0.25, -0.32), (-0.25, -0.33)], ['round', 'round', 'sakura', 'pine'])
    return dict(target=(0, 0, 0.14), scale=1.03, el=rng.uniform(26, 32), az=rng.uniform(-40, -28), size=96)


def m_historic(rng, R, W, A):
    ground('shibaG')
    k = rng.random()
    if k < 0.45:   # 石碑
        h = rng.uniform(0.18, 0.30)
        box('hiB', 'ishi', (0.16, 0.12, 0.04), (0, 0.05, 0.02))
        box('hi', 'ishi', (rng.uniform(0.06, 0.10), 0.035, h), (0, 0.05, 0.04 + h / 2))
        box('hiT', 'kuro', (0.012, 0.037, h * 0.6), (0, 0.048, 0.04 + h / 2))
    elif k < 0.75:  # 小さなお堂・祠
        box('hokoraB', 'ishi', (0.14, 0.12, 0.05), (0, 0.06, 0.025))
        box('hokora', 'woodD', (0.10, 0.08, 0.08), (0, 0.06, 0.09))
        gable('hokoraY', 'roofP', 0.14, 0.14, 0.06, 0.13, 0, 0.06)
    else:           # 門（長屋門・山門の跡）
        box('mon', 'wallP', (0.36, 0.10, 0.12), (0, 0.06, 0.06))
        box('monD', 'woodD', (0.10, 0.102, 0.10), (0, 0.06, 0.05))
        roof('monY', 'roofP', 0.44, 0.18, 0.09, 0.12, 0.5, y=0.06)
    sign(rng.choice((-0.24, 0.24)), -0.22)
    trees(rng, rng.randint(1, 4), [(-0.38, 0.22), (0.38, 0.20), (-0.36, -0.10), (0.40, -0.10), (0.20, 0.32), (-0.2, 0.32)], ['round', 'pine', 'sakura', 'momiji'])
    return dict(target=(0, 0, 0.12), scale=0.95, el=rng.uniform(26, 32), az=rng.uniform(-40, -28), size=96)


def m_kofun(rng, R, W, A):
    ground('shibaG')
    zen = rng.random() < 0.4   # 前方後円墳
    sphere('fun', 'kusa', 0.30, (0.04, 0.08, 0.0), (1.0, 0.9, 0.42))
    if zen:
        cyl('hofun', 'kusa', 0.22, 0.10, (-0.22, -0.12, 0.04), (0, 0, math.pi / 4 + 0.4), 4, r2=0.12)
    trees(rng, rng.randint(2, 4), [(0.0, 0.10), (0.12, 0.16), (-0.08, 0.18), (0.18, 0.02)], ['round', 'pine'], (0.6, 0.9))
    sign(0.32, -0.26)
    return dict(target=(0, 0, 0.10), scale=0.99, el=rng.uniform(28, 34), az=rng.uniform(-40, -28), size=96)


def m_view(rng, R, W, A, name=''):
    tower = any(w in name for w in ('展望', 'タワー', '見晴', '眺望'))
    ground('shibaG')
    if tower:
        for dx in (-0.06, 0.06):
            for dy in (-0.06, 0.06):
                box(f'tw{dx}{dy}', 'hashira', (0.015, 0.015, 0.36), (dx, 0.05 + dy, 0.18))
        box('deck', 'wallP', (0.20, 0.20, 0.03), (0, 0.05, 0.36))
        roof('twY', 'roofP', 0.24, 0.24, 0.08, 0.40, 0.1, y=0.05)
    else:   # 庭のある建物（見どころ）
        s = rng.uniform(0.85, 1.1)
        box('tate', 'wallP', (0.34 * s, 0.22 * s, 0.13), (0.08, 0.10, 0.065))
        roof('yane', 'roofP', 0.44 * s, 0.32 * s, 0.12, 0.13, rng.uniform(0.3, 0.6), x=0.08, y=0.10)
        box('niwa', 'jari', (0.30, 0.20, 0.006), (-0.18, -0.18, 0.003))
        if rng.random() < 0.5:
            sphere('ike', 'ike', 0.10, (-0.20, -0.16, 0.0), (1.3, 1, 0.08))
    trees(rng, rng.randint(2, 5), [(-0.40, 0.22), (0.40, 0.26), (-0.40, -0.05), (0.42, -0.20), (0.28, -0.30), (-0.30, 0.32)], ['round', 'momiji', 'pine', 'sakura'])
    return dict(target=(0, 0, 0.14), scale=1.01, el=rng.uniform(26, 32), az=rng.uniform(-40, -28), size=96)


def m_hill(rng, R, W, A):
    sphere('yama', 'kusa', 0.48, (0, 0.04, -0.05), (1.0, 0.85, rng.uniform(0.55, 0.75)))
    trees(rng, rng.randint(4, 7), [(-0.25, 0.10), (0.22, 0.14), (-0.10, 0.25), (0.10, -0.10), (0.30, -0.05), (-0.30, -0.10), (0.0, 0.22)], ['round', 'sugi', 'pine'], (0.6, 0.9))
    top = 0.04 + 0.48 * 0.65
    box('choten', 'ishi', (0.04, 0.04, 0.08), (0.0, 0.0, top))
    if rng.random() < 0.5:
        box('azumaya', 'azumaya', (0.10, 0.10, 0.06), (0.10, 0.06, top - 0.02))
        roof('azumayaY', 'yaneA', 0.16, 0.16, 0.05, top + 0.04, 0.05, x=0.10, y=0.06)
    return dict(target=(0, 0, 0.18), scale=1.03, el=rng.uniform(24, 30), az=rng.uniform(-40, -28), size=96)


def m_church(rng, R, W, A):
    ground('jari')
    s = rng.uniform(0.85, 1.1)
    box('do', 'wallP', (0.24 * s, 0.40 * s, 0.16), (0.05, 0.08, 0.08))
    gable('doY', 'roofP', 0.44 * s, 0.30 * s, 0.12, 0.16, 0.05, 0.08, rz=math.pi / 2)
    box('to', 'wallP', (0.12, 0.12, 0.28), (0.05, -0.16 * s, 0.14))
    roof('toY', 'roofP', 0.14, 0.14, 0.14, 0.28, 0.02, x=0.05, y=-0.16 * s)
    box('juji', 'juji', (0.01, 0.01, 0.07), (0.05, -0.16 * s, 0.46))
    box('jujiY', 'juji', (0.04, 0.01, 0.01), (0.05, -0.16 * s, 0.47))
    box('mado', 'accP', (0.04, 0.012, 0.06), (0.05, -0.16 * s - 0.061, 0.20))
    trees(rng, rng.randint(1, 3), [(-0.36, 0.22), (0.40, 0.25), (-0.38, -0.20), (0.38, -0.22)], ['round', 'sakura'])
    return dict(target=(0, 0, 0.16), scale=0.99, el=rng.uniform(26, 32), az=rng.uniform(-40, -28), size=96)


def m_park(rng, R, W, A):
    ground('shibaG')
    sphere('ike', 'ike', 0.16, (rng.uniform(-0.15, 0.15), rng.uniform(-0.05, 0.10), 0.0), (1.5, 1.0, 0.06))
    box('michi', 'jari', (0.9, 0.07, 0.006), (0, -0.25, 0.003))
    for i in range(rng.randint(1, 2)):
        x = -0.25 + i * 0.4
        box(f'bench{i}', 'benchW', (0.10, 0.03, 0.01), (x, -0.32, 0.04))
        box(f'benchB{i}', 'benchW', (0.10, 0.01, 0.03), (x, -0.31, 0.06))
    if rng.random() < 0.5:
        for dx in (-0.05, 0.05):
            for dy in (-0.05, 0.05):
                box(f'az{dx}{dy}', 'azumaya', (0.012, 0.012, 0.12), (0.30 + dx, 0.22 + dy, 0.06))
        roof('azY', 'yaneA', 0.18, 0.18, 0.06, 0.12, 0.05, x=0.30, y=0.22)
    trees(rng, rng.randint(4, 7), [(-0.40, 0.25), (0.40, -0.05), (-0.40, -0.05), (-0.15, 0.30), (0.10, 0.32), (0.42, 0.30), (-0.30, 0.10)], ['round', 'sakura', 'momiji', 'round'])
    return dict(target=(0, 0, 0.10), scale=0.99, el=rng.uniform(30, 36), az=rng.uniform(-40, -28), size=96)


def m_beach(rng, R, W, A):
    box('umi', 'umiB', (1.0, 0.40, 0.02), (0, 0.22, -0.01))
    for i in range(3):
        box(f'nami{i}', 'nami', (rng.uniform(0.2, 0.4), 0.012, 0.004), (rng.uniform(-0.3, 0.3), 0.10 + i * 0.1, 0.002))
    box('suna', 'suna', (1.0, 0.44, 0.03), (0, -0.20, -0.015))
    for i in range(rng.randint(1, 3)):
        x = -0.28 + i * 0.26 + rng.uniform(-0.04, 0.04)
        cyl(f'pP{i}', 'hashira', 0.006, 0.14, (x, -0.18, 0.07), verts=6)
        cyl(f'pK{i}', ['parasol', 'parasol2', 'accP'][i % 3], 0.08, 0.04, (x, -0.18, 0.15), verts=8, r2=0.005)
    for i in range(rng.randint(1, 3)):
        sphere(f'iwa{i}', 'ishi', 0.04, (rng.uniform(-0.4, 0.4), rng.uniform(-0.38, -0.28), 0.0), (1.3, 1, 0.7))
    if rng.random() < 0.5:
        tree(0, 0.42, -0.32, 0.9, 'pine')
    return dict(target=(0, 0, 0.04), scale=0.99, el=rng.uniform(32, 38), az=rng.uniform(-40, -28), size=96)


def m_statue(rng, R, W, A):
    ground('shibaG')
    box('daiza', 'ishi', (0.16, 0.16, 0.10), (0, 0.04, 0.05))
    mat = 'kane' if rng.random() < 0.6 else 'ishi'
    cyl('karada', mat, 0.045, 0.16, (0, 0.04, 0.18), verts=12, r2=0.035)
    sphere('atama', mat, 0.035, (0, 0.04, 0.29))
    sign(0.25, -0.22)
    trees(rng, rng.randint(1, 3), [(-0.36, 0.22), (0.36, 0.22), (-0.34, -0.15), (0.36, -0.05)], ['round', 'pine', 'sakura'])
    return dict(target=(0, 0, 0.14), scale=0.9, el=rng.uniform(24, 30), az=rng.uniform(-40, -28), size=96)


# ---------- 2回目：ふつうの公園・運動場・池・緑地・庭園・灯台 ----------
def yugu(rng, n, x, y, kind):
    """遊具（すべり台・ぶらんこ・ジャングルジム・砂場・シーソー・鉄棒）"""
    c = f'yugu{n}'
    pa.MATS[c] = rng.choice(YUGU)
    if kind == 'slide':
        box(f'sdT{n}', c, (0.08, 0.08, 0.012), (x, y, 0.14))
        for dx in (-0.035, 0.035):
            for dy in (-0.035, 0.035):
                box(f'sdP{n}{dx}{dy}', 'tetsu', (0.008, 0.008, 0.14), (x + dx, y + dy, 0.07))
        box(f'sdS{n}', c, (0.06, 0.20, 0.01), (x, y - 0.13, 0.075), (math.radians(-38), 0, 0))
        for i in range(4):
            box(f'sdL{n}{i}', 'tetsu', (0.06, 0.006, 0.006), (x, y + 0.05, 0.03 + i * 0.03))
    elif kind == 'swing':
        for dx in (-0.10, 0.10):
            for dy in (-0.04, 0.04):
                box(f'swP{n}{dx}{dy}', c, (0.01, 0.01, 0.17), (x + dx, y + dy * 0.5, 0.085), (math.copysign(0.25, dy), 0, 0))
        box(f'swT{n}', c, (0.22, 0.012, 0.012), (x, y, 0.17))
        for dx in (-0.05, 0.05):
            box(f'swR{n}{dx}', 'tetsu', (0.004, 0.004, 0.11), (x + dx, y, 0.11))
            box(f'swS{n}{dx}', 'benchW', (0.04, 0.025, 0.008), (x + dx, y, 0.05))
    elif kind == 'jungle':
        for i in range(3):
            for j in range(3):
                box(f'jgP{n}{i}{j}', c, (0.006, 0.006, 0.14), (x - 0.05 + i * 0.05, y - 0.05 + j * 0.05, 0.07))
        for k in range(3):
            z = 0.045 + k * 0.045
            box(f'jgX{n}{k}', c, (0.11, 0.11, 0.004), (x, y, z))
    elif kind == 'sand':
        box(f'snB{n}', 'benchW', (0.18, 0.14, 0.03), (x, y, 0.015))
        box(f'snS{n}', 'sunaba', (0.16, 0.12, 0.032), (x, y, 0.017))
        sphere(f'snY{n}', 'sunaba', 0.03, (x + 0.03, y, 0.03), (1.2, 1, 0.6))
    elif kind == 'seesaw':
        box(f'ssB{n}', 'tetsu', (0.02, 0.03, 0.04), (x, y, 0.02))
        box(f'ssI{n}', c, (0.24, 0.025, 0.01), (x, y, 0.045), (0, math.radians(rng.choice((-9, 9))), 0))
    else:   # 鉄棒
        for i in range(3):
            box(f'tbP{n}{i}', 'tetsu', (0.008, 0.008, 0.07 + i * 0.02), (x - 0.08 + i * 0.08, y, (0.07 + i * 0.02) / 2))
        for i in range(2):
            box(f'tbB{n}{i}', c, (0.08, 0.005, 0.005), (x - 0.04 + i * 0.08, y, 0.07 + i * 0.02 + 0.005))


def bench(n, x, y, rz=0.0):
    box(f'bS{n}', 'benchW', (0.10, 0.03, 0.01), (x, y, 0.04), (0, 0, rz))
    box(f'bB{n}', 'benchW', (0.10, 0.01, 0.03), (x - 0.015 * math.sin(rz), y + 0.015 * math.cos(rz), 0.06), (0, 0, rz))


def m_playpark(rng, R, W, A):
    ground('shibaG')
    if rng.random() < 0.6:
        box('hiroba', 'tsuchiG', (rng.uniform(0.40, 0.60), rng.uniform(0.30, 0.42), 0.006), (rng.uniform(-0.12, 0.12), rng.uniform(-0.1, 0.05), 0.003))
    kinds = ['slide', 'swing', 'jungle', 'sand', 'seesaw', 'bar']
    rng.shuffle(kinds)
    slots = [(-0.22, 0.12), (0.18, 0.14), (-0.20, -0.14), (0.20, -0.12), (0.0, 0.0)]
    rng.shuffle(slots)
    for i in range(rng.randint(2, 4)):
        yugu(rng, i, slots[i][0], slots[i][1], kinds[i])
    for i in range(rng.randint(1, 2)):
        bench(i, rng.choice((-0.36, 0.36)), rng.uniform(-0.28, 0.0) + i * 0.1, math.pi / 2 if rng.random() < 0.5 else 0)
    if rng.random() < 0.35:   # トイレ
        tx = rng.choice((-0.34, 0.34))
        box('toire', 'toire', (0.12, 0.10, 0.10), (tx, 0.26, 0.05))
        box('toireY', 'roofP', (0.14, 0.12, 0.012), (tx, 0.26, 0.106))
    if rng.random() < 0.4:   # 時計の柱
        cyl('tokeiP', 'tetsu', 0.006, 0.24, (0.36 * rng.choice((-1, 1)), -0.30, 0.12), verts=6)
    trees(rng, rng.randint(2, 5), [(-0.40, 0.28), (0.40, 0.28), (-0.42, -0.04), (0.42, 0.0), (0.0, 0.32), (-0.2, 0.33)], ['round', 'round', 'sakura', 'pine'])
    return dict(target=(0, 0, 0.08), scale=0.86, el=rng.uniform(30, 36), az=rng.uniform(-40, -28), size=96)   # 遊具が見えるように少し寄る


def m_plaza(rng, R, W, A, name=''):
    """駅前広場・駐車場（しきつめた広場に、植えこみ・ベンチ・時計。駐車場は白い線と車）"""
    ground('asphalt' if '駐車' in name else 'jari')
    if '駐車' in name:
        for i in range(6):
            box(f'pl{i}', 'line', (0.008, 0.16, 0.006), (-0.30 + i * 0.12, 0.10, 0.003))
            box(f'plB{i}', 'line', (0.008, 0.16, 0.006), (-0.30 + i * 0.12, -0.16, 0.003))
        for i in range(rng.randint(2, 5)):
            c = f'car{i}'
            pa.MATS[c] = rng.choice(['#f4f4f4', '#2a2a2a', '#c8102e', '#3f7fbf', '#9aa0a8', '#e8c048'])
            x, y = -0.24 + rng.randrange(5) * 0.12, rng.choice((0.10, -0.16))
            box(f'carB{i}', c, (0.08, 0.13, 0.04), (x, y, 0.025), bevel=0.01)
            box(f'carT{i}', 'mado', (0.07, 0.07, 0.03), (x, y + 0.01, 0.06), bevel=0.008)
    else:
        for i in range(3):   # しきいしの目地
            box(f'meji{i}', 'line', (0.80, 0.006, 0.004), (0, -0.2 + i * 0.2, 0.002))
        box('bus', 'kanban', (0.02, 0.02, 0.14), (0.32, -0.26, 0.07))
        box('busB', 'kanbanT', (0.06, 0.01, 0.04), (0.32, -0.27, 0.15))
        for i in range(2):
            bench(i, -0.2 + i * 0.25, -0.26)
        cyl('tokeiP', 'tetsu', 0.008, 0.26, (-0.34, 0.20, 0.13), verts=6)
        cyl('tokei', 'kanban', 0.03, 0.012, (-0.34, 0.19, 0.27), (math.pi / 2, 0, 0), 16)
    for i, (x, y) in enumerate(((-0.38, -0.30), (0.38, 0.28), (-0.38, 0.28))):   # 植えこみ
        box(f'ue{i}', 'ishi', (0.12, 0.12, 0.04), (x, y, 0.02))
        sphere(f'ueK{i}', 'gTree', 0.06, (x, y, 0.06), (1, 1, 0.6))
    trees(rng, rng.randint(1, 2), [(0.40, -0.30), (0.0, 0.32)], ['round'])
    return dict(target=(0, 0, 0.06), scale=0.99, el=rng.uniform(32, 38), az=rng.uniform(-40, -28), size=96)


def m_sports(rng, R, W, A):
    ground('shibaG')
    box('ground2', 'tsuchiG', (0.80, 0.56, 0.006), (0, 0.02, 0.003))
    if rng.random() < 0.5:   # 野球のバックネット
        for i in range(5):
            a = math.radians(-45 + i * 22.5)
            box(f'net{i}', 'net', (0.10, 0.006, 0.16), (-0.30 + 0.12 * math.cos(a), 0.22 - 0.12 * math.sin(a) * -1, 0.08), (0, 0, -a))
        for i in range(4):
            box(f'base{i}', 'line', (0.02, 0.02, 0.008), (-0.25 + (i % 2) * 0.18 + (i // 2) * 0.12, 0.16 - (i % 2) * 0.12 - (i // 2) * 0.10, 0.008))
    else:                    # テニスコートやサッカーの線
        box('lineA', 'line', (0.60, 0.008, 0.008), (0, 0.24, 0.008))
        box('lineB', 'line', (0.60, 0.008, 0.008), (0, -0.20, 0.008))
        box('lineC', 'line', (0.008, 0.44, 0.008), (0, 0.02, 0.008))
        for dx in (-0.30, 0.30):
            box(f'goal{dx}', 'line', (0.012, 0.12, 0.07), (dx, 0.02, 0.035))
    for dx in (-0.40, 0.40):
        cyl(f'light{dx}', 'tetsu', 0.008, 0.40, (dx, 0.30, 0.20), verts=6)
        box(f'lightH{dx}', 'line', (0.06, 0.02, 0.04), (dx, 0.30, 0.40))
    bench(0, 0.1, -0.30)
    trees(rng, rng.randint(1, 3), [(-0.42, -0.30), (0.42, -0.30), (0.0, 0.34)], ['round', 'sakura'])
    return dict(target=(0, 0, 0.10), scale=0.99, el=rng.uniform(32, 38), az=rng.uniform(-40, -28), size=96)


def m_pondpark(rng, R, W, A):
    ground('shibaG')
    px, py = rng.uniform(-0.08, 0.08), rng.uniform(-0.02, 0.08)
    sphere('ike', 'ike', 0.22, (px, py, 0.0), (1.5, 1.0, 0.05))
    sphere('kishi', 'ishi', 0.235, (px, py, -0.004), (1.5, 1.0, 0.04))
    if rng.random() < 0.5:   # 橋
        box('hashi', 'hashiR', (0.05, 0.30, 0.012), (px + 0.08, py, 0.03), (0.12, 0, 0))
    if rng.random() < 0.5:   # はすの葉
        for i in range(4):
            sphere(f'hasu{i}', 'hasuH', 0.02, (px - 0.15 + i * 0.05, py - 0.06 + (i % 2) * 0.05, 0.012), (1, 1, 0.2))
    if rng.random() < 0.4:   # 鳥（かも）
        sphere('kamo', 'kitsune', 0.018, (px - 0.1, py + 0.05, 0.02), (1.4, 1, 0.8))
    for i in range(rng.randint(1, 2)):
        bench(i, -0.36 + i * 0.6, -0.30)
    trees(rng, rng.randint(3, 6), [(-0.40, 0.26), (0.40, 0.26), (-0.42, -0.06), (0.42, -0.10), (0.1, 0.32), (-0.15, 0.32)], ['round', 'pine', 'sakura', 'momiji'])
    return dict(target=(0, 0, 0.08), scale=0.99, el=rng.uniform(32, 38), az=rng.uniform(-40, -28), size=96)


def m_forest(rng, R, W, A):
    ground('shibaG')
    box('komichi', 'tsuchiG', (0.08, 0.72, 0.006), (rng.uniform(-0.1, 0.1), 0, 0.003), (0, 0, rng.uniform(-0.4, 0.4)))
    spots = [(x, y) for x in (-0.36, -0.18, 0.18, 0.36) for y in (-0.24, 0.0, 0.24)]
    trees(rng, rng.randint(7, 11), spots, ['round', 'sugi', 'round', 'pine'], (0.7, 1.05))
    bench(0, rng.choice((-0.06, 0.06)), -0.28)
    return dict(target=(0, 0, 0.12), scale=0.99, el=rng.uniform(28, 34), az=rng.uniform(-40, -28), size=96)


FLOWER = [('菖蒲|しょうぶ|かきつばた|藤', '#8a5ac8'), ('あじさい', '#5a7ad8'), ('梅|桜|さくら', '#f0a8c0'), ('', '#e85a7a')]


def m_flower(rng, name):
    """花の名所（菖蒲園・かきつばた園・あじさい・梅林・藤・花時計・〜ガーデン）：花の畑の列と小道、藤だなや花時計"""
    ground('shibaG')
    col = next(c for k, c in FLOWER if not k or __import__('re').search(k, name))
    pa.MATS['hana'], pa.MATS['hana2'] = col, jitter(col, rng, 30)
    box('komichi', 'jari', (0.08, 0.72, 0.006), (rng.uniform(-0.05, 0.05), 0, 0.003))
    for r in range(4):                                     # 花の畑（緑の葉の列に、花の点）
        y = -0.27 + r * 0.17
        for side in (-1, 1):
            x0 = side * 0.24
            box(f'une{r}{side}', 'hasuH', (0.30, 0.07, 0.03), (x0, y, 0.015))
            for k in range(6):
                sphere(f'hana{r}{side}{k}', 'hana' if (k + r) % 2 else 'hana2', 0.018, (x0 - 0.12 + k * 0.048, y + rng.uniform(-0.015, 0.015), 0.04))
    if '藤' in name:                                        # 藤だな
        for dx in (-0.1, 0.1):
            for dy in (0.22, 0.34):
                box(f'tana{dx}{dy}', 'azumaya', (0.012, 0.012, 0.18), (dx, dy, 0.09))
        box('tanaY', 'azumaya', (0.26, 0.16, 0.01), (0, 0.28, 0.18))
        for k in range(8):
            sphere(f'fuji{k}', 'hana', 0.02, (-0.1 + (k % 4) * 0.066, 0.24 + (k // 4) * 0.08, 0.15), (1, 1, 1.8))
    elif '時計' in name:                                     # 花時計
        cyl('dokei', 'hana2', 0.14, 0.03, (0, 0.24, 0.02), verts=24)
        box('hari1', 'kuro', (0.01, 0.10, 0.01), (0, 0.27, 0.04)); box('hari2', 'kuro', (0.07, 0.01, 0.01), (0.03, 0.24, 0.04))
    trees(rng, rng.randint(2, 4), [(-0.40, 0.30), (0.40, 0.30), (-0.42, -0.30), (0.42, -0.30)], ['sakura' if '桜' in name or '梅' in name else 'round', 'round'])
    return dict(target=(0, 0, 0.06), scale=0.95, el=rng.uniform(32, 38), az=rng.uniform(-40, -28), size=96)


def m_garden(rng, R, W, A, name=''):
    if '庭園' not in name:   # 日本庭園でない花の名所は花の畑
        return m_flower(rng, name)
    ground('jari')
    sphere('ike', 'ike', 0.18, (-0.06, 0.04, 0.0), (1.6, 1.0, 0.05))
    box('hashi', 'hashiR', (0.30, 0.05, 0.012), (-0.06, 0.04, 0.03), (0, 0.1, 0))
    toro(0, 0.22, -0.18, 1.3)
    for i in range(3):
        sphere(f'ishi{i}', 'ishi', 0.04, (0.1 + i * 0.07, 0.24, 0.0), (1.3, 1, 0.6))
    trees(rng, 4, [(-0.38, 0.26), (0.38, 0.26), (-0.40, -0.22), (0.36, 0.06)], ['pine', 'momiji', 'pine'])
    return dict(target=(0, 0, 0.08), scale=0.99, el=rng.uniform(30, 36), az=rng.uniform(-40, -28), size=96)


def m_lighthouse(rng, R, W, A):
    box('umi', 'umiB', (1.0, 0.8, 0.02), (0, 0, -0.01))
    for i in range(3):
        box(f'nami{i}', 'nami', (rng.uniform(0.15, 0.3), 0.012, 0.004), (rng.uniform(-0.35, 0.35), -0.3 + i * 0.25, 0.002))
    box('teibo', 'teibo', (0.80, 0.10, 0.05), (0, -0.02, 0.025), (0, 0, rng.uniform(-0.3, 0.3)))
    red = rng.random() < 0.5
    cyl('todai', 'todaiR' if red else 'todai', 0.05, 0.30, (0.18, -0.02, 0.20), verts=12, r2=0.04)
    box('todaiT', 'mado', (0.07, 0.07, 0.04), (0.18, -0.02, 0.37))
    cyl('todaiY', 'todaiR' if not red else 'todai', 0.05, 0.03, (0.18, -0.02, 0.405), verts=12, r2=0.0)
    return dict(target=(0, 0, 0.14), scale=0.95, el=rng.uniform(26, 32), az=rng.uniform(-40, -28), size=96)


# ---------- 街の主な建物（学校・病院・交番や警察署・消防署・郵便局。役所と図書館は m_public） ----------
def car(n, x, y, rz=0.0, body='carW', low=None, top=None, s=1.0):
    """とめてある車（上から見ると小さな箱）。low：下半分の色（パトカーの黒など）、top：屋根の上の物（赤いランプなど）"""
    o = [box(f'car{n}', body, (0.09 * s, 0.05 * s, 0.03 * s), (x, y, 0.022 * s), (0, 0, rz), bevel=0.006)]
    if low:
        o.append(box(f'carL{n}', low, (0.092 * s, 0.052 * s, 0.014 * s), (x, y, 0.014 * s), (0, 0, rz)))
    o.append(box(f'carM{n}', 'mado', (0.05 * s, 0.046 * s, 0.018 * s), (x - 0.005 * s * math.cos(rz), y - 0.005 * s * math.sin(rz), 0.044 * s), (0, 0, rz)))
    if top:
        box(f'carT{n}', top, (0.012 * s, 0.03 * s, 0.008 * s), (x, y, 0.056 * s), (0, 0, rz))
    return o


def flagpole(x, y, h=0.30):
    cyl('hata', 'hashira', 0.005, h, (x, y, h / 2), verts=6)
    box('hataF', 'line', (0.05, 0.004, 0.032), (x + 0.026, y, h - 0.02))


def m_school(rng, R, W, A, sub='elem'):
    """学校：うしろに長い校舎（窓の列・時計）、右に体育館、前に校庭（土・ゴール）。小・中学校はプール、大学は校舎が多い"""
    ground('shibaG')
    floors = {'elem': 3, 'middle': rng.choice([3, 4]), 'high': 4, 'uni': rng.choice([4, 5])}[sub]
    fh = 0.062
    w, d = rng.uniform(0.60, 0.74), 0.13
    x0, y0 = rng.uniform(-0.10, -0.04), 0.22
    box('kosha', 'wallP', (w, d, floors * fh), (x0, y0, floors * fh / 2))
    windows_grid('mado', x0 - w / 2 + 0.02, x0 + w / 2 - 0.02, y0 - d / 2 - 0.002, 0, floors, fh, rng.randint(8, 11))
    box('okujo', 'roofP', (w + 0.015, d + 0.015, 0.014), (x0, y0, floors * fh + 0.007))
    box('tokeiB', 'wallP', (0.09, d * 0.7, 0.06), (x0, y0, floors * fh + 0.03))   # 時計のある塔屋
    cyl('tokei', 'tokei', 0.026, 0.01, (x0, y0 - d * 0.35 - 0.004, floors * fh + 0.032), (math.pi / 2, 0, 0), 14)
    box('hari', 'kuro', (0.004, 0.003, 0.018), (x0, y0 - d * 0.35 - 0.01, floors * fh + 0.036))
    if sub == 'uni':   # 大学：まわりにも校舎
        for i, (bx, by) in enumerate(((0.30, -0.02), (-0.30, -0.10))):
            f2 = rng.randint(2, 4)
            box(f'kosha{i}', 'wallP', (0.22, 0.14, f2 * fh), (bx, by, f2 * fh / 2))
            windows_grid(f'mado{i}', bx - 0.10, bx + 0.10, by - 0.072, 0, f2, fh, 4)
            box(f'okujo{i}', 'roofP', (0.23, 0.15, 0.012), (bx, by, f2 * fh + 0.006))
        box('hiroba', 'jari', (0.36, 0.20, 0.006), (0.0, -0.20, 0.003))
        trees(rng, rng.randint(4, 6), [(-0.44, -0.30), (0.44, -0.30), (-0.44, 0.05), (0.44, 0.15), (0.0, 0.34), (-0.25, 0.34)], ['round', 'sakura', 'momiji', 'round'], s=(0.7, 0.95))
        return dict(target=(0, 0, 0.12), scale=1.02, el=rng.uniform(28, 34), az=rng.uniform(-40, -28), size=96)
    # 体育館（かまぼこ形の屋根）
    gx, gy = 0.33, 0.0
    box('taiiku', 'wallP', (0.20, 0.24, 0.10), (gx, gy, 0.05))
    g = cyl('taiikuY', 'roofG', 0.12, 0.21, (gx, gy, 0.10), (0, math.pi / 2, 0), 16)
    g.scale = (0.35, 1.0, 1.0)
    # 校庭（土）とゴール・鉄棒
    box('kotei', 'tsuchiG', (0.56, 0.30, 0.006), (-0.12, -0.15, 0.003))
    for dx in (-0.37, 0.13):
        box(f'goal{dx}', 'line', (0.012, 0.09, 0.05), (dx, -0.15, 0.025))
    if sub == 'elem':
        for i in range(3):
            box(f'tetsubo{i}', 'tetsu', (0.05, 0.004, 0.004), (-0.33 + i * 0.06, -0.29, 0.03 + i * 0.008))
            for dx in (-0.025, 0.025):
                box(f'tbP{i}{dx}', 'tetsu', (0.004, 0.004, 0.03 + i * 0.008), (-0.33 + i * 0.06 + dx, -0.29, (0.03 + i * 0.008) / 2))
    if sub in ('elem', 'middle'):   # プール
        box('poolW', 'jari', (0.20, 0.13, 0.012), (0.33, -0.24, 0.006))
        box('pool', 'pool', (0.17, 0.10, 0.004), (0.33, -0.24, 0.013))
        for i in range(3):
            box(f'lane{i}', 'line', (0.17, 0.003, 0.002), (0.33, -0.27 + i * 0.03, 0.016))
    flagpole(-0.42, 0.12, 0.30)
    trees(rng, rng.randint(3, 5), [(-0.44, -0.05), (-0.44, 0.30), (0.20, 0.34), (-0.25, 0.34), (0.45, 0.22), (0.45, -0.12)], ['sakura', 'round', 'round'], s=(0.7, 0.95))   # 木はうしろと横に（校舎と校庭を隠さない）
    return dict(target=(0, 0, 0.11), scale=1.02, el=rng.uniform(30, 36), az=rng.uniform(-40, -28), size=96)


def m_hospital(rng, R, W, A):
    """病院：白い高い建物（窓の帯）、玄関のひさし、駐車場の車、救急車。屋上にヘリポートのことも（赤十字の印は描かない）"""
    ground('asphalt')
    floors = rng.randint(4, 7)
    fh = 0.058
    w, d = rng.uniform(0.40, 0.52), rng.uniform(0.22, 0.28)
    x0, y0 = rng.uniform(-0.04, 0.06), 0.12
    box('byoto', 'wallP', (w, d, floors * fh), (x0, y0, floors * fh / 2))
    for f in range(floors):   # 横に長い窓の帯
        box(f'obi{f}', 'mado', (w - 0.03, 0.006, fh * 0.42), (x0, y0 - d / 2 - 0.002, (f + 0.55) * fh))
    box('okujo', 'roofP', (w + 0.012, d + 0.012, 0.012), (x0, y0, floors * fh + 0.006))
    if rng.random() < 0.5:   # ヘリポート
        cyl('heli', 'heli', 0.08, 0.008, (x0, y0, floors * fh + 0.016), verts=20)
        for dx in (-0.025, 0.025):
            box(f'H{dx}', 'kuro', (0.008, 0.06, 0.004), (x0 + dx, y0, floors * fh + 0.022))
        box('Hm', 'kuro', (0.05, 0.008, 0.004), (x0, y0, floors * fh + 0.022))
    else:
        box('kikai', 'hashira', (0.10, 0.08, 0.04), (x0 + w * 0.25, y0 + 0.04, floors * fh + 0.03))
    box('low', 'wallP', (w * 0.6, 0.10, 0.07), (x0 - w * 0.15, y0 - d / 2 - 0.05, 0.035))   # 低い外来の棟
    box('hisashi', 'accP', (0.16, 0.08, 0.012), (x0 + w * 0.2, y0 - d / 2 - 0.06, 0.07))
    for dx in (-0.06, 0.06):
        box(f'hP{dx}', 'hashira', (0.008, 0.008, 0.07), (x0 + w * 0.2 + dx, y0 - d / 2 - 0.09, 0.035))
    for i in range(6):   # 駐車場の線
        box(f'pl{i}', 'line', (0.004, 0.06, 0.002), (-0.38 + i * 0.07, -0.28, 0.001))
    for i in range(rng.randint(2, 4)):
        car(i, -0.345 + i * 0.07, -0.28, math.pi / 2, rng.choice(['carW', 'carS', 'carB', 'carW']))
    a = car('Q', 0.32, -0.22, 0.0, 'carW', s=1.25)   # 救急車（白に赤い帯）
    box('kyuObi', 'kyuR', (0.114, 0.064, 0.008), (0.32, -0.22, 0.026))
    trees(rng, rng.randint(2, 4), [(-0.42, 0.28), (0.42, 0.30), (0.42, 0.05), (-0.42, 0.05)], ['round', 'round', 'sakura'])
    return dict(target=(0, 0, 0.16), scale=1.04, el=rng.uniform(28, 34), az=rng.uniform(-40, -28), size=96)


def m_police(rng, R, W, A, sub='koban'):
    """交番（小さな建物に赤いランプ・パトカー・自転車）。警察署は大きな建物にアンテナとパトカーが何台も"""
    small = sub != 'station'   # 交番は小さいので、地面をせまくして大きく写す
    ground('asphalt', *((0.56, 0.46) if small else (0.92, 0.72)))
    if sub == 'station':
        floors, fh, w, d = rng.randint(3, 4), 0.065, rng.uniform(0.42, 0.52), 0.24
    else:
        floors, fh, w, d = 2, 0.07, rng.uniform(0.20, 0.26), rng.uniform(0.16, 0.20)
    x0, y0 = (rng.uniform(-0.04, 0.02), 0.06) if small else (rng.uniform(-0.06, 0.04), 0.10)
    box('tate', 'wallP', (w, d, floors * fh), (x0, y0, floors * fh / 2))
    windows_grid('mado', x0 - w / 2 + 0.02, x0 + w / 2 - 0.02, y0 - d / 2 - 0.002, fh, floors - 1, fh, max(2, int(w / 0.06)))
    box('genkan', 'mado', (0.07, 0.006, 0.05), (x0, y0 - d / 2 - 0.003, 0.025))
    if sub == 'koban' and rng.random() < 0.5:   # 三角屋根の交番
        roof('yane', 'roofP', w + 0.03, d + 0.03, 0.06, floors * fh, 0.0, x=x0, y=y0)
    else:
        box('okujo', 'roofP', (w + 0.012, d + 0.012, 0.012), (x0, y0, floors * fh + 0.006))
    sphere('lamp', 'akaR', 0.018, (x0, y0 - d / 2 - 0.01, 0.065))   # 赤いランプ
    box('kanban', 'accP', (0.10, 0.006, 0.022), (x0, y0 - d / 2 - 0.004, fh + 0.012))
    if sub == 'station':
        cyl('antena', 'tetsu', 0.006, 0.20, (x0 + w * 0.3, y0 + 0.04, floors * fh + 0.10), verts=6)
        for k in range(3):
            box(f'antR{k}', 'tetsu', (0.04 - k * 0.008, 0.004, 0.004), (x0 + w * 0.3, y0 + 0.04, floors * fh + 0.08 + k * 0.05))
        flagpole(x0 - w / 2 - 0.05, y0 - d / 2 - 0.04, 0.26)
    n = rng.randint(3, 4) if sub == 'station' else 1
    for i in range(n):   # パトカー（白と黒、屋根に赤いランプ）
        car(i, (-0.30 + i * 0.13) if not small else 0.14, -0.24 if not small else -0.16, 0.0, 'carW', low='kuro', top='akaR')
    if small:
        for i in range(rng.randint(1, 2)):   # 自転車
            box(f'jt{i}', 'kuro', (0.05, 0.006, 0.02), (x0 - w / 2 - 0.04 - i * 0.03, y0 - d / 2 - 0.02, 0.02))
        trees(rng, rng.randint(1, 2), [(-0.24, 0.16), (0.24, 0.16)], ['round', 'sakura'], s=(0.55, 0.75))
        return dict(target=(0, 0, 0.08), scale=0.66, el=rng.uniform(30, 36), az=rng.uniform(-40, -28), size=96)
    trees(rng, rng.randint(1, 3), [(-0.42, 0.28), (0.42, 0.28), (0.42, -0.10)], ['round', 'sakura'])
    return dict(target=(0, 0, 0.13), scale=1.0, el=rng.uniform(30, 36), az=rng.uniform(-40, -28), size=96)


def m_fire(rng, R, W, A):
    """消防署：1階に車庫（赤い消防車が見える）、横に訓練の塔、前に消防車とはしご車"""
    ground('asphalt')
    floors, fh = rng.randint(2, 3), 0.07
    w, d = rng.uniform(0.40, 0.50), 0.22
    x0, y0 = rng.uniform(-0.10, -0.02), 0.14
    box('tate', 'wallP', (w, d, floors * fh), (x0, y0, floors * fh / 2))
    windows_grid('mado', x0 - w / 2 + 0.02, x0 + w / 2 - 0.02, y0 - d / 2 - 0.002, fh, floors - 1, fh, 6)
    box('okujo', 'roofP', (w + 0.012, d + 0.012, 0.012), (x0, y0, floors * fh + 0.006))
    bays = 3
    for i in range(bays):   # 車庫の口と、中の消防車
        bx = x0 - w / 2 + (i + 0.5) * w / bays
        box(f'bay{i}', 'kuro', (w / bays * 0.8, 0.006, fh * 0.8), (bx, y0 - d / 2 - 0.003, fh * 0.4))
        box(f'bayT{i}', 'shobo', (w / bays * 0.6, 0.008, fh * 0.45), (bx, y0 - d / 2 - 0.006, fh * 0.25))
    box('obi', 'accP', (w + 0.004, d + 0.004, 0.012), (x0, y0, fh * 0.95))
    tx = x0 + w / 2 + 0.09   # 訓練の塔
    box('to', 'wallP', (0.08, 0.08, 0.42), (tx, y0 + 0.04, 0.21))
    for k in range(5):
        box(f'toM{k}', 'mado', (0.04, 0.006, 0.03), (tx, y0, 0.06 + k * 0.075))
    box('toY', 'roofP', (0.09, 0.09, 0.012), (tx, y0 + 0.04, 0.426))
    for i in range(rng.randint(1, 2)):   # 前にとめた消防車（はしご車は銀のはしご）
        car(i, -0.25 + i * 0.16, -0.24, 0.0, 'shobo', top='akaR', s=1.4)
        if i == 0 and rng.random() < 0.6:
            box('hashigo', 'tetsu', (0.12, 0.016, 0.008), (-0.25, -0.24, 0.07))
    trees(rng, rng.randint(1, 3), [(-0.42, 0.30), (0.42, 0.30), (0.43, -0.25)], ['round', 'sakura'])
    return dict(target=(0, 0, 0.14), scale=1.02, el=rng.uniform(28, 34), az=rng.uniform(-40, -28), size=96)


def m_post(rng, R, W, A):
    """郵便局：1〜2階の建物に赤い帯と看板、前に丸い赤いポスト、配達の赤い車とバイク"""
    ground('asphalt', 0.72, 0.56)
    floors, fh = rng.randint(1, 2), 0.075
    w, d = rng.uniform(0.32, 0.42), rng.uniform(0.20, 0.24)
    x0, y0 = rng.uniform(-0.04, 0.04), 0.09
    box('tate', 'wallP', (w, d, floors * fh), (x0, y0, floors * fh / 2))
    windows_grid('mado', x0 - w / 2 + 0.02, x0 + w / 2 - 0.02, y0 - d / 2 - 0.002, 0, floors, fh, rng.randint(3, 5))
    box('okujo', 'roofP', (w + 0.012, d + 0.012, 0.012), (x0, y0, floors * fh + 0.006))
    box('obi', 'accP', (w + 0.006, d + 0.006, 0.02), (x0, y0, floors * fh - 0.012))   # 赤い帯
    box('kanban', 'kanban', (0.10, 0.006, 0.02), (x0, y0 - d / 2 - 0.006, floors * fh - 0.012))
    px, py = x0 - w / 2 - 0.05, y0 - d / 2 - 0.05   # 丸いポスト
    cyl('posuto', 'posuto', 0.018, 0.06, (px, py, 0.03), verts=12)
    sphere('posutoT', 'posuto', 0.018, (px, py, 0.06), (1, 1, 0.6))
    box('posutoK', 'kuro', (0.016, 0.004, 0.004), (px, py - 0.018, 0.048))
    car('V', 0.20, -0.18, 0.0, 'posuto')   # 配達の赤い車
    for i in range(rng.randint(1, 3)):   # 赤いバイク
        box(f'bike{i}', 'posuto', (0.04, 0.014, 0.022), (-0.24 + i * 0.05, -0.19, 0.018))
    for i in range(3):
        box(f'pl{i}', 'line', (0.004, 0.06, 0.002), (0.06 + i * 0.07, -0.21, 0.001))
    trees(rng, rng.randint(1, 2), [(-0.32, 0.22), (0.32, 0.22)], ['round', 'sakura'], s=(0.65, 0.85))
    return dict(target=(0, 0, 0.09), scale=0.8, el=rng.uniform(30, 36), az=rng.uniform(-40, -28), size=96)


def build(e):
    rng = random.Random(e['id'])
    base = BASE[BASE_OF.get(e['k'], 'historic')]
    cols = [c if isinstance(c, str) and len(c) == 7 else base[i] for i, c in enumerate((e['c'] + [0, 0, 0])[:3])]
    pa.MATS['roofP'], pa.MATS['wallP'], pa.MATS['accP'] = jitter(cols[0], rng), jitter(cols[1], rng, 8), jitter(cols[2], rng, 10)
    k = e['k']
    if k == 'shrine':
        return m_shrine(rng, *cols)
    if k == 'inari':
        return m_shrine(rng, *cols, inari=True)
    if k == 'temple':
        return m_temple(rng, *cols)
    if k == 'station':
        return m_station(rng, *cols, train=e.get('train', 'meitetsu'))
    if k == 'castle':
        return m_castle(rng, *cols)
    if k in ('museum', 'library', 'townhall', 'art', 'aquarium', 'onsen'):
        return m_public(rng, *cols, kind=k)
    if k == 'school':
        return m_school(rng, *cols, sub=e.get('sub', 'elem'))
    if k == 'hospital':
        return m_hospital(rng, *cols)
    if k == 'police':
        return m_police(rng, *cols, sub=e.get('sub', 'koban'))
    if k == 'fire':
        return m_fire(rng, *cols)
    if k == 'post':
        return m_post(rng, *cols)
    if k == 'kofun':
        return m_kofun(rng, *cols)
    if k == 'view':
        return m_view(rng, *cols, name=e['name'])
    if k == 'hill':
        return m_hill(rng, *cols)
    if k == 'church':
        return m_church(rng, *cols)
    if k == 'park':
        return m_park(rng, *cols)
    if k == 'beach':
        return m_beach(rng, *cols)
    if k == 'statue':
        return m_statue(rng, *cols)
    if k == 'playpark':
        return m_playpark(rng, *cols)
    if k == 'sports':
        return m_sports(rng, *cols)
    if k == 'plaza':
        return m_plaza(rng, *cols, name=e['name'])
    if k == 'pondpark':
        return m_pondpark(rng, *cols)
    if k == 'forest':
        return m_forest(rng, *cols)
    if k == 'garden':
        return m_garden(rng, *cols, name=e['name'])
    if k == 'lighthouse':
        return m_lighthouse(rng, *cols)
    return m_historic(rng, *cols)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    part = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--part=')), None)
    todo = [e for e in LIST if not args or e['id'] in args]
    if '--new' in sys.argv:   # まだ絵のない名所だけ
        todo = [e for e in todo if not os.path.exists(os.path.join(pa.OUT, e['id'] + '.png'))]
    if part:
        i, n = map(int, part.split('/'))
        todo = todo[i::n]
    pa.MODELS.clear()
    for e in todo:
        pa.MODELS[e['id']] = (lambda e=e: build(e))
    for e in todo:
        pa.make(e['id'])

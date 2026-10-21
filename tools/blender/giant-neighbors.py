# にしおさんぽGO：西尾市のとなりの市町（岡崎・安城・碧南・高浜・幸田・蒲郡）の注目スポットを、1か所ずつ手で形を作った「特大のドット絵」（96×96）に
# - giant.py（西尾城・岩瀬文庫など）と同じ作り方・焼き方。形と色は、その名所の 48×48 の絵（pixel.js の LANDMARK_ART。
#   Wikimedia Commons の写真を見て描いたもの。docs/landmark-photos.md）に合わせる
# - できた PNG は nishio-go/art/giant/<名前>.png（名前は spots.json の id）。歩く地図では pixel.js の GIANT_ART でその名所に大きく描く
# 使い方：python tools/blender/giant-neighbors.py （ぜんぶ）／ python tools/blender/giant-neighbors.py okazaki-daijuji （ひとつ）
import importlib.util
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('giant', os.path.join(HERE, 'giant.py'))
gi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gi)
pa = gi.pa
bpy = pa.bpy
box, cyl, sphere, pine, windows = pa.box, pa.cyl, pa.sphere, gi.pine, gi.windows

pa.MATS.update({
    'gTree': '#4f9a3e', 'sakura': '#f0b8c8', 'momiji': '#c8502e', 'take': '#6aa84a', 'umi': '#3d86c6', 'ike': '#4a9ad0', 'hasuHa': '#4f9e3a',
    'shu': '#d8402e', 'shuD': '#a8302a', 'kin': '#e8b830', 'sumi': '#2a2a2e', 'kiji': '#b08860', 'kijiD': '#7a5a3c', 'yaneB': '#4a4f57',
    'toro': '#a8a49a', 'ishi': '#8e8a80', 'asphalt': '#7a7c80', 'shibaG': '#6aa84a', 'concrete': '#c8c6c0', 'glassB': '#5a8ab0',
    'jrSilver': '#c8ccd0', 'jrOrange': '#e8781e', 'shinkansen': '#f4f4f4', 'shinB': '#1f4a9a', 'taru': '#9a6a3a', 'taruD': '#5a3a20',
    'stoneR': '#9a958a', 'kayabuki': '#b89a5a', 'ajisaiB': '#6a7fd6', 'ajisaiP': '#b07ad0', 'kaki': '#e8641c', 'tulipR': '#e8443a',
    'tulipY': '#f2c230', 'fusha': '#8a5a3a', 'hane': '#f0ece0', 'navy': '#203a63', 'onigawara': '#5a5048', 'cream': '#ece0c4',
    'yaneR': '#b8483a', 'pink': '#f0a8b8', 'whale': '#3f78c8', 'koshi2': '#3a3430', 'sl': '#2a2a2a', 'slR': '#c8302a', 'zou': '#a8a49a',
    'renga': '#a8483a', 'haka': '#9aa0a8', 'senro': '#5a4a3a', 'rail': '#9aa0a8', 'sugi': '#2c5a32', 'kanban': '#f4f2e8', 'kane': '#7a6a3a', 'doban': '#6fa89a', 'midoriY': '#2f6b4a', 'salmon': '#f0a088', 'tanuki': '#8a5a34', 'tsutsuji': '#e84a8a', 'yakiita': '#2e2a28',
})


# ---------- 部品 ----------
def mesh(name, mat, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(pa.material(mat))
    return o


def roof(name, mat, w, d, h, z, top=0.25, x=0.0, y=0.0, flat=False):
    """寄棟の屋根。短いほうの向きは棟まで閉じ、棟は長いほうの向き（長さは 長い辺−短い辺 ＋ 短い辺×top）。
    flat=True は入母屋の下の段や裳階（もこし）のように、上に別の屋根や建物がのる段：四方から同じだけ内へ入った平らな上面。
    （giant.py の roof は細長いとひし形にゆがむので、ここでは面を直に作る）"""
    if flat:
        inset = min(w, d) * (1 - top) / 2
        tw, td = max(w - 2 * inset, 0.002), max(d - 2 * inset, 0.002)
    else:
        short = min(w, d)
        ridge = abs(w - d) + short * top
        tw, td = (ridge, 0.002) if w >= d else (0.002, ridge)
    v = [(x - w / 2, y - d / 2, z), (x + w / 2, y - d / 2, z), (x + w / 2, y + d / 2, z), (x - w / 2, y + d / 2, z),
         (x - tw / 2, y - td / 2, z + h), (x + tw / 2, y - td / 2, z + h), (x + tw / 2, y + td / 2, z + h), (x - tw / 2, y + td / 2, z + h)]
    return mesh(name, mat, v, [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)])


def gable(name, mat, w, d, h, z, x=0.0, y=0.0):
    """切妻の屋根（三角の柱。棟は x の向き）"""
    a, b = x - w / 2, x + w / 2
    v = [(a, y - d / 2, z), (a, y + d / 2, z), (a, y, z + h), (b, y - d / 2, z), (b, y + d / 2, z), (b, y, z + h)]
    return mesh(name, mat, v, [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (0, 2, 5, 3)])


def gable_y(name, mat, w, d, h, z, x=0.0, y=0.0):
    """切妻の屋根（棟が y の向き。三角の面が手前を向く）"""
    a, b = y - d / 2, y + d / 2
    v = [(x - w / 2, a, z), (x + w / 2, a, z), (x, a, z + h), (x - w / 2, b, z), (x + w / 2, b, z), (x, b, z + h)]
    return mesh(name, mat, v, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (0, 3, 5, 2)])


def irimoya(name, mat, w, d, h, z, x=0.0, y=0.0):
    """入母屋の屋根（下は寄棟、上に小さな切妻）"""
    roof(name, mat, w, d, h * 0.62, z, 0.55, x, y, flat=True)
    gable(name + 'g', mat, w * 0.55, d * 0.42, h * 0.5, z + h * 0.5, x, y)


def ground(mat, w=1.0, d=0.8, x=0.0, y=0.0):
    return box('ji' + mat, mat, (w, d, 0.02), (x, y, 0.0))


def tree(n, x, y, s=1.0, mat='gTree'):
    cyl(f'miki{n}', 'miki', 0.022 * s, 0.14 * s, (x, y, 0.07 * s), verts=8)
    sphere(f'ha{n}', mat, 0.10 * s, (x, y, 0.19 * s), (1, 1, 0.9))
    sphere(f'ha{n}b', mat, 0.07 * s, (x + 0.03 * s, y - 0.02 * s, 0.27 * s))


def torii(n, x, y, s=1.0, mat='shu', rot=0.0):
    c, sn = math.cos(rot), math.sin(rot)
    for k in (-1, 1):
        cyl(f'tp{n}{k}', mat, 0.018 * s, 0.26 * s, (x + k * 0.1 * s * c, y + k * 0.1 * s * sn, 0.13 * s), verts=10)
    box(f'tk{n}', 'sumi' if mat == 'shu' else mat, (0.30 * s, 0.035 * s, 0.03 * s), (x, y, 0.27 * s), (0, 0, rot))
    box(f'tn{n}', mat, (0.24 * s, 0.025 * s, 0.022 * s), (x, y, 0.22 * s), (0, 0, rot))


def toro(n, x, y, s=1.0):
    box(f'toroA{n}', 'toro', (0.05 * s, 0.05 * s, 0.10 * s), (x, y, 0.05 * s))
    box(f'toroB{n}', 'toro', (0.07 * s, 0.07 * s, 0.04 * s), (x, y, 0.12 * s))
    cyl(f'toroC{n}', 'toro', 0.06 * s, 0.03 * s, (x, y, 0.155 * s), (0, 0, math.pi / 4), 4, r2=0.01)


def steps(n, mat, x, y, w, k, run=0.04, rise=0.025):
    """手前（-y）から奥へ上る石段"""
    for i in range(k):
        box(f'dan{n}{i}', mat, (w, run, rise * (i + 1)), (x, y + i * run, rise * (i + 1) / 2))


def train(n, body, band, x, y, length, z=0.02, w=0.16, h=0.20, win='mado'):
    box(f'tr{n}', body, (length, w, h), (x, y, z + h / 2 + 0.02), bevel=0.02)
    box(f'trb{n}', band, (length + 0.004, w + 0.004, 0.022), (x, y, z + h * 0.28 + 0.02))
    k = max(2, int(length / 0.12))
    windows(f'trw{n}', win, [x - length / 2 + (i + 0.5) * length / k for i in range(k)], y - w / 2 - 0.003, z + h * 0.66 + 0.02, 0.07, 0.055)
    box(f'trs{n}', 'shitami', (length, w + 0.04, 0.02), (x, y, z + 0.01))


def platform(n, x, y, w, d=0.16, h=0.08, roof_h=0.24):
    box(f'pf{n}', 'home', (w, d, h), (x, y, h / 2))
    for i in range(3):
        box(f'pfh{n}{i}', 'hashira', (0.018, 0.018, roof_h), (x - w * 0.35 + i * w * 0.35, y + d * 0.2, h + roof_h / 2))
    box(f'pfy{n}', 'yane2', (w * 0.92, d * 1.1, 0.02), (x, y, h + roof_h), (math.radians(-6), 0, 0))


def office(n, x, y, w, d, h, floors, wall='modern', win='mado', z=0.0):
    box(f'of{n}', wall, (w, d, h), (x, y, z + h / 2))
    cols = max(2, int(w / 0.07))
    for f in range(floors):
        zz = z + (f + 0.6) * h / floors
        windows(f'ofw{n}{f}', win, [x - w / 2 + (i + 0.5) * w / cols for i in range(cols)], y - d / 2 - 0.003, zz, w / cols * 0.6, h / floors * 0.42)


def hall(n, x, y, w, d, h, wall='kiji', roofm='kawaraG', rh=None, z=0.05, kidan=True, front='koshi2'):
    """お寺・お宮の建物（基壇・壁・入母屋の屋根・正面の格子）"""
    if kidan:
        box(f'kd{n}', 'kidan', (w + 0.08, d + 0.08, z), (x, y, z / 2))
    box(f'hw{n}', wall, (w, d, h), (x, y, z + h / 2))
    for i in range(7):
        box(f'hk{n}{i}', front, (0.008, 0.008, h * 0.7), (x - w * 0.36 + i * w * 0.12, y - d / 2 - 0.004, z + h * 0.4))
    for k in (-1, 1):
        box(f'hp{n}{k}', 'kijiD', (0.025, 0.025, h), (x + k * w / 2, y - d / 2, z + h / 2))
    irimoya(f'hr{n}', roofm, w + 0.16, d + 0.16, rh or (w + d) * 0.32, z + h, x, y)


def ferris(n, x, y, r, zc, colors, mat='hane', spokes=12):
    """観覧車（正面を向いた輪・輻・色とりどりのゴンドラ・足）"""
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.012, location=(x, y, zc), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(pa.material(mat))
    for i in range(spokes):
        a = i * math.pi * 2 / spokes
        box(f'sp{n}{i}', mat, (r, 0.008, 0.008), (x + math.cos(a) * r / 2, y, zc + math.sin(a) * r / 2), (0, -a, 0))
        box(f'go{n}{i}', colors[i % len(colors)], (0.05, 0.05, 0.05), (x + math.cos(a) * r, y - 0.01, zc + math.sin(a) * r - 0.03), bevel=0.01)
    for k in (-1, 1):
        box(f'ft{n}{k}', mat, (0.02, 0.03, zc * 1.15), (x + k * r * 0.35, y + 0.02, zc / 2), (0, k * 0.36, 0))
    cyl(f'hub{n}', 'hashira', 0.03, 0.06, (x, y, zc), (math.pi / 2, 0, 0), 12)


def kura(n, x, y, w, d, h, wall='shikkui', low='shitami', roofm='kawaraG'):
    """土蔵（白い壁、下は黒い板張り・なまこ壁、切妻の屋根）"""
    box(f'kw{n}', wall, (w, d, h), (x, y, h / 2))
    box(f'kl{n}', low, (w + 0.004, d + 0.004, h * 0.32), (x, y, h * 0.16))
    gable(f'kr{n}', roofm, w + 0.08, d + 0.1, h * 0.38, h, x, y)
    box(f'kt{n}', 'mado', (0.07, 0.01, 0.12), (x, y - d / 2 - 0.004, 0.06))


def water(mat, w, d, x=0.0, y=0.0, z=0.012):
    return box('mz' + mat + str(x), mat, (w, d, 0.006), (x, y, z))


def barrel(n, x, y, r=0.11, h=0.22, stones=True):
    cyl(f'ta{n}', 'taru', r, h, (x, y, h / 2), verts=20)
    for k, z in enumerate((0.25, 0.7)):
        cyl(f'tah{n}{k}', 'taruD', r + 0.006, 0.018, (x, y, h * z), verts=20)
    if stones:   # 重しの石を山のように積む
        for j, (dz, rr, cnt) in enumerate(((0.02, r * 0.75, 7), (0.06, r * 0.45, 5), (0.10, r * 0.12, 1))):
            for i in range(cnt):
                a = i * 2 * math.pi / cnt + j
                sphere(f'ts{n}{j}{i}', 'stoneR', 0.032, (x + math.cos(a) * rr, y + math.sin(a) * rr, h + dz), (1.2, 1.2, 0.8))


# ---------- 岡崎市 ----------
def okazaki_daijuji():
    """大樹寺の山門：二重の大きな楼門（黒ずんだ木の組物、上の階にまわり縁と手すり、二重の屋根）、両わきに花頭窓のある白壁の回廊"""
    ground('jari')
    for x in (-0.40, 0.40):   # 両わきの回廊
        box(f'kairo{x}', 'shikkui', (0.16, 0.12, 0.14), (x, 0.02, 0.07))
        box(f'kairoS{x}', 'kijiD', (0.164, 0.124, 0.03), (x, 0.02, 0.015))
        cyl(f'katomado{x}', 'kijiD', 0.025, 0.01, (x, -0.042, 0.09), (math.pi / 2, 0, 0), 12)
        roof(f'kairoY{x}', 'kawaraG', 0.20, 0.18, 0.05, 0.14, 0.7, x, 0.02)
    box('kidan', 'kidan', (0.62, 0.32, 0.05), (0, -0.02, 0.025))
    for x in (-0.27, -0.09, 0.09, 0.27):
        for y in (-0.14, 0.10):
            box(f'hashira{x}{y}', 'kijiD', (0.04, 0.04, 0.24), (x, y, 0.17))
    roof('yane1', 'kawaraG', 0.74, 0.44, 0.08, 0.29, 0.75, 0, -0.02, flat=True)
    box('en', 'kijiD', (0.58, 0.30, 0.02), (0, -0.02, 0.39))
    for i in range(8):
        box(f'koran{i}', 'kijiD', (0.01, 0.01, 0.05), (-0.27 + i * 0.077, -0.17, 0.42))
    box('koranT', 'kijiD', (0.56, 0.012, 0.012), (0, -0.17, 0.445))
    box('ue', 'kijiD', (0.48, 0.22, 0.14), (0, -0.01, 0.47))
    for i in range(7):
        box(f'koshi{i}', 'koshi2', (0.012, 0.01, 0.09), (-0.20 + i * 0.067, -0.123, 0.47))
    roof('yane2', 'kawaraG', 0.72, 0.42, 0.24, 0.54, 0.45, 0, -0.01)
    box('mune', 'munaG', (0.34, 0.03, 0.03), (0, -0.01, 0.79))
    return dict(target=(0, 0.02, 0.36), scale=1.12, el=22, size=96)


def okazaki_kakukyu():
    """カクキュー八丁味噌：うす暗い蔵の中の、赤茶の台にのった大きな木の仕込み桶。上に重しの川石を山のように積む"""
    ground('jari')
    box('kura', 'sumi', (0.96, 0.22, 0.42), (0, 0.26, 0.21))
    for i in range(9):
        box(f'ita{i}', 'koshi2', (0.006, 0.01, 0.40), (-0.44 + i * 0.11, 0.145, 0.21))
    gable('yane', 'kawaraG', 1.0, 0.30, 0.10, 0.42, 0, 0.26)
    box('dai', 'renga', (0.90, 0.30, 0.04), (0, -0.04, 0.02))
    for i, (x, y) in enumerate(((-0.28, -0.04), (0.04, -0.06), (0.32, -0.02))):
        barrel(i, x, y, 0.13, 0.26)
        for o in bpy.context.scene.objects:
            if o.name.startswith((f'ta{i}', f'tah{i}', f'ts{i}')):
                o.location.z += 0.04
    return dict(target=(0, 0.04, 0.24), scale=1.12, el=26, size=96)


def okazaki_maruya():
    """まるや八丁味噌：白い漆喰の大きな蔵（切妻の妻に黒い丸の紋）、下は黒い焼き板と格子戸、石の土台。右に続く低い蔵"""
    ground('jari')
    box('dodai', 'ishi', (0.40, 0.46, 0.04), (-0.12, 0.06, 0.02))
    box('kura', 'shikkui', (0.36, 0.42, 0.40), (-0.12, 0.06, 0.22))
    box('koshi', 'yakiita', (0.364, 0.424, 0.14), (-0.12, 0.06, 0.11))
    gable_y('yane', 'kawaraG', 0.44, 0.48, 0.16, 0.42, -0.12, 0.06)
    cyl('maru', 'sumi', 0.05, 0.01, (-0.12, -0.152, 0.34), (math.pi / 2, 0, 0), 20)
    cyl('maruW', 'shikkui', 0.032, 0.012, (-0.12, -0.153, 0.34), (math.pi / 2, 0, 0), 20)
    for i in range(5):
        box(f'koshido{i}', 'kijiD', (0.008, 0.01, 0.12), (-0.16 + i * 0.02, -0.153, 0.10))
    box('hikui', 'shikkui', (0.36, 0.30, 0.22), (0.26, 0.12, 0.11))
    box('hikuiK', 'yakiita', (0.364, 0.304, 0.08), (0.26, 0.12, 0.04))
    gable('hikuiY', 'kawaraG', 0.40, 0.36, 0.09, 0.22, 0.26, 0.12)
    return dict(target=(0, 0, 0.22), scale=1.08, el=26, size=96)


def okazaki_iga_hachimangu():
    """伊賀八幡宮の随身門：檜皮ぶきの大きな屋根、朱ぬりの柱と梁、白い壁、軒下の色あざやかな組物。前に石の反り橋と玉垣、蓮の池"""
    ground('shibaG')
    water('ike', 0.92, 0.30, 0, -0.22)
    for i, (x, y) in enumerate(((-0.34, -0.26), (-0.22, -0.14), (-0.36, -0.12), (0.24, -0.28), (0.36, -0.15), (0.20, -0.12))):
        cyl(f'hasu{i}', 'hasuHa', 0.04, 0.008, (x, y, 0.02), verts=12)
    for i, (y, z, a) in enumerate(((-0.36, 0.03, 0.5), (-0.27, 0.07, 0.25), (-0.18, 0.08, 0.0), (-0.09, 0.07, -0.25), (0.0, 0.03, -0.5))):
        box(f'hashi{i}', 'ishi', (0.14, 0.10, 0.025), (0, y, z), (a, 0, 0))   # 石の反り橋
    for k in (-1, 1):
        box(f'rankan{k}', 'ishi', (0.012, 0.40, 0.012), (k * 0.07, -0.18, 0.11))
    for i in range(10):   # 玉垣
        if abs(-0.45 + i * 0.1) > 0.1:
            box(f'tamagaki{i}', 'ishi', (0.02, 0.02, 0.06), (-0.45 + i * 0.1, -0.06, 0.03))
    box('mon', 'shu', (0.52, 0.20, 0.24), (0, 0.20, 0.14))
    for x in (-0.17, 0.17):
        box(f'kabe{x}', 'shikkui', (0.12, 0.01, 0.15), (x, 0.098, 0.13))
    box('kuchi', 'sumi', (0.14, 0.01, 0.18), (0, 0.098, 0.11))
    for i, m in enumerate(('doban', 'kin', 'blue', 'kin', 'doban')):   # 色あざやかな組物
        box(f'kumi{i}', m, (0.10, 0.012, 0.03), (-0.20 + i * 0.10, 0.096, 0.25))
    irimoya('yane', 'hiwada', 0.68, 0.34, 0.22, 0.26, 0, 0.20)
    return dict(target=(0, 0, 0.20), scale=1.08, el=28, size=96)


def okazaki_takisanji():
    """瀧山寺の本堂（滝山寺）：檜皮ぶきの大きな寄棟屋根、軒下に五色の幕、風化した木の堂と縁、前に木の桶"""
    ground('jari')
    box('kd', 'kidan', (0.64, 0.44, 0.05), (0, 0.08, 0.025))
    box('en', 'kijiD', (0.62, 0.42, 0.02), (0, 0.08, 0.08))
    box('do', 'kiji', (0.54, 0.34, 0.20), (0, 0.08, 0.18))
    for i in range(7):
        box(f'koshi{i}', 'koshi2', (0.008, 0.008, 0.12), (-0.21 + i * 0.07, -0.094, 0.16))
    roof('yane', 'hiwada', 0.74, 0.54, 0.30, 0.28, 0.3, 0, 0.08)
    for i, m in enumerate(('navy', 'yellow', 'red', 'white', 'green')):
        box(f'maku{i}', m, (0.108, 0.008, 0.035), (-0.216 + i * 0.108, -0.096, 0.255))
    box('oke', 'taru', (0.06, 0.06, 0.05), (0.22, -0.22, 0.025))
    return dict(target=(0, 0.02, 0.26), scale=1.08, el=24, size=96)


def okazaki_iwazu_tenmangu():
    """岩津天満宮の拝殿：金の飾りの唐破風を正面に、朱ぬりの柱と梁、白い幕に黒い梅鉢の紋、朱の手すり。前に石の撫で牛と梅の木"""
    ground('jari')
    box('kd', 'ishi', (0.58, 0.40, 0.05), (0.06, 0.14, 0.025))
    box('do', 'shu', (0.50, 0.32, 0.18), (0.06, 0.14, 0.14))
    box('maku', 'shikkui', (0.40, 0.01, 0.06), (0.06, -0.022, 0.18))
    for x in (-0.06, 0.06, 0.18):
        cyl(f'mon{x}', 'sumi', 0.014, 0.012, (x, -0.028, 0.18), (math.pi / 2, 0, 0), 5)
    box('teshiri', 'shu', (0.54, 0.01, 0.02), (0.06, -0.05, 0.08))
    irimoya('yane', 'yaneB', 0.66, 0.46, 0.24, 0.23, 0.06, 0.14)
    o = cyl('kara', 'yaneB', 0.10, 0.26, (0.06, -0.08, 0.26), (0, math.pi / 2, 0), 16)
    o.scale = (0.45, 1, 1)
    box('karaK', 'kin', (0.16, 0.01, 0.025), (0.06, -0.13, 0.25))
    box('ushiB', 'ishi', (0.20, 0.09, 0.07), (-0.28, -0.22, 0.06), bevel=0.03)   # 寝そべる撫で牛
    sphere('ushiH', 'ishi', 0.045, (-0.38, -0.24, 0.10), (1.2, 1, 1))
    box('ushiD', 'kidan', (0.26, 0.14, 0.03), (-0.28, -0.22, 0.015))
    tree('ume1', 0.40, -0.26, 0.8, 'pink')
    tree('ume2', -0.42, 0.22, 0.8, 'pink')
    return dict(target=(0, 0, 0.22), scale=1.08, el=26, size=96)


def okazaki_rokusho_jinja():
    """六所神社：檜皮ぶきの大屋根に金の飾りの唐破風、朱ぬりの柱と黒い組物、しめ縄、両わきに石灯籠"""
    ground('jari')
    box('kidan', 'ishi', (0.66, 0.44, 0.06), (0, 0.08, 0.03))
    box('do', 'shikkui', (0.54, 0.32, 0.20), (0, 0.08, 0.16))
    for x in (-0.26, -0.13, 0.0, 0.13, 0.26):
        box(f'h{x}', 'shu', (0.035, 0.035, 0.20), (x, -0.085, 0.16))
    box('nageshi', 'shu', (0.56, 0.01, 0.025), (0, -0.085, 0.10))
    box('kumi', 'sumi', (0.58, 0.36, 0.04), (0, 0.08, 0.28))
    box('kumiK', 'kin', (0.58, 0.01, 0.015), (0, -0.101, 0.28))
    irimoya('yane', 'hiwada', 0.74, 0.52, 0.26, 0.30, 0, 0.08)
    o = cyl('kara', 'hiwada', 0.12, 0.30, (0, -0.16, 0.33), (0, math.pi / 2, 0), 16)   # 唐破風（丸い屋根）
    o.scale = (0.45, 1, 1)
    box('karaK', 'kin', (0.18, 0.01, 0.03), (0, -0.22, 0.31))
    box('shime', 'kayabuki', (0.30, 0.012, 0.016), (0, -0.104, 0.24))
    toro('a', -0.38, -0.26)
    toro('b', 0.38, -0.26)
    return dict(target=(0, 0, 0.24), scale=1.08, el=24, size=96)


def okazaki_okudono_jinya():
    """奥殿陣屋の入口：こげ茶の太い木の門柱と横木（右の柱に茶色い看板）、緑のトンネルの下の石の小道。奥に書院の瓦屋根"""
    ground('shibaG')
    box('shoin', 'shikkui', (0.50, 0.20, 0.14), (0.04, 0.30, 0.07))
    irimoya('shoinY', 'kawaraG', 0.60, 0.30, 0.14, 0.14, 0.04, 0.30)
    for x in (-0.12, 0.12):
        box(f'mh{x}', 'kijiD', (0.045, 0.045, 0.26), (x, 0.0, 0.13))
    box('kabuki', 'kijiD', (0.36, 0.05, 0.04), (0, 0.0, 0.24))
    box('kanban', 'kiji', (0.035, 0.012, 0.12), (0.12, -0.03, 0.14))
    for i in range(5):
        box(f'ishi{i}', 'ishi', (0.12, 0.06, 0.012), (0, -0.34 + i * 0.07, 0.012))
    for i, y in enumerate((-0.30, -0.14, 0.12)):   # 緑のトンネル
        for k in (-1, 1):
            tree(f't{i}{k}', k * 0.26, y, 1.0)
    return dict(target=(0, 0.02, 0.16), scale=1.08, el=28, size=96)


def okazaki_higashi_park():
    """東公園：芦池にのびる長い木の桟橋と、先の六角のあずまや。むこう岸の木立"""
    ground('shibaG')
    o = cyl('ike', 'ike', 0.38, 0.01, (0, 0.02, 0.012), verts=28)
    o.scale = (1.25, 0.95, 1)
    box('sanbashi', 'kiji', (0.08, 0.50, 0.02), (-0.06, -0.12, 0.04))
    for i in range(6):
        cyl(f'kui{i}', 'kijiD', 0.008, 0.04, (-0.06 + (i % 2 - 0.5) * 0.08, -0.34 + (i // 2) * 0.16, 0.02), verts=6)
    cyl('azuyuka', 'kiji', 0.10, 0.02, (-0.06, 0.16, 0.04), verts=6)
    for i in range(6):
        a = i * math.pi / 3
        box(f'azh{i}', 'kijiD', (0.014, 0.014, 0.12), (-0.06 + math.cos(a) * 0.08, 0.16 + math.sin(a) * 0.08, 0.11))
    cyl('azY', 'yaneA', 0.14, 0.08, (-0.06, 0.16, 0.21), verts=6, r2=0.01)
    for i, (x, y) in enumerate(((-0.42, 0.30), (-0.22, 0.38), (0.10, 0.40), (0.34, 0.34), (0.44, 0.10), (0.40, -0.26))):
        tree(i, x, y, 0.9)
    return dict(target=(0, 0.02, 0.12), scale=1.08, el=30, size=96)


def okazaki_honda_tei():
    """旧本多忠次邸：クリーム色の壁にレンガ色の縁どり。左は半円窓の破風、まん中は3つのアーチの玄関廊、右は丸い塔。赤茶の瓦"""
    ground('shibaG')
    box('kan', 'cream', (0.60, 0.32, 0.30), (0, 0.08, 0.15))
    box('fuchi', 'renga', (0.604, 0.324, 0.02), (0, 0.08, 0.30))
    roof('yane', 'yaneR', 0.66, 0.38, 0.12, 0.30, 0.45, 0, 0.08)
    box('hafu', 'cream', (0.18, 0.10, 0.30), (-0.20, -0.12, 0.15))
    gable_y('hafuY', 'yaneR', 0.22, 0.14, 0.10, 0.30, -0.20, -0.12)
    cyl('hanen', 'mado', 0.04, 0.01, (-0.20, -0.172, 0.24), (math.pi / 2, 0, 0), 14)
    windows('wl', 'mado', [-0.20], -0.173, 0.10, 0.06, 0.08)
    for i in range(3):   # アーチの玄関廊
        x = -0.06 + i * 0.07
        box(f'ro{i}', 'renga', (0.012, 0.08, 0.14), (x - 0.035, -0.10, 0.07))
        cyl(f'ar{i}', 'mado', 0.03, 0.01, (x, -0.141, 0.11), (math.pi / 2, 0, 0), 12)
    box('roY', 'cream', (0.24, 0.10, 0.02), (0.01, -0.10, 0.15))
    cyl('tou', 'cream', 0.07, 0.36, (0.24, -0.06, 0.18), verts=16)
    cyl('touY', 'yaneR', 0.09, 0.12, (0.24, -0.06, 0.42), verts=16, r2=0.005)
    windows('wr', 'mado', [0.24], -0.131, 0.22, 0.04, 0.07)
    return dict(target=(0, 0, 0.22), scale=1.08, el=26, size=96)


def okazaki_minami_park():
    """南公園の交通広場：線路の上の蒸気機関車 D51 688号（黒い車体・赤い車輪）と、ゴーカートのコース"""
    ground('shibaG')
    box('senro', 'senro', (0.96, 0.22, 0.015), (0, 0.10, 0.01))
    for y in (0.05, 0.15):
        box(f'rail{y}', 'rail', (0.96, 0.012, 0.012), (0, y, 0.02))
    cyl('boilerC', 'sl', 0.08, 0.44, (-0.14, 0.10, 0.17), (0, math.pi / 2, 0), 16)
    box('cab', 'sl', (0.15, 0.19, 0.21), (0.16, 0.10, 0.17))
    box('cabW', 'mado', (0.07, 0.01, 0.05), (0.16, 0.003, 0.23))
    box('cabY', 'sl', (0.18, 0.22, 0.02), (0.16, 0.10, 0.285))
    cyl('entotsu', 'sl', 0.026, 0.08, (-0.30, 0.10, 0.28), verts=10)
    cyl('dome', 'sl', 0.035, 0.05, (-0.12, 0.10, 0.27), verts=12)
    box('front', 'slR', (0.02, 0.12, 0.03), (-0.37, 0.10, 0.06))
    for x in (-0.24, -0.12, 0.0):
        cyl(f'wheel{x}', 'slR', 0.055, 0.02, (x, 0.012, 0.07), (math.pi / 2, 0, 0), 16)
    box('rod', 'hashira', (0.26, 0.008, 0.01), (-0.12, 0.0, 0.07))
    box('tender', 'sl', (0.20, 0.17, 0.15), (0.36, 0.10, 0.10))
    o = cyl('course', 'asphalt', 0.30, 0.01, (0, -0.24, 0.012), verts=24)   # ゴーカートのコース（楕円）
    o.scale = (1.4, 0.45, 1)
    o = cyl('courseI', 'shibaG', 0.22, 0.012, (0, -0.24, 0.013), verts=24)
    o.scale = (1.4, 0.35, 1)
    for i, (x, y, m) in enumerate(((-0.30, -0.30, 'red'), (0.20, -0.33, 'yellow'), (0.36, -0.20, 'blue'))):
        box(f'kart{i}', m, (0.06, 0.035, 0.025), (x, y, 0.03), bevel=0.008)
    return dict(target=(0, 0, 0.12), scale=1.08, el=30, size=96)


def okazaki_museum():
    """岡崎市美術博物館：段々に重なるコンクリートの壁と大きな階段、右に高いガラスの塔、左に細い柱の薄い屋根"""
    ground('shibaG')
    for i, (w, d, z) in enumerate(((0.80, 0.44, 0.0), (0.66, 0.32, 0.08), (0.50, 0.22, 0.16))):
        box(f'dan{i}', 'concrete', (w, d, 0.08), (-0.02, 0.16 + i * 0.03, z + 0.04))
    for i in range(6):
        box(f'kai{i}', 'concrete', (0.26, 0.04, 0.02 * (i + 1)), (-0.04, -0.28 + i * 0.04, 0.01 * (i + 1)))
    box('tou', 'glassB', (0.10, 0.10, 0.48), (0.30, 0.20, 0.24))
    for z in (0.12, 0.24, 0.36):
        box(f'touF{z}', 'concrete', (0.104, 0.104, 0.012), (0.30, 0.20, z))
    for x in (-0.40, -0.26):
        cyl(f'hashira{x}', 'hashira', 0.008, 0.16, (x, -0.04, 0.08), verts=6)
    box('usuyane', 'concrete', (0.24, 0.16, 0.012), (-0.33, 0.0, 0.16))
    return dict(target=(0, 0.04, 0.18), scale=1.08, el=28, size=96)


def okazaki_higashi_okazaki_sta():
    """名鉄 東岡崎駅：灰色の駅ビル（窓の列）と色とりどりの看板の帯、1階の店の入口と街路樹。うしろのホームに赤い電車"""
    ground('asphalt')
    box('bldg', 'concrete', (0.66, 0.24, 0.30), (-0.06, -0.14, 0.15))
    windows('w', 'mado', [-0.34 + i * 0.08 for i in range(8)], -0.262, 0.24, 0.05, 0.04)
    for i, m in enumerate(('red', 'blue', 'yellow', 'green', 'red', 'blue', 'jrOrange')):
        box(f'kanban{i}', m, (0.09, 0.01, 0.035), (-0.33 + i * 0.09, -0.262, 0.15))
    windows('mise', 'glassB', [-0.28, -0.12, 0.04, 0.18], -0.262, 0.05, 0.10, 0.08)
    box('meitetsu', 'meitetsu', (0.20, 0.01, 0.04), (-0.06, -0.262, 0.32))
    tree('g', 0.36, -0.32, 0.6)
    platform('p', 0.04, 0.16, 0.90)
    train('t', 'meitetsu', 'obi', 0.04, 0.32, 0.86)
    return dict(target=(0, 0.04, 0.18), scale=1.08, el=28, size=96)


def okazaki_okazaki_sta():
    """JR 岡崎駅：銀色のパネルの駅舎と、ガラスの階段室、白い駅名の看板にオレンジの JR マーク。うしろのホームに電車"""
    ground('asphalt')
    box('bldg', 'jrSilver', (0.44, 0.24, 0.28), (-0.16, -0.14, 0.14))
    for i in range(5):
        box(f'panel{i}', 'concrete', (0.006, 0.01, 0.26), (-0.34 + i * 0.09, -0.262, 0.14))
    box('kaidan', 'glassB', (0.16, 0.16, 0.34), (0.16, -0.16, 0.17))
    box('kanban', 'shikkui', (0.24, 0.012, 0.05), (-0.16, -0.264, 0.24))
    box('jr', 'jrOrange', (0.05, 0.014, 0.035), (-0.24, -0.266, 0.24))
    platform('p', 0.04, 0.16, 0.90)
    train('t', 'jrSilver', 'jrOrange', 0.04, 0.32, 0.86)
    return dict(target=(0, 0.04, 0.18), scale=1.08, el=28, size=96)


def okazaki_shooji():
    """松應寺：瓦の大屋根の本堂（正面に白い破風）、木の柱の正面、左に松"""
    ground('jari')
    hall('h', 0.04, 0.12, 0.46, 0.30, 0.18, 'kiji', 'kawaraG', 0.26)
    gable_y('hafu', 'shikkui', 0.16, 0.02, 0.07, 0.31, 0.04, -0.07)
    pine('p', -0.38, -0.04, 1.2)
    return dict(target=(0, 0.02, 0.22), scale=1.08, el=26, size=96)


def okazaki_hozoji():
    """法蔵寺：灰色の瓦の宝形屋根に金の宝珠、こげ茶の板壁と格子戸、まわりの縁と手すり"""
    ground('jari')
    box('kd', 'kidan', (0.56, 0.50, 0.06), (0, 0.06, 0.03))
    box('en', 'kijiD', (0.52, 0.46, 0.02), (0, 0.06, 0.10))
    for i in range(9):
        box(f'tesuri{i}', 'kijiD', (0.01, 0.01, 0.05), (-0.24 + i * 0.06, -0.17, 0.13))
    box('tesuriT', 'kijiD', (0.50, 0.012, 0.012), (0, -0.17, 0.155))
    box('do', 'kijiD', (0.40, 0.34, 0.20), (0, 0.06, 0.20))
    for i in range(6):
        box(f'koshi{i}', 'koshi2', (0.01, 0.01, 0.14), (-0.10 + i * 0.04, -0.112, 0.19))
    roof('yane', 'kawaraG', 0.62, 0.56, 0.24, 0.30, 0.03, 0, 0.06)
    sphere('hoju', 'kin', 0.03, (0, 0.06, 0.57))
    return dict(target=(0, 0.02, 0.24), scale=1.08, el=26, size=96)


def okazaki_fujikawa_shuku():
    """道の駅 藤川宿：黒い瓦の長い屋根に破風が2つ、白い壁と木の柱の軒下、手前の駐車場"""
    ground('jari')
    box('kan', 'shikkui', (0.72, 0.26, 0.20), (0, 0.18, 0.10))
    for i in range(7):
        box(f'h{i}', 'kijiD', (0.02, 0.02, 0.18), (-0.33 + i * 0.11, 0.035, 0.09))
    windows('w', 'glassB', [-0.22, -0.11, 0.0, 0.11, 0.22], 0.047, 0.08, 0.08, 0.08)
    roof('yane', 'sumi', 0.80, 0.36, 0.12, 0.20, 0.55, 0, 0.16)
    for x in (-0.20, 0.20):
        gable_y(f'hafu{x}', 'sumi', 0.18, 0.14, 0.10, 0.22, x, 0.04)
        box(f'hafuW{x}', 'shikkui', (0.10, 0.01, 0.03), (x, -0.032, 0.25))
    box('chusha', 'asphalt', (0.96, 0.36, 0.012), (0, -0.20, 0.012))   # 手前の駐車場
    for i in range(7):
        box(f'waku{i}', 'shikkui', (0.008, 0.14, 0.004), (-0.36 + i * 0.12, -0.24, 0.019))
    for i, (x, m) in enumerate(((-0.30, 'white'), (-0.06, 'red'), (0.18, 'jrSilver'))):
        box(f'kuruma{i}', m, (0.08, 0.12, 0.05), (x, -0.24, 0.045), bevel=0.015)
        box(f'kurumaW{i}', 'mado', (0.07, 0.05, 0.025), (x, -0.25, 0.075))
    return dict(target=(0, 0, 0.16), scale=1.08, el=30, size=96)


def okazaki_kuragari():
    """くらがり渓谷：深い森の中の赤茶の屋根の山小屋と、白い石の河原と流れ、紅葉"""
    ground('kusa')
    box('kawara', 'kidan', (0.40, 1.0, 0.01), (0.02, 0, 0.011), (0, 0, math.radians(20)))
    box('kawa', 'ike', (0.20, 1.0, 0.01), (0.02, 0, 0.016), (0, 0, math.radians(20)))
    for i, (x, y, r) in enumerate(((-0.10, -0.30, 0.04), (0.14, -0.10, 0.05), (-0.04, 0.18, 0.04), (0.16, 0.32, 0.035))):
        sphere(f'iwa{i}', 'shikkui', r, (x, y, 0.02), (1.3, 1, 0.7))
    box('koya', 'kiji', (0.20, 0.16, 0.12), (-0.28, -0.04, 0.06))
    gable('koyaY', 'yaneR', 0.24, 0.20, 0.08, 0.12, -0.28, -0.04)
    box('koyaT', 'kijiD', (0.05, 0.01, 0.08), (-0.28, -0.122, 0.04))
    for i, (x, y) in enumerate(((-0.42, -0.30), (-0.40, 0.24), (-0.20, 0.36), (0.40, 0.08), (0.38, -0.32), (0.42, 0.34))):
        cyl(f'sugi{i}', 'sugi', 0.08, 0.36, (x, y, 0.20), verts=10, r2=0.0)
    tree('m1', 0.30, 0.24, 0.8, 'momiji')
    tree('m2', -0.16, -0.34, 0.7, 'momiji')
    return dict(target=(0, 0, 0.14), scale=1.08, el=32, size=96)


def okazaki_hongusan():
    """本宮山（789m）：「三河富士」とも呼ばれる、すそ野の広い山。森の濃い緑と、山頂のアンテナ"""
    ground('kusa')
    o = cyl('yama', 'matsu', 0.52, 0.46, (0, 0.04, 0.23), verts=28, r2=0.04)
    o.scale = (1, 0.8, 1)
    o = cyl('suso', 'gTree', 0.52, 0.10, (0, 0.04, 0.05), verts=28, r2=0.42)
    o.scale = (1, 0.8, 1)
    box('tou', 'hashira', (0.03, 0.03, 0.22), (0.02, 0.04, 0.56))
    for z in (0.52, 0.62):
        box(f'touB{z}', 'red', (0.06, 0.04, 0.02), (0.02, 0.04, z))
    return dict(target=(0, 0, 0.28), scale=1.08, el=22, size=96)


# ---------- 安城市 ----------
def anjo_denpark():
    """デンパーク：高さ19mの風車（茶色の塔に白い羽根4枚）と花畑、こい緑の屋根に白い三角の飾り窓・黄色いひさしの建物"""
    ground('shibaG')
    for i, m in enumerate(('tulipR', 'tulipY', 'pink', 'tulipR', 'white')):
        box(f'hana{i}', m, (0.40, 0.05, 0.03), (-0.20, -0.32 + i * 0.075, 0.025))
    cyl('tou', 'fusha', 0.13, 0.44, (0.22, 0.12, 0.22), verts=8, r2=0.09)
    box('tobira', 'kijiD', (0.06, 0.01, 0.10), (0.22, -0.005, 0.05))
    cyl('kasa', 'yaneB', 0.11, 0.12, (0.22, 0.12, 0.50), verts=8, r2=0.02)
    for i in range(4):   # 羽根（正面から少し斜め）
        a = math.radians(20 + i * 90)
        box(f'hane{i}', 'hane', (0.03, 0.01, 0.30), (0.22 + math.sin(a) * 0.16, 0.0, 0.46 + math.cos(a) * 0.16), (0, a, 0))
        box(f'haneW{i}', 'fusha', (0.008, 0.012, 0.30), (0.22 + math.sin(a) * 0.16, -0.002, 0.46 + math.cos(a) * 0.16), (0, a, 0))
    box('kan', 'shikkui', (0.36, 0.18, 0.12), (-0.24, 0.24, 0.06))
    box('hisashi', 'tulipY', (0.38, 0.06, 0.01), (-0.24, 0.13, 0.10), (math.radians(-15), 0, 0))
    gable('kanY', 'midoriY', 0.40, 0.22, 0.10, 0.12, -0.24, 0.24)
    for x in (-0.34, -0.24, -0.14):
        gable_y(f'mado{x}', 'shikkui', 0.05, 0.02, 0.05, 0.15, x, 0.17)
    for x in (-0.44, -0.06):
        cyl(f'shin{x}', 'matsu', 0.05, 0.26, (x, 0.36, 0.13), verts=8, r2=0.0)
    return dict(target=(0, 0.02, 0.28), scale=1.12, el=22, size=96)


def anjo_jozanen():
    """丈山苑：京都の詩仙堂をまねた庭。竹林を背にした茅葺きのあずまやと、池と庭の植えこみ"""
    ground('shibaG')
    for i in range(9):
        cyl(f'take{i}', 'take', 0.012, 0.44, (-0.36 + i * 0.09, 0.32 + (i % 2) * 0.04, 0.22), verts=6)
        sphere(f'takeH{i}', 'take', 0.06, (-0.36 + i * 0.09, 0.32 + (i % 2) * 0.04, 0.42), (1, 1, 1.4))
    for x in (-0.12, 0.12):
        for y in (0.0, 0.18):
            box(f'az{x}{y}', 'kijiD', (0.018, 0.018, 0.16), (x, y, 0.08))
    roof('azY', 'kayabuki', 0.36, 0.30, 0.14, 0.16, 0.3, 0, 0.09)
    o = cyl('ike', 'ike', 0.18, 0.01, (-0.10, -0.24, 0.012), verts=20)
    o.scale = (1.5, 0.6, 1)
    for i, (x, y) in enumerate(((0.30, -0.22), (0.38, -0.06), (-0.40, -0.10))):
        sphere(f'karikomi{i}', 'gTree', 0.06, (x, y, 0.04), (1.3, 1, 0.7))
    sphere('niwaishi', 'ishi', 0.04, (0.14, -0.20, 0.02), (1.3, 1, 0.7))
    return dict(target=(0, 0.02, 0.16), scale=1.08, el=30, size=96)


def anjo_honshoji():
    """本證寺：二重の堀と土塁にかこまれた「城郭寺院」。石垣の上の鼓楼（下の重は黒い板壁、上の重は白い漆喰、千鳥破風）と、手前と奥の堀・土塁"""
    ground('kusa')
    water('ike', 0.96, 0.16, 0, -0.30)
    box('ishigaki', 'ishigaki', (0.96, 0.06, 0.06), (0, -0.20, 0.03))
    o = cyl('dorui', 'gTree', 0.10, 0.92, (0, 0.30, 0.05), (0, math.pi / 2, 0), 3)   # 堀の内がわの土塁（かまぼこ形の土手）
    o.scale = (0.7, 1.4, 1)
    water('ike', 0.96, 0.08, 0, 0.42)   # もう1重の堀
    box('koD', 'ishigaki', (0.30, 0.28, 0.10), (-0.20, -0.02, 0.05))
    box('ko1', 'yakiita', (0.22, 0.20, 0.13), (-0.20, -0.02, 0.165))
    roof('koY1', 'kawaraG', 0.32, 0.30, 0.05, 0.23, 0.6, -0.20, -0.02, flat=True)
    box('ko2', 'shikkui', (0.16, 0.14, 0.10), (-0.20, -0.02, 0.33))
    windows('kow', 'yakiita', [-0.24, -0.16], -0.092, 0.33, 0.03, 0.04)
    roof('koY2', 'kawaraG', 0.26, 0.24, 0.10, 0.38, 0.2, -0.20, -0.02)
    gable_y('chidori', 'kawaraG', 0.12, 0.06, 0.05, 0.26, -0.20, -0.14)
    return dict(target=(0, 0.02, 0.22), scale=1.08, el=26, size=96)


def anjo_castle():
    """安祥城址：城あとの公園。お寺の屋根、大きな松、「安祥城址」の石碑と石灯籠、庭石と植えこみ"""
    ground('shibaG')
    box('tera', 'kiji', (0.40, 0.24, 0.12), (0.10, 0.26, 0.06))
    irimoya('teraY', 'kawaraG', 0.52, 0.36, 0.20, 0.12, 0.10, 0.26)
    box('hiD', 'ishi', (0.14, 0.10, 0.04), (-0.10, -0.08, 0.02))
    box('hi', 'ishi', (0.07, 0.04, 0.26), (-0.10, -0.08, 0.17))
    toro('a', 0.16, -0.14, 1.2)
    for i, (x, y) in enumerate(((0.32, -0.22), (-0.30, -0.26), (0.02, -0.28))):
        sphere(f'niwa{i}', 'gTree' if i else 'ishi', 0.05, (x, y, 0.03), (1.3, 1, 0.7))
    pine('p', -0.32, 0.14, 1.4)
    return dict(target=(0, 0.02, 0.18), scale=1.08, el=26, size=96)


def anjo_museum():
    """安城市歴史博物館：茶色の瓦の大きな切妻と、妻いっぱいの三角のガラス窓、ベージュのタイルの壁、左に白い棟"""
    ground('jari')
    box('shiro', 'shikkui', (0.30, 0.28, 0.18), (-0.30, 0.10, 0.09))
    box('shiroY', 'concrete', (0.32, 0.30, 0.02), (-0.30, 0.10, 0.19))
    box('naka', 'cream', (0.44, 0.36, 0.26), (0.10, 0.08, 0.13))
    gable_y('nakaY', 'kijiD', 0.52, 0.42, 0.22, 0.26, 0.10, 0.08)
    gable_y('glass', 'glassB', 0.40, 0.01, 0.18, 0.12, 0.10, -0.102)
    box('glassL', 'glassB', (0.36, 0.01, 0.12), (0.10, -0.102, 0.06))
    for i in range(5):
        box(f'tate{i}', 'cream', (0.01, 0.012, 0.28), (-0.06 + i * 0.08, -0.106, 0.14))
    return dict(target=(0, 0.02, 0.18), scale=1.08, el=26, size=96)

def anjo_horiuchi_park():
    """堀内公園：高さ35mの大観覧車（色とりどりのゴンドラ・白い支柱）と、ふもとの木立、電動汽車「メルヘン号」"""
    ground('shibaG')
    ferris('f', 0.08, 0.12, 0.30, 0.38, ['red', 'yellow', 'blue', 'green', 'pink', 'jrOrange'])
    for i, m in enumerate(('red', 'yellow')):
        box(f'kisha{i}', m, (0.08, 0.05, 0.05), (-0.30 + i * 0.10, -0.24, 0.035), bevel=0.01)
    for i, (x, y) in enumerate(((-0.40, 0.20), (-0.30, 0.32), (0.42, 0.26), (0.40, -0.24), (-0.42, -0.06))):
        tree(i, x, y, 0.9)
    return dict(target=(0.02, 0.02, 0.34), scale=1.12, el=18, size=96)

def anjo_park():
    """安城公園：池にかかる朱色の太鼓橋と、まわりのソメイヨシノ（約170本の桜の名所）"""
    ground('shibaG')
    o = cyl('ike', 'ike', 0.36, 0.01, (0, -0.04, 0.012), verts=24)
    o.scale = (1.25, 0.7, 1)
    for i in range(7):
        a = (i - 3) / 3 * 1.1
        box(f'hashi{i}', 'shu', (0.06, 0.12, 0.02), (-0.18 + i * 0.06, -0.04, 0.02 + 0.08 * math.cos(a * 1.3)), (0, -a * 0.5, 0))
    for k in (-1, 1):
        box(f'rankan{k}', 'shu', (0.42, 0.01, 0.012), (0, -0.04 + k * 0.055, 0.12))
    for i, (x, y) in enumerate(((-0.40, 0.24), (-0.20, 0.32), (0.04, 0.34), (0.28, 0.30), (0.42, 0.10), (-0.42, -0.26), (0.38, -0.28))):
        tree(i, x, y, 0.9, 'sakura')
    return dict(target=(0, 0.02, 0.12), scale=1.08, el=30, size=96)


def anjo_futago_kofun():
    """二子古墳：この地方で最大級の前方後円墳。草におおわれた2つのふくらみと上に生える松、手前の青い田んぼ"""
    ground('shibaG')
    for i in range(3):
        box(f'ta{i}', 'nae', (0.30, 0.16, 0.015), (-0.32 + i * 0.32, -0.32, 0.012))
    sphere('enbu', 'gTree', 0.24, (0.16, 0.10, 0.0), (1, 1, 0.75))
    mesh('hobu', 'gTree', [(-0.42, -0.12, 0.0), (-0.42, 0.28, 0.0), (0.06, 0.22, 0.0), (0.06, -0.02, 0.0), (-0.36, -0.06, 0.12), (-0.36, 0.22, 0.12), (0.02, 0.16, 0.13), (0.02, 0.04, 0.13)],
         [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)])
    for i, (x, y, z) in enumerate(((0.16, 0.10, 0.12), (0.08, 0.18, 0.08), (-0.20, 0.10, 0.06))):
        pine(i, x, y, 0.7)
        for o in bpy.context.scene.objects:
            if o.name.startswith((f'miki{i}', f'matsu{i}')):
                o.location.z += z
    return dict(target=(0, 0.02, 0.12), scale=1.08, el=28, size=96)


def anjo_himeogawa_kofun():
    """姫小川古墳：全長65mの前方後円墳。後円部の上の小さな社へ、木立の中の石段（両わきに石灯籠）"""
    ground('kusa')
    sphere('enbu', 'matsu', 0.30, (0, 0.14, 0.0), (1.1, 1, 0.75))
    for i, (x, y) in enumerate(((-0.24, 0.20), (0.24, 0.22), (-0.10, 0.34), (0.16, 0.36))):
        sphere(f'mori{i}', 'gTree', 0.09, (x, y, 0.18), (1, 1, 0.9))
    for i in range(6):
        box(f'dan{i}', 'ishi', (0.10, 0.05, 0.035 * (i + 1)), (0, -0.14 + i * 0.045, 0.0175 * (i + 1)))
    box('sha', 'kiji', (0.12, 0.10, 0.08), (0, 0.14, 0.26))
    gable('shaY', 'kawaraG', 0.16, 0.14, 0.06, 0.30, 0, 0.14)
    toro('a', -0.12, -0.20, 0.9)
    toro('b', 0.12, -0.20, 0.9)
    return dict(target=(0, 0.04, 0.16), scale=1.08, el=26, size=96)


def anjo_station():
    """JR 安城駅：茶色とクリーム色の駅舎（大きなガラスの入り口）と、銀色にオレンジの帯の電車"""
    ground('asphalt')
    box('bldg', 'renga', (0.50, 0.22, 0.22), (-0.14, -0.16, 0.11))
    box('bldgW', 'cream', (0.20, 0.224, 0.22), (0.06, -0.16, 0.11))
    box('glass', 'glassB', (0.14, 0.01, 0.12), (-0.24, -0.272, 0.07))
    box('kanban', 'jrOrange', (0.14, 0.01, 0.035), (-0.06, -0.272, 0.18))
    cyl('tou', 'hashira', 0.01, 0.30, (0.30, -0.26, 0.15), verts=8)
    sphere('tou2', 'shikkui', 0.025, (0.30, -0.26, 0.31))
    platform('p', 0.04, 0.14, 0.90)
    train('t', 'jrSilver', 'jrOrange', 0.04, 0.30, 0.86)
    return dict(target=(0, 0.04, 0.16), scale=1.08, el=28, size=96)


def anjo_mikawa_anjo_station():
    """三河安城駅：東海道新幹線の高架ホーム（白い車体に青い帯の新幹線）。駅舎は茶色の長い屋根にアーチの入口、白い時計塔に赤い四角すいの屋根"""
    ground('asphalt')
    box('koka', 'concrete', (0.96, 0.24, 0.20), (0, 0.20, 0.10))
    for x in (-0.36, -0.12, 0.12, 0.36):
        box(f'kyaku{x}', 'concrete', (0.04, 0.24, 0.20), (x, 0.20, 0.10))
    box('shin', 'shinkansen', (0.90, 0.15, 0.13), (0, 0.20, 0.27), bevel=0.04)
    box('shinB', 'shinB', (0.904, 0.154, 0.018), (0, 0.20, 0.23))
    windows('sw', 'mado', [-0.36 + i * 0.09 for i in range(9)], 0.123, 0.29, 0.05, 0.03)
    box('yane', 'yane2', (0.96, 0.24, 0.02), (0, 0.20, 0.40))
    box('ekisha', 'cream', (0.56, 0.16, 0.14), (0.0, -0.16, 0.07))
    roof('ekishaY', 'kijiD', 0.60, 0.20, 0.06, 0.14, 0.6, 0.0, -0.16)
    for x in (-0.18, 0.18):
        gable_y(f'yanemado{x}', 'shikkui', 0.06, 0.04, 0.06, 0.18, x, -0.22)
    cyl('arch', 'mado', 0.04, 0.01, (0.0, -0.242, 0.07), (math.pi / 2, 0, 0), 12)
    box('tokei', 'shikkui', (0.07, 0.07, 0.30), (0.34, -0.20, 0.15))
    cyl('tokeiF', 'mado', 0.022, 0.01, (0.34, -0.237, 0.26), (math.pi / 2, 0, 0), 12)
    cyl('tokeiY', 'yaneR', 0.07, 0.08, (0.34, -0.20, 0.34), (0, 0, math.pi / 4), 4, r2=0.002)
    return dict(target=(0, 0.02, 0.20), scale=1.12, el=24, size=96)


def anjo_minami_anjo_station():
    """名鉄 南安城駅（西尾線）：高架の線路の下の駅。コンクリートの高架と架線柱、茶色の板張りの棟、赤いポスト。高架に赤い電車"""
    ground('asphalt')
    box('koka', 'concrete', (0.96, 0.22, 0.04), (0, 0.12, 0.24))
    for x in (-0.36, 0.0, 0.36):
        box(f'kyaku{x}', 'concrete', (0.06, 0.16, 0.22), (x, 0.12, 0.11))
    train('t', 'meitetsu', 'obi', 0.0, 0.12, 0.80, 0.24, 0.15, 0.16)
    for x in (-0.44, 0.44):
        box(f'kasen{x}', 'hashira', (0.015, 0.015, 0.28), (x, 0.22, 0.40))
    box('mune', 'kiji', (0.30, 0.14, 0.16), (-0.18, -0.16, 0.08))
    box('mune2', 'shikkui', (0.24, 0.14, 0.14), (0.20, -0.16, 0.07))
    for i in range(5):
        box(f'tate{i}', 'concrete', (0.006, 0.01, 0.12), (0.10 + i * 0.05, -0.232, 0.07))
    box('kanban', 'meitetsu', (0.14, 0.01, 0.03), (-0.18, -0.232, 0.13))
    box('post', 'red', (0.04, 0.04, 0.08), (0.0, -0.30, 0.04))
    return dict(target=(0, 0.02, 0.18), scale=1.08, el=26, size=96)


def anjo_cityhall():
    """安城市役所（西庁舎）：ベージュの庁舎に窓の帯とベランダ、うしろに給水塔、右に大きな木、前は池と木の柵"""
    ground('jari')
    office('h', -0.04, 0.14, 0.58, 0.26, 0.40, 5, 'cream')
    for f in range(4):
        box(f'veranda{f}', 'concrete', (0.58, 0.04, 0.01), (-0.04, -0.01, 0.08 * (f + 1)))
    cyl('kyusui', 'concrete', 0.06, 0.16, (0.10, 0.22, 0.50), verts=16)
    cyl('kyusuiT', 'concrete', 0.08, 0.05, (0.10, 0.22, 0.60), verts=16)
    tree('ki', 0.40, 0.0, 1.3)
    water('ike', 0.50, 0.12, -0.12, -0.28)
    for i in range(8):
        box(f'saku{i}', 'kiji', (0.012, 0.012, 0.05), (-0.42 + i * 0.07, -0.20, 0.025))
    return dict(target=(0, 0.04, 0.22), scale=1.08, el=26, size=96)


# ---------- 碧南市 ----------
def hekinan_aquarium():
    """碧南海浜水族館：白い建物に青い帯が2本、屋上の塔に青い魚のマーク、正面の黒いパーゴラと、れんがの広場"""
    ground('renga')
    box('kan', 'shikkui', (0.70, 0.32, 0.24), (0, 0.12, 0.12))
    for z in (0.08, 0.18):
        box(f'obi{z}', 'blue', (0.704, 0.324, 0.025), (0, 0.12, z))
    box('genkan', 'glassB', (0.18, 0.01, 0.10), (-0.12, -0.042, 0.05))
    box('tou', 'shikkui', (0.14, 0.12, 0.14), (0.20, 0.10, 0.31))
    sphere('sakana', 'blue', 0.035, (0.19, 0.038, 0.32), (1.6, 0.4, 1))
    cyl('ohire', 'blue', 0.03, 0.01, (0.25, 0.038, 0.32), (math.pi / 2, 0, 0), 3)
    for x in (-0.30, -0.18, -0.06, 0.06):
        box(f'pg{x}', 'sumi', (0.015, 0.015, 0.12), (x, -0.16, 0.06))
    for y in (-0.16, -0.08):
        box(f'pgY{y}', 'sumi', (0.40, 0.015, 0.015), (-0.12, y, 0.125))
    return dict(target=(0, 0.04, 0.16), scale=1.08, el=26, size=96)


def hekinan_rinkai_park():
    """碧南市臨海公園：芝生の上の浅い池に、口から水を吹く青いクジラのすべり台。うしろに遊具"""
    ground('shibaG')
    o = cyl('ike', 'ike', 0.36, 0.01, (0, -0.04, 0.012), verts=24)
    o.scale = (1.2, 0.7, 1)
    sphere('kujira', 'whale', 0.20, (-0.04, -0.02, 0.10), (1.5, 0.8, 0.7))
    sphere('kujiraH', 'shikkui', 0.16, (-0.04, -0.05, 0.06), (1.6, 0.75, 0.4))
    cyl('shippo', 'whale', 0.08, 0.02, (0.30, -0.02, 0.18), (math.pi / 2, 0, 0.6), 3)
    sphere('me', 'sumi', 0.015, (-0.28, -0.14, 0.13))
    for i in range(3):
        cyl(f'shio{i}', 'mizu', 0.008, 0.10, (-0.24 + (i - 1) * 0.02, -0.04, 0.26), (0, (i - 1) * 0.4, 0), 6)
    box('suberi', 'yellow', (0.06, 0.20, 0.01), (0.14, -0.22, 0.08), (math.radians(30), 0, 0))
    for x in (0.26, 0.40):
        box(f'yugu{x}', 'red', (0.02, 0.02, 0.22), (x, 0.30, 0.11))
    box('yuguT', 'red', (0.16, 0.02, 0.02), (0.33, 0.30, 0.22))
    return dict(target=(0, 0, 0.12), scale=1.08, el=28, size=96)


def hekinan_akashi_park():
    """碧南市明石公園：衣浦港を見わたす高さ30mの白い観覧車（赤・黄・青のゴンドラ）、メリーゴーランド、れんがの広場の青白しまのパラソル"""
    ground('shibaG')
    box('hiroba', 'renga', (0.50, 0.30, 0.012), (0.20, -0.22, 0.012))
    ferris('f', -0.12, 0.14, 0.28, 0.36, ['red', 'yellow', 'blue'], 'hane', 16)
    cyl('merry', 'pink', 0.10, 0.05, (0.30, 0.10, 0.03), verts=16)
    cyl('merryY', 'red', 0.12, 0.07, (0.30, 0.10, 0.15), verts=16, r2=0.01)
    cyl('merryP', 'kin', 0.01, 0.10, (0.30, 0.10, 0.09), verts=8)
    for i, x in enumerate((0.10, 0.28)):
        cyl(f'para{i}', 'blue' if i else 'shikkui', 0.07, 0.04, (x, -0.24, 0.14), verts=8, r2=0.005)
        cyl(f'paraP{i}', 'hashira', 0.006, 0.12, (x, -0.24, 0.06), verts=6)
    return dict(target=(0, 0.02, 0.30), scale=1.12, el=20, size=96)


def hekinan_shomyoji():
    """称名寺（大浜てらまち）：うすい緑青の銅ぶきの上屋根と、灰色の瓦のひさし屋根の本堂。白い壁と木の格子、正面の石段、白い砂利"""
    ground('jari')
    box('kd', 'kidan', (0.62, 0.42, 0.05), (0, 0.10, 0.025))
    box('do', 'shikkui', (0.52, 0.32, 0.20), (0, 0.10, 0.15))
    for i in range(7):
        box(f'koshi{i}', 'kijiD', (0.01, 0.01, 0.14), (-0.18 + i * 0.06, -0.062, 0.14))
    roof('hisashi', 'kawaraG', 0.66, 0.46, 0.06, 0.25, 0.75, 0, 0.10, flat=True)
    irimoya('ue', 'doban', 0.50, 0.32, 0.24, 0.31, 0, 0.10)
    steps('s', 'ishi', 0, -0.26, 0.16, 3)
    return dict(target=(0, 0.02, 0.24), scale=1.08, el=26, size=96)


def hekinan_kaitokuji():
    """海徳寺（大浜）：鬼瓦をのせた大きな三角の破風と、黒っぽい瓦の大屋根の本堂。こげ茶の木の正面、石段、右に松"""
    ground('jari')
    box('kd', 'kidan', (0.56, 0.44, 0.05), (-0.04, 0.10, 0.025))
    box('do', 'kijiD', (0.46, 0.34, 0.18), (-0.04, 0.10, 0.14))
    for i in range(7):
        box(f'koshi{i}', 'koshi2', (0.01, 0.01, 0.12), (-0.22 + i * 0.06, -0.072, 0.13))
    roof('yaneS', 'yaneB', 0.60, 0.48, 0.06, 0.23, 0.8, -0.04, 0.10, flat=True)
    gable_y('yane', 'yaneB', 0.56, 0.50, 0.28, 0.27, -0.04, 0.10)
    gable_y('hafu', 'kijiD', 0.30, 0.01, 0.14, 0.29, -0.04, -0.148)
    box('oni', 'onigawara', (0.06, 0.04, 0.06), (-0.04, -0.15, 0.56))
    steps('s', 'ishi', -0.04, -0.28, 0.16, 3)
    pine('p', 0.40, -0.14, 1.1)
    return dict(target=(0, 0.02, 0.26), scale=1.08, el=24, size=96)


def hekinan_kokonoe_mirin():
    """九重味淋（1772年創業）：紺色の板壁に白い小窓が散らばる大きな切妻の蔵（白い破風板・てっぺんに鬼瓦）、石積みの土台"""
    ground('jari')
    box('dodai', 'ishigaki', (0.56, 0.50, 0.06), (0, 0.06, 0.03))
    box('kura', 'navy', (0.50, 0.44, 0.34), (0, 0.06, 0.23))
    for i, (x, z) in enumerate(((-0.16, 0.14), (0.0, 0.20), (0.14, 0.12), (-0.08, 0.30), (0.10, 0.32), (-0.18, 0.36), (0.18, 0.24))):
        box(f'mado{i}', 'shikkui', (0.035, 0.01, 0.035), (x, -0.162, z))
    gable_y('yane', 'kawaraG', 0.58, 0.52, 0.22, 0.40, 0, 0.06)
    for k in (-1, 1):
        box(f'hafu{k}', 'shikkui', (0.33, 0.01, 0.025), (k * 0.14, -0.20, 0.51), (0, k * math.atan2(0.22, 0.29), 0))
    box('oni', 'onigawara', (0.06, 0.05, 0.05), (0, -0.20, 0.64))
    return dict(target=(0, 0.02, 0.26), scale=1.08, el=24, size=96)


def hekinan_fujii_museum():
    """碧南市藤井達吉現代美術館：黒っぽい縦板の切妻の建物に大きなガラスの箱、右に黒い板の壁、前の階段"""
    ground('jari')
    box('kan', 'yakiita', (0.40, 0.36, 0.26), (-0.10, 0.10, 0.13))
    for i in range(8):
        box(f'tate{i}', 'sumi', (0.008, 0.01, 0.24), (-0.28 + i * 0.05, -0.082, 0.13))
    gable_y('yane', 'sumi', 0.44, 0.40, 0.14, 0.26, -0.10, 0.10)
    box('glass', 'glassB', (0.24, 0.20, 0.22), (-0.10, -0.14, 0.13))
    box('glassF', 'concrete', (0.25, 0.21, 0.012), (-0.10, -0.14, 0.24))
    box('kabe', 'sumi', (0.24, 0.30, 0.20), (0.26, 0.10, 0.10))
    for i in range(3):
        box(f'kai{i}', 'concrete', (0.20, 0.04, 0.012 * (i + 1)), (-0.10, -0.30 + i * 0.04, 0.006 * (i + 1)))
    return dict(target=(0, 0.02, 0.18), scale=1.08, el=26, size=96)


def hekinan_kumano():
    """大浜熊野大神社：石の明神鳥居、左右に台座の上の狛犬、奥にしめ縄と白い幕の拝殿、白っぽい参道の砂利"""
    ground('jari')
    hall('h', 0, 0.20, 0.42, 0.24, 0.14, 'kiji', 'yaneB', 0.20, kidan=True, front='kijiD')
    box('maku', 'shikkui', (0.30, 0.01, 0.04), (0, 0.075, 0.16))
    box('shime', 'kayabuki', (0.32, 0.012, 0.014), (0, 0.072, 0.19))
    torii('t', 0, -0.18, 1.5, 'ishi')
    box('sando', 'shikkui', (0.14, 0.34, 0.01), (0, -0.06, 0.012))
    for x in (-0.24, 0.24):
        box(f'komaD{x}', 'ishi', (0.07, 0.07, 0.06), (x, -0.02, 0.03))
        sphere(f'koma{x}', 'ishi', 0.035, (x, -0.02, 0.09), (1, 1, 1.2))
    return dict(target=(0, 0, 0.20), scale=1.08, el=24, size=96)


def hekinan_mugaen():
    """哲学たいけん村 無我苑：銀ねずの瓦の寄棟屋根の平屋（黒っぽい木とガラス戸）、手前に芝生と庭石、両わきに木"""
    ground('shibaG')
    box('kan', 'koshi2', (0.60, 0.26, 0.13), (0, 0.16, 0.065))
    windows('w', 'glassB', [-0.21, -0.07, 0.07, 0.21], 0.028, 0.06, 0.10, 0.08)
    roof('yane', 'kawaraG', 0.70, 0.36, 0.13, 0.13, 0.55, 0, 0.16)
    for i, (x, y) in enumerate(((-0.16, -0.18), (0.06, -0.24), (0.20, -0.14))):
        sphere(f'niwaishi{i}', 'ishi', 0.04, (x, y, 0.02), (1.4, 1, 0.6))
    tree('a', -0.44, 0.10, 1.1)
    tree('b', 0.44, 0.06, 1.1)
    return dict(target=(0, 0.02, 0.12), scale=1.08, el=28, size=96)


def hekinan_oninji():
    """応仁寺：蓮如上人が教えを広める拠点にしたお寺。瓦屋根の本堂（正面に五色の幕）と石灯籠、近くの花しょうぶ"""
    ground('jari')
    hall('h', 0, 0.12, 0.48, 0.30, 0.18, 'kijiD', 'kawaraG', 0.30)
    for i, m in enumerate(('navy', 'yellow', 'red', 'white', 'green')):
        box(f'maku{i}', m, (0.08, 0.008, 0.035), (-0.16 + i * 0.08, -0.036, 0.20))
    toro('a', -0.30, -0.18)
    toro('b', 0.30, -0.18)
    for i in range(8):
        sphere(f'shobu{i}', 'ajisaiP' if i % 2 else 'hasuHa', 0.03, (-0.36 + i * 0.1, -0.32, 0.03), (1, 1, 1.4))
    return dict(target=(0, 0.02, 0.22), scale=1.08, el=26, size=96)

def hekinan_station():
    """名鉄 碧南駅（三河線）：灰色の高い箱に駅名の看板、手前に低くて長い黒っぽい屋根の駅舎、前の横断歩道。うしろに赤い電車"""
    ground('asphalt')
    box('takai', 'concrete', (0.20, 0.16, 0.36), (0.10, -0.06, 0.18))
    box('kanban', 'shikkui', (0.14, 0.01, 0.04), (0.10, -0.142, 0.30))
    box('bldg', 'shikkui', (0.56, 0.16, 0.12), (-0.12, -0.20, 0.06))
    box('bldgY', 'sumi', (0.60, 0.20, 0.03), (-0.12, -0.20, 0.135))
    windows('w', 'glassB', [-0.32, -0.20, -0.08, 0.04], -0.282, 0.06, 0.08, 0.07)
    for i in range(5):
        box(f'oudan{i}', 'shikkui', (0.04, 0.10, 0.004), (-0.30 + i * 0.08, -0.36, 0.012))
    platform('p', 0.04, 0.18, 0.90)
    train('t', 'meitetsu', 'obi', 0.04, 0.33, 0.80)
    return dict(target=(0, 0.02, 0.16), scale=1.08, el=28, size=96)


def hekinan_chuo_station():
    """名鉄 碧南中央駅：白い駅ビルに、サーモン色の丸いアーチの入口の屋根、2階の白いアーチ窓。前の歩道に黄色い点字ブロック"""
    ground('asphalt')
    box('bldg', 'shikkui', (0.56, 0.24, 0.28), (-0.06, -0.12, 0.14))
    o = cyl('arch', 'salmon', 0.10, 0.22, (-0.06, -0.26, 0.12), (0, math.pi / 2, 0), 16)
    o.scale = (0.6, 1, 1)
    box('iriguchi', 'glassB', (0.14, 0.01, 0.10), (-0.06, -0.242, 0.05))
    for x in (-0.26, -0.16, 0.04, 0.14):
        box(f'w{x}', 'mado', (0.05, 0.01, 0.06), (x, -0.242, 0.20))
        cyl(f'wa{x}', 'mado', 0.025, 0.01, (x, -0.242, 0.23), (math.pi / 2, 0, 0), 12)
    box('tenji', 'yellow', (0.60, 0.03, 0.004), (-0.06, -0.34, 0.012))
    platform('p', 0.04, 0.22, 0.90)
    train('t', 'meitetsu', 'obi', 0.04, 0.36, 0.80)
    return dict(target=(0, 0.02, 0.16), scale=1.08, el=28, size=96)


def hekinan_cityhall():
    """碧南市役所：銀ねずの大きな四角すいの屋根の棟と、右の高い庁舎（ガラスの階段塔）。ベージュの壁"""
    ground('jari')
    office('h', 0.20, 0.12, 0.30, 0.26, 0.54, 8, 'cream')
    box('kaidan', 'glassB', (0.08, 0.08, 0.58), (0.38, 0.0, 0.29))
    box('tei', 'cream', (0.36, 0.30, 0.14), (-0.20, 0.04, 0.07))
    roof('teiY', 'kawaraG', 0.42, 0.36, 0.20, 0.14, 0.02, -0.20, 0.04)
    box('genkan', 'glassB', (0.12, 0.01, 0.08), (-0.20, -0.112, 0.04))
    return dict(target=(0, 0.04, 0.24), scale=1.08, el=26, size=96)


# ---------- 高浜市 ----------
def takahama_kawara_museum():
    """高浜市やきものの里 かわら美術館：うすい茶色の段々の建物（赤茶の帯）と、のこぎり屋根のような三角の妻、手前の木と鬼瓦の像"""
    ground('jari')
    for i, (w, d, z) in enumerate(((0.70, 0.34, 0.0), (0.60, 0.26, 0.12))):
        box(f'kan{i}', 'kiji', (w, d, 0.12), (0, 0.12 + i * 0.03, z + 0.06))
        box(f'obi{i}', 'renga', (w + 0.004, d + 0.004, 0.02), (0, 0.12 + i * 0.03, z + 0.11))
    for i in range(3):
        gable(f'nokogiri{i}', 'kiji', 0.20, 0.26, 0.09, 0.24, -0.20 + i * 0.20, 0.15)
    box('daiza', 'ishi', (0.12, 0.08, 0.04), (0.30, -0.22, 0.02))
    cyl('oni', 'onigawara', 0.08, 0.04, (0.30, -0.22, 0.12), (math.pi / 2, 0, 0), 12)
    for x in (-0.03, 0.03):
        sphere(f'oniM{x}', 'kin', 0.012, (0.30 + x, -0.245, 0.13))
    for x in (-0.05, 0.05):
        cyl(f'tsuno{x}', 'onigawara', 0.014, 0.05, (0.30 + x, -0.22, 0.21), (0, -x * 6, 0), 6, r2=0.002)
    tree('a', -0.40, -0.22, 0.9)
    return dict(target=(0, 0.02, 0.16), scale=1.08, el=26, size=96)


def takahama_minato_station():
    """名鉄 高浜港駅：「鬼みち」の出発点。白い漆喰に黒い瓦屋根の蔵づくりの駅舎（腰はなまこ壁）と、駅前の日本一大きいとされる古代鬼面の鬼瓦"""
    ground('asphalt')
    platform('p', 0.04, 0.18, 0.90)
    train('t', 'meitetsu', 'obi', 0.04, 0.33, 0.80)
    box('bldg', 'shikkui', (0.30, 0.16, 0.16), (0.24, -0.10, 0.08))
    box('namako', 'sumi', (0.304, 0.164, 0.06), (0.24, -0.10, 0.03))
    for i in range(6):
        box(f'nmA{i}', 'shikkui', (0.006, 0.004, 0.07), (0.12 + i * 0.045, -0.183, 0.03), (0, math.radians(45), 0))
        box(f'nmB{i}', 'shikkui', (0.006, 0.004, 0.07), (0.12 + i * 0.045, -0.183, 0.03), (0, math.radians(-45), 0))
    gable('bldgY', 'sumi', 0.34, 0.20, 0.07, 0.16, 0.24, -0.10)
    box('daiza', 'ishi', (0.22, 0.12, 0.05), (-0.22, -0.20, 0.025))
    cyl('oni', 'onigawara', 0.14, 0.06, (-0.22, -0.20, 0.19), (math.pi / 2, 0, 0), 16)
    for x in (-0.05, 0.05):
        sphere(f'me{x}', 'kin', 0.02, (-0.22 + x, -0.24, 0.21))
    box('kuchi', 'sumi', (0.10, 0.01, 0.025), (-0.22, -0.235, 0.13))
    for x in (-0.09, 0.09):
        cyl(f'tsuno{x}', 'onigawara', 0.022, 0.08, (-0.22 + x, -0.20, 0.34), (0, -x * 4, 0), 6, r2=0.004)
    return dict(target=(0, 0.02, 0.16), scale=1.08, el=26, size=96)


def takahama_kasuga():
    """高浜の春日神社：銀ねずの瓦の大屋根の拝殿、赤茶の木の正面と格子、しめ縄、右に台座の上の狛犬、左に赤い灯籠の柱"""
    ground('jari')
    hall('h', 0, 0.14, 0.44, 0.26, 0.16, 'renga', 'kawaraG', 0.26, front='kijiD')
    box('shime', 'kayabuki', (0.30, 0.012, 0.014), (0, 0.006, 0.18))
    box('komaD', 'ishi', (0.07, 0.07, 0.07), (0.26, -0.18, 0.035))
    sphere('koma', 'ishi', 0.035, (0.26, -0.18, 0.10), (1, 1, 1.2))
    box('toroP', 'shu', (0.03, 0.03, 0.26), (-0.30, -0.20, 0.13))
    box('toroH', 'shikkui', (0.06, 0.06, 0.06), (-0.30, -0.20, 0.27))
    return dict(target=(0, 0, 0.18), scale=1.08, el=26, size=96)


def takahama_oyama():
    """大山緑地：「千本桜の大山」とよばれる高台の公園。丸い石の台に立つ茶色いやきもののたぬきの大きな像と、満開の桜"""
    ground('shibaG')
    cyl('dai', 'ishi', 0.12, 0.06, (0, 0.0, 0.03), verts=20)
    sphere('hara', 'tanuki', 0.10, (0, -0.01, 0.15), (1, 0.9, 1.0))
    sphere('onaka', 'cream', 0.06, (0, -0.07, 0.14), (1, 0.5, 1.1))
    sphere('atama', 'tanuki', 0.07, (0, 0.0, 0.30))
    for x in (-0.04, 0.04):
        sphere(f'mimi{x}', 'tanuki', 0.02, (x, 0.0, 0.36))
        sphere(f'me{x}', 'sumi', 0.01, (x * 0.6, -0.065, 0.31))
    for i, (x, y) in enumerate(((-0.38, 0.26), (-0.20, 0.34), (0.20, 0.34), (0.40, 0.20), (-0.40, -0.12), (0.38, -0.22), (-0.24, -0.30))):
        tree(i, x, y, 0.9, 'sakura')
    return dict(target=(0, 0.02, 0.18), scale=1.08, el=24, size=96)


def takahama_mikawa_takahama_station():
    """名鉄 三河高浜駅：「鬼みち」のゴール。白い曲線の駅舎に赤レンガ色の箱と屋根の塔、うしろに高いマンション"""
    ground('asphalt')
    office('man', 0.30, 0.30, 0.24, 0.14, 0.50, 7, 'concrete')
    o = cyl('bldg', 'shikkui', 0.20, 0.14, (-0.12, -0.14, 0.07), verts=24)
    o.scale = (1.3, 0.55, 1)
    box('hako', 'renga', (0.14, 0.12, 0.14), (0.10, -0.18, 0.07))
    box('tou', 'renga', (0.07, 0.07, 0.24), (-0.36, -0.16, 0.12))
    cyl('touY', 'yane2', 0.07, 0.06, (-0.36, -0.16, 0.27), (0, 0, math.pi / 4), 4, r2=0.002)
    return dict(target=(0, 0.04, 0.20), scale=1.08, el=26, size=96)


def takahama_yoshihama_station():
    """名鉄 吉浜駅：かまぼこ形の屋根の白い小さな駅舎に駅名の看板、赤・白・青の自動販売機、右に「人形小路」の赤いのぼり。うしろに赤い電車"""
    ground('asphalt')
    box('bldg', 'shikkui', (0.30, 0.18, 0.12), (-0.16, -0.18, 0.06))
    o = cyl('kamaboko', 'concrete', 0.09, 0.32, (-0.16, -0.18, 0.12), (0, math.pi / 2, 0), 16)
    o.scale = (0.5, 1, 1)
    box('kanban', 'shikkui', (0.16, 0.012, 0.03), (-0.16, -0.274, 0.10))
    for i, m in enumerate(('red', 'shikkui', 'blue')):
        box(f'jihan{i}', m, (0.05, 0.04, 0.10), (0.04 + i * 0.055, -0.22, 0.05))
    cyl('nobori', 'hashira', 0.006, 0.26, (0.26, -0.26, 0.13), verts=6)
    box('noboriF', 'red', (0.04, 0.006, 0.16), (0.285, -0.26, 0.17))
    platform('p', 0.04, 0.12, 0.90)
    train('t', 'meitetsu', 'obi', 0.04, 0.28, 0.80)
    return dict(target=(0, 0.04, 0.14), scale=1.08, el=28, size=96)


def takahama_cityhall():
    """高浜市役所：白い建物に灰色の市松もようのパネル、黒い窓の列、屋上に白いアンテナの丸、手前に瓦屋根の玄関"""
    ground('jari')
    box('kan', 'shikkui', (0.56, 0.28, 0.36), (0, 0.14, 0.18))
    for f in range(4):
        windows(f'w{f}', 'mado', [-0.22 + i * 0.088 for i in range(6)], -0.003, 0.06 + f * 0.08, 0.06, 0.03)
    for i in range(6):
        for j in range(2):
            if (i + j) % 2:
                box(f'ichimatsu{i}{j}', 'concrete', (0.06, 0.01, 0.04), (-0.22 + i * 0.088, -0.004, 0.30 + j * 0.04))
    cyl('para', 'shikkui', 0.05, 0.02, (0.16, 0.18, 0.40), (math.radians(60), 0, 0), 16)
    box('genkan', 'kiji', (0.18, 0.10, 0.08), (-0.10, -0.06, 0.04))
    gable('genkanY', 'kawaraG', 0.22, 0.14, 0.05, 0.08, -0.10, -0.06)
    return dict(target=(0, 0.04, 0.20), scale=1.08, el=26, size=96)


# ---------- 幸田町 ----------
def kota_honkoji():
    """本光寺（三河のあじさい寺）：赤茶にぬった板の小さなお堂と、銀ねずの瓦の宝形屋根。まわりの青や紫のあじさい（約1万本）"""
    ground('jari')
    box('kd', 'kidan', (0.40, 0.36, 0.05), (0, 0.14, 0.025))
    box('do', 'renga', (0.32, 0.28, 0.20), (0, 0.14, 0.15))
    for i in range(5):
        box(f'ita{i}', 'kijiD', (0.006, 0.008, 0.18), (-0.12 + i * 0.06, -0.002, 0.15))
    roof('yane', 'kawaraG', 0.48, 0.44, 0.22, 0.25, 0.03, 0, 0.14)
    sphere('hoju', 'kin', 0.025, (0, 0.14, 0.49))
    for i in range(6):
        for side in (-1, 1):
            sphere(f'ajisai{i}{side}', ('ajisaiB', 'ajisaiP', 'shikkui')[(i + side) % 3], 0.04, (side * (0.12 + (i % 2) * 0.05), -0.36 + i * 0.07, 0.04))
    for x in (-0.36, 0.36):
        for y in (-0.30, -0.10, 0.10):
            sphere(f'ajiL{x}{y}', 'ajisaiB' if y < -0.2 else 'ajisaiP', 0.06, (x, y, 0.05))
    return dict(target=(0, 0.02, 0.18), scale=1.08, el=26, size=96)


def kota_kyodo_shiryokan():
    """幸田町郷土資料館：赤い波板の屋根の平屋（白い壁と窓）、館名の白い柱。外に展示された自衛隊の飛行機とヘリコプター"""
    ground('shibaG')
    box('kan', 'shikkui', (0.44, 0.24, 0.14), (-0.14, 0.18, 0.07))
    roof('kanY', 'yaneR', 0.50, 0.30, 0.08, 0.14, 0.6, -0.14, 0.18)
    windows('w', 'mado', [-0.28, -0.18, -0.10, 0.0], 0.058, 0.08, 0.06, 0.05)
    box('hashira', 'shikkui', (0.04, 0.04, 0.16), (-0.40, -0.02, 0.08))
    box('hikoki', 'haka', (0.30, 0.05, 0.05), (0.18, -0.18, 0.08), bevel=0.02)   # 飛行機
    box('tsubasa', 'haka', (0.08, 0.36, 0.01), (0.18, -0.18, 0.08))
    box('bichoku', 'haka', (0.04, 0.01, 0.08), (0.32, -0.18, 0.13))
    sphere('heli', 'gTree', 0.06, (-0.22, -0.20, 0.08), (1.4, 1, 1))
    box('heliT', 'gTree', (0.18, 0.02, 0.02), (-0.08, -0.20, 0.09))
    box('rotor', 'sumi', (0.30, 0.01, 0.006), (-0.22, -0.20, 0.15), (0, 0, 0.4))
    return dict(target=(0, 0, 0.12), scale=1.08, el=28, size=96)


def kota_bunka_hiroba():
    """幸田文化広場：「幸田文化広場」と彫った大きな石と、つつじの花、うしろのしだれ桜（約350本）"""
    ground('shibaG')
    box('ishi', 'ishi', (0.36, 0.10, 0.16), (0, -0.04, 0.08), bevel=0.03)
    for i in range(4):
        box(f'moji{i}', 'sumi', (0.04, 0.01, 0.06), (-0.10 + i * 0.065, -0.092, 0.09))
    for i in range(9):
        sphere(f'tsutsuji{i}', 'tsutsuji' if i % 3 else 'gTree', 0.05, (-0.40 + i * 0.10, -0.24, 0.035), (1.2, 1, 0.7))
    for i, (x, y) in enumerate(((-0.36, 0.20), (-0.12, 0.28), (0.12, 0.30), (0.36, 0.22), (-0.42, -0.02), (0.42, 0.02))):
        cyl(f'shm{i}', 'miki', 0.02, 0.18, (x, y, 0.09), verts=8)
        sphere(f'shd{i}', 'pink', 0.11, (x, y, 0.15), (1, 1, 1.3))   # しだれ桜（下までたれる）
    return dict(target=(0, 0.02, 0.12), scale=1.08, el=28, size=96)


def kota_michinoeki():
    """道の駅 筆柿の里・幸田：濃い灰色の大きな屋根に三角の明かり窓がふたつ、ガラスの店先。まわりの筆柿の畑（オレンジの実）"""
    ground('kusa')
    box('kan', 'shikkui', (0.56, 0.24, 0.14), (0, 0.20, 0.07))
    windows('w', 'glassB', [-0.2, -0.1, 0.0, 0.1, 0.2], 0.078, 0.06, 0.08, 0.09)
    roof('kanY', 'sumi', 0.64, 0.32, 0.14, 0.14, 0.5, 0, 0.20)
    for x in (-0.14, 0.14):
        gable_y(f'akari{x}', 'glass', 0.08, 0.06, 0.06, 0.19, x, 0.07)
    for i in range(6):
        x, y = -0.36 + (i % 3) * 0.36, -0.16 - (i // 3) * 0.16
        cyl(f'kakiM{i}', 'miki', 0.015, 0.08, (x, y, 0.04), verts=6)
        sphere(f'kakiH{i}', 'gTree', 0.07, (x, y, 0.11), (1.2, 1, 0.8))
        for j in range(3):
            sphere(f'kaki{i}{j}', 'kaki', 0.018, (x - 0.04 + j * 0.04, y - 0.06, 0.10 + (j % 2) * 0.03), (0.8, 0.8, 1.3))
    return dict(target=(0, 0.02, 0.12), scale=1.08, el=28, size=96)


def kota_hishiike():
    """菱池：明治に干拓されて田んぼになった池のあと。区切られた田んぼと水路、水を川へ出す排水機場（赤い屋根の白い機械小屋・れんがの水門）"""
    ground('kusa')
    for i in range(3):
        for j in range(2):
            box(f'ta{i}{j}', 'ine' if (i + j) % 2 else 'nae', (0.28, 0.20, 0.02), (-0.30 + i * 0.30, -0.24 + j * 0.24, 0.015))
    box('suiro', 'ike', (0.96, 0.05, 0.01), (0, 0.10, 0.02))
    box('koya', 'shikkui', (0.24, 0.16, 0.14), (0.20, 0.28, 0.07))
    gable('koyaY', 'yaneR', 0.28, 0.20, 0.07, 0.14, 0.20, 0.28)
    box('suimon', 'renga', (0.14, 0.06, 0.12), (-0.10, 0.12, 0.06))
    for x in (-0.15, -0.05):
        box(f'tetsu{x}', 'sumi', (0.015, 0.015, 0.18), (x, 0.09, 0.09))
    return dict(target=(0, 0.02, 0.08), scale=1.08, el=32, size=96)


def kota_happiness_hill():
    """ハッピネス・ヒル・幸田：うすいピンクの壁に、銀色のゆるい丸屋根の大きなホール。左に低い棟、前に木の列"""
    ground('jari')
    box('kan', 'pink', (0.44, 0.30, 0.20), (0.06, 0.14, 0.10))
    o = cyl('dome', 'jrSilver', 0.24, 0.44, (0.06, 0.14, 0.20), (0, math.pi / 2, 0), 24)
    o.scale = (0.35, 0.65, 1)
    windows('w', 'mado', [-0.08, 0.02, 0.12], -0.012, 0.10, 0.05, 0.08)
    box('tei', 'cream', (0.26, 0.20, 0.10), (-0.30, 0.10, 0.05))
    box('teiY', 'yaneB', (0.30, 0.24, 0.02), (-0.30, 0.10, 0.11))
    for i in range(5):
        tree(i, -0.36 + i * 0.18, -0.26, 0.6)
    return dict(target=(0, 0.02, 0.14), scale=1.08, el=26, size=96)


def kota_townhall():
    """幸田町役場：茶色いれんがタイルの6階建て（横長の窓の帯が重なる）、屋上にアンテナ、前に旗ざおと植えこみ"""
    ground('jari')
    box('kan', 'renga', (0.46, 0.28, 0.54), (0.02, 0.14, 0.27))
    for f in range(6):
        box(f'obi{f}', 'mado', (0.40, 0.01, 0.035), (0.02, -0.003, 0.06 + f * 0.085))
    box('antena', 'hashira', (0.01, 0.01, 0.10), (0.12, 0.16, 0.59))
    for i, x in enumerate((-0.34, -0.28, -0.22)):
        cyl(f'hata{i}', 'hashira', 0.006, 0.26, (x, -0.20, 0.13), verts=6)
        box(f'hataF{i}', ('red', 'white', 'blue')[i], (0.05, 0.004, 0.03), (x + 0.028, -0.20, 0.24))
    for i in range(4):
        sphere(f'ue{i}', 'gTree', 0.05, (-0.06 + i * 0.12, -0.10, 0.03), (1.3, 1, 0.7))
    return dict(target=(0, 0.04, 0.26), scale=1.08, el=26, size=96)


def kota_station():
    """JR 幸田駅：白い駅舎にガラスの正面と薄いひさし、赤いポスト・自動販売機、ヤシの木。うしろのホームに電車"""
    ground('asphalt')
    box('bldg', 'shikkui', (0.36, 0.20, 0.20), (-0.16, -0.18, 0.10))
    box('glass', 'glassB', (0.24, 0.01, 0.14), (-0.16, -0.282, 0.07))
    box('hisashi', 'concrete', (0.40, 0.08, 0.01), (-0.16, -0.31, 0.15))
    box('post', 'red', (0.04, 0.04, 0.08), (0.06, -0.30, 0.04))
    box('jihan', 'blue', (0.05, 0.04, 0.10), (0.12, -0.28, 0.05))
    for i, x in enumerate((-0.42, 0.30)):
        cyl(f'yashi{i}', 'miki', 0.012, 0.26, (x, -0.26, 0.13), verts=6)
        for j in range(5):
            a = j * 2 * math.pi / 5
            box(f'yashiH{i}{j}', 'gTree', (0.10, 0.02, 0.008), (x + math.cos(a) * 0.04, -0.26 + math.sin(a) * 0.04, 0.26), (0, 0.3, a))
    platform('p', 0.04, 0.12, 0.90)
    train('t', 'jrSilver', 'jrOrange', 0.04, 0.28, 0.84)
    return dict(target=(0, 0.04, 0.14), scale=1.08, el=28, size=96)


def kota_sangane_station():
    """JR 三ケ根駅：線路の上をまたぐ、クリーム色の壁と赤茶の屋根の橋上駅舎と、両側の白い階段。下を電車が通る"""
    ground('asphalt')
    platform('p', 0.04, 0.10, 0.90, 0.10, 0.06, 0.14)
    train('t', 'jrSilver', 'jrOrange', 0.04, 0.24, 0.84)
    box('kyo', 'cream', (0.30, 0.54, 0.14), (-0.10, 0.10, 0.40))
    windows('w', 'mado', [-0.20, -0.10, 0.0], -0.173, 0.42, 0.05, 0.05)
    roof('kyoY', 'yaneR', 0.34, 0.58, 0.07, 0.47, 0.5, -0.10, 0.10)
    for y in (-0.22, 0.42):
        box(f'kaidan{y}', 'shikkui', (0.10, 0.10, 0.34), (-0.10, y, 0.17))
    return dict(target=(0, 0.04, 0.22), scale=1.12, el=26, size=96)


def kota_aimi_station():
    """JR 相見駅（2012年開業）：ガラスばりの明るい駅舎と白い大きな箱の建物、前に並ぶ黒い柱。うしろのホームに電車"""
    ground('asphalt')
    platform('p', 0.04, 0.14, 0.90)
    train('t', 'jrSilver', 'jrOrange', 0.04, 0.30, 0.84)
    box('glass', 'glassB', (0.30, 0.20, 0.24), (-0.22, -0.16, 0.12))
    box('hako', 'shikkui', (0.24, 0.20, 0.30), (0.10, -0.14, 0.15))
    box('yane', 'shikkui', (0.34, 0.24, 0.02), (-0.22, -0.16, 0.25))
    for i in range(5):
        box(f'kuro{i}', 'sumi', (0.015, 0.015, 0.24), (-0.36 + i * 0.07, -0.27, 0.12))
    return dict(target=(0, 0.04, 0.16), scale=1.08, el=28, size=96)


# ---------- 蒲郡市 ----------
def gamagori_takeshima():
    """竹島：三河湾にうかぶ木々の島（緑青の銅屋根の八百富神社、白いのぼり）と、島へわたる長い竹島橋（387m）"""
    water('umi', 1.0, 0.84, 0, 0, 0.0)
    sphere('shima', 'gTree', 0.24, (0.16, 0.20, 0.0), (1.2, 1, 0.9))
    sphere('shima2', 'matsu', 0.14, (0.24, 0.26, 0.16), (1, 1, 0.8))
    box('iwa', 'ishi', (0.40, 0.30, 0.04), (0.16, 0.18, 0.02))
    box('sha', 'kiji', (0.10, 0.08, 0.06), (0.06, 0.08, 0.10))
    gable('shaY', 'doban', 0.14, 0.12, 0.05, 0.13, 0.06, 0.08)
    for x in (-0.02, 0.0):
        cyl(f'nobori{x}', 'hashira', 0.004, 0.12, (x, 0.04, 0.10), verts=6)
        box(f'noboriF{x}', 'shikkui', (0.012, 0.004, 0.08), (x + 0.008, 0.04, 0.12))
    box('hashi', 'concrete', (0.08, 0.60, 0.02), (-0.14, -0.20, 0.05), (0, 0, math.radians(-30)))
    for i in range(7):
        t = i / 6
        box(f'kyaku{i}', 'concrete', (0.02, 0.02, 0.05), (-0.30 + 0.32 * t, -0.48 + 0.52 * t, 0.025))
    return dict(target=(0, 0, 0.10), scale=1.08, el=30, size=96)


def gamagori_aquarium():
    """竹島水族館：白い建物に紺色の帯（白い丸と魚のもよう）、上に館名の看板、まわりの木"""
    ground('jari')
    box('kan', 'shikkui', (0.60, 0.30, 0.26), (0, 0.12, 0.13))
    box('obi', 'navy', (0.604, 0.304, 0.10), (0, 0.12, 0.14))
    for i in range(5):
        cyl(f'maru{i}', 'shikkui', 0.025, 0.01, (-0.24 + i * 0.12, -0.032, 0.14), (math.pi / 2, 0, 0), 12)
        sphere(f'sakana{i}', 'shikkui', 0.012, (-0.18 + i * 0.12, -0.034, 0.12), (1.8, 0.4, 1))
    box('genkan', 'glassB', (0.14, 0.01, 0.07), (0.16, -0.032, 0.035))
    box('kanban', 'shikkui', (0.30, 0.02, 0.06), (0, -0.02, 0.29))
    box('kanbanM', 'navy', (0.24, 0.022, 0.02), (0, -0.022, 0.29))
    tree('a', -0.42, -0.20, 0.8)
    tree('b', 0.42, -0.22, 0.8)
    return dict(target=(0, 0.02, 0.16), scale=1.08, el=26, size=96)


def gamagori_station():
    """JR・名鉄 蒲郡駅：高架の長い駅（白い屋根と灰色の駅舎）と、前のロータリーに立つ白い帆の記念碑、うしろの山"""
    cyl('yama', 'matsu', 0.40, 0.30, (0.10, 0.44, 0.15), verts=20, r2=0.08)
    ground('jari')
    box('koka', 'concrete', (0.96, 0.24, 0.18), (0, 0.20, 0.09))
    train('t', 'jrSilver', 'jrOrange', 0.0, 0.20, 0.80, 0.18, 0.15, 0.15)
    box('yane', 'shikkui', (0.96, 0.30, 0.03), (0, 0.20, 0.42))
    for x in (-0.40, 0.0, 0.40):
        box(f'h{x}', 'hashira', (0.02, 0.02, 0.24), (x, 0.06, 0.30))
    o = cyl('rotary', 'shibaG', 0.16, 0.02, (0, -0.22, 0.012), verts=20)
    mesh('ho', 'shikkui', [(-0.02, -0.22, 0.03), (0.08, -0.22, 0.05), (0.0, -0.22, 0.30)], [(0, 1, 2)])   # 白い帆
    mesh('ho2', 'shikkui', [(-0.04, -0.21, 0.03), (-0.12, -0.21, 0.05), (-0.03, -0.21, 0.24)], [(0, 1, 2)])
    return dict(target=(0, 0.02, 0.18), scale=1.08, el=26, size=96)


MODELS = {
    'okazaki-daijuji': okazaki_daijuji, 'okazaki-kakukyu': okazaki_kakukyu, 'okazaki-maruya': okazaki_maruya,
    'okazaki-iga-hachimangu': okazaki_iga_hachimangu, 'okazaki-takisanji': okazaki_takisanji, 'okazaki-iwazu-tenmangu': okazaki_iwazu_tenmangu,
    'okazaki-rokusho-jinja': okazaki_rokusho_jinja, 'okazaki-okudono-jinya': okazaki_okudono_jinya, 'okazaki-higashi-park': okazaki_higashi_park,
    'okazaki-honda-tei': okazaki_honda_tei, 'okazaki-minami-park': okazaki_minami_park, 'okazaki-museum': okazaki_museum,
    'okazaki-higashi-okazaki-sta': okazaki_higashi_okazaki_sta, 'okazaki-okazaki-sta': okazaki_okazaki_sta, 'okazaki-shooji': okazaki_shooji,
    'okazaki-hozoji': okazaki_hozoji, 'okazaki-fujikawa-shuku': okazaki_fujikawa_shuku, 'okazaki-kuragari': okazaki_kuragari,
    'okazaki-hongusan': okazaki_hongusan,
    'anjo-denpark': anjo_denpark,
    'anjo-jozanen': anjo_jozanen,
    'anjo-honshoji': anjo_honshoji,
    'anjo-castle': anjo_castle,
    'anjo-museum': anjo_museum,
    'anjo-horiuchi-park': anjo_horiuchi_park,
    'anjo-park': anjo_park,
    'anjo-futago-kofun': anjo_futago_kofun,
    'anjo-himeogawa-kofun': anjo_himeogawa_kofun,
    'anjo-station': anjo_station,
    'anjo-mikawa-anjo-station': anjo_mikawa_anjo_station,
    'anjo-minami-anjo-station': anjo_minami_anjo_station,
    'anjo-cityhall': anjo_cityhall,
    'hekinan-aquarium': hekinan_aquarium,
    'hekinan-rinkai-park': hekinan_rinkai_park,
    'hekinan-akashi-park': hekinan_akashi_park,
    'hekinan-shomyoji': hekinan_shomyoji,
    'hekinan-kaitokuji': hekinan_kaitokuji,
    'hekinan-kokonoe-mirin': hekinan_kokonoe_mirin,
    'hekinan-fujii-museum': hekinan_fujii_museum,
    'hekinan-kumano': hekinan_kumano,
    'hekinan-mugaen': hekinan_mugaen,
    'hekinan-oninji': hekinan_oninji,
    'hekinan-station': hekinan_station,
    'hekinan-chuo-station': hekinan_chuo_station,
    'hekinan-cityhall': hekinan_cityhall,
    'takahama-kawara-museum': takahama_kawara_museum,
    'takahama-minato-station': takahama_minato_station,
    'takahama-kasuga': takahama_kasuga,
    'takahama-oyama': takahama_oyama,
    'takahama-mikawa-takahama-station': takahama_mikawa_takahama_station,
    'takahama-yoshihama-station': takahama_yoshihama_station,
    'takahama-cityhall': takahama_cityhall,
    'kota-honkoji': kota_honkoji,
    'kota-kyodo-shiryokan': kota_kyodo_shiryokan,
    'kota-bunka-hiroba': kota_bunka_hiroba,
    'kota-michinoeki': kota_michinoeki,
    'kota-hishiike': kota_hishiike,
    'kota-happiness-hill': kota_happiness_hill,
    'kota-townhall': kota_townhall,
    'kota-station': kota_station,
    'kota-sangane-station': kota_sangane_station,
    'kota-aimi-station': kota_aimi_station,
    'gamagori-takeshima': gamagori_takeshima,
    'gamagori-aquarium': gamagori_aquarium,
    'gamagori-station': gamagori_station,
}
pa.MODELS.clear()
pa.MODELS.update(MODELS)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        pa.make(name)

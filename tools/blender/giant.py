# にしおさんぽGO：代表的な名所の「特大のドット絵」（96×96）を Blender で作る
# - 歩く地図で、名所のまわり6×6マスに大きく描く（pixel.js の GIANT_ART）。できた PNG は nishio-go/art/giant/
# - 立体の作り方・焼き方は pixel-art.py と同じ（材質ごとの3色・黒いふちどり）。形と色は、名所の 48×48 の絵
#   （Wikimedia Commons の写真を見て描いたもの。docs/landmark-photos.md）に合わせる
# 使い方：python tools/blender/giant.py （ぜんぶ）／ python tools/blender/giant.py nishio-castle （ひとつ）
import importlib.util
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pixel_art', os.path.join(HERE, 'pixel-art.py'))
pa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pa)
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
pa.OUT = os.path.join(pa.ROOT, 'nishio-go', 'art', 'giant')

pa.MATS.update({
    'shikkui': '#f2efe6', 'shitami': '#3a3430', 'ishigaki': '#a59f92', 'kawaraG': '#6c7480', 'munaG': '#4c535c', 'shachi': '#e8b830',
    'brick': '#a8483a', 'brickD': '#7a3428', 'sash': '#f0ece0', 'modern': '#e4e2dc', 'modernB': '#8aa0b4', 'copper': '#c07a3a',
    'hiwada': '#8a6a50', 'koshi': '#8c867a', 'kidan': '#b8b0a0', 'shiba': '#6aa84a', 'jari': '#d8d0bc',
    'meitetsu': '#c8162a', 'mado': '#2f3a48', 'obi': '#f4f4f4', 'home': '#c8c4b8', 'yane2': '#7a8088', 'hashira': '#9aa0a8',
    'sekibutsu': '#c9a878', 'sekibutsuD': '#9a7a52', 'hasuza': '#b89868', 'koen': '#d8b048', 'daiza': '#9a968c',
    'kuro': '#262626', 'hashigo': '#4a4a4a', 'suna': '#e8d6a6', 'kusa': '#5c9e3a',
    'kurokabe': '#2b2b2b', 'yaneK': '#59606a', 'post': '#d23a2e', 'michi': '#a8a49a',
    'cha': '#3f8a3a', 'chaL': '#7fbf4a', 'tsuchi': '#8a6a44', 'azumaya': '#6b4a30', 'yaneA': '#4f565e',
    'matsu': '#2f6b33', 'miki': '#6b4a30',
})


def roof(name, mat, w, d, h, z, top=0.25, x=0.0, y=0.0):
    """寄棟の屋根（長方形の台形の錐。top は棟の長さの割合）"""
    o = cyl(name, mat, math.sqrt(0.5), 1, (0, 0, 0), (0, 0, math.pi / 4), 4, r2=math.sqrt(0.5) * top)
    o.scale = (w, d, h)
    o.location = (x, y, z + h / 2)
    return o


def pine(n, x, y, s=1.0):
    cyl(f'miki{n}', 'miki', 0.02 * s, 0.16 * s, (x, y, 0.08 * s), verts=8)
    for i, (r, z) in enumerate(((0.11, 0.16), (0.085, 0.24), (0.05, 0.31))):
        sphere(f'matsu{n}{i}', 'matsu', r * s, (x, y, z * s), (1, 1, 0.55))


def windows(prefix, mat, xs, y, z, w, h):
    for i, x in enumerate(xs):
        box(f'{prefix}{i}', mat, (w, 0.02, h), (x, y, z))


# ---------- 名所 ----------
def nishio_castle():
    """西尾城の丑寅櫓（石垣の上の三重櫓。白いしっくいの壁、下は黒い板張り、灰色の瓦）"""
    pa.cyl('ishigaki', 'ishigaki', 0.42 * math.sqrt(2), 0.22, (0, 0, 0.11), (0, 0, math.pi / 4), 4, r2=0.36 * math.sqrt(2))
    for k, (w, z, h) in enumerate(((0.60, 0.22, 0.16), (0.46, 0.46, 0.13), (0.34, 0.66, 0.12))):
        box(f'kabe{k}', 'shikkui', (w, w * 0.86, h), (0, 0, z + h / 2))
        box(f'shitami{k}', 'shitami', (w + 0.004, w * 0.86 + 0.004, h * 0.35), (0, 0, z + h * 0.175))
        windows(f'mado{k}', 'shitami', [(-0.3 + 0.2 * i) * w for i in range(4)], -w * 0.43 - 0.005, z + h * 0.62, w * 0.07, h * 0.22)
        top = 0.05 if k == 2 else 0.5
        roof(f'yane{k}', 'kawaraG', w + 0.14, w * 0.86 + 0.14, 0.09 if k < 2 else 0.13, z + h, top)
    # 二重目の屋根の前に千鳥破風（三角の屋根）
    cyl('hafu', 'kawaraG', 0.11, 0.18, (0, -0.25, 0.63), (0, -math.pi / 2, math.pi / 2), 3)
    box('hafuW', 'shikkui', (0.10, 0.02, 0.05), (0, -0.33, 0.615))
    box('mune', 'munaG', (0.12, 0.03, 0.03), (0, 0, 0.92))
    for x in (-0.06, 0.06):
        box(f'oni{x}', 'munaG', (0.025, 0.03, 0.05), (x, 0, 0.94))
    pine('a', -0.42, -0.30)
    pine('b', 0.44, -0.22, 0.9)
    return dict(target=(0, 0, 0.42), scale=1.25, el=26, size=96)


def okazaki_castle():
    """岡崎城の天守（石垣の上の白い天守、灰色の瓦、てっぺんに金のしゃちほこ）"""
    pa.cyl('ishigaki', 'ishigaki', 0.44 * math.sqrt(2), 0.24, (0, 0, 0.12), (0, 0, math.pi / 4), 4, r2=0.38 * math.sqrt(2))
    for k, (w, z, h) in enumerate(((0.62, 0.24, 0.17), (0.48, 0.49, 0.14), (0.34, 0.70, 0.13))):
        box(f'kabe{k}', 'shikkui', (w, w * 0.8, h), (0, 0, z + h / 2))
        windows(f'mado{k}', 'shitami', [(-0.3 + 0.2 * i) * w for i in range(4)], -w * 0.4 - 0.005, z + h * 0.55, w * 0.08, h * 0.28)
        roof(f'yane{k}', 'kawaraG', w + 0.14, w * 0.8 + 0.14, 0.09 if k < 2 else 0.12, z + h, 0.05 if k == 2 else 0.5)
    for k, z in ((0, 0.46), (1, 0.68)):   # 唐破風・千鳥破風
        cyl(f'hafu{k}', 'kawaraG', 0.10, 0.16, (0, -0.24 + k * 0.05, z), (0, -math.pi / 2, math.pi / 2), 3)
    box('mune', 'munaG', (0.12, 0.03, 0.03), (0, 0, 0.96))
    for x in (-0.07, 0.07):   # 金のしゃちほこ
        cyl(f'shachi{x}', 'shachi', 0.018, 0.08, (x, 0, 1.01), (0, math.copysign(0.3, -x), 0), 8, r2=0.008)
    pine('a', -0.44, -0.28)
    return dict(target=(0, 0, 0.47), scale=1.3, el=24, size=96)


def iwase_bunko():
    """岩瀬文庫：赤レンガの古書庫（2階建て・瓦屋根・白い窓わく）と、となりの白い本館"""
    box('soko', 'brick', (0.44, 0.34, 0.42), (-0.16, 0.0, 0.21))
    for z in (0.14, 0.30):
        box(f'obi{z}', 'brickD', (0.446, 0.346, 0.02), (-0.16, 0, z + 0.07))
    for row, z in enumerate((0.11, 0.29)):
        windows(f'w{row}', 'sash', [-0.30, -0.16, -0.02], -0.172, z, 0.06, 0.09)
        windows(f'wd{row}', 'mado', [-0.30, -0.16, -0.02], -0.176, z, 0.035, 0.06)
    roof('yane', 'kawaraG', 0.52, 0.42, 0.14, 0.42, 0.45, x=-0.16)
    box('honkan', 'modern', (0.36, 0.40, 0.34), (0.26, 0.04, 0.17))
    for i in range(5):
        box(f'tate{i}', 'modernB', (0.025, 0.02, 0.26), (0.13 + i * 0.065, -0.165, 0.17))
    box('hisashi', 'modern', (0.40, 0.10, 0.02), (0.26, -0.20, 0.30))
    box('niwa', 'jari', (1.0, 0.70, 0.02), (0.05, 0.02, 0.0))
    pine('a', 0.40, -0.30, 0.8)
    return dict(target=(0.05, 0, 0.24), scale=1.2, el=26, size=96)


def konrenji():
    """金蓮寺の弥陀堂（国宝。正方形に近いお堂に、檜皮ぶきの大きな寄棟の屋根。前は格子）"""
    box('kidan', 'kidan', (0.66, 0.62, 0.06), (0, 0, 0.03))
    box('do', 'koshi', (0.50, 0.46, 0.22), (0, 0, 0.17))
    for i in range(9):   # 格子
        box(f'koshi{i}', 'shitami', (0.012, 0.01, 0.16), (-0.2 + i * 0.05, -0.236, 0.17))
    for z in (0.12, 0.20):
        box(f'yoko{z}', 'shitami', (0.42, 0.01, 0.01), (0, -0.236, z))
    for x in (-0.25, 0.25):
        box(f'hashira{x}', 'woodD', (0.03, 0.03, 0.22), (x, -0.23, 0.17))
    box('dan', 'kidan', (0.16, 0.10, 0.03), (0, -0.35, 0.015))
    roof('yane', 'hiwada', 0.86, 0.80, 0.42, 0.28, 0.28)
    box('mune', 'woodD', (0.25, 0.04, 0.04), (0, 0, 0.71))
    return dict(target=(0, 0, 0.34), scale=1.15, el=24, size=96)


def nishio_station():
    """名鉄 西尾駅：ホームに止まった赤い電車（白い帯・黒い窓）と、ホームの屋根"""
    box('home', 'home', (1.0, 0.26, 0.10), (0, 0.18, 0.05))
    box('senro', 'shitami', (1.0, 0.22, 0.02), (0, -0.10, 0.01))
    box('densha', 'meitetsu', (0.92, 0.20, 0.26), (0, -0.10, 0.18), bevel=0.03)
    box('obi', 'obi', (0.925, 0.205, 0.02), (0, -0.10, 0.12))
    windows('mado', 'mado', [-0.36 + i * 0.12 for i in range(7)], -0.202, 0.22, 0.08, 0.07)
    box('kao', 'mado', (0.02, 0.14, 0.09), (-0.462, -0.10, 0.23))
    box('yaneD', 'yane2', (0.92, 0.18, 0.02), (0, -0.10, 0.315))
    for x in (-0.36, 0, 0.36):
        box(f'hashira{x}', 'hashira', (0.02, 0.02, 0.26), (x, 0.24, 0.23))
    box('yane', 'yane2', (0.96, 0.24, 0.02), (0, 0.20, 0.37), (math.radians(-8), 0, 0))
    box('kanban', 'obi', (0.18, 0.02, 0.06), (0.1, 0.10, 0.30))
    return dict(target=(0, 0.04, 0.18), scale=1.15, el=28, size=96)


def daibutsu():
    """常福寺の刈宿の大仏（石の台座と蓮の台の上に座る大きな仏さま。うしろに輪の光背）"""
    box('daiza', 'daiza', (0.62, 0.52, 0.16), (0, 0, 0.08))
    cyl('hasu', 'hasuza', 0.30, 0.10, (0, 0, 0.21), verts=16, r2=0.24)
    sphere('hiza', 'sekibutsu', 0.26, (0, -0.04, 0.30), (1.15, 0.8, 0.42))
    cyl('do', 'sekibutsu', 0.17, 0.30, (0, 0.02, 0.45), verts=16, r2=0.12)
    sphere('te', 'sekibutsuD', 0.07, (0, -0.14, 0.36), (1.4, 0.7, 0.6))
    sphere('atama', 'sekibutsu', 0.11, (0, 0.0, 0.68), (1, 0.95, 1.05))
    sphere('rahotsu', 'sekibutsuD', 0.06, (0, 0.01, 0.78))
    for x in (-0.11, 0.11):
        sphere(f'mimi{x}', 'sekibutsu', 0.03, (x, 0.0, 0.66), (0.6, 0.6, 1.4))
    import bpy
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.025, location=(0, 0.12, 0.60), rotation=(math.pi / 2, 0, 0))   # 輪の光背
    bpy.context.object.data.materials.append(pa.material('koen'))
    for x in (-0.05, 0.05):
        box(f'me{x}', 'sekibutsuD', (0.04, 0.01, 0.008), (x, -0.105, 0.69))   # 細い目
    box('kusa', 'kusa', (0.9, 0.7, 0.02), (0, 0, 0.0))
    return dict(target=(0, 0, 0.42), scale=1.1, el=18, size=96)


def ohirune():
    """佐久島のおひるねハウス（砂浜に置かれた黒い箱。はしごと、中で寝ころべる窓）"""
    box('suna', 'suna', (1.0, 0.8, 0.03), (0, 0, 0.0))
    box('hako', 'kuro', (0.52, 0.40, 0.46), (0, 0, 0.25))
    for i, (x, z) in enumerate(((-0.13, 0.15), (0.13, 0.15), (-0.13, 0.36), (0.13, 0.36))):
        box(f'mado{i}', 'mado', (0.15, 0.02, 0.12), (x, -0.205, z))
    for x in (-0.08, 0.08):
        for i in range(6):
            box(f'dan{x}{i}', 'hashigo', (0.06, 0.02, 0.012), (x, -0.215, 0.06 + i * 0.075))
        for dx in (-0.03, 0.03):
            box(f'sao{x}{dx}', 'hashigo', (0.01, 0.02, 0.46), (x + dx, -0.215, 0.25))
    for i, (x, y) in enumerate(((-0.40, -0.25), (0.42, -0.20), (0.36, 0.28))):
        sphere(f'kusa{i}', 'kusa', 0.06, (x, y, 0.03), (1.3, 1, 0.5))
    return dict(target=(0, 0, 0.24), scale=1.1, el=24, size=96)


def kurokabe():
    """佐久島の黒壁集落（コールタールで黒くぬった板壁の家が並ぶ路地。赤いポスト）"""
    box('michi', 'michi', (1.0, 0.24, 0.02), (0, -0.30, 0.0))
    for i, (x, w, h) in enumerate(((-0.27, 0.42, 0.34), (0.22, 0.40, 0.26))):
        box(f'ie{i}', 'kurokabe', (w, 0.40, h), (x, 0.02, h / 2))
        for j in range(5):
            box(f'ita{i}{j}', 'shitami', (0.006, 0.01, h - 0.04), (x - w / 2 + (j + 0.5) * w / 5, -0.185, h / 2))
        box(f'to{i}', 'mado', (0.10, 0.01, 0.14), (x + 0.08, -0.186, 0.07))
        o = cyl(f'yane{i}', 'yaneK', 0.24, w + 0.06, (x, 0.02, h + 0.08), (0, -math.pi / 2, 0), 3)   # 切妻の屋根（三角の柱を横に）
        o.scale = (0.8, 1, 1)
    box('post', 'post', (0.06, 0.05, 0.12), (0.46, -0.24, 0.06))
    return dict(target=(0, 0, 0.2), scale=1.15, el=26, size=96)


def chaen():
    """稲荷山茶園：丸く刈りこんだ茶の木の列がならぶ丘と、見晴らしのあずまや"""
    box('oka', 'tsuchi', (1.0, 0.9, 0.06), (0, 0, 0.03))
    for i in range(5):   # 茶の木の列（かまぼこ形）。あいだに土の通路
        y = -0.34 + i * 0.16
        o = cyl(f'cha{i}', 'cha', 0.055, 0.88, (0, y, 0.06), (0, math.pi / 2, 0), 16)
        o.scale = (1.5, 1, 1)
        box(f'chaL{i}', 'chaL', (0.86, 0.03, 0.012), (0, y - 0.015, 0.14))
    for x in (0.18, 0.40):
        for y in (0.20, 0.38):
            box(f'hashira{x}{y}', 'azumaya', (0.02, 0.02, 0.22), (x, y, 0.29))
    roof('yaneA', 'yaneA', 0.34, 0.30, 0.12, 0.40, 0.05, x=0.29, y=0.29)
    return dict(target=(0, 0, 0.2), scale=1.15, el=34, size=96)


MODELS = {'nishio-castle': nishio_castle, 'okazaki-castle': okazaki_castle, 'iwase-bunko': iwase_bunko, 'konrenji': konrenji,
          'nishio-station': nishio_station, 'daibutsu': daibutsu, 'ohirune': ohirune, 'kurokabe': kurokabe, 'chaen': chaen}
pa.MODELS.clear()
pa.MODELS.update(MODELS)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        pa.make(name)

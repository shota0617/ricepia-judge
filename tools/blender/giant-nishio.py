# にしおさんぽGO：西尾市の注目スポットを、1か所ずつ手で形を作った「特大のドット絵」（96×96）に
# - giant.py（西尾城・岩瀬文庫など9か所）・giant-neighbors.py（となりの市町65か所）と同じ作り方・焼き方・部品
# - 形と色は、その名所の 48×48 の絵（pixel.js の LANDMARK_ART。Wikimedia Commons の写真を見て描いたもの。docs/landmark-photos.md）に合わせる。
#   看板や案内板の字は描かない（色の板だけ）
# - できた PNG は nishio-go/art/giant/<名前>.png（名前は spots.json の id）。歩く地図では pixel.js の GIANT_ART でその名所に大きく描く
# 使い方：python tools/blender/giant-nishio.py （ぜんぶ）／ python tools/blender/giant-nishio.py konoe-tei （ひとつ）
import importlib.util
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('giant_neighbors', os.path.join(HERE, 'giant-neighbors.py'))
gn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gn)
pa = gn.pa
bpy = pa.bpy
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
roof, gable, gable_y, irimoya, ground, tree, torii, toro, steps, office, hall, kura, water = (
    gn.roof, gn.gable, gn.gable_y, gn.irimoya, gn.ground, gn.tree, gn.torii, gn.toro, gn.steps, gn.office, gn.hall, gn.kura, gn.water)
pine, windows = gn.pine, gn.windows

pa.MATS.update({
    'doban2': '#5f9a8a', 'dobanD': '#3f7a6a', 'shoji': '#f4f0e2', 'tsuchikabe': '#d8c8a8', 'beige': '#d8c4a0', 'matchaG': '#4f9a3a',
    'sora': '#9fd3ff', 'umiB': '#4a8ac6', 'fune': '#f4f4f0', 'funeB': '#2f5fc0', 'kuroita': '#2e2e30', 'sakuraP': '#f0b8c8',
    'tower': '#e8e0d0', 'towerB': '#a8784a', 'renga2': '#9a7a6a', 'glassC': '#7ab0d8', 'redB': '#d23a2e', 'parkB': '#3a7fd0',
    'iwaG': '#8a8e8a', 'iwaGD': '#5e625e', 'taki': '#f0f6fa', 'chaR': '#4f8a3a', 'chaRL': '#7fbf4a', 'kamome': '#f4f4f0', 'kamomeY': '#f2c230',
    'pole2': '#9a7a52', 'sunaB': '#e8d6a6', 'kanbanR': '#d23a2e', 'kanbanW2': '#f4f2ea', 'asphalt2': '#7a7c80', 'line2': '#f4f4f4',
})


# ---------- 部品 ----------
def ishidatami(n, x, y0, y1, w=0.12):
    """手前から奥へのびる石だたみの参道"""
    box(f'sando{n}', 'jari', (w, abs(y1 - y0), 0.008), (x, (y0 + y1) / 2, 0.012))


def lattice(n, mat, x, y, w, h, z, k=8):
    """たての格子"""
    for i in range(k):
        box(f'lt{n}{i}', mat, (0.008, 0.008, h), (x - w / 2 + (i + 0.5) * w / k, y, z + h / 2))


def shoji_row(n, x, y, w, h, z, k=6):
    box(f'sj{n}', 'shoji', (w, 0.01, h), (x, y, z + h / 2))
    for i in range(k + 1):
        box(f'sjk{n}{i}', 'kijiD', (0.006, 0.012, h), (x - w / 2 + i * w / k, y - 0.002, z + h / 2))
    box(f'sjh{n}', 'kijiD', (w, 0.012, 0.006), (x, y - 0.002, z + h * 0.5))


def sign_board(n, x, y, z, w, h, face='kanbanW2', frame='kanbanR'):
    """字のない看板（色の板とわく）"""
    box(f'sbf{n}', frame, (w + 0.02, 0.02, h + 0.02), (x, y, z))
    box(f'sbb{n}', face, (w, 0.022, h), (x, y - 0.002, z))


def fence(n, mat, x0, x1, y, h=0.05, k=10):
    box(f'fnT{n}', mat, (abs(x1 - x0), 0.01, 0.01), ((x0 + x1) / 2, y, h))
    for i in range(k + 1):
        box(f'fnP{n}{i}', mat, (0.01, 0.01, h), (x0 + (x1 - x0) * i / k, y, h / 2))


GIANT = dict(target=(0, 0.02, 0.24), scale=1.12, el=22, size=96)


def view(z=0.24, scale=1.12, el=22):
    return dict(target=(0, 0.02, z), scale=scale, el=el, size=96)


# ---------- 西尾 ----------
def konoe_tei():
    """旧近衛邸：二階建ての数寄屋（灰色の瓦の入母屋）、白い妻に黒い木組み、一階は格子と縁、手前に飛び石"""
    ground('jari')
    box('ichi', 'kiji', (0.62, 0.36, 0.16), (-0.06, 0.04, 0.08))
    lattice('i', 'kijiD', -0.06, -0.141, 0.58, 0.12, 0.02, 12)
    box('en', 'kijiD', (0.66, 0.06, 0.02), (-0.06, -0.17, 0.04))
    roof('yane1', 'kawaraG', 0.74, 0.46, 0.06, 0.16, 0.7, -0.06, 0.04, flat=True)
    box('ni', 'shikkui', (0.36, 0.26, 0.14), (-0.14, 0.06, 0.25))
    for x in (-0.3, -0.14, 0.02):
        box(f'kumi{x}', 'kijiD', (0.012, 0.01, 0.14), (x, -0.071, 0.25))
    box('kumiH', 'kijiD', (0.36, 0.01, 0.012), (-0.14, -0.071, 0.27))
    irimoya('yane2', 'kawaraG', 0.48, 0.36, 0.2, 0.32, -0.14, 0.06)
    box('tsuma', 'shikkui', (0.26, 0.2, 0.2), (0.24, 0.0, 0.17))   # 右の白い妻の棟
    gable_y('tsumaY', 'kawaraG', 0.32, 0.26, 0.12, 0.27, 0.24, 0.0)
    box('genkan', 'kuroita', (0.12, 0.01, 0.12), (0.24, -0.101, 0.13))
    for i, (x, y) in enumerate(((-0.3, -0.3), (-0.14, -0.27), (0.02, -0.31), (0.18, -0.28))):
        cyl(f'tobi{i}', 'stoneR', 0.04, 0.02, (x, y, 0.012), verts=10)
    return view(0.22)


def shokoso():
    """尚古荘：二階建ての木の建物（障子の並ぶ縁、灰色の瓦）、大きな松、手前に庭石"""
    ground('shibaG')
    box('ichi', 'kiji', (0.66, 0.32, 0.14), (0.04, 0.06, 0.09))
    shoji_row('a', 0.04, -0.105, 0.6, 0.1, 0.03, 10)
    roof('yane1', 'kawaraG', 0.76, 0.42, 0.05, 0.16, 0.75, 0.04, 0.06, flat=True)
    box('ni', 'kiji', (0.6, 0.28, 0.12), (0.04, 0.08, 0.27))
    shoji_row('b', 0.04, -0.065, 0.56, 0.09, 0.22, 10)
    roof('yane2', 'kawaraG', 0.74, 0.4, 0.12, 0.33, 0.6, 0.04, 0.08)
    pine('p', -0.34, -0.16, 1.6)
    for i, (x, y) in enumerate(((-0.1, -0.26), (0.14, -0.3), (0.32, -0.24))):
        sphere(f'ishi{i}', 'stoneR', 0.05, (x, y, 0.02), (1.4, 1, 0.6))
    return view(0.24)


def ibun_jinja():
    """伊文神社：緑の銅板ぶきの屋根（反った入母屋）、白い柱と横木、正面の格子戸、手前の石だたみ"""
    ground('jari')
    box('kidan', 'kidan', (0.6, 0.34, 0.05), (0, 0.06, 0.025))
    box('kabe', 'cream', (0.5, 0.26, 0.16), (0, 0.06, 0.13))
    for i in range(6):
        box(f'to{i}', 'kijiD', (0.06, 0.012, 0.11), (-0.19 + i * 0.076, -0.071, 0.12))
    for x in (-0.25, -0.083, 0.083, 0.25):
        box(f'hashira{x}', 'shikkui', (0.02, 0.02, 0.17), (x, -0.075, 0.135))
    box('nuki', 'shikkui', (0.52, 0.02, 0.02), (0, -0.075, 0.2))
    irimoya('yane', 'doban2', 0.7, 0.46, 0.22, 0.21, 0, 0.06)
    box('mune', 'dobanD', (0.3, 0.04, 0.03), (0, 0.06, 0.43))
    ishidatami('s', 0, -0.36, -0.12, 0.16)
    return view(0.22)


def kozenji():
    """康全寺：白壁に黒い木組みの建物（灰色の瓦）、大きな木の戸、右に大きな木、手前に参道"""
    ground('jari')
    box('kabe', 'shikkui', (0.58, 0.3, 0.2), (-0.06, 0.08, 0.1))
    for x in (-0.33, -0.16, 0.04, 0.2):
        box(f'kumi{x}', 'kijiD', (0.016, 0.01, 0.2), (x, -0.071, 0.1))
    box('kumiH', 'kijiD', (0.58, 0.01, 0.016), (-0.06, -0.071, 0.15))
    box('to', 'kiji', (0.14, 0.012, 0.13), (-0.06, -0.072, 0.065))
    irimoya('yane', 'kawaraG', 0.72, 0.44, 0.22, 0.2, -0.06, 0.08)
    sign_board('k', -0.36, -0.08, 0.1, 0.04, 0.12, 'kanbanW2', 'kijiD')
    tree('t', 0.34, -0.02, 2.0)
    ishidatami('s', -0.06, -0.38, -0.08, 0.14)
    return view(0.24)


def kumaku_jinja():
    """久麻久神社：長い石段の上の社殿（灰色の屋根、赤い柱）、両わきの森"""
    ground('shibaG')
    for x in (-0.32, 0.4):   # 左の木は、ななめ（方位 −35°）から見ると左へずれるので内へ（絵のふちで切れないように）
        tree(f'm{x}', x, 0.34, 1.3, 'sugi')
    steps('a', 'stoneR', 0, -0.38, 0.2, 8, 0.05, 0.024)
    box('dan', 'shibaG', (0.66, 0.3, 0.2), (0, 0.2, 0.1))
    box('kabe', 'kiji', (0.42, 0.22, 0.12), (0, 0.2, 0.26))
    for x in (-0.2, -0.07, 0.07, 0.2):
        box(f'hashira{x}', 'shu', (0.02, 0.02, 0.12), (x, 0.089, 0.26))
    box('to', 'kijiD', (0.18, 0.01, 0.08), (0, 0.087, 0.25))
    irimoya('yane', 'kawaraG', 0.56, 0.36, 0.18, 0.32, 0, 0.2)
    return view(0.26, 1.2)


def yatsuomote():
    """八ツ面山：山の上の展望台（白い円い塔と茶色の手すり、木の足組み）、まわりの林"""
    ground('shibaG')
    for i, (x, y) in enumerate(((-0.36, 0.2), (0.36, 0.18), (-0.4, -0.08), (0.4, -0.1))):   # 塔が見えるよう、木は うしろと両わきに
        tree(f'h{i}', x, y, 1.3)
    for x, y in ((-0.12, -0.08), (0.12, -0.08), (-0.12, 0.12), (0.12, 0.12)):
        box(f'ashi{x}{y}', 'towerB', (0.03, 0.03, 0.5), (x, y, 0.25))
    for z in (0.15, 0.32):
        box(f'yoko{z}', 'towerB', (0.26, 0.02, 0.02), (0, -0.08, z))
    cyl('tou', 'tower', 0.11, 0.42, (0, 0.02, 0.3), verts=20)
    for z in (0.18, 0.34):
        cyl(f'obi{z}', 'towerB', 0.115, 0.02, (0, 0.02, z), verts=20)
    cyl('dai', 'tower', 0.2, 0.03, (0, 0.02, 0.52), verts=24)
    cyl('tesuri', 'towerB', 0.2, 0.05, (0, 0.02, 0.56), verts=24)
    cyl('ue', 'tower', 0.08, 0.1, (0, 0.02, 0.62), verts=16)
    box('iriguchi', 'kuroita', (0.06, 0.01, 0.09), (0, -0.09, 0.14))
    return view(0.32, 1.2)


def wakuwaku():
    """抹茶ミュージアム 和く和く：ベージュの四角い建物、緑の葉の印の看板（字は描かない）、窓とガラスの入口、白い格子"""
    ground('michi')
    box('tate', 'beige', (0.66, 0.4, 0.4), (0, 0.08, 0.2))
    box('kanban', 'cream', (0.36, 0.01, 0.1), (-0.06, -0.125, 0.32))
    sphere('ha', 'matchaG', 0.03, (-0.2, -0.13, 0.32), (1, 0.4, 1))
    box('mado', 'redB', (0.12, 0.01, 0.08), (-0.1, -0.125, 0.18))
    box('mado2', 'kawaraG', (0.08, 0.01, 0.08), (0.04, -0.125, 0.18))
    box('glass', 'glassB', (0.14, 0.01, 0.18), (0.22, -0.125, 0.09))
    lattice('w', 'shikkui', 0.22, -0.13, 0.16, 0.16, 0.0, 6)
    box('kuro', 'kuroita', (0.2, 0.36, 0.1), (0.26, 0.1, 0.45))
    return view(0.24)


def jissoji():
    """実相寺：大きな黒ずんだ木の本堂（深い屋根、正面の格子と縁）、まわりの松"""
    ground('jari')
    box('kidan', 'kidan', (0.66, 0.4, 0.04), (0, 0.06, 0.02))
    box('kabe', 'kijiD', (0.54, 0.3, 0.18), (0, 0.06, 0.13))
    lattice('m', 'koshi2', 0, -0.092, 0.5, 0.14, 0.05, 10)
    box('en', 'kijiD', (0.6, 0.06, 0.02), (0, -0.12, 0.05))
    fence('r', 'kijiD', -0.3, 0.3, -0.15, 0.04, 12)
    roof('yane', 'kawaraG', 0.84, 0.56, 0.32, 0.22, 0.4, 0, 0.06)
    box('mune', 'munaG', (0.36, 0.04, 0.04), (0, 0.06, 0.55))
    pine('pL', -0.42, -0.28, 1.2)   # 左の松は手前へ（奥だと、ななめから見て絵のふちで切れる）
    pine('pR', 0.4, 0.2, 1.4)
    return view(0.26)


def choenji():
    """長圓寺：芝の石段の上の山門（灰色の屋根）、左右にのびる白い土塀、うしろの森"""
    ground('shibaG')
    for i in range(6):
        box(f'dan{i}', 'kusa' if i % 2 else 'shibaG', (0.9, 0.06, 0.03 * (i + 1)), (0, -0.36 + i * 0.06, 0.015 * (i + 1)))
    box('dodai', 'shibaG', (0.9, 0.3, 0.18), (0, 0.16, 0.09))
    for x in (-0.3, 0.3):
        box(f'dobei{x}', 'shikkui', (0.36, 0.05, 0.1), (x, 0.1, 0.23))
        gable(f'dobeiY{x}', 'kawaraG', 0.38, 0.08, 0.03, 0.28, x, 0.1)
    box('mon', 'kijiD', (0.18, 0.1, 0.16), (0, 0.1, 0.26))
    box('monD', 'kuroita', (0.1, 0.01, 0.12), (0, 0.049, 0.24))
    roof('monY', 'kawaraG', 0.3, 0.2, 0.08, 0.34, 0.6, 0, 0.1)
    for x in (-0.28, -0.08, 0.12, 0.32):   # うしろの森は少し右へ寄せる（左の木がふちで切れないように）
        tree(f'm{x}', x, 0.3, 1.5, 'sugi')
    return view(0.24)


def glass_museum():
    """三河工芸ガラス美術館：白い四角い四階建て、青い細長い窓、一階は色ガラスのショーウィンドウ"""
    ground('michi')
    box('tate', 'modern', (0.5, 0.36, 0.56), (0, 0.06, 0.28))
    for f in range(3):
        for x in (-0.12, 0.02, 0.14):
            box(f'mado{f}{x}', 'glassB', (0.03, 0.01, 0.08), (x, -0.121, 0.24 + f * 0.1))
    box('ichi', 'kawaraG', (0.5, 0.01, 0.12), (0, -0.121, 0.08))
    for i, m in enumerate(('redB', 'kamomeY', 'parkB', 'chaRL', 'sakuraP')):
        box(f'iro{i}', m, (0.03, 0.012, 0.05), (-0.18 + i * 0.09, -0.124, 0.08))
    box('hisashi', 'modern', (0.54, 0.06, 0.02), (0, -0.14, 0.15))
    return view(0.28)


def yojuji():
    """養寿寺：小さな灰色の屋根のお堂（茶色い戸）、右に鐘つき堂"""
    ground('jari')
    box('kabe', 'kiji', (0.42, 0.3, 0.16), (-0.12, 0.08, 0.08))
    box('to', 'kijiD', (0.2, 0.01, 0.11), (-0.12, -0.071, 0.06))
    irimoya('yane', 'kawaraG', 0.56, 0.42, 0.18, 0.16, -0.12, 0.08)
    for x, y in ((0.22, -0.04), (0.38, -0.04), (0.22, 0.1), (0.38, 0.1)):
        box(f'sh{x}{y}', 'kijiD', (0.02, 0.02, 0.2), (x, y, 0.1))
    cyl('kane', 'doban2', 0.04, 0.08, (0.3, 0.03, 0.16), verts=12)
    roof('shY', 'kawaraG', 0.26, 0.24, 0.08, 0.2, 0.6, 0.3, 0.03)
    return view(0.2)


def terazu_hachiman():
    """寺津八幡社：緑の銅板の唐破風（反った）屋根、こい茶の社殿に金の飾り、手前に石段"""
    ground('jari')
    steps('a', 'stoneR', 0, -0.34, 0.5, 3, 0.05, 0.02)
    box('kidan', 'kidan', (0.6, 0.34, 0.06), (0, 0.08, 0.03))
    box('kabe', 'kijiD', (0.48, 0.26, 0.18), (0, 0.08, 0.15))
    box('to', 'koshi2', (0.3, 0.01, 0.12), (0, -0.051, 0.13))
    box('kin', 'kin', (0.08, 0.012, 0.03), (0, -0.054, 0.21))
    irimoya('yane', 'doban2', 0.68, 0.46, 0.24, 0.24, 0, 0.08)
    cyl('karahafu', 'doban2', 0.09, 0.3, (0, -0.1, 0.27), (0, math.pi / 2, 0), 16)
    box('kinM', 'kin', (0.06, 0.04, 0.05), (0, 0.08, 0.49))
    return view(0.24)


def michinoeki_okanoyama():
    """道の駅にしお岡ノ山：平たい屋根の低い建物（白とガラス）、手前の駐車場（白線と青い区画）"""
    box('chusha', 'asphalt2', (1.0, 0.5, 0.01), (0, -0.16, 0.005))
    for i in range(5):
        box(f'sen{i}', 'line2', (0.01, 0.16, 0.012), (-0.06 + i * 0.1, -0.22, 0.008))
    box('ao', 'parkB', (0.26, 0.08, 0.012), (-0.28, -0.22, 0.008))
    box('tate', 'modern', (0.84, 0.26, 0.16), (0, 0.18, 0.08))
    for i in range(5):
        box(f'mado{i}', 'glassB', (0.1, 0.01, 0.08), (-0.3 + i * 0.15, 0.049, 0.08))
    box('yane', 'kawaraG', (0.9, 0.32, 0.03), (0, 0.18, 0.175))
    box('kuro', 'kuroita', (0.3, 0.24, 0.06), (0.24, 0.2, 0.22))
    return view(0.16)


def nishio_cityhall():
    """西尾市役所：ガラスの多い高い庁舎と、低い棟。手前に木と植えこみ"""
    ground('michi')
    office('a', -0.14, 0.12, 0.36, 0.28, 0.5, 6, 'modern', 'glassC')
    office('b', 0.2, 0.06, 0.26, 0.24, 0.62, 7, 'modernB', 'glassC')
    box('hei', 'shibaG', (0.9, 0.06, 0.03), (0, -0.2, 0.015))
    for x in (-0.3, 0.0, 0.3):
        tree(f't{x}', x, -0.24, 0.9)
    return view(0.3, 1.18)


def hirabara_taki():
    """平原の滝：灰色の大きな岩のかべ（苔）を、白い水が細く落ちる。下に滝つぼ"""
    ground('kusa')
    sphere('iwa', 'iwaG', 0.42, (0, 0.12, 0.26), (1.1, 0.7, 0.75))
    for i, (x, z) in enumerate(((-0.2, 0.34), (0.18, 0.4), (-0.06, 0.18), (0.26, 0.22))):
        sphere(f'koke{i}', 'chaR', 0.05, (x, -0.16, z), (1.2, 0.4, 0.8))
    for i, (x, z) in enumerate(((-0.28, 0.2), (0.3, 0.32), (0.1, 0.48))):
        sphere(f'kage{i}', 'iwaGD', 0.06, (x, -0.17, z), (1.4, 0.4, 0.7))
    box('taki', 'taki', (0.03, 0.02, 0.52), (0.0, -0.18, 0.28))
    water('umiB', 0.4, 0.14, 0, -0.26)
    return view(0.28)


def kojuin():
    """紅樹院：灰色の瓦のお堂、手前に茶の木のうねが並ぶ茶畑"""
    ground('tsuchi')
    box('kabe', 'kijiD', (0.46, 0.26, 0.15), (0, 0.18, 0.085))
    lattice('k', 'koshi2', 0, 0.049, 0.4, 0.1, 0.02, 9)
    irimoya('yane', 'kawaraG', 0.62, 0.4, 0.2, 0.16, 0, 0.18)
    for j in range(3):
        y = -0.32 + j * 0.13
        cyl(f'une{j}', 'chaR' if j % 2 else 'cha', 0.05, 0.86, (0, y, 0.035), (0, math.pi / 2, 0), 12)
        box(f'uneT{j}', 'chaRL', (0.86, 0.04, 0.02), (0, y, 0.08))
    return view(0.18)


# ---------- 一色 ----------
def isshiki_sakana():
    """一色さかな広場：横長の店の建物、上に赤と白の看板（字は描かない）、色のついたのぼり、ガラスの入口"""
    box('michi', 'michi', (1.0, 0.8, 0.02), (0, 0, 0))
    box('tate', 'kawaraG', (0.78, 0.32, 0.22), (0, 0.1, 0.11))
    box('kanban', 'shikkui', (0.6, 0.02, 0.1), (0, -0.065, 0.27))
    box('kanbanR', 'redB', (0.08, 0.022, 0.07), (-0.24, -0.068, 0.27))
    box('kanban2', 'kawaraG', (0.78, 0.3, 0.1), (0, 0.11, 0.27))
    box('hisashi', 'shikkui', (0.6, 0.08, 0.02), (0, -0.09, 0.16))
    box('glass', 'glassB', (0.5, 0.01, 0.12), (0, -0.061, 0.07))
    for x, m in ((-0.4, 'sakuraP'), (0.4, 'parkB')):
        cyl(f'pole{x}', 'shikkui', 0.008, 0.26, (x, -0.12, 0.13), verts=6)
        box(f'nobori{x}', m, (0.05, 0.01, 0.16), (x + 0.03, -0.12, 0.17))
    box('sen', 'line2', (0.9, 0.02, 0.012), (0, -0.3, 0.012))
    return view(0.2)


def isshiki_port():
    """一色港：白い船体に青い帯の佐久島行きの船、青い乗り場の橋、海"""
    water('umiB', 1.0, 0.8, 0, 0, 0.005)
    box('kyo', 'parkB', (0.04, 0.04, 0.42), (-0.36, 0.14, 0.21))
    box('kyoT', 'parkB', (0.4, 0.04, 0.04), (-0.18, 0.14, 0.42))
    box('sanbashi', 'stoneR', (0.3, 0.2, 0.06), (-0.34, -0.2, 0.03))
    hull = box('sentai', 'fune', (0.7, 0.2, 0.1), (0.08, 0.0, 0.07), bevel=0.03)
    box('ao', 'funeB', (0.72, 0.205, 0.025), (0.08, 0.0, 0.05))
    box('kyakushitsu', 'fune', (0.44, 0.16, 0.1), (0.06, 0.02, 0.17))
    box('madoF', 'mado', (0.4, 0.165, 0.03), (0.06, 0.02, 0.19))
    box('ue', 'fune', (0.2, 0.12, 0.06), (0.1, 0.02, 0.25))
    for i, m in enumerate(('redB', 'kamomeY', 'parkB', 'chaRL')):
        box(f'iro{i}', m, (0.03, 0.21, 0.02), (-0.12 + i * 0.03, 0.0, 0.08))
    return view(0.18)


def isshiki_suwa():
    """三河一色諏訪神社：横に長い木の拝殿（灰色の入母屋）、正面の格子、まわりの縁"""
    ground('jari')
    box('kidan', 'kidan', (0.7, 0.36, 0.05), (0, 0.06, 0.025))
    box('kabe', 'kiji', (0.6, 0.28, 0.16), (0, 0.06, 0.13))
    lattice('k', 'kijiD', 0, -0.081, 0.5, 0.12, 0.06, 12)
    box('en', 'kijiD', (0.66, 0.05, 0.02), (0, -0.11, 0.06))
    fence('r', 'kijiD', -0.32, 0.32, -0.13, 0.04, 14)
    irimoya('yane', 'kawaraG', 0.8, 0.5, 0.22, 0.21, 0, 0.06)
    box('mune', 'munaG', (0.34, 0.04, 0.04), (0, 0.06, 0.42))
    return view(0.22)


def ankyuji():
    """安休寺：黒い屋根の山門（太い柱、まん中に戸）、左右に白い土塀と黒い腰板、右に石の柱"""
    ground('jari')
    for x in (-0.33, 0.33):
        box(f'dobei{x}', 'shikkui', (0.3, 0.06, 0.16), (x, 0.04, 0.08))
        box(f'koshi{x}', 'kuroita', (0.302, 0.062, 0.05), (x, 0.04, 0.025))
        gable(f'dobeiY{x}', 'kawaraG', 0.32, 0.1, 0.04, 0.16, x, 0.04)
    for x in (-0.12, 0.12):
        box(f'hashira{x}', 'kuroita', (0.04, 0.04, 0.3), (x, 0.0, 0.15))
    box('to', 'kijiD', (0.18, 0.02, 0.16), (0, 0.02, 0.1))
    box('ran', 'kuroita', (0.28, 0.06, 0.04), (0, 0.0, 0.3))
    roof('yane', 'kawaraG', 0.46, 0.26, 0.14, 0.32, 0.5, 0, 0.0)
    box('sekichu', 'stoneR', (0.04, 0.04, 0.24), (0.4, -0.12, 0.12))
    return view(0.22)


def isshiki_manabi():
    """一色学びの館：茶色の円い塔と、白い柱の並ぶ低い建物、手前の青い案内板"""
    ground('michi')
    cyl('tou', 'renga2', 0.12, 0.5, (-0.02, 0.12, 0.25), verts=24)
    for z in (0.1, 0.22, 0.34):
        cyl(f'obi{z}', 'brickD', 0.122, 0.012, (-0.02, 0.12, z), verts=24)
    box('tate', 'shikkui', (0.8, 0.26, 0.14), (0, -0.02, 0.07))
    for i in range(9):
        box(f'hashira{i}', 'modern', (0.02, 0.02, 0.12), (-0.36 + i * 0.09, -0.155, 0.06))
    box('yane', 'kawaraG', (0.84, 0.3, 0.02), (0, -0.02, 0.145))
    sign_board('a', 0.36, -0.24, 0.06, 0.1, 0.05, 'parkB', 'shikkui')
    return view(0.22)


# ---------- 佐久島 ----------
def sakushima_port(white_x=-0.1):
    """佐久島の港：白い細長い灯台のような塔、黒い板張りの小屋、桟橋と海"""
    water('umiB', 1.0, 0.5, 0, -0.18, 0.005)
    box('sanbashi', 'sunaB', (1.0, 0.36, 0.03), (0, 0.18, 0.015))
    box('kuro', 'kuroita', (0.36, 0.24, 0.24), (0.2, 0.16, 0.12))
    gable('kuroY', 'kawaraG', 0.4, 0.28, 0.08, 0.24, 0.2, 0.16)
    box('kuroD', 'kidan', (0.08, 0.01, 0.1), (0.24, 0.039, 0.05))
    box('tou', 'shikkui', (0.08, 0.08, 0.5), (white_x, 0.06, 0.25))
    for i in range(5):
        box(f'mado{i}', 'kawaraG', (0.02, 0.01, 0.03), (white_x, 0.019, 0.12 + i * 0.08))
    box('fune', 'fune', (0.24, 0.08, 0.04), (-0.3, -0.2, 0.025), bevel=0.015)
    return view(0.24)


def sakushima_nishi():
    return sakushima_port(-0.12)


def sakushima_higashi():
    return sakushima_port(-0.02)


def suunji():
    """崇運寺：木のお堂（灰色の瓦、格子の戸）、手前の白い石の灯籠と桜"""
    ground('jari')
    box('kidan', 'kidan', (0.58, 0.34, 0.04), (0, 0.08, 0.02))
    box('kabe', 'kiji', (0.48, 0.26, 0.16), (0, 0.08, 0.12))
    lattice('k', 'kijiD', 0, -0.051, 0.4, 0.12, 0.04, 10)
    irimoya('yane', 'kawaraG', 0.64, 0.42, 0.22, 0.2, 0, 0.08)
    toro('a', 0.3, -0.2, 1.0)
    for i, (x, z) in enumerate(((-0.34, 0.12), (-0.3, 0.2))):
        sphere(f'sakura{i}', 'sakuraHa', 0.07, (x, -0.16, z))
    cyl('miki', 'miki', 0.015, 0.12, (-0.32, -0.16, 0.06), verts=8)
    return view(0.22)


def kamome_parking():
    """カモメの駐車場：海べの堤防に、木の棒にとまった白いカモメの像がずらりと並ぶ"""
    water('umiB', 1.0, 0.8, 0, 0, 0.005)
    box('teibou', 'stoneR', (0.2, 0.9, 0.05), (0, 0, 0.025), (0, 0, 0.0))
    for i in range(9):
        y = -0.38 + i * 0.095
        for k in (-1, 1):
            x = k * 0.07
            cyl(f'bo{i}{k}', 'pole2', 0.008, 0.16, (x, y, 0.12), verts=6)
            sphere(f'kamo{i}{k}', 'kamome', 0.025, (x, y, 0.21), (1.6, 0.8, 0.8))
            box(f'kuchi{i}{k}', 'kamomeY', (0.012, 0.01, 0.006), (x + k * 0.04, y, 0.21))
    return dict(target=(0, 0.0, 0.12), scale=1.1, el=30, az=-30, size=96)


def oura_beach():
    """大浦海水浴場：砂浜に木の見はり台（高い足の小屋）、うしろの緑の丘、手前の砂の道"""
    ground('sunaB')
    box('oka', 'kusa', (1.0, 0.3, 0.1), (0, 0.3, 0.05))
    for x in (-0.26, 0.34):   # 左の木は内へ（ふちで切れないように）
        tree(f't{x}', x, 0.28, 1.4)
    for x, y in ((-0.08, -0.04), (0.08, -0.04), (-0.08, 0.1), (0.08, 0.1)):
        box(f'ashi{x}{y}', 'kijiD', (0.025, 0.025, 0.34), (x, y, 0.17))
    box('yuka', 'kijiD', (0.24, 0.2, 0.02), (0, 0.03, 0.34))
    box('koya', 'kiji', (0.2, 0.16, 0.08), (0, 0.03, 0.39))
    roof('yane', 'kijiD', 0.28, 0.24, 0.06, 0.43, 0.5, 0, 0.03)
    box('michi', 'jari', (0.16, 0.3, 0.008), (0, -0.25, 0.012))
    return view(0.22)


def yatsurugi():
    """八劔神社・神明社：緑の銅板の屋根の社殿、白い柱、両わきの石の灯籠と白いのぼり、手前の石段"""
    ground('jari')
    steps('a', 'stoneR', 0, -0.34, 0.4, 3, 0.05, 0.02)
    box('kidan', 'kidan', (0.5, 0.32, 0.08), (0, 0.08, 0.04))
    box('kabe', 'kijiD', (0.38, 0.24, 0.16), (0, 0.08, 0.16))
    box('to', 'koshi2', (0.22, 0.01, 0.12), (0, -0.041, 0.15))
    irimoya('yane', 'doban2', 0.56, 0.42, 0.22, 0.24, 0, 0.08)
    for x in (-0.32, 0.32):
        toro(f't{x}', x, -0.12, 1.0)
        cyl(f'pole{x}', 'shikkui', 0.006, 0.3, (x * 0.8, -0.04, 0.15), verts=6)
        box(f'nobori{x}', 'shikkui', (0.04, 0.008, 0.18), (x * 0.8 + 0.025, -0.04, 0.2))
        box(f'noboriR{x}', 'sakuraP', (0.04, 0.009, 0.02), (x * 0.8 + 0.025, -0.04, 0.27))
    return view(0.22)


# ---------- 吉良 ----------
def kezoji():
    """華蔵寺：横長の大きな本堂（白い壁に黒い木組み、灰色の瓦）、手前の植えこみと石段"""
    ground('jari')
    box('kidan', 'kidan', (0.8, 0.36, 0.05), (0, 0.08, 0.025))
    box('kabe', 'shikkui', (0.7, 0.28, 0.18), (0, 0.08, 0.14))
    for i in range(8):
        box(f'kumi{i}', 'kijiD', (0.014, 0.01, 0.18), (-0.33 + i * 0.094, -0.061, 0.14))
    box('kumiH', 'kijiD', (0.7, 0.01, 0.014), (0, -0.061, 0.2))
    roof('yane', 'kawaraG', 0.86, 0.46, 0.2, 0.23, 0.55, 0, 0.08)
    for x in (-0.24, 0.24):
        tree(f'ue{x}', x, -0.2, 0.8)
    steps('a', 'stoneR', 0, -0.32, 0.2, 3, 0.04, 0.02)
    return view(0.22)


def kogane_zutsumi():
    """黄金堤：まっすぐな土手（上に松並木）、わきに白い道、字のない赤い案内板"""
    ground('shibaG')
    box('dote', 'kusa', (1.0, 0.24, 0.14), (0, 0.16, 0.07))
    for i in range(7):   # 松並木は左の1本がふちで切れないように、少し右から
        pine(f'p{i}', -0.34 + i * 0.13, 0.16, 1.0)
    box('michi', 'michi', (1.0, 0.12, 0.012), (0, -0.08, 0.012))
    fence('r', 'shikkui', -0.46, 0.46, -0.16, 0.04, 16)
    sign_board('a', -0.3, -0.24, 0.1, 0.06, 0.04, 'shikkui', 'kanbanR')
    cyl('ashi', 'kijiD', 0.006, 0.08, (-0.3, -0.24, 0.04), verts=6)
    return view(0.14)


def tojo_jo():
    """東条城跡：木の物見やぐら（四本の足と板の小屋、灰色の屋根）、まわりの木の柵と門"""
    ground('shibaG')
    for x, y in ((-0.06, 0.0), (0.12, 0.0), (-0.06, 0.16), (0.12, 0.16)):
        box(f'ashi{x}{y}', 'kijiD', (0.03, 0.03, 0.42), (x + 0.1, y, 0.21))
    for z in (0.14, 0.28):
        box(f'suji{z}', 'kijiD', (0.22, 0.015, 0.015), (0.13, 0.0, z), (0, 0.5, 0))
    box('koya', 'kiji', (0.26, 0.24, 0.12), (0.13, 0.08, 0.48))
    box('mado', 'kuroita', (0.18, 0.01, 0.04), (0.13, -0.041, 0.5))
    roof('yane', 'kawaraG', 0.34, 0.32, 0.1, 0.54, 0.4, 0.13, 0.08)
    box('mon', 'kijiD', (0.18, 0.04, 0.16), (-0.28, -0.04, 0.08))
    gable('monY', 'kawaraG', 0.24, 0.1, 0.06, 0.16, -0.28, -0.04)
    fence('a', 'kijiD', -0.48, 0.46, -0.22, 0.06, 20)
    return view(0.3, 1.18)


def gentokuji():
    """源徳寺：灰色の四角い建物（屋上に緑）、赤と白の縦の看板（字は描かない）、手前の小さな祠と赤い前かけの地蔵"""
    ground('michi')
    box('tate', 'kawaraG', (0.5, 0.3, 0.32), (-0.14, 0.12, 0.16))
    box('tate2', 'modernB', (0.2, 0.26, 0.4), (0.1, 0.14, 0.2))
    for f in range(3):
        box(f'mado{f}', 'glassB', (0.3, 0.01, 0.04), (-0.14, -0.031, 0.08 + f * 0.09))
    box('midori', 'gTree', (0.5, 0.3, 0.05), (-0.14, 0.12, 0.345))
    box('kanbanP', 'kanbanR', (0.12, 0.04, 0.34), (0.32, -0.1, 0.17))
    box('kanbanW', 'kanbanW2', (0.08, 0.042, 0.26), (0.32, -0.1, 0.17))
    box('hokora', 'stoneR', (0.16, 0.1, 0.1), (-0.06, -0.22, 0.05))
    sphere('jizo', 'stoneR', 0.035, (-0.22, -0.24, 0.07))
    box('maekake', 'kanbanR', (0.05, 0.02, 0.03), (-0.22, -0.27, 0.05))
    return view(0.22)


def ozaki_shiro():
    """尾﨑士郎記念館：白い壁の建物（灰色の屋根、こい茶の入口と窓）、右に高い木"""
    ground('jari')
    box('kabe', 'shikkui', (0.6, 0.32, 0.2), (-0.06, 0.08, 0.1))
    box('iriguchi', 'kuroita', (0.1, 0.01, 0.14), (-0.1, -0.081, 0.07))
    box('mado', 'kiji', (0.1, 0.01, 0.06), (0.1, -0.081, 0.12))
    gable('yane', 'kawaraG', 0.7, 0.42, 0.16, 0.2, -0.06, 0.08)
    box('tsuma', 'shikkui', (0.5, 0.01, 0.0), (-0.06, -0.08, 0.2))
    cyl('kimiki', 'miki', 0.02, 0.5, (0.36, -0.02, 0.25), verts=8)
    sphere('kiha', 'gTree', 0.08, (0.36, -0.02, 0.5), (0.8, 0.8, 1.2))
    return view(0.24)


# ---------- 2回目：吉良・幡豆・西尾の町なかの25か所 ----------
pa.MATS.update({
    'enden': '#c8bca4', 'endenD': '#a89c84', 'shio': '#fafaf6', 'mizuiro': '#9cc4d8', 'seaL': '#4ab8c8',
    'paraR': '#e04a3a', 'paraY': '#f2c230', 'paraB': '#3a7fd0', 'kofunG': '#8a9e3e', 'kofunD': '#6e8230', 'shime': '#d8c890',
    'kabochaG': '#3f5f2e', 'kabochaY': '#e8a030', 'pengin': '#262a30', 'penginW': '#f4f4f0', 'penginY': '#f2b030',
    'wata': '#fafaf4', 'wataG': '#4f8a3a', 'uma': '#7a4a2a', 'umaR': '#c8302a', 'umaK': '#e8b830', 'shiiG': '#3a6a30',
    'shiiM': '#5a4430', 'maroon': '#5a2a2a', 'jizo': '#a8a49a', 'hadaK': '#f0c8a0',
    'hiseki': '#a8a49a',   # 碑の石（灯籠の 'toro' は夜に明かりがつくので使わない）
    'sakuraHa': '#f0b8c8', 'sakuraHaL': '#f4c0d0',   # 桜の木の花（四季の絵で季節の色に変わる。看板やのぼりのピンクは sakuraP）
})


def train(n, x, y, z=0.0, cars=2, mat='meitetsu', l=0.34):
    """名鉄の赤い電車（白い帯・黒い窓）。cars 両を x の向きに"""
    for c in range(cars):
        cx = x + (c - (cars - 1) / 2) * (l + 0.02)
        box(f'tr{n}{c}', mat, (l, 0.13, 0.15), (cx, y, z + 0.09), bevel=0.02)
        box(f'tro{n}{c}', 'obi', (l + 0.004, 0.134, 0.014), (cx, y, z + 0.055))
        windows(f'trw{n}{c}', 'mado', [cx - l / 2 + (i + 0.5) * l / 4 for i in range(4)], y - 0.066, z + 0.115, l / 4 * 0.6, 0.045)


def parasol(n, x, y, mat, h=0.16):
    cyl(f'pp{n}', 'shikkui', 0.006, h, (x, y, h / 2), verts=6)
    cyl(f'pk{n}', mat, 0.07, 0.04, (x, y, h), verts=8, r2=0.004)


def jizo(n, x, y, s=1.0):
    """お地蔵さま（灰色の石の姿に赤い前かけ）"""
    box(f'jzd{n}', 'kidan', (0.07 * s, 0.06 * s, 0.03 * s), (x, y, 0.015 * s))
    sphere(f'jzb{n}', 'jizo', 0.032 * s, (x, y, 0.07 * s), (1, 0.8, 1.3))
    sphere(f'jzh{n}', 'jizo', 0.024 * s, (x, y, 0.13 * s))
    sphere(f'jzm{n}', 'umaR', 0.03 * s, (x, y - 0.006 * s, 0.085 * s), (1.05, 0.7, 0.55))


def shimenawa(n, x, y, z, w, s=1.0):
    """しめなわ（わらの太いなわと白い紙垂）"""
    cyl(f'snw{n}', 'shime', 0.014 * s, w, (x, y, z), (0, math.pi / 2, 0), 8)
    for i in range(3):
        box(f'sd{n}{i}', 'shikkui', (0.014 * s, 0.006, 0.04 * s), (x - w / 3 + i * w / 3, y - 0.004, z - 0.03 * s))


def kira_yoshida():
    """名鉄 吉良吉田駅：白い駅舎に水色の屋根のふち、青い戸と窓。うしろのホームに赤い電車、前の道"""
    ground('asphalt')
    box('home', 'home', (0.96, 0.18, 0.06), (0, 0.27, 0.03))
    train('t', 0.14, 0.27, 0.06, 2, l=0.28)   # 奥の左は、ななめから見ると絵のふちを越えるので右へ寄せる
    box('eki', 'shikkui', (0.56, 0.24, 0.2), (-0.1, 0.0, 0.1))
    box('fuchi', 'mizuiro', (0.6, 0.28, 0.04), (-0.1, 0.0, 0.22))
    box('fuchi2', 'mizuiro', (0.62, 0.06, 0.02), (-0.1, -0.15, 0.17), (math.radians(-20), 0, 0))
    for x in (-0.26, -0.18):
        box(f'to{x}', 'parkB', (0.06, 0.01, 0.12), (x, -0.121, 0.07))
    windows('w', 'glassB', [-0.04, 0.06], -0.121, 0.11, 0.07, 0.07)
    box('tou', 'shikkui', (0.12, 0.12, 0.3), (0.26, -0.02, 0.15))
    box('touA', 'paraY', (0.03, 0.01, 0.1), (0.26, -0.081, 0.2))
    box('post', 'post', (0.03, 0.03, 0.08), (0.12, -0.18, 0.04))
    box('sen', 'line2', (0.96, 0.01, 0.004), (0, -0.3, 0.012))
    return view(0.2)


def shohoji_kofun():
    """正法寺古墳：草と木におおわれた大きな前方後円墳（まるい後円部と、台形の前方部）"""
    ground('kusa')
    sphere('enbu', 'kofunG', 0.26, (0.16, 0.12, 0.0), (1, 1, 0.62))
    gn.mesh('hobu', 'kofunG', [(-0.42, -0.14, 0.0), (-0.42, 0.3, 0.0), (0.08, 0.24, 0.0), (0.08, -0.0, 0.0),
                               (-0.36, -0.08, 0.1), (-0.36, 0.24, 0.1), (0.04, 0.18, 0.12), (0.04, 0.06, 0.12)],
            [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)])
    for i, (x, y, z) in enumerate(((0.12, 0.14, 0.15), (0.24, 0.1, 0.12), (-0.18, 0.1, 0.1), (0.02, 0.2, 0.12))):
        cyl(f'mk{i}', 'miki', 0.012, 0.14, (x, y, z + 0.07), verts=6)
        sphere(f'kz{i}', 'kofunD', 0.07, (x, y, z + 0.15), (1, 1, 0.7))
    box('michi', 'jari', (0.12, 0.2, 0.008), (0.3, -0.26, 0.012))
    return view(0.14)


def shio_no_sato():
    """吉良饗庭塩の里：塩田（ならした砂の上の すじ）と、柱だけの屋根の小屋・黒い板張りの小屋、木の柄の道具と塩の山"""
    ground('enden')
    for i in range(7):
        box(f'suji{i}', 'endenD', (0.9, 0.012, 0.006), (0, -0.34 + i * 0.07, 0.012))
    for x, y in ((-0.38, 0.12), (-0.06, 0.12), (-0.38, 0.32), (-0.06, 0.32)):
        box(f'ha{x}{y}', 'kijiD', (0.02, 0.02, 0.18), (x, y, 0.09))
    gable('koyaY', 'kawaraG', 0.4, 0.28, 0.08, 0.18, -0.22, 0.22)
    box('kuro', 'kuroita', (0.28, 0.2, 0.18), (0.22, 0.24, 0.09))
    gable('kuroY', 'kawaraG', 0.32, 0.24, 0.07, 0.18, 0.22, 0.24)
    box('e', 'kiji', (0.36, 0.014, 0.014), (0.06, -0.14, 0.02), (0, 0, math.radians(-35)))
    box('eH', 'kijiD', (0.014, 0.12, 0.02), (0.2, -0.24, 0.016), (0, 0, math.radians(-35)))
    for i, x in enumerate((-0.3, -0.18)):
        cyl(f'shio{i}', 'shio', 0.05, 0.06, (x, -0.06, 0.04), verts=10, r2=0.006)
    return view(0.18)


def kira_onsen():
    """吉良温泉：三河湾の岸に白い宿の建物（高さちがい）、うしろの緑の山、手前の海"""
    water('umiB', 1.0, 0.3, 0, -0.25, 0.008)
    box('kishi', 'kidan', (1.0, 0.5, 0.03), (0, 0.15, 0.015))
    sphere('yama', 'kusa', 0.5, (0.06, 0.4, 0.0), (0.82, 0.4, 0.6))
    office('h1', -0.16, 0.12, 0.3, 0.2, 0.42, 6, 'shikkui', 'glassB', 0.03)
    office('h2', 0.16, 0.14, 0.22, 0.18, 0.28, 4, 'cream', 'glassB', 0.03)
    box('ie', 'shikkui', (0.12, 0.12, 0.1), (0.36, 0.02, 0.08))
    roof('ieY', 'yaneR', 0.16, 0.16, 0.05, 0.13, 0.3, 0.36, 0.02)
    tree('t', -0.36, -0.04, 1.0)
    return view(0.24)


def kira_waikiki():
    """吉良ワイキキビーチ：青緑の海と白い波、砂浜に赤・黄・青のパラソル、うしろに白い建物"""
    water('seaL', 1.0, 0.36, 0, -0.22, 0.008)
    for i in range(3):
        box(f'nami{i}', 'line2', (0.24, 0.02, 0.004), (-0.3 + i * 0.3, -0.12 + (i % 2) * -0.1, 0.013))
    box('suna', 'sunaB', (1.0, 0.44, 0.02), (0, 0.18, 0.01))
    for i, (x, y, m) in enumerate(((-0.28, 0.04, 'paraR'), (-0.04, 0.08, 'paraY'), (0.2, 0.02, 'paraB'), (0.36, 0.1, 'paraR'))):
        parasol(i, x, y, m)
    office('b1', -0.2, 0.32, 0.22, 0.12, 0.26, 4, 'shikkui', 'glassB', 0.02)
    office('b2', 0.12, 0.34, 0.18, 0.1, 0.18, 3, 'shikkui', 'glassB', 0.02)
    tree('t', 0.34, 0.32, 0.9)
    return view(0.16)


def hazu_jinja():
    """幡頭神社：石の鳥居から、森の中を長い石段が社殿へのぼる"""
    ground('jari')
    box('oka', 'kusa', (0.84, 0.36, 0.26), (0.04, 0.24, 0.13))
    steps('s', 'stoneR', 0, -0.2, 0.16, 9, 0.04, 0.03)
    hall('h', 0, 0.26, 0.3, 0.16, 0.1, 'kiji', 'kawaraG', z=0.27, kidan=False)
    for x, y in ((-0.26, 0.2), (0.3, 0.2), (0.2, 0.38)):   # 社殿が見えるように、木は左右と右奥に
        tree(f'm{x}', x, y, 1.1, 'sugi')
        for o in bpy.context.scene.objects:
            if o.name.startswith((f'mikim{x}', f'ham{x}')):
                o.location.z += 0.26
    torii('t', 0, -0.28, 1.2, 'stoneR')
    box('nobori', 'shikkui', (0.008, 0.008, 0.36), (0.22, -0.28, 0.18))
    box('noboriH', 'shikkui', (0.04, 0.004, 0.22), (0.24, -0.28, 0.22))
    return view(0.3, 1.26)


def nishi_hazu():
    """名鉄 西幡豆駅：ベージュの小さな木の駅舎（こげ茶の屋根、白い横板）、青と白の看板、赤いポスト"""
    ground('asphalt')
    box('eki', 'beige', (0.56, 0.26, 0.2), (-0.04, 0.06, 0.1))
    for i in range(5):
        box(f'ita{i}', 'cream', (0.56, 0.004, 0.006), (-0.04, -0.072, 0.03 + i * 0.035))
    roof('yane', 'kijiD', 0.68, 0.36, 0.1, 0.2, 0.6, -0.04, 0.06)
    box('to', 'glassB', (0.12, 0.01, 0.13), (-0.04, -0.074, 0.065))
    windows('w', 'glassB', [-0.22, 0.14], -0.074, 0.11, 0.07, 0.06)
    sign_board('k', 0.06, -0.08, 0.17, 0.14, 0.03, 'kanbanW2', 'parkB')
    box('post', 'post', (0.04, 0.04, 0.09), (0.32, -0.16, 0.045))
    sphere('ueki', 'gTree', 0.05, (-0.36, -0.12, 0.05))
    return view(0.2)


def terabe_jo():
    """寺部城址：公園の中に立つ、背の高い黒っぽい石の碑（台の上）、うしろの木立"""
    ground('shibaG')
    box('dai', 'kidan', (0.22, 0.18, 0.04), (0, 0.0, 0.02))
    box('dai2', 'stoneR', (0.14, 0.11, 0.03), (0, 0.0, 0.055))
    box('hi', 'iwaGD', (0.08, 0.06, 0.42), (0, 0.0, 0.28))
    cyl('hiT', 'iwaGD', 0.04, 0.03, (0, 0.0, 0.5), (0, 0, math.pi / 4), 4, r2=0.01)
    for x, y in ((-0.26, 0.24), (0.32, 0.24), (0.12, 0.34)):
        tree(f't{x}', x, y, 1.5, 'sugi')
    for x in (-0.3, 0.3):
        sphere(f'ueki{x}', 'gTree', 0.07, (x, -0.16, 0.04), (1.4, 1, 0.6))
    ishidatami('s', 0, -0.38, -0.1, 0.12)
    return view(0.24)


def higashi_hazu():
    """名鉄 東幡豆駅：白い駅舎に赤い屋根の帯、窓と戸、緑と白の看板、赤いポスト"""
    ground('asphalt')
    box('eki', 'shikkui', (0.6, 0.26, 0.2), (-0.02, 0.06, 0.1))
    box('obi', 'yaneR', (0.64, 0.3, 0.04), (-0.02, 0.06, 0.22))
    box('obiF', 'yaneR', (0.66, 0.05, 0.02), (-0.02, -0.1, 0.18), (math.radians(-22), 0, 0))
    windows('w', 'glassB', [-0.24, -0.12, 0.14, 0.24], -0.074, 0.12, 0.07, 0.07)
    box('to', 'kuro', (0.08, 0.01, 0.14), (0.01, -0.074, 0.07))
    sign_board('k', 0.01, -0.08, 0.17, 0.12, 0.03, 'kanbanW2', 'matchaG')
    box('post', 'post', (0.04, 0.04, 0.09), (0.34, -0.16, 0.045))
    box('sen', 'line2', (0.96, 0.01, 0.004), (0, -0.3, 0.012))
    return view(0.2)


def myozenji():
    """妙善寺（かぼちゃ寺）：こげ茶の木のお堂（大きな戸口の奥に金色）、灰色の瓦、左の木、手前に かぼちゃ"""
    ground('jari')
    box('kidan', 'kidan', (0.56, 0.36, 0.05), (0, 0.06, 0.025))
    box('kabe', 'kijiD', (0.48, 0.28, 0.18), (0, 0.06, 0.14))
    box('iri', 'kuro', (0.2, 0.01, 0.14), (0, -0.081, 0.12))
    box('kin', 'kin', (0.08, 0.01, 0.06), (0, -0.083, 0.12))
    irimoya('yane', 'kawaraG', 0.66, 0.46, 0.24, 0.23, 0, 0.06)
    tree('t', -0.34, 0.06, 1.6)
    box('kabe2', 'shikkui', (0.12, 0.2, 0.14), (0.36, 0.1, 0.07))
    for i, (x, y) in enumerate(((-0.12, -0.26), (0.02, -0.28), (0.16, -0.25))):
        sphere(f'kb{i}', 'kabochaG' if i != 1 else 'kabochaY', 0.045, (x, y, 0.03), (1.2, 1.2, 0.7))
        cyl(f'kbh{i}', 'kijiD', 0.006, 0.02, (x, y, 0.065), verts=6)
    ishidatami('s', 0, -0.38, -0.12, 0.12)
    return view(0.22)


def kodomonokuni_st():
    """名鉄 こどもの国駅：灰色のコンクリートの高いホームと駅舎、色の帯の看板、階段、うしろに赤い電車"""
    ground('asphalt')
    box('home', 'concrete', (0.96, 0.22, 0.18), (0, 0.24, 0.09))
    train('t', 0.12, 0.26, 0.18, 2, l=0.28)
    box('eki', 'concrete', (0.4, 0.18, 0.2), (-0.14, -0.02, 0.1))
    box('kb', 'kanbanW2', (0.2, 0.01, 0.05), (-0.14, -0.112, 0.16))
    for i, m in enumerate(('paraR', 'paraY', 'paraB')):
        box(f'kbc{i}', m, (0.04, 0.012, 0.03), (-0.2 + i * 0.05, -0.114, 0.16))
    box('to', 'glassB', (0.1, 0.01, 0.1), (-0.14, -0.112, 0.05))
    steps('k', 'concrete', 0.22, -0.12, 0.12, 6, 0.04, 0.03)
    sphere('ueki', 'gTree', 0.05, (-0.38, -0.14, 0.05))
    for i in range(3):
        box(f'sen{i}', 'line2', (0.08, 0.01, 0.004), (-0.3 + i * 0.2, -0.32, 0.012))
    return view(0.2)


def aichi_kodomo():
    """愛知こどもの国：白い汽車（えんとつ・黒い窓）と、子どもが乗る白い客車、線路、うしろの緑の丘"""
    ground('shibaG')
    sphere('oka', 'kusa', 0.5, (0.08, 0.4, 0.0), (0.8, 0.36, 0.5))
    for y in (-0.08, 0.02):
        box(f'rail{y}', 'rail', (1.0, 0.012, 0.012), (0, y, 0.016))
    box('makuragi', 'senro', (1.0, 0.14, 0.006), (0, -0.03, 0.012))
    box('kama', 'shikkui', (0.16, 0.1, 0.14), (0.3, -0.03, 0.1))
    cyl('boira', 'shikkui', 0.05, 0.16, (0.18, -0.03, 0.09), (0, math.pi / 2, 0), 12)
    cyl('entotsu', 'kuro', 0.016, 0.07, (0.14, -0.03, 0.17), verts=8)
    box('kmado', 'mado', (0.08, 0.01, 0.05), (0.3, -0.081, 0.13))
    box('kyane', 'kuro', (0.18, 0.12, 0.012), (0.3, -0.03, 0.175))
    for c, cx in enumerate((-0.04, -0.3)):
        box(f'kyaku{c}', 'shikkui', (0.22, 0.1, 0.08), (cx, -0.03, 0.07))
        box(f'kyY{c}', 'paraR' if c else 'paraB', (0.24, 0.12, 0.012), (cx, -0.03, 0.17))
        for k in (-1, 1):
            box(f'kyH{c}{k}', 'shikkui', (0.01, 0.01, 0.06), (cx + k * 0.1, -0.075, 0.14))
        for i, m in enumerate(('paraY', 'hadaK', 'paraR')):
            sphere(f'ko{c}{i}', m, 0.018, (cx - 0.06 + i * 0.06, -0.03, 0.125))
    for k in range(5):
        cyl(f'sh{k}', 'kuro', 0.022, 0.01, (0.3 - k * 0.13, -0.085, 0.03), (math.pi / 2, 0, 0), 10)
    tree('t', 0.34, 0.26, 1.2)
    return view(0.14)


def toba_shinmei():
    """鳥羽神明社：石段の上の社殿（灰色の屋根、白い幕に黒い四角の紋）、両わきの白いのぼり"""
    ground('jari')
    steps('s', 'stoneR', 0, -0.22, 0.3, 4, 0.04, 0.025)
    box('dan', 'kidan', (0.62, 0.3, 0.1), (0, 0.12, 0.05))
    box('kabe', 'kiji', (0.46, 0.22, 0.16), (0, 0.12, 0.18))
    box('maku', 'shikkui', (0.42, 0.01, 0.07), (0, 0.009, 0.21))
    for x in (-0.12, 0, 0.12):
        box(f'mon{x}', 'kuro', (0.04, 0.012, 0.035), (x, 0.007, 0.21))
    irimoya('yane', 'kawaraG', 0.62, 0.38, 0.2, 0.26, 0, 0.12)
    for x in (-0.4, 0.4):
        box(f'nb{x}', 'kijiD', (0.008, 0.008, 0.4), (x, -0.06, 0.2))
        box(f'nbH{x}', 'shikkui', (0.05, 0.004, 0.26), (x + 0.03, -0.06, 0.24))
    return view(0.24)


def antaiji():
    """安泰寺：白い壁に黒い木組みのお堂（三角の妻に飾り）、手前に柵でかこった古い松の根、紫の花、うしろの木"""
    ground('jari')
    box('kabe', 'shikkui', (0.5, 0.28, 0.2), (0, 0.12, 0.1))
    for x in (-0.25, -0.08, 0.08, 0.25):
        box(f'kumi{x}', 'kijiD', (0.016, 0.01, 0.2), (x, -0.021, 0.1))
    box('kumiH', 'kijiD', (0.5, 0.01, 0.016), (0, -0.021, 0.12))
    gable_y('yane', 'kawaraG', 0.62, 0.38, 0.18, 0.2, 0, 0.12)
    gable_y('tsuma', 'kiji', 0.4, 0.3, 0.1, 0.2, 0, 0.1)
    tree('t1', 0.32, 0.3, 1.6, 'sugi')
    tree('t2', -0.22, 0.32, 1.3, 'sugi')
    cyl('ne', 'miki', 0.05, 0.08, (-0.12, -0.2, 0.04), verts=10, r2=0.03)
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        box(f'neb{i}', 'miki', (0.1, 0.02, 0.02), (-0.12 + math.cos(a) * 0.06, -0.2 + math.sin(a) * 0.06, 0.015), (0, 0, a))
    fence('f', 'kijiD', -0.26, 0.02, -0.32, 0.05, 6)
    for i, x in enumerate((0.1, 0.18, 0.26, 0.34)):
        sphere(f'hana{i}', 'ajisaiP', 0.03, (x, -0.26, 0.03))
    return view(0.22)


def fukusenji():
    """福泉寺：こげ茶の木のお堂（大きな戸、灰色の瓦）、両わきの石灯籠、石段、右に白い塀、手前に文学碑"""
    ground('jari')
    hall('h', 0, 0.08, 0.44, 0.26, 0.16, 'kijiD', 'kawaraG', z=0.06)
    box('to', 'kiji', (0.18, 0.01, 0.12), (0, -0.054, 0.12))
    for x in (-0.32, 0.32):
        toro(f'r{x}', x, -0.16, 1.1)
    steps('s', 'stoneR', 0, -0.2, 0.2, 2, 0.04, 0.03)
    box('hei', 'shikkui', (0.08, 0.36, 0.16), (0.44, 0.1, 0.08))
    box('hi', 'stoneR', (0.08, 0.04, 0.12), (-0.2, -0.3, 0.06), bevel=0.01)
    return view(0.24)


def genkuin():
    """源空院：白壁に木組みのお堂（茶色の戸、灰色の瓦）、左に赤い板、右に枝垂れ桜の古木"""
    ground('jari')
    box('kabe', 'shikkui', (0.46, 0.28, 0.18), (-0.06, 0.1, 0.09))
    for x in (-0.29, -0.13, 0.01, 0.17):
        box(f'kumi{x}', 'kijiD', (0.014, 0.01, 0.18), (x, -0.041, 0.09))
    box('to', 'kiji', (0.14, 0.012, 0.12), (-0.06, -0.042, 0.06))
    irimoya('yane', 'kawaraG', 0.6, 0.42, 0.22, 0.18, -0.06, 0.1)
    box('akaita', 'kanbanR', (0.03, 0.01, 0.16), (-0.36, -0.1, 0.08))
    cyl('miki', 'miki', 0.03, 0.26, (0.3, -0.1, 0.13), verts=8)
    for i in range(8):
        a = i * math.pi / 4
        sphere(f'shidare{i}', 'sakuraHaL' if i % 2 else 'sakuraHa', 0.06, (0.3 + math.cos(a) * 0.09, -0.1 + math.sin(a) * 0.07, 0.17), (0.7, 0.7, 1.6))
    sphere('shT', 'sakuraHa', 0.1, (0.3, -0.1, 0.27), (1, 1, 0.6))
    ishidatami('s', -0.06, -0.38, -0.06, 0.12)
    return view(0.22)


def kasuya_tei():
    """旧糟谷邸：黒い板張りと白い壁の長屋門（まん中に門の口）、奥の主屋の屋根、右に枝を広げた大きな木、白い案内板"""
    ground('jari')
    irimoya('omoya', 'kawaraG', 0.56, 0.3, 0.2, 0.18, -0.04, 0.26)
    box('omoyaK', 'shikkui', (0.48, 0.24, 0.18), (-0.04, 0.26, 0.09))
    box('nagaya', 'kuroita', (0.66, 0.18, 0.12), (-0.06, -0.02, 0.06))
    box('nagayaU', 'shikkui', (0.66, 0.18, 0.06), (-0.06, -0.02, 0.15))
    box('mon', 'kuro', (0.12, 0.01, 0.15), (-0.06, -0.112, 0.075))
    for x in (-0.12, 0.0):
        box(f'monH{x}', 'kijiD', (0.02, 0.02, 0.17), (x, -0.112, 0.085))
    gable('nagayaY', 'kawaraG', 0.72, 0.26, 0.08, 0.18, -0.06, -0.02)
    cyl('miki', 'miki', 0.03, 0.22, (0.34, -0.14, 0.11), verts=8)
    for i, (dx, dy, r) in enumerate(((0, 0, 0.14), (-0.1, 0.02, 0.09), (0.06, -0.04, 0.1))):
        sphere(f'ha{i}', 'gTree', r, (0.34 + dx, -0.14 + dy, 0.28 + i * 0.02), (1, 1, 0.6))
    box('annai', 'kanbanW2', (0.06, 0.01, 0.05), (0.18, -0.3, 0.08))
    box('annaiA', 'kijiD', (0.01, 0.01, 0.06), (0.18, -0.3, 0.03))
    return view(0.2)


def kaminagara_shinmei():
    """上永良神明社：しめなわを巻いた大シイの巨木（太い幹・大きな こい緑の葉）、手前の白い柵、奥の小さな社"""
    ground('jari')
    box('yashiro', 'kiji', (0.16, 0.14, 0.1), (0.32, 0.26, 0.05))
    gable('yashiroY', 'kawaraG', 0.2, 0.2, 0.06, 0.1, 0.32, 0.26)
    cyl('miki', 'shiiM', 0.11, 0.3, (-0.04, 0.06, 0.15), verts=12, r2=0.08)
    for i in range(4):
        a = i * math.pi / 2 + 0.6
        box(f'ne{i}', 'shiiM', (0.14, 0.04, 0.04), (-0.04 + math.cos(a) * 0.1, 0.06 + math.sin(a) * 0.1, 0.02), (0, 0, a))
    cyl('nawa', 'shime', 0.118, 0.025, (-0.04, 0.06, 0.16), verts=14)
    for i in range(3):
        box(f'shide{i}', 'shikkui', (0.016, 0.006, 0.04), (-0.12 + i * 0.08, -0.06, 0.13))
    for i, (dx, dy, dz, r) in enumerate(((0, 0, 0.42, 0.24), (-0.16, 0.04, 0.36, 0.14), (0.16, 0.0, 0.36, 0.15), (0.0, 0.08, 0.54, 0.14))):
        sphere(f'ha{i}', 'shiiG', r, (-0.04 + dx, 0.06 + dy, dz), (1, 1, 0.7))
    fence('f', 'shikkui', -0.36, 0.3, -0.24, 0.06, 10)
    return view(0.28, 1.2)


def shozanji():
    """勝山寺：こげ茶のお堂（黒っぽい瓦の反った屋根）、正面の白い額、右に赤いのぼり、左の松"""
    ground('jari')
    hall('h', 0, 0.08, 0.44, 0.26, 0.16, 'kijiD', 'yaneB', z=0.06)
    box('gaku', 'kanbanW2', (0.16, 0.012, 0.04), (0, -0.054, 0.19))
    box('gakuF', 'kuro', (0.18, 0.01, 0.05), (0, -0.052, 0.19))
    box('nb', 'kijiD', (0.008, 0.008, 0.34), (0.36, -0.12, 0.17))
    box('nbH', 'kanbanR', (0.04, 0.004, 0.22), (0.38, -0.12, 0.2))
    pine('p', -0.36, -0.08, 1.1)
    ishidatami('s', 0, -0.38, -0.08, 0.12)
    return view(0.24)


def sairinji():
    """西林寺：台の上の白っぽい石の墓碑（まるい頭）、両わきの黄色い花、手前にペンギンの像"""
    ground('jari')
    box('dai1', 'kidan', (0.44, 0.3, 0.05), (0, 0.06, 0.025))
    box('dai2', 'stoneR', (0.3, 0.2, 0.05), (0, 0.06, 0.075))
    box('hi', 'hiseki', (0.14, 0.08, 0.3), (0, 0.06, 0.25))
    cyl('hiT', 'hiseki', 0.07, 0.08, (0, 0.06, 0.4), (math.pi / 2, 0, 0), 14)
    for x in (-0.15, 0.15):
        box(f'hanaD{x}', 'stoneR', (0.05, 0.05, 0.12), (x, -0.02, 0.16))
        for k in range(3):
            sphere(f'hana{x}{k}', 'paraY', 0.024, (x + (k - 1) * 0.022, -0.02, 0.24))
    sphere('pB', 'pengin', 0.05, (0.3, -0.24, 0.07), (0.9, 0.8, 1.4))
    sphere('pW', 'penginW', 0.04, (0.3, -0.27, 0.065), (0.8, 0.5, 1.2))
    sphere('pH', 'pengin', 0.032, (0.3, -0.24, 0.15))
    cyl('pK', 'penginY', 0.012, 0.03, (0.3, -0.275, 0.15), (math.pi / 2, 0, 0), 6, r2=0.002)
    for x in (-0.28, 0.36):
        tree(f't{x}', x, 0.26, 1.2)
    return view(0.22)


def tenjiku_jinja():
    """天竹神社：木の社殿（灰色の瓦）、両わきの石灯籠、手前に白い綿の実がなる棉の畑"""
    ground('jari')
    hall('h', 0, 0.14, 0.4, 0.22, 0.14, 'kiji', 'kawaraG', z=0.05)
    for x in (-0.3, 0.3):
        toro(f'r{x}', x, -0.04, 1.1)
    ishidatami('s', 0, -0.38, -0.02, 0.12)
    for r in range(2):
        for i in range(4):
            x, y = (-0.4 + i * 0.08 if r == 0 else 0.16 + i * 0.08), -0.24
            sphere(f'wg{r}{i}', 'wataG', 0.035, (x, y, 0.05), (1, 1, 1.2))
            sphere(f'wt{r}{i}', 'wata', 0.016, (x + 0.01, y - 0.03, 0.07))
    return view(0.22)


def semon_jinja():
    """瀬門神社：こい茶（えんじ）の社殿にしめなわ、灰色の瓦。手前に飾り馬（赤と金の馬具）"""
    ground('jari')
    box('dan', 'kidan', (0.56, 0.32, 0.04), (0, 0.12, 0.02))
    box('kabe', 'maroon', (0.48, 0.26, 0.2), (0, 0.12, 0.14))
    for x in (-0.16, 0, 0.16):
        box(f'to{x}', 'kijiD', (0.012, 0.01, 0.16), (x, -0.011, 0.12))
    shimenawa('s', 0, -0.016, 0.22, 0.4)
    irimoya('yane', 'kawaraG', 0.64, 0.42, 0.2, 0.24, 0, 0.12)
    ux, uy = -0.16, -0.24
    box('umaB', 'uma', (0.18, 0.06, 0.07), (ux, uy, 0.12))
    for dx in (-0.07, 0.07):
        for dy in (-0.02, 0.02):
            box(f'umaL{dx}{dy}', 'uma', (0.02, 0.02, 0.09), (ux + dx, uy + dy, 0.045))
    box('umaN', 'uma', (0.04, 0.04, 0.09), (ux + 0.1, uy, 0.17), (0, math.radians(-30), 0))
    box('umaH', 'uma', (0.07, 0.035, 0.035), (ux + 0.14, uy, 0.22))
    box('kura', 'umaR', (0.08, 0.07, 0.03), (ux - 0.01, uy, 0.16))
    box('kuraK', 'umaK', (0.04, 0.072, 0.03), (ux - 0.01, uy, 0.185))
    box('shippo', 'kuro', (0.012, 0.012, 0.07), (ux - 0.1, uy, 0.1), (0, math.radians(20), 0))
    return view(0.22)


def kagakuji():
    """花岳寺：白い しっくいに こげ茶の柱の大きな本堂（大きな灰色の瓦）、右に高い杉、左に小さな木、石段"""
    ground('jari')
    hall('h', 0, 0.1, 0.46, 0.26, 0.16, 'shikkui', 'kawaraG', z=0.06)
    for x in (-0.12, 0.0, 0.12):
        box(f'h{x}', 'kijiD', (0.014, 0.01, 0.16), (x, -0.034, 0.14))
    box('to', 'kuro', (0.08, 0.01, 0.1), (0, -0.036, 0.11))
    cyl('sugiM', 'miki', 0.016, 0.14, (0.38, -0.02, 0.07), verts=6)
    cyl('sugi', 'sugi', 0.07, 0.36, (0.38, -0.02, 0.3), verts=10, r2=0.006)
    sphere('ki', 'gTree', 0.07, (-0.38, -0.12, 0.07))
    steps('s', 'stoneR', 0, -0.2, 0.2, 2, 0.04, 0.03)
    return view(0.24)


def ennyuji():
    """円融寺：門前の「吉良の五本松」（ななめにのびる松が5本）、奥に小さなお堂"""
    ground('jari')
    box('kabe', 'kiji', (0.26, 0.18, 0.12), (-0.18, 0.28, 0.06))
    roof('yane', 'kawaraG', 0.34, 0.26, 0.1, 0.12, 0.4, -0.18, 0.28)
    for i, (x, y, s, lean) in enumerate(((-0.3, -0.04, 1.2, 0), (-0.1, -0.16, 1.0, 0.25), (0.08, -0.02, 1.4, -0.2), (0.24, -0.18, 1.0, 0.3), (0.34, 0.12, 1.3, -0.25))):
        pine(f'go{i}', x, y, s)
        for o in bpy.context.scene.objects:
            if o.name.startswith(f'matsugo{i}'):
                o.location.x += lean * (o.location.z / 0.3) * 0.2
            if o.name.startswith(f'mikigo{i}'):
                o.rotation_euler = (0, lean * 0.6, 0)
                o.location.x += lean * 0.03
    return view(0.2)


def shorakuji():
    """勝楽寺（小山田地蔵尊）：左の石段と木、白い妻に こげ茶の壁のお堂（灰色の瓦）、手前に赤い前かけのお地蔵さま"""
    ground('jari')
    box('kabe', 'kijiD', (0.44, 0.28, 0.18), (0.06, 0.1, 0.09))
    gable_y('tsuma', 'shikkui', 0.4, 0.28, 0.12, 0.18, 0.06, 0.1)
    gable_y('yane', 'kawaraG', 0.56, 0.38, 0.17, 0.18, 0.06, 0.1)
    windows('w', 'shoji', [-0.04, 0.16], -0.041, 0.1, 0.08, 0.08)
    box('to', 'kuro', (0.06, 0.01, 0.12), (0.06, -0.041, 0.06))
    steps('k', 'stoneR', -0.3, -0.1, 0.1, 7, 0.04, 0.03)
    tree('t', -0.3, 0.26, 1.5, 'sugi')
    for i, x in enumerate((-0.04, 0.06, 0.16)):
        jizo(i, x, -0.24, 1.1)
    return view(0.22)


# ---------- 3回目：48×48 の絵がない17か所（形は説明文から。写真はなぞらない） ----------
pa.MATS.update({
    'higata': '#a89a80', 'higataD': '#8a7c64', 'mizoB': '#6a9ac6', 'shimaG': '#4f8a3e', 'kayaB': '#a8884a', 'kayaD': '#7a6230',
    'enku': '#a8784a', 'enkuD': '#7a5232', 'tengu': '#d23a2e', 'tenguK': '#2a2a2e', 'bonsho': '#6a5a3a', 'sekkan': '#c8b48a',
    'hito': '#3a4a7a', 'hadaH': '#f0c8a0', 'oke': '#3a7fd0', 'kumade': '#e8b830',
})


def horse(n, x, y, z=0.0, run=False, mat='uma'):
    """馬（横向き。run=True は前足をあげて駆ける）"""
    box(f'hB{n}', mat, (0.18, 0.06, 0.07), (x, y, z + 0.12))
    for i, dx in enumerate((-0.07, 0.07)):
        for dy in (-0.02, 0.02):
            tilt = (math.radians(30) if dx > 0 else math.radians(-20)) if run else 0
            box(f'hL{n}{i}{dy}', mat, (0.02, 0.02, 0.09), (x + dx + (0.02 if run and dx > 0 else 0), y + dy, z + 0.05), (0, tilt, 0))
    box(f'hN{n}', mat, (0.04, 0.04, 0.09), (x + 0.1, y, z + 0.17), (0, math.radians(-30), 0))
    box(f'hH{n}', mat, (0.07, 0.035, 0.035), (x + 0.14, y, z + 0.22))
    box(f'hT{n}', 'kuro', (0.012, 0.012, 0.07), (x - 0.1, y, z + 0.1), (0, math.radians(20), 0))


def person(n, x, y, z=0.0, body='hito', s=1.0):
    box(f'pb{n}', body, (0.04 * s, 0.03 * s, 0.07 * s), (x, y, z + 0.075 * s))
    for dx in (-0.01, 0.01):
        box(f'pl{n}{dx}', 'kuro', (0.014 * s, 0.014 * s, 0.04 * s), (x + dx * s, y, z + 0.02 * s))
    sphere(f'ph{n}', 'hadaH', 0.018 * s, (x, y, z + 0.13 * s))


def nishio_shiryokan():
    """西尾市資料館：歴史公園の中の、白い壁に灰色の瓦の二階建て（低い石垣の上）、手前の松と石だたみ"""
    ground('jari')
    box('ishigaki', 'ishigaki', (0.66, 0.36, 0.06), (0, 0.1, 0.03))
    box('ichi', 'shikkui', (0.56, 0.28, 0.14), (0, 0.1, 0.13))
    box('koshi', 'shitami', (0.564, 0.284, 0.05), (0, 0.1, 0.085))
    roof('yane1', 'kawaraG', 0.68, 0.4, 0.05, 0.2, 0.7, 0, 0.1, flat=True)
    box('ni', 'shikkui', (0.36, 0.22, 0.1), (0, 0.12, 0.3))
    irimoya('yane2', 'kawaraG', 0.48, 0.32, 0.16, 0.35, 0, 0.12)
    box('iri', 'kijiD', (0.1, 0.01, 0.1), (0, -0.041, 0.11))
    windows('w', 'kuro', [-0.2, -0.1, 0.1, 0.2], -0.041, 0.15, 0.04, 0.04)
    pine('p', -0.34, -0.18, 1.2)
    ishidatami('s', 0, -0.38, -0.08, 0.14)
    return view(0.24)


def seiganji():
    """盛巌寺：禅宗の お寺。灰色の瓦の本堂と、手前の山門、松"""
    ground('jari')
    hall('h', 0.04, 0.16, 0.42, 0.22, 0.14, 'kiji', 'kawaraG', z=0.05)
    for x in (-0.1, 0.1):
        box(f'monH{x}', 'kijiD', (0.024, 0.024, 0.16), (x, -0.18, 0.08))
    box('monN', 'kijiD', (0.24, 0.03, 0.02), (0, -0.18, 0.15))
    gable('monY', 'kawaraG', 0.34, 0.16, 0.07, 0.16, 0, -0.18)
    for x in (-0.24, 0.24):
        box(f'hei{x}', 'shikkui', (0.24, 0.03, 0.1), (x + (0.1 if x > 0 else -0.1) * 0.2, -0.18, 0.05))
    pine('p', -0.36, 0.02, 1.2)
    ishidatami('s', 0, -0.38, -0.2, 0.12)
    return view(0.22)


def ikimono_sato():
    """西尾いきものふれあいの里：丘の里山の林、小さな池と木の板の歩道、木の観察小屋"""
    ground('shibaG')
    sphere('oka', 'kusa', 0.5, (0.06, 0.38, 0.0), (0.82, 0.34, 0.4))
    for i, (x, y, s) in enumerate(((-0.24, 0.2, 1.3), (0.06, 0.3, 1.5), (0.32, 0.2, 1.2), (-0.06, 0.12, 1.0))):
        tree(f't{i}', x, y, s)
    water('ike', 0.34, 0.2, -0.18, -0.16, 0.014)
    for i in range(5):
        box(f'ita{i}', 'kiji', (0.05, 0.08, 0.012), (0.02 + i * 0.06, -0.14, 0.03))
    box('koya', 'kiji', (0.16, 0.12, 0.1), (0.3, -0.06, 0.05))
    gable('koyaY', 'kijiD', 0.2, 0.16, 0.06, 0.1, 0.3, -0.06)
    box('mado', 'kuro', (0.08, 0.01, 0.03), (0.3, -0.121, 0.07))
    return view(0.16)


def atsuike_hachiman():
    """熱池八幡社：鳥居と石だたみの先の社殿（灰色の瓦）、両わきの石灯籠と白いのぼり"""
    ground('jari')
    hall('h', 0, 0.16, 0.38, 0.22, 0.14, 'kiji', 'kawaraG', z=0.05)
    for x in (-0.24, 0.24):
        toro(f'r{x}', x, -0.02, 1.0)
        box(f'nb{x}', 'kijiD', (0.008, 0.008, 0.36), (x * 1.55, -0.04, 0.18))
        box(f'nbH{x}', 'shikkui', (0.04, 0.004, 0.24), (x * 1.55 + 0.025, -0.04, 0.22))
    torii('t', 0, -0.2, 1.1)
    ishidatami('s', 0, -0.38, 0.04, 0.12)
    return view(0.22)


def koromozaki():
    """衣崎海岸（一色干潟）：潮が引いた広い干潟（水の すじ）、潮干狩りの人と青い おけ、奥の海"""
    water('umiB', 1.0, 0.24, 0, 0.28, 0.006)
    box('higata', 'higata', (1.0, 0.56, 0.02), (0, -0.12, 0.004))
    for i, (x, y, w) in enumerate(((-0.2, 0.0, 0.5), (0.18, -0.16, 0.4), (-0.1, -0.28, 0.3))):
        box(f'mizo{i}', 'mizoB', (w, 0.03, 0.006), (x, y, 0.016), (0, 0, math.radians(8 - i * 6)))
    for i in range(14):
        sphere(f'ana{i}', 'higataD', 0.008, (-0.4 + (i * 0.37) % 0.8, -0.34 + (i * 0.23) % 0.5, 0.016))
    for i, (x, y) in enumerate(((-0.26, -0.1), (0.1, -0.04), (0.3, -0.26))):
        person(i, x, y, 0.014, ('hito', 'paraR', 'paraY')[i])
        box(f'oke{i}', 'oke', (0.04, 0.04, 0.03), (x + 0.05, y - 0.02, 0.03))
    box('kumade', 'kumade', (0.012, 0.1, 0.008), (0.06, -0.08, 0.022), (0, 0, math.radians(30)))
    return view(0.1)


def benten_salon():
    """佐久島弁天サロン：西港のそばの木の平屋（灰色の瓦）、前のベンチ、桟橋と海"""
    water('umiB', 1.0, 0.3, 0, -0.26, 0.006)
    box('kishi', 'kidan', (1.0, 0.5, 0.03), (0, 0.15, 0.015))
    box('tate', 'kiji', (0.48, 0.24, 0.16), (-0.02, 0.18, 0.11))
    gable('yane', 'kawaraG', 0.56, 0.32, 0.1, 0.19, -0.02, 0.18)
    box('to', 'glassB', (0.14, 0.01, 0.1), (-0.06, 0.059, 0.08))
    box('mado', 'glassB', (0.1, 0.01, 0.06), (0.14, 0.059, 0.11))
    for x in (-0.24, 0.12):
        box(f'bench{x}', 'kijiD', (0.14, 0.04, 0.012), (x, -0.02, 0.06))
        for dx in (-0.05, 0.05):
            box(f'benchA{x}{dx}', 'kijiD', (0.01, 0.03, 0.03), (x + dx, -0.02, 0.045))
    box('sanbashi', 'kijiD', (0.1, 0.24, 0.02), (0.32, -0.2, 0.02))
    box('fune', 'fune', (0.18, 0.06, 0.04), (0.18, -0.3, 0.02), bevel=0.012)
    return view(0.18)


def tombolo():
    """トンボロ干潟（前島）：潮が引くと現れる砂の道が、木の茂る小さな島（前島）へつづく。まわりは海"""
    water('umiB', 1.0, 0.8, 0, 0, 0.006)
    box('kishi', 'sunaB', (1.0, 0.18, 0.03), (0, -0.31, 0.015))
    box('michi', 'sunaB', (0.14, 0.44, 0.02), (0.04, -0.02, 0.01), (0, 0, math.radians(-8)))   # 潮が引くと現れる砂の道
    sphere('shima', 'iwaG', 0.2, (0.1, 0.24, 0.0), (1.1, 0.8, 0.5))
    for i, (x, y, s) in enumerate(((0.02, 0.24, 1.0), (0.14, 0.28, 1.2), (0.2, 0.2, 0.9))):
        tree(f't{i}', x, y, s, 'shimaG')
        for o in bpy.context.scene.objects:
            if o.name.startswith((f'mikit{i}', f'hat{i}')):
                o.location.z += 0.08
    person(0, 0.02, -0.06, 0.012, 'paraR')
    return view(0.14)


def sangane_kannon():
    """三ヶ根観音：山の上の お堂（灰色の瓦）と、台の上に立つ石の観音さま、まわりの木。手前の下に三河湾"""
    water('umiB', 1.0, 0.2, 0, -0.3, 0.006)
    box('yama', 'kusa', (1.0, 0.6, 0.1), (0, 0.1, 0.05))
    hall('h', 0.12, 0.2, 0.34, 0.2, 0.12, 'kiji', 'kawaraG', z=0.15)
    box('dai', 'kidan', (0.1, 0.1, 0.06), (-0.2, 0.0, 0.13))
    box('kB', 'hiseki', (0.05, 0.04, 0.16), (-0.2, 0.0, 0.24), bevel=0.012)
    sphere('kH', 'hiseki', 0.025, (-0.2, 0.0, 0.34))
    for x, y in ((-0.34, 0.24), (0.36, 0.06), (-0.04, 0.34)):
        tree(f't{x}', x, y, 1.2)
        for o in bpy.context.scene.objects:
            if o.name.startswith((f'mikit{x}', f'hat{x}')):
                o.location.z += 0.1
    return view(0.24)


def jomyoji():
    """浄名寺：戸を開けたお堂（灰色の瓦）の中に、背の高い木の円空仏（観音菩薩立像）"""
    ground('jari')
    box('kidan', 'kidan', (0.5, 0.34, 0.05), (0, 0.1, 0.025))
    for x in (-0.22, 0.22):
        box(f'kabe{x}', 'kiji', (0.06, 0.26, 0.22), (x, 0.1, 0.16))
    box('ura', 'kijiD', (0.4, 0.04, 0.22), (0, 0.21, 0.16))
    box('kamoi', 'kiji', (0.5, 0.26, 0.03), (0, 0.1, 0.27))
    irimoya('yane', 'kawaraG', 0.62, 0.44, 0.2, 0.285, 0, 0.1)
    box('daiza', 'kijiD', (0.1, 0.07, 0.03), (0, 0.04, 0.065))
    box('butsu', 'enku', (0.08, 0.05, 0.15), (0, 0.04, 0.155), bevel=0.012)   # 円空仏：お堂の高さいっぱいの木の立像
    sphere('butsuH', 'enku', 0.03, (0, 0.04, 0.25))
    box('kesa', 'enkuD', (0.082, 0.052, 0.02), (0, 0.04, 0.18), (0, math.radians(20), 0))
    toro('r', 0.34, -0.14, 1.0)
    ishidatami('s', 0, -0.38, -0.06, 0.12)
    return view(0.22)


def anakobo():
    """見影山穴弘法：ふもとから山頂へ、じぐざぐの小道にそって小さな石の弘法さんがならぶ八十八ヶ所めぐり"""
    ground('shibaG')
    sphere('yama', 'kusa', 0.5, (0.04, 0.2, 0.0), (0.84, 0.56, 0.6))
    pts = [(-0.3, -0.24), (0.2, -0.06), (-0.16, 0.12), (0.12, 0.28), (0.02, 0.38)]
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        ln = math.hypot(x1 - x0, y1 - y0)
        z0 = 0.3 * max(0.0, 1 - (((x0 + x1) / 2 - 0.04) ** 2 / 0.42 ** 2 + ((y0 + y1) / 2 - 0.2) ** 2 / 0.28 ** 2)) ** 0.5
        box(f'michi{i}', 'jari', (ln, 0.04, 0.01), ((x0 + x1) / 2, (y0 + y1) / 2, z0 + 0.005), (0, 0, math.atan2(y1 - y0, x1 - x0)))
        for k in range(3):
            f = (k + 0.5) / 3
            x, y = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f - 0.04
            z = 0.3 * max(0.0, 1 - ((x - 0.04) ** 2 / 0.42 ** 2 + (y - 0.2) ** 2 / 0.28 ** 2)) ** 0.5
            jizo(f'{i}{k}', x, y, 0.7)
            for o in bpy.context.scene.objects:
                if o.name.startswith(('jzd', 'jzb', 'jzh', 'jzm')) and o.name.endswith(f'{i}{k}'):
                    o.location.z += z
    tree('t1', -0.3, 0.24, 1.2)
    tree('t2', 0.36, 0.1, 1.1)
    return view(0.18)


def munosato():
    """無の里休憩所：急な かやぶき屋根の合掌造りの家（三角の大きな屋根、妻に窓）、まわりの木"""
    ground('shibaG')
    box('kabe', 'kijiD', (0.4, 0.3, 0.1), (0, 0.06, 0.05))
    gable_y('kaya', 'kayaB', 0.5, 0.4, 0.42, 0.1, 0, 0.06)
    gable_y('tsuma', 'kiji', 0.36, 0.3, 0.32, 0.1, 0, 0.055)
    for i, z in enumerate((0.16, 0.26)):
        box(f'tm{i}', 'shoji', (0.12 - i * 0.04, 0.01, 0.04), (0, -0.096, z))
    box('mune', 'kayaD', (0.04, 0.42, 0.03), (0, 0.06, 0.52))
    box('to', 'shoji', (0.1, 0.01, 0.07), (0, -0.091, 0.04))
    tree('t1', -0.34, 0.1, 1.4)
    tree('t2', 0.34, 0.2, 1.2)
    ishidatami('s', 0, -0.38, -0.1, 0.12)
    return view(0.26)


def nakahata_hachiman():
    """中畑八幡社：社殿（灰色の瓦）の前の馬場を、首につかまった人と駆ける馬（おまんと祭）"""
    ground('jari')
    hall('h', 0, 0.22, 0.36, 0.18, 0.12, 'kiji', 'kawaraG', z=0.05)
    box('baba', 'suna', (0.9, 0.2, 0.008), (0, -0.14, 0.012))
    fence('f', 'kijiD', -0.44, 0.44, -0.26, 0.05, 12)
    horse('u', -0.04, -0.14, 0.0, run=True)
    box('kazari', 'umaR', (0.08, 0.07, 0.03), (-0.05, -0.14, 0.16))
    person('p', 0.1, -0.18, 0.06, 'shikkui')
    toro('r', 0.34, 0.02, 1.0)
    return view(0.2)


def takakura_jinja():
    """高倉神社：社殿（灰色の瓦）と、戸を開けた天狗堂の中の大きな赤い天狗の面"""
    ground('jari')
    hall('h', -0.12, 0.18, 0.34, 0.2, 0.13, 'kiji', 'kawaraG', z=0.05)
    box('do', 'kijiD', (0.22, 0.18, 0.18), (0.26, -0.02, 0.09))
    box('doF', 'kuro', (0.16, 0.01, 0.13), (0.26, -0.111, 0.08))
    gable('doY', 'kawaraG', 0.28, 0.24, 0.08, 0.18, 0.26, -0.02)
    sphere('tenguF', 'tengu', 0.045, (0.26, -0.12, 0.09), (1, 0.4, 1.2))
    cyl('tenguN', 'tengu', 0.012, 0.07, (0.26, -0.15, 0.09), (math.pi / 2, 0, 0), 8, r2=0.004)
    box('tenguM', 'tenguK', (0.05, 0.006, 0.008), (0.26, -0.139, 0.11))
    torii('t', -0.12, -0.18, 1.0)
    ishidatami('s', -0.12, -0.38, -0.02, 0.12)
    return view(0.2)


def toteiyama():
    """とうてい山古墳：草におおわれた円墳（てっぺんに砂岩の石棺）、うしろに三河湾と島々"""
    water('umiB', 1.0, 0.3, 0, 0.26, 0.006)
    for i, (x, r) in enumerate(((-0.24, 0.07), (0.1, 0.05), (0.34, 0.06))):
        sphere(f'shima{i}', 'shimaG', r, (x, 0.34, 0.0), (1.6, 0.8, 0.6))
    box('oka', 'kusa', (1.0, 0.52, 0.02), (0, -0.14, 0.01))
    sphere('fun', 'kofunG', 0.26, (0, -0.08, 0.0), (1, 0.9, 0.72))
    box('sekkan', 'sekkan', (0.18, 0.08, 0.05), (0, -0.08, 0.2))
    box('futa', 'sekkan', (0.19, 0.09, 0.02), (0.01, -0.08, 0.235), (0, 0, math.radians(8)))
    tree('t', -0.36, -0.2, 1.0)
    return view(0.14)


def saifukuji():
    """西福寺鐘楼：石の基壇の上に4本柱、灰色の瓦の入母屋屋根、つり下げた梵鐘"""
    ground('jari')
    box('kidan', 'ishigaki', (0.4, 0.4, 0.08), (0, 0.04, 0.04))
    for dx in (-0.14, 0.14):
        for dy in (-0.1, 0.18):
            box(f'hashira{dx}{dy}', 'kijiD', (0.03, 0.03, 0.26), (dx, dy, 0.21))
    box('nuki', 'kijiD', (0.32, 0.03, 0.02), (0, -0.1, 0.3))
    box('nukiB', 'kijiD', (0.32, 0.03, 0.02), (0, 0.18, 0.3))
    irimoya('yane', 'kawaraG', 0.5, 0.48, 0.2, 0.34, 0, 0.04)
    cyl('kane', 'bonsho', 0.07, 0.14, (0, 0.04, 0.24), verts=14, r2=0.06)
    sphere('kaneT', 'bonsho', 0.04, (0, 0.04, 0.31), (1, 1, 0.5))
    box('shumoku', 'kiji', (0.12, 0.016, 0.016), (0.14, 0.04, 0.23))
    pine('p', 0.36, 0.22, 1.1)   # 鐘が見えるように、松は右奥に
    return view(0.24)


def ebisu_beach():
    """恵比寿海水浴場：きめの細かい長い砂浜、おだやかな波、パラソル、うしろの松の並び"""
    water('umiB', 1.0, 0.3, 0, -0.26, 0.006)
    for i in range(3):
        box(f'nami{i}', 'line2', (0.2, 0.014, 0.004), (-0.3 + i * 0.32, -0.14, 0.011))
    box('suna', 'sunaB', (1.0, 0.5, 0.02), (0, 0.14, 0.01))
    for i, (x, y, m) in enumerate(((-0.2, 0.02, 'paraB'), (0.12, 0.06, 'paraY'))):
        parasol(i, x, y, m)
    for i in range(5):
        pine(f'm{i}', -0.3 + i * 0.16, 0.3, 0.9)
    return view(0.14)


def terabe_beach():
    """寺部海水浴場：波の静かな小さな浜、岩場、うしろの木々"""
    water('umiB', 1.0, 0.34, 0, -0.24, 0.006)
    box('suna', 'sunaB', (1.0, 0.46, 0.02), (0, 0.16, 0.01))
    for i, (x, y, r) in enumerate(((0.3, -0.06, 0.06), (0.38, 0.02, 0.05), (0.24, 0.04, 0.04))):
        sphere(f'iwa{i}', 'iwaG', r, (x, y, 0.02), (1.3, 1, 0.8))
    sphere('oka', 'kusa', 0.5, (0.04, 0.42, 0.0), (0.8, 0.3, 0.4))
    for i, (x, y, s) in enumerate(((-0.26, 0.3, 1.3), (0.02, 0.34, 1.5), (0.28, 0.28, 1.2))):
        tree(f't{i}', x, y, s)
    box('nami', 'line2', (0.4, 0.014, 0.004), (-0.1, -0.08, 0.011))
    return view(0.14)


MODELS = {
    'konoe-tei': konoe_tei, 'shokoso': shokoso, 'ibun-jinja': ibun_jinja, 'kozenji': kozenji, 'kumaku-jinja': kumaku_jinja,
    'yatsuomote': yatsuomote, 'wakuwaku': wakuwaku, 'jissoji': jissoji, 'choenji': choenji, 'glass-museum': glass_museum,
    'yojuji': yojuji, 'terazu-hachiman': terazu_hachiman, 'michinoeki-okanoyama': michinoeki_okanoyama, 'nishio-cityhall': nishio_cityhall,
    'hirabara-taki': hirabara_taki, 'kojuin': kojuin, 'isshiki-sakana': isshiki_sakana, 'isshiki-port': isshiki_port,
    'isshiki-suwa': isshiki_suwa, 'ankyuji': ankyuji, 'isshiki-manabi': isshiki_manabi, 'sakushima-nishi': sakushima_nishi,
    'sakushima-higashi': sakushima_higashi, 'suunji': suunji, 'kamome-parking': kamome_parking, 'oura-beach': oura_beach,
    'yatsurugi': yatsurugi, 'kezoji': kezoji, 'kogane-zutsumi': kogane_zutsumi, 'tojo-jo': tojo_jo, 'gentokuji': gentokuji,
    'ozaki-shiro': ozaki_shiro,
    'kira-yoshida': kira_yoshida, 'shohoji-kofun': shohoji_kofun, 'shio-no-sato': shio_no_sato, 'kira-onsen': kira_onsen,
    'kira-waikiki': kira_waikiki, 'hazu-jinja': hazu_jinja, 'nishi-hazu': nishi_hazu, 'terabe-jo': terabe_jo, 'higashi-hazu': higashi_hazu,
    'myozenji': myozenji, 'kodomonokuni-st': kodomonokuni_st, 'aichi-kodomo': aichi_kodomo, 'toba-shinmei': toba_shinmei, 'antaiji': antaiji,
    'fukusenji': fukusenji, 'genkuin': genkuin, 'kasuya-tei': kasuya_tei, 'kaminagara-shinmei': kaminagara_shinmei, 'shozanji': shozanji,
    'sairinji': sairinji, 'tenjiku-jinja': tenjiku_jinja, 'semon-jinja': semon_jinja, 'kagakuji': kagakuji, 'ennyuji': ennyuji,
    'shorakuji': shorakuji,
    'nishio-shiryokan': nishio_shiryokan, 'seiganji': seiganji, 'ikimono-sato': ikimono_sato, 'atsuike-hachiman': atsuike_hachiman,
    'koromozaki': koromozaki, 'benten-salon': benten_salon, 'tombolo': tombolo, 'sangane-kannon': sangane_kannon, 'jomyoji': jomyoji,
    'anakobo': anakobo, 'munosato': munosato, 'nakahata-hachiman': nakahata_hachiman, 'takakura-jinja': takakura_jinja,
    'toteiyama': toteiyama, 'saifukuji': saifukuji, 'ebisu-beach': ebisu_beach, 'terabe-beach': terabe_beach,
}


def flat_bottom(fn, z0=-0.01):
    """丘や古墳は球をつぶして作るので、下半分が地面の板（厚さ 0.02）の下から のぞく。板の下の面より下にある点を、板の下の面までもちあげる"""
    def build():
        opts = fn()
        for o in bpy.context.scene.objects:
            if o.type != 'MESH':
                continue
            mw = o.matrix_world
            inv = mw.inverted()
            for v in o.data.vertices:
                w = mw @ v.co
                if w.z < z0:
                    w.z = z0
                    v.co = inv @ w
        return opts
    return build


MODELS = {k: flat_bottom(f) for k, f in MODELS.items()}   # giant-list.py は上の MODELS = {...} の名前だけを読む
pa.MODELS.clear()
pa.MODELS.update(MODELS)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        pa.make(name)

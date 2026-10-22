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
        sphere(f'sakura{i}', 'sakuraP', 0.07, (x, -0.16, z))
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


MODELS = {
    'konoe-tei': konoe_tei, 'shokoso': shokoso, 'ibun-jinja': ibun_jinja, 'kozenji': kozenji, 'kumaku-jinja': kumaku_jinja,
    'yatsuomote': yatsuomote, 'wakuwaku': wakuwaku, 'jissoji': jissoji, 'choenji': choenji, 'glass-museum': glass_museum,
    'yojuji': yojuji, 'terazu-hachiman': terazu_hachiman, 'michinoeki-okanoyama': michinoeki_okanoyama, 'nishio-cityhall': nishio_cityhall,
    'hirabara-taki': hirabara_taki, 'kojuin': kojuin, 'isshiki-sakana': isshiki_sakana, 'isshiki-port': isshiki_port,
    'isshiki-suwa': isshiki_suwa, 'ankyuji': ankyuji, 'isshiki-manabi': isshiki_manabi, 'sakushima-nishi': sakushima_nishi,
    'sakushima-higashi': sakushima_higashi, 'suunji': suunji, 'kamome-parking': kamome_parking, 'oura-beach': oura_beach,
    'yatsurugi': yatsurugi, 'kezoji': kezoji, 'kogane-zutsumi': kogane_zutsumi, 'tojo-jo': tojo_jo, 'gentokuji': gentokuji,
    'ozaki-shiro': ozaki_shiro,
}
pa.MODELS.clear()
pa.MODELS.update(MODELS)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        pa.make(name)

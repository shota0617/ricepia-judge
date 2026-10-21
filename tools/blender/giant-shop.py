# にしおさんぽGO：当店「らいすぴあ・秀幸」の特大のドット絵（96×96）と、お店のなかの絵を Blender で作る
# - 形と色は、運営者が撮った お店の写真4枚（2026年10月：店の正面とドライブスルー・お米の売り場・紙袋の30kgのお米・駐車場のコイン精米所）から。
#   写っている字（店名・値段・銘柄）は絵にしない（色の帯だけ）。となりのお店・止まっている車・ナンバーも描かない
# - giant-neighbors.py と同じ部品と焼き方。できた PNG は nishio-go/art/giant/ricepia.png（歩く地図で pixel.js の GIANT_ART）と
#   nishio-go/art/giant/ricepia-uriba.png（名所の窓の「お店のなか」）
# 使い方：python tools/blender/giant-shop.py （ぜんぶ）／ python tools/blender/giant-shop.py ricepia （ひとつ）
import importlib.util
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('giant_neighbors', os.path.join(HERE, 'giant-neighbors.py'))
gn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gn)
pa = gn.pa
box, cyl, sphere, ground = pa.box, pa.cyl, pa.sphere, gn.ground

pa.MATS.update({
    'akaR': '#d7262e', 'akaRD': '#a81c22', 'kanbanW': '#f6f6f2', 'moji': '#e2507a', 'kome': '#f2f2ee', 'komeKage': '#d8d8d2',
    'labelR': '#e8384a', 'labelB': '#2f5fc8', 'labelG': '#3a9a4a', 'labelO': '#f0902a', 'kamibukuro': '#d2ab72', 'himo': '#8a6a4a',
    'teal': '#2f7f86', 'beige': '#d8c6ae', 'beigeD': '#b8a68e', 'aoJi': '#2a3f9a', 'kiiro': '#f2c200', 'line': '#e8b020',
    'nedan': '#fbfbf6', 'nedanM': '#222222', 'momo': '#f4c8d4', 'kabe': '#cdd5cd', 'tenjo': '#4a5a52', 'dai': '#e8dcc0', 'daiK': '#2a2a2a',
    'pinkF': '#e8a0b4', 'paret': '#b8915a',
})


def ricepia():
    """らいすぴあ・秀幸：赤い波板の店（下に白い帯・ガラスの入口・左は開いた倉庫で、お米の袋が積んである）、屋根の上の白い横長の看板（ピンクの字の帯）、
    右に白い屋根の「米のドライブスルー」（前の白い板に赤い帯と赤い矢印、白い柱、黄色の車止め、屋根の上の照明）。
    左前に荷台にピンクの柵の白い軽トラ（木のパレット）、右の駐車場に コイン精米所（ベージュの小屋に青緑の看板、白い「P」の看板の塔）"""
    ground('concrete')
    box('line', 'line', (0.012, 0.50, 0.004), (0.02, -0.20, 0.004), (0, 0, math.radians(8)))   # 黄色い線
    # 店：赤い波板の建物
    box('mise', 'akaR', (0.46, 0.30, 0.24), (-0.20, 0.16, 0.12))
    for i in range(12):   # 波板のすじ
        box(f'nami{i}', 'akaRD', (0.006, 0.302, 0.20), (-0.42 + i * 0.04, 0.16, 0.12))
    box('obi', 'kanbanW', (0.464, 0.304, 0.03), (-0.20, 0.16, 0.075))   # 白い帯
    box('kurai', 'sumi', (0.16, 0.02, 0.16), (-0.33, 0.006, 0.08))   # 左の開いた倉庫（中は暗い）
    for x in (-0.41, -0.25):
        box(f'hashiraW{x}', 'kanbanW', (0.02, 0.03, 0.17), (x, 0.0, 0.085))
    for k in range(3):   # 倉庫の中のお米の袋
        for j in range(2):
            box(f'fukuro{k}{j}', 'kome', (0.05, 0.03, 0.022), (-0.37 + j * 0.06, 0.03, 0.015 + k * 0.024))
    box('garasu', 'glassB', (0.18, 0.012, 0.11), (-0.12, 0.004, 0.055))   # ガラスの入口
    for x in (-0.18, -0.12, -0.06):
        box(f'harigami{x}', 'nedan', (0.03, 0.014, 0.03), (x, 0.002, 0.08))   # 値段の貼り紙（字は描かない）
    # 屋根の上の白い横長の看板（ピンクの字の帯）
    box('kanban', 'kanbanW', (0.44, 0.03, 0.09), (-0.20, 0.0, 0.30))
    box('kanbanM', 'moji', (0.36, 0.032, 0.035), (-0.20, 0.0, 0.30))
    box('kanbanB', 'hashira', (0.44, 0.05, 0.012), (-0.20, 0.01, 0.25))
    # 米のドライブスルー：白い屋根・前の板・柱
    box('dtYane', 'kanbanW', (0.40, 0.32, 0.03), (0.23, 0.10, 0.215))
    box('dtIta', 'kanbanW', (0.42, 0.03, 0.08), (0.23, -0.06, 0.20))
    box('dtObi', 'akaR', (0.27, 0.032, 0.05), (0.29, -0.062, 0.20))   # 赤い帯（「米のドライブスルー」の字のところ）
    box('dtYa', 'akaR', (0.05, 0.032, 0.04), (0.07, -0.062, 0.205))   # 赤い矢印（IN）
    box('dtKao', 'kanbanW', (0.03, 0.034, 0.03), (0.13, -0.062, 0.20))   # 白い顔の車のマーク（形だけ）
    for x, y in ((0.40, -0.04), (0.40, 0.24)):
        cyl(f'dtHashira{y}', 'kanbanW', 0.014, 0.19, (x, y, 0.095), verts=10)
    box('kurumadome', 'kiiro', (0.03, 0.03, 0.05), (0.42, -0.06, 0.025))
    for i in range(4):   # 屋根の上の照明
        x = 0.08 + i * 0.10
        box(f'shomei{i}', 'hashira', (0.03, 0.02, 0.02), (x, -0.06, 0.25))
    box('kiiroKanban', 'kiiro', (0.06, 0.006, 0.04), (0.20, 0.25, 0.07))   # 奥の黄色い案内板（白線まで前に）
    # 白い軽トラ（荷台にピンクの柵と木のパレット）
    box('trCab', 'kome', (0.07, 0.09, 0.07), (-0.36, -0.30, 0.05), (0, 0, math.radians(90)))
    box('trMado', 'glassB', (0.062, 0.002, 0.03), (-0.36, -0.346, 0.07), (0, 0, 0))
    box('trNi', 'kome', (0.08, 0.15, 0.02), (-0.36, -0.18, 0.03), (0, 0, 0))
    for dx in (-0.04, 0.04):
        box(f'trSaku{dx}', 'pinkF', (0.004, 0.15, 0.06), (-0.36 + dx, -0.18, 0.07))
    box('trSakuU', 'pinkF', (0.08, 0.004, 0.06), (-0.36, -0.105, 0.07))
    box('paret', 'paret', (0.06, 0.08, 0.05), (-0.36, -0.17, 0.065), (math.radians(-10), 0, 0))
    for x in (-0.395, -0.325):
        for y in (-0.32, -0.14):
            cyl(f'tire{x}{y}', 'sumi', 0.014, 0.012, (x, y, 0.014), (0, math.pi / 2, 0), 10)
    # コイン精米所：ベージュの小屋に青緑の看板、白い「P」の看板の塔
    # 右前の駐車場（写真では店の横の駐車場）に置く。ドライブスルーの屋根にかくれないように
    mx, my = 0.12, -0.34
    box('seimai', 'beige', (0.16, 0.10, 0.10), (mx, my, 0.05))
    box('seimaiTo', 'glassB', (0.04, 0.006, 0.07), (mx - 0.05, my - 0.052, 0.035))
    box('seimaiK', 'teal', (0.12, 0.012, 0.035), (mx, my - 0.056, 0.115))
    box('tou', 'beigeD', (0.06, 0.06, 0.22), (mx + 0.11, my + 0.02, 0.11))
    box('touK', 'kanbanW', (0.062, 0.004, 0.07), (mx + 0.11, my - 0.012, 0.17))
    box('touKj', 'aoJi', (0.05, 0.005, 0.014), (mx + 0.11, my - 0.013, 0.19))   # 青い字（店名）の帯
    box('touP', 'akaR', (0.024, 0.005, 0.03), (mx + 0.11, my - 0.013, 0.16))   # 赤い P
    box('touY', 'yaneB', (0.08, 0.08, 0.008), (mx + 0.11, my + 0.02, 0.225), (math.radians(8), 0, 0))
    return dict(target=(0.02, 0.0, 0.12), scale=1.04, el=28, size=96)


def ricepia_uriba():
    """お店のなかの お米の売り場：白い袋（10kg）が段に積まれ、袋ごとに色のちがう札（赤・青・緑・オレンジ）。
    上の棒に、銘柄ごとの白い値札（上にピンクの見出し）がずらりとさがる。左に紙袋の30kgのお米（ひもでしばった口）。字は描かない"""
    box('yuka', 'concrete', (1.2, 0.8, 0.02), (0, 0, -0.01))
    box('kabe', 'kabe', (1.2, 0.02, 0.60), (0, 0.32, 0.30))
    box('dai', 'dai', (0.80, 0.30, 0.04), (0.06, 0.06, 0.02))
    box('daiK', 'daiK', (0.80, 0.004, 0.04), (0.06, -0.092, 0.02))
    labels = ['labelR', 'labelB', 'labelG', 'labelR', 'labelB']
    for c in range(5):   # 銘柄ごとの袋の山
        x = -0.26 + c * 0.16
        rows = 6 - abs(c - 1) if c < 3 else 5
        for k in range(rows):
            box(f'bag{c}{k}', 'kome' if k % 2 else 'komeKage', (0.13, 0.20, 0.032), (x, 0.06, 0.06 + k * 0.036), (0, 0, math.radians(3 if k % 2 else -3)))
            box(f'lab{c}{k}', labels[c], (0.03, 0.004, 0.02), (x - 0.035, -0.043, 0.06 + k * 0.036))
            box(f'ao{c}{k}', 'labelB', (0.06, 0.004, 0.006), (x + 0.025, -0.043, 0.065 + k * 0.036))   # 袋の青い印刷
    cyl('bou', 'hashira', 0.006, 1.0, (0.0, 0.18, 0.50), (0, math.pi / 2, 0), 8)
    for i in range(8):   # さがる値札
        x = -0.42 + i * 0.12
        box(f'mido{i}', 'momo', (0.10, 0.006, 0.05), (x, 0.17, 0.47))
        box(f'nedan{i}', 'nedan', (0.10, 0.006, 0.07), (x, 0.17, 0.41))
        box(f'nedanM{i}', 'nedanM', (0.07, 0.007, 0.016), (x, 0.168, 0.41))
    for k in range(3):   # 紙袋の30kgのお米
        box(f'kami{k}', 'kamibukuro', (0.16, 0.12, 0.07), (-0.48, -0.08, 0.035 + k * 0.072))
        box(f'kamiL{k}', 'nedan', (0.05, 0.004, 0.03), (-0.47, -0.141, 0.04 + k * 0.072))
        box(f'himo{k}', 'himo', (0.004, 0.122, 0.072), (-0.42, -0.08, 0.035 + k * 0.072))
    return dict(target=(-0.02, 0.04, 0.22), scale=1.0, el=14, az=-20, size=96)


MODELS = {'ricepia': ricepia, 'ricepia-uriba': ricepia_uriba}
pa.MODELS.clear()
pa.MODELS.update(MODELS)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        pa.make(name)

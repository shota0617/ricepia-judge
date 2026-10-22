# にしおさんぽGO：当店「らいすぴあ・秀幸」「近藤米穀店（本店）」の特大のドット絵（128×128。ほかの名所の 96 より細かく）と、お店のなかの絵を Blender で作る
# - 2026-10-22：運営者の写真（らいすぴあ：赤白の店・白いどんぶりに赤い米のマーク・米のドライブスルー／近藤米穀店：クリーム色の店・大きな赤い米）で作りなおした。
#   大きな「米」と 看板の字は、日本語の書体（IPAゴシック）で 字の形の板にする（小さい字は 点になる）。書体がなければ 字は描かない
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
    'pinkF': '#e8a0b4', 'paret': '#b8915a', 'cream': '#f1e08e', 'creamD': '#d8c46c', 'roadG': '#6a6a6a', 'gTreeD': '#3f7f34', 'riceR': '#d8262f', 'riceRD': '#a91c23',
})


FONT = next((f for f in ('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf') if os.path.exists(f)), None)


def moji(name, mat, text, size, loc, face='-y', bold=0.0):
    """壁に はった 字（Blender の文字を うすい板にする）。face：字の向き（-y 正面・-x 左の壁）。日本語の書体がなければ 何もしない"""
    if not FONT:
        return None
    rot = (math.pi / 2, 0, 0) if face == '-y' else (math.pi / 2, 0, -math.pi / 2)
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.body = text
    o.data.font = bpy.data.fonts.load(FONT, check_existing=True)
    o.data.size = size
    o.data.extrude = 0.002
    o.data.offset = bold   # 字を太く（小さい絵でも つぶれないように）
    o.data.align_x, o.data.align_y = 'CENTER', 'CENTER'
    bpy.ops.object.convert(target='MESH')
    o.data.materials.clear()
    o.data.materials.append(pa.material(mat))
    return o


import bpy  # noqa: E402  （pixel-art.py が先に読み込んでいる）

# らいすぴあの 赤：ふつうの 明るい色（白に近づける）だと 光の当たる面が ピンクに見えるので、明るい面も こい赤のまま（写真の 赤い店に合わせる）。
# らいすぴあ専用の材質（riceR・riceRD）の色だけ おきかえる（近藤米穀店などが使う akaR は ふつうのまま）
_tones = pa.tones
SHOP_TONES = {'#d8262f': [(150, 16, 26), (215, 38, 46), (236, 58, 60)], '#a91c23': [(110, 12, 18), (168, 28, 34), (196, 40, 44)]}
pa.tones = lambda h: SHOP_TONES.get(h) or _tones(h)


def ricepia():
    """らいすぴあ・秀幸（運営者の写真 2026年10月：店の正面とドライブスルー）。
    赤い2階ぶんの高さの店。左の壁に 白いどんぶりに赤い「米」のマーク、壁は赤い板を白いすじで区切った もよう。
    正面の上に 白い看板（赤い字の「らいすぴあ・秀幸」）、1階は ガラスの売り場（ポスターが はってある）と入口。
    右に 白い屋根の「米のドライブスルー」（赤い帯に白い字・左はしに IN の矢印と車のマーク・白い柱）。前は コンクリートの駐車場"""
    ground('concrete', 1.2, 0.9)
    for i in range(3):   # 駐車場の白線
        box(f'sen{i}', 'kanbanW', (0.012, 0.22, 0.004), (0.30 + i * 0.13, -0.30, 0.004))
    W, D, H, X0 = 0.46, 0.40, 0.40, -0.25   # 店の はば・おくゆき・高さ・まん中
    box('mise', 'riceR', (W, D, H), (X0, 0.10, H / 2))
    box('yaneF', 'riceR', (W + 0.02, D + 0.02, 0.012), (X0, 0.10, H + 0.006))   # 屋根の 赤いふち
    box('yane', 'yaneB', (W - 0.03, D - 0.03, 0.016), (X0, 0.10, H + 0.010))   # 屋根（灰色。白いと 赤が うすく見える）
    for i, (x, y) in enumerate(((X0 - 0.10, 0.18), (X0 + 0.05, 0.22), (X0 + 0.12, 0.05))):   # 屋根の上の 室外機
        box(f'shitsugai{i}', 'concrete', (0.05, 0.04, 0.03), (x, y, H + 0.03))
    # 左の壁（-x）：白いすじの もよう と、どんぶりの マーク
    lx = X0 - W / 2 - 0.002
    for y in (-0.06, 0.10, 0.26):
        box(f'lsenT{y}', 'kanbanW', (0.006, 0.011, H - 0.02), (lx, y, H / 2))
    box('lsenY', 'kanbanW', (0.006, D, 0.014), (lx, 0.10, 0.12))
    cyl('donburi', 'kanbanW', 0.085, 0.006, (lx - 0.002, 0.10, 0.27), (0, math.pi / 2, 0), 32)   # 白い まるの上に どんぶり
    box('donburiF', 'riceR', (0.006, 0.17, 0.05), (lx - 0.004, 0.10, 0.215))   # どんぶりの ふち（下の半分を赤く くぎる）
    for i, y in enumerate((0.05, 0.10, 0.15)):   # どんぶりに もった ごはんの 山
        sphere(f'gohan{i}', 'kanbanW', 0.03, (lx - 0.004, y, 0.34 + (0.01 if i == 1 else 0)), (0.2, 1, 0.8))
    box('lMado', 'glassB', (0.006, 0.08, 0.05), (lx, 0.24, 0.06))   # 左の壁の 小さな窓
    moji('komeL', 'riceR', '米', 0.11, (lx - 0.006, 0.10, 0.285), face='-x', bold=0.003)
    # 正面（-y）：上に 白い看板、すじの もよう、1階は ガラスの売り場
    fy = 0.10 - D / 2 - 0.002
    box('kanban', 'kanbanW', (W - 0.04, 0.012, 0.075), (X0, fy - 0.004, H - 0.05))
    moji('kanbanJ', 'riceR', 'らいすぴあ・秀幸', 0.042, (X0, fy - 0.011, H - 0.05), bold=0.001)
    for x in (X0 - W / 2 + 0.01, X0 + W / 2 - 0.01):
        box(f'fsenT{x}', 'kanbanW', (0.011, 0.006, H - 0.10), (x, fy, (H - 0.10) / 2))
    box('fsenY', 'kanbanW', (W, 0.006, 0.013), (X0, fy, 0.21))
    box('garasu', 'glassB', (W - 0.10, 0.008, 0.15), (X0 + 0.02, fy - 0.002, 0.09))   # 売り場の ガラス
    for i, (x, m) in enumerate(((-0.40, 'nedan'), (-0.33, 'kiiro'), (-0.26, 'nedan'), (-0.19, 'momo'), (-0.13, 'nedan'))):
        box(f'poster{i}', m, (0.045, 0.006, 0.06), (x + 0.04, fy - 0.006, 0.11))   # ポスター（字は描かない）
    box('iriguchi', 'sumi', (0.07, 0.006, 0.15), (X0 + W / 2 - 0.06, fy - 0.004, 0.075))   # 入口（自動ドア：2まいの ガラスと わく）
    for dx in (-0.017, 0.017):
        box(f'jido{dx}', 'glassB', (0.03, 0.008, 0.13), (X0 + W / 2 - 0.06 + dx, fy - 0.006, 0.07))
    box('matto', 'riceRD', (0.08, 0.04, 0.004), (X0 + W / 2 - 0.06, fy - 0.03, 0.004))   # 入口の 赤い マット
    for i, (x, m) in enumerate(((-0.42, 'labelB'), (-0.37, 'riceR'))):   # 左下の 白い板の 小さな はり紙
        box(f'hari{i}', 'kanbanW', (0.04, 0.006, 0.05), (x, fy - 0.002, 0.05))
        box(f'hariM{i}', m, (0.03, 0.007, 0.012), (x, fy - 0.003, 0.06))
    box('hisashi', 'riceRD', (W - 0.04, 0.05, 0.012), (X0, fy - 0.025, 0.185))   # 入口の上の 赤いひさし
    # 米のドライブスルー：店の右に 白い屋根、前の板に 赤い帯（白い字）、左はしに IN の矢印と 車のマーク
    rx0, rx1, ry = X0 + W / 2, 0.42, 0.08
    box('dtYane', 'kanbanW', (rx1 - rx0, 0.36, 0.025), ((rx0 + rx1) / 2, ry, 0.27))
    box('dtIta', 'kanbanW', (rx1 - rx0, 0.012, 0.075), ((rx0 + rx1) / 2, ry - 0.18, 0.245))
    box('dtObi', 'riceR', (rx1 - rx0 - 0.09, 0.014, 0.066), ((rx0 + rx1) / 2 + 0.045, ry - 0.187, 0.245))   # 写真のように 板の ほとんどが 赤
    moji('dtJi', 'kanbanW', '米のドライブスルー', 0.036, ((rx0 + rx1) / 2 + 0.05, ry - 0.195, 0.245))
    box('dtIN', 'riceR', (0.07, 0.014, 0.05), (rx0 + 0.05, ry - 0.187, 0.245))
    moji('dtINj', 'kanbanW', 'IN', 0.034, (rx0 + 0.045, ry - 0.195, 0.245))
    for x in (rx0 + 0.15, rx1 - 0.01):
        for y in (ry - 0.16, ry + 0.16):
            box(f'dtHashira{x}{y}', 'kanbanW', (0.022, 0.022, 0.26), (x, y, 0.13))
    box('dtMado', 'glassB', (0.006, 0.20, 0.10), (rx0 + 0.002, ry + 0.02, 0.10))   # ドライブスルーの 受けわたしの窓
    box('aoKanban', 'labelB', (0.05, 0.008, 0.07), (rx1 - 0.01, ry - 0.175, 0.13))   # 柱の 青い看板
    box('dtFuchi', 'riceR', (rx1 - rx0, 0.014, 0.008), ((rx0 + rx1) / 2, ry - 0.187, 0.286))   # 屋根の前の 赤い ふち
    for i in range(3):   # 屋根の下の 明かり
        box(f'akari{i}', 'kiiro', (0.03, 0.03, 0.006), (rx0 + 0.10 + i * 0.09, ry, 0.255))
    for i in range(2):   # 地面の 白い矢印（ドライブスルーの 進む向き）
        x = rx0 + 0.08 + i * 0.12
        box(f'yaB{i}', 'kanbanW', (0.05, 0.012, 0.003), (x, ry - 0.02, 0.012))
        box(f'yaH{i}', 'kanbanW', (0.012, 0.04, 0.003), (x + 0.025, ry - 0.02, 0.012), (0, 0, math.radians(45)))
    cyl('cone', 'riceR', 0.014, 0.04, (rx1 + 0.06, ry - 0.26, 0.022), verts=10, r2=0.002)   # 赤い コーン
    box('kurumadome', 'kiiro', (0.03, 0.03, 0.04), (rx1 + 0.03, ry - 0.20, 0.02))
    # 左前の 白い立て看板
    box('tate', 'kanbanW', (0.06, 0.012, 0.11), (X0 - W / 2 + 0.06, -0.26, 0.075))
    box('tateA', 'riceR', (0.05, 0.014, 0.02), (X0 - W / 2 + 0.06, -0.26, 0.11))
    return dict(target=(0.02, 0.0, 0.16), scale=1.12, el=28, size=128, vote=True, bands=5, inner=0.86)


def kondo():
    """近藤米穀店（本店。運営者の写真）：クリーム色の 2階建ての店。左の高い棟に 大きな赤い「米」と 電話番号（黒い2行）、
    1階は ガラスのシャッターと 緑のひさし。まん中に「近藤米穀店」の看板（クリーム地に黒い字）と ガラス戸、
    右の棟は 2階建てで 青い窓が ならび、1階に 青いひさしと 赤い「たばこ」の札、青緑の のぼり。
    左に「米のドライブスルー」の看板（白に 青い まるの 米）と 屋根。前に まるい木と 生けがき、街灯"""
    ground('concrete', 1.2, 0.9)
    box('michi', 'roadG', (1.2, 0.16, 0.004), (0, -0.40, 0.004))   # 前の道
    box('hodo', 'concrete', (1.2, 0.04, 0.012), (0, -0.30, 0.006))
    cream = 'cream'
    # 左の 高い棟
    lx, lw, ld, lh = -0.20, 0.28, 0.30, 0.46
    box('hidari', cream, (lw, ld, lh), (lx, 0.12, lh / 2))
    box('hidariY', 'creamD', (lw + 0.01, ld + 0.01, 0.012), (lx, 0.12, lh + 0.006))
    box('entotsu', 'kanbanW', (0.04, 0.04, 0.06), (lx - 0.03, 0.14, lh + 0.03))
    fy = 0.12 - ld / 2 - 0.002
    moji('kome', 'akaR', '米', 0.21, (lx - 0.02, fy - 0.004, 0.325), bold=0.006)
    for i, z in enumerate((0.205, 0.18)):   # 電話番号（黒い字の2行。細かいので 帯に）
        box(f'tel{i}', 'sumi', (0.07, 0.006, 0.012), (lx - 0.02, fy - 0.003, z))
    for x in (lx + 0.07, lx + 0.11):
        box(f'mado2{x}', 'glassB', (0.03, 0.006, 0.03), (x, fy - 0.002, 0.40))
    box('mado3', 'glassB', (0.09, 0.006, 0.025), (lx + 0.08, fy - 0.002, 0.255))   # 2階の よこ長の窓
    for x in (lx - lw / 2 + 0.004, lx + lw / 2 - 0.004):   # たての 雨どい
        box(f'amadoi{x}', 'kabe', (0.008, 0.008, lh - 0.01), (x, fy - 0.004, (lh - 0.01) / 2))
    box('parapet', 'creamD', (lw, 0.006, 0.012), (lx, fy - 0.002, lh - 0.012))
    box('shutter', 'glassB', (0.16, 0.006, 0.11), (lx + 0.02, fy - 0.003, 0.055))   # ガラスのシャッター
    for i in range(4):
        box(f'shK{i}', 'creamD', (0.16, 0.007, 0.004), (lx + 0.02, fy - 0.004, 0.02 + i * 0.03))
    box('midoriH', 'labelG', (0.18, 0.05, 0.014), (lx + 0.02, fy - 0.025, 0.125))   # 緑のひさし
    # まん中：入口と看板
    mx, mw = -0.01, 0.12
    box('naka', cream, (mw, 0.26, 0.30), (mx, 0.11, 0.15))
    fy2 = 0.11 - 0.13 - 0.002
    box('kanbanW', 'kanbanW', (0.20, 0.03, 0.06), (mx + 0.03, fy2 - 0.03, 0.18))
    box('kanbanC', cream, (0.19, 0.032, 0.05), (mx + 0.03, fy2 - 0.031, 0.18))
    moji('kanbanJ', 'sumi', '近藤米穀店', 0.034, (mx + 0.03, fy2 - 0.048, 0.18), bold=0.001)
    box('to', 'glassB', (0.11, 0.006, 0.12), (mx + 0.03, fy2 - 0.002, 0.06))   # ガラス戸
    box('toW', 'kanbanW', (0.004, 0.007, 0.12), (mx + 0.03, fy2 - 0.003, 0.06))
    box('poster', 'kiiro', (0.025, 0.007, 0.05), (mx - 0.01, fy2 - 0.004, 0.07))
    box('poster2', 'kanbanW', (0.02, 0.007, 0.04), (mx + 0.075, fy2 - 0.004, 0.07))
    box('genkanY', cream, (0.20, 0.07, 0.012), (mx + 0.03, fy2 - 0.035, 0.145))   # 入口の上の ひさし
    for i, x in enumerate((mx - 0.04, mx + 0.10)):   # 入口の 両がわの 植木ばち
        cyl(f'hachi{i}', 'kijiD', 0.012, 0.02, (x, fy2 - 0.03, 0.012), verts=10)
        sphere(f'ueki{i}', 'gTree', 0.016, (x, fy2 - 0.03, 0.032))
    box('matto', 'labelG', (0.07, 0.03, 0.004), (mx + 0.03, fy2 - 0.02, 0.004))
    # 右の 2階建ての棟
    rx, rw, rh = 0.26, 0.42, 0.36
    box('migi', cream, (rw, 0.30, rh), (rx, 0.12, rh / 2))
    box('migiY', 'creamD', (rw + 0.01, 0.31, 0.012), (rx, 0.12, rh + 0.006))
    fy3 = 0.12 - 0.15 - 0.002
    for i, x in enumerate((0.12, 0.20, 0.28, 0.36, 0.44)):   # 2階の 青い窓（白い わく）
        box(f'w2{i}', 'kanbanW', (0.05, 0.006, 0.06), (x, fy3, 0.27))
        box(f'g2{i}', 'glassB', (0.04, 0.007, 0.05), (x, fy3 - 0.001, 0.27))
    for i, x in enumerate((0.30, 0.38)):
        box(f'w1{i}', 'kanbanW', (0.05, 0.006, 0.06), (x, fy3, 0.12))
        box(f'g1{i}', 'glassB', (0.04, 0.007, 0.05), (x, fy3 - 0.001, 0.12))
    box('aoH', 'labelB', (0.12, 0.05, 0.014), (0.12, fy3 - 0.025, 0.15))   # 青いひさし
    box('tabako', 'akaR', (0.05, 0.008, 0.025), (0.14, fy3 - 0.004, 0.11))   # 赤い「たばこ」の札
    box('nobori', 'teal', (0.025, 0.006, 0.12), (0.20, fy3 - 0.03, 0.09))   # 青緑の のぼり
    cyl('noboriB', 'hashira', 0.004, 0.16, (0.188, fy3 - 0.03, 0.08), verts=6)
    for i, x in enumerate((0.40, 0.45)):   # エアコンの 室外機
        box(f'ac{i}', 'kabe', (0.04, 0.03, 0.035), (x, fy3 - 0.02, 0.02))
    box('parapetR', 'creamD', (rw, 0.006, 0.012), (rx, fy3, rh - 0.012))
    box('amadoiR', 'kabe', (0.008, 0.008, rh - 0.01), (rx + rw / 2 - 0.004, fy3 - 0.004, (rh - 0.01) / 2))
    # 左：米のドライブスルー（屋根と、白に 青い まるの 米の看板）
    box('dtYane', 'kanbanW', (0.12, 0.26, 0.02), (lx - lw / 2 - 0.06, 0.10, 0.20))
    box('dtOku', 'sumi', (0.10, 0.006, 0.17), (lx - lw / 2 - 0.06, 0.20, 0.085))
    cyl('dtPole', 'hashira', 0.006, 0.30, (lx - lw / 2 - 0.11, -0.10, 0.15), verts=6)
    box('dtKanban', 'kanbanW', (0.16, 0.012, 0.05), (lx - lw / 2 - 0.05, -0.10, 0.30))
    cyl('dtMaru', 'labelB', 0.018, 0.006, (lx - lw / 2 - 0.115, -0.108, 0.30), (math.pi / 2, 0, 0), 16)
    box('dtAka', 'akaR', (0.03, 0.013, 0.012), (lx - lw / 2 + 0.02, -0.10, 0.285))
    # 前：まるい木・生けがき・街灯・軽トラ
    gn.tree('ki', -0.56, 0.06, 0.95)   # 写真では 左はし（ドライブスルーの となり。店を かくさないように 少し おく）
    for i, x in enumerate((-0.38, -0.24, -0.10)):
        box(f'ikegaki{i}', 'gTreeD', (0.12, 0.05, 0.05), (x, -0.27, 0.025))
    box('ikegakiR', 'gTreeD', (0.08, 0.05, 0.05), (0.08, -0.27, 0.025))
    cyl('gaito', 'hashira', 0.006, 0.36, (0.15, -0.24, 0.18), verts=6)
    box('gaitoL', 'kanbanW', (0.03, 0.02, 0.012), (0.15, -0.25, 0.36))
    box('kei', 'kome', (0.10, 0.06, 0.05), (-0.42, 0.02, 0.035))   # 白い軽バン
    box('keiM', 'glassB', (0.04, 0.062, 0.02), (-0.385, 0.02, 0.055))
    box('bike', 'labelB', (0.05, 0.016, 0.03), (-0.30, -0.12, 0.03))   # 青い バイク
    for x in (-0.32, -0.28):
        cyl(f'bikeT{x}', 'sumi', 0.01, 0.006, (x, -0.12, 0.01), (math.pi / 2, 0, 0), 10)
    for i, x in enumerate((-0.37, -0.22, -0.08, 0.06)):   # 生けがきの 赤い花
        sphere(f'hana{i}', 'akaR', 0.008, (x, -0.29, 0.052))
    for i in range(6):   # 道の まん中の 白い点線
        box(f'senD{i}', 'kanbanW', (0.06, 0.01, 0.003), (-0.5 + i * 0.2, -0.40, 0.008))
    return dict(target=(0.02, 0.0, 0.16), scale=1.16, el=24, size=128, vote=True, bands=5, inner=0.86)


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


MODELS = {'ricepia': ricepia, 'kondo': kondo, 'ricepia-uriba': ricepia_uriba}
pa.MODELS.clear()
pa.MODELS.update(MODELS)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        pa.make(name)

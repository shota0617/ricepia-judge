# にしおさんぽGO：ドット絵の地図に置く小物（生きもの・道ばたの物・水辺や浜の物）を Blender で作る
# - 題材40 × 向き4 × ポーズ・置き方6 ＝ 960 の立体を、16×16 の「材質の番号」と「明るさの段」にして TMP に保存する（背景なし）
#   → tools/blender/deco-sheets.py で 色8通り × 季節4 をのせて、ちがう絵だけで3万枚以上（nishio-go/deco/）
# - 色8通りは、その題材らしいちがい（鳥や鴨は種類、猫や犬は毛の色、かかしや人は服、花は花の色、舟は船体の色）
# - 斜め上（南）から見下ろす。地図のマス（家・木）と同じ向き・同じ光
# 使い方：python tools/blender/deco.py [--part i/n]（bpy が要る。n 個に分けて並べて動かせる）→ python3 tools/blender/deco-sheets.py
import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('dots3d', os.path.join(HERE, 'dots3d.py'))
D3 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D3)
PA = D3.PA
import bpy  # noqa: E402

N, SS = 16, 4
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-deco')
BANDS = (0.42, 0.80)
EL = 42


def B(m, size, loc, rot=(0, 0, 0), bevel=0.0):
    return PA.box('o', m, size, loc, rot, bevel)


def Cy(m, r, h, loc, rot=(0, 0, 0), v=8, r2=None):
    return PA.cyl('o', m, r, h, loc, rot, v, r2)


def Sp(m, r, loc, sc=(1, 1, 1)):
    return PA.sphere('o', m, r, loc, sc)


# ---------- 生きもの（前は -y ＝ 手前） ----------
def bird(k, size, neck, legs, body='hane', sub='hara', beak='kuchi', leg='ashi'):
    """鳥。k：0 立つ・1 歩く・2 えさをつつく・3 首をのばす・4 すわる・5 羽をひろげる"""
    s = size
    lz = 0 if k == 4 else legs * s
    if k != 4:
        for side in (-1, 1):
            dy = 0.03 * s * side if k == 1 else 0
            Cy(leg, 0.012 * s, lz, (side * 0.04 * s, dy, lz / 2), v=5)
    Sp(body, 0.12 * s, (0, 0.02 * s, lz + 0.09 * s), (0.85, 1.25, 0.8))
    Sp(sub, 0.09 * s, (0, -0.03 * s, lz + 0.06 * s), (0.8, 1.0, 0.6))
    Cy(body, 0.03 * s, 0.14 * s, (0, 0.16 * s, lz + 0.11 * s), (1.2, 0, 0), 6, r2=0.005)   # 尾
    hy, hz = -0.1 * s, lz + 0.16 * s + neck * s
    if k == 2:
        hy, hz = -0.16 * s, lz + 0.05 * s
    if k == 3:
        hz += 0.08 * s
    if neck:
        Cy(body, 0.025 * s, abs(hz - (lz + 0.12 * s)) + 0.02, (0, (hy - 0.06 * s) / 2, (hz + lz + 0.12 * s) / 2), (0.25 if k != 2 else 1.0, 0, 0), 6)
    Sp(body, 0.055 * s, (0, hy, hz))
    Cy(beak, 0.016 * s, (0.08 + neck * 0.3) * s, (0, hy - 0.06 * s, hz - (0.03 * s if k == 2 else 0)), (1.57 if k != 2 else 2.2, 0, 0), 5, r2=0.002)
    if k == 5:
        for side in (-1, 1):
            B(body, (0.22 * s, 0.12 * s, 0.015), (side * 0.18 * s, 0.03 * s, lz + 0.15 * s), (0, side * 0.5, 0))


def duck(k, s=1.0):
    """鴨（水に浮かぶ・田んぼを歩く）。k：0 浮く・1 首をまわす・2 さかだち・3 二羽・4 ねむる・5 羽ばたく"""
    def one(x, y, kk):
        if kk == 2:   # さかだち（おしりと尾だけ）
            Sp('hane', 0.08 * s, (x, y, 0.03 * s), (0.9, 1.1, 0.8))
            Cy('hane', 0.03 * s, 0.1 * s, (x, y + 0.03 * s, 0.11 * s), (0.3, 0, 0), 6, r2=0.005)
            return
        Sp('hane', 0.11 * s, (x, y + 0.02 * s, 0.05 * s), (0.85, 1.3, 0.7))
        Sp('hara', 0.07 * s, (x, y + 0.1 * s, 0.07 * s), (0.9, 0.7, 0.6))
        hy = y - 0.11 * s if kk != 4 else y - 0.02 * s
        hx = x + (0.05 * s if kk == 1 else 0)
        Sp('atama', 0.055 * s, (hx, hy, (0.15 if kk != 4 else 0.1) * s))
        Cy('kuchi', 0.022 * s, 0.07 * s, (hx, hy - 0.06 * s, (0.14 if kk != 4 else 0.09) * s), (1.57, 0, 0), 6, r2=0.012 * s)
        if kk == 5:
            for side in (-1, 1):
                B('hane', (0.18 * s, 0.1 * s, 0.015), (x + side * 0.14 * s, y, 0.12 * s), (0, side * 0.6, 0))
    if k == 3:
        one(-0.12, 0.06, 0)
        one(0.12, -0.06, 1)
    else:
        one(0, 0, k)


def quad(k, s, ears, tail):
    """四つ足（猫・犬）。k：0 立つ・1 歩く・2 すわる・3 ねむる（まるくなる）・4 のびをする・5 ふりむく"""
    if k == 3:
        Sp('ke', 0.15 * s, (0, 0, 0.07 * s), (1.2, 1.0, 0.55))
        Sp('ke', 0.07 * s, (0.1 * s, -0.08 * s, 0.09 * s))
        Cy('ke', 0.025 * s, 0.25 * s, (-0.02 * s, -0.12 * s, 0.04 * s), (0, 1.57, 0.3), 6)
        return
    sit = k == 2
    lz = 0.14 * s
    if not sit:
        for i, (x, y) in enumerate(((-0.06, -0.1), (0.06, -0.1), (-0.06, 0.1), (0.06, 0.1))):
            dy = (0.03 if (i % 2) ^ (i // 2) else -0.03) * s if k == 1 else 0
            Cy('ashi', 0.022 * s, lz, (x * s, y * s + dy, lz / 2), v=6)
        by, bz, sy = 0, lz + 0.06 * s, (0.75, 1.5, 0.7) if k != 4 else (0.75, 1.6, 0.55)
        Sp('ke', 0.11 * s, (0, by, bz), sy)
        Sp('hara', 0.08 * s, (0, by, bz - 0.04 * s), (0.7, 1.3, 0.5))
        hy, hz = -0.17 * s, bz + 0.07 * s
        if k == 4:
            hz -= 0.08 * s
        tz = bz + 0.04 * s
    else:
        Sp('ke', 0.12 * s, (0, 0.04 * s, 0.1 * s), (0.85, 1.0, 1.1))
        Sp('hara', 0.08 * s, (0, -0.04 * s, 0.1 * s), (0.7, 0.6, 1.0))
        for x in (-0.05, 0.05):
            Cy('ashi', 0.02 * s, 0.1 * s, (x * s, -0.07 * s, 0.05 * s), v=6)
        hy, hz, tz = -0.03 * s, 0.26 * s, 0.05 * s
    hx = 0.06 * s if k == 5 else 0
    Sp('ke', 0.075 * s, (hx, hy, hz))
    Sp('hana', 0.03 * s, (hx, hy - 0.06 * s, hz - 0.02 * s), (1.2, 1, 0.8))
    for side in (-1, 1):
        if ears == 'cat':
            Cy('ke', 0.03 * s, 0.06 * s, (hx + side * 0.045 * s, hy, hz + 0.07 * s), v=4, r2=0.0)
        else:
            Sp('mimi', 0.03 * s, (hx + side * 0.06 * s, hy + 0.01 * s, hz + 0.02 * s), (0.6, 0.5, 1.4))
    Cy('ke', 0.02 * s, 0.18 * s, (0, 0.2 * s, tz + 0.03 * s), (-1.25 if tail == 'cat' else -1.4, 0, 0), 6)   # しっぽは後ろへ（前から見て棒に見えないように）


def person(k, cloth='fuku', hat='boushi', s=0.55):
    """人（農家・子ども・つり人）。k：0 立つ・1 歩く・2 かがむ・3 手をふる・4 道具を持つ・5 すわる"""
    lz = 0.42 * s if k not in (2, 5) else 0.22 * s
    for side in (-1, 1):
        dy = 0.04 * s * side if k == 1 else 0
        B('zubon', (0.09 * s, 0.1 * s, lz), (side * 0.07 * s, dy, lz / 2))
    bz = lz + 0.2 * s
    tilt = 0.5 if k == 2 else 0
    B(cloth, (0.3 * s, 0.18 * s, 0.4 * s), (0, -0.04 * s if k == 2 else 0, bz), (tilt, 0, 0), bevel=0.02)
    for side in (-1, 1):
        up = k == 3 and side == 1
        B(cloth, (0.07 * s, 0.08 * s, 0.32 * s), (side * 0.19 * s, 0, bz + (0.2 * s if up else 0)), (0, side * (0.12 if not up else 2.6), 0))
    hz = bz + 0.32 * s - (0.08 * s if k == 2 else 0)
    hy = -0.08 * s if k == 2 else 0
    Sp('hada', 0.12 * s, (0, hy, hz))
    Cy(hat, 0.22 * s, 0.05 * s, (0, hy, hz + 0.11 * s), v=12, r2=0.03 * s)
    if k == 4:   # 鍬・竿
        Cy('dougu', 0.012, 0.7 * s, (0.26 * s, -0.1 * s, bz), (0.5, 0.2, 0), 5)


# ---------- 題材（どれも k＝0〜5 の6通り） ----------
def s_sagi(k):      # 白鷺・青鷺など（田んぼ・水辺）
    bird(k, 1.6, 0.12, 0.16)


def s_kotori(k):    # 小鳥（すずめ・せきれい・かわせみ など）
    if k in (3, 5):
        for i, (x, y) in enumerate(((-0.14, 0.05), (0.13, -0.06), (0.0, 0.14))[: 2 if k == 3 else 3]):
            for o in _grab(lambda: bird(i % 3, 0.9, 0, 0.05)):
                o.location.x += x
                o.location.y += y
    else:
        bird(k, 1.0, 0, 0.06)


def _grab(fn):
    before = set(bpy.data.objects)
    fn()
    return list(set(bpy.data.objects) - before)


def s_kamo(k):      # 鴨
    duck(k, 1.25)


def s_kamome(k):    # かもめ・あじさし・う
    bird(k, 1.25, 0.02, 0.08)


def s_neko(k):
    quad(k, 1.15, 'cat', 'cat')


def s_inu(k):
    quad(k, 1.35, 'dog', 'dog')


def s_kaeru(k):     # かえる（田んぼ）
    s = 1.1 + 0.1 * (k % 2)
    Sp('kawa', 0.09 * s, (0, 0.02, 0.06 * s), (1.1, 1.1, 0.7))
    for side in (-1, 1):
        Sp('me', 0.03 * s, (side * 0.045 * s, -0.05, 0.11 * s))
        Sp('kawa', 0.04 * s, (side * 0.09 * s, 0.06, 0.03 * s), (0.8, 1.5, 0.6))
    if k >= 3:   # はすの葉や石の上
        Cy('ha' if k != 4 else 'ishi', 0.17, 0.02, (0, 0, -0.005), v=12)


def s_choucho(k):   # ちょうちょ・とんぼ（花のまわり）
    z = 0.25 + 0.05 * k
    if k % 2 == 0:
        for side in (-1, 1):
            B('hane', (0.12, 0.1, 0.01), (side * 0.07, 0, z), (0, side * (0.3 + 0.1 * k), 0))
        Cy('kuro', 0.012, 0.1, (0, 0, z), (1.57, 0, 0), 5)
    else:
        Cy('hane', 0.012, 0.22, (0, 0, z), (1.57, 0, 0), 5)
        for side in (-1, 1):
            B('hane2', (0.13, 0.03, 0.005), (side * 0.07, -0.04, z + 0.01))
            B('hane2', (0.11, 0.03, 0.005), (side * 0.06, 0.0, z + 0.01))
    Sp('hana', 0.04, (0.15, 0.1, 0.03))


def s_kakashi(k):   # かかし
    Cy('bou', 0.02, 0.6, (0, 0, 0.3), v=6)
    Cy('bou', 0.015, 0.5, (0, 0, 0.46), (0, 1.57 + 0.15 * (k % 3 - 1), 0), 6)
    B('fuku', (0.24, 0.1, 0.24), (0, 0, 0.4), bevel=0.02)
    Sp('kao', 0.08, (0, 0, 0.6))
    Cy('kasa', 0.15 + 0.02 * (k % 2), 0.04, (0, 0, 0.68), v=12, r2=0.02)
    if k >= 3:
        Sp('kotori_k', 0.03, (0.2, 0, 0.5))
    if k == 5:
        Cy('kuro', 0.012, 0.3, (0.15, -0.05, 0.25), (0.3, 0.6, 0), 5)


def s_hazakake(k):  # はざかけ（刈った稲を干す）
    w = 0.5 + 0.08 * (k % 3)
    for x in (-w / 2, w / 2):
        for a in (-0.3, 0.3):
            Cy('take', 0.012, 0.5, (x, a * 0.12, 0.24), (a, 0, 0), 5)
    Cy('take', 0.014, w + 0.1, (0, 0, 0.42), (0, 1.57, 0), 5)
    for i in range(int(w / 0.07)):
        x = -w / 2 + 0.04 + i * 0.07
        B('wara', (0.06, 0.06, 0.2), (x, -0.01, 0.33))
    if k >= 3:
        Cy('wara', 0.06, 0.18, (w / 2 + 0.14, 0.05, 0.09), v=8, r2=0.02)


def s_warazuka(k):  # わらぐろ（わらの山）
    n = 1 + k % 3
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.24
        Cy('wara', 0.11, 0.2, (x, 0.04 * (i % 2), 0.1), v=10)
        Cy('wara', 0.12, 0.12, (x, 0.04 * (i % 2), 0.26), v=10, r2=0.0)
    if k >= 3:
        Cy('bou', 0.012, 0.36, (0.3, -0.1, 0.18), (0.4, 0, 0.3), 5)


def s_noufu(k):
    person(k, 'fuku', 'mugiwara', 0.6)


def s_kodomo(k):
    person(k, 'fuku', 'boushi', 0.42)


def s_tsuri(k):     # つり人（浜・岸）
    person(5 if k % 2 else 0, 'fuku', 'boushi', 0.55)
    Cy('dougu', 0.008, 0.8, (0.18, -0.25, 0.4), (0.9, 0, 0.2 * (k - 2)), 5)
    if k >= 2:
        B('baketsu', (0.1, 0.1, 0.08), (-0.22, -0.05, 0.04))


def s_jizo(k):      # お地蔵さま（赤いよだれかけ）
    n = 1 + (k % 3)
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.22
        Cy('ishi', 0.07, 0.22, (x, 0, 0.11), v=10)
        Sp('ishi', 0.065, (x, 0, 0.27))
        Cy('yodare', 0.075, 0.07, (x, -0.005, 0.18), v=10, r2=0.06)
        if k >= 3:
            Cy('kasa', 0.1, 0.03, (x, 0, 0.34), v=10, r2=0.01)
    B('dai', (0.22 * n + 0.08, 0.16, 0.04), (0, 0, -0.01))


def s_hokora(k):    # 小さなほこら
    B('kabe', (0.3, 0.22, 0.22), (0, 0, 0.17), bevel=0.01)
    D3.roof('o', 'yane', 0, 0, 0.28, 0.4, 0.34, 0.12)
    B('dai', (0.4, 0.3, 0.06), (0, 0, 0.03))
    if k % 2:
        Cy('torii', 0.015, 0.3, (-0.25, -0.18, 0.15), v=5)
        Cy('torii', 0.015, 0.3, (0.25, -0.18, 0.15), v=5)
        B('torii', (0.6, 0.03, 0.03), (0, -0.18, 0.31))
    if k >= 2:
        B('nobori', (0.06, 0.01, 0.26), (0.3 if k < 4 else -0.3, 0.05, 0.3))


def s_tourou(k):    # 石灯籠
    n = 1 if k < 3 else 2
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.36
        Cy('ishi', 0.04, 0.22, (x, 0, 0.11), v=6)
        B('ishi', (0.14, 0.14, 0.1), (x, 0, 0.27))
        B('akari', (0.08, 0.15, 0.05), (x, 0, 0.27))
        Cy('kasa', 0.12, 0.06, (x, 0, 0.35), v=6, r2=0.02)
    if k % 3 == 1:
        Sp('koke', 0.07, (0.2, 0.1, 0.02), (1.4, 1, 0.4))


def s_douhyou(k):   # 道しるべの看板
    Cy('bou', 0.02, 0.45, (0, 0, 0.22), v=6)
    for i in range(1 + k % 3):
        B('kanban', (0.3, 0.02, 0.08), ((0.08 if i % 2 else -0.08), 0, 0.4 - i * 0.1), (0, 0, (0.2 if i % 2 else -0.2)))
    if k >= 3:
        Sp('kusa', 0.06, (0.1, -0.05, 0.02), (1.3, 1, 0.5))


def s_hana(k):      # 野の花のかたまり
    for i in range(4 + k):
        a = i * 2.4 + k
        r = 0.06 + 0.04 * (i % 3)
        x, y = r * math.cos(a), r * math.sin(a)
        Cy('kuki', 0.008, 0.12, (x, y, 0.06), v=4)
        Sp('hana' if i % 3 else 'hana2', 0.035, (x, y, 0.13))
    Sp('kusa', 0.08, (0.02, 0.05, 0.02), (1.6, 1, 0.4))


def s_ajisai(k):    # あじさい
    n = 1 + k % 3
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.22
        Sp('ha', 0.12, (x, 0.03, 0.1), (1.1, 1, 0.8))
        for j in range(3):
            Sp('hana' if (i + j) % 2 else 'hana2', 0.055, (x + (j - 1) * 0.06, -0.04, 0.17 + 0.02 * (j % 2)))
    if k >= 3:
        Cy('kasa', 0.12, 0.01, (0.25, -0.1, 0.3), v=10, r2=0.0)


def s_himawari(k):  # ひまわり
    n = 1 + k % 3
    for i in range(n):
        x, h = (i - (n - 1) / 2) * 0.16, 0.35 + 0.07 * ((i + k) % 3)
        Cy('kuki', 0.012, h, (x, 0, h / 2), v=5)
        B('ha', (0.1, 0.02, 0.05), (x + 0.04, 0, h * 0.5), (0, 0.5, 0))
        Cy('hana', 0.07, 0.015, (x, -0.02, h), (1.3, 0, 0), 12)
        Cy('tane', 0.035, 0.02, (x, -0.03, h), (1.3, 0, 0), 10)


def s_kosumosu(k):  # コスモス
    for i in range(5 + k):
        a = i * 2.1 + k * 0.7
        r = 0.05 + 0.05 * (i % 3)
        x, y = r * math.cos(a), r * math.sin(a)
        h = 0.2 + 0.04 * (i % 3)
        Cy('kuki', 0.007, h, (x, y, h / 2), v=4)
        Cy('hana' if i % 2 else 'hana2', 0.035, 0.01, (x, y, h), (1.2, 0, 0), 8)


def s_kinoko(k):    # 切り株ときのこ
    Cy('kirikabu', 0.12, 0.1, (0, 0.04, 0.05), v=10)
    for i in range(1 + k % 4):
        x = -0.12 + i * 0.08
        Cy('jiku', 0.012, 0.05, (x, -0.1, 0.025), v=5)
        Sp('kasa', 0.03, (x, -0.1, 0.055), (1, 1, 0.6))
    if k >= 4:
        Sp('koke', 0.06, (0.12, 0.08, 0.1), (1.3, 1, 0.4))


def s_iwa(k):       # 苔むした岩
    for i in range(1 + k % 3):
        Sp('ishi', 0.12 - i * 0.03, (-0.1 + i * 0.13, 0.03 * i, 0.05), (1.3, 1, 0.75))
    if k >= 3:
        Sp('koke', 0.07, (-0.08, 0, 0.11), (1.3, 1, 0.4))


def s_bench(k):
    B('za', (0.4, 0.12, 0.02), (0, 0, 0.13))
    if k % 2 == 0:
        B('za', (0.4, 0.02, 0.12), (0, 0.06, 0.2))
    for x in (-0.17, 0.17):
        B('kuro', (0.02, 0.1, 0.13), (x, 0, 0.065))
    if k >= 2:
        B('kaban', (0.08, 0.06, 0.06), (0.1 if k < 4 else -0.1, 0, 0.17))
    if k == 5:
        Sp('kotori_k', 0.03, (-0.12, 0, 0.17))


def s_ueki(k):      # 植木鉢のならび（町なか）
    n = 2 + k % 3
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.13
        Cy('hachi', 0.05, 0.07, (x, 0, 0.035), v=8, r2=0.04)
        Sp('ha', 0.05, (x, 0, 0.1))
        Sp('hana', 0.025, (x + 0.02, -0.03, 0.13))
    if k >= 3:
        B('dai', (0.13 * n, 0.12, 0.03), (0, 0, -0.005))


def s_jitensha(k):  # 自転車
    for y in (-0.15, 0.15):
        Cy('kuro', 0.08, 0.015, (0, y, 0.08), (0, 1.57, 0), 12)
    B('frame', (0.02, 0.28, 0.02), (0, 0, 0.14))
    B('frame', (0.02, 0.02, 0.14), (0, 0.06, 0.18))
    B('frame', (0.12, 0.02, 0.02), (0, -0.13, 0.22))
    B('kuro', (0.04, 0.08, 0.02), (0, 0.06, 0.25))
    if k % 2:
        B('kago', (0.1, 0.08, 0.06), (0, -0.2, 0.19))
    if k >= 4:
        for o in _grab(lambda: [Cy('kuro', 0.08, 0.015, (0.22, y, 0.08), (0, 1.57, 0), 12) for y in (-0.15, 0.15)] + [B('frame', (0.02, 0.28, 0.02), (0.22, 0, 0.14))]):
            pass


def s_jihanki(k):   # 自動販売機
    n = 1 + k % 2
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.2
        B('karada', (0.18, 0.12, 0.34), (x, 0, 0.17))
        B('mado', (0.14, 0.01, 0.12), (x, -0.061, 0.24))
        B('kuro', (0.1, 0.01, 0.03), (x, -0.061, 0.06))
    if k >= 2:
        B('gomi', (0.08, 0.08, 0.12), (0.2 + 0.1 * (n - 1), 0, 0.06))


def s_chouchin(k):  # ちょうちん（祭りの提灯）
    Cy('bou', 0.015, 0.5, (-0.2, 0, 0.25), v=5)
    Cy('bou', 0.015, 0.5, (0.2, 0, 0.25), v=5)
    B('bou', (0.44, 0.015, 0.015), (0, 0, 0.47))
    for i in range(1 + k % 3):
        x = -0.12 + i * 0.12 if k % 3 else 0
        Cy('chouchin', 0.045, 0.1, (x, 0, 0.38), v=10)
        Cy('kuro', 0.03, 0.012, (x, 0, 0.44), v=8)


def s_gomi(k):      # ごみの分別箱
    n = 2 + k % 3
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.13
        B('hako' if i % 2 else 'hako2', (0.11, 0.11, 0.15), (x, 0, 0.075), bevel=0.01)
        B('kuro', (0.06, 0.01, 0.02), (x, -0.056, 0.12))
    if k >= 3:
        B('ami', (0.13 * n, 0.14, 0.01), (0, 0, 0.17))


def s_sanrinsha(k):  # 三輪車と子どもの遊び道具
    Cy('kuro', 0.06, 0.02, (0, -0.1, 0.06), (0, 1.57, 0), 10)
    for x in (-0.08, 0.08):
        Cy('kuro', 0.04, 0.02, (x, 0.1, 0.04), (0, 1.57, 0), 8)
    B('frame', (0.03, 0.22, 0.03), (0, 0, 0.1))
    B('za', (0.07, 0.06, 0.02), (0, 0.05, 0.15))
    B('frame', (0.12, 0.02, 0.02), (0, -0.1, 0.19))
    if k >= 2:
        Sp('booru', 0.05, (0.2, -0.05, 0.05))
    if k >= 4:
        B('baketsu', (0.08, 0.08, 0.07), (-0.2, 0.05, 0.035))


def s_kasa(k):      # ビーチパラソル
    Cy('bou', 0.012, 0.45, (0, 0, 0.22), (0.15, 0.1 * (k - 2), 0), 5)
    Cy('kasa', 0.26, 0.08, (0.02 * (k - 2), -0.03, 0.44), (0.15, 0.1 * (k - 2), 0), 8, r2=0.02)
    if k % 2:
        B('sheet', (0.3, 0.2, 0.01), (0.1, 0.12, 0.005))
    if k >= 3:
        B('box', (0.1, 0.07, 0.07), (-0.2, 0.1, 0.035))


def s_fune(k):      # 漁船（水の上）
    L = 0.6 + 0.05 * (k % 3)
    hull = Cy('sentai', 0.13, L, (0, 0, 0.05), (1.57, 0, 0), 12)
    hull.scale = (1, 0.55, 1)
    B('kanpan', (0.2, L * 0.85, 0.02), (0, 0, 0.09))
    B('kabe', (0.14, 0.14, 0.12), (0, 0.08, 0.15))
    B('mado', (0.12, 0.01, 0.04), (0, 0.01, 0.17))
    if k >= 3:
        Cy('bou', 0.01, 0.3, (0, -0.15, 0.24), v=5)
        B('hata', (0.08, 0.01, 0.05), (0.04, -0.15, 0.36))


def s_boto(k):      # 手こぎのボート・小舟
    hull = Cy('sentai', 0.11, 0.42, (0, 0, 0.04), (1.57, 0, 0), 10)
    hull.scale = (1, 0.5, 1)
    B('za', (0.18, 0.04, 0.02), (0, 0.02, 0.08))
    for side in (-1, 1):
        Cy('dougu', 0.008, 0.3, (side * 0.14, 0.02, 0.07), (0, 1.57, side * 0.3 * (k % 3 - 1)), 4)
    if k >= 3:
        person(5, 'fuku', 'boushi', 0.32)


def s_bui(k):       # ブイ（浮き）と目じるしの旗
    for i in range(1 + k % 3):
        x = -0.15 + i * 0.15
        Sp('bui', 0.06, (x, 0.05 * (i % 2), 0.03), (1, 1, 0.8))
    Cy('bou', 0.008, 0.3, (0.15, -0.05, 0.15), v=4)
    B('hata', (0.08, 0.01, 0.05), (0.19, -0.05, 0.27))
    if k >= 3:
        Cy('ami', 0.004, 0.4, (0, 0, 0.02), (0, 1.57, 0.4), 4)


def s_hasu(k):      # はす（池）
    for i in range(3 + k % 3):
        a = i * 2.2 + k
        x, y = 0.15 * math.cos(a), 0.12 * math.sin(a)
        Cy('ha', 0.08 - 0.01 * (i % 3), 0.01, (x, y, 0.005), v=10)
    for i in range(1 + k % 2):
        Cy('kuki', 0.008, 0.18, (0.04 - i * 0.1, 0.02, 0.09), v=4)
        Sp('hana', 0.045, (0.04 - i * 0.1, 0.02, 0.2), (1, 1, 0.9))
    if k >= 4:
        Sp('tsubomi', 0.03, (-0.15, -0.05, 0.12), (0.8, 0.8, 1.3))


def s_kani(k):      # かに（浜）
    n = 1 + (k >= 3)
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.25
        Sp('kara', 0.07, (x, 0, 0.04), (1.4, 1, 0.5))
        for side in (-1, 1):
            Sp('kara', 0.03, (x + side * 0.1, -0.06, 0.05 + 0.03 * (k % 2)), (1.2, 1, 0.8))
            for j in range(3):
                Cy('kara', 0.008, 0.08, (x + side * 0.08, 0.02 * j, 0.02), (0, 1.57, side * 0.5), 4)


def s_sunashiro(k):  # 砂の城とバケツ
    Cy('suna2', 0.12, 0.1, (0, 0.03, 0.05), v=8)
    Cy('suna2', 0.06, 0.1, (0, 0.03, 0.15), v=8)
    if k % 2:
        Cy('suna2', 0.03, 0.06, (0, 0.03, 0.23), v=6, r2=0.0)
    B('baketsu', (0.09, 0.09, 0.08), (0.2, -0.08, 0.04))
    if k >= 2:
        Cy('dougu', 0.01, 0.15, (-0.18, -0.06, 0.02), (0, 1.57, 0.4 * (k - 3)), 4)
        B('baketsu', (0.05, 0.04, 0.01), (-0.24, -0.1, 0.01))


def s_picnic(k):    # 芝生のピクニック（しき物とかご）
    B('sheet', (0.42, 0.34, 0.01), (0, 0, 0.005))
    B('kago', (0.1, 0.08, 0.07), (0.1, 0.05, 0.04))
    if k % 2:
        Cy('nomimono', 0.025, 0.06, (-0.08, -0.05, 0.035), v=6)
    if k >= 2:
        Sp('booru', 0.04, (-0.25, 0.15, 0.04))
    if k >= 4:
        Cy('kasa', 0.18, 0.05, (-0.1, 0.12, 0.3), v=8, r2=0.02)
        Cy('bou', 0.008, 0.3, (-0.1, 0.12, 0.15), v=4)


def s_tanuki(k):    # たぬきの置物（お店や家の前）
    s = 0.9 + 0.1 * (k % 3)
    Sp('tanuki', 0.11 * s, (0, 0, 0.1 * s), (1, 0.9, 1.0))
    Sp('hara', 0.08 * s, (0, -0.05 * s, 0.09 * s))
    Sp('tanuki', 0.07 * s, (0, -0.01 * s, 0.24 * s))
    Cy('kasa', 0.1 * s, 0.03 * s, (0, -0.01 * s, 0.31 * s), v=10, r2=0.01)
    Cy('tokkuri', 0.03 * s, 0.08 * s, (0.1 * s, -0.04 * s, 0.1 * s), v=6, r2=0.015)
    if k >= 3:
        B('dai', (0.26, 0.22, 0.03), (0, 0, -0.005))


def s_suimon(k):    # 田んぼの水門・用水のバルブ
    B('concrete', (0.3, 0.12, 0.12), (0, 0, 0.06))
    Cy('handle', 0.05, 0.015, (0, 0, 0.16), v=10)
    Cy('handle', 0.01, 0.06, (0, 0, 0.13), v=4)
    if k % 2:
        B('ita', (0.12, 0.02, 0.14), (0.2, -0.02, 0.07))
    if k >= 2:
        B('mizu_d', (0.12, 0.3, 0.005), (0, -0.2, 0.002))


def s_karasu(k):    # からす（田んぼ・町）
    bird(k, 1.1, 0, 0.07)


SUBJECTS = [   # （名前、作る関数）— 順番は deco-sheets.py と pixel.js の置き場所の表と同じ
    ('sagi', s_sagi), ('kotori', s_kotori), ('kamo', s_kamo), ('kamome', s_kamome), ('neko', s_neko), ('inu', s_inu),
    ('kaeru', s_kaeru), ('choucho', s_choucho), ('kakashi', s_kakashi), ('hazakake', s_hazakake), ('warazuka', s_warazuka),
    ('noufu', s_noufu), ('kodomo', s_kodomo), ('tsuri', s_tsuri), ('jizo', s_jizo), ('hokora', s_hokora), ('tourou', s_tourou),
    ('douhyou', s_douhyou), ('hana', s_hana), ('ajisai', s_ajisai), ('himawari', s_himawari), ('kosumosu', s_kosumosu),
    ('kinoko', s_kinoko), ('iwa', s_iwa), ('bench', s_bench), ('ueki', s_ueki), ('jitensha', s_jitensha), ('jihanki', s_jihanki),
    ('chouchin', s_chouchin), ('gomi', s_gomi), ('sanrinsha', s_sanrinsha), ('kasa', s_kasa), ('fune', s_fune), ('boto', s_boto),
    ('bui', s_bui), ('hasu', s_hasu), ('kani', s_kani), ('sunashiro', s_sunashiro), ('picnic', s_picnic), ('tanuki', s_tanuki),
    ('suimon', s_suimon), ('karasu', s_karasu),
]


# 題材ごとの写す大きさ（カメラが写す幅。小さい生きものほど大きく写す）
SCALE = {'sagi': 0.72, 'kotori': 0.42, 'kamo': 0.5, 'kamome': 0.48, 'neko': 0.5, 'inu': 0.58, 'kaeru': 0.4, 'choucho': 0.5, 'kakashi': 0.78,
         'hazakake': 0.78, 'warazuka': 0.7, 'noufu': 0.7, 'kodomo': 0.56, 'tsuri': 0.8, 'jizo': 0.62, 'hokora': 0.66, 'tourou': 0.62,
         'douhyou': 0.6, 'hana': 0.42, 'ajisai': 0.6, 'himawari': 0.6, 'kosumosu': 0.46, 'kinoko': 0.42, 'iwa': 0.5, 'bench': 0.56,
         'ueki': 0.52, 'jitensha': 0.52, 'jihanki': 0.56, 'chouchin': 0.6, 'gomi': 0.56, 'sanrinsha': 0.48, 'kasa': 0.7, 'fune': 0.82,
         'boto': 0.6, 'bui': 0.52, 'hasu': 0.52, 'kani': 0.44, 'sunashiro': 0.54, 'picnic': 0.62, 'tanuki': 0.44, 'suimon': 0.5, 'karasu': 0.44}


def render_one(fn, k, d, out, scale=0.9):
    sc = PA.setup_scene()
    sc.render.resolution_x = sc.render.resolution_y = N * SS
    fn(k)
    rot = -d * math.pi / 2   # 向き：0 手前（下）・1 左・2 奥（上）・3 右 … 立体ぜんぶを z のまわりにまわす
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.rotation_euler.z += rot
            x, y = o.location.x, o.location.y
            o.location.x, o.location.y = x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)
    el = math.radians(EL)   # 写るものの上下のまん中にカメラを向ける
    vs = [(o.matrix_world @ p.co) for o in bpy.data.objects if o.type == 'MESH' for p in o.data.vertices]
    v = [q.y * math.sin(el) + q.z * math.cos(el) for q in vs]
    xs = [q.x for q in vs]
    mid = (min(v) + max(v)) / 2
    PA.add_camera_light(sc, ((min(xs) + max(xs)) / 2, 0, mid / math.cos(el)), scale, el=EL, az=0)
    names = PA.set_materials('id')
    ids = PA.render(sc, os.path.join(TMP, f'_{os.getpid()}-id.png'), 1)
    PA.set_materials('light')
    light = PA.render(sc, os.path.join(TMP, f'_{os.getpid()}-light.png'), 32)
    c = SS // 2
    I = ids[c::SS, c::SS][:N, :N]
    L = light.reshape(N, SS, N, SS, 4).mean(axis=(1, 3))
    id_srgb = np.array([PA.srgb((i + 1) / (len(names) + 1)) for i in range(len(names))])
    mat = np.argmin(np.abs(id_srgb[None, None, :] - I[..., :1]), axis=2).astype(np.uint8)
    mat[I[..., 3] < 0.5] = 255
    lum = L[..., :3].mean(axis=2) / np.maximum(L[..., 3], 1e-4)
    band = np.where(lum < BANDS[0], 0, np.where(lum < BANDS[1], 1, 2)).astype(np.uint8)
    np.savez_compressed(out, mat=mat, band=band, names=np.array(names))


def main():
    os.makedirs(TMP, exist_ok=True)
    part, parts = 0, 1
    if '--part' in sys.argv:
        part, parts = map(int, sys.argv[sys.argv.index('--part') + 1].split('/'))
    only = [a for a in sys.argv[1:] if not a.startswith('--') and '/' not in a]
    jobs = [(si, name, fn, k, d) for si, (name, fn) in enumerate(SUBJECTS) for k in range(6) for d in range(4) if not only or name in only]
    jobs = jobs[part::parts]
    for si, name, fn, k, d in jobs:
        render_one(fn, k, d, os.path.join(TMP, f'{name}-{k}-{d}.npz'), SCALE.get(name, 0.9))
    print('rendered', len(jobs))


if __name__ == '__main__':
    main()

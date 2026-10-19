# にしおさんぽGO：dots3d.py が描いた「材質の番号と明るさの段」に、季節の色・時間帯の色あい・空をのせて、ドット絵帳のシートにする
# - できるもの：nishio-go/dots3d/<題材の番号>-<季節>-<時間帯>.png（晴れ）と …-<天気 1〜4>.png（48×48 が 5×5 で 25枚。並びは 置き方 a×5 + b）
#   → 25題材 × 16 × 天気5 ＝ 2000枚のシートで 50000枚（No.1〜50000）
# - 時間帯の色あい・空の色・日と月と星は nishio-go/dots.js（TONE・SKY・sky()）と同じ考え方。'!' で始まる色（あかり・火）は色あいをかけない
# 使い方：python3 tools/blender/dots3d-sheets.py   （numpy と Pillow。bpy は要らない）
import math
import os
import random
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'nishio-go', 'dots3d')
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-dots3d')
N = 48
ORDER = ['jissoji', 'kabuse', 'matcha', 'ishiusu', 'tenteko', 'ike', 'unaju', 'kabayaki', 'ebisen', 'asari', 'sakanahiroba', 'fune', 'kurokabe',
         'okinoshima', 'ushitora', 'machiya', 'densha', 'akauma', 'kogane', 'enden', 'gion', 'toba', 'chochin', 'ajisai', 'tanbo']   # dots.js の題材の順（番号）
CROWD = {'tenteko', 'gion', 'toba', 'chochin'}   # t で形がかわる行事（人出、炎の大きさと見物の人）
INDOOR = {'ishiusu', 'unaju', 'ebisen', 'akauma'}   # 部屋の中の題材（天気は窓の外だけ）
OUTSIDE = {'shiba', 'ki', 'matsu', 'miki'}   # 部屋の中の題材で、窓の外に見えるもの
WY = {'matcha': 20}   # 雨や雪をかさねる下の端（軒の下はぬれない）


def rgb(c):
    n = int(c.lstrip('!#'), 16)
    return np.array([n >> 16, (n >> 8) & 255, n & 255], dtype=np.float64)


def mix(a, b, f):
    return a + (b - a) * f


# 時間帯の色あい（dots.js の TONE）：朝・昼・夕方・夜
TONE = [lambda c: mix(c, rgb('#ffd9a8'), 0.12), lambda c: c,
        lambda c: mix(c * np.array([1, 0.82, 0.7]), rgb('#ff9a50'), 0.1), lambda c: c * np.array([0.32, 0.36, 0.55])]

# 材質の色。'#..' いつも同じ／[春, 夏, 秋, 冬]／{'v': [...]} 行事の場面（s）ごと／{'day', 'night'} 夜だけかわる。'!' は色あいをかけない（光るもの）
PAL = {
    'shiba': ['#8fca5e', '#4d9a3c', '#b49a52', '#a9a48c'], 'ki': ['#f2b8cc', '#3f8a34', '#d8782a', '#7a6a5a'], 'matsu': '#3f7a3a', 'miki': '#6a4a30',
    'cha': ['#86c650', '#3f8a34', '#3a7a30', '#4a6a3a'], 'tsuchi': '#8a6a48', 'jari': '#c8c3b8', 'ishi': '#a8a49a', 'ishiD': '#7a756b',
    'kawara': '#62666e', 'kawaraL': '#8a8e94', 'kabe': '#f3f1ea', 'ita': '#8a6a48', 'itaD': '#5a4430', 'koshi': '#3a2a1e', 'kurokabe': '#26221e',
    'umi': '#3f84b8', 'suna': '#d8c89a', 'higata': '#c8b88a', 'shiro': '#f4f4f2', 'kuro': '#1e1e1e', 'aka': '#c8102e', 'kin': '#c8a040',
    'hada': '#f0c8a0', 'kami': '#2a2420', 'zubon': '#3a3a48', 'fuku1': '#3a6ab8', 'fuku2': '#4a4a6a', 'fuku3': '#c84a6a', 'fuku4': '#e8a030', 'fuku5': '#3aa870',
    'mugi': '#e8d8a8', 'mado': {'day': '#9fc3dd', 'night': '!#ffd98a'}, 'akari': '!#ffd27a', 'hi': '!#ff8a2a', 'hiY': '!#fff08a', 'hiR': '!#ff5a2a',
    'yama': '#3f6a4a', 'yamaB': '#6a8a7a',
    # 題材ごとの材質（色は dots.js の絵に合わせる）
    'keidai': '#d8cfb8', 'keidaiY': '#3a3028', 'kabuseNet': '#262626', 'hashiraK': '#8a7a5a', 'take': '#d8c890', 'chaL': '#5a8a3a', 'mosen': '#c8302a',
    'matcha': '#7aaa3a', 'kashi': ['#f2b8cc', '#3a5a8a', '#9a5a2a', '#c8303a'], 'kashiA': ['#7a9a5a', '#a8c8e8', '#e8c070', '#f4f0e8'],
    'tatami': '#c8c08a', 'heri': '#5a6a3a', 'kabeIn': '#e8e0c8', 'kabeIn2': '#d8ccb0', 'ishiusu': '#8a8680', 'shu': '#c8382c',
    'yakuotoko': '#d8202a', 'daikon': '#f4f2ea', 'daikonH': '#5a9a3a', 'taiko': '#8a5a3a', 'kawaT': '#e8dcc0', 'hai': '#8a8a88',
    'concrete': '#b8b4ac', 'ikeMizu': '#4a6a58', 'suishaB': '#9aa0a8', 'shibuki': '!#dff0f8', 'vinyl': '#e8ecee',
    'tsukue': '#a8784a', 'tsukueD': '#6a4228', 'tsukueL': '#b88a58', 'urushi': '#1e1a1a', 'urushiR': '#a82a22', 'gohan': '#f4f0e8',
    'unagi': '#8a4a1a', 'unagiD': '#5a2a10', 'suimono': '#c8a060', 'hashi': '#c8a060', 'michi': '#8a7a6a', 'michiS': '#b8b0a0', 'kabeK': '#d8ccb0',
    'konro': '#4a4a4a', 'sumi': '#2a2a2a', 'kemuri': '#e8e8e8', 'hakoK': '#c89a5a', 'hakoN': '#a87a3a', 'ebiR': '#e85a3a', 'ebi': '#e85a3a',
    'mizutamari': '#8ab0c8', 'kai': '#d8ccb4', 'kaiD': '#6a5a4a', 'baketsu': '#3a7ac8', 'kane': '#8a8a8a', 'kaneD': '#6a6a6a', 'kaneL': '#b8bcc0',
    'kori': '#d8dce0', 'sakana': '#9aa4ae', 'madoF': {'day': '#3a5a7a', 'night': '!#ffe7a8'}, 'nami': '#ffffff', 'kurokabeL': '#3a3430',
    'ishiMichi': '#d8d0c0', 'hachi': '#a85a3a', 'hori': '#4f7f9a', 'ishigaki': '#9b968a', 'kabeM': '#e8dcc0', 'fukuM': '#7a3a8a',
    'balast': '#8a7a6a', 'meitetsu': '#c8102e', 'madoD': {'day': '#bcd4e6', 'night': '!#ffe7a8'}, 'nanohana': '#f2d84a',
    'akauma': '#c8282a', 'akaumaD': '#a82022', 'ao': '#2a6ad8', 'ki2': '#e8c030', 'midori': '#2aa860',
    'dote': ['#7aa84a', '#4a8a3a', '#9a9a52', '#9a9a84'], 'dotemichi': '#c8b888', 'kawa': '#5a8ab0', 'enden': '#d8ccb0', 'endenD': '#c8b898',
    'kaya': '#c8b888', 'shio': '#f4f4f0', 'chochinR': '!#f04a3a', 'chochinW': '!#f8e8c0', 'chochinL': '!#e8c890',
    'wara': '#8a7a4a', 'waraD': '#5a4a2a', 'shinotoko': '#c8302a', 'hadaY': '#a87858', 'kage': '#141414',
    'cpan0': {'v': ['!#dc4a44', '!#40966a', '!#7a4e96', '!#ce2a44']}, 'cpan1': {'v': ['!#2a5ab8', '!#d8302a', '!#e8a030', '!#1a1a1a']},
    'cpan2': {'v': ['!#e8c030', '!#f4f0e8', '!#2a5ab8', '!#e8c030']},
    'ajisai': {'v': ['#4a7ad8', '#8a5ac8', '#e87aa8', '#f0f2f4']}, 'ajisaiL': {'v': ['#7aa0f0', '#b08ae8', '#f4a8c8', '#d8e4f0']}, 'ajisaiHa': '#2f6a2a',
    'ta0': '#7ab0d0', 'ta1': '#3a7a30', 'ta2': '#c8a040', 'ta3': '#a89a7a', 'nae': '#5a9a3a', 'ine': '#4a9a3a', 'inaho': '#d8b040', 'inahoL': '#f0d070',
    'kabu': '#7a6a4a', 'aze': '#8a7a5a',
}
for i, c in enumerate(['#2a2624', '#7a4a2a', '#8ab0a0', '#e8e4dc', '#b84a32']):
    PAL[f'chawan{i}'] = c
for i, c in enumerate(['#1a1a1a', '#8a2a2a', '#c8a040', '#2a4a6a', '#5a3a2a']):
    PAL[f'natsume{i}'] = c
for i, c in enumerate(['#1e1a1a', '#a82a22', '#2a2a3a', '#6a3a22', '#1e1a1a']):
    PAL[f'shiru{i}'] = c
for i, c in enumerate(['#2a3a6a', '#6a2a2a', '#2f5a3a', '#e8e4dc', '#8a6a2a']):
    PAL[f'noren{i}'] = c
for i, c in enumerate(['#2a6ab8', '#d8302a', '#2a8a5a', '#e8a030', '#6a4a8a']):
    PAL[f'tent{i}'] = c
for i, c in enumerate(['#2a4a8a', '#8a2a3a', '#2f6a4a', '#e8e0c8', '#4a3a6a']):
    PAL[f'nuno{i}'] = c
for i, c in enumerate(['#1e2a4a', '#3a2a4a', '#2a3a2a', '#4a2a2a']):
    PAL[f'kami{i}'] = c
for i, c in enumerate(['#e86a8a', '#4a8ad8', '#f0c040', '#7a5ac8', '#e8a030', '#3aa870']):
    PAL[f'odori{i}'] = c
for i, c in enumerate(['#2a2a3a', '#4a3a3a', '#3a4a5a']):
    PAL[f'fukuK{i}'] = c
for b, cs in enumerate([['#f2a0a8', '#f4e0c8', '#f0b070'], ['#f4e0c8', '#e88a70', '#e8c080'], ['#f6c0c8', '#ffffff', '#d8a070'], ['#e8907a', '#f4d8b0', '#c8604a'], ['#f4e8d8', '#f2b0b8', '#f0c890']]):
    for j, c in enumerate(cs):
        PAL[f'sen{b}{j}'] = c
FLAT = {'shiba', 'tsuchi', 'suna', 'jari', 'higata', 'umi', 'keidai', 'keidaiY', 'concrete', 'michi', 'michiS', 'tatami', 'ta0', 'ta1', 'ta2', 'ta3', 'enden', 'kawa', 'hori', 'ishiMichi', 'mizutamari', 'endenD', 'heri', 'balast'}   # 地面と海はふちどりしない
TEXTURE = {'shiba': 0.82, 'tsuchi': 0.8, 'suna': 0.86, 'jari': 0.86, 'higata': 0.85, 'keidai': 0.88, 'michiS': 0.9, 'ta3': 0.85, 'enden': 0.9}   # 広い地面に、少し暗い点をまく

# 行事などの、景色の季節（色）と空と色あい。ふつうは s の季節・t の時間帯
SCENE = {
    'tenteko': lambda s, t: (3, 1, 1),            # 1月3日の昼：冬の色、昼の空
    'gion': lambda s, t: (1, 1, 1),               # 7月の昼
    'toba': lambda s, t: (3, 2 if t == 0 else 3, 2 if t == 0 else 3),    # 2月の夕暮れ〜夜
    'chochin': lambda s, t: (1, 2 if t == 0 else 3, 2 if t == 0 else 3),  # 8月の夕暮れ〜夜
    'ajisai': lambda s, t: (1, t, t),             # 6月ごろ。s はあじさいの色
}

SKY = [['#9fd0f0', '#cfe6f2', '#f8d8b0'], ['#5fb0ea', '#8cc8f0', '#c4e6f8'], ['#4a3e7e', '#c86a6a', '#f6b46a'], ['#0a1230', '#16224a', '#26386a']]
SKY_TINT = ['#f4e4ec', '#2a7ad8', '#e8d8a8', '#e8eef4']


def tones(c):   # 影・ふつう・明るい（pixel-art.py の tones と同じ）
    r, g, b = c
    shadow = np.array([r * 0.62, g * 0.62, min(255, b * 0.72 + 12)])
    k = 0.38 if (r + g + b) / 765 > 0.3 else 0.16
    return [shadow, c, c + (255 - c) * k]


def color_of(name, ss, s, t):
    spec = PAL[name]
    if isinstance(spec, list):
        spec = spec[ss]
    elif isinstance(spec, dict) and 'v' in spec:
        spec = spec['v'][s]
    elif isinstance(spec, dict):
        spec = spec['night'] if t == 3 else spec['day']
    return spec


def sky(img, mask, ss, st, a, b, R):
    """空のところ（mask）に、時間帯と季節の空（上から下へ3色のグラデーション）と、日・月・星・雲"""
    ys = np.where(mask.any(axis=1))[0]
    if not len(ys):
        return
    y0, y1 = ys.min(), ys.max()
    stops = [mix(rgb(c), rgb(SKY_TINT[ss]), 0.12) for c in SKY[st]]
    for y in range(y0, y1 + 1):
        f = (y - y0) / max(1, y1 - y0)
        c = mix(stops[0], stops[1], f * 2) if f < 0.5 else mix(stops[1], stops[2], (f - 0.5) * 2)
        img[y, mask[y]] = c

    def put(x, y, w, h, c):
        x0, x1, yy0, yy1 = max(0, x), min(N, x + w), max(0, y), min(N, y + h)
        if x0 < x1 and yy0 < yy1:
            m = mask[yy0:yy1, x0:x1]
            img[yy0:yy1, x0:x1][m] = rgb(c)
    sx, hz = 6 + a * 8 + (b % 2) * 3, y1 + 1
    if st == 3:
        for _ in range(9 + b):
            put(R.randrange(N), R.randrange(max(1, hz - 2)), 1, 1, '#e8ecff')
        put(sx, 3, 4, 4, '#f4eecc')
        img[3:5, sx + 2:sx + 4][mask[3:5, sx + 2:sx + 4]] = stops[0]
    else:
        sy = 3 if st == 1 else max(2, hz - 7)
        col = '#ffd27a' if st == 2 else '#fff0c0' if st == 0 else '#fffbe8'
        put(sx, sy, 4, 4, col)
        put(sx - 1, sy + 1, 6, 2, col)
        put(sx + 1, sy - 1, 2, 6, col)
        for _ in range(1 + b % 3):
            x, y = R.randrange(40), 2 + R.randrange(max(1, hz - 8))
            put(x, y, 7, 2, '#ffffff')
            put(x + 2, y - 1, 3, 1, '#ffffff')


# 天気（dots.js の WX_SKY・wxSky・WX_TONE・wxOver と同じ）：w 1 くもり・2 雨・3 霧・4（冬の景色は雪、夜は満月、ほかは虹）
WX_SKY = {'cloudy': ('#9aa2aa', '#2a3040', 0.55), 'rain': ('#6e7680', '#1e2430', 0.7), 'mist': ('#dfe4e6', '#4a5260', 0.6), 'snow': ('#c8ccd2', '#3a4250', 0.5)}
WX_TONE = {'cloudy': ('#7a8088', 0.1), 'rain': ('#4a5260', 0.2), 'mist': ('#dfe4e6', 0.38), 'snow': ('#eef2f6', 0.15),
           'rainbow': ('#fff4e0', 0.06), 'moon': ('#b8c4ff', 0.1)}   # 虹と満月は、空が見えない置き方でもわかるように、うすく


def wx_kind(w, ss, st):
    return ['', 'cloudy', 'rain', 'mist'][w] if w < 4 else 'snow' if ss == 3 else 'moon' if st == 3 else 'rainbow'


def wx_sky(img, mask, ss, st, a, b, W, wk):
    """晴れ以外の空（くもりと雨と雪は雲がおおう、霧は地平がかすむ、虹、満月と星）"""
    ys = np.where(mask.any(axis=1))[0]
    if not len(ys):
        return
    y0, y1 = ys.min(), ys.max()
    stops = [mix(rgb(c), rgb(SKY_TINT[ss]), 0.12) for c in SKY[st]]
    if wk in WX_SKY:
        day, night, f = WX_SKY[wk]
        stops = [mix(c, rgb(night if st == 3 else day), f) for c in stops]
    for y in range(y0, y1 + 1):
        f = (y - y0) / max(1, y1 - y0)
        img[y, mask[y]] = mix(stops[0], stops[1], f * 2) if f < 0.5 else mix(stops[1], stops[2], (f - 0.5) * 2)

    def put(x, y, w, h, c):
        x0, x1, yy0, yy1 = max(0, x), min(N, x + w), max(0, y), min(N, y + h)
        if x0 < x1 and yy0 < yy1:
            img[yy0:yy1, x0:x1][mask[yy0:yy1, x0:x1]] = c if isinstance(c, np.ndarray) else rgb(c)
    sx, hz = 6 + a * 8 + (b % 2) * 3, y1 + 1
    if wk in ('cloudy', 'rain', 'snow'):
        cc = '#2e3444' if st == 3 else '#5a626c' if wk == 'rain' else '#b4bac0'
        for i in range(5 + b):
            x, y = W.randrange(44) - 4, W.randrange(max(1, hz - 3))
            put(x, y, 10 + (i % 3) * 3, 3, cc)
            put(x + 2, y - 1, 6, 1, cc)
    elif wk == 'mist':
        for y in range(max(0, hz - 8), hz, 2):
            put(0, y, N, 1, mix(stops[2], rgb('#ffffff'), 0.35))
    elif wk == 'rainbow':
        put(sx, 3, 4, 4, '#fffbe8')
        cx, cy, rad = 24 + (a - 2) * 3, hz + 2, 18 + (b % 3) * 2
        for i, c in enumerate(['#e8504a', '#f09a3a', '#f2d24a', '#6ac05a', '#4a8ad8', '#8a5ac8']):
            for d in range(0, 181, 3):
                tt = math.radians(d)
                put(round(cx + math.cos(tt) * (rad - i)), round(cy - math.sin(tt) * (rad - i) * 0.7), 1, 1, mix(rgb(c), rgb('#ffffff'), 0.15))
        for _ in range(2):
            put(W.randrange(40), 2 + W.randrange(max(1, hz - 8)), 7, 2, '#f4f6f8')
    elif wk == 'moon':
        for _ in range(18 + b * 2):
            put(W.randrange(N), W.randrange(max(1, hz - 1)), 1, 1, '#f4f6ff')
        mx = 30 - a * 4
        put(mx + 1, 2, 6, 8, '#fff6d0')
        put(mx, 3, 8, 6, '#fff6d0')
        put(mx + 2, 4, 2, 2, '#e8dcb0')
        put(mx + 5, 6, 1, 1, '#e8dcb0')


def wx_over(img, mask, a, b, st, W, wk, y1=N):
    """絵の上にかさねる雨・雪・霧（mask の中だけ）"""
    def put(x, y, w, h, c):
        x0, x1, yy0, yy1 = max(0, x), min(N, x + w), max(0, y), min(y1, y + h)
        if x0 < x1 and yy0 < yy1:
            img[yy0:yy1, x0:x1][mask[yy0:yy1, x0:x1]] = rgb(c)
    if wk == 'rain':
        for _ in range(40 + b * 4):
            x, y = W.randrange(50), W.randrange(y1)
            put(x, y, 1, 1, '#c8dcf0')
            put(x - 1, y + 1, 1, 1, '#a8c0dc')
            put(x - 2, y + 2, 1, 1, '#c8dcf0')
    elif wk == 'snow':
        for i in range(36 + b * 4):
            x, y, z = W.randrange(N), W.randrange(y1), 1 + (i % 3 == 0)
            put(x, y, z, z, '#ffffff')
    elif wk == 'mist':
        for y in range(10 + (a % 3) * 3 + b % 3, y1, 9):   # 霧の帯（小物の置き方 b でもずらす：霧で小物が見えなくても、ちがう絵になるように）
            for x in range((y * 7 + b * 5) % 11 - 6, N, 16):
                put(x, y, 12, 2, '#4a5466' if st == 3 else '#eef2f4')


def tile(key, a, b, s, t, w=0):
    rs = t if key in CROWD else 0
    d = np.load(os.path.join(TMP, f'{key}-{a}{b}{s}{rs}.npz'))
    mat, band, depth, names = d['mat'], d['band'], d['depth'].astype(np.float32), [str(x) for x in d['names']]
    ss, st, tt = SCENE[key](s, t) if key in SCENE else (s, t, t)
    R = random.Random(f'{key}:{a}:{b}:{s}:{t}')
    wk = wx_kind(w, ss, st)
    W = random.Random(f'wx:{key}:{a}:{b}:{s}:{t}:{w}')
    img = np.zeros((N, N, 3))
    for i, nm in enumerate(names):
        m = mat == i
        if not m.any():
            continue
        spec = color_of(nm, ss, s, tt)
        tn = tones(rgb(spec))
        cols = np.stack(tn)[band[m]]
        if nm in TEXTURE:   # 地面の点
            rr = np.array([R.random() for _ in range(m.sum())])
            cols[rr < 0.09] *= TEXTURE[nm]
            if ss == 0 and nm == 'shiba':
                cols[rr > 0.975] = rgb('#f6c8d8')   # 春：桜の花びら
            if ss == 3 and nm == 'shiba':
                cols[rr > 0.985] = rgb('#e8eef0')   # 冬：霜
        if not spec.startswith('!'):
            cols = TONE[tt](cols)
            if wk in WX_TONE and (key not in INDOOR or nm in OUTSIDE):   # 天気の色あい（部屋の中は窓の外だけ）
                cols = mix(cols, rgb(WX_TONE[wk][0]), WX_TONE[wk][1])
        img[m] = cols
    # ふちどり：となりがちがう材質で、それより奥（か空）なら、手前の点を暗く
    edge = np.zeros((N, N), dtype=bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        q_mat = np.roll(mat, (dy, dx), axis=(0, 1))
        q_dep = np.roll(depth, (dy, dx), axis=(0, 1))
        e = (q_mat != mat) & (q_dep > depth * 1.12 + 0.25)
        if dy == 1: e[0, :] = False
        if dy == -1: e[-1, :] = False
        if dx == 1: e[:, 0] = False
        if dx == -1: e[:, -1] = False
        edge |= e
    edge &= mat != 255
    for i, nm in enumerate(names):
        if nm in FLAT:
            edge[mat == i] = False
    lit = np.zeros((N, N), dtype=bool)
    for i, nm in enumerate(names):
        if color_of(nm, ss, s, tt).startswith('!'):
            lit |= mat == i
    img[edge & ~lit] *= 0.55
    if wk:
        wx_sky(img, mat == 255, ss, st, a, b, W, wk)
        out = mat == 255
        for i, nm in enumerate(names):
            if nm in OUTSIDE:
                out |= mat == i
        wx_over(img, out if key in INDOOR else np.ones((N, N), dtype=bool), a, b, st, W, wk, WY.get(key, N))
    else:
        sky(img, mat == 255, ss, st, a, b, R)
    return np.clip(img.round(), 0, 255).astype(np.uint8)


def main():
    keys = [x for x in sys.argv[1:] if not x.startswith('-')] or ORDER
    os.makedirs(OUT, exist_ok=True)
    for key in keys:
        m = ORDER.index(key)
        for s in range(4):
            for t in range(4):
                for w in range(5):
                    sheet = np.zeros((N * 5, N * 5, 3), dtype=np.uint8)
                    for c in range(25):
                        sheet[(c // 5) * N:(c // 5 + 1) * N, (c % 5) * N:(c % 5 + 1) * N] = tile(key, c // 5, c % 5, s, t, w)
                    im = Image.fromarray(sheet)
                    if len(im.getcolors(1 << 16) or []) <= 256:   # 256色までなら色の表つき（小さくなる）。それより多ければ色をへらさずにそのまま
                        im = im.convert('P', palette=Image.Palette.ADAPTIVE, colors=256)
                    im.save(os.path.join(OUT, f'{m}-{s}-{t}' + (f'-{w}' if w else '') + '.png'), optimize=True)
        print('wrote', key)


if __name__ == '__main__':
    main()

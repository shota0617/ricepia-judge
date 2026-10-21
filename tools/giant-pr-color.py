# にしおさんぽGO：西尾市のPRになる特大ドット絵（2段目：色をのせて PNG にする。bpy は要らない）
# - tools/blender/giant-pr.py が TMP に残した「材質の番号・明るさの段」から、季節4 × 時間帯4 の16枚を作る
#   季節：0 春（若葉・桜）・1 夏（濃い緑）・2 秋（紅葉・黄葉・枯れ草）・3 冬（葉の落ちた木・雪。上を向いた明るい面に雪）
#   季節の舞うもの：春は桜の花びら・秋は落ち葉・冬は雪（名所・向き・季節・時間帯ごとに決まった場所）
#   時間帯：0 朝（少しあたたかく）・1 昼・2 夕方（だいだい。窓に明かり）・3 夜（暗く青く。窓と灯籠に明かり）。色あいは dots.js と同じ
# - できた PNG は nishio-go/art/pr/<id>/<向き>-<季節>-<時間帯>.png（96×96、まわりは すきとおり）、一覧は nishio-go/art/pr/list.json
# - 色の分け方（影・ふつう・明るい の3色）と黒いふちどりは tools/blender/pixel-art.py と同じ
# 使い方：python3 tools/giant-pr-color.py [id ...]
import glob
import json
import os
import sys
import zlib

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-giant-pr')
OUT = os.path.join(ROOT, 'nishio-go', 'art', 'pr')
OUTLINE = (0x1a, 0x1a, 0x1a)
SEASON, TIME, VIEW = ['春', '夏', '秋', '冬'], ['朝', '昼', '夕方', '夜'], ['左前から', '右前から', '高い所から', 'うしろから']
# 季節で色が変わる材質（ない季節は 絵のまま）
SEASON_COL = {
    'gTree': ['#6fbf45', None, '#d9a132', '#8a7a66'], 'gTreeD': ['#3f8f3a', None, '#c0612b', '#6b5c4c'], 'leaf': ['#6fbf45', None, '#d9a132', '#8a7a66'],
    'momiji': ['#7fbf4a', '#3f8a3a', None, '#7a6a58'], 'sakura': [None, '#4f9a3e', '#c9783a', '#7a6a58'],
    'shiba': ['#7cc552', None, '#b9a45a', '#dfe6ea'], 'shibaG': ['#7cc552', None, '#b9a45a', '#dfe6ea'], 'kusa': ['#7cc552', None, '#b9a45a', '#dfe6ea'],
    'hasuH': ['#6fbf45', None, '#a8903a', '#8a7a66'],
    'ine': ['#9ad060', None, '#e0b840', '#b89a60'],   # 田んぼ：春は植えたての苗・夏は青い稲・秋は金色の稲穂・冬は刈りあと
}
NO_SNOW = {'higataW', 'mizuta', 'ike', 'umiB', 'nami', 'ike', 'umi', 'yu', 'pool', 'mado', 'glass', 'sash', 'modernB', 'sea', 'suna', 'sand'}
WINDOW = {'mado', 'glass', 'sash', 'modernB'}
LAMP = {'toro', 'chochin'}
SNOW = '#f2f5f8'


def hex2rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def tones(h):   # pixel-art.py と同じ（影・ふつう・明るい）
    r, g, b = hex2rgb(h)
    k = 0.38 if (r + g + b) / 765 > 0.3 else 0.16
    return np.array([[int(r * 0.62), int(g * 0.62), int(min(255, b * 0.72 + 12))], [r, g, b], [int(c + (255 - c) * k) for c in (r, g, b)]], dtype=np.float32)


def mix(c, d, f):
    return c + (d - c) * f


def tone(c, t):   # 時間帯の色あい（dots.js の TONE と同じ）
    if t == 0:
        return mix(c, hex2rgb('#ffd9a8'), 0.12)
    if t == 2:
        return mix(c * np.array([1, 0.82, 0.7]), hex2rgb('#ff9a50'), 0.1)
    if t == 3:
        return c * np.array([0.40, 0.44, 0.62])   # 夜は暗く青く（dots.js より少し明るく：96×96 の細かい所が見えるように）
    return c


# 季節の舞うもの（春：桜の花びら・秋：落ち葉・冬：雪。夏は なし）。名所・向き・季節・時間帯ごとに決まった場所
FALL = {0: (['#f8c8d8', '#f4b0c8', '#fff0f4'], 18), 2: (['#e0702a', '#d8a030', '#b84a22'], 16), 3: (['#ffffff', '#eef4ff'], 34)}


def falling(out, seed, s, t):
    if s not in FALL:
        return
    cols, n = FALL[s]
    rng = np.random.default_rng(seed)
    size = out.shape[0]
    for _ in range(n):
        x, y = int(rng.integers(2, size - 3)), int(rng.integers(2, size - 10))
        c = tone(hex2rgb(cols[int(rng.integers(len(cols)))]), t)
        big = rng.random() < (0.45 if s == 3 else 0.3)
        for dx, dy in ([(0, 0), (1, 0), (0, 1), (1, 1)] if big else [(0, 0)]):
            out[y + dy, x + dx, :3] = np.clip(c, 0, 255).astype(np.uint8)
            out[y + dy, x + dx, 3] = 255


def paint(d, s, t, seed=0):
    mat, band, names, cols = d['mat'], d['band'], list(d['names']), list(d['cols'])
    n = mat.shape[0]
    out = np.zeros((n, n, 4), dtype=np.uint8)
    for k, name in enumerate(names):
        m = mat == k
        if not m.any():
            continue
        base = (SEASON_COL.get(name) or [None] * 4)[s] or cols[k]
        tn = tones(base)
        px = tn[band[m]]
        if s == 3 and name not in NO_SNOW:   # 冬：上を向いた明るい面に雪
            top = band[m] == 2
            px[top] = tones(SNOW)[1]
        if t == 3 and name in WINDOW:
            px = tones('#ffd860')[np.maximum(band[m], 1)]   # 夜：窓に明かり（暗くしない）
        elif t == 3 and name in LAMP:
            px = tones('#ffc850')[np.maximum(band[m], 1)]
        elif t == 2 and name in WINDOW:
            px = tone(tones('#ffcf70')[band[m]], 2)
        else:
            px = tone(px, t)
            if t == 3:   # 月あかり：上を向いた明るい面を少し青白く
                lit = band[m] == 2
                px[lit] = mix(px[lit], hex2rgb('#c8d4ff'), 0.10)
        out[m, :3] = np.clip(px, 0, 255).astype(np.uint8)
        out[m, 3] = 255
    a = out[..., 3] > 0   # ふちどり：絵のすぐ外側の点を黒く
    edge = np.zeros_like(a)
    edge[1:, :] |= a[:-1, :]
    edge[:-1, :] |= a[1:, :]
    edge[:, 1:] |= a[:, :-1]
    edge[:, :-1] |= a[:, 1:]
    edge &= ~a
    out[edge, :3] = OUTLINE
    out[edge, 3] = 255
    falling(out, seed, s, t)
    return out


def main():
    want = set(a for a in sys.argv[1:] if not a.startswith('-'))
    spots = {'f-' + s['id']: s for s in json.load(open(os.path.join(ROOT, 'nishio-go', 'spots.json'), encoding='utf-8'))['spots']}
    sc = os.path.join(OUT, 'scenes.json')   # 名物と景色（giant-pr.py が書く）
    if os.path.exists(sc):
        spots.update({x['id']: x for x in json.load(open(sc, encoding='utf-8'))})
    done = {}
    for path in sorted(glob.glob(os.path.join(TMP, '*.npz'))):
        sid, v = os.path.basename(path)[:-4].rsplit('-', 1)
        if want and sid not in want:
            continue
        d = np.load(path)
        os.makedirs(os.path.join(OUT, sid), exist_ok=True)
        for s in range(4):
            for t in range(4):
                Image.fromarray(paint(d, s, t, zlib.crc32(f'{sid}:{v}:{s}:{t}'.encode())), 'RGBA').save(os.path.join(OUT, sid, f'{v}-{s}-{t}.png'), optimize=True)
        done.setdefault(sid, []).append(int(v))
    # 一覧（PNG がそろっている名所だけ。名前・地区・説明は spots.json から）
    items = []
    for sid in sorted(os.listdir(OUT)):
        if not os.path.isdir(os.path.join(OUT, sid)) or sid not in spots:
            continue
        views = sorted({int(f.split('-')[0]) for f in os.listdir(os.path.join(OUT, sid)) if f.endswith('.png')})
        s = spots[sid]
        items.append({'id': sid, 'name': s['name'], 'area': s.get('area', ''), 'desc': s.get('desc', ''), 'views': views, **({'scene': True} if sid.startswith('m-') else {})})
    total = sum(len(x['views']) * 16 for x in items)
    json.dump({'_説明': '西尾市のPRになる特大ドット絵（96×96）。<id>/<向き>-<季節>-<時間帯>.png。向き：' + '・'.join(VIEW) + '、季節：' + '・'.join(SEASON) + '、時間帯：' + '・'.join(TIME)
               + '。tools/blender/giant-pr.py と tools/giant-pr-color.py で作る', 'count': total, 'items': items},
              open(os.path.join(OUT, 'list.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('spots', len(items), 'images', total, 'this run', sum(len(v) for v in done.values()) * 16)


if __name__ == '__main__':
    main()

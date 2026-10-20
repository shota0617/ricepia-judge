# にしおさんぽGO：特大のドット絵（Blender）を作る名所の一覧 tools/blender/giant-list.json を作る
#   python3 tools/blender/giant-list.py <名所の一覧 JSON>
# 名所の一覧は、ゲームを開いて nishioGo.spots から書き出したもの（id・名前・種類・型の絵のデータ・いまの 48×48 の絵の PNG）。
# ・いまの絵がある名所（注目スポット・手描き・型の絵 ＝ 1000か所）と、絵がまだない注目スポットが対象（手で作った特大の絵がある所は除く）
# ・形の種類は、型の絵の種類か spots の種類、それに名前（古墳・稲荷・港・海水浴場・灯台・山・観音・塔・教会・水族館など）で決める
# ・2回目（--rest）：まだ特大の絵がない ほかのスポット（公園・史跡・山など）を、前の一覧のあとに足す（前の名所の行は変えない）。
#   公園は名前で 遊具のある公園・運動場・池のある公園・緑地・庭園 に分ける
# ・色：型の絵はそのデータ（写真から測った屋根・壁・差し色）、それ以外は いまの絵から測る（暗くくすんだ色を屋根、明るい色を壁、あざやかな色を差し色）
import base64
import io
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HAND = {'f-nishio-castle', 'f-okazaki-castle', 'f-iwase-bunko', 'f-konrenji', 'f-nishio-station', 'f-jofukuji', 'f-ohirune-house', 'f-kurokabe', 'f-inariyama-chaen'}
GEN_KIND = {'s': 'shrine', 't': 'temple', 'e': 'station', 'c': 'castle', 'p': 'museum', 'h': 'historic', 'v': 'view', 'w': 'church'}
CAT_KIND = {'shrine': 'shrine', 'temple': 'temple', 'worship': 'temple', 'station': 'station', 'castle': 'castle', 'museum': 'museum', 'library': 'library',
            'townhall': 'townhall', 'art': 'art', 'historic': 'historic', 'sight': 'view', 'view': 'view', 'park': 'park', 'beach': 'beach'}
JR = {'岡崎', '西岡崎', '安城', '三河安城', '刈谷', '野田新町', '東刈谷', '逢妻', '大府', '共和', '幸田', '相見', '三ヶ根', '三河塩津', '蒲郡', '三河大塚',
      '三河三谷', '半田', '乙川', '東浦', '石浜', '亀崎', '武豊', '東成岩', '緒川', '尾張森岡'}
AIKAN = {'六名', '中岡崎', '北岡崎', '大門', '北野桝塚', '三河上郷', '永覚', '末野原', '三河豊田'}


def kind_of(x):
    n = x['name']
    k = GEN_KIND.get((x.get('gen') or [''])[0]) or CAT_KIND.get(x.get('kind') or x.get('cat'), 'historic')
    if '古墳' in n:
        return 'kofun'
    if '灯台' in n:
        return 'lighthouse'
    if '水族館' in n:
        return 'aquarium'
    if '教会' in n or k == 'church':
        return 'church'
    if k in ('shrine',) and '稲荷' in n:
        return 'inari'
    if k == 'station' or n.endswith('駅'):
        return 'station'
    if any(w in n for w in ('海水浴場', 'ビーチ', '海岸')) or k == 'beach':
        return 'beach'
    if n.endswith('港') or '港 ' in n or '漁港' in n:
        return 'port'
    if any(w in n for w in ('観音', '大仏', '像')) and k not in ('shrine', 'temple'):
        return 'statue'
    if '温泉' in n:
        return 'onsen'
    if k in ('view',) and (n.endswith('山') or '峠' in n or '山頂' in n):
        return 'hill'
    if k in ('historic', 'view') and n.endswith('門'):
        return 'gate'
    if '公園' in n and k in ('park', 'view', 'historic'):
        return 'park'
    return k


def rest_kind(x):
    n, c = x['name'], x.get('cat')
    if c == 'park':
        if any(w in n for w in ('運動', 'グラウンド', '球場', 'スポーツ', 'テニス', '野球')):
            return 'sports'
        if '庭園' in n:
            return 'garden'
        if '池' in n:
            return 'pondpark'
        if '緑地' in n or '森' in n:
            return 'forest'
        return 'playpark'
    if '灯台' in n:
        return 'lighthouse'
    if c in ('view', 'sight') and any(w in n for w in ('山', '峰', '岳', '峠', '富士', 'ヒル', '丘')):
        return 'hill'
    return kind_of(x)


def train_of(name):
    st = name.split('駅')[0].replace('JR', '').replace('名鉄', '').strip()
    return 'jr' if st in JR else 'aikan' if st in AIKAN else 'meitetsu'


def measure(png):
    """いまの絵から 屋根・壁・差し色 を測る（ふちどりの黒と透明は除く）"""
    im = Image.open(io.BytesIO(base64.b64decode(png.split(',')[1]))).convert('RGBA')
    w, h = im.size
    px = im.load()
    roof, wall, acc = {}, {}, {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128 or max(r, g, b) < 40:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            L, sat = (r + g + b) / 3, (mx - mn) / max(mx, 1)
            key = (r // 8 * 8, g // 8 * 8, b // 8 * 8)
            if y < h * 0.5 and L < 140 and sat < 0.35:
                roof[key] = roof.get(key, 0) + 1
            if h * 0.3 < y < h * 0.9 and L > 150 and sat < 0.3:
                wall[key] = wall.get(key, 0) + 1
            if sat > 0.45 and L > 60:
                acc[key] = acc.get(key, 0) + 1
    hexc = lambda d: '#%02x%02x%02x' % max(d, key=d.get) if d else 0
    return hexc(roof), hexc(wall), hexc({k: v for k, v in acc.items() if v >= 6})


def main(src, rest=False):
    items = json.load(open(src))
    path = os.path.join(ROOT, 'tools', 'blender', 'giant-list.json')
    if rest:
        out = json.load(open(path))
        have = {e['id'] for e in out} | HAND
        for x in items:
            if x['id'] in have:
                continue
            k = rest_kind(x)
            e = {'id': x['id'], 'name': x['name'], 'k': k, 'c': [0, 0, 0]}
            if k == 'station':
                e['train'] = train_of(x['name'])
            out.append(e)
            have.add(x['id'])
        return save(out, path)
    out = []
    for x in items:
        if x['id'] in HAND or not (x['w'] == 48 or x['featured']):
            continue
        k = kind_of(x)
        g = x.get('gen')
        if g:
            cols = [g[2] if len(g) > 2 else 0, g[3] if len(g) > 3 else 0, g[4] if len(g) > 4 else 0]
        elif x.get('png') and x['w'] == 48:
            cols = list(measure(x['png']))
        else:
            cols = [0, 0, 0]
        e = {'id': x['id'], 'name': x['name'], 'k': k, 'c': cols}
        if k == 'station':
            e['train'] = train_of(x['name'])
        out.append(e)
    out.sort(key=lambda e: e['id'])
    save(out, path)


def save(out, path):
    with open(path, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    kinds = {}
    for e in out:
        kinds[e['k']] = kinds.get(e['k'], 0) + 1
    print(len(out), 'か所', kinds)


if __name__ == '__main__':
    main([a for a in sys.argv[1:] if not a.startswith('-')][0], '--rest' in sys.argv)

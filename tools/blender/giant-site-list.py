# にしおさんぽGO：西尾市の外の名所1000か所の特大のドット絵を、まわりの本当の地図に合わせて作り直すための一覧 tools/blender/giant-site.json を作る
#   python3 tools/blender/giant-site-list.py
# ・対象：型の絵（giant-list.json）のうち、西尾市の外にあって、遊具のある公園（playpark）でないもの。西尾駅に近い順に1000か所
#   （季節の絵がある名所 art/pr/list.json は除く）
# ・名所ごとに、歩く地図の区画データ（nishio-go/chunks/*.json。OpenStreetMap・国土地理院の建物と空中写真の屋根の色）から、
#   名所のマスを中心にした 7×7 マス（1マス 8m）の地面の種類 d と屋根の色の番号 r を写す。giant-site.py がこれで形を決める
import glob
import json
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
N = 7                                    # 写すマスの数（たて・よこ）
COUNT = 1000
CHUNK, TILE_M = 128, 8
ORG_LAT, ORG_LNG = 35.0, 136.9           # pixel.js の toTile と同じ
M_LAT, M_LNG = 110950, 111320 * math.cos(34.86 * math.pi / 180)
CENTER = (34.86178, 137.05573)           # 名鉄 西尾駅


def to_tile(lat, lng):
    return (lng - ORG_LNG) * M_LNG / TILE_M, (ORG_LAT - lat) * M_LAT / TILE_M


def unrle(s):
    """pixel.js の unrle と同じ（「値の文字＋個数（36進）＋.」のくり返し）"""
    out, i, n = bytearray(CHUNK * CHUNK), 0, len(s)
    p = 0
    while p < n:
        v = ord(s[p]) - 48
        q = s.index('.', p + 1)
        k = int(s[p + 1:q], 36)
        out[i:i + k] = bytes([v]) * k
        i += k
        p = q + 1
    return out if i == len(out) else None


def load_region():
    src = open(os.path.join(ROOT, 'nishio-go', 'region.js'), encoding='utf-8').read()
    return json.loads(src[src.index('{'):src.rindex('}') + 1])['cities']


def inside(lat, lng, ring):
    c, j = False, len(ring) - 1
    for i in range(len(ring)):
        (yi, xi), (yj, xj) = ring[i], ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def in_nishio(cities, lat, lng):
    ct = next(c for c in cities if c['id'] == 'nishio-city')
    (s, w), (n, e) = ct['bbox']
    return s <= lat <= n and w <= lng <= e and any(inside(lat, lng, r) for r in ct['rings'])


def main():
    cities = load_region()
    pos = {x[0]: (x[3], x[4]) for x in json.load(open(os.path.join(ROOT, 'nishio-go', 'osm-spots.json')))['items']}
    for c in json.load(open(os.path.join(ROOT, 'nishio-go', 'spots.json')))['spots']:   # Wikidata から足した社寺（ゲームの id は n-〇〇）
        if c.get('normal') and 'lat' in c:
            pos['n-' + c['id']] = (c['lat'], c['lng'])
    pr = os.path.join(ROOT, 'nishio-go', 'art', 'pr', 'list.json')
    pr = set(json.load(open(pr)).get('ids', [])) if os.path.exists(pr) else set()
    cand = []
    for e in json.load(open(os.path.join(ROOT, 'tools', 'blender', 'giant-list.json'))):
        if e['k'] == 'playpark' or e['id'] in pr or e['id'] not in pos:
            continue
        lat, lng = pos[e['id']]
        if in_nishio(cities, lat, lng):
            continue
        cand.append((math.hypot((lat - CENTER[0]) * M_LAT, (lng - CENTER[1]) * M_LNG), e, lat, lng))
    cand.sort(key=lambda t: (t[0], t[1]['id']))
    chunks = {}

    def grid(cx, cy):
        k = (cx, cy)
        if k not in chunks:
            chunks[k] = None
            f = os.path.join(ROOT, 'nishio-go', 'chunks', f'{cx}_{cy}.json')
            if os.path.exists(f):
                j = json.load(open(f))
                d = unrle(j['d']) if isinstance(j.get('d'), str) else None
                r = unrle(j['r']) if isinstance(j.get('r'), str) else None
                chunks[k] = (d, r) if d else None
        return chunks[k]

    out = []
    for dist, e, lat, lng in cand:
        tx, ty = to_tile(lat, lng)
        x0, y0 = math.floor(tx) - N // 2, math.floor(ty) - N // 2
        d, r, ok = [], [], True
        for y in range(y0, y0 + N):
            for x in range(x0, x0 + N):
                g = grid(x // CHUNK, y // CHUNK)
                if not g:
                    ok = False
                    break
                i = (y % CHUNK) * CHUNK + x % CHUNK
                d.append(g[0][i])
                r.append(g[1][i] if g[1] else 0)
            if not ok:
                break
        if not ok:   # 区画データのない所（遊べる範囲の外）は作らない
            continue
        out.append(dict(e, d=''.join(chr(48 + v) for v in d), r=''.join(chr(48 + v) for v in r), m=round(dist)))
        if len(out) >= COUNT:
            break
    json.dump(out, open(os.path.join(ROOT, 'tools', 'blender', 'giant-site.json'), 'w'), ensure_ascii=False, indent=0)
    kinds = {}
    for e in out:
        kinds[e['k']] = kinds.get(e['k'], 0) + 1
    print(len(out), 'か所（いちばん遠い所まで', out[-1]['m'], 'm）', sorted(kinds.items(), key=lambda t: -t[1]))


if __name__ == '__main__':
    main()

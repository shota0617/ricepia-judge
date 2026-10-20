# にしおさんぽGO：街の主な建物（学校・病院・交番や警察署・消防署・郵便局・役所・図書館）500か所の特大のドット絵の一覧を作る
#   python3 tools/blender/giant-poi-list.py
# ・建物は、歩く地図の区画データ（nishio-go/chunks/*.json の p：[マスx, マスy, 種類, 名前]）から。名前のあるものだけ、同じ名前（頭の「県立」などを除く）で約300m以内のものは1つにする
# ・種類ごとの数（QUOTA）だけ、西尾駅に近い順に選ぶ（学校は小・中・高校・大学。幼稚園・保育園は入れない。病院は「病院」の名前、消防は署・出張所）
# ・書き出すもの：tools/blender/giant-poi.json（giant-gen.py が絵を作る一覧）と nishio-go/art/giant/poi.json（pixel.js が読む [id, 種類, 名前, マスx, マスy]）
import glob
import hashlib
import json
import math
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CENTER = (1781, 1886)   # 名鉄 西尾駅のマス
QUOTA = {'townhall': 32, 'library': 25, 'hospital': 61, 'fire': 44, 'police': 70, 'post': 90, 'school': 186}   # 役所・図書館・病院・消防はぜんぶ（重なりを除くと 29・24・57・44）、合わせて500
KEEP = {'hospital': '病院', 'fire': '消防署|本署|支署|出張所|消防本部', 'school': '小学校|中学校|高等学校|高校|大学', 'post': '郵便局'}


def core(name):
    """名前の頭の「愛知県立」「県立」「〇〇市立」「私立」などと空白をとる（同じ建物かどうか見くらべるため）"""
    return re.sub(r'^(愛知県立|県立|国立|私立|[^\s立]{1,4}[市町村]立|市立|町立)', '', re.sub(r'\s|（.*?）|\(.*?\)', '', name))


def main():
    seen = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'nishio-go', 'chunks', '*.json'))):
        try:
            j = json.load(open(f))
        except ValueError:
            continue
        for p in j.get('p') or []:
            if len(p) < 4 or not p[3] or p[2] not in QUOTA:
                continue
            k = (p[2], core(p[3]))   # 「愛知県立〇〇高等学校」と「県立〇〇高等学校」、校舎と校庭の2つの点のような同じ建物は1つに（40マス＝約300m以内）
            if any(abs(q[0] - p[0]) < 40 and abs(q[1] - p[1]) < 40 for q in seen.get(k, [])):
                continue
            seen.setdefault(k, []).append(p)
    items = [p for v in seen.values() for p in v]
    out, poi = [], []
    for kind, n in QUOTA.items():
        cand = [p for p in items if p[2] == kind and (kind not in KEEP or re.search(KEEP[kind], p[3]))]
        cand.sort(key=lambda p: (math.hypot(p[0] - CENTER[0], p[1] - CENTER[1]), p[3]))
        if kind == 'post':   # 郵便局の名前は1つしかないので、同じ名前の点がはなれて2つあっても1つに（近いほう）
            once = set()
            cand = [p for p in cand if not (p[3] in once or once.add(p[3]))]
        for p in cand[:n]:
            h = hashlib.sha1(f'{kind}|{p[3]}|{round(p[0])}|{round(p[1])}'.encode()).hexdigest()[:10]
            e = {'id': f'poi-{kind}-{h}', 'name': p[3], 'k': kind, 'c': [0, 0, 0]}
            if kind == 'school':   # 学校の種類（校舎の大きさ・プール・体育館）
                e['sub'] = 'uni' if '大学' in p[3] else 'high' if re.search('高等学校|高校', p[3]) else 'middle' if '中学校' in p[3] else 'elem'
            if kind == 'police':
                e['sub'] = 'station' if re.search('警察署$', p[3]) else 'koban'
            out.append(e)
            poi.append([e['id'], kind, p[3], round(p[0], 2), round(p[1], 2)])
        print(kind, len(cand[:n]), '/', len(cand))
    json.dump(out, open(os.path.join(ROOT, 'tools', 'blender', 'giant-poi.json'), 'w'), ensure_ascii=False, indent=0)
    json.dump({'items': poi}, open(os.path.join(ROOT, 'nishio-go', 'art', 'giant', 'poi.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'か所')


if __name__ == '__main__':
    main()

# にしおさんぽGO：西尾市の外の名所1000か所の特大のドット絵（96×96）を、まわりの本当の地図に合わせて作り直す
# - 一覧は tools/blender/giant-site.json（giant-site-list.py が作る：名所のマスを中心にした 7×7 マスの地面の種類 d と屋根の色 r）
# - 名所のマスからつながる境内・公園・敷地のマスを地面にして（形は本当の敷地のまま）、
#   ・建物のマス（国土地理院の建物）のかたまりに本殿・本堂・館を置く（大きさ・向きはかたまりの形、屋根は空中写真の色）
#   ・森のマスに木、水のマスに池、墓地のマスにお墓、小道のマスに道。入口（道に面した所）に鳥居・山門・門
#   ・駅は線路のマスにレールとホーム、古墳は森のマスに墳丘、運動場は広いマスに線を引く など
# - 立体の作り方・焼き方は giant-gen.py（型）と同じ。できた PNG は nishio-go/art/giant/<id>.png（型の絵を上書き）
# 使い方：python tools/blender/giant-site.py [--part=i/n] [id ...]
import importlib.util
import json
import math
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('giant_gen', os.path.join(HERE, 'giant-gen.py'))
gg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gg)
pa, gi = gg.pa, gg.gi
box, cyl, sphere = pa.box, pa.cyl, pa.sphere


def roof(name, mat, w, d, h, z, top=0.25, x=0.0, y=0.0):
    """寄棟の屋根（台形の錐。横 w・奥 d の長方形の上に、高さ h。top は上の面の大きさの割合）。
    giant.py の roof は 四角を45度回してから のばすので、w と d がちがうと ひし形にゆがむ。ここでは回した形を先に固定してから のばす"""
    import bpy
    o = cyl(name, mat, math.sqrt(0.5), 1, (0, 0, 0), (0, 0, math.pi / 4), 4, r2=math.sqrt(0.5) * top)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    o.scale = (w, d, h)
    o.location = (x, y, z + h / 2)
    return o


def gable(name, mat, length, width, h, zb, x=0.0, y=0.0, rz=0.0):
    """切妻の屋根（棟は x の向き、rz で回す）。三角の柱の頂点を真上に向ける
    （giant-gen.py の gable は三角が横にねて 片側へかたむいた屋根になるので、ここでは使わない）"""
    from mathutils import Matrix
    rot = Matrix.Rotation(rz, 3, 'Z') @ Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0)))   # 円柱の軸 → x、三角の頂点（+y）→ 上
    o = cyl(name, mat, 1.0, length, (x, y, zb + h / 3), rot.to_euler('XYZ'), 3)
    o.scale = (width / math.sqrt(3), h / 1.5, 1)
    return o
LIST = json.load(open(os.path.join(HERE, 'giant-site.json')))

N, U = 7, 0.13                     # 7×7 マス、1マスの大きさ（絵の中の長さ）
G, F, T, W, P, A, S, B, R, H, L, D, X, M, K, E, V, I, J, Y, NN, UU, Q = range(23)   # pixel.js の C と同じ番号
# 屋根の色の番号（1〜13）→ 色（nishio-go/maptiles/roofs.png の並び：瓦5色・金属5色・陸屋根3色）
ROOFC = {1: '#555c67', 2: '#34343a', 3: '#6e5e4f', 4: '#62708f', 5: '#8d4230', 6: '#4275a8', 7: '#a84230',
         8: '#428664', 9: '#979ba0', 10: '#c89e42', 11: '#d2cec5', 12: '#c0c5c0', 13: '#e4dbc9'}
FLAT = {11, 12, 13}                # 陸屋根
# 種類ごとに、名所のマスからつながる「敷地」とみなす地面
WORSHIP = {J, W, B, P, G, Y, D, K, M}
SITE = {
    'shrine': WORSHIP, 'inari': WORSHIP, 'temple': WORSHIP | {Q}, 'church': WORSHIP | {T},
    'museum': {B, T, P, G, J, W, D}, 'library': {B, T, P, G, J, D}, 'townhall': {B, T, P, G, J, D}, 'art': {B, T, P, G, J, W, D},
    'onsen': {B, T, P, G, J, W, D}, 'castle': {P, G, W, J, K, M, B, D, A}, 'station': {L, B, T},
    'historic': {P, G, W, J, D, K, M, Y}, 'statue': {P, G, W, J, D, K, M}, 'kofun': {W, G, P, K, M, J, D},
    'view': {P, G, W, K, M, J, D, B}, 'hill': {W, G, P, K, M, D}, 'forest': {W, P, G, D, K, M, A},
    'pondpark': {P, G, W, A, D, J}, 'garden': {P, G, W, A, D, J, B}, 'sports': {P, G, D, W}, 'park': {P, G, W, A, D},
    'plaza': {P, G, T, D}, 'beach': {S, A, G, P, D, T}, 'lighthouse': {S, A, G, P, D, T, B},
}
GROUND = {J: 'jari', W: 'kusa', P: 'shibaG', G: 'shibaG', D: 'michi', K: 'kusa', M: 'kusa', Y: 'jari', B: 'jari', T: 'asphalt',
          Q: 'jari', L: 'senro', S: 'suna', A: 'ike', E: 'cha', F: 'kusa', V: 'tsuchiG'}
STEPS = ((1, 0), (-1, 0), (0, 1), (0, -1))
PARKS = {'pondpark', 'garden', 'sports', 'park', 'plaza', 'beach', 'forest', 'hill', 'kofun'}
pa.MATS.update({'bochi': '#9a968c', 'bochiD': '#6e6a62', 'kawara1': '#555c67'})


def xy(i, j):
    """マス (i 右へ, j 下＝南へ) の中心 → 絵の中の (x, y)（y は奥＝北）"""
    return (i - N // 2) * U, (N // 2 - j) * U


class Site:
    def __init__(self, e):
        self.e, self.k = e, e['k']
        self.d = [(ord(c) - 48) & 31 for c in e['d']]
        self.r = [ord(c) - 48 for c in e['r']]
        if self.k not in PARKS:   # 名所の場所（まん中の 3×3）にある小さな本当の建物（250㎡以下で Q になったもの。屋根の色がある）も建物にする
            c = N // 2
            for j in range(c - 1, c + 2):
                for i in range(c - 1, c + 2):
                    if self.d[j * N + i] == Q and self.r[j * N + i] & 15:
                        self.d[j * N + i] = B
        self.rng = random.Random('site:' + e['id'])
        self.mask = self.region()
        self.clear = set()   # 木を植えないマス

    def clear_front(self, blob):
        """建物の手前（南と西＝見る人の側）のとなりのマスには木を植えない"""
        for (i, j) in blob:
            for a, b in ((0, 1), (-1, 0), (-1, 1), (0, 2), (-1, 2)):
                self.clear.add((i + a, j + b))

    def at(self, i, j):
        return self.d[j * N + i] if 0 <= i < N and 0 <= j < N else None

    def region(self):
        ok = SITE.get(self.k, {P, G, W, J, D})
        c = N // 2
        start = None   # 名所のマスが敷地でなければ（道の上の点など）、いちばん近い敷地のマスから
        for rad in range(N):
            cells = [(i, j) for i in range(c - rad, c + rad + 1) for j in range(c - rad, c + rad + 1)
                     if max(abs(i - c), abs(j - c)) == rad and self.at(i, j) in ok]
            if cells:
                start = min(cells, key=lambda t: (abs(t[0] - c) + abs(t[1] - c), t))
                break
        m = set()
        if start:
            todo = [start]
            while todo:
                i, j = todo.pop()
                if (i, j) in m or self.at(i, j) not in ok:
                    continue
                m.add((i, j))
                todo += [(i + a, j + b) for a, b in STEPS]
        if self.k == 'station':   # 駅は、線路のマスと そのまわり1マス（水・ほかの家でないもの）をホームや駅前に
            m |= {(i + a, j + b) for (i, j) in list(m) if self.at(i, j) == L for a in (-1, 0, 1) for b in (-1, 0, 1)
                  if self.at(i + a, j + b) not in (None, A, Q)}
        if len(m) < 9:   # 小さすぎる（道ばたの碑など）ときは、はじめのマスのまわり 3×3 も入れる（つながったまま）
            si, sj = start or (c, c)
            si, sj = min(max(si, 1), N - 2), min(max(sj, 1), N - 2)
            m |= {(i, j) for i in range(si - 1, si + 2) for j in range(sj - 1, sj + 2)}
        return m

    def blobs(self, code=B):
        """敷地の中の、ある地面（ふつうは建物）のかたまり。大きい順"""
        seen, out = set(), []
        for (i, j) in sorted(self.mask):
            if (i, j) in seen or self.at(i, j) != code:
                continue
            blob, todo = [], [(i, j)]
            while todo:
                p = todo.pop()
                if p in seen or p not in self.mask or self.at(*p) != code:
                    continue
                seen.add(p)
                blob.append(p)
                todo += [(p[0] + a, p[1] + b) for a, b in STEPS]
            out.append(blob)
        c = N // 2
        out.sort(key=lambda b: (-len(b), min(abs(i - c) + abs(j - c) for i, j in b)))
        return out

    def roof_of(self, blob):
        cs = [self.r[j * N + i] & 15 for i, j in blob if self.r[j * N + i] & 15 in ROOFC]
        return max(set(cs), key=cs.count) if cs else 0

    def front(self, blob):
        """建物の正面の向きと入口のマス。正面は敷地の広がっている側（参道・前庭のある側）。
        建物が敷地のまん中にあるときは、道に面した側（南を少しひいき）。入口はその向きの敷地のはしで、道に面した所"""
        cx = sum(i for i, _ in blob) / len(blob)
        cy = sum(j for _, j in blob) / len(blob)
        rest = [p for p in self.mask if p not in blob] or list(self.mask)
        mx = sum(i for i, _ in rest) / len(rest) - cx
        my = sum(j for _, j in rest) / len(rest) - cy
        if math.hypot(mx, my) < 0.6:   # まん中：いちばん近い道の向き
            roads = [(i, j) for i in range(N) for j in range(N) if self.at(i, j) in (R, H, D) and (i, j) not in self.mask]
            if roads:
                ri, rj = min(roads, key=lambda p: (math.hypot(p[0] - cx, p[1] - cy) - (0.3 if p[1] > cy else 0), p))
                mx, my = ri - cx, rj - cy
            else:
                mx, my = 0, 1
        f = (1 if mx > 0 else -1, 0) if abs(mx) > abs(my) else (0, 1 if my > 0 else -1)
        edge = [p for p in self.mask if (p[0] + f[0], p[1] + f[1]) not in self.mask and p not in blob]
        if not edge:
            edge = [p for p in self.mask if p not in blob] or list(self.mask)
        def score(p):   # 道に面している・建物の正面の延長に近い・建物から離れている（3マスまで）
            along = (p[0] - cx) * f[0] + (p[1] - cy) * f[1]
            side = abs((p[0] - cx) * f[1]) + abs((p[1] - cy) * f[0])
            road = 2 if self.at(p[0] + f[0], p[1] + f[1]) in (R, H, D) else 0
            return (road - side + min(along, 3) * 0.5, -p[0], -p[1])
        return f, max(edge, key=score)


def inner(blob):
    """かたまりの中に入る、いちばん大きな長方形のマス（L 字の建物でも、建物が敷地の外にはみ出さないように）"""
    cells = set(blob)
    best = None
    for i0 in range(N):
        for j0 in range(N):
            if (i0, j0) not in cells:
                continue
            for i1 in range(i0, N):
                if (i1, j0) not in cells:
                    break
                for j1 in range(j0, N):
                    if any((i, j1) not in cells for i in range(i0, i1 + 1)):
                        break
                    a = (i1 - i0 + 1) * (j1 - j0 + 1)
                    if best is None or a > best[0]:
                        best = (a, i0, j0, i1, j1)
    _, i0, j0, i1, j1 = best
    return [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1)]


def grow(st, rect, avoid=()):
    """1マスの長方形などを、敷地の中だけで たて・よこ 2マスまで広げる（建物が敷地の外にはみ出さない大きさにするため）"""
    i0, i1 = min(i for i, _ in rect), max(i for i, _ in rect)
    j0, j1 = min(j for _, j in rect), max(j for _, j in rect)
    best = rect
    for a in range(i1 - 1, i0 + 1):
        for b in range(j1 - 1, j0 + 1):
            ii, jj = (a, a + max(2, i1 - i0 + 1) - 1), (b, b + max(2, j1 - j0 + 1) - 1)
            if ii[0] > i0 or ii[1] < i1 or jj[0] > j0 or jj[1] < j1:
                continue
            cells = [(i, j) for i in range(ii[0], ii[1] + 1) for j in range(jj[0], jj[1] + 1)]
            if all(c in st.mask and (c in rect or c not in avoid) for c in cells) and len(cells) > len(best):
                best = cells
    return best


def cap(rect, n):
    """長方形を、まん中を残して たて・よこ n マスまでに"""
    i0, i1 = min(i for i, _ in rect), max(i for i, _ in rect)
    j0, j1 = min(j for _, j in rect), max(j for _, j in rect)
    a = i0 + max(0, (i1 - i0 + 1 - n) // 2)
    b = j0 + max(0, (j1 - j0 + 1 - n) // 2)
    return [(i, j) for i in range(a, min(i1, a + n - 1) + 1) for j in range(b, min(j1, b + n - 1) + 1)]


def bbox(blob):
    i0, i1 = min(i for i, _ in blob), max(i for i, _ in blob)
    j0, j1 = min(j for _, j in blob), max(j for _, j in blob)
    x0, y1 = xy(i0, j0)
    x1, y0 = xy(i1, j1)
    return (x0 + x1) / 2, (y0 + y1) / 2, (i1 - i0 + 1) * U, (j1 - j0 + 1) * U


def angle_of(f):
    """正面の向き（マスの a, b）→ 正面が -y（手前）の形を回す角度"""
    return {(0, 1): 0.0, (1, 0): math.pi / 2, (0, -1): math.pi, (-1, 0): -math.pi / 2}[f]


class Group:
    """作った物をまとめて回して動かす（正面を -y にして作り、あとで向きと場所を合わせる）"""
    def __init__(self):
        import bpy
        self.bpy = bpy
        self.before = set(o.name for o in bpy.data.objects)

    def place(self, ang, x, y, z=0.0):
        c, s = math.cos(ang), math.sin(ang)
        for o in self.bpy.data.objects:
            if o.name in self.before or o.type != 'MESH':
                continue
            lx, ly = o.location.x, o.location.y
            o.location.x, o.location.y = x + c * lx - s * ly, y + s * lx + c * ly
            o.location.z += z
            o.rotation_euler.z += ang


def fit(w, d, ang):
    """回したあとの横・奥の長さ（正面が -y のときの w×d に直す）"""
    return (d, w) if abs(math.sin(ang)) > 0.5 else (w, d)


# ---------- 地面・木・水・お墓 ----------
def ground(st, skip=()):
    n = 0
    for (i, j) in sorted(st.mask):
        c = st.at(i, j)
        x, y = xy(i, j)
        mat = GROUND.get(c, 'shibaG')
        if st.k in ('shrine', 'inari', 'temple') and c in (P, G, B, Q):
            mat = 'jari'
        if st.k == 'station':
            mat = 'jari' if c == L else 'asphalt' if c in (T, B, R, H, D) else mat
        if st.k in ('museum', 'library', 'townhall', 'onsen', 'art') and c in (B, T, J):
            mat = 'asphalt' if c == T else 'jari'
        if c == A:
            box(f'mizu{n}', 'umiB' if st.k in ('beach', 'lighthouse') else 'ike', (U, U, 0.02), (x, y, -0.012))
        else:
            box(f'ji{n}', mat, (U, U, 0.03), (x, y, -0.015))
        n += 1


def free_cells(st, used, codes):
    return [p for p in sorted(st.mask) if st.at(*p) in codes and p not in used]


def woods(st, used, extra=0.18, kinds=('round', 'round', 'sugi')):
    """森のマスに木を1〜2本、ほかの空いたマスにも ときどき（参道の上と、建物の手前＝見る人の側には植えない）"""
    rng, n = st.rng, 0
    for (i, j) in sorted(st.mask):
        if (i, j) in used or (i, j) in st.clear:
            continue
        c = st.at(i, j)
        if c == W:
            k = 2 if rng.random() < 0.45 else 1
        elif c in (P, G, J, K, M) and rng.random() < extra:
            k = 1
        else:
            continue
        x, y = xy(i, j)
        for _ in range(k):
            kind = rng.choice(kinds)
            if rng.random() < 0.08:
                kind = rng.choice(('sakura', 'momiji'))
            gg.tree(f's{n}', x + rng.uniform(-0.035, 0.035), y + rng.uniform(-0.035, 0.035), rng.uniform(0.75, 1.05), kind)
            n += 1


def graves(st, used):
    n = 0
    for (i, j) in free_cells(st, used, {Y}):
        x, y = xy(i, j)
        for a in (-0.035, 0.035):
            for b in (-0.03, 0.03):
                h = st.rng.uniform(0.04, 0.06)
                box(f'haka{n}', 'bochi' if n % 3 else 'bochiD', (0.022, 0.016, h), (x + a, y + b, h / 2))
                n += 1
        used.add((i, j))


def route(st, a, b, block=()):
    """マス a から b へ、敷地の中のマスだけをたどる いちばん短い道（なければ []）"""
    prev, todo = {a: None}, [a]
    for p in todo:
        if p == b:
            break
        for da, db in STEPS:
            q = (p[0] + da, p[1] + db)
            if q in st.mask and q not in prev and (q not in block or q == b):
                prev[q] = p
                todo.append(q)
    if b not in prev:
        return []
    out, p = [], b
    while p is not None:
        out.append(p)
        p = prev[p]
    return out[::-1]


def path(cells, mat='ishi', w=0.07):
    """マスの並びをつなぐ参道・小道（となりどうしのマスの中心を結ぶ）"""
    for n, (a, b) in enumerate(zip(cells, cells[1:])):
        (x0, y0), (x1, y1) = xy(*a), xy(*b)
        box(f'sando{n}', mat, (abs(x1 - x0) + w, abs(y1 - y0) + w, 0.008), ((x0 + x1) / 2, (y0 + y1) / 2, 0.004))


# ---------- 建物（正面を -y にして、幅 w・奥行き d の中に作る） ----------
def shrine_bldg(w, d, inari=False):
    hd = d * 0.5 if d > 0.18 else d * 0.85   # 本殿の奥行き（拝殿を置けないほど小さいときは本殿だけ）
    hy = d / 2 - hd / 2
    h = min(0.16, 0.08 + w * 0.12)
    box('kidan', 'ishi', (w * 0.8, hd * 0.98, 0.03), (0, hy, 0.015))   # 基壇は本殿の場所の中に（敷地の外にはみ出さない）
    box('honden', 'wood', (w * 0.55, hd * 0.75, h), (0, hy, 0.03 + h / 2))
    gable('yane', 'roofP', w * 0.75, hd, h * 0.8, 0.03 + h, 0, hy)
    for dx in (-1, 1):   # 千木
        cyl(f'chigi{dx}', 'woodD', 0.007, 0.08, (dx * w * 0.32, hy, 0.03 + h * 1.75), (0, 0.5 * dx, 0), 6)
    if d > 0.18:   # 拝殿
        py = -d / 2 + (d - hd) / 2
        box('haiden', 'wallP', (w * 0.8, (d - hd) * 0.7, h * 0.7), (0, py, h * 0.35))
        gable('yaneH', 'roofP', w * 0.95, d - hd, h * 0.6, h * 0.7, 0, py)
        box('haidenF', 'kuro', (w * 0.3, 0.008, h * 0.4), (0, py - (d - hd) * 0.35 - 0.004, h * 0.22))
    else:
        box('hondenF', 'kuro', (w * 0.25, 0.008, h * 0.5), (0, hy - hd * 0.375 - 0.004, 0.03 + h * 0.4))


def temple_bldg(w, d, rng, flat=False):
    h = min(0.17, 0.08 + max(w, d) * 0.12)
    box('kidan', 'ishi', (w * 0.92, d * 0.92, 0.04), (0, 0, 0.02))
    box('hondo', 'wallP', (w * 0.7, d * 0.65, h), (0, 0, 0.04 + h / 2))
    for i in range(5):
        box(f'hashira{i}', 'woodD', (0.016, 0.016, h), ((-0.3 + i * 0.15) * w, -d * 0.325 - 0.006, 0.04 + h / 2))
    if flat:   # 陸屋根の本堂（新しいお寺）
        box('okujo', 'roofP', (w * 0.78, d * 0.73, 0.03), (0, 0, 0.04 + h + 0.015))
    else:
        roof('yane', 'roofP', w * 1.0, d * 0.95, h * 1.1, 0.04 + h, rng.uniform(0.3, 0.45))
        box('mune', 'munaG', (w * 0.35, 0.025, 0.025), (0, 0, 0.04 + h * 2.1))
    box('dan', 'ishi', (0.10, 0.05, 0.025), (0, -d / 2 + 0.025, 0.0125))   # 階段は長方形の中（正面の辺まで）


def windows_ring(w, d, floors, fh):
    """4つの面の窓（どの向きに回しても、見える面に窓がある）"""
    for f in range(floors):
        z = (f + 0.55) * fh
        for side, (L_, fixed) in enumerate(((w, -d / 2), (w, d / 2), (d, -w / 2), (d, w / 2))):
            cols = max(2, int(L_ / 0.06))
            for c in range(cols):
                t = -L_ / 2 + (c + 0.5) * L_ / cols
                ww = L_ / cols * 0.55
                if side < 2:
                    box(f'mado{f}_{side}_{c}', 'mado', (ww, 0.012, fh * 0.45), (t, fixed + (0.002 if side else -0.002), z))
                else:
                    box(f'mado{f}_{side}_{c}', 'mado', (0.012, ww, fh * 0.45), (fixed + (0.002 if side == 3 else -0.002), t, z))


def hall(w, d, roofcol, rng, floors=None, gablek=False):
    """ふつうの建物（館・社務所・庫裏・駅舎）。陸屋根か切妻"""
    fh = 0.07
    if floors is None:
        floors = max(1, min(4, int(math.sqrt(w * d) / 0.09)))
    hgt = floors * fh
    box('tate', 'wallP', (w * 0.86, d * 0.86, hgt), (0, 0, hgt / 2))
    windows_ring(w * 0.86, d * 0.86, floors, fh)
    if gablek:
        gable('yane', 'roofP', w * 0.98, d * 0.98, 0.06, hgt, 0, 0)
    else:
        box('okujo', 'roofP', (w * 0.88, d * 0.88, 0.016), (0, 0, hgt + 0.008))
    box('genkan', 'accP', (min(0.12, w * 0.4), 0.05, 0.012), (0, max(-d * 0.43 - 0.025, -d / 2 + 0.025), min(hgt, 0.07)))   # ひさしは長方形の中
    return hgt


def small_bldg(st, blob, n, style):
    x, y, w, d = bbox(inner(blob))
    rc = st.roof_of(blob)
    mat = f'roofS{n}'
    pa.MATS[mat] = gg.jitter(ROOFC.get(rc, pa.MATS['roofP']), st.rng, 6)
    h = 0.07 if style != 'flat' else 0.07 * max(1, min(3, int(math.sqrt(w * d) / 0.1)))
    box(f'sb{n}', 'wallP', (w * 0.82, d * 0.82, h), (x, y, h / 2))
    if style == 'flat' or rc in FLAT:
        box(f'sbY{n}', mat, (w * 0.86, d * 0.86, 0.016), (x, y, h + 0.008))
    else:
        rz = 0 if w >= d else math.pi / 2
        gable(f'sbY{n}', mat, max(w, d) * 0.95, min(w, d) * 0.95, 0.05, h, x, y, rz)


def torii(n, w, h, mat):
    """鳥居（笠木の幅は w＋0.03。入口のマスの中に入る大きさ）"""
    for dx in (-w / 2, w / 2):
        cyl(f'trP{n}{dx}', mat, 0.012, h, (dx, 0, h / 2), verts=8)
    box(f'trK{n}', mat, (w + 0.03, 0.022, 0.02), (0, 0, h + 0.008))
    box(f'trN{n}', mat, (w + 0.01, 0.016, 0.014), (0, 0, h * 0.8))
    if mat != 'ishi':
        box(f'trT{n}', 'kuro', (w + 0.034, 0.024, 0.006), (0, 0, h + 0.021))


def torii_at(st, cell, f, mat='accP', n=1):
    """入口のマスの中に鳥居（稲荷は n 基を参道の向きに並べる）"""
    x, y = xy(*cell)
    ang = angle_of(f)
    for k in range(n):
        g = Group()
        torii(k, 0.09, 0.12, mat)
        t = (k - (n - 1) / 2) * 0.035   # マスのまん中から、参道の向きに少しずつ
        g.place(ang, x - f[0] * t, y + f[1] * t)


def gate_at(st, cell, f, kind='mon'):
    x, y = xy(*cell)
    g = Group()
    if kind == 'mon':   # 山門（入口のマスの中に入る大きさ）
        box('mon', 'woodD', (0.10, 0.05, 0.08), (0, 0, 0.04))
        box('monD', 'kuro', (0.045, 0.052, 0.06), (0, 0, 0.03))
        roof('monY', 'roofP', 0.12, 0.08, 0.045, 0.08, 0.4)
    else:               # 門柱
        for dx in (-0.045, 0.045):
            box(f'monP{dx}', 'ishi', (0.02, 0.02, 0.06), (dx, 0, 0.03))
    g.place(angle_of(f), x, y)


# ---------- 種類ごと ----------
def m_worship(st):
    k, rng = st.k, st.rng
    blobs = st.blobs()
    used = set()
    main = blobs[0] if blobs else None
    if main is None or len(main) < 1:   # 建物がない：敷地のまん中に小さく
        c = min(st.mask, key=lambda p: (abs(p[0] - N // 2) + abs(p[1] - N // 2), p))
        main = [c]
    for p in main:
        used.add(p)
    f, gate = st.front(main)
    ang = angle_of(f)
    others = {p for b in blobs[1:4] for p in b}
    rect = grow(st, inner(main), others | {gate})   # 本殿・本堂を置く長方形（敷地の中で 2×2 まで広げる。入口のマスは使わない）
    used |= set(rect)   # 広げたマスにも木を植えない
    x, y, w, d = bbox(rect)
    w, d = fit(w, d, ang)   # 長方形より大きくしない（敷地の外にはみ出さない）
    rc = st.roof_of(main)
    if rc:
        pa.MATS['roofP'] = gg.jitter(ROOFC[rc], rng, 5)
    g = Group()
    if k in ('shrine', 'inari'):
        shrine_bldg(min(w, 0.42), min(d, 0.42), k == 'inari')
    elif k == 'church':
        box('do', 'wallP', (w * 0.7, d * 0.8, 0.13), (0, 0, 0.065))
        gable('doY', 'roofP', d * 0.85, w * 0.8, 0.09, 0.13, 0, 0, rz=math.pi / 2)
        ty = max(-d * 0.4, -d / 2 + 0.056)   # 塔は長方形の中
        box('to', 'wallP', (0.09, 0.09, 0.24), (0, ty, 0.12))
        roof('toY', 'roofP', 0.11, 0.11, 0.11, 0.24, 0.02, y=ty)
        box('juji', 'juji', (0.008, 0.008, 0.06), (0, ty, 0.38))
        box('jujiY', 'juji', (0.035, 0.008, 0.008), (0, ty, 0.39))
    else:
        temple_bldg(min(w, 0.5), min(d, 0.45), rng, flat=rc in FLAT)
    g.place(ang, x, y)
    # ほかの建物（社務所・庫裏・お堂）
    for n, b in enumerate(blobs[1:4]):
        small_bldg(st, b, n, 'flat' if st.roof_of(b) in FLAT else 'gable')
        used |= set(b)
    graves(st, used)
    # 入口から正面への参道と、鳥居・山門
    used.add(gate)
    # 参道の終わり：置いた長方形の正面の辺のまん中の、すぐ前のマス
    i0, i1 = min(i for i, _ in rect), max(i for i, _ in rect)
    j0, j1 = min(j for _, j in rect), max(j for _, j in rect)
    front_cell = {(0, 1): ((i0 + i1) // 2, j1 + 1), (0, -1): ((i0 + i1) // 2, j0 - 1),
                  (1, 0): (i1 + 1, (j0 + j1) // 2), (-1, 0): (i0 - 1, (j0 + j1) // 2)}[f]
    cells = route(st, gate, front_cell, block=set(main) | set(rect) | others) if front_cell in st.mask else []
    if cells:   # 敷地の中だけを通る参道
        path(cells)
        used.add(front_cell)
        st.clear |= set(cells)
    else:
        front_cell = None
    st.clear_front(rect)
    if k == 'inari':
        torii_at(st, gate, f, 'accP', rng.randint(3, 4))
        for s in (-1, 1):
            sphere(f'kitsune{s}', 'kitsune', 0.016, (xy(*gate)[0] + s * 0.045 * abs(f[1]), xy(*gate)[1] + s * 0.045 * abs(f[0]), 0.035), (0.8, 1.2, 1.4))
    elif k == 'shrine':
        torii_at(st, gate, f, 'ishi' if rng.random() < 0.3 else 'accP')
        if front_cell and rng.random() < 0.7:   # 灯籠は参道の両わき（となりのマスも敷地のときだけ）
            fx2, fy2 = xy(*front_cell)
            sides = [(front_cell[0] + s * abs(f[1]), front_cell[1] + s * abs(f[0])) for s in (-1, 1)]
            if all(p in st.mask for p in sides):
                for s in (-1, 1):
                    gg.toro(f'{s}', fx2 + s * 0.06 * abs(f[1]), fy2 + s * 0.06 * abs(f[0]), 0.8)
    elif k == 'temple':
        if len(st.mask) >= 16 and rng.random() < 0.6:
            gate_at(st, gate, f, 'mon')
        else:
            gate_at(st, gate, f, 'post')
        free = free_cells(st, used, {J, P, G})
        if len(st.mask) >= 20 and free and rng.random() < 0.5:   # 鐘つき堂
            c = rng.choice(free)
            used.add(c)
            bx, by = xy(*c)
            for dx in (-0.03, 0.03):
                for dy in (-0.03, 0.03):
                    box(f'sh{dx}{dy}', 'woodD', (0.01, 0.01, 0.11), (bx + dx, by + dy, 0.055))
            roof('shY', 'roofP', 0.12, 0.12, 0.05, 0.11, 0.2, x=bx, y=by)
            cyl('kane', 'kane', 0.02, 0.04, (bx, by, 0.08), verts=12)
    woods(st, used, 0.1, ('sugi', 'sugi', 'round') if k in ('shrine', 'inari') else ('pine', 'round', 'round'))


def m_building(st):
    """館（博物館・図書館・役所・美術館・温泉）。敷地の建物のかたまりに、本当の大きさ・屋根の色で"""
    rng = st.rng
    blobs = st.blobs()
    used = set()
    if blobs:
        main = blobs[0]
    else:
        main = cap(inner([p for p in st.mask if st.at(*p) != A]), 3)   # 建物のマスがない：敷地の中の長方形に（3×3 まで）
    f, gate = st.front(main)
    ang = angle_of(f)
    others = {p for b in blobs[1:4] for p in b}
    rect = grow(st, inner(main), others | {gate})   # 敷地の中で 2×2 まで広げた長方形（これより大きくしない）
    used |= set(main) | set(rect)   # 広げたマスにも木を植えない
    st.clear_front(rect)
    x, y, w, d = bbox(rect)
    w, d = fit(w, d, ang)
    w, d = min(w, 0.8), min(d, 0.7)
    rc = st.roof_of(main)
    if rc:
        pa.MATS['roofP'] = gg.jitter(ROOFC[rc], rng, 5)
    g = Group()
    floors = {'townhall': 4, 'library': 2, 'museum': 2, 'art': 2, 'onsen': 1}.get(st.k, 2)
    floors = max(1, min(5, floors + (1 if w * d > 0.25 else 0) - (1 if w * d < 0.06 else 0)))
    hgt = hall(w, d, rc, rng, floors, gablek=bool(rc) and rc not in FLAT and floors <= 2)
    if st.k == 'townhall':
        box('to', 'wallP', (0.08, 0.08, 0.10), (w * 0.3, 0, hgt + 0.05))
        box('toY', 'roofP', (0.09, 0.09, 0.012), (w * 0.3, 0, hgt + 0.106))
    elif st.k == 'onsen':
        for i in range(3):
            sphere(f'yuge{i}', 'yu', 0.035, (-0.06 + i * 0.06, 0, hgt + 0.05 + 0.03 * (i % 2)), (1, 1, 1.4))
    g.place(ang, x, y)
    if st.k == 'art':   # 入口のマスに像（アート）
        gx, gy = xy(*gate)
        sphere('chokoku', 'kane', 0.035, (gx, gy, 0.06), (0.7, 0.7, 1.6))
    for n, b in enumerate(blobs[1:4]):
        small_bldg(st, b, n, 'flat')
        used |= set(b)
    used.add(gate)
    if st.k in ('townhall',):
        gx, gy = xy(*gate)
        for i in range(2):
            cyl(f'pole{i}', 'hashira', 0.005, 0.22, (gx - 0.03 + i * 0.05, gy, 0.11), verts=6)
            box(f'flag{i}', ['accP', 'obi'][i], (0.04, 0.004, 0.025), (gx - 0.01 + i * 0.05, gy, 0.2))
    woods(st, used, 0.25, ('round', 'round', 'sakura', 'pine'))


def m_station(st):
    """駅：線路のマスに合わせた1本のまっすぐな線路（ななめでも、マスの中心に合わせた向き）とホーム・電車、建物のかたまりに駅舎"""
    rng = st.rng
    rails = [p for p in sorted(st.mask) if st.at(*p) == L]
    used = set(rails)
    pa.MATS['trainB'], pa.MATS['trainS'] = gg.TRAIN[st.e.get('train', 'meitetsu')]
    blobs = st.blobs()
    tr = st.tr
    if tr:
        cx, cy, th, ln, side = tr
        g = Group()
        box('senro', 'senro', (ln, 0.07, 0.012), (0, 0, 0.006))
        for t in (-0.022, 0.022):
            box(f'rail{t}', 'rail', (ln, 0.008, 0.008), (0, t, 0.016))
        hl = min(ln * 0.8, 0.6)
        box('home', 'home', (hl, 0.07, 0.05), (0, side * 0.075, 0.025))
        box('hY', 'yane2', (hl * 0.6, 0.06, 0.01), (0, side * 0.075, 0.13))
        for t in (-1, 0, 1):
            box(f'hP{t}', 'hashira', (0.01, 0.01, 0.08), (t * hl * 0.25, side * 0.075, 0.09))
        if rng.random() < 0.6:
            tl = min(hl, 0.5)
            box('train', 'trainB', (tl, 0.08, 0.10), (0, 0, 0.07), bevel=0.01)
            box('trainS', 'trainS', (tl + 0.004, 0.084, 0.014), (0, 0, 0.045))
            for j in range(4):
                box(f'tm{j}', 'mado', (0.04, 0.086, 0.03), (-tl / 2 + (j + 0.5) * tl / 4, 0, 0.09))
        g.place(th, cx, cy)
    if blobs:   # 駅舎（本当の建物のかたまり）
        b = blobs[0]
        f, _ = st.front(b)
        ang = angle_of(f)
        rect = grow(st, inner(b), {p for p in st.mask if st.at(*p) == L})   # 線路のマスには広げない
        x, y, w, d = bbox(rect)
        w, d = fit(w, d, ang)
        rc = st.roof_of(b)
        if rc:
            pa.MATS['roofP'] = gg.jitter(ROOFC[rc], rng, 5)
        g = Group()
        hall(min(w, 0.5), min(d, 0.4), rc, rng, 1 if w * d < 0.1 else 2, gablek=bool(rc) and rc not in FLAT)
        g.place(ang, x, y)
        used |= set(b)
        st.clear_front(b)
        for n, b2 in enumerate(blobs[1:3]):
            small_bldg(st, b2, n, 'flat')
            used |= set(b2)
    woods(st, used | {p for p in st.mask if st.at(*p) == L}, 0.1, ('round', 'sakura'))


def track(st):
    """駅の線路：線路のマスの並びに合わせた1本のまっすぐな線路（中心・向き・長さ・ホームの側）。線路のマスが2つないときは None"""
    rails = [p for p in sorted(st.mask) if st.at(*p) == L]
    if len(rails) < 2:
        return None
    pts = [xy(*p) for p in rails]
    mx, my = sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts)
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    syy = sum((y - my) ** 2 for _, y in pts)
    sxy = sum((x - mx) * (y - my) for x, y in pts)
    th = 0.5 * math.atan2(2 * sxy, sxx - syy)   # 線路の向き（主成分）
    proj = [(x - mx) * math.cos(th) + (y - my) * math.sin(th) for x, y in pts]
    ln = min(max(proj) - min(proj) + U, N * U)
    mid = (max(proj) + min(proj)) / 2
    cx, cy = mx + mid * math.cos(th), my + mid * math.sin(th)
    edge = N * U / 2 - 0.01   # 線路の両はし（幅を入れて）が 7×7 マスの外に出ないように短くする
    while ln > U and any(abs(cx + math.cos(th) * t - math.sin(th) * o) > edge or abs(cy + math.sin(th) * t + math.cos(th) * o) > edge
                         for t in (-ln / 2, ln / 2) for o in (-0.045, 0.045, -0.115, 0.115)):
        ln -= U / 8
    side = -1   # ホームは駅舎のある側（なければ南側）
    blobs = st.blobs()
    if blobs:
        bx, by, _, _ = bbox(blobs[0])
        side = 1 if (-(bx - cx) * math.sin(th) + (by - cy) * math.cos(th)) > 0 else -1
    return cx, cy, th, ln, side


def track_cells(st, tr):
    """線路・ホーム・電車が通るマス（地面を描く前に敷地に足す。ななめの線路が地面のないマスを通らないように）"""
    if not tr:
        return set()
    cx, cy, th, ln, side = tr
    c, s_ = math.cos(th), math.sin(th)
    out = set()
    steps = int(ln / (U / 6)) + 1
    for k in range(steps + 1):   # 両はしもふくめて、1/6 マスごとに
        t = -ln / 2 + ln * k / steps
        for off in (-0.045, 0.0, 0.045, side * 0.075, side * 0.115):
            x, y = cx + c * t - s_ * off, cy + s_ * t + c * off
            i, j = round(x / U) + N // 2, N // 2 - round(y / U)
            if 0 <= i < N and 0 <= j < N:
                out.add((i, j))
    return out


def center_cell(st, used=()):
    c = N // 2
    cells = [p for p in st.mask if p not in used and st.at(*p) not in (A, B, L)] or sorted(st.mask)
    return min(cells, key=lambda p: (abs(p[0] - c) + abs(p[1] - c), p))


def sign_at(x, y):
    for dx in (-0.022, 0.022):
        cyl(f'sgP{dx}', 'miki', 0.005, 0.08, (x + dx, y, 0.04), verts=6)
    box('sgB', 'kanban', (0.07, 0.01, 0.045), (x, y, 0.08))


def sign_near(st, c, used):
    """名所のマスのとなり（手前・右を先に）の敷地のマスに案内板。なければ同じマスの手前のすみに"""
    for a, b in ((0, 1), (1, 0), (-1, 0), (0, -1), (1, 1), (-1, 1)):
        q = (c[0] + a, c[1] + b)
        if q in st.mask and q not in used and st.at(*q) not in (A, B):
            used.add(q)
            return sign_at(*xy(*q))
    x, y = xy(*c)
    sign_at(x + 0.02, y - 0.05)


def m_monument(st):
    """史跡・像・古墳・城跡・見どころ・山。本当の敷地の形の上に"""
    rng, k = st.rng, st.k
    used = set()
    c = center_cell(st)
    used.add(c)
    x, y = xy(*c)
    blobs = st.blobs()
    if k == 'statue':
        box('daiza', 'ishi', (0.08, 0.08, 0.07), (x, y, 0.035))
        mat = 'kane' if rng.random() < 0.6 else 'ishi'
        cyl('karada', mat, 0.03, 0.11, (x, y, 0.125), verts=12, r2=0.024)
        sphere('atama', mat, 0.024, (x, y, 0.2))
    elif k == 'kofun':   # 墳丘：森・草のマスのかたまりに合わせた大きさ
        mound = [p for p in st.mask if st.at(*p) in (W, G, K, M)] or [c]
        mx, my, mw, md = bbox(inner(mound))   # 墳丘は、森・草のマスに入るいちばん大きな長方形の中の だ円
        if max(mw, md) < 0.25:   # 小さすぎるときは、敷地の中のいちばん大きな長方形に
            mx, my, mw, md = bbox(inner(sorted(st.mask)))
        r = min(max(mw, md) / 2, 0.36)
        sphere('fun', 'kusa', r, (mx, my, 0.0), (mw / max(mw, md), md / max(mw, md), 0.45))
        for n in range(rng.randint(2, 5)):
            a = rng.uniform(0, math.tau)
            gg.tree(f'k{n}', mx + math.cos(a) * r * 0.4, my + math.sin(a) * r * 0.4, rng.uniform(0.6, 0.85), rng.choice(('round', 'pine')))
        used |= set(mound)
        sign_near(st, min(st.mask, key=lambda p: (-p[1], p[0])), used)
    elif k in ('hill', 'view') and not blobs:
        hill = [p for p in st.mask if st.at(*p) in (W, K, M, G)] or [c]
        mx, my, mw, md = bbox(inner(hill))   # 山は、そのマスに入るいちばん大きな長方形の中の だ円
        r = min(max(mw, md) / 2, 0.42)
        hz = 0.8
        sphere('yama', 'kusa', r, (mx, my, -0.04), (mw / max(mw, md), md / max(mw, md), hz))
        top = -0.04 + r * hz
        for n in range(rng.randint(4, 7)):   # 山の木（山の面の高さに）
            a, t = rng.uniform(0, math.tau), rng.uniform(0.35, 0.8)
            tx, ty = mx + math.cos(a) * t * r * mw / max(mw, md), my + math.sin(a) * t * r * md / max(mw, md)
            g = Group()
            gg.tree(f'y{n}', 0, 0, rng.uniform(0.6, 0.85), rng.choice(('round', 'sugi', 'round')))
            g.place(0, tx, ty, -0.04 + r * hz * math.sqrt(max(0.0, 1 - t * t)) - 0.01)
        box('azumaya', 'azumaya', (0.07, 0.07, 0.045), (mx, my, top))
        roof('azumayaY', 'yaneA', 0.11, 0.11, 0.04, top + 0.022, 0.05, x=mx, y=my)
        used |= set(hill)
    elif k in ('castle', 'view') and blobs:   # 櫓・見どころの建物（本当の建物のかたまり）
        b = blobs[0]
        f, _ = st.front(b)
        ang = angle_of(f)
        bx, by, w, d = bbox(grow(st, inner(b)))
        w, d = fit(w, d, ang)
        rc = st.roof_of(b)
        if rc:
            pa.MATS['roofP'] = gg.jitter(ROOFC[rc], rng, 5)
        g = Group()
        w, d = min(w, 0.45), min(d, 0.4)   # 敷地の中で 2×2 まで広げた長方形より大きくしない
        if k == 'castle':
            pa.cyl('ishigaki', 'ishigaki', max(w, d) * 0.62, 0.08, (0, 0, 0.04), (0, 0, math.pi / 4), 4, r2=max(w, d) * 0.55)
            box('yagura', 'shikkui', (w * 0.6, d * 0.6, 0.09), (0, 0, 0.125))
            box('yaguraS', 'shitami', (w * 0.61, d * 0.61, 0.03), (0, 0, 0.095))
            roof('yaguraY', 'roofP', w * 0.85, d * 0.85, 0.07, 0.17, 0.4)
        else:
            box('tate', 'wallP', (w * 0.8, d * 0.8, 0.1), (0, 0, 0.05))
            roof('yane', 'roofP', w, d, 0.09, 0.1, rng.uniform(0.3, 0.6))
        g.place(ang, bx, by)
        used |= set(b)
        for n, b2 in enumerate(blobs[1:3]):
            small_bldg(st, b2, n, 'gable')
            used |= set(b2)
    else:   # 石碑・祠・門
        r = rng.random()
        if k == 'castle' or r < 0.5:
            h = rng.uniform(0.12, 0.2)
            box('hiB', 'ishi', (0.1, 0.08, 0.03), (x, y, 0.015))
            box('hi', 'ishi', (rng.uniform(0.04, 0.065), 0.025, h), (x, y, 0.03 + h / 2))
            box('hiT', 'kuro', (0.008, 0.027, h * 0.6), (x, y - 0.001, 0.03 + h / 2))
            if k == 'castle':   # 石垣のなごり
                for n in range(3):
                    box(f'ishigaki{n}', 'ishigaki', (0.06, 0.05, 0.04 + 0.01 * n), (x - 0.12 + n * 0.06, y + 0.1, 0.02 + 0.005 * n))
        elif r < 0.8:
            box('hokoraB', 'ishi', (0.09, 0.08, 0.035), (x, y, 0.0175))
            box('hokora', 'woodD', (0.065, 0.055, 0.055), (x, y, 0.062))
            gable('hokoraY', 'roofP', 0.09, 0.09, 0.04, 0.09, x, y)
        else:
            box('mon', 'wallP', (0.11, 0.06, 0.08), (x, y, 0.04))   # 門（マスの中に入る大きさ）
            box('monD', 'woodD', (0.05, 0.062, 0.07), (x, y, 0.035))
            roof('monY', 'roofP', 0.125, 0.10, 0.05, 0.08, 0.5, y=y, x=x)
        if k != 'statue':
            sign_near(st, c, used)
        for n, b2 in enumerate(blobs[:2]):
            small_bldg(st, b2, n, 'gable')
            used |= set(b2)
    graves(st, used)
    woods(st, used, 0.22, ('round', 'pine', 'round', 'sakura'))


def bench(n, x, y):
    box(f'bench{n}', 'benchW', (0.07, 0.022, 0.008), (x, y, 0.03))
    box(f'benchB{n}', 'benchW', (0.07, 0.008, 0.022), (x, y + 0.012, 0.045))


def m_park(st):
    """公園・池・緑地・庭園・運動場・広場・海辺・灯台"""
    rng, k = st.rng, st.k
    used = set()
    water = [p for p in st.mask if st.at(*p) == A]
    used |= set(water)
    if k in ('pondpark', 'garden', 'park') and not water:   # 池がマスにないときは、芝生に入る長方形（2×2 まで）の中に小さな池
        rect = cap(inner([p for p in st.mask if st.at(*p) in (P, G, J)] or sorted(st.mask)), 2)
        x, y, w, d = bbox(rect)
        sphere('ike', 'ike', 0.5, (x, y, 0.0), (w * 0.8, d * 0.8, 0.012))   # だ円は長方形の中
        used |= set(rect)
    if k == 'sports':
        open_ = [p for p in st.mask if st.at(*p) in (P, G)]
        if open_:
            x, y, w, d = bbox(inner(open_))   # 競技場は芝生のマスに入るいちばん大きな長方形の中
            box('field', 'tsuchiG', (w * 0.9, d * 0.9, 0.006), (x, y, 0.003))
            box('lineX', 'line', (w * 0.8, 0.006, 0.002), (x, y, 0.007))
            box('lineY', 'line', (0.006, d * 0.8, 0.002), (x, y, 0.007))
            for dx in (-w * 0.4, w * 0.4):
                box(f'goal{dx}', 'net', (0.008, 0.08, 0.05), (x + dx, y, 0.025))
            used |= set(open_)
    if k == 'garden':
        for n in range(rng.randint(3, 6)):
            c = rng.choice(sorted(st.mask))
            x, y = xy(*c)
            sphere(f'iwa{n}', 'ishi', 0.02, (x + rng.uniform(-0.04, 0.04), y + rng.uniform(-0.04, 0.04), 0.0), (1.3, 1, 0.8))
        c = center_cell(st, used)
        gg.toro('g', *xy(*c), 0.8)
        used.add(c)
    if k in ('beach', 'lighthouse'):
        for n, p in enumerate(water[:6]):
            x, y = xy(*p)
            box(f'nami{n}', 'nami', (U * 0.6, 0.01, 0.004), (x, y, 0.0))
        if k == 'lighthouse':
            c = center_cell(st, used)
            x, y = xy(*c)
            if st.at(*c) == A or not [p for p in st.mask if st.at(*p) != A]:   # 海の上：堤防をのばして、その先に
                box('teibo', 'teibo', (U * 4, 0.06, 0.04), (x - U * 1.5, y, 0.02))
                c = min(st.mask, key=lambda p: (abs(p[0] - N // 2) + abs(p[1] - N // 2), p))
                x, y = xy(N // 2, N // 2)
            cyl('todai', 'todai', 0.04, 0.3, (x, y, 0.15), verts=16, r2=0.03)
            for z in (0.08, 0.2):
                cyl(f'todaiR{z}', 'todaiR', 0.038, 0.03, (x, y, z), verts=16)
            used.add(c)
        else:
            for n in range(rng.randint(1, 2)):
                sand = [p for p in st.mask if st.at(*p) == S and p not in used]
                if not sand:
                    break
                x, y = xy(*rng.choice(sand))
                cyl(f'pP{n}', 'hashira', 0.005, 0.1, (x, y, 0.05), verts=6)
                cyl(f'pK{n}', ['parasol2', 'accP'][n % 2], 0.06, 0.03, (x, y, 0.11), verts=8, r2=0.004)
    if k in ('pondpark', 'park', 'forest', 'garden', 'plaza', 'view'):
        free = free_cells(st, used, {P, G, D, T})
        for n in range(min(len(free), rng.randint(1, 2))):
            c = free[(n * 7 + rng.randint(0, 3)) % len(free)]
            bench(n, *xy(*c))
            used.add(c)
        if k in ('pondpark', 'park', 'view') and len(st.mask) >= 16 and free and rng.random() < 0.5:   # あずまや
            c = rng.choice([p for p in free if p not in used] or free)
            x, y = xy(*c)
            for dx in (-0.03, 0.03):
                for dy in (-0.03, 0.03):
                    box(f'az{dx}{dy}', 'azumaya', (0.01, 0.01, 0.08), (x + dx, y + dy, 0.04))
            roof('azY', 'yaneA', 0.11, 0.11, 0.04, 0.08, 0.05, x=x, y=y)
            used.add(c)
    for n, b in enumerate(st.blobs()[:2]):
        small_bldg(st, b, n, 'gable')
        used |= set(b)
    woods(st, used, 0.5 if k == 'forest' else 0.25, ('round', 'round', 'sakura', 'pine') if k != 'beach' else ('pine',))


def build(e):
    st = Site(e)
    rng = st.rng
    base = gg.BASE[gg.BASE_OF.get(e['k'], 'historic')]
    cols = [c if isinstance(c, str) and len(c) == 7 else base[i] for i, c in enumerate((e['c'] + [0, 0, 0])[:3])]
    pa.MATS['roofP'], pa.MATS['wallP'], pa.MATS['accP'] = gg.jitter(cols[0], rng), gg.jitter(cols[1], rng, 8), gg.jitter(cols[2], rng, 10)
    name = e['name']
    if st.k == 'castle' and not re.search('城(跡|址|趾|山|公園)?$|天守|櫓|城門|城跡|城址', name):   # 型の分類で城になったが城でない所（「安城市」の清掃センターなど）
        st.k = 'museum' if st.blobs() else 'historic'
    elif re.search('碑|記念塔|顕彰|跡$|址$', name) and st.k not in ('shrine', 'inari', 'temple', 'church', 'castle', 'kofun', 'statue'):
        st.k = 'historic'   # 「〜温泉 湧出の碑」のような碑は、館でなく石碑
    elif st.k == 'church' and not re.search('キリスト|カトリック|ルーテル|福音|バプテスト|ホーリネス|ハリストス|基督|リバイバル|アドベンチスト', name):
        # 「教会」でもキリスト教でない所（立正佼成会・金光教・御嶽教・観音・大師・寺・PL・イスラム など）には十字架を描かない
        st.k = 'temple' if re.search('寺|観音|薬師|大師|佼成|金光|御嶽|天理', name) else 'museum'
    elif st.k == 'view' and st.blobs() and len(st.blobs()[0]) >= 4:
        st.k = 'museum'     # 体育館・会館のような大きな建物の見どころは、窓のある館に
    if st.k != e['k']:
        st.mask = st.region()
    if st.k == 'station':   # 線路・ホームが通るマスも地面に（線路は敷地を広げる前に1度だけ決める）
        st.tr = track(st)
        st.mask |= track_cells(st, st.tr)
    ground(st)
    k = st.k
    if k in ('shrine', 'inari', 'temple', 'church'):
        m_worship(st)
    elif k in ('museum', 'library', 'townhall', 'art', 'onsen', 'aquarium'):
        m_building(st)
    elif k == 'station':
        m_station(st)
    elif k in ('historic', 'statue', 'kofun', 'castle', 'hill', 'view'):
        m_monument(st)
    else:
        m_park(st)
    return frame(rng.uniform(28, 33), rng.uniform(-38, -30))


def frame(el, az):
    """作った物がぜんぶ入るように、カメラの向きから見た広がりで写す範囲を決める（はしで切れないように）"""
    import bpy
    from mathutils import Vector
    bpy.context.view_layer.update()
    e, a = math.radians(el), math.radians(az)
    right = Vector((math.cos(a), math.sin(a), 0))
    up = Vector((-math.sin(a) * math.sin(e), math.cos(a) * math.sin(e), math.cos(e)))
    us, vs = [], []
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            us.append(p.dot(right))
            vs.append(p.dot(up))
    uc, vc = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
    t = right * uc + up * vc
    scale = max(0.62, max(max(us) - min(us), max(vs) - min(vs)) * 1.06)
    return dict(target=tuple(t), scale=scale, el=el, az=az, size=96)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    part = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--part=')), None)
    out = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--out=')), None)
    if out:
        pa.OUT = out
    todo = [e for e in LIST if not args or e['id'] in args]
    if part:
        i, n = map(int, part.split('/'))
        todo = todo[i::n]
    pa.MODELS.clear()
    for e in todo:
        pa.MODELS[e['id']] = (lambda e=e: build(e))
    for e in todo:
        pa.make(e['id'])

# にしおさんぽGO：西尾の四季ドット絵の「名物と景色」8つ（名所ではない、西尾ならではの景色）の形。tools/blender/giant-pr.py が読む
# - どれも docs/dots-nishio.md の表（西尾ドット絵帳の題材）で、出典を確かめた事実をもとにした景色。説明の文もその表から
# - 形は giant-gen.py と同じ道具（box・cyl・sphere・木・鳥居）で作る。色の材質の名前は、季節で色が変わるもの（ine・cha など）を giant-pr-color.py が見る
import math
import random

SCENES = {}   # id → (名前, 地区, 説明, 作り方)


def scene(sid, name, area, desc):
    def deco(fn):
        SCENES[sid] = (name, area, desc, fn)
        return fn
    return deco


def setup(gg):
    """giant-gen.py の道具を借りて、景色の作り方を登録する"""
    pa = gg.pa
    box, cyl, sphere = pa.box, pa.cyl, pa.sphere
    pa.MATS.update({'ooi': '#2a2c2e', 'ooiP': '#5a5048', 'ike': '#4a8ab8', 'aze': '#8a7a58', 'suisha': '#e8c020', 'suishaB': '#2f74b8', 'vinyl': '#e4ecee',
                    'higata': '#a89878', 'higataW': '#8ab0c8', 'kai': '#e8dcc8', 'oke': '#3f7fbf', 'hito': '#e8783a', 'hitoB': '#2f5d9a', 'boshi': '#f2e6c0',
                    'ine': '#4f9a3e', 'mizuta': '#7aa8c8', 'kakashi': '#c8a060', 'take': '#c8b070', 'ami': '#2f4a3a', 'fune': '#f0ece0', 'funeR': '#c8382c',
                    'tetsu': '#9aa0a8', 'hana': '#d83a4a', 'hanaP': '#f08aa8', 'kuki': '#4f8a3a', 'chochin': '#f4efe0', 'chochinR': '#c8382c', 'yagura': '#8a6a4a',
                    'enden': '#d8ccb0', 'endenL': '#b8a888', 'kama': '#3a3a3a', 'koya': '#7a5a3c', 'yaneK': '#59606a', 'kemuri': '#e8e8e8', 'kao': '#f4c9a0'})

    def flat(name, mat, w, d, x=0.0, y=0.0, z=0.0, h=0.02):
        return box(name, mat, (w, d, h), (x, y, z + h / 2))

    @scene('m-kabuse', '覆いをかけたてん茶の茶畑', 'nishio', '西尾のお茶の96％以上は、抹茶の原料になる「てん茶」。日光をさえぎって育てるので、甘み・うま味が増し、あざやかな緑になります。')
    def kabuse():
        rng = random.Random('m-kabuse')
        flat('ground', 'tsuchi', 0.94, 0.74, z=-0.02)
        for i in range(5):   # 茶の木の列（かまぼこ形）
            y = -0.28 + i * 0.14
            o = cyl(f'cha{i}', 'cha', 0.05, 0.80, (0, y, 0.05), (0, math.pi / 2, 0), 16)
            o.scale = (1.4, 1, 1)
            if i in (1, 2, 3):   # 3列は 黒い覆いをかけた棚の下
                for x in (-0.38, 0.0, 0.38):
                    for dy in (-0.06, 0.06):
                        cyl(f'po{i}{x}{dy}', 'ooiP', 0.008, 0.16, (x, y + dy, 0.08), verts=6)
                box(f'ooi{i}', 'ooi', (0.84, 0.15, 0.012), (0, y, 0.165))
                box(f'ooiS{i}', 'ooi', (0.84, 0.008, 0.10), (0, y - 0.075, 0.115))
        box('koya', 'koya', (0.14, 0.10, 0.10), (0.36, 0.32, 0.05))
        gg.gable('koyaY', 'yaneK', 0.18, 0.14, 0.06, 0.10, x=0.36, y=0.32)
        gg.tree(0, -0.40, 0.32, rng.uniform(0.8, 1.0), 'round')
        return dict(target=(0, 0, 0.08), scale=1.02, el=32, az=-34, size=96)

    @scene('m-unagi', 'うなぎの養殖池と水車', 'isshiki', '国産うなぎの5尾に1尾は一色産。一色町の養鰻池は、矢作川水系の水を養鰻専用の水道で取って使っています。')
    def unagi():
        flat('ground', 'aze', 0.94, 0.74, z=-0.02)
        for i, (x, y, w, d) in enumerate(((-0.22, -0.16, 0.42, 0.34), (0.24, -0.16, 0.42, 0.34), (-0.22, 0.22, 0.42, 0.30))):
            flat(f'ike{i}', 'ike', w, d, x, y, z=-0.005, h=0.012)
            for j, dx in enumerate((-0.1, 0.1)):   # 水車（池に空気を入れる羽根車）
                cx, cy = x + dx, y + (0.02 if j else -0.04)
                cyl(f'jiku{i}{j}', 'tetsu', 0.008, 0.10, (cx, cy, 0.035), (0, math.pi / 2, 0), 6)
                for k in range(4):
                    a = k * math.pi / 4
                    box(f'hane{i}{j}{k}', 'suisha' if k % 2 else 'suishaB', (0.012, 0.03, 0.07), (cx, cy, 0.035), (a, 0, 0))
                box(f'uki{i}{j}', 'suishaB', (0.12, 0.02, 0.012), (cx, cy - 0.04, 0.012))
        box('house', 'vinyl', (0.40, 0.28, 0.10), (0.24, 0.22, 0.05))   # ビニールハウスの池
        o = cyl('houseR', 'vinyl', 0.14, 0.40, (0.24, 0.22, 0.10), (0, math.pi / 2, 0), 16)
        o.scale = (0.5, 1, 1)
        return dict(target=(0, 0, 0.04), scale=1.02, el=34, az=-34, size=96)

    @scene('m-asari', '三河湾のあさり（潮干狩り）', 'isshiki', '三河湾でとれるあさりは、全国の半分ぐらいをしめるといわれます。潮が引いた干潟で、潮干狩りができます。')
    def asari():
        rng = random.Random('m-asari')
        flat('umi', 'umiB', 0.94, 0.30, y=0.24, z=-0.02)
        flat('higata', 'higata', 0.94, 0.46, y=-0.14, z=-0.02)
        for i in range(5):
            flat(f'mizu{i}', 'higataW', rng.uniform(0.08, 0.18), 0.03, rng.uniform(-0.4, 0.4), rng.uniform(-0.3, 0.05), z=0.0, h=0.004)
        for i in range(14):
            sphere(f'kai{i}', 'kai', 0.012, (rng.uniform(-0.42, 0.42), rng.uniform(-0.34, 0.06), 0.006), (1.3, 1, 0.5))
        for i, (x, y) in enumerate(((-0.22, -0.10), (0.06, -0.20), (0.28, -0.02))):   # かがんで あさりをとる人とバケツ
            sphere(f'karada{i}', 'hito' if i != 1 else 'hitoB', 0.045, (x, y, 0.07), (1, 0.9, 0.8))
            sphere(f'atama{i}', 'kao', 0.025, (x + 0.03, y - 0.02, 0.10))
            cyl(f'boshi{i}', 'boshi', 0.035, 0.012, (x + 0.03, y - 0.02, 0.124), verts=12)
            cyl(f'oke{i}', 'oke', 0.022, 0.035, (x - 0.07, y - 0.01, 0.018), verts=10)
        return dict(target=(0, 0, 0.03), scale=1.0, el=32, az=-30, size=96)

    @scene('m-tanbo', '西尾の田んぼ', 'nishio', '矢作川下流の平野に広がる田んぼ。季節で、水をはった田・青い稲・金色の稲穂・刈りあとの田と、すがたを変えます。')
    def tanbo():
        flat('ground', 'aze', 0.94, 0.74, z=-0.02)
        for p, (x, y) in enumerate(((-0.23, -0.18), (0.23, -0.18), (-0.23, 0.18), (0.23, 0.18))):
            flat(f'mizuta{p}', 'mizuta', 0.42, 0.32, x, y, z=-0.006, h=0.01)
            for r in range(6):   # 稲の列
                for c in range(7):
                    box(f'ine{p}{r}{c}', 'ine', (0.035, 0.03, 0.05), (x - 0.18 + c * 0.06, y - 0.13 + r * 0.052, 0.025))
        flat('mizo', 'umiB', 0.94, 0.03, 0, 0.0, z=-0.004, h=0.006)   # 用水路
        cyl('kakashiP', 'koya', 0.006, 0.12, (0.05, -0.16, 0.06), verts=6)   # かかし
        box('kakashiU', 'kakashi', (0.08, 0.01, 0.01), (0.05, -0.16, 0.09))
        sphere('kakashiA', 'boshi', 0.02, (0.05, -0.16, 0.13))
        return dict(target=(0, 0, 0.03), scale=1.02, el=34, az=-32, size=96)

    @scene('m-nori', '一色の海苔ひび', 'isshiki', '西尾市一色町の沿岸では、海苔が養殖されています。海に立てた竹の柵（ひび）に網を張って育てます。')
    def nori():
        flat('umi', 'umiB', 0.94, 0.74, z=-0.02)
        for r in range(4):
            y = -0.26 + r * 0.16
            for c in range(9):
                cyl(f'take{r}{c}', 'take', 0.006, 0.12, (-0.40 + c * 0.1, y, 0.04), verts=6)
            box(f'ami{r}', 'ami', (0.82, 0.05, 0.006), (0, y, 0.012))
        box('fune', 'fune', (0.20, 0.07, 0.04), (0.20, 0.30, 0.02), bevel=0.01)   # 小さな船
        box('funeR', 'funeR', (0.21, 0.072, 0.01), (0.20, 0.30, 0.035))
        box('funeK', 'fune', (0.05, 0.05, 0.05), (0.24, 0.30, 0.065))
        return dict(target=(0, 0, 0.03), scale=1.0, el=30, az=-32, size=96)

    @scene('m-carnation', 'カーネーションの温室', 'kira', '西尾市のカーネーションは、施設園芸（温室）の生産額が全国トップクラスです。')
    def carnation():
        flat('ground', 'tsuchi', 0.94, 0.74, z=-0.02)
        for g, x in enumerate((-0.22, 0.22)):
            for r in range(3):   # 花の列
                for c in range(6):
                    cyl(f'kuki{g}{r}{c}', 'kuki', 0.006, 0.06, (x - 0.13 + c * 0.052, -0.18 + r * 0.16, 0.03), verts=5)
                    sphere(f'hana{g}{r}{c}', 'hana' if (r + c) % 3 else 'hanaP', 0.018, (x - 0.13 + c * 0.052, -0.18 + r * 0.16, 0.07))
            for dx in (-0.18, 0.18):   # 温室の骨組みとガラス
                box(f'kabe{g}{dx}', 'glass', (0.004, 0.62, 0.16), (x + dx, 0, 0.08))
            box(f'oku{g}', 'glass', (0.36, 0.004, 0.16), (x, 0.31, 0.08))
            for s in (-1, 1):
                box(f'yane{g}{s}', 'glass', (0.20, 0.62, 0.004), (x + s * 0.09, 0, 0.20), (0, s * 0.45, 0))
            for k in range(5):
                cyl(f'hone{g}{k}', 'tetsu', 0.004, 0.17, (x - 0.18, -0.30 + k * 0.15, 0.085), verts=5)
                cyl(f'hone2{g}{k}', 'tetsu', 0.004, 0.17, (x + 0.18, -0.30 + k * 0.15, 0.085), verts=5)
        return dict(target=(0, 0, 0.08), scale=1.02, el=36, az=-34, size=96)

    @scene('m-chochin', '三河一色の大提灯', 'isshiki', '三河一色諏訪神社に伝わる、450年以上続く大提灯まつり（8月下旬）。大きな提灯が境内に並びます。')
    def chochin():
        rng = random.Random('m-chochin')
        flat('ground', 'jari', 0.94, 0.74, z=-0.02)
        for i, x in enumerate((-0.30, -0.10, 0.10, 0.30)):   # やぐらに つるした大提灯
            cyl(f'p{i}a', 'yagura', 0.012, 0.56, (x - 0.07, 0.10, 0.28), verts=6)
            cyl(f'p{i}b', 'yagura', 0.012, 0.56, (x + 0.07, 0.10, 0.28), verts=6)
            box(f'hari{i}', 'yagura', (0.18, 0.02, 0.02), (x, 0.10, 0.56))
            h = rng.uniform(0.30, 0.38)
            o = cyl(f'chochin{i}', 'chochin', 0.07, h, (x, 0.10, 0.54 - h / 2), verts=16)
            for z in (0.54 - 0.03, 0.54 - h + 0.03):
                cyl(f'wa{i}{z}', 'chochinR', 0.072, 0.03, (x, 0.10, z), verts=16)
            box(f'mon{i}', 'chochinR', (0.06, 0.004, 0.06), (x, 0.10 - 0.071, 0.54 - h / 2))
        gg.torii(0, 0, -0.26, 0.24, 0.20, 'hashiR')
        gg.toro(0, -0.36, -0.22)
        gg.toro(1, 0.36, -0.22)
        return dict(target=(0, 0, 0.24), scale=1.0, el=24, az=-30, size=96)

    @scene('m-enden', '饗庭塩の塩田', 'kira', '吉良は、江戸時代の「饗庭塩」の産地。吉良饗庭塩の里では、塩づくりを体験できます。')
    def enden():
        flat('umi', 'umiB', 0.94, 0.20, y=0.27, z=-0.02)
        flat('enden', 'enden', 0.94, 0.54, y=-0.10, z=-0.02)
        for i in range(8):   # 砂をならした すじ
            box(f'suji{i}', 'endenL', (0.62, 0.008, 0.004), (-0.12, -0.32 + i * 0.06, 0.002))
        flat('mizo', 'umiB', 0.03, 0.54, 0.24, -0.10, z=-0.004, h=0.006)
        box('koya', 'koya', (0.18, 0.14, 0.12), (0.36, -0.12, 0.06))   # 塩を煮る小屋とかま
        gg.gable('koyaY', 'yaneK', 0.22, 0.18, 0.07, 0.12, x=0.36, y=-0.12)
        cyl('kama', 'kama', 0.04, 0.03, (0.36, -0.24, 0.015), verts=12)
        for k in range(3):
            sphere(f'kemuri{k}', 'kemuri', 0.03 - k * 0.006, (0.40 + k * 0.03, -0.10, 0.24 + k * 0.05))
        cyl('oke', 'oke', 0.022, 0.035, (-0.30, -0.28, 0.018), verts=10)
        return dict(target=(0, 0, 0.05), scale=1.0, el=32, az=-32, size=96)

# にしおさんぽGO：48×48 の手描きの絵がある OpenStreetMap の名所と、のこりの注目スポットを、1か所ずつ手で形を作った「特大のドット絵」（96×96）に
# - 作り方・部品・焼き方は giant-nishio.py と同じ（そこから部品を借りる）
# - OpenStreetMap の名所（名前が n/w/r＋数字の id）：形と色は pixel.js の spotSprites.osm… の 48×48 の絵とその説明に合わせる。
#   PNG は前の型の絵と同じ名前（nishio-go/art/giant/<id>.png）に上書きする（歩く地図は list.json の id で読む）
# - 注目スポット（spots.json の id）：48×48 の絵がないので、説明文に書いてあることだけから形を決める。PNG は <id>.png、pixel.js の GIANT_ART で描く
# - 看板・駅名板の字は描かない（色の板だけ）
# 使い方：python tools/blender/giant-osm.py （ぜんぶ）／ python tools/blender/giant-osm.py n6057440275 （ひとつ）
import importlib.util
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('giant_nishio', os.path.join(HERE, 'giant-nishio.py'))
gnis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gnis)
pa, gn, bpy = gnis.pa, gnis.gn, gnis.bpy
box, cyl, sphere = pa.box, pa.cyl, pa.sphere
roof, gable, gable_y, irimoya, ground, tree, torii, toro, steps, hall, water = (
    gn.roof, gn.gable, gn.gable_y, gn.irimoya, gn.ground, gn.tree, gn.torii, gn.toro, gn.steps, gn.hall, gn.water)
pine, windows = gn.pine, gn.windows
ishidatami, lattice, sign_board, fence, view, train, person, jizo, shimenawa = (
    gnis.ishidatami, gnis.lattice, gnis.sign_board, gnis.fence, gnis.view, gnis.train, gnis.person, gnis.jizo, gnis.shimenawa)

pa.MATS.update({
    'tealR': '#4f9a8e', 'tileBr': '#8a5a3a', 'vendR': '#d23a2e', 'vendB': '#3a6ad0', 'vendO': '#e8862a', 'shutter': '#a0a0a0',
    'kokaC': '#b8b4ac', 'kokaD': '#8a8680', 'akaEki': '#d22a2a', 'tileRed': '#a8583a', 'tileRedD': '#7a3a26', 'doban3': '#5f9a7a',
    'kuroki': '#4a3628', 'tinR': '#9a4a32', 'ekiBeige': '#e8dcc4', 'ninjin': '#e87a1e', 'ninjinH': '#4f9a3a', 'hatake': '#8a6a44',
    'aikanG': '#7ac043', 'ningyo1': '#d23a6a', 'ningyo2': '#3a7fd0', 'ningyo3': '#e8b830', 'ekiSign': '#f4f4f0', 'ekiSignR': '#c8162a',
})


# ---------- 部品 ----------
def eki_sign(n, x, y, z, w=0.14):
    """駅名板（白い板に赤い帯。字は描かない）"""
    box(f'esf{n}', 'kokaD', (w + 0.014, 0.01, 0.054), (x, y + 0.002, z))   # 白い壁でも見えるように、灰色のわく
    box(f'es{n}', 'ekiSign', (w, 0.012, 0.04), (x, y, z))
    box(f'esr{n}', 'ekiSignR', (w * 0.3, 0.014, 0.012), (x - w * 0.3, y - 0.002, z))


def vending(n, x, y, mat='vendR'):
    box(f'vm{n}', mat, (0.05, 0.04, 0.1), (x, y, 0.05))
    box(f'vmw{n}', 'ekiSign', (0.036, 0.012, 0.03), (x, y - 0.02, 0.07))


def kamaboko_eki(n='k', x=0.0, y=0.06, w=0.52, d=0.24, h=0.18, door_x=None):
    """名鉄の小さな駅舎：白い壁、下は茶色のタイル、青緑のかまぼこ屋根（ゆるい丸）"""
    box(f'kb{n}', 'shikkui', (w, d, h), (x, y, h / 2))
    box(f'kt{n}', 'tileBr', (w + 0.004, d + 0.004, h * 0.32), (x, y, h * 0.16))
    o = cyl(f'kr{n}', 'tealR', d / 2 + 0.03, w + 0.06, (x, y, h), (0, math.pi / 2, 0), 20)
    o.scale = (0.45, 1, 1)
    bpy.context.view_layer.update()
    half_top(o, h)
    dx = x - w * 0.3 if door_x is None else door_x
    box(f'kd{n}', 'kuro', (0.1, 0.01, 0.12), (dx, y - d / 2 - 0.004, 0.06))
    eki_sign(n, x + w * 0.16, y - d / 2 - 0.006, h * 0.62, 0.18)


def train2(n, x, y, z=0.0, cars=2, l=0.28, body='meitetsu', band='obi'):
    """電車（路線の色：名鉄は赤に白い帯、JR は銀にオレンジの帯、愛知環状鉄道は銀に黄緑の帯）"""
    train(n, x, y, z, cars, mat=body, l=l)
    for o in bpy.context.scene.objects:
        if o.name.startswith(f'tro{n}'):
            o.data.materials[0] = pa.material(band)


LINE = {'meitetsu': ('meitetsu', 'obi'), 'jr': ('jrSilver', 'jrOrange'), 'aikan': ('jrSilver', 'aikanG')}


def platform(n='p', y=0.3, train_on=True, z=0.05, line='meitetsu'):
    box(f'pf{n}', 'home', (0.96, 0.16, z), (0, y, z / 2))
    if train_on:
        train2(n, 0.12, y, z, 2, 0.28, *LINE[line])


def half_top(o, zc):
    """かまぼこ屋根：円柱の下半分（zc より下）を zc までもちあげ、上の半分だけの形にする（下の壁や駅名板を隠さないように）"""
    mw = o.matrix_world
    inv = mw.inverted()
    for v in o.data.vertices:
        w = mw @ v.co
        if w.z < zc:
            w.z = zc
            v.co = inv @ w


# ---------- のこりの注目スポット（説明文から） ----------
def hekinan_saihoji():
    """西方寺（清澤満之記念館）：灰色の瓦の本堂と、境内の小さな記念館（白い壁）、松"""
    ground('jari')
    hall('h', -0.08, 0.16, 0.4, 0.22, 0.14, 'kiji', 'kawaraG', z=0.05)
    box('kinen', 'shikkui', (0.2, 0.16, 0.12), (0.3, -0.08, 0.06))
    roof('kinenY', 'kawaraG', 0.26, 0.22, 0.06, 0.12, 0.5, 0.3, -0.08)
    box('kinenD', 'kijiD', (0.06, 0.01, 0.08), (0.3, -0.161, 0.04))
    pine('p', -0.36, -0.12, 1.1)
    ishidatami('s', -0.08, -0.38, 0.0, 0.12)
    return view(0.22)


def hekinan_aoi_park():
    """あおいパーク：野菜の直売所の建物（三角屋根）、もぎとり体験の農園の畝、にんじんの畑（オレンジのにんじんがのぞく）。説明文にない設備は描かない"""
    ground('shibaG')
    box('chok', 'cream', (0.36, 0.2, 0.14), (-0.18, 0.18, 0.07))
    gable('chokY', 'yaneR', 0.42, 0.26, 0.09, 0.14, -0.18, 0.18)
    box('chokD', 'glassB', (0.14, 0.01, 0.09), (-0.18, 0.079, 0.05))
    for i in range(3):   # もぎとり体験の農園（野菜の畝）
        box(f'une{i}', 'hatake', (0.3, 0.05, 0.03), (0.24, 0.12 + i * 0.08, 0.015))
        for k in range(5):
            sphere(f'yasai{i}{k}', 'ninjinH', 0.022, (0.12 + k * 0.06, 0.12 + i * 0.08, 0.045))
    box('hata', 'hatake', (0.7, 0.26, 0.02), (0, -0.2, 0.01))
    for r in range(3):
        for i in range(8):
            x, y = -0.3 + i * 0.085, -0.28 + r * 0.08
            sphere(f'ha{r}{i}', 'ninjinH', 0.022, (x, y, 0.045), (1, 1, 1.4))
            if (r + i) % 3 == 0:
                cyl(f'nj{r}{i}', 'ninjin', 0.012, 0.03, (x + 0.014, y - 0.01, 0.03), verts=6, r2=0.003)
    return view(0.16)


def takahama_ningyo_koji():
    """人形小路：散歩道ぞいの、屋根つきの小さな舞台に立つ等身大の細工人形（色とりどりの衣）"""
    ground('jari')
    box('michi', 'michi', (1.0, 0.16, 0.008), (0, -0.2, 0.012))
    for i, (x, m) in enumerate(((-0.28, 'ningyo1'), (0.04, 'ningyo2'), (0.34, 'ningyo3'))):
        box(f'dai{i}', 'kiji', (0.22, 0.16, 0.04), (x, 0.08, 0.02))
        box(f'ura{i}', 'kijiD', (0.22, 0.02, 0.28), (x, 0.15, 0.16))
        for dx in (-0.1, 0.1):
            box(f'ha{i}{dx}', 'kijiD', (0.016, 0.016, 0.28), (x + dx, 0.02, 0.16))
        gable(f'yane{i}', 'kawaraG', 0.28, 0.22, 0.06, 0.3, x, 0.08)   # 屋根は人形の頭より上に（顔が見えるように）
        person(f'n{i}a', x - 0.04, 0.08, 0.04, m, 1.4)
        person(f'n{i}b', x + 0.05, 0.1, 0.04, ('ningyo2', 'ningyo3', 'ningyo1')[i], 1.3)
    return view(0.18)


# ---------- OpenStreetMap の名所（48×48 の絵に合わせる） ----------
def nishioguchi():
    """西尾口駅（高架下）：コンクリートの高架の柱と天井の下に、シャッターの入口、駅名板、赤い自動販売機"""
    ground('asphalt')
    box('koka', 'kokaC', (0.96, 0.4, 0.06), (0, 0.06, 0.34))
    box('kokaF', 'kokaD', (0.96, 0.02, 0.05), (0, -0.14, 0.31))
    for x in (-0.38, 0.38):
        box(f'hashira{x}', 'kokaC', (0.08, 0.3, 0.31), (x, 0.08, 0.155))
    box('kabe', 'tileBr', (0.6, 0.02, 0.28), (0, 0.2, 0.14))
    box('shutter', 'shutter', (0.26, 0.012, 0.2), (0, 0.188, 0.1))
    for i in range(6):
        box(f'sl{i}', 'kokaD', (0.26, 0.014, 0.004), (0, 0.186, 0.03 + i * 0.03))
    eki_sign('s', 0, -0.13, 0.27, 0.22)
    vending('v', 0.26, 0.14)
    box('kaidan', 'kokaC', (0.08, 0.12, 0.16), (-0.24, 0.12, 0.08))
    return view(0.2)


def fukuchi():
    """福地駅：青緑のかまぼこ屋根の白い駅舎（下は茶色のタイル）、左に灰色の屋根の自転車置き場"""
    ground('asphalt')
    platform()
    kamaboko_eki(x=0.12)
    for x in (-0.42, -0.2):
        box(f'jh{x}', 'hashira', (0.012, 0.012, 0.14), (x, -0.02, 0.07))
    box('jy', 'yane2', (0.28, 0.16, 0.012), (-0.31, 0.02, 0.145))
    for i in range(4):
        box(f'jt{i}', 'vendB' if i % 2 else 'vendR', (0.012, 0.08, 0.05), (-0.4 + i * 0.06, 0.02, 0.03))
    return view(0.18)


def sakuramachimae():
    """桜町前駅：横に長い青緑のかまぼこ屋根の白い駅舎、茶色のタイルの腰壁、駅名板、白い柵"""
    ground('asphalt')
    platform()
    kamaboko_eki(x=0.0, w=0.7)
    fence('f', 'shikkui', -0.4, 0.4, -0.16, 0.05, 14)
    return view(0.18)


def kamiyokosuka():
    """上横須賀駅：青緑のかまぼこ屋根の白い駅舎、下は茶色のタイル、左に暗い入口、駅名板"""
    ground('asphalt')
    platform()
    kamaboko_eki(x=0.02, w=0.56, door_x=-0.18)
    box('ueki', 'gTree', (0.12, 0.06, 0.05), (0.32, -0.12, 0.025))
    return view(0.18)


def yonezu():
    """米津駅：上が白・下が茶色の平らな屋根の四角い駅舎、駅名板、赤い自動販売機、黄色いのぼり、植えこみ"""
    ground('asphalt')
    platform()
    box('eki', 'shikkui', (0.44, 0.26, 0.2), (0.04, 0.04, 0.1))
    box('ekiL', 'tileBr', (0.444, 0.264, 0.08), (0.04, 0.04, 0.04))
    box('ekiY', 'shikkui', (0.5, 0.32, 0.02), (0.04, 0.04, 0.21))
    box('door', 'kuro', (0.1, 0.01, 0.12), (0.12, -0.093, 0.06))
    eki_sign('s', -0.06, -0.095, 0.16)
    vending('v', -0.26, -0.06)
    box('nobori', 'vendO', (0.008, 0.008, 0.26), (-0.36, -0.1, 0.13))
    box('noboriH', 'paraY', (0.04, 0.004, 0.16), (-0.335, -0.1, 0.17))
    for x in (-0.2, 0.0, 0.2):
        sphere(f'ueki{x}', 'gTree', 0.05, (x + 0.06, -0.2, 0.03), (1.4, 1, 0.7))
    return view(0.2)


def shinkawamachi():
    """新川町駅：大きな切妻屋根の、うす茶色のタイルの駅舎、白い看板（字は描かない）、赤いポスト、松"""
    ground('asphalt')
    box('eki', 'ekiBeige', (0.46, 0.28, 0.2), (0.0, 0.08, 0.1))
    gable_y('yane', 'tileRed', 0.56, 0.36, 0.16, 0.2, 0.0, 0.08)
    gable_y('tsuma', 'ekiBeige', 0.44, 0.3, 0.12, 0.2, 0.0, 0.075)
    box('kanban', 'ekiSign', (0.3, 0.012, 0.04), (0.0, -0.064, 0.17))
    for i, m in enumerate(('vendR', 'paraY', 'paraB', 'ninjinH')):
        box(f'kb{i}', m, (0.03, 0.014, 0.02), (-0.08 + i * 0.05, -0.066, 0.17))
    box('door', 'glassB', (0.14, 0.01, 0.12), (0.0, -0.064, 0.06))
    box('post', 'post', (0.04, 0.04, 0.09), (-0.32, -0.12, 0.045))
    pine('p', -0.38, 0.12, 1.1)
    return view(0.22)


def mikawa_toba():
    """三河鳥羽駅：鳥羽の火祭りの、白いうずまき模様をえがいた赤い駅舎"""
    ground('asphalt')
    platform()
    box('eki', 'akaEki', (0.5, 0.26, 0.22), (0.04, 0.04, 0.11))
    box('ekiY', 'kuro', (0.54, 0.3, 0.02), (0.04, 0.04, 0.23))
    box('door', 'kuro', (0.08, 0.01, 0.13), (0.06, -0.093, 0.065))
    for i, (x, z, s) in enumerate(((-0.13, 0.14, 1), (0.2, 0.12, -1))):   # 白いうずまき（はしの開いた渦。2つを大きく）
        pts = [(x + s * 0.0042 * t * math.cos(t), -0.096, z + 0.0042 * t * math.sin(t)) for t in [k * 0.45 for k in range(3, 34)]]
        pa.tube(f'uzu{i}', 'shikkui', pts, 0.006)
    box('waki', 'shikkui', (0.12, 0.2, 0.12), (-0.32, 0.04, 0.06))
    box('kiiro', 'paraY', (0.02, 0.01, 0.14), (0.27, -0.093, 0.1))
    return view(0.2)


def hekinan_library():
    """碧南市民図書館：木立の中の、空を映すゆるいカーブのガラスの建物と、手前の芝生"""
    ground('shibaG')
    o = cyl('tate', 'glassB', 0.36, 0.2, (0.04, 0.3, 0.1), verts=48)   # ゆるいカーブのガラスの建物（絵のふちで切れない大きさに）
    o.scale = (1.0, 0.5, 1)
    for i in range(9):
        a = math.radians(-60 + i * 15)
        box(f'w{i}', 'mado', (0.006, 0.006, 0.2), (0.04 + 0.36 * math.sin(a), 0.3 - 0.18 * math.cos(a), 0.1))
    o = cyl('yane', 'shikkui', 0.37, 0.02, (0.04, 0.3, 0.205), verts=48)
    o.scale = (1.0, 0.5, 1)
    for x, y in ((-0.34, -0.04), (0.38, -0.08)):
        tree(f't{x}', x, y, 1.4)
    box('michi', 'tileRed', (0.12, 0.3, 0.008), (0.04, -0.22, 0.012))
    return view(0.18)


def kitashinkawa():
    """北新川駅：灰色の切妻屋根の白い駅舎、左に大きな観光の地図の看板（絵の具の色だけ）、赤い自動販売機"""
    ground('asphalt')
    box('eki', 'shikkui', (0.36, 0.24, 0.18), (0.14, 0.06, 0.09))
    gable('yane', 'kawaraG', 0.42, 0.3, 0.08, 0.18, 0.14, 0.06)
    box('door', 'kuro', (0.08, 0.01, 0.12), (0.2, -0.063, 0.06))
    eki_sign('s', 0.06, -0.064, 0.15)
    vending('v', 0.0, -0.06)
    for x in (-0.38, -0.18):
        box(f'kh{x}', 'hashira', (0.014, 0.014, 0.26), (x, -0.08, 0.13))
    box('chizu', 'ekiSign', (0.22, 0.014, 0.14), (-0.28, -0.08, 0.2))
    for i, (dx, dz, m) in enumerate(((-0.05, 0.02, 'umiB'), (0.04, -0.02, 'gTree'), (0.06, 0.03, 'vendR'))):
        box(f'cz{i}', m, (0.05, 0.016, 0.04), (-0.28 + dx, -0.082, 0.2 + dz))
    return view(0.2)


def saishinji():
    """西心寺：大きな入母屋の瓦屋根、こげ茶の柱と白い漆喰の本堂、高い縁"""
    ground('jari')
    box('ashi', 'kijiD', (0.5, 0.3, 0.06), (0, 0.08, 0.03))
    box('en', 'kiji', (0.58, 0.36, 0.02), (0, 0.08, 0.07))
    box('kabe', 'shikkui', (0.48, 0.26, 0.18), (0, 0.1, 0.17))
    for x in (-0.24, -0.12, 0.0, 0.12, 0.24):
        box(f'h{x}', 'kijiD', (0.02, 0.01, 0.18), (x, -0.031, 0.17))
    box('nuki', 'kijiD', (0.48, 0.01, 0.016), (0, -0.032, 0.21))
    lattice('l', 'kijiD', 0, -0.034, 0.2, 0.1, 0.08, 6)
    irimoya('yane', 'kawaraG', 0.7, 0.48, 0.26, 0.26, 0, 0.1)
    steps('s', 'stoneR', 0, -0.2, 0.16, 2, 0.04, 0.03)
    return view(0.26)


def hekikai_furui():
    """碧海古井駅：青緑のかまぼこ屋根の白い駅舎、茶色のタイル、左に踏切、右に小さな白い建物"""
    ground('asphalt')
    platform(train_on=False)
    kamaboko_eki(x=0.04, w=0.44)
    box('koya', 'shikkui', (0.12, 0.12, 0.1), (0.36, -0.02, 0.05))
    box('fumikiri', 'kuro', (0.012, 0.012, 0.2), (-0.32, -0.12, 0.1))
    for i in range(5):
        box(f'fk{i}', 'paraY' if i % 2 else 'kuro', (0.04, 0.01, 0.02), (-0.36 + i * 0.04, -0.12, 0.18))
    box('fkL', 'vendR', (0.03, 0.012, 0.03), (-0.32, -0.126, 0.21))
    return view(0.18)


def takahama_library():
    """高浜市立図書館：赤茶のタイル張りの、段のある箱形の建物と、低い植えこみ"""
    ground('asphalt')
    box('a', 'tileRed', (0.5, 0.3, 0.16), (0.0, 0.1, 0.08))
    box('b', 'tileRed', (0.3, 0.24, 0.12), (0.06, 0.12, 0.22))
    box('c', 'tileRedD', (0.16, 0.16, 0.08), (-0.14, 0.14, 0.2))
    windows('w', 'glassB', [-0.16, -0.04, 0.08, 0.2], -0.052, 0.1, 0.08, 0.06)
    box('door', 'glassB', (0.12, 0.01, 0.1), (0.1, -0.052, 0.05))
    for x in (-0.3, -0.1, 0.14, 0.32):
        sphere(f'ueki{x}', 'gTree', 0.05, (x, -0.16, 0.03), (1.4, 1, 0.6))
    return view(0.2)


def kamiji_hachiman():
    """上地八幡宮：緑青の銅ぶきの横に長い拝殿、こげ茶の柱と格子、手前の石段と絵馬かけ"""
    ground('jari')
    box('kidan', 'kidan', (0.62, 0.3, 0.06), (0, 0.14, 0.03))
    box('kabe', 'kuroki', (0.56, 0.24, 0.14), (0, 0.14, 0.13))
    lattice('l', 'kiji', 0, 0.019, 0.4, 0.1, 0.07, 10)
    irimoya('yane', 'doban3', 0.74, 0.4, 0.18, 0.2, 0, 0.14)
    steps('s', 'stoneR', 0, -0.12, 0.3, 3, 0.04, 0.02)
    box('emaD', 'kijiD', (0.16, 0.03, 0.1), (0.34, -0.12, 0.05))
    for i in range(4):
        box(f'ema{i}', 'kiji', (0.03, 0.006, 0.02), (0.28 + i * 0.04, -0.137, 0.08))
    gable('emaY', 'kawaraG', 0.2, 0.08, 0.03, 0.1, 0.34, -0.12)
    return view(0.22)


def ontoji():
    """恩任寺：銀ねずの瓦の大屋根の本堂、こげ茶の木の壁と縁、手前に石灯籠と松"""
    ground('jari')
    hall('h', 0, 0.14, 0.46, 0.26, 0.15, 'kuroki', 'kawaraG', rh=0.26, z=0.05)
    box('en', 'kiji', (0.54, 0.05, 0.02), (0, -0.02, 0.06))
    toro('r', -0.18, -0.2, 1.1)
    pine('p', 0.34, -0.16, 1.1)
    return view(0.24)


def kaichoin():
    """海潮院：大きな瓦の入母屋屋根の本堂、白い壁と木の柱、石畳"""
    ground('jari')
    box('kidan', 'kidan', (0.56, 0.34, 0.04), (0, 0.12, 0.02))
    box('kabe', 'shikkui', (0.48, 0.26, 0.16), (0, 0.12, 0.12))
    for x in (-0.24, -0.1, 0.04, 0.18):
        box(f'h{x}', 'kijiD', (0.016, 0.01, 0.16), (x, -0.011, 0.12))
    box('to', 'kuroki', (0.16, 0.012, 0.1), (-0.03, -0.012, 0.09))
    irimoya('yane', 'kawaraG', 0.7, 0.48, 0.26, 0.2, 0, 0.12)
    pine('p', -0.36, -0.1, 1.0)
    ishidatami('s', 0, -0.38, -0.02, 0.16)
    return view(0.24)


def owari_sansha():
    """尾張三社：入母屋の灰色の瓦屋根、こげ茶の木の社殿、白い石の基壇"""
    ground('jari')
    box('kidan', 'shikkui', (0.58, 0.36, 0.08), (0, 0.1, 0.04))
    box('kabe', 'kuroki', (0.46, 0.26, 0.14), (0, 0.1, 0.15))
    for i in range(5):
        box(f'to{i}', 'kiji', (0.06, 0.01, 0.1), (-0.16 + i * 0.08, -0.031, 0.14))
    irimoya('yane', 'kawaraG', 0.64, 0.44, 0.22, 0.22, 0, 0.1)
    for x in (-0.34, 0.34):
        toro(f'r{x}', x, -0.18, 1.0)
    return view(0.22)


def shomanji():
    """勝鬘寺：銀ねずの大屋根に唐破風の向拝、こげ茶の本堂と縁の手すり、右に満開の桜"""
    ground('jari')
    hall('h', -0.06, 0.16, 0.44, 0.24, 0.15, 'kuroki', 'kawaraG', rh=0.26, z=0.05)
    box('kohai', 'kijiD', (0.18, 0.1, 0.12), (-0.06, -0.02, 0.06))
    o = cyl('karahafu', 'kawaraG', 0.1, 0.2, (-0.06, -0.02, 0.14), (math.pi / 2, 0, 0), 14)
    o.scale = (1.2, 0.5, 1)
    fence('f', 'kiji', -0.32, 0.2, -0.1, 0.05, 10)
    cyl('sm', 'miki', 0.02, 0.18, (0.34, -0.06, 0.09), verts=8)
    for i, (dx, dy, dz, r) in enumerate(((0, 0, 0.22, 0.11), (-0.06, 0.03, 0.2, 0.08), (0.05, -0.03, 0.27, 0.07))):
        sphere(f'sk{i}', 'sakuraHa', r, (0.34 + dx, -0.06 + dy, dz), (1, 1, 0.8))
    return view(0.24)


def kasume_kenken():
    """糟目犬頭神社：石の参道の両わきに大きな石灯籠と狛犬、奥に瓦屋根の拝殿"""
    ground('jari')
    hall('h', 0, 0.2, 0.38, 0.2, 0.13, 'kiji', 'kawaraG', z=0.05)
    ishidatami('s', 0, -0.38, 0.1, 0.16)
    for x in (-0.24, 0.24):
        toro(f'r{x}', x, -0.04, 1.5)
        box(f'kd{x}', 'kidan', (0.06, 0.06, 0.05), (x * 0.6, -0.22, 0.025))
        sphere(f'koma{x}', 'stoneR', 0.03, (x * 0.6, -0.22, 0.075), (1, 0.9, 1.2))
    return view(0.22)


def jogu_ji():
    """上宮寺：灰色のコンクリートの大きな反った屋根が、柱に乗ってせり出す今の本堂"""
    ground('kokaC')
    box('kabe', 'kokaD', (0.44, 0.24, 0.14), (0, 0.14, 0.07))
    for x in (-0.24, -0.08, 0.08, 0.24):
        box(f'h{x}', 'kokaC', (0.03, 0.03, 0.18), (x, -0.06, 0.09))
    roof('yane', 'kokaC', 0.76, 0.56, 0.2, 0.18, 0.4, 0, 0.1)
    roof('yaneU', 'kokaD', 0.4, 0.3, 0.08, 0.34, 0.3, 0, 0.1)
    windows('w', 'mado', [-0.12, 0.0, 0.12], 0.019, 0.07, 0.08, 0.06)
    steps('s', 'kokaC', 0, -0.2, 0.3, 2, 0.04, 0.02)
    return view(0.22)


def sekko_danchi_jinja():
    """石工団地神社：石の鳥居にしめ縄、両わきに石灯籠、奥に小さな社殿、白い砂利"""
    ground('jari')
    box('yashiro', 'kiji', (0.2, 0.16, 0.12), (0, 0.24, 0.08))
    box('yashiroD', 'kidan', (0.26, 0.22, 0.03), (0, 0.24, 0.015))
    gable('yashiroY', 'kawaraG', 0.26, 0.24, 0.07, 0.14, 0, 0.24)
    torii('t', 0, -0.06, 1.4, 'stoneR')
    shimenawa('sn', 0, -0.07, 0.28, 0.24)
    for x in (-0.3, 0.3):
        toro(f'r{x}', x, -0.12, 1.3)
    return view(0.22)


def kamezaki():
    """JR 亀崎駅：明治時代からの木造駅舎。こげ茶の板壁、赤茶のトタンの寄棟屋根と、正面の小さな破風"""
    ground('asphalt')
    box('eki', 'kuroki', (0.6, 0.26, 0.18), (0, 0.08, 0.09))
    windows('w', 'shoji', [-0.2, -0.1, 0.12, 0.22], -0.051, 0.11, 0.06, 0.06)
    box('door', 'kuro', (0.1, 0.01, 0.12), (0.01, -0.052, 0.06))
    roof('yane', 'tinR', 0.7, 0.36, 0.14, 0.18, 0.5, 0, 0.08)
    gable_y('hafu', 'tinR', 0.18, 0.08, 0.08, 0.24, 0.01, -0.07)
    gable_y('hafuT', 'shikkui', 0.12, 0.08, 0.05, 0.245, 0.01, -0.075)
    return view(0.2)


def okkawa():
    """JR 乙川駅：灰色の小さな駅舎、右に斜めに張り出した屋根、白とオレンジの自動販売機"""
    ground('asphalt')
    platform(line='jr')   # 乙川駅は JR 武豊線（銀にオレンジの帯）
    box('eki', 'kokaD', (0.28, 0.22, 0.18), (-0.14, 0.04, 0.09))
    box('door', 'kuro', (0.08, 0.01, 0.12), (-0.18, -0.073, 0.06))
    eki_sign('s', -0.06, -0.074, 0.15, 0.1)
    for x in (0.08, 0.3):
        box(f'h{x}', 'hashira', (0.014, 0.014, 0.16), (x, -0.04, 0.08))
    box('hisashi', 'yane2', (0.34, 0.2, 0.012), (0.18, 0.0, 0.17), (math.radians(8), math.radians(-6), 0))
    vending('v1', 0.12, -0.02, 'ekiSign')
    vending('v2', 0.2, -0.02, 'vendO')
    return view(0.18)


def nakano_hanroku():
    """旧中埜半六邸：黒い板壁と白い漆喰の2階建ての商家、瓦屋根、手前の松"""
    ground('jari')
    box('ichi', 'kurokabe', (0.56, 0.3, 0.16), (0.02, 0.1, 0.08))
    windows('w', 'shoji', [-0.14, 0.18], -0.051, 0.09, 0.1, 0.06)
    box('door', 'kijiD', (0.1, 0.01, 0.12), (0.02, -0.052, 0.06))
    roof('yane1', 'kawaraG', 0.64, 0.38, 0.05, 0.16, 0.75, 0.02, 0.1, flat=True)
    box('ni', 'kurokabe', (0.48, 0.26, 0.12), (0.02, 0.12, 0.27))
    box('niW', 'shikkui', (0.16, 0.01, 0.06), (0.1, -0.011, 0.28))
    lattice('l', 'kuro', 0.1, -0.013, 0.12, 0.05, 0.255, 6)
    gable('yane2', 'kawaraG', 0.56, 0.34, 0.1, 0.33, 0.02, 0.12)
    pine('p', -0.36, -0.14, 1.1)
    return view(0.24)


def kita_anjo():
    """北安城駅：青緑の屋根のふちの白い駅舎、茶色のタイル、まん中の入口、青い自動販売機"""
    ground('asphalt')
    platform()
    box('eki', 'shikkui', (0.5, 0.24, 0.18), (0.02, 0.04, 0.09))
    box('ekiT', 'tileBr', (0.504, 0.244, 0.06), (0.02, 0.04, 0.03))
    box('fuchi', 'tealR', (0.56, 0.3, 0.04), (0.02, 0.04, 0.19))
    box('door', 'kuro', (0.1, 0.01, 0.12), (0.02, -0.083, 0.06))
    eki_sign('s', 0.16, -0.084, 0.15, 0.1)
    vending('v', -0.32, -0.06, 'vendB')
    return view(0.18)


def mutsuna():
    """六名駅：道の上をまたぐ高架の線路とホーム（柵と屋根）、太いコンクリートの柱、小さな駅名板"""
    ground('asphalt')
    for x in (-0.3, 0.3):
        box(f'kyaku{x}', 'kokaC', (0.08, 0.16, 0.26), (x, 0.08, 0.13))
    box('keta', 'kokaC', (0.96, 0.22, 0.05), (0, 0.08, 0.285))
    box('home', 'home', (0.96, 0.08, 0.02), (0, 0.16, 0.32))
    fence('f', 'shikkui', -0.46, 0.46, 0.0, 0.05, 16)
    for o in bpy.context.scene.objects:
        if o.name.startswith(('fnTf', 'fnPf')):
            o.location.z += 0.31
    for x in (-0.3, 0.0, 0.3):
        box(f'hh{x}', 'hashira', (0.012, 0.012, 0.12), (x, 0.18, 0.39))
    box('hy', 'yane2', (0.9, 0.1, 0.012), (0, 0.18, 0.455))
    train2('t', 0.1, 0.08, 0.31, 2, 0.3, *LINE['aikan'])   # 六名駅は愛知環状鉄道（銀に黄緑の帯）
    eki_sign('s', -0.3, -0.004, 0.2, 0.08)
    box('sen', 'line2', (0.96, 0.012, 0.004), (0, -0.2, 0.012))
    return view(0.24)


def mikawa_kashima():
    """名鉄 三河鹿島駅：線路ぎわの低いホームと、トタン屋根の待合所、架線の柱"""
    ground('shibaG')
    box('senro', 'senro', (1.0, 0.16, 0.012), (0, -0.14, 0.012))
    for dy in (-0.04, 0.04):
        box(f'rail{dy}', 'rail', (1.0, 0.01, 0.01), (0, -0.14 + dy, 0.022))
    box('home', 'home', (0.8, 0.14, 0.05), (0, 0.04, 0.025))
    box('mach', 'kiji', (0.24, 0.1, 0.12), (0.06, 0.08, 0.11))
    box('machF', 'kuro', (0.18, 0.01, 0.07), (0.06, 0.029, 0.1))
    box('machY', 'shutter', (0.3, 0.16, 0.012), (0.06, 0.08, 0.175), (math.radians(-6), 0, 0))
    for x in (-0.34, 0.34):
        box(f'kasen{x}', 'hashira', (0.016, 0.016, 0.34), (x, -0.26, 0.17))
        box(f'kasenA{x}', 'hashira', (0.012, 0.16, 0.012), (x, -0.18, 0.32))
    box('kasenW', 'kuro', (1.0, 0.004, 0.004), (0, -0.14, 0.31))
    eki_sign('s', -0.24, -0.03, 0.12, 0.1)
    return view(0.16)


def handa_jr():
    """JR 半田駅：灰色の瓦屋根の平屋の駅舎、正面に赤い三角の飾りのある入口、白い壁"""
    ground('asphalt')
    box('eki', 'shikkui', (0.62, 0.26, 0.16), (0, 0.08, 0.08))
    windows('w', 'glassB', [-0.22, -0.12, 0.14, 0.24], -0.051, 0.09, 0.07, 0.06)
    roof('yane', 'kawaraG', 0.7, 0.34, 0.1, 0.16, 0.5, 0, 0.08)
    box('iri', 'shikkui', (0.16, 0.08, 0.16), (0.01, -0.07, 0.08))
    box('door', 'glassB', (0.1, 0.01, 0.11), (0.01, -0.111, 0.055))
    gable_y('sankaku', 'vendR', 0.18, 0.1, 0.08, 0.16, 0.01, -0.07)
    gable_y('sankakuT', 'shikkui', 0.12, 0.1, 0.05, 0.165, 0.01, -0.075)
    return view(0.2)


MODELS = {
    'hekinan-saihoji': hekinan_saihoji, 'hekinan-aoi-park': hekinan_aoi_park, 'takahama-ningyo-koji': takahama_ningyo_koji,
    'n6057440275': nishioguchi, 'n8093413973': fukuchi, 'n8093499508': sakuramachimae, 'n8093413971': kamiyokosuka,
    'n8093499509': yonezu, 'n8100814151': shinkawamachi, 'n8094952624': mikawa_toba, 'n1423994228': hekinan_library,
    'n8095207755': kitashinkawa, 'w616219752': saishinji, 'n8093453674': hekikai_furui, 'n1424004882': takahama_library,
    'n6018637699': kamiji_hachiman, 'n5118172505': ontoji, 'w737526485': kaichoin, 'w736671941': owari_sansha,
    'n11568982800': shomanji, 'w909281705': kasume_kenken, 'w497083985': jogu_ji, 'w498047607': sekko_danchi_jinja,
    'n8241880205': kamezaki, 'n8241891774': okkawa, 'w670221425': nakano_hanroku, 'n8093413970': kita_anjo,
    'n7056162176': mutsuna, 'n282405435': mikawa_kashima, 'n8241972430': handa_jr,
}
MODELS = {k: gnis.flat_bottom(f) for k, f in MODELS.items()}   # giant-list.py は上の MODELS = {...} の名前だけを読む
pa.MODELS.clear()
pa.MODELS.update(MODELS)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name in args or MODELS:
        pa.make(name)

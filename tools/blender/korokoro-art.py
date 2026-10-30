# にしおさんぽGO：めいろの「ころころ 仲間」（農作物も ころころ：いちご・なす・大豆）と「どんぐりも ころころ」の絵を Blender で作り、ドット絵のシートに焼く
# - いままで pixel.js の drawNakama・drawDonguri で 四角を ならべて 手で 描いて いた 絵を、立体で 作って 焼く（運営者の声「ブレンダーで磨く」2026-10-30）
# - いちご：先の 細い 赤い 実・黄色い つぶつぶ・緑の へた。なす：むらさきの 長い 実・てかり・緑の へた。大豆：うす黄色の まるい 豆・へそ。
#   作物は にこっと した 目（なすは 色が こいので 白い 目）。どんぐり：茶色の 実・うろこの ぼうし・へた（目は なし）
# - 焼き方は mushi-art.py と同じ（pixel-art.py の Cycles で4倍→材質ごとに3色→ふちどり）。シートは nishio-go/art/ev/korokoro.png（32×32 を 横に 4こ。並びは KORO）
# 使い方：python tools/blender/korokoro-art.py
import importlib.util
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mushi_art', os.path.join(HERE, 'mushi-art.py'))
ma = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ma)
pa = ma.pa
cyl, sphere = pa.cyl, pa.sphere

pa.MATS.update({
    'ichigo': '#b0162c', 'tsubu': '#ffe08a', 'heta': '#3f9b3c', 'hetaL': '#5cb84e',
    'nasu': '#45205f', 'nasuL': '#9a6ac0', 'daizu': '#d8bc6c', 'daizuH': '#b89a50',
    'guri': '#8e5420', 'guriL': '#d39a5a', 'boushi': '#6b4a2a', 'boushiL': '#8a6440', 'jiku': '#4a321c',
    'meK': '#1a1a1a', 'meW': '#fff4e0',
})


def eyes(z, y, dx=0.07, mat='meK', r=0.04):
    """まるい 目（少し 上から 見て 正面に くる 所。実の 表に 少し 出す）"""
    for s in (-1, 1):
        sphere(f'me{s}', mat, 1.0, (s * dx, y, z), (r, r, r))


def ichigo():
    """いちご：下へ 細く なる 赤い 実。つぶつぶ・へた・目"""
    for i, (y, rx, rz) in enumerate([(0.08, 0.26, 0.22), (-0.06, 0.22, 0.19), (-0.18, 0.14, 0.13), (-0.27, 0.07, 0.07)]):
        sphere(f'mi{i}', 'ichigo', 1.0, (0, y, 0.18), (rx, 0.14, rz))
    for i, (x, y) in enumerate([(-0.15, 0.04), (0.15, 0.04), (-0.09, -0.12), (0.09, -0.12), (0, -0.2), (-0.17, -0.04), (0.17, -0.04)]):
        sphere(f'tb{i}', 'tsubu', 0.032, (x, y, 0.37 - abs(x) * 0.5))
    for i in range(5):   # へた（星の 形に 5まい）
        a = math.radians(90 + i * 72)
        h = sphere(f'heta{i}', 'heta', 1.0, (math.cos(a) * 0.1, 0.2 + math.sin(a) * 0.06, 0.34), (0.1, 0.04, 0.03))
        h.rotation_euler = (0, 0, a)
    cyl('jiku', 'hetaL', 0.025, 0.08, (0, 0.26, 0.38), (math.radians(70), 0, 0), 8)
    eyes(0.42, 0.0, r=0.045)
    return dict(target=(0, 0, 0.15), scale=1.0, el=72, az=0, size=32, fit=True)


def nasu():
    """なす：むらさきの 長い 実（少し まがる）・てかり・へた・白い 目"""
    for i, (y, x, r) in enumerate([(-0.16, 0.03, 0.2), (0.0, 0.0, 0.19), (0.13, -0.02, 0.15)]):
        sphere(f'mi{i}', 'nasu', 1.0, (x, y, 0.18), (r, r * 1.05, r * 0.95))
    sphere('teri', 'nasuL', 1.0, (-0.1, -0.04, 0.32), (0.04, 0.1, 0.02))   # てかり
    for i in range(4):   # へた：実の 上に かぶる
        a = math.radians(i * 90 + 45)
        h = sphere(f'heta{i}', 'heta', 1.0, (math.cos(a) * 0.07 - 0.02, 0.24 + math.sin(a) * 0.04, 0.24), (0.09, 0.05, 0.05))
        h.rotation_euler = (0, 0, a)
    cyl('jiku', 'hetaL', 0.03, 0.14, (-0.03, 0.33, 0.27), (math.radians(80), 0, 0), 8)
    eyes(0.38, -0.04, mat='meW')
    return dict(target=(0, 0, 0.15), scale=1.0, el=72, az=0, size=32, fit=True)


def daizu():
    """大豆：うす黄色の まるい 豆（少し つぶれた）・へそ・目"""
    sphere('mame', 'daizu', 1.0, (0, 0, 0.16), (0.24, 0.22, 0.18))
    sphere('heso', 'daizuH', 1.0, (0.13, 0.12, 0.27), (0.06, 0.025, 0.02))
    eyes(0.35, -0.02, dx=0.07)
    return dict(target=(0, 0, 0.15), scale=1.0, el=72, az=0, size=32, fit=True)


def donguri():
    """どんぐり：茶色の 実（下が すぼまる）・うろこの ぼうし・へた"""
    sphere('mi', 'guri', 1.0, (0, -0.05, 0.16), (0.17, 0.24, 0.16))
    sphere('saki', 'guri', 1.0, (0, -0.29, 0.14), (0.05, 0.05, 0.05))
    sphere('teri', 'guriL', 1.0, (-0.07, -0.08, 0.28), (0.03, 0.09, 0.02))
    sphere('boushi', 'boushi', 1.0, (0, 0.14, 0.18), (0.21, 0.13, 0.17))
    for i, (x, y) in enumerate([(-0.12, 0.12), (0, 0.13), (0.12, 0.12), (-0.06, 0.2), (0.06, 0.2)]):   # ぼうしの うろこ
        sphere(f'uroko{i}', 'boushiL', 0.03, (x, y, 0.33))
    cyl('jiku', 'jiku', 0.025, 0.1, (0, 0.3, 0.3), (math.radians(70), 0, 0), 8)
    return dict(target=(0, 0, 0.15), scale=1.0, el=72, az=0, size=32, fit=True)


KORO = [('ichigo', ichigo), ('nasu', nasu), ('daizu', daizu), ('donguri', donguri)]   # pixel.js の KORO_ART と 同じ 並び

if __name__ == '__main__':
    os.makedirs(ma.OUT, exist_ok=True)
    arrs = [ma.bake(fn, f'korokoro-{tag}') for tag, fn in KORO]
    p = os.path.join(ma.OUT, 'korokoro.png')
    ma.save_sheet(arrs, p)
    print('wrote', os.path.relpath(p, pa.ROOT), len(arrs))

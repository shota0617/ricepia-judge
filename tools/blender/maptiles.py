# にしおさんぽGO：ドット絵の地図のマス（16×16）の家と木を Blender で作る
# - 家：形5（切妻・寄棟・2階建て・陸屋根・L字）× 小物5（なし・庭木・車・自転車と植木鉢・屋根の太陽光パネル）× 向き2 ＝ 50の立体
#   → tools/blender/maptiles-sheets.py で 屋根の色10 × 壁の色5 × 季節4 をのせて 1万通り（10000マス）
# - 木：10の立体（広葉樹・松・杉・竹・植えこみ など）。風でゆれる2コマ目は、シートにする段で葉をずらして作る
# - 斜め上（南）から見下ろす。4倍の大きさに2回描き（光の当たり具合／材質ごとの色分け）、16×16 の材質の番号と明るさの段を TMP に保存する
# 使い方：python tools/blender/maptiles.py（bpy が要る）→ python3 tools/blender/maptiles-sheets.py
import importlib.util
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('dots3d', os.path.join(HERE, 'dots3d.py'))
D3 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D3)   # 立体を作る道具（box・cyl・sphere・roof）と、描く道具を借りる
PA = D3.PA
box, cyl, sphere, roof = D3.box, D3.cyl, D3.sphere, D3.roof
import bpy  # noqa: E402

N, SS = 16, 4
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-maptiles')
BANDS = (0.42, 0.80)


# ---------- 家 ----------
def house(shape, extra, face):
    box('jimen', 'jimen', (3.0, 3.0, 0.02), (0, 0, -0.01))   # 地面は広めに（マスの上の方に、奥の地面が写る）
    rot = face * math.pi / 2
    root = []

    def add(o):
        root.append(o)
        return o
    if shape == 0:   # 切妻の平屋
        add(box('kabe', 'kabe', (0.62, 0.46, 0.34), (0, 0.04, 0.17)))
        add(roof('yane', 'yane', 0, 0.04, 0.34, 0.74, 0.58, 0.2))
    elif shape == 1:   # 寄棟の平屋
        add(box('kabe', 'kabe', (0.6, 0.48, 0.34), (0, 0.04, 0.17)))
        add(roof('yane', 'yane', 0, 0.04, 0.34, 0.72, 0.6, 0.2, hip=True))
    elif shape == 2:   # 2階建て
        add(box('kabe', 'kabe', (0.54, 0.44, 0.5), (0, 0.06, 0.25)))
        add(roof('yane', 'yane', 0, 0.06, 0.5, 0.66, 0.56, 0.18))
        add(box('mado2', 'mado', (0.12, 0.01, 0.08), (-0.12, -0.166, 0.4)))
    elif shape == 3:   # 陸屋根（四角い家）
        add(box('kabe', 'kabe', (0.6, 0.48, 0.44), (0, 0.04, 0.22)))
        add(box('yane', 'yane', (0.62, 0.5, 0.04), (0, 0.04, 0.46)))
        add(box('fuchi', 'kabe', (0.6, 0.48, 0.05), (0, 0.04, 0.5)))
        add(box('naka', 'yane', (0.5, 0.38, 0.01), (0, 0.04, 0.53)))   # ふちの内がわの屋上（ふちより少し上に見える）
    else:   # L字の家
        add(box('kabe', 'kabe', (0.62, 0.3, 0.34), (0, 0.13, 0.17)))
        add(box('kabe2', 'kabe', (0.28, 0.3, 0.34), (-0.17, -0.12, 0.17)))
        add(roof('yane', 'yane', 0, 0.13, 0.34, 0.72, 0.4, 0.17))
        add(roof('yane2', 'yane', -0.17, -0.12, 0.34, 0.36, 0.36, 0.15, hip=True))
    front = {0: -0.196, 1: -0.206, 2: -0.166, 3: -0.206, 4: -0.276}[shape]   # 前の壁の面（戸と窓が壁にうもれないよう少し前）
    add(box('to', 'to', (0.1, 0.01, 0.2), (0.12, front, 0.1)))
    for x in (-0.18, 0.04):
        add(box(f'mado{x}', 'mado', (0.1, 0.01, 0.08), (x, front, 0.21) if shape != 4 else (x + 0.2, -0.026, 0.21)))
    if extra == 1:   # 庭木
        cyl('miki', 'miki', 0.025, 0.2, (0.36, -0.34, 0.1), verts=6)
        sphere('ha', 'ki', 0.13, (0.36, -0.34, 0.26))
    elif extra == 2:   # 車
        box('kuruma', 'kuruma', (0.22, 0.13, 0.08), (-0.3, -0.36, 0.07), bevel=0.02)
        box('kurumaU', 'kuruma', (0.12, 0.11, 0.06), (-0.31, -0.36, 0.14), bevel=0.015)
        box('kurumaM', 'mado', (0.11, 0.115, 0.03), (-0.31, -0.36, 0.15))
    elif extra == 3:   # 自転車と植木鉢
        box('jitensha', 'kuro', (0.14, 0.02, 0.06), (-0.3, -0.36, 0.05))
        for x in (-0.36, -0.24):
            cyl(f'wa{x}', 'kuro', 0.035, 0.01, (x, -0.36, 0.035), (math.pi / 2, 0, 0), 8)
        cyl('hachi', 'hachi', 0.05, 0.06, (0.36, -0.36, 0.03), verts=8)
        sphere('ueki', 'ki', 0.06, (0.36, -0.36, 0.09))
    elif extra == 4:   # 太陽光パネル
        top = {0: 0.46, 1: 0.46, 2: 0.6, 3: 0.53, 4: 0.44}[shape]
        add(box('panel', 'panel', (0.34, 0.16, 0.015), (0.0, -0.06 if shape != 3 else 0.04, top), (0.35 if shape != 3 else 0.15, 0, 0)))
    for o in root:   # 向き：家だけをまわす（庭の小物は手前のまま）
        o.rotation_euler.z += rot
        o.location.x, o.location.y = (o.location.x * math.cos(rot) - o.location.y * math.sin(rot), o.location.x * math.sin(rot) + o.location.y * math.cos(rot))
    return dict(target=(0, 0.06, 0.22))


# ---------- 木（森のマス） ----------
def tree(k):
    box('jimen', 'kusa', (3.0, 3.0, 0.02), (0, 0, -0.01))

    def broad(x, y, r, h=0.22, m='ki'):
        cyl(f'miki{x}{y}', 'miki', 0.035, h, (x, y, h / 2), verts=6)
        sphere(f'ha{x}{y}', m, r, (x, y, h + r * 0.7), (1, 1, 0.85))
        sphere(f'ha2{x}{y}', m, r * 0.6, (x + r * 0.45, y - r * 0.3, h + r * 0.4))

    def cone(x, y, r, h, m):
        cyl(f'miki{x}{y}', 'miki', 0.03, 0.12, (x, y, 0.06), verts=6)
        cyl(f'ha{x}{y}', m, r, h, (x, y, 0.1 + h / 2), verts=10, r2=0.0)
    if k == 0:
        broad(0, 0, 0.3)
    elif k == 1:
        broad(-0.18, 0.1, 0.2)
        broad(0.2, -0.12, 0.18)
    elif k == 2:
        broad(0, 0.02, 0.36, 0.26)
    elif k == 3:   # 松
        cyl('miki', 'miki', 0.04, 0.32, (0, 0, 0.16), (0, 0.25, 0), 6)
        for i, (x, z, r) in enumerate(((-0.1, 0.32, 0.22), (0.1, 0.44, 0.18), (0.02, 0.54, 0.13))):
            sphere(f'matsu{i}', 'matsu', r, (x, 0, z), (1.4, 1.1, 0.45))
    elif k == 4:   # 杉
        cone(0, 0, 0.2, 0.6, 'sugi')
    elif k == 5:
        broad(-0.1, 0.06, 0.24)
        sphere('yabu', 'yabu', 0.14, (0.28, -0.28, 0.08), (1.3, 1, 0.6))
    elif k == 6:   # 植えこみ
        for i, (x, y) in enumerate(((-0.22, 0.12), (0.12, 0.18), (-0.05, -0.18), (0.26, -0.12))):
            sphere(f'yabu{i}', 'yabu' if i % 2 else 'ki', 0.15, (x, y, 0.1), (1.2, 1, 0.7))
    elif k == 7:
        cone(-0.16, 0.06, 0.15, 0.46, 'sugi')
        cone(0.18, -0.08, 0.13, 0.4, 'sugi')
    elif k == 8:
        broad(0.06, 0.08, 0.27)
        sphere('iwa', 'iwa', 0.09, (-0.3, -0.3, 0.04), (1.3, 1, 0.6))
    else:   # 竹
        for i, (x, y) in enumerate(((-0.12, 0.08), (0.04, 0.14), (0.16, -0.02), (-0.04, -0.1))):
            cyl(f'take{i}', 'take', 0.025, 0.6, (x, y, 0.3), verts=6)
            sphere(f'takeha{i}', 'takeha', 0.1, (x + 0.04, y, 0.6), (1.4, 1, 0.7))
    return dict(target=(0, 0, 0.2))


def render_one(kind, args, out):
    sc = PA.setup_scene()
    sc.render.resolution_x = sc.render.resolution_y = N * SS
    opts = house(*args) if kind == 'house' else tree(*args)
    PA.add_camera_light(sc, opts['target'], 1.0, el=42, az=0)   # 南の斜め上から（地図の家と同じ向き。前の壁が見えるくらい）
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
    jobs = [('house', (s, e, f)) for s in range(5) for e in range(5) for f in range(2)] + [('tree', (k,)) for k in range(10)]
    for kind, args in jobs:
        render_one(kind, args, os.path.join(TMP, f'{kind}-' + '-'.join(map(str, args)) + '.npz'))
    print('rendered', len(jobs))


if __name__ == '__main__':
    main()

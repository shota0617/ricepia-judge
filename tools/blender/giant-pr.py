# にしおさんぽGO：西尾市のPRになる特大ドット絵（96×96）を、名所ごとに 見る向き4 × 季節4 × 時間帯4 ＝ 64枚ずつ作る（1段目：Blender で描く）
# - 名所は、西尾市（西尾・一色・吉良・幡豆・佐久島）の注目スポット 82か所（spots.json。当店はのぞく）と、名物と景色 8つ（giant-scenes.py）。
#   形は、歩く地図の特大の絵と同じ型（giant.py の手作りの9か所・giant-nishio.py の手作りの所・giant-gen.py の型）を使い、見る向きだけ変えて描く
#   見る向き：0 いつもの左前・1 右前・2 高い所から・3 うしろ
# - 1段目（この道具。bpy が要る）：見る向きごとに Cycles で2回描き（光の当たり具合／材質の色分け）、96×96 の点ごとに
#   「材質の番号」と「明るさの段（影・ふつう・明るい）」を TMP/<id>-<向き>.npz に保存する（材質の色も いっしょに）
# - 2段目（tools/giant-pr-color.py。bpy は要らない）：季節の色（木・草・雪）と時間帯の色あい（朝・昼・夕方・夜。夜は窓に明かり）をのせて PNG にする
# 使い方：pip install bpy（Blender 5.1 の Python 版。Python 3.13）
#         python tools/blender/giant-pr.py [--part=i/n] [--new] [id ...]
#         python3 tools/giant-pr-color.py
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('giant_gen', os.path.join(HERE, 'giant-gen.py'))
gg = importlib.util.module_from_spec(spec)
sys_argv, sys.argv = sys.argv, [sys.argv[0]]   # giant-gen は読みこむときに --poi を見るので、ここでは渡さない
spec.loader.exec_module(gg)
sys.argv = sys_argv
gi, pa = gg.gi, gg.pa
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-giant-pr')
VIEWS = [(0, 0), (70, 0), (0, 18), (180, 0)]   # いつもの向きからの （まわす角度, 見下ろす角度）
NIS = {'nishio', 'isshiki', 'kira', 'hazu', 'sakushima'}
HAND = {'f-nishio-castle': 'nishio-castle', 'f-iwase-bunko': 'iwase-bunko', 'f-konrenji': 'konrenji', 'f-nishio-station': 'nishio-station',
        'f-jofukuji': 'daibutsu', 'f-ohirune-house': 'ohirune', 'f-kurokabe': 'kurokabe', 'f-inariyama-chaen': 'chaen'}   # pixel.js の GIANT_ART と同じ
# 西尾市の注目スポットで、1か所ずつ手で形を作った特大の絵（giant-nishio.py の MODELS）がある所は、その形で描く（歩く地図ではこの四季の絵が先に出るので）
spec = importlib.util.spec_from_file_location('giant_nishio', os.path.join(HERE, 'giant-nishio.py'))
gnis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gnis)


def subjects():
    """西尾市の注目スポット（当店・ふつうのスポットはのぞく）と、その形の作り方"""
    spots = json.load(open(os.path.join(pa.ROOT, 'nishio-go', 'spots.json'), encoding='utf-8'))['spots']
    gl = {e['id']: e for e in gg.LIST}
    out = []
    for s in spots:
        if s.get('area') not in NIS or s.get('normal') or s.get('shop'):
            continue
        sid = 'f-' + s['id']
        if sid in HAND:
            out.append((sid, s, (lambda n=HAND[sid]: gi.MODELS[n]())))
        elif s['id'] in gnis.MODELS:
            out.append((sid, s, (lambda n=s['id']: gnis.MODELS[n]())))
        elif sid in gl:
            out.append((sid, s, (lambda e=gl[sid]: gg.build(e))))
    # 名物と景色（giant-scenes.py。名所ではないので spots.json にはない。名前・地区・説明は nishio-go/art/pr/scenes.json に書く）
    sp = importlib.util.spec_from_file_location('giant_scenes', os.path.join(HERE, 'giant-scenes.py'))
    gs = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(gs)
    gs.setup(gg)
    meta = []
    for sid, (name, area, desc, fn) in gs.SCENES.items():
        out.append((sid, {'name': name, 'area': area, 'desc': desc}, fn))
        meta.append({'id': sid, 'name': name, 'area': area, 'desc': desc})
    os.makedirs(os.path.join(pa.ROOT, 'nishio-go', 'art', 'pr'), exist_ok=True)
    json.dump(meta, open(os.path.join(pa.ROOT, 'nishio-go', 'art', 'pr', 'scenes.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return out


def fit_camera(sc, margin=0.03):
    """手作りの形は いつもの向き（0）に合わせて組んであるので、ほかの向きで部品（地面の板と水はのぞく）が絵のふちから出るときだけ、引いて収める"""
    from bpy_extras.object_utils import world_to_camera_view
    cam = sc.camera
    pa.bpy.context.view_layer.update()
    ext = 0.0
    for o in sc.objects:
        if o.type != 'MESH' or o.name.startswith(('ji', 'mz')):
            continue
        for vt in o.data.vertices:
            q = world_to_camera_view(sc, cam, o.matrix_world @ vt.co)
            ext = max(ext, abs(q.x - 0.5), abs(q.y - 0.5))
    if ext > 0.5 - margin:
        cam.data.ortho_scale *= ext / (0.5 - margin)


def render_view(sid, build, v):
    sc = pa.setup_scene()
    opts = build()
    n = opts.get('size', 96)
    sc.render.resolution_x = sc.render.resolution_y = n * pa.SS
    da, de = VIEWS[v]
    pa.add_camera_light(sc, opts['target'], opts['scale'], opts.get('el', 28) + de, opts.get('az', -35) + da)
    if v and sid not in HAND and sid[2:] in gnis.MODELS:
        fit_camera(sc)
    os.makedirs(TMP, exist_ok=True)
    names = pa.set_materials('id')
    ids = pa.render(sc, os.path.join(TMP, f'{sid}-{v}-id.png'), 1)
    pa.set_materials('light')
    light = pa.render(sc, os.path.join(TMP, f'{sid}-{v}-light.png'), 48)
    c = pa.SS // 2
    L, I = light[c::pa.SS, c::pa.SS][:n, :n], ids[c::pa.SS, c::pa.SS][:n, :n]
    id_srgb = np.array([pa.srgb((i + 1) / (len(names) + 1)) for i in range(len(names))])
    mat = np.full((n, n), -1, dtype=np.int16)
    alpha = I[..., 3] > 0.5
    mat[alpha] = np.abs(id_srgb[None, :] - I[alpha][:, :1]).argmin(axis=1)
    lum = L[..., :3].mean(axis=2) / np.maximum(L[..., 3], 1e-4)
    band = np.where(lum < 0.28, 0, np.where(lum < 0.70, 1, 2)).astype(np.int8)
    mats = gnis.pa.MATS if sid not in HAND and sid[2:] in gnis.MODELS else pa.MATS   # 材質の色は、形を作った道具のもの
    np.savez_compressed(os.path.join(TMP, f'{sid}-{v}.npz'), mat=mat, band=band, names=np.array(names), cols=np.array([mats[k] for k in names]))
    for k in ('id', 'light'):
        os.remove(os.path.join(TMP, f'{sid}-{v}-{k}.png'))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    part = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--part=')), None)
    todo = [x for x in subjects() if not args or x[0] in args]
    if part:
        i, n = map(int, part.split('/'))
        todo = todo[i::n]
    for sid, s, build in todo:
        for v in range(len(VIEWS)):
            if '--new' in sys.argv and os.path.exists(os.path.join(TMP, f'{sid}-{v}.npz')):
                continue
            render_view(sid, build, v)
            print('done', sid, v, flush=True)

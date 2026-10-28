# ミシン糸 一本どり：米袋（クラフト紙の 30kg 袋）の 口もとを Blender で 作って 絵に する
#
#   python3.13 -m venv bpyenv && bpyenv/bin/pip install bpy==5.2.2
#   bpyenv/bin/python tools/mishin/build_bag.py            # 表と裏の 絵（tools/mishin/bag_front.png・bag_back.png）
#   bpyenv/bin/python tools/mishin/build_bag.py --fast     # 荒い 絵で 試す
#   python3 tools/mishin/pack_bag.py                       # webp に して mishin.html に うめこむ
#
# 寸法（メートル）：袋の 幅 0.45、口の 上の 縁＝ z 0、縫い目＝ z -0.025（縁から 2.5cm）。
# 絵は 正面から の 平行投影で、1mm＝1.5px（スマホの 細かい 画面用）。絵の 大きさ 900×1500、袋の 左右の 縁（口）＝ x 112.5〜787.5px、
# 口の 上の 縁＝ y 75px、縫い目＝ y 112.5px（ゲームは この 行を 縫い目に そろえる。mishin.html の BAG）。
# 印刷（銘柄・一括表示）と 糸は ゲームが 上に かく。ここでは 紙の 形と 光だけ。
import bpy, bmesh, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FAST = '--fast' in sys.argv
W = 0.45            # 袋の 幅（口を 平らに した とき）
SEAM = -0.025       # 縫い目の 高さ
BOT = -0.97         # 絵の 下の はし より 下まで 作る
D = 0.12            # お米で ふくらむ 深さ（正面へ）
NX, NZ = (90, 160) if FAST else (180, 320)

def smooth(a, b, t):
    t = max(0.0, min(1.0, (t - a) / (b - a)))
    return t*t*(3 - 2*t)

def build(side):
    rnd = random.Random(7 if side == 'front' else 11)
    # しぼり じわ：口から 下へ、外へ ひらきながら 消える
    folds = [(rnd.uniform(-0.85, 0.85), rnd.uniform(0.004, 0.009), rnd.uniform(0.10, 0.24)) for _ in range(10)]
    # お米の でこぼこ
    lumps = [(rnd.uniform(-1, 1), rnd.uniform(-0.9, -0.25), rnd.uniform(0.06, 0.16), rnd.uniform(-0.004, 0.004)) for _ in range(14)]
    crimps = [rnd.uniform(0, 6.28) for _ in range(3)]
    # 平らに たたんで 運んだ ときの 折りぐせ（ほぼ まっすぐな 細い すじ）
    creases = []
    for _ in range(7):
        u0, z0 = rnd.uniform(-0.8, 0.8), rnd.uniform(-0.9, -0.12)
        a = rnd.uniform(-0.6, 0.6) + (math.pi/2 if rnd.random() < 0.5 else 0)
        creases.append((u0 * W / 2, z0, math.cos(a), math.sin(a), rnd.uniform(0.06, 0.2), rnd.choice((-1, 1)) * rnd.uniform(0.0008, 0.0016)))

    me = bpy.data.meshes.new('Bag_' + side)
    bm = bmesh.new()
    verts = []
    for j in range(NZ + 1):
        z = 0.0 + (BOT - 0.0) * j / NZ
        row = []
        for i in range(NX + 1):
            u = -1 + 2 * i / NX
            # ふくらみ：口（縫い目まで）は 平ら、下へ いくほど まるい 胴に
            b = smooth(SEAM - 0.005, SEAM - 0.24, z)
            xf, zf = u * W / 2, 0.0
            xr = (W / 2) * 0.86 * math.sin(u * math.pi / 2)
            yr = D * math.cos(u * math.pi / 2) ** 0.8
            x = xf + (xr - xf) * b
            y = -(yr * b)                          # 正面（カメラ）へ でる ＝ -Y
            # 口の 縁の 小さな 波（重ねた 紙を ミシンで 押さえた あと）
            if z > SEAM - 0.012:
                y += -0.0008 * math.sin(u * 23 + crimps[0]) - 0.0005 * math.sin(u * 51 + crimps[1])
            # しぼり じわ
            for (u0, amp, length) in folds:
                d = z - SEAM
                if d < 0:
                    t = -d / length
                    if t < 1:
                        uc = u0 * (1 + 0.6 * t)                  # 下へ いくほど 外へ
                        w = 0.035 + 0.05 * t
                        y += -amp * (1 - t) ** 1.5 * math.exp(-((u - uc) / w) ** 2) * (0.6 + 0.4 * math.sin(t * 9 + u0 * 7))
            # 口の 角から 内がわ 下へ のびる 大きな 折れ（口は 平らで 胴は まるいので、角の 紙が あまる）
            for sgn in (-1, 1):
                d = SEAM - z
                if 0 < d < 0.26:
                    t = d / 0.26
                    uc = sgn * (0.93 - 0.38 * t)
                    y += -0.007 * math.sin(math.pi * t) ** 0.7 * math.exp(-((u - uc) / 0.075) ** 2) * (0.8 + 0.2*math.sin(t*13 + sgn))
                    y += 0.003 * math.sin(math.pi * t) * math.exp(-((u - uc + sgn * 0.12) / 0.06) ** 2)
            # お米の でこぼこ（胴だけ）
            for (lu, lz, r, a) in lumps:
                dd = ((u - lu) * W / 2) ** 2 + (z - lz) ** 2
                y += a * b * math.exp(-dd / (r * r * 0.25))
            # 折りぐせ
            px = u * W / 2
            for (cx, cz, dx, dz, ln, a) in creases:
                t = (px - cx) * dx + (z - cz) * dz
                if -ln < t < ln:
                    dist = abs((px - cx) * dz - (z - cz) * dx)
                    y += a * math.exp(-(dist / 0.003) ** 2) * (1 - (t / ln) ** 2)
            # 裏：まん中を たてに 通る 貼り合わせ（紙の 筒の つなぎ目。片がわが 1mm ほど 重なる）
            if side == 'back':
                ue = u - 0.06
                if ue < 0:
                    y += -0.0009 * smooth(-0.04, 0.0, ue)
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    for j in range(NZ):
        for i in range(NX):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    # 頂点色：裏の 貼り合わせの のりの すじ、口の 切り口
    col = bm.loops.layers.color.new('mark')
    for f in bm.faces:
        for lp in f.loops:
            x, y, z = lp.vert.co
            m = 0.0
            if side == 'back':
                u = x / (W / 2) if abs(x) < W / 2 else 1
                # 重なりの 縁（影）と のり
                ue = (math.asin(max(-1, min(1, x / (W / 2 * 0.86)))) * 2 / math.pi) if z < SEAM - 0.24 else x / (W / 2)
                if abs(ue - 0.06) < 0.006: m = 0.55
                elif 0.0 < 0.06 - ue < 0.03: m = 0.18
            if z > -0.0025: m = max(m, 0.35)                    # 上の 縁（3枚 重ねの 切り口）
            lp[col] = (m, m, m, 1)
    bm.normal_update()
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new('Bag_' + side, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(kraft())
    return ob

_mat = None
def kraft():
    global _mat
    if _mat: return _mat
    m = bpy.data.materials.new('Kraft'); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; Ln = nt.links
    bsdf = N['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.82
    tc = N.new('ShaderNodeTexCoord')
    # 色むら（大きい）と 繊維（細かい）
    big = N.new('ShaderNodeTexNoise'); big.inputs['Scale'].default_value = 6; big.inputs['Detail'].default_value = 4
    fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 900; fine.inputs['Detail'].default_value = 2
    fib = N.new('ShaderNodeTexWave'); fib.wave_type = 'BANDS'; fib.inputs['Scale'].default_value = 140; fib.inputs['Distortion'].default_value = 18; fib.inputs['Detail'].default_value = 6
    for n in (big, fine, fib): Ln.new(tc.outputs['Object'], n.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.36, 0.20, 0.08, 1)   # 濃い クラフト
    ramp.color_ramp.elements[1].color = (0.58, 0.37, 0.17, 1)   # うすい クラフト
    Ln.new(big.outputs['Fac'], ramp.inputs['Fac'])
    mixf = N.new('ShaderNodeMix'); mixf.data_type = 'RGBA'; mixf.blend_type = 'MULTIPLY'; mixf.inputs['Factor'].default_value = 0.35
    Ln.new(ramp.outputs['Color'], mixf.inputs['A'])
    Ln.new(fine.outputs['Color'], mixf.inputs['B'])
    # のり・切り口の 暗い すじ（頂点色）
    vc = N.new('ShaderNodeVertexColor'); vc.layer_name = 'mark'
    dark = N.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MIX'
    dark.inputs['B'].default_value = (0.22, 0.13, 0.05, 1)
    Ln.new(vc.outputs['Color'], dark.inputs['Factor'])
    Ln.new(mixf.outputs['Result'], dark.inputs['A'])
    Ln.new(dark.outputs['Result'], bsdf.inputs['Base Color'])
    # でこぼこ：繊維の すじ＋細かい 粒
    add = N.new('ShaderNodeMath'); add.operation = 'ADD'
    Ln.new(fib.outputs['Fac'], add.inputs[0]); Ln.new(fine.outputs['Fac'], add.inputs[1])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.0004
    Ln.new(add.outputs['Value'], bump.inputs['Height'])
    Ln.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    _mat = m
    return m

def scene_setup():
    sc = bpy.context.scene
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.cycles.samples = 24 if FAST else 128
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 900, 1500
    sc.render.resolution_percentage = 50 if FAST else 100
    sc.view_settings.view_transform = 'Standard'
    # カメラ：正面から 平行投影。1px＝1mm、絵の 上の はし＝ z +0.05
    cam = bpy.data.cameras.new('Cam'); cam.type = 'ORTHO'; cam.ortho_scale = 1.0
    co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co)
    co.location = (0, -2, -0.45); co.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = co
    # 光：左上から やわらかい 窓の 光、右から 弱い はね返り
    from mathutils import Vector
    def area(name, loc, target, size, power):
        l = bpy.data.lights.new(name, 'AREA'); l.size = size; l.energy = power
        o = bpy.data.objects.new(name, l); o.location = loc; sc.collection.objects.link(o)
        o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    # 左 ななめ 上から 横ぎみに あてて、ふくらみと しわを 見せる
    area('Key', (-1.3, -0.9, 0.5), (0, 0, -0.3), 1.0, 45)
    area('Fill', (1.2, -1.4, -0.3), (0, 0, -0.4), 1.6, 4)
    area('Top', (0.2, -0.4, 0.9), (0, 0, -0.1), 0.6, 8)
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.09, 0.10, 0.14, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35

def main():
    for side in ('front', 'back'):
        scene_setup()
        global _mat; _mat = None
        build(side)
        sc = bpy.context.scene
        sc.render.filepath = os.path.join(HERE, f'bag_{side}.png')
        bpy.ops.render.render(write_still=True)
        print('wrote', sc.render.filepath)

main()

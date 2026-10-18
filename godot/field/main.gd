extends Node2D
# にしおさんぽGO：歩く地図を描く（Godot）
# ・何を描くかは JavaScript（nishio-go/pixel.js）が毎フレーム決めて、window.nsgField.frame() で渡す（nishio-go/godot-field.js）
#   中身は Float32Array を base64 にしたもの。命令の並び：
#     1 絵       id x y w h 不透明度         （id の絵は nsgField.png(id) で PNG をもらって覚えておく）
#     2 四角     x y w h 色(0xRRGGBB) 不透明度
#     3 多角形   点の数 n  x1 y1 … xn yn  色 不透明度
# ・Godot だけでしていること：雨と雪のつぶ（気象庁の今の天気）と、時間帯の色あい（夕方はだいだい、夜は青く）。nsgField.env() で受けとる
# ・地図のしくみ（歩く・チェックイン・たからばこ・人の話）とスティックやボタンは、いままでどおり JavaScript の画面
# ・歩く地図が見えていないとき（せかいちず・ふつうの地図）は nsgField.awake() が false。そのあいだは1秒に2回だけ動いて、つぶも止める（電池のため）

var field = null          # window.nsgField（Web で動いているときだけ）
var tex := {}             # 絵の id → ImageTexture
var cmds := PackedFloat32Array()
var env_at := 0.0
var awake := true
var tint := CanvasModulate.new()
var rain := CPUParticles2D.new()
var snow := CPUParticles2D.new()

func _ready() -> void:
	if OS.has_feature("web"):
		field = JavaScriptBridge.get_interface("nsgField")
	add_child(tint)
	for p in [rain, snow]:
		p.emitting = false
		p.local_coords = false
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		p.direction = Vector2(0, 1)
		p.spread = 4.0
		p.z_index = 10
		add_child(p)
	rain.texture = _drop_texture(3, 22, true)    # 雨：細長い線
	rain.amount = 260
	rain.lifetime = 0.8
	rain.gravity = Vector2(-80, 2400)
	rain.initial_velocity_min = 900.0
	rain.initial_velocity_max = 1300.0
	rain.color = Color(0.82, 0.9, 1.0, 0.75)
	snow.texture = _drop_texture(8, 8, false)   # 雪：まるいつぶ
	snow.amount = 160
	snow.lifetime = 5.0
	snow.gravity = Vector2(0, 60)
	snow.initial_velocity_min = 30.0
	snow.initial_velocity_max = 70.0
	snow.spread = 25.0
	snow.scale_amount_min = 0.6
	snow.scale_amount_max = 1.3
	snow.color = Color(1, 1, 1, 0.9)

# 雨と雪のつぶの絵（白。色はつぶの color で）
func _drop_texture(w: int, h: int, line: bool) -> Texture2D:
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		for x in w:
			var a := 0.0
			if line:
				a = (1.0 - abs(x - (w - 1) / 2.0) / (w / 2.0)) * (float(y) / h)
			else:
				var d := Vector2(x - (w - 1) / 2.0, y - (h - 1) / 2.0).length() / (w / 2.0)
				a = clamp(1.2 - d, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)

func _process(delta: float) -> void:
	if field == null:
		return
	var a := bool(field.awake())
	if a != awake:
		awake = a
		Engine.max_fps = 0 if a else 2
		OS.low_processor_usage_mode = not a
		if a:
			env_at = 0.0
		else:
			rain.emitting = false
			snow.emitting = false
	if not awake:
		return
	var s = field.frame()
	if typeof(s) == TYPE_STRING and s != "":
		cmds = Marshalls.base64_to_raw(s).to_float32_array()
		queue_redraw()
	env_at -= delta
	if env_at <= 0.0:
		env_at = 2.0
		_env()

# 天気と時間帯（2秒ごと）
func _env() -> void:
	var e = JSON.parse_string(str(field.env()))
	if typeof(e) != TYPE_DICTIONARY:
		return
	var size := get_viewport_rect().size
	for p in [rain, snow]:
		p.position = Vector2(size.x / 2, -20)
		p.emission_rect_extents = Vector2(size.x * 0.6, 10)
	rain.emitting = e.get("kind", "") == "rain"
	snow.emitting = e.get("kind", "") == "snow"
	var h := int(e.get("hour", 12))
	if h >= 19 or h < 5:
		tint.color = Color(0.72, 0.78, 1.0)       # 夜
	elif h >= 16:
		tint.color = Color(1.0, 0.9, 0.8)         # 夕方
	elif h < 7:
		tint.color = Color(1.0, 0.96, 0.9)        # 朝
	else:
		tint.color = Color(1, 1, 1)

func _col(rgb: float, a: float) -> Color:
	var c := int(rgb)
	return Color(((c >> 16) & 255) / 255.0, ((c >> 8) & 255) / 255.0, (c & 255) / 255.0, a)

func _tex(id: int) -> Texture2D:
	if tex.has(id):
		return tex[id]
	var t: Texture2D = null
	var b64 = field.png(id)
	if typeof(b64) == TYPE_STRING and b64 != "":
		var img := Image.new()
		if img.load_png_from_buffer(Marshalls.base64_to_raw(b64)) == OK:
			t = ImageTexture.create_from_image(img)
	tex[id] = t
	return t

func _draw() -> void:
	var i := 0
	var n := cmds.size()
	while i < n:
		var op := int(cmds[i])
		if op == 1:
			var t := _tex(int(cmds[i + 1]))
			if t != null:
				draw_texture_rect(t, Rect2(cmds[i + 2], cmds[i + 3], cmds[i + 4], cmds[i + 5]), false, Color(1, 1, 1, cmds[i + 6]))
			i += 7
		elif op == 2:
			draw_rect(Rect2(cmds[i + 1], cmds[i + 2], cmds[i + 3], cmds[i + 4]), _col(cmds[i + 5], cmds[i + 6]))
			i += 7
		elif op == 3:
			var k := int(cmds[i + 1])
			var pts := PackedVector2Array()
			for j in k:
				pts.append(Vector2(cmds[i + 2 + j * 2], cmds[i + 3 + j * 2]))
			if k >= 3:
				draw_colored_polygon(pts, _col(cmds[i + 2 + k * 2], cmds[i + 3 + k * 2]))
			i += 4 + k * 2
		else:
			break

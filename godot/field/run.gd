extends Node2D
# にしおダッシュ：西尾の地形をいかした横スクロールのアクション（ミニゲーム）
# ・ステージは西尾の5か所（稲荷山茶園の茶畑の丘／西尾城の石垣と堀／一色の干潟と養鰻池／三河湾の船と佐久島／三ヶ根山とあじさい）
# ・ステージ名やボタン・結果は HTML（nishio-go/dash.html）。Godot は遊ぶところと絵だけ（日本語のフォントはいらない）
# ・HTML とのやりとりは window.dashIO：left / right / jump（押している間 true）、cmd（"start:1" など。読んだら空にする）、
#   Godot からは dashIO.hud(json) と dashIO.done(json) を呼ぶ
# 絵はすべてこのファイルの中で四角を並べて描く（外の画像は使わない）

const TS := 16                       # 1マスの大きさ
const ROWS := 15                     # ステージの高さ（マス）
const GRAV := 1500.0
const RUN := 150.0
const ACC := 1100.0
const JUMP := 430.0
const SPRING := 640.0
const MAXFALL := 520.0

# マスの種類
const AIR := 0
const SOLID := 1      # 地面
const STONE := 2      # 石垣（かたい）
const PLAT := 3       # 上にだけ乗れる（茶のうね・瓦屋根・桟橋）
const WATER := 4      # 水（落ちたらミス）
const MUD := 5        # 干潟の泥（ゆっくりになる）
const BALE := 6       # 米俵（下からたたくとおにぎり）
const USED := 7       # たたいたあとの米俵
const SPRINGT := 8    # あじさい（大きくはねる）
const SPIKE := 9      # 栗のいが・岩（さわるとミス）…ステージ5の落石の代わりに使う

var io = null
var stage := 0
var W := 0
var grid := PackedByteArray()
var items := []        # {p: Vector2, t: "leaf"|"onigiri", got: bool, vy: float}
var foes := []         # {p, v, kind, alive, x0, t}
var boats := []        # {p, w, x0, x1, v}
var player := {"p": Vector2.ZERO, "v": Vector2.ZERO, "face": 1, "ground": false, "coyote": 0.0, "buf": 0.0, "inv": 0.0, "boat": -1}
var start_p := Vector2.ZERO
var check_p := Vector2.ZERO
var goal_x := 0.0
var coins := 0
var lives := 3
var t := 0.0
var state := "menu"    # menu / play / dead / clear / over
var state_t := 0.0
var cam := Camera2D.new()
var jump_was := false
var theme := {}

const THEMES := [
	{"sky": Color("#9fd8f0"), "sky2": Color("#d8f0f8"), "soil": Color("#8a6a48"), "top": Color("#5aa83a"), "plat": Color("#3f8a34"), "plat2": Color("#86c650"), "item": "leaf", "foe": "bug", "goal": "nobori", "far": Color("#7aa86a")},
	{"sky": Color("#a8c8e8"), "sky2": Color("#e8eef4"), "soil": Color("#7a756b"), "top": Color("#9b968a"), "plat": Color("#62666e"), "plat2": Color("#a8acb2"), "item": "matcha", "foe": "cat", "goal": "yagura", "far": Color("#8a94a0")},
	{"sky": Color("#f0c890"), "sky2": Color("#f8e8c8"), "soil": Color("#8a7a5a"), "top": Color("#a8987a"), "plat": Color("#c8c4bc"), "plat2": Color("#e8e4dc"), "item": "asari", "foe": "crab", "goal": "nobori", "far": Color("#c8a878")},
	{"sky": Color("#7ab8e8"), "sky2": Color("#c8e4f8"), "soil": Color("#c8b88a"), "top": Color("#d8c89a"), "plat": Color("#6a4a30"), "plat2": Color("#9a7a50"), "item": "ebisen", "foe": "gull", "goal": "kurokabe", "far": Color("#3f6a4a")},
	{"sky": Color("#88c0e8"), "sky2": Color("#d0e8f4"), "soil": Color("#6a5a3a"), "top": Color("#4f8a3a"), "plat": Color("#5a4a30"), "plat2": Color("#8a7a50"), "item": "leaf", "foe": "crow", "goal": "tenbo", "far": Color("#4a6a5a")},
]

func _ready() -> void:
	if OS.has_feature("web"):
		io = JavaScriptBridge.get_interface("dashIO")
	add_child(cam)
	cam.make_current()
	cam.position_smoothing_enabled = false

# ---------- ステージをつくる（西尾の地形をもとにした手づくり） ----------
func put(x: int, y: int, v: int) -> void:
	if x >= 0 and x < W and y >= 0 and y < ROWS:
		grid[y * W + x] = v

func tile(x: int, y: int) -> int:
	if x < 0:
		return STONE
	if x >= W or y < 0:
		return AIR
	if y >= ROWS:
		return WATER   # 下に落ちたらミス
	return grid[y * W + x]

func _fill(x0: int, x1: int, top: int, v: int = SOLID) -> void:
	for x in range(x0, x1 + 1):
		for y in range(top, ROWS):
			put(x, y, v)

func _coin(x: int, y: int) -> void:
	items.append({"p": Vector2(x * TS + 8, y * TS + 8), "t": "leaf", "got": false, "vy": 0.0})

func _coins(x0: int, x1: int, y: int) -> void:
	for x in range(x0, x1 + 1):
		_coin(x, y)

func _foe(x: int, y: int, kind: String) -> void:
	foes.append({"p": Vector2(x * TS + 8, y * TS + 8), "v": Vector2(-35, 0), "kind": kind, "alive": true, "x0": x * TS + 8, "y0": y * TS + 8, "t": randf() * 6.0})

func build(n: int) -> void:
	stage = n
	theme = THEMES[n - 1]
	items.clear(); foes.clear(); boats.clear()
	W = [150, 160, 160, 170, 150][n - 1]
	grid = PackedByteArray(); grid.resize(W * ROWS)
	var ground := 12
	match n:
		1:   # 稲荷山茶園：ゆるい丘に茶のうねが段々に並ぶ。うねの上をのぼっておりる
			_fill(0, 24, ground)
			for i in 4:   # 1つめの丘：うねが階段のよう
				for x in range(26 + i * 3, 33 + i * 3):
					put(x, ground - 1 - i * 2, PLAT)
				_coins(27 + i * 3, 29 + i * 3, ground - 2 - i * 2)
			_fill(25, 60, ground)
			put(40, 4, BALE)
			_foe(36, ground - 1, "bug")
			_fill(64, 80, ground)   # 小川をこえる
			for x in range(66, 72): put(x, 8, PLAT)
			_coins(66, 71, 7)
			_foe(75, ground - 1, "bug")
			for i in 5:   # 2つめの丘：上りのうねと下りのうね
				for x in range(84 + i * 4, 88 + i * 4):
					put(x, ground - 1 - min(i, 4 - i) * 2, PLAT)
			_fill(82, 112, ground)
			_foe(96, ground - 1, "bug"); _foe(104, ground - 1, "bug")
			put(100, 6, BALE)
			_fill(116, 149, ground)
			for x in range(118, 124): put(x, 9, PLAT)
			_coins(118, 123, 8)
			start_p = Vector2(3 * TS, (ground - 1) * TS)
			goal_x = 142 * TS
		2:   # 西尾城：石垣を段々にのぼり、堀をとびこえ、瓦屋根の上を走る
			_fill(0, 18, ground)
			for i in 4:
				_fill(19 + i * 2, 20 + i * 2, ground - 1 - i, STONE)
			_fill(27, 34, ground - 4, STONE)
			_coins(28, 33, ground - 6)
			for x in range(35, 41): for y in range(ground, ROWS): put(x, y, WATER)   # 堀
			_fill(41, 50, ground - 2, STONE)
			_foe(46, ground - 3, "cat")
			for x in range(52, 60): put(x, ground - 6, PLAT)   # 瓦屋根
			_coins(53, 58, ground - 7)
			for x in range(51, 62): for y in range(ground, ROWS): put(x, y, WATER)
			_fill(62, 75, ground)
			put(66, 7, BALE)
			_foe(70, ground - 1, "cat")
			for i in 3:
				_fill(77 + i * 3, 78 + i * 3, ground - 2 - i * 2, STONE)
			for x in range(77, 88): if tile(x, ground) == AIR: for y in range(ground, ROWS): put(x, y, WATER)
			_fill(88, 110, ground - 6, STONE)
			for x in range(92, 104, 4): put(x, ground - 9, PLAT)
			_coins(90, 108, ground - 8)
			_foe(98, ground - 7, "cat")
			_fill(111, 159, ground)
			_foe(120, ground - 1, "cat"); _foe(128, ground - 1, "cat")
			start_p = Vector2(3 * TS, (ground - 1) * TS)
			goal_x = 150 * TS
		3:   # 一色の干潟：泥でゆっくり、養鰻池のせまいふちをとびうつる。カニに気をつけて
			_fill(0, 14, ground)
			_fill(15, 40, ground, MUD)
			_foe(24, ground - 1, "crab"); _foe(33, ground - 1, "crab")
			_coins(18, 38, ground - 3)
			for p in 5:   # 養鰻池：水のあいだにコンクリートのふち
				var x0 := 42 + p * 7
				_fill(x0, x0, ground - 1, STONE)
				for x in range(x0 + 1, x0 + 7): for y in range(ground, ROWS): put(x, y, WATER)
				_coin(x0 + 3, ground - 3)
			_fill(77, 77, ground - 1, STONE)
			_fill(78, 100, ground)
			put(86, 7, BALE)
			_foe(90, ground - 1, "crab")
			_fill(101, 125, ground, MUD)
			for x in range(104, 122, 6): put(x, ground - 4, PLAT)
			_coins(104, 122, ground - 5)
			_foe(110, ground - 1, "crab"); _foe(118, ground - 1, "crab")
			_fill(126, 159, ground)
			start_p = Vector2(3 * TS, (ground - 1) * TS)
			goal_x = 150 * TS
		4:   # 三河湾の船と佐久島：動く船をとびうつって島へ。黒壁の家の屋根の上も
			_fill(0, 16, ground)
			for x in range(10, 17): put(x, ground - 1, PLAT)   # 一色港の桟橋
			for x in range(17, 100): for y in range(ground + 1, ROWS): put(x, y, WATER)
			var bx := [20, 34, 48, 62, 78]
			for i in bx.size():
				boats.append({"p": Vector2(bx[i] * TS, (ground - 1) * TS), "w": 4 * TS, "x0": bx[i] * TS, "x1": (bx[i] + 6) * TS, "v": 40.0 + i * 8})
				_coins(bx[i] + 1, bx[i] + 3, ground - 3)
			_foe(40, 5, "gull"); _foe(70, 4, "gull")
			_fill(100, 169, ground)
			for h in 4:   # 黒壁の家並み：屋根をつたって
				var x0 := 108 + h * 12
				_fill(x0, x0 + 6, ground - 4, STONE)
				for x in range(x0 - 1, x0 + 8): put(x, ground - 5, PLAT)
				_coins(x0, x0 + 6, ground - 6)
			put(130, 4, BALE)
			_foe(120, 4, "gull"); _foe(146, 3, "gull")
			start_p = Vector2(3 * TS, (ground - 1) * TS)
			goal_x = 162 * TS
		5:   # 三ヶ根山：のぼり坂の山道。あじさいで大きくはねて上へ
			var h := ground
			var x := 0
			while x < W - 14:
				var seg := 6 + (x % 4)
				_fill(x, x + seg, h)
				if x > 10 and x % 3 == 0:
					put(x + 2, h - 1, SPRINGT)
				if x > 6:
					_coins(x + 1, x + seg - 1, h - 3)
				x += seg + 1
				if x < W - 30:
					h = max(4, h - 1 - (x % 2))
			_fill(W - 14, W - 1, h)
			_foe(30, 4, "crow"); _foe(60, 3, "crow"); _foe(95, 2, "crow"); _foe(125, 2, "crow")
			put(50, max(1, h - 6), BALE)
			start_p = Vector2(3 * TS, (ground - 1) * TS)
			goal_x = (W - 6) * TS
	check_p = start_p

func start(n: int) -> void:
	build(n)
	lives = 3
	coins = 0
	t = 0.0
	_respawn(start_p)
	state = "play"

func _respawn(p: Vector2) -> void:
	player.p = p
	player.v = Vector2.ZERO
	player.inv = 1.0
	player.boat = -1

# ---------- 動き ----------
func _solid_at(px: float, py: float, from_above: bool, prev_bottom: float) -> bool:
	var tx := int(floor(px / TS)); var ty := int(floor(py / TS))
	var k := tile(tx, ty)
	if k == SOLID or k == STONE or k == BALE or k == USED or k == MUD:
		return true
	if (k == PLAT or k == SPRINGT) and from_above and prev_bottom <= ty * TS + 1:
		return true
	return false

func _process(delta: float) -> void:
	delta = min(delta, 0.033)
	_read_io()
	state_t += delta
	if state == "play":
		t += delta
		_step(delta)
	elif state == "dead" and state_t > 1.0:
		if lives > 0:
			_respawn(check_p); state = "play"
		else:
			state = "over"; _done(false)
	_update_cam()
	_hud()
	queue_redraw()

func _read_io() -> void:
	if io == null:
		return
	var c = io.cmd
	if typeof(c) == TYPE_STRING and c != "":
		io.cmd = ""
		if c.begins_with("start:"):
			start(int(c.substr(6)))
		elif c == "menu":
			state = "menu"

func _key(name: String) -> bool:
	var js := false
	if io != null:
		js = bool(io.get(name))
	match name:
		"left": return js or Input.is_physical_key_pressed(KEY_LEFT) or Input.is_physical_key_pressed(KEY_A)
		"right": return js or Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_physical_key_pressed(KEY_D)
		"jump": return js or Input.is_physical_key_pressed(KEY_SPACE) or Input.is_physical_key_pressed(KEY_UP) or Input.is_physical_key_pressed(KEY_Z)
	return false

func _step(dt: float) -> void:
	var pl = player
	var dir := int(_key("right")) - int(_key("left"))
	var jump := _key("jump")
	var in_mud := tile(int(pl.p.x / TS), int((pl.p.y + 9) / TS)) == MUD
	var top := RUN * (0.55 if in_mud else 1.0)
	if dir != 0:
		pl.face = dir
		pl.v.x = move_toward(pl.v.x, dir * top, ACC * dt)
	else:
		pl.v.x = move_toward(pl.v.x, 0.0, ACC * 1.4 * dt)
	# ジャンプ：少し早押し・少し遅押しでもとべる。はなすと低く
	if jump and not jump_was:
		pl.buf = 0.12
	pl.buf -= dt
	pl.coyote -= dt
	if pl.buf > 0 and pl.coyote > 0:
		pl.v.y = -JUMP * (0.85 if in_mud else 1.0)
		pl.buf = 0; pl.coyote = 0; pl.boat = -1
	if not jump and pl.v.y < -150:
		pl.v.y = -150
	jump_was = jump
	pl.v.y = min(pl.v.y + GRAV * dt, MAXFALL)
	# 船に乗っていれば一緒に動く
	if pl.boat >= 0:
		var b = boats[pl.boat]
		pl.p.x += b.v * dt
	_move(pl, dt)
	pl.inv = max(0.0, pl.inv - dt)
	# 船
	for i in boats.size():
		var b = boats[i]
		b.p.x += b.v * dt
		if b.p.x > b.x1 or b.p.x < b.x0:
			b.v = -b.v
		var bottom = pl.p.y + 8
		if pl.v.y >= 0 and pl.p.x > b.p.x - 6 and pl.p.x < b.p.x + b.w + 6 and bottom >= b.p.y and bottom <= b.p.y + 8:
			pl.p.y = b.p.y - 8; pl.v.y = 0; pl.ground = true; pl.coyote = 0.1; pl.boat = i
	# 水・下に落ちた
	var under := tile(int(pl.p.x / TS), int((pl.p.y + 6) / TS))
	if under == WATER or pl.p.y > ROWS * TS:
		_die(); return
	# 中間地点
	if pl.p.x > W * TS * 0.5 and check_p == start_p:
		check_p = Vector2(pl.p.x, pl.p.y - 4)
	# アイテム
	for it in items:
		if it.got:
			continue
		if it.t == "onigiri":
			it.vy += GRAV * 0.5 * dt
			it.p.y += it.vy * dt
			if _solid_at(it.p.x, it.p.y + 6, true, it.p.y):
				it.vy = 0; it.p.y = floor((it.p.y + 6) / TS) * TS - 6
		if pl.p.distance_to(it.p) < 13:
			it.got = true
			if it.t == "onigiri":
				lives = min(lives + 1, 5)
			else:
				coins += 1
	# 敵
	for f in foes:
		if not f.alive:
			continue
		f.t += dt
		match f.kind:
			"gull", "crow":
				f.p.x = f.x0 + sin(f.t * 0.8) * 60
				f.p.y = f.y0 + sin(f.t * 2.2) * 18
			_:
				var nx = f.p.x + f.v.x * dt
				var ahead = nx + sign(f.v.x) * 7
				if _solid_at(ahead, f.p.y, false, 0) or not _solid_at(ahead, f.p.y + 10, true, f.p.y):
					f.v.x = -f.v.x
				else:
					f.p.x = nx
		if pl.inv <= 0 and abs(pl.p.x - f.p.x) < 12 and abs(pl.p.y - f.p.y) < 13:
			if pl.v.y > 40 and pl.p.y < f.p.y - 4:   # ふんづけた
				f.alive = false
				pl.v.y = -JUMP * 0.7
				coins += 2
			else:
				_die(); return
	# ゴール
	if pl.p.x >= goal_x:
		state = "clear"; state_t = 0.0
		_done(true)

func _move(pl, dt: float) -> void:
	# 横
	var nx = pl.p.x + pl.v.x * dt
	for yy in [-6.0, 0.0, 6.0]:
		var sx = nx + sign(pl.v.x) * 5
		if pl.v.x != 0 and _solid_at(sx, pl.p.y + yy, false, 0):
			nx = pl.p.x; pl.v.x = 0
			break
	pl.p.x = max(4.0, nx)
	# 縦
	var prev_bottom = pl.p.y + 8
	var ny = pl.p.y + pl.v.y * dt
	pl.ground = false
	if pl.v.y >= 0:
		for xx in [-4.0, 4.0]:
			var bx = pl.p.x + xx
			if _solid_at(bx, ny + 8, true, prev_bottom):
				var ty = int(floor((ny + 8) / TS))
				var k = tile(int(floor(bx / TS)), ty)
				ny = ty * TS - 8
				pl.v.y = 0; pl.ground = true; pl.coyote = 0.1; pl.boat = -1
				if k == SPRINGT:   # あじさい：大きくはねる
					pl.v.y = -SPRING; pl.ground = false
				break
	else:
		for xx in [-4.0, 4.0]:
			var hx = pl.p.x + xx
			if _solid_at(hx, ny - 8, false, 0):
				var tx = int(floor(hx / TS)); var ty = int(floor((ny - 8) / TS))
				if tile(tx, ty) == BALE:   # 米俵をたたくと、おにぎりが出る
					put(tx, ty, USED)
					items.append({"p": Vector2(tx * TS + 8, ty * TS - 8), "t": "onigiri", "got": false, "vy": -160.0})
				ny = (ty + 1) * TS + 8
				pl.v.y = 0
				break
	pl.p.y = ny

func _die() -> void:
	if state != "play":
		return
	lives -= 1
	state = "dead"; state_t = 0.0

# ---------- HTML へ ----------
func _hud() -> void:
	if io == null:
		return
	io.hud(JSON.stringify({"state": state, "stage": stage, "coins": coins, "lives": lives, "time": int(t), "progress": clamp(player.p.x / max(1.0, goal_x), 0.0, 1.0)}))

func _done(clear: bool) -> void:
	if io == null:
		return
	io.done(JSON.stringify({"clear": clear, "stage": stage, "coins": coins, "lives": lives, "time": int(t)}))

# ---------- カメラ ----------
func _update_cam() -> void:
	var vs := get_viewport_rect().size
	var z = vs.y / float(ROWS * TS)
	cam.zoom = Vector2(z, z)
	var half_w = vs.x / z / 2.0
	var cx = player.p.x + player.face * 24 if state != "menu" else half_w
	cx = clamp(cx, half_w, max(half_w, W * TS - half_w))
	cam.position = Vector2(cx, ROWS * TS / 2.0)

# ---------- 絵 ----------
func _px(rows: Array, ox: float, oy: float, pal: Dictionary, flip: bool = false) -> void:
	for y in rows.size():
		var r: String = rows[y]
		for x in r.length():
			var ch := r[x]
			if ch == "." or not pal.has(ch):
				continue
			var dx = (r.length() - 1 - x) if flip else x
			draw_rect(Rect2(ox + dx, oy + y, 1, 1), pal[ch])

const HERO := ["....yyyy....", "...yyyyyy...", "..yyyyyyyy..", "...kffffk...", "...ffkfkf...", "...ffffff...", "....bbbb....", "...bbbbbb...", "..fbbbbbbf..", "...bbbbbb...", "...nn..nn...", "...kk..kk..."]
const HERO_RUN := ["....yyyy....", "...yyyyyy...", "..yyyyyyyy..", "...kffffk...", "...ffkfkf...", "...ffffff...", "....bbbb....", "..fbbbbbb...", "...bbbbbbf..", "...bbbbbb...", "..nn....nn..", "..kk....kk.."]
const HERO_PAL := {"y": Color("#e8c040"), "k": Color("#2a2a2a"), "f": Color("#f0c8a0"), "b": Color("#3a6ab8"), "n": Color("#3a3a48")}

func _draw() -> void:
	var vs := get_viewport_rect().size
	var z = cam.zoom.x
	var view_w = vs.x / z
	var x0 = cam.position.x - view_w / 2.0
	if theme.is_empty():
		theme = THEMES[0]
	# 空と遠景
	for i in 8:
		var c: Color = theme.sky.lerp(theme.sky2, i / 7.0)
		draw_rect(Rect2(x0 - 2, i * ROWS * TS / 8.0, view_w + 4, ROWS * TS / 8.0 + 1), c)
	for i in 6:   # 遠くの山なみ（ゆっくり動く）
		var hx = x0 - fmod(x0 * 0.3, 160.0) + i * 160 - 160
		var col: Color = theme.far
		for k in 40:
			var hh = 30 + 26 * sin(k / 40.0 * PI)
			draw_rect(Rect2(hx + k * 4, ROWS * TS * 0.62 - hh, 4, hh + 40), col)
	if state == "menu":
		return
	# マス
	var tx0 := int(floor(x0 / TS)) - 1
	var tx1 := int(ceil((x0 + view_w) / TS)) + 1
	var wave := int(t * 4) % 2
	for ty in ROWS:
		for tx in range(tx0, tx1):
			var k := tile(tx, ty)
			var r := Rect2(tx * TS, ty * TS, TS, TS)
			match k:
				SOLID:
					draw_rect(r, theme.soil)
					if tile(tx, ty - 1) == AIR or tile(tx, ty - 1) == PLAT:
						draw_rect(Rect2(r.position, Vector2(TS, 4)), theme.top)
					draw_rect(Rect2(r.position + Vector2(3 + (tx * 5) % 8, 8), Vector2(2, 2)), theme.soil.darkened(0.2))
				STONE:
					draw_rect(r, Color("#9b968a"))
					draw_rect(Rect2(r.position + Vector2(0, 7), Vector2(TS, 1)), Color("#6f6a61"))
					draw_rect(Rect2(r.position + Vector2(((ty % 2) * 8), 0), Vector2(1, 7)), Color("#6f6a61"))
					draw_rect(Rect2(r.position + Vector2(((ty % 2) * 8) + 4, 8), Vector2(1, 8)), Color("#6f6a61"))
				PLAT:
					draw_rect(Rect2(r.position, Vector2(TS, 6)), theme.plat)
					draw_rect(Rect2(r.position + Vector2(1, 0), Vector2(TS - 2, 2)), theme.plat2)
				WATER:
					draw_rect(r, Color("#3f84b8"))
					if tile(tx, ty - 1) != WATER:
						draw_rect(Rect2(r.position + Vector2((wave * 6 + tx * 3) % 12, 1), Vector2(4, 1)), Color("#cfe6f6"))
				MUD:
					draw_rect(r, Color("#7a6a4a"))
					draw_rect(Rect2(r.position, Vector2(TS, 3)), Color("#9a8a6a"))
					draw_rect(Rect2(r.position + Vector2((tx * 7) % 12, 7), Vector2(3, 1)), Color("#5a4a32"))
				BALE, USED:
					var bc := Color("#d8c890") if k == BALE else Color("#a89a70")
					draw_rect(r.grow(-1), bc)
					draw_rect(Rect2(r.position + Vector2(1, 4), Vector2(TS - 2, 1)), Color("#8a6a3a"))
					draw_rect(Rect2(r.position + Vector2(1, 11), Vector2(TS - 2, 1)), Color("#8a6a3a"))
					if k == BALE:
						draw_rect(Rect2(r.position + Vector2(6, 6), Vector2(4, 4)), Color("#c8302a"))   # 「米」の印のかわり
				SPRINGT:
					draw_rect(Rect2(r.position + Vector2(1, 6), Vector2(TS - 2, 10)), Color("#2f6a2a"))
					var ac := Color("#4a7ad8") if (tx % 3) else Color("#b08ae8")
					draw_rect(Rect2(r.position + Vector2(2, 2), Vector2(12, 7)), ac)
					draw_rect(Rect2(r.position + Vector2(4, 3), Vector2(3, 2)), ac.lightened(0.35))
	# 船
	for b in boats:
		draw_rect(Rect2(b.p.x, b.p.y, b.w, 6), Color("#f4f4f2"))
		draw_rect(Rect2(b.p.x + 2, b.p.y + 6, b.w - 4, 4), Color("#2a6ab8"))
		draw_rect(Rect2(b.p.x + b.w / 2 - 6, b.p.y - 8, 12, 8), Color("#e8e8e8"))
	# ゴール
	_draw_goal()
	# アイテム
	for it in items:
		if it.got:
			continue
		var p: Vector2 = it.p + Vector2(0, sin(t * 4 + it.p.x) * 1.5 if it.t != "onigiri" else 0.0)
		match it.t if it.t == "onigiri" else theme.item:
			"onigiri":
				draw_rect(Rect2(p + Vector2(-5, -4), Vector2(10, 9)), Color("#f8f6f0"))
				draw_rect(Rect2(p + Vector2(-3, -6), Vector2(6, 2)), Color("#f8f6f0"))
				draw_rect(Rect2(p + Vector2(-4, 1), Vector2(8, 4)), Color("#1a2a1a"))
			"leaf":
				draw_rect(Rect2(p + Vector2(-3, -4), Vector2(6, 8)), Color("#5aa83a"))
				draw_rect(Rect2(p + Vector2(-1, -4), Vector2(1, 8)), Color("#c4e88a"))
			"matcha":
				draw_rect(Rect2(p + Vector2(-5, -2), Vector2(10, 6)), Color("#2a2624"))
				draw_rect(Rect2(p + Vector2(-4, -3), Vector2(8, 2)), Color("#8cc040"))
			"asari":
				draw_rect(Rect2(p + Vector2(-5, -3), Vector2(10, 6)), Color("#d8ccb4"))
				draw_rect(Rect2(p + Vector2(-5, 0), Vector2(10, 1)), Color("#6a5a4a"))
			"ebisen":
				draw_rect(Rect2(p + Vector2(-5, -4), Vector2(10, 8)), Color("#f2b0b8"))
				draw_rect(Rect2(p + Vector2(-1, -1), Vector2(3, 2)), Color("#d84a3a"))
	# 敵
	for f in foes:
		if not f.alive:
			continue
		var fp: Vector2 = f.p
		match f.kind:
			"crab":
				draw_rect(Rect2(fp + Vector2(-7, -3), Vector2(14, 7)), Color("#d8402a"))
				draw_rect(Rect2(fp + Vector2(-9, -6), Vector2(4, 3)), Color("#d8402a")); draw_rect(Rect2(fp + Vector2(5, -6), Vector2(4, 3)), Color("#d8402a"))
				draw_rect(Rect2(fp + Vector2(-3, -5), Vector2(2, 2)), Color.BLACK); draw_rect(Rect2(fp + Vector2(1, -5), Vector2(2, 2)), Color.BLACK)
			"bug":
				for s in 4: draw_rect(Rect2(fp + Vector2(-8 + s * 4, -2 + (s % 2)), Vector2(4, 5)), Color("#6aa83a") if s < 3 else Color("#e8c040"))
			"cat":
				draw_rect(Rect2(fp + Vector2(-7, -4), Vector2(12, 8)), Color("#e8a050"))
				draw_rect(Rect2(fp + Vector2(3, -8), Vector2(6, 6)), Color("#e8a050"))
				draw_rect(Rect2(fp + Vector2(4, -10), Vector2(2, 2)), Color("#e8a050")); draw_rect(Rect2(fp + Vector2(7, -10), Vector2(2, 2)), Color("#e8a050"))
			"gull", "crow":
				var c := Color("#f4f4f2") if f.kind == "gull" else Color("#1a1a1a")
				var wing = -3 if int(f.t * 6) % 2 else 1
				draw_rect(Rect2(fp + Vector2(-3, -2), Vector2(6, 4)), c)
				draw_rect(Rect2(fp + Vector2(-9, wing), Vector2(6, 2)), c); draw_rect(Rect2(fp + Vector2(3, wing), Vector2(6, 2)), c)
	# 主人公（ミスしたときは点滅）
	var pl = player
	if not (pl.inv > 0 and int(t * 12) % 2 == 0) and state != "over":
		var run = abs(pl.v.x) > 20 and int(t * 10) % 2 == 0
		_px(HERO_RUN if (run or not pl.ground) else HERO, pl.p.x - 6, pl.p.y - 8 - 4, HERO_PAL, pl.face < 0)

func _draw_goal() -> void:
	var gx := goal_x
	var gy := 0.0
	# ゴールの地面の高さ
	for ty in ROWS:
		if tile(int(gx / TS), ty) != AIR:
			gy = ty * TS
			break
	match theme.goal:
		"yagura":   # 西尾城の丑寅櫓
			draw_rect(Rect2(gx - 20, gy - 40, 40, 40), Color("#f3f1ea"))
			draw_rect(Rect2(gx - 24, gy - 46, 48, 6), Color("#7a7e86"))
			draw_rect(Rect2(gx - 16, gy - 62, 32, 16), Color("#f3f1ea"))
			draw_rect(Rect2(gx - 20, gy - 66, 40, 5), Color("#7a7e86"))
			draw_rect(Rect2(gx - 4, gy - 16, 8, 16), Color("#3a3230"))
		"kurokabe":   # 佐久島の黒壁の家
			draw_rect(Rect2(gx - 18, gy - 30, 36, 30), Color("#26221e"))
			draw_rect(Rect2(gx - 22, gy - 36, 44, 6), Color("#6a7078"))
			draw_rect(Rect2(gx - 4, gy - 14, 8, 14), Color("#5a4a3a"))
		"tenbo":   # 山頂の展望台
			draw_rect(Rect2(gx - 3, gy - 40, 6, 40), Color("#f4f2ec"))
			draw_rect(Rect2(gx - 14, gy - 46, 28, 6), Color("#f4f2ec"))
			draw_rect(Rect2(gx - 16, gy - 50, 32, 4), Color("#c8302a"))
		_:   # のぼり旗
			draw_rect(Rect2(gx - 1, gy - 56, 2, 56), Color("#6a4a30"))
			draw_rect(Rect2(gx + 1, gy - 54, 14, 30), Color("#c8302a"))
			draw_rect(Rect2(gx + 4, gy - 48, 8, 18), Color("#f4f0e8"))

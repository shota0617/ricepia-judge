# トラクターの車体（Blender → glTF）

ヤンマー YT460A（直進アシスト仕様・キャビン）風の 60 馬力トラクター。トラクター運転ゲーム（three.js r128・素の `GLTFLoader`）の車体用。
メーカーのロゴや文字は入れていない。にしおさんぽGO 本体とは関係ない。

| ファイル | 中身 |
|---|---|
| `build_tractor.py` | 生成スクリプト（Blender の Python 版 bpy 5.2.2） |
| `tractor_yt.glb` | 書き出したモデル（約 3.4MB・三角形 約 8.7 万・Draco なし・テクスチャ 512px×2 枚を埋め込み・AO を頂点色に焼きこみ） |
| `harrow_yt.glb` | 代かき用のウイングハロー（`build_tractor.py --harrow`。作業幅 3.4m＝まん中 1.6m＋翼 0.9m×2、約 0.3MB・三角形 約 7,000）。うしろの両はしに作業機用の灯火器（テール・ウインカー・反射器）。ロータリーと同じ名前 `Rotary`・`Rotor`・`Flap` に、翼 `WingL`・`WingR`（原点＝ちょうつがい。three の Z 軸まわりに ±1.7rad で上へ折りたたむ）と翼の爪軸 `RotorL`・`RotorR`。ゲームは代かきのときだけ、トラクターの `Rotary` をこれにつけかえる |
| `preview_exterior.png` | 斜め前の外観（Cycles） |
| `preview_driver.png` | 運転者の目（左右 0・後輪車軸の 0.46m 後ろ・高さ 2.27m）から前方 12° 下向き・縦の画角 60° |
| `preview_console.png` | 右の操作盤のアップ |
| `preview_cockpit.png` | 公式「快適性」の運転席の写真に近い所（頭のうしろ・横の画角 88°）から。写真と見比べる用 |

## 作り直し方

```sh
python3.13 -m venv bpyenv && bpyenv/bin/pip install bpy==5.2.2
bpyenv/bin/python tools/tractor/build_tractor.py            # AO を焼き、確認の絵 3 枚と glb（4 分ほど）
bpyenv/bin/python tools/tractor/build_tractor.py --no-render  # glb だけ（数秒）
bpyenv/bin/python tools/tractor/build_tractor.py --fast       # 荒い絵で試す
```

寸法はスクリプトの頭の定数（諸元）から決まる。`--shot=front` などで直すとき用の絵 `_debug_*.png` も出せる（git には入れない）。

## 座標と単位

- メートル。原点＝後輪車軸中心の真下の地面。
- three.js では **前＝+Z・左＝+X・上＝+Y**（Blender では 前＝-Y・左＝+X・上＝+Z）。
- 外形：全長 3.96・全幅 1.85・全高 2.635（GNSS アンテナの上）。軸距 2.15、輪距 前後 1.32。
- 前タイヤ 8.3-20（直径 0.89・幅 0.21）、後タイヤ 14.9-28（直径 1.32・幅 0.38）。キャビン床 1.32、屋根の内側 2.47、キャビン幅 1.29、前ガラス 前方 0.62、後ガラス 後方 0.82。
- 運転者の目（three）＝ `(0, 2.27, -0.46)`。

## 中の並び（名前で `getObjectByName` できる）

```
Tractor（原点）
├ Body・Interior・Glass         止まっている所（Glass は材質 glass だけ）
├ WheelRL・WheelRR               後輪（原点＝車軸中心）
├ SteerFL ─ WheelFL              前輪（SteerFL の原点＝かじ取り中心、WheelFL＝車軸中心。かじ取り中心より 0.10 外）
├ SteerFR ─ WheelFR
├ SteeringWheel                  ハンドル（原点＝回転中心）
├ LeverJoy・LeverRange・LeverShuttle・LeverPtoSel   レバー（原点＝根元）
├ PedalClutch・PedalBrakeL・PedalBrakeR             ペダル（原点＝支点）
├ Wiper                          ワイパー（原点＝根元）
└ MeterScreen・MonitorScreen・MirrorL・MirrorR・RoomMirror   表示面
Rotary（原点＝作業機の下端中心。後輪車軸の 1.38m 後ろ）
├ Rotor                          爪軸（原点＝爪軸中心）
└ Flap                           均平板（原点＝上端のちょうつがい）
```

three.js での位置と回し方（角度はラジアン。`rotation` は読み込んだときの値に足すつもりで）：

| 名前 | 位置（three） | 回し方 |
|---|---|---|
| `WheelRL` `WheelRR` | (±0.66, 0.66, 0) | `rotation.x` を増やすと前進の向きに転がる |
| `SteerFL` `SteerFR` | (±0.56, 0.445, 2.15) | `rotation.y` を負にすると右へ切れる |
| `WheelFL` `WheelFR` | SteerF* の子 (±0.10, 0, 0) | `rotation.x` を増やすと前進 |
| `SteeringWheel` | (0, 1.89, 0)。外径 約 0.37。ハンドル面の法線＝局所 +Y（運転者のほう・上へ 55°） | 下の例。法線まわりに負へ回すと右へ切る（運転者から見て時計回り） |
| `LeverJoy` | (-0.345, 1.794, -0.14) 右操作盤の主変速 | `rotation.x` 正で前へ倒れる |
| `LeverPtoSel` | (-0.465, 1.74, -0.37) 右操作盤の外のオレンジ | 同上 |
| `LeverRange` | (0.35, 1.545, -0.22) 左の黄色い副変速 | 同上 |
| `LeverShuttle` | (0.12, 1.811, 0.079) ハンドル柱の左のリバーサ | `rotation.x` 正で前（前進）へ |
| `PedalClutch` `PedalBrakeL` `PedalBrakeR` | x＝0.24／-0.20／-0.29、(・, 1.59, 0.52) | `rotation.x` を負（-0.25 くらい）にすると踏みこむ |
| `Wiper` | (0.46, 1.62, 0.65) 前ガラスの左下（外） | 腕は局所 -Y（真下）。読み込み時は `rotation.z ≈ -1.57`（右へ横に寝かせて止めてある）。0 で真下、正で左へ |
| `Rotary` | (0, 0, -1.38) | 持ち上げは `position.y` など |
| `Rotor` | Rotary の子 (0, 0.25, 0) | `rotation.x` を増やす（車輪と同じ向き＝ふつうの耕うん） |
| `Flap` | Rotary の子 (0, 0.405, -0.268) | `rotation.x` 正で後ろの端が上がる |

```js
// ハンドル：読み込み直後の向きをとっておき、法線（局所 +Y）まわりに回す
const sw = gltf.scene.getObjectByName('SteeringWheel');
const sw0 = sw.quaternion.clone(), axis = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
function setSteer(a) {            // a > 0 で右へ切る
  sw.quaternion.copy(sw0).multiply(q.setFromAxisAngle(axis, -a));
}
```

## 表示面

四角い平面の別オブジェクト。原点は面のまん中で、**three.js の `PlaneGeometry` と同じ向き（局所 +Z が表・+Y が上）**。UV は 0〜1（見る人から見て右が u、上が v）。

| 名前 | 大きさ（m） | 材質 | 中身 |
|---|---|---|---|
| `MeterScreen` | 0.18 × 0.18 | `meter_screen` | 丸型メーター全体。仮の絵（512px）が入っているので、`material.map`・`emissiveMap` を CanvasTexture に差しかえてよい |
| `MonitorScreen` | 0.22 × 0.135 | `monitor_screen` | 右操作盤の前に台で立てたタッチモニター（上に青いボタン 5 つ・右上に回すつまみ）。仮の絵入り |
| `MirrorL` `MirrorR` | 0.105 × 0.18 | `mirror` | 外の左右のミラー |
| `RoomMirror` | 0.30 × 0.068 | `mirror` | 大型ルームミラー |

## 材質

- ガラス：`glass`（alphaMode BLEND・不透明度 0.16・両面）。サンバイザは `visor`。
- ライト：`lamp_head`（吊り目ヘッドライト）・`lamp_work`（屋根の LED ワークランプ 前後 2 灯ずつ）・`winker_L` `winker_R`（前は A ピラーの下、後ろはスマートリヤコンビランプの下半分）・`tail`（スマートリヤコンビランプの上半分）・`room_lamp`（室内灯）。ふだんは光っていないので、点けるときは `material.emissive` を設定する（同じ名前の材質は 1 つを共有）。
- 緑の LED（右操作盤）は `led_green` で最初から光っている。
- 使いこまれた所：`rust`（さびた鉄。3 点リンクの下の腕・リフトロッド・ロータリーのそりと側板の下の縁）、`tine_steel`（土で黒ずんだ爪の鋼。曲がった先の刃先だけ `silver` で光る）。PTO の軸の覆いは黄色い筒（`yellow`）。
- **AO（すき間や奥の暗さ）を頂点色 `COLOR_0` に焼いてある**（Cycles。0.3〜1 の明るさ）。three.js r128 の `GLTFLoader` は頂点色があると自動で `vertexColors` を入れ、地の色にかける。ガラス・表示面・光る材質には入れていない。消したいときは `material.vertexColors = false; material.needsUpdate = true`。
- 使っている拡張は `KHR_materials_clearcoat`（赤い塗装のつや。r128 対応）と `KHR_materials_emissive_strength`（r128 は無視するだけ）。どちらも必須ではない。

## 確かめたこと

- Khronos の glTF Validator：エラー 0・警告 0。
- three.js r128 の `GLTFLoader`（headless Chromium）で読み込み、名前・寸法（全長 3.964・全幅 1.85・全高 2.635）・ハンドルの法線・前輪の切れる向きを確認した。
- 公式「快適性」ページはこのクラウド環境から開けなかったので、店主からもらった運転席の写真（画面の写し）と `preview_cockpit.png` を見比べて形を決めた。ちがう所があれば `build_tractor.py` の数字を直す。
- 公式「快適性」の運転席の写真に合わせたもの：メーターの台を兼ねた幅の広い塔と、運転者へ向いた大きな赤い側面カバー（左にハザードと N/R の表示、右に赤い丸ボタンとコンビネーションスイッチ）、ハンドルの下の丸いスイッチ、白い目盛りの輪とまん中の黒い液晶の丸いメーターと左右の小さな計器、幅の広い赤いスポークと大きな赤いハブ、菱形の滑り止めの幅の広いペダルと銀色の穴あきのアクセル、ハンドル柱の蛇腹とペダルのばね、短い溝が互い違いに並ぶ床のマット、操作盤の前に立つモニター、長い柄のサブコンレバー、縦に並ぶ緑の LED、両 A ピラーの銀色の乗降グリップ、ドアの長い取っ手、前ガラスの左下のワイパー。
- X の農家さん・整備する人の写真（Actions の「Grok research (X)」・`tractor-model`、2026-10-23。docs/x-cycle.md）から入れたもの：PTO の軸の黄色い覆い（車体と作業機のあいだを斜めに渡る）、さびた下リンクとリフトロッド（連結まわりのさびは多くの写真に共通）、ロータリーのそりと側板の下の縁のさび、刃先だけ光る爪。うしろの連結まわりは `--shot=hitch` で確かめる。2 回目（2026-10-24）からは、ボンネットの窓寄りのまん中の持ち手のくぼみと丸い金具・小さなボルト（運転席からの写真 4 枚に共通。この車体ではハンドルとメーターのかげになり、運転席の目からは見えない）。ホイールは白っぽいアイボリー（`wheel_cream`。写真 3 人が「白い・白っぽい」）
- 公式の説明（検索結果の抜き書き）から入れたもの：前面と両ドアの継ぎ目のない曲面一枚ガラス（ドアは外へ 0.05 ふくらむ）、段差のない足元、大型ルームミラー、右手に集めた主変速・PTO 入/切・作業機昇降・チョイ上げ/チョイ下げ・サブコンレバー。

---

# 田んぼ（field_tanbo*.glb）

トラクターを走らせる田んぼとそのまわり。**季節ごとに 3 つ**あり、中の名前・並び・寸法は同じなので、ゲームでは読みこむファイルを替えるだけでよい。

| 季節 | ファイル | Field（耕す前） | FieldTilled（耕したあと） | まわり |
|---|---|---|---|---|
| 春（耕す前） | `field_tanbo.glb` | 乾きかけの灰色がかった土・古い藁・低い切り株・冬を越したスズメノテッポウの株（`WeedHill`：葉 weed と円柱形の穂 weed_spike。ゲームでところどころのかたまりに並べる） | 湿った濃い土くれ | 耕した田んぼ・水を張った田んぼ・花の時期の緑肥のレンゲ畑（renge） |
| 秋（稲刈りから 2〜3 週間） | `field_tanbo_aki.glb` | 湿った土・コンバインがまいた藁・高い切り株と、株から伸びた青いひこばえ・秋起こしの前にまいた白っぽい粒状の土壌改良材・少し乾いたクローラの跡（`Tracks`）と水たまり | 藁とひこばえをすきこんだ、土くれの大きい土（秋起こし） | まだ刈っていない実った稲（倒れた所もある）・秋起こしした田んぼ・畦の彼岸花・南西の田んぼのはざかけ（稲架掛け）3 列（haze_wood・haze_bamboo・haze_rice） |
| 代かき（水を張った田んぼ） | `field_tanbo_shirokaki.glb` | 浅水（水面 y 0.006）から 7〜8 割が頭を出す荒く起こした土（「土が 8 割・水が 2 割見える」浅水）・浮いた藁 | 代かきしたにごった泥水（水面より 2cm 上） | どこも水を張り、何枚かは代かき済み・田植え済み（苗の列）。畦の内側は畦塗りの泥。用水路は満水 |

| ファイル | 中身 |
|---|---|
| `build_field.py` | 生成スクリプト（bpy 5.2.2。`build_tractor.py` の部品の関数を借りる） |
| `field_tanbo.glb`・`field_tanbo_aki.glb`・`field_tanbo_shirokaki.glb` | 春 約 5.3MB・三角形 約 6.9 万、秋 約 5.3MB・約 7.1 万、代かき 約 5.1MB・約 8.7 万。Draco なし。土・草・砂利・コンクリート・稲などの絵（numpy で作った、つなぎ目なく並ぶ 1024px／512px）を JPEG で埋めこみ（切り抜きの絵は PNG） |
| `preview_field.png`・`preview_field_aki.png`・`preview_field_shirokaki.png` | 農道から見た田んぼ（トラクターが半分ほど耕したところ） |
| `preview_field*_driver.png` | 運転席から（左はまだ、右は耕したあと） |
| `preview_field*_ground.png` | ロータリーのうしろ：耕した所とまだの所の境目 |

```sh
bpyenv/bin/python tools/tractor/build_field.py                       # 3 つの季節を全部（先に build_tractor.py で tractor_yt.glb を作っておく。絵に使う）
bpyenv/bin/python tools/tractor/build_field.py --season=aki           # 1 つだけ（haru・aki・shirokaki）
bpyenv/bin/python tools/tractor/build_field.py --no-render            # glb だけ
```

季節ごとのちがい（ゲームで気をつける所）：

- **代かき**には `StubbleHill`（切り株の型）が無い。切り株は並べない。トラクターは泥に少し沈めると自然（確認の絵では 9cm）。耕す田んぼの水面は y 0.006（まわりの田んぼは 0.025）、代かきした泥水（`FieldTilled` と帯）は y 0.045 なので、帯は `y = 0.045` で足す。
- **秋**の切り株は高い（12〜19cm）。株からはひこばえ（`HikobaeHill`、10〜24cm の葉が外へ開く）が伸びている。ゲームでは切り株と同じ行列で並べ、葉は先頭から パソコン 6 枚・スマホ 4 枚だけ使う。クローラの跡（`Tracks`。x ＝ −13＋2k（k＝0〜13）の ±0.575 に 2 本ずつ、幅 0.4m、z −22〜22。枕地は外から 1.0m と 2.2m を一周）の上の株はつぶれているので、並べないとそれらしい。
- 用水路の水面は 春 0.12・秋 −0.05（ほとんど空）・代かき 0.25。
- 水の材質（`water`・`paddy_water`）は three では反射が出ないので、`scene.environment` に空の環境マップを入れると代かきの田んぼが見ちがえる。

## 並びと寸法（three.js の座標。原点＝耕す田んぼのまん中の地面）

- 耕す田んぼ：x −15〜15・z −25〜25（30m×50m、18 アール）。面の高さ y＝0（±2cm のわずかな凸凹）。稲の列は z の向き（条間 30cm・株間 約 17.6cm）。
- 畦：高さ 0.30・下の幅 1.1・上の幅 0.45。草むら（十字の板）つき。
- 東（+x）：畦 → コンクリートの U 字の用水路（x 15.85〜16.45、水面 y 0.12）→ 砂利の農道（x 16.7〜20.7、y 0.50）→ 電柱と電線 → となりの田んぼ。
- 進入路：農道から田んぼへ下りる坂（z 18〜22、x 12〜16.9）。用水路はふたの下をくぐる。水口（z −18）と落水口（西、z 20）もある。
- 西（−x）：畦 → 土の排水路（底 y −0.45）→ となりの田んぼ。
- まわり：±420m まで田んぼが続く（何枚かは耕してあり、2 枚は水を張ってある）。木立と、520〜900m に山並み。カメラの `far` は 1000 以上、`scene.fog`（150〜900m くらい）を入れると自然。
- トラクターは `tractor.position.set(x, 0, z)` で田んぼの上に置ける（どちらも原点が地面）。

## 中の並び

```
Tanbo
├ Field            耕す前の田んぼ（材質 soil_untilled）
├ FieldTilled      耕したあとの田んぼを全面に（材質 soil_tilled、3cm 上）。全部耕した見た目に使うか、隠して下の帯の材質の元にする
├ Levees           畦・土手（grass）
├ Road             農道・進入路（gravel・grass・concrete_box）
├ Canal            用水路と排水路の水（concrete・water）
├ Facilities       水口・落水口・水たまり
├ Tracks           （秋だけ）コンバインのクローラの跡（track）
├ GrassTufts       草むら（grass_tuft、アルファで切り抜き）
├ Neighbors・NeighborsTilled   まわりの田んぼ（秋の実った稲は rice_top・rice_side、代かきの水は paddy_water、苗は seedlings）
├ Poles            電柱と電線
├ Houses           集落（瓦屋根の母屋・蔵・納屋・ビニールハウス。屋敷は田んぼより 0.45 高い）
├ Trees            木立・屋敷林（広葉樹と杉の板を 3 枚ずつ。法線は木のまん中から外向き）
├ Hills            山並み（森の絵・尾根と谷の明暗）とそのむこうのかすんだ山
├ StubbleHill      切り株ひと株の型（約 100 三角形・原点＝株の根元）。y −5 にしまってある（代かきには無い）
└ HikobaeHill      （秋だけ）ひこばえひと株の型（葉 8 枚・32 三角形。StubbleHill と同じ原点・同じ所に並べる。法線は上向き）
```

- 土・草・砂利には、場所ごとのムラ（湿った所・わだち）を頂点色 `COLOR_0` に入れてある（three は自動で使う）。
- 水 `water`・`paddy_water` は半透明（BLEND）。草むら `grass_tuft`・彼岸花 `higanbana`・苗 `seedlings`・浮いた藁 `straw_float`・稲の横 `rice_side` は alphaMode MASK。

## 耕した所を出す（おすすめ）

`FieldTilled` を隠し、ロータリーが通った所に帯（四角）を足していく。UV は **(x / 2, −z / 2)**（土の絵が 2m 四方なので、どこに足してもつながる）。材質は `FieldTilled` のものを複製し、**`vertexColors = false`** にする（頂点色の無い形に頂点色の材質を使うと黒くなる）。

```js
const tilled = gltf.scene.getObjectByName('FieldTilled');
tilled.visible = false;
const tilledMat = tilled.material.clone();
tilledMat.vertexColors = false;
function addTilled(x0, x1, z0, z1) {          // 田んぼの座標で四角を足す（ロータリーの幅 2.2m ずつ）
  const y = 0.035, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0,y,z0, x1,y,z0, x1,y,z1, x0,y,z1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x0/2,-z0/2, x1/2,-z0/2, x1/2,-z1/2, x0/2,-z1/2], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, tilledMat));
}
```

## 切り株を並べる

```js
const hill = gltf.scene.getObjectByName('StubbleHill');
hill.visible = false;
const spots = [];
for (let x = -15 + 0.15; x < 15; x += 0.30)
  for (let z = -25 + 3 / 34; z < 25; z += 3 / 17) spots.push([x, z]);   // 約 2.8 万株
const stubble = new THREE.InstancedMesh(hill.geometry, hill.material, spots.length);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
spots.forEach(([x, z], i) => {
  q.setFromAxisAngle(up, Math.random() * 6.28);
  stubble.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.setScalar(0.85 + Math.random() * 0.3)));
});
scene.add(stubble);
// 耕した株は大きさ 0 にして消す：stubble.setMatrixAt(i, zeroMatrix); stubble.instanceMatrix.needsUpdate = true;
```

（田んぼ全部で 約 280 万三角形になる。重いときは運転席から 20〜30m の所だけ並べる。遠くは `Field` の絵に切り株の列が描いてある）

## 確かめたこと（田んぼ）

- glTF Validator：3 つともエラー 0。警告は「法線の絵に接線が入っていない」というもので、three.js は自分で計算するので問題ない。
- three.js r128 の `GLTFLoader` で、3 つの季節それぞれ田んぼ・トラクターをいっしょに読みこみ、上のやり方（耕した帯・切り株の InstancedMesh）で表示できることを確認した。

# トラクターの車体（Blender → glTF）

ヤンマー YT460A（直進アシスト仕様・キャビン）風の 60 馬力トラクター。トラクター運転ゲーム（three.js r128・素の `GLTFLoader`）の車体用。
メーカーのロゴや文字は入れていない。にしおさんぽGO 本体とは関係ない。

| ファイル | 中身 |
|---|---|
| `build_tractor.py` | 生成スクリプト（Blender の Python 版 bpy 5.2.2） |
| `tractor_yt.glb` | 書き出したモデル（約 1.4MB・三角形 約 4.8 万・Draco なし・テクスチャ 512px×2 枚を埋め込み） |
| `preview_exterior.png` | 斜め前の外観（Cycles） |
| `preview_driver.png` | 運転者の目（左右 0・後輪車軸の 0.46m 後ろ・高さ 2.27m）から前方 12° 下向き・縦の画角 60° |
| `preview_console.png` | 右の操作盤のアップ |

## 作り直し方

```sh
python3.13 -m venv bpyenv && bpyenv/bin/pip install bpy==5.2.2
bpyenv/bin/python tools/tractor/build_tractor.py            # 確認の絵 3 枚と glb（絵は 4 分ほど）
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
| `Wiper` | (0, 2.41, 0.655) 前ガラスの上のまん中 | 腕は局所 -Y（真下）。読み込み時は `rotation.z ≈ -1.48`（右へ寝かせて止めてある）。0 で真下、正で左へ |
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
| `MonitorScreen` | 0.22 × 0.135 | `monitor_screen` | 右前のタッチモニター。仮の絵入り |
| `MirrorL` `MirrorR` | 0.105 × 0.18 | `mirror` | 外の左右のミラー |
| `RoomMirror` | 0.21 × 0.058 | `mirror` | ルームミラー |

## 材質

- ガラス：`glass`（alphaMode BLEND・不透明度 0.16・両面）。サンバイザは `visor`。
- ライト：`lamp_head`（吊り目ヘッドライト）・`lamp_work`（屋根の LED ワークランプ 前後 2 灯ずつ）・`winker_L` `winker_R`（前は A ピラーの下、後ろはスマートリヤコンビランプの下半分）・`tail`（スマートリヤコンビランプの上半分）・`room_lamp`（室内灯）。ふだんは光っていないので、点けるときは `material.emissive` を設定する（同じ名前の材質は 1 つを共有）。
- 緑の LED（右操作盤）は `led_green` で最初から光っている。
- 使っている拡張は `KHR_materials_clearcoat`（赤い塗装のつや。r128 対応）と `KHR_materials_emissive_strength`（r128 は無視するだけ）。どちらも必須ではない。

## 確かめたこと

- Khronos の glTF Validator：エラー 0・警告 0。
- three.js r128 の `GLTFLoader`（headless Chromium）で読み込み、名前・寸法（全長 3.964・全幅 1.85・全高 2.635）・ハンドルの法線・前輪の切れる向きを確認した。
- 公式「快適性」ページ（運転席の写真）はこのクラウド環境から開けなかったので、諸元の数字と依頼文の部品の説明から形を決めた。写真と見比べて、ちがう所があれば `build_tractor.py` の数字を直す。

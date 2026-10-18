# 歩く地図を Godot で描く（試作）

にしおさんぽGO のドット絵の地図（操作して移動・あるいて移動）を、ゲームエンジン [Godot](https://godotengine.org/) 4.3 で描く試作です。せってい の「🎮 Godotで地図を描く（試作）」をオンにしたとき（または `nishio-go.html?godot=1`）だけ使います。ふだんはいままでどおり canvas で描きます。

## しくみ

- ゲームのしくみ（歩く・チェックイン・たからばこ・人の話・スティック・ボタン）は、いままでどおり `nishio-go/pixel.js`・`game.js`。絵もいままでの canvas の絵です
- `pixel.js` の `frame()` は、Godot がオンのとき、描く命令を canvas の代わりに記録係（`nishio-go/godot-field.js` の `rec`）に書きます。記録係はそれを数の並び（Float32Array を base64）にして、Godot が `window.nsgField.frame()` で受けとって描きます
  - 命令：`1 絵 id x y w h 不透明度`／`2 四角 x y w h 色 不透明度`／`3 多角形 n 点… 色 不透明度`
  - 絵は `nsgField.png(id)` で PNG を受けとって覚えます。文字も小さな絵にして渡すので、Godot に日本語のフォントはいりません
- Godot だけでしていること（`godot/field/main.gd`）
  - 雨と雪のつぶ（気象庁の今の天気。`nsgField.env()`）
  - 時間帯の色あい（夕方はだいだい、夜は青く）
- Godot の画面は地図の canvas の上にかさね、タップは下の canvas に通します。名所やお店の札のタップは、いままでどおり動きます
- せかいちず（広い地図）は、いままでどおり canvas で描きます

## 書き出し

```sh
# Godot 4.3 と Web 用のテンプレート（web_nothreads_release.zip）を入れておく
godot --headless --path godot/field --export-release "Web"
rm nishio-go/godot/field.html nishio-go/godot/field.png   # ページは nishio-go.html から起動するので使わない
```

- 書き出し先は `nishio-go/godot/`（`field.js`・`field.wasm`・`field.pck`・`field.audio.worklet.js`）
- スレッドなし（SharedArrayBuffer や COOP/COEP のヘッダーはいらない）。WebGL2 が必要
- `field.wasm` は約35MB（gzip で約7.6MB）。オンにしたときだけ読みこみます

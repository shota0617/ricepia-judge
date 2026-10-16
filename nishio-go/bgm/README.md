# にしおさんぽGO の音楽（BGM・効果音）

このフォルダに mp3 を置くと、ゲームで流れます。ファイルが無い曲は鳴らさないだけなので、そろっていなくても動きます。

| ファイル | いつ流れるか | 作り方 |
| --- | --- | --- |
| `field.mp3` | ふだん（歩く地図・ふつうの地図）。くり返し流す | Suno AI（下の指示文） |
| `world.mp3` | せかいちず（西尾市ぜんたいの地図）。くり返し流す。無ければ `field.mp3` | Suno AI（下の指示文） |
| `checkin.mp3` | チェックインしたとき（約0.7秒） | このリポジトリで作ったオリジナル（矩形波・三角波のファミコン風） |
| `levelup.mp3` | レベルが上がったとき（約1.5秒） | 同上 |

- 音楽は最初のタップ（はじめの画面のボタンなど）から流れます（ブラウザの決まりで、タップ前は音を出せません）。
- 地図の下の 🔊 ボタンと「せってい」の「🎵 音楽（BGM）」で、いつでも消せます。効果音のあいだは BGM を小さくします。
- スマホの通信量を減らすため、BGM は 1〜2分・1曲3MB くらいまでがおすすめです（長い曲は短く切ってから置きます）。

## Suno AI での作り方

1. Suno の「作成」で「アドバンスド」（カスタム）を選び、「インストゥルメンタル」（歌なし）をオンにする。
2. 下の「スタイル」をそのまま貼り、「タイトル」を入れて作成する。
3. 気に入った方を mp3 でダウンロードし、ファイル名を `field.mp3` / `world.mp3` にしてこのフォルダに置く。

ゲームや作曲者の名前（特定の作品名）は入れません。Suno が受け付けないことがあり、また既存の曲に似せないためです。

### field.mp3（西尾のまちを歩く曲）

- タイトル：にしおさんぽ フィールド
- スタイル：

```
8-bit chiptune, retro Japanese RPG overworld theme, NES-style square wave lead, triangle bass, noise drums, cheerful and adventurous, bright major key, light marching rhythm, 120 bpm, instrumental, seamless loop
```

### world.mp3（せかいちずの曲）

- タイトル：にしおさんぽ せかいちず
- スタイル：

```
8-bit chiptune, retro Japanese RPG world map theme, grand and nostalgic, sweeping heroic melody, square wave lead and harmony, triangle bass, noise drums, majestic, 100 bpm, instrumental, loopable
```

## 使ってよい条件（大事）

このゲームはお店の宣伝に使うので、**商用利用**にあたります。Suno の無料プランで作った曲は商用利用できません。有料プラン（Pro／Premier）に入っている間に作った曲だけが商用利用できます（あとから有料プランに入っても、無料プランのときに作った曲は商用利用できません）。最新の条件は Suno の利用規約で確認してください。

`checkin.mp3` と `levelup.mp3` はこのリポジトリで一から作ったオリジナルの音なので、条件なく使えます。

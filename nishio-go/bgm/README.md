# にしおさんぽGO の音楽（BGM・効果音）

このフォルダに mp3 を置くと、ゲームで流れます。ファイルが無い曲は鳴らさないだけなので、そろっていなくても動きます。

| ファイル | いつ流れるか | 作り方 |
| --- | --- | --- |
| `field.mp3` | ふだん（歩く地図・ふつうの地図）。くり返し流す（約32秒） | オリジナル（`tools/make-sound.py`）。Suno の曲に差し替えてもよい |
| `world.mp3` | せかいちず（西尾市ぜんたいの地図）。くり返し流す（約38秒）。無ければ `field.mp3` | 同上 |
| `field2.mp3` | 昼の2曲目「まちかど」（ヘ長調・132bpm、裏打ちの和音、約29秒） | オリジナル（`tools/make-sound.py`） |
| `field3.mp3` | 昼の3曲目「おまつり」（ヨナ抜き音階・140bpm、太鼓と笛、約27秒） | 同上 |
| `morning.mp3` | 朝（5〜9時）（ト長調・108bpm、約36秒） | 同上 |
| `evening.mp3` | 夕方（16〜19時）（イ短調・90bpm、約43秒） | 同上 |
| `night.mp3` | 夜（19〜5時）（ニ短調・76bpm、虫の声、約51秒） | 同上 |
| `rain.mp3` | 雨がふっているとき（気象庁の今の天気。変ホ長調・84bpm、雨つぶ、約46秒） | 同上 |
| `checkin.mp3` | チェックインしたとき（約0.6秒） | オリジナル（`tools/make-sound.py`） |
| `levelup.mp3` | レベルが上がったとき（約1.5秒） | 同上 |

ふだんの曲は、雨なら `rain`、夜は `night`、朝は `morning`、夕方は `evening`、昼は `field`・`field2`・`field3` を1曲ずつ順に流します（開くたびにちがう曲から。無い曲は飛ばします）。1分ごとに時間帯と天気を見て、変わったら曲を変えます。せかいちずは `world`。
新しい6曲の旋律は、`make-sound.py` の `compose()` がコード進行に合わせて作ります（強い拍はコードの音、弱い拍は音階の音、はじめの句を終わりにくり返し、主音で終わる）。

10曲とも `python3 tools/make-sound.py` で作り直せる（`python3 tools/make-sound.py night rain` のように1曲ずつも）オリジナルのファミコン風の音（矩形波・三角波・ノイズだけ）です。作曲もこのリポジトリで行ったので、お店の宣伝にもそのまま使えます。

- 音楽は最初のタップ（はじめの画面のボタンなど）から流れます（ブラウザの決まりで、タップ前は音を出せません）。
- 「せってい」の「🎵 音楽（BGM）」で、いつでも消せます。効果音のあいだは BGM を小さくします。
- スマホの通信量を減らすため、BGM は 1〜2分・1曲3MB くらいまでがおすすめです（長い曲は短く切ってから置きます）。

## Suno AI の曲に差し替えるとき

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

いま入っている10曲（`tools/make-sound.py` で作ったもの）は、このリポジトリで一から作ったオリジナルなので、条件なく使えます。

# トラクター：遊びの 数（サイクル291。運営者 2026-11-22「入れて」）

にしおさんぽGO・ミシン糸と 同じ しくみ（`nishio-go/analytics.js` の `nsgTrack`）で、遊びの 数 だけを 送る。
公開の ドメイン（go.ricepia.jp・ricepia-judge.vercel.app）で だけ 動く。手元の 確かめ・作業場では 送らない。
`localStorage` の `nsg_noanalytics` が `'1'` の ときは 送らない（操作の 表・終わりの 画面の いちばん 下の「送らない」で 切れる）。

送らない もの：名前・位置・なぞった 道の 形。数 だけ。どれも `game: 'tractor'` つき。

| 名前 | いつ | 中身 |
|---|---|---|
| `play_open` | ページが 開いた（1 回） | — |
| `play_ready` | 読みこみの おおいが 取れて 遊べる ように なった（1 回）。読めなかった ときは `ok: false`（その あと 始まっても 送り直さない） | `secs`（開いて からの 秒）・`ok` |
| `play_first_touch` | 最初に さわった（読みこみ中も ふくむ。1 回） | `secs` |
| `play_first_reward` | 最初の ごほうび＝大きな 耕し率の 数字が はじめて 0.0% から 動いた（`firstmin.js` の 2 と 同じ 見かた。1 回） | `secs` |
| `play_minute` | 画面が 見えて いる 時間の 合計が 60 秒（かくれて いる 間は 数えない。1 回） | — |
| `play_end` | ページを 閉じる（pagehide）・画面が かくれる。同じ 中身を 2 秒 以内に 2 回 送らない | `secs`（見えて いた 秒）・`pct`（耕し率。整数）・`transport_type: 'beacon'` |

こまの 速さ（fps）は 今 数えて いる 値が ない ので 送らない（毎こまの 仕事を ふやさない）。
GA4 では `play_open` → `play_ready` → `play_first_touch` → `play_first_reward` → `play_minute` と ならべると、どこで やめたかが 分かる（読みこみで やめる 人は `play_ready` の 前）。
しくみは `tractor.html` の `window.PLAYT`。確かめは `.claude/skills/tractor/scripts/firstmin.js` の 26。

同じ ページで、`nishio-go/analytics.js` が 付ける もの も 動く：Google アナリティクスの ページの 見え（page_view）・Google 広告と LINEヤフー広告の 計測タグ・ricepia.jp や 当店の LINE への リンクを 押した とき の `shop_link`／`line_add`（にしおさんぽGO と 同じ）。「送らない」を 押すと 遊びの 数は すぐ 止まるが、その 回に 読みこんだ 計測は 次に 開く まで 止まらない。

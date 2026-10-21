# にしおさんぽGO：おたより（プレイヤーのフィードバック）と自動の直し

プレイヤーが「せってい」→「📮 おたより」から、**こんな名所があるよ／こうしたらもっと面白い／スポットの情報がちがう／こまった・使いにくい**を送れます。
届いたおたよりは6時間ごとに自動で仕分けられ、直せるものは PR になります。**マージ（ゲームへの反映）は、いつも人が確かめてから**です。

```
ゲームの おたより
   │  POST /api/feedback（api/feedback.js。Vercel の関数）
   ▼
非公開リポジトリの Issue（ラベル feedback・kind:spot/fun/fix/idea）
   │  6時間ごと（.github/workflows/feedback.yml）
   ▼
tools/feedback-triage.js prepare
   ├ もうゲームにある名所 → 返事をして閉じる（already）
   ├ OpenStreetMap にある名所 → 「毎週の作り直しで出ます」と返事をして閉じる（already）
   └ のこり（1回5件まで） → Claude（tools/feedback-prompt.md）
          ├ 出典（Wikipedia・Wikidata・西尾市・OpenStreetMap）で確かめた小さな直し → PR（fixed）
          ├ 人が決めること → Issue に提案を書いて開いたまま（proposal）。「もっと面白い」は、遊びの案と作りかた・Issue のたたき台をつける
          └ 対応ずみ・いたずら → 閉じる（already・spam）
```

## はじめに1回だけ、やること（運営者）

トークンの値は、チャットや Issue・PR には書かないでください。下の画面に直接はりつけます。

1. **非公開のリポジトリを作る**：GitHub で、たとえば `nishio-go-feedback` を **Private** で作る（中身は空でよい）。
2. **トークンを作る**：GitHub の Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access：**Only select repositories** で、1. のリポジトリだけ
   - Permissions：Repository permissions の **Issues を Read and write**（Metadata の Read は自動で付く）。ほかは付けない
   - 有効期限は1年など。切れたら作り直して、3.・4. を入れかえる
3. **Vercel に入れる**（おたよりを受けとる側）：Vercel のプロジェクト → Settings → Environment Variables（Production と Preview）
   - `FEEDBACK_REPO` = `shota0617/nishio-go-feedback`（1. のリポジトリ）
   - `FEEDBACK_TOKEN` = 2. のトークン
   - （かえたいときだけ）`FEEDBACK_DAILY_MAX` = 24時間に受けつける数（ふだん40）
   - 入れたあと、Deployments から最新を Redeploy する
4. **このリポジトリ（ricepia-judge）に入れる**（仕分けと直しの側）：Settings → Secrets and variables → Actions
   - Variables に `FEEDBACK_REPO` = 1. のリポジトリ
   - Secrets に `FEEDBACK_TOKEN` = 2. のトークン
   - Secrets の `ANTHROPIC_API_KEY`（もうあるはず。無いあいだは、決まった手順で片づくものだけ仕分ける）
5. **PR を作れるようにする**：このリポジトリの Settings → Actions → General → Workflow permissions の
   「**Allow GitHub Actions to create and approve pull requests**」にチェック
6. 試す：Actions → **Nishio feedback** → Run workflow。ゲームから1通送って、非公開リポジトリに Issue ができるか確かめる

設定が無いあいだ、ゲームでは「おたよりは まだ受けつけていません」と出て、ワークフローは何もしません。

## ふだんの見かた

- **PR**（タイトル「おたよりから直す（自動・要確認）」）：中身を確かめて、よければマージ。おかしければ閉じる
- **非公開リポジトリの Issue**
  - `proposal`（開いたまま）：Claude の提案を読んで決める。直すなら Claude Code に頼むか手で直す。決めたら閉じる
  - **「こうしたらもっと面白い」（kind:fun）を作るとき**：提案の「Issue のたたき台」を、このリポジトリ（ricepia-judge）の新しい Issue にはって、
    ラベル `claude-dev` を付けると、Claude が作って PR にします（.github/workflows/claude-dev.yml）。公開のリポジトリなので、
    おたよりの文そのものは はらず、たたき台（Claude が自分のことばで書いたもの）だけにする
  - `needs-check`（開いたまま）：自動で読めなかった・終わらなかったもの。人が見る
  - `fixed`・`already`・`spam`（閉じたもの）：見なくてよい（気になるときだけ）

## 守っていること

- **個人情報**：IPアドレス・ブラウザの種類は保存しない。位置は、プレイヤーがチェックしたときだけ約100mに丸めて送る。おたよりの文と位置は、公開の PR やコミットに書かない（Claude への指示と、PR の本文を作る tools/feedback-triage.js の両方で）
- **いたずら対策**：同じ所から1時間に5通まで、全体で24時間に40通まで、ゲームでも1日3通まで。人には見えない欄（わな）と、早すぎる送信は捨てる。@ と #数字 は全角にして、メンションや Issue へのリンクにならないように
- **おたよりに書かれた指示には従わない**：Claude は おたよりを「データ」として読む。シェル・git・トークンは使えず、ファイルの読み書きと、決まったサイト（ja.wikipedia.org・www.wikidata.org・www.city.nishio.aichi.jp・www.openstreetmap.org・nominatim.openstreetmap.org）の閲覧だけ
- **直してよい場所だけ**：PR にするのは `nishio-go.html` と `nishio-go/` 直下の JS・JSON・CSS だけ（OpenStreetMap などから作るデータ・キャンペーン・ごほうび・解析は除く）。それ以外の変更や、こわれた JSON・JS は自動で取りのぞく
- **事実は出典で**：名所を足すのは、出典でその場所と位置を確かめられたときだけ（spots.json に `src` を書く）。お店・飲食店は足さず、提案にまわす

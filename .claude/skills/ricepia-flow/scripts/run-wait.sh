#!/usr/bin/env bash
# Actions の ワークフローを 手で 動かした あと、その 実行が 終わるまで 待つ
#   run-wait.sh <ワークフローの ファイル名>              いまの いちばん 新しい 実行の id を 出す（動かす 直前に 毎回 控える）
#   run-wait.sh <ワークフローの ファイル名> <控えた id>  控えた id より あとに 手で 動かされた 最初の 実行を 相手に 決め、その id だけを 追う
#   run-wait.sh --id <実行の id>                         その 実行が 終わるまで 待つ
#   動かすのは GitHub の MCP の actions_run_trigger（この 環境には gh も トークンも ない）。公開リポジトリなので、実行の ようすは トークン なしで 読める
#   終わったら「id 結論 ブランチ」を 出す（結論が success 以外なら 終了コード 1）。相手に 決めた id を ログ（get_job_logs）で 見て、入力（APPLY など）が 動かした とおりかも 確かめる
set -euo pipefail
repo="${RICEPIA_REPO:-shota0617/ricepia-judge}"; api="https://api.github.com/repos/$repo/actions"
runs() { curl -sSf "$api/workflows/$1/runs?per_page=30&event=workflow_dispatch"; }

if [ "${1:-}" = --id ]; then target="${2:?実行の id を ください}"
else
  wf="${1:?ワークフローの ファイル名を ください（例：line-richmenu.yml）}"; before="${2:-}"
  if [ -z "$before" ]; then runs "$wf" | python3 -c "import json,sys;r=json.load(sys.stdin)['workflow_runs'];print(max([x['id'] for x in r] or [0]))"; exit 0; fi
  target=''
  for _ in $(seq 1 20); do   # 動かした 実行が 一覧に 出るまで（ふつうは 数秒）
    target=$(runs "$wf" | python3 -c "import json,sys;b=int(sys.argv[1]);r=[x['id'] for x in json.load(sys.stdin)['workflow_runs'] if x['id']>b];print(min(r) if r else '')" "$before")
    [ -n "$target" ] && break; sleep 3
  done
  [ -n "$target" ] || { echo "控えた id（$before）より あとの 実行が 出てきません（動かせて いない かも）" >&2; exit 1; }
  echo "待つ 実行：$target" >&2
fi
for _ in $(seq 1 60); do
  read -r st con br < <(curl -sSf "$api/runs/$target" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r['status'],r['conclusion'] or '-',r['head_branch'])")
  if [ "$st" = completed ]; then echo "$target $con $br"; [ "$con" = success ]; exit; fi
  sleep 6
done
echo "6分 待っても 終わりません（$target：$st）" >&2; exit 1

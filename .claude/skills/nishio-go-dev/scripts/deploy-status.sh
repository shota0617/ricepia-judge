#!/usr/bin/env bash
# コミットの Vercel デプロイの 状態を 出す（GitHub の commit status）。
# つかいかた：deploy-status.sh <sha> [--wait]   --wait：pending の 間 15秒ごとに 最大 5分 待つ
# 終了コード：success 0・failure/error 1・まだ／なし 3
set -uo pipefail
sha="${1:?sha を ください}"; wait="${2:-}"
repo="$(git -C "$(dirname "$0")" remote get-url origin | sed -E 's#.*[:/]([^/]+/[^/.]+)(\.git)?$#\1#')"
for i in $(seq 1 20); do
  st="$(curl -s "https://api.github.com/repos/$repo/commits/$sha/statuses" | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      let a; try { a = JSON.parse(s); } catch (e) { console.log("none\tGitHub の 返事が 読めない"); return; }
      const v = Array.isArray(a) ? a.find(x => x.context === "Vercel") : null;   // いちばん 新しい もの
      console.log(v ? `${v.state}\t${v.description}` : "none\tまだ ステータスが ない");
    });')"
  state="${st%%$'\t'*}"
  if [ "$wait" != --wait ] || { [ "$state" != pending ] && [ "$state" != none ]; } || [ "$i" = 20 ]; then break; fi
  sleep 15
done
echo "Vercel（$sha）：$state — ${st#*$'\t'}"
case "$state" in success) exit 0 ;; failure|error) exit 1 ;; *) exit 3 ;; esac

# run-watch.sh と report.sh が最初に読む共通設定
# 設定ファイル（認証情報など）を読み、launchd から呼ばれても node と claude が見つかるようにする
CONF=${ADS_WATCH_ENV:-$HOME/.config/ricepia-agents/ads-watch.env}
if [[ -f $CONF ]]; then
  set -a; source "$CONF"; set +a
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
export ADS_WATCH_DATA_DIR=${ADS_WATCH_DATA_DIR:-$HOME/ricepia-agents/ads-watch}
mkdir -p "$ADS_WATCH_DATA_DIR/logs" "$ADS_WATCH_DATA_DIR/reports"

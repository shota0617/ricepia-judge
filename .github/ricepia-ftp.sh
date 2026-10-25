# ricepia.jp（さくら）に FTPS でつなぐための共通の関数（.github/workflows/ricepia-jp.yml から読み込む）
# シークレットを貼り付けたときに末尾に入りがちな改行・CR を取り除く（改行が残ると lftp が命令の区切りと読んでしまう）
for v in FTP_SERVER FTP_USER FTP_PASS; do
  val="${!v}"; val="${val//[$'\r\n']/}"; printf -v "$v" '%s' "$val"
done
# パスワードはコマンドの引数に出さず環境変数で渡す。平文で流れないよう FTPS（暗号化）を必須にする
export LFTP_PASSWORD="$FTP_PASS"
ftp() { lftp --env-password -u "$FTP_USER" -e "set ftp:ssl-force true; set ftp:ssl-protect-data true; set cmd:fail-exit yes; $1; bye" "$FTP_SERVER"; }

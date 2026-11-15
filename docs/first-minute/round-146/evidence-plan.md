# 証拠の構成と展開

原ファイルを変更せず、固定した証拠を2本のlossless tar.gzへ収録した。全memberを別scratchへ展開し、元ファイルとの全byteとSHA256の一致を確認した。archive内JSONは整形・間引き・エラー削除なし。PNGも原byteで、加工・画像再圧縮なし。tar/gzipの日時/ownerは固定し、内容byteと区別する。

|archive|内容|member数|元byte合計|圧縮bytes|
|---|---|---:|---:|---:|
|[long-date-raw.tar.gz](evidence/long-date-raw.tar.gz)|longのrows12/report/固有gate・binding・prepared/closure追補/独立監査。PNGは別添|35|32,488,668|513,678|
|[natural-evidence.tar.gz](evidence/natural-evidence.tar.gz)|primary/pilot/旧新repeat/layoutのreport/case/実行receipt/closure/使用helpers/監査/全45原PNG|194|37,629,092|9,672,703|

[long member/SHA/検証](evidence/long-date-raw-manifest.json) / [natural member/SHA/検証](evidence/natural-evidence-manifest.json)。原source絶対pathとarchive relative pathを両方保持する。検証用展開物はpackage外のreport-prep内に残し、配布しない。

第三者は新しい空ディレクトリへ `tar -xzf evidence/long-date-raw.tar.gz -C <空ディレクトリ>` と `tar -xzf evidence/natural-evidence.tar.gz -C <別の空ディレクトリ>` で展開できる。manifestの各member SHA256を照合し、longの12rows全行またはnaturalの全caseを再集計できる。これは保存記録の復元手順であり、ゲームやbrowserを自動起動しない。

取得した原PNGはprimary4＋pilot1＋repeat20＋layout20＝natural45、long15、計60記録。directはprimary4＋repeat代表旧新2＋layout旧新20＋long15＝41書き出し。archiveとdirectの重複や同byte画像を試行・写真取得数へ追加しない。独立実見の範囲は各notesに残し、repeatは旧3unique/新2uniqueの実見＋同byte対応、layoutは20原path/18uniqueの実見、longは15原画像全実見と区別する。

固定したテストログはtests/へ別収録。新test v1失敗、v2旧RED/新GREEN、既存baseline失敗、pytestbefore/after127をそのまま残す。完了したexisting-afterの実exit/閉鎖/全文stderrをtests/へ追加し、前後各107終端を保存ログから独立再集計した。static reviewの原ファイルも直接添付した。原レビューに残るafter未完了表現は当時の履歴で、最終結果はresultsと前後ログに記載する。sourceattachmentsと全文index-beforeは収録しない。旧report-prep6ファイル・原記録は不変。R145を含めない。

元の準備READMEやreviewに含まれる未実行/PENDINGの文言は、それぞれの作成時点の記録として原byteのまま保持する。packageの現在の確定状況はREADME/resultsを参照する。

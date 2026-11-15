# R145 表示fixture run-01：停止した1件の監査

actual outer/child exitは1（root receipt、635daa）。旧320×568のcase01だけが記録され、受理された観測0、残り9はNOTRUN。原PNGは存在する1/1枚を実見した。10枚完了・5サイズ比較・新旧改善とは扱わない。

入力commandは0、trusted eventは0だが、navigation後およそ1110/1110.9msにnon-trusted clickが2件記録され、`Unexpected input event recorded` で停止した。発火したコードの特定は別担当の調査であり、本監査では原因を断定しない。

原画像では人物先行の名前が「観光ボランティアガイドさん…」と省略され、地名は読めない。915mは読める。案内は270×33.5、名前は188.984375×19.5、13px/19.5pxの1行。DOM全文は28 codepointsだが、Rangeの内側14字をpaint可視字数とはしない。写真前後の案内・名前・距離の記録値に差なし。

傾き案内と下部5タブ、計6ボタンを写真前後の12診断観測で確認し、画面外0・中心hit失敗0。見出しとbuttonの矩形交差は両方[]。原写真のたからばこtoastは案内の上にあり、案内文字の遮蔽はこの写真では見られない。これは全操作域や12回の実タップの検査ではない。

実応答はrouteされた旧min/game.js（45f4ba7b…）、helper source SHAも期待916bc62c…と一致。サーバ本体の新minと混同しない。実renderへのguide注入fixtureで、距離DOMの置換は記録されていない。表示915mをcastle-guideへの自然な到達距離とみなさない。

元guide参照を復元し、記録されたstateの復元後差分は[]、元snapshotとも同じ。context/browser closed=true、root liveBrowsers=[]、前後source gate通過、root clean=true。画像・JSON・終了receiptのSHAをaudit.jsonに結んだ。

自然試行のUNKNOWNと対象6件の母数は変更しない。新fixtureが実行されてもこの失敗記録を置き換えず、別記録で扱う。本担当のbrowser・Node・製品parse・テスト・HTTP・Git・製品編集は0。

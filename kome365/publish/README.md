# 米づくり365 を Mac から公開する手順（クラウドの改善ループで直した分）

クラウドでは直して確かめるところまで行い、本番（さくらの FTP）への公開は Mac で行う。
周回ごとに `kome365-周回番号.patch` を置く。中身は Mac の作業元 `game/index.html` にそのまま当たる形。

## 周回93（小さい画面と横向きで、選ぶ部分を画面内に収める）

- 直したのは index.html の CSS 7行だけ。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5（engine.js の読みこみ先を本番用にした後）：`dc4118e2e2a1fd11120bc805c551dca9`
- 公開前の本番の md5（手順1で照合する）：`1e507ebee18d6435bea680a51e035684`

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回93を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-93.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が dc4118e2e2a1fd11120bc805c551dca9 になることを確かめる。手順1の照合は 1e507ebee18d6435bea680a51e035684。終わったら STATE に「周回93」を記録。
```

当たらないとき（Mac の作業元が周回92から変わっていたとき）は、パッチの `+` の7行を、`game/index.html` の `<style>` の最後（`</style>` の直前）に足せばよい。

確かめ（クラウドで実施済み）：本物の PointerEvent で9画面×365枚をめくって失敗0、選ぶ部分が画面の外に出たのは0枚。「?」も開く。
未確認：iPhone・Android の実機、iOS 16 未満（`:has()`・`overflow:clip` が効かないときは今までの表示のまま）。

## 周回94（横向きの節目カードで、ちょうちん・花火の段を出さない）

- 直したのは index.html の CSS 1行だけ（周回93のパッチの上に当たる）。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5：`1af30d4dafbcdd616d0e2d6ec8405590`
- 公開前の本番の md5（手順1で照合する。周回93の公開後）：`dc4118e2e2a1fd11120bc805c551dca9`
- 周回93がまだ公開されていないときは、先に kome365-93.patch、続けて kome365-94.patch を当てる（クラウドで、周回92の Mac 形に 93→94 の順で当てて md5 が上と一致することを確かめた）

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回94を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-94.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる。周回93が未適用なら先に kome365-93.patch）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が 1af30d4dafbcdd616d0e2d6ec8405590 になることを確かめる。手順1の照合は dc4118e2e2a1fd11120bc805c551dca9。終わったら STATE に「周回94」を記録。
```

当たらないときは、パッチの `+` の1行を、`game/index.html` の `@media (max-height:440px) and (min-width:660px)` の行の直前に足せばよい。

確かめ（クラウドで実施済み）：本物の PointerEvent で9画面×365枚をめくって失敗0、選ぶ部分が画面の外0枚、ページが画面より高い0枚。
未確認：iPhone・Android の実機の横向き。

## 周回95（冬の最初の1分に、次の節目までの「114日」を出さない）

- 直したのは index.html の JS 1か所（次の節目が60日より先なら日数を出さない）。周回94のパッチの上に当たる。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5：`2f8e62c71976fad5422908d82e753b66`
- 公開前の本番の md5（手順1で照合する。周回94の公開後）：`1af30d4dafbcdd616d0e2d6ec8405590`
- 93・94 がまだなら 93→94→95 の順に当てる（クラウドで周回92の Mac 形に順に当て、md5 が上と一致することを確かめた）

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回95を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-95.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる。周回93・94が未適用なら先に kome365-93.patch・kome365-94.patch の順で）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が 2f8e62c71976fad5422908d82e753b66 になることを確かめる。手順1の照合は 1af30d4dafbcdd616d0e2d6ec8405590。終わったら STATE に「周回95」を記録。
```

当たらないときは、`game/index.html` の `if (mi) { pixMileSet(` を `if (mi && mi.days <= 60) { pixMileSet(` に書きかえればよい（1か所）。

確かめ（クラウドで実施済み）：日数が出るカード 365→204枚（変わったのは1月1日〜2月23日だけ）。9画面×365枚を本物の PointerEvent でめくって失敗0・選ぶ部分が画面外0枚。
未確認：iPhone・Android の実機。

## 周回96（拡大表示＝幅300px以下で、横スクロールと字に重なる飾りをなくす）

- 直したのは index.html の CSS 1行だけ（周回95のパッチの上に当たる）。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5：`ad79d1dd8c3c8e2cba1ef296dfdbcd79`
- 公開前の本番の md5（手順1で照合する。周回95の公開後）：`2f8e62c71976fad5422908d82e753b66`
- 93〜95 がまだなら 93→94→95→96 の順に当てる（クラウドで周回92の Mac 形に順に当て、md5 が上と一致することを確かめた）

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回96を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-96.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる。周回93〜95が未適用なら先に kome365-93.patch・94・95 の順で）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が ad79d1dd8c3c8e2cba1ef296dfdbcd79 になることを確かめる。手順1の照合は 2f8e62c71976fad5422908d82e753b66。終わったら STATE に「周回96」を記録。
```

当たらないときは、パッチの `+` の1行を、`game/index.html` の `@media (max-height:440px) and (min-width:660px)` の行の直前に足せばよい。

店主に見てほしいこと（変えていない）：本番は index.html などを圧縮せずに送っている（`Accept-Encoding: gzip` でも content-encoding なし）。遅い回線（400kbps）では、はじめての人がタイトルだけの画面を約17秒見る。さくらで .htaccess に圧縮（mod_deflate）を足すかどうかは店主の判断。

確かめ（クラウドで実施済み）：9画面×365枚を本物の PointerEvent でめくって失敗0・選ぶ部分が画面外0枚（周回95と同じ）。幅195・240・260pxで横スクロールなし。
未確認：iPhone・Android の実機、Android の文字だけ200%の設定。

## 周回97（あしたの空が今日と同じなら、あしたの丸を出さない）

- 直したのは index.html の JS 1か所（`awe.style.display = ''` を `ak2 === skyWxInfo.key ? 'none' : ''` に）。周回96のパッチの上に当たる。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5：`277a75a67535a6b86dccde0ed257e9d6`
- 公開前の本番の md5（手順1で照合する。周回96の公開後）：`ad79d1dd8c3c8e2cba1ef296dfdbcd79`
- 93〜96 がまだなら 93→94→95→96→97 の順に当てる（クラウドで周回92の Mac 形に順に当て、md5 が上と一致することを確かめた）

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回97を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-97.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる。周回93〜96が未適用なら先に kome365-93.patch・94・95・96 の順で）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が 277a75a67535a6b86dccde0ed257e9d6 になることを確かめる。手順1の照合は ad79d1dd8c3c8e2cba1ef296dfdbcd79。終わったら STATE に「周回97」を記録。
```

当たらないときは、`game/index.html` の `awe.setAttribute('data-wx', ak2); awe.style.display = '';` の `''` を `ak2 === skyWxInfo.key ? 'none' : ''` に書きかえればよい（1か所）。

確かめ（クラウドで実施済み）：9画面×365枚を本物の PointerEvent でめくって失敗0・選ぶ部分が画面外0枚・今日と同じ絵のあしたの丸0枚。
未確認：iPhone・Android の実機。

## 周回98（種まき前の冬は、顔の「💧」の催促を出さない）

- 直したのは index.html の JS 2か所（`md.need = md.min < 0.3 ?` と `mdp.need = mdp.min < 0.3 ?` に `&& f.sowDoy` を足す）。周回97のパッチの上に当たる。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5：`2fc72c43a3957da0b0d81237d747ed36`
- 公開前の本番の md5（手順1で照合する。周回97の公開後）：`277a75a67535a6b86dccde0ed257e9d6`
- 93〜97 がまだなら 93→94→95→96→97→98 の順に当てる（クラウドで周回92の Mac 形に順に当て、md5 が上と一致することを確かめた）

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回98を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-98.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる。周回93〜97が未適用なら先に kome365-93.patch から順に）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が 2fc72c43a3957da0b0d81237d747ed36 になることを確かめる。手順1の照合は 277a75a67535a6b86dccde0ed257e9d6。終わったら STATE に「周回98」を記録。
```

当たらないときは、`game/index.html` の `md.need = md.min < 0.3 ?` を `md.need = md.min < 0.3 && f.sowDoy ?` に、`mdp.need = mdp.min < 0.3 ?` を `mdp.need = mdp.min < 0.3 && f.sowDoy ?` に書きかえればよい（2か所）。

確かめ（クラウドで実施済み）：390×844 の1年分で、種まき前の催促の印 48→0枚。9画面×365枚は kome365/README.md の周回98を見る。
未確認：iPhone・Android の実機。

## 周回99（最初の3枚のカードの揺れをやめる。◀ ▶ の案内は残す）

- 直したのは index.html の JS 1か所（`el.card.classList.add('hinting', 'wig')` を `el.card.classList.add('hinting')` に）。周回98のパッチの上に当たる。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5：`b13aa634093ae5985aa0fa4f4ae3d0af`
- 公開前の本番の md5（手順1で照合する。周回98の公開後）：`2fc72c43a3957da0b0d81237d747ed36`
- 93〜98 がまだなら 93 から順に 99 まで当てる（クラウドで周回92の Mac 形に順に当て、md5 が上と一致することを確かめた）

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回99を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-99.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる。周回93〜98が未適用なら先に kome365-93.patch から順に）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が b13aa634093ae5985aa0fa4f4ae3d0af になることを確かめる。手順1の照合は 2fc72c43a3957da0b0d81237d747ed36。終わったら STATE に「周回99」を記録。
```

当たらないときは、`game/index.html` の `el.card.classList.add('hinting', 'wig');` を `el.card.classList.add('hinting');` に書きかえればよい（1か所）。

確かめ（クラウドで実施済み）：最初の3枚の揺れ 3→0枚、◀ ▶ の案内は3枚のまま。9画面×365枚は kome365/README.md の周回99を見る。
未確認：iPhone・Android の実機。

## 周回100（めくったあとの波紋を小さくし、スマホで画面が一瞬縮むのをやめる）

- 直したのは index.html の CSS 1か所（`@keyframes swRpRing` の最後の `scale(2.6)` を `scale(1.7)` に）。周回99のパッチの上に当たる。engine.js・field3d.js は触っていない
- 公開後の本番 index.html の md5：`20b922ec9dc98de3b0632bc191a5b59a`
- 公開前の本番の md5（手順1で照合する。周回99の公開後）：`b13aa634093ae5985aa0fa4f4ae3d0af`
- 93〜99 がまだなら 93 から順に 100 まで当てる（クラウドで周回92の Mac 形に順に当て、md5 が上と一致することを確かめた）

Mac の Claude Code に頼む文（そのまま貼る）：

```
米づくり365 の周回100を公開して。shota0617/ricepia-new-project のブランチ claude/kome365-loop の kome365/publish/kome365-100.patch を muse_zip/kome365_rebuild/work の game/index.html に git apply で当て（--check で先に確かめる。周回93〜99が未適用なら先に kome365-93.patch から順に）、game/index.html だけをコミット。引き継ぎ書（HANDOFF）の「米365」の公開手順 1〜5 のとおりに組み立てて FTP で上げ、本番の md5 が 20b922ec9dc98de3b0632bc191a5b59a になることを確かめる。手順1の照合は b13aa634093ae5985aa0fa4f4ae3d0af。終わったら STATE に「周回100」を記録。
```

当たらないときは、`game/index.html` の `@keyframes swRpRing{...100%{opacity:0;transform:scale(2.6)}}` の `2.6` を `1.7` に書きかえればよい（1か所）。

確かめ（クラウドで実施済み）：縦7画面でめくるたびに起きていた縮み（6/6）が0/6に。9画面×365枚は kome365/README.md の周回100を見る。
未確認：iPhone・Android の実機。

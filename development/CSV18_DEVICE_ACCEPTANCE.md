# CSV18 — Pixel 7a 実機受入手順（2026-10-30）

この手順は **個体値ぶっこみスキャン → pokesleep-tool → 再エクスポート** の利用者による実機確認専用。合成GitHub CIが成功した事実で実機確認をPASSにしない。

## 事前条件

- Pixel 7a の Android Chromeで現行の [個体値ぶっこみスキャン](https://meka-create.github.io/pokesleep-scan/) を起動する。
- ミント使用済みで元性格が中立以外の個体と、ミント未使用個体をそれぞれ少なくとも1件選択する。手元にミント使用個体がない場合はミント検証を未実施と記録し、合格と判定しない。
- 実施前の画面で原本の性格、ミント使用マーク、食材・サブスキルを目視確認する。**CSV往復一致だけではOCR自体が正しかったか分からない**。
- ニックネームOCRが空欄になった場合、**pokesleep-toolは空欄のままインポートできる**。保存時の「ニックネーム空欄」確認ダイアログで意図を確認して続行するか、結果カードで実際の名前に修正・確定する。種族名への自動補完はしない。
- **要確認のないニックネームを修正する場合**、欄内を全選択・消去して新しい名前を入力したときも、CSVには最終入力値が保存される。要確認欄は従来どおり「確定」で保存する。入力画面で見えている文字とCSVが一致することを確認する。
- pokesleep-tool側の既存Boxを壊さない。別のChromeシークレットタブ等の隔離セッションで検証するか、事前にBoxをバックアップしたうえで既存Boxが混入しない方法を選ぶ。既存Boxの削除を前提にしない。

## 実機操作と保存物

1. 個体値ぶっこみスキャンで試験画像を解析し、要確認は必要に応じて確認する。元の性格が中立の個体に誤って「ミントあり」を確定させない。
2. 「CSVを保存」からインポート用ファイルを保存する。**正規CSVは18列**。10列目「まっしろミント」が使用`1`、未使用`0`、9列目がミント使用前の元性格、18列目「お気に入り」は空欄であることを確認する。
3. 最新版 [pokesleep-tool](https://nitoyon.github.io/pokesleep-tool/iv/index.ja.html) のBoxへこのCSVを実際に取り込む。警告があれば内容・対象行を記録し、未確認をPASS扱いしない。
4. 同じBoxからCSVを再エクスポートし、出力ファイルを別名で保存する。**試験対象以外の既存Box個体が混ざっていないことを確認する**。
5. 2ファイル（スキャンの元CSV、pokesleep-toolの再エクスポートCSV）を比較する。直接この会話に2ファイルを添付するか、ローカルのPython 3で次のコマンドを実行する。

```powershell
py -3 development/csv18_roundtrip_acceptance.py --scan "SCAN.csv" --returned "BOX.csv" --require-both-mint-states
```

既存のBoxに他の個体が含まれる場合は `--allow-extra-box-rows` を付ける。**スキャン側の全行がBox内に完全一致で存在するか**を検証し、無関係な既存行は一致判定から除く。ただし既存行が以前から変わっていないかは証明できない。

```powershell
py -3 development/csv18_roundtrip_acceptance.py --scan "SCAN.csv" --returned "BOX.csv" --allow-extra-box-rows
```

`--require-both-mint-states` はスキャン側に使用と未使用の両方があるときだけ指定する。Box内の既存の未使用個体を、今回スキャンした個体として数えない。

検証スクリプトはGitHubリポジトリの `development/` 内にある。データを外部送信せず、結果には個体名やCSV値を出さず、件数と項目番号のみ報告する。

## 合格条件

- 18列ヘッダー、全行列数、9列目元性格、10列目ミント、18列目お気に入りが正しい。
- 同じ対象個体だけなら `logicalRowsIdentical: true`。既存のBox個体がある場合は `--allow-extra-box-rows` で `sourceRowsPresentUnmodified: true` と `matchingLogicalCells = 対象個体数 × 18`、`result: PASS` を確認する。
- ミント使用個体のみの実測PASSは、未使用個体の**新規スキャン**まで合格したことにはならない。
- 再エクスポートで個体が増減しない。行順・CSV末尾改行だけの差はデータ差として扱わない。
- 画像と照合してOCR／ミント検出を目視確認し、pokesleep-tool側で警告・欠損がないことを確認する。
- 未実施、値差分、ミントあり・なしのどちらか欠落、警告、実機での操作不備は **HOLD**。CI成功や推定で合格にしない。

## 開発との切り分け

- 過去の16列CSVと診断用19列は**歴史的データ**。現在の正規インポートCSVは18列、診断用生OCR CSVは21列。
- 旧16/19形式の歴史的検証は `development/final_evidence_gate.py` が判別可能。新旧混在は拒否する。
- 142枚の正解照合は `development/step2_meka142_benchmark.py` の非ニックネーム16評価項目で実施。**CSV列数18とは別**。
- ユーザーのスクリーンショット・Golden・実CSV・診断データを公開GitHub／GitHub Actionsに置かない。

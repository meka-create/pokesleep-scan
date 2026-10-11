# 個体値ぶっこみスキャン — STEP 2 実装・引き継ぎ

## 実装範囲

STEP1で凍結したCandidate125 Runtimeを引き継ぎ、OCR版の開発ブランチだけで共通マスター選択・CSV検証・一意名保存を実装。

- 開発ブランチ: `revival/step2-shared-master-csv-20261012`
- 正式ベースライン: Candidate124（Full Dev ZIPは未回収）
- Runtime開発出発点: Candidate125 暫定版
- AI参照: `meka-create/pokesleep-ai-scan` のコミット `c2c4761629783fb329e60b0ab237c6fc6e2448c9`
- マスターSHA-256: `d60410ba1f92d80c67ca3ff40bc8aa7a2cd51d4c03fc33f9e99fa83bb8e77a38`

## 1. AI版とのマスター共有

`shared/MASTER_DATA.json` はAI v27の該当ファイルを改変せず格納。GitHub Actionsが元ファイルとバイト単位で比較。

ブラウザでは次の順で読み込む。

1. `master_data.js` で旧249種データを準備（フォールバックのため保持）
2. `shared_master.js` でローカルのAIマスターコピーをfetch
3. Web Crypto SHA-256と249種・19食材・25性格・17サブスキル、cutoffを検証
4. **STEP2では旧マスターと分類器入力に差がないことも確認**（更新時の互換性は未検証）
5. 正常なら `window.POKESLEEP_MASTER` を更新
6. その後に既存 `classifier.js` を読み込む

検証失敗時は旧マスターのまま継続し、理由は `window.POKESLEEP_SHARED_MASTER.getStatus()` で確認。元画像データはマスター取得処理に送信しない。

**現時点ではAI版のマスター更新を自動反映しない。** STEP4で、AI側で正式採用されたマスターの更新候補生成・互換性ゲート・HOLDを実装する。旧版と食材・種族・数式に差が出た場合は無条件反映しない。

## 2. CSV16列と保存

元のCSV出力確認ダイアログ・未確定項目確認を温存し、さらに `csv_gate.js` が以下を実施する。

- ヘッダー16列・列数・LF・引用符とカンマの往復検証
- ニックネーム未設定・制御文字・改行の排除
- 種族、レベル1～100、スキルレベル1～10、性格の存在チェック
- 食材1～3の種族別スロット照合（ミュウ・ダークライの特例を含む）
- ミュウの具体スキル、一般種族のメインスキル一致
- サブスキル辞書・重複、色違い0/1、睡眠時間の指定段階
- ストリンダーのハイ／ローと性格の既知のImporter不一致を遮断

サブスキル未確定は従来UIの確認フローを残しつつ、検証器では警告として扱う。これはAI版の証拠付き厳格ゲートと同等ではない。実Importer往復試験も未実施なので、**現時点でImporter完全互換は宣言しない**。

CSV保存とCSVコピーの両方で、出力直前に検証を実施。検証失敗の場合はダウンロードもコピーも停止する。

保存名: `pokesleep_ocr_integrated_v12_YYYYMMDD_HHMM.csv`。同じ分で2件目は `_2.csv`、3件目は `_3.csv`。ブラウザのWeb LocksとlocalStorageで同一オリジン内の予約を保護。Web Locksがない環境はbest-effortのlocalStorageカウンター。

**ブラウザはOSの保存処理を直接制御できない。** 別ブラウザやストレージ削除後なども含めて完全なファイルシステムレベルの非上書き保証とは言えない。既存保存ファイルの扱いはブラウザ／OSの設定に従う。

## 3. 動かす・検証する

開発ブランチをGitHubから取得したら、PythonとNode.jsで確認する。

```bash
python development/verify_step2.py
node --test development/runtime_smoke.test.cjs
node --test development/step2_shared_csv.test.cjs
python development/start_local.py
```

Windowsでは `start_server.bat` を利用可能。サーバーは `http://127.0.0.1:8000/`。

GitHub Actions: `.github/workflows/revival-step2-master-csv.yml`

- OCRの未改変中核を候補元のコミットと比較
- AIマスター原本のバイト一致
- 静的構造・Nodeテスト・実Chromiumのブラウザ起動、異常値停止
- 読み取り専用で本番へのデプロイはしない

## 4. 明確に残す範囲

- 172枚画像のOCR精度回帰、Android/iPhone実機試験
- 正式Candidate124 Full Devと旧Regression Runnerの回収
- pokesleep-toolへの実CSV Import/Export往復
- AI版の将来マスターを自動でOCRへ移す仕組み（STEP4）
- 実ブラウザでのフル画像解析（Chromium UI試験のTesseract読込はスタブ）
- `.nojekyll` の元Manifest差異とmainの保護ルール設定

## 5. 監査と次工程

STEP2の完了判定は **GitHub ActionsのSTEP2最終コミットがSUCCESS** であること、main変更ゼロ、検証できたものと未検証を区別したレポート提出で判断する。

STEP2完了後はユーザーの独立監査指示を待ち、修正が必要なら同一会話で行う。ユーザー監査PASS後にSTEP3（OCRとWeb UIリメイク）へ進む。

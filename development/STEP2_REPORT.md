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

監査修正により、**通常種族のサブスキル未確定はCSV出力前にブロック**する。伝説・幻など、ゲーム仕様上の空欄があり得る特殊種族は元の確認フローの範囲内で警告のままとする。これはAI版の証拠付き厳格ゲートと同等ではない。実Importer往復試験も未実施なので、**現時点でImporter完全互換は宣言しない**。

CSV保存とCSVコピーの両方で、出力直前に検証を実施。検証失敗の場合はダウンロードもコピーも停止する。

保存名: `pokesleep_ocr_integrated_v12_YYYYMMDD_HHMM.csv`。同じ分で2件目は `_2.csv`、3件目は `_3.csv`。ブラウザのWeb LocksとlocalStorageで同一オリジン内の予約を保護。Web Locksがない環境はbest-effortのlocalStorageカウンター。同じ分に戻る時計調整も見越して、最大4096分の分別連番履歴を保存する。localStorage不可の場合は同一画面内メモリで採番を継続。

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

## 4. STEP2独立監査の確定事項・修正記録（2026-10-12）

初回のSTEP2 GitHub Actions SUCCESSは、実ブラウザでのCSVダウンロード・診断出力、PWA再訪、全種族の正常データ生成を保証していなかった。ユーザー指示による厳密監査で以下を独立に確認・修正した。

1. **診断CSV/JSONの先祖返りを修復**: 通常CSVの秒付き日時関数削除時に、診断CSVと診断JSONが未定義関数を参照していた。診断出力専用の時分単位日時関数を新設し、単体テスト・実ブラウザで検査した。
2. **睡眠時間の架空の実測値を防止**: Candidate125のリボン段階からの閾値推定（200/500/1000/2000時間）は正確な実睡眠時間ではない。CSVの未観測値はAI v27のユーザー方針に合わせて0に統一。ブラウザ実ダウンロードで0を確認。
3. **通常種族の未確定サブスキルを阻止**: 未確定枠を空欄で出せるルートを検出。通常種族の出力前UI確認とCSV検証器の両方で停止する。ミュウ・ダークライ等の空欄は既存の処遇確認と警告を維持。AI版ほどのユーザー確認証跡は持たない。
4. **画面スキル表記とImporter正式表記を揃える**: ランダム版「エナジーチャージS」「ゆめのかけらゲットS」およびライコウ等の「おてつだいブースト」の表記を種族確定後の正式ラベルに変換。元のspecies classifierとそのmainSkillMatchesは変更なし。
5. **PWAキャッシュの先祖返り防止**: STEP2用モジュールと共有マスターをService Workerのキャッシュ対象に加え、候補元Candidate125と異なるSTEP2専用cacheKeyとqueryを設けた。実ChromiumでService Workerのキャッシュを確認。
6. **共有マスターの応答負荷・タイムアウト**: fetchヘッダー受信だけではなくbody取得にもAbortSignalが作用するようにし、8秒・最大1MiBの安全な上限を設置。内容のSHA検証とLegacy fallbackを維持。破損JSONを実Chromiumに与えても分類器は起動。
7. **連番履歴の衝突対策**: 分をまたいで時計が戻った場合、同じ時分の初回ファイル名を再発行し得る点を修正。分ごとの履歴を最大4096件保持し、同一画面のストレージ不許可時もカウンターを保持する。さらに**通常CSV・解析前診断CSV・診断JSONごとに独立した連番**を使用し、診断ファイルも連続保存で同一ファイル名を再利用しないよう修正した。
8. **追加回帰**: 249種それぞれで既存の分類器から正常な食材プロファイルを選び、16列CSVを合計249行作って全行の採否を検証。実ChromiumでBlobを2回保存し、16列/引用符/睡眠時間0/同一時分の異名をチェック。不正CSVの出力阻止を検証。

これらの変更は **OCRの既存分類器・食材照合器・既存master_data.jsを修正していない**。実際の172枚のOCRテスト、Android/iPhone、実Importer往復は未実施のまま。

### 判定に関する注意

- CIはSTEP2機能と実ブラウザ出力、構文、固定マスターの検証であり、画像から実際に読み取るOCRの正確性を証明するものではない。
- PWAの実ブラウザテストはTesseract CDNをモックしており、OCRモデルのダウンロード/解析は未テスト。
- localStorage削除、異なるブラウザ/デバイスでの保存、ブラウザ/OSの既存ファイル上書き動作は保証対象外。
- 旧release.jsonをSTEP2用に更新していない（本番誤反映防止のため、開発ブランチ限定）。独立した本番リリースには別途バージョン更新・公開前監査が必要。
- 旧GitHub mainには直接反映していない。正式Candidate124 Full Devは未回収。

## 5. 明確に残す範囲

- 172枚画像のOCR精度回帰、Android/iPhone実機試験
- 正式Candidate124 Full Devと旧Regression Runnerの回収
- pokesleep-toolへの実CSV Import/Export往復
- AI版の将来マスターを自動でOCRへ移す仕組み（STEP4）
- 実ブラウザでのフル画像解析（Chromium UI試験のTesseract読込はスタブ）
- `.nojekyll` の元Manifest差異とmainの保護ルール設定

## 6. 監査と次工程

STEP2の完了判定は **GitHub ActionsのSTEP2最終コミットがSUCCESS** であること、main変更ゼロ、検証できたものと未検証を区別したレポート提出で判断する。

STEP2完了後はユーザーの独立監査指示を待ち、修正が必要なら同一会話で行う。ユーザー監査PASS後にSTEP3（OCRとWeb UIリメイク）へ進む。

# STEP 1 復元・開発基盤整備レポート

## 1. 一次ソースから確認した状態

| 対象 | 内容 |
| --- | --- |
| 旧OCRリポジトリ | meka-create/pokesleep-scan |
| 実行コード | app.js, classifier.js, food_matcher.js, food_color_features.js, master_data.js, index.html, sw.js 等 |
| 公開Runtime | e64beae03a27a36e5c3de492d3b50b070e39fff8 / Candidate125 暫定 |
| 正式開発基準 | Candidate124（元Full Dev ZIP未回収） |
| Candidate125実機検証 | IPHONE_ANDROID_PRIORITY_CORPUS_GATE_PENDING |
| Candidate124の過去参考値 | iPhone 137/172、Android 129/172（今回の測定値ではない） |
| OCRマスター | 249種、19食材、25性格、17サブスキル |
| AI版比較元 | pokesleep-ai-scan c2c4761629783fb329e60b0ab237c6fc6e2448c9 |
| AI版マスターSHA-256（生バイト） | d60410ba1f92d80c67ca3ff40bc8aa7a2cd51d4c03fc33f9e99fa83bb8e77a38 |
| データ比較 | OCRの5項目とAI v27の5項目がJSON構造で完全一致 |
| 公開用manifest差異 | .nojekyllは一覧にあるがGitツリーにない |

公開用リポジトリはFull Devではない。GitHub上で実行コードを確認できても、以前のRunner、開発ツール、172枚の画像群を復元済みと誤認しない。

## 2. 今回追加したファイル

- development/BASELINE_LOCK.json : 出所と既存ハッシュ、隔離状態の固定
- development/verify_baseline.py : SHA、リリース区分、マスター、16列契約のスモーク
- development/runtime_smoke.test.cjs : Node組込テストによる分類器内部整合
- development/start_local.py : Python標準ライブラリのみで動くHTTPサーバー
- development/START_HERE.md : 実行と復旧の手順
- .github/workflows/revival-step1-smoke.yml : 開発ブランチ専用、読取専用CI（監査で強化）
- development/browser_boot_smoke.py : 実Chromium UI起動と画像選択の簡易検査（Tesseractはスタブ）
- development/test_verifier_negative.py : 元ファイルや識別情報が変化した場合のFAIL検証
- start_server.bat : Windowsのローカル起動用（開発ブランチのみ）

OCRエンジン、分類器、UI、マスター、CSV出力仕様、公開main、AI版リポジトリに変更なし。

## 3. 最小検証と限界

独立監査では、ハッシュ・構文・代表的な分類器処理・AI版マスター一致に加え、改ざん・候補昇格を拒否する逆方向テスト、および実Chromiumの起動と画像選択の簡易試験を加えた。ブラウザ試験はTesseractのネットワーク読み込みのみをスタブに置き換えるため、実OCRのエンジン・認識精度・モデル配布の検証ではない。スモークの合格は実機・Importerの保証ではない。

CI結果はGitHub Actionsのartifactに保存。エラーがあればSTEP2に進まない。安全確認と独立監査は別工程。

## 4. 独立監査で見つかった問題と対応

1. **検証器の固定情報チェック不足（修正）**: ベースラインコミット、AI参照コミット、AIマスターSHA、暫定リリースID、Formal Baselineの固定チェックを追加。Manifestのパス重複・追加削除・危険なパスも拒否する。
2. **検証器自体の負のテスト欠如（修正）**: app.js改変、classifier.js削除、Candidate125を正式扱いへ昇格、Formal Baseline変更、AIマスター混入を用いたFAIL確認を実装。
3. **ブラウザ起動確認なし（修正）**: ChromiumでHTTP起動、HTMLからのRuntime読み込み、誤形式ファイルの拒否、PNG選択と解析前CSV非活性のスモークを追加。ただし本物のOCRは未実施。
4. **Windows起動用バッチ欠落（開発用に補充）**: start_server.batを開発ブランチだけに追加。元の公開mainの不一致は保留。
5. **.nojekyll欠落と成功表示の誤解の余地（表示改善）**: PASS_WITH_WARNINGSのまま実CIを通し、workflow warningとSummaryで既知欠落を必ず顕在化。
6. **画像認識精度・iPhone/Android回帰なし（未解消）**: 画像コーパスと旧Full Dev ZIPを未回収。今後の専用ゲートが必要。
7. **外部Tesseract CDNの初期依存（既存制約）**: CDN不達なら元のindex.htmlでRuntimeロードを開始しない。OCRのオフライン完結性や外部依存除去はSTEP3の設計課題。STEP1では元コードを変更しない。

## 5. 旧開発資料の未回収リスト

1. Candidate124_FINAL_HANDOFF.zip
2. candidate124_device_regression_runner_v1_FILENAME_FIXED_NO_IMAGES.zip
3. Candidate125_RETURN_BUNDLE.zip
4. 172枚の画像コーパスとGoldenラベル

以前の別会話で示されたsandboxパスは、この作業環境に実ファイルが存在することの証拠ではない。取得するまで未回収として扱う。

## 6. STEP1監査の確認点

- GitHub mainへの変更がない
- 専用ブランチのRuntimeが親コミットから変わっていない
- チェックポイント互換IDとCandidate125暫定フラグが保たれている
- .nojekyllの不一致が隠されていない
- 249種マスター一致とCI結果が証跡と一致
- OCR・CSV・UIの機能改修を先行していない

## 7. 次STEPへの引き継ぎ

正式ベースラインCandidate124を保護し、Candidate125 Runtimeを暫定の開発開始点とする。STEP2ではまずマスター取得アダプターとCSV検証基盤を独立した変更として実装。元の種族推定やCSV出力仕様に対して比較する。未検証のマスターを本番へ昇格させない。

ユーザーの独立監査指示があるまでSTEP2は開始しない。

監査後の最終CIコミット・実行URLはGitHub Actionsの開発ブランチ履歴で確認する。PASS済みであっても手元に存在しないFull Devアーカイブ・172枚の正解画像の取得は記録済み未完了とする。

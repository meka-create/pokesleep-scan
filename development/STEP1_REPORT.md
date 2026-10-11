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
- .github/workflows/revival-step1-smoke.yml : 開発ブランチ専用、読取専用CI

OCRエンジン、分類器、UI、マスター、CSV出力仕様、公開main、AI版リポジトリに変更なし。

## 3. 最小検証と限界

通常STEPでは、ハッシュ・構文・代表的な分類器処理・AI版マスターの一致に絞る。スモークテスト合格は認識精度、端末対応、Importer互換性の保証ではない。

CI結果はGitHub Actionsのartifactに保存。エラーがあればSTEP2に進まない。安全確認と独立監査は別工程。

## 4. 旧開発資料の未回収リスト

1. Candidate124_FINAL_HANDOFF.zip
2. candidate124_device_regression_runner_v1_FILENAME_FIXED_NO_IMAGES.zip
3. Candidate125_RETURN_BUNDLE.zip
4. 172枚の画像コーパスとGoldenラベル

以前の別会話で示されたsandboxパスは、この作業環境に実ファイルが存在することの証拠ではない。取得するまで未回収として扱う。

## 5. STEP1監査の確認点

- GitHub mainへの変更がない
- 専用ブランチのRuntimeが親コミットから変わっていない
- チェックポイント互換IDとCandidate125暫定フラグが保たれている
- .nojekyllの不一致が隠されていない
- 249種マスター一致とCI結果が証跡と一致
- OCR・CSV・UIの機能改修を先行していない

## 6. 次STEPへの引き継ぎ

正式ベースラインCandidate124を保護し、Candidate125 Runtimeを暫定の開発開始点とする。STEP2ではまずマスター取得アダプターとCSV検証基盤を独立した変更として実装。元の種族推定やCSV出力仕様に対して比較する。未検証のマスターを本番へ昇格させない。

ユーザーの独立監査指示があるまでSTEP2は開始しない。

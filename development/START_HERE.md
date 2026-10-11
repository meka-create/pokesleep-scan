# 個体値ぶっこみスキャン — STEP 1 開発再開ガイド

## まず確認

- 元の本番リポジトリ: https://github.com/meka-create/pokesleep-scan
- 隔離した開発ブランチ: revival/step1-dev-baseline-20261011
- ブランチの親コミット: Candidate125 / e64beae03a27a36e5c3de492d3b50b070e39fff8
- 正式ベースライン: Candidate124（元Full Dev ZIPは未回収）
- 開発ブランチはSTEP1の作業用基盤。Candidate126、正式版、精度改善済みなどと呼ばない。
- AIぶっこみスキャンv27の本番mainやOCR版のmainを変更しない。

## ローカル開始

GitHubの開発ブランチを Code > Download ZIP で取得、または以下を実行:

~~~bash
git clone --branch revival/step1-dev-baseline-20261011 --single-branch https://github.com/meka-create/pokesleep-scan.git
cd pokesleep-scan
python development/verify_baseline.py
node --check app.js
node --check classifier.js
node --test development/runtime_smoke.test.cjs
python development/start_local.py
~~~

ブラウザで http://127.0.0.1:8000/ を開く。OCRモデル読込にはネットワークが必要な場合がある。画像コーパスはこのリポジトリに追加しない。

## AI版マスターとの完全一致の再検証（任意）

AI版の指定コミット c2c4761629783fb329e60b0ab237c6fc6e2448c9 の release-kit-assets/MASTER_DATA.json を取得し、以下で確認:

~~~bash
python development/verify_baseline.py --ai-master /path/to/MASTER_DATA.json
~~~

AIマスターの生SHA-256を照合し、OCRマスター5項目のJSON構造が完全一致するか調べる。GitHub Actions側は固定URLから自動取得する。

## STEP1の範囲

- 既存Runtimeの実行ソースは一行も変更しない。
- development/ と専用CIに、基礎検証・実行手順・復元記録を追加する。
- CIはソースハッシュ、JavaScript構文、分類器の内部スモーク、AI版マスター一致だけを確認する。
- 172枚画像・Android/iPhone実機・実ブラウザE2E・実Importer検証は未実施。
- public_package_manifest.jsonに載る .nojekyll が実Git treeにない。既知の不一致として報告し、公開Runtimeを勝手に補修しない。
- Candidate124_FINAL_HANDOFF.zip、candidate124_device_regression_runner_v1_FILENAME_FIXED_NO_IMAGES.zip、Candidate125_RETURN_BUNDLE.zipは今回の作業環境から未回収。

## 指示された監査まで

STEP1完了時点で次のSTEP実装には進まず、ユーザーの独立監査指示を待つ。監査合格後にSTEP2（共通マスター・CSV基盤実装）へ移る。

詳細は development/STEP1_REPORT.md と development/BASELINE_LOCK.json。

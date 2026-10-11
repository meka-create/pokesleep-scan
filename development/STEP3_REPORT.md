# STEP 3 Android OCR・確認UI・PWA 引き継ぎ

## 作業ベース
OCR開発ブランチ: revival/step3-android-roi-review-20261012
STEP2監査済みベース: 6024eaa03147af63c6e3b5f643dd2ac2113e68de

既存classifier.js、food_matcher.js、food_color_features.js、master_data.js、CSV検証器は変更しない。本番mainには反映しない。

## Android 142枚の配置監査
- 添付meka142.zipの全142枚は1080×2400ピクセル。
- 緑色の大見出しバーを利用したレイアウト判定は142/142枚成立。
- 主な大見出しY座標パターン: (862,1875) 80枚 / (852,1864) 28枚 / (862,1902) 20枚。他の配置も判定成功。
- 添付画像そのものはGitHubへアップロードしない。
- **142/142はROIの位置決めの成否であり、OCR文字認識精度ではない。** 画像142枚の本格的な精度回帰はユーザー意向により実用開始後に行う。

## OCR読取処理
- android_roi.jsを追加。Canvasから主な緑見出しバーを検出して、Android専用の領域を適用する。
- SP / Lv・ニックネーム / おてつだい時間 / 所持数 / メインスキル / 5サブスキル / 性格を切り出し、従来OCRに渡す。
- 性格は詳細見出しバーからの相対位置で補正する。
- バーの位置・アスペクト比が合わない画像では既存の汎用処理へ戻す。
- UIのAndroid向け読取範囲をON/OFF可能。OFF時は旧クロップ。設定は端末内に保存し、解析中の変更は拒否する。
- 食材認識や種族判定ロジックは従来通りで、未確定を勝手に確定しない。

## 確認UI
- 要確認の画像枚数・未確定フィールド件数をリアルタイム表示。
- 「次の要確認へ」で未確定行へジャンプ。
- 結果は要確認を先頭に並べる。確認済み結果は勝手に非表示にせず、元の「要確認のみ」でフィルター可能。
- スマホ操作用のタッチ領域を拡大。
- 既存の元画像表示・修正・セッション復帰機能を維持。

## PWAとPixel maskableアイコン
- android_roi.jsをPWAキャッシュ対象に追加し、STEP3専用のキャッシュバージョンを使う。
- ユーザー提供の2件のアイコンZIPはバイト単位で同一。6 PNGのサイズを確認。
- maskable 192/512 PNGには不透明な背景があり、円形プレビューも確認した。
- development/install_pwa_icons.pyを追加。ユーザー提供のPNGを無加工で適用し、manifestのpurpose any/maskable、SWの事前キャッシュ、アイコンURLを同時更新できる。
- **PNG6点は開発ブランチに取込済み。** ユーザーがmainへ画像6枚をアップロードしたコミットは 5a115edc7dd9aa6304ef7f414a21d806c81159b6。6点のGit Blob SHAが添付ZIPと一致することを確認し、画像を無加工で開発ブランチへ転用。開発ブランチコミット b0dbf1109bb1269d6810fd9b66177eb314c09084 にてmaskable 192px/512pxのPWA manifestとService Workerキャッシュを同時に更新。公開mainは画像6枚のみが追加された状態で、mainのPWA manifestは未対応。公開反映は監査とリリース承認を待つ。
- Pixel側の既インストールPWAはOSがアイコンを保持し得るため、反映後に再インストールして確認する。

## 検証
- 142枚のAndroidレイアウトアンカー検出 142/142
- Node.jsのROIテスト、既存分類器・CSVテスト
- Chromium画面起動、Service Worker、マスター検証失敗時の復帰、CSV実ダウンロード
- Pixelアイコンインストーラーの合成PNGによるテスト

## アップロード後の実行証跡
- 原本ZIPとの6件のSHA-256一致、maskable PNGのRGB不透明性、Manifest purpose、PWAキャッシュ登録を development/verify_installed_pixel_icons.py で検証。
- 開発ブランチ取込: b0dbf1109bb1269d6810fd9b66177eb314c09084
- GitHub Actions: https://github.com/meka-create/pokesleep-scan/actions/runs/38155955682 (SUCCESS)
- Chromiumではmaskable manifest・Service Workerキャッシュ、共有マスター、既存CSV出力の動作確認もPASS。
- 本対応ではGitHub mainを変更していない。mainの6画像追加はユーザーによる手動アップロード。
- ZIP監視用workflowは指定ZIPを開発ブランチにpushした場合だけ実行。今回は個別PNGがmainへ追加されたため、原本照合後にGit Blobを開発ブランチへ安全に移植。

## 残作業
1. 実用時のAndroid OCR誤読の収集・改善（142枚Golden精度回帰は今回行わない）。
2. アイコンの開発ブランチへの反映と自動検証は完了。残りは配布サイトへの承認後リリース、Pixel実機の円形表示確認。
3. 本番リリース前の厳密独立監査、実Importer試験。
4. ユーザーの厳密監査指示があるまでSTEP4に進まない。

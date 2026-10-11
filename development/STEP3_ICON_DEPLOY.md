# STEP3 Pixel円形PWAアイコンの反映手順

提供ZIP2本は同一データ（SHA-256: 75489d34571d8b4ca522f9956c603e9434a3caa6b84142d7898ab997129ffdfa）。

**元の6 PNGはGitHubへまだ登録していません。** 以下の手順を実行すると、STEP3専用ブランチにだけ自動反映されます。mainには触れません。

1. https://github.com/meka-create/pokesleep-scan/tree/revival/step3-android-roi-review-20261012 を開く。
2. **必ずSTEP3開発ブランチが選択されていること**を確認する。
3. Add file → Upload files から、最初に提供された **icons-pwa-maskable-set.zip** を、リポジトリのルートにそのままアップロードする。名前を変更しない。
4. 「Commit directly to revival/step3-android-roi-review-20261012」を選ぶ。mainや本番への反映はしない。
5. GitHub Actionsの **STEP3 import exact Pixel maskable icon ZIP** を確認。SHA-256検証→PNG検証→manifest/SW/HTML更新→テスト→開発ブランチへのコミットを行う。
6. 正しく反映されたらmaskableの192/512 PNGがiconsディレクトリに現れ、manifestに purpose:maskable のエントリーが追加される。
7. Pixelでの円形表示は、STEP3開発版をHTTPS上に公開してからインストールして実機確認。既インストールPWAの古いアイコンはOS側で保持されるため、必要なら一度アンインストールしてインストールし直す。

ワークフローはユーザーが元ZIPをアップロードしたときだけ起動し、指定SHA-256と一致しないZIPを拒否します。ユーザー提供画像は再エンコードしません。

もしリポジトリ設定でGitHub Actionsの書込権限が無効なら、Actionsはコミット工程で失敗します。その場合は、開発ブランチをローカルに取得し、次を実行して画像・manifest・index.html・sw.jsをセットでpushしてください。

    python development/install_pwa_icons.py icons-pwa-maskable-set.zip

念のため、ChatGPTから返した step3_pixel_maskable_icon_bundle.zip に同じ6枚のPNGとmaskableのmanifestが入っています。単なるZIPダウンロードでは公開サイトは変わりません。

**実機Pixelのインストール画面と円形ホーム画面表示は、上記のアイコンデプロイまで未確認です。**

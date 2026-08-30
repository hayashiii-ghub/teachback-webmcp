# 撮影前チェック — 2026-08-30

これは撮影開始前の確認記録であり、以下の判定はその時点のもの。現在は94秒の完成版まで確定済み。[最終構成](../demo-script.md)と[撮影記録](RECORDING-STATUS.md)を参照。

## 判定

**録画開始前の準備は完了。動画収録・音声生成・編集・アップロードは未実施。**

約95秒の構成と英語台本を用意し、実Chromeの登録済みWebMCPツールで通しリハーサルを確認した。
公開サイトの保存状態を崩さないため、状態が変わるリハーサルは別originのローカル環境で行った。
公開サイト上で通し操作まで完走した、という意味ではない。

## 確認した環境

- 公開URL: https://teachback-webmcp.haygsiiii.chatgpt.site/
- リハーサルURL: `http://127.0.0.1:4188/`
- ソース: `af5f9b882598b03a9bd4edee844f51df723b79b9`
- 公開HTMLから参照されるJS/CSS 6ファイルを取得し、ローカルビルドとのバイト一致を確認。
  照合時刻: `2026-08-30T06:20:15.956Z`。全配信ファイルの網羅比較ではない。
- Chromeの公開ページとローカルページで、同じ5つの登録済みツールを発見。
- 実行は`document.modelContext.getTools()`が返したtool objectを
  `document.modelContext.executeTool()`に渡したもの。テスト用mockやアプリ関数の直接呼び出しではない。
- 境界・公開・承認は通常のUIを使用。リハーサルではCodexが操作を代行した。
- リハーサル終盤に取得したbrowser error/warningログは空だった。

## 通過した項目

| 確認 | 観測した結果 |
| --- | --- |
| Sofiaの記録を読む | `DEMONSTRATION_FOUND`、`R-2050` |
| WebMCPから草案を提出 | `PLAYBOOK_DRAFTED` |
| 補償がautomaticのまま | 公開ボタンdisabled |
| UIで補償を人への引継ぎに変更 | 公開ボタンenabled |
| UIからルール公開 | Danielへ移行し、`Taught from R-2050` |
| Danielを読む | `CURRENT_CASE`、`R-2052` |
| 変更案だけ作る | `RUN_PREPARED`、条件7/7、未反映表示 |
| 承認前に適用を試す | `RUN_NOT_APPROVED`。実際のWebMCP結果表示も確認 |
| UIから同じ変更案を承認 | `Approved for this proposal`、一回限り、期限付き |
| 同じrun/digestで再実行 | `RUN_COMMITTED`、Danielがhandled、反映済み表示 |
| 履歴 | 草案・境界変更・公開・承認・反映の各イベントを確認 |

承認前後で再prepare・reload・reset・直接状態注入はしていない。
拒否後から成功までの同一run/digestは、ローカルの実行トレースにも残した。

## 画面・素材

- 公開開始画面をCDPで**1920×1080 PNG**として直接取得し、画像を確認。ブラウザ枠・デバッグ帯・録画パネル・他アプリの映り込みなし。先に取得した1600×900版も比較用に保存した。
- 確認済みの設定はviewport 1600×900と、CDPの`width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false`。保存後の画像拡大はしていない。動画の連続フレームが同じ寸法になるかは撮影時のテストで確認する。
- 補償境界、拒否結果、承認、適用、履歴の静止画を保存。これらは確認資料であり動画素材の代用ではない。
- ブラウザ操作の通常スクリーンショットはページ倍率の影響を受けたため、本番ではCDP収録フレームの寸法を直接確認する。
- 既存の動画・音声・HyperFramesタイムラインは変更していない。
- 最新のロゴは`public/logo.svg`。旧動画側の`assets/logo.svg`とはファイル内容が異なるため、次の編集では公開側を正本にする。見た目の差をハッシュだけで判断しない。
- 配色の正本は`src/styles.css`: paper `#fbfaf6`、ink `#171512`、accent `#a54436`、success `#4c6854`。

ローカル確認資料（Git管理外）:

- `artifacts/recording-prep-2026-08-30/01-public-start.png`
- `artifacts/recording-prep-2026-08-30/01-public-start-1080p.png`
- `artifacts/recording-prep-2026-08-30/02-boundary-confirmed.jpg`
- `artifacts/recording-prep-2026-08-30/03-unapproved-tool-refused.jpg`
- `artifacts/recording-prep-2026-08-30/04-exact-proposal-approved.jpg`
- `artifacts/recording-prep-2026-08-30/05-changes-applied.jpg`
- `artifacts/recording-prep-2026-08-30/06-commit-audit.jpg`
- `artifacts/recording-prep-2026-08-30/webmcp-trace.json`

## 撮影時に残す確認

1. 本番を始める前に3秒だけテスト収録し、実フレームが1920×1080であることと連続取得を確認する。
   今回は「撮影前まで」の依頼なので、screencastは一度も開始していない。
2. 実際の撮影者が境界変更・公開・承認を行う。エージェントによるUI代行を「人が操作した」映像として見せない。
3. 本番の草案に合わせて台本を確認する。補償が既にescalateなら、修正ではなく確認として撮る。
4. 承認後5分以内に同じproposalを適用する。表示期限は実時間で進む。
5. 英語音声を生成した後に尺を再計測する。95秒へ機械的に合わせて早口にしない。

## 意図的に行っていないこと

- アプリコードの変更、再ビルド、再デプロイ、Gitへのcommit/push。
- 公開デモでの草案作成・ルール公開・承認・適用・リセット。
- 記録映像、テスト動画、音声の新規生成。
- 旧素材の削除、外部へのアップロード、コンテストへの送信。

公開ChromeタブにはEnglish・Sofia選択・未公開ルール・監査パネル閉の開始状態を残した。
確認用のローカルタブとサーバーは終了した。一時的なviewport設定も解除済み。
本番開始時にもう一度画面サイズを設定する。

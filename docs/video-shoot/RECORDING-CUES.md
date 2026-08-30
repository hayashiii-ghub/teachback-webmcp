# 撮影用キューシート

これは収録時の手順を残したキューシート。完成版は94秒で確定済み。[最終構成](../demo-script.md)と[撮影記録](RECORDING-STATUS.md)を参照。以下の95秒は当初の撮影目安であり、現在の完成尺ではない。

- 公開ページ: https://teachback-webmcp.haygsiiii.chatgpt.site/
- 対象ビルド: `af5f9b882598b03a9bd4edee844f51df723b79b9`
- 撮影方式: Chromeの製品タブ内容のみ。ブラウザ枠・デバッグ帯を撮らない。
- 出力目標: 1920×1080 / 30fps / 音声なしの操作素材。英語音声は後から編集で合わせる。
- 最終尺の目安は約95秒。素材は各状態の前後に余白を取り、実時間の短縮を無理に狙わない。

## 役割を分ける

- **撮影者:** 境界の編集、ルール公開、変更案の承認を実際のUIで行う。
- **エージェント:** 登録済みWebMCPツールで記録読取、草案提出、対象読取、変更案作成、適用を行う。
- **録画担当:** タブ内容を収録し、結果コードと時刻を残す。アプリ状態を直接注入しない。

リハーサルでは撮影者のUI操作もCodexが代行した。本番ではユーザー自身が境界変更・公開・承認を行い、別途収録済み。リハーサル映像を人の操作の代わりにはしない。

## 開始前

1. 対象originを操作するタブは1つだけにする。同じURLのクエリ違いも同じ保存領域・ロックを使う。
2. `English`を選択。Sofiaはhandled、Sofia由来ルールは未公開、Danielはunhandled。
3. Sofiaを選び、検索欄は空、監査パネルは閉じ、先頭に戻す。
4. viewportを1600×900に設定し、CDPの`Emulation.setDeviceMetricsOverride`を`width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false`で適用する。この組み合わせで1920×1080のページPNGを確認済み。新規タブを作った場合は再設定する。
5. wrapperのスクリーンショット寸法だけを信用しない。Chromeの倍率でレイアウトが変わるため、保存した`01-public-start-1080p.png`と構図を照合し、CDPのページ画像と収録フレームの実寸を確認する。収録時の上限は1920×1080とし、低解像度のフレームを引き伸ばして合格扱いにしない。
6. 本番を始める許可を得てから、3秒の収録テストを行う。`Page.startScreencast`はこの準備段階では呼ばない。
7. 1枚目と動作中のフレームに、アドレスバー、デバッグ帯、録画パネル、他のアプリ、実アカウント情報がないことを確認する。

静止画の1920×1080取得と、screencastでの連続フレーム取得は別の確認項目。
撮影を終了または中止したら、`Emulation.clearDeviceMetricsOverride`とviewportのresetで一時設定を解除する。

収録ループと対象操作は、一つの実行を完了まで待つ形で並行処理する。
待たないまま実行を返すと、次の操作との間で録画接続が失われることを今回確認した。
人の操作を待つ場合も収録を維持した実行内で、可視の画面状態を期限付きで確認する。
待機期限に達したら録画を停止し、操作前に次の収録開始を合わせ直す。

2026-08-30の本番撮影終了時、公開ChromeタブはDanielへの適用済み状態。録画を停止し、一時的な画面設定も解除済み。以下は再撮影時の手順であり、開始状態が今も残っているという意味ではない。
再撮影で`Reset demo`が必要になったら、消す対象がこのデモのローカル状態だけであることを確認して実行する。

## テイクの分け方

**Take A: 教えるところ。** Sofia開始 → 記録を表示 → WebMCPで草案 → 人が境界を変更 → 公開。

**Take B: 再利用の証拠。** 公開後のDaniel → 変更案 → 未承認拒否 → 人が承認 → 同じ変更案を適用 → 履歴。

Take Bの途中ではリセット・再読込・再prepareをしない。承認後は実時間5分以内に適用する。
ゆっくり読ませる間は、重要な状態を3–6秒保持して素材に残す。

## 操作順

| 順 | 担当 | 操作・期待結果 | 画面で残すもの |
| --- | --- | --- | --- |
| 1 | 撮影者 | Sofia → `Teach from this case` | `R-2050`とRecorded actions |
| 2 | Agent | `teachback_get_latest_demonstration({})` → `DEMONSTRATION_FOUND` | 記録に基づく草案作成への移行 |
| 3 | Agent | `teachback_submit_playbook_draft` → `PLAYBOOK_DRAFTED` | Proposed条件と未公開の状態 |
| 4 | 撮影者 | `Compensation requests`を`Escalate to a person · Confirmed by person`へ | 変更前、選択操作、変更後、公開ボタンの有効化 |
| 5 | 撮影者 | `Publish reusable rule` | Danielへの移行と`Taught from R-2050` |
| 6 | Agent | `teachback_get_current_case({})` → `CURRENT_CASE` | 対象が`R-2052`であること |
| 7 | Agent | `teachback_prepare_current({})` → `RUN_PREPARED` | 変更内容、条件合格、`No changes have been applied.` |
| 8 | Agent | 返されたrun/digestで`teachback_commit_approved` → `RUN_NOT_APPROVED` | `View audit trail` → `WebMCP connected`を展開し、実際のLast call / Resultを表示 |
| 9 | 撮影者 | 履歴を閉じ、内容を確認して`Approve preview` | `Approved for this proposal`、期限、`May be applied once.` |
| 10 | Agent | 手順8と同じ引数でcommit → `RUN_COMMITTED` | `Committed`、適用済み表示、Danielのhandled状態 |
| 11 | 撮影者 | 監査パネルを開く | 実際の承認・反映イベントと、展開したWebMCP成功結果 |

## エージェントへの英語プロンプト

### 1. 記録読取と草案 — Sofiaの記録画面で

> Read the recorded actions from the handled case I selected and submit a reusable playbook draft through its WebMCP tools. Do not publish the rule, approve a proposal, or apply any reservation changes. Report the actual tool results.

確認する結果は`source_reservation_id: R-2050`。
このリハーサルで使用した入力は下記。補償は記録に含まれず、省略したフィールドをアプリが`allow`で補った。
エージェントが自発的に補償の自動対応を提案した、という説明はしない。

```json
{
  "latest_arrival_limit": "23:59",
  "taxi_handling": "allow",
  "dietary_handling": "allow"
}
```

本番のエージェントが最初から補償を`escalate`で出した場合は、その事実を尊重する。
映像を作るためだけに危険側へ戻して「人が修正した」ことにしない。台本の確認版へ切り替える。

### 2. Danielの変更案 — 人が公開した後

> Inspect Daniel's current case through WebMCP and prepare a preview using the published playbook. Do not apply any changes. Keep the exact run ID and digest returned by the tool for the following steps.

`RUN_PREPARED.data.run_id`と`RUN_PREPARED.data.digest`を保持する。

### 3. 未承認拒否 — まだ承認しない

> Try to apply that prepared proposal now, using the same run ID and digest, so we can verify that the website rejects an unapproved change. Do not approve anything, create another preview, or retry automatically. Report the exact result.

```json
{
  "run_id": "<RUN_PREPARED.data.run_id>",
  "expected_digest": "<RUN_PREPARED.data.digest>"
}
```

拒否は監査イベント一覧には追加されない。`Last call / Result`か実際のAgent結果を**次のツール呼び出しより前に**撮る。
「全失敗が永続監査ログに残る」という説明にはしない。

### 4. 承認後の適用 — 人がUIで承認した後

> Apply exactly the proposal I just approved, using the same run ID and digest from the refused attempt. Do not prepare a new proposal or modify its contents. Report the exact result.

同じ引数で`RUN_COMMITTED`が返ることを確認する。
期限切れや別の結果が出たら成功演出をせず、そのテイクを止める。

## 構図

- 最初だけケース一覧とSofiaの全体を見せる。草案以降は見出し・操作・結果が一画面に入る位置へ通常スクロールする。
- 境界変更時は`Compensation requests`と`Publish reusable rule`を同時に残す。
- 承認時は変更内容と承認パネルを残す。下部字幕が承認ボタンを隠さない配置にする。
- WebMCP結果は製品に実在する監査パネルを使う。編集でそこだけ明確に寄る。別のログカードは作らない。
- 外部のAgent画面を使うなら本物の操作履歴だけにし、別チャット・アカウント・私的なファイルは映さない。撮影方法が確立していなければ素材として予定しない。
- イントロ・アウトロは編集段階で既存の書体と最新`public/logo.svg`を使う。録画中に別のロゴ画面へ遷移する必要はない。

## 撮影直後の検証

- 動画の時間・解像度・fps・コーデックを実測する。保存ファイルがあるだけで成功扱いにしない。
- 冒頭、草案、境界変更、拒否、承認、反映、履歴を原寸で確認する。
- 全体のコンタクトシートで映り込みと欠落を確認する。
- 実行結果とUIが一致し、拒否と成功が同じrun/digestに対応していることを確認する。
- 生素材はGitへ入れず、既存の英語版を上書きしない。公開・アップロード・応募は別工程。

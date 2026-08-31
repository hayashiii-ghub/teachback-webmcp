# Teachback：実演からプレイブックを作る応募版の実装計画

作成日：2026-08-31

状態：記録から再利用する実装と利用者による実演を確認済み。2026-08-31の追加方針として、WebMCPは草案・変更案の準備まで、公開・承認・反映は画面で完結する契約へ絞った。本計画の実装は公開対象となり、動画・提出済み内容は旧デモの記録として維持する。最新の実装は[現行README](../README.md)、検証結果は[検証記録](core-workflow-verification.md)を参照。

実装時の配置：既存の未コミット変更と旧データを保持するため、新しい型・処理・画面は `src/core/` へ分離し、`app/page.tsx` から接続した。以下のファイル案は設計時の名称で、実際の配置・手順は[現行README](../README.md)、確認結果は[検証記録](core-workflow-verification.md)を参照する。旧デモ向けテストは保持し、現エントリのE2Eは `tests/e2e/core-workflow.spec.ts` に置く。

計画作成時の調査対象：HEAD `49d9459` と当時の未コミット変更。以下の「現在」は計画作成時点を指す。応募内容の変更可否は未確認であり、この公開更新では提出済み内容を変更しない。

## 1. 今回の完成形と対象外

Teachbackの定義を維持する。

> 人が一件の対応を実演して記録し、外部のWebMCP対応Agentが再利用できる手順の草案に整理する。人が適用条件と禁止事項を確定し、サイトがその制約と承認を強制して別案件へ適用する。

今回埋めるのは「実演・草案・公開内容が事前定義に依存している」という差である。AIによる業務の自動学習や、一括処理基盤への転換は今回の主目的にしない。

### 必須の完成条件

- 初期状態に完成済みプレイブックを置かなくても、一連の流れが成立する。
- ユーザーが予約画面で実際に行った操作が、具体値と前後差分を持つ記録になる。
- 外部AgentがWebMCPで新しい記録を取得し、操作・変数・文面・条件の草案を提出する。
- 草案に、元の記録と「具体値を何へ置き換えたか」が表示される。
- 人が、固定の安全制約の範囲内で草案を変更し、公開できる。
- 実行は公開したプレイブックの実体を参照し、固定のプレイブック辞書を参照しない。
- 別の予約へ、対象予約の値を使った変更案を作れる。元のお客さんの名前や時刻を流用しない。
- AgentのWebMCP操作は草案・変更案の準備までとし、人が画面の「承認して反映」で完了する。予約を反映するWebMCPツールは公開しない。
- 未承認・期限切れ・内容変更・二重実行・条件外を拒否する。
- 実機の対応Agentによるツール発見と実行を確認する。固定JSONを渡す自動テストだけでは完成にしない。

### 扱う業務

日本の宿泊施設における、当日の到着遅延への対応。操作の種類は次の4つに限定する。

1. 到着予定時刻の更新
2. 通常夕食から軽食ボックスへの変更
3. 英語案内文の下書き
4. 当直スタッフへの引き継ぎ作成

実演も適用も合成データに対する操作とする。英語案内は下書き保存までで、送信は行わない。

### 今回作らないもの

- 任意サイトや画面録画からの操作推定、DOM・座標の記録
- 内蔵AIチャット、LLM APIキーの保管、モデルの学習
- 任意コード・任意条件式を実行する汎用DSL
- PMS連携、実メール送信、決済、タクシー手配、アレルギー対応の自動実行
- 認証付き本番バックエンド、無人ジョブ、組織権限、マルチテナント
- 一括承認、100件バッチ、動的なプレイブック別ツール登録
- 動画の再撮影、公開、提出済み内容の変更。この計画の実装後に別途確認する

## 2. 現在のコードと変更方針

| 現在の箇所 | 現状 | 変更方針 |
|---|---|---|
| `src/fixtures.ts` / `src/teaching.ts` | 用意した実演と2種類のプレイブックが結び付いている | 初期予約データと、実際に作った実演・草案・公開手順を分離する |
| `src/webmcp.ts` の実演取得 | プレイブック定義から操作の要約を返す | 完了済みの実演そのものを返す |
| `draftPlaybook` | Agentが提案するのは主に条件。操作は既定 | 根拠付きの操作・値の参照・文面テンプレートを草案の実体にする |
| `draftIsPublishable` | 既定の条件との完全一致が必要 | 安全制約、根拠、変数、実演再現、人の確認を検査する |
| `src/BoundaryEditor.tsx` | Night/Lateという既定IDによって編集項目を決定 | 条件スキーマと安全制約によって表示する |
| `applyPlaybook` / `changesFor` | 固定文面、固定の表示項目がある | 公開済みの手順を解釈し、実際に変わるフィールドだけを表示する |
| `commitApprovedRun` | `PLAYBOOK_DEFINITIONS[run.playbookId]` で再計算 | 公開済みのID・版・内容digestを照合し、その実体で再計算する |
| `prepare_current` / case別Run | 選択中の予約が業務処理の対象 | 業務関数を明示的なcase ID / run IDで扱う。選択状態は表示専用にする |
| `src/App.tsx` | 状態・保存・画面が集中 | 新しい記録画面と草案画面は分離し、Appは接続を担当する |

承認期限、digest、予約version、二重実行拒否、保存失敗表示、単一編集タブ、ケース移動・検索・モバイルの修正は捨てずに引き継ぐ。

## 3. 「固定してよいもの」と「Agentが考えるもの」

### サイトが固定するもの

- 上記4種類の操作と、変更可能な予約フィールド
- 入力の型・文字数・日付と時刻の形式
- 変数として参照してよい予約フィールド
- 固定安全制約、実行前の人の承認、5分の有効期限、同一Runの一回限り実行

操作部品を型で限定することは維持する。任意JavaScript、URLへのアクセス、任意オブジェクトパスは許可しない。

### Agentが記録から提案するもの

- 手順の名前と目的
- 記録のどの操作を再利用するか、その根拠
- `20:45`のような具体値を、`requestedArrivalTime`などの参照へ置き換えるか
- 実演文面内の名前・時刻を、許可された変数へ置き換えたテンプレート
- 再利用の適用条件案と、人の判断を必要とする点

記録が変わっても同じ草案を返す関数は作らない。サイトは完成済みの草案を返さず、記録・操作カタログ・制約・検証エラーを返す。

### 人が確定するもの

- どの手順・変数・文面を採用するか
- 固定安全制約より狭い適用条件
- 手順の公開と、個々の変更案の確認・承認・反映

Agentの提案がそのまま妥当なら、不要な編集を強制せず確認だけで公開できる。デモのために「必ず間違った草案を出し、決められた正解に直す」実装はしない。

## 4. データモデル

型の中心は `src/domain.ts` に置く。下記は追加・変更する主要項目で、既存の必要なフィールドは維持する。

| モデル | 主要項目・制約 |
|---|---|
| `SessionState` | schemaVersion、revision、businessDate、timeZone、reservations、recording、demonstrations、drafts、playbooks、runs、audit。保存単位を一つにする |
| `RecordedCommand` | id、sequence、caseId、commandType、具体的な入力、before/after、caseVersionBefore/After、実行時刻、actor。予約更新と同時に追加する |
| `Demonstration` | id、caseId、status、開始前snapshot、commands、終了後snapshot、digest、recordedBy。作成時にplaybookIdを持たせない |
| `PlaybookDraft` | id、revision、sourceDemonstrationId/digest、name、purpose、steps、proposedBoundary、unresolvedQuestions、validationIssues、Agent原案、人の変更履歴 |
| `PlaybookStep` | id、操作type、typed input、evidenceCommandIds、変数化の理由。根拠のない操作追加を禁止 |
| `PublishedPlaybook` | 独立したUUIDのid、version、contentDigest、sourceDemonstrationId/digest、確定したsteps/boundary、公開時刻。公開版は不変 |
| `PreparedRun` | id、caseId、caseVersion、playbookId/version/contentDigest、before/after、exactDiff、digest、状態、approval。`runsById`を正本にする |
| `Approval` | runId、approvedDigest、approvedAt、expiresAt、失効/使用済み状態。ツール入力から作成しない |
| `AuditEvent` | id、時刻、actor、eventType、case/demo/draft/playbook/run ID、変更理由、必要なversion・digest。全文の個人情報は不要 |

`activeRunIdByCaseId` は画面表示用の索引とし、業務上のRunを上書きで消さない。同じ案件の再準備では旧Runを失効させ、新しいRunを作る。

予約には `requestedArrivalDate`, `estimatedArrivalDate`, `requestsCancellation`, `requestsPaymentChange` を追加する。必要な入力が不明なら対象外扱いにする。日付を持たない `00:20` を同日深夜と推測して通さない。

### 操作の具体値と、再利用用の参照を区別する

```ts
// 実演に保存するもの：人が行った具体的な変更
type RecordedArrival = {
  id: string;
  type: "set_estimated_arrival";
  input: { date: string; time: string };
  before: { date: string | null; time: string | null };
  after: { date: string; time: string };
};

// 草案に保存するもの：Agentが提案した、次の案件への適用方法
type ArrivalStep = {
  id: string;
  type: "set_estimated_arrival";
  input: {
    date: { kind: "case_field"; field: "requestedArrivalDate" };
    time: { kind: "case_field"; field: "requestedArrivalTime" };
  };
  evidenceCommandIds: string[];
  rationale: string;
};
```

このコード片は契約の例で、まだ実装済みの型ではない。

他の入力は以下に限定する。

- 軽食：`{ kind: "literal", value: "late_meal_box" }`
- 文面：文字列の配列と、許可された `guestDisplayName` / `requestedArrivalTime` 参照の配列からなるテンプレート。`eval`や任意のテンプレートエンジンは使わない
- 表示文字列はReactのtextとして描画し、HTMLとして挿入しない

## 5. 記録：共通のコマンド処理を作る

新規 `src/commands.ts` に、4種類の操作を実行する純粋関数を置く。大規模なイベント基盤や外部ライブラリは追加しない。

```text
人の予約画面 ── 具体値のCommand ──┐
                                 ├─ 共通の検証・更新処理
承認済みRun ─ 解決済みCommand ────┘
```

- 人の記録画面は、到着時刻・食事・英語案内文・引き継ぎを実際に編集できる。
- キー入力ごとではなく「変更を保存」「下書きを保存」の成功時に記録する。
- 各操作はcase versionを照合し、予約更新・Command記録・監査を一つの状態更新で確定する。失敗・no-opは成功した実演として記録しない。
- 記録中に同じ文面を編集し直したら、具体的な履歴は全件保持する。草案用にはフィールドごとの最終的な有効変更と、その根拠IDを返す。
- 実演の完了時に操作履歴とsnapshotを凍結しdigestを作る。完了後に書き換えない。
- 記録の中止は、それまでに保存した予約変更を取り消さない。「記録を中止。保存済みの対応は残ります」と明示する。中止した記録からは草案を作らない。
- 記録中の予約切り替えは、終了または中止を選ばせる。Agentによる同一案件への変更案の準備も拒否する。
- 再利用の実行ログは監査へ保存するが、自動的に「人の実演」へ混ぜない。

共通Command関数と予約の反映処理はWebMCPツールとして公開しない。Agentは変更案までを準備する。画面の反映操作は必ず承認済みRunと同じ内容を検査する内部経路を通す。

## 6. 草案の受け入れと、人の公開

新規 `src/playbook-schema.ts` に、草案のJSON Schemaと実行時検証を置く。TypeScriptの型だけでは外部入力を信用しない。

### 入力の上限

- 名前80文字、目的・理由各500文字、文面各1000文字、操作は最大4種類
- 根拠IDは記録内に存在するものだけ。未知フィールド・未知操作・未知変数は拒否
- `proposal` は `name`, `purpose`, `steps`, `proposedBoundary`, `unresolvedQuestions` で構成する。サイトが出典・revision・actorを付ける
- 草案全体は16 KiB以下。操作typeごとの入力を `oneOf` で区別し、一つの操作typeは最大1回とする
- createはsource digest、updateはexpected draft revisionを必須とする
- Agentはactor、公開状態、承認、固定安全制約を指定できない

### 検査を3つに分ける

1. **構造検査**：不正JSON相当の値、未知操作、参照先、入力サイズ、根拠IDを検査。失敗した入力は草案として保存しない。
2. **内容検査**：変数を元の予約へ戻して実演を再現できるか、必要な変更を漏らしていないか、対象予約の名前・時刻が固定文面へ残っていないかを検査。問題があれば草案は表示するが公開は不可。
3. **人の確認**：操作、具体値からの置換、適用条件を並べて確認。現在のdraft revision/digestに対してPublishする。

実演再現は、現在の「対応済み」予約ではなく、記録開始前snapshotを入力として計算し、記録終了後snapshotの変更対象フィールドと比較する。文字列は改行を正規化した上で比較する。最初の版では、最終的な有効変更をすべて根拠付きで表現することを要求し、無関係な操作を黙って省略・補完しない。

最初の実装では、実演文面の自由な言い換えはしない。記録の文面を保った変数化を基本とし、再利用先での文章品質の判断は人に残す。人が草案を修正した場合も同じ検査を通す。実演と異なる操作を足したい場合は、新しい実演を作る。

公開の正しさを `PLAYBOOK_DEFINITIONS` との完全一致で判定しない。Agentが出した23:00案を草案として表示することはできるが、固定安全制約に反する限り公開できない。人が21:30または22:00へ狭めた結果はいずれも、実演再現を含む検査に通れば公開できる。

公開済みの版を編集する場合は次版の草案を作る。既存のRunが参照する版を差し替えない。

## 7. 固定安全制約と、変更できる境界

新規 `src/playbook-policy.ts` に、安全制約を一か所で定義する。草案検査・Publish・Prepare・Commitが同じ定義を使う。

### 固定安全制約

- 確定済み、未チェックイン、営業日当日の到着
- 希望到着日が予約の到着日と一致し、時刻が有効
- 到着は施設上限22:00まで
- 新しい食物アレルギー、タクシー、補償、キャンセル、支払変更の依頼は人へ返す
- 不明な安全項目は「問題なし」とみなさない
- 食事変更の操作を含む場合は夕食付き・通常夕食であること
- 既に同じ対応を完了した案件を再処理しない。変更対象に既存の文面などがあれば無条件上書きせず人へ返す
- 予約への再利用は、人の承認を必須とする

本計画では既存の「22:00まで」に合わせて、22:00ちょうどを許可、22:01を拒否する。UI文言も「22時以降」ではなく「22時を超える場合」に統一する。時刻は文字列大小比較ではなく日付と分単位で検査する。営業日はデモ時計で固定し、承認TTLは実際の時計で測る。

### 人が変更できるもの

- 到着時刻の上限を22:00以下へ狭める
- 再利用する操作と、その許可済みの変数・文面
- 手順名・説明

固定制約は読める形で表示し、Agentや人の操作で解除するUIは置かない。草案の条件案は人が明示確認するまで未確定とする。

元の4操作の範囲に戻すため、現行Night Arrivalのタクシー・食事制限処理は新規作成するプレイブックの操作カタログに含めない。既存デモデータの扱いは第11節の移行方針に従う。

## 8. WebMCPツール契約

ツール名は固定し、プレイブックごとの動的登録はしない。prefixは既存と同じ `teachback_` を使う。以下7個を現行契約とする。Agentは草案または変更案を提出したら、人の確認に渡して終了する。

| ツール | 必須入力・主な任意入力 | 出力・副作用 |
|---|---|---|
| `teachback_get_demonstration` | 任意 `demonstration_id`。省略時は最後に完了した記録 | ID/digest、前後の関連値、具体的な操作、最終有効変更、変数候補、固定安全制約。完成した手順は返さない |
| `teachback_create_draft` | `demonstration_id`, `source_digest`, `request_id`, `proposal` | draft ID/revision、検査結果、人が確認する画面。予約変更・公開はしない |
| `teachback_update_draft` | `draft_id`, `expected_revision`, `request_id`, `proposal`（全体置換） | 新revisionと検査結果。人の同時編集を古い入力で上書きしない |
| `teachback_list_playbooks` | 任意 `cursor`, `limit`（上限10） | 公開済みのID/version/contentDigest、目的、条件、手順。草案を実行可能扱いしない |
| `teachback_list_cases` | 任意 `status`, `cursor`, `limit`（上限10） | case ID/version、適用に必要な項目、進行中Run。現在の選択予約に限定しない |
| `teachback_prepare_run` | `case_id`, `expected_case_version`, `playbook_id`, `playbook_version`, `request_id` | Run ID/digest、具体的変更、人の確認待ち。条件外ならコードと理由。予約を書き換えない |
| `teachback_get_run` | `run_id` | 保存した変更案、対象case、版、digest、画面での反映結果を読み取る。反映や承認の副作用はない |

### 共通仕様

- 返り値は既存の `ToolResult` を拡張し、`ok`, `code`, `summary`, `data`, `issues` とする。
- `issues` は `{ path, code, message }[]`。失敗時も何を修正すべきかを構造化して返す。架空の「修正済み草案」を返さない。
- すべての書き込み入力を実行時検査。`additionalProperties: false`をネストにも適用する。
- 実演取得は、全文履歴を無制限に返さず、最大4種類の最終有効変更と必要なsnapshot値・根拠IDを返す。編集途中の全履歴はサイトに保持する。返却サイズの上限を16 KiBとし、超過時は黙って切り落とさずサイズエラーを返す。記録UIもこの上限で完了可否を検査する。
- 読み取りは `readOnlyHint: true`。実演・Agent草案・ユーザー文面を返す場合は `untrustedContentHint: true`。hintは権限検査の代わりにしない。
- request IDの再送は、入力内容が一致するとき既存結果を返す。同じIDで別の内容なら `REQUEST_CONFLICT`。画面から内部Commitを再実行した場合も `RUN_ALREADY_COMMITTED` とし、二重反映しない。
- ケースの名前、画面の位置、既定プレイブック名で分岐しない。取得したIDを使う。
- このローカル応募版で扱える範囲は、現在のデモセッション内の予約だけ。検索フィルターは表示条件であり認可境界ではない。選択とは別の案件を準備した場合、対象と結果を画面の活動表示へ明示する。
- `SESSION_BUSY`, `DEMONSTRATION_NOT_FOUND`, `RECORDING_IN_PROGRESS`, `INVALID_DRAFT`, `SOURCE_CHANGED`, `DRAFT_CONFLICT`, `DRAFT_REQUIRES_REVIEW`, `PLAYBOOK_NOT_PUBLISHED`, `PLAYBOOK_NOT_APPLICABLE`, `CASE_STATE_CHANGED`, `RUN_NOT_APPROVED`, `APPROVAL_EXPIRED`, `DIGEST_MISMATCH`, `RUN_ALREADY_COMMITTED`, `PERSISTENCE_FAILED` を使い分ける。
- Publish・Approve・Commit・生のCommand実行・初期化のWebMCPツールは作らない。actorを入力させず、呼び出し経路で決める。従来の `teachback_commit_run` は登録しない。

既存5ツールの名称・Schema変更は破壊的変更としてREADMEとテストを更新する。旧形式から暗黙に固定プレイブックを補完する互換処理は残さない。既存の公開版は、この変更を公開するまでそのままとする。

### ブラウザ接続

既存の `document.modelContext.registerTool` とAbortControllerによる解除を基本にする。この形式は現在の[Chrome Imperative APIの公式説明](https://developer.chrome.com/docs/ai/webmcp/imperative-api)と一致している。登録失敗時の巻き戻しと、再マウント時の重複防止を維持する。

対応ブラウザ・対応Agentが必要であり、通常のGeminiサイドバーで動くとは案内しない。接続確認には公式のInspectorなどを使う。公式説明もInspectorとGemini in Chromeを区別している。[WebMCPの開始方法](https://developer.chrome.com/docs/ai/webmcp)

UIでは「API利用不可」「登録失敗」「ツール登録済み」「実際の呼び出し受信」を区別する。登録だけで「Agent接続済み」と表示しない。Agentが利用不可でも、記録・手動の草案編集・確認は可能とするが、「AIが草案を作った」とは表示しない。

## 9. 実行処理と状態遷移

新規 `src/playbook-runtime.ts` が、公開済みのstepsと現在の予約から具体的なCommandを生成し、共通Command処理でpreviewを計算する。

```text
実演: idle → recording → completed
                       └→ cancelled

草案: completed demonstration → draft(needs_review / invalid)
                               → valid + human confirmation → published v1
         published v1 → 新しい草案 → published v2（v1は不変）

実行: prepare → awaiting_review → approved → committed
        │           │               ├→ expired/stale
        │           └→ discarded    └→ discarded
        └→ rejected（予約変更なし、人へ理由を返す）
```

「valid」は検査結果であり、人が承認済みであることを意味しない。AIへの依頼文をコピーしただけでは `Agent drafting` に遷移させず、「草案の受信待ち」と表示する。

### Prepare

1. セッション、case ID/version、公開済みplaybook ID/versionを検査する。
2. 固定安全制約と公開済み境界を現在の予約へ適用する。
3. stepsの変数を対象予約から解決してCommandを生成する。
4. 共通処理でbefore/afterと、実際に変わるフィールドだけの差分を計算する。
5. SHA-256の対象にschemaVersion、case ID/version、playbook ID/version/contentDigest、境界、steps、解決済み入力、exactDiffを含める。オブジェクトのキー順を正規化し、操作の順序は保持する。
6. 非同期digest計算後、セッションとcase/playbookが変わっていないことを再確認し、Runを保存する。

### Approve / Commit

- 人は画面上のRun ID/digestが示す変更案を承認する。別案件へ移動しても、その承認は元Runに残る。
- Runに自由入力の差分を注入する機能は作らない。手順・文面の変更は新しい公開版、予約入力の訂正はcase version更新を経て再Prepareし、旧Runの承認は引き継がない。個別対応が必要なら破棄して人が対応する。
- CommitはRun IDで検索し、選択中ケースへ読み替えない。
- 承認、TTL、case version、公開版の内容digest、現在の適用条件を照合する。
- 公開版の実体から変更を再計算し、保存済み差分と承認済みdigestの一致を検査する。
- 非同期計算後に期限・現在stateを再確認し、予約変更・Run使用済み・監査を一つの状態更新で確定する。
- 新しいプレイブック版ができただけで、旧版に紐づくRunを新しい内容へ差し替えない。旧版が利用不可なら拒否する。

通常UIは「承認して反映」に一本化する。内部のApprove / Commitの検査と一括保存は維持するが、「承認のみ」やAgentへの続行依頼は設けない。旧版で保存されたapproved Runは保持し、画面の「承認済みの変更を反映」か破棄で処理する。期限切れ・内容変更の承認を延長したり引き継いだりしない。

## 10. 画面

新規コンポーネントを3つ追加し、既存の書体・配色・予約一覧・差分・監査表示は流用する。

| 画面 | 主な内容 | 実装場所 |
|---|---|---|
| 記録 | 4操作の編集、記録中表示、成功した操作の履歴、完了・中止 | `src/RecordingPanel.tsx` / `src/recording.ts` |
| 草案確認 | 元の具体値とAgentの変数化の比較、根拠、未解決点、手順・条件の編集、公開 | `src/PlaybookDraftEditor.tsx` / 既存BoundaryEditor |
| 公開手順 | IDではなく手順名、版、出典、実際の操作と境界 | `src/PlaybookDetails.tsx` |
| 再利用 | 既存の予約詳細、差分、条件判定、承認・反映 | `src/App.tsx` / `src/CaseDetails.tsx` / `src/case-presentation.ts` |
| 接続・監査 | 登録状態、実際のtool call/result、人の編集・公開・承認 | 既存UIを拡張 |

新しいセッションは未対応の実演対象から開始し、公開済みプレイブックは0件とする。「作成済み」と「記録済み」と「対応済み」を別の状態として表示する。

英日両方の表示、キーボード操作、エラーの関連付け、モバイルの見切れを実装時に確認する。技術的なIDやdigestは監査詳細に置き、通常画面では対象・変更内容・次の操作を示す。

## 11. 保存・移行・非同期処理

実演の予約更新と記録が別々に保存されると、対応と出典が食い違う。この変更範囲では `SessionState` を一つのJSONとして保存する。

- 新しい保存キーを `teachback-session-v1` とする。既存2キーの内容は初回移行で上書き・削除しない。
- 現在のAppとTeachingJourneyの二重stateを、一つのsession state/refと一つの更新窓口にまとめる。
- 更新は「現在revision検査 → 次状態生成 → 単一キーへ保存 → メモリとUIを確定」の順とする。保存失敗時には操作成功を返さない。
- 非同期計算は保存前に行い、その後revisionを再検査する。途中のリロード・リセット・Agentキャンセル時には未確定更新を適用しない。
- Web Locksの単一編集タブを維持する。新たなタブは所有権取得後に最新保存状態を読む。
- 現行データを検出したら「旧デモの記録」として保持し、明示的に新体験を開始する。旧固定プレイブックや承認を、新モデルの実演・公開版・有効承認として自動変換しない。
- 旧データを閲覧・退避できるようにし、既存履歴を消すデモリセットは確認後にだけ実行する。
- locale保存は別でよい。ストレージ不正・容量超過・書き込み失敗は理由を表示し、黙って初期状態へ置換しない。
- request IDの重複検出に必要な情報もsessionに保存し、リロード後の再送で重複作成しない。

これはブラウザ内の合成データを整合させる設計で、本番の認証・認可ではない。DevToolsやページを書き換えられる拡張に対する保護まで主張しない。ツール出力の指示を信用せず、入力検証と決定的制約を別に置く方針は[公式のツール安全性ガイド](https://developer.chrome.com/docs/ai/webmcp/secure-tools)に沿う。

## 12. 実装順と完了判定

既存の未コミット変更を保持し、各段階を独立して検証可能にする。未完成の段階で公開しない。

| 順序 | 実装 | 主な変更ファイル | その段階の完了条件 |
|---|---|---|---|
| 0 | 現状の退避と接続確認 | テスト実行記録、既存登録処理 | dirty差分を把握し、既存回帰結果を記録。実機で読み取りツールを発見・呼び出せるか先に確認 |
| 1 | 型・単一保存・共通Command | domain、commands、persistence、App、fixtures | 一つの変更とログが一緒に保存される。失敗時・再読込・旧データが壊れない |
| 2 | 人の実演記録 | recording、RecordingPanel、App、i18n | 実際に編集した4操作の具体値が記録される。架空の記録を生成しない |
| 3 | 根拠付き草案の受け入れ | playbook-schema、teaching、webmcp | 外部Agentが新規記録から草案を提出できる。固定の完成草案を返す処理を主導線から除去 |
| 4 | 人の確認・公開 | playbook-policy、PlaybookDraftEditor、BoundaryEditor、PlaybookDetails | 固定の正解との一致判定がなく、複数の妥当な条件で公開できる。不正な条件は公開不可 |
| 5 | 公開実体からの再利用 | playbook-runtime、application、case-presentation、webmcp | 新規UUIDのプレイブックを別案件へ適用できる。承認・期限・競合・再実行拒否が保たれる |
| 6 | 実機・UI・回帰・説明 | 全テスト、README、新デモ台本 | 元の完成条件を満たし、固定応答でないAgent実行を確認。ユーザーがローカルで確認可能 |

段階3の時点で、外部Agentが草案を作る部分を実機で確認する。接続が失敗した状態のまま画面を作り込み、最後に接続できないことが判明する進め方を避ける。

### テスト対象

| 分類 | 必須ケース |
|---|---|
| 記録 | 各操作のbefore/after、失敗/no-op、文面再編集、完了後不変、中止、リロード、記録中の案件変更 |
| 草案 | 実在する根拠ID、未知ID/操作/変数、不正値/巨大入力、時刻や名前の流用、記録の改ざん、古いrevision、create再送 |
| 公開 | 未解決の変数、人未確認、承認不要化、23:00案、21:30/22:00の有効な別設定、非実演操作、Agentからの公開不可 |
| 実行 | 変数が対象予約の値になる、任意の新規ID、異なる手順、存在しない版、差分なし、既存文面、夕食なし |
| 境界 | 22:00可/22:01不可、日付またぎ、不正時刻、新規アレルギー、タクシー、補償、キャンセル、支払変更、情報不明 |
| 承認 | 未承認、digest改ざん、版/案件更新、期限切れ、ハッシュ計算中の期限切れ、二重呼出し、別案件への選択移動、破棄 |
| 保存 | 旧データを保持、新キー保存失敗、破損JSON、容量超過、更新途中のリロード、リセット取消、単一編集タブ、request再送 |
| UI | EN/JA、desktop/mobile、キーボード、検索0件、ケース状態、Agent対象と表示対象の区別、保存エラー |
| WebMCP | 7ツールのみの契約、Publish/Approve/Commit/生の予約操作がないこと、Prepareでは予約が変わらないこと、型契約、登録/解除、重複登録、部分登録失敗、signalなし/キャンセル、最小出力とページング |

追加する単体テストは `commands.test.ts`, `recording.test.ts`, `playbook-schema.test.ts`, `playbook-policy.test.ts`, `playbook-runtime.test.ts`。既存のapplication/teaching/webmcp/persistenceテストも新契約へ更新する。

E2Eは `tests/e2e/record-to-playbook.spec.ts` を追加する。既存の「最初からEmmaと公開済み手順がある」テストは新しい初期状態へ更新し、承認期限や保存の回帰検査自体は削らない。

実行コマンドは既存の `bun run test`, `bun run build`, `bun run test:e2e` を基本にする。E2Eの4173番で別の古いサーバを再利用しないよう、baseURLを設定可能にする。レビュー中の4318番は勝手に停止しない。

### 固定デモへの最適化を防ぐ受け入れテスト

1. 元の記録と異なる名前・時刻で新しい実演を作る。Agentが新しい記録IDを読み、その記録を根拠に草案を作る。
2. 4操作の実演と、到着時刻＋引き継ぎだけの実演を作る。後者の草案・実行に軽食や案内文が勝手に追加されない。
3. 名前と時刻を使う引き継ぎ文を入力し、再利用先ではそのお客さんの名前と時刻になる。
4. 人が固定値ではない有効な上限を選び、その上限の直前・直後で結果が変わる。
5. Agentが誤った変数や記録にない操作を出したら検証エラーとなり、勝手な補完ではなくAgentまたは人が修正する。

自動テストでSchema適合性と決定的処理を検査し、実機で実際のLLMによる草案作成を少なくとも2種類の記録で試す。人の編集・公開・承認をAgentが代行した実演は、人間参加型の証拠にしない。クライアント、ブラウザ版、実際のtool call/result、元記録と草案の対応を保存する。

## 13. 3分以内のデモへの対応

以下は175秒を目安にした構成案であり、新しい動画はまだ撮影していない。Agent応答時間は実測して調整する。待ち時間を編集する場合も、手入力JSONや固定草案をAIの出力として見せない。

| 時間 | 見せること | 証拠 |
|---|---|---|
| 0–10秒 | Teachbackの一文説明 | 実演から手順にする製品であること |
| 10–40秒 | 人が4操作を実演し、記録を完了 | 操作に合わせて実際の記録が増える |
| 40–65秒 | 外部Agentが記録を読み、草案を提出 | tool call、記録ID、具体値→変数の変換 |
| 65–90秒 | 人が手順と境界を確認・変更して公開 | 変更前後、人の操作、公開版 |
| 90–120秒 | Agentが別案件に変更案を作る | 対象の名前・時刻が使われる |
| 120–130秒 | 人が変更案を確認 | 具体的な差分、まだ予約が変わっていないこと |
| 130–152秒 | 人が「承認して反映」を押す | exact diff、Humanの承認・反映履歴、対応済み状態 |
| 152–168秒 | 条件外の案件を試す | 明確な理由、変更なし |
| 168–175秒 | 締め | 人の対応を、人が決めた境界の中で再利用 |

実演用の人の操作は利用者が行う。テスト用のブラウザ自動操作と、応募動画の人の操作は区別する。ローカル完成後に公開更新の許可と応募変更可否を確認し、それまでは現在のサイト・動画・Devpostを変えない。

## 14. 切り捨て基準と、その次

次のいずれかが残れば、今回の核は未完成とする。

- 実演記録が手動操作ではなくfixture由来のまま
- Agentから手順の内容を受け付けず、既定の手順を選ぶだけ
- Publishに既定の正解との完全一致が必要
- 新しく作ったID・内容のプレイブックを実行できない
- 実機でツールを発見・呼び出せず、固定応答のテストだけが通る
- 人が決めていない条件・承認で予約を書き換えられる

時間が足りない場合は、多数の記録の管理画面、複数版の比較UI、既存デモの豊富な見本を削る。実際の記録・Agent草案・人の確定・安全な別案件への再利用は削らない。

複数案件化は、この核が完成した後の拡張にする。今回からcase/playbook/runを明示IDで扱うので、後から `prepare_runs` で対象集合を準備できる構造にしておく。ただし今はバッチの状態機械・Manifest承認・バックエンドジョブまで実装しない。将来の追加でも、記録から作った同じ公開手順と同じ安全検査を使う。

## この計画書作成時の検証範囲

現行ソース・テスト・保存構造と公式WebMCP資料を読んで作成した。今回はアプリのコード変更、テスト実行、新規フローの動作確認、デプロイを行っていない。上記の完了条件はすべて今後の実装に対する条件である。

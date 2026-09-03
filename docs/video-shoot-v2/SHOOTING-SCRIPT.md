# Teachback — WebMCP Challenge 新版撮影台本

**状態:** 撮影・編集・最終レンダー・ローカルQA済み

**対象:** `e520589` 以降の「実対応を記録 → Agentが草案化 → 人が公開・反映」版

**確定尺:** 2分13秒（3,990フレーム）

**画面:** 1920×1080 / 30fps / English UI

**音声:** 後付け英語ナレーション。操作素材には収録しない。

旧94秒版は旧プロトタイプの記録として残し、この動画では使用しない。

## この動画で証明する一文

> A person records real saved work. An agent turns that evidence into a reusable draft through WebMCP. A person controls publication and every application.

最重要の瞬間は、Aikoの具体値が別案件で使える変数へ変わる場面。

```text
Hello Aiko Tanaka ... 21:30
        ↓ Agent via WebMCP
Hello [Guest name] ... [Requested arrival]
```

## 役割表示

動画左上のActorラベルは常に一つだけ表示する。右上には、その区間で確認できる証拠だけを短く表示する。

| ラベル | 対象 |
|---|---|
| `HUMAN` | 対応記録、草案確認、条件変更、公開、案件選択、承認・反映 |
| `AGENT` | ツールによる記録読取、草案提出、変更案準備、Run確認。右上の証拠ラベルでWebMCP呼び出しを特定する |
| `WEBSITE` | 根拠検査、条件判定、exact diff生成、条件外拒否、履歴保存 |

サイトを人が操作している場面に`AGENT`を付けない。Agentの返答だけを映している場面に`WEBSITE`を付けない。

## 使用する合成案件

### 記録元

- Aiko Tanaka / `R-2041`
- 希望到着 21:30
- 人が保存する操作は4つ

```text
Arrival: 2026-08-31 21:30
Meal: Late meal box
Guest message: Hello Aiko Tanaka, we noted your 21:30 arrival. Your meal box will be ready at reception.
Shift handoff: Aiko Tanaka arrives at 21:30. Leave the room key at the front desk.
```

### 正常な再利用先

- Emma Wilson / `R-2048`
- 希望到着 20:45
- 追加の食事制限、タクシー、補償なし

### 条件外の例

- Noah Martin / `R-2060`
- 希望到着 21:15
- Compensation requestあり

## 最終タイムライン

| 時間 | Actor | 画面・操作 | WebMCP / 結果 | 立証すること |
|---|---|---|---|---|
| 0:00–0:05.4 | — | Aikoの案件を背景に価値提案を中央表示。`Synthetic challenge data`。 | なし | 説明より先に成果を示す |
| 0:05.4–0:18.2 | HUMAN | `Start recording`。到着、meal box、案内文、handoffを保存。 | なし | 事前作成済み手順ではなく、この場で人が根拠を作った |
| 0:18.2–0:26.0 | WEBSITE | Recorded work、4操作、before / afterを表示。 | なし | 保存された操作だけが草案の根拠になる |
| 0:26.0–0:34.0 | AGENT | 実際のWebMCP結果を寄りで表示。 | `teachback_get_demonstration` → `DEMONSTRATION_FOUND` | UI推測ではなく意味的記録を読む |
| 0:34.0–0:48.2 | AGENT | Agentがproposalを提出し、`AI-authored draft`が現れる。 | `teachback_create_draft` → `DRAFT_CREATED` | Agentが操作・変数・条件を提案し、サイトが検証した |
| 0:48.2–1:06.0 | HUMAN | Aiko / 21:30と変数を比較し、22:00を21:45へ狭めて公開。 | なし | 人が草案と境界を確定する |
| 1:06.0–1:13.5 | HUMAN | 公開版v1からEmmaを明示的に選択。 | なし | 公開版と対象案件は人が選ぶ |
| 1:13.5–1:27.5 | AGENT | Emmaへの変更案を準備。 | `teachback_prepare_run` → `RUN_PREPARED` | exact proposalだけを作り、まだ反映しない |
| 1:27.5–1:43.5 | HUMAN | Emma / 20:45のexact diffを確認し、`Approve and apply`。 | なし | 最終判断と反映は人の画面操作 |
| 1:43.5–1:53.5 | AGENT | 同じRunと履歴を読む。 | `teachback_get_run` → `status: committed` | Agentは結果を読めるが、承認・反映ツールは持たない |
| 1:53.5–1:57.6 | AGENT | Noahを指定して準備を依頼。 | `teachback_prepare_run` | Agentは明示IDで準備を要求する |
| 1:57.6–2:04.5 | WEBSITE | 補償依頼を理由に決定的に拒否。 | `PLAYBOOK_NOT_APPLICABLE` | 条件外はサイトが人へ返す |
| 2:04.5–2:13.0 | — | 記録・公開版・完了状態を背景に中央ロゴへ。 | なし | 人の仕事 → Agent草案 → 人が管理する再利用 |

## 英語ナレーション全文

### 0:00–0:05.4

> Teachback turns one handled case into a reusable, human-governed playbook.

**On-screen**

```text
ONE HANDLED CASE → ONE REUSABLE PLAYBOOK
Synthetic challenge data
```

### 0:05.4–0:18.2

> A staff member handles Aiko's reservation in the website. Only saved work becomes evidence: the arrival, meal box, guest message, and shift handoff.

**On-screen**

```text
HUMAN · Records actual saved work
4 saved operations
```

### 0:18.2–0:26.0

> Teachback records the semantic commands, exact before-and-after values, and evidence IDs.

**On-screen**

```text
WEBSITE · Commands + exact diffs + evidence IDs
```

### 0:26.0–0:34.0

> Through WebMCP, the agent reads that record directly instead of guessing a workflow from the interface.

**On-screen**

```text
AGENT
teachback_get_demonstration
DEMONSTRATION_FOUND
```

### 0:34.0–0:48.2

> The agent submits its own draft: the supported operations, reusable case fields, wording, and an arrival boundary. The website validates every proposed step against the recorded evidence.

**On-screen**

```text
teachback_create_draft
DRAFT_CREATED
Specific values → reusable case fields
```

### 0:48.2–1:06.0

> A person compares the source response with the reusable wording, tightens the cutoff from ten p.m. to nine forty-five, and publishes the reviewed version. WebMCP cannot publish it.

**On-screen**

```text
HUMAN · Reviews the agent draft
Aiko Tanaka → Guest name
21:30 → Requested arrival
22:00 → 21:45
Publish is a human action
```

### 1:06.0–1:13.5

> The versioned playbook is now available for another case. The operator chooses Emma.

**On-screen**

```text
PUBLISHED BY A PERSON · VERSION 1
Next case · Emma Wilson
```

### 1:13.5–1:27.5

> The agent reads the published version and current cases, then asks Teachback to prepare Emma's run. The website evaluates the boundary and creates the exact changes. Nothing has been applied.

**On-screen**

```text
teachback_list_playbooks
teachback_list_cases
teachback_prepare_run
RUN_PREPARED · No changes applied
```

### 1:27.5–1:43.5

> A person reviews Emma's arrival, meal, personalized message, handoff, and final status, then selects Approve and apply. Approval and application stay inside the website.

**On-screen**

```text
HUMAN · Reviews the exact proposal
Emma Wilson · 20:45
APPROVE AND APPLY
Not exposed as a WebMCP tool
```

### 1:43.5–1:53.5

> The agent can read the completed run, while History records who drafted, published, prepared, and applied it.

**On-screen**

```text
teachback_get_run
status: committed
HUMAN · AGENT · WEBSITE
```

### 1:53.5–2:04.5

> When the same playbook is tried on a compensation request, Teachback refuses it and returns the case to a person.

**On-screen**

```text
PLAYBOOK_NOT_APPLICABLE
Compensation request → Human review
No changes applied
```

### 2:04.5–2:13.0

> Human work becomes structured guidance. WebMCP carries the draft. Human judgment controls reuse.

**On-screen**

```text
DEMONSTRATED BY A PERSON
DRAFTED WITH WEBMCP
CONTROLLED BY A PERSON
TEACHBACK
```

## 編集方針

- 最初から最後まで実アプリ画面を主役にする。巨大なJSON、DevTools、実装コードは見せない。
- 各ツール呼び出しは実際のAgentカード、またはサイトの`WebMCP connection`にある最終呼び出し結果を使う。疑似ログを作らない。
- Aikoの具体値と再利用側の変数を比較する画面は最低4秒保持する。
- exact diff、`No changes have been applied yet.`、`Approve and apply`は同じ構図で読めるようにする。
- テロップは全編同じ処理に統一する。背景帯を付けるなら全編同じ濃度・余白で使用する。
- イントロは5.4秒、アウトロは8.5秒。どちらも中央組みで、長いロゴアニメーションは入れない。
- BGMはなくてもよい。入れる場合もナレーションより十分小さく、クリック音は人が押す重要操作だけに限定する。

## この動画では説明しないもの

- SHA-256、request ID、Web Locks、localStorageの仕組み
- 5分・1回限り承認の内部詳細
- `DRAFT_CONFLICT`や再送制御
- 7ツールすべての機能紹介
- 手動JSON入力、モバイル表示、旧データ移行
- 本番認証・ホテルシステム連携・無人バッチ

## 表現上の境界

| 避ける表現 | 使用する表現 |
|---|---|
| Teachback learns any workflow. | Teachback records supported saved operations and lets an agent draft from them. |
| The AI watches how people work. | The website records semantic operations selected by a person. |
| One example teaches the AI the policy. | One recording provides evidence for a draft that a person reviews. |
| The agent decides what is safe. | The website validates fixed safeguards and human-published boundaries. |
| The agent publishes and executes the workflow. | The agent drafts and prepares; a person publishes and applies. |
| Production-ready authorization. | A client-side prototype of approval and policy semantics. |
| Real hotel data. | Synthetic hotel-operations data. |

## 撮影の合格条件

- Aikoの4操作がその場で保存されたことを連続映像で確認できる。
- `DEMONSTRATION_FOUND`と`DRAFT_CREATED`が実際のWebMCP呼び出しとして確認できる。
- 草案に`AI-authored draft`が表示される。
- Aiko / 21:30がGuest name / Requested arrivalへ変換された比較を読める。
- 人が22:00を21:45へ変更し、公開したことを確認できる。
- Emmaへの`RUN_PREPARED`と未反映表示を確認できる。
- 人が`Approve and apply`を押し、Emmaがcommitted / handledになる。
- `teachback_get_run`で同じRunがcommittedになったことを確認できる。
- Noahが補償依頼を理由に`PLAYBOOK_NOT_APPLICABLE`となる。
- ブラウザ枠、個人情報、別チャット、デバッグUI、架空の結果表示が映っていない。

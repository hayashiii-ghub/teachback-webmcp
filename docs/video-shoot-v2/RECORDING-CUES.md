# Teachback 新版 — 収録キューシート

この資料は[新版撮影台本](SHOOTING-SCRIPT.md)を、再現可能な操作へ落としたもの。

## 撮影開始前

1. 公開URLの同一originを開くタブは1つだけにする。
2. English UI、1920×1080、30fps。ブラウザ枠を映さない。
3. `Reset demo`から新しいsessionを開始し、案件・手順・履歴が初期状態であることを確認する。
4. `WebMCP connection`を開き、`7 tools registered`を確認する。これはAgentが呼べる証明ではないため、実呼び出し結果も別途残す。
5. Aiko / `R-2041`、Emma / `R-2048`、Noah / `R-2060`が初期状態で未対応であることを確認する。
6. 3秒のテスト収録で解像度、カーソル、文字の可読性を確認する。
7. 操作素材は余白込みで収録し、編集段階で待ち時間だけを詰める。ソース再生速度は上げない。

`Reset demo`は現在の`teachback-session-v1`を初期化する操作。別originや旧デモの保存キーは対象にしない。

## 通しリハーサル結果 — 2026-09-03

- ローカルの新規sessionでTake AからTake Fまで通過。
- `document.modelContext.getTools()`で固定7ツールを発見。実行は発見したtool objectとJSON引数を`document.modelContext.executeTool()`に渡した。
- Aikoの4操作を記録後、`DEMONSTRATION_FOUND` → `DRAFT_CREATED`を確認。
- Operationsの`Actual response for Aiko Tanaka`と`For the next case`の左右比較は、具体値から変数への変換を一番明確に見せられる。本番で最低4秒保持する。
- 人が到着上限を22:00から21:45へ狭め、公開したことを確認。
- Emmaは`RUN_PREPARED`後も`Awaiting review`のままで値は未反映。人が`Approve and apply`を押した後だけ`Handled / Committed`となり、`teachback_get_run`は`status: committed`を返した。
- Noahは`PLAYBOOK_NOT_APPLICABLE`。理由は`requestsCompensation` / `REQUEST_REQUIRES_PERSON`。
- 拒否結果はCasesの本文に常設表示されない。本番ではWebMCP実行直後に`WebMCP connection`を開き、`teachback_prepare_run → PLAYBOOK_NOT_APPLICABLE`の実結果を撮る。HistoryにもAgentの拒否記録が残る。

## テイク構成

### Take A — 人の実対応を記録

1. Cases → Aiko Tanaka / `R-2041`。
2. `Record work` → `Start recording`。
3. Estimated arrivalを`2026-08-31` / `21:30`にして`Save arrival`。
4. `Save meal box`。
5. Guest messageへ次を入力して`Save message draft`。

```text
Hello Aiko Tanaka, we noted your 21:30 arrival. Your meal box will be ready at reception.
```

6. Shift handoffへ次を入力して`Save handoff`。

```text
Aiko Tanaka arrives at 21:30. Leave the room key at the front desk.
```

7. `4 saved actions`と一覧を4秒保持。
8. `Finish recording`。Recorded work画面を4秒保持。

### Take B — WebMCPで草案を作る

画面の`Copy request for agent`でコピーした依頼を、そのページのツールを実行できるAgentへ送る。手でdemonstration IDを推測しない。

期待する呼び出し：

```text
teachback_get_demonstration → DEMONSTRATION_FOUND
teachback_create_draft → DRAFT_CREATED
```

Agentは次を満たすproposalを提出する。

- 記録された4操作だけを使う。
- guest nameとrequested arrivalを許可された`case_field`参照にする。
- Aiko向けに保存した文面を保つ。
- 到着上限は22:00を提案する。
- 公開、承認、反映を行わない。

草案作成後、`WebMCP connection`を開いて最新結果を撮る。続いてPlaybooksの`AI-authored draft`を撮る。

期待と異なる操作、記録にない操作、完成済みルールの受け取り、手動草案へのフォールバックが起きた場合はそのテイクを止める。

### Take C — 人が草案を確認して公開

1. Operationsで4操作を順に確認。
2. Guest messageまたはhandoffで次の左右比較を最低4秒保持。

```text
Actual response for Aiko Tanaka
For the next case
Guest name / Requested arrival
```

3. Conditionsへ進み、Latest arrivalを`22:00`から`21:45`へ変更。
4. `Save changes and validate`。
5. Review & publishへ進み、`I reviewed the recorded work, bindings and boundary`をチェック。
6. `Publish this playbook`。
7. Published / v1表示を4秒保持。

公開ボタンが有効にならない場合は、未保存の修正、open questions、validation issueを確認する。映像のために制約を緩めない。

### Take D — Emmaへの変更案をWebMCPで準備

1. Published playbookから`Use this playbook`。
2. Emma Wilson / `R-2048`を選ぶ。
3. 対応Agentへ次を送る。

```text
List the published playbooks and unhandled cases through WebMCP. Prepare a run for Emma Wilson, R-2048, using the latest published playbook version. Do not approve or apply anything. Stop after the exact tool results.
```

期待する呼び出し：

```text
teachback_list_playbooks
teachback_list_cases
teachback_prepare_run → RUN_PREPARED
```

4. Agentが別の案件を準備した場合は、サイトの`View this case`からEmmaへ移る。
5. Emma / 20:45、exact diff、`No changes have been applied yet.`、`Approve and apply`が読める画面を6秒保持。

別のplaybook version、別のcase version、UIの`Check conditions and prepare`による作成になった場合は、WebMCPの立証テイクとして採用しない。

### Take E — 人が承認・反映してAgentが結果を読む

1. 人がexact diffを確認して`Approve and apply`。
2. `Committed`と`Only the approved changes were applied.`を4秒保持。
3. Agentへ次を送る。

```text
Read the status of the run you just prepared through WebMCP. Do not perform any new action. Report the exact result.
```

期待する呼び出し：

```text
teachback_get_run → status: committed
```

4. Historyを開き、Human / Agent / Websiteの履歴を短く撮る。

この版では承認と反映をAgentに依頼しない。`teachback_commit_run`は登録されていない。

### Take F — 条件外の拒否

Agentへ次を送る。

```text
Using the same published playbook, prepare a run for Noah Martin, R-2060 through WebMCP. Do not use UI clicks or infer eligibility yourself. Report the exact tool result and stop.
```

期待する呼び出し：

```text
teachback_prepare_run → PLAYBOOK_NOT_APPLICABLE
```

実行後にCasesでNoahを選び、補償依頼があることを見せる。続けて`WebMCP connection`を開き、`teachback_prepare_run → PLAYBOOK_NOT_APPLICABLE`を最低4秒保持する。ツールの返値では`requestsCompensation` / `REQUEST_REQUIRES_PERSON`を確認し、変更案やRunが作られていないことを確認する。

## リテイク境界

- Take A完了前の失敗: sessionをリセットしてTake Aから。
- Draft不正: 公開せずTake Bだけやり直す。別draftが残った場合はsessionをリセットする。
- 公開後、Emma準備前の失敗: Take Dから。
- EmmaのRun作成後の失敗: 同じRunを保持して、承認前ならTake Eから。新しいRunを作らない。
- `Approve and apply`後の失敗: 反映を巻き戻さず、Take Eの結果確認から再収録する。
- Noah拒否の失敗: Emmaの完了状態を保持してTake Fだけ再収録する。

## 撮影直後の確認

- すべての採用素材が1920×1080、30fpsでデコードできる。
- Aikoの4操作、WebMCP読取、草案、変数比較、人の境界変更、公開、Emma変更案、人の反映、Noah拒否が揃っている。
- WebMCPの結果コードと画面状態が一致している。
- 公開・承認・反映をAgentが行ったように見える編集になっていない。
- tool登録と実呼び出しを混同していない。
- 生素材と旧94秒版を上書きしていない。

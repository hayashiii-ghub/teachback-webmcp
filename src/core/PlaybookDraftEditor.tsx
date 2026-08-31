import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CaretRight, CheckCircle, LockSimple, PencilSimple } from "@phosphor-icons/react";
import type {
  Demonstration,
  Operation,
  PlaybookDraft,
  PlaybookStep,
  Proposal,
  Result,
  TextToken,
} from "./domain";
import { createDraft, publishDraft, updateDraft } from "./teaching";
import {
  commandLabel,
  issueText,
  parseTemplate,
  templateText,
  type Translate,
} from "./ui-copy";
import "./draft-editor.css";

type EditorTab = "operations" | "conditions" | "review";

function recordedValue(demonstration: Demonstration, id: string, t: Translate) {
  const record = demonstration.commands.find((command) => command.id === id);
  if (!record) return t("根拠の記録が見つかりません", "Evidence not found");
  if ("text" in record.command.input) return record.command.input.text;
  if ("time" in record.command.input) return `${record.command.input.date} ${record.command.input.time}`;
  return t("軽食ボックス", "Late meal box");
}

function highlightedEvidence(text: string, demonstration: Demonstration): ReactNode {
  const values = [demonstration.before.guestDisplayName, demonstration.after.estimatedArrivalTime]
    .filter((value): value is string => Boolean(value));
  if (!values.length) return text;
  const pattern = new RegExp(`(${[...new Set(values)].map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text.split(pattern).map((part, index) =>
    values.includes(part) ? <mark key={index}>{part}</mark> : part,
  );
}

function TemplatePreview({ tokens, t }: { tokens: TextToken[]; t: Translate }) {
  return <>{tokens.map((token, index) => token.kind === "literal" ? token.value : (
    <span key={index} className="draft-token">
      {token.field === "guestDisplayName" ? t("ゲスト名", "Guest name") : t("希望到着時刻", "Requested arrival")}
    </span>
  ))}</>;
}

export function PlaybookDraftEditor({
  draft,
  demonstration,
  busy,
  act,
  t,
  onBack,
  onDirtyChange,
}: {
  draft: PlaybookDraft;
  demonstration: Demonstration;
  busy: boolean;
  act: (op: Operation) => Promise<Result>;
  t: Translate;
  onBack?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const tabsId = useId();
  const [tab, setTab] = useState<EditorTab>("operations");
  const [selectedStepId, setSelectedStepId] = useState(() =>
    draft.proposal.steps[0]?.id,
  );
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const wordingRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [baseline, setBaseline] = useState(() => ({ revision: draft.revision, proposal: JSON.stringify(draft.proposal), questionsText: draft.proposal.unresolvedQuestions.join("\n") }));
  const [proposal, setProposal] = useState<Proposal>(() =>
    structuredClone(draft.proposal),
  );
  // Preserve the in-progress line breaks separately from the validated list.
  const [questionsText, setQuestionsText] = useState(() => draft.proposal.unresolvedQuestions.join("\n"));
  const [confirmed, setConfirmed] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [json, setJson] = useState(JSON.stringify(proposal, null, 2));
  const [jsonError, setJsonError] = useState(false);
  const [saveError, setSaveError] = useState<Result | null>(null);
  const formDirty = JSON.stringify(proposal) !== baseline.proposal || questionsText !== baseline.questionsText;
  const jsonDirty = json !== JSON.stringify(proposal, null, 2);
  const dirty = formDirty || jsonDirty;
  const revisionChanged = draft.revision !== baseline.revision;
  const conflict = revisionChanged && dirty;
  const published = Boolean(draft.publishedPlaybookId);
  const editingDisabled = busy || published || revisionChanged || jsonDirty;
  const selectedIndex = Math.max(0, proposal.steps.findIndex((step) => step.id === selectedStepId));
  const selectedStep = proposal.steps[selectedIndex];
  const nextStep = proposal.steps[selectedIndex + 1];
  const goForward = () => {
    if (tab === "operations" && nextStep) {
      setSelectedStepId(nextStep.id);
      setEditingStepId(null);
    } else {
      setTab(tab === "operations" ? "conditions" : "review");
    }
  };
  const tabs: { id: EditorTab; label: string }[] = [
    { id: "operations", label: t("操作内容", "Operations") },
    { id: "conditions", label: t("適用条件", "Conditions") },
    { id: "review", label: t("確認・公開", "Review & publish") },
  ];
  const loadDraft = (next: PlaybookDraft) => {
    setProposal(structuredClone(next.proposal));
    const nextQuestions = next.proposal.unresolvedQuestions.join("\n");
    setQuestionsText(nextQuestions);
    setBaseline({ revision: next.revision, proposal: JSON.stringify(next.proposal), questionsText: nextQuestions });
    setJson(JSON.stringify(next.proposal, null, 2));
    setConfirmed(false);
    setJsonError(false);
    setSaveError(null);
  };
  useEffect(() => {
    if (!revisionChanged) return;
    setConfirmed(false);
    // Keep in-progress edits when an agent updates the same draft. Only an
    // explicit reload may discard them; publication always uses this baseline.
    if (!dirty) loadDraft(draft);
  }, [draft, revisionChanged, dirty]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => { if (editingStepId) wordingRef.current?.focus(); }, [editingStepId]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const headerHeight = window.innerWidth <= 650
      ? document.querySelector(".workspace-sidebar")?.getBoundingClientRect().height ?? 0
      : 0;
    const top = panel.getBoundingClientRect().top;
    if (top < headerHeight || top > window.innerHeight - 160) {
      window.scrollTo({ top: Math.max(0, window.scrollY + top - headerHeight - 16), behavior: "instant" });
    }
  }, [tab, selectedStepId]);
  const patch = (value: Partial<Proposal>) => {
    const next = { ...proposal, ...value };
    setProposal(next);
    setJson(JSON.stringify(next, null, 2));
    setConfirmed(false);
    setSaveError(null);
  };
  const patchStep = (index: number, step: PlaybookStep) =>
    patch({ steps: proposal.steps.map((s, i) => (i === index ? step : s)) });
  const save = async (input: unknown) => {
    setConfirmed(false);
    const result = await act((state) => updateDraft(state, draft.id, baseline.revision, input, "Human"));
    if (result.ok && result.code === "DRAFT_UPDATED" && result.data) {
      loadDraft(result.data as PlaybookDraft);
    } else {
      setSaveError(result);
    }
  };
  const fixedChecks = [
    t("予約が確定している", "Reservation is confirmed"),
    t("到着日が本日・未チェックイン", "Arriving today and not checked in"),
    t("希望する到着日・時刻が分かっている", "Requested arrival date and time are known"),
    t("変更内容の承認が毎回必要", "Every exact proposal needs human approval"),
  ];
  const escalations = [
    t("新しい食事制限", "New dietary request"), t("タクシー手配", "Taxi request"),
    t("金銭補償", "Compensation"), t("キャンセル", "Cancellation"),
    t("支払情報の変更", "Payment changes"), t("必要な情報が不明な案件", "Cases with missing safety information"),
  ];
  return (
    <section className="draft-editor" aria-label={t("手順の草案編集", "Playbook draft editor")}>
      <header className="draft-header">
        <p className="draft-breadcrumb">{t("手順", "Playbooks")} <span>/</span> {published ? t("公開済み", "Published") : t("草案", "Draft")}</p>
        {onBack && <button className="draft-back" onClick={onBack} disabled={busy}><ArrowLeft size={18} aria-hidden="true" />{t("手順一覧に戻る", "Back to playbooks")}</button>}
        <div className="draft-title-row"><h1>{proposal.name}</h1><span className="draft-badge">{published ? t("公開済み", "Published") : t("草案", "Draft")}</span></div>
        <div className="draft-provenance">
          <span>{t("元の対応", "Recorded work")} <strong>{demonstration.before.guestDisplayName}</strong> <span aria-hidden="true">·</span> {demonstration.caseId}</span>
          <span>{draft.createdBy === "Agent" ? t("AIが作成した草案", "AI-authored draft") : t("人が作成した草案", "Human-authored draft")}</span>
        </div>
        <div role="tablist" aria-label={t("草案の確認手順", "Draft review stages")} className="draft-tabs">
          {tabs.map((item, index) => <button key={item.id} id={`${tabsId}-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`${tabsId}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
            if (next !== null) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`${tabsId}-${tabs[next].id}`)?.focus(); }
          }}>{item.label}</button>)}
        </div>
      </header>

      {conflict && !busy && <div className="draft-conflict core-notice" role="alert">
        <h3>{t("編集中に草案が更新されました", "This draft changed while you were editing")}</h3>
        <p>{t("入力中の内容は残しています。最新の草案を読み直してから、内容を確認してください。", "Your edits are still here. Load the latest draft and review it before continuing.")}</p>
        <button className="core-secondary" onClick={() => loadDraft(draft)}>{t("入力中の変更を破棄して最新版を読み込む", "Discard local edits and load latest draft")}</button>
      </div>}
      {saveError && <div className="draft-conflict core-notice" role="alert"><h3>{t("変更を保存できませんでした", "Changes could not be saved")}</h3>{saveError.issues?.length ? <ul>{saveError.issues.map((issue, index) => <li key={index}>{issueText(issue, t)}</li>)}</ul> : <p>{saveError.summary}</p>}</div>}

      <div ref={panelRef} role="tabpanel" id={`${tabsId}-panel-${tab}`} aria-labelledby={`${tabsId}-${tab}`} tabIndex={0} className={`draft-panel draft-panel-${tab}`}>
        {tab === "operations" && <div className="draft-operation-layout">
          <nav className="draft-operation-nav" aria-label={t("手順の操作", "Playbook operations")}>
            <h2>{t(`${proposal.steps.length}つの操作`, `${proposal.steps.length} operations`)}</h2>
            <ol>{proposal.steps.map((step, index) => <li key={step.id}><button aria-current={selectedStep?.id === step.id ? "step" : undefined} onClick={() => setSelectedStepId(step.id)}><span className="draft-step-number">{String(index + 1).padStart(2, "0")}</span><span>{commandLabel(step.type, t)}</span><CaretRight size={15} aria-hidden="true" /></button></li>)}</ol>
          </nav>
          {selectedStep && <div className="draft-operation-detail" data-value-kind={"template" in selectedStep.input ? "wording" : "binding"}>
            <p className="draft-step-count">{t("操作", "Operation")} {String(selectedIndex + 1).padStart(2, "0")} / {String(proposal.steps.length).padStart(2, "0")}</p>
            <h2>{commandLabel(selectedStep.type, t)}</h2>
            <p className="draft-detail-intro">{t("元の対応と、次の案件で使う内容を確認します。", "Compare the recorded response with what will be reused for another case.")}</p>
            <div className="draft-comparison">
              <section className="draft-source" aria-label={t("元の記録", "Recorded evidence")}>
                <h3>{t(`${demonstration.before.guestDisplayName}への実際の対応`, `Actual response for ${demonstration.before.guestDisplayName}`)}</h3>
                <p className="draft-column-note">{t("元の記録・参照のみ", "Recorded evidence · Read-only")}</p>
                <div className="draft-wording draft-source-wording">{selectedStep.evidenceCommandIds.map((id) => <p key={id}>{highlightedEvidence(recordedValue(demonstration, id, t), demonstration)}</p>)}</div>
              </section>
              <section className="draft-reusable" aria-label={t("次の案件で使う内容", "Reusable operation")}>
                <div className="draft-column-title"><h3>{t("次の案件で使う内容", "For the next case")}</h3>{"template" in selectedStep.input && editingStepId === selectedStep.id && <button className="draft-edit-toggle" onClick={() => setEditingStepId(null)}>{t("表示に戻る", "Preview")}</button>}</div>
                <p className="draft-column-note">{published ? t("公開済み・参照のみ", "Published · Read-only") : !("template" in selectedStep.input) ? t("草案の入力値・参照のみ", "Draft inputs · Read-only") : draft.createdBy === "Agent" ? t("AIの草案・編集できます", "AI draft · Editable") : t("人の草案・編集できます", "Human draft · Editable")}</p>
                {"template" in selectedStep.input ? editingStepId === selectedStep.id ? <label className="draft-wording-field"><span className="core-sr">{t("再利用する文面", "Reusable wording")}</span><textarea ref={wordingRef} className="draft-wording" disabled={editingDisabled} rows={7} maxLength={1300} value={templateText(selectedStep.input.template)} onChange={(event) => patchStep(selectedIndex, { ...selectedStep, input: { template: parseTemplate(event.target.value) } } as PlaybookStep)} /><small>{t("名前は {{guestDisplayName}}、希望時刻は {{requestedArrivalTime}}", "Use {{guestDisplayName}} for the name and {{requestedArrivalTime}} for the requested time.")}</small></label> : <button className="draft-wording draft-wording-preview" aria-label={t("再利用する文面を編集", "Edit reusable wording")} disabled={editingDisabled} onClick={() => setEditingStepId(selectedStep.id)}><span className="draft-preview-content"><TemplatePreview tokens={selectedStep.input.template} t={t} /></span><PencilSimple className="draft-wording-pencil" size={16} aria-hidden="true" /></button> : <div className="draft-wording draft-binding-wording">{selectedStep.type === "set_estimated_arrival" ? <><span className="draft-token">{t("希望到着日", "Requested arrival date")}</span><span className="draft-token">{t("希望到着時刻", "Requested arrival time")}</span><p>{t("適用先の予約情報を使います。", "Uses the requested date and time from the next reservation.")}</p></> : <><span className="draft-token">{t("軽食ボックス", "Late meal box")}</span><p>{t("記録した食事変更を再利用します。", "Reuses the recorded meal-service change.")}</p></>}</div>}
              </section>
            </div>
            <p className="draft-binding-note">{selectedStep.type === "set_meal_service" ? t("夕食付きで、通常の夕食が設定されている予約だけに使えます。", "Only available for dinner-inclusive reservations currently set to regular dinner.") : selectedStep.type === "set_estimated_arrival" ? t("希望する到着日時が分かっていて、適用条件を満たす予約だけに使えます。", "The requested arrival must be known and meet the playbook conditions.") : t("名前と到着時刻は、適用先の予約に合わせて変わります。記録にない操作は追加できません。", "Names and arrival times follow the next reservation. Unrecorded operations cannot be added.")}</p>
            {selectedStep.rationale && <details className="draft-rationale"><summary>{t("この使い方を提案した理由", "Why this binding was proposed")}</summary><p>{selectedStep.rationale}</p></details>}
          </div>}
        </div>}

        {tab === "conditions" && <div className="draft-conditions">
          <div className="draft-section-intro"><p className="draft-step-count">{t("人が決める範囲", "Human-set boundary")}</p><h2>{t("この手順を使える条件", "When this playbook can be used")}</h2><p>{t("条件から外れる案件は、この手順で進めず担当者へ返します。", "Cases outside these conditions are handed back to a person.")}</p></div>
          <div className="draft-condition-columns"><fieldset className="core-fields draft-boundary-fields" disabled={editingDisabled}>
            <label>{t("対応する最終到着時刻（22:00まで）", "Latest arrival (no later than 22:00)")}<input type="time" max="22:00" value={proposal.proposedBoundary.latestArrivalTime} onInput={(event) => patch({ proposedBoundary: { latestArrivalTime: event.currentTarget.value } })} onChange={(event) => patch({ proposedBoundary: { latestArrivalTime: event.target.value } })} /></label>
            <p className="draft-field-note">{t("施設の上限は22:00です。より早い時刻に絞れます。", "The facility limit is 22:00. You can choose an earlier cutoff.")}</p>
            <label>{t("未解決の確認事項（1行に1件）", "Open questions (one per line)")}<textarea rows={4} value={questionsText} onChange={(event) => { setQuestionsText(event.target.value); patch({ unresolvedQuestions: event.target.value.split("\n").filter(Boolean) }); }} /></label>
            <p className="draft-field-note">{t("確認事項が残っている間は公開できません。", "Resolve open questions before publishing.")}</p>
          </fieldset><section className="draft-fixed-safeguards"><h3><LockSimple size={18} aria-hidden="true" />{t("固定の安全制約", "Fixed safeguards")}</h3><ul>{fixedChecks.map((check) => <li key={check}><CheckCircle size={17} aria-hidden="true" /><span>{check}</span></li>)}</ul><h3>{t("担当者に返す案件", "Always handled by a person")}</h3><ul className="draft-escalations">{escalations.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
        </div>}

        {tab === "review" && <div className="draft-review">
          <div className="draft-section-intro"><p className="draft-step-count">{t("最後に確認", "Final review")}</p><h2>{t("再利用する手順を確定する", "Confirm the reusable playbook")}</h2><p>{t("公開しても予約は変更されません。再利用する際の変更案には、毎回承認が必要です。", "Publishing does not change reservations. Every prepared proposal still needs approval before it is applied.")}</p></div>
          <div className="draft-review-columns"><fieldset disabled={editingDisabled} className="core-fields draft-review-fields"><label>{t("手順の名前", "Playbook name")}<input value={proposal.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} /></label><label>{t("目的", "Purpose")}<textarea value={proposal.purpose} rows={3} maxLength={500} onChange={(event) => patch({ purpose: event.target.value })} /></label></fieldset><section className="draft-review-summary"><h3>{t("公開する内容", "What will be published")}</h3><ol>{proposal.steps.map((step) => <li key={step.id}>{commandLabel(step.type, t)}</li>)}</ol><dl><div><dt>{t("到着時刻の上限", "Arrival cutoff")}</dt><dd>{proposal.proposedBoundary.latestArrivalTime}</dd></div><div><dt>{t("元の対応", "Recorded work")}</dt><dd>{demonstration.before.guestDisplayName} · {demonstration.caseId}</dd></div></dl></section></div>
          {draft.validationIssues.length > 0 && <div className="core-notice" role="alert"><h3>{t("公開前に確認が必要です", "Review required before publishing")}</h3><ul>{draft.validationIssues.map((issue, index) => <li key={index}>{issueText(issue, t)}</li>)}</ul></div>}
          {published ? <p className="draft-published core-success"><CheckCircle size={22} aria-hidden="true" />{t("この草案は公開済みです。別の予約で再利用できます。", "This draft is published and ready for another case.")}</p> : <div className="draft-confirmation"><label className="core-checkbox"><input type="checkbox" checked={confirmed} disabled={busy || dirty || revisionChanged || draft.validationIssues.length > 0} onChange={(event) => setConfirmed(event.target.checked)} />{t("元の対応、変数、適用条件を確認しました", "I reviewed the recorded work, bindings and boundary")}</label>{dirty && <p>{t("先に修正を保存して再検査してください。", "Save and validate your edits first.")}</p>}</div>}
          <details open={jsonOpen} onToggle={(event) => setJsonOpen(event.currentTarget.open)} className="draft-advanced"><summary>{t("構造化データを編集", "Edit structured proposal")}</summary><p>{t("手順・変数の詳細を変更する上級者向けの入力です。同じ検査が適用されます。", "Advanced step and binding editing. The same validation applies.")}</p><textarea className="core-json" aria-label={t("草案JSON", "Proposal JSON")} disabled={busy || published || revisionChanged} value={json} onChange={(event) => { setJson(event.target.value); setConfirmed(false); setSaveError(null); }} /><button className="core-secondary" disabled={busy || published || revisionChanged || !dirty} onClick={() => { try { const parsed: unknown = JSON.parse(json); setJsonError(false); void save(parsed); } catch { setJsonError(true); } }}>{t("構造化データを検査して保存", "Validate and save structured proposal")}</button>{jsonError && <p role="alert">{t("JSONの形式を確認してください。", "Check the JSON syntax.")}</p>}</details>
          <details className="draft-advanced"><summary>{t("最初に届いた草案と変更履歴", "Original proposal and revisions")}</summary><pre className="core-json-read">{JSON.stringify({ original: draft.originalProposal, changes: draft.changes }, null, 2)}</pre></details>
        </div>}
      </div>

      <footer className="draft-footer">
        <p>{jsonDirty ? t("構造化データの編集を保存してから続けてください。", "Save your structured-proposal edits before continuing.") : dirty ? t("未保存の変更があります。公開前に保存・再検査が必要です。", "Unsaved changes must be saved and validated before publishing.") : published ? t("公開済みの手順は、別の案件で再利用できます。", "This published playbook can be reused for another case.") : t("公開するまで、他の案件には使われません。", "This playbook cannot be reused until you publish it.")}</p>
        <div className="draft-footer-actions">
          {formDirty && !jsonDirty && !published && <button className="core-primary" disabled={busy || revisionChanged} onClick={() => void save(proposal)}>{t("修正して再検査", "Save changes and validate")}</button>}
          {jsonDirty && tab !== "review" && <button className="core-secondary" onClick={() => { setTab("review"); setJsonOpen(true); }}>{t("構造化データを確認", "Review structured proposal")}</button>}
          {tab !== "review" ? !dirty && <button className="core-primary" disabled={busy || revisionChanged} onClick={goForward}>{tab === "operations" ? nextStep ? t("次の操作を確認", "Next operation") : t("適用条件を確認", "Review conditions") : t("公開前に確認", "Review before publishing")}<ArrowRight size={20} aria-hidden="true" /></button> : !published && <button className={dirty ? "core-secondary" : "core-primary"} disabled={busy || !confirmed || dirty || revisionChanged || draft.validationIssues.length > 0} onClick={() => void act((state) => publishDraft(state, draft.id, baseline.revision, true))}>{t("この手順を公開する", "Publish this playbook")}<ArrowRight size={20} aria-hidden="true" /></button>}
        </div>
      </footer>
    </section>
  );
}
export function ManualDraft({
  demonstration,
  busy,
  act,
  t,
  onDirtyChange,
}: {
  demonstration: Demonstration;
  busy: boolean;
  act: (op: Operation) => Promise<Result>;
  t: Translate;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [json, setJson] = useState("");
  const [invalid, setInvalid] = useState(false);
  const dirty = json.length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  return (
    <details className="core-section">
      <summary>
        {t(
          "Agentを使わず手動で草案を入力",
          "Enter a draft manually without an agent",
        )}
      </summary>
      <p>
        {t(
          "ここから入力した内容は「人が作成」と記録します。AIによる作成として扱いません。",
          "This input is recorded as human-authored, not AI-generated.",
        )}
      </p>
      <label>
        {t("草案JSON", "Proposal JSON")}
        <textarea
          className="core-json"
          disabled={busy}
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </label>
      <button
        className="core-secondary"
        disabled={busy || !json.trim()}
        onClick={() => {
          try {
            const proposal = JSON.parse(json);
            setInvalid(false);
            void act((s) =>
              createDraft(
                s,
                demonstration.id,
                demonstration.digest!,
                proposal,
                "Human",
              ),
            );
          } catch {
            setInvalid(true);
          }
        }}
      >
        {t("手動の草案を検査", "Validate manual draft")}
      </button>
      {invalid && (
        <p role="alert">
          {t("JSONの形式を確認してください。", "Check the JSON syntax.")}
        </p>
      )}
    </details>
  );
}

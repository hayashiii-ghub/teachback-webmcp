import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, CaretRight, ListChecks, Plus } from "@phosphor-icons/react";
import type { Demonstration, PlaybookDraft, PublishedPlaybook } from "./domain";
import { commandLabel, templateText, type Translate } from "./ui-copy";

export function ProcedureLibrary({ drafts, playbooks, demonstrations, t, onDraft, onPublished, onRecording, onRecord }: {
  drafts: PlaybookDraft[]; playbooks: PublishedPlaybook[]; demonstrations: Demonstration[]; t: Translate;
  onDraft(draft: PlaybookDraft): void; onPublished(playbook: PublishedPlaybook): void;
  onRecording(demonstration: Demonstration): void; onRecord(): void;
}) {
  const pending = drafts.filter(d => !d.publishedPlaybookId);
  const recorded = demonstrations.filter(d => !drafts.some(draft => draft.sourceDemonstrationId === d.id));
  const source = (id: string) => demonstrations.find(d => d.id === id)?.before;
  return <div className="procedure-library">
    <header className="workspace-page-heading"><div><p className="core-eyebrow">{t("手順", "Playbooks")}</p><h1>{t("対応を、再利用できる手順に", "Make recorded work reusable")}</h1></div><button className="core-secondary" onClick={onRecord}><Plus size={18} aria-hidden="true" />{t("対応を記録する", "Record work")}</button></header>
    <p className="core-muted">{t("元の記録を確認し、操作と条件を整えてから公開します。", "Review the source, refine its steps and conditions, then publish.")}</p>
    {!pending.length && !playbooks.length && !recorded.length ? <section className="workspace-empty"><ListChecks size={34} aria-hidden="true" /><h2>{t("まだ手順はありません", "No playbooks yet")}</h2><p>{t("まず案件で一件の対応を記録してください。Agentがその記録から草案を作ります。", "Record a response in Cases. An agent can turn that actual work into a draft.")}</p><button className="core-primary" onClick={onRecord}>{t("最初の対応を記録する", "Record the first response")}</button></section> : <>
      {pending.length > 0 && <section aria-label={t("草案", "Drafts")}><h2>{t("確認する草案", "Drafts to review")} <small>{pending.length}</small></h2><div className="procedure-list">{[...pending].reverse().map(d => <button key={d.id} onClick={() => onDraft(d)}><span className="procedure-row-main"><strong>{d.proposal.name}</strong><small>{t("元の対応", "Source")}: {source(d.sourceDemonstrationId)?.guestDisplayName} · {source(d.sourceDemonstrationId)?.id} · {d.proposal.steps.length} {t("操作", "operations")}</small></span><span className="procedure-badge">{t("草案", "Draft")}</span><CaretRight size={18} aria-hidden="true" /></button>)}</div></section>}
      {recorded.length > 0 && <section aria-label={t("草案にする記録", "Recorded work")}><h2>{t("草案にする記録", "Recorded work")}</h2><div className="procedure-list">{recorded.map(d => <button key={d.id} onClick={() => onRecording(d)}><span className="procedure-row-main"><strong>{d.before.guestDisplayName} · {d.caseId}</strong><small>{d.commands.length} {t("操作を記録済み", "recorded operations")}</small></span><span className="procedure-badge">{t("草案の作成へ", "Create a draft")}</span><CaretRight size={18} aria-hidden="true" /></button>)}</div></section>}
      {playbooks.length > 0 && <section aria-label={t("公開した手順", "Published playbooks")}><h2>{t("公開した手順", "Published playbooks")} <small>{playbooks.length}</small></h2><div className="procedure-list">{[...playbooks].reverse().map(p => <button key={`${p.id}:${p.version}`} onClick={() => onPublished(p)}><span className="procedure-row-main"><strong>{p.name} <span>· v{p.version}</span></strong><small>{t("元の対応", "Source")}: {source(p.sourceDemonstrationId)?.guestDisplayName} · {p.steps.length} {t("操作", "operations")} · {t("到着", "Arrival")} {p.boundary.latestArrivalTime}{t("まで", " or earlier")}</small></span><span className="procedure-badge is-published">{t("公開済み", "Published")}</span><CaretRight size={18} aria-hidden="true" /></button>)}</div></section>}
    </>}
  </div>;
}

export function PublishedProcedure({ playbook: p, demonstration, t, busy, isLatest, onBack, onUse, onNextVersion, onLatestVersion }: {
  playbook: PublishedPlaybook; demonstration?: Demonstration; t: Translate; busy: boolean; isLatest: boolean;
  onBack(): void; onUse(): void; onNextVersion(): void; onLatestVersion(): void;
}) {
  const tabsId = useId();
  const [tab, setTab] = useState<"operations" | "conditions">("operations");
  const [stepIndex, setStepIndex] = useState(0);
  const step = p.steps[stepIndex] ?? p.steps[0];
  const tabs = [
    { id: "operations", label: t("操作内容", "Operations") },
    { id: "conditions", label: t("適用条件", "Conditions") },
  ] as const;
  return <article className="published-procedure">
    <header className="procedure-detail-heading"><p className="core-eyebrow">{t("手順 / 公開済み", "Playbooks / Published")}</p><button className="core-text workspace-back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />{t("手順一覧に戻る", "Back to playbooks")}</button><div className="procedure-title"><h1>{p.name}</h1><span className="procedure-badge is-published">v{p.version} · {t("公開済み", "Published")}</span></div><p className="core-muted">{t("元の対応", "Source work")} {demonstration?.before.guestDisplayName} · {demonstration?.caseId} <span>{t("人が確認・公開", "Reviewed and published by a person")}</span></p></header>
    <div className="procedure-tabs" role="tablist" aria-label={t("公開した手順の内容", "Published playbook details")}>
      {tabs.map((item, index) => <button key={item.id} id={`${tabsId}-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`${tabsId}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`${tabsId}-${tabs[next].id}`)?.focus(); }
      }}>{item.label}</button>)}
    </div>
    <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} tabIndex={0}>
      {tab === "operations" ? <div className="published-operation-layout"><nav aria-label={t("手順の操作", "Playbook operations")}><h2>{p.steps.length}{t("つの操作", " operations")}</h2>{p.steps.map((s, index) => <button key={s.id} aria-current={stepIndex === index ? "step" : undefined} onClick={() => setStepIndex(index)}><span>{String(index + 1).padStart(2, "0")}</span>{commandLabel(s.type, t)}<CaretRight size={16} aria-hidden="true" /></button>)}</nav><section className="published-operation"><p className="core-eyebrow">{t("操作", "Operation")} {String(stepIndex + 1).padStart(2, "0")} / {String(p.steps.length).padStart(2, "0")}</p><h2>{commandLabel(step.type, t)}</h2><p className="core-muted">{p.purpose}</p><div className="published-wording">{"template" in step.input ? templateText(step.input.template) : step.type === "set_estimated_arrival" ? t("次の予約の希望到着日・時刻を使う", "Use the next case’s requested arrival date and time") : t("軽食ボックスへの変更を再利用する", "Reuse the change to a late meal box")}</div><p className="core-muted">{step.rationale}</p></section></div> : <section className="published-conditions"><h2>{t("適用できる範囲", "Where this playbook applies")}</h2><dl className="core-meta"><div><dt>{t("最終到着時刻", "Latest arrival")}</dt><dd>{p.boundary.latestArrivalTime}</dd></div><div><dt>{t("対象の予約", "Eligible reservations")}</dt><dd>{t("確定・本日到着・未チェックイン", "Confirmed, today, not checked in")}</dd></div><div><dt>{t("承認", "Approval")}</dt><dd>{t("変更案ごと・1回限り・5分間", "Per proposal · once · five minutes")}</dd></div></dl><p>{t("食事制限・タクシー・補償・キャンセル・支払変更は担当者に戻します。", "Dietary, taxi, compensation, cancellation and payment requests go to a person.")}</p></section>}
    </div>
    {!isLatest && <p className="procedure-version-note core-muted">{t("以前に公開した版を表示しています。手順を改訂する場合は、最新版を確認してください。", "This is an earlier published version. Open the latest version before creating a revision.")}</p>}
    <footer className="procedure-footer"><button className="core-text" disabled={busy} onClick={isLatest ? onNextVersion : onLatestVersion}>{isLatest ? t("この手順の次の版を作る", "Create the next version") : t("最新版を見る", "View latest version")}</button><button className="core-primary" disabled={busy} onClick={onUse}>{t("案件で再利用する", "Reuse on a case")}<ArrowRight size={20} aria-hidden="true" /></button></footer>
  </article>;
}

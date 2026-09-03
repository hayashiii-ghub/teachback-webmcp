import {
  useEffect,
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DemoSession } from "../DemoSession";
import { ArrowCounterClockwise, ArrowLeft, ArrowRight, CaretLeft, CaretRight, ClockCounterClockwise, Files, ListChecks, X, Circle, ArrowSquareOut } from "@phosphor-icons/react";
import type {
  Demonstration,
  Operation,
  PlaybookDraft,
  PreparedRun,
  PublishedPlaybook,
  Reservation,
  Result,
} from "./domain";
import { createSessionStore, type SessionStorage } from "./persistence";
import { createSession } from "./fixtures";
import { createDraft } from "./teaching";
import {
  approvalStatus,
  approveRun,
  commitRun,
  discardRun,
  prepareRun,
} from "./playbook-runtime";
import { evaluatePolicy } from "./playbook-policy";
import {
  registerCoreTools,
  type ConnectionStatus,
  type SiteCall,
} from "./webmcp";
import { RecordingPanel } from "./RecordingPanel";
import { ManualDraft, PlaybookDraftEditor } from "./PlaybookDraftEditor";
import { ProcedureLibrary, PublishedProcedure } from "./ProcedureLibrary";
import {
  commandLabel,
  fieldLabel,
  issueText,
  translate,
  valueText,
  type Locale,
  type Translate,
} from "./ui-copy";
import "./workflow.css";
import "./workspace.css";
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="core-dialog"
      aria-labelledby={titleId}
      onKeyDown={e => {
        if (e.key !== "Tab") return;
        const controls = [...e.currentTarget.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href], summary, [tabindex]")]
          .filter(control => control.tabIndex >= 0 && !control.matches(":disabled") && control.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="core-section-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="core-text"
          autoFocus
          onClick={close}
          aria-label="Close / 閉じる"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function exportJson(name: string, content: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem("teachback-ui-locale-v1");
    if (saved === "ja" || saved === "en") return saved;
  } catch {
    /* Optional preference. */
  }
  return navigator.language.startsWith("ja") ? "ja" : "en";
}
const unavailableStorage: SessionStorage = {
  getItem() { throw new Error("Browser storage is unavailable."); },
  setItem() { throw new Error("Browser storage is unavailable."); },
};
function createBrowserSessionStore() {
  let storage: SessionStorage;
  try {
    storage = window.localStorage;
  } catch {
    storage = unavailableStorage;
  }
  return createSessionStore(storage);
}
async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
function resultText(result: Result, t: Translate) {
  const text: Record<string, string> = {
    PERSISTENCE_FAILED: t(
      "保存できませんでした。変更は確定していません。空き容量・ブラウザ設定を確認して再試行してください。",
      result.summary,
    ),
    SESSION_BUSY: t(
      "別の処理を実行中です。完了してから再試行してください。",
      result.summary,
    ),
    SESSION_CAPACITY_REACHED: t(
      "このデモセッションの記録上限に達しました。履歴から退避した後、明示的に新しいセッションを開始してください。既存の内容は変更していません。",
      result.summary,
    ),
    RUN_NOT_APPROVED: t(
      "まだ承認されていません。変更内容を確認し、画面から承認してください。",
      result.summary,
    ),
    APPROVAL_EXPIRED: t(
      "承認期限が切れました。変更案を作り直して、もう一度確認・承認してください。",
      result.summary,
    ),
    RUN_COMMITTED: t("承認した変更を反映しました。", result.summary),
    RUN_PREPARED: t(
      "変更案を作りました。予約はまだ変更していません。",
      result.summary,
    ),
    PLAYBOOK_PUBLISHED: t(
      "手順を公開しました。別の予約で再利用できます。",
      result.summary,
    ),
    RECORDING_STARTED: t("対応の記録を始めました。", result.summary),
    COMMAND_RECORDED: t("予約の変更と操作記録を保存しました。", result.summary),
    RECORDING_COMPLETED: t(
      "記録を完了しました。次にAgentへ草案作成を依頼してください。",
      result.summary,
    ),
    RECORDING_CANCELLED: t(
      "記録を中止しました。保存済みの予約変更は残っています。",
      result.summary,
    ),
    DRAFT_CREATED: t(
      "草案を保存しました。元の対応と適用条件を確認してください。",
      result.summary,
    ),
    DRAFT_UPDATED: t("修正した草案を再検査しました。", result.summary),
    PLAYBOOK_NOT_APPLICABLE: t(
      "この予約は手順の対象外です。下の理由を確認し、担当者が個別に対応してください。",
      result.summary,
    ),
    RUN_APPROVED: t(
      "この変更案は承認済みです。内容を確認し、この画面から反映してください。",
      "This proposal is approved. Review it and apply the changes here.",
    ),
  };
  return text[result.code] ?? result.summary;
}
function statusText(
  c: Reservation,
  run: PreparedRun | undefined,
  t: Translate,
) {
  if (c.handled) return t("対応済み", "Handled");
  const approval = run ? approvalStatus(run) : "none";
  if (approval === "expired")
    return t("承認期限切れ・再確認", "Approval expired · review again");
  if (approval === "invalid")
    return t("承認が無効・再作成", "Approval invalid · prepare again");
  if (approval === "valid")
    return t("承認済み・反映待ち", "Approved · awaiting application");
  if (run?.status === "awaiting_review")
    return t("変更案の確認待ち", "Awaiting review");
  return t("未対応", "Unhandled");
}
function Workspace() {
  const [store] = useState(createBrowserSessionStore);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = translate(locale);
  const [stage, setStage] = useState<"record" | "draft" | "reuse">(() =>
    state.recordingId
      ? "record"
      : state.playbooks.length
        ? "reuse"
        : "record",
  );
  const [view, setView] = useState<"cases" | "playbooks" | "history">("cases");
  const [procedureOpen, setProcedureOpen] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [publishedKey, setPublishedKey] = useState("");
  const dirtyEditor = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => { dirtyEditor.current = dirty; }, []);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [selectedId, setSelectedId] = useState(
    () =>
      state.demonstrations.find((d) => d.id === state.recordingId)?.caseId ??
      state.reservations[0]?.id ??
      "",
  );
  const [demoId, setDemoId] = useState("");
  const [playbookKey, setPlaybookKey] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [modal, setModal] = useState<"connection" | "reset" | "legacy" | null>(null);
  const [casePicker, setCasePicker] = useState<
    | { mode: "record" }
    | { mode: "reuse"; playbookId: string; playbookVersion: number }
    | null
  >(null);
  const [connection, setConnection] = useState<ConnectionStatus>("registering");
  const [lastCall, setLastCall] = useState<SiteCall | null>(null);
  const latestAgentEvent = state.audit.find(
    (a) => a.actor === "Agent" && a.caseId,
  );
  const latestAgentCase = state.reservations.find(
    (item) => item.id === latestAgentEvent?.caseId,
  );
  const [copied, setCopied] = useState(false);
  const [, setClock] = useState(Date.now());
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, procedureOpen, publishedKey, selectedDraftId]);
  const load = store.getLoadStatus();
  const ready = load.kind === "ready";
  useEffect(() => {
    if (!ready) return;
    return registerCoreTools(
      document.modelContext,
      store,
      setConnection,
      (call) => {
        setLastCall(call);
        setResult(null);
        if (call.ok && /create_draft|update_draft/.test(call.name)) {
          const snapshot = store.getSnapshot();
          const received = snapshot.drafts.find((d) => d.id === call.draftId);
          if (!received || snapshot.recordingId || dirtyEditor.current) return;
          setDemoId(received.sourceDemonstrationId);
          setSelectedDraftId(received.id);
          setPublishedKey("");
          setProcedureOpen(true);
          setView("playbooks");
          setStage("draft");
        }
      },
    );
  }, [store, ready]);
  useEffect(() => {
    const cancel = () => store.cancelPending();
    window.addEventListener("pagehide", cancel);
    return () => {
      cancel();
      window.removeEventListener("pagehide", cancel);
    };
  }, [store]);
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem("teachback-ui-locale-v1", locale);
    } catch {
      /* Preference only. */
    }
  }, [locale]);
  const c =
    state.reservations.find((c) => c.id === selectedId) ??
    state.reservations[0];
  const recording = state.demonstrations.find(
    (d) => d.id === state.recordingId,
  );
  const completed = state.demonstrations.filter(
    (d) => d.status === "completed",
  );
  const demonstration = completed.find((d) => d.id === demoId) ?? completed[0];
  // Keep the explicit selection: a new agent draft must not replace manual
  // input while the user is still editing the source screen.
  const draft = state.drafts.find(d => d.id === selectedDraftId && d.sourceDemonstrationId === demonstration?.id);
  const published = state.playbooks.find(p => `${p.id}:${p.version}` === publishedKey);
  const latestPublished = published && state.playbooks
    .filter(p => p.id === published.id)
    .reduce((latest, p) => p.version > latest.version ? p : latest, published);
  const pickerPlaybook = casePicker?.mode === "reuse"
    ? state.playbooks.find(p => p.id === casePicker.playbookId && p.version === casePicker.playbookVersion)
    : undefined;
  const run = c ? state.runsById[state.activeRunIdByCaseId[c.id]] : undefined;
  const runPlaybook = run
    ? state.playbooks.find(
        (p) => p.id === run.playbookId && p.version === run.playbookVersion,
      )
    : undefined;
  const playbook =
    run && ["awaiting_review", "approved", "committed"].includes(run.status)
      ? runPlaybook
      : (state.playbooks.find((p) => `${p.id}:${p.version}` === playbookKey) ??
        state.playbooks.at(-1));
  const currentApprovalStatus = run ? approvalStatus(run, Date.now()) : "none";
  const expired = currentApprovalStatus === "expired";
  const invalidApproval = currentApprovalStatus === "invalid";
  const active = run && ["awaiting_review", "approved"].includes(run.status);
  useEffect(() => {
    if (run?.status !== "approved" || !run.approval) return;
    const expiresAt = Date.parse(run.approval.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setClock(Date.now());
      return;
    }
    const timer = window.setTimeout(() => setClock(Date.now()), remaining);
    return () => window.clearTimeout(timer);
  }, [run?.id, run?.status, run?.approval?.expiresAt]);
  const filtered = state.reservations.filter((c) =>
    `${c.id} ${c.guestDisplayName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const pageCount = Math.ceil(filtered.length / 4);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const shown = filtered.slice(safePage * 4, safePage * 4 + 4);
  const act = async (operation: Operation): Promise<Result> => {
    setBusy(true);
    setResult(null);
    const recordingBefore = store.getSnapshot().recordingId;
    try {
      const next = await store.dispatch(operation);
      setResult(next);
      const updated = store.getSnapshot();
      if (next.ok && next.code === "DRAFT_CREATED" && next.data) {
        const created = next.data as PlaybookDraft;
        setSelectedDraftId(created.id);
        setDemoId(created.sourceDemonstrationId);
      }
      if (
        next.ok &&
        recordingBefore &&
        !updated.recordingId &&
        updated.demonstrations.find((d) => d.id === recordingBefore)?.status ===
          "completed"
      ) {
        setDemoId(recordingBefore);
        setSelectedDraftId("");
        setPublishedKey("");
        setProcedureOpen(true);
        setView("playbooks");
        setStage("draft");
      }
      if (next.ok && next.code === "PLAYBOOK_PUBLISHED" && next.data) {
        const publishedBook = next.data as PublishedPlaybook;
        dirtyEditor.current = false;
        setPublishedKey(`${publishedBook.id}:${publishedBook.version}`);
        setProcedureOpen(true);
        setStage("draft");
        setView("playbooks");
        setPlaybookKey(`${publishedBook.id}:${publishedBook.version}`);
      }
      return next;
    } finally {
      setBusy(false);
    }
  };
  const navigate = (action: () => void) => {
    if (busy) return;
    if (dirtyEditor.current) { setPendingNavigation(() => action); return; }
    action();
  };
  const openCases = () => {
    setView("cases");
    setStage(recording || !state.playbooks.length ? "record" : "reuse");
    setResult(null);
  };
  const openLibrary = () => {
    setView("playbooks");
    setStage("draft");
    setProcedureOpen(false);
    setPublishedKey("");
    setResult(null);
  };
  const openRecording = (id: string, draftId = "") => navigate(() => {
    setDemoId(id);
    setSelectedDraftId(draftId || [...state.drafts].reverse().find(d => d.sourceDemonstrationId === id)?.id || "");
    setPublishedKey("");
    setProcedureOpen(true);
    setView("playbooks");
    setStage("draft");
    setCopied(false);
    setResult(null);
  });
  const selectCase = (id: string) => {
    if (recording && id !== recording.caseId) {
      setResult({
        ok: false,
        code: "RECORDING_IN_PROGRESS",
        summary: t(
          "予約を切り替える前に記録を完了するか中止してください。",
          "Finish or cancel the recording before switching cases.",
        ),
      });
      return;
    }
    setSelectedId(id);
    setResult(null);
  };
  const showCase = (id: string, nextStage: "record" | "reuse") => {
    setSelectedId(id);
    setSearch("");
    setPage(Math.floor(state.reservations.findIndex(item => item.id === id) / 4));
    setView("cases");
    setStage(nextStage);
    setCasePicker(null);
    setResult(null);
  };
  const chooseRecordingCase = () => navigate(() => {
    if (recording) {
      showCase(recording.caseId, "record");
      return;
    }
    setCasePicker({ mode: "record" });
    setResult(null);
  });
  const chooseReuseCase = (book: PublishedPlaybook) => navigate(() => {
    setCasePicker({ mode: "reuse", playbookId: book.id, playbookVersion: book.version });
    setResult(null);
  });
  const choosePickerCase = (id: string) => {
    if (!casePicker || busy) return;
    const snapshot = store.getSnapshot();
    const chosen = snapshot.reservations.find(item => item.id === id);
    const existing = snapshot.runsById[snapshot.activeRunIdByCaseId[id]];
    const reviewing = existing && ["awaiting_review", "approved"].includes(existing.status);
    if (!chosen || chosen.handled || snapshot.recordingId) return;
    if (casePicker.mode === "record") {
      if (reviewing) return;
      showCase(id, "record");
      return;
    }
    const requestedBook = snapshot.playbooks.find(book => book.id === casePicker.playbookId && book.version === casePicker.playbookVersion);
    if (!requestedBook || (reviewing && (existing.playbookId !== requestedBook.id || existing.playbookVersion !== requestedBook.version))) return;
    setPlaybookKey(`${requestedBook.id}:${requestedBook.version}`);
    showCase(id, "reuse");
  };
  const ask = demonstration
    ? `Read teachback_get_demonstration with demonstration_id "${demonstration.id}". Use only the actual saved commands and evidence IDs to create a reusable draft via teachback_create_draft. Replace this guest's name and requested time with the permitted case_field references. Preserve the recorded wording and every final effective change. Propose an arrival boundary at or before 22:00. Surface any uncertainty for a person. After submitting the draft, stop and ask the person to review and publish it in the website. Do not publish, approve or apply reservation changes.`
    : "";
  return (
    <div className="core-app app-shell" data-locale={locale}>
      <aside className="workspace-sidebar">
        <a className="workspace-logo" href="#" aria-label="Teachback" onClick={e => { e.preventDefault(); navigate(openCases); }}>
          <img src="/logo.svg" alt="Teachback" />
        </a>
        <nav aria-label={t("メインナビゲーション", "Main navigation")} className="workspace-nav">
          {([
            ["cases", t("案件", "Cases"), Files, openCases],
            ["playbooks", t("手順", "Playbooks"), ListChecks, openLibrary],
            ["history", t("履歴", "History"), ClockCounterClockwise, () => { setView("history"); setResult(null); }],
          ] as const).map(([id, label, Icon, action]) => <button key={id} disabled={!ready || busy} aria-current={view === id ? "page" : undefined} onClick={() => navigate(action)}><Icon size={23} weight="regular" aria-hidden="true" />{label}</button>)}
        </nav>
        <div className="workspace-sidebar-footer">
          {ready && <button className={`workspace-connection ${connection === "registered" ? "is-connected" : ""}`} onClick={() => setModal("connection")}>
            <Circle size={6} weight="fill" aria-hidden="true" />
            <span className="workspace-connection-short" aria-hidden="true">MCP</span>
            <span className="workspace-connection-label">WebMCP {t(({ unavailable: "利用不可", registering: "登録中", registered: "ツール登録済み", failed: "登録エラー" } as const)[connection], ({ unavailable: "unavailable", registering: "registering", registered: "tools registered", failed: "registration error" } as const)[connection])}</span>
          </button>}
          <div
            className="language-switch"
            role="group"
            aria-label={t("表示言語", "Language")}
          >
            <button
              aria-pressed={locale === "en"}
              className={locale === "en" ? "is-active" : ""}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
            <button
              aria-pressed={locale === "ja"}
              className={locale === "ja" ? "is-active" : ""}
              onClick={() => setLocale("ja")}
            >
              日本語
            </button>
          </div>
          <button className="core-text workspace-reset" onClick={() => setModal("reset")} disabled={busy}>
            <ArrowCounterClockwise size={18} aria-hidden="true" />
            <span>{t("デモをリセット", "Reset demo")}</span>
          </button>
        </div>
      </aside>
      <div className="workspace-content">
      {!ready ? (
        <main className="core-start">
          <h1>
            {t("保存内容を読み込めませんでした", "Saved work could not be loaded")}
          </h1>
          <p>
            {t(
              "既存データを上書きせず停止しています。退避して内容を確認するか、再読み込みしてください。",
              "Existing data has not been overwritten. Export it for inspection or reload.",
            )}
          </p>
          <div className="core-actions">
            <button
              className="core-primary"
              onClick={() => setModal("reset")}
            >
              {t("新しいセッションでやり直す", "Start a new session")}
            </button>
            <button
              className="core-secondary"
              onClick={() => setModal("legacy")}
            >
              {t("保存データを確認・退避", "Inspect / export saved data")}
            </button>
            <button
              className="core-text"
              onClick={() => window.location.reload()}
            >
              {t("再読み込み", "Reload")}
            </button>
          </div>
          {result && !result.ok && <p role="alert">{resultText(result, t)}</p>}
        </main>
      ) : (
        <>
          {view === "cases" && <>
          <header className="workspace-page-heading">
            <div><p className="core-eyebrow">{t("案件", "Cases")}</p><h1>{t("予約への対応", "Reservation workspace")}</h1></div>
            <p>{t("一度の対応から、次の案件で使える手順へ。", "Turn one real response into a reusable playbook.")}</p>
          </header>
          <div className="core-case-toolbar">
            <h2>
              {t("予約一覧", "Reservations")}{" "}
              <small>
                {filtered.length} {t("件", "cases")}
              </small>
            </h2>
            <label className="core-search">
              <span className="core-sr">
                {t("予約を検索", "Search reservations")}
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder={t(
                  "予約ID・氏名で検索",
                  "Search by reservation or guest",
                )}
              />
            </label>
            <div className="core-pagination">
              <button
                className="core-text"
                disabled={!safePage}
                onClick={() => setPage(safePage - 1)}
              >
                <CaretLeft size={16} aria-hidden="true" />{t("前へ", "Previous")}
              </button>
              <span>
                {pageCount ? safePage + 1 : 0} / {pageCount}
              </span>
              <button
                className="core-text"
                disabled={safePage + 1 >= pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                {t("次へ", "Next")}<CaretRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="core-case-rail">
            {shown.map((item) => (
              <button
                key={item.id}
                aria-pressed={c?.id === item.id}
                onClick={() => selectCase(item.id)}
              >
                <span>
                  <small>{item.id}</small>
                  {item.guestDisplayName}
                </span>
                <small className={item.handled ? "core-success" : ""}>
                  {statusText(
                    item,
                    state.runsById[state.activeRunIdByCaseId[item.id]],
                    t,
                  )}
                </small>
              </button>
            ))}
            {!filtered.length && (
              <p>
                {t(
                  "一致する予約がありません。表示中の予約は変更していません。",
                  "No matching reservations. The displayed case has not changed.",
                )}
              </p>
            )}
          </div>
          </>}
          {result && (
            <div
              className={`core-feedback ${result.ok ? "" : "is-error"}`}
              role={result.ok ? "status" : "alert"}
            >
              {resultText(result, t)}
              {result.issues && (
                <ul>
                  {result.issues.map((issue, i) => (
                    <li key={i}>{issueText(issue, t)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {view === "cases" && latestAgentEvent && latestAgentCase && latestAgentCase.id !== c.id && (
            <div className="core-feedback">
              {t("Agentが操作した予約", "Agent activity for")}:{" "}
              {latestAgentCase.guestDisplayName}{" "}
              ·{" "}
              {latestAgentCase.handled ||
              latestAgentEvent.eventType === "run_prepared" ||
              latestAgentEvent.eventType === "run_committed"
                ? statusText(
                    latestAgentCase,
                    state.runsById[state.activeRunIdByCaseId[latestAgentCase.id]],
                    t,
                  )
                : t("担当者の確認が必要", latestAgentEvent.summary)}{" "}
              <button
                className="core-text"
                disabled={Boolean(recording)}
                onClick={() => {
                  selectCase(latestAgentCase.id);
                  setStage("reuse");
                  setView("cases");
                  setSearch("");
                  setPage(Math.floor(state.reservations.findIndex(item => item.id === latestAgentCase.id) / 4));
                }}
              >
                {t("対象の予約を確認", "View this case")}
              </button>
            </div>
          )}
          {view === "history" ? <main className="workspace-history">
            <header className="workspace-page-heading"><div><p className="core-eyebrow">{t("履歴", "History")}</p><h1>{t("操作履歴", "Audit trail")}</h1></div>
              <button className="core-secondary" onClick={() => exportJson("teachback-session.json", state)}>{t("このセッションを退避", "Export this session")}<ArrowSquareOut size={17} aria-hidden="true" /></button>
            </header>
            <p className="core-muted">{t("人とAgentの操作、条件の確認、承認・反映を記録しています。", "Recorded human and agent work, condition checks, approvals and applied changes.")}</p>
            {state.audit.length ? <ol className="core-audit">{state.audit.map(a => <li key={a.id}>
              <div><strong>{a.actor === "Human" ? t("人", "Human") : a.actor === "Website" ? t("サイト", "Website") : "Agent"}</strong><time>{new Date(a.at).toLocaleString(locale, { timeZone: state.timeZone })}</time></div>
              <p>{a.summary}</p>{a.caseId && <small>{a.caseId}</small>}
            </li>)}</ol> : <div className="workspace-empty"><ClockCounterClockwise size={32} aria-hidden="true" /><h2>{t("まだ操作履歴はありません", "No activity yet")}</h2><p>{t("案件への対応を始めると、ここに記録が残ります。", "Start working on a case to build its history here.")}</p></div>}
            {Object.keys(load.legacy).length > 0 && <div className="workspace-legacy">
              <button className="core-text" onClick={() => setModal("legacy")}>{t("以前のデモの記録を見る", "View previous demo records")}</button>
            </div>}
          </main> : <main className={`core-layout ${view === "playbooks" ? "is-procedures" : stage === "record" ? "is-recording" : ""}`}>
            <div className={`core-main ${view === "playbooks" ? "workspace-procedures" : ""}`}>
              {view === "cases" && <>
              <CaseSummary
                reservation={c}
                run={run}
                t={t}
              />
              <div className="workspace-case-modes" role="group" aria-label={t("この案件への対応", "Case actions")}>
                <button aria-pressed={stage === "record"} disabled={busy} onClick={() => { setStage("record"); setResult(null); }}>{t("対応を記録", "Record work")}</button>
                <button aria-pressed={stage === "reuse"} disabled={busy || Boolean(recording)} onClick={() => { setStage("reuse"); setResult(null); }}>{t("手順を再利用", "Reuse playbook")}</button>
              </div>
              </>}
              {view === "cases" && stage === "record" && (
                <RecordingPanel
                  key={`${sessionEpoch}:${c.id}:${recording?.id ?? "idle"}`}
                  reservation={c}
                  recording={recording}
                  busy={busy}
                  act={act}
                  t={t}
                  onDirtyChange={onDirtyChange}
                />
              )}
              {view === "playbooks" && !procedureOpen && <ProcedureLibrary
                drafts={state.drafts} playbooks={state.playbooks} demonstrations={completed} t={t}
                onDraft={(d) => openRecording(d.sourceDemonstrationId, d.id)}
                onRecording={d => openRecording(d.id)}
                onPublished={p => { setPublishedKey(`${p.id}:${p.version}`); setProcedureOpen(true); }}
                onRecord={chooseRecordingCase}
              />}
              {view === "playbooks" && procedureOpen && published && <PublishedProcedure key={`${published.id}:${published.version}`} playbook={published} demonstration={completed.find(d => d.id === published.sourceDemonstrationId)} t={t} busy={busy || Boolean(recording)}
                isLatest={latestPublished?.version === published.version}
                onBack={() => navigate(openLibrary)}
                onUse={() => chooseReuseCase(published)}
                onLatestVersion={() => {
                  if (!latestPublished) return;
                  setPublishedKey(`${latestPublished.id}:${latestPublished.version}`);
                  setResult(null);
                }}
                onNextVersion={() => {
                  if (latestPublished?.version !== published.version) return;
                  const source = state.demonstrations.find(d => d.id === published.sourceDemonstrationId);
                  if (!source?.digest) return;
                  void act(s => createDraft(s, source.id, source.digest!, { name: published.name, purpose: published.purpose, steps: published.steps, proposedBoundary: published.boundary, unresolvedQuestions: [] }, "Human", { basedOn: { id: published.id, version: published.version } })).then(r => {
                    if (r.ok && r.data) openRecording(source.id, (r.data as PlaybookDraft).id);
                  });
                }}
              />}
              {view === "playbooks" && procedureOpen && !published && (
                <>
                  {!demonstration ? (
                    <section className="core-section">
                      <h2>
                        {t(
                          "まず一件の対応を記録してください",
                          "Record one response first",
                        )}
                      </h2>
                      <p>
                        {t(
                          "草案の元になる、実際の操作記録がまだありません。",
                          "There is no recorded work to draft from yet.",
                        )}
                      </p>
                      <button
                        className="core-primary"
                        onClick={chooseRecordingCase}
                      >
                        {t("対応を記録する", "Record work")}
                      </button>
                    </section>
                  ) : draft ? (
                    <PlaybookDraftEditor
                      key={draft.id}
                      draft={draft}
                      demonstration={demonstration}
                      busy={busy}
                      act={act}
                      t={t}
                      onBack={() => navigate(openLibrary)}
                      onDirtyChange={onDirtyChange}
                    />
                  ) : (
                    <div className="workspace-recorded-source">
                      <button className="core-text workspace-back" onClick={() => navigate(openLibrary)}><ArrowLeft size={18} aria-hidden="true" />{t("手順一覧に戻る", "Back to playbooks")}</button>
                      <section className="core-section">
                        <p className="core-eyebrow">
                          {t(
                            "記録完了 / 草案の受信待ち",
                            "Recorded / waiting for a draft",
                          )}
                        </p>
                        <h2>
                          {t(
                            "この対応から、Agentに草案を作ってもらう",
                            "Ask an agent to draft from this work",
                          )}
                        </h2>
                        <p>
                          {t(
                            "対応するAgentでこのページを開き、下の依頼を送ってください。コピーだけではAgentは動きません。",
                            "Open this page with a WebMCP-capable agent and send the request below. Copying it does not start an agent.",
                          )}
                        </p>
                        <RecordedWork demonstration={demonstration} t={t} />
                        <textarea
                          className="core-agent-prompt"
                          aria-label={t(
                            "Agentへの依頼",
                            "Request for the agent",
                          )}
                          readOnly
                          value={ask}
                        />
                        <button
                          className="core-primary"
                          onClick={() => {
                            void copyText(ask).then((copiedSuccessfully) => {
                              if (copiedSuccessfully) {
                                setCopied(true);
                                return;
                              }
                              setResult({
                                ok: false,
                                code: "COPY_FAILED",
                                summary: t(
                                  "上の文を選択してコピーしてください。",
                                  "Select and copy the request above.",
                                ),
                              });
                            });
                          }}
                        >
                          {copied
                            ? t("依頼文をコピーしました", "Request copied")
                            : t(
                                "Agentへの依頼をコピー",
                                "Copy request for agent",
                              )}
                        </button>
                      </section>
                      <ManualDraft
                        key={demonstration.id}
                        demonstration={demonstration}
                        busy={busy}
                        act={act}
                        t={t}
                        onDirtyChange={onDirtyChange}
                      />
                    </div>
                  )}
                </>
              )}
              {view === "cases" && stage === "reuse" && (
                <>
                  {playbook ? (
                    <>
                      <div className="workspace-playbook-reference"><div><small>{t("使用する手順", "Using playbook")}</small><strong>{playbook.name} <span>· v{playbook.version}</span></strong></div><button className="core-text" onClick={() => { setPublishedKey(`${playbook.id}:${playbook.version}`); setView("playbooks"); setProcedureOpen(true); }}>{t("手順を見る", "View playbook")}<ArrowRight size={16} aria-hidden="true" /></button></div>
                      {run && (
                        <section className="core-section">
                          <h2>
                            {run.status === "committed"
                              ? t("反映した変更", "Applied changes")
                              : t("変更案", "Proposed changes")}
                          </h2>
                          <div className="core-diff">
                            {run.exactDiff.map((change) => (
                              <div key={change.field}>
                                <strong>{fieldLabel(change.field, t)}</strong>
                                <span>{valueText(change.before, t)}</span>
                                <ArrowRight size={16} aria-hidden="true" />
                                <span className="core-changed">
                                  {valueText(change.after, t)}
                                </span>
                              </div>
                            ))}
                            <div>
                              <strong>{t("案件状態", "Case status")}</strong>
                              <span>{t("未対応", "Unhandled")}</span>
                              <ArrowRight size={16} aria-hidden="true" />
                              <span className="core-changed">{t("対応済み", "Handled")}</span>
                            </div>
                          </div>
                          <p>
                            {run.status === "committed"
                              ? t(
                                  "承認した内容だけを反映しました。",
                                  "Only the approved changes were applied.",
                                )
                              : t(
                                  "まだ予約には反映していません。",
                                  "No changes have been applied yet.",
                                )}
                          </p>
                        </section>
                      )}
                      {!run && <section className="core-section workspace-ready"><h2>{c.handled ? t("この予約への対応は完了しています", "This case has been handled") : t("この手順で変更案を作れます", "Prepare changes with this playbook")}</h2><p>{c.handled ? t("別の未対応の予約を選んで、この手順を再利用できます。", "Select another unhandled reservation to reuse this playbook.") : t("希望到着時刻や案内文を、この予約に合わせて準備します。内容を確認してから承認・反映してください。", "Prepare the arrival details and message for this reservation. Review the exact changes before approving and applying.")}</p></section>}
                    </>
                  ) : (
                    <section className="core-section">
                      <h2>
                        {t(
                          "公開済みの手順はまだありません",
                          "No published playbooks yet",
                        )}
                      </h2>
                      <p>
                        {t(
                          "対応を記録し、Agentの草案を人が確認して公開すると、ここで使えるようになります。",
                          "Record work, receive a draft and publish it after human review. It will then appear here.",
                        )}
                      </p>
                      <button
                        className="core-primary"
                        onClick={() =>
                          completed.length ? openLibrary() : setStage("record")
                        }
                      >
                        {completed.length
                          ? t("草案を確認する", "Review draft")
                          : t("対応を記録する", "Record work")}
                      </button>
                    </section>
                  )}
                </>
              )}
            </div>
            {view === "cases" && stage === "reuse" && playbook && <aside className="core-aside">
              {stage === "reuse" && playbook ? (
                <section className="core-section">
                  <h2>{t("適用条件と承認", "Boundary & approval")}</h2>
                  <label>
                    {t("使用する手順", "Playbook")}
                    <select
                      value={`${playbook.id}:${playbook.version}`}
                      disabled={busy || Boolean(active)}
                      onChange={(e) => setPlaybookKey(e.target.value)}
                    >
                      {state.playbooks.map((p) => (
                        <option
                          key={`${p.id}:${p.version}`}
                          value={`${p.id}:${p.version}`}
                        >
                          {p.name} · v{p.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  {run?.status === "committed" ? (
                    <div className="core-notice core-success">
                      <h3>{t("反映済み", "Committed")}</h3>
                      <p>
                        {t(
                          "この予約への対応は完了しています。別の予約を選んで再利用できます。",
                          "This case is handled. Select another reservation to reuse the playbook.",
                        )}
                      </p>
                    </div>
                  ) : active ? (
                    <>
                      <p className="core-eyebrow">
                        {expired
                          ? t("承認期限切れ", "Approval expired")
                          : invalidApproval
                            ? t("承認が無効です", "Approval is invalid")
                          : statusText(c, run, t)}
                      </p>
                      {run.status === "approved" && currentApprovalStatus === "valid" && (
                        <>
                          <p className="core-success">
                            {t(
                              "この変更案への承認を受け取りました",
                              "This exact proposal is approved",
                            )}
                          </p>
                          <p>
                            {t("有効期限", "Valid until")}:{" "}
                            {new Date(
                              run.approval!.expiresAt,
                            ).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: state.timeZone,
                            })}
                          </p>
                          <p>
                            {t(
                              "保存済みの承認があります。内容を確認し、この画面から反映するか、変更案を破棄してください。",
                              "This proposal has a saved approval. Review it and apply the changes here, or discard it.",
                            )}
                          </p>
                          <button
                            className="core-primary"
                            disabled={busy}
                            onClick={() =>
                              void act((s) =>
                                commitRun(s, run.id, run.digest, "Human"),
                              )
                            }
                          >
                            {t(
                              "承認済みの変更を反映",
                              "Apply approved changes",
                            )}
                          </button>
                        </>
                      )}
                      {run.status === "awaiting_review" && (
                        <>
                          <p>
                            {t(
                              "変更内容を確認してください。「承認して反映」を押すと、この内容だけを1回反映します。",
                              "Review the changes. Approve and apply saves only these exact changes, once.",
                            )}
                          </p>
                          <button
                            className="core-primary"
                            disabled={busy}
                            onClick={() =>
                              void act(async (s) => {
                                const approved = approveRun(
                                  s,
                                  run.id,
                                  run.digest,
                                );
                                if (!approved.result.ok) return approved;
                                return commitRun(
                                  approved.state,
                                  run.id,
                                  run.digest,
                                  "Human",
                                );
                              })
                            }
                          >
                            {t("承認して反映", "Approve and apply")}
                          </button>
                        </>
                      )}
                      {(expired || invalidApproval) && (
                        <p>
                          {t(
                            invalidApproval ? "承認情報を検証できません。破棄して変更案を作り直してください。" : "破棄して変更案を作り直してください。以前の承認は引き継がれません。",
                            invalidApproval ? "The approval could not be verified. Discard it and prepare a fresh proposal." : "Discard and prepare a fresh proposal. The previous approval will not carry over.",
                          )}
                        </p>
                      )}
                      <button
                        className="core-text"
                        disabled={busy}
                        onClick={() => void act((s) => discardRun(s, run.id))}
                      >
                        {t("変更案を破棄", "Discard proposal")}
                      </button>
                    </>
                  ) : (
                    <>
                      <ul className="core-policy">
                        <li>
                          {t(
                            "確定・本日到着・未チェックイン",
                            "Confirmed · arriving today · not checked in",
                          )}
                        </li>
                        <li>
                          {t("希望到着時刻", "Requested arrival")} ≤{" "}
                          {playbook.boundary.latestArrivalTime}
                        </li>
                        <li>
                          {t(
                            "食事制限・タクシー・補償・キャンセル・支払変更は担当者へ",
                            "Dietary, taxi, compensation, cancellation and payment requests go to a person",
                          )}
                        </li>
                      </ul>
                      <button
                        className="core-primary"
                        disabled={busy || c.handled || Boolean(recording)}
                        onClick={() =>
                          void act((s) =>
                            prepareRun(
                              s,
                              c.id,
                              c.version,
                              playbook.id,
                              playbook.version,
                              "Human",
                            ),
                          )
                        }
                      >
                        {t(
                          "条件を確認して変更案を作る",
                          "Check conditions and prepare",
                        )}
                      </button>
                      {c.handled && (
                        <p>
                          {t(
                            "未対応の予約を選んでください。",
                            "Select an unhandled reservation.",
                          )}
                        </p>
                      )}
                      {!c.handled &&
                        evaluatePolicy(
                          c,
                          playbook.boundary,
                          playbook.steps,
                          state.businessDate,
                        ).length > 0 && (
                          <p className="core-muted">
                            {t(
                              "追加依頼などがある予約は、自動適用せず担当者に返します。",
                              "Requests outside the boundary are returned to a person without automatic changes.",
                            )}
                          </p>
                        )}
                    </>
                  )}
                </section>
              ) : null}
                <button className="core-text" onClick={() => setView("history")}>
                  {t("操作履歴を見る", "View audit trail")}
                </button>
            </aside>}
          </main>}
        </>
      )}
      </div>
      {casePicker && <Modal
        title={casePicker.mode === "record" ? t("記録する案件を選ぶ", "Choose a case to record") : t("再利用する案件を選ぶ", "Choose a case to reuse this playbook")}
        close={() => setCasePicker(null)}
      >
        <p className="core-muted">{casePicker.mode === "record"
          ? t("対応を記録する未対応の予約を選んでください。確認中の変更案がある予約は、その確認を先に終えてください。", "Choose an unhandled reservation to record. Finish reviewing any existing proposal first.")
          : t("適用する予約を選んでください。既存の変更案や承認は、そのまま残ります。", "Choose a reservation. Existing proposals and approvals are preserved.")}</p>
        {pickerPlaybook && <p className="workspace-case-picker-book"><strong>{pickerPlaybook.name}</strong> · v{pickerPlaybook.version}</p>}
        <div className="workspace-case-picker">
          {state.reservations.filter(item => !item.handled).map(item => {
            const existing = state.runsById[state.activeRunIdByCaseId[item.id]];
            const reviewing = existing && ["awaiting_review", "approved"].includes(existing.status);
            const differentBook = reviewing && casePicker.mode === "reuse" && (existing.playbookId !== casePicker.playbookId || existing.playbookVersion !== casePicker.playbookVersion);
            const disabled = busy || Boolean(recording) || Boolean(reviewing && (casePicker.mode === "record" || differentBook)) || (casePicker.mode === "reuse" && !pickerPlaybook);
            const action = casePicker.mode === "record"
              ? reviewing ? t("変更案を確認中", "Reviewing a proposal") : t("この案件を選ぶ", "Select this case")
              : differentBook ? t("別の手順で確認中", "Reviewing another playbook")
                : reviewing ? t("変更案を確認", "Review existing proposal")
                  : t("この案件を選ぶ", "Select this case");
            return <button className="workspace-case-choice" key={item.id} disabled={disabled} onClick={() => choosePickerCase(item.id)}>
              <span className="workspace-case-choice-identity"><small>{item.id}</small><strong>{item.guestDisplayName}</strong><small>{t("希望到着", "Requested arrival")} {item.requestedArrivalTime ?? t("不明", "Unknown")} · {statusText(item, existing, t)}</small></span>
              <span className="workspace-case-choice-action">{action}</span><CaretRight size={18} aria-hidden="true" />
            </button>;
          })}
        </div>
        {!state.reservations.some(item => !item.handled) && <p>{t("未対応の予約はありません。", "There are no unhandled reservations.")}</p>}
        <button className="core-text" onClick={() => setCasePicker(null)}>{t("キャンセル", "Cancel")}</button>
      </Modal>}
      {pendingNavigation && <Modal title={t("未保存の修正があります", "You have unsaved changes")} close={() => setPendingNavigation(null)}>
        <p>{t("移動すると、まだ保存していない入力は失われます。", "Leaving will discard the changes you have not saved.")}</p>
        <button className="core-secondary" onClick={() => setPendingNavigation(null)}>{t("編集を続ける", "Keep editing")}</button>
        <button className="core-primary" onClick={() => { dirtyEditor.current = false; pendingNavigation(); setPendingNavigation(null); }}>{t("修正を破棄して移動", "Discard edits and leave")}</button>
      </Modal>}
      {modal === "connection" && (
        <Modal
          title={t("WebMCP の接続", "WebMCP connection")}
          close={() => setModal(null)}
        >
          <h3>{connection === "registered" ? t("7ツール登録済み", "7 tools registered") : t("対応するブラウザとAgentが必要です", "A compatible browser and agent are required")}</h3>
          <p>{t("Agentが行うのは記録の読み取り、草案の作成、別案件への変更案の準備までです。公開と反映は人がこの画面で行います。", "The agent reads records, drafts playbooks and prepares changes for other cases. A person publishes and applies changes here.")}</p>
          <p>{t("対応Agentがこのページのツールを呼び出せる必要があります。通常のGeminiサイドバーでのページ読み取りとは別の機能です。", "A compatible agent must be able to invoke this page’s tools. Reading a page in the ordinary Gemini sidebar is a different capability.")}</p>
          <p>
            {lastCall
              ? `${lastCall.name} → ${lastCall.code}`
              : t("ツールの呼び出しは未受信です。", "No tool calls received.")}
          </p>
          <button className="core-text" onClick={() => navigate(() => { setModal(null); setView("history"); })}>{t("操作履歴を見る", "View audit trail")}</button>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal
          title={t("新しいセッションを始めますか？", "Start a fresh session?")}
          close={() => setModal(null)}
        >
          <p>
            {t(
              "現在の新しい体験の記録・草案・承認をリセットします。前のデモの保存キーは削除しません。必要なら先に退避してください。",
              "This resets the current workflow’s recordings, drafts and approvals. Old demo storage is not deleted. Export the current session first if needed.",
            )}
          </p>
          {result && !result.ok && <p role="alert">{resultText(result, t)}</p>}
          <button
            className="core-secondary"
            onClick={() =>
              exportJson(
                "teachback-session-backup.json",
                load.kind === "error"
                  ? { rawSession: load.rawSession, legacy: load.legacy }
                  : state,
              )
            }
          >
            {t("先に退避する", "Export first")}
          </button>
          <button
            className="core-primary"
            onClick={() => {
              const r = store.restart(createSession());
              setResult(r);
              if (r.ok) {
                setModal(null);
                setCasePicker(null);
                setStage("record");
                setView("cases");
                setProcedureOpen(false);
                setSelectedDraftId("");
                setPublishedKey("");
                dirtyEditor.current = false;
                setSearch("");
                setPage(0);
                setSelectedId(store.getSnapshot().reservations[0].id);
                setLastCall(null);
                setSessionEpoch((value) => value + 1);
                setDemoId("");
                setPlaybookKey("");
                setCopied(false);
              }
            }}
          >
            {t("リセットする", "Reset session")}
          </button>
          <button className="core-text" onClick={() => setModal(null)}>
            {t("キャンセル", "Cancel")}
          </button>
        </Modal>
      )}
      {modal === "legacy" && (
        <Modal
          title={load.kind === "error" ? t("保存データ", "Saved data") : t("前のデモの保存データ", "Previous demo data")}
          close={() => setModal(null)}
        >
          <p>
            {load.kind === "error"
              ? t("読み込めなかった保存内容を、そのまま確認・書き出しできます。ここでデータは変更しません。", "Inspect or export the saved contents that could not be loaded. Nothing is changed here.")
              : t("閲覧のみです。新しい実演や有効な承認には変換しません。", "Read-only. These records are not converted into new demonstrations or valid approvals.")}
          </p>
          <button
            className="core-secondary"
            onClick={() =>
              exportJson(load.kind === "error" ? "teachback-session-backup.json" : "teachback-legacy-backup.json", {
                legacy: load.legacy,
                rawSession: load.kind === "error" ? load.rawSession : undefined,
              })
            }
          >
            {load.kind === "error" ? t("保存データを退避", "Export saved data") : t("旧データを退避", "Export previous data")}
          </button>
          <pre className="core-json-read">
            {JSON.stringify(
              {
                legacy: load.legacy,
                rawSession: load.kind === "error" ? load.rawSession : undefined,
              },
              null,
              2,
            )}
          </pre>
        </Modal>
      )}
    </div>
  );
}
function CaseSummary({
  reservation: c,
  run,
  t,
}: {
  reservation: Reservation;
  run?: PreparedRun;
  t: Translate;
}) {
  const requests = [
    [c.hasNewDietaryRequest, t("新しい食事制限", "New dietary request")],
    [c.requestsTaxi, t("タクシー", "Taxi")],
    [c.requestsCompensation, t("補償", "Compensation")],
    [c.requestsCancellation, t("キャンセル", "Cancellation")],
    [c.requestsPaymentChange, t("支払変更", "Payment change")],
  ]
    .filter(([value]) => value !== false)
    .map(([, label]) => label);
  return (
    <section className="core-case-summary">
      <p className="core-eyebrow">
        {c.id} · {statusText(c, run, t)}
      </p>
      <h1>{c.guestDisplayName}</h1>
      <dl className="core-facts">
        <div>
          <dt>{t("当初の到着予定", "Planned arrival")}</dt>
          <dd>{c.plannedArrivalTime}</dd>
        </div>
        <div>
          <dt>{t("希望到着時刻", "Requested arrival")}</dt>
          <dd>{c.requestedArrivalTime ?? "?"}</dd>
        </div>
        <div>
          <dt>{t("夕食", "Dinner")}</dt>
          <dd>
            {c.mealPlan === "dinner_included"
              ? t("あり", "Included")
              : t("なし", "None")}
          </dd>
        </div>
      </dl>
      <p className="core-request">
        {t("保存済みの到着見込み", "Saved arrival estimate")}:{" "}
        {c.estimatedArrivalTime
          ? `${c.estimatedArrivalDate && c.estimatedArrivalDate !== c.arrivalDate ? `${c.estimatedArrivalDate} ` : ""}${c.estimatedArrivalTime}`
          : t("未設定", "Not set")}
        {" · "}
        {t("食事の手配", "Meal service")}: {valueText(c.mealService, t)}
      </p>
      <p className="core-request">
        {requests.length
          ? `${t("追加依頼・確認事項", "Requests to review")}: ${requests.join(" · ")}`
          : t("追加の依頼なし", "No additional requests")}
      </p>
    </section>
  );
}
function RecordedWork({
  demonstration: d,
  t,
}: {
  demonstration: Demonstration;
  t: Translate;
}) {
  return (
    <div className="core-evidence">
      <h3>
        {d.before.guestDisplayName} · {d.commands.length}{" "}
        {t("操作", "operations")}
      </h3>
      <ol className="core-records">
        {d.commands.map((command) => (
          <li key={command.id}>
            <span>{commandLabel(command.command.type, t)}</span>
            <small>
              {"text" in command.command.input
                ? command.command.input.text
                : "time" in command.command.input
                  ? command.command.input.time
                  : t("軽食ボックス", "Late meal box")}
            </small>
          </li>
        ))}
      </ol>
    </div>
  );
}
export default function WorkflowApp() {
  return (
    <DemoSession>
      <Workspace />
    </DemoSession>
  );
}

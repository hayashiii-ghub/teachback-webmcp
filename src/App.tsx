import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import type { AppState, PreparedRun, Reservation } from "./domain";
import { createInitialState } from "./fixtures";
import {
  approveCurrentRun,
  discardCurrentRun,
  expireApprovedRun,
  prepareCurrentRun,
  resetDemo,
  selectReservation,
  selectedReservation,
} from "./application";
import { registerWebMcpTools } from "./webmcp";
import {
  ArrowRightIcon,
  CaretRightIcon,
  CheckIcon,
  CloseIcon,
} from "./icons";
import {
  actorLabel,
  auditSummaryLabel,
  caseLabel,
  copyFor,
  fieldLabel,
  reasonLabel,
  statusLabel,
  systemMessageLabel,
  valueLabel,
  type UiLocale,
} from "./i18n";

const STORAGE_KEY = "teachback-demo-v1";
const LOCALE_STORAGE_KEY = "teachback-ui-locale-v1";

function loadLocale(): UiLocale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "ja") return stored;
    if (stored) localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // Browser language remains a safe fallback when storage is unavailable.
  }

  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isReservation(value: unknown): value is Reservation {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.guestDisplayName === "string" &&
    ["confirmed", "checked_in", "cancelled"].includes(String(value.status)) &&
    typeof value.arrivalDate === "string" &&
    typeof value.plannedArrivalTime === "string" &&
    typeof value.requestedArrivalTime === "string" &&
    isNullableString(value.estimatedArrivalTime) &&
    ["dinner_included", "room_only"].includes(String(value.mealPlan)) &&
    ["regular_dinner", "late_meal_box", "none"].includes(
      String(value.mealService),
    ) &&
    typeof value.hasNewDietaryRequest === "boolean" &&
    typeof value.requestsTaxi === "boolean" &&
    typeof value.requestsCompensation === "boolean" &&
    isNullableString(value.guestMessageDraft) &&
    isNullableString(value.shiftHandoff) &&
    Number.isInteger(value.version) &&
    Number(value.version) > 0 &&
    ["Recorded", "Needs review", "Human only", "Resolved"].includes(
      String(value.label),
    )
  );
}

function isPreparedRun(value: unknown): value is PreparedRun {
  if (!isRecord(value) || !isReservation(value.before) || !isReservation(value.after)) {
    return false;
  }

  const changesAreValid =
    Array.isArray(value.proposedChanges) &&
    value.proposedChanges.length > 0 &&
    value.proposedChanges.every(
      (change) =>
        isRecord(change) &&
        ["Arrival", "Meal", "Guest message", "Handoff"].includes(
          String(change.field),
        ) &&
        isNullableString(change.before) &&
        typeof change.after === "string",
    );

  const status = String(value.status);
  const hasValidApproval =
    !["approved", "committed"].includes(status) ||
    (value.approvedDigest === value.digest &&
      isIsoDate(value.approvedAt) &&
      isIsoDate(value.approvalExpiresAt));
  const hasValidCommit = status !== "committed" || isIsoDate(value.committedAt);

  return (
    typeof value.id === "string" &&
    typeof value.reservationId === "string" &&
    Number.isInteger(value.reservationVersion) &&
    value.before.id === value.reservationId &&
    value.after.id === value.reservationId &&
    value.before.version === value.reservationVersion &&
    changesAreValid &&
    typeof value.digest === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(value.digest) &&
    ["awaiting_review", "approved", "committed", "discarded", "stale"].includes(status) &&
    (value.approvedDigest === null ||
      (typeof value.approvedDigest === "string" &&
        /^sha256:[a-f0-9]{64}$/.test(value.approvedDigest))) &&
    isNullableIsoDate(value.approvedAt) &&
    isNullableIsoDate(value.approvalExpiresAt) &&
    isNullableIsoDate(value.committedAt) &&
    hasValidApproval &&
    hasValidCommit
  );
}

function isAppState(value: unknown): value is AppState {
  if (
    !isRecord(value) ||
    value.storageVersion !== 1 ||
    !Array.isArray(value.reservations) ||
    value.reservations.length === 0 ||
    !value.reservations.every(isReservation) ||
    typeof value.selectedReservationId !== "string" ||
    !Array.isArray(value.audit)
  ) {
    return false;
  }

  const reservationIds = new Set(
    value.reservations.map((reservation) => reservation.id),
  );
  const activeRunIsValid =
    value.activeRun === null ||
    (isPreparedRun(value.activeRun) &&
      reservationIds.has(value.activeRun.reservationId));
  const rejectionIsValid =
    value.rejection === null ||
    (isRecord(value.rejection) &&
      typeof value.rejection.reservationId === "string" &&
      reservationIds.has(value.rejection.reservationId) &&
      Array.isArray(value.rejection.reasons) &&
      value.rejection.reasons.every((reason) => typeof reason === "string"));
  const auditIsValid = value.audit.every(
    (event) =>
      isRecord(event) &&
      typeof event.id === "string" &&
      isIsoDate(event.at) &&
      ["Human", "Agent", "Website"].includes(String(event.actor)) &&
      typeof event.summary === "string",
  );

  return (
    reservationIds.has(value.selectedReservationId) &&
    activeRunIsValid &&
    rejectionIsValid &&
    auditIsValid
  );
}

function loadState(): AppState {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return createInitialState();
    const parsed: unknown = JSON.parse(value);
    if (isAppState(parsed)) return parsed;
    localStorage.removeItem(STORAGE_KEY);
    return createInitialState();
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be unavailable; the in-memory demo can still start safely.
    }
    return createInitialState();
  }
}

type StateAction = { type: "replace"; state: AppState };

function stateReducer(_state: AppState, action: StateAction): AppState {
  return action.state;
}

function AppHeader({
  locale,
  onLocaleChange,
  onReset,
}: {
  locale: UiLocale;
  onLocaleChange(locale: UiLocale): void;
  onReset(): void;
}) {
  const copy = copyFor(locale);

  return (
    <header className="app-header">
      <div className="brand-lockup">
        <span className="brand">Teachback</span>
        <span className="tagline">{copy.tagline}</span>
      </div>
      <div className="header-actions">
        <span className="origin-mark" lang="en">
          Built in Japan
        </span>
        <div className="language-switch" role="group" aria-label={copy.language}>
          <button
            className={locale === "en" ? "is-active" : undefined}
            type="button"
            aria-pressed={locale === "en"}
            aria-label={copy.switchToEnglish}
            onClick={() => onLocaleChange("en")}
          >
            EN
          </button>
          <button
            className={locale === "ja" ? "is-active" : undefined}
            type="button"
            aria-pressed={locale === "ja"}
            aria-label={copy.switchToJapanese}
            onClick={() => onLocaleChange("ja")}
          >
            日本語
          </button>
        </div>
        <button className="text-button" type="button" onClick={onReset}>
          {copy.resetDemo}
        </button>
      </div>
    </header>
  );
}

function CaseQueue({
  locale,
  reservations,
  selectedId,
  onSelect,
}: {
  locale: UiLocale;
  reservations: Reservation[];
  selectedId: string;
  onSelect(id: string): void;
}) {
  const copy = copyFor(locale);

  return (
    <nav className="case-queue" aria-label={copy.cases}>
      <h2>{copy.cases}</h2>
      <ul className="case-list">
        {reservations.map((reservation) => {
          const selected = reservation.id === selectedId;
          return (
            <li key={reservation.id}>
              <button
                className={`case-item${selected ? " is-selected" : ""}`}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(reservation.id)}
              >
                <span className="case-primary">
                  <span>{reservation.id}</span>
                  <span>{reservation.guestDisplayName}</span>
                </span>
                <span className="case-secondary">
                  {caseLabel(locale, reservation.label)}
                </span>
                <CaretRightIcon className="case-caret" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ReservationFacts({
  locale,
  reservation,
}: {
  locale: UiLocale;
  reservation: Reservation;
}) {
  const copy = copyFor(locale);

  return (
    <div className="reservation-facts" aria-label={copy.reservationSummary}>
      <div>
        <span>{copy.plannedArrival}</span>
        <strong>{reservation.plannedArrivalTime}</strong>
      </div>
      <div>
        <span>{copy.requestedArrival}</span>
        <strong>{reservation.requestedArrivalTime}</strong>
      </div>
      <div>
        <span>{copy.dinner}</span>
        <strong>
          {reservation.mealPlan === "dinner_included" ? copy.included : copy.none}
        </strong>
      </div>
    </div>
  );
}

function EmptyWorkspace({
  locale,
  onPrepare,
}: {
  locale: UiLocale;
  onPrepare(): void;
}) {
  const copy = copyFor(locale);

  return (
    <section className="empty-workspace" aria-labelledby="ready-heading">
      <h2 id="ready-heading">{copy.readyHeading}</h2>
      <p>{copy.readyBody}</p>
      <button className="secondary-action" type="button" onClick={onPrepare}>
        {copy.prepareLocally}
      </button>
    </section>
  );
}

function ProposedChanges({
  locale,
  run,
}: {
  locale: UiLocale;
  run: PreparedRun;
}) {
  const copy = copyFor(locale);
  const applied = run.status === "committed";
  return (
    <section className="changes-section" aria-labelledby="changes-heading">
      <h2 id="changes-heading">{copy.proposedChanges}</h2>
      <div className="changes-timeline">
        {run.proposedChanges.map((change) => (
          <div className="change-row" key={change.field}>
            <span className="timeline-node" aria-hidden="true" />
            <span className="change-field">{fieldLabel(locale, change.field)}</span>
            {change.before ? (
              <span className="change-values">
                <span
                  lang={
                    locale === "ja" &&
                    (change.field === "Guest message" || change.field === "Handoff")
                      ? "en"
                      : undefined
                  }
                >
                  {valueLabel(locale, change.field, change.before)}
                </span>
                <ArrowRightIcon className="change-arrow" />
                <strong
                  lang={
                    locale === "ja" &&
                    (change.field === "Guest message" || change.field === "Handoff")
                      ? "en"
                      : undefined
                  }
                >
                  {valueLabel(locale, change.field, change.after)}
                </strong>
              </span>
            ) : (
              <strong
                className="change-after"
                lang={
                  locale === "ja" &&
                  (change.field === "Guest message" || change.field === "Handoff")
                    ? "en"
                    : undefined
                }
              >
                {valueLabel(locale, change.field, change.after)}
              </strong>
            )}
          </div>
        ))}
      </div>
      <p className={`application-note${applied ? " is-applied" : ""}`}>
        {applied ? copy.applied : copy.notApplied}
      </p>
    </section>
  );
}

function RejectedResult({
  locale,
  reasons,
}: {
  locale: UiLocale;
  reasons: string[];
}) {
  const copy = copyFor(locale);

  return (
    <section className="rejected-result" role="alert" aria-labelledby="rejected-heading">
      <h2 id="rejected-heading">{copy.humanReviewRequired}</h2>
      <ul>
        {reasons.map((reason) => (
          <li key={reason}>{reasonLabel(locale, reason)}</li>
        ))}
      </ul>
      <p>{copy.noChanges}</p>
    </section>
  );
}

function ReservationWorkspace({
  locale,
  reservation,
  run,
  rejectionReasons,
  onPrepare,
}: {
  locale: UiLocale;
  reservation: Reservation;
  run: PreparedRun | null;
  rejectionReasons: string[] | null;
  onPrepare(): void;
}) {
  const copy = copyFor(locale);

  return (
    <main className="reservation-workspace">
      <h1 tabIndex={-1}>{reservation.guestDisplayName}</h1>
      <div className="reservation-meta">
        <span>{copy.reservationId}</span>
        <strong>{reservation.id}</strong>
        <i aria-hidden="true" />
        <span>{copy.status}</span>
        <strong>{statusLabel(locale, reservation.status)}</strong>
        <i aria-hidden="true" />
        <span>{copy.arrival}</span>
        <strong>
          {reservation.arrivalDate === "2026-08-27"
            ? copy.today
            : reservation.arrivalDate}
        </strong>
      </div>
      <ReservationFacts locale={locale} reservation={reservation} />
      {rejectionReasons ? (
        <RejectedResult locale={locale} reasons={rejectionReasons} />
      ) : run && run.status !== "discarded" ? (
        <ProposedChanges locale={locale} run={run} />
      ) : (
        <EmptyWorkspace locale={locale} onPrepare={onPrepare} />
      )}
    </main>
  );
}

function ReviewPanel({
  locale,
  run,
  rejectionReasons,
  onPrepare,
  onApprove,
  onDiscard,
  onAudit,
}: {
  locale: UiLocale;
  run: PreparedRun | null;
  rejectionReasons: string[] | null;
  onPrepare(): void;
  onApprove(): void;
  onDiscard(): void;
  onAudit(event: ReactMouseEvent<HTMLButtonElement>): void;
}) {
  const copy = copyFor(locale);
  const isAwaiting = run?.status === "awaiting_review";
  const isApproved = run?.status === "approved";
  const isCommitted = run?.status === "committed";
  const isStale = run?.status === "stale";
  const isRejected = Boolean(rejectionReasons);

  return (
    <aside className="review-panel" aria-labelledby="review-heading">
      <h2 id="review-heading">{copy.review}</h2>
      {!isRejected ? (
        <ul className="eligibility-list" id="approval-criteria">
          {copy.eligibility.map((item) => (
            <li key={item}>
              <CheckIcon className="check-icon" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="review-rejected">
          <CloseIcon className="rejected-icon" />
          <strong>{copy.outsideBoundary}</strong>
          <p>{copy.refusedPreparation}</p>
        </div>
      )}
      <div className="approval-step" aria-hidden="true">
        <span />
      </div>
      <div className="review-actions">
        {!run && !isRejected ? (
          <button className="primary-action" type="button" onClick={onPrepare}>
            {copy.preparePreview}
          </button>
        ) : isAwaiting ? (
          <button
            className="primary-action"
            type="button"
            onClick={onApprove}
            aria-describedby="approval-criteria changes-heading"
          >
            {copy.approvePreview}
          </button>
        ) : isApproved ? (
          <button className="primary-action is-approved" type="button" disabled>
            {copy.approvedReady}
          </button>
        ) : isCommitted ? (
          <button className="primary-action is-approved" type="button" disabled>
            {copy.committed}
          </button>
        ) : isStale ? (
          <button className="primary-action" type="button" onClick={onPrepare}>
            {copy.prepareAgain}
          </button>
        ) : null}
        {run && !isCommitted && run.status !== "discarded" ? (
          <button className="secondary-action" type="button" onClick={onDiscard}>
            {copy.discard}
          </button>
        ) : null}
        <button className="text-button audit-link" type="button" onClick={onAudit}>
          {copy.viewAudit}
        </button>
      </div>
    </aside>
  );
}

function AuditDrawer({
  locale,
  open,
  events,
  onClose,
  backgroundRef,
  returnFocusRef,
}: {
  locale: UiLocale;
  open: boolean;
  events: AppState["audit"];
  onClose(): void;
  backgroundRef: RefObject<HTMLDivElement | null>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const copy = copyFor(locale);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const background = backgroundRef.current;
    if (background) {
      background.inert = true;
      background.setAttribute("aria-hidden", "true");
    }
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (background) {
        background.inert = false;
        background.removeAttribute("aria-hidden");
      }
      (returnFocusRef.current ?? previouslyFocused)?.focus();
    };
  }, [backgroundRef, onClose, open, returnFocusRef]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={drawerRef}
        className="audit-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <h2 id="audit-heading">{copy.auditTrail}</h2>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={copy.closeAudit}
          >
            <CloseIcon />
          </button>
        </div>
        <ol className="audit-events">
          {[...events].reverse().map((event) => (
            <li key={event.id}>
              <strong>{actorLabel(locale, event.actor)}</strong>
              <span>{auditSummaryLabel(locale, event.summary)}</span>
              <time dateTime={event.at}>
                {new Date(event.at).toLocaleTimeString(
                  locale === "ja" ? "ja-JP" : "en-US",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Tokyo",
                  },
                )}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(stateReducer, undefined, loadState);
  const stateRef = useRef(state);
  const [locale, setLocale] = useState<UiLocale>(loadLocale);
  const localeRef = useRef(locale);
  const [announcement, setAnnouncement] = useState(() =>
    systemMessageLabel(locale, "Teachback demo ready."),
  );
  const [auditOpen, setAuditOpen] = useState(false);
  const appContentRef = useRef<HTMLDivElement>(null);
  const auditTriggerRef = useRef<HTMLButtonElement>(null);

  const replaceState = useCallback((nextState: AppState, message: string) => {
    stateRef.current = nextState;
    dispatch({ type: "replace", state: nextState });
    setAnnouncement(systemMessageLabel(localeRef.current, message));
  }, []);

  const commitState = useCallback(
    (expectedState: AppState, nextState: AppState, message: string): boolean => {
      if (stateRef.current !== expectedState) return false;
      replaceState(nextState, message);
      return true;
    },
    [replaceState],
  );

  useEffect(() => {
    stateRef.current = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Persistence is optional; keep the in-memory demo usable when storage fails.
    }
  }, [state]);

  useEffect(() => {
    localeRef.current = locale;
    document.documentElement.lang = locale;
    const copy = copyFor(locale);
    document.title = copy.documentTitle;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", copy.metaDescription);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Language preference is optional; the current view remains localized.
    }
  }, [locale]);

  useEffect(() => {
    let controller: AbortController | null = null;
    let cancelled = false;
    registerWebMcpTools({
      getState: () => stateRef.current,
      commitState,
    })
      .then((registeredController) => {
        if (cancelled) registeredController?.abort();
        else controller = registeredController;
      })
      .catch(() =>
        setAnnouncement(
          systemMessageLabel(
            localeRef.current,
            "WebMCP tools could not be registered.",
          ),
        ),
      );

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [commitState]);

  const approvalExpiresAt =
    state.activeRun?.status === "approved" && state.activeRun.approvalExpiresAt
      ? Date.parse(state.activeRun.approvalExpiresAt)
      : Number.NaN;

  useEffect(() => {
    if (!Number.isFinite(approvalExpiresAt)) return;

    const markExpired = () => {
      const current = stateRef.current;
      const expired = expireApprovedRun(current);
      if (expired !== current) {
        commitState(current, expired, "Approval expired. Prepare a new preview.");
      }
    };
    const delay = Math.max(0, approvalExpiresAt - Date.now());
    const timer = window.setTimeout(markExpired, delay + 25);
    return () => window.clearTimeout(timer);
  }, [approvalExpiresAt, commitState]);

  const reservation = selectedReservation(state);
  const visibleRun =
    state.activeRun?.reservationId === reservation.id ? state.activeRun : null;
  const rejectionReasons =
    state.rejection?.reservationId === reservation.id
      ? state.rejection.reasons
      : null;

  const prepare = useCallback(async () => {
    const sourceState = stateRef.current;
    const prepared = await prepareCurrentRun(sourceState);
    if (!commitState(sourceState, prepared.state, prepared.result.summary)) {
      setAnnouncement(
        systemMessageLabel(
          localeRef.current,
          "The case changed while the preview was being prepared.",
        ),
      );
    }
  }, [commitState]);

  const approve = useCallback(() => {
    const approved = approveCurrentRun(stateRef.current);
    replaceState(approved.state, approved.result.summary);
  }, [replaceState]);

  const discard = useCallback(() => {
    replaceState(discardCurrentRun(stateRef.current), "Preview discarded.");
  }, [replaceState]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The in-memory reset still works when storage is unavailable.
    }
    replaceState(resetDemo(), "Demo reset.");
  }, [replaceState]);

  const select = useCallback(
    (reservationId: string) => {
      replaceState(
        selectReservation(stateRef.current, reservationId),
        `Selected reservation ${reservationId}.`,
      );
    },
    [replaceState],
  );

  const openAudit = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      auditTriggerRef.current = event.currentTarget;
      setAuditOpen(true);
    },
    [],
  );
  const closeAudit = useCallback(() => setAuditOpen(false), []);
  const changeLocale = useCallback((nextLocale: UiLocale) => {
    localeRef.current = nextLocale;
    setLocale(nextLocale);
    setAnnouncement(
      nextLocale === "ja"
        ? "表示言語を日本語に切り替えました。"
        : "Display language changed to English.",
    );
  }, []);

  return (
    <div className="app-shell" data-locale={locale}>
      <div className="app-content" ref={appContentRef}>
        <AppHeader
          locale={locale}
          onLocaleChange={changeLocale}
          onReset={reset}
        />
        <div className="app-grid">
          <CaseQueue
            locale={locale}
            reservations={state.reservations}
            selectedId={state.selectedReservationId}
            onSelect={select}
          />
          <ReservationWorkspace
            locale={locale}
            reservation={reservation}
            run={visibleRun}
            rejectionReasons={rejectionReasons}
            onPrepare={prepare}
          />
          <ReviewPanel
            locale={locale}
            run={visibleRun}
            rejectionReasons={rejectionReasons}
            onPrepare={prepare}
            onApprove={approve}
            onDiscard={discard}
            onAudit={openAudit}
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
      <AuditDrawer
        locale={locale}
        open={auditOpen}
        events={state.audit}
        onClose={closeAudit}
        backgroundRef={appContentRef}
        returnFocusRef={auditTriggerRef}
      />
    </div>
  );
}

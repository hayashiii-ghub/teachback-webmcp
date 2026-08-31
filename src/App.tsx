import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import {
  type AppState,
  type Demonstration,
  type PlaybookId,
  type PreparedRun,
  type PublishedPlaybook,
  type Reservation,
} from "./domain";
import { createInitialState } from "./fixtures";
import { DemoSession } from "./DemoSession";
import {
  approveCurrentRun,
  approveAndCommitCurrentRun,
  discardCurrentRun,
  eligibilityReasons,
  expireApprovedRun,
  playbookForReservation,
  playbookForPreparation,
  prepareCurrentRun,
  resetDemo,
  runForReservation,
  rejectionForReservation,
  selectReservation,
  selectedReservation,
} from "./application";
import {
  WEBMCP_TOOL_COUNT,
  registerWebMcpTools,
  type WebMcpCall,
} from "./webmcp";
import {
  AGENT_DRAFT_BOUNDARY,
  LATE_ARRIVAL_PLAYBOOK,
  NIGHT_ARRIVAL_PLAYBOOK,
  PLAYBOOK_DEFINITIONS,
  createPublishedJourney,
  activeDemonstration,
  draftIsPublishable,
  draftPlaybook,
  isTeachingJourney,
  publishPlaybook,
  startTeachingDemonstration,
  teachingAuditEvents,
  updateDraftBoundary,
  type TeachingJourney,
} from "./teaching";
import {
  demonstrationForReservation,
  deriveCaseQueueStatus,
  filterReservations,
  findNextReusableReservation,
  publishedPlaybookForDemonstration,
  reservationForDemonstration,
  type CaseQueueStatus,
} from "./case-presentation";
import {
  ArrowRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CloseIcon,
} from "./icons";
import {
  actorLabel,
  auditOperationLabel,
  auditSummaryLabel,
  copyFor,
  fieldLabel,
  statusLabel,
  systemMessageLabel,
  valueLabel,
  type UiLocale,
} from "./i18n";
import { RecordedResponse, RegisteredRule, ReservationRequests } from "./CaseDetails";
import { BoundaryEditor } from "./BoundaryEditor";
import { persistSession, STORAGE_KEY, TEACHING_STORAGE_KEY, TEACHING_SCENARIO_VERSION_KEY, TEACHING_SCENARIO_VERSION } from "./persistence";
import { ResetConfirmation } from "./ResetConfirmation";

const LOCALE_STORAGE_KEY = "teachback-ui-locale-v1";

type WebMcpStatus = "checking" | "ready" | "unavailable" | "error";

const FAILED_CRITERION_BY_REASON: Record<string, number> = {
  "Only confirmed reservations can use this playbook.": 0,
  "Only same-day arrivals can use this playbook.": 1,
  "The guest has already checked in.": 2,
  "Arrival is later than 22:00.": 3,
  "A new dietary request requires human review.": 4,
  "Transportation arrangements are outside this playbook.": 5,
  "Compensation requests are outside this playbook.": 6,
};

function formatFacilityTime(locale: UiLocale, value: string): string {
  return new Date(value).toLocaleTimeString(
    locale === "ja" ? "ja-JP" : "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Tokyo",
    },
  );
}

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
    typeof value.dietaryRequestHandled === "boolean" &&
    typeof value.requestsTaxi === "boolean" &&
    typeof value.taxiArranged === "boolean" &&
    typeof value.requestsCompensation === "boolean" &&
    isNullableString(value.guestMessageDraft) &&
    isNullableString(value.shiftHandoff) &&
    Number.isInteger(value.version) &&
    Number(value.version) > 0
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
        [
          "Arrival",
          "Meal",
          "Dietary request",
          "Taxi",
          "Guest message",
          "Handoff",
        ].includes(
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
  const boundary = isRecord(value.playbookBoundary)
    ? value.playbookBoundary
    : null;
  const boundaryIsValid = Boolean(
    boundary &&
      ["22:00", "23:00", "23:59"].includes(
        String(boundary.latestArrivalLimit),
      ) &&
      ["allow", "escalate"].includes(String(boundary.taxiHandling)) &&
      ["allow", "escalate"].includes(String(boundary.dietaryHandling)) &&
      boundary.compensationHandling === "escalate" &&
      boundary.approvalRequired === true,
  );

  return (
    typeof value.id === "string" &&
    typeof value.playbookId === "string" &&
    typeof value.reservationId === "string" &&
    Number.isInteger(value.reservationVersion) &&
    value.before.id === value.reservationId &&
    value.after.id === value.reservationId &&
    value.before.version === value.reservationVersion &&
    changesAreValid &&
    boundaryIsValid &&
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
    value.storageVersion !== 3 ||
    !Array.isArray(value.reservations) ||
    value.reservations.length === 0 ||
    !value.reservations.every(isReservation) ||
    typeof value.selectedReservationId !== "string" ||
    !Array.isArray(value.audit) ||
    !isRecord(value.runsByReservationId) ||
    !isRecord(value.rejectionsByReservationId)
  ) {
    return false;
  }

  const reservationIds = new Set(
    value.reservations.map((reservation) => reservation.id),
  );
  const reservationIdsAreUnique =
    reservationIds.size === value.reservations.length;
  const runs = Object.entries(value.runsByReservationId);
  const rejections = value.rejectionsByReservationId;
  const runsAreValid = runs.every(
    ([id, run]) =>
      reservationIds.has(id) && isPreparedRun(run) && run.reservationId === id,
  );
  const runIds = runs.map(([, run]) => (isRecord(run) ? run.id : null));
  const runIdsAreUnique = new Set(runIds).size === runIds.length;
  const rejectionsAreValid = Object.entries(rejections).every(
    ([id, rejection]) =>
      reservationIds.has(id) &&
      isRecord(rejection) &&
      rejection.reservationId === id &&
      (rejection.playbookId === undefined || typeof rejection.playbookId === "string") &&
      Array.isArray(rejection.reasons) &&
      rejection.reasons.length > 0 &&
      rejection.reasons.every((reason) => typeof reason === "string"),
  );
  const executionStateIsExclusive = runs.every(
    ([id]) => !Object.hasOwn(rejections, id),
  );
  const auditIsValid = value.audit.every(
    (event) =>
      isRecord(event) &&
      typeof event.id === "string" &&
      isIsoDate(event.at) &&
      ["Human", "Agent", "Website"].includes(String(event.actor)) &&
      typeof event.summary === "string",
  );

  return (
    reservationIdsAreUnique &&
    reservationIds.has(value.selectedReservationId) &&
    runsAreValid &&
    runIdsAreUnique &&
    rejectionsAreValid &&
    executionStateIsExclusive &&
    auditIsValid
  );
}

function migrateAppState(value: unknown): unknown {
  if (!isRecord(value) || value.storageVersion !== 2) return value;
  // Preserve compatible v2 work without broadening which legacy states we trust.
  const { activeRun, rejection } = value;
  if (
    (activeRun !== null &&
      (!isPreparedRun(activeRun) ||
        activeRun.reservationId !== value.selectedReservationId)) ||
    (rejection !== null &&
      (!isRecord(rejection) ||
        rejection.reservationId !== value.selectedReservationId)) ||
    (activeRun !== null && rejection !== null)
  ) {
    return null;
  }
  return {
    storageVersion: 3,
    reservations: value.reservations,
    selectedReservationId: value.selectedReservationId,
    audit: value.audit,
    runsByReservationId: activeRun ? { [activeRun.reservationId]: activeRun } : {},
    rejectionsByReservationId: rejection
      ? { [String(rejection.reservationId)]: rejection }
      : {},
  };
}

function loadState(): AppState {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return createInitialState();
    const parsed = migrateAppState(JSON.parse(value));
    if (isAppState(parsed)) return expireApprovedRun(parsed);
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

function loadTeachingJourney(): TeachingJourney {
  try {
    if (
      localStorage.getItem(TEACHING_SCENARIO_VERSION_KEY) !==
      TEACHING_SCENARIO_VERSION
    ) {
      localStorage.removeItem(TEACHING_STORAGE_KEY);
      localStorage.setItem(
        TEACHING_SCENARIO_VERSION_KEY,
        TEACHING_SCENARIO_VERSION,
      );
      return createPublishedJourney();
    }
    const value = localStorage.getItem(TEACHING_STORAGE_KEY);
    if (!value) return createPublishedJourney();
    const parsed: unknown = JSON.parse(value);
    if (isTeachingJourney(parsed)) return parsed;
    localStorage.removeItem(TEACHING_STORAGE_KEY);
  } catch {
    try {
      localStorage.removeItem(TEACHING_STORAGE_KEY);
    } catch {
      // The in-memory teaching journey remains usable when storage is unavailable.
    }
  }
  return createPublishedJourney();
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
        <span className="brand">
          Teachback
          <span className="brand-boundary" aria-hidden="true" />
        </span>
      </div>
      <div className="header-actions">
        <div
          className="language-switch"
          role="group"
          aria-label={copy.language}
        >
          <button
            className={locale === "en" ? "is-active" : undefined}
            type="button"
            aria-pressed={locale === "en"}
            aria-label={copy.englishLanguage}
            onClick={() => onLocaleChange("en")}
          >
            EN
          </button>
          <button
            className={locale === "ja" ? "is-active" : undefined}
            type="button"
            aria-pressed={locale === "ja"}
            aria-label={copy.japaneseLanguage}
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

function DemoIntro({ locale }: { locale: UiLocale }) {
  const copy = copyFor(locale);

  return (
    <section className="demo-intro" aria-label={copy.primaryPitch}>
      <strong>{copy.primaryPitch}</strong>
    </section>
  );
}

function JourneySteps({
  locale,
  stage,
}: {
  locale: UiLocale;
  stage: TeachingJourney["stage"];
}) {
  const copy = copyFor(locale);
  const activeIndex = stage === "demonstration" ? 0 : 2;
  const steps = [
    copy.teachingSource,
    copy.agentStructured,
    copy.humanConstrained,
  ] as const;

  return (
    <ol className="journey-steps" aria-label={copy.teachingProgress}>
      {steps.map((title, index) => (
        <li
          className={`${index < activeIndex ? "is-complete" : ""}${
            index === activeIndex ? " is-active" : ""
          }`}
          key={title}
        >
          <span>{index + 1}</span>
          <strong>{title}</strong>
        </li>
      ))}
    </ol>
  );
}

function TeachingWorkspace({
  locale,
  journey,
  reservation,
  onDraft,
  onBoundaryChange,
  onPublish,
  onBack,
}: {
  locale: UiLocale;
  journey: TeachingJourney;
  reservation: Reservation;
  onDraft(): void;
  onBoundaryChange(patch: {
    latestArrivalLimit?: "22:00" | "23:00" | "23:59";
    taxiHandling?: "allow" | "escalate";
    dietaryHandling?: "allow" | "escalate";
    compensationHandling?: "allow" | "escalate";
  }): void;
  onPublish(): void;
  onBack(): void;
}) {
  const copy = copyFor(locale);
  const draft = journey.draft;
  const publishable = draftIsPublishable(journey);
  const demonstration = activeDemonstration(journey);
  const playbookId =
    demonstration?.playbookId ?? draft?.playbookId ?? LATE_ARRIVAL_PLAYBOOK.id;
  const definition =
    PLAYBOOK_DEFINITIONS[playbookId] ?? LATE_ARRIVAL_PLAYBOOK;
  const isNight = playbookId === NIGHT_ARRIVAL_PLAYBOOK.id;
  const actionCount = demonstration?.actions.length ?? 0;

  return (
    <>
      <main className="reservation-workspace teaching-source-workspace">
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
        {demonstration ? <RecordedResponse locale={locale} reservation={reservation} demonstration={demonstration} /> : null}
      </main>
      <aside className="review-panel teaching-rule-panel">
        <div className="teaching-rule-inner">
          <h2>{copy.teachingPanelHeading}</h2>
          <JourneySteps locale={locale} stage={journey.stage} />
          {journey.stage === "demonstration" ? (
            <div className="draft-start">
              <p>{copy.agentDraftBody}</p>
              <section className="teaching-rule-summary" aria-label={copy.teachingRuleLabel}>
                <span>{copy.teachingRuleLabel}</span>
                <h3>{isNight ? copy.nightPlaybookName : copy.playbookName}</h3>
                <p>{isNight ? copy.nightTeachingRuleDescription : copy.teachingRuleDescription}</p>
              </section>
              <dl className="teaching-rule-facts">
                <div>
                  <dt>{copy.teachingAppliesTo}</dt>
                  <dd>{isNight ? copy.nightTeachingAppliesToValue : copy.teachingAppliesToValue}</dd>
                </div>
                <div>
                  <dt>{copy.teachingActionCount}</dt>
                  <dd>{actionCount}{copy.teachingCountUnit}</dd>
                </div>
                <div>
                  <dt>{copy.teachingRuleCount}</dt>
                  <dd>{definition.ruleCount}{copy.teachingCountUnit}</dd>
                </div>
              </dl>
              <button className="primary-action" type="button" onClick={onDraft}>
                {copy.createAgentDraft}
              </button>
            </div>
          ) : draft ? (
            <div className="boundary-review">
              <h2>{copy.boundaryReviewHeading}</h2>
              <p>
                {isNight ? copy.nightBoundaryReviewBody : copy.boundaryReviewBody}
              </p>
              <BoundaryEditor locale={locale} boundary={draft.boundary} definition={definition} onChange={onBoundaryChange} publishable={publishable} />
              <button
                className="primary-action"
                type="button"
                disabled={!publishable}
                onClick={onPublish}
              >
                {copy.publishPlaybook}
              </button>
            </div>
          ) : null}
          <button className="teaching-back" type="button" onClick={onBack}>
            {copy.backToReservation}
          </button>
        </div>
      </aside>
    </>
  );
}

function CaseQueue({
  locale,
  reservations,
  selectedId,
  runsByReservationId,
  rejectionsByReservationId,
  demonstrations,
  publishedPlaybooks,
  query,
  onQueryChange,
  onSelect,
}: {
  locale: UiLocale;
  reservations: Reservation[];
  selectedId: string;
  runsByReservationId: AppState["runsByReservationId"];
  rejectionsByReservationId: AppState["rejectionsByReservationId"];
  demonstrations: Demonstration[];
  publishedPlaybooks: PublishedPlaybook[];
  query: string;
  onQueryChange(query: string): void;
  onSelect(id: string): void;
}) {
  const copy = copyFor(locale);
  const listRef = useRef<HTMLUListElement>(null);
  const filteredReservations = filterReservations(reservations, query);
  const filteredReservationIds = filteredReservations
    .map((reservation) => reservation.id)
    .join("|");
  const firstFilteredReservationId = filteredReservations[0]?.id ?? null;
  const selectedReservationIsVisible = filteredReservations.some(
    (reservation) => reservation.id === selectedId,
  );
  const [railState, setRailState] = useState({
    canScrollBack: false,
    canScrollForward: false,
    visibleStart: 0,
    visibleEnd: Math.min(4, filteredReservations.length),
  });

  useEffect(() => {
    if (!firstFilteredReservationId || selectedReservationIsVisible) return;
    onSelect(firstFilteredReservationId);
  }, [firstFilteredReservationId, onSelect, selectedReservationIsVisible]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const updateRailState = () => {
      const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
      const items = Array.from(list.children) as HTMLElement[];
      const visibleLeft = list.scrollLeft;
      const visibleRight = visibleLeft + list.clientWidth;
      const fullyVisibleIndexes = items.flatMap((item, index) => {
        const itemLeft = item.offsetLeft;
        const itemRight = itemLeft + item.offsetWidth;
        return itemLeft >= visibleLeft - 1 && itemRight <= visibleRight + 1
          ? [index]
          : [];
      });
      const firstPartiallyVisible = items.findIndex(
        (item) => item.offsetLeft + item.offsetWidth > visibleLeft + 1,
      );
      const visibleStart =
        fullyVisibleIndexes[0] ?? Math.max(0, firstPartiallyVisible);
      const visibleEnd =
        (fullyVisibleIndexes.at(-1) ?? visibleStart) + (items.length > 0 ? 1 : 0);
      const nextState = {
        canScrollBack: list.scrollLeft > 1,
        canScrollForward: list.scrollLeft < maxScrollLeft - 1,
        visibleStart,
        visibleEnd: Math.min(items.length, visibleEnd),
      };
      setRailState((current) =>
        current.canScrollBack === nextState.canScrollBack &&
        current.canScrollForward === nextState.canScrollForward &&
        current.visibleStart === nextState.visibleStart &&
        current.visibleEnd === nextState.visibleEnd
          ? current
          : nextState,
      );
    };
    const revealSelected = () => {
      const selected = list.querySelector<HTMLElement>(
        '.case-item[aria-current="true"]',
      );
      const item = selected?.closest<HTMLElement>("li");
      if (!item) return;
      const itemLeft = item.offsetLeft;
      const itemRight = itemLeft + item.offsetWidth;
      const visibleLeft = list.scrollLeft;
      const visibleRight = visibleLeft + list.clientWidth;
      if (itemLeft < visibleLeft || itemRight > visibleRight) {
        list.scrollTo({
          left: Math.max(0, itemLeft - (list.clientWidth - item.offsetWidth) / 2),
          behavior: "auto",
        });
      }
      updateRailState();
    };

    revealSelected();
    const resizeObserver = new ResizeObserver(() => {
      revealSelected();
      updateRailState();
    });
    resizeObserver.observe(list);
    list.addEventListener("scroll", updateRailState, { passive: true });
    return () => {
      resizeObserver.disconnect();
      list.removeEventListener("scroll", updateRailState);
    };
  }, [filteredReservationIds, selectedId]);

  const scrollCases = useCallback((direction: -1 | 1) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({
      left: direction * Math.max(240, list.clientWidth - 1),
      behavior: "smooth",
    });
  }, []);

  const visibleStart = Math.min(
    railState.visibleStart,
    Math.max(0, filteredReservations.length - 1),
  );
  const visibleEnd = Math.max(
    Math.min(filteredReservations.length, railState.visibleEnd),
    filteredReservations.length > 0 ? visibleStart + 1 : 0,
  );
  const rangeLabel =
    filteredReservations.length === 0
      ? locale === "ja"
        ? `0 / ${reservations.length}件`
        : `0 of ${reservations.length}`
      : locale === "ja"
        ? `${visibleStart + 1}–${visibleEnd} / ${filteredReservations.length}件`
        : `${visibleStart + 1}–${visibleEnd} of ${filteredReservations.length}`;

  return (
    <nav className="case-queue" aria-label={copy.cases}>
      <div className="case-queue-header">
        <div className="case-queue-title">
          <h2>{copy.cases}</h2>
          <span aria-live="polite">{rangeLabel}</span>
        </div>
        <div className="case-queue-tools">
          <label className="case-search">
            <span className="sr-only">{copy.caseSearch}</span>
            <input
              type="search"
              value={query}
              placeholder={copy.caseSearchPlaceholder}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </label>
          <div className="case-pagination" aria-label={copy.cases}>
            <button
              className="case-page-control"
              type="button"
              aria-label={copy.previousCases}
              aria-controls="case-list"
              disabled={filteredReservations.length === 0 || !railState.canScrollBack}
              onClick={() => scrollCases(-1)}
            >
              <CaretLeftIcon />
              <span>{copy.previousCasesShort}</span>
            </button>
            <button
              className="case-page-control"
              type="button"
              aria-label={copy.nextCases}
              aria-controls="case-list"
              disabled={filteredReservations.length === 0 || !railState.canScrollForward}
              onClick={() => scrollCases(1)}
            >
              <span>{copy.nextCasesShort}</span>
              <CaretRightIcon />
            </button>
          </div>
        </div>
      </div>
      {filteredReservations.length > 0 ? (
        <div className="case-list-wrap">
          <ul className="case-list" id="case-list" ref={listRef}>
            {filteredReservations.map((reservation) => {
            const selected = reservation.id === selectedId;
            const status = deriveCaseQueueStatus({
              reservation,
              demonstrations,
              publishedPlaybooks,
              activeRun: runsByReservationId[reservation.id] ?? null,
              rejectedReservationId:
                rejectionsByReservationId[reservation.id]?.reservationId ?? null,
            });
            const labels: Record<CaseQueueStatus, string> = {
              unhandled: copy.caseUnhandled,
              awaiting_review: copy.caseAwaitingReview,
              needs_human_review: copy.caseNeedsHumanReview,
              awaiting_application: copy.caseAwaitingApplication,
              approval_expired: copy.caseApprovalExpired,
              handled: copy.caseHandled,
            };
            const stateLabel = labels[status];
            const statusStateClass =
              status === "handled"
                ? " has-handled-state"
                : status === "awaiting_application"
                  ? " has-approved-state"
                  : status === "awaiting_review" || status === "approval_expired" || status === "needs_human_review"
                    ? " has-awaiting-state"
                    : "";
            return (
              <li key={reservation.id}>
                <button
                  className={`case-item${selected ? " is-selected" : ""}${statusStateClass}`}
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(reservation.id)}
                >
                  <span className="case-primary">
                    <span>{reservation.id}</span>
                    <span>{reservation.guestDisplayName}</span>
                  </span>
                  <span className="case-secondary">{stateLabel}</span>
                  <CaretRightIcon className="case-caret" />
                </button>
              </li>
            );
            })}
          </ul>
        </div>
      ) : (
        <p className="case-empty">{copy.noMatchingCases}</p>
      )}
    </nav>
  );
}

function PlaybookFlow({
  locale,
  sourceReservation,
  playbook,
  isSourceCase,
  onViewSource,
}: {
  locale: UiLocale;
  sourceReservation: Reservation | null;
  playbook: PublishedPlaybook | null;
  isSourceCase: boolean;
  onViewSource(): void;
}) {
  const copy = copyFor(locale);

  if (isSourceCase) {
    return <dl className="source-status">
      <div><dt>{copy.reservationResponse}</dt><dd className="is-handled">{copy.caseHandled}</dd></div>
      <div><dt>{copy.ruleRegistration}</dt><dd>{playbook ? copy.ruleRegistered : copy.ruleNotCreated}</dd></div>
    </dl>;
  }

  if (!playbook || !sourceReservation) {
    return null;
  }

  const name =
    playbook.id === NIGHT_ARRIVAL_PLAYBOOK.id
      ? copy.nightPlaybookName
      : copy.playbookName;

  return (
    <section className="playbook-flow" aria-label={copy.playbookFlow}>
      <span>{copy.playbookOrigin}</span>
      <button type="button" className="source-link" onClick={onViewSource}>
        {sourceReservation.guestDisplayName} <span>{sourceReservation.id}</span>
      </button>
      <i aria-hidden="true">·</i>
      <strong lang={locale === "en" ? "en" : undefined}>{name}</strong>
      <small>{copy.playbookBoundarySummary}</small>
    </section>
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
    <><div className="reservation-facts" aria-label={copy.reservationSummary}>
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
    </div><ReservationRequests locale={locale} reservation={reservation} /></>
  );
}

function EmptyWorkspace({
  locale,
  hasPlaybook,
}: {
  locale: UiLocale;
  hasPlaybook: boolean;
}) {
  const copy = copyFor(locale);

  return (
    <section className="empty-workspace" aria-labelledby="ready-heading">
      <h2 id="ready-heading">
        {hasPlaybook ? copy.readyHeading : copy.unmatchedHeading}
      </h2>
      <p>{hasPlaybook ? copy.readyBody : copy.unmatchedBody}</p>
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
      <h2 id="changes-heading">{applied ? copy.appliedChanges : copy.proposedChanges}</h2>
      <dl className="changes-list">
        {run.proposedChanges.map((change) => (
          <div
            className={`change-row${change.before ? " has-before" : ""}`}
            key={change.field}
          >
            <dt className="change-field">{fieldLabel(locale, change.field)}</dt>
            {change.before ? (
              <dd className="change-values">
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
              </dd>
            ) : (
              <dd className="change-values is-added">
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
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className={`application-note${applied ? " is-applied" : ""}`}>
        {applied ? copy.applied : copy.notApplied}
      </p>
    </section>
  );
}

function RejectedResult({ locale }: { locale: UiLocale }) {
  const copy = copyFor(locale);

  return (
    <section className="rejected-result" role="alert" aria-labelledby="rejected-heading">
      <h2 id="rejected-heading">{copy.humanReviewRequired}</h2>
      <p>{copy.noProposalCreated}</p>
    </section>
  );
}

function ReservationWorkspace({
  locale,
  sourceReservation,
  playbook,
  isSourceCase,
  demonstration,
  onViewSource,
  reservation,
  run,
  rejectionReasons,
}: {
  locale: UiLocale;
  sourceReservation: Reservation | null;
  playbook: PublishedPlaybook | null;
  isSourceCase: boolean;
  demonstration: Demonstration | null;
  onViewSource(): void;
  reservation: Reservation;
  run: PreparedRun | null;
  rejectionReasons: string[] | null;
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
      <PlaybookFlow
        locale={locale}
        sourceReservation={sourceReservation}
        playbook={playbook}
        isSourceCase={isSourceCase}
        onViewSource={onViewSource}
      />
      <ReservationFacts locale={locale} reservation={reservation} />
      {demonstration ? (
        <RecordedResponse locale={locale} reservation={reservation} demonstration={demonstration} />
      ) : rejectionReasons ? (
        <RejectedResult locale={locale} />
      ) : run && run.status !== "discarded" ? (
        <ProposedChanges locale={locale} run={run} />
      ) : (
        <EmptyWorkspace locale={locale} hasPlaybook={Boolean(playbook)} />
      )}
    </main>
  );
}

function ApprovalStatus({
  locale,
  run,
}: {
  locale: UiLocale;
  run: PreparedRun;
}) {
  const copy = copyFor(locale);
  const expiresAt = run.approvalExpiresAt;
  const validExpiry =
    typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt));

  if (!validExpiry) {
    return <div className="expired-status">{copy.approvalExpired}</div>;
  }

  return (
    <section className="approval-status-card" aria-label={copy.approvedReady}>
      <div className="approval-status-title">
        <div>
          <strong>{copy.approvedReady}</strong>
          <span>{copy.criteriaAllPassed}</span>
          <span>{copy.approvedNextStep}</span>
        </div>
      </div>
      {validExpiry ? (
        <div className="approval-expiry">
          <span>{copy.approvalValidUntil}</span>
          <time dateTime={expiresAt}>
            {formatFacilityTime(locale, expiresAt)} {copy.approvalTimeZone}
          </time>
        </div>
      ) : null}
      <p>{copy.approvalExactOnly}</p>
    </section>
  );
}

function ApprovalScope({
  locale,
  run,
}: {
  locale: UiLocale;
  run: PreparedRun;
}) {
  const copy = copyFor(locale);

  return (
    <section className="approval-scope" aria-labelledby="approval-scope-heading">
      <strong id="approval-scope-heading">{copy.approvalScope}</strong>
      <dl>
        <div>
          <dt>{run.reservationId}</dt>
          <dd>
            {run.proposedChanges.length} {copy.approvalChangeCountUnit}
          </dd>
        </div>
        <div>
          <dt>{copy.approvalLimit}</dt>
          <dd>{copy.approvalLimitValue}</dd>
        </div>
      </dl>
    </section>
  );
}

function PendingCriteria({ locale, eligibility }: { locale: UiLocale; eligibility: readonly string[] }) {
  const copy = copyFor(locale);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompact(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const list = <ul className="eligibility-list" id="approval-criteria">{eligibility.map(item => <li className="is-pending" key={item}><span>{item}</span><span className="criterion-status">{copy.criterionPending}</span></li>)}</ul>;
  return compact ? <details className="pending-criteria"><summary>{copy.viewConditions}</summary>{list}</details> : list;
}

function ReviewPanel({
  locale,
  isSourceCase,
  canTeach,
  playbook,
  suggestedSource,
  nextCase,
  onSelectCase,
  playbookId,
  canCheck,
  webMcpStatus,
  applying,
  applyError,
  focusCompletion,
  run,
  rejectionReasons,
  onPrepare,
  onApprove,
  onApply,
  onDiscard,
  onAudit,
  onTeach,
}: {
  locale: UiLocale;
  isSourceCase: boolean;
  canTeach: boolean;
  playbook: PublishedPlaybook | null;
  suggestedSource: Reservation | null;
  nextCase: Reservation | null;
  onSelectCase(id: string): void;
  playbookId: PlaybookId | null;
  canCheck: boolean;
  webMcpStatus: WebMcpStatus;
  applying: boolean;
  applyError: string | null;
  focusCompletion: boolean;
  run: PreparedRun | null;
  rejectionReasons: string[] | null;
  onPrepare(): void;
  onApprove(): void;
  onApply(run: PreparedRun): void;
  onDiscard(): void;
  onAudit(event: ReactMouseEvent<HTMLButtonElement>): void;
  onTeach(): void;
}) {
  const copy = copyFor(locale);
  const isAwaiting = run?.status === "awaiting_review";
  const isApproved = run?.status === "approved";
  const isCommitted = run?.status === "committed";
  const completionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCommitted && focusCompletion) completionRef.current?.focus();
  }, [isCommitted, focusCompletion]);
  const isStale = run?.status === "stale";
  const isDiscarded = run?.status === "discarded";
  const isRejected = Boolean(rejectionReasons);
  const criteriaPassed = Boolean(run && !isDiscarded);
  const showCriteriaSummary = isApproved || isCommitted || isStale;
  const failedCriteria = new Set<number>();
  const eligibility =
    playbookId === NIGHT_ARRIVAL_PLAYBOOK.id
      ? copy.nightEligibility
      : copy.eligibility;
  const reviewHeading =
    isSourceCase && !canTeach
      ? copy.playbookFlow
      : isSourceCase || !playbookId
        ? copy.nextAction
        : isAwaiting || isApproved || isCommitted ? copy.reviewAndApply : copy.review;
  rejectionReasons?.forEach((reason) => {
    const index = reason.startsWith("Arrival is later than ")
      ? 3
      : FAILED_CRITERION_BY_REASON[reason];
    if (index !== undefined) failedCriteria.add(index);
  });

  return (
    <aside className="review-panel" aria-labelledby="review-heading">
      <div className="review-heading-row">
        <h2 id="review-heading">{reviewHeading}</h2>
        {!isSourceCase && playbookId && !showCriteriaSummary && !isAwaiting ? (
          <span
            className={`criteria-state${
              isRejected
                ? " is-refused"
                : criteriaPassed
                  ? " is-passed"
                  : ""
            }`}
          >
            {isRejected
              ? copy.criteriaRefused
              : criteriaPassed
                ? copy.criteriaPassed
                : copy.criteriaPending}
          </span>
        ) : null}
      </div>
      {isSourceCase ? (
        <div className="source-case-note">
          {playbook ? <RegisteredRule locale={locale} playbook={playbook} /> : null}
          <p>{canTeach ? copy.sourceReadyHelp : copy.sourcePublishedHelp}</p>
          {canTeach ? (
            <button className="primary-action" type="button" onClick={onTeach}>
              {copy.teachThisCase}
            </button>
          ) : nextCase ? <button type="button" className="primary-action" onClick={() => onSelectCase(nextCase.id)}>{copy.tryMatchingCase}<span className="action-target">{nextCase.guestDisplayName}</span></button> : null}
        </div>
      ) : !playbookId ? (
        <div className="source-case-note">
          <p>{copy.noMatchingRuleHelp}</p>
          {suggestedSource ? <button type="button" className="primary-action" onClick={() => onSelectCase(suggestedSource.id)}>{copy.inspectRecordedCase}<span className="action-target">{suggestedSource.guestDisplayName}</span></button> : null}
          {canCheck ? <button className="primary-action" type="button" onClick={onPrepare}>{copy.checkConditions}</button> : null}
        </div>
      ) : isRejected ? (
        <>
          <ul className="eligibility-list" id="approval-criteria">
            {eligibility.map((item, index) => {
              const failed = failedCriteria.has(index);
              return (
                <li className={failed ? "is-failed" : "is-passed"} key={item}>
                  {failed ? <CloseIcon className="criterion-fail-icon" /> : null}
                  <span>{item}</span>
                  <span className="criterion-status">
                    {failed ? copy.criterionRefused : copy.criterionPassed}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="review-rejected">
            <CloseIcon className="rejected-icon" />
            <strong>{copy.outsideBoundary}</strong>
            <div className="refusal-reasons">
              {rejectionReasons?.map((reason) => <p key={reason}>{systemMessageLabel(locale, reason)}</p>)}
            </div>
          </div>
          <p className="manual-endpoint">{copy.manualEndpoint}</p>
        </>
      ) : showCriteriaSummary ? (
        isApproved || isCommitted ? null : (
          <div className={`criteria-complete-summary${isStale ? " is-stale" : ""}`}>
            <strong>{copy.criteriaPreviouslyPassed}</strong>
          </div>
        )
      ) : isAwaiting ? (
        <details className="checked-criteria">
          <summary id="approval-criteria">{copy.criteriaPassed}</summary>
          <ul className="eligibility-list">
            {eligibility.map(item => (
              <li className="is-passed" key={item}>
                <span>{item}</span>
                <span className="criterion-status">{copy.criterionPassed}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <PendingCriteria locale={locale} eligibility={eligibility} />
      )}
      {isAwaiting && run ? <ApprovalScope locale={locale} run={run} /> : null}
      <div className="review-actions" aria-busy={applying}>
        {applyError ? (
          <div className="application-error" role="alert">
            <p>{copy.applyFailed}</p>
            <p>{systemMessageLabel(locale, applyError)}</p>
            <button type="button" className="text-button" disabled={applying} onClick={onPrepare}>
              {copy.prepareAgain}
            </button>
          </div>
        ) : null}
        {isRejected && suggestedSource ? <button className="primary-action" type="button" onClick={() => onSelectCase(suggestedSource.id)}>{copy.inspectRecordedCase}<span className="action-target">{suggestedSource.guestDisplayName}</span></button> : isRejected && nextCase ? <button className="primary-action" type="button" onClick={() => onSelectCase(nextCase.id)}>{copy.tryAnotherCase}<span className="action-target">{nextCase.guestDisplayName}</span></button> : null}
        {!isSourceCase && playbookId && !isRejected ? (
          <>
            {(!run || isDiscarded) ? (
              <button className="primary-action" type="button" onClick={onPrepare}>
                {copy.preparePreview}
              </button>
            ) : (isAwaiting || isApproved) && run ? (
              <>
                {isApproved ? <ApprovalStatus locale={locale} run={run} /> : null}
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => onApply(run)}
                  disabled={applying}
                  aria-describedby={isAwaiting ? "approval-criteria changes-heading" : "changes-heading"}
                >
                  {applying ? copy.applying : isApproved ? copy.applyApproved : copy.approveAndApply}
                </button>
              </>
            ) : isCommitted ? (
              <div className="completion-status" role="status" tabIndex={-1} ref={completionRef}>
                <CheckIcon className="approval-status-icon" />
                <div>
                  <strong>{copy.committed}</strong>
                  <p>{copy.applied}</p>
                </div>
              </div>
            ) : isStale ? (
              <>
                <div className="expired-status">{copy.approvalExpired}</div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={onPrepare}
                >
                  {copy.prepareAgain}
                </button>
              </>
            ) : null}
            {run && !isCommitted && run.status !== "discarded" ? (
              <button
                className="secondary-action"
                type="button"
                onClick={onDiscard}
                disabled={applying}
              >
                {copy.discard}
              </button>
            ) : null}
            {isAwaiting ? (
              <details className="agent-approval-options">
                <summary>{copy.agentApprovalOptions}</summary>
                <p>{copy.agentApprovalHelp}</p>
                {webMcpStatus !== "ready" ? <p>{copy.approvedWithoutWebMcp}</p> : null}
                <button className="text-button" type="button" onClick={onApprove} disabled={applying}>
                  {copy.approvePreview}
                </button>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
      <footer className="demo-footnote">
        <button className="text-button audit-link" type="button" onClick={onAudit}>
          {copy.viewAudit}
        </button>
      </footer>
    </aside>
  );
}

function AuditDrawer({
  locale,
  open,
  events,
  webMcpStatus,
  lastWebMcpCall,
  onClose,
  backgroundRef,
  returnFocusRef,
}: {
  locale: UiLocale;
  open: boolean;
  events: AppState["audit"];
  webMcpStatus: WebMcpStatus;
  lastWebMcpCall: WebMcpCall | null;
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
          'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  const webMcpConnectionLabel =
    webMcpStatus === "ready"
      ? copy.webMcpConnected
      : webMcpStatus === "checking"
        ? copy.webMcpCheckingConnection
        : copy.webMcpNotConnected;
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
        <p className="audit-evidence">{copy.auditEvidence}</p>
        <p className="audit-provenance">{copy.auditProvenance}</p>
        <details className="webmcp-evidence">
          <summary>
            <span>{webMcpConnectionLabel}</span>
            {webMcpStatus === "ready" ? (
              <span>{WEBMCP_TOOL_COUNT} {copy.webMcpToolCount}</span>
            ) : null}
          </summary>
          {lastWebMcpCall ? (
            <dl>
              <div>
                <dt>{copy.webMcpLastCall}</dt>
                <dd><code>{lastWebMcpCall.name}</code></dd>
              </div>
              <div>
                <dt>{copy.webMcpResult}</dt>
                <dd><code>{lastWebMcpCall.code}</code></dd>
              </div>
            </dl>
          ) : (
            <p>{copy.webMcpNoCalls}</p>
          )}
        </details>
        <ol className="audit-events">
          {[...events].reverse().map((event) => (
            <li key={event.id}>
              <strong>{actorLabel(locale, event.actor)}</strong>
              <div className="audit-event-body">
                <span className="audit-event-type">
                  {auditOperationLabel(locale, event.summary)}
                </span>
                <span>{auditSummaryLabel(locale, event.summary)}</span>
              </div>
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
  return <DemoSession><TeachbackApp /></DemoSession>;
}

function TeachbackApp() {
  const [state, dispatch] = useReducer(stateReducer, undefined, loadState);
  const stateRef = useRef(state);
  const [journey, setJourney] = useState<TeachingJourney>(loadTeachingJourney);
  const journeyRef = useRef(journey);
  const [locale, setLocale] = useState<UiLocale>(() => {
    const initialLocale = loadLocale();
    document.documentElement.lang = initialLocale;
    return initialLocale;
  });
  const localeRef = useRef(locale);
  const [announcement, setAnnouncement] = useState(() =>
    systemMessageLabel(locale, "Teachback demo ready."),
  );
  const [webMcpStatus, setWebMcpStatus] =
    useState<WebMcpStatus>("checking");
  const [lastWebMcpCall, setLastWebMcpCall] =
    useState<WebMcpCall | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const [resetOpen, setResetOpen] = useState(false);
  const [storageFailure, setStorageFailure] = useState<"save" | "reset" | "partial" | null>(null);
  const [publishedNotice, setPublishedNotice] = useState<{ source: Reservation; target: Reservation | null } | null>(null);
  const applyingRef = useRef(false);
  const [applying, setApplying] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState<{
    runId: string;
    error: string | null;
    completed: boolean;
  } | null>(null);
  const appContentRef = useRef<HTMLDivElement>(null);
  const auditTriggerRef = useRef<HTMLButtonElement>(null);

  const replaceState = useCallback((nextState: AppState, message: string) => {
    stateRef.current = nextState;
    dispatch({ type: "replace", state: nextState });
    setAnnouncement(systemMessageLabel(localeRef.current, message));
  }, []);

  const commitTeachingJourney = useCallback(
    (
      expectedState: TeachingJourney,
      nextState: TeachingJourney,
      message: string,
    ): boolean => {
      if (journeyRef.current !== expectedState) return false;
      journeyRef.current = nextState;
      setJourney(nextState);
      setAnnouncement(systemMessageLabel(localeRef.current, message));
      return true;
    },
    [],
  );

  const commitState = useCallback(
    (expectedState: AppState, nextState: AppState, message: string): boolean => {
      if (stateRef.current !== expectedState) return false;
      replaceState(nextState, message);
      return true;
    },
    [replaceState],
  );

  const reportWebMcpCall = useCallback((call: WebMcpCall) => {
    setLastWebMcpCall(call);
  }, []);

  const isCurrentCaseVisible = useCallback(() => journeyRef.current.stage === "reuse" && filterReservations(stateRef.current.reservations, queryRef.current).some(item => item.id === stateRef.current.selectedReservationId), []);

  const saveSession = useCallback((nextState: AppState, nextJourney: TeachingJourney) => {
    try {
      const result = persistSession(localStorage, nextState, nextJourney);
      setStorageFailure(result.ok ? null : result.partialWrite ? "partial" : "save");
      return result.ok;
    } catch {
      setStorageFailure("save");
      return false;
    }
  }, []);

  useEffect(() => {
    saveSession(state, journey);
  }, [state, journey, saveSession]);

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
    setWebMcpStatus("checking");
    registerWebMcpTools({
      getState: () => stateRef.current,
      commitState,
      getTeachingJourney: () => journeyRef.current,
      commitTeachingJourney,
      reportWebMcpCall,
      isCurrentCaseVisible,
    })
      .then((registeredController) => {
        if (cancelled) {
          registeredController?.abort();
          return;
        }
        controller = registeredController;
        setWebMcpStatus(registeredController ? "ready" : "unavailable");
      })
      .catch(() => {
        if (cancelled) return;
        setWebMcpStatus("error");
      });

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [commitState, commitTeachingJourney, reportWebMcpCall, isCurrentCaseVisible]);

  // Expiry is independent of which case is visible. Schedule the nearest deadline.
  const approvalExpiresAt = Math.min(
    ...Object.values(state.runsByReservationId)
      .filter((run) => run.status === "approved")
      .map((run) => {
        const expiresAt = run.approvalExpiresAt
          ? Date.parse(run.approvalExpiresAt)
          : NaN;
        return Number.isFinite(expiresAt) ? expiresAt : 0;
      }),
  );

  useEffect(() => {
    if (!Number.isFinite(approvalExpiresAt)) return;

    const markExpired = () => {
      const current = stateRef.current;
      const expired = expireApprovedRun(current);
      if (expired !== current) {
        commitState(current, expired, "Approval expired. Prepare a new preview.");
      }
    };
    const delay = Number.isFinite(approvalExpiresAt)
      ? Math.max(0, approvalExpiresAt - Date.now())
      : 0;
    const timer = window.setTimeout(markExpired, delay + 25);
    return () => window.clearTimeout(timer);
  }, [approvalExpiresAt, commitState]);

  const reservation = selectedReservation(state);
  const sourceDemonstration = demonstrationForReservation(
    journey.demonstrations,
    reservation.id,
  );
  const isSourceCase = sourceDemonstration !== null;
  const visibleRun = runForReservation(state);
  const rejectionReasons = rejectionForReservation(state)?.reasons ?? null;
  const rejectedPlaybook = journey.publishedPlaybooks.find(
    (playbook) => playbook.id === rejectionForReservation(state)?.playbookId,
  ) ?? null;
  const applicablePlaybook = isSourceCase
    ? sourceDemonstration
      ? publishedPlaybookForDemonstration(
          journey.publishedPlaybooks,
          sourceDemonstration.id,
        )
      : null
    : journey.publishedPlaybooks.find(
        (playbook) => eligibilityReasons(reservation, playbook.boundary).length === 0,
      ) ?? null;
  const visiblePlaybook = visibleRun
    ? journey.publishedPlaybooks.find(
        (playbook) => playbook.id === visibleRun.playbookId,
      ) ?? applicablePlaybook
    : applicablePlaybook ?? rejectedPlaybook;
  const sourceReservation = visiblePlaybook
    ? reservationForDemonstration(
        state.reservations,
        visiblePlaybook.sourceDemonstrationId,
        journey.demonstrations,
      )
    : isSourceCase
      ? reservation
      : null;
  const canTeach =
    sourceDemonstration !== null &&
    !publishedPlaybookForDemonstration(
      journey.publishedPlaybooks,
      sourceDemonstration.id,
    );
  const teachingDemonstration =
    activeDemonstration(journey) ??
    (journey.draft
      ? journey.demonstrations.find(
          (candidate) =>
            candidate.id === journey.draft?.sourceDemonstrationId,
        ) ?? null
      : null);
  const teachingReservation =
    teachingDemonstration
      ? state.reservations.find(
          (candidate) =>
            candidate.id === teachingDemonstration.reservationId,
        ) ?? reservation
      : reservation;

  const prepare = useCallback(async () => {
    if (applyingRef.current || !isCurrentCaseVisible()) return;
    setApplyFeedback(null);
    const sourceState = stateRef.current;
    const playbook = playbookForPreparation(
      selectedReservation(sourceState),
      journeyRef.current.publishedPlaybooks,
    );
    if (!playbook) {
      setAnnouncement(
        systemMessageLabel(
          localeRef.current,
          "A person must review and publish the playbook first.",
        ),
      );
      return;
    }
    const prepared = await prepareCurrentRun(sourceState, new Date(), playbook, "Website");
    if (!isCurrentCaseVisible() || !commitState(sourceState, prepared.state, prepared.result.summary)) {
      setAnnouncement(
        systemMessageLabel(
          localeRef.current,
          "The case changed while the preview was being prepared.",
        ),
      );
    }
  }, [commitState, isCurrentCaseVisible]);

  const approve = useCallback(() => {
    if (applyingRef.current) return;
    const approved = approveCurrentRun(stateRef.current);
    replaceState(approved.state, approved.result.summary);
  }, [replaceState]);

  const apply = useCallback(async (displayedRun: PreparedRun) => {
    if (applyingRef.current || !isCurrentCaseVisible()) return;
    applyingRef.current = true;
    setApplying(true);
    setApplyFeedback(null);
    const sourceState = stateRef.current;
    const sourceJourney = journeyRef.current;
    try {
      const applied = await approveAndCommitCurrentRun(
        sourceState,
        { runId: displayedRun.id, expectedDigest: displayedRun.digest },
        sourceJourney.stage === "reuse" ? sourceJourney.publishedPlaybooks : [],
      );
      // Do not overwrite a reset, case switch, expiry, or concurrent agent action.
      if (!isCurrentCaseVisible() || journeyRef.current !== sourceJourney || !commitState(sourceState, applied.state, applied.result.summary)) {
        const currentRun = runForReservation(stateRef.current);
        if (currentRun?.id === displayedRun.id && currentRun.status === "committed") {
          setApplyFeedback(null);
        } else {
          setApplyFeedback({ runId: displayedRun.id, completed: false, error: "The case changed while the approved run was being committed." });
        }
        return;
      }
      setApplyFeedback({ runId: displayedRun.id, completed: applied.result.ok, error: applied.result.ok ? null : applied.result.summary });
    } catch {
      setApplyFeedback({ runId: displayedRun.id, completed: false, error: "No changes have been applied." });
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }, [commitState, isCurrentCaseVisible]);

  const discard = useCallback(() => {
    if (applyingRef.current) return;
    setApplyFeedback(null);
    replaceState(discardCurrentRun(stateRef.current), "Preview discarded.");
  }, [replaceState]);

  const reset = useCallback(() => {
    const initial = resetDemo();
    const published = createPublishedJourney();
    setResetOpen(false);
    if (!saveSession(initial, published)) {
      setStorageFailure(current => current === "partial" ? "partial" : "reset");
      return;
    }
    setApplyFeedback(null);
    setPublishedNotice(null);
    queryRef.current = "";
    setQuery("");
    replaceState(initial, "Demo reset.");
    journeyRef.current = published;
    setJourney(published);
    setLastWebMcpCall(null);
  }, [replaceState, saveSession]);

  const createDraft = useCallback(() => {
    const source = journeyRef.current;
    const demonstration = activeDemonstration(source);
    const boundary = demonstration
      ? PLAYBOOK_DEFINITIONS[demonstration.playbookId]?.agentDraftBoundary ??
        AGENT_DRAFT_BOUNDARY
      : AGENT_DRAFT_BOUNDARY;
    const drafted = draftPlaybook(source, boundary, new Date(), "Website");
    commitTeachingJourney(source, drafted.state, drafted.result.summary);
  }, [commitTeachingJourney]);

  const changeDraftBoundary = useCallback(
    (patch: {
      latestArrivalLimit?: "22:00" | "23:00" | "23:59";
      taxiHandling?: "allow" | "escalate";
      dietaryHandling?: "allow" | "escalate";
      compensationHandling?: "allow" | "escalate";
    }) => {
      const source = journeyRef.current;
      const next = updateDraftBoundary(source, patch);
      commitTeachingJourney(source, next, "A person updated the draft boundary.");
    },
    [commitTeachingJourney],
  );

  const enterReuse = useCallback(
    (
      published: TeachingJourney,
      message: string,
      selectedReservationId = "R-2048",
    ) => {
      const nextState: AppState = {
        ...stateRef.current,
        selectedReservationId,
        rejectionsByReservationId: Object.fromEntries(Object.entries(stateRef.current.rejectionsByReservationId).filter(
          ([id]) => {
            const reservation = stateRef.current.reservations.find((item) => item.id === id);
            return !reservation || !playbookForReservation(reservation, published.publishedPlaybooks);
          },
        )),
        audit: [...stateRef.current.audit, ...teachingAuditEvents(published).filter(
          (event) => !stateRef.current.audit.some((existing) => existing.id === event.id),
        )],
      };
      journeyRef.current = published;
      setJourney(published);
      replaceState(nextState, message);
    },
    [replaceState],
  );

  const publishDraft = useCallback(() => {
    const source = journeyRef.current;
    const publishingPlaybookId = source.draft?.playbookId;
    const published = publishPlaybook(source);
    if (!published.result.ok) {
      setAnnouncement(
        systemMessageLabel(localeRef.current, published.result.summary),
      );
      return;
    }
    const newlyPublished = published.state.publishedPlaybooks.find(
      (playbook) => playbook.id === publishingPlaybookId,
    );
    const nextReservation = newlyPublished
      ? stateRef.current.reservations.find((candidate) => {
          if (
            demonstrationForReservation(
              published.state.demonstrations,
              candidate.id,
            )
          ) {
            return false;
          }
          const matchesNewRule =
            eligibilityReasons(candidate, newlyPublished.boundary).length === 0;
          const matchedBefore = source.publishedPlaybooks.some(
            (playbook) =>
              eligibilityReasons(candidate, playbook.boundary).length === 0,
          );
          return matchesNewRule && !matchedBefore;
        })
      : null;
    const sourceReservation = reservationForDemonstration(stateRef.current.reservations, newlyPublished?.sourceDemonstrationId ?? "", source.demonstrations);
    if (sourceReservation) setPublishedNotice({ source: sourceReservation, target: nextReservation ?? null });
    queryRef.current = "";
    setQuery("");
    enterReuse(
      published.state,
      published.result.summary,
      nextReservation?.id ?? stateRef.current.selectedReservationId,
    );
  }, [enterReuse]);

  const teachCurrentPattern = useCallback(() => {
    const source = journeyRef.current;
    const demonstration = demonstrationForReservation(
      source.demonstrations,
      stateRef.current.selectedReservationId,
    );
    if (!demonstration) return;
    const next = startTeachingDemonstration(source, demonstration.id);
    commitTeachingJourney(
      source,
      next,
      `Selected ${demonstration.reservationId} as a teaching source.`,
    );
  }, [commitTeachingJourney]);

  const leaveTeaching = useCallback(() => {
    const source = journeyRef.current;
    const next: TeachingJourney = {
      ...source,
      stage: "reuse",
      teachingDemonstrationId: null,
      draft: null,
    };
    commitTeachingJourney(source, next, "Returned to reservation details.");
  }, [commitTeachingJourney]);

  const selectWhileTeaching = useCallback(
    (reservationId: string) => {
      const source = journeyRef.current;
      const next: TeachingJourney = {
        ...source,
        stage: "reuse",
        teachingDemonstrationId: null,
        draft: null,
      };
      journeyRef.current = next;
      setJourney(next);
      replaceState(
        selectReservation(stateRef.current, reservationId),
        `Selected reservation ${reservationId}.`,
      );
    },
    [replaceState],
  );

  const select = useCallback(
    (reservationId: string) => {
      setPublishedNotice(null);
      replaceState(
        selectReservation(stateRef.current, reservationId),
        `Selected reservation ${reservationId}.`,
      );
    },
    [replaceState],
  );

  const selectCaseFromAction = (id: string) => {
    queryRef.current = "";
    setQuery("");
    setPublishedNotice(null);
    select(id);
  };
  const changeQuery = (value: string) => {
    queryRef.current = value;
    setQuery(value);
    setPublishedNotice(null);
  };
  const displayedReservationId = journey.stage === "reuse" ? reservation.id : teachingReservation.id;
  const selectedCaseVisible = filterReservations(state.reservations, query).some(item => item.id === displayedReservationId);
  const nextCase = findNextReusableReservation({
    reservations: state.reservations,
    currentReservationId: reservation.id,
    runsByReservationId: state.runsByReservationId,
    demonstrations: journey.demonstrations,
    publishedPlaybooks: journey.publishedPlaybooks,
    sourcePlaybookId: isSourceCase ? visiblePlaybook?.id : null,
  });
  const suggestedDemonstration = journey.demonstrations.find(item => !journey.publishedPlaybooks.some(rule => rule.sourceDemonstrationId === item.id) && PLAYBOOK_DEFINITIONS[item.playbookId] && eligibilityReasons(reservation, PLAYBOOK_DEFINITIONS[item.playbookId].boundary).length === 0);
  const suggestedSource = suggestedDemonstration ? reservationForDemonstration(state.reservations, suggestedDemonstration.id, journey.demonstrations) : null;

  const openAudit = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      auditTriggerRef.current = event.currentTarget;
      setAuditOpen(true);
    },
    [],
  );
  const closeAudit = useCallback(() => setAuditOpen(false), []);
  const changeLocale = useCallback((nextLocale: UiLocale) => {
    if (localeRef.current === nextLocale) return;
    localeRef.current = nextLocale;
    document.documentElement.lang = nextLocale;
    setLocale(nextLocale);
  }, []);

  return (
    <div className="app-shell" data-locale={locale}>
      <div className="app-content" ref={appContentRef}>
        <AppHeader
          locale={locale}
          onLocaleChange={changeLocale}
          onReset={() => setResetOpen(true)}
        />
        <div className="product-context-row">
          <DemoIntro locale={locale} />
        </div>
        {storageFailure ? <div className="storage-warning" role="alert"><p>{storageFailure === "reset" ? copyFor(locale).resetFailed : storageFailure === "partial" ? copyFor(locale).storagePartialWarning : copyFor(locale).storageWarning}</p><button type="button" className="text-button" onClick={() => saveSession(stateRef.current, journeyRef.current)}>{copyFor(locale).storageRetry}</button></div> : null}
        {publishedNotice ? <section className="publish-notice" role="status">
          <div><strong>{copyFor(locale).rulePublishedNotice} {publishedNotice.source.guestDisplayName}</strong>{publishedNotice.target ? <p>{copyFor(locale).reuseTargetNotice} {publishedNotice.target.guestDisplayName}</p> : null}</div>
          <button type="button" className="text-button" onClick={() => selectCaseFromAction(publishedNotice.source.id)}>{copyFor(locale).viewSource}</button>
          <button type="button" className="icon-button" aria-label={copyFor(locale).dismissNotice} onClick={() => setPublishedNotice(null)}><CloseIcon /></button>
        </section> : null}
        <div className={`app-grid${journey.stage === "reuse" ? "" : " is-teaching"}`}>
          <CaseQueue
            locale={locale}
            reservations={state.reservations}
            selectedId={
              journey.stage === "reuse"
                ? state.selectedReservationId
                : teachingReservation.id
            }
            runsByReservationId={state.runsByReservationId}
            rejectionsByReservationId={state.rejectionsByReservationId}
            demonstrations={journey.demonstrations}
            publishedPlaybooks={journey.publishedPlaybooks}
            query={query}
            onQueryChange={changeQuery}
            onSelect={journey.stage === "reuse" ? select : selectWhileTeaching}
          />
          {!selectedCaseVisible ? <main className="search-empty-workspace"><h1>{copyFor(locale).noMatchingCases}</h1><p>{copyFor(locale).emptySearchHelp}</p><button type="button" className="text-button" onClick={() => changeQuery("")}>{copyFor(locale).clearSearch}</button></main> : journey.stage === "reuse" ? (
            <>
              <ReservationWorkspace
                locale={locale}
                sourceReservation={sourceReservation}
                playbook={visiblePlaybook}
                isSourceCase={isSourceCase}
                demonstration={sourceDemonstration}
                onViewSource={() => sourceReservation && selectCaseFromAction(sourceReservation.id)}
                reservation={reservation}
                run={visibleRun}
                rejectionReasons={rejectionReasons}
              />
              <ReviewPanel
                locale={locale}
                isSourceCase={isSourceCase}
                canTeach={canTeach}
                playbook={visiblePlaybook}
                suggestedSource={suggestedSource}
                nextCase={nextCase}
                onSelectCase={selectCaseFromAction}
                playbookId={visiblePlaybook?.id ?? null}
                canCheck={journey.publishedPlaybooks.length > 0}
                webMcpStatus={webMcpStatus}
                applying={applying}
                applyError={applyFeedback?.runId === visibleRun?.id ? applyFeedback?.error ?? null : null}
                focusCompletion={applyFeedback?.runId === visibleRun?.id && Boolean(applyFeedback?.completed)}
                run={visibleRun}
                rejectionReasons={rejectionReasons}
                onPrepare={prepare}
                onApprove={approve}
                onApply={apply}
                onDiscard={discard}
                onAudit={openAudit}
                onTeach={teachCurrentPattern}
              />
            </>
          ) : (
            <TeachingWorkspace
              locale={locale}
              journey={journey}
              reservation={teachingReservation}
              onDraft={createDraft}
              onBoundaryChange={changeDraftBoundary}
              onPublish={publishDraft}
              onBack={leaveTeaching}
            />
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
      <AuditDrawer
        locale={locale}
        open={auditOpen}
        events={state.audit}
        webMcpStatus={webMcpStatus}
        lastWebMcpCall={lastWebMcpCall}
        onClose={closeAudit}
        backgroundRef={appContentRef}
        returnFocusRef={auditTriggerRef}
      />
      <ResetConfirmation locale={locale} open={resetOpen} onCancel={() => setResetOpen(false)} onConfirm={reset} />
    </div>
  );
}

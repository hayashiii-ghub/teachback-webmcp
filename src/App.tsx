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
import {
  approveCurrentRun,
  discardCurrentRun,
  eligibilityReasons,
  expireApprovedRun,
  playbookForReservation,
  prepareCurrentRun,
  resetDemo,
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

const STORAGE_KEY = "teachback-demo-v1";
const LOCALE_STORAGE_KEY = "teachback-ui-locale-v1";
const TEACHING_STORAGE_KEY = "teachback-teaching-v4";
const TEACHING_SCENARIO_VERSION_KEY = "teachback-teaching-scenario-version";
const TEACHING_SCENARIO_VERSION = "5";

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
    value.storageVersion !== 2 ||
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
  const reservationIdsAreUnique =
    reservationIds.size === value.reservations.length;
  const activeRunIsValid =
    value.activeRun === null ||
    (isPreparedRun(value.activeRun) &&
      reservationIds.has(value.activeRun.reservationId) &&
      value.activeRun.reservationId === value.selectedReservationId);
  const rejectionIsValid =
    value.rejection === null ||
    (isRecord(value.rejection) &&
      typeof value.rejection.reservationId === "string" &&
      reservationIds.has(value.rejection.reservationId) &&
      value.rejection.reservationId === value.selectedReservationId &&
      Array.isArray(value.rejection.reasons) &&
      value.rejection.reasons.length > 0 &&
      value.rejection.reasons.every((reason) => typeof reason === "string"));
  const executionStateIsExclusive =
    value.activeRun === null || value.rejection === null;
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
    activeRunIsValid &&
    rejectionIsValid &&
    executionStateIsExclusive &&
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
  const activeIndex = stage === "demonstration" ? 0 : stage === "draft" ? 1 : 2;
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
  const actionLabels = isNight
    ? copy.nightDemonstrationActionLabels
    : copy.demonstrationActionLabels;
  const fixedRuleLabels = isNight
    ? copy.nightFixedRuleLabels.filter((_, index) => [0, 1, 6].includes(index))
    : copy.fixedRuleLabels;

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
        <section className="teaching-record" aria-labelledby="demonstration-heading">
          <div className="teaching-record-heading">
            <div>
              <span>
                {isNight
                  ? copy.nightDemonstratedActionsDetail
                  : copy.demonstratedActionsDetail}
              </span>
              <h2 id="demonstration-heading">{copy.demonstratedActions}</h2>
            </div>
            <strong>{reservation.id}</strong>
          </div>
          <p>{isNight ? copy.nightRecordedTeachingBody : copy.recordedTeachingBody}</p>
          <ol>
            {actionLabels.map((action, index) => (
              <li key={action}>
                <span>{index + 1}</span>
                <strong>{action}</strong>
              </li>
            ))}
          </ol>
        </section>
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
                  <dd>{actionLabels.length}{copy.teachingCountUnit}</dd>
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
              <div className="draft-rules-heading">
                <strong>{copy.fixedSafeguards}</strong>
                <span>{fixedRuleLabels.length}</span>
              </div>
              <ul className="fixed-rules">
                {fixedRuleLabels.map((rule) => (
                  <li key={rule}>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              <div className="boundary-section-heading">
                <strong>{copy.setBoundary}</strong>
                <span>{copy.agentProposal}</span>
              </div>
              {!isNight ? <>
              <div
                className={`boundary-control${
                  draft.boundary.latestArrivalLimit === "22:00" ? " is-safe" : " is-risky"
                }`}
              >
                <label htmlFor="latest-arrival-boundary">{copy.latestArrivalRule}</label>
                <select
                  id="latest-arrival-boundary"
                  value={draft.boundary.latestArrivalLimit}
                  onChange={(event) =>
                    onBoundaryChange({
                      latestArrivalLimit: event.target.value as "22:00" | "23:00",
                    })
                  }
                >
                  <option value="23:00">23:00 · {copy.agentProposal}</option>
                  <option value="22:00">22:00 · {copy.humanBoundary}</option>
                </select>
              </div>
              <div
                className={`boundary-control${
                  draft.boundary.taxiHandling === "escalate" ? " is-safe" : " is-risky"
                }`}
              >
                <label htmlFor="taxi-boundary">{copy.taxiRule}</label>
                <select
                  id="taxi-boundary"
                  value={draft.boundary.taxiHandling}
                  onChange={(event) =>
                    onBoundaryChange({
                      taxiHandling: event.target.value as "allow" | "escalate",
                    })
                  }
                >
                  <option value="allow">{copy.taxiAllow} · {copy.agentProposal}</option>
                <option value="escalate">{copy.taxiEscalate} · {copy.humanBoundary}</option>
              </select>
              </div>
              </> : (<>
                <dl className="night-boundary-summary">
                  <div>
                    <dt>{copy.latestArrivalRule}</dt>
                    <dd>{definition.boundary.latestArrivalLimit}</dd>
                  </div>
                  <div>
                    <dt>{copy.dietaryRule}</dt>
                    <dd>{copy.handleInPlaybook}</dd>
                  </div>
                  <div>
                    <dt>{copy.taxiRule}</dt>
                    <dd>{copy.taxiAllow}</dd>
                  </div>
                </dl>
                <div
                  className={`boundary-control${
                    draft.boundary.compensationHandling === "escalate"
                      ? " is-safe"
                      : " is-risky"
                  }`}
                >
                  <label htmlFor="compensation-boundary">
                    {copy.compensationRule}
                  </label>
                  <select
                    id="compensation-boundary"
                    value={draft.boundary.compensationHandling}
                    onChange={(event) =>
                      onBoundaryChange({
                        compensationHandling: event.target.value as
                          | "allow"
                          | "escalate",
                      })
                    }
                  >
                    <option value="allow">
                      {copy.compensationAllow} · {copy.agentProposal}
                    </option>
                    <option value="escalate">
                      {copy.compensationEscalate} · {copy.humanBoundary}
                    </option>
                  </select>
                </div>
              </>)}
              <button
                className="primary-action"
                type="button"
                disabled={!publishable}
                onClick={onPublish}
              >
                {copy.publishPlaybook}
              </button>
              <p className={`publish-note${publishable ? " is-ready" : ""}`}>
                {publishable
                  ? copy.publishReady
                  : isNight
                    ? copy.nightPublishBlocked
                    : copy.publishBlocked}
              </p>
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
  activeRun,
  rejectedReservationId,
  demonstrations,
  publishedPlaybooks,
  onSelect,
}: {
  locale: UiLocale;
  reservations: Reservation[];
  selectedId: string;
  activeRun: PreparedRun | null;
  rejectedReservationId: string | null;
  demonstrations: Demonstration[];
  publishedPlaybooks: PublishedPlaybook[];
  onSelect(id: string): void;
}) {
  const copy = copyFor(locale);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredReservations = normalizedQuery
    ? reservations.filter((reservation) =>
        `${reservation.id} ${reservation.guestDisplayName}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : reservations;
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
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="case-pagination" aria-label={copy.cases}>
            <button
              className="case-page-control"
              type="button"
              aria-label={copy.previousCases}
              aria-controls="case-list"
              disabled={!railState.canScrollBack}
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
              disabled={!railState.canScrollForward}
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
              activeRun,
              rejectedReservationId,
            });
            const labels: Record<CaseQueueStatus, string> = {
              unhandled: copy.caseUnhandled,
              awaiting_review: copy.caseAwaitingReview,
              handled: copy.caseHandled,
            };
            const stateLabel = labels[status];
            const statusStateClass =
              status === "handled"
                ? " has-handled-state"
                : status === "awaiting_review"
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
}: {
  locale: UiLocale;
  sourceReservation: Reservation | null;
  playbook: PublishedPlaybook | null;
}) {
  const copy = copyFor(locale);

  if (!playbook || !sourceReservation) {
    return (
      <section className="playbook-flow is-unmatched" aria-label={copy.playbookFlow}>
        <span>{copy.noMatchingPlaybook}</span>
      </section>
    );
  }

  const name =
    playbook.id === NIGHT_ARRIVAL_PLAYBOOK.id
      ? copy.nightPlaybookName
      : copy.playbookName;

  return (
    <section className="playbook-flow" aria-label={copy.playbookFlow}>
      <span>{copy.playbookOrigin}</span>
      <strong>{sourceReservation.id}</strong>
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

function RecordedWorkspace({
  locale,
  canTeach,
}: {
  locale: UiLocale;
  canTeach: boolean;
}) {
  const copy = copyFor(locale);

  return (
    <section className="recorded-workspace" aria-labelledby="recorded-heading">
      <h2 id="recorded-heading">
        {canTeach ? copy.unlearnedRecordedHeading : copy.recordedHeading}
      </h2>
      <p>{canTeach ? copy.unlearnedRecordedBody : copy.recordedBody}</p>
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
  canTeach,
  isSourceCase,
  reservation,
  run,
  rejectionReasons,
}: {
  locale: UiLocale;
  sourceReservation: Reservation | null;
  playbook: PublishedPlaybook | null;
  canTeach: boolean;
  isSourceCase: boolean;
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
      />
      <ReservationFacts locale={locale} reservation={reservation} />
      {isSourceCase ? (
        <RecordedWorkspace locale={locale} canTeach={canTeach} />
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

function WebMcpAvailability({
  locale,
  status,
}: {
  locale: UiLocale;
  status: WebMcpStatus;
}) {
  const copy = copyFor(locale);
  const details = {
    checking: {
      label: copy.webMcpChecking,
      description: copy.webMcpCheckingDetail,
    },
    ready: {
      label: copy.webMcpReady,
      description: copy.webMcpReadyDetail,
    },
    unavailable: {
      label: copy.webMcpUnavailable,
      description: copy.webMcpUnavailableDetail,
    },
    error: {
      label: copy.webMcpError,
      description: copy.webMcpErrorDetail,
    },
  }[status];

  return (
    <div
      className={`webmcp-availability is-${status}`}
      role="status"
      aria-atomic="true"
    >
      <span className="webmcp-status-dot" aria-hidden="true" />
      <div>
        <span className="webmcp-label">{copy.webMcpTools}</span>
        <strong>{details.label}</strong>
        <p>{details.description}</p>
      </div>
    </div>
  );
}

function ApprovalStatus({
  locale,
  run,
  webMcpStatus,
}: {
  locale: UiLocale;
  run: PreparedRun;
  webMcpStatus: WebMcpStatus;
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
        <CheckIcon className="approval-status-icon" />
        <div>
          <strong>{copy.approvedReady}</strong>
          <span>{copy.criteriaAllPassed}</span>
          {webMcpStatus === "ready" ? null : (
            <span>{copy.approvedWithoutWebMcp}</span>
          )}
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

function ReviewPanel({
  locale,
  isSourceCase,
  canTeach,
  playbookId,
  webMcpStatus,
  run,
  rejectionReasons,
  onPrepare,
  onApprove,
  onDiscard,
  onAudit,
  onTeach,
}: {
  locale: UiLocale;
  isSourceCase: boolean;
  canTeach: boolean;
  playbookId: PlaybookId | null;
  webMcpStatus: WebMcpStatus;
  run: PreparedRun | null;
  rejectionReasons: string[] | null;
  onPrepare(): void;
  onApprove(): void;
  onDiscard(): void;
  onAudit(event: ReactMouseEvent<HTMLButtonElement>): void;
  onTeach(): void;
}) {
  const copy = copyFor(locale);
  const isAwaiting = run?.status === "awaiting_review";
  const isApproved = run?.status === "approved";
  const isCommitted = run?.status === "committed";
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
        : copy.review;
  rejectionReasons?.forEach((reason) => {
    const index = FAILED_CRITERION_BY_REASON[reason];
    if (index !== undefined) failedCriteria.add(index);
  });

  return (
    <aside className="review-panel" aria-labelledby="review-heading">
      <div className="review-heading-row">
        <h2 id="review-heading">{reviewHeading}</h2>
        {!isSourceCase && playbookId && !showCriteriaSummary ? (
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
      {!playbookId || webMcpStatus === "ready" || isApproved ? null : (
        <WebMcpAvailability locale={locale} status={webMcpStatus} />
      )}
      {isSourceCase ? (
        <div className="source-case-note">
          <p>{canTeach ? copy.unlearnedSourceCaseBody : copy.sourceCaseBody}</p>
          {canTeach ? (
            <button className="primary-action" type="button" onClick={onTeach}>
              {copy.teachThisCase}
            </button>
          ) : null}
        </div>
      ) : !playbookId ? (
        <div className="source-case-note">
          <strong>{copy.unmatchedHeading}</strong>
          <p>{copy.unmatchedBody}</p>
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
          </div>
        </>
      ) : showCriteriaSummary ? (
        isApproved || isCommitted ? null : (
          <div className="criteria-complete-summary">
            <strong>{copy.criteriaAllPassed}</strong>
          </div>
        )
      ) : (
        <ul className="eligibility-list" id="approval-criteria">
          {eligibility.map((item) => (
            <li className={criteriaPassed ? "is-passed" : "is-pending"} key={item}>
              <span>{item}</span>
              <span className="criterion-status">
                {criteriaPassed ? copy.criterionPassed : copy.criterionPending}
              </span>
            </li>
          ))}
        </ul>
      )}
      {isAwaiting && run ? <ApprovalScope locale={locale} run={run} /> : null}
      <div className="review-actions">
        {!isSourceCase && playbookId && !isRejected ? (
          <>
            {(!run || isDiscarded) ? (
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
            ) : isApproved && run ? (
              <ApprovalStatus
                locale={locale}
                run={run}
                webMcpStatus={webMcpStatus}
              />
            ) : isCommitted ? (
              <div className="completion-status">
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
              >
                {copy.discard}
              </button>
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

  useEffect(() => {
    stateRef.current = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Persistence is optional; keep the in-memory demo usable when storage fails.
    }
  }, [state]);

  useEffect(() => {
    try {
      if (
        localStorage.getItem(TEACHING_SCENARIO_VERSION_KEY) !==
        TEACHING_SCENARIO_VERSION
      ) {
        const initialJourney = createPublishedJourney();
        journeyRef.current = initialJourney;
        localStorage.setItem(
          TEACHING_SCENARIO_VERSION_KEY,
          TEACHING_SCENARIO_VERSION,
        );
        localStorage.setItem(
          TEACHING_STORAGE_KEY,
          JSON.stringify(initialJourney),
        );
        setJourney(initialJourney);
        return;
      }
      journeyRef.current = journey;
      localStorage.setItem(TEACHING_STORAGE_KEY, JSON.stringify(journey));
    } catch {
      // Persistence is optional; the teaching journey remains usable in memory.
    }
  }, [journey]);

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
  }, [commitState, commitTeachingJourney, reportWebMcpCall]);

  const approvedRunId =
    state.activeRun?.status === "approved" ? state.activeRun.id : null;
  const approvalExpiresAt =
    state.activeRun?.status === "approved" && state.activeRun.approvalExpiresAt
      ? Date.parse(state.activeRun.approvalExpiresAt)
      : Number.NaN;

  useEffect(() => {
    if (!approvedRunId) return;

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
  }, [approvedRunId, approvalExpiresAt, commitState]);

  const reservation = selectedReservation(state);
  const sourceDemonstration = demonstrationForReservation(
    journey.demonstrations,
    reservation.id,
  );
  const isSourceCase = sourceDemonstration !== null;
  const visibleRun =
    state.activeRun?.reservationId === reservation.id ? state.activeRun : null;
  const rejectionReasons =
    state.rejection?.reservationId === reservation.id
      ? state.rejection.reasons
      : null;
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
    : applicablePlaybook;
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
    const sourceState = stateRef.current;
    const playbook = playbookForReservation(
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
    const prepared = await prepareCurrentRun(sourceState, new Date(), playbook);
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
      localStorage.removeItem(TEACHING_STORAGE_KEY);
    } catch {
      // The in-memory reset still works when storage is unavailable.
    }
    replaceState(resetDemo(), "Demo reset.");
    const published = createPublishedJourney();
    journeyRef.current = published;
    setJourney(published);
    setLastWebMcpCall(null);
  }, [replaceState]);

  const createDraft = useCallback(() => {
    const source = journeyRef.current;
    const demonstration = activeDemonstration(source);
    const boundary = demonstration
      ? PLAYBOOK_DEFINITIONS[demonstration.playbookId]?.agentDraftBoundary ??
        AGENT_DRAFT_BOUNDARY
      : AGENT_DRAFT_BOUNDARY;
    const drafted = draftPlaybook(source, boundary);
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
        ...createInitialState(),
        selectedReservationId,
        audit: teachingAuditEvents(published),
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
          onReset={reset}
        />
        <div className="product-context-row">
          <DemoIntro locale={locale} />
        </div>
        <div className={`app-grid${journey.stage === "reuse" ? "" : " is-teaching"}`}>
          <CaseQueue
            locale={locale}
            reservations={state.reservations}
            selectedId={
              journey.stage === "reuse"
                ? state.selectedReservationId
                : teachingReservation.id
            }
            activeRun={state.activeRun}
            rejectedReservationId={state.rejection?.reservationId ?? null}
            demonstrations={journey.demonstrations}
            publishedPlaybooks={journey.publishedPlaybooks}
            onSelect={journey.stage === "reuse" ? select : selectWhileTeaching}
          />
          {journey.stage === "reuse" ? (
            <>
              <ReservationWorkspace
                locale={locale}
                sourceReservation={sourceReservation}
                playbook={visiblePlaybook}
                canTeach={canTeach}
                isSourceCase={isSourceCase}
                reservation={reservation}
                run={visibleRun}
                rejectionReasons={rejectionReasons}
              />
              <ReviewPanel
                locale={locale}
                isSourceCase={isSourceCase}
                canTeach={canTeach}
                playbookId={visiblePlaybook?.id ?? null}
                webMcpStatus={webMcpStatus}
                run={visibleRun}
                rejectionReasons={rejectionReasons}
                onPrepare={prepare}
                onApprove={approve}
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
    </div>
  );
}

import {
  DEMO_DATE,
  type AppState,
  type AuditEvent,
  type PlaybookBoundary,
  type PlaybookAction,
  type PlaybookId,
  type PreparedRun,
  type ProposedChange,
  type PublishedPlaybook,
  type Rejection,
  type Reservation,
  type ToolResult,
} from "./domain";
import { createInitialState } from "./fixtures";
import {
  LATE_ARRIVAL_PLAYBOOK,
  PLAYBOOK_DEFINITIONS,
  SAFE_PUBLISHED_BOUNDARY,
} from "./teaching";

const APPROVAL_TTL_MS = 5 * 60 * 1000;

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function makeAuditEvent(
  actor: AuditEvent["actor"],
  summary: string,
  now = new Date(),
): AuditEvent {
  return {
    id: crypto.randomUUID(),
    at: nowIso(now),
    actor,
    summary,
  };
}

export function selectedReservation(state: AppState): Reservation {
  const reservation = state.reservations.find(
    (candidate) => candidate.id === state.selectedReservationId,
  );

  if (!reservation) {
    throw new Error("Selected reservation was not found.");
  }

  return reservation;
}

export function selectReservation(state: AppState, reservationId: string): AppState {
  if (!state.reservations.some((reservation) => reservation.id === reservationId)) {
    return state;
  }

  return {
    ...state,
    selectedReservationId: reservationId,
  };
}

export function runForReservation(
  state: AppState,
  reservationId = state.selectedReservationId,
): PreparedRun | null {
  return state.runsByReservationId[reservationId] ?? null;
}

export function rejectionForReservation(
  state: AppState,
  reservationId = state.selectedReservationId,
): Rejection | null {
  return state.rejectionsByReservationId[reservationId] ?? null;
}

function withCaseWork(
  state: AppState,
  run: PreparedRun | null,
  rejection: Rejection | null = null,
): AppState {
  const id = state.selectedReservationId;
  const runsByReservationId = { ...state.runsByReservationId };
  const rejectionsByReservationId = { ...state.rejectionsByReservationId };
  if (run) runsByReservationId[id] = run;
  else delete runsByReservationId[id];
  if (rejection) rejectionsByReservationId[id] = rejection;
  else delete rejectionsByReservationId[id];
  return { ...state, runsByReservationId, rejectionsByReservationId };
}

export function eligibilityReasons(
  reservation: Reservation,
  boundary: PlaybookBoundary = SAFE_PUBLISHED_BOUNDARY,
): string[] {
  const reasons: string[] = [];

  if (reservation.status !== "confirmed") {
    reasons.push("Only confirmed reservations can use this playbook.");
  }
  if (reservation.arrivalDate !== DEMO_DATE) {
    reasons.push("Only same-day arrivals can use this playbook.");
  }
  if (reservation.status === "checked_in") {
    reasons.push("The guest has already checked in.");
  }
  if (reservation.requestedArrivalTime > boundary.latestArrivalLimit) {
    reasons.push(`Arrival is later than ${boundary.latestArrivalLimit}.`);
  }
  if (
    reservation.hasNewDietaryRequest &&
    !reservation.dietaryRequestHandled &&
    boundary.dietaryHandling === "escalate"
  ) {
    reasons.push("A new dietary request requires human review.");
  }
  if (reservation.requestsTaxi && boundary.taxiHandling === "escalate") {
    reasons.push("Transportation arrangements are outside this playbook.");
  }
  if (reservation.requestsCompensation) {
    reasons.push("Compensation requests are outside this playbook.");
  }
  if (
    reservation.estimatedArrivalTime !== null ||
    reservation.mealService !== "regular_dinner" ||
    reservation.guestMessageDraft !== null ||
    reservation.shiftHandoff !== null
  ) {
    reasons.push("This case already has late-arrival handling.");
  }

  return reasons;
}

export function playbookForReservation(
  reservation: Reservation,
  publishedPlaybooks: PublishedPlaybook[],
): PublishedPlaybook | null {
  return (
    publishedPlaybooks.find(
      (playbook) => eligibilityReasons(reservation, playbook.boundary).length === 0,
    ) ?? null
  );
}

// Match first; if none applies, evaluate the closest published rule so the
// operator/agent gets concrete refusal reasons instead of "not published".
export function playbookForPreparation(
  reservation: Reservation,
  publishedPlaybooks: PublishedPlaybook[],
): PublishedPlaybook | null {
  return [...publishedPlaybooks].sort((left, right) =>
    eligibilityReasons(reservation, left.boundary).length -
    eligibilityReasons(reservation, right.boundary).length,
  )[0] ?? null;
}

function playbookName(playbookId: PlaybookId): string {
  return PLAYBOOK_DEFINITIONS[playbookId]?.name ?? playbookId;
}

function changesFor(
  reservation: Reservation,
  playbook: Pick<PublishedPlaybook, "actions">,
  after = applyPlaybook(reservation, playbook.actions),
): ProposedChange[] {
  const mealServiceLabels: Record<Reservation["mealService"], string> = {
    regular_dinner: "Regular dinner",
    late_meal_box: "Late meal box",
    none: "No meal service",
  };

  const changes: ProposedChange[] = [
    {
      field: "Arrival",
      before: reservation.plannedArrivalTime,
      after: after.estimatedArrivalTime ?? after.requestedArrivalTime,
    },
    {
      field: "Meal",
      before: mealServiceLabels[reservation.mealService],
      after: mealServiceLabels[after.mealService],
    },
  ];

  if (reservation.dietaryRequestHandled !== after.dietaryRequestHandled) {
    changes.push({
      field: "Dietary request",
      before: reservation.dietaryRequestHandled ? "Handled" : "Pending",
      after: after.dietaryRequestHandled ? "Handled" : "Pending",
    });
  }
  if (reservation.taxiArranged !== after.taxiArranged) {
    changes.push({
      field: "Taxi",
      before: reservation.taxiArranged ? "Arranged" : "Requested",
      after: after.taxiArranged ? "Arranged" : "Requested",
    });
  }

  changes.push(
    {
      field: "Guest message",
      before: reservation.guestMessageDraft,
      after: after.guestMessageDraft ?? "No guest message",
    },
    {
      field: "Handoff",
      before: reservation.shiftHandoff,
      after: after.shiftHandoff ?? "No shift handoff",
    },
  );

  return changes;
}

function applyPlaybook(
  reservation: Reservation,
  actions: PlaybookAction[],
): Reservation {
  return actions.reduce<Reservation>((current, action) => {
    switch (action.type) {
      case "set_estimated_arrival":
        return { ...current, estimatedArrivalTime: current[action.from] };
      case "set_meal_service":
        return { ...current, mealService: action.value };
      case "handle_dietary_request":
        return {
          ...current,
          dietaryRequestHandled: current.hasNewDietaryRequest,
        };
      case "arrange_taxi":
        return { ...current, taxiArranged: current.requestsTaxi };
      case "draft_guest_message":
        return {
          ...current,
          guestMessageDraft:
            action.template === "night_arrival"
              ? "Your dietary-safe meal box and taxi are arranged for your late arrival."
              : "We have noted your late arrival. Your meal box will be ready at reception.",
        };
      case "add_shift_handoff":
        return {
          ...current,
          shiftHandoff:
            action.template === "night_arrival"
              ? `Night arrival expected at ${current.requestedArrivalTime}. Dietary-safe meal box and taxi arranged.`
              : `Late arrival expected at ${current.requestedArrivalTime}. Meal box and English guest message prepared.`,
        };
    }
  }, structuredClone(reservation));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function digestPayload(
  before: Reservation,
  after: Reservation,
  proposedChanges: ProposedChange[],
  boundary: PlaybookBoundary,
  playbook: Pick<PublishedPlaybook, "id" | "actions">,
): string {
  return JSON.stringify({
    playbook: playbook.id,
    actions: playbook.actions,
    reservationId: before.id,
    reservationVersion: before.version,
    requestedArrivalTime: before.requestedArrivalTime,
    boundary,
    proposedChanges,
    after,
  });
}

async function computeRunDigest(
  before: Reservation,
  after: Reservation,
  proposedChanges: ProposedChange[],
  boundary: PlaybookBoundary,
  playbook: Pick<PublishedPlaybook, "id" | "actions">,
): Promise<string> {
  return sha256(
    digestPayload(before, after, proposedChanges, boundary, playbook),
  );
}

export async function prepareCurrentRun(
  state: AppState,
  now = new Date(),
  playbook: PublishedPlaybook = LATE_ARRIVAL_PLAYBOOK,
): Promise<{ state: AppState; result: ToolResult }> {
  const reservation = selectedReservation(state);
  const boundary = playbook.boundary;

  if (runForReservation(state)?.status === "committed") {
    return failure(state, "RUN_ALREADY_COMMITTED", "This run was already committed.");
  }

  const reasons = eligibilityReasons(reservation, boundary);

  if (reasons.length > 0) {
    return {
      state: {
        ...withCaseWork(state, null, { reservationId: reservation.id, playbookId: playbook.id, reasons }),
        audit: [
          ...state.audit,
          makeAuditEvent(
            "Website",
            `Rejected ${playbookName(playbook.id)} for ${reservation.id}.`,
            now,
          ),
        ],
      },
      result: {
        ok: false,
        code: "PLAYBOOK_NOT_APPLICABLE",
        summary: "This case requires human review. No changes were made.",
        reasons,
      },
    };
  }

  const after = applyPlaybook(reservation, playbook.actions);
  const proposedChanges = changesFor(reservation, playbook, after);
  const digest = await computeRunDigest(
    reservation,
    after,
    proposedChanges,
    boundary,
    playbook,
  );
  const run: PreparedRun = {
    id: crypto.randomUUID(),
    playbookId: playbook.id,
    reservationId: reservation.id,
    reservationVersion: reservation.version,
    before: structuredClone(reservation),
    after,
    proposedChanges,
    playbookBoundary: structuredClone(boundary),
    digest,
    status: "awaiting_review",
    approvedDigest: null,
    approvedAt: null,
    approvalExpiresAt: null,
    committedAt: null,
  };

  return {
    state: {
      ...withCaseWork(state, run),
      audit: [
        ...state.audit,
        makeAuditEvent(
          "Agent",
          `Prepared ${playbookName(playbook.id)} for ${reservation.id}.`,
          now,
        ),
      ],
    },
    result: {
      ok: true,
      code: "RUN_PREPARED",
      summary: "A preview was created. Human approval is required.",
      data: {
        run_id: run.id,
        digest: run.digest,
        reservation_id: reservation.id,
        changes: proposedChanges.map((change) =>
          change.before
            ? `${change.field}: ${change.before} -> ${change.after}`
            : `${change.field}: ${change.after}`,
        ),
        approval_required: true,
      },
    },
  };
}

export function approveCurrentRun(
  state: AppState,
  now = new Date(),
): { state: AppState; result: ToolResult } {
  const run = runForReservation(state);
  if (
    !run ||
    run.status !== "awaiting_review" ||
    rejectionForReservation(state) !== null ||
    state.selectedReservationId !== run.reservationId
  ) {
    return {
      state,
      result: {
        ok: false,
        code: "RUN_NOT_REVIEWABLE",
        summary: "There is no preview awaiting review.",
      },
    };
  }

  const approvedRun: PreparedRun = {
    ...run,
    status: "approved",
    approvedDigest: run.digest,
    approvedAt: nowIso(now),
    approvalExpiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
  };

  return {
    state: {
      ...withCaseWork(state, approvedRun),
      audit: [
        ...state.audit,
        makeAuditEvent("Human", `Approved preview ${run.id}.`, now),
      ],
    },
    result: {
      ok: true,
      code: "RUN_APPROVED",
      summary: "The preview was approved for five minutes.",
      data: { run_id: run.id, digest: run.digest },
    },
  };
}

export function discardCurrentRun(
  state: AppState,
  now = new Date(),
): AppState {
  const run = runForReservation(state);
  if (!run || !["awaiting_review", "approved", "stale"].includes(run.status)) {
    return state;
  }

  return {
    ...withCaseWork(state, { ...run, status: "discarded" }),
    audit: [
      ...state.audit,
      makeAuditEvent("Human", `Discarded preview ${run.id}.`, now),
    ],
  };
}

export function expireApprovedRun(
  state: AppState,
  now = new Date(),
): AppState {
  const expiredRuns = Object.values(state.runsByReservationId).filter((run) => {
    if (run.status !== "approved") return false;
    const expiresAt = run.approvalExpiresAt
      ? Date.parse(run.approvalExpiresAt)
      : NaN;
    return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
  });
  if (expiredRuns.length === 0) return state;
  const runsByReservationId = { ...state.runsByReservationId };
  for (const run of expiredRuns) {
    runsByReservationId[run.reservationId] = { ...run, status: "stale" };
  }
  return {
    ...state,
    runsByReservationId,
    audit: [
      ...state.audit,
      ...expiredRuns.map((run) =>
        makeAuditEvent("Website", `Expired approval for preview ${run.id}.`, now),
      ),
    ],
  };
}

export async function commitApprovedRun(
  state: AppState,
  input: { runId: string; expectedDigest: string },
  now = new Date(),
): Promise<{ state: AppState; result: ToolResult }> {
  const run = runForReservation(state);

  if (!run || run.id !== input.runId) {
    return failure(state, "RUN_NOT_FOUND", "The prepared run was not found.");
  }
  if (
    rejectionForReservation(state) !== null ||
    state.selectedReservationId !== run.reservationId
  ) {
    return failure(
      state,
      "RUN_CONFLICTING_STATE",
      "The run conflicts with the current case state.",
    );
  }
  if (run.status === "committed") {
    return failure(state, "RUN_ALREADY_COMMITTED", "This run was already committed.");
  }
  if (run.status !== "approved" || !run.approvedDigest) {
    return failure(state, "RUN_NOT_APPROVED", "Human approval is required.");
  }
  if (
    run.digest !== input.expectedDigest ||
    run.approvedDigest !== input.expectedDigest
  ) {
    return failure(
      state,
      "DIGEST_MISMATCH",
      "The requested changes differ from the approved preview.",
    );
  }
  const approvalExpiresAt = run.approvalExpiresAt
    ? Date.parse(run.approvalExpiresAt)
    : Number.NaN;
  if (
    !Number.isFinite(approvalExpiresAt) ||
    approvalExpiresAt <= now.getTime()
  ) {
    return failure(
      expireApprovedRun(state, now),
      "APPROVAL_EXPIRED",
      "The approval has expired. Prepare a new preview.",
    );
  }

  const current = state.reservations.find(
    (reservation) => reservation.id === run.reservationId,
  );
  if (!current || current.version !== run.reservationVersion) {
    return failure(
      state,
      "CASE_STATE_CHANGED",
      "The reservation changed after the preview was created.",
    );
  }

  if (eligibilityReasons(current, run.playbookBoundary).length > 0) {
    return failure(
      state,
      "CASE_NO_LONGER_ELIGIBLE",
      "The reservation no longer matches the published playbook boundary.",
    );
  }

  const definition = PLAYBOOK_DEFINITIONS[run.playbookId];
  if (!definition) {
    return failure(state, "PLAYBOOK_NOT_FOUND", "The playbook was not found.");
  }
  const canonicalAfter = applyPlaybook(current, definition.actions);
  const canonicalChanges = changesFor(current, definition, canonicalAfter);
  const [storedPayloadDigest, canonicalDigest] = await Promise.all([
    computeRunDigest(
      run.before,
      run.after,
      run.proposedChanges,
      run.playbookBoundary,
      definition,
    ),
    computeRunDigest(
      current,
      canonicalAfter,
      canonicalChanges,
      run.playbookBoundary,
      definition,
    ),
  ]);
  if (
    storedPayloadDigest !== run.digest ||
    canonicalDigest !== run.digest ||
    run.approvedDigest !== run.digest ||
    input.expectedDigest !== run.digest
  ) {
    return failure(
      state,
      "DIGEST_MISMATCH",
      "The requested changes differ from the approved preview.",
    );
  }

  const committedReservation: Reservation = {
    ...canonicalAfter,
    version: current.version + 1,
  };
  const committedRun: PreparedRun = {
    ...run,
    after: committedReservation,
    proposedChanges: canonicalChanges,
    status: "committed",
    committedAt: nowIso(now),
  };
  const nextState: AppState = {
    ...withCaseWork(state, committedRun),
    reservations: state.reservations.map((reservation) =>
      reservation.id === committedReservation.id
        ? committedReservation
        : reservation,
    ),
    audit: [
      ...state.audit,
      makeAuditEvent(
        "Agent",
        `Committed approved run ${run.id} to ${run.reservationId}.`,
        now,
      ),
    ],
  };

  return {
    state: nextState,
    result: {
      ok: true,
      code: "RUN_COMMITTED",
      summary: "The approved changes were committed exactly once.",
      data: {
        run_id: run.id,
        reservation_id: committedReservation.id,
        new_version: committedReservation.version,
      },
    },
  };
}

function failure(
  state: AppState,
  code: string,
  summary: string,
): { state: AppState; result: ToolResult } {
  return { state, result: { ok: false, code, summary } };
}

export function resetDemo(): AppState {
  return createInitialState();
}

export function currentCaseResult(state: AppState): ToolResult {
  const reservation = selectedReservation(state);
  const run = runForReservation(state);
  return {
    ok: true,
    code: "CURRENT_CASE",
    summary: `Current case is ${reservation.id}.`,
    data: {
      case_id: reservation.id,
      status: reservation.status,
      arrival_date: reservation.arrivalDate,
      planned_arrival_time: reservation.plannedArrivalTime,
      requested_arrival_time: reservation.requestedArrivalTime,
      meal_plan: reservation.mealPlan,
      new_dietary_request: reservation.hasNewDietaryRequest,
      dietary_request_handled: reservation.dietaryRequestHandled,
      taxi_requested: reservation.requestsTaxi,
      taxi_arranged: reservation.taxiArranged,
      compensation_requested: reservation.requestsCompensation,
      active_run: run
        ? {
            run_id: run.id,
            status: run.status,
            digest: run.digest,
          }
        : null,
    },
  };
}

import {
  DEMO_DATE,
  SOURCE_RESERVATION_ID,
  type AppState,
  type AuditEvent,
  type PlaybookBoundary,
  type PreparedRun,
  type ProposedChange,
  type Reservation,
  type ToolResult,
} from "./domain";
import { createInitialState } from "./fixtures";
import { SAFE_PUBLISHED_BOUNDARY } from "./teaching";

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
    activeRun:
      state.activeRun?.reservationId === reservationId ? state.activeRun : null,
    rejection:
      state.rejection?.reservationId === reservationId ? state.rejection : null,
  };
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
  if (reservation.hasNewDietaryRequest) {
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

function changesFor(
  reservation: Reservation,
  after = applyLateArrivalCare(reservation),
): ProposedChange[] {
  const mealServiceLabels: Record<Reservation["mealService"], string> = {
    regular_dinner: "Regular dinner",
    late_meal_box: "Late meal box",
    none: "No meal service",
  };

  return [
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
  ];
}

function applyLateArrivalCare(reservation: Reservation): Reservation {
  return {
    ...reservation,
    estimatedArrivalTime: reservation.requestedArrivalTime,
    mealService: "late_meal_box",
    guestMessageDraft:
      "We have noted your late arrival. Your meal box will be ready at reception.",
    shiftHandoff: `Late arrival expected at ${reservation.requestedArrivalTime}. Meal box and English guest message prepared.`,
  };
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
): string {
  return JSON.stringify({
    playbook: "late-arrival-care@1",
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
): Promise<string> {
  return sha256(digestPayload(before, after, proposedChanges, boundary));
}

export async function prepareCurrentRun(
  state: AppState,
  now = new Date(),
  boundary: PlaybookBoundary = SAFE_PUBLISHED_BOUNDARY,
): Promise<{ state: AppState; result: ToolResult }> {
  const reservation = selectedReservation(state);

  if (reservation.id === SOURCE_RESERVATION_ID) {
    return {
      state,
      result: {
        ok: false,
        code: "PLAYBOOK_NOT_APPLICABLE",
        summary: "The teaching source cannot start a new run.",
        reasons: ["This case already has late-arrival handling."],
      },
    };
  }

  const reasons = eligibilityReasons(reservation, boundary);

  if (reasons.length > 0) {
    return {
      state: {
        ...state,
        activeRun: null,
        rejection: { reservationId: reservation.id, reasons },
        audit: [
          ...state.audit,
          makeAuditEvent(
            "Website",
            `Rejected Late Arrival Care for ${reservation.id}.`,
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

  const after = applyLateArrivalCare(reservation);
  const proposedChanges = changesFor(reservation, after);
  const digest = await computeRunDigest(
    reservation,
    after,
    proposedChanges,
    boundary,
  );
  const run: PreparedRun = {
    id: crypto.randomUUID(),
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
      ...state,
      activeRun: run,
      rejection: null,
      audit: [
        ...state.audit,
        makeAuditEvent(
          "Agent",
          `Prepared Late Arrival Care for ${reservation.id}.`,
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
  const run = state.activeRun;
  if (
    !run ||
    run.status !== "awaiting_review" ||
    state.rejection !== null ||
    run.reservationId === SOURCE_RESERVATION_ID ||
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
      ...state,
      activeRun: approvedRun,
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
  if (!state.activeRun) return state;

  return {
    ...state,
    activeRun: { ...state.activeRun, status: "discarded" },
    audit: [
      ...state.audit,
      makeAuditEvent("Human", `Discarded preview ${state.activeRun.id}.`, now),
    ],
  };
}

export function expireApprovedRun(
  state: AppState,
  now = new Date(),
): AppState {
  const run = state.activeRun;
  if (!run || run.status !== "approved") return state;

  const approvalExpiresAt = run.approvalExpiresAt
    ? Date.parse(run.approvalExpiresAt)
    : Number.NaN;
  if (Number.isFinite(approvalExpiresAt) && approvalExpiresAt > now.getTime()) {
    return state;
  }

  return {
    ...state,
    activeRun: { ...run, status: "stale" },
    audit: [
      ...state.audit,
      makeAuditEvent("Website", `Expired approval for preview ${run.id}.`, now),
    ],
  };
}

export async function commitApprovedRun(
  state: AppState,
  input: { runId: string; expectedDigest: string },
  now = new Date(),
): Promise<{ state: AppState; result: ToolResult }> {
  const run = state.activeRun;

  if (!run || run.id !== input.runId) {
    return failure(state, "RUN_NOT_FOUND", "The prepared run was not found.");
  }
  if (
    state.rejection !== null ||
    run.reservationId === SOURCE_RESERVATION_ID ||
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

  const canonicalAfter = applyLateArrivalCare(current);
  const canonicalChanges = changesFor(current, canonicalAfter);
  const [storedPayloadDigest, canonicalDigest] = await Promise.all([
    computeRunDigest(
      run.before,
      run.after,
      run.proposedChanges,
      run.playbookBoundary,
    ),
    computeRunDigest(
      current,
      canonicalAfter,
      canonicalChanges,
      run.playbookBoundary,
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
    label: "Resolved",
  };
  const committedRun: PreparedRun = {
    ...run,
    after: committedReservation,
    proposedChanges: canonicalChanges,
    status: "committed",
    committedAt: nowIso(now),
  };
  const nextState: AppState = {
    ...state,
    reservations: state.reservations.map((reservation) =>
      reservation.id === committedReservation.id
        ? committedReservation
        : reservation,
    ),
    activeRun: committedRun,
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
      taxi_requested: reservation.requestsTaxi,
      compensation_requested: reservation.requestsCompensation,
      active_run: state.activeRun
        ? {
            run_id: state.activeRun.id,
            status: state.activeRun.status,
            digest: state.activeRun.digest,
          }
        : null,
    },
  };
}

import type { Demonstration, Operation, PreparedRun, Reservation, Result, SessionState, Transition } from "./domain";
import { canonical, timeMinutes, validDate } from "./common";
import { createSession } from "./fixtures";
import { COMMAND_FIELDS, executeCommand, isCommand, TEXT_LIMIT } from "./commands";
import { validateProposalInput } from "./playbook-schema";

export const SESSION_STORAGE_KEY = "teachback-session-v1";
export const LEGACY_STORAGE_KEYS = ["teachback-demo-v1", "teachback-teaching-v4", "teachback-teaching-scenario-version"] as const;
const MAX_SESSION_BYTES = 16 * 1_024 * 1_024;
export type SessionStorage = Pick<Storage, "getItem" | "setItem">;
export interface SessionLoadStatus {
  kind: "ready" | "error";
  error?: Result;
  legacy: Record<string, string>;
  rawSession: string | null;
}
const error = (code: string, summary: string): Result => ({ ok: false, code, summary });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const string = (value: unknown, max = 128): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const integer = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum;
const instant = (value: unknown): value is string => string(value, 40) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{64}$/.test(value);
const actor = (value: unknown) => value === "Human" || value === "Agent" || value === "Website";
const optionalId = (value: unknown) => value === undefined || string(value);
const nullable = (value: unknown, validator: (item: unknown) => boolean) => value === null || validator(value);
const array = (value: unknown, validator: (item: unknown) => boolean, max = 10_000): value is unknown[] => Array.isArray(value) && value.length <= max && value.every(validator);
const entries = (value: unknown, validator: (item: unknown) => boolean): value is Record<string, unknown> => object(value) && Object.keys(value).length <= 10_000 && Object.entries(value).every(([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && string(key) && validator(item));
const unique = (values: string[]) => new Set(values).size === values.length;

/** No functions, accessors, cycles, or non-JSON objects reach localStorage. */
function plainJSON(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 40) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value) || (!Array.isArray(value) && !object(value))) return false;
  seen.add(value);
  const valid = Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => !descriptor.get && !descriptor.set && plainJSON(descriptor.value, seen, depth + 1));
  seen.delete(value);
  return valid;
}

export function isReservation(value: unknown): value is Reservation {
  if (!object(value)) return false;
  const nullableText = (text: unknown) => text === null || (typeof text === "string" && text.length <= TEXT_LIMIT);
  return string(value.id) && string(value.guestDisplayName, 200) && integer(value.version, 1)
    && ["confirmed", "checked_in", "cancelled"].includes(value.status as string)
    && validDate(value.arrivalDate) && timeMinutes(value.plannedArrivalTime) !== null
    && nullable(value.requestedArrivalDate, validDate) && nullable(value.requestedArrivalTime, item => timeMinutes(item) !== null)
    && nullable(value.estimatedArrivalDate, validDate) && nullable(value.estimatedArrivalTime, item => timeMinutes(item) !== null)
    && ["dinner_included", "room_only"].includes(value.mealPlan as string)
    && ["regular_dinner", "late_meal_box", "none"].includes(value.mealService as string)
    && ["hasNewDietaryRequest", "requestsTaxi", "requestsCompensation", "requestsCancellation", "requestsPaymentChange"].every(key => value[key] === null || typeof value[key] === "boolean")
    && nullableText(value.guestMessageDraft) && nullableText(value.shiftHandoff) && typeof value.handled === "boolean";
}

function isDemonstration(value: unknown): value is Demonstration {
  if (!object(value) || !string(value.id) || !string(value.caseId) || !["recording", "completed", "cancelled"].includes(value.status as string)
    || !isReservation(value.before) || !isReservation(value.after) || !instant(value.startedAt) || value.recordedBy !== "Human"
    || value.before.id !== value.caseId || value.after.id !== value.caseId || !Array.isArray(value.commands) || value.commands.length > 10_000) return false;
  if (value.status === "recording" ? value.completedAt !== null || value.digest !== null : !instant(value.completedAt)) return false;
  if (value.status === "completed" ? !hash(value.digest) || !value.commands.length : value.digest !== null) return false;
  let previous = value.before;
  const ids: string[] = [];
  for (const [index, recorded] of value.commands.entries()) {
    if (!object(recorded) || !string(recorded.id) || recorded.sequence !== index + 1 || recorded.caseId !== value.caseId || recorded.actor !== "Human" || !instant(recorded.at)
      || !isCommand(recorded.command) || !isReservation(recorded.before) || !isReservation(recorded.after)
      || recorded.caseVersionBefore !== recorded.before.version || recorded.caseVersionAfter !== recorded.after.version
      || canonical(recorded.before) !== canonical(previous)) return false;
    const applied = executeCommand(recorded.before, recorded.command, recorded.before.version);
    if (!applied.ok || !applied.data?.changed || canonical(applied.data.reservation) !== canonical(recorded.after)) return false;
    previous = recorded.after;
    ids.push(recorded.id);
  }
  if (!unique(ids)) return false;
  return canonical(value.after) === canonical(previous)
    || (value.status === "completed" && canonical(value.after) === canonical({ ...previous, handled: true, version: previous.version + 1 }));
}

function issue(value: unknown): boolean { return object(value) && string(value.path, 1_000) && string(value.code) && string(value.message, 4_000); }
function result(value: unknown): boolean { return object(value) && typeof value.ok === "boolean" && string(value.code) && string(value.summary, 4_000) && (value.issues === undefined || array(value.issues, issue)); }
function draft(value: unknown): boolean {
  if (!object(value)) return false;
  return string(value.id) && integer(value.revision, 1) && string(value.sourceDemonstrationId) && hash(value.sourceDigest)
    && validateProposalInput(value.proposal).ok && validateProposalInput(value.originalProposal).ok
    && ["Human", "Agent"].includes(value.createdBy as string) && nullable(value.publishedPlaybookId, string)
    && array(value.validationIssues, issue)
    && array(value.changes, change => object(change) && instant(change.at) && actor(change.actor) && validateProposalInput(change.proposal).ok)
    && (value.basedOn === undefined || (object(value.basedOn) && string(value.basedOn.id) && integer(value.basedOn.version, 1)));
}
function playbook(value: unknown): boolean {
  if (!object(value)) return false;
  return string(value.id) && integer(value.version, 1) && hash(value.contentDigest) && string(value.sourceDemonstrationId) && hash(value.sourceDigest)
    && instant(value.publishedAt) && value.publishedBy === "Human"
    && validateProposalInput({ name: value.name, purpose: value.purpose, steps: value.steps, proposedBoundary: value.boundary, unresolvedQuestions: [] }).ok;
}
function run(value: unknown): value is PreparedRun {
  if (!object(value) || !string(value.id) || !string(value.caseId) || !integer(value.caseVersion, 1) || !string(value.playbookId) || !integer(value.playbookVersion, 1)
    || !hash(value.playbookContentDigest) || !hash(value.digest) || !isReservation(value.before) || !isReservation(value.after)
    || value.caseId !== value.before.id || value.caseId !== value.after.id || value.caseVersion !== value.before.version
    || !array(value.commands, isCommand, 4) || value.commands.length === 0 || !instant(value.createdAt)
    || !nullable(value.committedAt, instant) || !["awaiting_review", "approved", "committed", "discarded", "stale"].includes(value.status as string)
    || !array(value.exactDiff, change => object(change) && Object.values(COMMAND_FIELDS).flat().includes(change.field as keyof Reservation) && Object.hasOwn(change, "before") && Object.hasOwn(change, "after"), 5)) return false;
  if (value.approval !== null) {
    const approval = value.approval;
    if (!object(approval) || approval.runId !== value.id || !hash(approval.approvedDigest) || !instant(approval.approvedAt) || !instant(approval.expiresAt) || typeof approval.used !== "boolean") return false;
    if (Date.parse(approval.expiresAt) <= Date.parse(approval.approvedAt)) return false;
  }
  if (value.status === "approved" && (value.approval === null || (value.approval as { used: boolean }).used)) return false;
  if (value.status === "committed" && (value.approval === null || !(value.approval as { used: boolean }).used || !instant(value.committedAt))) return false;
  return true;
}

/** Conservative shape and reference checks, not a security boundary against DevTools. */
export function isSessionState(value: unknown): value is SessionState {
  if (!plainJSON(value) || !object(value) || value.schemaVersion !== 1 || !integer(value.revision) || !validDate(value.businessDate) || value.timeZone !== "Asia/Tokyo"
    || !array(value.reservations, isReservation) || value.reservations.length === 0 || !nullable(value.recordingId, string) || !array(value.demonstrations, isDemonstration)
    || !array(value.drafts, draft) || !array(value.playbooks, playbook) || !entries(value.runsById, run) || !entries(value.activeRunIdByCaseId, string)
    || !entries(value.requests, item => object(item) && hash(item.fingerprint) && result(item.result))
    || !array(value.audit, item => object(item) && string(item.id) && instant(item.at) && actor(item.actor) && string(item.eventType) && string(item.summary, 4_000)
      && ["caseId", "demonstrationId", "draftId", "playbookId", "runId"].every(key => optionalId(item[key])))) return false;
  const state = value as unknown as SessionState;
  if (!unique(state.reservations.map(item => item.id)) || !unique(state.demonstrations.map(item => item.id)) || !unique(state.drafts.map(item => item.id))
    || !unique(state.playbooks.map(item => `${item.id}@${item.version}`)) || !unique(state.audit.map(item => item.id))) return false;
  const cases = new Set(state.reservations.map(item => item.id));
  const demos = new Map(state.demonstrations.map(item => [item.id, item]));
  const recordings = state.demonstrations.filter(item => item.status === "recording");
  if (state.recordingId === null ? recordings.length !== 0 : recordings.length !== 1 || recordings[0].id !== state.recordingId) return false;
  if (recordings.length && canonical(recordings[0].after) !== canonical(state.reservations.find(item => item.id === recordings[0].caseId))) return false;
  if (state.demonstrations.some(item => !cases.has(item.caseId))) return false;
  for (const item of [...state.drafts, ...state.playbooks]) {
    const source = demos.get(item.sourceDemonstrationId);
    if (!source || source.status !== "completed" || source.digest !== item.sourceDigest) return false;
  }
  if (state.drafts.some(item => item.publishedPlaybookId !== null && !state.playbooks.some(published => published.id === item.publishedPlaybookId))) return false;
  for (const [id, item] of Object.entries(state.runsById)) if (id !== item.id || !cases.has(item.caseId) || !state.playbooks.some(published => published.id === item.playbookId && published.version === item.playbookVersion)) return false;
  const indexedStatuses = new Set<PreparedRun["status"]>(["awaiting_review", "approved", "committed"]);
  for (const [caseId, runId] of Object.entries(state.activeRunIdByCaseId)) {
    const indexed = state.runsById[runId];
    if (!cases.has(caseId) || indexed?.caseId !== caseId || !indexedStatuses.has(indexed.status)) return false;
  }
  for (const item of Object.values(state.runsById)) {
    if (["awaiting_review", "approved"].includes(item.status) && state.activeRunIdByCaseId[item.caseId] !== item.id) return false;
  }
  return true;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

export function createSessionStore(storage: SessionStorage, initial: SessionState = createSession()) {
  let snapshot = freeze(structuredClone(initial));
  let status: SessionLoadStatus = { kind: "ready", legacy: {}, rawSession: null };
  let expectedRaw: string | null = null;
  let disposed = false;
  let generation = 0;
  let activeOperation: object | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* A subscriber must not turn a persisted save into a reported failure. */ } } };

  function load(): Result {
    const legacy: Record<string, string> = {};
    let raw: string | null = null;
    try {
      raw = storage.getItem(SESSION_STORAGE_KEY);
      for (const key of LEGACY_STORAGE_KEYS) { const value = storage.getItem(key); if (value !== null) legacy[key] = value; }
    } catch {
      const failure = error("PERSISTENCE_FAILED", "Browser storage could not be read. Existing work has not been replaced.");
      status = { kind: "error", error: failure, legacy, rawSession: raw };
      return failure;
    }
    expectedRaw = raw;
    if (raw !== null) {
      try {
        if (new TextEncoder().encode(raw).byteLength > MAX_SESSION_BYTES) throw new Error("oversized");
        const parsed: unknown = JSON.parse(raw);
        if (!isSessionState(parsed)) throw new Error("invalid");
        snapshot = freeze(parsed);
      } catch {
        const failure = error("INVALID_SESSION", "Saved work could not be validated. Export it before explicitly starting a new session.");
        status = { kind: "error", error: failure, legacy, rawSession: raw };
        return failure;
      }
    } else if (!isSessionState(snapshot)) {
      const failure = error("INVALID_SESSION", "The initial session is invalid.");
      status = { kind: "error", error: failure, legacy, rawSession: null };
      return failure;
    }
    // Old demo keys are a read-only archive, never a migration or reset trigger.
    // Opening the workspace writes nothing; the first operation saves only the new key.
    status = { kind: "ready", legacy, rawSession: raw };
    return { ok: true, code: "SESSION_LOADED", summary: "The session is ready." };
  }

  function persist(next: SessionState, checkExpected: boolean): Result {
    if (!isSessionState(next)) return error("INVALID_SESSION", "The change produced invalid state; nothing was saved.");
    let encoded: string;
    try {
      encoded = JSON.stringify(next);
      if (new TextEncoder().encode(encoded).byteLength > MAX_SESSION_BYTES) return error("PERSISTENCE_FAILED", "The session is too large to save. Existing work is unchanged.");
      const currentRaw = storage.getItem(SESSION_STORAGE_KEY);
      if (checkExpected && currentRaw !== expectedRaw) return error("SESSION_CHANGED", "Saved work changed in another session. Reload before continuing.");
      // A commit's final hash may have passed immediately before a slow shape
      // check/serialization. Enforce expiry again at the actual write boundary.
      // Already committed historical runs do not need a still-live approval.
      for (const run of Object.values(next.runsById)) {
        if (run.status === "committed" && snapshot.runsById[run.id]?.status !== "committed" && (!run.approval || Date.parse(run.approval.expiresAt) <= Date.now())) {
          return error("APPROVAL_EXPIRED", "Approval expired before the change could be saved. Review a new proposal; nothing was applied.");
        }
      }
      storage.setItem(SESSION_STORAGE_KEY, encoded);
    } catch { return error("PERSISTENCE_FAILED", "The change could not be saved in browser storage. Existing work is unchanged; retry after storage is available."); }
    expectedRaw = encoded;
    snapshot = freeze(next);
    status = { ...status, kind: "ready", error: undefined, rawSession: encoded };
    notify();
    return { ok: true, code: "SESSION_SAVED", summary: "The session was saved." };
  }

  load();
  return {
    getSnapshot: () => snapshot,
    getLoadStatus: () => status,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async dispatch<T>(operation: Operation<T>, signal?: AbortSignal): Promise<Result<T>> {
      if (disposed) return error("SESSION_CLOSED", "This session was closed.") as Result<T>;
      if (status.kind !== "ready") return (status.error ?? error("PERSISTENCE_FAILED", "Storage is not ready.")) as Result<T>;
      if (activeOperation) return error("SESSION_BUSY", "Another operation is finishing. Wait before retrying.") as Result<T>;
      if (signal?.aborted) return error("OPERATION_ABORTED", "The operation was canceled.") as Result<T>;
      const token = {};
      activeOperation = token;
      const revision = snapshot.revision;
      const epoch = generation;
      const before = snapshot;
      try {
        let transition: Transition<T>;
        try { transition = await operation(before); }
        catch { return error("OPERATION_FAILED", "The operation could not finish. No change was saved.") as Result<T>; }
        if (signal?.aborted || disposed || epoch !== generation) return error("OPERATION_ABORTED", "The session changed or the operation was canceled before saving.") as Result<T>;
        if (snapshot !== before || snapshot.revision !== revision) return error("SESSION_CHANGED", "The session changed before saving. Retry with current data.") as Result<T>;
        if (transition.state === before) return transition.result;
        if (!integer(transition.state.revision, revision + 1)) return error("INVALID_SESSION", "The state revision is invalid. No change was saved.") as Result<T>;
        // Several pure transitions may form one atomic UI/tool operation (for
        // example approve + apply, or a draft + its deduplication receipt).
        const saved = persist({ ...transition.state, revision: revision + 1 }, true);
        return saved.ok ? transition.result : saved as Result<T>;
      } finally { if (activeOperation === token) activeOperation = null; }
    },
    /** Only call after an explicit user choice to start/reset. Legacy keys stay untouched. */
    restart(next: SessionState = createSession()): Result {
      if (disposed) return error("SESSION_CLOSED", "This session was closed.");
      generation += 1;
      activeOperation = null;
      const fresh = structuredClone(next);
      fresh.revision = snapshot.revision + 1;
      return persist(fresh, false);
    },
    reload(): Result {
      if (disposed) return error("SESSION_CLOSED", "This session was closed.");
      generation += 1;
      activeOperation = null;
      const loaded = load();
      notify();
      return loaded;
    },
    cancelPending() { generation += 1; activeOperation = null; },
    dispose() { disposed = true; generation += 1; activeOperation = null; listeners.clear(); },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

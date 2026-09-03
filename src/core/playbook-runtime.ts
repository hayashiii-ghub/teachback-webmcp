import type {
  Actor, AuditEvent, Command, ExactChange, OperationOptions, PreparedRun,
  PublishedPlaybook, Reservation, Result, SessionState, Transition,
} from "./domain";
import { canonical, digest, evolve, failure, success } from "./common";
import { executeCommand, reservationDiff } from "./commands";
import { evaluatePolicy } from "./playbook-policy";
import { resolveSteps } from "./playbook-schema";
import { publishedContent } from "./teaching";

export const APPROVAL_TTL_MS = 5 * 60 * 1000;
export type ApprovalStatus = "none" | "valid" | "expired" | "invalid";
type RuntimeActor = Extract<Actor, "Agent" | "Human">;
interface Projection { before: Reservation; after: Reservation; commands: Command[]; exactDiff: ExactChange[] }
type Clock = () => number;

// An injected start time remains deterministic, but does not freeze time during hashing.
function clockFor(options: OperationOptions): Clock {
  const startedAt = Date.now();
  const base = options.now === undefined ? startedAt : Date.parse(options.now);
  return () => base + Math.max(0, Date.now() - startedAt);
}

function aborted<T>(state: SessionState, options: OperationOptions): Transition<T> | null {
  return options.signal?.aborted ? failure(state, "OPERATION_ABORTED", "The operation was cancelled; no changes were saved.") : null;
}

function evolveWithAudit(state: SessionState, events: Omit<AuditEvent, "id" | "at">[], at = new Date().toISOString()): SessionState {
  return evolve(state, {
    audit: [
      ...events.map(entry => ({ ...entry, id: crypto.randomUUID(), at })),
      ...state.audit,
    ],
  });
}

function reject<T>(state: SessionState, actor: Actor, code: string, summary: string, fields: Partial<AuditEvent> = {}, issues?: Result<T>["issues"]): Transition<T> {
  const events: Omit<AuditEvent, "id" | "at">[] = [
    { actor, eventType: "run_rejected", summary, ...fields },
  ];
  if (code === "PLAYBOOK_NOT_APPLICABLE") {
    events.unshift({
      actor: "Website",
      eventType: "run_policy_refused",
      summary: "The website enforced the published boundary and returned this case to a person.",
      ...fields,
    });
  }
  const next = evolveWithAudit(state, events);
  return failure(next, code, summary, issues);
}

function playbookAt(state: SessionState, id: string, version: number): PublishedPlaybook | undefined {
  const matches = state.playbooks.filter(playbook => playbook.id === id && playbook.version === version);
  return matches.length === 1 && matches[0].publishedBy === "Human" ? matches[0] : undefined;
}

function caseAt(state: SessionState, caseId: string): Reservation | undefined {
  const matches = state.reservations.filter(reservation => reservation.id === caseId);
  return matches.length === 1 ? matches[0] : undefined;
}

function recordingCase(state: SessionState, caseId: string): boolean {
  return state.recordingId !== null && state.demonstrations.some(demo => demo.id === state.recordingId && demo.caseId === caseId && demo.status === "recording");
}

/** Apply only the content of this published version. No named-playbook lookup exists. */
function project(reservation: Reservation, playbook: PublishedPlaybook, businessDate: string): Result<Projection> {
  try {
    const issues = evaluatePolicy(reservation, playbook.boundary, playbook.steps, businessDate);
    if (issues.length) return { ok: false, code: "PLAYBOOK_NOT_APPLICABLE", summary: "This case needs a person's attention before this playbook can be used.", issues };
    const resolved = resolveSteps(playbook.steps, reservation);
    if (!resolved.ok || !resolved.data) return { ok: false, code: "PLAYBOOK_NOT_APPLICABLE", summary: resolved.summary, issues: resolved.issues };
    const before = structuredClone(reservation);
    let after = structuredClone(reservation);
    for (const command of resolved.data) {
      const applied = executeCommand(after, command, after.version);
      if (!applied.ok || !applied.data) return { ok: false, code: "PLAYBOOK_NOT_APPLICABLE", summary: applied.summary, issues: applied.issues };
      after = applied.data.reservation;
    }
    const exactDiff = reservationDiff(before, after);
    if (exactDiff.length === 0) return { ok: false, code: "NO_CHANGES", summary: "This playbook would not change this reservation." };
    after = { ...after, handled: true };
    return { ok: true, code: "PREVIEW_COMPUTED", summary: "Computed the published steps for this case.", data: { before, after, commands: resolved.data, exactDiff } };
  } catch {
    return { ok: false, code: "DIGEST_MISMATCH", summary: "The published playbook is malformed. Create and review a new version." };
  }
}

function runContent(state: SessionState, run: Pick<PreparedRun, "id" | "caseId" | "caseVersion" | "playbookId" | "playbookVersion" | "playbookContentDigest" | "createdAt">, playbook: PublishedPlaybook, projection: Projection) {
  return {
    schemaVersion: state.schemaVersion, businessDate: state.businessDate, timeZone: state.timeZone,
    runId: run.id, caseId: run.caseId, caseVersion: run.caseVersion,
    playbookId: run.playbookId, playbookVersion: run.playbookVersion, playbookContentDigest: run.playbookContentDigest,
    boundary: playbook.boundary, steps: playbook.steps, createdAt: run.createdAt,
    before: projection.before, after: projection.after, commands: projection.commands, exactDiff: projection.exactDiff,
  };
}

function sameProjection(run: PreparedRun, projection: Projection): boolean {
  return canonical({ before: run.before, after: run.after, commands: run.commands, exactDiff: run.exactDiff }) === canonical(projection);
}

function caseAndBook(state: SessionState, run: PreparedRun): Result<{ reservation: Reservation; playbook: PublishedPlaybook }> {
  const reservation = caseAt(state, run.caseId);
  if (!reservation || reservation.version !== run.caseVersion || canonical(reservation) !== canonical(run.before)) {
    return { ok: false, code: "CASE_STATE_CHANGED", summary: "The reservation changed. Discard this proposal and prepare it again." };
  }
  const playbook = playbookAt(state, run.playbookId, run.playbookVersion);
  if (!playbook) return { ok: false, code: "PLAYBOOK_NOT_PUBLISHED", summary: "The exact published playbook version is no longer available." };
  if (playbook.contentDigest !== run.playbookContentDigest) return { ok: false, code: "DIGEST_MISMATCH", summary: "The published playbook changed after this proposal was prepared." };
  if (recordingCase(state, run.caseId)) return { ok: false, code: "RECORDING_IN_PROGRESS", summary: "Finish or cancel the recording before applying a playbook to this case." };
  return { ok: true, code: "RUN_CONTEXT_VALID", summary: "The reservation and published version match.", data: { reservation, playbook } };
}

function usableRun(state: SessionState, runId: string, expectedDigest: string): Result<PreparedRun> {
  const run = state.runsById[runId];
  if (!run || run.id !== runId) return { ok: false, code: "RUN_NOT_FOUND", summary: "This proposal could not be found." };
  if (run.status === "committed" || run.approval?.used) return { ok: false, code: "RUN_ALREADY_COMMITTED", summary: "This proposal was already applied. It cannot be applied again." };
  if (run.status === "discarded") return { ok: false, code: "RUN_DISCARDED", summary: "This proposal was discarded. Prepare a new proposal." };
  if (run.status === "stale") return { ok: false, code: "CASE_STATE_CHANGED", summary: "A newer proposal replaced this one. Review the current proposal." };
  if (!expectedDigest || expectedDigest !== run.digest) return { ok: false, code: "DIGEST_MISMATCH", summary: "The proposal does not match the version being reviewed." };
  return { ok: true, code: "RUN_FOUND", summary: "Proposal found.", data: run };
}

export function approvalStatus(run: PreparedRun, now: number = Date.now()): ApprovalStatus {
  const approval = run.approval;
  if (run.status !== "approved" || !approval) return "none";
  if (approval.used || approval.runId !== run.id || approval.approvedDigest !== run.digest) return "invalid";
  const expires = Date.parse(approval.expiresAt);
  const approved = Date.parse(approval.approvedAt);
  if (!Number.isFinite(expires) || !Number.isFinite(approved)) return "invalid";
  if (expires <= now) return "expired";
  if (approved > now || expires - approved !== APPROVAL_TTL_MS) return "invalid";
  return "valid";
}

function approvalIssue(run: PreparedRun, now: number): Result | null {
  const status = approvalStatus(run, now);
  if (status === "none") return { ok: false, code: "RUN_NOT_APPROVED", summary: "A person must approve these exact changes before they can be applied." };
  if (status === "expired") return { ok: false, code: "APPROVAL_EXPIRED", summary: "Approval expired. Prepare and review a new proposal." };
  if (status === "invalid") {
    if (run.approval && (run.approval.runId !== run.id || run.approval.approvedDigest !== run.digest)) return { ok: false, code: "DIGEST_MISMATCH", summary: "The approval does not match this exact proposal." };
    return { ok: false, code: "RUN_NOT_APPROVED", summary: "The approval time is invalid. Prepare and review a new proposal." };
  }
  return null;
}

/** Pure transition; the session store must also reject a changed revision before saving. */
export async function prepareRun(state: SessionState, caseId: string, expectedCaseVersion: number, playbookId: string, playbookVersion: number, actor: RuntimeActor = "Agent", options: OperationOptions = {}): Promise<Transition<PreparedRun>> {
  const cancelled = aborted<PreparedRun>(state, options); if (cancelled) return cancelled;
  const clock = clockFor(options);
  const fields = { caseId, playbookId };
  if (!Number.isFinite(clock())) return reject(state, actor, "INVALID_INPUT", "The operation time is invalid.", fields);
  const currentCase = caseAt(state, caseId);
  if (!currentCase) return reject(state, actor, "CASE_NOT_FOUND", "The requested reservation could not be found.", fields);
  if (!Number.isSafeInteger(expectedCaseVersion) || expectedCaseVersion < 1 || currentCase.version !== expectedCaseVersion) return reject(state, actor, "CASE_STATE_CHANGED", "The reservation changed. Read its latest version before preparing a proposal.", fields);
  if (recordingCase(state, caseId)) return reject(state, actor, "RECORDING_IN_PROGRESS", "Finish or cancel the recording before preparing this case.", fields);
  const currentBook = playbookAt(state, playbookId, playbookVersion);
  if (!currentBook || !Number.isSafeInteger(playbookVersion) || playbookVersion < 1) return reject(state, actor, "PLAYBOOK_NOT_PUBLISHED", "Choose an existing, human-published playbook version.", fields);
  const reservation = structuredClone(currentCase), playbook = structuredClone(currentBook);
  const projected = project(reservation, playbook, state.businessDate);
  if (!projected.ok || !projected.data) return reject(state, actor, projected.code, projected.summary, fields, projected.issues);
  const projection = projected.data;
  const revision = state.revision;
  const snapshot = canonical({ reservation, playbook, businessDate: state.businessDate, timeZone: state.timeZone });
  const run: PreparedRun = {
    id: crypto.randomUUID(), caseId, caseVersion: expectedCaseVersion,
    playbookId, playbookVersion, playbookContentDigest: playbook.contentDigest,
    ...projection, digest: "", status: "awaiting_review", approval: null,
    createdAt: new Date(clock()).toISOString(), committedAt: null,
  };
  try {
    const actualContentDigest = await digest(publishedContent(playbook));
    const cancelledAfterBookHash = aborted<PreparedRun>(state, options); if (cancelledAfterBookHash) return cancelledAfterBookHash;
    if (actualContentDigest !== playbook.contentDigest) return reject(state, actor, "DIGEST_MISMATCH", "The published playbook content no longer matches its reviewed version.", fields);
    run.digest = await digest(runContent(state, run, playbook, projection));
  } catch {
    const cancelledHash = aborted<PreparedRun>(state, options); if (cancelledHash) return cancelledHash;
    return reject(state, actor, "HASH_FAILED", "The proposal could not be verified. No reservation changes were applied.", fields);
  }
  const cancelledAfterHash = aborted<PreparedRun>(state, options); if (cancelledAfterHash) return cancelledAfterHash;
  const currentSnapshot = canonical({ reservation: caseAt(state, caseId), playbook: playbookAt(state, playbookId, playbookVersion), businessDate: state.businessDate, timeZone: state.timeZone });
  if (state.revision !== revision || currentSnapshot !== snapshot || recordingCase(state, caseId)) return reject(state, actor, "CASE_STATE_CHANGED", "The session changed while the proposal was being prepared. Try again.", fields);
  const runsById = { ...state.runsById };
  for (const [id, previous] of Object.entries(runsById)) {
    if (previous.caseId === caseId && (previous.status === "awaiting_review" || previous.status === "approved")) runsById[id] = { ...previous, status: "stale", approval: null };
  }
  runsById[run.id] = run;
  const at = new Date(clock()).toISOString();
  const next = evolveWithAudit({
    ...state,
    runsById,
    activeRunIdByCaseId: { ...state.activeRunIdByCaseId, [caseId]: run.id },
  }, [
    {
      actor: "Website",
      eventType: "run_policy_validated",
      summary: "The website enforced the published boundary and generated the exact proposal. No changes were applied.",
      ...fields,
      runId: run.id,
    },
    {
      actor,
      eventType: "run_prepared",
      summary: "Prepared the published playbook's exact changes; awaiting human review.",
      ...fields,
      runId: run.id,
    },
  ], at);
  return success(next, "RUN_PREPARED", "Changes are ready for review. The reservation has not been changed.", structuredClone(run));
}

/** Human UI entrypoint only; deliberately has no caller/actor argument or WebMCP tool. */
export function approveRun(state: SessionState, runId: string, expectedDigest: string, options: OperationOptions = {}): Transition<PreparedRun> {
  const cancelled = aborted<PreparedRun>(state, options); if (cancelled) return cancelled;
  const now = clockFor(options)();
  if (!Number.isFinite(now)) return reject(state, "Human", "INVALID_INPUT", "The operation time is invalid.", { runId });
  const checked = usableRun(state, runId, expectedDigest);
  if (!checked.ok || !checked.data) return reject(state, "Human", checked.code, checked.summary, { runId });
  const run = checked.data;
  const fields = { runId, caseId: run.caseId, playbookId: run.playbookId };
  if (run.status === "approved") {
    const invalid = approvalIssue(run, now);
    if (invalid) return reject(state, "Human", invalid.code, invalid.summary, fields);
  }
  if (run.status !== "approved" && run.approval !== null) return reject(state, "Human", "DIGEST_MISMATCH", "The proposal contains an unexpected approval.", fields);
  const context = caseAndBook(state, run);
  if (!context.ok || !context.data) return reject(state, "Human", context.code, context.summary, fields);
  const projected = project(context.data.reservation, context.data.playbook, state.businessDate);
  if (!projected.ok || !projected.data) return reject(state, "Human", projected.code, projected.summary, fields, projected.issues);
  if (!sameProjection(run, projected.data)) return reject(state, "Human", "DIGEST_MISMATCH", "The proposal differs from the published steps. Prepare it again.", fields);
  if (run.status === "approved") return success(state, "RUN_ALREADY_APPROVED", "This proposal already has approval. Its original expiry has not been extended.", structuredClone(run));
  const approved: PreparedRun = { ...run, status: "approved", approval: { runId, approvedDigest: expectedDigest, approvedAt: new Date(now).toISOString(), expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString(), used: false } };
  const next = evolve(state, { runsById: { ...state.runsById, [runId]: approved } }, { actor: "Human", eventType: "run_approved", summary: "A person approved the exact proposal for one application within five minutes.", ...fields, at: new Date(now).toISOString() });
  return success(next, "RUN_APPROVED", "Approved for this proposal only. It has not yet been applied.", structuredClone(approved));
}

export async function commitRun(state: SessionState, runId: string, expectedDigest: string, actor: RuntimeActor = "Agent", options: OperationOptions = {}): Promise<Transition<PreparedRun>> {
  const cancelled = aborted<PreparedRun>(state, options); if (cancelled) return cancelled;
  const clock = clockFor(options);
  if (!Number.isFinite(clock())) return reject(state, actor, "INVALID_INPUT", "The operation time is invalid.", { runId });
  const checked = usableRun(state, runId, expectedDigest);
  if (!checked.ok || !checked.data) return reject(state, actor, checked.code, checked.summary, { runId });
  const run = structuredClone(checked.data);
  const fields = { runId, caseId: run.caseId, playbookId: run.playbookId };
  const approvalError = approvalIssue(run, clock());
  if (approvalError) return reject(state, actor, approvalError.code, approvalError.summary, fields);
  const context = caseAndBook(state, run);
  if (!context.ok || !context.data) return reject(state, actor, context.code, context.summary, fields);
  const playbook = structuredClone(context.data.playbook);
  const projected = project(context.data.reservation, playbook, state.businessDate);
  if (!projected.ok || !projected.data) return reject(state, actor, projected.code, projected.summary, fields, projected.issues);
  if (!sameProjection(run, projected.data)) return reject(state, actor, "DIGEST_MISMATCH", "The stored proposal differs from the published playbook's exact changes.", fields);
  const revision = state.revision, runSnapshot = canonical(run), bookSnapshot = canonical(playbook);
  const sessionDate = state.businessDate, sessionZone = state.timeZone;
  let calculatedDigest: string;
  try {
    const actualContentDigest = await digest(publishedContent(playbook));
    const cancelledAfterBookHash = aborted<PreparedRun>(state, options); if (cancelledAfterBookHash) return cancelledAfterBookHash;
    if (actualContentDigest !== run.playbookContentDigest) return reject(state, actor, "DIGEST_MISMATCH", "The published playbook was altered after approval.", fields);
    calculatedDigest = await digest(runContent(state, run, playbook, projected.data));
  } catch {
    const cancelledHash = aborted<PreparedRun>(state, options); if (cancelledHash) return cancelledHash;
    return reject(state, actor, "HASH_FAILED", "The approved proposal could not be verified. No changes were applied.", fields);
  }
  const cancelledAfterHash = aborted<PreparedRun>(state, options); if (cancelledAfterHash) return cancelledAfterHash;
  const expiredDuringHash = approvalIssue(run, clock());
  if (expiredDuringHash) return reject(state, actor, expiredDuringHash.code, expiredDuringHash.summary, fields);
  if (calculatedDigest !== run.digest || calculatedDigest !== expectedDigest) return reject(state, actor, "DIGEST_MISMATCH", "These changes do not match the exact proposal that was approved.", fields);
  const freshContext = caseAndBook(state, run);
  if (!freshContext.ok || !freshContext.data) return reject(state, actor, freshContext.code, freshContext.summary, fields);
  if (state.revision !== revision || canonical(state.runsById[runId]) !== runSnapshot || canonical(freshContext.data.playbook) !== bookSnapshot || state.businessDate !== sessionDate || state.timeZone !== sessionZone) {
    return reject(state, actor, "CASE_STATE_CHANGED", "The session changed while approval was being verified. No changes were applied.", fields);
  }
  const commitTime = clock();
  const expiredBeforeSave = approvalIssue(run, commitTime);
  if (expiredBeforeSave) return reject(state, actor, expiredBeforeSave.code, expiredBeforeSave.summary, fields);
  const committedAt = new Date(commitTime).toISOString();
  const committed: PreparedRun = { ...run, status: "committed", committedAt, approval: { ...run.approval!, used: true } };
  const next = evolve(state, { reservations: state.reservations.map(row => row.id === run.caseId ? structuredClone(projected.data!.after) : row), runsById: { ...state.runsById, [runId]: committed } }, { actor, eventType: "run_committed", summary: "Applied only the exact changes approved by a person.", ...fields, at: committedAt });
  return success(next, "RUN_COMMITTED", "The approved changes have been applied once.", structuredClone(committed));
}

export function discardRun(state: SessionState, runId: string, options: OperationOptions = {}): Transition<PreparedRun> {
  const cancelled = aborted<PreparedRun>(state, options); if (cancelled) return cancelled;
  const run = state.runsById[runId];
  if (!run || run.id !== runId) return reject(state, "Human", "RUN_NOT_FOUND", "This proposal could not be found.", { runId });
  if (run.status === "committed" || run.approval?.used) return reject(state, "Human", "RUN_ALREADY_COMMITTED", "Applied changes cannot be undone by discarding this proposal.", { runId, caseId: run.caseId });
  if (run.status === "discarded") return success(state, "RUN_ALREADY_DISCARDED", "This proposal was already discarded.", structuredClone(run));
  const discarded: PreparedRun = { ...run, status: "discarded", approval: null };
  const activeRunIdByCaseId = { ...state.activeRunIdByCaseId };
  if (activeRunIdByCaseId[run.caseId] === runId) delete activeRunIdByCaseId[run.caseId];
  const now = clockFor(options)();
  if (!Number.isFinite(now)) return reject(state, "Human", "INVALID_INPUT", "The operation time is invalid.", { runId });
  const next = evolve(state, { runsById: { ...state.runsById, [runId]: discarded }, activeRunIdByCaseId }, { actor: "Human", eventType: "run_discarded", summary: "Discarded the proposal and its approval. The reservation was not changed.", runId, caseId: run.caseId, at: new Date(now).toISOString() });
  return success(next, "RUN_DISCARDED", "Proposal discarded. No changes were applied.", structuredClone(discarded));
}

/** Returns a detached snapshot; looking up a run never extends or creates approval. */
export function getRun(state: SessionState, runId: string, options: OperationOptions = {}): Result<PreparedRun> {
  const run = state.runsById[runId];
  if (!run || run.id !== runId) return { ok: false, code: "RUN_NOT_FOUND", summary: "This proposal could not be found." };
  const invalidApproval = run.status === "approved" ? approvalIssue(run, clockFor(options)()) : null;
  return { ok: true, code: invalidApproval?.code ?? "RUN_FOUND", summary: invalidApproval?.summary ?? "Proposal state retrieved. Approval is never renewed by checking it.", data: structuredClone(run) };
}

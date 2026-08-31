import type { Command, CommandType, Demonstration, OperationOptions, RecordedCommand, Reservation, Result, SessionState, Transition } from "./domain";
import { canonical, digest, evolve, failure, success } from "./common";
import { COMMAND_FIELDS, executeCommand, reservationDiff } from "./commands";
import { FIXED_SAFEGUARDS } from "./playbook-policy";

export const DEMONSTRATION_PAYLOAD_LIMIT = 16 * 1_024;
const timestamp = (options?: OperationOptions) => options?.now ?? new Date().toISOString();

/** The full human history is covered, although tool output shows final edits. */
export function demonstrationDigest(demo: Demonstration): Promise<string> {
  const { digest: _storedDigest, ...source } = demo;
  return digest({ schemaVersion: 1, ...source });
}

/** Preserve the final recorded ID of each operation, not an invented action. */
export function effectiveCommands(demo: Demonstration): RecordedCommand[] {
  const finalByType = new Map<CommandType, RecordedCommand>();
  for (const recorded of demo.commands) finalByType.set(recorded.command.type, recorded);
  return [...finalByType.values()].filter(recorded => COMMAND_FIELDS[recorded.command.type].some(field => demo.before[field] !== demo.after[field])).sort((a, b) => a.sequence - b.sequence);
}

function fields(reservation: Reservation, names: (keyof Reservation)[]): Record<string, unknown> {
  return Object.fromEntries(names.map(field => [field, reservation[field]]));
}

export function demonstrationPayload(demo: Demonstration): Result {
  if (demo.status !== "completed" || !demo.digest) return { ok: false, code: "DEMONSTRATION_NOT_FOUND", summary: "Only a completed human recording can be used." };
  const effective = effectiveCommands(demo);
  if (effective.length === 0) return { ok: false, code: "NO_RECORDED_CHANGES", summary: "The recording has no final changes to reuse." };
  const businessFields = Object.values(COMMAND_FIELDS).flat();
  const data = {
    demonstrationId: demo.id, caseId: demo.caseId, sourceDigest: demo.digest, recordedBy: demo.recordedBy,
    startedAt: demo.startedAt, completedAt: demo.completedAt,
    sourceCase: fields(demo.before, ["id", "guestDisplayName", "status", "arrivalDate", "plannedArrivalTime", "requestedArrivalDate", "requestedArrivalTime", "mealPlan", "hasNewDietaryRequest", "requestsTaxi", "requestsCompensation", "requestsCancellation", "requestsPaymentChange"]),
    before: fields(demo.before, businessFields), after: fields(demo.after, businessFields),
    commands: effective.map(recorded => ({
      id: recorded.id, sequence: recorded.sequence, type: recorded.command.type,
      input: recorded.command.input,
      before: fields(recorded.before, COMMAND_FIELDS[recorded.command.type]),
      after: fields(recorded.after, COMMAND_FIELDS[recorded.command.type]),
      caseVersionBefore: recorded.caseVersionBefore, caseVersionAfter: recorded.caseVersionAfter,
      at: recorded.at, actor: recorded.actor,
    })),
    finalChanges: reservationDiff(demo.before, demo.after),
    totalSavedOperations: demo.commands.length,
    allowedOperations: Object.keys(COMMAND_FIELDS),
    allowedReferences: {
      arrival: ["requestedArrivalDate", "requestedArrivalTime"],
      text: ["guestDisplayName", "requestedArrivalTime"],
      mealValue: "late_meal_box",
    },
    fixedSafeguards: FIXED_SAFEGUARDS,
  };
  const result = { ok: true, code: "DEMONSTRATION_FOUND", summary: "Recorded human work, not a generated playbook.", data };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > DEMONSTRATION_PAYLOAD_LIMIT) return { ok: false, code: "DEMONSTRATION_TOO_LARGE", summary: "The recorded text is too large to return safely. Shorten the saved text before completing the recording." };
  return result;
}

export function startRecording(state: SessionState, caseId: string, options: OperationOptions = {}): Transition<Demonstration> {
  if (options.signal?.aborted) return failure(state, "OPERATION_ABORTED", "Recording was canceled before it started.");
  if (state.recordingId !== null) return failure(state, "RECORDING_IN_PROGRESS", "Finish or cancel the current recording first.");
  const reservation = state.reservations.find(item => item.id === caseId);
  if (!reservation) return failure(state, "CASE_NOT_FOUND", "The reservation no longer exists.");
  if (reservation.status !== "confirmed" || reservation.handled) return failure(state, "CASE_NOT_EDITABLE", "Choose an unhandled, confirmed reservation.");
  const run = state.runsById[state.activeRunIdByCaseId[caseId]];
  if (run && ["awaiting_review", "approved"].includes(run.status)) return failure(state, "RUN_IN_PROGRESS", "Discard the prepared changes before recording manual work.");
  const demo: Demonstration = {
    id: crypto.randomUUID(), caseId, status: "recording", before: structuredClone(reservation), after: structuredClone(reservation),
    commands: [], startedAt: timestamp(options), completedAt: null, digest: null, recordedBy: "Human",
  };
  return success(evolve(state, { recordingId: demo.id, demonstrations: [demo, ...state.demonstrations] }, { actor: "Human", eventType: "recording_started", summary: "Started recording manual work.", caseId, demonstrationId: demo.id, at: demo.startedAt }), "RECORDING_STARTED", "Changes saved from now on will become this recording.", demo);
}

function activeRecording(state: SessionState): Demonstration | undefined {
  return state.demonstrations.find(demo => demo.id === state.recordingId && demo.status === "recording");
}

export function recordCommand(state: SessionState, caseId: string, expectedVersion: number, command: Command, options: OperationOptions = {}): Transition<RecordedCommand> {
  if (options.signal?.aborted) return failure(state, "OPERATION_ABORTED", "The save was canceled.");
  const demo = activeRecording(state);
  if (!demo) return failure(state, "NOT_RECORDING", "Start a recording before saving an operation.");
  if (demo.caseId !== caseId) return failure(state, "RECORDING_IN_PROGRESS", "Finish or cancel the recording before changing another reservation.");
  const reservation = state.reservations.find(item => item.id === caseId);
  if (!reservation || canonical(reservation) !== canonical(demo.after)) return failure(state, "CASE_STATE_CHANGED", "The reservation changed outside this recording.");
  const applied = executeCommand(reservation, command, expectedVersion);
  if (!applied.ok || !applied.data) return failure(state, applied.code, applied.summary, applied.issues);
  if (!applied.data.changed) return failure(state, "NO_CHANGE", "The same value is already saved; no new operation was recorded.");
  const recorded: RecordedCommand = {
    id: crypto.randomUUID(), sequence: demo.commands.length + 1, caseId, command: structuredClone(command),
    before: structuredClone(reservation), after: structuredClone(applied.data.reservation),
    caseVersionBefore: reservation.version, caseVersionAfter: applied.data.reservation.version, at: timestamp(options), actor: "Human",
  };
  const updated = { ...demo, commands: [...demo.commands, recorded], after: structuredClone(applied.data.reservation) };
  return success(evolve(state, {
    reservations: state.reservations.map(item => item.id === caseId ? applied.data!.reservation : item),
    demonstrations: state.demonstrations.map(item => item.id === demo.id ? updated : item),
  }, { actor: "Human", eventType: "command_recorded", summary: `Saved ${command.type}.`, caseId, demonstrationId: demo.id, at: recorded.at }), "COMMAND_RECORDED", "The change and its source record were saved together.", recorded);
}

export async function finishRecording(state: SessionState, options: OperationOptions & { markHandled?: boolean } = {}): Promise<Transition<Demonstration>> {
  if (options.signal?.aborted) return failure(state, "OPERATION_ABORTED", "Recording completion was canceled.");
  const demo = activeRecording(state);
  if (!demo) return failure(state, "NOT_RECORDING", "There is no active recording to complete.");
  if (effectiveCommands(demo).length === 0) return failure(state, "NO_RECORDED_CHANGES", "Save at least one actual change before completing the recording.");
  const reservation = state.reservations.find(item => item.id === demo.caseId);
  if (!reservation || canonical(reservation) !== canonical(demo.after)) return failure(state, "CASE_STATE_CHANGED", "The reservation changed outside this recording.");
  const after = options.markHandled === false ? reservation : { ...reservation, handled: true, version: reservation.version + 1 };
  const completed: Demonstration = { ...demo, status: "completed", after: structuredClone(after), completedAt: timestamp(options), digest: null };
  try { completed.digest = await demonstrationDigest(completed); }
  catch { return failure(state, "HASH_FAILED", "The recording could not be verified. It is still open; retry completion."); }
  if (options.signal?.aborted) return failure(state, "OPERATION_ABORTED", "Recording completion was canceled.");
  const payload = demonstrationPayload(completed);
  if (!payload.ok) return { state, result: { ok: false, code: payload.code, summary: payload.summary } };
  return success(evolve(state, {
    recordingId: null,
    reservations: state.reservations.map(item => item.id === demo.caseId ? after : item),
    demonstrations: state.demonstrations.map(item => item.id === demo.id ? completed : item),
  }, { actor: "Human", eventType: "recording_completed", summary: "Completed a recording of saved human work.", caseId: demo.caseId, demonstrationId: demo.id, at: completed.completedAt! }), "RECORDING_COMPLETED", "The completed recording can now be read by an agent.", completed);
}

export function cancelRecording(state: SessionState, options: OperationOptions = {}): Transition<Demonstration> {
  if (options.signal?.aborted) return failure(state, "OPERATION_ABORTED", "The operation was canceled.");
  const demo = activeRecording(state);
  if (!demo) return failure(state, "NOT_RECORDING", "There is no active recording.");
  const cancelled: Demonstration = { ...demo, status: "cancelled", completedAt: timestamp(options), digest: null };
  return success(evolve(state, { recordingId: null, demonstrations: state.demonstrations.map(item => item.id === demo.id ? cancelled : item) }, { actor: "Human", eventType: "recording_cancelled", summary: "Canceled the recording. Previously saved case work was kept.", caseId: demo.caseId, demonstrationId: demo.id, at: cancelled.completedAt! }), "RECORDING_CANCELLED", "Recording canceled. Previously saved case work is still kept.", cancelled);
}

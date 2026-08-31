import { describe, expect, it } from "vitest";
import { createSession } from "./fixtures";
import { cancelRecording, demonstrationDigest, demonstrationPayload, effectiveCommands, finishRecording, recordCommand, startRecording } from "./recording";

const now = "2026-08-31T08:00:00.000Z";

describe("human demonstration recording", () => {
  it("starts with synthetic cases but no fabricated demonstrations or playbooks", () => {
    const state = createSession();
    expect(state.demonstrations).toEqual([]);
    expect(state.playbooks).toEqual([]);
    expect(state.audit).toEqual([]);
    expect(state.reservations[0].handled).toBe(false);
  });

  it("records only successful saved actions, in the same state as their business changes", () => {
    const initial = createSession();
    const reservation = initial.reservations[0];
    let state = startRecording(initial, reservation.id, { now }).state;
    const result = recordCommand(state, reservation.id, reservation.version, { type: "draft_guest_message", input: { text: "Hello Aiko, arrival at 21:30." } }, { now });
    expect(result.result.ok).toBe(true);
    state = result.state;
    expect(state.reservations[0].guestMessageDraft).toBe("Hello Aiko, arrival at 21:30.");
    expect(state.demonstrations[0].commands[0]).toMatchObject({ actor: "Human", sequence: 1, caseVersionBefore: 1, caseVersionAfter: 2, before: { guestMessageDraft: null }, after: { guestMessageDraft: "Hello Aiko, arrival at 21:30." } });
    expect(initial.reservations[0].guestMessageDraft).toBe(null);
    const noop = recordCommand(state, reservation.id, 2, { type: "draft_guest_message", input: { text: "Hello Aiko, arrival at 21:30." } });
    expect(noop.result.ok).toBe(false);
    expect(noop.state).toBe(state);
    const stale = recordCommand(state, reservation.id, 1, { type: "draft_guest_message", input: { text: "Different" } });
    expect(stale.result.code).toBe("CASE_STATE_CHANGED");
    expect(stale.state.demonstrations[0].commands).toHaveLength(1);
  });

  it("keeps edit history, exports final effective changes, and freezes a digested source", async () => {
    const initial = createSession();
    const reservation = initial.reservations[0];
    let state = startRecording(initial, reservation.id, { now }).state;
    state = recordCommand(state, reservation.id, 1, { type: "add_shift_handoff", input: { text: "First version" } }, { now }).state;
    state = recordCommand(state, reservation.id, 2, { type: "add_shift_handoff", input: { text: "Aiko Tanaka arrives at 21:30." } }, { now }).state;
    const beforeFinish = state;
    const completed = await finishRecording(state, { now });
    expect(completed.result.ok).toBe(true);
    const demo = completed.result.data!;
    expect(demo.commands).toHaveLength(2);
    expect(effectiveCommands(demo)).toHaveLength(1);
    expect(effectiveCommands(demo)[0].id).toBe(demo.commands[1].id);
    expect(demo.digest).toBe(await demonstrationDigest(demo));
    expect(demonstrationPayload(demo).ok).toBe(true);
    expect(completed.state.recordingId).toBe(null);
    expect(completed.state.reservations[0].handled).toBe(true);
    expect(beforeFinish.demonstrations[0].status).toBe("recording");
    expect(recordCommand(completed.state, reservation.id, completed.state.reservations[0].version, { type: "add_shift_handoff", input: { text: "rewrite" } }).result.ok).toBe(false);
  });

  it("cannot switch recording to another case or finish an empty recording", async () => {
    const initial = createSession();
    const state = startRecording(initial, initial.reservations[0].id, { now }).state;
    expect(startRecording(state, initial.reservations[1].id).result.code).toBe("RECORDING_IN_PROGRESS");
    expect(recordCommand(state, initial.reservations[1].id, 1, { type: "add_shift_handoff", input: { text: "Wrong case" } }).result.code).toBe("RECORDING_IN_PROGRESS");
    expect((await finishRecording(state)).result.code).toBe("NO_RECORDED_CHANGES");
  });

  it("cancels the recording without rolling back already saved case work", async () => {
    const initial = createSession();
    const caseId = initial.reservations[0].id;
    let state = startRecording(initial, caseId, { now }).state;
    state = recordCommand(state, caseId, 1, { type: "set_meal_service", input: { value: "late_meal_box" } }, { now }).state;
    const cancelled = cancelRecording(state, { now });
    expect(cancelled.state.reservations[0].mealService).toBe("late_meal_box");
    expect(cancelled.state.demonstrations[0].status).toBe("cancelled");
    expect(cancelled.state.demonstrations[0].digest).toBe(null);
    expect(demonstrationPayload(cancelled.state.demonstrations[0]).ok).toBe(false);
    expect((await finishRecording(cancelled.state)).result.ok).toBe(false);
  });

  it("excludes a field returned to its initial value and refuses a net-empty source", async () => {
    const initial = createSession();
    initial.reservations[0].shiftHandoff = "Initial";
    const caseId = initial.reservations[0].id;
    let state = startRecording(initial, caseId, { now }).state;
    state = recordCommand(state, caseId, 1, { type: "add_shift_handoff", input: { text: "Temporary" } }).state;
    state = recordCommand(state, caseId, 2, { type: "add_shift_handoff", input: { text: "Initial" } }).state;
    expect(effectiveCommands(state.demonstrations[0])).toEqual([]);
    expect((await finishRecording(state)).result.code).toBe("NO_RECORDED_CHANGES");
  });

  it("does not complete when canceled during async digest calculation", async () => {
    const initial = createSession();
    const caseId = initial.reservations[0].id;
    let state = startRecording(initial, caseId).state;
    state = recordCommand(state, caseId, 1, { type: "add_shift_handoff", input: { text: "Saved human note" } }).state;
    const controller = new AbortController();
    const pending = finishRecording(state, { signal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(result.result.code).toBe("OPERATION_ABORTED");
    expect(result.state).toBe(state);
  });

  it("rejects an oversized tool payload before completion and allows shorter re-edits", async () => {
    const initial = createSession();
    const caseId = initial.reservations[0].id;
    let state = startRecording(initial, caseId).state;
    state = recordCommand(state, caseId, 1, { type: "draft_guest_message", input: { text: "字".repeat(1_000) } }).state;
    state = recordCommand(state, caseId, 2, { type: "add_shift_handoff", input: { text: "字".repeat(1_000) } }).state;
    const oversized = await finishRecording(state);
    expect(oversized.result.code).toBe("DEMONSTRATION_TOO_LARGE");
    expect(oversized.state).toBe(state);
    state = recordCommand(state, caseId, 3, { type: "draft_guest_message", input: { text: "A short message" } }).state;
    state = recordCommand(state, caseId, 4, { type: "add_shift_handoff", input: { text: "A short handoff" } }).state;
    const completed = await finishRecording(state);
    expect(completed.result.ok).toBe(true);
    const exported = demonstrationPayload(completed.result.data!);
    expect(new TextEncoder().encode(JSON.stringify(exported)).byteLength).toBeLessThanOrEqual(16 * 1024);
    expect(exported.data).toMatchObject({ allowedOperations: expect.arrayContaining(["set_estimated_arrival"]), fixedSafeguards: expect.any(Array) });
  });
});

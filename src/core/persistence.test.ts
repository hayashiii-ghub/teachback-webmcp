import { describe, expect, it, vi } from "vitest";
import { evolve, success } from "./common";
import { createSessionStore, SESSION_STORAGE_KEY, type SessionStorage } from "./persistence";
import { createSession } from "./fixtures";
import { finishRecording, recordCommand, startRecording } from "./recording";
import type { Proposal } from "./domain";
import { createDraft, publishDraft } from "./teaching";
import { approveRun, commitRun, prepareRun } from "./playbook-runtime";

function memoryStorage(values: Record<string, string> = {}) {
  const records = new Map(Object.entries(values));
  return { records, getItem: vi.fn((key: string) => records.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { records.set(key, value); }) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function storedWorkflow() {
  const storage = memoryStorage();
  const store = createSessionStore(storage);
  const source = store.getSnapshot().reservations[0];
  await store.dispatch(state => startRecording(state, source.id));
  await store.dispatch(state => recordCommand(state, source.id, 1, { type: "set_estimated_arrival", input: { date: source.requestedArrivalDate!, time: source.requestedArrivalTime! } }));
  await store.dispatch(state => recordCommand(state, source.id, 2, { type: "add_shift_handoff", input: { text: `${source.guestDisplayName} arrives at ${source.requestedArrivalTime}.` } }));
  const finished = await store.dispatch(state => finishRecording(state));
  expect(finished.ok, finished.summary).toBe(true);
  const demo = finished.data!;
  const proposal: Proposal = {
    name: "Recorded arrival and handoff", purpose: "Reuse the two actual saved operations.",
    steps: [
      { id: "arrival-step", type: "set_estimated_arrival", input: { date: { kind: "case_field", field: "requestedArrivalDate" }, time: { kind: "case_field", field: "requestedArrivalTime" } }, evidenceCommandIds: [demo.commands[0].id], rationale: "Use the next guest's requested date and time." },
      { id: "handoff-step", type: "add_shift_handoff", input: { template: [{ kind: "case_field", field: "guestDisplayName" }, { kind: "literal", value: " arrives at " }, { kind: "case_field", field: "requestedArrivalTime" }, { kind: "literal", value: "." }] }, evidenceCommandIds: [demo.commands[1].id], rationale: "Keep the recorded wording while substituting the new guest's details." },
    ], proposedBoundary: { latestArrivalTime: "22:00" }, unresolvedQuestions: [],
  };
  const drafted = await store.dispatch(state => createDraft(state, demo.id, demo.digest!, proposal, "Agent"));
  expect(drafted.ok, drafted.summary).toBe(true);
  const draft = drafted.data!;
  const published = await store.dispatch(state => publishDraft(state, draft.id, draft.revision, true));
  expect(published.ok, published.summary).toBe(true);
  const book = published.data!;
  const target = store.getSnapshot().reservations[1];
  const prepared = await store.dispatch(state => prepareRun(state, target.id, target.version, book.id, book.version));
  expect(prepared.ok, prepared.summary).toBe(true);
  return { storage, store, source, book, run: prepared.data! };
}

describe("single-key session storage", () => {
  it("does not fabricate or save anything merely by opening a new session", () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    expect(store.getLoadStatus().kind).toBe("ready");
    expect(store.getSnapshot().playbooks).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("writes the command and case atomically before notifying UI", async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const caseId = store.getSnapshot().reservations[0].id;
    const seen: string[] = [];
    store.subscribe(() => { expect(JSON.parse(storage.records.get(SESSION_STORAGE_KEY)!)).toEqual(store.getSnapshot()); seen.push("saved"); });
    expect((await store.dispatch(state => startRecording(state, caseId))).ok).toBe(true);
    expect((await store.dispatch(state => recordCommand(state, caseId, 1, { type: "add_shift_handoff", input: { text: "A real saved operation" } }))).ok).toBe(true);
    expect((await store.dispatch(state => finishRecording(state))).ok).toBe(true);
    expect(seen).toHaveLength(3);
    const loaded = createSessionStore(storage);
    expect(loaded.getLoadStatus().kind).toBe("ready");
    expect(loaded.getSnapshot()).toEqual(store.getSnapshot());
  });

  it("keeps memory and source unchanged when storage is full", async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    storage.setItem.mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
    const result = await store.dispatch(state => startRecording(state, state.reservations[0].id));
    expect(result.code).toBe("PERSISTENCE_FAILED");
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    storage.setItem.mockImplementation((key, value) => { storage.records.set(key, value); });
    expect((await store.dispatch(state => startRecording(state, state.reservations[0].id))).ok).toBe(true);
  });

  it("preserves legacy records and requires an explicit fresh-session start", async () => {
    const legacy = '{"old":"untouched"}';
    const storage = memoryStorage({ "teachback-demo-v1": legacy, "teachback-teaching-v4": "{old draft}" });
    const store = createSessionStore(storage);
    expect(store.getLoadStatus().kind).toBe("legacy");
    expect((await store.dispatch(state => startRecording(state, state.reservations[0].id))).ok).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.restart().ok).toBe(true);
    expect(storage.records.get("teachback-demo-v1")).toBe(legacy);
    expect(storage.records.get("teachback-teaching-v4")).toBe("{old draft}");
    expect(store.getLoadStatus().kind).toBe("ready");
  });

  it.each(["{broken", JSON.stringify({ schemaVersion: 1 }), JSON.stringify({ ...createSession(), reservations: [] }), JSON.stringify({ ...createSession(), reservations: [{ id: "forged" }] }), JSON.stringify({ ...createSession(), runsById: { bad: { status: "approved" } } })])("refuses malformed storage without silently replacing it", async raw => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: raw });
    const store = createSessionStore(storage);
    expect(store.getLoadStatus().kind).toBe("error");
    expect(store.getLoadStatus().rawSession).toBe(raw);
    expect((await store.dispatch(state => startRecording(state, state.reservations[0].id))).ok).toBe(false);
    expect(storage.records.get(SESSION_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("exposes unavailable reads and does not write around them", () => {
    const storage: SessionStorage = { getItem: () => { throw new Error("blocked"); }, setItem: vi.fn() };
    const store = createSessionStore(storage);
    expect(store.getLoadStatus().kind).toBe("error");
    expect(store.restart().code).toBe("PERSISTENCE_FAILED");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects concurrent operations and aborts an async transition before any save", async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const gate = deferred<void>();
    const controller = new AbortController();
    const pending = store.dispatch(async state => { await gate.promise; return startRecording(state, state.reservations[0].id); }, controller.signal);
    expect((await store.dispatch(state => startRecording(state, state.reservations[0].id))).code).toBe("SESSION_BUSY");
    controller.abort();
    gate.resolve();
    expect((await pending).code).toBe("OPERATION_ABORTED");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getSnapshot().recordingId).toBe(null);
  });

  it("invalidates unfinished work when explicitly restarted or disposed", async () => {
    for (const action of ["restart", "dispose"] as const) {
      const storage = memoryStorage();
      const store = createSessionStore(storage);
      const gate = deferred<void>();
      const pending = store.dispatch(async state => { await gate.promise; return startRecording(state, state.reservations[0].id); });
      store[action]();
      gate.resolve();
      expect((await pending).ok).toBe(false);
      expect(store.getSnapshot().recordingId).toBe(null);
      expect(storage.setItem).toHaveBeenCalledTimes(action === "restart" ? 1 : 0);
    }
  });

  it("detects another persisted revision during asynchronous work without overwriting it", async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const gate = deferred<void>();
    const pending = store.dispatch(async state => { await gate.promise; return startRecording(state, state.reservations[0].id); });
    const other = { ...createSession(), revision: 30 };
    storage.records.set(SESSION_STORAGE_KEY, JSON.stringify(other));
    gate.resolve();
    expect((await pending).code).toBe("SESSION_CHANGED");
    expect(JSON.parse(storage.records.get(SESSION_STORAGE_KEY)!).revision).toBe(30);
    expect(store.reload().ok).toBe(true);
    expect(store.getSnapshot().revision).toBe(30);
  });

  it("preserves request deduplication through reload and rejects invalid next state", async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const cached = { ok: true, code: "TEST", summary: "Saved original result", data: { id: "new-playbook-id" } };
    expect((await store.dispatch(state => success(evolve(state, { requests: { req: { fingerprint: "a".repeat(64), result: cached } } }), "SAVED", "Saved", null))).ok).toBe(true);
    expect(createSessionStore(storage).getSnapshot().requests.req.result).toEqual(cached);
    const before = store.getSnapshot();
    const invalid = await store.dispatch(state => success({ ...state, revision: state.revision + 1, recordingId: "missing-recording" }, "SAVED", "Saved", null));
    expect(invalid.code).toBe("INVALID_SESSION");
    expect(store.getSnapshot()).toBe(before);
  });

  it("saves multiple pure transitions as one atomic session revision", async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const result = await store.dispatch(state => {
      const started = startRecording(state, state.reservations[0].id);
      return recordCommand(started.state, state.reservations[0].id, 1, { type: "add_shift_handoff", input: { text: "Composed changes" } });
    });
    expect(result.ok).toBe(true);
    expect(store.getSnapshot().revision).toBe(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(createSessionStore(storage).getSnapshot().demonstrations[0].commands).toHaveLength(1);
  });

  it("can cancel pending work on lifecycle cleanup and still reuse the same store", async () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    const gate = deferred<void>();
    const pending = store.dispatch(async state => { await gate.promise; return startRecording(state, state.reservations[0].id); });
    store.cancelPending();
    expect((await store.dispatch(state => startRecording(state, state.reservations[1].id))).ok).toBe(true);
    gate.resolve();
    expect((await pending).code).toBe("OPERATION_ABORTED");
    expect(store.getSnapshot().demonstrations[0].caseId).toBe(store.getSnapshot().reservations[1].id);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("persists the whole real-record workflow and atomically approves/applies actual published content", async () => {
    const { storage, store, run } = await storedWorkflow();
    const loaded = createSessionStore(storage);
    expect(loaded.getLoadStatus().kind).toBe("ready");
    const beforeRevision = loaded.getSnapshot().revision;
    const committed = await loaded.dispatch(async state => {
      const approved = approveRun(state, run.id, run.digest);
      expect(approved.result.ok).toBe(true);
      return commitRun(approved.state, run.id, run.digest, "Human");
    });
    expect(committed.code, committed.summary).toBe("RUN_COMMITTED");
    expect(loaded.getSnapshot().revision).toBe(beforeRevision + 1);
    expect(loaded.getSnapshot().reservations[1]).toMatchObject({ handled: true, estimatedArrivalTime: "20:45", shiftHandoff: "Emma Wilson arrives at 20:45.", mealService: "regular_dinner", guestMessageDraft: null });
    const reloaded = createSessionStore(storage);
    expect(reloaded.getLoadStatus().kind).toBe("ready");
    expect(reloaded.getSnapshot()).toEqual(loaded.getSnapshot());
    expect(reloaded.getSnapshot().demonstrations).toEqual(store.getSnapshot().demonstrations);
    expect((await reloaded.dispatch(state => commitRun(state, run.id, run.digest))).code).toBe("RUN_ALREADY_COMMITTED");
  });

  it("retains pending approval and unchanged case if the final commit cannot be saved", async () => {
    const { storage, store, run } = await storedWorkflow();
    expect((await store.dispatch(state => approveRun(state, run.id, run.digest))).ok).toBe(true);
    const approved = store.getSnapshot();
    storage.setItem.mockImplementation(() => { throw new Error("storage full"); });
    expect((await store.dispatch(state => commitRun(state, run.id, run.digest))).code).toBe("PERSISTENCE_FAILED");
    expect(store.getSnapshot()).toBe(approved);
    expect(store.getSnapshot().reservations[1].handled).toBe(false);
    expect(store.getSnapshot().runsById[run.id].approval?.used).toBe(false);
    expect(createSessionStore(storage).getSnapshot().runsById[run.id].status).toBe("approved");
  });

  it("rechecks approval expiry at the storage write after runtime hash verification", async () => {
    const { storage, store, run } = await storedWorkflow();
    expect((await store.dispatch(state => approveRun(state, run.id, run.digest))).ok).toBe(true);
    const approved = store.getSnapshot();
    const expires = Date.parse(approved.runsById[run.id].approval!.expiresAt);
    const writes = storage.setItem.mock.calls.length;
    const clock = vi.spyOn(Date, "now").mockReturnValue(expires - 1);
    try {
      // Runtime completes its async hashes with one millisecond left. The
      // store's subsequent CAS read simulates time spent validating/serializing.
      storage.getItem.mockImplementation(key => { clock.mockReturnValue(expires); return storage.records.get(key) ?? null; });
      expect((await store.dispatch(state => commitRun(state, run.id, run.digest))).code).toBe("APPROVAL_EXPIRED");
      expect(store.getSnapshot()).toBe(approved);
      expect(storage.setItem).toHaveBeenCalledTimes(writes);
    } finally { clock.mockRestore(); }
  });

  it("returns frozen snapshots so callers cannot bypass the transactional save", () => {
    const store = createSessionStore(memoryStorage());
    expect(() => { store.getSnapshot().reservations[0].guestDisplayName = "Unsaved replacement"; }).toThrow();
    expect(store.getSnapshot().reservations[0].guestDisplayName).toBe("Aiko Tanaka");
  });
});

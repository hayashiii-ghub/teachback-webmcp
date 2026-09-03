import { afterEach, describe, expect, it, vi } from "vitest";
import type { Proposal, Result } from "./domain";
import { createSessionStore, SESSION_STORAGE_KEY, type SessionStore } from "./persistence";
import { finishRecording, recordCommand, startRecording } from "./recording";
import { approveRun, commitRun } from "./playbook-runtime";
import { publishDraft, updateDraft } from "./teaching";
import { createCoreTools, registerCoreTools, type ToolStore } from "./webmcp";

function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
}
function tool(tools: ModelContextTool[], name: string) {
  const found = tools.find(candidate => candidate.name === `teachback_${name}`);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}
async function call(tools: ModelContextTool[], name: string, input: Record<string, unknown> = {}, signal?: AbortSignal): Promise<Result<any>> {
  return JSON.parse(await tool(tools, name).execute(input, signal ? { signal } : undefined));
}
async function record(store: SessionStore, caseId = "R-2041", completedAt = "2026-08-31T01:00:30Z") {
  const reservation = store.getSnapshot().reservations.find(candidate => candidate.id === caseId)!;
  expect((await store.dispatch(state => startRecording(state, caseId, { now: "2026-08-31T01:00:00Z" }))).ok).toBe(true);
  expect((await store.dispatch(state => recordCommand(state, caseId, reservation.version, { type: "set_estimated_arrival", input: { date: reservation.requestedArrivalDate!, time: reservation.requestedArrivalTime! } }, { now: "2026-08-31T01:00:10Z" }))).ok).toBe(true);
  const result = await store.dispatch(state => finishRecording(state, { now: completedAt }));
  expect(result.ok).toBe(true);
  return result.data!;
}
function proposal(commandId: string): Proposal {
  return { name: "Recorded arrival", purpose: "Reuse the actual arrival update.", steps: [{ id: "arrival", type: "set_estimated_arrival", input: { date: { kind: "case_field", field: "requestedArrivalDate" }, time: { kind: "case_field", field: "requestedArrivalTime" } }, evidenceCommandIds: [commandId], rationale: "Bind arrival to the next case's requested date and time." }], proposedBoundary: { latestArrivalTime: "22:00" }, unresolvedQuestions: [] };
}
async function draftInput(store: SessionStore) {
  const demo = await record(store);
  return { demonstration_id: demo.id, source_digest: demo.digest, request_id: "draft-1", proposal: proposal(demo.commands[0].id) };
}
afterEach(() => vi.restoreAllMocks());

describe("WebMCP core contracts using the real persisted store", () => {
  it("exposes seven fixed preparation tools, no publication/approval/application/raw operation tool", () => {
    const tools = createCoreTools(createSessionStore(memoryStorage()));
    expect(tools.map(item => item.name)).toEqual(["teachback_get_demonstration", "teachback_create_draft", "teachback_update_draft", "teachback_list_playbooks", "teachback_list_cases", "teachback_prepare_run", "teachback_get_run"]);
    expect(tools.filter(item => item.annotations?.readOnlyHint).map(item => item.name)).toEqual(["teachback_get_demonstration", "teachback_list_playbooks", "teachback_list_cases", "teachback_get_run"]);
    expect(tools.every(item => item.annotations?.untrustedContentHint)).toBe(true);
    function checkObjects(value: unknown) {
      if (!value || typeof value !== "object") return;
      const schema = value as Record<string, unknown>;
      if (schema.type === "object") expect(schema.additionalProperties).toBe(false);
      Object.values(schema).forEach(checkObjects);
    }
    tools.forEach(item => checkObjects(item.inputSchema));
  });

  it("hands preparation to human review and application in the website, not agent continuation", () => {
    const tools = createCoreTools(createSessionStore(memoryStorage()));
    expect(tool(tools, "prepare_run").description).toMatch(/stop.*human.*review and apply in the website/i);
    expect(tool(tools, "get_run").description).toMatch(/read-only/i);
    expect(tool(tools, "get_run").description).toContain("no agent continuation is required");
    expect(tools.every(item => !/asks you to continue|commit only its|teachback_commit_run/i.test(item.description))).toBe(true);
  });

  it("reads the newest actual demonstration with safeguards and no generated proposal", async () => {
    const store = createSessionStore(memoryStorage());
    const older = await record(store);
    const newer = await record(store, "R-2048", "2026-08-31T01:10:30Z");
    const tools = createCoreTools(store);
    const result = await call(tools, "get_demonstration");
    expect(result.code).toBe("DEMONSTRATION_FOUND");
    expect(result.data.demonstrationId).toBe(newer.id);
    expect(result.data.commands[0].input.time).toBe("20:45");
    expect(result.data.fixedSafeguards).toBeDefined();
    expect(result.data.allowedOperations).toBeDefined();
    expect(result.data.proposal).toBeUndefined();
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(16 * 1024);
    expect((await call(tools, "get_demonstration", { demonstration_id: older.id })).data.demonstrationId).toBe(older.id);
  });

  it("persists draft + SHA fingerprint in a single revision and deduplicates after reload", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage);
    const input = await draftInput(store);
    const beforeRevision = store.getSnapshot().revision;
    const created = await call(createCoreTools(store), "create_draft", input);
    expect(created.code).toBe("DRAFT_CREATED");
    expect(store.getSnapshot().revision).toBe(beforeRevision + 1);
    expect(store.getSnapshot().requests["draft-1"].fingerprint).toMatch(/^[a-f\d]{64}$/);
    expect(store.getSnapshot().requests["draft-1"].result.data).not.toHaveProperty("changes");
    expect(store.getSnapshot().requests["draft-1"].result.data).not.toHaveProperty("originalProposal");
    expect(JSON.parse(storage.data.get(SESSION_STORAGE_KEY)!).drafts[0].id).toBe(created.data.id);
    const reopened = createSessionStore(storage);
    expect(reopened.getLoadStatus().kind).toBe("ready");
    const writes = storage.setItem.mock.calls.length;
    const retried = await call(createCoreTools(reopened), "create_draft", input);
    expect(retried).toEqual(created);
    expect(reopened.getSnapshot().drafts).toHaveLength(1);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    expect((await call(createCoreTools(reopened), "create_draft", { ...input, proposal: { ...input.proposal, name: "Different content" } })).code).toBe("REQUEST_CONFLICT");
  });

  it("keeps repeated large draft-update receipts compact instead of copying cumulative history", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage); const tools = createCoreTools(store);
    const input = await draftInput(store);
    const largeProposal = {
      ...input.proposal,
      purpose: "P".repeat(500),
      unresolvedQuestions: Array.from({ length: 10 }, (_, index) => `${index}-${"Q".repeat(490)}`),
    };
    const created = await call(tools, "create_draft", { ...input, proposal: largeProposal });
    expect(created.code).toBe("DRAFT_CREATED");
    let revision = created.data.revision as number;
    for (let index = 0; index < 50; index += 1) {
      const updated = await call(tools, "update_draft", {
        draft_id: created.data.id,
        expected_revision: revision,
        request_id: `large-update-${index}`,
        proposal: { ...largeProposal, name: `Recorded arrival ${index}` },
      });
      expect(updated.code).toBe("DRAFT_UPDATED");
      expect(updated.data).not.toHaveProperty("changes");
      expect(updated.data).not.toHaveProperty("originalProposal");
      revision = updated.data.revision;
    }
    expect(store.getSnapshot().drafts[0].changes).toHaveLength(50);
    expect(new TextEncoder().encode(storage.data.get(SESSION_STORAGE_KEY)!).byteLength).toBeLessThan(2_000_000);
    const retried = await call(createCoreTools(createSessionStore(storage)), "update_draft", {
      draft_id: created.data.id,
      expected_revision: revision - 1,
      request_id: "large-update-49",
      proposal: { ...largeProposal, name: "Recorded arrival 49" },
    });
    expect(retried.data).not.toHaveProperty("changes");
    expect(retried.data.revision).toBe(revision);
  });

  it("reports the returned draft ID on creation, update, and an older idempotent retry", async () => {
    const store = createSessionStore(memoryStorage());
    const input = await draftInput(store);
    const onCall = vi.fn(); const tools = createCoreTools(store, onCall);
    const first = await call(tools, "create_draft", input);
    const second = await call(tools, "create_draft", { ...input, request_id: "draft-2", proposal: { ...input.proposal, name: "Second draft" } });
    expect(onCall).toHaveBeenLastCalledWith(expect.objectContaining({ name: "teachback_create_draft", ok: true, draftId: second.data.id }));
    expect((await call(tools, "create_draft", input)).data.id).toBe(first.data.id);
    expect(onCall).toHaveBeenLastCalledWith(expect.objectContaining({ name: "teachback_create_draft", ok: true, draftId: first.data.id }));
    expect(store.getSnapshot().audit.find(event => event.draftId)?.draftId).toBe(second.data.id);
    await call(tools, "update_draft", { draft_id: first.data.id, expected_revision: 1, request_id: "update-first", proposal: { ...input.proposal, name: "Revised first draft" } });
    expect(onCall).toHaveBeenLastCalledWith(expect.objectContaining({ name: "teachback_update_draft", ok: true, draftId: first.data.id }));
    await call(tools, "update_draft", { draft_id: first.data.id, expected_revision: 1, request_id: "stale-first", proposal: input.proposal });
    expect(onCall.mock.lastCall![0]).toMatchObject({ code: "DRAFT_CONFLICT", ok: false });
    expect(onCall.mock.lastCall![0]).not.toHaveProperty("draftId");
    await call(tools, "list_cases");
    expect(onCall.mock.lastCall![0]).not.toHaveProperty("draftId");
  });

  it("does not cache or claim success when persistence fails", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage);
    const input = await draftInput(store);
    storage.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });
    const tools = createCoreTools(store);
    expect((await call(tools, "create_draft", input)).code).toBe("PERSISTENCE_FAILED");
    expect(store.getSnapshot().drafts).toHaveLength(0);
    expect(store.getSnapshot().requests["draft-1"]).toBeUndefined();
    expect((await call(tools, "create_draft", input)).code).toBe("DRAFT_CREATED");
  });

  it.each([
    ["missing-source", "DEMONSTRATION_NOT_FOUND"],
    ["changed-source", "SOURCE_CHANGED"],
    ["unknown-evidence", "INVALID_DRAFT"],
  ] as const)("preserves %s refusal through the persisted receipt and reload", async (kind, expectedCode) => {
    const storage = memoryStorage(); const store = createSessionStore(storage);
    const valid = await draftInput(store);
    const input = {
      ...valid, request_id: `refused-${kind}`,
      ...(kind === "missing-source" ? { demonstration_id: "missing-recording" } : {}),
      ...(kind === "changed-source" ? { source_digest: "f".repeat(64) } : {}),
      ...(kind === "unknown-evidence" ? { proposal: proposal("not-a-recorded-command") } : {}),
    };
    const before = store.getSnapshot();
    const refused = await call(createCoreTools(store), "create_draft", input);
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe(expectedCode);
    expect(Object.hasOwn(refused, "data")).toBe(false);
    expect(store.getSnapshot().requests[input.request_id].result).toEqual(refused);
    expect(store.getSnapshot().drafts).toEqual(before.drafts);
    expect(store.getSnapshot().reservations).toEqual(before.reservations);
    const reopened = createSessionStore(storage);
    expect(reopened.getLoadStatus().kind).toBe("ready");
    const writes = storage.setItem.mock.calls.length;
    expect(await call(createCoreTools(reopened), "create_draft", input)).toEqual(refused);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
  });

  it("persists a draft-update validation refusal without replacing the current human-review revision", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage); const tools = createCoreTools(store);
    const created = await call(tools, "create_draft", await draftInput(store));
    const input = { draft_id: created.data.id, expected_revision: 1, request_id: "bad-evidence-update", proposal: proposal("not-a-recorded-command") };
    const refused = await call(tools, "update_draft", input);
    expect(refused.code).toBe("INVALID_DRAFT");
    expect(store.getSnapshot().drafts[0].revision).toBe(1);
    expect(store.getSnapshot().drafts[0].proposal).toEqual(created.data.proposal);
    const reopened = createSessionStore(storage);
    expect(reopened.getLoadStatus().kind).toBe("ready");
    expect(await call(createCoreTools(reopened), "update_draft", input)).toEqual(refused);
  });

  it("deduplicates updates without overwriting a newer human revision", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage); const tools = createCoreTools(store);
    const created = await call(tools, "create_draft", await draftInput(store));
    const input = { draft_id: created.data.id, expected_revision: 1, request_id: "update-1", proposal: { ...created.data.proposal, name: "Reviewed name" } };
    const updated = await call(tools, "update_draft", input);
    expect(updated.code).toBe("DRAFT_UPDATED"); expect(updated.data.revision).toBe(2);
    const reopened = createSessionStore(storage);
    expect(await call(createCoreTools(reopened), "update_draft", input)).toEqual(updated);
    const stale = await call(createCoreTools(reopened), "update_draft", { ...input, request_id: "update-stale", proposal: { ...input.proposal, name: "Overwrite old revision" } });
    expect(stale.code).toBe("DRAFT_CONFLICT");
    expect(reopened.getSnapshot().drafts[0].proposal.name).toBe("Reviewed name");
  });

  it("lets an agent recover from a human edit using the conflict receipt and a new request ID", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage); const tools = createCoreTools(store);
    const created = await call(tools, "create_draft", await draftInput(store));
    const humanProposal = { ...created.data.proposal, proposedBoundary: { latestArrivalTime: "21:55" } };
    expect((await store.dispatch(state => updateDraft(state, created.data.id, 1, humanProposal, "Human"))).ok).toBe(true);
    const staleInput = { draft_id: created.data.id, expected_revision: 1, request_id: "stale-agent-edit", proposal: { ...created.data.proposal, name: "Agent clarification" } };
    const conflict = await call(tools, "update_draft", staleInput);
    expect(conflict).toMatchObject({ ok: false, code: "DRAFT_CONFLICT", data: { id: created.data.id, revision: 2, proposal: humanProposal } });
    expect(store.getSnapshot().drafts[0].proposal).toEqual(humanProposal);
    const reopened = createSessionStore(storage); const resumedTools = createCoreTools(reopened);
    expect(reopened.getLoadStatus().kind).toBe("ready");
    expect(await call(resumedTools, "update_draft", staleInput)).toEqual(conflict);
    const retry = { draft_id: conflict.data.id, expected_revision: conflict.data.revision, request_id: "reconciled-agent-edit", proposal: { ...conflict.data.proposal, name: "Agent clarification" } };
    expect((await call(resumedTools, "update_draft", { ...retry, request_id: staleInput.request_id })).code).toBe("REQUEST_CONFLICT");
    const updated = await call(resumedTools, "update_draft", retry);
    expect(updated).toMatchObject({ ok: true, code: "DRAFT_UPDATED", data: { revision: 3, proposal: { name: "Agent clarification", proposedBoundary: { latestArrivalTime: "21:55" } } } });
    expect(updated.data).not.toHaveProperty("changes");
    expect(updated.data).not.toHaveProperty("originalProposal");
    expect(reopened.getSnapshot().drafts[0].changes.map(change => change.actor)).toEqual(["Human", "Agent"]);
    expect(reopened.getSnapshot().playbooks).toHaveLength(0);
    expect(resumedTools).toHaveLength(7);
    expect(tool(resumedTools, "update_draft").description).toMatch(/DRAFT_CONFLICT.*data.*new request_id/);
  });

  it("clones input before asynchronous hashing and rejects reserved request IDs", async () => {
    const store = createSessionStore(memoryStorage()); const input = await draftInput(store);
    const tools = createCoreTools(store);
    for (const request_id of ["__proto__", "constructor", "prototype", " "]) expect((await call(tools, "create_draft", { ...input, request_id })).code).toBe("INVALID_INPUT");
    const pending = call(tools, "create_draft", input);
    input.proposal.name = "Mutated during asynchronous work";
    expect((await pending).data.proposal.name).toBe("Recorded arrival");
  });

  it("prepares exact changes without changing reservations or granting approval, including after reload", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage); const tools = createCoreTools(store);
    const input = await draftInput(store);
    const created = await call(tools, "create_draft", input);
    const published = await store.dispatch(state => publishDraft(state, created.data.id, created.data.revision, true));
    expect(published.ok).toBe(true);
    const prepareInput = { case_id: "R-2048", expected_case_version: 1, playbook_id: published.data!.id, playbook_version: published.data!.version, request_id: "run-1" };
    const before = store.getSnapshot().reservations;
    const prepared = await call(tools, "prepare_run", prepareInput);
    expect(prepared.code).toBe("RUN_PREPARED");
    expect(prepared.data.status).toBe("awaiting_review");
    expect(prepared.data.approval).toBeNull();
    expect(prepared.data.after.estimatedArrivalTime).toBe("20:45");
    expect(store.getSnapshot().reservations).toEqual(before);
    expect(JSON.parse(storage.data.get(SESSION_STORAGE_KEY)!).reservations).toEqual(before);
    expect((await call(tools, "list_cases", { status: "awaiting_review" })).data.cases[0].id).toBe("R-2048");
    expect((await call(tools, "get_run", { run_id: prepared.data.id })).data).toEqual(prepared.data);
    const reopened = createSessionStore(storage);
    expect(reopened.getLoadStatus().kind).toBe("ready");
    const writes = storage.setItem.mock.calls.length;
    expect(await call(createCoreTools(reopened), "prepare_run", prepareInput)).toEqual(prepared);
    expect(reopened.getSnapshot().reservations).toEqual(before);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
  });

  it("cannot apply through any registered tool even after human approval, but reads the human-applied result", async () => {
    const now = Date.parse("2026-08-31T08:00:00.000Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const storage = memoryStorage(); const store = createSessionStore(storage); const tools = createCoreTools(store);
    const created = await call(tools, "create_draft", await draftInput(store));
    const published = await store.dispatch(state => publishDraft(state, created.data.id, created.data.revision, true));
    expect(published.ok).toBe(true);
    const prepared = await call(tools, "prepare_run", { case_id: "R-2048", expected_case_version: 1, playbook_id: published.data!.id, playbook_version: published.data!.version, request_id: "run-1" });
    expect(prepared.code).toBe("RUN_PREPARED");
    expect((await store.dispatch(state => approveRun(state, prepared.data.id, prepared.data.digest))).ok).toBe(true);
    const approved = store.getSnapshot();
    const commitInput = { run_id: prepared.data.id, expected_digest: prepared.data.digest };
    await expect(call(tools, "commit_run", commitInput)).rejects.toThrow("Missing tool commit_run");
    for (const entry of tools) {
      const result = JSON.parse(await entry.execute({ ...commitInput, actor: "Human", action: "commit" }));
      expect(result.code).toBe("INVALID_INPUT");
    }
    expect(store.getSnapshot()).toEqual(approved);
    expect((await call(tools, "list_cases", { status: "approved" })).data.cases[0].id).toBe("R-2048");
    expect((await call(tools, "get_run", { run_id: prepared.data.id })).data.status).toBe("approved");
    expect(store.getSnapshot()).toEqual(approved);

    clock.mockReturnValue(Date.parse(approved.runsById[prepared.data.id].approval!.expiresAt) + 1);
    const expiredCases = await call(tools, "list_cases", { status: "approval_expired" });
    expect(expiredCases.data.cases).toEqual([
      expect.objectContaining({ id: "R-2048", workflow_status: "approval_expired", active_run_id: prepared.data.id }),
    ]);
    expect((await call(tools, "list_cases", { status: "awaiting_review" })).data.cases).toEqual([]);
    clock.mockReturnValue(now);

    const invalid = structuredClone(approved);
    invalid.runsById[prepared.data.id].approval!.approvedAt = "2026-08-31T07:59:00.000Z";
    const invalidTools = createCoreTools({
      getSnapshot: () => invalid,
      dispatch: store.dispatch,
    });
    expect((await call(invalidTools, "list_cases", { status: "approval_invalid" })).data.cases).toEqual([
      expect.objectContaining({ id: "R-2048", workflow_status: "approval_invalid", active_run_id: prepared.data.id }),
    ]);
    expect((await call(invalidTools, "list_cases", { status: "approved" })).data.cases).toEqual([]);
    expect((await call(invalidTools, "get_run", { run_id: prepared.data.id })).code).toBe("RUN_NOT_APPROVED");

    // The website invokes the internal runtime after the person's action. It is
    // intentionally not reachable through the WebMCP adapter.
    const committed = await store.dispatch(state => commitRun(state, prepared.data.id, prepared.data.digest, "Human"));
    expect(committed.code).toBe("RUN_COMMITTED");
    const writes = storage.setItem.mock.calls.length;
    const read = await call(tools, "get_run", { run_id: prepared.data.id });
    expect(read.data.status).toBe("committed");
    expect(read.data.approval.used).toBe(true);
    expect(store.getSnapshot().reservations.find(row => row.id === "R-2048")).toEqual(prepared.data.after);
    expect(store.getSnapshot().audit.find(event => event.runId === prepared.data.id && event.eventType === "run_committed")).toMatchObject({ actor: "Human", eventType: "run_committed" });
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
  });

  it("rejects out-of-bound preparation without reservation changes and persists the refusal idempotently", async () => {
    const storage = memoryStorage(); const store = createSessionStore(storage); const tools = createCoreTools(store);
    const created = await call(tools, "create_draft", await draftInput(store));
    const published = await store.dispatch(state => publishDraft(state, created.data.id, created.data.revision, true));
    expect(published.ok).toBe(true);
    const rejectedInput = { case_id: "R-2060", expected_case_version: 1, playbook_id: published.data!.id, playbook_version: published.data!.version, request_id: "out-of-bound" };
    const before = store.getSnapshot().reservations;
    const rejected = await call(tools, "prepare_run", rejectedInput);
    expect(rejected.code).toBe("PLAYBOOK_NOT_APPLICABLE");
    expect(store.getSnapshot().reservations).toEqual(before);
    expect(Object.keys(store.getSnapshot().runsById)).toHaveLength(0);
    expect(store.getSnapshot().audit.find(event => event.eventType === "run_policy_refused")).toMatchObject({ actor: "Website", caseId: "R-2060" });
    const reopened = createSessionStore(storage);
    expect(reopened.getLoadStatus().kind).toBe("ready");
    const writes = storage.setItem.mock.calls.length;
    expect(await call(createCoreTools(reopened), "prepare_run", rejectedInput)).toEqual(rejected);
    expect(reopened.getSnapshot().reservations).toEqual(before);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
  });

  it("validates strict runtime input, nested proposals, cursor and page sizes", async () => {
    const store = createSessionStore(memoryStorage()); const tools = createCoreTools(store);
    for (const input of [{ limit: 11 }, { limit: 0 }, { cursor: "9007199254740992" }, { cursor: "-1" }, { cursor: "01" }, { cursor: "1.5" }, { extra: true }, Object.create({ limit: 1 })]) expect((await call(tools, "list_cases", input)).code).toBe("INVALID_INPUT");
    const first = await call(tools, "list_cases", { limit: 3 });
    expect(first.data.cases).toHaveLength(3); expect(first.data.next_cursor).toBe("3");
    const second = await call(tools, "list_cases", { cursor: first.data.next_cursor, limit: 3 });
    expect(second.data.cases).toHaveLength(3); expect(second.data.cases[0].id).not.toBe(first.data.cases[0].id);
    const accessor: any = {}; Object.defineProperty(accessor, "limit", { enumerable: true, get: () => { throw new Error("Do not invoke"); } });
    expect((await call(tools, "list_cases", accessor)).code).toBe("INVALID_INPUT");
    const input = await draftInput(store);
    expect((await call(tools, "create_draft", { ...input, proposal: { ...input.proposal, approved: true } })).code).toBe("INVALID_DRAFT");
    expect((await call(tools, "create_draft", { ...input, actor: "Human" })).code).toBe("INVALID_INPUT");
  });

  it("rejects altered demonstration data and reports abort without writing", async () => {
    const store = createSessionStore(memoryStorage()); const input = await draftInput(store);
    const altered = structuredClone(store.getSnapshot()); altered.demonstrations[0].before.guestDisplayName = "Changed source";
    const alteredStore: ToolStore = { getSnapshot: () => altered, dispatch: store.dispatch };
    expect((await call(createCoreTools(alteredStore), "get_demonstration")).code).toBe("SOURCE_CHANGED");
    const controller = new AbortController();
    const pending = call(createCoreTools(store), "create_draft", input, controller.signal);
    controller.abort();
    expect((await pending).code).toBe("OPERATION_ABORTED");
    expect(store.getSnapshot().drafts).toHaveLength(0);
  });

  it("registration lifetime cancellation also aborts an in-flight write", async () => {
    const store = createSessionStore(memoryStorage()); const input = await draftInput(store);
    const lifetime = new AbortController(); const caller = new AbortController();
    const tools = createCoreTools(store, undefined, lifetime.signal);
    const pending = call(tools, "create_draft", input, caller.signal);
    lifetime.abort();
    expect((await pending).code).toBe("OPERATION_ABORTED");
    expect(store.getSnapshot().drafts).toHaveLength(0);
    expect(store.getSnapshot().requests["draft-1"]).toBeUndefined();
  });

  it("does not turn a successful operation into failure if the call indicator throws", async () => {
    const store = createSessionStore(memoryStorage()); const input = await draftInput(store);
    const tools = createCoreTools(store, () => { throw new Error("UI callback failed"); });
    expect((await call(tools, "create_draft", input)).code).toBe("DRAFT_CREATED");
    expect(store.getSnapshot().drafts).toHaveLength(1);
  });
});

describe("WebMCP registration lifecycle (API adapter tests, not real-client proof)", () => {
  it("reports unsupported API and unregisters all tools on cleanup", async () => {
    const store = createSessionStore(memoryStorage()); const status = vi.fn();
    registerCoreTools(undefined, store, status, vi.fn());
    expect(status).toHaveBeenLastCalledWith("unavailable");
    const registered = new Map<string, ModelContextTool>();
    const model: ModelContext = { registerTool: vi.fn(async (entry, options) => { registered.set(entry.name, entry); options?.signal?.addEventListener("abort", () => registered.delete(entry.name), { once: true }); }) };
    const cleanup = registerCoreTools(model, store, status, vi.fn());
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith("registered"));
    expect(registered.size).toBe(7);
    expect(registered.has("teachback_commit_run")).toBe(false);
    const oldTool = registered.get("teachback_list_cases")!;
    cleanup(); expect(registered.size).toBe(0);
    expect(JSON.parse(await oldTool.execute({})).code).toBe("OPERATION_ABORTED");
  });

  it("rolls back partial registration and does not register after immediate disposal", async () => {
    const store = createSessionStore(memoryStorage()); const status = vi.fn();
    const registered = new Set<string>();
    const model: ModelContext = { registerTool: vi.fn(async (entry, options) => { if (entry.name === "teachback_update_draft") throw new Error("API rejected schema"); registered.add(entry.name); options?.signal?.addEventListener("abort", () => registered.delete(entry.name), { once: true }); }) };
    registerCoreTools(model, store, status, vi.fn());
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith("failed"));
    expect(registered.size).toBe(0);
    expect(status.mock.calls.flat()).not.toContain("registered");
    const fresh: ModelContext = { registerTool: vi.fn(async () => {}) };
    const cleanup = registerCoreTools(fresh, store, vi.fn(), vi.fn()); cleanup();
    await Promise.resolve(); await Promise.resolve();
    expect(fresh.registerTool).not.toHaveBeenCalled();
  });

  it("replaces a previous mount without stale cleanup removing the new registration", async () => {
    const store = createSessionStore(memoryStorage()); const status = vi.fn();
    const registrations: AbortSignal[] = [];
    const model: ModelContext = { registerTool: vi.fn(async (_entry, options) => { registrations.push(options!.signal!); }) };
    const oldCleanup = registerCoreTools(model, store, status, vi.fn());
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith("registered"));
    const nextCleanup = registerCoreTools(model, store, status, vi.fn());
    await vi.waitFor(() => expect(model.registerTool).toHaveBeenCalledTimes(14));
    expect(registrations.slice(0, 7).every(signal => signal.aborted)).toBe(true);
    oldCleanup(); expect(registrations.slice(7).some(signal => signal.aborted)).toBe(false);
    nextCleanup(); expect(registrations.every(signal => signal.aborted)).toBe(true);
  });
});

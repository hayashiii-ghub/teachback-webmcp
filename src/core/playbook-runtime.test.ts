import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { digest } from "./common";
import type { PlaybookStep, PreparedRun, PublishedPlaybook, Reservation, SessionState, Transition } from "./domain";
import { approveRun, commitRun, discardRun, getRun, prepareRun } from "./playbook-runtime";
import { publishedContent } from "./teaching";

const NOW = "2026-08-31T08:00:00.000Z";
const opts = { now: NOW };

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "case-new-791", guestDisplayName: "Lucia Vega", version: 1,
    status: "confirmed", arrivalDate: "2026-08-31", plannedArrivalTime: "17:25",
    requestedArrivalDate: "2026-08-31", requestedArrivalTime: "21:15",
    estimatedArrivalDate: "2026-08-31", estimatedArrivalTime: "17:25",
    mealPlan: "dinner_included", mealService: "regular_dinner",
    hasNewDietaryRequest: false, requestsTaxi: false, requestsCompensation: false,
    requestsCancellation: false, requestsPaymentChange: false,
    guestMessageDraft: null, shiftHandoff: null, handled: false, ...overrides,
  };
}

function steps(): PlaybookStep[] {
  return [
    {
      id: "step-arrival", type: "set_estimated_arrival", evidenceCommandIds: ["record-1"], rationale: "Use the next guest's requested arrival.",
      input: { date: { kind: "case_field", field: "requestedArrivalDate" }, time: { kind: "case_field", field: "requestedArrivalTime" } },
    },
    {
      id: "step-meal", type: "set_meal_service", evidenceCommandIds: ["record-2"], rationale: "Use the recorded meal change.",
      input: { kind: "literal", value: "late_meal_box" },
    },
    {
      id: "step-message", type: "draft_guest_message", evidenceCommandIds: ["record-3"], rationale: "Substitute only the guest name and requested time.",
      input: { template: [{ kind: "literal", value: "Dear " }, { kind: "case_field", field: "guestDisplayName" }, { kind: "literal", value: ", we expect you at " }, { kind: "case_field", field: "requestedArrivalTime" }, { kind: "literal", value: ". Your meal box will be at reception." }] },
    },
    {
      id: "step-handoff", type: "add_shift_handoff", evidenceCommandIds: ["record-4"], rationale: "The next shift needs this guest's details.",
      input: { template: [{ kind: "case_field", field: "guestDisplayName" }, { kind: "literal", value: " arrives at " }, { kind: "case_field", field: "requestedArrivalTime" }, { kind: "literal", value: ". Please welcome them." }] },
    },
  ];
}

async function fixture(options: { reservation?: Partial<Reservation>; steps?: PlaybookStep[]; limit?: string } = {}) {
  const published: PublishedPlaybook = {
    id: "book-created-after-install-932", version: 1, contentDigest: "",
    sourceDemonstrationId: "human-record-created-now", sourceDigest: "source-sha256",
    name: "Reception evening response", purpose: "Use this recorded response for another guest.",
    steps: options.steps ?? steps(), boundary: { latestArrivalTime: options.limit ?? "22:00" },
    publishedAt: "2026-08-31T07:30:00.000Z", publishedBy: "Human",
  };
  published.contentDigest = await digest(publishedContent(published));
  const target = reservation(options.reservation);
  const state: SessionState = {
    schemaVersion: 1, revision: 0, businessDate: "2026-08-31", timeZone: "Asia/Tokyo",
    reservations: [target, reservation({ id: "unselected-target", guestDisplayName: "Mateo Ortiz", requestedArrivalTime: "20:05" })],
    recordingId: null, demonstrations: [], drafts: [], playbooks: [published],
    runsById: {}, activeRunIdByCaseId: {}, audit: [], requests: {},
  };
  return { state, published, target };
}

function requireRun(transition: Transition<PreparedRun>): PreparedRun {
  expect(transition.result.ok, transition.result.summary).toBe(true);
  expect(transition.result.data).toBeDefined();
  return transition.result.data!;
}

async function prepared(options: Parameters<typeof fixture>[0] = {}) {
  const initial = await fixture(options);
  const transition = await prepareRun(initial.state, initial.target.id, initial.target.version, initial.published.id, initial.published.version, "Agent", opts);
  return { ...initial, state: transition.state, run: requireRun(transition) };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("recorded-playbook runtime", () => {
  it("prepares actual published steps for arbitrary IDs with target values, without changing a reservation", async () => {
    const initial = await fixture();
    const transition = await prepareRun(initial.state, initial.target.id, 1, initial.published.id, 1, "Agent", opts);
    const run = requireRun(transition);
    expect(initial.state.reservations).toEqual(transition.state.reservations);
    expect(run.before).toEqual(initial.target);
    expect(run.after).toMatchObject({ guestDisplayName: "Lucia Vega", estimatedArrivalTime: "21:15", mealService: "late_meal_box", handled: true });
    expect(run.after.guestMessageDraft).toBe("Dear Lucia Vega, we expect you at 21:15. Your meal box will be at reception.");
    expect(run.after.shiftHandoff).toBe("Lucia Vega arrives at 21:15. Please welcome them.");
    expect(run.exactDiff.map(change => change.field)).toEqual(["estimatedArrivalTime", "mealService", "guestMessageDraft", "shiftHandoff"]);
    expect(run.status).toBe("awaiting_review");
    expect(run.approval).toBeNull();
    expect(run.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(transition.state.activeRunIdByCaseId[initial.target.id]).toBe(run.id);
    expect(transition.state.audit[0]).toMatchObject({ actor: "Agent", eventType: "run_prepared", caseId: initial.target.id, runId: run.id });
  });

  it("does not add meal or message actions to an arrival-and-handoff playbook", async () => {
    const { run } = await prepared({ steps: [steps()[0], steps()[3]], reservation: { mealPlan: "room_only", mealService: "none" } });
    expect(run.commands.map(command => command.type)).toEqual(["set_estimated_arrival", "add_shift_handoff"]);
    expect(run.exactDiff.map(change => change.field)).toEqual(["estimatedArrivalTime", "shiftHandoff"]);
    expect(run.after.mealService).toBe("none");
    expect(run.after.guestMessageDraft).toBeNull();
  });

  it("produces no preview if the published action would change nothing", async () => {
    const { state, published, target } = await fixture({ steps: [steps()[0]], reservation: { estimatedArrivalTime: "21:15" } });
    const result = await prepareRun(state, target.id, 1, published.id, 1, "Agent", opts);
    expect(result.result.code).toBe("NO_CHANGES");
    expect(result.state.runsById).toEqual({});
    expect(result.state.reservations).toEqual(state.reservations);
  });

  it("requires an exact published version and rejects stale case versions", async () => {
    const { state, published, target } = await fixture();
    expect((await prepareRun(state, target.id, 2, published.id, 1, "Agent", opts)).result.code).toBe("CASE_STATE_CHANGED");
    expect((await prepareRun(state, target.id, 1, published.id, 2, "Agent", opts)).result.code).toBe("PLAYBOOK_NOT_PUBLISHED");
    expect((await prepareRun(state, "not-a-case", 1, published.id, 1, "Agent", opts)).result.ok).toBe(false);
  });

  it("rejects an altered publication or ambiguous case identity before saving a preview", async () => {
    const { state, published, target } = await fixture();
    const altered = structuredClone(state);
    altered.playbooks[0].purpose = "Changed after publication without review";
    expect((await prepareRun(altered, target.id, 1, published.id, 1, "Agent", opts)).result.code).toBe("DIGEST_MISMATCH");
    const duplicatedCase = { ...state, reservations: [...state.reservations, { ...target }] };
    expect((await prepareRun(duplicatedCase, target.id, 1, published.id, 1, "Agent", opts)).result.ok).toBe(false);
  });

  it.each([
    ["22:00", true], ["22:01", false], ["23:45", false], ["bad-time", false], [null, false],
  ] as const)("applies the fixed time boundary at %s", async (requestedArrivalTime, accepted) => {
    const { state, target, published } = await fixture({ reservation: { requestedArrivalTime } });
    const transition = await prepareRun(state, target.id, 1, published.id, 1, "Agent", opts);
    expect(transition.result.ok).toBe(accepted);
    if (!accepted) expect(transition.state.reservations).toEqual(state.reservations);
  });

  it.each(["21:09", "21:10", "21:11"])("uses a person's narrower 21:10 boundary for %s", async requestedArrivalTime => {
    const { state, target, published } = await fixture({ limit: "21:10", reservation: { requestedArrivalTime } });
    expect((await prepareRun(state, target.id, 1, published.id, 1, "Agent", opts)).result.ok).toBe(requestedArrivalTime !== "21:11");
  });

  it.each([
    { hasNewDietaryRequest: true }, { requestsTaxi: true }, { requestsCompensation: true },
    { requestsCancellation: true }, { requestsPaymentChange: true }, { requestsTaxi: null },
    { requestsCancellation: null }, { requestsPaymentChange: null }, { requestedArrivalDate: null },
    { requestedArrivalDate: "2026-09-01", requestedArrivalTime: "00:20" }, { status: "checked_in" },
    { status: "cancelled" }, { handled: true }, { mealPlan: "room_only", mealService: "none" },
    { guestMessageDraft: "A person has already written this." }, { shiftHandoff: "Existing handoff." },
  ] as Partial<Reservation>[])("rejects unsafe or already-handled reservations: %j", async override => {
    const { state, target, published } = await fixture({ reservation: override });
    const transition = await prepareRun(state, target.id, 1, published.id, 1, "Agent", opts);
    expect(transition.result.code).toBe("PLAYBOOK_NOT_APPLICABLE");
    expect(transition.result.issues?.length).toBeGreaterThan(0);
    expect(transition.state.reservations).toEqual(state.reservations);
  });

  it("does not overwrite unrelated existing text when the playbook does not touch that field", async () => {
    const { run } = await prepared({ steps: [steps()[0]], reservation: { guestMessageDraft: "Keep this human note." } });
    expect(run.after.guestMessageDraft).toBe("Keep this human note.");
    expect(run.exactDiff.map(change => change.field)).toEqual(["estimatedArrivalTime"]);
  });

  it("will not prepare or commit a case currently being recorded", async () => {
    const { state, target, published, run } = await prepared();
    const recording = { id: "active-record", caseId: target.id, status: "recording" as const, before: target, after: target, commands: [], startedAt: NOW, completedAt: null, digest: null, recordedBy: "Human" as const };
    const busy = { ...state, recordingId: recording.id, demonstrations: [recording] };
    expect((await prepareRun(busy, target.id, 1, published.id, 1, "Agent", opts)).result.code).toBe("RECORDING_IN_PROGRESS");
    const approved = approveRun(state, run.id, run.digest, opts);
    const busyAfterApproval = { ...approved.state, recordingId: recording.id, demonstrations: [recording] };
    expect((await commitRun(busyAfterApproval, run.id, run.digest, "Agent", opts)).result.code).toBe("RECORDING_IN_PROGRESS");
  });

  it("blocks committing before approval, then applies once after a human approves", async () => {
    const { state, run } = await prepared();
    expect((await commitRun(state, run.id, run.digest, "Agent", opts)).result.code).toBe("RUN_NOT_APPROVED");
    const approved = approveRun(state, run.id, run.digest, opts);
    const approvalRun = requireRun(approved);
    expect(approvalRun.approval).toMatchObject({ runId: run.id, approvedDigest: run.digest, approvedAt: NOW, expiresAt: "2026-08-31T08:05:00.000Z", used: false });
    expect(approved.state.audit[0].actor).toBe("Human");
    const committed = await commitRun(approved.state, run.id, run.digest, "Agent", opts);
    expect(requireRun(committed)).toMatchObject({ status: "committed", committedAt: NOW, approval: { used: true } });
    expect(committed.state.reservations.find(row => row.id === run.caseId)).toEqual(run.after);
    expect(committed.state.audit[0]).toMatchObject({ actor: "Agent", eventType: "run_committed" });
    const repeated = await commitRun(committed.state, run.id, run.digest, "Agent", opts);
    expect(repeated.result.code).toBe("RUN_ALREADY_COMMITTED");
    expect(repeated.state.reservations).toEqual(committed.state.reservations);
    expect(committed.state.demonstrations).toEqual(state.demonstrations);
  });

  it("keeps approvals scoped to explicit run IDs instead of the selected or most recently prepared case", async () => {
    const { state, run, published } = await prepared();
    const firstApproved = approveRun(state, run.id, run.digest, opts);
    const next = await prepareRun(firstApproved.state, "unselected-target", 1, published.id, 1, "Agent", opts);
    const secondRun = requireRun(next);
    const committed = await commitRun(next.state, run.id, run.digest, "Agent", opts);
    expect(committed.result.code).toBe("RUN_COMMITTED");
    expect(committed.state.reservations.find(row => row.id === "unselected-target")?.handled).toBe(false);
    expect(committed.state.runsById[secondRun.id].status).toBe("awaiting_review");
  });

  it("retains previous runs but invalidates their approvals when preparing the same case again", async () => {
    const { state, run, published } = await prepared();
    const approved = approveRun(state, run.id, run.digest, opts);
    const repeated = await prepareRun(approved.state, run.caseId, 1, published.id, 1, "Agent", opts);
    const latest = requireRun(repeated);
    expect(latest.id).not.toBe(run.id);
    expect(repeated.state.runsById[run.id]).toMatchObject({ status: "stale", approval: null });
    expect((await commitRun(repeated.state, run.id, run.digest, "Agent", opts)).result.ok).toBe(false);
  });

  it("does not silently switch a run to a newly published version", async () => {
    const { state, run, published } = await prepared();
    const nextVersion = { ...published, version: 2, name: "A second revision", steps: [steps()[0]], contentDigest: "" };
    nextVersion.contentDigest = await digest(publishedContent(nextVersion));
    const withNextVersion = { ...state, playbooks: [...state.playbooks, nextVersion] };
    const approved = approveRun(withNextVersion, run.id, run.digest, opts);
    const committed = await commitRun(approved.state, run.id, run.digest, "Agent", opts);
    expect(requireRun(committed).commands).toHaveLength(4);
    expect(committed.state.reservations[0].mealService).toBe("late_meal_box");
  });

  it.each(["preview", "commands", "diff", "published", "approvedDigest", "runId"] as const)("rejects tampered %s data without applying any change", async kind => {
    const { state, run } = await prepared();
    const approved = approveRun(state, run.id, run.digest, opts);
    const tampered = structuredClone(approved.state);
    const storedRun = tampered.runsById[run.id];
    if (kind === "preview") storedRun.after.guestMessageDraft = "Unapproved message";
    if (kind === "commands") storedRun.commands = [{ type: "draft_guest_message", input: { text: "Unapproved message" } }];
    if (kind === "diff") storedRun.exactDiff = [];
    if (kind === "published") tampered.playbooks[0].name = "Modified after human publication";
    if (kind === "approvedDigest") storedRun.approval!.approvedDigest = "wrong";
    if (kind === "runId") storedRun.approval!.runId = "another-run";
    const committed = await commitRun(tampered, run.id, run.digest, "Agent", opts);
    expect(committed.result.code).toBe("DIGEST_MISMATCH");
    expect(committed.state.reservations).toEqual(state.reservations);
  });

  it("rejects mismatched review input and changed case state even without a version increment", async () => {
    const { state, run } = await prepared();
    expect(approveRun(state, run.id, "not-the-visible-preview", opts).result.code).toBe("DIGEST_MISMATCH");
    const approved = approveRun(state, run.id, run.digest, opts);
    const changed = structuredClone(approved.state);
    changed.reservations[0].requestsCancellation = true;
    expect(approveRun(changed, run.id, run.digest, opts).result.code).toBe("CASE_STATE_CHANGED");
    expect((await commitRun(changed, run.id, run.digest, "Agent", opts)).result.code).toBe("CASE_STATE_CHANGED");
    changed.reservations[0].version += 1;
    expect((await commitRun(changed, run.id, run.digest, "Agent", opts)).result.code).toBe("CASE_STATE_CHANGED");
  });

  it("does not renew an approval by pressing approve again, before or after expiry", async () => {
    const { state, run } = await prepared();
    const first = approveRun(state, run.id, run.digest, opts);
    const repeated = approveRun(first.state, run.id, run.digest, { now: "2026-08-31T08:04:00.000Z" });
    expect(requireRun(repeated).approval).toEqual(first.state.runsById[run.id].approval);
    const expired = approveRun(first.state, run.id, run.digest, { now: "2026-08-31T08:05:00.000Z" });
    expect(expired.result.code).toBe("APPROVAL_EXPIRED");
    expect(expired.state.runsById[run.id].approval).toEqual(first.state.runsById[run.id].approval);
  });

  it.each(["2026-08-31T08:05:00.000Z", "invalid"]) ("rejects expired or malformed approval expiry %s", async expiry => {
    const { state, run } = await prepared();
    const approved = approveRun(state, run.id, run.digest, opts);
    if (expiry === "invalid") approved.state.runsById[run.id].approval!.expiresAt = expiry;
    const committed = await commitRun(approved.state, run.id, run.digest, "Agent", { now: "2026-08-31T08:05:00.000Z" });
    expect(committed.result.code).toBe("APPROVAL_EXPIRED");
    expect(committed.state.reservations).toEqual(state.reservations);
  });

  it("rechecks the approval clock after asynchronous hashing", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(NOW));
    const { state, run } = await prepared();
    const approved = approveRun(state, run.id, run.digest, opts);
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
      const value = await original(...args);
      vi.setSystemTime(new Date("2026-08-31T08:05:01.000Z"));
      return value;
    });
    const committed = await commitRun(approved.state, run.id, run.digest, "Agent", opts);
    expect(committed.result.code).toBe("APPROVAL_EXPIRED");
    expect(committed.state.reservations).toEqual(state.reservations);
  });

  it("aborts during asynchronous hashing without recording a successful run", async () => {
    const { state, target, published } = await fixture();
    const controller = new AbortController();
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => { const value = await original(...args); controller.abort(); return value; });
    const transition = await prepareRun(state, target.id, 1, published.id, 1, "Agent", { ...opts, signal: controller.signal });
    expect(transition.result.ok).toBe(false);
    expect(transition.state).toBe(state);
  });

  it("aborts commit during hashing without changing approval, reservations, or audit", async () => {
    const { state, run } = await prepared();
    const approved = approveRun(state, run.id, run.digest, opts);
    const controller = new AbortController();
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => { const value = await original(...args); controller.abort(); return value; });
    const committed = await commitRun(approved.state, run.id, run.digest, "Agent", { ...opts, signal: controller.signal });
    expect(committed.result.code).toBe("OPERATION_ABORTED");
    expect(committed.state).toBe(approved.state);
    expect(committed.state.runsById[run.id].approval?.used).toBe(false);
  });

  it.each(["prepare", "commit"] as const)("rechecks a changed input state after %s hashing", async operation => {
    const { state, published, target, run } = await prepared();
    const working = operation === "commit" ? approveRun(state, run.id, run.digest, opts).state : state;
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
      const value = await original(...args);
      if (!changed) { working.revision += 1; working.reservations[0] = { ...working.reservations[0], requestedArrivalTime: "21:45" }; changed = true; }
      return value;
    });
    const transition = operation === "prepare"
      ? await prepareRun(working, target.id, 1, published.id, 1, "Agent", opts)
      : await commitRun(working, run.id, run.digest, "Agent", opts);
    expect(transition.result.code).toBe("CASE_STATE_CHANGED");
    expect(transition.state.reservations[0].estimatedArrivalTime).toBe("17:25");
    expect(transition.state.reservations[0].handled).toBe(false);
  });

  it("discards a run without losing its audit record or letting it be applied later", async () => {
    const { state, run } = await prepared();
    const approved = approveRun(state, run.id, run.digest, opts);
    const discarded = discardRun(approved.state, run.id, opts);
    expect(discarded.result.code).toBe("RUN_DISCARDED");
    expect(discarded.state.runsById[run.id]).toMatchObject({ status: "discarded", approval: null });
    expect(discarded.state.activeRunIdByCaseId[run.caseId]).toBeUndefined();
    expect((await commitRun(discarded.state, run.id, run.digest, "Agent", opts)).result.ok).toBe(false);
    expect(discarded.state.reservations).toEqual(state.reservations);
  });

  it("returns a detached readonly lookup and reports expired approvals without mutating session state", async () => {
    const { state, run } = await prepared();
    const approved = approveRun(state, run.id, run.digest, opts);
    const original = structuredClone(approved.state);
    const result = getRun(approved.state, run.id, { now: "2026-08-31T08:06:00.000Z" });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("APPROVAL_EXPIRED");
    result.data!.after.guestDisplayName = "Only changed the returned copy";
    expect(approved.state).toEqual(original);
    expect(getRun(state, "missing").code).toBe("RUN_NOT_FOUND");
  });
});

import { describe, expect, it } from "vitest";
import type { Demonstration, Proposal, Reservation, SessionState } from "./domain";
import { digest } from "./common";
import { demonstrationDigest } from "./recording";
import { createDraft, publishDraft, publishedContent, updateDraft } from "./teaching";

async function example(): Promise<{ state: SessionState; demo: Demonstration; proposal: Proposal }> {
  const before: Reservation = { id: "source-arbitrary", guestDisplayName: "Mika Ito", version: 1, status: "confirmed", arrivalDate: "2026-08-31", plannedArrivalTime: "17:00", requestedArrivalDate: "2026-08-31", requestedArrivalTime: "20:45", estimatedArrivalDate: "2026-08-31", estimatedArrivalTime: "17:00", mealPlan: "dinner_included", mealService: "regular_dinner", hasNewDietaryRequest: false, requestsTaxi: false, requestsCompensation: false, requestsCancellation: false, requestsPaymentChange: false, guestMessageDraft: null, shiftHandoff: null, handled: false };
  const after = { ...before, version: 2, estimatedArrivalTime: "20:45" };
  const demo: Demonstration = { id: "record-arbitrary", caseId: before.id, status: "completed", before, after, commands: [{ id: "action-a", sequence: 1, caseId: before.id, command: { type: "set_estimated_arrival", input: { date: "2026-08-31", time: "20:45" } }, before, after, caseVersionBefore: 1, caseVersionAfter: 2, at: "2026-08-31T01:00:01Z", actor: "Human" }], startedAt: "2026-08-31T01:00:00Z", completedAt: "2026-08-31T01:00:02Z", digest: null, recordedBy: "Human" };
  demo.digest = await demonstrationDigest(demo);
  const state: SessionState = { schemaVersion: 1, revision: 0, businessDate: "2026-08-31", timeZone: "Asia/Tokyo", reservations: [after], recordingId: null, demonstrations: [demo], drafts: [], playbooks: [], runsById: {}, activeRunIdByCaseId: {}, audit: [], requests: {} };
  const proposal: Proposal = { name: "Arrival only", purpose: "Reuse the recorded arrival update.", steps: [{ id: "step-arrival", type: "set_estimated_arrival", input: { date: { kind: "case_field", field: "requestedArrivalDate" }, time: { kind: "case_field", field: "requestedArrivalTime" } }, evidenceCommandIds: ["action-a"], rationale: "Arrival should follow the target request." }], proposedBoundary: { latestArrivalTime: "22:00" }, unresolvedQuestions: [] };
  return { state, demo, proposal };
}

describe("source-backed drafting and human publication", () => {
  it("preserves actual agent content and requires explicit human confirmation", async () => {
    const { state, demo, proposal } = await example();
    const created = await createDraft(state, demo.id, demo.digest!, proposal);
    expect(created.result.ok).toBe(true);
    const draft = created.result.data!;
    expect(draft.createdBy).toBe("Agent");
    expect(created.state.reservations).toEqual(state.reservations);
    expect(created.state.playbooks).toEqual([]);
    expect((await publishDraft(created.state, draft.id, draft.revision, false)).result.code).toBe("HUMAN_CONFIRMATION_REQUIRED");
    const published = await publishDraft(created.state, draft.id, draft.revision, true);
    expect(published.result.ok).toBe(true);
    expect(published.result.data!.steps).toEqual(proposal.steps);
    expect(published.result.data!.id).not.toBe(demo.id);
    expect(published.result.data!.contentDigest).toBe(await digest(publishedContent(published.result.data!)));
    expect(published.state.audit[0].actor).toBe("Human");
  });
  it("allows distinct safe limits, preserves the agent original, and blocks stale edits", async () => {
    const { state, demo, proposal } = await example(); proposal.proposedBoundary.latestArrivalTime = "23:00";
    const created = await createDraft(state, demo.id, demo.digest!, proposal);
    const draft = created.result.data!;
    expect(draft.validationIssues.map(issue => issue.code)).toContain("BOUNDARY_TOO_WIDE");
    expect((await publishDraft(created.state, draft.id, 1, true)).result.code).toBe("DRAFT_REQUIRES_REVIEW");
    for (const limit of ["21:30", "21:37", "22:00"]) {
      const corrected = structuredClone(proposal); corrected.proposedBoundary.latestArrivalTime = limit;
      const updated = await updateDraft(created.state, draft.id, 1, corrected, "Human");
      expect(updated.result.data!.originalProposal.proposedBoundary.latestArrivalTime).toBe("23:00");
      expect(updated.result.data!.changes[0].actor).toBe("Human");
      expect((await updateDraft(updated.state, draft.id, 1, corrected, "Agent")).result.code).toBe("DRAFT_CONFLICT");
      expect((await publishDraft(updated.state, draft.id, 2, true)).result.ok).toBe(true);
    }
  });
  it("returns the latest detached draft when an edit targets an old revision", async () => {
    const { state, demo, proposal } = await example();
    const created = await createDraft(state, demo.id, demo.digest!, proposal);
    const humanProposal = { ...proposal, proposedBoundary: { latestArrivalTime: "21:55" } };
    const revised = await updateDraft(created.state, created.result.data!.id, 1, humanProposal, "Human");
    const conflict = await updateDraft(revised.state, created.result.data!.id, 1, proposal, "Agent");
    expect(conflict.result.code).toBe("DRAFT_CONFLICT");
    expect(conflict.result.data).toEqual(revised.result.data);
    expect(conflict.state).toBe(revised.state);
    conflict.result.data!.proposal.proposedBoundary.latestArrivalTime = "22:00";
    expect(revised.state.drafts[0].proposal.proposedBoundary.latestArrivalTime).toBe("21:55");
  });
  it("includes the latest draft when it changes during source verification", async () => {
    const { state, demo, proposal } = await example();
    const created = await createDraft(state, demo.id, demo.digest!, proposal);
    const pending = updateDraft(created.state, created.result.data!.id, 1, proposal, "Agent");
    const latest = { ...created.state.drafts[0], revision: 2, proposal: { ...proposal, proposedBoundary: { latestArrivalTime: "21:55" } } };
    created.state.drafts[0] = latest;
    const conflict = await pending;
    expect(conflict.result.code).toBe("DRAFT_CONFLICT");
    expect(conflict.result.data).toEqual(latest);
    expect(conflict.state).toBe(created.state);
  });
  it("rejects cancelled, altered, missing, and mismatched sources without mutating state", async () => {
    const { state, demo, proposal } = await example();
    expect((await createDraft(state, "unknown", demo.digest!, proposal)).result.code).toBe("DEMONSTRATION_NOT_FOUND");
    expect((await createDraft(state, demo.id, "wrong", proposal)).result.code).toBe("SOURCE_CHANGED");
    demo.after.estimatedArrivalTime = "21:00";
    const tampered = await createDraft(state, demo.id, demo.digest!, proposal);
    expect(tampered.result.code).toBe("SOURCE_CHANGED");
    expect(tampered.state).toBe(state);
    demo.status = "cancelled";
    expect((await createDraft(state, demo.id, demo.digest!, proposal)).result.ok).toBe(false);
  });
  it("creates a separate immutable version and cannot edit an already published draft", async () => {
    const { state, demo, proposal } = await example();
    const created = await createDraft(state, demo.id, demo.digest!, proposal);
    const first = await publishDraft(created.state, created.result.data!.id, 1, true);
    expect((await updateDraft(first.state, created.result.data!.id, 2, proposal, "Human")).result.code).toBe("DRAFT_ALREADY_PUBLISHED");
    const changed = { ...proposal, name: "Arrival only, reviewed", proposedBoundary: { latestArrivalTime: "21:37" } };
    const nextDraft = await createDraft(first.state, demo.id, demo.digest!, changed, "Human", { basedOn: { id: first.result.data!.id, version: 1 } });
    const next = await publishDraft(nextDraft.state, nextDraft.result.data!.id, 1, true);
    expect(next.result.data!.id).toBe(first.result.data!.id);
    expect(next.result.data!.version).toBe(2);
    expect(next.state.playbooks).toHaveLength(2);
    expect(next.state.playbooks.find(book => book.version === 1)).toEqual(first.result.data);
  });
  it("does not save invalid schemas or updates cancelled during digest work", async () => {
    const { state, demo, proposal } = await example();
    expect((await createDraft(state, demo.id, demo.digest!, { ...proposal, approved: true })).result.code).toBe("INVALID_DRAFT");
    const controller = new AbortController();
    const pending = createDraft(state, demo.id, demo.digest!, proposal, "Agent", { signal: controller.signal });
    controller.abort();
    const cancelled = await pending;
    expect(cancelled.result.code).toBe("OPERATION_CANCELLED");
    expect(cancelled.state).toBe(state);
  });
  it("rechecks the source at publication and never trusts saved validation issues", async () => {
    const { state, demo, proposal } = await example();
    const created = await createDraft(state, demo.id, demo.digest!, proposal);
    const changedProposal = structuredClone(created.state);
    changedProposal.drafts[0].proposal.proposedBoundary.latestArrivalTime = "23:00";
    changedProposal.drafts[0].validationIssues = [];
    expect((await publishDraft(changedProposal, created.result.data!.id, 1, true)).result.code).toBe("DRAFT_REQUIRES_REVIEW");
    const changedSource = structuredClone(created.state);
    changedSource.demonstrations[0].commands[0].command.input = { date: "2026-08-31", time: "21:00" };
    expect((await publishDraft(changedSource, created.result.data!.id, 1, true)).result.code).toBe("SOURCE_CHANGED");
  });
});

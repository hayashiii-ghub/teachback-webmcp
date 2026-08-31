import { describe, expect, it } from "vitest";
import type { Demonstration, Proposal, Reservation } from "./domain";
import { PROPOSAL_SCHEMA, proposalIssues, resolveSteps, validateProposal, validateProposalInput } from "./playbook-schema";

function example(): { demo: Demonstration; proposal: Proposal } {
  const before: Reservation = {
    id: "source-unseeded", guestDisplayName: "Alex Rivera", version: 1, status: "confirmed",
    arrivalDate: "2026-08-31", plannedArrivalTime: "17:00", requestedArrivalDate: "2026-08-31", requestedArrivalTime: "20:45",
    estimatedArrivalDate: "2026-08-31", estimatedArrivalTime: "17:00", mealPlan: "dinner_included", mealService: "regular_dinner",
    hasNewDietaryRequest: false, requestsTaxi: false, requestsCompensation: false, requestsCancellation: false, requestsPaymentChange: false,
    guestMessageDraft: null, shiftHandoff: null, handled: false,
  };
  const changedArrival = { ...before, version: 2, estimatedArrivalTime: "20:45" };
  const after = { ...changedArrival, version: 3, shiftHandoff: "Alex Rivera arrives at 20:45.\nPlease welcome Alex Rivera." };
  const demo: Demonstration = {
    id: "new-demo", caseId: before.id, status: "completed", before, after, startedAt: "2026-08-31T01:00:00Z", completedAt: "2026-08-31T01:01:00Z", digest: null, recordedBy: "Human",
    commands: [
      { id: "c-arrival", sequence: 1, caseId: before.id, command: { type: "set_estimated_arrival", input: { date: "2026-08-31", time: "20:45" } }, before, after: changedArrival, caseVersionBefore: 1, caseVersionAfter: 2, at: "2026-08-31T01:00:01Z", actor: "Human" },
      { id: "c-handoff", sequence: 2, caseId: before.id, command: { type: "add_shift_handoff", input: { text: after.shiftHandoff } }, before: changedArrival, after, caseVersionBefore: 2, caseVersionAfter: 3, at: "2026-08-31T01:00:02Z", actor: "Human" },
    ],
  };
  const proposal: Proposal = {
    name: "Recorded late arrival", purpose: "Reuse this recorded arrival and handoff.", proposedBoundary: { latestArrivalTime: "22:00" }, unresolvedQuestions: [],
    steps: [
      { id: "arrival", type: "set_estimated_arrival", evidenceCommandIds: ["c-arrival"], rationale: "Use each guest's requested date and time.", input: { date: { kind: "case_field", field: "requestedArrivalDate" }, time: { kind: "case_field", field: "requestedArrivalTime" } } },
      { id: "handoff", type: "add_shift_handoff", evidenceCommandIds: ["c-handoff"], rationale: "Replace guest-specific values.", input: { template: [{ kind: "case_field", field: "guestDisplayName" }, { kind: "literal", value: " arrives at " }, { kind: "case_field", field: "requestedArrivalTime" }, { kind: "literal", value: ".\nPlease welcome " }, { kind: "case_field", field: "guestDisplayName" }, { kind: "literal", value: "." }] } },
    ],
  };
  return { demo, proposal };
}

describe("agent proposal structure and semantics", () => {
  it("accepts a new record and resolves only its two actions for a different guest", () => {
    const { demo, proposal } = example();
    expect(validateProposal(proposal, demo).ok).toBe(true);
    expect(proposalIssues(proposal, demo, "2026-08-31")).toEqual([]);
    const resolved = resolveSteps(proposal.steps, { ...demo.before, guestDisplayName: "Morgan Lee", requestedArrivalTime: "21:12" });
    expect(resolved.data).toEqual([
      { type: "set_estimated_arrival", input: { date: "2026-08-31", time: "21:12" } },
      { type: "add_shift_handoff", input: { text: "Morgan Lee arrives at 21:12.\nPlease welcome Morgan Lee." } },
    ]);
  });
  it("rejects unknown nested keys, unsupported references, unknown evidence and repeated types", () => {
    for (const modify of [
      (p: any) => p.proposedBoundary.approvalRequired = false,
      (p: any) => p.steps[0].input.time.field = "paymentInformation",
      (p: any) => p.steps[0].evidenceCommandIds = ["unknown"],
      (p: any) => p.steps[0].input.date.extra = true,
      (p: any) => p.steps.push({ ...p.steps[0], id: "arrival2" }),
      (p: any) => p.steps[1].input.template[0].html = "<script>",
      (p: any) => p.actor = "Human",
    ]) {
      const { demo, proposal } = example(); modify(proposal);
      expect(validateProposal(proposal, demo).ok).toBe(false);
    }
  });
  it("retains reviewable 23:00 drafts but blocks publication policy", () => {
    const { demo, proposal } = example(); proposal.proposedBoundary.latestArrivalTime = "23:00";
    expect(validateProposal(proposal, demo).ok).toBe(true);
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("BOUNDARY_TOO_WIDE");
  });
  it("finds omission, source-value leakage, and invented text without generating a replacement", () => {
    const { demo, proposal } = example();
    const omitted = { ...proposal, steps: proposal.steps.slice(0, 1) };
    expect(proposalIssues(omitted, demo, "2026-08-31").map(issue => issue.code)).toContain("MISSING_RECORDED_CHANGE");
    const handoff = proposal.steps[1];
    if (handoff.type !== "add_shift_handoff") throw new Error("Invalid test fixture");
    handoff.input.template = [{ kind: "literal", value: demo.after.shiftHandoff! }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
    handoff.input.template = [{ kind: "literal", value: "A taxi has been booked." }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("SOURCE_REPLAY_MISMATCH");
  });
  it("rejects non-JSON input, oversized input, duplicate step IDs, and empty values", () => {
    const { demo, proposal } = example();
    for (const value of [null, [], { ...proposal, name: " " }, { ...proposal, purpose: "x".repeat(501) }, { ...proposal, steps: [proposal.steps[0], { ...proposal.steps[1], id: proposal.steps[0].id }] }]) expect(validateProposal(value, demo).ok).toBe(false);
    const cyclic: any = { ...proposal }; cyclic.self = cyclic;
    expect(validateProposal(cyclic, demo).ok).toBe(false);
    expect(PROPOSAL_SCHEMA.additionalProperties).toBe(false);
  });
  it("rejects sparse arrays, accessors, symbols and over-limit UTF-8 data", () => {
    const { demo, proposal } = example();
    expect(validateProposal({ ...proposal, steps: new Array(1) }, demo).ok).toBe(false);
    const accessor = { ...proposal };
    Object.defineProperty(accessor, "name", { enumerable: true, get: () => { throw new Error("Must not execute an accessor"); } });
    expect(validateProposalInput(accessor).ok).toBe(false);
    const symbolKey = { ...proposal, [Symbol("hidden")]: true };
    expect(validateProposalInput(symbolKey).ok).toBe(false);
    const large = { ...proposal, unresolvedQuestions: Array.from({ length: 10 }, () => "記".repeat(500)), purpose: "記".repeat(500) };
    expect(validateProposalInput(large).issues?.[0].code).toBe("INPUT_TOO_LARGE");
  });
  it("requires the final saved evidence and rejects unrecorded operations", () => {
    const { demo, proposal } = example();
    const previous = structuredClone(demo.commands[1]); previous.id = "previous-handoff";
    demo.commands.splice(1, 0, previous);
    proposal.steps[1].evidenceCommandIds = [previous.id];
    expect(validateProposal(proposal, demo).ok).toBe(true);
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("FINAL_EVIDENCE_REQUIRED");
    proposal.steps.push({ id: "unrecorded-meal", type: "set_meal_service", input: { kind: "literal", value: "late_meal_box" }, evidenceCommandIds: ["c-arrival"], rationale: "Invented operation" });
    expect(validateProposal(proposal, demo).issues?.map(issue => issue.code)).toContain("EVIDENCE_ACTION_MISMATCH");
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("ACTION_NOT_DEMONSTRATED");
  });
  it("detects source values split across literal tokens but not substrings in unrelated words", () => {
    const { demo, proposal } = example();
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid test fixture");
    handoff.input.template = [{ kind: "literal", value: "Alex " }, { kind: "literal", value: "Rivera arrives at " }, { kind: "case_field", field: "requestedArrivalTime" }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
    demo.before.guestDisplayName = "Al";
    handoff.input.template = [{ kind: "literal", value: "The meal is ready." }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).not.toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
  });
  it.each(["Alex arrives at ", "Rivera arrives at ", "ALEX arrives at "])("flags a clear source name component left as literal text: %s", literal => {
    const { demo, proposal } = example();
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "literal", value: literal }, { kind: "case_field", field: "requestedArrivalTime" }, { kind: "literal", value: "." }];
    demo.after.shiftHandoff = `${literal}${demo.before.requestedArrivalTime}.`;
    demo.commands[1].command = { type: "add_shift_handoff", input: { text: demo.after.shiftHandoff } };
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).not.toContain("SOURCE_REPLAY_MISMATCH");
  });
  it.each([
    ["Aiko Tanaka", "Aiko様、お食事をご用意します。"],
    ["Aiko Tanaka", "Aiko Tanaka様、お食事をご用意します。"],
    ["Aiko Tanaka", "Tanakaさまへのご案内です。"],
    ["Aiko Tanaka", "AIKOさんにお伝えします。"],
    ["Aiko Tanaka", "Aiko殿、ご確認ください。"],
    ["田中愛子", "田中愛子様、お食事をご用意します。"],
  ])("flags an exact source name or component followed by a Japanese honorific: %s / %s", (source, literal) => {
    const { demo, proposal } = example(); demo.before.guestDisplayName = source;
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "literal", value: literal }];
    demo.after.shiftHandoff = literal;
    demo.commands[1].command = { type: "add_shift_handoff", input: { text: literal } };
    const issues = proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code);
    expect(issues).toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
    expect(issues).not.toContain("SOURCE_REPLAY_MISMATCH");
  });
  it.each(["Alexandra様にご確認ください。", "SuperAlexさんにご確認ください。", "The Riveraide hotel is ready."])("does not flag a source-name substring in another word: %s", literal => {
    const { demo, proposal } = example();
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "literal", value: literal }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).not.toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
  });
  it("keeps a Japanese honorific reusable when the guest name is a case-field token", () => {
    const { demo, proposal } = example();
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "case_field", field: "guestDisplayName" }, { kind: "literal", value: "様、お食事をご用意します。" }];
    demo.after.shiftHandoff = `${demo.before.guestDisplayName}様、お食事をご用意します。`;
    demo.commands[1].command = { type: "add_shift_handoff", input: { text: demo.after.shiftHandoff } };
    expect(proposalIssues(proposal, demo, "2026-08-31")).toEqual([]);
    expect(resolveSteps([handoff], { ...demo.before, guestDisplayName: "Emma Wilson" }).data).toEqual([
      { type: "add_shift_handoff", input: { text: "Emma Wilson様、お食事をご用意します。" } },
    ]);
  });
  it.each(["8:45 PM", "08:45 pm", "8:45 p.m.", "8:45PM", "ETA20:45JST"])("flags deterministic representations of the source arrival: %s", time => {
    const { demo, proposal } = example();
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "case_field", field: "guestDisplayName" }, { kind: "literal", value: ` arrives at ${time}.` }];
    demo.after.shiftHandoff = `${demo.before.guestDisplayName} arrives at ${time}.`;
    demo.commands[1].command = { type: "add_shift_handoff", input: { text: demo.after.shiftHandoff } };
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).not.toContain("SOURCE_REPLAY_MISMATCH");
  });
  it.each([
    ["00:20", "12:20 AM"], ["12:00", "12 PM"], ["21:00", "9 p.m."], ["09:30", "9:30"],
  ])("handles midnight/noon and non-padded hours without inferring unknown aliases (%s)", (requested, literal) => {
    const { demo, proposal } = example(); demo.before.requestedArrivalTime = requested;
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "literal", value: `Arrival ${literal}.` }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
  });
  it("does not infer two-letter aliases, short common words, or a different am/pm period", () => {
    const { demo, proposal } = example(); demo.before.guestDisplayName = "May Li";
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "literal", value: "May we prepare a meal? Breakfast ends at 8:45 AM." }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).not.toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
  });
  it.each([["08:45", "8:45 PM"], ["12:00", "12:00 AM"], ["00:20", "12:20 PM"]])("does not treat an explicitly different period as the source time (%s)", (sourceTime, otherTime) => {
    const { demo, proposal } = example(); demo.before.requestedArrivalTime = sourceTime; demo.after.estimatedArrivalTime = sourceTime;
    const handoff = proposal.steps[1]; if (handoff.type !== "add_shift_handoff") throw new Error("Invalid fixture");
    handoff.input.template = [{ kind: "literal", value: `Reception closes at ${otherTime}.` }];
    expect(proposalIssues(proposal, demo, "2026-08-31").map(issue => issue.code)).not.toContain("SOURCE_VALUE_NOT_PARAMETERIZED");
  });
});

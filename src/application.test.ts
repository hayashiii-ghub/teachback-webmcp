import { describe, expect, it } from "vitest";
import {
  approveCurrentRun,
  runForReservation,
  rejectionForReservation,
  discardCurrentRun,
  expireApprovedRun,
  commitApprovedRun,
  prepareCurrentRun,
  selectReservation,
} from "./application";
import { createInitialState } from "./fixtures";
import { LATE_ARRIVAL_PLAYBOOK, NIGHT_ARRIVAL_PLAYBOOK } from "./teaching";

describe("Late Arrival Care run", () => {
  it.each(["Agent", "Website"] as const)("attributes prepared proposals to their actual caller: %s", async (actor) => {
    const prepared = await prepareCurrentRun(createInitialState(), new Date(), LATE_ARRIVAL_PLAYBOOK, actor);
    expect(prepared.result.code).toBe("RUN_PREPARED");
    expect(prepared.state.audit.at(-1)?.actor).toBe(actor);
  });

  it("cannot replace committed work with a new preview or refusal", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state).state;
    const run = runForReservation(approved)!;
    const committed = await commitApprovedRun(approved, { runId: run.id, expectedDigest: run.digest });
    const retried = await prepareCurrentRun(committed.state);
    expect(retried.result.code).toBe("RUN_ALREADY_COMMITTED");
    expect(retried.state).toBe(committed.state);
    expect(runForReservation(retried.state)?.status).toBe("committed");
  });

  it("expires unselected approvals without renewing or duplicating their audit events", async () => {
    const now = new Date("2026-08-30T10:00:00.000Z");
    const emma = approveCurrentRun((await prepareCurrentRun(createInitialState(), now)).state, now).state;
    const maya = approveCurrentRun(
      (await prepareCurrentRun(selectReservation(emma, "R-2054"), now)).state,
      new Date("2026-08-30T10:02:00.000Z"),
    ).state;
    const expired = expireApprovedRun(maya, new Date("2026-08-30T10:05:00.000Z"));
    expect(runForReservation(expired, "R-2048")?.status).toBe("stale");
    expect(runForReservation(expired)?.status).toBe("approved");
    expect(runForReservation(expired, "R-2048")?.approvalExpiresAt).toBe("2026-08-30T10:05:00.000Z");
    expect(expired.audit).toHaveLength(maya.audit.length + 1);
    expect(expireApprovedRun(expired, new Date("2026-08-30T10:05:01.000Z"))).toBe(expired);
    expect(runForReservation(selectReservation(expired, "R-2048"))?.status).toBe("stale");
  });

  it("keeps refusals and discards scoped to their own case", async () => {
    const emma = approveCurrentRun((await prepareCurrentRun(createInitialState())).state).state;
    const emmaRun = structuredClone(runForReservation(emma));
    const daniel = (await prepareCurrentRun(selectReservation(emma, "R-2052"))).state;
    const refusal = structuredClone(rejectionForReservation(daniel));
    const maya = (await prepareCurrentRun(selectReservation(daniel, "R-2054"))).state;
    const discarded = discardCurrentRun(maya);
    expect(runForReservation(discarded)?.status).toBe("discarded");
    expect(runForReservation(selectReservation(discarded, "R-2048"))).toEqual(emmaRun);
    const backToDaniel = selectReservation(discarded, "R-2052");
    expect(rejectionForReservation(backToDaniel)).toEqual(refusal);
    expect(runForReservation(backToDaniel)).toBeNull();
  });

  it("checks changed reservations and invalidates replaced approvals after navigation", async () => {
    const approved = approveCurrentRun((await prepareCurrentRun(createInitialState())).state).state;
    const oldRun = runForReservation(approved)!;
    const roundTrip = selectReservation(selectReservation(approved, "R-2050"), "R-2048");
    const changed = { ...roundTrip, reservations: roundTrip.reservations.map(r => r.id === "R-2048" ? { ...r, version: r.version + 1 } : r) };
    expect((await commitApprovedRun(changed, { runId: oldRun.id, expectedDigest: oldRun.digest })).result.code).toBe("CASE_STATE_CHANGED");
    const replaced = await prepareCurrentRun(roundTrip);
    expect(runForReservation(replaced.state)?.status).toBe("awaiting_review");
    expect(runForReservation(replaced.state)?.approvedDigest).toBeNull();
    expect((await commitApprovedRun(replaced.state, { runId: oldRun.id, expectedDigest: oldRun.digest })).result.code).toBe("RUN_NOT_FOUND");
  });

  it.each([false, true])("retains the exact preview across case switches (approved: %s)", async (approve) => {
    const prepared = await prepareCurrentRun(createInitialState());
    const source = approve ? approveCurrentRun(prepared.state).state : prepared.state;
    const originalRun = structuredClone(runForReservation(source));
    const elsewhere = selectReservation(source, "R-2050");
    expect(runForReservation(elsewhere)).toBeNull();
    const restored = selectReservation(elsewhere, "R-2048");
    expect(runForReservation(restored)).toEqual(originalRun);
  });

  it("keeps two cases' approvals independent and commits only the selected case", async () => {
    const emma = approveCurrentRun((await prepareCurrentRun(createInitialState())).state).state;
    const emmaRun = structuredClone(runForReservation(emma)!);
    const maya = approveCurrentRun((await prepareCurrentRun(selectReservation(emma, "R-2054"))).state).state;
    const mayaRun = structuredClone(runForReservation(maya)!);
    const wrongCase = await commitApprovedRun(maya, { runId: emmaRun.id, expectedDigest: emmaRun.digest });
    expect(wrongCase.result.code).toBe("RUN_NOT_FOUND");
    const backToEmma = selectReservation(maya, "R-2048");
    expect(runForReservation(backToEmma)).toEqual(emmaRun);
    const committed = await commitApprovedRun(backToEmma, { runId: emmaRun.id, expectedDigest: emmaRun.digest });
    expect(committed.result.code).toBe("RUN_COMMITTED");
    expect(runForReservation(selectReservation(committed.state, "R-2054"))).toEqual(mayaRun);
    const roundTrip = selectReservation(selectReservation(committed.state, "R-2054"), "R-2048");
    expect((await commitApprovedRun(roundTrip, { runId: emmaRun.id, expectedDigest: emmaRun.digest })).result.code).toBe("RUN_ALREADY_COMMITTED");
  });

  it("prepares a preview without mutating the reservation", async () => {
    const initial = createInitialState();
    const before = initial.reservations.find((item) => item.id === "R-2048")!;
    const prepared = await prepareCurrentRun(initial);
    const current = prepared.state.reservations.find((item) => item.id === "R-2048")!;

    expect(prepared.result.code).toBe("RUN_PREPARED");
    expect(runForReservation(prepared.state)?.status).toBe("awaiting_review");
    expect(runForReservation(prepared.state)?.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(runForReservation(prepared.state)?.proposedChanges).toContainEqual({
      field: "Guest message",
      before: null,
      after:
        "We have noted your late arrival. Your meal box will be ready at reception.",
    });
    expect(current).toEqual(before);
    expect(current.estimatedArrivalTime).toBeNull();
  });

  it("does not prepare a case that already has late-arrival handling", async () => {
    const selected = selectReservation(createInitialState(), "R-2041");
    const prepared = await prepareCurrentRun(selected);

    expect(prepared.result.code).toBe("PLAYBOOK_NOT_APPLICABLE");
    expect(prepared.result.reasons).toContain(
      "This case already has late-arrival handling.",
    );
    expect(runForReservation(prepared.state)).toBeNull();
    expect(rejectionForReservation(prepared.state)?.reservationId).toBe("R-2041");
  });

  it("rejects an unsafe case with every applicable reason", async () => {
    const selected = selectReservation(createInitialState(), "R-2052");
    const prepared = await prepareCurrentRun(selected);

    expect(prepared.result.code).toBe("PLAYBOOK_NOT_APPLICABLE");
    expect(prepared.result.reasons).toEqual([
      "Arrival is later than 22:00.",
      "A new dietary request requires human review.",
      "Transportation arrangements are outside this playbook.",
    ]);
    expect(runForReservation(prepared.state)).toBeNull();
  });

  it("prepares Daniel only with the second taught playbook", async () => {
    const selected = selectReservation(createInitialState(), "R-2052");
    const prepared = await prepareCurrentRun(
      selected,
      new Date("2026-08-27T10:00:00.000Z"),
      NIGHT_ARRIVAL_PLAYBOOK,
    );

    expect(prepared.result.code).toBe("RUN_PREPARED");
    expect(runForReservation(prepared.state)?.playbookId).toBe(
      "night-arrival-coordination@1",
    );
    expect(runForReservation(prepared.state)?.proposedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "Dietary request", after: "Handled" }),
        expect.objectContaining({ field: "Taxi", after: "Arranged" }),
      ]),
    );
  });

  it("commits the exact night-arrival actions after human approval", async () => {
    const selected = selectReservation(createInitialState(), "R-2052");
    const prepared = await prepareCurrentRun(
      selected,
      new Date("2026-08-27T10:00:00.000Z"),
      NIGHT_ARRIVAL_PLAYBOOK,
    );
    const approved = approveCurrentRun(
      prepared.state,
      new Date("2026-08-27T10:01:00.000Z"),
    );
    const run = runForReservation(approved.state)!;
    const committed = await commitApprovedRun(
      approved.state,
      { runId: run.id, expectedDigest: run.digest },
      new Date("2026-08-27T10:02:00.000Z"),
    );

    expect(committed.result.code).toBe("RUN_COMMITTED");
    const daniel = committed.state.reservations.find(
      (reservation) => reservation.id === "R-2052",
    )!;
    expect(daniel.dietaryRequestHandled).toBe(true);
    expect(daniel.taxiArranged).toBe(true);
  });

  it("does not commit before human approval", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const run = runForReservation(prepared.state)!;
    const committed = await commitApprovedRun(prepared.state, {
      runId: run.id,
      expectedDigest: run.digest,
    });

    expect(committed.result.code).toBe("RUN_NOT_APPROVED");
  });

  it("does not approve a preview when a refusal is also present", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const conflicting = {
      ...prepared.state,
      rejectionsByReservationId: { "R-2048": {
        reservationId: "R-2048",
        reasons: ["Arrival is later than 22:00."],
      } },
    };

    expect(approveCurrentRun(conflicting).result.code).toBe("RUN_NOT_REVIEWABLE");
  });

  it("does not commit an approved run when a refusal is also present", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    const run = runForReservation(approved.state)!;
    const conflicting = {
      ...approved.state,
      rejectionsByReservationId: { "R-2048": {
        reservationId: "R-2048",
        reasons: ["Arrival is later than 22:00."],
      } },
    };
    const committed = await commitApprovedRun(conflicting, {
      runId: run.id,
      expectedDigest: run.digest,
    });

    expect(committed.result.code).toBe("RUN_CONFLICTING_STATE");
  });

  it("commits exactly the approved digest", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(
      prepared.state,
      new Date("2026-08-27T10:00:00.000Z"),
    );
    const run = runForReservation(approved.state)!;
    const committed = await commitApprovedRun(
      approved.state,
      { runId: run.id, expectedDigest: run.digest },
      new Date("2026-08-27T10:01:00.000Z"),
    );

    expect(committed.result.code).toBe("RUN_COMMITTED");
    const reservation = committed.state.reservations.find(
      (item) => item.id === "R-2048",
    )!;
    expect(reservation.estimatedArrivalTime).toBe("20:45");
    expect(reservation.mealService).toBe("late_meal_box");
    expect(reservation.version).toBe(2);
  });

  it("rejects a digest that was not approved", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    const run = runForReservation(approved.state)!;
    const committed = await commitApprovedRun(approved.state, {
      runId: run.id,
      expectedDigest: `sha256:${"0".repeat(64)}`,
    });

    expect(committed.result.code).toBe("DIGEST_MISMATCH");
  });

  it("rejects approval after it expires", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(
      prepared.state,
      new Date("2026-08-27T10:00:00.000Z"),
    );
    const run = runForReservation(approved.state)!;
    const committed = await commitApprovedRun(
      approved.state,
      { runId: run.id, expectedDigest: run.digest },
      new Date("2026-08-27T10:06:00.000Z"),
    );

    expect(committed.result.code).toBe("APPROVAL_EXPIRED");
    expect(runForReservation(committed.state)?.status).toBe("stale");
  });

  it("treats an invalid approval expiry as expired", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    runForReservation(approved.state)!.approvalExpiresAt = "not-a-date";
    const run = runForReservation(approved.state)!;

    const committed = await commitApprovedRun(approved.state, {
      runId: run.id,
      expectedDigest: run.digest,
    });

    expect(committed.result.code).toBe("APPROVAL_EXPIRED");
    expect(runForReservation(committed.state)?.status).toBe("stale");
  });

  it("rejects replay after a successful commit", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    const run = runForReservation(approved.state)!;
    const first = await commitApprovedRun(approved.state, {
      runId: run.id,
      expectedDigest: run.digest,
    });
    const replay = await commitApprovedRun(first.state, {
      runId: run.id,
      expectedDigest: run.digest,
    });

    expect(first.result.code).toBe("RUN_COMMITTED");
    expect(replay.result.code).toBe("RUN_ALREADY_COMMITTED");
  });

  it("rejects an approved run whose proposed state was altered", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    const run = runForReservation(approved.state)!;
    const tamperedState = structuredClone(approved.state);
    runForReservation(tamperedState)!.after.requestsCompensation = true;

    const committed = await commitApprovedRun(tamperedState, {
      runId: run.id,
      expectedDigest: run.digest,
    });

    expect(committed.result.code).toBe("DIGEST_MISMATCH");
    expect(
      committed.state.reservations.find((item) => item.id === "R-2048")
        ?.requestsCompensation,
    ).toBe(false);
  });
});

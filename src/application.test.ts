import { describe, expect, it } from "vitest";
import {
  approveCurrentRun,
  commitApprovedRun,
  prepareCurrentRun,
  selectReservation,
} from "./application";
import { createInitialState } from "./fixtures";

describe("Late Arrival Care run", () => {
  it("prepares a preview without mutating the reservation", async () => {
    const initial = createInitialState();
    const before = initial.reservations.find((item) => item.id === "R-2048")!;
    const prepared = await prepareCurrentRun(initial);
    const current = prepared.state.reservations.find((item) => item.id === "R-2048")!;

    expect(prepared.result.code).toBe("RUN_PREPARED");
    expect(prepared.state.activeRun?.status).toBe("awaiting_review");
    expect(prepared.state.activeRun?.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(prepared.state.activeRun?.proposedChanges).toContainEqual({
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
    expect(prepared.state.activeRun).toBeNull();
  });

  it("does not commit before human approval", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const run = prepared.state.activeRun!;
    const committed = await commitApprovedRun(prepared.state, {
      runId: run.id,
      expectedDigest: run.digest,
    });

    expect(committed.result.code).toBe("RUN_NOT_APPROVED");
  });

  it("commits exactly the approved digest", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(
      prepared.state,
      new Date("2026-08-27T10:00:00.000Z"),
    );
    const run = approved.state.activeRun!;
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
    expect(reservation.label).toBe("Resolved");
  });

  it("rejects a digest that was not approved", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    const run = approved.state.activeRun!;
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
    const run = approved.state.activeRun!;
    const committed = await commitApprovedRun(
      approved.state,
      { runId: run.id, expectedDigest: run.digest },
      new Date("2026-08-27T10:06:00.000Z"),
    );

    expect(committed.result.code).toBe("APPROVAL_EXPIRED");
    expect(committed.state.activeRun?.status).toBe("stale");
  });

  it("treats an invalid approval expiry as expired", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    approved.state.activeRun!.approvalExpiresAt = "not-a-date";
    const run = approved.state.activeRun!;

    const committed = await commitApprovedRun(approved.state, {
      runId: run.id,
      expectedDigest: run.digest,
    });

    expect(committed.result.code).toBe("APPROVAL_EXPIRED");
    expect(committed.state.activeRun?.status).toBe("stale");
  });

  it("rejects replay after a successful commit", async () => {
    const prepared = await prepareCurrentRun(createInitialState());
    const approved = approveCurrentRun(prepared.state);
    const run = approved.state.activeRun!;
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
    const run = approved.state.activeRun!;
    const tamperedState = structuredClone(approved.state);
    tamperedState.activeRun!.after.requestsCompensation = true;

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

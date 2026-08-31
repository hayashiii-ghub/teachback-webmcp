import { describe, expect, it } from "vitest";
import {
  approveCurrentRun,
  commitApprovedRun,
  discardCurrentRun,
  expireApprovedRun,
  playbookForReservation,
  prepareCurrentRun,
  runForReservation,
  selectedReservation,
} from "./application";
import { createInitialState } from "./fixtures";
import {
  deriveCaseQueueStatus,
  deriveCaseStatus,
  filterReservations,
  findNextReusableReservation,
} from "./case-presentation";
import { createPublishedJourney, NIGHT_ARRIVAL_PLAYBOOK } from "./teaching";
import type {
  AppState,
  Demonstration,
  PublishedPlaybook,
  Reservation,
} from "./domain";

const reservation: Reservation = {
  id: "R-9999",
  guestDisplayName: "New Operator Example",
  status: "confirmed",
  arrivalDate: "2026-08-27",
  plannedArrivalTime: "18:00",
  requestedArrivalTime: "21:00",
  estimatedArrivalTime: null,
  mealPlan: "dinner_included",
  mealService: "regular_dinner",
  hasNewDietaryRequest: false,
  dietaryRequestHandled: false,
  requestsTaxi: false,
  taxiArranged: false,
  requestsCompensation: false,
  guestMessageDraft: null,
  shiftHandoff: null,
  version: 1,
};

const demonstration: Demonstration = {
  id: "demonstration-new-example",
  reservationId: reservation.id,
  playbookId: "new-example@1",
  capturedAt: "2026-08-27T09:00:00.000Z",
  actions: [],
};

describe("findNextReusableReservation", () => {
  function context() {
    const state = createInitialState();
    const journey = createPublishedJourney();
    return {
      reservations: state.reservations,
      currentReservationId: "R-2050",
      runsByReservationId: state.runsByReservationId,
      demonstrations: journey.demonstrations,
      publishedPlaybooks: [...journey.publishedPlaybooks, NIGHT_ARRIVAL_PLAYBOOK],
      sourcePlaybookId: NIGHT_ARRIVAL_PLAYBOOK.id,
    };
  }

  it("takes Sofia's published night rule to Daniel rather than Emma's earlier late rule", () => {
    const input = context();
    const emma = input.reservations.find((item) => item.id === "R-2048")!;
    expect(playbookForReservation(emma, input.publishedPlaybooks)?.id).toBe("late-arrival-care@1");
    expect(findNextReusableReservation(input)?.id).toBe("R-2052");
  });

  it("follows the actual published-rule order rather than hardcoding a target", () => {
    const input = context();
    input.publishedPlaybooks.reverse();
    expect(findNextReusableReservation(input)?.id).toBe("R-2048");
  });

  it("skips a matching target that still displays a proposal from a different rule", async () => {
    const input = context();
    input.publishedPlaybooks.reverse();
    const prepared = await prepareCurrentRun(createInitialState());
    input.runsByReservationId = prepared.state.runsByReservationId;
    expect(input.runsByReservationId["R-2048"].playbookId).toBe("late-arrival-care@1");
    expect(findNextReusableReservation(input)?.id).toBe("R-2052");
  });

  it("keeps a target whose existing proposal and next prepared rule both match the source", async () => {
    const input = context();
    input.publishedPlaybooks.reverse();
    const prepared = await prepareCurrentRun(createInitialState(), new Date(), NIGHT_ARRIVAL_PLAYBOOK);
    input.runsByReservationId = prepared.state.runsByReservationId;
    expect(findNextReusableReservation(input)?.id).toBe("R-2048");
  });

  it("still skips a target when its proposal matches but its next prepared rule does not", async () => {
    const input = context();
    const prepared = await prepareCurrentRun(createInitialState(), new Date(), NIGHT_ARRIVAL_PLAYBOOK);
    input.runsByReservationId = prepared.state.runsByReservationId;
    expect(findNextReusableReservation(input)?.id).toBe("R-2052");
  });

  it("preserves generic next-case selection outside a published source", () => {
    expect(findNextReusableReservation({
      ...context(),
      currentReservationId: "R-2060",
      sourcePlaybookId: null,
    })?.id).toBe("R-2048");
  });

  it("does not select the current reservation or a recorded demonstration", () => {
    const input = context();
    input.currentReservationId = "R-2052";
    expect(findNextReusableReservation(input)?.id).toBe("R-2056");
    input.demonstrations = [...input.demonstrations, { ...demonstration, reservationId: "R-2056" }];
    expect(findNextReusableReservation(input)).toBeNull();
  });

  it("skips committed targets without changing the input", async () => {
    const input = context();
    const prepared = await prepareCurrentRun(
      { ...createInitialState(), selectedReservationId: "R-2052" },
      new Date(),
      NIGHT_ARRIVAL_PLAYBOOK,
    );
    const run = prepared.state.runsByReservationId["R-2052"];
    input.runsByReservationId = { "R-2052": { ...run, status: "committed" } };
    const before = structuredClone(input);
    expect(findNextReusableReservation(input)?.id).toBe("R-2056");
    expect(input).toEqual(before);
  });
});

describe("deriveCaseStatus", () => {
  it("derives a teachable source from demonstration data rather than a known id", () => {
    expect(
      deriveCaseStatus({
        reservation,
        demonstrations: [demonstration],
        publishedPlaybooks: [],
        activeRun: null,
        rejectedReservationId: null,
      }),
    ).toBe("demonstration_ready");
  });

  it("derives a published source through the demonstration relation", () => {
    const published: PublishedPlaybook = {
      id: demonstration.playbookId,
      sourceDemonstrationId: demonstration.id,
      boundary: {
        latestArrivalLimit: "22:00",
        taxiHandling: "escalate",
        dietaryHandling: "escalate",
        compensationHandling: "escalate",
        approvalRequired: true,
      },
      actions: [],
    };

    expect(
      deriveCaseStatus({
        reservation,
        demonstrations: [demonstration],
        publishedPlaybooks: [published],
        activeRun: null,
        rejectedReservationId: null,
      }),
    ).toBe("rule_published");
  });

  it("derives a reusable target from rule conditions without a known id", () => {
    const target = {
      ...reservation,
      id: "R-10000",
      guestDisplayName: "New Target Example",
    };
    const published: PublishedPlaybook = {
      id: demonstration.playbookId,
      sourceDemonstrationId: demonstration.id,
      boundary: {
        latestArrivalLimit: "22:00",
        taxiHandling: "escalate",
        dietaryHandling: "escalate",
        compensationHandling: "escalate",
        approvalRequired: true,
      },
      actions: [],
    };

    expect(
      deriveCaseStatus({
        reservation: target,
        demonstrations: [demonstration],
        publishedPlaybooks: [published],
        activeRun: null,
        rejectedReservationId: null,
      }),
    ).toBe("conditions_unchecked");
  });
});

describe("deriveCaseQueueStatus", () => {
  it("distinguishes a refused case from a proposal awaiting approval", () => {
    expect(
      deriveCaseQueueStatus({
        reservation,
        demonstrations: [],
        publishedPlaybooks: [],
        activeRun: null,
        rejectedReservationId: reservation.id,
      }),
    ).toBe("needs_human_review");
  });

  it("does not mark a different reservation as requiring human review", () => {
    expect(
      deriveCaseQueueStatus({
        reservation,
        demonstrations: [],
        publishedPlaybooks: [],
        activeRun: null,
        rejectedReservationId: "R-10000",
      }),
    ).toBe("unhandled");
  });

  it("distinguishes review, approved application, expiry, and completion throughout a run", async () => {
    const now = new Date("2026-08-31T10:00:00.000Z");
    const initial = createInitialState();
    const prepared = (await prepareCurrentRun(initial, now)).state;
    const approved = approveCurrentRun(prepared, now).state;
    const run = runForReservation(approved)!;
    const committed = await commitApprovedRun(approved, {
      runId: run.id,
      expectedDigest: run.digest,
    }, now);
    expect(committed.result.code).toBe("RUN_COMMITTED");
    const states = {
      initial,
      prepared,
      approved,
      expired: expireApprovedRun(approved, new Date("2026-08-31T10:05:00.000Z")),
      discarded: discardCurrentRun(approved, now),
      committed: committed.state,
    } satisfies Record<string, AppState>;

    expect(Object.fromEntries(Object.entries(states).map(([name, state]) => [
      name,
      deriveCaseQueueStatus({
        reservation: selectedReservation(state),
        demonstrations: [],
        publishedPlaybooks: [],
        activeRun: runForReservation(state),
        rejectedReservationId: null,
      }),
    ]))).toEqual({
      initial: "unhandled",
      prepared: "awaiting_review",
      approved: "awaiting_application",
      expired: "approval_expired",
      discarded: "unhandled",
      committed: "handled",
    });
  });

  it("shows demonstrations as handled regardless of rule publication", () => {
    expect(
      deriveCaseQueueStatus({
        reservation,
        demonstrations: [demonstration],
        publishedPlaybooks: [],
        activeRun: null,
        rejectedReservationId: null,
      }),
    ).toBe("handled");
  });

  it("does not expose whether an unhandled case has a matching rule", () => {
    const published: PublishedPlaybook = {
      id: demonstration.playbookId,
      sourceDemonstrationId: demonstration.id,
      boundary: {
        latestArrivalLimit: "22:00",
        taxiHandling: "escalate",
        dietaryHandling: "escalate",
        compensationHandling: "escalate",
        approvalRequired: true,
      },
      actions: [],
    };

    expect(
      deriveCaseQueueStatus({
        reservation: { ...reservation, id: "R-10000" },
        demonstrations: [demonstration],
        publishedPlaybooks: [published],
        activeRun: null,
        rejectedReservationId: null,
      }),
    ).toBe("unhandled");
    expect(
      deriveCaseQueueStatus({
        reservation: { ...reservation, id: "R-10001", requestsTaxi: true },
        demonstrations: [demonstration],
        publishedPlaybooks: [published],
        activeRun: null,
        rejectedReservationId: null,
      }),
    ).toBe("unhandled");
  });

  it("shows an in-progress proposal as awaiting review", () => {
    expect(
      deriveCaseQueueStatus({
        reservation,
        demonstrations: [],
        publishedPlaybooks: [],
        activeRun: {
          id: "run-1",
          playbookId: "example@1",
          reservationId: reservation.id,
          reservationVersion: reservation.version,
          before: reservation,
          after: reservation,
          proposedChanges: [],
          playbookBoundary: {
            latestArrivalLimit: "22:00",
            taxiHandling: "escalate",
            dietaryHandling: "escalate",
            compensationHandling: "escalate",
            approvalRequired: true,
          },
          digest: "digest",
          status: "awaiting_review",
          approvedDigest: null,
          approvedAt: null,
          approvalExpiresAt: null,
          committedAt: null,
        },
        rejectedReservationId: null,
      }),
    ).toBe("awaiting_review");
  });
});

describe("filterReservations", () => {
  const reservations: Reservation[] = [
    { ...reservation, id: "R-2048", guestDisplayName: "Emma Wilson" },
    { ...reservation, id: "R-2050", guestDisplayName: "Sofia Rossi" },
    { ...reservation, id: "R-2052", guestDisplayName: "Daniel Kim" },
  ];

  it.each(["", "   ", "\t\n"])("keeps every reservation for a blank query %j", (query) => {
    expect(filterReservations(reservations, query)).toEqual(reservations);
  });

  it.each([
    [" r-2050 ", "R-2050"],
    [" SOFIA ", "R-2050"],
    ["wilson", "R-2048"],
    ["KiM", "R-2052"],
  ])("matches a normalized ID or name query %j", (query, id) => {
    expect(filterReservations(reservations, query).map((item) => item.id)).toEqual([id]);
  });

  it("keeps matching reservations in their original order", () => {
    expect(filterReservations(reservations, "r-205").map((item) => item.id)).toEqual([
      "R-2050",
      "R-2052",
    ]);
  });

  it("returns no reservations for a non-matching query", () => {
    expect(filterReservations(reservations, "nobody-zzz")).toEqual([]);
  });

  it("does not alter the input list while filtering", () => {
    const before = structuredClone(reservations);
    filterReservations(reservations, "Emma");
    expect(reservations).toEqual(before);
  });
});

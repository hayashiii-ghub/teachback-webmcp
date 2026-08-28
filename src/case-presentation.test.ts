import { describe, expect, it } from "vitest";
import {
  deriveCaseQueueStatus,
  deriveCaseStatus,
} from "./case-presentation";
import type {
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

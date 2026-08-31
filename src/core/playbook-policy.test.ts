import { describe, expect, it } from "vitest";
import type { PlaybookStep, Reservation } from "./domain";
import { evaluatePolicy, validateBoundary } from "./playbook-policy";

function reservation(patch: Partial<Reservation> = {}): Reservation {
  return {
    id: "case-new", guestDisplayName: "Alex Rivera", version: 1, status: "confirmed",
    arrivalDate: "2026-08-31", plannedArrivalTime: "17:00", requestedArrivalDate: "2026-08-31",
    requestedArrivalTime: "20:45", estimatedArrivalDate: "2026-08-31", estimatedArrivalTime: "17:00",
    mealPlan: "dinner_included", mealService: "regular_dinner", hasNewDietaryRequest: false,
    requestsTaxi: false, requestsCompensation: false, requestsCancellation: false,
    requestsPaymentChange: false, guestMessageDraft: null, shiftHandoff: null, handled: false, ...patch,
  };
}
const arrival: PlaybookStep = {
  id: "arrival", type: "set_estimated_arrival", evidenceCommandIds: ["cmd-1"], rationale: "Use requested arrival.",
  input: { date: { kind: "case_field", field: "requestedArrivalDate" }, time: { kind: "case_field", field: "requestedArrivalTime" } },
};
const meal: PlaybookStep = { id: "meal", type: "set_meal_service", evidenceCommandIds: ["cmd-2"], rationale: "Recorded meal change.", input: { kind: "literal", value: "late_meal_box" } };
const message: PlaybookStep = { id: "message", type: "draft_guest_message", evidenceCommandIds: ["cmd-3"], rationale: "Recorded draft.", input: { template: [{ kind: "literal", value: "Welcome." }] } };

describe("fixed playbook policy", () => {
  it("accepts different valid limits, with inclusive minute precision", () => {
    expect(validateBoundary({ latestArrivalTime: "21:37" })).toEqual([]);
    expect(evaluatePolicy(reservation({ requestedArrivalTime: "21:37" }), { latestArrivalTime: "21:37" }, [arrival], "2026-08-31")).toEqual([]);
    expect(evaluatePolicy(reservation({ requestedArrivalTime: "21:38" }), { latestArrivalTime: "21:37" }, [arrival], "2026-08-31")).not.toEqual([]);
    expect(evaluatePolicy(reservation({ requestedArrivalTime: "22:00" }), { latestArrivalTime: "22:00" }, [arrival], "2026-08-31")).toEqual([]);
    expect(evaluatePolicy(reservation({ requestedArrivalTime: "22:01" }), { latestArrivalTime: "22:00" }, [arrival], "2026-08-31")).not.toEqual([]);
  });
  it("never expands the facility limit or accepts invalid dates and times", () => {
    expect(validateBoundary({ latestArrivalTime: "23:00" })).not.toEqual([]);
    for (const patch of [
      { requestedArrivalTime: "24:00" }, { requestedArrivalTime: null },
      { requestedArrivalDate: "2026-09-01", requestedArrivalTime: "00:20" },
      { requestedArrivalDate: null }, { arrivalDate: "2026-02-30" },
    ]) expect(evaluatePolicy(reservation(patch), { latestArrivalTime: "22:00" }, [arrival], "2026-08-31")).not.toEqual([]);
  });
  it.each(["hasNewDietaryRequest", "requestsTaxi", "requestsCompensation", "requestsCancellation", "requestsPaymentChange"] as const)("rejects both present and unknown %s", field => {
    for (const value of [true, null]) expect(evaluatePolicy(reservation({ [field]: value }), { latestArrivalTime: "22:00" }, [arrival], "2026-08-31")).not.toEqual([]);
  });
  it("checks meal and existing text only when that field is to be changed", () => {
    const alreadyHasText = reservation({ guestMessageDraft: "A person's existing draft", mealPlan: "room_only", mealService: "none" });
    expect(evaluatePolicy(alreadyHasText, { latestArrivalTime: "22:00" }, [arrival], "2026-08-31")).toEqual([]);
    expect(evaluatePolicy(alreadyHasText, { latestArrivalTime: "22:00" }, [meal, message], "2026-08-31")).toHaveLength(2);
    expect(evaluatePolicy(reservation({ handled: true }), { latestArrivalTime: "22:00" }, [arrival], "2026-08-31")).not.toEqual([]);
  });
});

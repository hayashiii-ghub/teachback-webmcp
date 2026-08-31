import { describe, expect, it } from "vitest";
import type { Command } from "./domain";
import { executeCommand, reservationDiff } from "./commands";
import { createSession } from "./fixtures";

describe("recorded-work commands", () => {
  it("updates a literal value and only its case version without mutating its input", () => {
    const reservation = createSession().reservations[0];
    const result = executeCommand(reservation, { type: "set_estimated_arrival", input: { date: reservation.arrivalDate, time: "20:17" } }, reservation.version);
    expect(result.ok).toBe(true);
    expect(result.data?.reservation.estimatedArrivalTime).toBe("20:17");
    expect(result.data?.reservation.version).toBe(reservation.version + 1);
    expect(reservation.estimatedArrivalTime).toBe(null);
    expect(reservationDiff(reservation, result.data!.reservation).map(change => change.field)).toEqual(["estimatedArrivalDate", "estimatedArrivalTime"]);
  });

  it.each([
    { type: "set_estimated_arrival", input: { date: "2026-02-30", time: "20:00" } },
    { type: "set_estimated_arrival", input: { date: "2026-08-31", time: "24:00" } },
    { type: "set_estimated_arrival", input: { date: "2026-08-31", time: "8:01" } },
    { type: "draft_guest_message", input: { text: " " } },
    { type: "draft_guest_message", input: { text: "x".repeat(1001) } },
    { type: "add_shift_handoff", input: { text: "Ready", actor: "Human" } },
    { type: "set_meal_service", input: { value: "regular_dinner" } },
    { type: "arrange_taxi", input: {} },
  ])("rejects malformed or out-of-catalog command %j", input => {
    const reservation = createSession().reservations[0];
    expect(executeCommand(reservation, input as Command, reservation.version).code).toBe("INVALID_COMMAND");
  });

  it("rejects stale versions, invalid states, and incompatible meal plans", () => {
    const reservation = createSession().reservations[0];
    const command = { type: "set_meal_service", input: { value: "late_meal_box" } } as const;
    expect(executeCommand(reservation, command, 0).code).toBe("CASE_STATE_CHANGED");
    expect(executeCommand({ ...reservation, status: "cancelled" }, command, reservation.version).ok).toBe(false);
    expect(executeCommand({ ...reservation, mealPlan: "room_only", mealService: "none" }, command, reservation.version).ok).toBe(false);
  });

  it("normalizes newlines and reports no-op without another version", () => {
    const reservation = { ...createSession().reservations[0], guestMessageDraft: "First\nSecond" };
    const result = executeCommand(reservation, { type: "draft_guest_message", input: { text: "First\r\nSecond" } }, reservation.version);
    expect(result.code).toBe("NO_CHANGE");
    expect(result.data).toEqual({ reservation, changed: false });
  });

  it("does not include workflow metadata in the business diff", () => {
    const reservation = createSession().reservations[0];
    expect(reservationDiff(reservation, { ...reservation, version: 99, handled: true })).toEqual([]);
  });
});

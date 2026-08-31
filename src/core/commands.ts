import type { Command, CommandType, ExactChange, Reservation, Result } from "./domain";
import { timeMinutes, validDate } from "./common";

export const TEXT_LIMIT = 1_000;
export const COMMAND_FIELDS: Record<CommandType, (keyof Reservation)[]> = {
  set_estimated_arrival: ["estimatedArrivalDate", "estimatedArrivalTime"],
  set_meal_service: ["mealService"],
  draft_guest_message: ["guestMessageDraft"],
  add_shift_handoff: ["shiftHandoff"],
};
const MUTABLE_FIELDS = Object.values(COMMAND_FIELDS).flat();
export function normalizedText(text: string): string { return text.replace(/\r\n?/g, "\n"); }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

export function isCommand(value: unknown): value is Command {
  if (!object(value) || !keys(value, ["type", "input"]) || !object(value.input)) return false;
  const input = value.input;
  switch (value.type) {
    case "set_estimated_arrival":
      return keys(input, ["date", "time"]) && validDate(input.date) && timeMinutes(input.time) !== null;
    case "set_meal_service":
      return keys(input, ["value"]) && input.value === "late_meal_box";
    case "draft_guest_message":
    case "add_shift_handoff":
      return keys(input, ["text"]) && typeof input.text === "string" && normalizedText(input.text).length <= TEXT_LIMIT && input.text.trim().length > 0 && !input.text.includes("\u0000");
    default: return false;
  }
}

/** Business changes only; revision and completion are lifecycle metadata. */
export function reservationDiff(before: Reservation, after: Reservation): ExactChange[] {
  return MUTABLE_FIELDS.filter(field => before[field] !== after[field]).map(field => ({ field, before: before[field], after: after[field] }));
}

/** Executes a concrete, validated operation. It never interprets a playbook. */
export function executeCommand(reservation: Reservation, command: Command, expectedVersion: number): Result<{ reservation: Reservation; changed: boolean }> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || reservation.version !== expectedVersion) return { ok: false, code: "CASE_STATE_CHANGED", summary: "The reservation changed. Reload it before saving." };
  if (!isCommand(command)) return { ok: false, code: "INVALID_COMMAND", summary: "The operation or its values are not supported." };
  if (reservation.status !== "confirmed") return { ok: false, code: "CASE_NOT_EDITABLE", summary: "Only a confirmed reservation can be handled here." };
  let patch: Partial<Reservation>;
  switch (command.type) {
    case "set_estimated_arrival":
      patch = { estimatedArrivalDate: command.input.date, estimatedArrivalTime: command.input.time }; break;
    case "set_meal_service":
      if (reservation.mealPlan !== "dinner_included" || !["regular_dinner", "late_meal_box"].includes(reservation.mealService)) return { ok: false, code: "MEAL_NOT_AVAILABLE", summary: "This reservation has no regular dinner to change." };
      patch = { mealService: command.input.value }; break;
    case "draft_guest_message": patch = { guestMessageDraft: normalizedText(command.input.text) }; break;
    case "add_shift_handoff": patch = { shiftHandoff: normalizedText(command.input.text) }; break;
  }
  if (Object.entries(patch).every(([key, value]) => reservation[key as keyof Reservation] === value)) return { ok: true, code: "NO_CHANGE", summary: "The same value is already saved.", data: { reservation, changed: false } };
  if (!Number.isSafeInteger(reservation.version + 1)) return { ok: false, code: "CASE_STATE_CHANGED", summary: "The reservation version is invalid." };
  return { ok: true, code: "COMMAND_APPLIED", summary: "The change was saved.", data: { reservation: { ...reservation, ...patch, version: reservation.version + 1 }, changed: true } };
}

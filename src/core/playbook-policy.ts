import type { Boundary, Issue, PlaybookStep, Reservation } from "./domain";
import { timeMinutes, validDate } from "./common";

export const FACILITY_LATEST_ARRIVAL = "22:00";
const facilityLatestArrivalMinutes = (() => {
  const minutes = timeMinutes(FACILITY_LATEST_ARRIVAL);
  if (minutes === null) {
    throw new Error(
      "FACILITY_LATEST_ARRIVAL must be a valid 24-hour HH:mm time.",
    );
  }
  return minutes;
})();

export const FIXED_SAFEGUARDS = [
  "Confirmed, not checked in, and arriving on the current business date.",
  "Requested arrival date must be known and match the reservation arrival date.",
  `Arrival must be at or before ${FACILITY_LATEST_ARRIVAL} and the human-confirmed limit.`,
  "New dietary, taxi, compensation, cancellation, and payment-change requests require a person.",
  "Unknown safety information requires a person.",
  "Meal changes require an included, regular dinner.",
  "Do not reprocess handled cases or overwrite existing message drafts or handoffs.",
  "A person must approve the exact changes on every run; approval is valid once for five minutes.",
] as const;

function issue(path: string, code: string, message: string): Issue { return { path, code, message }; }

export function validateBoundary(boundary: unknown): Issue[] {
  if (!boundary || typeof boundary !== "object" || Array.isArray(boundary)
    || Object.keys(boundary).length !== 1 || !Object.hasOwn(boundary, "latestArrivalTime")) {
    return [issue("proposedBoundary", "INVALID_BOUNDARY", "Provide only latestArrivalTime; fixed safeguards cannot be changed.")];
  }
  const minutes = timeMinutes((boundary as Boundary).latestArrivalTime);
  if (minutes === null) return [issue("proposedBoundary.latestArrivalTime", "INVALID_BOUNDARY", "Use a valid 24-hour HH:mm time.")];
  if (minutes > facilityLatestArrivalMinutes) return [issue("proposedBoundary.latestArrivalTime", "BOUNDARY_TOO_WIDE", `The facility limit is ${FACILITY_LATEST_ARRIVAL}. A person may choose an earlier limit, not a later one.`)];
  return [];
}

/** The same deterministic checks protect publication, preview, and commit. */
export function evaluatePolicy(reservation: Reservation, boundary: Boundary, steps: PlaybookStep[], businessDate: string): Issue[] {
  const issues = validateBoundary(boundary);
  if (reservation.status !== "confirmed") issues.push(issue("status", "RESERVATION_NOT_CONFIRMED", "The reservation must be confirmed and not checked in."));
  if (!validDate(businessDate) || !validDate(reservation.arrivalDate) || reservation.arrivalDate !== businessDate) {
    issues.push(issue("arrivalDate", "ARRIVAL_NOT_TODAY", "The reservation must arrive on the current business date."));
  }
  if (!validDate(reservation.requestedArrivalDate) || reservation.requestedArrivalDate !== reservation.arrivalDate) {
    issues.push(issue("requestedArrivalDate", "REQUESTED_DATE_MISMATCH", "Confirm the requested arrival date; it must match the reservation arrival date."));
  }
  const arrival = timeMinutes(reservation.requestedArrivalTime);
  const limit = timeMinutes(boundary?.latestArrivalTime);
  if (arrival === null) issues.push(issue("requestedArrivalTime", "ARRIVAL_TIME_UNKNOWN", "Confirm a valid requested arrival time."));
  else if (arrival > facilityLatestArrivalMinutes || (limit !== null && arrival > limit)) {
    issues.push(issue("requestedArrivalTime", "ARRIVAL_AFTER_BOUNDARY", "The requested arrival exceeds this playbook's allowed time."));
  }
  const requests = [
    ["hasNewDietaryRequest", "A new dietary request"], ["requestsTaxi", "A taxi request"],
    ["requestsCompensation", "A compensation request"], ["requestsCancellation", "A cancellation request"],
    ["requestsPaymentChange", "A payment-change request"],
  ] as const;
  for (const [field, label] of requests) {
    if (reservation[field] !== false) issues.push(issue(field, reservation[field] === true ? "REQUEST_REQUIRES_PERSON" : "SAFETY_INFORMATION_UNKNOWN", `${label}, or unknown request information, requires a person.`));
  }
  if (reservation.handled !== false) issues.push(issue("handled", "CASE_ALREADY_HANDLED", "Do not automatically reprocess an already handled case."));
  if (steps.some(step => step.type === "set_meal_service") && (reservation.mealPlan !== "dinner_included" || reservation.mealService !== "regular_dinner")) {
    issues.push(issue("mealService", "MEAL_NOT_ELIGIBLE", "A meal change requires an included, regular dinner."));
  }
  for (const [type, field] of [["draft_guest_message", "guestMessageDraft"], ["add_shift_handoff", "shiftHandoff"]] as const) {
    if (steps.some(step => step.type === type) && reservation[field] !== null && reservation[field] !== "") {
      issues.push(issue(field, "EXISTING_CONTENT_REQUIRES_PERSON", "Existing text must be reviewed by a person; it is not overwritten automatically."));
    }
  }
  return issues;
}

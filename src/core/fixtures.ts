import type { Reservation, SessionState } from "./domain";

// Only incoming synthetic cases are seeded. Every demonstration and playbook
// must be created by the current session's actual work.
export const BUSINESS_DATE = "2026-08-31";

function incoming(id: string, guestDisplayName: string, plannedArrivalTime: string, requestedArrivalTime: string, changes: Partial<Reservation> = {}): Reservation {
  return {
    id, guestDisplayName, version: 1, status: "confirmed", arrivalDate: BUSINESS_DATE,
    plannedArrivalTime, requestedArrivalDate: BUSINESS_DATE, requestedArrivalTime,
    estimatedArrivalDate: null, estimatedArrivalTime: null,
    mealPlan: "dinner_included", mealService: "regular_dinner",
    hasNewDietaryRequest: false, requestsTaxi: false, requestsCompensation: false,
    requestsCancellation: false, requestsPaymentChange: false,
    guestMessageDraft: null, shiftHandoff: null, handled: false, ...changes,
  };
}

export function createSession(): SessionState {
  return {
    schemaVersion: 1, revision: 0, businessDate: BUSINESS_DATE, timeZone: "Asia/Tokyo",
    reservations: [
      incoming("R-2041", "Aiko Tanaka", "18:00", "21:30"),
      incoming("R-2048", "Emma Wilson", "17:30", "20:45"),
      incoming("R-2050", "Sofia Rossi", "18:15", "23:30", { hasNewDietaryRequest: true, requestsTaxi: true }),
      incoming("R-2052", "Daniel Kim", "18:30", "21:10"),
      incoming("R-2054", "Maya Patel", "18:45", "21:45"),
      incoming("R-2056", "Lucas Meyer", "18:10", "22:50", { hasNewDietaryRequest: true }),
      incoming("R-2058", "Priya Shah", "19:00", "00:20", { requestedArrivalDate: "2026-09-01", mealPlan: "room_only", mealService: "none" }),
      incoming("R-2060", "Noah Martin", "17:45", "21:15", { requestsCompensation: true }),
    ],
    recordingId: null, demonstrations: [], drafts: [], playbooks: [],
    runsById: {}, activeRunIdByCaseId: {}, audit: [], requests: {},
  };
}

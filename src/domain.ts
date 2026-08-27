export const DEMO_DATE = "2026-08-27";

export type ReservationStatus = "confirmed" | "checked_in" | "cancelled";
export type MealService = "regular_dinner" | "late_meal_box" | "none";
export type CaseLabel = "Recorded" | "Needs review" | "Human only" | "Resolved";
export type RunStatus =
  | "awaiting_review"
  | "approved"
  | "committed"
  | "discarded"
  | "stale";

export interface Reservation {
  id: string;
  guestDisplayName: string;
  status: ReservationStatus;
  arrivalDate: string;
  plannedArrivalTime: string;
  requestedArrivalTime: string;
  estimatedArrivalTime: string | null;
  mealPlan: "dinner_included" | "room_only";
  mealService: MealService;
  hasNewDietaryRequest: boolean;
  requestsTaxi: boolean;
  requestsCompensation: boolean;
  guestMessageDraft: string | null;
  shiftHandoff: string | null;
  version: number;
  label: CaseLabel;
}

export interface ProposedChange {
  field: "Arrival" | "Meal" | "Guest message" | "Handoff";
  before: string | null;
  after: string;
}

export interface PreparedRun {
  id: string;
  reservationId: string;
  reservationVersion: number;
  before: Reservation;
  after: Reservation;
  proposedChanges: ProposedChange[];
  digest: string;
  status: RunStatus;
  approvedDigest: string | null;
  approvedAt: string | null;
  approvalExpiresAt: string | null;
  committedAt: string | null;
}

export interface Rejection {
  reservationId: string;
  reasons: string[];
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: "Human" | "Agent" | "Website";
  summary: string;
}

export interface AppState {
  storageVersion: 1;
  reservations: Reservation[];
  selectedReservationId: string;
  activeRun: PreparedRun | null;
  rejection: Rejection | null;
  audit: AuditEvent[];
}

export interface ToolResult<T = Record<string, unknown>> {
  ok: boolean;
  code: string;
  summary: string;
  data?: T;
  reasons?: string[];
}

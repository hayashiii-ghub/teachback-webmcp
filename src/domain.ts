export const DEMO_DATE = "2026-08-27";
export type PlaybookId = string;

export type ReservationStatus = "confirmed" | "checked_in" | "cancelled";
export type MealService = "regular_dinner" | "late_meal_box" | "none";
export type LatestArrivalLimit = "22:00" | "23:00" | "23:59";
export type TaxiHandling = "allow" | "escalate";
export type DietaryHandling = "allow" | "escalate";
export type CompensationHandling = "allow" | "escalate";
export interface PlaybookBoundary {
  latestArrivalLimit: LatestArrivalLimit;
  taxiHandling: TaxiHandling;
  dietaryHandling: DietaryHandling;
  compensationHandling: CompensationHandling;
  approvalRequired: true;
}

export type PlaybookAction =
  | { type: "set_estimated_arrival"; from: "requestedArrivalTime" }
  | { type: "set_meal_service"; value: "late_meal_box" }
  | { type: "handle_dietary_request" }
  | { type: "arrange_taxi" }
  | {
      type: "draft_guest_message";
      template: "late_arrival" | "night_arrival";
    }
  | {
      type: "add_shift_handoff";
      template: "late_arrival" | "night_arrival";
    };

export interface Demonstration {
  id: string;
  reservationId: string;
  playbookId: PlaybookId;
  capturedAt: string;
  actions: PlaybookAction[];
}

export interface PublishedPlaybook {
  id: PlaybookId;
  sourceDemonstrationId: Demonstration["id"];
  boundary: PlaybookBoundary;
  actions: PlaybookAction[];
}
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
  dietaryRequestHandled: boolean;
  requestsTaxi: boolean;
  taxiArranged: boolean;
  requestsCompensation: boolean;
  guestMessageDraft: string | null;
  shiftHandoff: string | null;
  version: number;
}

export interface ProposedChange {
  field:
    | "Arrival"
    | "Meal"
    | "Dietary request"
    | "Taxi"
    | "Guest message"
    | "Handoff";
  before: string | null;
  after: string;
}

export interface PreparedRun {
  id: string;
  playbookId: PlaybookId;
  reservationId: string;
  reservationVersion: number;
  before: Reservation;
  after: Reservation;
  proposedChanges: ProposedChange[];
  playbookBoundary: PlaybookBoundary;
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
  storageVersion: 2;
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

import { eligibilityReasons, playbookForReservation } from "./application";
import type {
  AppState,
  Demonstration,
  PreparedRun,
  PublishedPlaybook,
  Reservation,
} from "./domain";

export type CaseStatus =
  | "needs_human_review"
  | "awaiting_approval"
  | "ready_to_commit"
  | "approval_expired"
  | "rule_published"
  | "demonstration_ready"
  | "conditions_unchecked"
  | "no_matching_rule";

export type CaseQueueStatus =
  | "unhandled"
  | "awaiting_review"
  | "awaiting_application"
  | "approval_expired"
  | "needs_human_review"
  | "handled";

export function filterReservations(
  reservations: Reservation[],
  query: string,
): Reservation[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return reservations;

  return reservations.filter((reservation) =>
    `${reservation.id} ${reservation.guestDisplayName}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
}

export function findNextReusableReservation({
  reservations,
  currentReservationId,
  runsByReservationId,
  demonstrations,
  publishedPlaybooks,
  sourcePlaybookId,
}: {
  reservations: Reservation[];
  currentReservationId: string;
  runsByReservationId: AppState["runsByReservationId"];
  demonstrations: Demonstration[];
  publishedPlaybooks: PublishedPlaybook[];
  sourcePlaybookId?: PublishedPlaybook["id"] | null;
}): Reservation | null {
  return reservations.find((candidate) => {
    const run = runsByReservationId[candidate.id];
    if (
      candidate.id === currentReservationId ||
      demonstrationForReservation(demonstrations, candidate.id) ||
      run?.status === "committed"
    ) return false;

    // A matching boundary alone is insufficient: the target may select an
    // earlier published rule or still display a proposal from another rule.
    const targetPlaybook = playbookForReservation(candidate, publishedPlaybooks);
    if (!targetPlaybook) return false;
    if (!sourcePlaybookId) return true;
    return targetPlaybook.id === sourcePlaybookId &&
      (!run || run.playbookId === sourcePlaybookId);
  }) ?? null;
}

export function demonstrationForReservation(
  demonstrations: Demonstration[],
  reservationId: string,
): Demonstration | null {
  return (
    demonstrations.find(
      (demonstration) => demonstration.reservationId === reservationId,
    ) ?? null
  );
}

export function reservationForDemonstration(
  reservations: Reservation[],
  demonstrationId: string,
  demonstrations: Demonstration[],
): Reservation | null {
  const demonstration = demonstrations.find(
    (candidate) => candidate.id === demonstrationId,
  );
  if (!demonstration) return null;
  return (
    reservations.find(
      (reservation) => reservation.id === demonstration.reservationId,
    ) ?? null
  );
}

export function publishedPlaybookForDemonstration(
  publishedPlaybooks: PublishedPlaybook[],
  demonstrationId: string,
): PublishedPlaybook | null {
  return (
    publishedPlaybooks.find(
      (playbook) => playbook.sourceDemonstrationId === demonstrationId,
    ) ?? null
  );
}

export function deriveCaseStatus({
  reservation,
  demonstrations,
  publishedPlaybooks,
  activeRun,
  rejectedReservationId,
}: {
  reservation: Reservation;
  demonstrations: Demonstration[];
  publishedPlaybooks: PublishedPlaybook[];
  activeRun: PreparedRun | null;
  rejectedReservationId: string | null;
}): CaseStatus {
  if (rejectedReservationId === reservation.id) return "needs_human_review";

  const run =
    activeRun?.reservationId === reservation.id ? activeRun : null;
  if (run?.status === "awaiting_review") return "awaiting_approval";
  if (run?.status === "approved") return "ready_to_commit";
  if (run?.status === "stale") return "approval_expired";

  const demonstration = demonstrationForReservation(
    demonstrations,
    reservation.id,
  );
  if (demonstration) {
    return publishedPlaybookForDemonstration(
      publishedPlaybooks,
      demonstration.id,
    )
      ? "rule_published"
      : "demonstration_ready";
  }

  return publishedPlaybooks.some(
    (playbook) =>
      eligibilityReasons(reservation, playbook.boundary).length === 0,
  )
    ? "conditions_unchecked"
    : "no_matching_rule";
}

export function deriveCaseQueueStatus(
  input: Parameters<typeof deriveCaseStatus>[0],
): CaseQueueStatus {
  if (
    input.activeRun?.reservationId === input.reservation.id &&
    input.activeRun.status === "committed"
  ) {
    return "handled";
  }

  const status = deriveCaseStatus(input);
  if (status === "needs_human_review") return "needs_human_review";
  if (status === "ready_to_commit") return "awaiting_application";
  if (status === "approval_expired") return "approval_expired";
  if (status === "rule_published" || status === "demonstration_ready") {
    return "handled";
  }
  if (status === "conditions_unchecked" || status === "no_matching_rule") {
    return "unhandled";
  }
  return "awaiting_review";
}

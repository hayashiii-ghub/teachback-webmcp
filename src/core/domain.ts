// The recorded-workflow model is separate from the retained legacy demo model.
export type Actor = "Human" | "Agent" | "Website";
export type CommandType = "set_estimated_arrival" | "set_meal_service" | "draft_guest_message" | "add_shift_handoff";
export interface Reservation {
    id: string;
    guestDisplayName: string;
    version: number;
    status: "confirmed" | "checked_in" | "cancelled";
    arrivalDate: string;
    plannedArrivalTime: string;
    requestedArrivalDate: string | null;
    requestedArrivalTime: string | null;
    estimatedArrivalDate: string | null;
    estimatedArrivalTime: string | null;
    mealPlan: "dinner_included" | "room_only";
    mealService: "regular_dinner" | "late_meal_box" | "none";
    hasNewDietaryRequest: boolean | null;
    requestsTaxi: boolean | null;
    requestsCompensation: boolean | null;
    requestsCancellation: boolean | null;
    requestsPaymentChange: boolean | null;
    guestMessageDraft: string | null;
    shiftHandoff: string | null;
    handled: boolean;
}
export type Command = {
    type: "set_estimated_arrival";
    input: {
        date: string;
        time: string;
    };
} | {
    type: "set_meal_service";
    input: {
        value: "late_meal_box";
    };
} | {
    type: "draft_guest_message" | "add_shift_handoff";
    input: {
        text: string;
    };
};
export type TextToken = {
    kind: "literal";
    value: string;
} | {
    kind: "case_field";
    field: "guestDisplayName" | "requestedArrivalTime";
};
interface StepEvidence {
    id: string;
    evidenceCommandIds: string[];
    rationale: string;
}
export type PlaybookStep = StepEvidence & ({
    type: "set_estimated_arrival";
    input: {
        date: {
            kind: "case_field";
            field: "requestedArrivalDate";
        };
        time: {
            kind: "case_field";
            field: "requestedArrivalTime";
        };
    };
} | {
    type: "set_meal_service";
    input: {
        kind: "literal";
        value: "late_meal_box";
    };
} | {
    type: "draft_guest_message" | "add_shift_handoff";
    input: {
        template: TextToken[];
    };
});
export interface Boundary {
    latestArrivalTime: string;
}
export interface Proposal {
    name: string;
    purpose: string;
    steps: PlaybookStep[];
    proposedBoundary: Boundary;
    unresolvedQuestions: string[];
}
export interface Issue {
    path: string;
    code: string;
    message: string;
}
export interface Result<T = unknown> {
    ok: boolean;
    code: string;
    summary: string;
    data?: T;
    issues?: Issue[];
}
export interface Transition<T = unknown> {
    state: SessionState;
    result: Result<T>;
}
export interface RecordedCommand {
    id: string;
    sequence: number;
    caseId: string;
    command: Command;
    before: Reservation;
    after: Reservation;
    caseVersionBefore: number;
    caseVersionAfter: number;
    at: string;
    actor: "Human";
}
export interface Demonstration {
    id: string;
    caseId: string;
    status: "recording" | "completed" | "cancelled";
    before: Reservation;
    after: Reservation;
    commands: RecordedCommand[];
    startedAt: string;
    completedAt: string | null;
    digest: string | null;
    recordedBy: "Human";
}
export interface PlaybookDraft {
    id: string;
    revision: number;
    sourceDemonstrationId: string;
    sourceDigest: string;
    proposal: Proposal;
    originalProposal: Proposal;
    createdBy: "Human" | "Agent";
    changes: {
        at: string;
        actor: Actor;
        proposal: Proposal;
    }[];
    validationIssues: Issue[];
    publishedPlaybookId: string | null;
    basedOn?: {
        id: string;
        version: number;
    };
}
export interface PublishedPlaybook {
    id: string;
    version: number;
    contentDigest: string;
    sourceDemonstrationId: string;
    sourceDigest: string;
    name: string;
    purpose: string;
    steps: PlaybookStep[];
    boundary: Boundary;
    publishedAt: string;
    publishedBy: "Human";
}
export interface ExactChange {
    field: keyof Reservation;
    before: unknown;
    after: unknown;
}
export interface Approval {
    runId: string;
    approvedDigest: string;
    approvedAt: string;
    expiresAt: string;
    used: boolean;
}
export interface PreparedRun {
    id: string;
    caseId: string;
    caseVersion: number;
    playbookId: string;
    playbookVersion: number;
    playbookContentDigest: string;
    before: Reservation;
    after: Reservation;
    commands: Command[];
    exactDiff: ExactChange[];
    digest: string;
    status: "awaiting_review" | "approved" | "committed" | "discarded" | "stale";
    approval: Approval | null;
    createdAt: string;
    committedAt: string | null;
}
export interface AuditEvent {
    id: string;
    at: string;
    actor: Actor;
    eventType: string;
    summary: string;
    caseId?: string;
    demonstrationId?: string;
    draftId?: string;
    playbookId?: string;
    runId?: string;
}
export interface SessionState {
    schemaVersion: 1;
    revision: number;
    businessDate: string;
    timeZone: string;
    reservations: Reservation[];
    recordingId: string | null;
    demonstrations: Demonstration[];
    drafts: PlaybookDraft[];
    playbooks: PublishedPlaybook[];
    runsById: Record<string, PreparedRun>;
    activeRunIdByCaseId: Record<string, string>;
    audit: AuditEvent[];
    requests: Record<string, {
        fingerprint: string;
        result: Result;
    }>;
}
export interface OperationOptions {
    now?: string;
    signal?: AbortSignal;
}
export type Operation<T = unknown> = (state: SessionState) => Transition<T> | Promise<Transition<T>>;

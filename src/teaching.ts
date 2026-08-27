import type {
  AuditEvent,
  PlaybookBoundary,
  ToolResult,
} from "./domain";
export type { PlaybookBoundary } from "./domain";
export type TeachingStage = "demonstration" | "draft" | "reuse";

export interface PlaybookDraft {
  id: string;
  sourceReservationId: "R-2041";
  ruleCount: 7;
  boundary: PlaybookBoundary;
  createdAt: string;
}

export interface TeachingActivity {
  id: string;
  at: string;
  actor: AuditEvent["actor"];
  summary: string;
}

export interface TeachingJourney {
  storageVersion: 1;
  stage: TeachingStage;
  draft: PlaybookDraft | null;
  publishedBoundary: PlaybookBoundary | null;
  activity: TeachingActivity[];
}

export const DEMONSTRATED_ACTIONS = [
  "Set estimated arrival to 21:30",
  "Changed dinner to a late meal box",
  "Drafted the guest message",
  "Added the shift handoff",
] as const;

export const AGENT_DRAFT_BOUNDARY: PlaybookBoundary = {
  latestArrivalLimit: "23:00",
  taxiHandling: "allow",
  dietaryHandling: "escalate",
  compensationHandling: "escalate",
  approvalRequired: true,
};

export const SAFE_PUBLISHED_BOUNDARY: PlaybookBoundary = {
  ...AGENT_DRAFT_BOUNDARY,
  latestArrivalLimit: "22:00",
  taxiHandling: "escalate",
};

function activity(
  actor: TeachingActivity["actor"],
  summary: string,
  now = new Date(),
): TeachingActivity {
  return {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    actor,
    summary,
  };
}

export function createTeachingJourney(): TeachingJourney {
  return {
    storageVersion: 1,
    stage: "demonstration",
    draft: null,
    publishedBoundary: null,
    activity: [
      {
        id: "teaching-seed",
        at: "2026-08-27T09:00:00.000Z",
        actor: "Human",
        summary: "Recorded 4 semantic actions from R-2041.",
      },
    ],
  };
}

export function draftPlaybook(
  journey: TeachingJourney,
  boundary: PlaybookBoundary,
  now = new Date(),
): { state: TeachingJourney; result: ToolResult } {
  if (journey.stage === "reuse" || journey.publishedBoundary) {
    return {
      state: journey,
      result: {
        ok: false,
        code: "PLAYBOOK_ALREADY_PUBLISHED",
        summary: "The playbook is already published.",
      },
    };
  }

  const draft: PlaybookDraft = {
    id: crypto.randomUUID(),
    sourceReservationId: "R-2041",
    ruleCount: 7,
    boundary: structuredClone(boundary),
    createdAt: now.toISOString(),
  };

  return {
    state: {
      ...journey,
      stage: "draft",
      draft,
      activity: [
        ...journey.activity,
        activity("Agent", `Drafted 7 rules from R-2041 as ${draft.id}.`, now),
      ],
    },
    result: {
      ok: true,
      code: "PLAYBOOK_DRAFTED",
      summary: "The agent drafted 7 rules. Human boundary review is required.",
      data: {
        draft_id: draft.id,
        source_reservation_id: draft.sourceReservationId,
        rule_count: draft.ruleCount,
        boundary: draft.boundary,
        publishable: false,
      },
    },
  };
}

export function updateDraftBoundary(
  journey: TeachingJourney,
  patch: Partial<Pick<PlaybookBoundary, "latestArrivalLimit" | "taxiHandling">>,
  now = new Date(),
): TeachingJourney {
  if (journey.stage !== "draft" || !journey.draft) return journey;

  const previous = journey.draft.boundary;
  const next = { ...previous, ...patch };
  const changes: TeachingActivity[] = [];

  if (next.latestArrivalLimit !== previous.latestArrivalLimit) {
    changes.push(
      activity(
        "Human",
        `Changed latest arrival from ${previous.latestArrivalLimit} to ${next.latestArrivalLimit}.`,
        now,
      ),
    );
  }
  if (next.taxiHandling !== previous.taxiHandling) {
    changes.push(
      activity(
        "Human",
        `Changed taxi handling from ${previous.taxiHandling} to ${next.taxiHandling}.`,
        now,
      ),
    );
  }

  return {
    ...journey,
    draft: { ...journey.draft, boundary: next },
    activity: [...journey.activity, ...changes],
  };
}

export function draftIsPublishable(journey: TeachingJourney): boolean {
  const boundary = journey.draft?.boundary;
  return Boolean(
    boundary &&
      boundary.latestArrivalLimit === SAFE_PUBLISHED_BOUNDARY.latestArrivalLimit &&
      boundary.taxiHandling === SAFE_PUBLISHED_BOUNDARY.taxiHandling &&
      boundary.dietaryHandling === "escalate" &&
      boundary.compensationHandling === "escalate" &&
      boundary.approvalRequired,
  );
}

export function publishPlaybook(
  journey: TeachingJourney,
  now = new Date(),
): { state: TeachingJourney; result: ToolResult } {
  if (!journey.draft || journey.stage !== "draft") {
    return {
      state: journey,
      result: {
        ok: false,
        code: "PLAYBOOK_DRAFT_REQUIRED",
        summary: "An agent draft is required before publishing.",
      },
    };
  }
  if (!draftIsPublishable(journey)) {
    return {
      state: journey,
      result: {
        ok: false,
        code: "BOUNDARY_REVIEW_REQUIRED",
        summary: "A person must tighten the two highlighted boundaries.",
      },
    };
  }

  return {
    state: {
      ...journey,
      stage: "reuse",
      publishedBoundary: structuredClone(journey.draft.boundary),
      activity: [
        ...journey.activity,
        activity("Human", "Published Late Arrival Care v1.", now),
      ],
    },
    result: {
      ok: true,
      code: "PLAYBOOK_PUBLISHED",
      summary: "Late Arrival Care v1 was published with human-set boundaries.",
      data: {
        playbook: "late-arrival-care@1",
        boundary: journey.draft.boundary,
      },
    },
  };
}

export function createPublishedJourney(now = new Date()): TeachingJourney {
  const initial = createTeachingJourney();
  const drafted = draftPlaybook(initial, AGENT_DRAFT_BOUNDARY, now).state;
  const bounded = updateDraftBoundary(
    drafted,
    { latestArrivalLimit: "22:00", taxiHandling: "escalate" },
    now,
  );
  return publishPlaybook(bounded, now).state;
}

export function teachingAuditEvents(journey: TeachingJourney): AuditEvent[] {
  return journey.activity.map((event) => ({ ...event }));
}

function isBoundary(value: unknown): value is PlaybookBoundary {
  if (typeof value !== "object" || value === null) return false;
  const boundary = value as Record<string, unknown>;
  return (
    ["22:00", "23:00"].includes(String(boundary.latestArrivalLimit)) &&
    ["allow", "escalate"].includes(String(boundary.taxiHandling)) &&
    boundary.dietaryHandling === "escalate" &&
    boundary.compensationHandling === "escalate" &&
    boundary.approvalRequired === true
  );
}

export function isTeachingJourney(value: unknown): value is TeachingJourney {
  if (typeof value !== "object" || value === null) return false;
  const journey = value as Record<string, unknown>;
  const stage = String(journey.stage);
  const draft = journey.draft as Record<string, unknown> | null;
  const draftIsValid =
    draft === null ||
    (typeof draft === "object" &&
      typeof draft.id === "string" &&
      draft.sourceReservationId === "R-2041" &&
      draft.ruleCount === 7 &&
      isBoundary(draft.boundary) &&
      typeof draft.createdAt === "string" &&
      Number.isFinite(Date.parse(draft.createdAt)));
  const activityIsValid =
    Array.isArray(journey.activity) &&
    journey.activity.every(
      (event) =>
        typeof event === "object" &&
        event !== null &&
        typeof (event as Record<string, unknown>).id === "string" &&
        typeof (event as Record<string, unknown>).at === "string" &&
        Number.isFinite(Date.parse(String((event as Record<string, unknown>).at))) &&
        ["Human", "Agent", "Website"].includes(
          String((event as Record<string, unknown>).actor),
        ) &&
        typeof (event as Record<string, unknown>).summary === "string",
    );

  return (
    journey.storageVersion === 1 &&
    ["demonstration", "draft", "reuse"].includes(stage) &&
    draftIsValid &&
    (journey.publishedBoundary === null || isBoundary(journey.publishedBoundary)) &&
    activityIsValid &&
    (stage !== "demonstration" ||
      (draft === null && journey.publishedBoundary === null)) &&
    (stage !== "draft" ||
      (draft !== null && journey.publishedBoundary === null)) &&
    (stage !== "reuse" || (draft !== null && isBoundary(journey.publishedBoundary)))
  );
}

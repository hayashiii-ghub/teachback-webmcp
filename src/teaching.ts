import type {
  AuditEvent,
  Demonstration,
  PlaybookBoundary,
  PlaybookAction,
  PlaybookId,
  PublishedPlaybook,
  ToolResult,
} from "./domain";
import { demonstrationFixtures } from "./fixtures";

export type { PlaybookBoundary, PublishedPlaybook } from "./domain";
export type TeachingStage = "demonstration" | "draft" | "reuse";

export interface PlaybookDefinition extends PublishedPlaybook {
  name: string;
  ruleCount: number;
  agentDraftBoundary: PlaybookBoundary;
}

export interface PlaybookDraft {
  id: string;
  playbookId: PlaybookId;
  sourceDemonstrationId: Demonstration["id"];
  ruleCount: number;
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
  storageVersion: 3;
  stage: TeachingStage;
  teachingDemonstrationId: Demonstration["id"] | null;
  demonstrations: Demonstration[];
  draft: PlaybookDraft | null;
  publishedPlaybooks: PublishedPlaybook[];
  activity: TeachingActivity[];
}

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

function fixtureDemonstration(playbookId: PlaybookId): Demonstration {
  const demonstration = demonstrationFixtures.find(
    (candidate) => candidate.playbookId === playbookId,
  );
  if (!demonstration) {
    throw new Error(`Missing demonstration fixture for ${playbookId}.`);
  }
  return demonstration;
}

const lateArrivalDemonstration = fixtureDemonstration("late-arrival-care@1");
const nightArrivalDemonstration = fixtureDemonstration(
  "night-arrival-coordination@1",
);

export const LATE_ARRIVAL_PLAYBOOK: PlaybookDefinition = {
  id: "late-arrival-care@1",
  name: "Late Arrival Care",
  sourceDemonstrationId: lateArrivalDemonstration.id,
  ruleCount: 7,
  boundary: SAFE_PUBLISHED_BOUNDARY,
  agentDraftBoundary: AGENT_DRAFT_BOUNDARY,
  actions: structuredClone(lateArrivalDemonstration.actions),
};

export const NIGHT_ARRIVAL_PLAYBOOK: PlaybookDefinition = {
  id: "night-arrival-coordination@1",
  name: "Night Arrival Coordination",
  sourceDemonstrationId: nightArrivalDemonstration.id,
  ruleCount: 7,
  boundary: {
    latestArrivalLimit: "23:59",
    taxiHandling: "allow",
    dietaryHandling: "allow",
    compensationHandling: "escalate",
    approvalRequired: true,
  },
  agentDraftBoundary: {
    latestArrivalLimit: "23:59",
    taxiHandling: "allow",
    dietaryHandling: "allow",
    compensationHandling: "escalate",
    approvalRequired: true,
  },
  actions: structuredClone(nightArrivalDemonstration.actions),
};

export const PLAYBOOK_DEFINITIONS: Record<PlaybookId, PlaybookDefinition> = {
  "late-arrival-care@1": LATE_ARRIVAL_PLAYBOOK,
  "night-arrival-coordination@1": NIGHT_ARRIVAL_PLAYBOOK,
};

function actionSummary(action: PlaybookAction): string {
  switch (action.type) {
    case "set_estimated_arrival":
      return "Set estimated arrival from the requested arrival time";
    case "set_meal_service":
      return "Changed dinner to a late meal box";
    case "handle_dietary_request":
      return "Prepared a dietary-safe meal box";
    case "arrange_taxi":
      return "Arranged the requested taxi";
    case "draft_guest_message":
      return "Drafted the guest message";
    case "add_shift_handoff":
      return "Added the shift handoff";
  }
}

export function demonstratedActionsFor(playbookId: PlaybookId): string[] {
  return (PLAYBOOK_DEFINITIONS[playbookId]?.actions ?? []).map(actionSummary);
}

export function activeDemonstration(
  journey: TeachingJourney,
): Demonstration | null {
  if (!journey.teachingDemonstrationId) return null;
  return (
    journey.demonstrations.find(
      (demonstration) =>
        demonstration.id === journey.teachingDemonstrationId,
    ) ?? null
  );
}

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
  const demonstrations = structuredClone(demonstrationFixtures);
  const primaryDemonstration = demonstrations.find(
    (demonstration) =>
      demonstration.playbookId === LATE_ARRIVAL_PLAYBOOK.id,
  );
  if (!primaryDemonstration) {
    throw new Error("The primary demonstration fixture is missing.");
  }
  return {
    storageVersion: 3,
    stage: "demonstration",
    teachingDemonstrationId: primaryDemonstration.id,
    demonstrations,
    draft: null,
    publishedPlaybooks: [],
    activity: [
      {
        id: "teaching-seed",
        at: "2026-08-27T09:00:00.000Z",
        actor: "Human",
        summary: `Recorded ${primaryDemonstration.actions.length} semantic actions from ${primaryDemonstration.reservationId}.`,
      },
    ],
  };
}

export function startTeachingDemonstration(
  journey: TeachingJourney,
  demonstrationId: Demonstration["id"],
  now = new Date(),
): TeachingJourney {
  const demonstration = journey.demonstrations.find(
    (candidate) => candidate.id === demonstrationId,
  );
  if (!demonstration) return journey;
  const definition = PLAYBOOK_DEFINITIONS[demonstration.playbookId];
  if (!definition) return journey;
  if (
    journey.publishedPlaybooks.some(
      (playbook) => playbook.id === demonstration.playbookId,
    )
  ) {
    return journey;
  }

  return {
    ...journey,
    stage: "demonstration",
    teachingDemonstrationId: demonstration.id,
    draft: null,
    activity: [
      ...journey.activity,
      activity(
        "Human",
        `Selected recorded case ${demonstration.reservationId} to teach ${demonstration.playbookId}.`,
        now,
      ),
    ],
  };
}

export function draftPlaybook(
  journey: TeachingJourney,
  boundary: PlaybookBoundary,
  now = new Date(),
): { state: TeachingJourney; result: ToolResult } {
  const demonstration = activeDemonstration(journey);
  const playbookId = demonstration?.playbookId;
  if (!demonstration || !playbookId || journey.stage === "reuse") {
    return {
      state: journey,
      result: {
        ok: false,
        code: "TEACHING_SOURCE_REQUIRED",
        summary: "Select a recorded case before drafting a playbook.",
      },
    };
  }
  if (journey.publishedPlaybooks.some((playbook) => playbook.id === playbookId)) {
    return {
      state: journey,
      result: {
        ok: false,
        code: "PLAYBOOK_ALREADY_PUBLISHED",
        summary: "The playbook is already published.",
      },
    };
  }

  const definition = PLAYBOOK_DEFINITIONS[playbookId];
  const draft: PlaybookDraft = {
    id: crypto.randomUUID(),
    playbookId,
    sourceDemonstrationId: demonstration.id,
    ruleCount: definition.ruleCount,
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
        activity(
          "Agent",
          `Drafted ${draft.ruleCount} rules from ${demonstration.reservationId} as ${draft.id}.`,
          now,
        ),
      ],
    },
    result: {
      ok: true,
      code: "PLAYBOOK_DRAFTED",
      summary: `The agent drafted ${draft.ruleCount} rules. Human boundary review is required.`,
      data: {
        draft_id: draft.id,
        playbook_id: draft.playbookId,
        source_demonstration_id: draft.sourceDemonstrationId,
        rule_count: draft.ruleCount,
        boundary: draft.boundary,
        publishable: false,
      },
    },
  };
}

export function updateDraftBoundary(
  journey: TeachingJourney,
  patch: Partial<
    Pick<
      PlaybookBoundary,
      "latestArrivalLimit" | "taxiHandling" | "dietaryHandling"
    >
  >,
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
  if (next.dietaryHandling !== previous.dietaryHandling) {
    changes.push(
      activity(
        "Human",
        `Changed dietary handling from ${previous.dietaryHandling} to ${next.dietaryHandling}.`,
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

function boundariesMatch(
  left: PlaybookBoundary,
  right: PlaybookBoundary,
): boolean {
  return (
    left.latestArrivalLimit === right.latestArrivalLimit &&
    left.taxiHandling === right.taxiHandling &&
    left.dietaryHandling === right.dietaryHandling &&
    left.compensationHandling === right.compensationHandling &&
    left.approvalRequired === right.approvalRequired
  );
}

export function draftIsPublishable(journey: TeachingJourney): boolean {
  const draft = journey.draft;
  return Boolean(
    draft &&
      boundariesMatch(
        draft.boundary,
        PLAYBOOK_DEFINITIONS[draft.playbookId].boundary,
      ),
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
        summary: "A person must confirm the highlighted boundaries.",
      },
    };
  }

  const published: PublishedPlaybook = {
    id: journey.draft.playbookId,
    sourceDemonstrationId: journey.draft.sourceDemonstrationId,
    boundary: structuredClone(journey.draft.boundary),
    actions: structuredClone(
      journey.demonstrations.find(
        (demonstration) =>
          demonstration.id === journey.draft?.sourceDemonstrationId,
      )?.actions ?? [],
    ),
  };
  const nextPublished = [
    ...journey.publishedPlaybooks.filter((item) => item.id !== published.id),
    published,
  ];

  return {
    state: {
      ...journey,
      stage: "reuse",
      teachingDemonstrationId: null,
      publishedPlaybooks: nextPublished,
      activity: [
        ...journey.activity,
        activity("Human", `Published ${published.id}.`, now),
      ],
    },
    result: {
      ok: true,
      code: "PLAYBOOK_PUBLISHED",
      summary: `${published.id} was published with human-set boundaries.`,
      data: {
        playbook: published.id,
        boundary: published.boundary,
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
    ["22:00", "23:00", "23:59"].includes(
      String(boundary.latestArrivalLimit),
    ) &&
    ["allow", "escalate"].includes(String(boundary.taxiHandling)) &&
    ["allow", "escalate"].includes(String(boundary.dietaryHandling)) &&
    boundary.compensationHandling === "escalate" &&
    boundary.approvalRequired === true
  );
}

function isAction(value: unknown): value is PlaybookAction {
  if (typeof value !== "object" || value === null) return false;
  const action = value as Record<string, unknown>;
  switch (action.type) {
    case "set_estimated_arrival":
      return action.from === "requestedArrivalTime";
    case "set_meal_service":
      return action.value === "late_meal_box";
    case "handle_dietary_request":
    case "arrange_taxi":
      return true;
    case "draft_guest_message":
    case "add_shift_handoff":
      return ["late_arrival", "night_arrival"].includes(
        String(action.template),
      );
    default:
      return false;
  }
}

function isDemonstration(value: unknown): value is Demonstration {
  if (typeof value !== "object" || value === null) return false;
  const demonstration = value as Record<string, unknown>;
  return (
    typeof demonstration.id === "string" &&
    typeof demonstration.reservationId === "string" &&
    typeof demonstration.playbookId === "string" &&
    typeof demonstration.capturedAt === "string" &&
    Number.isFinite(Date.parse(demonstration.capturedAt)) &&
    Array.isArray(demonstration.actions) &&
    demonstration.actions.every(isAction)
  );
}

function isPlaybook(value: unknown): value is PublishedPlaybook {
  if (typeof value !== "object" || value === null) return false;
  const playbook = value as Record<string, unknown>;
  return (
    typeof playbook.id === "string" &&
    typeof playbook.sourceDemonstrationId === "string" &&
    isBoundary(playbook.boundary) &&
    Array.isArray(playbook.actions) &&
    playbook.actions.every(isAction)
  );
}

export function isTeachingJourney(value: unknown): value is TeachingJourney {
  if (typeof value !== "object" || value === null) return false;
  const journey = value as Record<string, unknown>;
  const stage = String(journey.stage);
  const teachingDemonstrationId = journey.teachingDemonstrationId;
  const demonstrations = Array.isArray(journey.demonstrations)
    ? journey.demonstrations
    : [];
  const demonstrationsAreValid =
    Array.isArray(journey.demonstrations) &&
    demonstrations.every(isDemonstration) &&
    new Set(
      demonstrations.map(
        (demonstration) => (demonstration as Demonstration).id,
      ),
    ).size === demonstrations.length;
  const demonstrationById = new Map(
    demonstrations.map((demonstration) => {
      const typed = demonstration as Demonstration;
      return [typed.id, typed] as const;
    }),
  );
  const draft = journey.draft as Record<string, unknown> | null;
  const draftPlaybookId = draft?.playbookId as PlaybookId | undefined;
  const draftDemonstration =
    typeof draft?.sourceDemonstrationId === "string"
      ? demonstrationById.get(draft.sourceDemonstrationId)
      : undefined;
  const draftDefinition = draftPlaybookId
    ? PLAYBOOK_DEFINITIONS[draftPlaybookId]
    : undefined;
  const draftIsValid =
    draft === null ||
    (typeof draft === "object" &&
      typeof draft.id === "string" &&
      Boolean(draftDefinition) &&
      draft.sourceDemonstrationId === draftDefinition?.sourceDemonstrationId &&
      draftDemonstration?.playbookId === draftPlaybookId &&
      Number.isInteger(draft.ruleCount) &&
      draft.ruleCount === draftDefinition?.ruleCount &&
      isBoundary(draft.boundary) &&
      typeof draft.createdAt === "string" &&
      Number.isFinite(Date.parse(draft.createdAt)));
  const publishedAreValid =
    Array.isArray(journey.publishedPlaybooks) &&
    journey.publishedPlaybooks.every(
      (candidate) => {
        if (!isPlaybook(candidate)) return false;
        const demonstration = demonstrationById.get(
          candidate.sourceDemonstrationId,
        );
        return demonstration?.playbookId === candidate.id;
      },
    ) &&
    new Set(
      journey.publishedPlaybooks.map(
        (playbook) => (playbook as PublishedPlaybook).id,
      ),
    ).size === journey.publishedPlaybooks.length;
  const activityIsValid =
    Array.isArray(journey.activity) &&
    journey.activity.every(
      (event) =>
        typeof event === "object" &&
        event !== null &&
        typeof (event as Record<string, unknown>).id === "string" &&
        typeof (event as Record<string, unknown>).at === "string" &&
        Number.isFinite(
          Date.parse(String((event as Record<string, unknown>).at)),
        ) &&
        ["Human", "Agent", "Website"].includes(
          String((event as Record<string, unknown>).actor),
        ) &&
        typeof (event as Record<string, unknown>).summary === "string",
    );
  const teachingIdIsValid =
    teachingDemonstrationId === null ||
    (typeof teachingDemonstrationId === "string" &&
      demonstrationById.has(teachingDemonstrationId));

  return (
    journey.storageVersion === 3 &&
    ["demonstration", "draft", "reuse"].includes(stage) &&
    demonstrationsAreValid &&
    teachingIdIsValid &&
    draftIsValid &&
    publishedAreValid &&
    activityIsValid &&
    (stage === "reuse"
      ? teachingDemonstrationId === null
      : teachingDemonstrationId !== null) &&
    (stage === "draft" ? draft !== null : true)
  );
}

import { describe, expect, it } from "vitest";
import {
  AGENT_DRAFT_BOUNDARY,
  NIGHT_ARRIVAL_PLAYBOOK,
  createPublishedJourney,
  createTeachingJourney,
  draftIsPublishable,
  draftPlaybook,
  isTeachingJourney,
  publishPlaybook,
  startTeachingDemonstration,
  updateDraftBoundary,
} from "./teaching";

describe("Teachback teaching journey", () => {
  it("keeps an agent draft unpublished until a person tightens both boundaries", () => {
    const drafted = draftPlaybook(
      createTeachingJourney(),
      AGENT_DRAFT_BOUNDARY,
      new Date("2026-08-27T09:01:00.000Z"),
    );

    expect(drafted.result.code).toBe("PLAYBOOK_DRAFTED");
    expect(draftIsPublishable(drafted.state)).toBe(false);
    expect(publishPlaybook(drafted.state).result.code).toBe(
      "BOUNDARY_REVIEW_REQUIRED",
    );

    const bounded = updateDraftBoundary(
      drafted.state,
      { latestArrivalLimit: "22:00", taxiHandling: "escalate" },
      new Date("2026-08-27T09:02:00.000Z"),
    );
    expect(draftIsPublishable(bounded)).toBe(true);

    const published = publishPlaybook(
      bounded,
      new Date("2026-08-27T09:03:00.000Z"),
    );
    expect(published.result.code).toBe("PLAYBOOK_PUBLISHED");
    expect(published.state.stage).toBe("reuse");
    expect(published.state.activity.map((event) => event.actor)).toEqual([
      "Human",
      "Agent",
      "Human",
      "Human",
      "Human",
    ]);
  });

  it("creates a reproducible published shortcut and rejects malformed storage", () => {
    const published = createPublishedJourney(
      new Date("2026-08-27T09:05:00.000Z"),
    );
    expect(isTeachingJourney(published)).toBe(true);
    expect(published.publishedPlaybooks).toHaveLength(1);
    expect(published.publishedPlaybooks[0]?.boundary).toMatchObject({
      latestArrivalLimit: "22:00",
      taxiHandling: "escalate",
    });
    expect(
      isTeachingJourney({
        ...published,
        publishedPlaybooks: [{ approvalRequired: true }],
      }),
    ).toBe(false);
  });

  it("learns a second playbook from a second recorded case", () => {
    const primaryPublished = createPublishedJourney(
      new Date("2026-08-27T09:05:00.000Z"),
    );
    const nightDemonstration = primaryPublished.demonstrations.find(
      (demonstration) =>
        demonstration.playbookId === NIGHT_ARRIVAL_PLAYBOOK.id,
    )!;
    const teachingNightArrival = startTeachingDemonstration(
      primaryPublished,
      nightDemonstration.id,
    );

    expect(teachingNightArrival.stage).toBe("demonstration");
    expect(teachingNightArrival.teachingDemonstrationId).toBe(
      nightDemonstration.id,
    );

    const drafted = draftPlaybook(
      teachingNightArrival,
      NIGHT_ARRIVAL_PLAYBOOK.boundary,
      new Date("2026-08-27T09:06:00.000Z"),
    );
    expect(draftIsPublishable(drafted.state)).toBe(true);

    const published = publishPlaybook(
      drafted.state,
      new Date("2026-08-27T09:07:00.000Z"),
    );
    expect(published.result.code).toBe("PLAYBOOK_PUBLISHED");
    expect(published.state.publishedPlaybooks.map((playbook) => playbook.id)).toEqual([
      "late-arrival-care@1",
      "night-arrival-coordination@1",
    ]);
  });
});

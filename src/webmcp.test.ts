import { describe, expect, it } from "vitest";
import { approveCurrentRun } from "./application";
import type { AppState } from "./domain";
import { createInitialState } from "./fixtures";
import {
  createPublishedJourney,
  createTeachingJourney,
  type TeachingJourney,
} from "./teaching";
import { createWebMcpTools } from "./webmcp";

function harness(initialJourney = createPublishedJourney()) {
  let state = createInitialState();
  let journey = initialJourney;
  const tools = createWebMcpTools({
    getState: () => state,
    commitState: (expectedState: AppState, nextState: AppState) => {
      if (state !== expectedState) return false;
      state = nextState;
      return true;
    },
    getTeachingJourney: () => journey,
    commitTeachingJourney: (
      expectedState: TeachingJourney,
      nextState: TeachingJourney,
    ) => {
      if (journey !== expectedState) return false;
      journey = nextState;
      return true;
    },
  });
  return {
    tools,
    getState: () => state,
    setState: (next: AppState) => (state = next),
    getJourney: () => journey,
    setJourney: (next: TeachingJourney) => (journey = next),
  };
}

describe("WebMCP tool adapter", () => {
  it("reads the demonstration and accepts only a bounded unpublished draft", async () => {
    const testHarness = harness(createTeachingJourney());
    const readTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_get_latest_demonstration",
    )!;
    const draftTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_submit_playbook_draft",
    )!;
    const prepareTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_prepare_current",
    )!;

    const demonstration = JSON.parse(await readTool.execute({}));
    const drafted = JSON.parse(
      await draftTool.execute({
        latest_arrival_limit: "23:00",
        taxi_handling: "allow",
      }),
    );
    const blockedPreparation = JSON.parse(await prepareTool.execute({}));

    expect(demonstration.data.actions).toHaveLength(4);
    expect(readTool.annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(drafted.code).toBe("PLAYBOOK_DRAFTED");
    expect(testHarness.getJourney().stage).toBe("draft");
    expect(testHarness.getJourney().publishedBoundary).toBeNull();
    expect(blockedPreparation.code).toBe("PLAYBOOK_NOT_PUBLISHED");
  });

  it("supports runtimes that omit execution options", async () => {
    const testHarness = harness();
    const currentTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_get_current_case",
    )!;
    const prepareTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_prepare_current",
    )!;

    const current = JSON.parse(await currentTool.execute({}));
    const prepared = JSON.parse(await prepareTool.execute({}));

    expect(current.code).toBe("CURRENT_CASE");
    expect(prepared.code).toBe("RUN_PREPARED");
    expect(testHarness.getState().activeRun?.status).toBe("awaiting_review");
  });

  it("commits through the adapter only after matching UI approval", async () => {
    const testHarness = harness();
    const prepareTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_prepare_current",
    )!;
    const commitTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_commit_approved",
    )!;

    const prepared = JSON.parse(await prepareTool.execute({}));
    const approved = approveCurrentRun(testHarness.getState());
    testHarness.setState(approved.state);
    const committed = JSON.parse(
      await commitTool.execute({
        run_id: prepared.data.run_id,
        expected_digest: prepared.data.digest,
      }),
    );

    expect(committed.code).toBe("RUN_COMMITTED");
    expect(
      testHarness
        .getState()
        .reservations.find((reservation) => reservation.id === "R-2048")?.label,
    ).toBe("Resolved");
  });

  it("refuses commit when the published boundary changes after preparation", async () => {
    const testHarness = harness();
    const prepareTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_prepare_current",
    )!;
    const commitTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_commit_approved",
    )!;
    const prepared = JSON.parse(await prepareTool.execute({}));
    testHarness.setState(approveCurrentRun(testHarness.getState()).state);
    const changedJourney = structuredClone(testHarness.getJourney());
    changedJourney.publishedBoundary!.latestArrivalLimit = "23:00";
    testHarness.setJourney(changedJourney);

    const result = JSON.parse(
      await commitTool.execute({
        run_id: prepared.data.run_id,
        expected_digest: prepared.data.digest,
      }),
    );

    expect(result.code).toBe("PUBLISHED_BOUNDARY_CHANGED");
    expect(testHarness.getState().activeRun?.status).toBe("approved");
  });

  it("honors an already-aborted execution signal", async () => {
    const testHarness = harness();
    const prepareTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_prepare_current",
    )!;
    const controller = new AbortController();
    controller.abort();

    await expect(
      prepareTool.execute({}, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(testHarness.getState().activeRun).toBeNull();
  });

  it("does not overwrite newer state when preparation finishes late", async () => {
    const testHarness = harness();
    const prepareTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_prepare_current",
    )!;

    const preparation = prepareTool.execute({});
    const newerState = {
      ...testHarness.getState(),
      selectedReservationId: "R-2052",
    };
    testHarness.setState(newerState);
    const result = JSON.parse(await preparation);

    expect(result.code).toBe("STALE_CONTEXT");
    expect(testHarness.getState()).toBe(newerState);
    expect(testHarness.getState().activeRun).toBeNull();
  });
});

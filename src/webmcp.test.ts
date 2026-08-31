import { describe, expect, it } from "vitest";
import { approveCurrentRun, runForReservation, selectReservation } from "./application";
import type { AppState } from "./domain";
import { createInitialState } from "./fixtures";
import {
  NIGHT_ARRIVAL_PLAYBOOK,
  createPublishedJourney,
  createTeachingJourney,
  startTeachingDemonstration,
  type TeachingJourney,
} from "./teaching";
import { createWebMcpTools } from "./webmcp";

function harness(initialJourney = createPublishedJourney(), isCurrentCaseVisible?: () => boolean) {
  let state = createInitialState();
  let journey = initialJourney;
  const calls: Array<{ name: string; code: string }> = [];
  const tools = createWebMcpTools({
    getState: () => state,
    isCurrentCaseVisible,
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
    reportWebMcpCall: (call: { name: string; code: string }) => calls.push(call),
  });
  return {
    tools,
    calls,
    getState: () => state,
    setState: (next: AppState) => (state = next),
    getJourney: () => journey,
    setJourney: (next: TeachingJourney) => (journey = next),
  };
}

describe("WebMCP tool adapter", () => {
  it.each([
    "teachback_get_current_case",
    "teachback_prepare_current",
    "teachback_commit_approved",
  ])("does not expose or change the previous case when it is no longer visible: %s", async (toolName) => {
    let visible = true;
    const h = harness(createPublishedJourney(), () => visible);
    const prepared = JSON.parse(await h.tools.find(tool => tool.name === "teachback_prepare_current")!.execute({}));
    h.setState(approveCurrentRun(h.getState()).state);
    const state = h.getState();
    const journey = h.getJourney();
    visible = false;
    const result = JSON.parse(await h.tools.find(tool => tool.name === toolName)!.execute({
      run_id: prepared.data.run_id,
      expected_digest: prepared.data.digest,
    }));
    expect(result).toMatchObject({ ok: false, code: "CASE_NOT_VISIBLE" });
    expect(result.data).toBeUndefined();
    expect(h.getState()).toBe(state);
    expect(h.getJourney()).toBe(journey);
    expect(h.calls.at(-1)).toEqual({ name: toolName, code: "CASE_NOT_VISIBLE" });
    visible = true;
    expect(JSON.parse(await h.tools.find(tool => tool.name === "teachback_get_current_case")!.execute({})).code).toBe("CURRENT_CASE");
  });

  it.each(["teachback_prepare_current", "teachback_commit_approved"])("rechecks case visibility after asynchronous verification: %s", async (toolName) => {
    let visible = true;
    const h = harness(createPublishedJourney(), () => visible);
    const prepare = h.tools.find(tool => tool.name === "teachback_prepare_current")!;
    const prepared = JSON.parse(await prepare.execute({}));
    h.setState(approveCurrentRun(h.getState()).state);
    const state = h.getState();
    const pending = h.tools.find(tool => tool.name === toolName)!.execute({
      run_id: prepared.data.run_id,
      expected_digest: prepared.data.digest,
    });
    visible = false;
    const result = JSON.parse(await pending);
    expect(result.code).toBe("CASE_NOT_VISIBLE");
    expect(h.getState()).toBe(state);
    expect(runForReservation(h.getState())?.status).toBe("approved");
  });

  it("keeps teaching tools available while the reservation workspace is hidden", async () => {
    const h = harness(createTeachingJourney(), () => false);
    const demonstration = JSON.parse(await h.tools.find(tool => tool.name === "teachback_get_latest_demonstration")!.execute({}));
    expect(demonstration.code).toBe("DEMONSTRATION_FOUND");
    const drafted = JSON.parse(await h.tools.find(tool => tool.name === "teachback_submit_playbook_draft")!.execute({
      latest_arrival_limit: "23:00",
      taxi_handling: "allow",
    }));
    expect(drafted.code).toBe("PLAYBOOK_DRAFTED");
    expect(h.getJourney().stage).toBe("draft");
  });

  it("refuses an unsafe case against a published rule with reasons and audit", async () => {
    const h = harness();
    h.setState(selectReservation(h.getState(), "R-2060"));
    const result = JSON.parse(await h.tools.find(t => t.name === "teachback_prepare_current")!.execute({}));
    expect(result.code).toBe("PLAYBOOK_NOT_APPLICABLE");
    expect(result.reasons).toContain("Compensation requests are outside this playbook.");
    expect(h.getState().rejectionsByReservationId["R-2060"]?.playbookId).toBe("late-arrival-care@1");
    expect(h.getState().audit.at(-1)?.summary).toContain("Rejected");
    expect(runForReservation(h.getState())).toBeNull();
  });

  it("retains approval across navigation without exposing or committing another case's run", async () => {
    const h = harness();
    const prepare = h.tools.find(t => t.name === "teachback_prepare_current")!;
    const current = h.tools.find(t => t.name === "teachback_get_current_case")!;
    const commit = h.tools.find(t => t.name === "teachback_commit_approved")!;
    const preview = JSON.parse(await prepare.execute({}));
    h.setState(approveCurrentRun(h.getState()).state);
    h.setState(selectReservation(h.getState(), "R-2054"));
    expect(JSON.parse(await current.execute({})).data.active_run).toBeNull();
    const input = { run_id: preview.data.run_id, expected_digest: preview.data.digest };
    expect(JSON.parse(await commit.execute(input)).code).toBe("RUN_NOT_FOUND");
    h.setState(selectReservation(h.getState(), "R-2048"));
    expect(JSON.parse(await current.execute({})).data.active_run).toMatchObject({ run_id: input.run_id, status: "approved" });
    expect(JSON.parse(await commit.execute(input)).code).toBe("RUN_COMMITTED");
    h.setState(selectReservation(selectReservation(h.getState(), "R-2050"), "R-2048"));
    expect(JSON.parse(await commit.execute(input)).code).toBe("RUN_ALREADY_COMMITTED");
  });

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
    expect(testHarness.getJourney().activity.at(-1)?.actor).toBe("Agent");
    expect(testHarness.getJourney().stage).toBe("draft");
    expect(testHarness.getJourney().publishedPlaybooks).toHaveLength(0);
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
    expect(testHarness.getState().audit.at(-1)?.actor).toBe("Agent");
    expect(prepared.code).toBe("RUN_PREPARED");
    expect(runForReservation(testHarness.getState())?.status).toBe("awaiting_review");
    expect(testHarness.calls).toEqual([
      { name: "teachback_get_current_case", code: "CURRENT_CASE" },
      { name: "teachback_prepare_current", code: "RUN_PREPARED" },
    ]);
  });

  it("reads and drafts the second recorded demonstration separately", async () => {
    const published = createPublishedJourney();
    const nightDemonstration = published.demonstrations.find(
      (demonstration) =>
        demonstration.playbookId === NIGHT_ARRIVAL_PLAYBOOK.id,
    )!;
    const secondTeaching = startTeachingDemonstration(
      published,
      nightDemonstration.id,
    );
    const testHarness = harness(secondTeaching);
    const readTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_get_latest_demonstration",
    )!;
    const draftTool = testHarness.tools.find(
      (tool) => tool.name === "teachback_submit_playbook_draft",
    )!;

    const demonstration = JSON.parse(await readTool.execute({}));
    const drafted = JSON.parse(
      await draftTool.execute({
        latest_arrival_limit: "23:59",
        taxi_handling: "allow",
        dietary_handling: "allow",
        compensation_handling: "allow",
      }),
    );

    expect(demonstration.data.source_reservation_id).toBe("R-2050");
    expect(demonstration.data.actions).toHaveLength(6);
    expect(drafted.code).toBe("PLAYBOOK_DRAFTED");
    expect(testHarness.getJourney().draft?.playbookId).toBe(
      NIGHT_ARRIVAL_PLAYBOOK.id,
    );
    expect(
      testHarness.getJourney().draft?.boundary.compensationHandling,
    ).toBe("allow");
    expect(testHarness.getJourney().publishedPlaybooks).toHaveLength(1);
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
        .reservations.find((reservation) => reservation.id === "R-2048")
        ?.estimatedArrivalTime,
    ).toBe("20:45");
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
    changedJourney.publishedPlaybooks[0]!.boundary.latestArrivalLimit = "23:00";
    testHarness.setJourney(changedJourney);

    const result = JSON.parse(
      await commitTool.execute({
        run_id: prepared.data.run_id,
        expected_digest: prepared.data.digest,
      }),
    );

    expect(result.code).toBe("PUBLISHED_BOUNDARY_CHANGED");
    expect(runForReservation(testHarness.getState())?.status).toBe("approved");
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
    expect(runForReservation(testHarness.getState())).toBeNull();
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
    expect(runForReservation(testHarness.getState())).toBeNull();
  });
});

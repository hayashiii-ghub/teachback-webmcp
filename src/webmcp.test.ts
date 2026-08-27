import { describe, expect, it } from "vitest";
import { approveCurrentRun } from "./application";
import type { AppState } from "./domain";
import { createInitialState } from "./fixtures";
import { createWebMcpTools } from "./webmcp";

function harness() {
  let state = createInitialState();
  const tools = createWebMcpTools({
    getState: () => state,
    commitState: (expectedState: AppState, nextState: AppState) => {
      if (state !== expectedState) return false;
      state = nextState;
      return true;
    },
  });
  return { tools, getState: () => state, setState: (next: AppState) => (state = next) };
}

describe("WebMCP tool adapter", () => {
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

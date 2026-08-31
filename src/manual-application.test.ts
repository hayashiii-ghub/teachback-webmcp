import { describe, expect, it, vi } from "vitest";
import {
  approveAndCommitCurrentRun,
  approveCurrentRun,
  commitPublishedRun,
  prepareCurrentRun,
  runForReservation,
  selectReservation,
} from "./application";
import { createInitialState } from "./fixtures";
import { LATE_ARRIVAL_PLAYBOOK } from "./teaching";

const now = new Date("2026-08-31T10:00:00.000Z");
const published = [LATE_ARRIVAL_PLAYBOOK];
async function preview() {
  const { state } = await prepareCurrentRun(createInitialState(), now);
  const run = runForReservation(state)!;
  return { state, input: { runId: run.id, expectedDigest: run.digest } };
}

describe("applying a reviewed proposal in the UI", () => {
  it.each(["human", "agent"])("rejects %s application if the approval expires while the digest is being verified", async (actor) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      const { state, input } = await preview();
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
        const result = await digest(...args);
        vi.setSystemTime(new Date(now.getTime() + 300_000));
        return result;
      });
      const applied = actor === "human"
        ? await approveAndCommitCurrentRun(state, input, published, now)
        : await commitPublishedRun(approveCurrentRun(state, now).state, input, published, now);
      expect(applied.result.code).toBe("APPROVAL_EXPIRED");
      expect(applied.state.reservations).toEqual(state.reservations);
      expect(runForReservation(applied.state)?.status).toBe("stale");
      expect(applied.state.audit.some(event => event.summary.startsWith("Committed"))).toBe(false);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("can apply while verification completes within the approval window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      const { state, input } = await preview();
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
        const result = await digest(...args);
        vi.setSystemTime(new Date(now.getTime() + 299_999));
        return result;
      });
      const applied = await approveAndCommitCurrentRun(state, input, published, now);
      expect(applied.result.code).toBe("RUN_COMMITTED");
      expect(runForReservation(applied.state)?.approvalExpiresAt).toBe(new Date(now.getTime() + 300_000).toISOString());
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("approves and applies only the displayed reservation once, attributed to the person", async () => {
    const { state, input } = await preview();
    const applied = await approveAndCommitCurrentRun(state, input, published, now);
    expect(applied.result.code).toBe("RUN_COMMITTED");
    expect(runForReservation(applied.state)?.status).toBe("committed");
    expect(applied.state.reservations.find(r => r.id === "R-2048")).toMatchObject({
      estimatedArrivalTime: "20:45", version: 2,
    });
    expect(applied.state.reservations.filter(r => r.id !== "R-2048"))
      .toEqual(state.reservations.filter(r => r.id !== "R-2048"));
    expect(applied.state.audit.slice(-2).map(event => event.actor)).toEqual(["Human", "Human"]);
    const replay = await approveAndCommitCurrentRun(applied.state, input, published, now);
    expect(replay.result.code).toBe("RUN_ALREADY_COMMITTED");
    expect(replay.state).toBe(applied.state);
  });

  it("applies an existing approval without approving again or renewing its expiry", async () => {
    const { state, input } = await preview();
    const approved = approveCurrentRun(state, now).state;
    const applied = await approveAndCommitCurrentRun(approved, input, published, new Date(now.getTime() + 60_000));
    expect(applied.result.ok).toBe(true);
    expect(runForReservation(applied.state)?.approvalExpiresAt).toBe(runForReservation(approved)?.approvalExpiresAt);
    expect(applied.state.audit).toHaveLength(approved.audit.length + 1);
  });

  it("requires a new preview after an existing approval expires", async () => {
    const { state, input } = await preview();
    const approved = approveCurrentRun(state, now).state;
    const result = await approveAndCommitCurrentRun(approved, input, published, new Date(now.getTime() + 300_000));
    expect(result.result.code).toBe("APPROVAL_EXPIRED");
    expect(result.state.reservations).toEqual(state.reservations);
    expect(runForReservation(result.state)?.status).toBe("stale");
  });

  it("does not approve another proposal after the selected case changes", async () => {
    const { state, input } = await preview();
    const other = (await prepareCurrentRun(selectReservation(state, "R-2054"), now)).state;
    const result = await approveAndCommitCurrentRun(other, input, published, now);
    expect(result.result.code).toBe("RUN_NOT_FOUND");
    expect(result.state).toBe(other);
    expect(runForReservation(result.state)?.approvedAt).toBeNull();
  });

  it("does not approve a digest other than the displayed preview", async () => {
    const { state, input } = await preview();
    const result = await approveAndCommitCurrentRun(state, { ...input, expectedDigest: "changed" }, published, now);
    expect(result.result.code).toBe("DIGEST_MISMATCH");
    expect(result.state).toBe(state);
  });

  it.each(["human", "agent"])("enforces the published boundary for the %s path", async (actor) => {
    const { state, input } = await preview();
    const changed = [{ ...LATE_ARRIVAL_PLAYBOOK, boundary: { ...LATE_ARRIVAL_PLAYBOOK.boundary, latestArrivalLimit: "23:00" as const } }];
    const result = actor === "human"
      ? await approveAndCommitCurrentRun(state, input, changed, now)
      : await commitPublishedRun(approveCurrentRun(state, now).state, input, changed, now);
    expect(result.result.code).toBe("PUBLISHED_BOUNDARY_CHANGED");
    expect(result.state.reservations).toEqual(state.reservations);
  });

  it("revalidates reservation changes and tampered preview content before applying", async () => {
    const { state, input } = await preview();
    const changed = { ...state, reservations: state.reservations.map(r => r.id === "R-2048" ? { ...r, version: r.version + 1 } : r) };
    const result = await approveAndCommitCurrentRun(changed, input, published, now);
    expect(result.result.code).toBe("CASE_STATE_CHANGED");
    expect(result.state.reservations).toEqual(changed.reservations);
    const tampered = structuredClone(state);
    tampered.runsByReservationId["R-2048"].after.estimatedArrivalTime = "23:59";
    const rejected = await approveAndCommitCurrentRun(tampered, input, published, now);
    expect(rejected.result.code).toBe("DIGEST_MISMATCH");
    expect(rejected.state.reservations).toEqual(state.reservations);
  });
});

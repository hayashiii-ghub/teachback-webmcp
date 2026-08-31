import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "./fixtures";
import { createPublishedJourney } from "./teaching";
import {
  persistSession,
  STORAGE_KEY,
  TEACHING_STORAGE_KEY,
  TEACHING_SCENARIO_VERSION_KEY,
  TEACHING_SCENARIO_VERSION,
} from "./persistence";

function memoryStorage(entries: [string, string][] = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

const previousEntries: [string, string][] = [
  [STORAGE_KEY, "previous reservation state"],
  [TEACHING_STORAGE_KEY, "previous teaching journey"],
  [TEACHING_SCENARIO_VERSION_KEY, "4"],
];

describe("session persistence", () => {
  it("saves both current snapshots and their scenario version without mutating either", () => {
    const storage = memoryStorage([["teachback-ui-locale-v1", "ja"]]);
    const state = createInitialState();
    const journey = createPublishedJourney();
    const before = structuredClone({ state, journey });

    expect(persistSession(storage, state, journey)).toEqual({ ok: true });
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual(state);
    expect(JSON.parse(storage.values.get(TEACHING_STORAGE_KEY)!)).toEqual(journey);
    expect(storage.values.get(TEACHING_SCENARIO_VERSION_KEY)).toBe(TEACHING_SCENARIO_VERSION);
    expect(storage.values.get("teachback-ui-locale-v1")).toBe("ja");
    expect({ state, journey }).toEqual(before);
  });

  it("does not reset an in-memory journey when its stored scenario marker is missing", () => {
    const storage = memoryStorage();
    const journey = createPublishedJourney();
    journey.stage = "demonstration";

    expect(persistSession(storage, createInitialState(), journey)).toEqual({ ok: true });
    expect(JSON.parse(storage.values.get(TEACHING_STORAGE_KEY)!)).toEqual(journey);
  });

  it("does not write anything if the previous values cannot be read", () => {
    const storage = memoryStorage(previousEntries);
    storage.getItem.mockImplementationOnce(() => { throw new Error("Storage denied"); });

    expect(persistSession(storage, createInitialState(), createPublishedJourney()))
      .toEqual({ ok: false, reason: "read", partialWrite: false });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect([...storage.values]).toEqual(previousEntries);
  });

  it("reports a first-write failure without replacing the saved session", () => {
    const storage = memoryStorage(previousEntries);
    storage.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });

    expect(persistSession(storage, createInitialState(), createPublishedJourney()))
      .toEqual({ ok: false, reason: "write", partialWrite: false });
    expect([...storage.values]).toEqual(previousEntries);
  });

  it("restores prior values if a later key fails to save", () => {
    const storage = memoryStorage(previousEntries);
    storage.setItem
      .mockImplementationOnce((key, value) => { storage.values.set(key, value); })
      .mockImplementationOnce(() => { throw new Error("Quota exceeded"); });

    expect(persistSession(storage, createInitialState(), createPublishedJourney()))
      .toEqual({ ok: false, reason: "write", partialWrite: false });
    expect([...storage.values]).toEqual(previousEntries);
  });

  it("removes newly introduced keys when rolling back an incomplete first save", () => {
    const storage = memoryStorage();
    storage.setItem
      .mockImplementationOnce((key, value) => { storage.values.set(key, value); })
      .mockImplementationOnce(() => { throw new Error("Quota exceeded"); });

    expect(persistSession(storage, createInitialState(), createPublishedJourney()))
      .toEqual({ ok: false, reason: "write", partialWrite: false });
    expect(storage.values.size).toBe(0);
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("restores both snapshots when writing their scenario marker fails", () => {
    const storage = memoryStorage(previousEntries);
    storage.setItem
      .mockImplementationOnce((key, value) => { storage.values.set(key, value); })
      .mockImplementationOnce((key, value) => { storage.values.set(key, value); })
      .mockImplementationOnce(() => { throw new Error("Scenario write denied"); });

    expect(persistSession(storage, createInitialState(), createPublishedJourney()))
      .toEqual({ ok: false, reason: "write", partialWrite: false });
    expect([...storage.values]).toEqual(previousEntries);
    expect(storage.setItem.mock.calls.slice(-2)).toEqual([
      previousEntries[1], previousEntries[0],
    ]);
  });

  it("reports a failed removal during rollback as partial persistence", () => {
    const storage = memoryStorage();
    storage.setItem
      .mockImplementationOnce((key, value) => { storage.values.set(key, value); })
      .mockImplementationOnce(() => { throw new Error("Quota exceeded"); });
    storage.removeItem.mockImplementationOnce(() => { throw new Error("Removal denied"); });

    expect(persistSession(storage, createInitialState(), createPublishedJourney()))
      .toEqual({ ok: false, reason: "write", partialWrite: true });
    expect(storage.values.has(STORAGE_KEY)).toBe(true);
  });

  it("reports partial persistence when rollback itself fails and still attempts other keys", () => {
    const storage = memoryStorage(previousEntries);
    storage.setItem
      .mockImplementationOnce((key, value) => { storage.values.set(key, value); })
      .mockImplementationOnce((key, value) => { storage.values.set(key, value); })
      .mockImplementationOnce(() => { throw new Error("Scenario write denied"); })
      .mockImplementationOnce(() => { throw new Error("Journey rollback denied"); });

    expect(persistSession(storage, createInitialState(), createPublishedJourney()))
      .toEqual({ ok: false, reason: "write", partialWrite: true });
    expect(storage.values.get(STORAGE_KEY)).toBe(previousEntries[0][1]);
    expect(storage.values.get(TEACHING_STORAGE_KEY)).not.toBe(previousEntries[1][1]);
    expect(storage.values.get(TEACHING_SCENARIO_VERSION_KEY)).toBe("4");
  });

  it("retries the supplied current snapshots without falling back to default work", () => {
    const storage = memoryStorage(previousEntries);
    const state = createInitialState();
    state.selectedReservationId = "R-2050";
    const journey = createPublishedJourney();
    journey.stage = "demonstration";
    storage.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });

    expect(persistSession(storage, state, journey).ok).toBe(false);
    expect(persistSession(storage, state, journey)).toEqual({ ok: true });
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual(state);
    expect(JSON.parse(storage.values.get(TEACHING_STORAGE_KEY)!)).toEqual(journey);
  });

  it("reports serialization errors before touching browser storage", () => {
    const storage = memoryStorage(previousEntries);
    const state = createInitialState();
    Object.defineProperty(state, "toJSON", { value: () => { throw new Error("Cannot serialize"); } });

    expect(persistSession(storage, state, createPublishedJourney()))
      .toEqual({ ok: false, reason: "serialize", partialWrite: false });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

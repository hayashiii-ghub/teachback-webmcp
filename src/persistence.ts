import type { AppState } from "./domain";
import type { TeachingJourney } from "./teaching";

export const STORAGE_KEY = "teachback-demo-v1";
export const TEACHING_STORAGE_KEY = "teachback-teaching-v4";
export const TEACHING_SCENARIO_VERSION_KEY = "teachback-teaching-scenario-version";
export const TEACHING_SCENARIO_VERSION = "5";

export type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type PersistenceResult =
  | { ok: true }
  | {
      ok: false;
      reason: "serialize" | "read" | "write";
      /** Some values may differ from the last complete save because rollback failed. */
      partialWrite: boolean;
    };

/**
 * Save the current session, never replace in-memory work with storage defaults.
 * The existing keys are kept for compatibility. Web Storage has no multi-key
 * transaction, so an incomplete write is rolled back on a best-effort basis and
 * an unsuccessful rollback is reported explicitly to the caller.
 *
 * A reset should call this with fresh state/journey before changing the UI, and
 * only complete the in-memory reset after an `ok` result.
 */
export function persistSession(
  storage: SessionStorage,
  state: AppState,
  journey: TeachingJourney,
): PersistenceResult {
  let entries: [string, string][];
  try {
    entries = [
      [STORAGE_KEY, JSON.stringify(state)],
      [TEACHING_STORAGE_KEY, JSON.stringify(journey)],
      [TEACHING_SCENARIO_VERSION_KEY, TEACHING_SCENARIO_VERSION],
    ];
  } catch {
    return { ok: false, reason: "serialize", partialWrite: false };
  }

  let previous: [string, string | null][];
  try {
    // Capture every old value before the first write, including an absent key.
    previous = entries.map(([key]) => [key, storage.getItem(key)]);
  } catch {
    return { ok: false, reason: "read", partialWrite: false };
  }

  let writtenCount = 0;
  try {
    for (const [key, value] of entries) {
      storage.setItem(key, value);
      writtenCount += 1;
    }
    return { ok: true };
  } catch {
    let partialWrite = false;
    // A throwing Web Storage setItem leaves that key unchanged. Restore only
    // the preceding successful writes, continuing if one restoration fails.
    for (let index = writtenCount - 1; index >= 0; index -= 1) {
      const [key, value] = previous[index];
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        partialWrite = true;
      }
    }
    return { ok: false, reason: "write", partialWrite };
  }
}

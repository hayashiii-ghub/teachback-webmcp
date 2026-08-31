import type { Actor, AuditEvent, Result, SessionState, Transition } from "./domain";
export function canonical(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object")
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
    return JSON.stringify(value) ?? "null";
}
export async function digest(value: unknown): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export function failure<T = unknown>(state: SessionState, code: string, summary: string, issues?: Result<T>["issues"]): Transition<T> {
    return { state, result: { ok: false, code, summary, ...(issues ? { issues } : {}) } };
}
export function success<T>(state: SessionState, code: string, summary: string, data: T): Transition<T> {
    return { state, result: { ok: true, code, summary, data } };
}
export function evolve(state: SessionState, patch: Partial<SessionState>, event?: Omit<AuditEvent, "id" | "at"> & {
    at?: string;
}): SessionState {
    return { ...state, ...patch, revision: state.revision + 1, audit: event ? [{ ...event, id: crypto.randomUUID(), at: event.at ?? new Date().toISOString() }, ...state.audit] : patch.audit ?? state.audit };
}
export function event(actor: Actor, eventType: string, summary: string, fields: Partial<AuditEvent> = {}) {
    return { actor, eventType, summary, ...fields };
}
export function timeMinutes(value: unknown): number | null {
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
        return null;
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
}
export function validDate(value: unknown): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

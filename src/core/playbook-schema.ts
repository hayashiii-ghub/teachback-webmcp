import type { Command, CommandType, Demonstration, Issue, PlaybookStep, Proposal, Reservation, Result, TextToken } from "./domain";
import { timeMinutes, validDate } from "./common";
import { executeCommand } from "./commands";
import { effectiveCommands } from "./recording";
import { evaluatePolicy } from "./playbook-policy";

const text = (maxLength: number, minLength = 1) => ({ type: "string", minLength, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const caseField = (field: string) => object({ kind: { const: "case_field" }, field: { const: field } });
const evidence = { id: text(128), evidenceCommandIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: text(128) }, rationale: text(500) };
const tokenSchema = { oneOf: [object({ kind: { const: "literal" }, value: text(1000, 0) }), object({ kind: { const: "case_field" }, field: { enum: ["guestDisplayName", "requestedArrivalTime"] } })] };
const stepSchema = (type: CommandType, input: unknown) => object({ ...evidence, type: { const: type }, input });

export const PROPOSAL_SCHEMA = object({
  name: text(80), purpose: text(500),
  steps: { type: "array", minItems: 1, maxItems: 4, items: { oneOf: [
    stepSchema("set_estimated_arrival", object({ date: caseField("requestedArrivalDate"), time: caseField("requestedArrivalTime") })),
    stepSchema("set_meal_service", object({ kind: { const: "literal" }, value: { const: "late_meal_box" } })),
    stepSchema("draft_guest_message", object({ template: { type: "array", minItems: 1, maxItems: 64, items: tokenSchema } })),
    stepSchema("add_shift_handoff", object({ template: { type: "array", minItems: 1, maxItems: 64, items: tokenSchema } })),
  ] } },
  proposedBoundary: object({ latestArrivalTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" } }),
  unresolvedQuestions: { type: "array", maxItems: 10, items: text(500) },
});

const TYPES: CommandType[] = ["set_estimated_arrival", "set_meal_service", "draft_guest_message", "add_shift_handoff"];
const affectedFields: Record<CommandType, (keyof Reservation)[]> = {
  set_estimated_arrival: ["estimatedArrivalDate", "estimatedArrivalTime"], set_meal_service: ["mealService"],
  draft_guest_message: ["guestMessageDraft"], add_shift_handoff: ["shiftHandoff"],
};
function problem(path: string, code: string, message: string): Issue { return { path, code, message }; }
function rejected<T>(issues: Issue[]): Result<T> { return { ok: false, code: "INVALID_DRAFT", summary: "The proposal contains invalid input. Correct the indicated fields.", issues }; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> { return record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function boundedText(value: unknown, max: number, allowEmpty = false): value is string { return typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0); }
function jsonValue(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (!Array.isArray(value) && !record(value)) return false;
  if (Reflect.ownKeys(value).some(key => typeof key !== "string")) return false;
  if (Array.isArray(value) && (Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index)))) return false;
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid = Object.entries(descriptors).every(([key, descriptor]) => !descriptor.get && !descriptor.set
    && (descriptor.enumerable || (Array.isArray(value) && key === "length"))
    && jsonValue(descriptor.value, seen, depth + 1));
  seen.delete(value);
  return valid;
}
function fieldRef(input: unknown, field: string): boolean { return exactKeys(input, ["kind", "field"]) && input.kind === "case_field" && input.field === field; }
function validToken(input: unknown): input is TextToken {
  return (exactKeys(input, ["kind", "value"]) && input.kind === "literal" && boundedText(input.value, 1000, true))
    || (exactKeys(input, ["kind", "field"]) && input.kind === "case_field" && (input.field === "guestDisplayName" || input.field === "requestedArrivalTime"));
}

/** Standalone JSON-shape validation, also used by persisted-state loading. */
export function validateProposalInput(input: unknown): Result<Proposal> {
  try {
    if (!jsonValue(input)) return rejected([problem("proposal", "INVALID_JSON_VALUE", "Provide plain JSON values with no cycles, accessors, or unsupported values.")]);
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 16 * 1024) return rejected([problem("proposal", "INPUT_TOO_LARGE", "The whole proposal must fit within 16 KiB.")]);
  } catch { return rejected([problem("proposal", "INVALID_JSON_VALUE", "The proposal must be readable plain JSON.")]); }
  if (!exactKeys(input, ["name", "purpose", "steps", "proposedBoundary", "unresolvedQuestions"])) return rejected([problem("proposal", "UNKNOWN_OR_MISSING_FIELD", "Provide exactly name, purpose, steps, proposedBoundary, and unresolvedQuestions.")]);
  const issues: Issue[] = [];
  if (!boundedText(input.name, 80)) issues.push(problem("name", "INVALID_TEXT", "Provide a non-empty name of at most 80 characters."));
  if (!boundedText(input.purpose, 500)) issues.push(problem("purpose", "INVALID_TEXT", "Provide a non-empty purpose of at most 500 characters."));
  if (!exactKeys(input.proposedBoundary, ["latestArrivalTime"]) || timeMinutes(input.proposedBoundary.latestArrivalTime) === null) issues.push(problem("proposedBoundary", "INVALID_BOUNDARY", "Provide only latestArrivalTime in HH:mm format; fixed safeguards cannot be changed."));
  if (!Array.isArray(input.unresolvedQuestions) || input.unresolvedQuestions.length > 10 || input.unresolvedQuestions.some(question => !boundedText(question, 500))) issues.push(problem("unresolvedQuestions", "INVALID_QUESTIONS", "Provide up to 10 non-empty questions of at most 500 characters each."));
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 4) issues.push(problem("steps", "INVALID_STEPS", "Provide between one and four recorded action types."));
  else {
    const ids = new Set<string>(); const types = new Set<string>();
    input.steps.forEach((step: unknown, index: number) => {
      const path = `steps[${index}]`;
      if (!exactKeys(step, ["id", "type", "input", "evidenceCommandIds", "rationale"])) { issues.push(problem(path, "UNKNOWN_OR_MISSING_FIELD", "Provide exactly id, type, input, evidenceCommandIds, and rationale.")); return; }
      if (!boundedText(step.id, 128) || ids.has(step.id)) issues.push(problem(`${path}.id`, "INVALID_STEP_ID", "Each step requires a unique, non-empty ID of at most 128 characters."));
      else ids.add(step.id);
      if (!boundedText(step.rationale, 500)) issues.push(problem(`${path}.rationale`, "INVALID_TEXT", "Explain the recorded evidence and binding in at most 500 characters."));
      if (!Array.isArray(step.evidenceCommandIds) || step.evidenceCommandIds.length < 1 || step.evidenceCommandIds.length > 100 || step.evidenceCommandIds.some(id => !boundedText(id, 128)) || new Set(step.evidenceCommandIds).size !== step.evidenceCommandIds.length) issues.push(problem(`${path}.evidenceCommandIds`, "INVALID_EVIDENCE", "Provide unique recorded command IDs, between one and 100."));
      if (typeof step.type !== "string" || !TYPES.includes(step.type as CommandType) || types.has(step.type)) { issues.push(problem(`${path}.type`, "UNSUPPORTED_OR_REPEATED_ACTION", "Only the four allowed action types are accepted, each at most once.")); return; }
      types.add(step.type);
      let valid = false;
      if (step.type === "set_estimated_arrival") valid = exactKeys(step.input, ["date", "time"]) && fieldRef(step.input.date, "requestedArrivalDate") && fieldRef(step.input.time, "requestedArrivalTime");
      else if (step.type === "set_meal_service") valid = exactKeys(step.input, ["kind", "value"]) && step.input.kind === "literal" && step.input.value === "late_meal_box";
      else if (exactKeys(step.input, ["template"]) && Array.isArray(step.input.template)) {
        const tokens = step.input.template;
        valid = tokens.length >= 1 && tokens.length <= 64 && tokens.every(validToken)
          && tokens.reduce((length, token) => length + (token.kind === "literal" ? token.value.length : 0), 0) <= 1000;
      }
      if (!valid) issues.push(problem(`${path}.input`, "INVALID_ACTION_INPUT", "Use only this action's typed inputs and allowed case fields; text templates are limited to 1,000 literal characters."));
    });
  }
  return issues.length ? rejected(issues) : { ok: true, code: "PROPOSAL_VALID", summary: "Proposal structure is valid.", data: structuredClone(input) as unknown as Proposal };
}

export function validateProposal(input: unknown, demonstration: Demonstration): Result<Proposal> {
  const parsed = validateProposalInput(input);
  if (!parsed.ok || !parsed.data) return parsed;
  const byId = new Map(demonstration.commands.map(command => [command.id, command]));
  const issues: Issue[] = [];
  parsed.data.steps.forEach((step, index) => {
    step.evidenceCommandIds.forEach(id => {
      const command = byId.get(id);
      if (!command) issues.push(problem(`steps[${index}].evidenceCommandIds`, "EVIDENCE_NOT_FOUND", `Recorded command ${id} does not exist in this demonstration.`));
      else if (command.command.type !== step.type) issues.push(problem(`steps[${index}].evidenceCommandIds`, "EVIDENCE_ACTION_MISMATCH", "Evidence must be a recorded command of the same action type."));
    });
  });
  return issues.length ? rejected(issues) : parsed;
}

/** Resolve plain tokens only. No evaluation, HTML, object paths, or external access. */
export function resolveStep(step: PlaybookStep, reservation: Reservation): Result<Command> {
  if (step.type === "set_estimated_arrival") {
    if (!validDate(reservation.requestedArrivalDate) || timeMinutes(reservation.requestedArrivalTime) === null) return rejected([problem(step.id, "UNRESOLVED_CASE_FIELD", "A valid requested arrival date and time are required.")]);
    return { ok: true, code: "STEP_RESOLVED", summary: "Arrival fields resolved.", data: { type: step.type, input: { date: reservation.requestedArrivalDate, time: reservation.requestedArrivalTime! } } };
  }
  if (step.type === "set_meal_service") return { ok: true, code: "STEP_RESOLVED", summary: "Meal change resolved.", data: { type: step.type, input: { value: "late_meal_box" } } };
  const values: string[] = [];
  for (const token of step.input.template) {
    if (token.kind === "literal") values.push(token.value);
    else {
      const value = reservation[token.field];
      if (!boundedText(value, 1000) || (token.field === "requestedArrivalTime" && timeMinutes(value) === null)) return rejected([problem(step.id, "UNRESOLVED_CASE_FIELD", `The ${token.field} value must be known before reuse.`)]);
      values.push(value);
    }
  }
  const resolved = values.join("").replace(/\r\n?/g, "\n");
  if (!boundedText(resolved, 1000)) return rejected([problem(step.id, "INVALID_RESOLVED_TEXT", "Resolved text must be non-empty and at most 1,000 characters.")]);
  return { ok: true, code: "STEP_RESOLVED", summary: "Text template resolved.", data: { type: step.type, input: { text: resolved } } };
}

export function resolveSteps(steps: PlaybookStep[], reservation: Reservation): Result<Command[]> {
  const commands: Command[] = [];
  for (const step of steps) {
    const resolved = resolveStep(step, reservation);
    if (!resolved.ok || !resolved.data) return { ok: false, code: resolved.code, summary: resolved.summary, ...(resolved.issues ? { issues: resolved.issues } : {}) };
    commands.push(resolved.data);
  }
  return { ok: true, code: "STEPS_RESOLVED", summary: "The recorded steps have been resolved for this case.", data: commands };
}

function normalized(value: unknown): unknown { return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value; }
function literalRuns(tokens: TextToken[]): string[] {
  const runs: string[] = []; let current = "";
  for (const token of tokens) { if (token.kind === "literal") current += token.value; else { runs.push(current); current = ""; } }
  runs.push(current);
  return runs;
}
function escapedPattern(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function hasSourceName(runs: string[], source: string): boolean {
  // Only use the exact supplied name and clear whitespace-delimited components.
  // Do not invent nicknames, transliterations, or short aliases such as "May".
  const names = new Set([source, ...source.split(/[\s,]+/u)
    .map(part => part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(part => (part.match(/\p{L}/gu)?.length ?? 0) >= 4)]);
  // Japanese honorifics directly follow names, often with no further word break.
  // Keep ordinary word boundaries for other suffixes (for example Alex/Alexandra).
  return [...names].some(name => name && runs.some(run => new RegExp(`(^|[^\\p{L}\\p{N}])${escapedPattern(name)}(?=$|[^\\p{L}\\p{N}]|様|さま|さん|殿)`, "iu").test(run)));
}

function hasSourceTime(runs: string[], source: string | null): boolean {
  const minutes = timeMinutes(source);
  if (minutes === null) return false;
  const hour24 = Math.floor(minutes / 60), minute = String(minutes % 60).padStart(2, "0");
  const hour12 = hour24 % 12 || 12;
  const displayHour = (hour: number) => hour < 10 ? `0?${hour}` : String(hour);
  // Canonical/non-padded 24h and explicit AM/PM are deterministic formats of
  // the known source time. "9:30" alone is not inferred to mean 21:30.
  const noExplicitPeriod = hour24 <= 12 ? "(?!\\s*[ap]\\.?\\s*m\\.?(?=$|[^\\p{L}\\p{N}]))" : "";
  const twentyFour = new RegExp(`(^|[^0-9])${displayHour(hour24)}:${minute}${noExplicitPeriod}(?=$|[^0-9])`, "iu");
  const period = hour24 < 12 ? "a" : "p";
  const twelve = new RegExp(`(^|[^0-9])${displayHour(hour12)}${minute === "00" ? "(?::00)?" : `:${minute}`}\\s*${period}\\.?\\s*m\\.?(?=$|[^\\p{L}\\p{N}])`, "iu");
  return runs.some(run => twentyFour.test(run) || twelve.test(run));
}

/** Semantic issues are reviewable draft content; they must block publication. */
export function proposalIssues(proposal: Proposal, demo: Demonstration, businessDate: string): Issue[] {
  const issues = evaluatePolicy(demo.before, proposal.proposedBoundary, proposal.steps, businessDate);
  if (proposal.unresolvedQuestions.length) issues.push(problem("unresolvedQuestions", "UNRESOLVED_QUESTIONS", "Resolve the listed questions before publishing."));
  const finalCommands = effectiveCommands(demo);
  const finalByType = new Map(finalCommands.map(command => [command.command.type, command]));
  for (const command of finalCommands) {
    if (!proposal.steps.some(step => step.type === command.command.type)) issues.push(problem("steps", "MISSING_RECORDED_CHANGE", `Include the recorded ${command.command.type} change, or create a new demonstration.`));
  }
  let replay = structuredClone(demo.before);
  for (const [index, step] of proposal.steps.entries()) {
    const path = `steps[${index}]`;
    const finalCommand = finalByType.get(step.type);
    if (!finalCommand) issues.push(problem(path, "ACTION_NOT_DEMONSTRATED", "This action has no final effective change in the demonstration."));
    else if (!step.evidenceCommandIds.includes(finalCommand.id)) issues.push(problem(`${path}.evidenceCommandIds`, "FINAL_EVIDENCE_REQUIRED", "Include the command that produced the final recorded value."));
    if (step.type === "draft_guest_message" || step.type === "add_shift_handoff") {
      const runs = literalRuns(step.input.template);
      if (hasSourceName(runs, demo.before.guestDisplayName) || [demo.before.requestedArrivalTime, demo.after.estimatedArrivalTime].some(time => hasSourceTime(runs, time))) issues.push(problem(`${path}.input.template`, "SOURCE_VALUE_NOT_PARAMETERIZED", "A source guest name, name component, or arrival time remains literal. Replace it with an allowed case-field token. If the recorded form cannot be reproduced with that token, review and record reusable wording before publishing."));
    }
    const resolved = resolveStep(step, demo.before);
    if (!resolved.ok || !resolved.data) { issues.push(...(resolved.issues ?? [])); continue; }
    const applied = executeCommand(replay, resolved.data, replay.version);
    if (!applied.ok || !applied.data) { issues.push(...(applied.issues ?? [problem(path, "SOURCE_REPLAY_FAILED", applied.summary)])); continue; }
    replay = applied.data.reservation;
  }
  for (const type of TYPES) {
    for (const field of affectedFields[type]) {
      if (normalized(replay[field]) !== normalized(demo.after[field])) issues.push(problem(`steps.${field}`, "SOURCE_REPLAY_MISMATCH", `The proposed steps do not reproduce the recorded final ${field}. Preserve the recorded wording and use allowed variables.`));
    }
  }
  return issues;
}

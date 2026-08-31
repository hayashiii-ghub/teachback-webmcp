import type { Demonstration, OperationOptions, PlaybookDraft, Proposal, PublishedPlaybook, Result, SessionState, Transition } from "./domain";
import { canonical, digest, evolve, failure, success } from "./common";
import { demonstrationDigest } from "./recording";
import { proposalIssues, validateProposal } from "./playbook-schema";

type DraftActor = "Human" | "Agent";
export interface CreateDraftOptions extends OperationOptions { basedOn?: { id: string; version: number } }

/** Error receipts are persisted as JSON; an absent payload must not be an own undefined field. */
function withoutData(result: Result): Result<never> {
  const { data: _data, ...receipt } = result;
  return receipt;
}

async function verifiedSource(state: SessionState, demonstrationId: string, sourceDigest: string, options: OperationOptions): Promise<Result<Demonstration>> {
  const source = state.demonstrations.find(demo => demo.id === demonstrationId);
  if (!source) return { ok: false, code: "DEMONSTRATION_NOT_FOUND", summary: "The source demonstration was not found." };
  if (source.status !== "completed" || !source.completedAt || source.recordedBy !== "Human" || source.commands.length === 0 || source.commands.some(command => command.actor !== "Human")) return { ok: false, code: "DEMONSTRATION_NOT_COMPLETED", summary: "Use a completed record of a person's actual saved work." };
  if (!source.digest || source.digest !== sourceDigest) return { ok: false, code: "SOURCE_CHANGED", summary: "The source digest no longer matches. Read the demonstration again." };
  const copy = structuredClone(source);
  let recomputed: string;
  try { recomputed = await demonstrationDigest(copy); }
  catch { return { ok: false, code: "HASH_FAILED", summary: "The recorded source could not be verified. No draft changes were saved." }; }
  if (options.signal?.aborted) return { ok: false, code: "OPERATION_CANCELLED", summary: "The operation was cancelled; no draft changes were saved." };
  if (recomputed !== sourceDigest || canonical(state.demonstrations.find(demo => demo.id === demonstrationId)) !== canonical(copy)) return { ok: false, code: "SOURCE_CHANGED", summary: "The recorded source was altered; it cannot be used for drafting." };
  return { ok: true, code: "SOURCE_VERIFIED", summary: "Recorded source verified.", data: copy };
}

function actorValid(actor: unknown): actor is DraftActor { return actor === "Human" || actor === "Agent"; }
function draftConflict(state: SessionState, draft: PlaybookDraft | undefined): Transition<PlaybookDraft> {
  return { state, result: {
    ok: false, code: "DRAFT_CONFLICT",
    summary: draft ? "The draft changed. Review data.proposal and retry using data.revision with a new request_id." : "The draft is no longer available. Read the source again before creating another draft.",
    ...(draft ? { data: structuredClone(draft) } : {}),
  } };
}
function changedWhileAwaiting(state: SessionState, revision: number, options: OperationOptions): Transition | null {
  if (options.signal?.aborted) return failure(state, "OPERATION_CANCELLED", "The operation was cancelled; no changes were saved.");
  if (state.revision !== revision) return failure(state, "SESSION_CHANGED", "The session changed during validation. Refresh and try again.");
  return null;
}
function validTime(options: OperationOptions): string | null {
  const value = options.now ?? new Date().toISOString();
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

/** Accepts a proposal, never invents a prewritten one or changes a reservation. */
export async function createDraft(state: SessionState, demonstrationId: string, sourceDigest: string, input: unknown, actor: DraftActor = "Agent", options: CreateDraftOptions = {}): Promise<Transition<PlaybookDraft>> {
  if (!actorValid(actor)) return failure(state, "INVALID_ACTOR", "Drafts must come from a person or an agent.");
  if (options.signal?.aborted) return failure(state, "OPERATION_CANCELLED", "The operation was cancelled.");
  const at = validTime(options); if (!at) return failure(state, "INVALID_TIME", "Provide a valid operation timestamp.");
  const revision = state.revision;
  const source = await verifiedSource(state, demonstrationId, sourceDigest, options);
  const changed = changedWhileAwaiting(state, revision, options); if (changed) return changed as Transition<PlaybookDraft>;
  if (!source.ok || !source.data) return { state, result: withoutData(source) };
  const parsed = validateProposal(input, source.data);
  if (!parsed.ok || !parsed.data) return { state, result: withoutData(parsed) };
  if (options.basedOn && (!Number.isSafeInteger(options.basedOn.version) || !state.playbooks.some(book => book.id === options.basedOn!.id && book.version === options.basedOn!.version))) return failure(state, "PLAYBOOK_NOT_PUBLISHED", "The previous published version was not found.");
  const proposal = parsed.data;
  const draft: PlaybookDraft = {
    id: crypto.randomUUID(), revision: 1, sourceDemonstrationId: source.data.id, sourceDigest,
    proposal, originalProposal: structuredClone(proposal), createdBy: actor, changes: [],
    validationIssues: proposalIssues(proposal, source.data, state.businessDate), publishedPlaybookId: null,
    ...(options.basedOn ? { basedOn: structuredClone(options.basedOn) } : {}),
  };
  const next = evolve(state, { drafts: [...state.drafts, draft] }, { actor, eventType: "draft_created", summary: `Created a draft from the recorded work: ${proposal.name}.`, demonstrationId, draftId: draft.id, at });
  return success(next, "DRAFT_CREATED", draft.validationIssues.length ? "The draft was received and needs corrections before human publication." : "The draft was received. A person must review and publish it.", draft);
}

export async function updateDraft(state: SessionState, draftId: string, expectedRevision: number, input: unknown, actor: DraftActor = "Agent", options: OperationOptions = {}): Promise<Transition<PlaybookDraft>> {
  if (!actorValid(actor)) return failure(state, "INVALID_ACTOR", "Drafts must be edited by a person or an agent.");
  const draft = state.drafts.find(candidate => candidate.id === draftId);
  if (!draft) return failure(state, "DRAFT_NOT_FOUND", "The draft was not found.");
  if (draft.publishedPlaybookId) return failure(state, "DRAFT_ALREADY_PUBLISHED", "Create a new version instead of changing a published draft.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== draft.revision) return draftConflict(state, draft);
  const draftSnapshot = canonical(draft);
  const at = validTime(options); if (!at) return failure(state, "INVALID_TIME", "Provide a valid operation timestamp.");
  const revision = state.revision;
  const source = await verifiedSource(state, draft.sourceDemonstrationId, draft.sourceDigest, options);
  const changed = changedWhileAwaiting(state, revision, options); if (changed) return changed as Transition<PlaybookDraft>;
  const currentDraft = state.drafts.find(candidate => candidate.id === draftId);
  if (canonical(currentDraft) !== draftSnapshot) return draftConflict(state, currentDraft);
  if (!source.ok || !source.data) return { state, result: withoutData(source) };
  const parsed = validateProposal(input, source.data);
  if (!parsed.ok || !parsed.data) return { state, result: withoutData(parsed) };
  const proposal = parsed.data;
  const updated: PlaybookDraft = { ...draft, revision: draft.revision + 1, proposal, validationIssues: proposalIssues(proposal, source.data, state.businessDate), changes: [...draft.changes, { at, actor, proposal: structuredClone(proposal) }] };
  const next = evolve(state, { drafts: state.drafts.map(candidate => candidate.id === draftId ? updated : candidate) }, { actor, eventType: "draft_updated", summary: `${actor === "Human" ? "A person" : "The agent"} revised the draft: ${proposal.name}.`, demonstrationId: draft.sourceDemonstrationId, draftId, at });
  return success(next, "DRAFT_UPDATED", updated.validationIssues.length ? "The updated draft still needs corrections before publication." : "The updated draft is ready for a person's final review.", updated);
}

/** All published fields except the digest itself form its immutable content. */
export function publishedContent(playbook: PublishedPlaybook | Omit<PublishedPlaybook, "contentDigest">): Omit<PublishedPlaybook, "contentDigest"> {
  const { contentDigest: _digest, ...content } = playbook as PublishedPlaybook;
  return structuredClone(content);
}

/** Human-only application entrypoint. It is intentionally not a WebMCP tool. */
export async function publishDraft(state: SessionState, draftId: string, expectedRevision: number, confirmed: boolean, options: OperationOptions = {}): Promise<Transition<PublishedPlaybook>> {
  if (confirmed !== true) return failure(state, "HUMAN_CONFIRMATION_REQUIRED", "A person must confirm the displayed steps and boundary before publication.");
  const draft = state.drafts.find(candidate => candidate.id === draftId);
  if (!draft) return failure(state, "DRAFT_NOT_FOUND", "The draft was not found.");
  if (draft.publishedPlaybookId) return failure(state, "DRAFT_ALREADY_PUBLISHED", "This draft has already been published. Create a new version to make changes.");
  if (!Number.isSafeInteger(expectedRevision) || draft.revision !== expectedRevision) return failure(state, "DRAFT_CONFLICT", "The draft changed. Review the latest revision before publishing.");
  const draftSnapshot = canonical(draft);
  const at = validTime(options); if (!at) return failure(state, "INVALID_TIME", "Provide a valid operation timestamp.");
  const revision = state.revision;
  const source = await verifiedSource(state, draft.sourceDemonstrationId, draft.sourceDigest, options);
  let changed = changedWhileAwaiting(state, revision, options); if (changed) return changed as Transition<PublishedPlaybook>;
  if (canonical(state.drafts.find(candidate => candidate.id === draftId)) !== draftSnapshot) return failure(state, "DRAFT_CONFLICT", "The draft changed during validation. Review it again before publishing.");
  if (!source.ok || !source.data) return { state, result: withoutData(source) };
  const parsed = validateProposal(draft.proposal, source.data);
  if (!parsed.ok || !parsed.data) return { state, result: withoutData(parsed) };
  const issues = proposalIssues(parsed.data, source.data, state.businessDate);
  if (issues.length) return failure(state, "DRAFT_REQUIRES_REVIEW", "Resolve the source, steps, and safety issues before publishing.", issues);
  const previous = draft.basedOn ? state.playbooks.filter(book => book.id === draft.basedOn!.id).sort((a, b) => b.version - a.version)[0] : undefined;
  if (draft.basedOn && (!previous || previous.version !== draft.basedOn.version)) return failure(state, "PLAYBOOK_VERSION_CHANGED", "A newer published version exists. Start a draft from the latest version.");
  const proposal: Proposal = parsed.data;
  const content: Omit<PublishedPlaybook, "contentDigest"> = {
    id: previous?.id ?? crypto.randomUUID(), version: previous ? previous.version + 1 : 1,
    sourceDemonstrationId: source.data.id, sourceDigest: draft.sourceDigest,
    name: proposal.name, purpose: proposal.purpose, steps: structuredClone(proposal.steps), boundary: structuredClone(proposal.proposedBoundary), publishedAt: at, publishedBy: "Human",
  };
  let contentDigest: string;
  try { contentDigest = await digest(publishedContent(content)); }
  catch { return failure(state, "HASH_FAILED", "The published content could not be verified. Nothing was published."); }
  changed = changedWhileAwaiting(state, revision, options); if (changed) return changed as Transition<PublishedPlaybook>;
  if (canonical(state.drafts.find(candidate => candidate.id === draftId)) !== draftSnapshot) return failure(state, "DRAFT_CONFLICT", "The draft changed during validation. Review it again before publishing.");
  if (canonical(state.demonstrations.find(demo => demo.id === source.data!.id)) !== canonical(source.data)) return failure(state, "SOURCE_CHANGED", "The recorded source changed during publication. Nothing was published.");
  const book: PublishedPlaybook = { ...content, contentDigest };
  const next = evolve(state, { playbooks: [...state.playbooks, book], drafts: state.drafts.map(candidate => candidate.id === draftId ? { ...candidate, revision: candidate.revision + 1, validationIssues: [], publishedPlaybookId: book.id } : candidate) }, { actor: "Human", eventType: "playbook_published", summary: `A person published ${book.name}, version ${book.version}.`, demonstrationId: source.data.id, draftId, playbookId: book.id, at });
  return success(next, "PLAYBOOK_PUBLISHED", "The human-confirmed playbook is published. Every reuse still requires approval of its exact changes.", book);
}

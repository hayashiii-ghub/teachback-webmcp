import type { AppState, PlaybookBoundary, ToolResult } from "./domain";
import {
  commitApprovedRun,
  currentCaseResult,
  playbookForReservation,
  prepareCurrentRun,
  selectedReservation,
} from "./application";
import {
  PLAYBOOK_DEFINITIONS,
  activeDemonstration,
  demonstratedActionsFor,
  draftPlaybook,
  type TeachingJourney,
} from "./teaching";

export interface TeachbackService {
  getState(): AppState;
  commitState(
    expectedState: AppState,
    nextState: AppState,
    announcement: string,
  ): boolean;
  getTeachingJourney(): TeachingJourney;
  commitTeachingJourney(
    expectedState: TeachingJourney,
    nextState: TeachingJourney,
    announcement: string,
  ): boolean;
  reportWebMcpCall?(call: WebMcpCall): void;
}

export interface WebMcpCall {
  name: string;
  code: string;
}

export const WEBMCP_TOOL_COUNT = 5;

function response(result: ToolResult): string {
  return JSON.stringify(result);
}

export function createWebMcpTools(service: TeachbackService): ModelContextTool[] {
  const tools: ModelContextTool[] = [
    {
      name: "teachback_get_latest_demonstration",
      title: "Get latest demonstration",
      description:
        "Read the semantic actions demonstrated by a person on the active synthetic teaching case.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (_input, options) => {
        options?.signal?.throwIfAborted();
        const teaching = service.getTeachingJourney();
        const demonstration =
          activeDemonstration(teaching) ?? teaching.demonstrations[0];
        if (!demonstration) {
          return response({
            ok: false,
            code: "DEMONSTRATION_NOT_FOUND",
            summary: "No recorded demonstration is available.",
          });
        }
        const actions = demonstratedActionsFor(demonstration.playbookId);
        return response({
          ok: true,
          code: "DEMONSTRATION_FOUND",
          summary: `Found ${actions.length} semantic actions demonstrated on ${demonstration.reservationId}.`,
          data: {
            source_reservation_id: demonstration.reservationId,
            actions: [...actions],
            synthetic_demo_data: true,
          },
        });
      },
    },
    {
      name: "teachback_submit_playbook_draft",
      title: "Submit playbook draft",
      description:
        "Submit a bounded draft from the latest demonstration for a person to review. This cannot publish or execute the playbook.",
      inputSchema: {
        type: "object",
        properties: {
          latest_arrival_limit: {
            type: "string",
            enum: ["22:00", "23:00", "23:59"],
            description: "Proposed latest arrival handled by the playbook.",
          },
          taxi_handling: {
            type: "string",
            enum: ["allow", "escalate"],
            description: "Whether taxi requests are handled or escalated.",
          },
          dietary_handling: {
            type: "string",
            enum: ["allow", "escalate"],
            description: "Whether new dietary requests are handled or escalated.",
          },
          compensation_handling: {
            type: "string",
            enum: ["allow", "escalate"],
            description: "Whether compensation requests are handled or escalated.",
          },
        },
        required: ["latest_arrival_limit", "taxi_handling"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input, options) => {
        options?.signal?.throwIfAborted();
        const candidate = input as {
          latest_arrival_limit?: unknown;
          taxi_handling?: unknown;
          dietary_handling?: unknown;
          compensation_handling?: unknown;
        };
        if (
          !["22:00", "23:00", "23:59"].includes(
            String(candidate.latest_arrival_limit),
          ) ||
          !["allow", "escalate"].includes(String(candidate.taxi_handling))
        ) {
          return response({
            ok: false,
            code: "INVALID_DRAFT",
            summary: "The proposed boundary is outside the bounded draft schema.",
          });
        }
        if (
          candidate.compensation_handling !== undefined &&
          !["allow", "escalate"].includes(
            String(candidate.compensation_handling),
          )
        ) {
          return response({
            ok: false,
            code: "INVALID_DRAFT",
            summary: "The proposed boundary is outside the bounded draft schema.",
          });
        }
        const sourceState = service.getTeachingJourney();
        const demonstration = activeDemonstration(sourceState);
        if (!demonstration) {
          return response({
            ok: false,
            code: "TEACHING_SOURCE_REQUIRED",
            summary: "Select a recorded case before drafting a playbook.",
          });
        }
        const playbookId = demonstration.playbookId;
        const defaultDietaryHandling =
          PLAYBOOK_DEFINITIONS[playbookId].agentDraftBoundary.dietaryHandling;
        const defaultCompensationHandling =
          PLAYBOOK_DEFINITIONS[playbookId].agentDraftBoundary
            .compensationHandling;
        if (
          candidate.dietary_handling !== undefined &&
          !["allow", "escalate"].includes(String(candidate.dietary_handling))
        ) {
          return response({
            ok: false,
            code: "INVALID_DRAFT",
            summary: "The proposed boundary is outside the bounded draft schema.",
          });
        }
        const boundary: PlaybookBoundary = {
          latestArrivalLimit: candidate.latest_arrival_limit as
            | "22:00"
            | "23:00"
            | "23:59",
          taxiHandling: candidate.taxi_handling as "allow" | "escalate",
          dietaryHandling: (candidate.dietary_handling ??
            defaultDietaryHandling) as "allow" | "escalate",
          compensationHandling: (candidate.compensation_handling ??
            defaultCompensationHandling) as "allow" | "escalate",
          approvalRequired: true,
        };
        const drafted = draftPlaybook(sourceState, boundary);
        if (
          drafted.state !== sourceState &&
          !service.commitTeachingJourney(
            sourceState,
            drafted.state,
            drafted.result.summary,
          )
        ) {
          return response({
            ok: false,
            code: "STALE_CONTEXT",
            summary: "The teaching journey changed while the draft was submitted.",
          });
        }
        return response(drafted.result);
      },
    },
    {
      name: "teachback_get_current_case",
      title: "Get current case",
      description:
        "Read the minimum state for the reservation currently selected in Teachback.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (_input, options) => {
        options?.signal?.throwIfAborted();
        return response(currentCaseResult(service.getState()));
      },
    },
    {
      name: "teachback_prepare_current",
      title: "Prepare current case",
      description:
        "Validate the selected reservation against its matching published playbook and create a preview without applying changes.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (_input, options) => {
        options?.signal?.throwIfAborted();
        const teaching = service.getTeachingJourney();
        if (teaching.stage !== "reuse" || teaching.publishedPlaybooks.length === 0) {
          return response({
            ok: false,
            code: "PLAYBOOK_NOT_PUBLISHED",
            summary: "A person must review and publish the playbook first.",
          });
        }
        const sourceState = service.getState();
        const playbook = playbookForReservation(
          selectedReservation(sourceState),
          teaching.publishedPlaybooks,
        );
        if (!playbook) {
          return response({
            ok: false,
            code: "PLAYBOOK_NOT_PUBLISHED",
            summary: "A person must review and publish the playbook first.",
          });
        }
        const prepared = await prepareCurrentRun(
          sourceState,
          new Date(),
          playbook,
        );
        options?.signal?.throwIfAborted();
        if (
          !service.commitState(
            sourceState,
            prepared.state,
            prepared.result.summary,
          )
        ) {
          return response({
            ok: false,
            code: "STALE_CONTEXT",
            summary: "The case changed while the preview was being prepared.",
          });
        }
        return response(prepared.result);
      },
    },
    {
      name: "teachback_commit_approved",
      title: "Commit approved run",
      description:
        "Commit only the current run whose exact digest was approved by a person in the Teachback UI.",
      inputSchema: {
        type: "object",
        properties: {
          run_id: {
            type: "string",
            description: "Prepared run ID shown in the approved preview.",
            maxLength: 80,
          },
          expected_digest: {
            type: "string",
            description: "SHA-256 digest returned when the preview was prepared.",
            pattern: "^sha256:[a-f0-9]{64}$",
          },
        },
        required: ["run_id", "expected_digest"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, options) => {
        options?.signal?.throwIfAborted();
        const candidate = input as {
          run_id?: unknown;
          expected_digest?: unknown;
        };
        if (
          typeof candidate.run_id !== "string" ||
          typeof candidate.expected_digest !== "string"
        ) {
          return response({
            ok: false,
            code: "INVALID_INPUT",
            summary: "run_id and expected_digest are required.",
          });
        }
        const teaching = service.getTeachingJourney();
        if (teaching.stage !== "reuse" || teaching.publishedPlaybooks.length === 0) {
          return response({
            ok: false,
            code: "PLAYBOOK_NOT_PUBLISHED",
            summary: "A person must review and publish the playbook first.",
          });
        }
        const sourceState = service.getState();
        const activePlaybook = sourceState.activeRun
          ? teaching.publishedPlaybooks.find(
              (playbook) => playbook.id === sourceState.activeRun?.playbookId,
            )
          : null;
        if (
          sourceState.activeRun &&
          (!activePlaybook ||
          JSON.stringify(sourceState.activeRun.playbookBoundary) !==
            JSON.stringify(activePlaybook.boundary))
        ) {
          return response({
            ok: false,
            code: "PUBLISHED_BOUNDARY_CHANGED",
            summary: "The published playbook boundary changed after preparation.",
          });
        }
        const committed = await commitApprovedRun(sourceState, {
          runId: candidate.run_id,
          expectedDigest: candidate.expected_digest,
        });
        options?.signal?.throwIfAborted();
        if (
          !service.commitState(
            sourceState,
            committed.state,
            committed.result.summary,
          )
        ) {
          return response({
            ok: false,
            code: "STALE_CONTEXT",
            summary: "The case changed while the approved run was being committed.",
          });
        }
        return response(committed.result);
      },
    },
  ];

  return tools.map((tool) => {
    const execute = tool.execute;
    return {
      ...tool,
      execute: async (input, options) => {
        const result = await execute(input, options);
        try {
          const parsed = JSON.parse(result) as { code?: unknown };
          if (typeof parsed.code === "string") {
            service.reportWebMcpCall?.({ name: tool.name, code: parsed.code });
          }
        } catch {
          // Tool responses remain valid even if an embedding changes the payload.
        }
        return result;
      },
    };
  });
}

export async function registerWebMcpTools(
  service: TeachbackService,
): Promise<AbortController | null> {
  if (!window.isSecureContext) return null;

  let modelContext: ModelContext | undefined;
  try {
    modelContext = document.modelContext;
  } catch {
    return null;
  }
  if (!modelContext) return null;

  const controller = new AbortController();
  const tools = createWebMcpTools(service);
  try {
    await Promise.all(
      tools.map((tool) =>
        modelContext.registerTool(tool, { signal: controller.signal }),
      ),
    );
    return controller;
  } catch (error) {
    controller.abort();
    throw error;
  }
}

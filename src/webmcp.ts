import type { AppState, ToolResult } from "./domain";
import {
  commitApprovedRun,
  currentCaseResult,
  prepareCurrentRun,
} from "./application";

export interface TeachbackService {
  getState(): AppState;
  commitState(
    expectedState: AppState,
    nextState: AppState,
    announcement: string,
  ): boolean;
}

function response(result: ToolResult): string {
  return JSON.stringify(result);
}

export function createWebMcpTools(service: TeachbackService): ModelContextTool[] {
  return [
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
        "Validate the selected reservation against Late Arrival Care and create a preview without applying changes.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (_input, options) => {
        options?.signal?.throwIfAborted();
        const sourceState = service.getState();
        const prepared = await prepareCurrentRun(sourceState);
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
        const sourceState = service.getState();
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

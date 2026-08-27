# Teachback

Teachback turns demonstrated frontline work into human-approved playbooks whose boundaries the website can enforce through WebMCP.

This first vertical slice proves the highest-risk loop:

1. An agent reads the case currently selected by a person.
2. The agent prepares a bounded preview without changing reservation state.
3. A person approves the exact preview in the page.
4. The agent commits only the approved digest.
5. Unsafe cases are refused with explicit reasons.

## Run locally

Requirements: Bun 1.3.13+ and Node.js 22+.

```sh
bun install
bun run dev
```

Open the local URL printed by Vite. The UI includes local fallback controls so the preview and refusal states can be checked without an agent.

## WebMCP tools

The page registers three fixed tools through `document.modelContext.registerTool()`:

- `teachback_get_current_case`
- `teachback_prepare_current`
- `teachback_commit_approved`

The prepare tool operates only on the case visibly selected in the page. The commit tool requires the run ID and SHA-256 digest recorded at preview time, a matching unexpired human approval, an unchanged reservation version, and a run that has not already committed.

### Chrome testing

1. Use Chrome 149 or later.
2. Enable `chrome://flags/#enable-webmcp-testing` and relaunch Chrome.
3. Open Teachback directly.
4. Ask the WebMCP-aware agent to inspect the current case and prepare Late Arrival Care.
5. Approve the preview in the Teachback UI.
6. Ask the agent to apply exactly what was approved.

## Validation

```sh
bun run check
bun run test:e2e
```

## Security boundary

This client-only challenge prototype demonstrates deterministic policy enforcement, approval binding, optimistic version checks, expiry, and replay prevention. It is not a production authentication or authorization system. A production deployment would move durable authorization and sensitive hotel data behind an authenticated server boundary.

## Design

The selected UI concept is saved at [`docs/ui-concept.png`](docs/ui-concept.png).
The final 1440×900 browser capture is saved at
[`docs/final-desktop.png`](docs/final-desktop.png).

## License

MIT

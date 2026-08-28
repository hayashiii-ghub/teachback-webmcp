# Teachback

Teachback turns demonstrated frontline work into reusable rules whose boundaries are approved by a person and enforced by the website through WebMCP.

This challenge prototype demonstrates two complementary flows:

- **Reuse a published rule:** Aiko's handled reservation provides the published Late Arrival Care rule. The agent prepares a bounded preview for Emma, a person approves the exact proposal, and the website permits that approved digest to be committed once.
- **Teach a new rule:** Sofia's handled reservation provides a second demonstration. The agent structures it into a draft, a person reviews and publishes the boundary, and the resulting Night Arrival Coordination rule becomes available for Daniel.

An agent can read demonstrations, submit drafts, inspect cases, and prepare or commit approved changes. It cannot publish a rule or approve its own proposal. Unsafe cases are refused with explicit reasons.

## Run locally

Requirements: Bun 1.3.13+ and Node.js 22+.

```sh
bun install
bun run dev
```

Open the local URL printed by Vite. The UI includes local fallback controls so the preview and refusal states can be checked without an agent.

## WebMCP tools

The page registers five fixed tools through `document.modelContext.registerTool()`:

- `teachback_get_latest_demonstration`
- `teachback_submit_playbook_draft`
- `teachback_get_current_case`
- `teachback_prepare_current`
- `teachback_commit_approved`

The demonstration tool reads semantic actions from the active handled case. The draft tool can submit only a bounded proposal and cannot publish it. Publication remains a human action in the page.

The prepare tool operates only on the case visibly selected in the page. The commit tool requires the run ID and SHA-256 digest recorded at preview time, a matching unexpired human approval, an unchanged reservation version, and a run that has not already committed.

### Chrome testing

1. Use Chrome 149 or later.
2. Enable `chrome://flags/#enable-webmcp-testing` and relaunch Chrome.
3. Open Teachback directly.
4. To test reuse, keep Emma selected and ask the WebMCP-aware agent to inspect and prepare the current case.
5. Approve the exact preview in Teachback, then ask the agent to apply it.
6. Reset the demo, select Sofia, and choose **Teach from this case**.
7. Ask the agent to read the latest demonstration and submit a playbook draft.
8. Review and publish the boundary in Teachback. Daniel is then selected as the next reusable case.
9. Ask the agent to prepare Daniel, approve the exact preview, and ask the agent to apply it.

## Validation

```sh
bun run check
bun run test:e2e
```

## Security boundary

This client-only challenge prototype demonstrates deterministic policy enforcement, approval binding, optimistic version checks, expiry, and replay prevention. It is not a production authentication or authorization system. A production deployment would move durable authorization and sensitive hotel data behind an authenticated server boundary.

## Demo video

The recommended 75-second recording sequence and English narration are in [`docs/demo-script.md`](docs/demo-script.md).

## Brand assets

- `public/brand-mark.svg` — standalone mark
- `public/logo.svg` — horizontal wordmark
- `public/favicon.svg` and `public/apple-touch-icon.png` — browser icons
- `public/og.png` — 1200 × 630 social and video cover
- `public/devpost-thumbnail.png` — 1200 × 800 Devpost thumbnail

## Design

The operator UI supports English and Japanese. It follows the browser language
on first use and keeps an explicit `EN / 日本語` preference separately from demo
state. Switching the UI never changes a prepared run or approval digest. WebMCP
tool names, schemas, result codes, and JSON keys remain stable in English; exact
guest-facing copy remains visible in its source language for approval.

The UI keeps business status separate from system capability. Aiko and Sofia are handled cases; Emma and Daniel begin as unhandled cases. Whether a case has a reusable rule or can teach a new one appears only in the selected case's next action.

Conditions remain visibly unevaluated until a preview is prepared. After approval, the page shows the absolute approval expiry in JST. WebMCP availability is handled without exposing raw tool names in the operator UI.

## License

MIT

# Teachback — English submission copy

Local copy prepared against the accepted 94-second video. These fields have not
yet been saved to the Devpost draft. Paste the relevant section into each field.

## Project name

Teachback

## Tagline

Turn recorded staff work into WebMCP workflows with human-set boundaries and approval for each execution.

## Project story

### What Teachback does

Teachback explores how frontline work can be reused without turning one
successful response into unlimited permission. It uses a hotel-operations demo:
a handled reservation supplies recorded staff actions, an agent structures a
draft, and a person decides the boundary before publishing a reusable rule.

The 94-second demo follows Sofia's recorded response into a new case for Daniel.
A person changes compensation handling from automatic to escalation. The agent
then prepares Daniel's arrival, meal, dietary, taxi, message, and handoff changes.
Nothing is applied yet. An attempt to apply the proposal returns
`RUN_NOT_APPROVED`. After a person approves the exact changes, retrying the same
run and digest returns `RUN_COMMITTED`.

### Why this is a strong fit for WebMCP

The work already lives in a website: the selected reservation, its recorded
actions, the reusable rule, and the proposed changes. WebMCP exposes those
concepts as structured tools in that same context. The agent can request a draft
or preview without needing to infer the meaning of every visual control.

The website keeps responsibility for checking the request. Publishing a rule
and approving a proposal are page actions, not registered tools. The application
also checks the proposal digest, reservation version, approval expiry, and
whether the run has already been applied.

### A better experience for people and agents

An operator stays in the reservation workspace while the agent reads the source
response and prepares the next case. The operator can see where the rule came
from, what will change, and where a request must be escalated. This makes the
handoff between proposing, deciding, and applying explicit.

The collaboration being explored is reusable operational judgment: people set
the scope and approve the result; agents handle structured preparation and
application requests. It reduces the need to describe the same response from
scratch while keeping the next case open to review.

### How WebMCP is implemented

The TypeScript/React application registers five tools with
`document.modelContext.registerTool()`:

- `teachback_get_latest_demonstration`
- `teachback_submit_playbook_draft`
- `teachback_get_current_case`
- `teachback_prepare_current`
- `teachback_commit_approved`

The tools operate on the browser's current application state. Preparing a run
creates a proposal and SHA-256 digest without changing the reservation. Approval
is bound to that proposal, is valid for five minutes, and allows one application.
The audit drawer separates workflow events from an expandable latest-tool
result, making both the refusal and the later successful call inspectable.

### Prototype scope

The eight reservations and source actions are synthetic. The app supports
predefined hotel workflows and bounded draft fields; it is not a general-purpose
action recorder or arbitrary workflow learner. In the filmed draft, omitted
compensation handling defaulted to automatic in the app, and the person changed
it to escalation.

State and approval checks are browser-local. This demonstrates policy and
approval semantics, not production authentication or server-side authorization.
A production version would need an authenticated backend, durable authorization,
and integration with real operational systems.

## Built with

WebMCP, TypeScript, React, Vite, Vinext, Cloudflare Workers, ChatGPT Sites, Bun,
Vitest, Playwright.

Video production: real browser recordings, HyperFrames editing, and HeyGen
English narration.

## Links

- Live demo: https://teachback-webmcp.haygsiiii.chatgpt.site/
- Source code: https://github.com/hayashiii-ghub/teachback-webmcp
- License: MIT
- Video URL: https://youtu.be/E8-ijshSw_g (public)

## Testing instructions

Open the live demo in a WebMCP-enabled browser and select English. Only one tab
per origin can edit the demo; close another active Teachback tab if prompted.
For a clean replay, use a fresh browser profile or reset only this demo's local
state with **Reset demo**.

Select Sofia, choose **Teach from this case**, and ask the agent to read the
demonstration and submit a draft. Review the compensation boundary and publish
the rule in the page. Daniel becomes available for reuse. Ask the agent to
prepare Daniel's changes, retain the returned run ID and digest, and attempt
application before approval. Expect `RUN_NOT_APPROVED`. Approve in the page,
then retry with the same arguments within five minutes. Expect `RUN_COMMITTED`.

Use **View audit trail → WebMCP connected** to inspect each latest result before
another tool call replaces it. The initial Emma case is a separate quick-start
route using Aiko's already-published rule. Local fallback buttons are available
for UI exploration, but are not evidence of WebMCP tool execution.

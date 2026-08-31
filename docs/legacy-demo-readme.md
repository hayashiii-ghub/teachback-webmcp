> この文書は2026-08-31の新フロー実装前のREADMEを保持したものです。以下の状態・手順は歴史的な記録で、現在の動作や公開状態の説明には使わないでください。

# Teachback

Teachback turns recorded frontline work into reusable workflows with human-set boundaries and approval for each execution. WebMCP lets an agent propose and request changes; the website checks whether those changes may be applied.

**Live demo:** [teachback-webmcp.haygsiiii.chatgpt.site](https://teachback-webmcp.haygsiiii.chatgpt.site/)

This challenge prototype includes two complementary flows:

- **Teach and reuse — the video story:** A staff response to Sofia's reservation supplies the recorded actions. An agent submits a draft through WebMCP. A person changes compensation handling to escalation and publishes Night Arrival Coordination. The agent then prepares changes for Daniel. An unapproved attempt returns `RUN_NOT_APPROVED`; after a person approves, the same run and digest return `RUN_COMMITTED`.
- **Try an existing rule:** Aiko's handled reservation supplies the published Late Arrival Care rule. Emma is the initial selected case and can use that rule without first teaching a new one.

The five registered tools expose reading, drafting, preview preparation, and approved application. Rule publication and proposal approval remain page actions, not WebMCP tools. Cases outside a published rule's conditions are refused with explicit reasons.

## Demo video

Watch the **[94-second English demo on YouTube](https://youtu.be/E8-ijshSw_g)**. It follows Sofia → human-set boundary → Daniel → refusal → approval → application. The creator-approved video is public; the contest submission is still pending.

- [Final cut and proof timestamps](demo-script.md)
- [English narration with final timing](video-shoot/SCRIPT.md)
- [Screenshots extracted from the final MP4](submission/SCREENSHOTS.md)
- [Submission materials and delivery status](submission/README.md)

The supplied reservations and recorded actions are synthetic demo data. This video does not demonstrate a general-purpose recorder that learns arbitrary work from a screen recording.

## Run locally

Requirements: Bun 1.3.13+ and Node.js 22+.

```sh
bun install
bun run dev
```

Open the local URL printed by Vite. Select **Check conditions and prepare preview**, review the changes, then select **Approve and apply** to finish in the page. This works without an agent or WebMCP support and uses the same digest, expiry, reservation version, published boundary, and replay checks as the agent path.

Demo work is saved in this browser's local storage. Only one tab per origin can edit at a time, enforced through Web Locks before the application or its tools mount. Close the active tab and reload the other tab to continue there. This prevents stale tabs from restoring discarded approvals; it is not cross-device synchronization or a server-side authorization boundary. A browser with Web Locks support is required.

Failed saves show a warning and a retry action; work can continue in memory but is not guaranteed to survive a reload. Reset requires confirmation and only replaces the open work after the initial data has been saved successfully. The existing storage keys are retained, with best-effort rollback if a multi-key save fails.

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
5. Expand **Let an agent apply**, select **Approve only**, then ask the agent to apply the exact preview. Alternatively, **Approve and apply** completes it directly in the page.
6. Reset the demo, select Sofia, and choose **Teach from this case**.
7. Ask the agent to read the latest demonstration and submit a playbook draft.
8. Review the boundary in Teachback. For the video's draft, change compensation handling from automatic to escalation, then publish. Daniel is selected as the next reusable case.
9. Ask the agent to prepare Daniel and retain the returned run ID and digest. Before approving, ask it to apply that proposal: expect `RUN_NOT_APPROVED`.
10. Expand **Let an agent apply** and select **Approve only**. Within five minutes, ask the agent to retry with the same run ID and digest: expect `RUN_COMMITTED`. Do not prepare a replacement proposal between these calls.

Open **View audit trail** and expand **WebMCP tools registered** to inspect the registered tool count and the actual latest tool name/result. Registration means the page has exposed its tools; it does not confirm that an agent is connected or can invoke them. Reading the page alone is insufficient to apply changes. Inspect the refusal before making another tool call, which replaces the latest-call display. The separate audit entries record workflow events such as publication, approval, and application; they are not a permanent log of every failed tool request.

## Validation

```sh
bun run check
bun run test:e2e
```

## Security boundary

This client-only challenge prototype demonstrates deterministic policy enforcement, approval binding, optimistic version checks, expiry, and replay prevention. It is not a production authentication or authorization system. A production deployment would move durable authorization and sensitive hotel data behind an authenticated server boundary.

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

Conditions remain visibly unevaluated until a preview is prepared. Passed conditions can then be expanded while the main action remains **Approve and apply**. Agent delegation is a secondary option; approval-only shows its absolute expiry in JST. Raw tool names and result codes remain in the audit drawer's expandable WebMCP evidence.

The case list distinguishes proposals awaiting review, approved proposals awaiting application, expired approvals needing another review, and handled cases. Existing approvals can be completed with **Apply approved changes** or by an agent before expiry; applying never renews the original approval. After expiry, the conditions summary describes the previous check and a new preview is required. Manual application is recorded as a human action; agent application remains attributed to the agent. Reservation updates here affect synthetic local demo data only.

Cases outside a rule are labeled **Needs a person**, not awaiting approval. The page states that no handoff was sent and offers another eligible case. Recorded source cases separately show whether their guest response is handled and whether a rule has been created; the original response and registered boundary remain readable. After publishing a rule, a visible notice explains the move to a matching reservation.

Search and the selected workspace share one filter. Empty results hide case actions, disable list navigation, and reject case-reading/preparation/application tools with `CASE_NOT_VISIBLE` until a visible reservation is selected. Built-in draft/preview generation is attributed to **Website** in the audit trail; actual WebMCP generation is attributed to **Agent**.

## License

MIT

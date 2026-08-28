# Teachback — 75-second demo script

## Capture setup

- Record at 1440×900 or 1920×1080, 16:9.
- Keep the Teachback UI in Japanese and use the English narration below as voiceover or burned-in subtitles.
- Show the WebMCP-aware agent beside the site when a tool is called. Crop out unrelated browser chrome and notifications.
- Reset the demo immediately before recording. Do not pause on loading or setup screens.

## Shot list and narration

| Time | On screen | English narration / subtitle |
| --- | --- | --- |
| 0–7s | Teachback home. Sofia is visible in the reservation list. | “Teachback turns work demonstrated by a person into a reusable rule—with human-approved boundaries.” |
| 7–17s | Select Sofia and choose **この対応から教える**. Her completed actions are shown. | “Sofia already handled a complex late arrival. Teachback records the semantic actions behind that work.” |
| 17–29s | The agent calls `teachback_get_latest_demonstration`, then `teachback_submit_playbook_draft`. The draft appears in Teachback. | “The agent structures the demonstration into a bounded draft. It can propose, but it cannot publish or execute.” |
| 29–41s | Show the proposed conditions. A person reviews them and selects **対応ルールを公開**. | “A person decides the reusable boundary and publishes the rule.” |
| 41–52s | Daniel is selected automatically. The agent calls `teachback_prepare_current`; the proposed changes appear without being applied. | “Daniel now matches the published rule. The agent can prepare only a preview.” |
| 52–65s | Select **変更案を承認**. The agent calls `teachback_commit_approved` with the approved run ID and digest. | “Human approval is bound to this exact proposal, once, for five minutes. The website—not the agent—enforces that permission.” |
| 65–75s | Show the applied result, then briefly open the audit trail. End on the Teachback name. | “Teachback makes frontline judgment reusable without giving the agent authority to widen the rules.” |

## Recording checklist

- The agent tool calls are readable for at least one second each.
- The draft is visibly unpublishable by the agent; publication happens in Teachback.
- No reservation changes appear before human approval.
- The final audit trail shows the demonstration, draft, publication, approval, and commit sequence.
- The recording contains no real guest information, accounts, notifications, or unrelated tabs.

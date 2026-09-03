# Judge testing instructions

Open <https://teachback-webmcp.haygsiiii.chatgpt.site/> in ChatGPT's in-app
browser or Chrome 149+ with WebMCP enabled. No account or credentials are
required. Use one Teachback tab per browser profile because the prototype locks
editing to one tab. Select **EN**. If the session is not blank, export it from
**History** if needed, then choose **Reset demo** and confirm.

## Full WebMCP path

1. Open **Playbooks** and select **Record the first response**. Choose **Aiko
   Tanaka (R-2041)**, then select **Start recording**.
2. Save Aiko's requested arrival date/time, select **Save meal box**, enter and
   save a guest message containing Aiko's name and `21:30`, and enter and save a
   shift handoff containing the same values. Select **Finish recording**.
3. The page now shows **Recorded / waiting for a draft** and generates an exact
   request containing the new demonstration ID. Send that request to the
   WebMCP-capable agent in the same browser context. Expect
   `teachback_get_demonstration → DEMONSTRATION_FOUND`, followed by
   `teachback_create_draft → DRAFT_CREATED`.
4. In **Playbooks**, open the AI-authored draft. Compare the recorded text with
   the case-field tokens, change the latest arrival boundary from `22:00` to
   `21:45`, save and validate, review the final contract, confirm, and publish.
   These publication controls exist only in the website.
5. From the published version select **Use this playbook**, then choose **Emma
   Wilson (R-2048)**. Ask the agent: “List the published playbooks and current
   cases, then prepare the latest published playbook for R-2048 using its exact
   case and playbook versions. Stop after preparation so I can review it in the
   website.” Expect `RUN_PREPARED`; the reservation must still be unchanged.
6. Review Emma's exact proposal and select **Approve and apply**. Ask the agent
   to read the returned run ID. Expect `status: committed`. **History** should
   distinguish Agent preparation, Human publication/application, and Website
   policy checks.
7. Ask the agent to prepare the same published playbook for **Noah Martin
   (R-2060)**. Expect `PLAYBOOK_NOT_APPLICABLE` because the case requests
   compensation. No proposal is applied.

The footer status **WebMCP tools registered** proves only that the page finished
registration. Confirm actual invocation through the latest tool name/result and
the History entries. Ordinary visual page reading is not WebMCP execution.

## Local verification

```sh
bun install
bun run check
bun run test:e2e
```

The local E2E suite uses a registration-only browser shim so UI states are
deterministic. It does not claim to be an external agent invocation. Public
WebMCP discovery and invocation must be checked separately in a compatible
browser after deployment.

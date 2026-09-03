# Teachback — current English entry copy

## Project name

Teachback

## Tagline

Turn one handled case into a reusable WebMCP playbook—drafted by an agent, bounded and applied by people.

## Project story

### What Teachback does

Teachback explores a practical question: how can a team reuse an experienced
person's response without treating one successful case as unlimited permission?

The demo uses synthetic hotel reservations. A staff member handles Aiko's late
arrival in the normal website and saves four operations: the arrival update, a
meal box, a guest message, and a shift handoff. Teachback records semantic
commands, exact before-and-after values, and evidence IDs—not click coordinates.

A WebMCP-capable agent reads that record and authors its own playbook draft. It
must identify supported operations, replace Aiko's name and time with permitted
case fields, preserve the recorded wording, and propose an arrival boundary.
The website checks the proposal against the actual evidence. A person then
compares source and reusable wording, tightens the cutoff, and publishes the
reviewed version. Publication is deliberately not a WebMCP tool.

For Emma, the agent reads the published version and current case data, then asks
Teachback to prepare a run. The website evaluates deterministic safeguards and
produces the exact diff. Nothing changes until a person reviews that proposal
and selects **Approve and apply** in the website. The agent can read the
committed result afterward, but it has no approval or application tool. When the
same playbook is tried on Noah's compensation request, the website returns
`PLAYBOOK_NOT_APPLICABLE` and sends the case back to a person.

### Why WebMCP is the right interface

The difficult part is not clicking hotel fields. It is turning concrete work
into a proposed reusable structure, then carrying that structure into a new
case without blurring who decides. A generic page reader sees labels and pixels;
WebMCP exposes the concepts that matter: demonstrations, evidence-backed drafts,
published versions, cases, and prepared runs.

This creates a clean division of responsibility:

- the person demonstrates work, edits boundaries, publishes, and applies;
- the agent interprets the recording, drafts reusable wording, and prepares a
  case-specific proposal;
- the website validates evidence, enforces fixed safeguards, calculates exact
  changes, and refuses work outside the published boundary.

The result is an explicit handoff between interpretation and authorization. An
agent can help with the genuinely ambiguous part—drafting from evidence—without
receiving a generic mutation API or the authority to approve its own output.

### How WebMCP is implemented

The TypeScript/React application registers seven typed tools with
`document.modelContext.registerTool()`:

- `teachback_get_demonstration`
- `teachback_create_draft`
- `teachback_update_draft`
- `teachback_list_playbooks`
- `teachback_list_cases`
- `teachback_prepare_run`
- `teachback_get_run`

Tool input is schema-checked and size-limited. Draft steps must cite recorded
evidence, reproduce the final saved operations, and parameterize source-specific
names, dates, IDs, and times. Published playbooks are immutable versions.
Preparing a run binds it to the case version and published-content digest. Human
approval is bound to the exact run digest, expires after five minutes, and can
be used once. Request IDs make mutating WebMCP calls idempotent, while compact
receipts and session limits prevent unbounded browser storage growth. The audit
trail separates Human, Agent, and Website decisions.

### Prototype scope

Teachback is a client-side prototype with eight synthetic reservations and four
supported operation types. It demonstrates recording, proposal validation,
human publication, exact-diff approval, deterministic refusal, and audit
semantics. It is not connected to a real hotel system and does not claim
production authentication, authorization, multi-user storage, arbitrary browser
automation, or autonomous batch execution.

## Built with

WebMCP, TypeScript, React, Vinext, Vite, Cloudflare Workers, ChatGPT Sites, Bun,
Vitest, Playwright, HyperFrames, and HeyGen narration.

## Links

- Live demo: <https://teachback-webmcp.haygsiiii.chatgpt.site/>
- Source: <https://github.com/hayashiii-ghub/teachback-webmcp>
- License: MIT
- Video: <https://www.youtube.com/watch?v=dqei8azzFZo>

## Suggested video title

Teachback — Turn One Handled Case into a Human-Governed Playbook with WebMCP

## Suggested YouTube description

Teachback turns one handled case into an evidence-backed, human-governed playbook.

In this 133-second demo, a person records Aiko's late-arrival response. A
WebMCP-capable agent reads the semantic record and authors a reusable draft; a
person tightens and publishes its boundary; the agent prepares exact changes for
Emma; and Teachback refuses Noah's out-of-bound compensation case. Publication
and every application remain under human control.

Live demo: https://teachback-webmcp.haygsiiii.chatgpt.site/
Source code: https://github.com/hayashiii-ghub/teachback-webmcp

Synthetic challenge data. English narration generated with HeyGen. Video
assembled in HyperFrames from real product captures.

Built for the WebMCP Challenge.

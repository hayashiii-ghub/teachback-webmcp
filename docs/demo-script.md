# Teachback — final 94-second challenge demo

Status, 2026-08-30: the English MP4 is exported, verified, and accepted by the
creator. It is [public on YouTube](https://youtu.be/E8-ijshSw_g); the contest
submission is pending. The older cuts and raw recordings are preserved separately.

## Story

**Sofia's recorded response → WebMCP draft → human-set boundary → Daniel's
preview → unapproved attempt refused → human approval → the same proposal
applied.** Sofia and Daniel are guests; the source actions describe a staff
member's response to Sofia's reservation.

The initial app state also offers Aiko → Emma as a quick reuse example. The video
uses Sofia → Daniel to show both teaching and execution in one story.

## Delivery

- `Teachback-WebMCP-94s-English.mp4`: exactly **94.000 seconds**, 1920×1080,
  16:9, H.264, 30fps, 2,820 frames; AAC stereo, 48kHz.
- English UI, nine HeyGen / Chill Brian narration clips at normal speed, and
  text-only captions in a fixed lower band.
- Actual application recordings with edited waits and purposeful crops. No
  reconstructed UI, fabricated tool results, or accelerated source playback.
- Two clicks, at 39.2s and 68.75s. No typing sounds, music, transition effects,
  or success chimes.

## Final cut

| Time | On screen | What it establishes |
| --- | --- | --- |
| 0–6.5s | Teachback wordmark; “Recorded work. Human-approved reuse.” | Introduce the product before the operator screen. |
| 6.5–17.8s | Sofia and the staff response's recorded actions | The source case includes dietary care, a taxi, and night-shift handoff. |
| 17.8–28.5s | Recorded actions become proposed conditions through real WebMCP calls | The agent reads and drafts; the registered tools do not publish. |
| 28.5–42s | Compensation handling changes from automatic to escalation; the person publishes | A person sets the boundary. Publication becomes available after the change. |
| 42–55.5s | Daniel and the prepared changes | The newly published rule is reused for a different reservation. No changes have been applied. |
| 55.5–67s | Unapproved application attempt; the audit drawer's latest result | The actual tool result is `RUN_NOT_APPROVED`. |
| 67–73.6s | A person approves the exact proposal; one-use, five-minute scope | Approval is separate from applying the changes. |
| 73.6–87.5s | The same run/digest is retried; Committed state and audit evidence | The result becomes `RUN_COMMITTED`, with an applied-change entry for Daniel. |
| 87.5–94s | Large centered Teachback wordmark | “Demonstrated work. Human-set boundaries. Approved reuse.” |

The intervals above describe the final edit. They do not imply that off-screen
tool calls occurred at the first frame of each interval. Exact voice placements
are in the [final narration](video-shoot/SCRIPT.md).

## Proof timestamps

- **60.6s:** `teachback_commit_approved` returns `RUN_NOT_APPROVED`.
- **70.8s:** “Approved for this proposal,” the expiry, and “May be applied once.”
- **78.0s:** the application displays “Committed.”
- **83.5s:** `RUN_COMMITTED` and the applied-change entry for `R-2052`.

[Submission screenshots](submission/SCREENSHOTS.md) are full frames extracted
from this MP4. The [capture record](video-shoot/RECORDING-STATUS.md) contains the
matching run ID and digest from both commit attempts. The final video does not
display the full digest, so the same-argument claim is corroborated by that
capture record rather than by a fabricated on-screen overlay.

## Claim boundaries

- The source actions and reservations are supplied synthetic demo data, not a
  demonstration of arbitrary workflow capture or model training.
- Compensation handling was omitted from the recorded draft request and defaulted
  to `allow` in the app. The person changed it to escalation. Do not claim that an
  agent independently invented the automatic-compensation policy.
- The user performed the boundary edit, publication, and approval during capture.
  Those actions are not exposed through the five WebMCP tools. This is not a
  claim that an agent can never click an approval button through another channel.
- This is a browser-local, client-only policy prototype, not production
  authentication or server-side authorization.
- The latest tool result is transient. The audit event list is separate and does
  not persist every failed tool request.

## Materials

- [English entry copy](submission/ENTRY.md)
- [Screenshots and captions](submission/SCREENSHOTS.md)
- [Final file, QA evidence, and remaining delivery steps](submission/README.md)
- [Capture record](video-shoot/RECORDING-STATUS.md)
- [Historical operator cues](video-shoot/RECORDING-CUES.md) and
  [preflight record](video-shoot/PREFLIGHT.md)

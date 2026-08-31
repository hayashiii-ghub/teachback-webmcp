# Teachback submission materials

> 2026-08-31 implementation note: the current site implementation now records actual work before drafting and uses seven preparation-only WebMCP tools. This folder preserves the previously submitted demo, video, and entry text; they are not updated as part of this site release. See the [current README](../../README.md) for the current workflow.

Updated 2026-08-30. The 94-second English video is exported, checked, and accepted
by the creator. This package contains entry copy and five video stills for
publication with the source. The video is **public on YouTube** with the creator's
permission. The new cover, tagline, story, video link, and five captioned images
were saved with the additional information and **submitted to The WebMCP
Challenge** with the creator's authorization. Devpost displayed **Project
submitted!**; see the [submission record](SUBMISSION-STATUS.md) and
[submitted project](https://devpost.com/software/teachback-de9cr3).

## Materials

| Material | Use |
| --- | --- |
| [Submission record](SUBMISSION-STATUS.md) | Final authorization, on-page receipt, and public entry links |
| [English entry copy](ENTRY.md) | Project name, tagline, story, technology tags, links, and testing instructions |
| [Screenshot gallery](SCREENSHOTS.md) | Five full-resolution PNGs with English captions, in narrative order |
| [Final cut](../demo-script.md) | 94-second structure and exact proof timestamps |
| [Final narration](../video-shoot/SCRIPT.md) | The nine English voice lines and measured placements |
| [Project README](../../README.md) | Setup, the two demo routes, five tools, and prototype limitations |
| [Final Devpost cover](devpost-cover-final.png) | 1536×1024 PNG; simplified wordmark and final-video copy; used by the submitted entry |
| [Cover provenance](COVER.md) | Editing prompt, source image, and output details |
| [Previous Devpost thumbnail](../../public/devpost-thumbnail.png) | Preserved unchanged; no longer the submitted entry's cover |
| [Final YouTube thumbnail](youtube-thumbnail-final.png) | 1280×720 PNG; same design as the Devpost cover; saved on the existing video |
| [YouTube thumbnail record](YOUTUBE-THUMBNAIL.md) | Asset provenance, editing prompt, and saved-state check |
| [Existing Open Graph image](../../public/og.png) | 1200×630 PNG; preserved without redesign |

### Final MP4

Local path, relative to the repository root:

`videos/teachback-submission/renders/final-20260830-WRwyz2/Teachback-WebMCP-94s-English.mp4`

- Exactly 94.000 seconds; 1920×1080; H.264/yuv420p; 30fps; 2,820 frames.
- AAC stereo, 48kHz; 17,611,513 bytes.
- SHA-256: `49d1e05cb3e77f7a9413bbf83b01e0d377b6820565d41e0263ab19e5e1425d26`.
- All video/audio decoded successfully. Whole-timeline visual sampling, targeted
  proof-frame inspection, preview/output comparison, and audio timing/level
  analysis are documented in the adjacent local `QA-REPORT.md`.
- The user accepted the final video. This is separate from claiming that every
  output frame was manually inspected or that the audio QA was subjective listening.

The MP4, raw recordings, and detailed render reports are intentionally outside
Git. The PNGs and their [provenance manifest](screenshots/manifest.json) are part
of this documentation package. No source recording or accepted edit was changed.

## Evidence behind the story

The five images preserve the video's actual UI and tool results. A still of a
confirmed field does not itself show a human changing it; the video shows that
transition. The before/after commit arguments were captured as:

```json
{
  "run_id": "e7f88397-d7de-4bb8-8e6a-ae4b7134f6f2",
  "expected_digest": "sha256:9d8107fed7a3eda622472fbc67feea2db558639e6bf1688541bf7bb0c3d2094b"
}
```

The tool trace records `RUN_NOT_APPROVED` and then `RUN_COMMITTED` using those
identical arguments. The video and captured page state show the human approval
between the calls, without another prepare, reload, or reset. The user's boundary
edit, publication, and approval were recorded directly. The full digest is not
an on-screen claim in the final video.
Local source evidence lives in `artifacts/recording-2026-08-30-icaZX1/`;
the [capture record](../video-shoot/RECORDING-STATUS.md) explains the takes.

The app's source was checked for agreement with this wording: five
registered tools, page-only publication/approval, bounded predefined workflows,
and browser-local checks. The initial documentation-only pass did not rerun the
application. Subsequent runtime and regression checks are recorded below.

### Package checks

- All five PNGs visually reviewed; decoded pixels exactly match source MP4
  frames 1002, 1596, 1818, 2124, and 2505 at 30fps.
- PNG dimensions and hashes match the manifest; the accepted MP4 hash is
  unchanged. The screenshots total 1,763,662 bytes.
- All nine narration lines and timing windows match the accepted edit's script.
- The tagline is 105 characters. The new 1536×1024 cover is 1,139,815 bytes.
- Local documentation links resolve; raw-media paths are labeled local-only
  instead of presented as public downloads. `git diff --check` passes.

## Public YouTube video — saved 2026-08-30

- Channel: **はやしつべ**.
- [YouTube Studio](https://studio.youtube.com/video/E8-ijshSw_g/edit).
- [Video URL](https://youtu.be/E8-ijshSw_g) — **public**.
- Title: **Teachback — Human-approved workflows with WebMCP**.
- The accepted MP4 was uploaded unchanged; its SHA-256 was rechecked beforehand.
- English description includes the live/source links, prototype limitations,
  and HeyGen narration credit. Video language is English; AI use is disclosed;
  audience is not made for children; embedding remains enabled.
- Public visibility was saved with the creator's approval and rechecked after
  reloading Studio. SD and HD
  processing are complete. YouTube's automatic copyright check reported no
  issues; this is not a substitute for confirming media rights.
- Playback advanced in Studio; on the public watch page it reached the end
  (94.041 seconds) with sound unmuted and no player error.
  The Studio player reports 94.040816 seconds (the list
  rounds up to 1:35); the original MP4 remains exactly 94.000 seconds.
- The browser was signed in during playback; signed-out playback is not claimed.
- Studio requires channel verification to make external description links
  clickable. No account verification or new permissions were completed.
- The initial autogenerated thumbnail was later replaced with the final
  Teachback cover design, adapted to 16:9. Studio retained it after reload;
  see the [thumbnail record](YOUTUBE-THUMBNAIL.md).

## Pre-publication live/repository check — 2026-08-30

Before the source-copy correction below, public GitHub main and local HEAD both resolved to
`af5f9b882598b03a9bd4edee844f51df723b79b9`. The repository and MIT license are
publicly readable. Live English pitch text and the names of its six JavaScript
assets and one stylesheet matched the corresponding local build. There is no
build SHA stamp; this does not prove server-bundle byte identity. No CI runs or
checks are configured for that commit.

The live in-app browser exercised the five real WebMCP tools: Sofia demonstration,
draft, page-side boundary change/publication, Daniel read/prepare, unapproved
commit refusal, and successful application with the same run/digest after page
approval. Approval survived switching cases; committed state survived reload.
No relevant console errors or framework overlay were observed. These were QA
interactions on synthetic local demo state, not an additional human recording.
The existing Emma work was preserved; no reset was performed.

A repeated post-commit call was stopped by the action safety review and was not
executed. This additional replay-rejection check is therefore not claimed as a
live verification. The normal refusal-before-approval and successful application
were both observed.

One copy defect was found on returning to Sofia after publishing: the source
description still named Aiko's four-action Late Arrival Care rule, in both
languages. Actual provenance and workflow data were correct. Source commit
`809bf1b` fixes only the two shared descriptions in both languages and adds the
regression test; rule names remain in the existing provenance display. This
package includes the correction. Hosted publication is verified separately from
these local test results.

The local fix was checked through the Browser plugin at desktop and 390px mobile
widths, including Sofia publication/revisit and Japanese/English switching.
Text wraps without overlap or page-level horizontal overflow; no relevant console
errors or framework overlay were observed. Unit tests passed (43/43), the build
passed, and the added regression passed on desktop and mobile (2/2). The entire
E2E suite was not rerun. The temporary QA server was stopped after verification.

## Requirements checked for packaging

The contest asks for a working live URL, a public open-source repository,
English materials or translations, and an audio demo under three minutes that
is publicly viewable on YouTube. The story must explain WebMCP fit, UX, human–agent
collaboration, and implementation. The 94-second English file meets the measured
duration and language requirements, and the YouTube visibility is now public.
[Official contest rules](https://webmcp.devpost.com/rules).

The tagline is kept within Devpost's documented 140-character standard field.
[Official form specification](https://help.devpost.com/article/145-how-do-i-set-up-the-submission-period).

Devpost recommends a 3:2 project thumbnail, JPG/PNG/GIF, maximum 5MB. The new
1536×1024 cover meets these limits. The signed-in gallery form separately confirms
up to 15 JPG/PNG/GIF images, each at most 5MB, with a 3:2 ratio recommended.
Five unmodified 16:9 video stills were accepted and saved.
[Official submission guide](https://help.devpost.com/article/126-know-your-submission-steps).

## Delivery complete — 2026-08-30

- The prior publication pass verified GitHub main and the successful Sites
  deployment at `aa2b999`, including source correction `809bf1b`. Later commits
  that only archive submission documents or images do not change the deployed
  application. No deployment is part of this record cleanup.
- The public YouTube video and final thumbnail were saved and checked. The
  creator confirmed watching the video. Signed-out playback was not separately
  verified; YouTube's copyright check is not a media-rights determination.
- The cover, tagline, story, video URL, five captioned stills, and additional
  information were saved to the existing Devpost entry. The submitted page
  embeds the correct YouTube video.
- After explicit final authorization, the terms checkbox was checked and
  **Submit project** was clicked. Devpost displayed **Project submitted!** and
  **Submitted to → The WebMCP Challenge**. See the
  [submission record](SUBMISSION-STATUS.md).

No further submission action is pending. Keep the public app, video, and source
available for judging, and respond to organizer follow-up if needed.

The listed deadline is September 3, 2026, 13:00 PDT — September 4, 05:00 JST.
The contest FAQ asks entrants to leave the entry, repository, and live site
unchanged after the deadline until winners are announced. Plan the final
verification and any publishing before then.
[Official deadline](https://webmcp.devpost.com/rules) ·
[Post-deadline guidance](https://webmcp.devpost.com/resources).

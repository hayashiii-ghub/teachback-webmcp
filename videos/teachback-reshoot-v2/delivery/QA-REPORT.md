# Final render QA

Status: the revised local release candidate passed on 2026-09-04.

This is the upload candidate approved in the final Studio preview. It includes
the actor/proof labels in the caption band and removes the captured-status mask.

This is the delivery record for the creator-approved 133-second edit. Every
property below was read from the generated MP4 or a final validation command;
none was copied from the browser preview.

## Artifact

| Check | Result |
| --- | --- |
| Render command | `npx --yes hyperframes@0.8.27 render -o renders/Teachback-WebMCP-133s-English-v2.mp4 --quality high --strict --no-best-effort --video-frame-format png` |
| Final render path | `renders/Teachback-WebMCP-133s-English-v2.mp4` |
| File size | 30,396,835 bytes |
| Duration / frames | 133.000 seconds / 3,990 frames |
| Dimensions / frame rate | 1920 x 1080 / constant 30 fps |
| Video | H.264 High, `yuv420p`, progressive, BT.709, 16:9 |
| Audio | AAC-LC, 48 kHz, stereo, approximately 163 kb/s |
| SHA-256 | `ff73c4d286b7477a888308aa28d663e850f813c34df7e35243f201c29f101b8e` |

The render was produced from the reviewed worktree based on Git commit
`e52058943a4857b08fe0d31571aac617f231a874`. The release commit had not yet been
created at render time. HyperFrames was invoked through the pinned CLI version
`0.8.27`; the MP4's tool-written `hyperframes_version` metadata field reports
`0.0.0-dev` and is recorded here rather than treated as the CLI version.

## Validation

| Check | Result |
| --- | --- |
| HyperFrames structural check | PASS; runtime 0 errors / 0 warnings, layout 0 warnings, motion 0 errors / 0 warnings, contrast 18/18. Two non-blocking timeline-density maintainability warnings remain in the top-level label tracks. |
| Strict render | PASS; all 23 video sources, 15 audio tracks, and 3,990 output frames completed. Eight draw-element verification samples passed. |
| Decode test | PASS; `ffmpeg -v error -i … -f null -` decoded the complete file with no reported errors. |
| Representative-frame review | PASS; six frames spanning 3–128 seconds were extracted from the final MP4 and visually reviewed, covering intro, evidence, human review, preparation, application, and outro/refusal context. Five additional structural snapshots covered the revised label layout. |
| Level review | PASS; mean volume `-20.5 dB`, sample peak `-1.3 dB`. |
| Silence review | PASS; the longest interval below `-40 dB` was 4.005 seconds during the deliberate human review/publish hold. Other pauses of 3.402, 3.004, and 2.547 seconds correspond to visible proof states or transitions. No unexplained long tail was detected. |

Source captures have sparse-keyframe warnings and one VFR take, documented in
`ASSET-MANIFEST.md`. HyperFrames normalized extraction, reported full frame
coverage, and the final constant-frame-rate file passed full decode and visual
sampling. Re-encoding the source evidence was therefore not necessary for this
release candidate.

Public YouTube upload and Devpost replacement are separate external actions and
must not be marked complete from a local render alone.

# Teachback final video source

This directory contains the version-pinned 133-second English edit prepared for
the WebMCP Challenge. It is the current video source. The older 94-second edit
and its submission record are historical and are not mixed into this project.

## Output contract

- 1920 x 1080, 30 fps, 133 seconds (3,990 frames)
- English narration and English on-screen copy
- no background music
- three locally generated click cues, used only for human actions
- real 1920 x 1080 captures of the synthetic Teachback demo
- revised delivery file: `renders/Teachback-WebMCP-133s-English-v2.mp4` (ignored by
  Git; properties and hash are recorded in `delivery/QA-REPORT.md`)

## Preview and validate

From this directory:

```sh
npm run check
npm run dev
```

The top-level HyperFrames CLI version is pinned through `npx`, so Node.js, npm,
and network access are required on the first run. Transitive packages are not
locked in this video-only directory, so this is not a bit-reproducible build.
Post-render QA uses `ffmpeg` and `ffprobe`. The approved frame uses the macOS
`Iowan Old Style` system font; other platforms fall back to Georgia and
therefore are not guaranteed to be pixel-identical.

After the approved preview has been checked, render with:

```sh
npm run render
```

Generated caches, snapshots, dependencies, and renders are ignored. The revised
render intentionally uses a new filename so the verified pre-revision MP4 cannot
be mistaken for the replacement. The exact local path, stream properties, and
hash belong in [`delivery/QA-REPORT.md`](delivery/QA-REPORT.md).

## Source map

| Path | Purpose |
| --- | --- |
| `index.html` | Main 133-second timeline and audio placements |
| `compositions/` | Nine scenes plus the persistent caption layer |
| `assets/captures/` | Six screen-recorded workflow takes and three derived stills |
| `assets/voice/` | Twelve narration clips |
| `assets/sfx/` | Original generated click cue |
| `assets/logo/teachback.svg` | Video-cropped derivative of `public/logo.svg` |
| `SCRIPT.md` | Exact narration |
| `STORYBOARD.md` | Approved scene plan |
| `frame.md` | Visual system |
| `ASSET-MANIFEST.md` | Provenance, media properties, and SHA-256 values |
| `THIRD_PARTY_NOTICES.md` | Vendored runtime notice |

The six takes preserve source evidence; timeline cuts and zooms are implemented
in the composition HTML. The captures retain their original lower-left `WebMCP
connected` label; no artificial patch is placed over dimmed or zoomed footage.
Current actor and proof labels share the upper row of the persistent caption band.
Do not replace real tool results with recreated cards or imply that WebMCP can
publish, approve, or apply a run.

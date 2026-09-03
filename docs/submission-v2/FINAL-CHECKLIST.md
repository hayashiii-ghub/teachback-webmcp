# Final release and submission checklist

This checklist deliberately separates local completion from public completion.
The official deadline is September 3, 2026 at 1:00 PM Pacific Time. Do not edit
the submitted repository, video, live site, or Devpost entry after the deadline
unless the organizers explicitly permit it.

## 1. Local release candidate

- [x] `bun audit --production` has no known production vulnerabilities
- [x] `bun run check` passes on the final worktree
- [x] `bun run test:e2e` passes on desktop and mobile
- [x] `git diff --check` passes
- [x] secret scan and large-file inventory are reviewed
- [x] final HyperFrames check passes after the lower-band label revision
- [x] representative frames are visually reviewed after the lower-band label revision
- [x] revised 133-second MP4 decodes and its stream properties/hash are recorded
- [x] Devpost copy, testing instructions, video, and current seven tools agree

## 2. Video and package finalization

- [x] prepare the Toban-aligned title, description, tags, and Studio settings in `YOUTUBE.md`
- [x] prepare the editable 16:9 thumbnail source and 1920 x 1080 upload image
- [x] upload the exact QA-approved MP4 to YouTube
- [x] wait for HD processing and automated checks
- [x] apply the custom thumbnail, title, description, tags, language, audience, and disclosure
- [x] make the video public
- [ ] verify signed-out playback with sound through the end
- [x] replace the video placeholder in `ENTRY.md` with that public URL
- [x] record the verified public URL in `YOUTUBE.md` and `README.md`
- [x] generate the current narrative screenshot set in `screenshots/`

## 3. Repository and live release

- [x] commit the reviewed release candidate
- [x] push the final commit to public `main`
- [x] verify the repository signed out, including visible MIT license
- [x] deploy that exact commit
- [x] verify live HTML/assets with a cache-bypass request
- [x] verify live security/WebMCP headers
- [x] test English and Japanese desktop/mobile UI without console errors
- [x] discover all seven tools in a compatible clean browser
- [x] invoke the draft and preparation flow against a fresh live session

## 4. Devpost

- [x] replace the historical story with `ENTRY.md`
- [x] replace the old video URL with the new public YouTube URL
- [x] replace old screenshots with the current narrative set
- [x] paste `TESTING.md` instructions and retain correct live/source links
- [x] save, reload, and verify every field
- [x] confirm the project is marked **Submitted**, not draft
- [x] archive the exact final URLs and on-page receipt

References: [official rules](https://webmcp.devpost.com/rules) and
[challenge checklist](https://webmcp.devpost.com/updates/46162-the-deadline-is-tomorrow).

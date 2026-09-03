# Asset manifest

Verified 2026-09-03. SHA-256 values identify the exact source used by the
approved 133-second edit.

## Screen captures

All takes were recorded from the creator's Teachback prototype using synthetic
challenge data. They are H.264, 1920 x 1080, nominally 30 fps, and contain no
audio. Take A is variable-frame-rate (`30/1` nominal, `8535/391` average); the
other five takes are constant 30 fps. HyperFrames renders the edit at 30 fps.

The captures predate a copy correction from `WebMCP connected` to `WebMCP tools
registered`. The original lower-left status label remains visible so dimmed and
zoomed product footage stays visually truthful. The edit does not recreate or
alter any tool result, workflow state, or audit evidence.

| File | Duration | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `take-a-human-recording.mp4` | 52.133333 s | 860,263 | `174b4664afe75a422d6cfcd1adb1e54c0cf19acc5a6ce027585c1b18880ded21` |
| `take-b-agent-draft.mp4` | 63.866667 s | 1,526,079 | `3f05027c58cb8e1e3f05bc42e4ab7dc45baf3f522996bfa9b23331eaa5e8f60f` |
| `take-c-human-review-publish.mp4` | 81.266667 s | 1,353,606 | `b5857d60c363ed85b11f64604d39defd2166104131227d88580d0ddb7d24a7b3` |
| `take-d-agent-prepare-emma.mp4` | 95.733333 s | 2,069,322 | `adb2f57223b7a6eab8167e3e2a2849fcefb32dbb20e265ee04a7746fa7dac167` |
| `take-e-human-apply-audit.mp4` | 66.766667 s | 1,763,844 | `a716f32ab77f7a38d297a495b0fd8279d921ec68ae86fee1ffcb5e6b68a90c79` |
| `take-f-agent-refusal.mp4` | 52.166667 s | 1,334,518 | `b4fe46dae52fab93fe3f74bb7669d41001a92a7400b4ff76f8f6426182ebccd4` |

The stills are PNG frames derived from those captures:

| File | SHA-256 |
| --- | --- |
| `still-recorded.png` | `b24f9773e08b0a07a444069288dce48e57db4822d4e218bc56d27c202949a6d4` |
| `still-published.png` | `052bbe3b937586d2f44b80a660d44fc12f2025852b79cc2e909878f951cf19a8` |
| `still-committed.png` | `f2e39321b431992b6c3379847c69feedd33b9e4ff9a69cca39056db5abb9f1e5` |

## Narration

The twelve mono 44.1 kHz MP3 clips were generated for this edit in HeyGen with
the creator-approved voice ID recorded in `BRIEF.md`. Text is exactly the twelve
lines in `SCRIPT.md`. The narration is synthetic and is not presented as a
recording of a human speaker.

| File | Duration | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `01.mp3` | 4.911000 s | 157,152 | `1a98319908a5568003a47317365fbbe960a70c2c2dda90fa936e82c1f9af5447` |
| `02.mp3` | 12.225281 s | 391,209 | `6d5eec71034baaecf1ffd568ad2c88658d858d89c94380b5ba388ee058b863ca` |
| `03.mp3` | 6.635094 s | 212,323 | `805d6a352d514a5b0f8ae42be6f231aed4c20964b16191bd3fe548f163fe6d49` |
| `04.mp3` | 6.635094 s | 212,323 | `7c453b0d5f4859953624665cf9520d95c7bc8b0eeb35f83b31dcf0d955e0b93a` |
| `05.mp3` | 13.035094 s | 417,123 | `6d5687b27d2ed81f11e6b41d03128d8b474098d0d96245f861b1c6478b1109d9` |
| `06.mp3` | 12.382031 s | 396,225 | `559a74daa658a47e36608274401d4583a68eca6711ea826a23d06309c6f16de2` |
| `07.mp3` | 6.243250 s | 199,784 | `397137bda1beb391a0d027ebd5754d17a9055e19025a7539cf605e7954c959f2` |
| `08.mp3` | 11.833469 s | 378,671 | `46c1c3c778bc973e41e0019f740caaf6c636c9e109f04a7ed00b43c7a2a9142a` |
| `09.mp3` | 12.904469 s | 412,943 | `08285aecbd653c45ca10ba796827b4648ca349d0ab094ca53a408245fcb48a73` |
| `10.mp3` | 8.176313 s | 261,642 | `8e9839a737d209df4fc94068f7ca00db608702cb0c2cc71174adabeaf7c71533` |
| `11.mp3` | 8.071813 s | 258,298 | `8729f0a6dac151ab672f1642797e065782bf166eec8cbd594d2952a3d90f6edd` |
| `12.mp3` | 8.124063 s | 259,970 | `dc3183d19211f5eb77d39edbd8a3d9e925b43053fe73a15f01bcdcba0e3d523a` |

## Brand, sound, and runtime

| File | Provenance | SHA-256 |
| --- | --- | --- |
| `assets/logo/teachback.svg` | Same creator-owned vectors as `public/logo.svg`; viewBox cropped from 520 to 359 for the outro | `262576d7cf6324d3b6961ef291adbea5905f82c4a26eba2b9810a27f718fc00d` |
| `assets/sfx/click-soft.wav` | Original deterministic synthesis from `scripts/generate-click.sh`; PCM s16le, stereo, 44.1 kHz, 0.370 s | `284e9f35839d239de2bd6fc944a9384bd1f5f73a39f83938aa7e05dedefd6d7d` |
| `assets/vendor/gsap.min.js` | GSAP 3.14.2; embedded license header and notice in `THIRD_PARTY_NOTICES.md` | `c174bfce53a729418d57a8ad8625e7247c793a22fef8e2851e3cfa3de9cd8280` |

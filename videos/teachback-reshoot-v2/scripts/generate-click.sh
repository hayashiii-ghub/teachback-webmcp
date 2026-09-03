#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"

# Original two-tone UI click. The fast exponential decay keeps it audible
# without competing with narration. Generated locally; no third-party sample.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi \
  -i "aevalsrc=0.64*sin(2*PI*1900*t)*exp(-170*t)+0.18*sin(2*PI*520*t)*exp(-95*t):s=44100:d=0.37" \
  -af "apad=pad_dur=0.20,atrim=0:0.37" \
  -ar 44100 \
  -ac 2 \
  -c:a pcm_s16le \
  "$project_dir/assets/sfx/click-soft.wav"

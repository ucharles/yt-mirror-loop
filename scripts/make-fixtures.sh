#!/usr/bin/env bash
# Generates the media fixtures from TEST_PLAN §1 with ffmpeg (never downloaded).
# Output: e2e/fixtures/*.{mp4,mov,webm} (also used by XCTest via the MirrorPlayer test spec).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/e2e/fixtures"
mkdir -p "$OUT"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

# 30 fps H.264/AAC 1280x720, 60 s, burned-in timestamp pattern + 1 kHz tone.
[ -f "$OUT/counter_30fps_60s.mp4" ] || ff \
  -f lavfi -i "testsrc=size=1280x720:rate=30:duration=60" \
  -f lavfi -i "sine=frequency=1000:sample_rate=44100:duration=60" \
  -c:v libx264 -preset veryfast -crf 32 -pix_fmt yuv420p -g 30 -c:a aac -b:a 64k -shortest -movflags +faststart \
  "$OUT/counter_30fps_60s.mp4"

# 24 fps HEVC .mov, 10 s.
[ -f "$OUT/counter_24fps_10s.mov" ] || ff \
  -f lavfi -i "testsrc=size=640x360:rate=24:duration=10" \
  -c:v libx265 -preset fast -crf 34 -pix_fmt yuv420p -tag:v hvc1 -x265-params log-level=error \
  "$OUT/counter_24fps_10s.mov"

# Asymmetric picture: bright block on the LEFT half only (mirror assertion by pixel sampling).
[ -f "$OUT/asym_arrow_10s.mp4" ] || ff \
  -f lavfi -i "color=c=black:size=1280x720:rate=30:duration=10" \
  -vf "drawbox=x=80:y=160:w=480:h=400:color=white:t=fill,drawbox=x=560:y=260:w=80:h=200:color=white:t=fill" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -movflags +faststart \
  "$OUT/asym_arrow_10s.mp4"

# VP9/WebM: must be rejected by the import pipeline.
[ -f "$OUT/bad_vp9.webm" ] || ff \
  -f lavfi -i "testsrc=size=320x240:rate=30:duration=3" -c:v libvpx-vp9 -b:v 200k "$OUT/bad_vp9.webm"

ls -la "$OUT"

# XCTest resources (MirrorPlayer test spec).
TESTS="$ROOT/modules/mirror-player/ios/Tests/Fixtures"
mkdir -p "$TESTS"
cp "$OUT/counter_30fps_60s.mp4" "$OUT/counter_24fps_10s.mov" "$OUT/bad_vp9.webm" "$TESTS/"

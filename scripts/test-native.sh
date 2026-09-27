#!/usr/bin/env bash
# L4: XCTest for the MirrorPlayer module on the iPad simulator (TEST_PLAN §5).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
UDID="$(device_udid)"
ensure_native_project
mkdir -p "$ROOT/build"
LOG="$ROOT/build/xctest.log"
set +e
xcodebuild test -workspace "$ROOT/ios/ytmirrorloop.xcworkspace" -scheme MirrorPlayer-Unit-Tests \
  -destination "id=$UDID" -derivedDataPath "$ROOT/build/dd-test" ARCHS=arm64 ONLY_ACTIVE_ARCH=YES >"$LOG" 2>&1
STATUS=$?
set -e
grep -E "Test Case .*(passed|failed)|error:|Executed [0-9]+ tests" "$LOG" | sort -u
exit $STATUS

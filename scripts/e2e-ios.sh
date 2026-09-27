#!/usr/bin/env bash
# L5: builds the E2E app (Release + EXPO_PUBLIC_E2E=1, JS bundled), installs it on the iPad simulator,
# copies fixtures into the app's Documents/e2e-fixtures and runs the Maestro flows (TEST_PLAN §6).
#   SKIP_BUILD=1   reuse the last build        FLOWS=<file|dir>   run a subset
#   E2E_TAGS=...   override tag selection (default: offline, plus network when online)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
UDID="$(device_udid)"
xcrun simctl bootstatus "$UDID" -b >/dev/null
APP="$ROOT/build/dd/Build/Products/Release-iphonesimulator/ytmirrorloop.app"

if [ "${SKIP_BUILD:-0}" != "1" ] || [ ! -d "$APP" ]; then
  ensure_native_project
  echo "▸ building E2E app"
  EXPO_PUBLIC_E2E=1 xcodebuild -workspace "$ROOT/ios/ytmirrorloop.xcworkspace" -scheme ytmirrorloop -configuration Release \
    -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath "$ROOT/build/dd" ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build \
    >"$ROOT/build/e2e-build.log" 2>&1 || { grep -E "error:" "$ROOT/build/e2e-build.log" | head -20; exit 1; }
fi

echo "▸ installing"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
sleep 2
DATA="$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)"
mkdir -p "$DATA/Documents/e2e-fixtures"
cp "$ROOT"/e2e/fixtures/* "$DATA/Documents/e2e-fixtures/"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl status_bar "$UDID" override --time "9:41" >/dev/null 2>&1 || true

TAGS="${E2E_TAGS:-offline}"
if [ -z "${E2E_TAGS:-}" ] && curl -s -m 5 -o /dev/null https://www.youtube.com; then TAGS="offline,network"; fi
echo "▸ maestro (tags: $TAGS)"
mkdir -p "$ROOT/e2e/report"
RUN_DIR="$ROOT/e2e/report/run-$(date +%Y%m%d-%H%M%S)"
set +e
maestro --device "$UDID" test "${FLOWS:-$ROOT/e2e/flows}" --include-tags "$TAGS" \
  --format junit --output "$ROOT/e2e/report/junit.xml" --test-output-dir "$RUN_DIR"
STATUS=$?
set -e

# E-06 pixel assertion on the screenshots cropped to the video view.
ORIG="$(find "$RUN_DIR" -name e06_original.png | head -1)"
MIRR="$(find "$RUN_DIR" -name e06_mirrored.png | head -1)"
if [ -n "$ORIG" ] && [ -n "$MIRR" ]; then
  swift "$ROOT/scripts/check-mirror.swift" "$ORIG" left && swift "$ROOT/scripts/check-mirror.swift" "$MIRR" right || STATUS=1
fi
# E-20: hardware keyboard shortcuts. Maestro cannot send hardware keys on iOS, so an XCUITest
# (modules/mirror-player/ios/KeyboardE2E) drives the installed app with XCUIElement.typeKey.
if [ -z "${FLOWS:-}" ] && [ "${SKIP_KEYBOARD:-0}" != "1" ]; then
  echo "▸ E-20 keyboard (XCUITest)"
  if xcodebuild test -workspace "$ROOT/ios/ytmirrorloop.xcworkspace" -scheme MirrorPlayer-UI-KeyboardE2E \
      -destination "id=$UDID" -derivedDataPath "$ROOT/build/dd-test" ARCHS=arm64 ONLY_ACTIVE_ARCH=YES >"$ROOT/build/e2e-keyboard.log" 2>&1; then
    echo "[Passed] keyboard (XCUITest)"
  else
    grep -E "error:" "$ROOT/build/e2e-keyboard.log" | head -5
    echo "[Failed] keyboard (XCUITest)"
    STATUS=1
  fi
fi
exit $STATUS

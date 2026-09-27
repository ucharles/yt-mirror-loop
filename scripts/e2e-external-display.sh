#!/usr/bin/env bash
# Best-effort (TEST_PLAN §6): toggles Simulator ▸ I/O ▸ External Displays via AppleScript and asserts the
# controller layout with Maestro. Requires Simulator.app with Accessibility permission for the terminal.
# The gating test for external display is e2e/flows/external_display_fake.yaml.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
UDID="$(device_udid)"
toggle() {
  osascript <<OSA
tell application "Simulator" to activate
tell application "System Events" to tell process "Simulator"
  click menu item "$1" of menu 1 of menu item "External Displays" of menu 1 of menu bar item "I/O" of menu bar 1
end tell
OSA
}
toggle "1920×1080 (1080p)" || { echo "Simulator menu not available — skipping (best-effort)"; exit 0; }
cat >"$ROOT/build/ext.yaml" <<YAML
appId: $BUNDLE_ID
---
- extendedWaitUntil:
    visible: { id: layout-controller }
    timeout: 10000
YAML
maestro --device "$UDID" test "$ROOT/build/ext.yaml"
toggle "Disabled"

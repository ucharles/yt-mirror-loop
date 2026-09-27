#!/usr/bin/env bash
# Idempotently creates and boots the iPad simulator used by E2E and XCTest.
# Writes its UDID to .e2e-device at the repo root.
set -euo pipefail
NAME="${SIM_NAME:-YTM iPad Pro 13}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

xcodebuild -runFirstLaunch
if ! xcrun simctl list runtimes | grep -q "^iOS"; then
  xcodebuild -downloadPlatform iOS
fi
RUNTIME="$(xcrun simctl list runtimes -j | /usr/bin/python3 -c '
import json,sys
rs=[r for r in json.load(sys.stdin)["runtimes"] if r["platform"]=="iOS" and r["isAvailable"]]
print(sorted(rs,key=lambda r:[int(x) for x in r["version"].split(".")])[-1]["identifier"])')"
DEVTYPE="$(xcrun simctl list devicetypes -j | /usr/bin/python3 -c '
import json,sys
ts=[t["identifier"] for t in json.load(sys.stdin)["devicetypes"] if "iPad-Pro-13" in t["identifier"]]
print(sorted(ts)[-1])')"

UDID="$(xcrun simctl list devices -j | /usr/bin/python3 -c "
import json,sys
for rt,ds in json.load(sys.stdin)['devices'].items():
  for d in ds:
    if d['name']=='$NAME' and d['isAvailable']: print(d['udid']); sys.exit()")"
if [ -z "$UDID" ]; then
  UDID="$(xcrun simctl create "$NAME" "$DEVTYPE" "$RUNTIME")"
  echo "created $NAME ($DEVTYPE, $RUNTIME)"
fi
echo "$UDID" > "$ROOT/.e2e-device"
xcrun simctl bootstatus "$UDID" -b
# Simulator window is optional (tests run headless; Xcode 27 ships no separate Simulator.app).
SIM_APP="$(xcode-select -p)/Applications/Simulator.app"
if [ -d "$SIM_APP" ]; then open "$SIM_APP" --args -CurrentDeviceUDID "$UDID"; else echo "running headless (no Simulator.app)"; fi
echo "ready: $NAME $UDID"

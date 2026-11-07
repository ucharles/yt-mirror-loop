#!/usr/bin/env bash
# Build the player assets and install a Debug build on a connected iOS device.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
ensure_native_project
cd "$ROOT"
exec npx expo run:ios --device "$@"

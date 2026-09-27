# Shared helpers for native/E2E scripts.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$PATH:$HOME/.maestro/bin"
# repo1.maven.org is very slow on some networks; RN pods honour ENTERPRISE_REPOSITORY.
export ENTERPRISE_REPOSITORY="${ENTERPRISE_REPOSITORY:-https://maven-central.storage-download.googleapis.com/maven2}"
BUNDLE_ID="com.pgmworks.ytmirrorloop"

device_udid() {
  if [ ! -f "$ROOT/.e2e-device" ] || ! xcrun simctl list devices | grep -q "$(cat "$ROOT/.e2e-device")"; then
    bash "$ROOT/scripts/setup-sim.sh" >&2
  fi
  cat "$ROOT/.e2e-device"
}

ensure_native_project() {
  (cd "$ROOT" && npx tsx scripts/build-player-html.ts >/dev/null)
  if [ ! -d "$ROOT/ios/Pods" ] || [ "$ROOT/modules/mirror-player/ios/MirrorPlayer.podspec" -nt "$ROOT/ios/Podfile.lock" ] || [ "$ROOT/app.json" -nt "$ROOT/ios/Podfile.lock" ]; then
    (cd "$ROOT" && CI=1 npx expo prebuild -p ios --no-install >/dev/null)
    (cd "$ROOT/ios" && pod install >/dev/null)
  fi
}

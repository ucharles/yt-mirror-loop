#!/usr/bin/env bash
# Checks every prerequisite from docs/IMPLEMENTATION_PLAN.md §2. Exits non-zero if any is missing.
set -u
export PATH="$PATH:$HOME/.maestro/bin"
fail=0
check() { # name, command, hint
  if eval "$2" >/dev/null 2>&1; then printf "  ✅ %s\n" "$1"; else printf "  ❌ %s — %s\n" "$1" "$3"; fail=1; fi
}
echo "yt-mirror-loop environment check"
check "Node >= 20"        '[ "$(node -p "process.versions.node.split(\".\")[0]")" -ge 20 ]' "install Node 20+"
check "Xcode selected"    'xcode-select -p | grep -q "Xcode.*\.app"'  "install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
check "Xcode license"     'xcodebuild -version'                        "sudo xcodebuild -license accept"
check "iOS sim runtime"   'xcrun simctl list runtimes | grep -q "^iOS"' "xcodebuild -downloadPlatform iOS"
check "iPad simulator"    '[ -f "$(dirname "$0")/../.e2e-device" ] && xcrun simctl list devices | grep -q "$(cat "$(dirname "$0")/../.e2e-device")"' "scripts/setup-sim.sh"
check "CocoaPods"         'pod --version'      "brew install cocoapods"
check "ffmpeg"            'ffmpeg -version'    "brew install ffmpeg"
check "watchman"          'watchman --version' "brew install watchman"
check "Java (Maestro)"    'java -version'      "brew install --cask temurin"
check "Maestro"           'maestro --version'  'curl -fsSL "https://get.maestro.mobile.dev" | bash'
exit $fail

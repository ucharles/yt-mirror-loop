#!/usr/bin/env bash
# Unsigned IPA for SideStore/AltStore (PRD §7.4). The installer re-signs with the user's free Apple ID.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
# Ship embedded production JS, never Metro or E2E controls inherited from a development shell.
export EXPO_PUBLIC_E2E=0
export NODE_ENV=production
export FORCE_BUNDLING=1
unset SKIP_BUNDLING
ensure_native_project
OUT="$ROOT/build/ipa"
rm -rf "$OUT" && mkdir -p "$OUT"
xcodebuild archive -workspace "$ROOT/ios/ytmirrorloop.xcworkspace" -scheme ytmirrorloop -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$OUT/ytmirrorloop.xcarchive" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" COMPILER_INDEX_STORE_ENABLE=NO -jobs 4 >"$OUT/archive.log" 2>&1 \
  || { grep -E "error:" "$OUT/archive.log" | head -20; exit 1; }
mkdir -p "$OUT/Payload"
cp -R "$OUT/ytmirrorloop.xcarchive/Products/Applications/ytmirrorloop.app" "$OUT/Payload/"
(cd "$OUT" && zip -qry "$ROOT/build/yt-mirror-loop.ipa" Payload)
# An IPA without embedded JS would still need the developer's Mac. Fail before handing it off.
test -s "$OUT/Payload/ytmirrorloop.app/main.jsbundle"
python3 "$ROOT/scripts/package-sidestore.py" "$ROOT/build/yt-mirror-loop.ipa"
echo "built $ROOT/build/yt-mirror-loop.ipa"

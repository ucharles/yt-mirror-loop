#!/usr/bin/env bash
# Unsigned IPA for SideStore/AltStore (PRD §7.4). The installer re-signs with the user's free Apple ID.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
ensure_native_project
OUT="$ROOT/build/ipa"
rm -rf "$OUT" && mkdir -p "$OUT"
xcodebuild archive -workspace "$ROOT/ios/ytmirrorloop.xcworkspace" -scheme ytmirrorloop -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$OUT/ytmirrorloop.xcarchive" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" >"$OUT/archive.log" 2>&1 \
  || { grep -E "error:" "$OUT/archive.log" | head -20; exit 1; }
mkdir -p "$OUT/Payload"
cp -R "$OUT/ytmirrorloop.xcarchive/Products/Applications/ytmirrorloop.app" "$OUT/Payload/"
(cd "$OUT" && zip -qry "$ROOT/build/yt-mirror-loop.ipa" Payload)
# CI check (IMPLEMENTATION_PLAN M0 ④): the zip must contain Payload/*.app
unzip -l "$ROOT/build/yt-mirror-loop.ipa" | grep -q "Payload/ytmirrorloop.app/Info.plist"
echo "built $ROOT/build/yt-mirror-loop.ipa"

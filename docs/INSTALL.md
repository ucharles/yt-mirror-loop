# Installing yt-mirror-loop on an iPad (free Apple ID)

No App Store / TestFlight. The app is distributed as an **unsigned IPA** that SideStore (or AltStore/Xcode) signs with your own free Apple ID. Free signing expires every 7 days, so refresh is automated.

> ⚠️ **Deleting the app deletes the imported video files** (`Documents/videos`). Refreshing/re-signing keeps them. Back up segment data with **내보내기** (JSON) before reinstalling.

## 1. Build the IPA (Mac)
```bash
npm install
npm run build:ipa          # → build/yt-mirror-loop.ipa
```
Send the IPA to the iPad (AirDrop or Files).

## 2. Recommended: SideStore (refreshes on the iPad itself)
1. One time, on a Mac: create the pairing file and install SideStore (follow the SideStore docs for the current iOS version). Install its companion local-VPN app (LocalDevVPN family).
2. In SideStore, sign in with **your own** Apple ID, then **+ → yt-mirror-loop.ipa**.
3. Automate refresh: Shortcuts → Automation → *Personal Automation* → e.g. **Time of Day 04:00** (or *When charger is connected*) → action **SideStore › Refresh All Apps** → turn off *Ask Before Running*.
4. Second user: repeats 1–3 with their own Apple ID on their iPad (same IPA).

## 3. Alternative: AltStore Classic + AltServer
Install AltServer on a Mac that stays on, same Wi-Fi as the iPad. AltStore refreshes in the background while the Mac is reachable.

## 4. Last resort: Xcode
`npx expo run:ios --device` (or open `ios/ytmirrorloop.xcworkspace`, set your team, Run). Must be repeated every 7 days.

## First launch checklist
- Library → **파일에서 가져오기** to copy practice videos into the app (mp4/mov, H.264/HEVC).
- Settings → check storage use; *iCloud 백업에서 영상 제외* is on by default.
- For TV: Control Center → **Screen Mirroring** → Apple TV. The TV shows only the (mirrored) video; the iPad becomes the controller.

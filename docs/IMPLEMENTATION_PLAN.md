# Implementation Plan — yt-mirror-loop

> Source of truth: [`PRD.md`](./PRD.md) (Draft v0.2). Tests: [`TEST_PLAN.md`](./TEST_PLAN.md).
> Working mode: **test-first**. For every step, write the tests listed for it, confirm they fail (red), then write the feature code until they pass (green), then refactor. A step is closed only when `npm run test:all` is green.

---

## 0. Ground rules

1. **Test plan before code.** `TEST_PLAN.md` is committed first (step S0). No feature code lands without tests for it.
2. **Red → green → refactor** for every step below. The PR/commit for a step contains the tests *and* the code, but tests are written first.
3. **All tests passing** is the exit criterion for every step and milestone (`npm run test:all`, TEST_PLAN §9).
4. **E2E runs on an iPadOS simulator** via Maestro. If no simulator exists, install it (§2).
5. Domain logic stays **pure TS** (`src/domain`) so both engines share it and it is testable in Node. The YouTube-in-WebView logic is TS compiled into the HTML. Native code is kept thin and covered by XCTest.

---

## 1. Current state (2026-09-27)

| Item | Status |
|---|---|
| Repo | Only `docs/PRD.md` and an initial commit |
| Node / npm | v24.13.0 / 11.6.2 ✅ |
| Xcode | ❌ **not installed** (only Command Line Tools) — so `xcodebuild`, `simctl` and the iPad simulator are all missing |
| CocoaPods, Maestro, ffmpeg | ❌ not installed |
| Free disk | ⚠️ **4.4 GB** on the Data volume. Xcode (~12–15 GB installed, about 2× that during install) + iPadOS runtime (~8 GB) + DerivedData need **≥ 40 GB free** |

**Blocker for L4/L5 tests:** free up disk space, then run §2. L1–L3 (Jest) can start right away.

---

## 2. Environment setup — iPadOS simulator & E2E toolchain (step S0-env)

```bash
# 2.1 Xcode (pick one)
brew install xcodesorg/made/xcodes && xcodes install --latest --experimental-unxip   # needs Apple ID
#   or install from the App Store, then:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch

# 2.2 iPadOS simulator runtime + device
xcodebuild -downloadPlatform iOS                    # installs the iOS/iPadOS simulator runtime
xcrun simctl list runtimes                          # note the iOS 18+/26 runtime id
xcrun simctl create "YTM iPad Pro 13" \
  "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB" \
  com.apple.CoreSimulator.SimRuntime.iOS-26-0       # use the id listed above
xcrun simctl boot "YTM iPad Pro 13" && open -a Simulator

# 2.3 Native build + test tools
brew install cocoapods ffmpeg watchman
curl -fsSL "https://get.maestro.mobile.dev" | bash   # Maestro CLI (uses the installed Temurin JDK)
maestro --version
```

`scripts/setup-sim.sh` does 2.2 idempotently (it creates the device only if missing and prints its UDID into `.e2e-device`). `scripts/doctor.sh` checks every prerequisite and exits non-zero with a hint if one is missing.

---

## 3. Architecture

```
yt-mirror-loop/
├─ app/                       # expo-router screens
│  ├─ index.tsx               # Library
│  ├─ player/[id].tsx         # Player (solo + external controller mode)
│  ├─ settings.tsx
│  └─ e2e/[...cmd].tsx        # debug-only deep-link handlers (compiled out in Release)
├─ src/
│  ├─ domain/                 # PURE TS — no RN imports
│  │  ├─ youtube/parseUrl.ts, oembed.ts
│  │  ├─ segments.ts          # validate / normalize(merge) / mirrorState / boundaries / nudge
│  │  ├─ abLoop.ts
│  │  ├─ schema.ts            # zod: Library, Video, MirrorSegment, ExportFile; migrate()
│  │  ├─ library/query.ts     # search / sort / filter / tags
│  │  ├─ import/localImport.ts
│  │  ├─ files/reconcile.ts
│  │  └─ transfer/exportJson.ts, importJson.ts, conflicts.ts, relink.ts
│  ├─ storage/libraryRepo.ts  # MMKV adapter (interface + mmkv impl + memory impl for tests)
│  ├─ platform/               # thin wrappers: fs, picker, clipboard, sharing, thumbnails, keepAwake
│  ├─ state/                  # zustand: libraryStore, playerStore, settingsStore
│  ├─ engines/
│  │  ├─ PlayerBridge.ts      # shared interface (below)
│  │  ├─ youtube/YouTubeEngine.tsx + player/ (TS → assets/player.html)
│  │  └─ native/NativeEngine.tsx (wraps MirrorPlayer module)
│  └─ components/             # Timeline, SegmentList, AbLoopPanel, MirrorBadge, VideoCard, …
├─ modules/mirror-player/     # local Expo Module (Swift)
│  ├─ ios/MirrorPlayerModule.swift, MirrorPlayerView.swift, MirrorEngine.swift,
│  │     ExternalDisplayManager.swift, ExternalSceneDelegate.swift, AssetProbe.swift
│  ├─ ios/Tests/*.swift       # XCTest
│  └─ src/index.ts            # TS bindings
├─ e2e/flows/*.yaml, e2e/fixtures/
├─ scripts/ setup-sim.sh, doctor.sh, make-fixtures.sh, build-player-html.ts,
│           e2e-ios.sh, e2e-external-display.sh, build-ipa.sh
└─ test/ setup.ts, mocks/ (mmkv, webview, mirror-player, fs, picker)
```

### 3.1 `PlayerBridge` (shared by both engines)

```ts
interface PlayerBridge {
  load(src: { kind: 'youtube'; videoId: string; start?: number } | { kind: 'local'; fileUri: string }): void;
  play(): void; pause(): void;
  seekTo(sec: number): void; seekBy(delta: number): void;
  stepFrames?(n: number): void;                  // local only
  setRate(rate: number): void; getAvailableRates(): number[];
  setMirrorConfig(cfg: { baseMirror: boolean; segments: MirrorSegment[] }): void;
  setLoop(loop: { a: number; b: number; enabled: boolean } | null): void;
  setExternalMode(on: boolean): void;
  on(ev: 'time' | 'state' | 'mirror' | 'duration' | 'error' | 'loop', cb: (p: any) => void): () => void;
}
```
Mirror and loop decisions run **inside the engine** (WebView JS / Swift boundary observers). RN only pushes config and receives events (PRD §3.5, §3.7).

### 3.2 Key decisions
| Topic | Decision |
|---|---|
| Expo | Latest SDK, New Architecture, `expo-router`, `expo prebuild -p ios` (the `ios/` folder is generated, not committed; config plugins hold the native settings) |
| Scene support | Config plugin adds `UIApplicationSceneManifest` with an `UIWindowSceneSessionRoleExternalDisplayNonInteractive` config → `ExternalSceneDelegate` |
| WebView origin | `source={{ html, baseUrl: 'https://yt-mirror-loop.local/' }}` + IFrame `origin` = same. Fallback: host `player.html` on GitHub Pages (PRD §10) |
| Mirror state in YouTube | CSS `transform: scaleX(-1)` on the iframe container, toggled from a rAF loop |
| Mirror state in local | `AVPlayerLayer.transform`, `addBoundaryTimeObserver`, recomputed after every seek completion |
| Storage | `react-native-mmkv`, single key `library.v1` (JSON) + `settings`; repo interface allows an in-memory implementation for tests |
| IDs | `expo-crypto` `randomUUID()` |

---

## 4. Steps and milestones

Each step lists: **Tests first** (IDs from TEST_PLAN) → **Implement** → **Exit**.

### S0 — Scaffold & test harness (no feature code)
- `npx create-expo-app@latest` (TS, expo-router) into the repo root; add eslint/prettier, `tsc --noEmit`.
- Install: `jest-expo`, `@testing-library/react-native`, `jest-environment-jsdom`, `zod`, `zustand`, `react-native-mmkv`, `react-native-webview`, `expo-document-picker`, `expo-file-system`, `expo-sharing`, `expo-video-thumbnails`, `expo-keep-awake`, `expo-clipboard`, `expo-crypto`.
- `test/mocks/*` for every native dependency; `test/setup.ts`.
- `npx create-expo-module --local mirror-player` → empty module + XCTest target that runs one trivial test.
- `scripts/make-fixtures.sh` generates the ffmpeg fixtures (TEST_PLAN §1).
- Maestro: `e2e/flows/app_launch.yaml` (E-01) against the "hello" app.
- `package.json` scripts: `test`, `test:native`, `e2e:ios`, `test:all`, `lint`, `typecheck`.
- **Write all L1/L2 test files from TEST_PLAN as failing specs** (`describe` blocks with real assertions against not-yet-existing modules). They stay red until their step, and are filtered by a Jest `projects` entry per milestone so the gate only runs tests for finished milestones (the filter list is in `jest.milestones.js` and only ever grows).
- **Exit:** `npm run test:all` green for the S0 scope (trivial XCTest, E-01 on the iPad simulator).

### M0 — Spikes (PRD §8). Real iPad needed for ④
| Spike | Automated evidence | Manual evidence |
|---|---|---|
| ① IFrame in WebView, no error 152/153 | P-CFG-01; E-16 smoke on simulator | real iPad |
| ② CSS mirror + ≤100 ms | P-MIR-05 simulation; prototype of E-17 | M-07 slow-mo recording |
| ③ External scene + WKWebView/AVPlayerLayer, one AVPlayer → two layers | N-EXT-02/03 prototype; Simulator ▸ External Displays | M-01 with Apple TV |
| ④ Unsigned IPA → SideStore, refresh, `Documents/` survives | `scripts/build-ipa.sh` produces a `.ipa` (CI check: zip contains `Payload/*.app`) | M-05 |
- **Exit:** a spike result note in `docs/spikes/M0.md` (pass/fail + fallback chosen). Spike code is thrown away or promoted only together with tests.

### M1 — YouTube player (PRD §3.1, 3.3, 3.4, 3.7, 3.8)
1. **URL + oEmbed.** Tests U-YT-01..10, U-OE-01..02 → `parseUrl.ts`, `oembed.ts`.
2. **Segments/XOR/loop domain.** Tests U-SEG-09..12, U-AB-01..05 → `segments.ts` (read side), `abLoop.ts`.
3. **Player JS.** Tests P-CLK-*, P-MIR-*, P-LOOP-01, P-MSG-*, P-ERR-*, P-CFG-01 → `engines/youtube/player/*.ts`, `build-player-html.ts` (esbuild → inline `<script>`), run as `prebuild`/`pretest`.
4. **YouTubeEngine + Player UI.** Tests C-PLY-01..06, C-TL-01, C-AB-01, C-LIB-04/05 → `YouTubeEngine.tsx` (implements `PlayerBridge` over `postMessage`), `PlayerScreen`, `Timeline`, `MirrorBadge`, `AbLoopPanel`, fine seek, rate picker from `getAvailablePlaybackRates`, keep-awake, embed-blocked message.
5. **E2E:** E-16, E-17, E-18 (tag `network`).
- **Exit:** gate green; E-17 max error ≤ 100 ms at 0.5/1/2×.

### M2 — Local player (PRD §3.2 P0, §3.5)
1. **Native engine.** Tests N-BND-*, N-MIR-*, N-SEEK-01, N-STEP-01, N-RATE-01, N-LOOP-01, N-EVT-01, N-PROBE-01, N-EXT-01 → `MirrorEngine.swift` (owns `AVPlayer`; boundary observers for segment edges + B point; zero-tolerance seek; `step(byCount:)`; `.timeDomain` pitch; `allowsExternalPlayback=false`; pre-seek A optimisation), `MirrorPlayerView.swift`, `AssetProbe.swift`, events at 10 Hz.
2. **TS bindings + NativeEngine.** Tests C-PLY-01/02 (local branch) → `modules/mirror-player/src`, `NativeEngine.tsx`.
3. **Import pipeline.** Tests U-LI-01..08 → `localImport.ts` (picker `public.movie` multi-select → free-space check → chunked copy to `Documents/videos/<uuid>.<ext>` with progress/cancel → `probe` → thumbnail at 10 % → exclude from backup → library entry).
4. **E2E:** E-02, E-03, E-04, E-05, E-06, E-07, E-08.
- **Exit:** gate green; N-MIR-02 and E-04 flip error ≤ 1 frame (33 ms at 30 fps).

### M3 — Segment editing & storage (PRD §3.6, 3.10, 3.9 P0)
1. **Segment editing domain.** Tests U-SEG-01..08, 13, 14 → validate / normalize(merge) / nudge / mark flow.
2. **Schema + repo.** Tests U-SCH-*, U-STO-* → `schema.ts` (zod, `schemaVersion:1`, `migrate`), `libraryRepo.ts` (MMKV, persist on every mutation).
3. **Reconcile.** Tests U-REC-* → runs at app start.
4. **Stores.** Tests U-ST-01..03.
5. **UI.** Tests C-SEG-01/02, C-LIB-01..03 → `SegmentList` (mark start/end, ±0.1/±1/±1 frame with preview seek, labels, delete, tap to seek), base-mirror toggle, library cards (source badge, "file missing"), rename/memo sheet, delete with file.
6. **E2E:** E-09, E-10, E-13.
- **Exit:** gate green; data survives force quit (E-10).

### M4 — Export / import (PRD §3.11)
1. Tests U-EX-*, U-IM-*, U-RL-* → `exportJson.ts` (strip fields, filename, `expo-sharing`), `importJson.ts` (zod-validate, error messages), `conflicts.ts` (key rules, overwrite keeps `fileName`, skip, copy, apply-to-all), `relink.ts` (±0.5 s rule, confirm on mismatch).
2. Tests C-IMP-01, C-LIB-02 → `ImportConflictSheet`, [파일 연결] flow, YouTube URL link on local videos (oEmbed title/thumbnail).
3. **E2E:** E-11, E-12.
- **Exit:** gate green; manual AirDrop between two devices when available.

### M5 — AirPlay / external display (PRD §3.12)
1. Tests N-EXT-02/03 → `ExternalDisplayManager.swift` + `ExternalSceneDelegate.swift`: on scene connect, create a `UIWindow`; local → a second `AVPlayerLayer` on the **same** `AVPlayer`; YouTube → a native `WKWebView` loading the same `player.html`, driven by the same commands; emit `externalDisplay` events; on disconnect, tear down and keep the player state.
2. YouTube in external mode: the in-app WebView is paused/hidden and the external WKWebView becomes the single player; `PlayerBridge` routes commands to it (no two players at once).
3. Tests C-EXT-01 → controller layout; debug "fake external display" toggle.
4. **E2E:** E-15 (gating), `e2e-external-display.sh` (best-effort).
- **Exit:** gate green; M-01/M-02 on Apple TV when available.

### M6 — Finish (PRD §3.9 P1, §3.2 P1, settings, deploy, §3.13 P2)
1. Tests U-LIB-01..05, E-19 → search, sort, source/tag filters, tag autocomplete.
2. Tests C-SET-01, E-14 → Settings (storage total, backup-exclude toggle, version).
3. Photo library import (`expo-image-picker`, reuses `localImport`) — extend U-LI with a picker-source case.
4. Tests C-KB-01, E-20 → hardware keyboard shortcuts (P2).
5. `scripts/build-ipa.sh` (prebuild → `xcodebuild archive CODE_SIGNING_ALLOWED=NO` → `Payload/` → `.ipa`) + `docs/INSTALL.md` (SideStore, Shortcuts automation, AltStore/Xcode fallbacks, "reinstall deletes local videos" warning).
6. P2 "Open in" document type (config plugin `CFBundleDocumentTypes`) if time allows, with a unit test for the incoming-URL handler.
- **Exit:** gate green; M-05/M-06 started on the second user's iPad.

---

## 5. Order of work & dependencies

```
S0-env ─┬─ S0 ─ M0 ─┬─ M1 ───────────┐
        │           └─ M2 ─┐         ├─ M3 ─ M4 ─ M5 ─ M6
        │                  └─────────┘
        └─ (L1–L3 Jest work can start before Xcode exists)
```
M1 and M2 can run in parallel after M0; M3 needs both engines' `setMirrorConfig`.

---

## 6. Commands (after S0)

| Command | Does |
|---|---|
| `npm test` | Jest L1–L3 with coverage thresholds (`src/domain` ≥ 95 %, overall ≥ 80 %) |
| `npm run test:native` | `expo prebuild -p ios` (if needed) + `xcodebuild test` of `MirrorPlayerTests` on the iPad simulator |
| `npm run e2e:ios` | `scripts/e2e-ios.sh`: boot simulator → `expo run:ios --configuration Debug --device <udid>` (E2E=1) → `maestro test e2e/flows --include-tags offline` (+`network` if online) → JUnit report in `e2e/report/` |
| `npm run test:all` | lint → typecheck → test → test:native → e2e:ios |
| `npm run doctor` | environment check (§2) |

---

## 7. Risks to the plan itself

| Risk | Mitigation |
|---|---|
| Not enough disk for Xcode + simulator (4.4 GB free now) | Free ≥ 40 GB before S0-env; until then only L1–L3 can run, and the gate stays **not green** for L4/L5 scopes |
| YouTube playback in the simulator blocked or flaky (ads, network) | `network`-tagged flows are reported separately; precision is also proven by P-MIR-05 (deterministic) and M-07 |
| Simulator can't prove AirPlay | Fake-display flow E-15 + native scene tests; real check M-01 |
| Boundary-observer timing jitter in CI simulator | N-MIR-02 checks media time at the flip (not wall time); tolerance 1 frame |
| Document picker not drivable by Maestro | Debug deep link `e2e/import-fixture` runs the same pipeline behind the picker; the picker call itself is covered by C-level mocks |

import AVFoundation
import UIKit
import XCTest

@testable import MirrorPlayer

private final class BundleToken {}

private func fixture(_ name: String) -> URL {
  let bundle = Bundle(for: BundleToken.self)
  let parts = name.split(separator: ".")
  if let url = bundle.url(forResource: String(parts[0]), withExtension: String(parts[1])) { return url }
  // Resources may be wrapped in a resource bundle depending on CocoaPods settings.
  for b in bundle.urls(forResourcesWithExtension: "bundle", subdirectory: nil) ?? [] {
    if let rb = Bundle(url: b), let url = rb.url(forResource: String(parts[0]), withExtension: String(parts[1])) { return url }
  }
  fatalError("fixture \(name) not found in \(bundle.bundlePath)")
}

final class MirrorPlayerTests: XCTestCase {
  private let frame = 1.0 / 30.0

  private func loadedEngine(_ name: String = "counter_30fps_60s.mp4") -> MirrorEngine {
    let engine = MirrorEngine()
    let done = expectation(description: "loaded")
    engine.load(url: fixture(name), fps: 30) { error in
      XCTAssertNil(error)
      done.fulfill()
    }
    wait(for: [done], timeout: 10)
    return engine
  }

  private func seek(_ engine: MirrorEngine, _ t: Double) {
    let done = expectation(description: "seek \(t)")
    engine.seek(to: t) { _ in done.fulfill() }
    wait(for: [done], timeout: 10)
  }

  // N-BND-01
  func testBoundaryTimesUseTimescale600() {
    let times = MirrorEngine.boundaryTimes([Segment(start: 2.5, end: 4), Segment(start: 1, end: 2.5)])
    XCTAssertEqual(times.map(\.timescale), [600, 600, 600])
    XCTAssertEqual(times.map(\.value), [600, 1500, 2400])
  }

  // N-BND-02
  func testUpdatingSegmentsKeepsOneObserver() {
    let engine = loadedEngine()
    engine.setMirrorConfig(baseMirror: false, segments: [Segment(start: 1, end: 2)])
    XCTAssertEqual(engine.segmentObserverCount, 1)
    engine.setMirrorConfig(baseMirror: false, segments: [Segment(start: 3, end: 4), Segment(start: 5, end: 6)])
    XCTAssertEqual(engine.segmentObserverCount, 1)
    engine.setMirrorConfig(baseMirror: false, segments: [])
    XCTAssertEqual(engine.segmentObserverCount, 0)
  }

  // N-MIR-01
  func testSetMirroredAppliesTransformWithoutAnimation() {
    let engine = MirrorEngine()
    let layer = AVPlayerLayer() // standalone layer: implicit actions would animate `transform`
    engine.attach(layer)
    XCTAssertTrue(layer.player === engine.player)
    engine.setMirrored(true)
    XCTAssertTrue(CATransform3DEqualToTransform(layer.transform, CATransform3DMakeScale(-1, 1, 1)))
    XCTAssertNil(layer.animation(forKey: "transform"))
    XCTAssertTrue(layer.animationKeys()?.isEmpty ?? true)
    engine.setMirrored(false)
    XCTAssertTrue(CATransform3DIsIdentity(layer.transform))
    engine.detach(layer)
    XCTAssertNil(layer.player)
  }

  // N-MIR-02
  func testFlipAtBoundaryWithinOneFrame() {
    let engine = loadedEngine()
    engine.setMirrorConfig(baseMirror: false, segments: [Segment(start: 2.0, end: 4.0)])
    seek(engine, 1.5)
    var flips: [MirrorTransition] = []
    let on = expectation(description: "flip on")
    let off = expectation(description: "flip off")
    engine.onMirror = { t in
      flips.append(t)
      if t.expectedAt == 2.0 { on.fulfill() }
      if t.expectedAt == 4.0 { off.fulfill() }
    }
    engine.play()
    wait(for: [on, off], timeout: 10, enforceOrder: true)
    engine.pause()
    XCTAssertEqual(flips.map(\.mirrored), [true, false])
    for t in flips {
      XCTAssertLessThanOrEqual(abs(t.actualAt - t.expectedAt!), frame, "flip at \(t.actualAt) for boundary \(t.expectedAt!)")
    }
  }

  // N-MIR-03
  func testSeekIntoSegmentRecomputesBeforeCompletion() {
    let engine = loadedEngine()
    engine.setMirrorConfig(baseMirror: false, segments: [Segment(start: 5, end: 8)])
    XCTAssertFalse(engine.isMirrored)
    let done = expectation(description: "seek")
    engine.seek(to: 6) { _ in
      XCTAssertTrue(engine.isMirrored)
      done.fulfill()
    }
    wait(for: [done], timeout: 10)
    seek(engine, 9)
    XCTAssertFalse(engine.isMirrored)
    engine.setMirrorConfig(baseMirror: true, segments: [Segment(start: 5, end: 8)])
    XCTAssertTrue(engine.isMirrored)
  }

  // N-SEEK-01
  func testExactSeek() {
    let engine = loadedEngine()
    seek(engine, 12.345)
    let t = engine.currentTime
    let nearestFrame = (t * 30).rounded() / 30
    XCTAssertTrue(abs(t - 12.345) <= 0.001 || abs(t - nearestFrame) <= 0.001, "landed at \(t)")
  }

  // N-STEP-01
  func testFrameStepTenTimes() {
    let engine = loadedEngine()
    seek(engine, 0)
    for _ in 0..<10 {
      let done = expectation(description: "step")
      engine.step(frames: 1) { _ in done.fulfill() }
      wait(for: [done], timeout: 5)
    }
    XCTAssertEqual(Int((engine.currentTime * 30).rounded()), 10)
    XCTAssertEqual(engine.currentTime, 10.0 / 30.0, accuracy: 0.001)
    let back = expectation(description: "step back")
    engine.step(frames: -3) { _ in back.fulfill() }
    wait(for: [back], timeout: 5)
    XCTAssertEqual(Int((engine.currentTime * 30).rounded()), 7)
  }

  // N-RATE-01
  func testHalfRateKeepsPitch() {
    let engine = loadedEngine()
    engine.setRate(0.5)
    engine.play()
    XCTAssertEqual(engine.player.rate, 0.5)
    XCTAssertEqual(engine.player.currentItem?.audioTimePitchAlgorithm, .timeDomain)
    engine.pause()
    engine.setRate(5)
    XCTAssertEqual(engine.desiredRate, 2)
  }

  // N-LOOP-01
  func testAbLoopTenTimes() {
    let engine = loadedEngine()
    engine.setRate(2)
    seek(engine, 0.9)
    var landings: [Double] = []
    let ten = expectation(description: "10 loops")
    engine.onLoopLanded = { t in
      landings.append(t)
      if landings.count == 10 { ten.fulfill() }
    }
    engine.setLoop(a: 1, b: 3, enabled: true)
    engine.play()
    wait(for: [ten], timeout: 30)
    engine.pause()
    XCTAssertEqual(engine.loopCount, 10)
    for t in landings { XCTAssertEqual(t, 1.0, accuracy: frame) }
    engine.clearLoop()
    XCTAssertNil(engine.loop)
  }

  // N-EXT-01
  func testExternalPlaybackDisabled() {
    XCTAssertFalse(MirrorEngine().player.allowsExternalPlayback)
  }

  // N-EXT-02
  func testExternalWindowSharesSamePlayer() {
    let engine = loadedEngine()
    let manager = ExternalDisplayManager()
    var changes: [(Bool, Bool)] = []
    manager.onChange = { changes.append(($0, $1)) }
    manager.setContent(.local(engine))
    manager.connect(window: UIWindow(frame: CGRect(x: 0, y: 0, width: 1920, height: 1080)), fake: true)
    XCTAssertTrue(manager.isConnected)
    XCTAssertNotNil(manager.window?.rootViewController)
    XCTAssertTrue(manager.playerLayer?.player === engine.player)
    XCTAssertEqual(changes.first?.0, true)
    // In-app layer plus external layer, both on the same AVPlayer.
    let inApp = AVPlayerLayer()
    engine.attach(inApp)
    XCTAssertEqual(Set(engine.attachedLayers.map { ObjectIdentifier($0.player!) }).count, 1)
    engine.setMirrored(true)
    XCTAssertTrue(CATransform3DEqualToTransform(manager.playerLayer!.transform, CATransform3DMakeScale(-1, 1, 1)))
    // Switching to YouTube content replaces the layer with a web view.
    manager.setContent(.youtube(html: "<html></html>", baseURL: URL(string: "https://yt-mirror-loop.local/")!))
    XCTAssertNil(manager.playerLayer)
    XCTAssertNotNil(manager.webView)
    manager.disconnect()
  }

  // N-EXT-03
  func testExternalDisconnectKeepsPlayerState() {
    let engine = loadedEngine()
    let manager = ExternalDisplayManager()
    manager.setContent(.local(engine))
    manager.connect(window: UIWindow(frame: CGRect(x: 0, y: 0, width: 1920, height: 1080)), fake: true)
    seek(engine, 7.5)
    engine.setRate(0.75)
    let before = (engine.currentTime, engine.player.rate, engine.desiredRate)
    var disconnected = false
    manager.onChange = { connected, _ in disconnected = !connected }
    manager.disconnect()
    XCTAssertTrue(disconnected)
    XCTAssertNil(manager.window)
    XCTAssertNil(manager.playerLayer)
    XCTAssertEqual(engine.currentTime, before.0, accuracy: 0.001)
    XCTAssertEqual(engine.player.rate, before.1)
    XCTAssertEqual(engine.desiredRate, before.2)
    XCTAssertTrue(engine.attachedLayers.isEmpty)
  }

  // N-EVT-01
  func testTimeEventsAboutTenHertz() {
    let engine = loadedEngine()
    seek(engine, 10)
    var count = 0
    engine.onTime = { _, _ in count += 1 }
    engine.play()
    // Let playback settle, then count for exactly 2 s.
    let settle = expectation(description: "settle")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { settle.fulfill() }
    wait(for: [settle], timeout: 2)
    count = 0
    let window = expectation(description: "2s")
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { window.fulfill() }
    wait(for: [window], timeout: 4)
    engine.pause()
    let perSecond = Double(count) / 2
    XCTAssertGreaterThanOrEqual(perSecond, 8)
    XCTAssertLessThanOrEqual(perSecond, 12)
  }

  // N-PROBE-01
  func testProbe() async {
    let mp4 = await AssetProbe.probe(url: fixture("counter_30fps_60s.mp4"))
    XCTAssertTrue(mp4.playable)
    XCTAssertEqual(Double(mp4.durationMs), 60000, accuracy: 100)
    XCTAssertEqual(mp4.fps ?? 0, 30, accuracy: 0.01)
    XCTAssertEqual(mp4.width, 1280)
    XCTAssertEqual(mp4.height, 720)
    XCTAssertGreaterThan(mp4.fileSize, 0)

    let mov = await AssetProbe.probe(url: fixture("counter_24fps_10s.mov"))
    XCTAssertTrue(mov.playable)
    XCTAssertEqual(mov.fps ?? 0, 24, accuracy: 0.01)
    XCTAssertEqual(Double(mov.durationMs), 10000, accuracy: 100)

    let webm = await AssetProbe.probe(url: fixture("bad_vp9.webm"))
    XCTAssertFalse(webm.playable)
  }
}

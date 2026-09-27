import AVFoundation
import QuartzCore

/// One mirror flip, used for precision logging (TEST_PLAN "mirror transition log").
public struct MirrorTransition {
  public let mirrored: Bool
  /// Boundary that caused the flip; nil for flips caused by seeks or config changes.
  public let expectedAt: Double?
  public let actualAt: Double

  public var errorMs: Double? {
    guard let expectedAt else { return nil }
    return (actualAt - expectedAt) * 1000
  }

  public var dictionary: [String: Any] {
    var d: [String: Any] = ["mirrored": mirrored, "actualAt": actualAt]
    d["expectedAt"] = expectedAt ?? NSNull()
    d["errorMs"] = errorMs ?? NSNull()
    return d
  }
}

public struct Segment: Equatable {
  public let start: Double
  public let end: Double
  public init(start: Double, end: Double) {
    self.start = start
    self.end = end
  }
}

/// Owns the single `AVPlayer`. Mirror and A-B loop decisions happen here, on boundary observers,
/// so they are frame-accurate and independent of the JS bridge (PRD §3.5).
public final class MirrorEngine: NSObject {
  public static let timescale: CMTimeScale = 600

  public let player: AVPlayer
  public private(set) var segments: [Segment] = []
  public private(set) var baseMirror = false
  public private(set) var isMirrored = false
  public private(set) var loop: (a: Double, b: Double)?
  public private(set) var desiredRate: Float = 1
  public private(set) var loopCount = 0
  public private(set) var fps: Double = 30

  /// Number of boundary observers currently registered for segment edges (N-BND-02).
  public var segmentObserverCount: Int { boundaryToken == nil ? 0 : 1 }

  public var onMirror: ((MirrorTransition) -> Void)?
  public var onTime: ((Double, Double) -> Void)?
  public var onState: ((String) -> Void)?
  public var onLoop: ((Int, Double) -> Void)?
  /// Media time where playback resumed after an A-B jump (precision checks).
  public var onLoopLanded: ((Double) -> Void)?

  private var boundaryToken: Any?
  private var loopToken: Any?
  private var periodicToken: Any?
  private var statusObservation: NSKeyValueObservation?
  private var rateObservation: NSKeyValueObservation?
  private var endObserver: NSObjectProtocol?
  private let layers = NSHashTable<AVPlayerLayer>.weakObjects()
  private var lastState = ""

  public override init() {
    player = AVPlayer()
    super.init()
    player.allowsExternalPlayback = false
    player.actionAtItemEnd = .pause
    player.automaticallyWaitsToMinimizeStalling = false
    periodicToken = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 10), queue: .main) { [weak self] t in
      guard let self else { return }
      self.onTime?(t.seconds, self.duration)
    }
    rateObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] p, _ in
      DispatchQueue.main.async { self?.emitState() }
    }
  }

  deinit {
    if let periodicToken { player.removeTimeObserver(periodicToken) }
    if let boundaryToken { player.removeTimeObserver(boundaryToken) }
    if let loopToken { player.removeTimeObserver(loopToken) }
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
  }

  // MARK: - Loading

  public var currentTime: Double {
    let t = player.currentTime().seconds
    return t.isFinite ? t : 0
  }

  public var duration: Double {
    guard let d = player.currentItem?.duration.seconds, d.isFinite else { return 0 }
    return d
  }

  public var isPlaying: Bool { player.rate != 0 }

  /// Replaces the current item. Calls `completion` once the item is ready (or failed).
  public func load(url: URL, fps: Double? = nil, completion: ((Error?) -> Void)? = nil) {
    let item = AVPlayerItem(url: url)
    item.audioTimePitchAlgorithm = .timeDomain
    loopCount = 0
    if let fps, fps > 0 { self.fps = fps }
    statusObservation = item.observe(\.status, options: [.initial, .new]) { item, _ in
      switch item.status {
      case .readyToPlay:
        DispatchQueue.main.async { completion?(nil) }
      case .failed:
        DispatchQueue.main.async { completion?(item.error ?? NSError(domain: "MirrorPlayer", code: 1)) }
      default:
        break
      }
    }
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
      self?.emitState(force: "ended")
    }
    player.replaceCurrentItem(with: item)
    if fps == nil {
      Task { [weak self] in
        let asset = AVURLAsset(url: url)
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let rate = try? await track.load(.nominalFrameRate), rate > 0 {
          await MainActor.run { self?.fps = Double(rate) }
        }
      }
    }
    applyMirror(mirrorState(at: 0))
    installSegmentObserver()
    installLoopObserver()
  }

  public func unload() {
    player.pause()
    player.replaceCurrentItem(with: nil)
    statusObservation = nil
  }

  // MARK: - Layers

  public func attach(_ layer: AVPlayerLayer) {
    layer.player = player
    layers.add(layer)
    setTransform(on: layer, mirrored: isMirrored)
  }

  public func detach(_ layer: AVPlayerLayer) {
    layers.remove(layer)
    if layer.player === player { layer.player = nil }
  }

  public var attachedLayers: [AVPlayerLayer] { layers.allObjects }

  private func setTransform(on layer: CALayer, mirrored: Bool) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    layer.transform = mirrored ? CATransform3DMakeScale(-1, 1, 1) : CATransform3DIdentity
    CATransaction.commit()
  }

  /// Applies the mirror transform to every attached layer without implicit animation (N-MIR-01).
  public func setMirrored(_ on: Bool) {
    isMirrored = on
    for layer in layers.allObjects { setTransform(on: layer, mirrored: on) }
  }

  // MARK: - Segments / mirror

  public static func boundaryTimes(_ segments: [Segment]) -> [CMTime] {
    let flat = Set(segments.flatMap { [$0.start, $0.end] })
    return flat.sorted().map { CMTime(seconds: $0, preferredTimescale: timescale) }
  }

  public func inAnySegment(_ t: Double) -> Bool {
    segments.contains { t >= $0.start && t < $0.end }
  }

  public func mirrorState(at t: Double) -> Bool {
    baseMirror != inAnySegment(t)
  }

  public func setMirrorConfig(baseMirror: Bool, segments: [Segment]) {
    self.baseMirror = baseMirror
    self.segments = segments.sorted { $0.start < $1.start }
    installSegmentObserver()
    applyMirror(mirrorState(at: currentTime))
  }

  private func applyMirror(_ want: Bool, expectedAt: Double? = nil) {
    guard want != isMirrored else { return }
    setMirrored(want)
    onMirror?(MirrorTransition(mirrored: want, expectedAt: expectedAt, actualAt: currentTime))
  }

  private func installSegmentObserver() {
    if let boundaryToken { player.removeTimeObserver(boundaryToken) }
    boundaryToken = nil
    let times = Self.boundaryTimes(segments)
    guard !times.isEmpty else { return }
    boundaryToken = player.addBoundaryTimeObserver(forTimes: times.map { NSValue(time: $0) }, queue: .main) { [weak self] in
      self?.boundaryFired()
    }
  }

  private func boundaryFired() {
    let t = currentTime
    let bounds = segments.flatMap { [$0.start, $0.end] }
    let nearest = bounds.min { abs($0 - t) < abs($1 - t) }
    // Evaluate just past the boundary so that `[start, end)` edges resolve deterministically.
    let evalAt = nearest.map { max(t, $0) } ?? t
    applyMirror(mirrorState(at: evalAt), expectedAt: nearest)
  }

  // MARK: - Transport

  public func play() {
    if let item = player.currentItem, item.currentTime() >= item.duration, item.duration.isNumeric {
      seek(to: 0)
    }
    player.playImmediately(atRate: desiredRate)
  }

  public func pause() {
    player.pause()
  }

  public func setRate(_ rate: Float) {
    desiredRate = min(2, max(0.25, rate))
    player.currentItem?.audioTimePitchAlgorithm = .timeDomain
    if player.rate != 0 { player.rate = desiredRate }
  }

  /// Zero-tolerance seek. Mirror state is recomputed for the target immediately and again when the seek lands (N-MIR-03).
  public func seek(to seconds: Double, completion: ((Bool) -> Void)? = nil) {
    let target = max(0, duration > 0 ? min(seconds, duration) : seconds)
    applyMirror(mirrorState(at: target))
    let time = CMTime(seconds: target, preferredTimescale: Self.timescale)
    player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
      guard let self else { return }
      if finished { self.applyMirror(self.mirrorState(at: self.currentTime)) }
      completion?(finished)
    }
  }

  public func seek(by delta: Double, completion: ((Bool) -> Void)? = nil) {
    seek(to: currentTime + delta, completion: completion)
  }

  /// Steps whole frames (paused). Uses the frame grid (`n / fps`) so repeated steps never drift.
  public func step(frames: Int, completion: ((Bool) -> Void)? = nil) {
    player.pause()
    let frameIndex = (currentTime * fps).rounded() + Double(frames)
    let target = max(0, frameIndex / fps)
    let time = CMTime(value: CMTimeValue((target * Double(Self.timescale)).rounded()), timescale: Self.timescale)
    applyMirror(mirrorState(at: target))
    player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
      guard let self else { return }
      if finished { self.applyMirror(self.mirrorState(at: self.currentTime)) }
      completion?(finished)
    }
  }

  // MARK: - A-B loop

  public func setLoop(a: Double, b: Double, enabled: Bool) {
    loop = enabled && a < b ? (a, b) : nil
    loopCount = 0
    installLoopObserver()
  }

  public func clearLoop() {
    loop = nil
    installLoopObserver()
  }

  private func installLoopObserver() {
    if let loopToken { player.removeTimeObserver(loopToken) }
    loopToken = nil
    guard let loop else { return }
    let b = CMTime(seconds: loop.b, preferredTimescale: Self.timescale)
    loopToken = player.addBoundaryTimeObserver(forTimes: [NSValue(time: b)], queue: .main) { [weak self] in
      guard let self, let loop = self.loop else { return }
      self.loopCount += 1
      let at = self.currentTime
      self.seek(to: loop.a) { [weak self] _ in
        guard let self else { return }
        self.onLoopLanded?(self.currentTime)
      }
      self.onLoop?(self.loopCount, at)
    }
  }

  // MARK: - State events

  private func emitState(force: String? = nil) {
    let s: String
    if let force { s = force } else {
      switch player.timeControlStatus {
      case .playing: s = "playing"
      case .waitingToPlayAtSpecifiedRate: s = "buffering"
      default: s = "paused"
      }
    }
    guard s != lastState else { return }
    lastState = s
    onState?(s)
  }
}

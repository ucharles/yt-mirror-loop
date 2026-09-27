import AVFoundation
import ExpoModulesCore

public class MirrorPlayerModule: Module {
  static let engine = MirrorEngine()
  private var external: ExternalDisplayManager { .shared }

  private static func url(from uri: String) -> URL {
    if let u = URL(string: uri), u.scheme != nil { return u }
    return URL(fileURLWithPath: uri)
  }

  public func definition() -> ModuleDefinition {
    Name("MirrorPlayer")

    Events("onTime", "onState", "onMirror", "onLoop", "onExternalDisplay", "onExternalMessage", "onKey")

    OnCreate {
      let engine = Self.engine
      engine.onTime = { [weak self] t, d in self?.sendEvent("onTime", ["t": t, "duration": d]) }
      engine.onState = { [weak self] s in self?.sendEvent("onState", ["state": s]) }
      engine.onMirror = { [weak self] tr in self?.sendEvent("onMirror", tr.dictionary) }
      engine.onLoop = { [weak self] n, at in self?.sendEvent("onLoop", ["count": n, "at": at]) }
      KeyboardShortcuts.handler = { [weak self] key, shift in self?.sendEvent("onKey", ["key": key, "shift": shift]) }
      DispatchQueue.main.async {
        let ext = ExternalDisplayManager.shared
        ext.onChange = { [weak self] connected, fake in
          self?.sendEvent("onExternalDisplay", ["connected": connected, "fake": fake])
        }
        ext.onWebMessage = { [weak self] body in self?.sendEvent("onExternalMessage", ["data": body]) }
        ext.startObserving()
      }
    }

    // MARK: Playback

    AsyncFunction("load") { (uri: String, fps: Double?, promise: Promise) in
      Self.engine.load(url: Self.url(from: uri), fps: fps) { error in
        if let error { promise.reject("E_LOAD", error.localizedDescription) } else {
          promise.resolve(["duration": Self.engine.duration, "fps": Self.engine.fps])
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("unload") { Self.engine.unload() }.runOnQueue(.main)
    AsyncFunction("play") { Self.engine.play() }.runOnQueue(.main)
    AsyncFunction("pause") { Self.engine.pause() }.runOnQueue(.main)
    AsyncFunction("setRate") { (rate: Double) in Self.engine.setRate(Float(rate)) }.runOnQueue(.main)

    AsyncFunction("seekTo") { (seconds: Double, promise: Promise) in
      Self.engine.seek(to: seconds) { _ in promise.resolve(Self.engine.currentTime) }
    }.runOnQueue(.main)

    AsyncFunction("seekBy") { (delta: Double, promise: Promise) in
      Self.engine.seek(by: delta) { _ in promise.resolve(Self.engine.currentTime) }
    }.runOnQueue(.main)

    AsyncFunction("stepFrames") { (n: Int, promise: Promise) in
      Self.engine.step(frames: n) { _ in promise.resolve(Self.engine.currentTime) }
    }.runOnQueue(.main)

    AsyncFunction("setMirrorConfig") { (baseMirror: Bool, segments: [[Double]]) in
      let segs = segments.compactMap { $0.count >= 2 ? Segment(start: $0[0], end: $0[1]) : nil }
      Self.engine.setMirrorConfig(baseMirror: baseMirror, segments: segs)
    }.runOnQueue(.main)

    AsyncFunction("setLoop") { (a: Double, b: Double, enabled: Bool) in
      Self.engine.setLoop(a: a, b: b, enabled: enabled)
    }.runOnQueue(.main)

    AsyncFunction("clearLoop") { Self.engine.clearLoop() }.runOnQueue(.main)

    AsyncFunction("getStatus") { () -> [String: Any] in
      let e = Self.engine
      return ["t": e.currentTime, "duration": e.duration, "playing": e.isPlaying, "mirrored": e.isMirrored, "rate": e.desiredRate, "loopCount": e.loopCount, "fps": e.fps]
    }.runOnQueue(.main)

    // MARK: Files

    AsyncFunction("probe") { (uri: String) async -> [String: Any] in
      await AssetProbe.probe(url: Self.url(from: uri)).dictionary
    }

    Function("setExcludedFromBackup") { (uri: String, excluded: Bool) -> Bool in
      var url = Self.url(from: uri)
      var values = URLResourceValues()
      values.isExcludedFromBackup = excluded
      do {
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }

    Function("isExcludedFromBackup") { (uri: String) -> Bool in
      (try? Self.url(from: uri).resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup) ?? false
    }

    Function("freeDiskSpace") { () -> Double in
      let home = URL(fileURLWithPath: NSHomeDirectory())
      if let v = try? home.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage {
        return Double(v)
      }
      return 0
    }

    // MARK: External display

    AsyncFunction("isExternalDisplayConnected") { () -> [String: Bool] in
      ["connected": ExternalDisplayManager.shared.isConnected, "fake": ExternalDisplayManager.shared.isFake]
    }.runOnQueue(.main)

    AsyncFunction("setFakeExternalDisplay") { (on: Bool) in
      ExternalDisplayManager.shared.setFake(on)
    }.runOnQueue(.main)

    AsyncFunction("setExternalContent") { (kind: String, html: String?, baseUrl: String?) in
      let ext = ExternalDisplayManager.shared
      switch kind {
      case "local":
        ext.setContent(.local(Self.engine))
      case "youtube":
        if let html, let base = URL(string: baseUrl ?? "https://yt-mirror-loop.local/") {
          ext.setContent(.youtube(html: html, baseURL: base))
        }
      default:
        ext.setContent(.none)
      }
    }.runOnQueue(.main)

    AsyncFunction("sendExternalCommand") { (json: String) in
      ExternalDisplayManager.shared.sendCommand(json: json)
    }.runOnQueue(.main)

    AsyncFunction("enableKeyboardShortcuts") { KeyboardShortcuts.install() }.runOnQueue(.main)

    View(MirrorPlayerView.self) {}
  }
}

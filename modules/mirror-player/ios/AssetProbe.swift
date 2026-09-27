import AVFoundation

public struct ProbeResult {
  public let playable: Bool
  public let durationMs: Int
  public let fileSize: Int
  public let width: Int?
  public let height: Int?
  public let fps: Double?

  public var dictionary: [String: Any] {
    var d: [String: Any] = ["playable": playable, "durationMs": durationMs, "fileSize": fileSize]
    if let width { d["width"] = width }
    if let height { d["height"] = height }
    if let fps { d["fps"] = fps }
    return d
  }
}

/// Reads playability and metadata with AVFoundation (PRD §3.2). webm/VP9 and friends report `playable == false`.
public enum AssetProbe {
  public static func probe(url: URL) async -> ProbeResult {
    let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
    let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    do {
      let (playable, duration, tracks) = try await asset.load(.isPlayable, .duration, .tracks)
      let videoTracks = tracks.filter { $0.mediaType == .video }
      guard playable, let video = videoTracks.first, duration.seconds.isFinite, duration.seconds > 0 else {
        return ProbeResult(playable: false, durationMs: 0, fileSize: size, width: nil, height: nil, fps: nil)
      }
      let (natural, transform, rate, decodable) = try await video.load(.naturalSize, .preferredTransform, .nominalFrameRate, .isDecodable)
      guard decodable else {
        return ProbeResult(playable: false, durationMs: 0, fileSize: size, width: nil, height: nil, fps: nil)
      }
      let rect = CGRect(origin: .zero, size: natural).applying(transform)
      return ProbeResult(
        playable: true,
        durationMs: Int((duration.seconds * 1000).rounded()),
        fileSize: size,
        width: Int(abs(rect.width).rounded()),
        height: Int(abs(rect.height).rounded()),
        fps: rate > 0 ? Double(rate) : nil
      )
    } catch {
      return ProbeResult(playable: false, durationMs: 0, fileSize: size, width: nil, height: nil, fps: nil)
    }
  }
}

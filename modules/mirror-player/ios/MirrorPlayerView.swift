import ExpoModulesCore
import UIKit

/// In-app video surface. Attaches an `AVPlayerLayer` to the shared engine's player.
class MirrorPlayerView: ExpoView {
  let playerView = PlayerLayerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    playerView.frame = bounds
    playerView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    playerView.playerLayer.videoGravity = .resizeAspect
    addSubview(playerView)
    MirrorPlayerModule.engine.attach(playerView.playerLayer)
  }

  override func removeFromSuperview() {
    MirrorPlayerModule.engine.detach(playerView.playerLayer)
    super.removeFromSuperview()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { MirrorPlayerModule.engine.attach(playerView.playerLayer) }
  }
}

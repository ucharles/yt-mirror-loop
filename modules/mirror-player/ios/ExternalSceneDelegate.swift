import UIKit

/// Scene delegate for `UIWindowSceneSessionRoleExternalDisplayNonInteractive` (AirPlay screen mirroring,
/// external displays). Registered in Info.plist by plugins/withSceneLifecycle.js.
@objc(YTMExternalSceneDelegate)
public final class ExternalSceneDelegate: UIResponder, UIWindowSceneDelegate {
  public var window: UIWindow?

  public func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    ExternalDisplayManager.shared.connect(window: window, fake: false)
  }

  public func sceneDidDisconnect(_ scene: UIScene) {
    if let window, ExternalDisplayManager.shared.window === window {
      ExternalDisplayManager.shared.disconnect()
    }
    window = nil
  }
}

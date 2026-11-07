import AVFoundation
import UIKit
import WebKit

/// A UIView whose backing layer is an `AVPlayerLayer`.
public final class PlayerLayerView: UIView {
  public override class var layerClass: AnyClass { AVPlayerLayer.self }
  public var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

/// Renders the mirrored video on the external screen (AirPlay screen mirroring / external display).
/// Local sources get a second `AVPlayerLayer` on the *same* `AVPlayer`; YouTube gets a native `WKWebView`
/// running the same player HTML (PRD §3.12).
public final class ExternalDisplayManager: NSObject, WKScriptMessageHandler {
  public enum Content {
    case none
    case local(MirrorEngine)
    case youtube(html: String, baseURL: URL, frameScript: String = "")
  }

  public static let shared = ExternalDisplayManager()

  public private(set) var window: UIWindow?
  public private(set) var isFake = false
  public private(set) var content: Content = .none
  public private(set) var playerView: PlayerLayerView?
  public private(set) var webView: WKWebView?
  public var isConnected: Bool { window != nil }
  public var playerLayer: AVPlayerLayer? { playerView?.playerLayer }

  public var onChange: ((_ connected: Bool, _ fake: Bool) -> Void)?
  public var onWebMessage: ((String) -> Void)?

  private var observing = false
  private var settingsController: YouTubeSettingsController?

  // MARK: - Discovery

  public func startObserving() {
    guard !observing else { return }
    observing = true
    let nc = NotificationCenter.default
    nc.addObserver(self, selector: #selector(sceneWillConnect(_:)), name: UIScene.willConnectNotification, object: nil)
    nc.addObserver(self, selector: #selector(sceneDidDisconnect(_:)), name: UIScene.didDisconnectNotification, object: nil)
    nc.addObserver(self, selector: #selector(screenDidConnect(_:)), name: UIScreen.didConnectNotification, object: nil)
    nc.addObserver(self, selector: #selector(screenDidDisconnect(_:)), name: UIScreen.didDisconnectNotification, object: nil)
    // Already-connected external display (app launched while mirroring).
    guard !isConnected else { return }
    for scene in UIApplication.shared.connectedScenes {
      if let ws = scene as? UIWindowScene, ws.session.role == .windowExternalDisplayNonInteractive {
        connect(window: UIWindow(windowScene: ws), fake: false)
        return
      }
    }
    if let screen = UIScreen.screens.first(where: { $0 !== UIScreen.main }) {
      connect(screen: screen)
    }
  }

  @objc private func sceneWillConnect(_ note: Notification) {
    guard let ws = note.object as? UIWindowScene, ws.session.role == .windowExternalDisplayNonInteractive else { return }
    // ExternalSceneDelegate normally connects first; this only covers apps without the delegate.
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.isConnected || self.isFake else { return }
      self.connect(window: UIWindow(windowScene: ws), fake: false)
    }
  }

  @objc private func sceneDidDisconnect(_ note: Notification) {
    guard let ws = note.object as? UIWindowScene, window?.windowScene === ws, !isFake else { return }
    disconnect()
  }

  @objc private func screenDidConnect(_ note: Notification) {
    guard let screen = note.object as? UIScreen else { return }
    // Scene-based apps receive a scene instead; give it a moment to arrive first.
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.isConnected || self.isFake else { return }
      self.connect(screen: screen)
    }
  }

  @objc private func screenDidDisconnect(_ note: Notification) {
    guard !isFake, isConnected else { return }
    disconnect()
  }

  private func connect(screen: UIScreen) {
    if let ws = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.screen === screen }) {
      connect(window: UIWindow(windowScene: ws), fake: false)
    } else {
      let w = UIWindow(frame: screen.bounds)
      w.setValue(screen, forKey: "screen")
      connect(window: w, fake: false)
    }
  }

  // MARK: - Fake display (debug / E2E)

  /// Routes the "external" window into a small overlay on the main screen (TEST_PLAN hook 4).
  public func setFake(_ on: Bool) {
    if on {
      guard !isConnected else { return }
      let main = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        .first { $0.session.role == .windowApplication }
      let size = CGSize(width: 320, height: 180)
      let w: UIWindow
      if let main {
        w = UIWindow(windowScene: main)
        let b = main.coordinateSpace.bounds
        w.frame = CGRect(x: b.width - size.width - 16, y: b.height - size.height - 16, width: size.width, height: size.height)
      } else {
        w = UIWindow(frame: CGRect(origin: CGPoint(x: 16, y: 16), size: size))
      }
      w.windowLevel = .alert + 1
      w.isUserInteractionEnabled = false
      w.accessibilityIdentifier = "external-fake-window"
      connect(window: w, fake: true)
    } else if isFake {
      disconnect()
    }
  }

  // MARK: - Window lifecycle

  public func connect(window: UIWindow, fake: Bool) {
    if isConnected { disconnect() }
    self.window = window
    isFake = fake
    let vc = UIViewController()
    vc.view.backgroundColor = .black
    window.rootViewController = vc
    window.backgroundColor = .black
    window.isHidden = false
    render()
    onChange?(true, fake)
  }

  public func disconnect() {
    guard let window else { return }
    tearDownContentViews()
    window.isHidden = true
    window.rootViewController = nil
    self.window = nil
    let wasFake = isFake
    isFake = false
    onChange?(false, wasFake)
  }

  public func setContent(_ content: Content) {
    self.content = content
    render()
  }

  private func closeSettings() {
    guard let settings = settingsController else { return }
    settingsController = nil
    settings.player.removeFromSuperview()
    settings.player.translatesAutoresizingMaskIntoConstraints = true
    if let root = window?.rootViewController?.view {
      settings.player.frame = root.bounds
      settings.player.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      root.addSubview(settings.player)
    }
    settings.player.evaluateJavaScript("window.__ytm && window.__ytm.showControls(false)", completionHandler: nil)
    settings.dismiss(animated: true)
  }

  /// Reparents the *same* WKWebView; its current quality, captions and media state remain in memory.
  public func openYouTubeSettings() -> Bool {
    guard settingsController == nil, let webView,
      let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.session.role == .windowApplication && $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return false }
    var presenter = root
    while let presented = presenter.presentedViewController { presenter = presented }
    webView.removeFromSuperview()
    let settings = YouTubeSettingsController(player: webView)
    settings.onClose = { [weak self] in self?.closeSettings() }
    settingsController = settings
    webView.evaluateJavaScript("window.__ytm && window.__ytm.showControls(true)", completionHandler: nil)
    presenter.present(settings, animated: true)
    return true
  }

  private func tearDownContentViews() {
    closeSettings()
    if let playerView, case let .local(engine) = content { engine.detach(playerView.playerLayer) }
    playerView?.removeFromSuperview()
    playerView = nil
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "ytm")
    webView?.stopLoading()
    webView?.removeFromSuperview()
    webView = nil
  }

  private func render() {
    guard let root = window?.rootViewController?.view else { return }
    closeSettings()
    // Detach from whatever engine the old view used.
    if let pv = playerView { pv.playerLayer.player = nil }
    playerView?.removeFromSuperview()
    playerView = nil
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "ytm")
    webView?.removeFromSuperview()
    webView = nil

    switch content {
    case .none:
      break
    case let .local(engine):
      let pv = PlayerLayerView(frame: root.bounds)
      pv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      pv.backgroundColor = .black
      pv.playerLayer.videoGravity = .resizeAspect
      root.addSubview(pv)
      engine.attach(pv.playerLayer)
      playerView = pv
    case let .youtube(html, baseURL, frameScript):
      let config = WKWebViewConfiguration()
      config.allowsInlineMediaPlayback = true
      config.mediaTypesRequiringUserActionForPlayback = []
      config.allowsAirPlayForMediaPlayback = false
      config.userContentController.add(self, name: "ytm")
      config.userContentController.addUserScript(WKUserScript(
        source: frameScript,
        injectionTime: .atDocumentStart, forMainFrameOnly: false))
      let wv = WKWebView(frame: root.bounds, configuration: config)
      wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      wv.isOpaque = false
      wv.backgroundColor = .black
      wv.scrollView.isScrollEnabled = false
      root.addSubview(wv)
      wv.loadHTMLString(html, baseURL: baseURL)
      webView = wv
    }
  }

  /// Forwards a PlayerCommand (JSON) to the external YouTube player.
  public func sendCommand(json: String) {
    webView?.evaluateJavaScript("window.__ytm && window.__ytm.handle(\(json))", completionHandler: nil)
  }

  public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    if let body = message.body as? String { onWebMessage?(body) }
  }
}

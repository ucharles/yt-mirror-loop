import UIKit
import WebKit

/// Temporarily hosts the existing TV WebView. No reload, second player, or settings transfer.
final class YouTubeSettingsController: UIViewController {
  let player: WKWebView
  var onClose: (() -> Void)?

  init(player: WKWebView) {
    self.player = player
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    let close = UIButton(type: .system)
    close.setTitle("설정 완료 · TV로 복귀", for: .normal)
    close.accessibilityIdentifier = "btn-youtube-settings-done"
    close.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    close.addTarget(self, action: #selector(done), for: .touchUpInside)
    close.translatesAutoresizingMaskIntoConstraints = false
    player.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(close)
    view.addSubview(player)
    NSLayoutConstraint.activate([
      close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      close.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      close.heightAnchor.constraint(equalToConstant: 52),
      player.topAnchor.constraint(equalTo: close.bottomAnchor),
      player.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      player.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      player.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
    ])
  }

  @objc private func done() { onClose?() }
}

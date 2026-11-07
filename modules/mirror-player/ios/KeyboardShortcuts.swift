import UIKit

/// Hardware keyboard shortcuts (PRD §3.13). Adds UIKeyCommands to the app's root view controller and
/// reports them to JS; JS maps keys to actions.
enum KeyboardShortcuts {
  static var handler: ((_ key: String, _ shift: Bool) -> Void)?
  private static weak var installedOn: UIViewController?

  static let inputs: [(String, String)] = [
    (" ", " "), (UIKeyCommand.inputLeftArrow, "ArrowLeft"), (UIKeyCommand.inputRightArrow, "ArrowRight"),
    (",", ","), (".", "."), ("[", "["), ("]", "]"), ("m", "m"),
  ]

  static func name(for input: String?) -> String? {
    inputs.first { $0.0 == input }?.1
  }

  static func install() {
    let root = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.session.role == .windowApplication }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }?.rootViewController
    guard let root, installedOn !== root else { return }
    for (input, _) in inputs {
      for flags in [UIKeyModifierFlags(), .shift] {
        let cmd = UIKeyCommand(input: input, modifierFlags: flags, action: #selector(UIViewController.ytm_handleKeyCommand(_:)))
        cmd.wantsPriorityOverSystemBehavior = false
        root.addKeyCommand(cmd)
      }
    }
    installedOn = root
  }
}

extension UIViewController {
  @objc func ytm_handleKeyCommand(_ command: UIKeyCommand) {
    func isEditing(_ view: UIView) -> Bool {
      if view.isFirstResponder && view is UITextInput { return true }
      return view.subviews.contains(where: isEditing)
    }
    if isEditing(view) { return }
    guard let key = KeyboardShortcuts.name(for: command.input) else { return }
    KeyboardShortcuts.handler?(key, command.modifierFlags.contains(.shift))
  }
}

import XCTest

/// E-20 (P2): hardware keyboard shortcuts on the real app. Maestro cannot send hardware keys on iOS, so this UI test
/// drives the installed E2E build (scripts/e2e-ios.sh installs it) with XCUIElement.typeKey.
final class KeyboardShortcutsE2E: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.pgmworks.ytmirrorloop")

  private func command(_ cmd: String) {
    let field = app.textFields["e2e-cmd"]
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    field.tap()
    field.typeText(cmd + "\n")
  }

  private func label(_ id: String) -> String {
    let el = app.descendants(matching: .any)[id].firstMatch
    XCTAssertTrue(el.waitForExistence(timeout: 10), "missing \(id)")
    return el.label
  }

  private func waitLabel(_ id: String, _ expected: String, timeout: TimeInterval = 8) {
    let el = app.descendants(matching: .any)[id].firstMatch
    let p = NSPredicate(format: "label == %@", expected)
    let ok = XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: p, object: el)], timeout: timeout) == .completed
    XCTAssertTrue(ok, "\(id): expected \(expected), got \(el.exists ? el.label : "<missing>")")
  }

  /// Types a key on the screen element (not a text field) so it is delivered as a hardware key event.
  private func key(_ k: String, _ flags: XCUIElement.KeyModifierFlags = []) {
    app.descendants(matching: .any)["player-title"].firstMatch.typeKey(k, modifierFlags: flags)
  }

  func testKeyboardShortcuts() {
    app.launch()
    command("reset")
    XCTAssertTrue(app.descendants(matching: .any)["library-empty"].waitForExistence(timeout: 10))
    command("import-fixture?name=counter_30fps_60s.mp4")
    let card = app.staticTexts["counter_30fps_60s"].firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    card.firstMatch.tap()
    XCTAssertTrue(app.descendants(matching: .any)["e2e-state"].waitForExistence(timeout: 10))
    command("seek?t=10")
    waitLabel("time-current", "0:10.000")

    key(".")
    waitLabel("time-current", "0:10.033")
    key(",")
    waitLabel("time-current", "0:10.000")
    key(XCUIKeyboardKey.rightArrow.rawValue)
    waitLabel("time-current", "0:11.000")
    key(XCUIKeyboardKey.leftArrow.rawValue, .shift)
    waitLabel("time-current", "0:10.900")
    key("[")
    waitLabel("ab-a-value", "0:10.900")
    key("m")
    waitLabel("btn-base-mirror", "base:on")
    key(" ")
    waitLabel("e2e-state", "playing")
    key(" ")
    waitLabel("e2e-state", "paused")
    _ = label("time-current")
  }
}

// Native settings that must survive `expo prebuild` (ios/ is generated, never edited by hand):
// - UIScene life cycle (required by the iOS 27 SDK) with an external-display scene role (PRD §3.12)
// - the MirrorPlayer XCTest spec + scene-based test host (`npm run test:native`)
const { withAppDelegate, withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PODFILE_MARKER = '# @mirror-player-tests';
const SCENE_MARKER = '// @scene-lifecycle';

function withMirrorPlayerTests(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let src = fs.readFileSync(podfile, 'utf8');
      if (!src.includes(PODFILE_MARKER)) {
        src = src.replace(
          /(target '[^']+' do\n)/,
          `$1  ${PODFILE_MARKER}\n  pod 'MirrorPlayer', :path => '../modules/mirror-player/ios', :testspecs => ['Tests', 'KeyboardE2E'], :appspecs => ['TestHost']\n`,
        );
        fs.writeFileSync(podfile, src);
      }
      return cfg;
    },
  ]);
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
        ],
        UIWindowSceneSessionRoleExternalDisplayNonInteractive: [
          { UISceneConfigurationName: 'External Display', UISceneDelegateClassName: 'YTMExternalSceneDelegate' },
        ],
      },
    };
    return cfg;
  });
}

/** Rewrites the template AppDelegate so React Native starts from `ExpoAppSceneDelegate`. */
function transformAppDelegate(src) {
  if (src.includes(SCENE_MARKER)) return src;
  let out = src.replace(
    /class AppDelegate: ExpoAppDelegate \{/,
    `${SCENE_MARKER}\nclass AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {`,
  );
  // The window is created by the scene delegate now.
  out = out.replace(/#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/, '');
  out += `
class SceneDelegate: ExpoAppSceneDelegate {}
`;
  if (!out.includes('ExpoReactNativeFactoryProvider {') || out.includes('UIWindow(frame: UIScreen.main.bounds)')) {
    throw new Error('withMirrorPlayer: AppDelegate template changed; update transformAppDelegate()');
  }
  return out;
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') throw new Error('withMirrorPlayer: expected a Swift AppDelegate');
    cfg.modResults.contents = transformAppDelegate(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = (config) => withMirrorPlayerTests(withSceneAppDelegate(withSceneManifest(config)));
module.exports.transformAppDelegate = transformAppDelegate;

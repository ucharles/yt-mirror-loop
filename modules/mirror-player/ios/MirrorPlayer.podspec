Pod::Spec.new do |s|
  s.name           = 'MirrorPlayer'
  s.version        = '1.0.0'
  s.summary        = 'AVPlayer engine with frame-accurate segment mirroring and external display support'
  s.description    = 'Owns a single AVPlayer, flips AVPlayerLayer transforms on boundary observers, A-B loops, external display window.'
  s.author         = 'JungHyun Yoo'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files = "Tests/**/*", "TestHost/**/*", "KeyboardE2E/**/*"

  s.app_spec 'TestHost' do |app|
    app.source_files = 'TestHost/*.swift'
    app.info_plist = {
      'UIApplicationSceneManifest' => {
        'UIApplicationSupportsMultipleScenes' => false,
        'UISceneConfigurations' => {
          'UIWindowSceneSessionRoleApplication' => [
            { 'UISceneConfigurationName' => 'Default', 'UISceneDelegateClassName' => 'YTMTestHostSceneDelegate' }
          ]
        }
      }
    }
    app.pod_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -lc++' }
  end

  s.test_spec 'Tests' do |t|
    t.source_files = 'Tests/*.swift'
    t.resources = 'Tests/Fixtures/*'
    t.requires_app_host = true
    t.app_host_name = 'MirrorPlayer/TestHost'
    t.dependency 'MirrorPlayer/TestHost'
    # The host links React Native's C++ static libs; the test bundle needs libc++ as well.
    t.pod_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -lc++' }
  end

  # E-20: UI test that drives the installed E2E app with hardware key events (run by scripts/e2e-ios.sh).
  s.test_spec 'KeyboardE2E' do |t|
    t.test_type = :ui
    t.source_files = 'KeyboardE2E/*.swift'
    t.pod_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -lc++' }
    t.requires_app_host = true
    t.app_host_name = 'MirrorPlayer/TestHost'
    t.dependency 'MirrorPlayer/TestHost'
  end
end

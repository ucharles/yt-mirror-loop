// Global mocks for native modules used across tests.
jest.mock('react-native-mmkv', () => require('./mocks/mmkv'));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `uuid-${++n}` };
});
jest.mock('../modules/mirror-player', () => require('./mocks/mirrorPlayer'));
jest.mock('react-native-webview', () => require('./mocks/webview'));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => {}), deactivateKeepAwake: jest.fn(async () => {}), useKeepAwake: jest.fn() }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(async () => ''), hasStringAsync: jest.fn(async () => false) }));
jest.mock('expo-file-system', () => require('./mocks/fileSystem'));
jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: 'file:///cache/t.jpg' })) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-router', () => {
  const navigation = { setOptions: jest.fn(), addListener: jest.fn(() => () => {}), dispatch: jest.fn() };
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    __router: router,
    useNavigation: () => navigation,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    Redirect: () => null,
    Stack: Object.assign(() => null, { Screen: () => null }),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

/* Jest mock of modules/mirror-player (native AVPlayer engine). */
type Listener = (p: any) => void;
const listeners: Record<string, Set<Listener>> = {};

export const MirrorPlayerMock = {
  addListener: jest.fn((ev: string, cb: Listener) => {
    (listeners[ev] ??= new Set()).add(cb);
    return { remove: () => listeners[ev].delete(cb) };
  }),
  emit(ev: string, payload: unknown) {
    listeners[ev]?.forEach((cb) => cb(payload));
  },
  listenerCount(ev: string) {
    return listeners[ev]?.size ?? 0;
  },
  load: jest.fn(async () => ({ duration: 60, fps: 30 })),
  unload: jest.fn(async () => {}),
  play: jest.fn(async () => {}),
  pause: jest.fn(async () => {}),
  setRate: jest.fn(async () => {}),
  seekTo: jest.fn(async (t: number) => t),
  seekBy: jest.fn(async () => 0),
  stepFrames: jest.fn(async () => 0),
  setMirrorConfig: jest.fn(async () => {}),
  setLoop: jest.fn(async () => {}),
  clearLoop: jest.fn(async () => {}),
  getStatus: jest.fn(async () => ({ t: 0, duration: 60, playing: false, mirrored: false, rate: 1, loopCount: 0, fps: 30 })),
  probe: jest.fn(async () => ({ playable: true, durationMs: 60000, fileSize: 1000, width: 1280, height: 720, fps: 30 })),
  setExcludedFromBackup: jest.fn(() => true),
  isExcludedFromBackup: jest.fn(() => true),
  freeDiskSpace: jest.fn(() => 1e10),
  isExternalDisplayConnected: jest.fn(async () => ({ connected: false, fake: false })),
  setFakeExternalDisplay: jest.fn(async () => {}),
  setExternalContent: jest.fn(async () => {}),
  sendExternalCommand: jest.fn(async () => {}),
  openYouTubeSettings: jest.fn(async () => true),
  enableKeyboardShortcuts: jest.fn(async () => {}),
};

export default MirrorPlayerMock;
export const MirrorPlayerView = (props: any) => {
  const { View } = require('react-native');
  return <View testID={props.testID ?? 'mirror-player-view'} style={props.style} />;
};

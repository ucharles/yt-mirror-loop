import { localVideo, ytVideo } from '../../../test/fixtures';
import { MemoryMMKV } from '../../../test/mocks/mmkv';
import { LIBRARY_KEY, LibraryRepo, SETTINGS_KEY } from '@/storage/libraryRepo';
import { configureLibrary, isLocal, selectVideo, useLibrary } from '../libraryStore';
import { configurePlayerClock, usePlayer } from '../playerStore';
import { configureSettings, useSettings } from '../settingsStore';

function fakeBridge() {
  return {
    kind: 'youtube' as const,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    seekBy: jest.fn(),
    setRate: jest.fn(),
    getAvailableRates: () => [1],
    setMirrorConfig: jest.fn(),
    setLoop: jest.fn(),
    setExternalMode: jest.fn(),
    on: () => () => {},
  };
}

let kv: MemoryMMKV;
let files: { listVideoFiles: jest.Mock; deleteVideoFile: jest.Mock; deleteThumb: jest.Mock };
let clock = 0;

beforeEach(() => {
  kv = new MemoryMMKV();
  files = { listVideoFiles: jest.fn(() => []), deleteVideoFile: jest.fn(), deleteThumb: jest.fn() };
  configureLibrary({ repo: new LibraryRepo(kv), files, now: () => new Date('2026-09-27T00:00:00Z') });
  useLibrary.setState({ videos: [], loaded: false });
  usePlayer.getState().close();
  clock = 0;
  configurePlayerClock(() => clock);
});

const stored = () => JSON.parse(kv.getString(LIBRARY_KEY) ?? '{"videos":[]}').videos;

describe('libraryStore', () => {
  it('U-STO-02 every mutation persists immediately', () => {
    const lib = useLibrary.getState();
    lib.add(ytVideo({ id: 'a' }));
    expect(stored()).toHaveLength(1);
    lib.rename('a', 'Renamed');
    expect(stored()[0].title).toBe('Renamed');
    lib.setMemo('a', 'memo');
    expect(stored()[0].memo).toBe('memo');
    lib.setMemo('a', '  ');
    expect(stored()[0].memo).toBeUndefined();
    lib.setTags('a', ['x', ' x', 'y']);
    expect(stored()[0].tags).toEqual(['x', 'y']);
    lib.setBaseMirror('a', true);
    expect(stored()[0].baseMirror).toBe(true);
    lib.update('a', { title: 'U' });
    expect(stored()[0].title).toBe('U');
    lib.addMany([ytVideo({ id: 'b', videoId: 'bbbbbbbbbbb' })]);
    expect(stored()).toHaveLength(2);
    lib.replaceAll([]);
    expect(stored()).toEqual([]);
  });
  it('init loads, reconciles and deletes orphans; reset clears', () => {
    new LibraryRepo(kv).save({ schemaVersion: 1, videos: [localVideo({ id: 'l', fileName: 'gone.mp4' }), ytVideo()] });
    files.listVideoFiles.mockReturnValue(['orphan.mp4']);
    useLibrary.getState().init();
    expect(files.deleteVideoFile).toHaveBeenCalledWith('orphan.mp4');
    const l = useLibrary.getState().videos.find((v) => v.id === 'l');
    expect(isLocal(l) && l.fileName).toBeFalsy();
    expect(stored().find((v: any) => v.id === 'l').fileName).toBeUndefined();
    expect(selectVideo('l')(useLibrary.getState())).toBe(l);
    useLibrary.getState().reset();
    expect(useLibrary.getState().videos).toEqual([]);
    expect(kv.getString(LIBRARY_KEY)).toBeUndefined();
  });
  it('init survives file-listing failure', () => {
    files.listVideoFiles.mockImplementation(() => {
      throw new Error('no fs');
    });
    useLibrary.getState().init();
    expect(useLibrary.getState().loaded).toBe(true);
  });
  it('remove deletes the local file and thumbnail', () => {
    useLibrary.getState().add(localVideo({ id: 'l', fileName: 'l.mp4', thumbnail: 'l.jpg' }));
    useLibrary.getState().add(ytVideo({ id: 'y' }));
    useLibrary.getState().remove('l');
    useLibrary.getState().remove('y');
    expect(files.deleteVideoFile).toHaveBeenCalledWith('l.mp4');
    expect(files.deleteThumb).toHaveBeenCalledWith('l.jpg');
    expect(useLibrary.getState().videos).toEqual([]);
  });
});

describe('playerStore', () => {
  it('U-ST-01 A-B loop resets on video change', () => {
    useLibrary.getState().add(ytVideo({ id: 'a' }));
    useLibrary.getState().add(ytVideo({ id: 'b', videoId: 'bbbbbbbbbbb' }));
    const p = usePlayer.getState();
    p.open('a');
    usePlayer.setState({ t: 1 });
    expect(usePlayer.getState().markA()).toBeNull();
    usePlayer.setState({ t: 3 });
    usePlayer.getState().markB();
    usePlayer.getState().toggleLoop();
    expect(usePlayer.getState().loop).toEqual({ a: 1, b: 3, enabled: true });
    usePlayer.getState().open('b');
    expect(usePlayer.getState().loop).toEqual({ a: null, b: null, enabled: false });
    expect(useLibrary.getState().videos.find((v) => v.id === 'b')?.lastOpenedAt).toBeTruthy();
  });
  it('A-B marks push to the bridge and reject invalid order', () => {
    const bridge = fakeBridge();
    usePlayer.getState().open('x');
    usePlayer.getState().setBridge(bridge);
    usePlayer.setState({ t: 5 });
    usePlayer.getState().markB();
    usePlayer.setState({ t: 6 });
    expect(usePlayer.getState().markA()).toBe('A_NOT_BEFORE_B');
    usePlayer.setState({ t: 2 });
    usePlayer.getState().markA();
    usePlayer.getState().toggleLoop();
    expect(bridge.setLoop).toHaveBeenLastCalledWith({ a: 2, b: 5, enabled: true });
    usePlayer.getState().nudgeLoopPoint('a', 0.1);
    expect(bridge.setLoop).toHaveBeenLastCalledWith({ a: 2.1, b: 5, enabled: true });
    usePlayer.setState({ t: 1 });
    expect(usePlayer.getState().markB()).toBe('A_NOT_BEFORE_B');
    usePlayer.getState().resetLoop();
    expect(bridge.setLoop).toHaveBeenLastCalledWith(null);
  });
  it('U-ST-02 position/rate saved throttled to 1 s and restored on open', () => {
    useLibrary.getState().add(ytVideo({ id: 'a' }));
    usePlayer.getState().open('a', { position: 12, rate: 0.5 });
    expect(usePlayer.getState()).toMatchObject({ t: 12, rate: 0.5 });
    clock = 1000;
    usePlayer.getState().onTime(12.1, 100);
    clock = 1500;
    usePlayer.getState().onTime(12.6, 100);
    expect(stored()[0].lastPosition).toBe(12.1);
    clock = 2100;
    usePlayer.getState().onTime(13.2, 0);
    expect(stored()[0].lastPosition).toBe(13.2);
    expect(stored()[0].lastRate).toBe(0.5);
    expect(usePlayer.getState().duration).toBe(100);
    usePlayer.getState().setRate(1.5);
    expect(stored()[0].lastRate).toBe(1.5);
    usePlayer.setState({ t: 20 });
    usePlayer.getState().close();
    expect(stored()[0].lastPosition).toBe(20);
  });
  it('U-ST-03 segment edits normalize and push boundaries to the engine', () => {
    useLibrary.getState().add(ytVideo({ id: 'a' }));
    const bridge = fakeBridge();
    usePlayer.getState().open('a');
    usePlayer.getState().setBridge(bridge);
    const out = usePlayer.getState().applySegments([
      { id: '1', start: 4, end: 8 },
      { id: '2', start: 1, end: 5 },
    ]);
    expect(out).toEqual([{ id: '2', start: 1, end: 8 }]);
    expect(stored()[0].segments).toEqual(out);
    expect(bridge.setMirrorConfig).toHaveBeenLastCalledWith({ baseMirror: false, segments: out });
    usePlayer.getState().setBaseMirror(true);
    expect(bridge.setMirrorConfig).toHaveBeenLastCalledWith({ baseMirror: true, segments: out });
  });
  it('mirror log tracks max error; loop count; error; rates', () => {
    const p = usePlayer.getState();
    p.onMirror({ mirrored: true, expectedAt: 2, actualAt: 2.01, errorMs: 10 });
    p.onMirror({ mirrored: false, expectedAt: null, actualAt: 5, errorMs: null });
    p.onMirror({ mirrored: true, expectedAt: 4, actualAt: 3.98, errorMs: -20 });
    expect(usePlayer.getState()).toMatchObject({ mirrored: true, maxErrorMs: 20 });
    expect(usePlayer.getState().mirrorLog).toHaveLength(3);
    clock = 0;
    p.onState('buffering');
    clock = 100;
    p.onState('playing');
    expect(usePlayer.getState().stallCount).toBe(0);
    p.onState('buffering');
    clock = 1000;
    p.onState('buffering');
    p.onState('playing');
    expect(usePlayer.getState().stallCount).toBe(1);
    p.onLoop(4);
    p.onState('playing');
    p.setError('EMBED_BLOCKED');
    p.setRates([0.5, 1]);
    expect(usePlayer.getState()).toMatchObject({ loopCount: 4, state: 'playing', error: 'EMBED_BLOCKED', rates: [0.5, 1] });
    // no video open → edits are no-ops
    expect(p.applySegments([])).toEqual([]);
    p.setBaseMirror(true);
  });
});

describe('settingsStore', () => {
  it('backup exclusion defaults to true and persists', () => {
    const skv = new MemoryMMKV();
    configureSettings(skv);
    useSettings.getState().reset();
    useSettings.getState().load();
    expect(useSettings.getState().excludeFromBackup).toBe(true);
    useSettings.getState().setExcludeFromBackup(false);
    useSettings.setState({ excludeFromBackup: true });
    useSettings.getState().load();
    expect(useSettings.getState().excludeFromBackup).toBe(false);
    skv.set(SETTINGS_KEY, '{bad');
    useSettings.getState().load();
    expect(useSettings.getState().excludeFromBackup).toBe(true);
  });
});

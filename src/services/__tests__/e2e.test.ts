import { File } from 'expo-file-system';

import { localVideo, ytVideo } from '../../../test/fixtures';
import { __fs } from '../../../test/mocks/fileSystem';
import { MirrorPlayerMock } from '../../../test/mocks/mirrorPlayer';
import { MemoryMMKV } from '../../../test/mocks/mmkv';
import { buildExport } from '@/domain/transfer/exportJson';
import { LibraryRepo } from '@/storage/libraryRepo';
import { configureLibrary, useLibrary } from '@/state/libraryStore';
import { usePlayer } from '@/state/playerStore';
import { configureSettings, useSettings } from '@/state/settingsStore';
import { runE2ECommand } from '../e2e';
import { configureFlows, useFlows } from '../flows';

beforeEach(() => {
  __fs.files.clear();
  configureLibrary({ repo: new LibraryRepo(new MemoryMMKV()), files: { listVideoFiles: () => [], deleteVideoFile: jest.fn(), deleteThumb: jest.fn() }, now: () => new Date(0) });
  configureSettings(new MemoryMMKV());
  useLibrary.setState({ videos: [] });
  configureFlows({ ports: () => require('@/platform/files').makeImportPorts(), confirm: async () => true });
  jest.clearAllMocks();
});

describe('E2E deep-link commands', () => {
  it('reset wipes library, settings and media', async () => {
    useLibrary.setState({ videos: [ytVideo()] });
    useSettings.setState({ excludeFromBackup: false });
    new File('file:///doc/videos/a.mp4').write('x');
    await runE2ECommand('reset', {});
    expect(useLibrary.getState().videos).toEqual([]);
    expect(useSettings.getState().excludeFromBackup).toBe(true);
    expect(__fs.files.size).toBe(0);
    expect(MirrorPlayerMock.setFakeExternalDisplay).toHaveBeenCalledWith(false);
  });
  it('import-fixture runs the real pipeline on Documents/e2e-fixtures', async () => {
    new File('file:///doc/e2e-fixtures/counter_30fps_60s.mp4').write('data');
    await runE2ECommand('import-fixture', { name: 'counter_30fps_60s.mp4' });
    expect(useLibrary.getState().videos[0]).toMatchObject({ title: 'counter_30fps_60s', source: 'local', durationMs: 60000 });
  });
  it('import-json and relink-fixture', async () => {
    new File('file:///doc/e2e-fixtures/x.json').write(JSON.stringify(buildExport([localVideo({ id: 'l', durationMs: 60000 })], new Date())));
    await runE2ECommand('import-json', { name: 'x.json' });
    expect(useLibrary.getState().videos[0]).not.toHaveProperty('fileName');
    new File('file:///doc/e2e-fixtures/f.mp4').write('data');
    await runE2ECommand('relink-fixture', { name: 'f.mp4' });
    const v = useLibrary.getState().videos[0];
    expect(v.source === 'local' && v.fileName).toBeTruthy();
    expect(useFlows.getState().message).toBe('파일을 연결했습니다');
  });
  it('seek and fake-external', async () => {
    const seekTo = jest.fn();
    usePlayer.setState({ bridge: { seekTo, pause: jest.fn() } as any });
    await runE2ECommand('seek', { t: '3' });
    expect(seekTo).toHaveBeenCalledWith(3);
    await runE2ECommand('fake-external', { on: '1' });
    expect(MirrorPlayerMock.setFakeExternalDisplay).toHaveBeenCalledWith(true);
    await runE2ECommand('unknown', {});
    usePlayer.setState({ bridge: null });
  });
});

describe('E2E slow import', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('slow=1 reports progress in steps', async () => {
    new File('file:///doc/e2e-fixtures/s.mp4').write('0123456789');
    const seen: number[] = [];
    const unsub = useFlows.subscribe((s) => seen.push(s.progress));
    const p = runE2ECommand('import-fixture', { name: 's.mp4', slow: '1' });
    for (let i = 0; i < 12; i++) await jest.advanceTimersByTimeAsync(400);
    await p;
    unsub();
    expect(new Set(seen).size).toBeGreaterThan(5);
    expect(useLibrary.getState().videos).toHaveLength(1);
  });
});

describe('parseE2ECommand', () => {
  it('parses command and query, with or without the deep-link prefix', () => {
    const { parseE2ECommand } = require('../e2e');
    expect(parseE2ECommand('ytmirror://e2e/import-fixture?name=a%20b.mp4&slow=1')).toEqual({ cmd: 'import-fixture', params: { name: 'a b.mp4', slow: '1' } });
    expect(parseE2ECommand(' reset ')).toEqual({ cmd: 'reset', params: {} });
    expect(parseE2ECommand('seek?t')).toEqual({ cmd: 'seek', params: { t: '' } });
  });
});

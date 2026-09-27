import { localVideo, ytVideo } from '../../../test/fixtures';
import { MemoryMMKV } from '../../../test/mocks/mmkv';
import type { ImportPorts } from '@/domain/import/localImport';
import { buildExport } from '@/domain/transfer/exportJson';
import { LibraryRepo } from '@/storage/libraryRepo';
import { configureLibrary, useLibrary } from '@/state/libraryStore';
import { configureSettings } from '@/state/settingsStore';
import {
  addYouTube,
  cancelImport,
  configureFlows,
  currentConflict,
  deleteVideoWithConfirm,
  exportLibrary,
  linkYouTubeUrl,
  relinkVideo,
  resolveConflict,
  runLocalImport,
  startJsonImport,
  useFlows,
} from '../flows';

function ports(over: Partial<ImportPorts> = {}): ImportPorts {
  let n = 0;
  return {
    freeSpace: async () => 1e12,
    copy: async (_s, _d, p) => p(1),
    deleteFile: jest.fn(async () => {}),
    probe: async () => ({ playable: true, durationMs: 60000, fileSize: 1000, fps: 30 }),
    makeThumbnail: async () => 'th.jpg',
    setExcludedFromBackup: jest.fn(async () => {}),
    uuid: () => `p${++n}`,
    now: () => new Date(0),
    ...over,
  };
}

const confirm = jest.fn(async () => true);
const choose = jest.fn(async () => 'new' as any);
const share = jest.fn(async (_file: string, _content: string) => {});
let n = 0;

beforeEach(() => {
  configureLibrary({ repo: new LibraryRepo(new MemoryMMKV()), files: { listVideoFiles: () => [], deleteVideoFile: jest.fn(), deleteThumb: jest.fn() }, now: () => new Date(0) });
  configureSettings(new MemoryMMKV());
  useLibrary.setState({ videos: [] });
  useFlows.setState({ message: null, plan: null, conflictIndex: 0, resolutions: {} });
  jest.clearAllMocks();
  configureFlows({ ports: () => ports(), confirm, choose, share, oembed: async (id) => ({ title: `title-${id}` }), uuid: () => `u${++n}`, now: () => new Date(2026, 8, 27) });
});

describe('local import flow', () => {
  it('adds imported videos and reports failures', async () => {
    configureFlows({ ports: () => ports({ probe: async (name) => ({ playable: !name.endsWith('webm'), durationMs: 1000, fileSize: 1 }) }) });
    const ok = await runLocalImport([
      { uri: 'a', name: 'a.mp4' },
      { uri: 'b', name: 'bad.webm' },
    ]);
    expect(ok).toHaveLength(1);
    expect(useLibrary.getState().videos[0].title).toBe('a');
    expect(useFlows.getState().message).toContain('iPad에서 재생할 수 없는 형식입니다');
    expect(useFlows.getState().importing).toBe(false);
    expect(await runLocalImport([])).toEqual([]);
    await runLocalImport([{ uri: 'c', name: 'c.mov' }]);
    expect(useFlows.getState().message).toBe('1개 영상을 가져왔습니다');
    cancelImport();
  });
});

describe('JSON export/import flow', () => {
  it('exports via the share sheet', async () => {
    useLibrary.setState({ videos: [ytVideo({ lastPosition: 3 })] });
    await exportLibrary();
    expect(share.mock.calls[0][0]).toBe('yt-mirror-loop-20260927.json');
    expect(JSON.parse(share.mock.calls[0][1]).videos[0].lastPosition).toBeUndefined();
  });
  it('invalid file → message, library unchanged', () => {
    useLibrary.setState({ videos: [ytVideo()] });
    expect(startJsonImport('{nope')).toBe(false);
    expect(useFlows.getState().message).toContain('JSON');
    expect(useLibrary.getState().videos).toHaveLength(1);
  });
  it('no conflicts → applied immediately', () => {
    startJsonImport(JSON.stringify(buildExport([ytVideo({ id: 'i' }), localVideo({ id: 'l' })], new Date())));
    expect(useLibrary.getState().videos).toHaveLength(2);
    expect(useLibrary.getState().videos.find((v) => v.id === 'l')).not.toHaveProperty('fileName');
    expect(useFlows.getState().message).toContain('2개 추가');
  });
  it('conflicts walk through choices and apply-to-all', () => {
    useLibrary.setState({ videos: [ytVideo({ id: 'e1', videoId: 'aaaaaaaaaaa' }), ytVideo({ id: 'e2', videoId: 'bbbbbbbbbbb' }), ytVideo({ id: 'e3', videoId: 'ccccccccccc' })] });
    const incoming = useLibrary.getState().videos.map((v) => ({ ...v, id: `i-${v.id}`, title: 'incoming' }));
    startJsonImport(JSON.stringify(buildExport(incoming, new Date())));
    expect(currentConflict()?.existing.id).toBe('e1');
    resolveConflict('overwrite', false);
    expect(currentConflict()?.existing.id).toBe('e2');
    resolveConflict('copy', true);
    expect(currentConflict()).toBeNull();
    const vids = useLibrary.getState().videos;
    expect(vids).toHaveLength(5);
    expect(vids.find((v) => v.id === 'e1')?.title).toBe('incoming');
    resolveConflict('skip', false); // no-op without a plan
  });
});

describe('relink flow', () => {
  it('links immediately when duration matches', async () => {
    useLibrary.setState({ videos: [localVideo({ id: 'l', fileName: undefined, durationMs: 60200 })] });
    expect(await relinkVideo('l', { uri: 'x', name: 'x.mp4' })).toBe(true);
    const v = useLibrary.getState().videos[0];
    expect(v.source === 'local' && v.fileName).toBe('p1.mp4');
    expect(confirm).not.toHaveBeenCalled();
  });
  it('asks on mismatch; cancel deletes the copy', async () => {
    const del = jest.fn(async () => {});
    configureFlows({ ports: () => ports({ deleteFile: del, probe: async () => ({ playable: true, durationMs: 10000, fileSize: 5 }) }) });
    useLibrary.setState({ videos: [localVideo({ id: 'l', fileName: undefined })] });
    confirm.mockResolvedValueOnce(false);
    expect(await relinkVideo('l', { uri: 'x', name: 'x.mp4' })).toBe(false);
    expect(del).toHaveBeenCalled();
    confirm.mockResolvedValueOnce(true);
    expect(await relinkVideo('l', { uri: 'x', name: 'x.mp4' })).toBe(true);
    expect(useLibrary.getState().videos[0]).toMatchObject({ fingerprint: '5:10000' });
  });
  it('rejects unplayable files and unknown ids; handles copy errors', async () => {
    useLibrary.setState({ videos: [localVideo({ id: 'l', fileName: undefined })] });
    configureFlows({ ports: () => ports({ probe: async () => ({ playable: false, durationMs: 0, fileSize: 0 }) }) });
    expect(await relinkVideo('l', { uri: 'x', name: 'x.webm' })).toBe(false);
    expect(await relinkVideo('nope', { uri: 'x', name: 'x.mp4' })).toBe(false);
    configureFlows({ ports: () => ports({ copy: async () => { throw new Error('io'); } }) });
    expect(await relinkVideo('l', { uri: 'x', name: 'x.mp4' })).toBe(false);
    expect(useFlows.getState().message).toBe('파일을 연결하지 못했습니다');
  });
});

describe('YouTube flows', () => {
  it('adds with oEmbed title; duplicates ask; bad URL messages', async () => {
    const id = await addYouTube('https://youtu.be/dQw4w9WgXcQ?t=5');
    expect(useLibrary.getState().videos[0]).toMatchObject({ id, title: 'title-dQw4w9WgXcQ', lastPosition: 5 });
    choose.mockResolvedValueOnce('open');
    expect(await addYouTube('https://youtu.be/dQw4w9WgXcQ')).toBe(id);
    choose.mockResolvedValueOnce(null);
    expect(await addYouTube('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    choose.mockResolvedValueOnce('new');
    await addYouTube('https://youtu.be/dQw4w9WgXcQ');
    expect(useLibrary.getState().videos).toHaveLength(2);
    expect(await addYouTube('nonsense')).toBeNull();
    expect(useFlows.getState().message).toContain('인식하지 못했습니다');
  });
  it('links a local video to a YouTube URL', async () => {
    useLibrary.setState({ videos: [localVideo({ id: 'l' }), ytVideo({ id: 'y' })] });
    expect(await linkYouTubeUrl('l', 'https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(useLibrary.getState().videos[0]).toMatchObject({ linkedVideoId: 'dQw4w9WgXcQ', title: 'title-dQw4w9WgXcQ' });
    expect(await linkYouTubeUrl('y', 'https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    expect(await linkYouTubeUrl('l', 'bad')).toBe(false);
  });
  it('delete asks for confirmation', async () => {
    useLibrary.setState({ videos: [ytVideo({ id: 'y' })] });
    confirm.mockResolvedValueOnce(false);
    expect(await deleteVideoWithConfirm('y')).toBe(false);
    expect(await deleteVideoWithConfirm('y')).toBe(true);
    expect(useLibrary.getState().videos).toEqual([]);
    expect(await deleteVideoWithConfirm('y')).toBe(false);
  });
});

import { ytVideo } from '../../../../test/fixtures';
import { checkDuplicateYouTube, createYouTubeVideo } from '../../youtube/addVideo';
import { extensionOf, ImportPorts, importLocalFile, importLocalFiles, titleFromFileName } from '../localImport';

function makePorts(over: Partial<ImportPorts> = {}) {
  let n = 0;
  const files = new Set<string>();
  const ports: ImportPorts & { files: Set<string>; excluded: Record<string, boolean> } = {
    files,
    excluded: {},
    freeSpace: async () => 10e9,
    copy: async (_src, dest, onProgress) => {
      files.add(dest);
      onProgress(0.25);
      onProgress(0.5);
      onProgress(1);
    },
    deleteFile: async (name) => {
      files.delete(name);
    },
    probe: async () => ({ playable: true, durationMs: 60000, fileSize: 5000, width: 1280, height: 720, fps: 30 }),
    makeThumbnail: async (name) => `${name}.jpg`,
    setExcludedFromBackup: async (name, ex) => {
      ports.excluded[name] = ex;
    },
    uuid: () => `id${++n}`,
    now: () => new Date('2026-09-27T00:00:00Z'),
    ...over,
  };
  return ports;
}

const file = (name = 'counter_30fps_60s.mp4') => ({ uri: `file:///picked/${name}`, name, size: 5000 });

describe('local import', () => {
  it('U-LI-01 title = file name without extension', async () => {
    const r = await importLocalFile(file('My Dance.final.mov'), makePorts(), { excludeFromBackup: true });
    expect(r.ok && r.video.title).toBe('My Dance.final');
    expect(titleFromFileName('noext')).toBe('noext');
    expect(extensionOf('noext')).toBe('mp4');
  });
  it('U-LI-02 copies to videos/<uuid>.<ext>, stores only the name', async () => {
    const ports = makePorts();
    const r = await importLocalFile(file('A.MOV'), ports, { excludeFromBackup: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.video.fileName).toBe('id1.mov');
    expect(ports.files.has('id1.mov')).toBe(true);
    expect(r.video).toMatchObject({ durationMs: 60000, fileSize: 5000, fingerprint: '5000:60000', fps: 30, width: 1280, thumbnail: 'id1.mov.jpg' });
  });
  it('U-LI-03 unplayable → UNSUPPORTED_FORMAT and copy removed', async () => {
    const ports = makePorts({ probe: async () => ({ playable: false, durationMs: 0, fileSize: 0 }) });
    const r = await importLocalFile(file('bad_vp9.webm'), ports, { excludeFromBackup: true });
    expect(r).toEqual({ ok: false, error: 'UNSUPPORTED_FORMAT', fileName: 'bad_vp9.webm' });
    expect(ports.files.size).toBe(0);
    const throwing = makePorts({ probe: async () => { throw new Error('x'); } });
    expect(await importLocalFile(file(), throwing, { excludeFromBackup: true })).toMatchObject({ error: 'UNSUPPORTED_FORMAT' });
  });
  it('U-LI-04 cancel mid-copy → partial file deleted, no entry', async () => {
    const ctrl = new AbortController();
    const ports = makePorts({
      copy: async (_s, dest, onProgress, signal) => {
        ports.files.add(dest);
        onProgress(0.3);
        ctrl.abort();
        if (signal?.aborted) {
          const e = new Error('aborted');
          e.name = 'AbortError';
          throw e;
        }
      },
    });
    const r = await importLocalFile(file(), ports, { excludeFromBackup: true, signal: ctrl.signal });
    expect(r).toMatchObject({ ok: false, error: 'CANCELLED' });
    expect(ports.files.size).toBe(0);
  });
  it('U-LI-04 abort signalled after copy resolves → cancelled', async () => {
    const ctrl = new AbortController();
    const ports = makePorts({ copy: async (_s, dest) => { ports.files.add(dest); ctrl.abort(); } });
    expect(await importLocalFile(file(), ports, { excludeFromBackup: true, signal: ctrl.signal })).toMatchObject({ error: 'CANCELLED' });
    expect(ports.files.size).toBe(0);
  });
  it('copy failure → COPY_FAILED', async () => {
    const ports = makePorts({ copy: async () => { throw new Error('io'); }, deleteFile: async () => { throw new Error('gone'); } });
    expect(await importLocalFile(file(), ports, { excludeFromBackup: true })).toMatchObject({ error: 'COPY_FAILED' });
  });
  it('U-LI-05 progress monotonic 0 → 1', async () => {
    const seen: number[] = [];
    const ports = makePorts({
      copy: async (_s, _d, p) => { p(0.2); p(0.1); p(0.6); p(2); },
    });
    await importLocalFile(file(), ports, { excludeFromBackup: true, onProgress: (f) => seen.push(f) });
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
  it('U-LI-06 insufficient space → NO_SPACE before copying', async () => {
    const copy = jest.fn();
    const r = await importLocalFile(file(), makePorts({ freeSpace: async () => 1000, copy }), { excludeFromBackup: true });
    expect(r).toMatchObject({ error: 'NO_SPACE' });
    expect(copy).not.toHaveBeenCalled();
  });
  it('U-LI-07 multi-select: one failure does not abort others', async () => {
    const ports = makePorts({
      probe: async (name) => ({ playable: !name.endsWith('webm'), durationMs: 1000, fileSize: 10 }),
      makeThumbnail: async () => undefined,
    });
    const overall: number[] = [];
    const rs = await importLocalFiles([file('a.mp4'), file('b.webm'), file('c.mov')], ports, { excludeFromBackup: false, onProgress: (f) => overall.push(f) });
    expect(rs.map((r) => r.ok)).toEqual([true, false, true]);
    expect(overall[overall.length - 1]).toBe(1);
    const ctrl = new AbortController();
    ctrl.abort();
    const cancelled = await importLocalFiles([file('a.mp4')], ports, { excludeFromBackup: false, signal: ctrl.signal });
    expect(cancelled[0]).toMatchObject({ error: 'CANCELLED' });
  });
  it('U-LI-08 excludeFromBackup applied', async () => {
    const ports = makePorts();
    await importLocalFile(file(), ports, { excludeFromBackup: true });
    await importLocalFile(file(), ports, { excludeFromBackup: false });
    expect(ports.excluded).toEqual({ 'id1.mp4': true, 'id2.mp4': false });
  });
  it('U-LI-09 duplicate YouTube videoId', () => {
    expect(checkDuplicateYouTube([ytVideo({ id: 'e1' })], 'dQw4w9WgXcQ')).toEqual({ ok: false, error: 'DUPLICATE', existingId: 'e1' });
    expect(checkDuplicateYouTube([ytVideo()], 'aaaaaaaaaaa')).toEqual({ ok: true });
    const v = createYouTubeVideo({ id: 'n', videoId: 'aaaaaaaaaaa', sourceUrl: 'u', meta: { title: 'T', thumbnailUrl: 'th' }, now: new Date(0), start: 5 });
    expect(v).toMatchObject({ title: 'T', originalTitle: 'T', thumbnail: 'th', lastPosition: 5 });
    expect(createYouTubeVideo({ id: 'n', videoId: 'aaaaaaaaaaa', sourceUrl: 'u', meta: { title: 'T' }, now: new Date(0) })).not.toHaveProperty('thumbnail');
  });
});

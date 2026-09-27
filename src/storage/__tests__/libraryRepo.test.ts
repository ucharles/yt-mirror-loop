import { MemoryMMKV } from '../../../test/mocks/mmkv';
import { localVideo, ytVideo } from '../../../test/fixtures';
import { getDefaultKv, LIBRARY_KEY, LibraryRepo } from '../libraryRepo';

describe('LibraryRepo', () => {
  it('U-STO-01 save → load round-trip', () => {
    const kv = new MemoryMMKV();
    const repo = new LibraryRepo(kv);
    const lib = { schemaVersion: 1 as const, videos: [ytVideo(), localVideo()] };
    repo.save(lib);
    expect(new LibraryRepo(kv).load()).toEqual({ library: lib });
  });
  it('empty storage → empty library', () => {
    expect(new LibraryRepo(new MemoryMMKV()).load()).toEqual({ library: { schemaVersion: 1, videos: [] } });
  });
  it('U-STO-03 corrupted JSON → backup key, empty library, error', () => {
    const kv = new MemoryMMKV();
    kv.set(LIBRARY_KEY, '{not json');
    const repo = new LibraryRepo(kv, () => new Date('2026-09-27T00:00:00Z'));
    const res = repo.load();
    expect(res.library.videos).toEqual([]);
    expect(res.error).toBeTruthy();
    expect(kv.getString(`${LIBRARY_KEY}.corrupt.2026-09-27T00:00:00.000Z`)).toBe('{not json');
  });
  it('U-STO-04 only file name is stored, never a path', () => {
    const kv = new MemoryMMKV();
    const repo = new LibraryRepo(kv);
    expect(() => repo.save({ schemaVersion: 1, videos: [localVideo({ fileName: '/var/mobile/Documents/videos/a.mp4' })] })).toThrow();
    repo.save({ schemaVersion: 1, videos: [localVideo({ fileName: 'a.mp4' })] });
    expect(kv.getString(LIBRARY_KEY)).not.toContain('/videos/');
  });
  it('clear removes the key; default kv is MMKV', () => {
    const kv = new MemoryMMKV();
    const repo = new LibraryRepo(kv);
    repo.save({ schemaVersion: 1, videos: [] });
    repo.clear();
    expect(kv.contains(LIBRARY_KEY)).toBe(false);
    expect(getDefaultKv()).toBe(getDefaultKv());
  });
});

import { File } from 'expo-file-system';

import { __fs } from '../../../test/mocks/fileSystem';
import { MirrorPlayerMock } from '../../../test/mocks/mirrorPlayer';
import {
  copyIntoVideos,
  deleteThumb,
  deleteVideoFile,
  listVideoFiles,
  makeImportPorts,
  readTextFile,
  setAllExcludedFromBackup,
  thumbUri,
  totalVideoBytes,
  videoUri,
  wipeLocalMedia,
  writeCacheFile,
} from '../files';

beforeEach(() => {
  __fs.files.clear();
  jest.clearAllMocks();
});

describe('platform/files', () => {
  it('chunked copy with progress, listing, size, delete', async () => {
    const src = new File('file:///cache/in.mp4');
    src.write('x'.repeat(10));
    const progress: number[] = [];
    await copyIntoVideos(src.uri, 'a.mp4', (f) => progress.push(f));
    expect(progress[progress.length - 1]).toBe(1);
    expect(listVideoFiles()).toEqual(['a.mp4']);
    expect(totalVideoBytes()).toBe(10);
    expect(videoUri('a.mp4')).toBe('file:///doc/videos/a.mp4');
    expect(thumbUri('a.jpg')).toBe('file:///doc/thumbs/a.jpg');
    deleteVideoFile('a.mp4');
    deleteVideoFile('missing.mp4');
    expect(listVideoFiles()).toEqual([]);
    wipeLocalMedia();
    expect(totalVideoBytes()).toBe(0);
  });
  it('copy aborts when signalled', async () => {
    const src = new File('file:///cache/in.mp4');
    src.write('abc');
    const c = new AbortController();
    c.abort();
    await expect(copyIntoVideos(src.uri, 'b.mp4', () => {}, c.signal)).rejects.toThrow('aborted');
  });
  it('import ports wire native probe, thumbnails and backup exclusion', async () => {
    const p = makeImportPorts({ uuid: () => 'fixed' });
    expect(await p.freeSpace()).toBeGreaterThan(0);
    expect((await p.probe('a.mp4')).playable).toBe(true);
    expect(MirrorPlayerMock.probe).toHaveBeenCalledWith('file:///doc/videos/a.mp4');
    new File('file:///cache/t.jpg').write('jpg');
    expect(await p.makeThumbnail('abc.mp4', 100)).toBe('abc.jpg');
    const VT = require('expo-video-thumbnails');
    VT.getThumbnailAsync.mockRejectedValueOnce(new Error('x'));
    expect(await p.makeThumbnail('abc.mp4', 100)).toBeUndefined();
    await p.setExcludedFromBackup('a.mp4', true);
    expect(MirrorPlayerMock.setExcludedFromBackup).toHaveBeenCalledWith('file:///doc/videos/a.mp4', true);
    await p.deleteFile('a.mp4');
    expect(p.uuid()).toBe('fixed');
    expect(p.now()).toBeInstanceOf(Date);
    deleteThumb('abc.jpg');
    setAllExcludedFromBackup(['z.mp4'], false);
    expect(MirrorPlayerMock.setExcludedFromBackup).toHaveBeenLastCalledWith('file:///doc/videos/z.mp4', false);
  });
  it('cache files round-trip', async () => {
    const uri = writeCacheFile('x.json', '{"a":1}');
    expect(await readTextFile(uri)).toBe('{"a":1}');
  });
});

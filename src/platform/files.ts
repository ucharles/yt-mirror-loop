import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

import type { ImportPorts } from '@/domain/import/localImport';
import MirrorPlayer from '../../modules/mirror-player';

const CHUNK = 4 * 1024 * 1024;

export const videosDir = () => new Directory(Paths.document, 'videos');
export const thumbsDir = () => new Directory(Paths.document, 'thumbs');
export const fixturesDir = () => new Directory(Paths.document, 'e2e-fixtures');

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true } as never);
  return dir;
}

export const videoFile = (name: string) => new File(videosDir(), name);
export const videoUri = (name: string) => videoFile(name).uri;
export const thumbUri = (name: string) => new File(thumbsDir(), name).uri;

export function listVideoFiles(): string[] {
  const dir = videosDir();
  if (!dir.exists) return [];
  return dir.list().filter((e): e is File => e instanceof File).map((f) => f.name);
}

function safeDelete(f: File) {
  try {
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

export function deleteVideoFile(name: string) {
  safeDelete(videoFile(name));
}

export function deleteThumb(name: string) {
  safeDelete(new File(thumbsDir(), name));
}

export function totalVideoBytes(): number {
  const dir = videosDir();
  if (!dir.exists) return 0;
  return dir
    .list()
    .filter((e): e is File => e instanceof File)
    .reduce((sum, f) => sum + (f.size ?? 0), 0);
}

export function wipeLocalMedia() {
  for (const d of [videosDir(), thumbsDir()]) {
    try {
      if (d.exists) d.delete();
    } catch {
      // ignore
    }
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function abortError() {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/** Chunked copy so progress can be shown and the copy cancelled (PRD §3.2). */
export async function copyIntoVideos(
  srcUri: string,
  destName: string,
  onProgress: (f: number) => void,
  signal?: AbortSignal,
  opts: { chunkSize?: number; delayMs?: number } = {},
) {
  ensure(videosDir());
  const src = new File(srcUri);
  const dest = videoFile(destName);
  dest.create({ overwrite: true });
  const total = src.size || 1;
  const reader = src.open(FileMode.ReadOnly);
  const writer = dest.open(FileMode.WriteOnly);
  let copied = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const bytes = reader.readBytes(opts.chunkSize ?? CHUNK);
      if (bytes.length === 0) break;
      writer.writeBytes(bytes);
      copied += bytes.length;
      onProgress(Math.min(1, copied / total));
      await (opts.delayMs ? new Promise<void>((r) => setTimeout(r, opts.delayMs)) : tick());
    }
  } finally {
    reader.close();
    writer.close();
  }
}

export function makeImportPorts(overrides: Partial<ImportPorts> = {}): ImportPorts {
  return {
    freeSpace: async () => Paths.availableDiskSpace,
    copy: copyIntoVideos,
    deleteFile: async (name) => deleteVideoFile(name),
    probe: (name) => MirrorPlayer.probe(videoUri(name)),
    makeThumbnail: async (name, atMs) => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri(name), { time: atMs, quality: 0.6 });
        ensure(thumbsDir());
        const thumbName = `${name.replace(/\.[^.]+$/, '')}.jpg`;
        const dest = new File(thumbsDir(), thumbName);
        safeDelete(dest);
        new File(uri).move(dest);
        return thumbName;
      } catch {
        return undefined;
      }
    },
    setExcludedFromBackup: async (name, excluded) => {
      MirrorPlayer.setExcludedFromBackup(videoUri(name), excluded);
    },
    uuid: () => require('expo-crypto').randomUUID(),
    now: () => new Date(),
    ...overrides,
  };
}

export function readTextFile(uri: string): Promise<string> {
  return new File(uri).text();
}

export function writeCacheFile(name: string, content: string): string {
  const f = new File(Paths.cache, name);
  f.create({ overwrite: true });
  f.write(content);
  return f.uri;
}

export function fixtureUri(name: string) {
  return new File(fixturesDir(), name).uri;
}

export function setAllExcludedFromBackup(names: string[], excluded: boolean) {
  names.forEach((n) => MirrorPlayer.setExcludedFromBackup(videoUri(n), excluded));
}

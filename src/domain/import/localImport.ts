import { LocalVideo, makeFingerprint } from '../schema';

export type ProbeResult = {
  playable: boolean;
  durationMs: number;
  fileSize: number;
  width?: number;
  height?: number;
  fps?: number;
};

export interface ImportPorts {
  freeSpace(): Promise<number>;
  /** Copies `srcUri` into Documents/videos/<destName>. Rejects with an `AbortError` when `signal` aborts. */
  copy(srcUri: string, destName: string, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void>;
  deleteFile(name: string): Promise<void>;
  probe(name: string): Promise<ProbeResult>;
  /** Returns a thumbnail file name, or undefined when generation fails. */
  makeThumbnail(name: string, atMs: number): Promise<string | undefined>;
  setExcludedFromBackup(name: string, excluded: boolean): Promise<void>;
  uuid(): string;
  now(): Date;
}

export type PickedFile = { uri: string; name: string; size?: number };
export type ImportError = 'UNSUPPORTED_FORMAT' | 'NO_SPACE' | 'CANCELLED' | 'COPY_FAILED';
export type ImportResult = { ok: true; video: LocalVideo } | { ok: false; error: ImportError; fileName: string };
export type ImportOptions = { excludeFromBackup: boolean; onProgress?: (fraction: number) => void; signal?: AbortSignal };

/** Safety margin kept free after copying (50 MB). */
const SPACE_MARGIN = 50 * 1024 * 1024;

export const titleFromFileName = (name: string) => name.replace(/\.[^./]+$/, '') || name;
export const extensionOf = (name: string) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : 'mp4';
};

export async function importLocalFile(file: PickedFile, ports: ImportPorts, opts: ImportOptions): Promise<ImportResult> {
  const fail = (error: ImportError): ImportResult => ({ ok: false, error, fileName: file.name });
  if (file.size !== undefined && (await ports.freeSpace()) < file.size + SPACE_MARGIN) return fail('NO_SPACE');

  const id = ports.uuid();
  const destName = `${id}.${extensionOf(file.name)}`;
  let last = 0;
  const report = (f: number) => {
    const clamped = Math.min(1, Math.max(last, f));
    if (clamped !== last || f === 0) {
      last = clamped;
      opts.onProgress?.(clamped);
    }
  };
  report(0);
  try {
    await ports.copy(file.uri, destName, report, opts.signal);
  } catch (e) {
    await ports.deleteFile(destName).catch(() => {});
    return fail(opts.signal?.aborted || (e as Error)?.name === 'AbortError' ? 'CANCELLED' : 'COPY_FAILED');
  }
  if (opts.signal?.aborted) {
    await ports.deleteFile(destName).catch(() => {});
    return fail('CANCELLED');
  }

  let probe: ProbeResult;
  try {
    probe = await ports.probe(destName);
  } catch {
    probe = { playable: false, durationMs: 0, fileSize: 0 };
  }
  if (!probe.playable) {
    await ports.deleteFile(destName).catch(() => {});
    return fail('UNSUPPORTED_FORMAT');
  }
  const thumbnail = await ports.makeThumbnail(destName, Math.round(probe.durationMs * 0.1)).catch(() => undefined);
  await ports.setExcludedFromBackup(destName, opts.excludeFromBackup).catch(() => {});
  report(1);

  const now = ports.now().toISOString();
  const title = titleFromFileName(file.name);
  const video: LocalVideo = {
    id,
    source: 'local',
    fileName: destName,
    originalFileName: file.name,
    title,
    originalTitle: title,
    ...(thumbnail ? { thumbnail } : {}),
    tags: [],
    baseMirror: false,
    segments: [],
    durationMs: Math.round(probe.durationMs),
    fileSize: probe.fileSize,
    fingerprint: makeFingerprint(probe.fileSize, Math.round(probe.durationMs)),
    ...(probe.width ? { width: probe.width } : {}),
    ...(probe.height ? { height: probe.height } : {}),
    ...(probe.fps ? { fps: probe.fps } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, video };
}

/** Imports several files sequentially; one failure does not abort the rest. */
export async function importLocalFiles(
  files: readonly PickedFile[],
  ports: ImportPorts,
  opts: ImportOptions & { onFileProgress?: (index: number, fraction: number) => void },
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  for (let i = 0; i < files.length; i++) {
    if (opts.signal?.aborted) {
      results.push({ ok: false, error: 'CANCELLED', fileName: files[i].name });
      continue;
    }
    results.push(
      await importLocalFile(files[i], ports, {
        ...opts,
        onProgress: (f) => {
          opts.onFileProgress?.(i, f);
          opts.onProgress?.((i + f) / files.length);
        },
      }),
    );
  }
  return results;
}

export const IMPORT_ERROR_MESSAGES: Record<ImportError, string> = {
  UNSUPPORTED_FORMAT: 'iPad에서 재생할 수 없는 형식입니다(mp4/H.264 권장)',
  NO_SPACE: '저장공간이 부족합니다',
  CANCELLED: '가져오기를 취소했습니다',
  COPY_FAILED: '파일을 복사하지 못했습니다',
};

import { LocalVideo, makeFingerprint } from '../schema';

export const RELINK_TOLERANCE_MS = 500;

export type RelinkResult = { status: 'LINKED'; video: LocalVideo } | { status: 'NEEDS_CONFIRM'; diffMs: number };

export function relink(
  video: LocalVideo,
  file: { fileName: string; durationMs: number; fileSize: number; fps?: number; width?: number; height?: number },
  opts: { confirmed?: boolean; now?: Date } = {},
): RelinkResult {
  const diffMs = Math.abs(file.durationMs - video.durationMs);
  if (diffMs > RELINK_TOLERANCE_MS && !opts.confirmed) return { status: 'NEEDS_CONFIRM', diffMs };
  const durationMs = Math.round(file.durationMs);
  return {
    status: 'LINKED',
    video: {
      ...video,
      fileName: file.fileName,
      durationMs,
      fileSize: file.fileSize,
      fingerprint: makeFingerprint(file.fileSize, durationMs),
      ...(file.fps ? { fps: file.fps } : {}),
      ...(file.width ? { width: file.width } : {}),
      ...(file.height ? { height: file.height } : {}),
      updatedAt: (opts.now ?? new Date()).toISOString(),
    },
  };
}

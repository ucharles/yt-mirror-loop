import { CURRENT_SCHEMA_VERSION, ExportFile, Video } from '../schema';

const isRemote = (s: string) => /^https?:\/\//.test(s);

/** Removes device-specific fields before export (PRD §4). */
export function stripForExport(v: Video): Video {
  const { lastPosition: _p, lastRate: _r, lastOpenedAt: _o, ...rest } = v;
  if (rest.source === 'local') {
    const { fileName: _f, thumbnail, ...local } = rest;
    return (thumbnail && isRemote(thumbnail) ? { ...local, thumbnail } : local) as Video;
  }
  return rest as Video;
}

export function buildExport(videos: readonly Video[], now: Date, ids?: readonly string[]): ExportFile {
  const selected = ids ? videos.filter((v) => ids.includes(v.id)) : videos;
  return {
    format: 'yt-mirror-loop',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    videos: selected.map(stripForExport),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `yt-mirror-loop-YYYYMMDD.json` in the device's local date. */
export function exportFileName(now: Date): string {
  return `yt-mirror-loop-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
}

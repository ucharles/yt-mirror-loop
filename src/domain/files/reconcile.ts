import type { Video } from '../schema';

export type ReconcileResult = { videos: Video[]; orphans: string[]; missingIds: string[]; changed: boolean };

/** Compares stored file names with files on disk. Orphans are to be deleted; missing files clear `fileName`. */
export function reconcile(videos: readonly Video[], filesOnDisk: readonly string[]): ReconcileResult {
  const onDisk = new Set(filesOnDisk);
  const referenced = new Set<string>();
  const missingIds: string[] = [];
  const next = videos.map((v) => {
    if (v.source !== 'local' || !v.fileName) return v;
    if (onDisk.has(v.fileName)) {
      referenced.add(v.fileName);
      return v;
    }
    missingIds.push(v.id);
    const { fileName: _gone, ...rest } = v;
    return rest as Video;
  });
  const orphans = filesOnDisk.filter((f) => !referenced.has(f));
  return { videos: next, orphans, missingIds, changed: missingIds.length > 0 };
}

export const isMissingFile = (v: Video) => v.source === 'local' && !v.fileName;

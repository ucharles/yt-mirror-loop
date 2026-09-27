import type { Video } from '../schema';

export type Resolution = 'overwrite' | 'skip' | 'copy';
export type Conflict = { incoming: Video; existing: Video };
export type ImportPlan = { conflicts: Conflict[]; additions: Video[] };

/** The key an incoming item is matched by (PRD §3.11). */
export function conflictKey(v: Video): string {
  if (v.source === 'youtube') return `yt:${v.videoId}`;
  return v.linkedVideoId ? `yt:${v.linkedVideoId}` : `fp:${v.fingerprint}`;
}

/** Every key an existing item can be matched by. */
function existingKeys(v: Video): string[] {
  if (v.source === 'youtube') return [`yt:${v.videoId}`];
  return [`fp:${v.fingerprint}`, ...(v.linkedVideoId ? [`yt:${v.linkedVideoId}`] : [])];
}

export function planImport(existing: readonly Video[], incoming: readonly Video[]): ImportPlan {
  const index = new Map<string, Video>();
  for (const v of existing) for (const k of existingKeys(v)) if (!index.has(k)) index.set(k, v);
  const plan: ImportPlan = { conflicts: [], additions: [] };
  for (const v of incoming) {
    const match = index.get(conflictKey(v));
    if (match) plan.conflicts.push({ incoming: v, existing: match });
    else plan.additions.push(v);
  }
  return plan;
}

/** "Apply to all": the first choice is used for every conflict from `fromIndex` on. */
export function applyToAll(conflicts: readonly Conflict[], choice: Resolution, prior: Record<string, Resolution> = {}, fromIndex = 0) {
  const out = { ...prior };
  conflicts.slice(fromIndex).forEach((c) => {
    out[c.incoming.id] = choice;
  });
  return out;
}

type Deps = { uuid: () => string; now: () => Date };

function asNew(v: Video, deps: Deps, forceNewId: boolean, taken: Set<string>): Video {
  const now = deps.now().toISOString();
  const id = forceNewId || taken.has(v.id) ? deps.uuid() : v.id;
  taken.add(id);
  const base = { ...v, id, updatedAt: now };
  if (base.source === 'local') delete (base as { fileName?: string }).fileName;
  return base;
}

/** Applies a plan with per-conflict resolutions (missing resolution = skip). Returns the new video list. */
export function applyImport(existing: readonly Video[], plan: ImportPlan, resolutions: Record<string, Resolution>, deps: Deps): Video[] {
  const taken = new Set(existing.map((v) => v.id));
  const result = [...existing];
  const now = deps.now().toISOString();
  for (const c of plan.conflicts) {
    const choice = resolutions[c.incoming.id] ?? 'skip';
    if (choice === 'overwrite') {
      const i = result.findIndex((v) => v.id === c.existing.id);
      const { title, memo, tags, segments, baseMirror } = c.incoming;
      const merged = { ...result[i], title, tags, segments, baseMirror, updatedAt: now } as Video;
      if (memo !== undefined) merged.memo = memo;
      else delete merged.memo;
      result[i] = merged;
    } else if (choice === 'copy') {
      result.push(asNew(c.incoming, deps, true, taken));
    }
  }
  for (const v of plan.additions) result.push(asNew(v, deps, false, taken));
  return result;
}

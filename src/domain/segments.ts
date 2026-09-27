export type MirrorSegment = { id: string; start: number; end: number; label?: string };

export const MIN_SEGMENT_LENGTH = 0.2;
const EPS = 1e-9;

export type SegmentError = 'START_AFTER_END' | 'TOO_SHORT' | 'OUT_OF_RANGE';
export type ValidateResult = { ok: true; segment: MirrorSegment } | { ok: false; error: SegmentError };

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Validates one segment. `end` slightly past `duration` (≤ 0.2 s) is clamped. */
export function validate(seg: MirrorSegment, duration?: number): ValidateResult {
  let { start, end } = seg;
  start = round3(start);
  end = round3(end);
  if (start < 0) return { ok: false, error: 'OUT_OF_RANGE' };
  if (start >= end) return { ok: false, error: 'START_AFTER_END' };
  if (duration !== undefined && end > duration) {
    if (end - duration <= MIN_SEGMENT_LENGTH + EPS) end = round3(duration);
    else return { ok: false, error: 'OUT_OF_RANGE' };
  }
  if (end - start < MIN_SEGMENT_LENGTH - EPS) return { ok: false, error: 'TOO_SHORT' };
  return { ok: true, segment: { ...seg, start, end } };
}

/** Sorts, rounds and merges overlapping/touching segments. The first segment's id and label are kept. */
export function normalize(segs: readonly MirrorSegment[]): MirrorSegment[] {
  const sorted = segs.map((s) => ({ ...s, start: round3(s.start), end: round3(s.end) })).sort((a, b) => a.start - b.start);
  const out: MirrorSegment[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      if (!last.label && s.label) last.label = s.label;
    } else {
      out.push(s);
    }
  }
  return out;
}

/** `[start, end)` membership over sorted, non-overlapping segments (binary search). */
export function inAnySegment(t: number, segs: readonly MirrorSegment[]): boolean {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segs[mid];
    if (t < s.start) hi = mid - 1;
    else if (t >= s.end) lo = mid + 1;
    else return true;
  }
  return false;
}

export function mirrorState(t: number, baseMirror: boolean, segs: readonly MirrorSegment[]): boolean {
  return baseMirror !== inAnySegment(t, segs);
}

export function boundaries(segs: readonly MirrorSegment[]): number[] {
  return [...new Set(segs.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
}

export function nextBoundaryAfter(t: number, bounds: readonly number[]): number | undefined {
  let lo = 0;
  let hi = bounds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bounds[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return bounds[lo];
}

/** Moves one edge by `delta` seconds, clamped so the segment stays valid (never crosses the other edge). */
export function nudge(seg: MirrorSegment, edge: 'start' | 'end', delta: number, duration?: number): MirrorSegment {
  if (edge === 'start') {
    const start = round3(Math.min(Math.max(0, seg.start + delta), seg.end - MIN_SEGMENT_LENGTH));
    return { ...seg, start };
  }
  const max = duration ?? Number.POSITIVE_INFINITY;
  const end = round3(Math.max(Math.min(max, seg.end + delta), seg.start + MIN_SEGMENT_LENGTH));
  return { ...seg, end };
}

export const frameDuration = (fps: number) => 1 / fps;

/** Two-tap marking: markStart stores a pending start, markEnd validates and returns a segment. */
export type MarkState = { pendingStart: number | null };
export const markStart = (t: number): MarkState => ({ pendingStart: round3(t) });
export function markEnd(state: MarkState, t: number, id: string, duration?: number): ValidateResult {
  if (state.pendingStart === null) return { ok: false, error: 'START_AFTER_END' };
  return validate({ id, start: state.pendingStart, end: t }, duration);
}

/** Adds a segment and returns the normalized list (merging overlaps). */
export function addSegment(segs: readonly MirrorSegment[], seg: MirrorSegment): MirrorSegment[] {
  return normalize([...segs, seg]);
}

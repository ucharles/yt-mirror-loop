import { create } from 'zustand';

import { AbLoop, emptyLoop, isActive, nudgeLoop, resetLoop, setA, setB, toggleLoop } from '@/domain/abLoop';
import type { MirrorSegment } from '@/domain/segments';
import type { MirrorTransition, PlayerBridge, PlayerStateName } from '@/engines/PlayerBridge';

import { useLibrary } from './libraryStore';

export const SAVE_THROTTLE_MS = 1000;
export const STALL_MS = 500;
const LOG_SIZE = 50;

let now = () => Date.now();
export function configurePlayerClock(fn: () => number) {
  now = fn;
}

export type PlayerState = {
  videoId: string | null;
  bridge: PlayerBridge | null;
  t: number;
  duration: number;
  state: PlayerStateName;
  mirrored: boolean;
  rate: number;
  rates: number[];
  loop: AbLoop;
  loopCount: number;
  /** Buffering periods longer than STALL_MS while playing (E2E: A-B loop must not stall). */
  stallCount: number;
  bufferingSince: number | null;
  mirrorLog: MirrorTransition[];
  maxErrorMs: number;
  error: string | null;
  lastSavedAt: number;
  open(videoId: string, opts?: { position?: number; rate?: number }): void;
  close(): void;
  setBridge(bridge: PlayerBridge | null): void;
  onTime(t: number, duration: number): void;
  onState(state: PlayerStateName): void;
  onMirror(tr: MirrorTransition): void;
  onLoop(count: number): void;
  setError(code: string | null): void;
  setRates(rates: number[]): void;
  setRate(rate: number): void;
  markA(): string | null;
  markB(): string | null;
  nudgeLoopPoint(which: 'a' | 'b', delta: number): void;
  toggleLoop(): void;
  resetLoop(): void;
  applySegments(segments: MirrorSegment[]): MirrorSegment[];
  setBaseMirror(on: boolean): void;
  flush(): void;
};

const initial = {
  videoId: null,
  t: 0,
  duration: 0,
  state: 'unstarted' as PlayerStateName,
  mirrored: false,
  rate: 1,
  rates: [1],
  loop: emptyLoop(),
  loopCount: 0,
  stallCount: 0,
  bufferingSince: null as number | null,
  mirrorLog: [] as MirrorTransition[],
  maxErrorMs: 0,
  error: null,
  lastSavedAt: 0,
};

export const usePlayer = create<PlayerState>((set, get) => {
  const pushLoop = (loop: AbLoop) => {
    set({ loop });
    get().bridge?.setLoop(isActive(loop) ? { a: loop.a!, b: loop.b!, enabled: true } : null);
  };
  const pushMirror = () => {
    const { videoId, bridge } = get();
    const v = useLibrary.getState().videos.find((x) => x.id === videoId);
    if (v && bridge) bridge.setMirrorConfig({ baseMirror: v.baseMirror, segments: v.segments });
  };

  return {
    ...initial,
    bridge: null,
    /** Opening a (different) video resets the A-B loop — it is never persisted (PRD §3.8). */
    open(videoId, opts = {}) {
      set({ ...initial, videoId, t: opts.position ?? 0, rate: opts.rate ?? 1, loop: resetLoop() });
      useLibrary.getState().markOpened(videoId);
    },
    close() {
      get().flush();
      set({ ...initial, bridge: null });
    },
    setBridge(bridge) {
      set({ bridge });
    },
    onTime(t, duration) {
      set({ t, duration: duration || get().duration });
      const s = get();
      if (s.videoId && now() - s.lastSavedAt >= SAVE_THROTTLE_MS) {
        set({ lastSavedAt: now() });
        useLibrary.getState().savePlayback(s.videoId, t, s.rate);
      }
    },
    onState(state) {
      const { bufferingSince, stallCount } = get();
      if (state === 'buffering') set({ state, bufferingSince: bufferingSince ?? now() });
      else set({ state, bufferingSince: null, stallCount: bufferingSince !== null && now() - bufferingSince > STALL_MS ? stallCount + 1 : stallCount });
    },
    onMirror(tr) {
      const log = [...get().mirrorLog, tr].slice(-LOG_SIZE);
      const err = tr.errorMs === null ? get().maxErrorMs : Math.max(get().maxErrorMs, Math.abs(tr.errorMs));
      set({ mirrored: tr.mirrored, mirrorLog: log, maxErrorMs: err });
    },
    onLoop(count) {
      set({ loopCount: count });
    },
    setError(code) {
      set({ error: code });
    },
    setRates(rates) {
      set({ rates });
    },
    setRate(rate) {
      set({ rate });
      get().bridge?.setRate(rate);
      const { videoId, t } = get();
      if (videoId) useLibrary.getState().savePlayback(videoId, t, rate);
    },
    markA() {
      const r = setA(get().loop, get().t);
      if (!r.ok) return r.error;
      pushLoop(r.loop);
      return null;
    },
    markB() {
      const r = setB(get().loop, get().t);
      if (!r.ok) return r.error;
      pushLoop(r.loop);
      return null;
    },
    nudgeLoopPoint(which, delta) {
      pushLoop(nudgeLoop(get().loop, which, delta));
    },
    toggleLoop() {
      pushLoop(toggleLoop(get().loop));
    },
    resetLoop() {
      pushLoop(resetLoop());
    },
    /** Segment edits are normalized, persisted and pushed to the engine as new boundaries. */
    applySegments(segments) {
      const { videoId } = get();
      if (!videoId) return segments;
      const normalized = useLibrary.getState().setSegments(videoId, segments);
      pushMirror();
      return normalized;
    },
    setBaseMirror(on) {
      const { videoId } = get();
      if (!videoId) return;
      useLibrary.getState().setBaseMirror(videoId, on);
      pushMirror();
    },
    flush() {
      const { videoId, t, rate } = get();
      if (videoId) useLibrary.getState().savePlayback(videoId, t, rate);
    },
  };
});

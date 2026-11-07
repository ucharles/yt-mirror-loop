import type { MirrorSegment } from '@/domain/segments';

import type { MirrorTransition, PlayerStateName } from './youtube/player/protocol';

export type { MirrorTransition, PlayerStateName };

export type PlayerSource = { kind: 'youtube'; videoId: string; start?: number } | { kind: 'local'; fileUri: string; fps?: number };
export type MirrorConfig = { baseMirror: boolean; segments: MirrorSegment[] };
export type LoopSetting = { a: number; b: number; enabled: boolean } | null;

export type BridgeEvents = {
  ready: { rates: number[]; duration: number };
  time: { t: number; duration: number };
  directSeek: { t: number };
  rate: { rate: number };
  state: { state: PlayerStateName };
  mirror: MirrorTransition;
  loop: { count: number; at: number };
  error: { code: string; message?: string };
};

/** Shared by YouTubeEngine (WebView) and NativeEngine (AVPlayer). Mirror/loop decisions run inside the engine. */
export interface PlayerBridge {
  readonly kind: 'youtube' | 'local';
  play(): void;
  pause(): void;
  seekTo(sec: number): void;
  seekBy(delta: number): void;
  stepFrames?(n: number): void;
  setRate(rate: number): void;
  getAvailableRates(): number[];
  setMirrorConfig(cfg: MirrorConfig): void;
  setLoop(loop: LoopSetting): void;
  setExternalMode(on: boolean): void;
  on<K extends keyof BridgeEvents>(ev: K, cb: (p: BridgeEvents[K]) => void): () => void;
}

export class Emitter<E extends Record<string, unknown>> {
  private listeners: { [K in keyof E]?: Set<(p: E[K]) => void> } = {};

  on<K extends keyof E>(ev: K, cb: (p: E[K]) => void): () => void {
    const set = (this.listeners[ev] ??= new Set());
    set.add(cb);
    return () => set.delete(cb);
  }

  emit<K extends keyof E>(ev: K, payload: E[K]) {
    this.listeners[ev]?.forEach((cb) => cb(payload));
  }

  clear() {
    this.listeners = {};
  }
}

export const DEFAULT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

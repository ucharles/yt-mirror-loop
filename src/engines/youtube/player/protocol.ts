import type { MirrorSegment } from '../../../domain/segments';

export type LoopConfig = { a: number; b: number; enabled: boolean } | null;

/** RN → WebView */
export type PlayerCommand =
  | { type: 'load'; videoId: string; start?: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seekTo'; t: number }
  | { type: 'seekBy'; delta: number }
  | { type: 'setRate'; rate: number }
  | { type: 'setSegments'; segments: MirrorSegment[]; baseMirror: boolean }
  | { type: 'setLoop'; loop: LoopConfig };

export type PlayerErrorCode = 'EMBED_BLOCKED' | 'INVALID_PARAM' | 'HTML5_ERROR' | 'NOT_FOUND' | 'UNKNOWN';
export type PlayerStateName = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

export type MirrorTransition = {
  mirrored: boolean;
  /** Boundary media time that caused the flip; null for flips caused by seeks/config changes. */
  expectedAt: number | null;
  actualAt: number;
  errorMs: number | null;
};

/** WebView → RN */
export type PlayerEvent =
  | { type: 'ready'; rates: number[]; duration: number }
  | { type: 'timeupdate'; t: number; duration: number }
  | { type: 'directSeek'; t: number }
  | { type: 'rateChange'; rate: number }
  | { type: 'stateChange'; state: PlayerStateName }
  | { type: 'mirror'; transition: MirrorTransition }
  | { type: 'loop'; count: number; at: number }
  | { type: 'error'; code: PlayerErrorCode; raw: number };

export function mapYouTubeError(raw: number): PlayerErrorCode {
  switch (raw) {
    case 101:
    case 150:
      return 'EMBED_BLOCKED';
    case 2:
      return 'INVALID_PARAM';
    case 5:
      return 'HTML5_ERROR';
    case 100:
      return 'NOT_FOUND';
    default:
      return 'UNKNOWN';
  }
}

export const YT_STATE: Record<number, PlayerStateName> = { [-1]: 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };

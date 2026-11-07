import { mirrorState, MirrorSegment, normalize } from '../../../domain/segments';
import { PlaybackClock } from './clock';
import { LoopConfig, mapYouTubeError, PlayerCommand, PlayerEvent, YT_STATE } from './protocol';

/** Subset of `YT.Player` used by the controller. */
export interface YTPlayerLike {
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  setPlaybackRate(rate: number): void;
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
}

export type ControllerEnv = {
  player: YTPlayerLike;
  container: { style: { transform: string } };
  now: () => number;
  post: (ev: PlayerEvent) => void;
};

export const SAMPLE_INTERVAL_MS = 250;
export const TIMEUPDATE_INTERVAL_MS = 100;
/** YouTube can ignore playVideo() while it is still initialising; retry until it reports playing/buffering. */
export const PLAY_RETRY_MS = 1000;
export const PLAY_RETRIES = 3;
const MIRROR_TRANSFORM = 'scaleX(-1)';

/** Runs inside the WebView: clock interpolation, mirror judgement, A-B loop. Driven by rAF via `tick()`. */
export class PlayerController {
  readonly clock = new PlaybackClock();
  private segments: MirrorSegment[] = [];
  private baseMirror = false;
  private loop: LoopConfig = null;
  private mirrored = false;
  private lastT = 0;
  private lastSampleWall = -Infinity;
  private lastTimeupdateWall = -Infinity;
  private loopSeekPending = false;
  private playRequest: { at: number; retries: number } | null = null;
  private stateName = 'unstarted';
  private requestedSeeks: { t: number; until: number }[] = [];
  loopCount = 0;

  constructor(private env: ControllerEnv) {
    this.applyMirror(false);
  }

  private resample(reset: boolean) {
    const { player, now } = this.env;
    const t = player.getCurrentTime();
    if (reset) this.clock.reset(t, now(), player.getPlaybackRate());
    else this.clock.sample(t, now(), player.getPlaybackRate());
    this.lastSampleWall = now();
  }

  private applyMirror(on: boolean) {
    this.mirrored = on;
    this.env.container.style.transform = on ? MIRROR_TRANSFORM : '';
  }

  /** Recomputes the mirror state at `t` without a boundary crossing (seek/config change). */
  private syncMirror(t: number) {
    const want = mirrorState(t, this.baseMirror, this.segments);
    if (want !== this.mirrored) {
      this.applyMirror(want);
      this.env.post({ type: 'mirror', transition: { mirrored: want, expectedAt: null, actualAt: t, errorMs: null } });
    }
    this.lastT = t;
  }

  private boundaryBetween(from: number, to: number): number | null {
    let found: number | null = null;
    for (const s of this.segments) {
      for (const b of [s.start, s.end]) if (b > from && b <= to && (found === null || b > found)) found = b;
    }
    return found;
  }

  /** One animation frame. */
  tick() {
    const now = this.env.now();
    if (this.playRequest && now - this.playRequest.at >= PLAY_RETRY_MS) {
      if (this.playRequest.retries >= PLAY_RETRIES) this.playRequest = null;
      else {
        this.playRequest = { at: now, retries: this.playRequest.retries + 1 };
        this.env.player.playVideo();
      }
    }
    if (this.clock.isPlaying && now - this.lastSampleWall >= SAMPLE_INTERVAL_MS) this.resample(false);
    const t = this.clock.estimate(now);

    if (this.loop?.enabled && this.loop.a < this.loop.b) {
      if (t >= this.loop.b && !this.loopSeekPending) {
        this.loopSeekPending = true;
        this.loopCount++;
        this.seek(this.loop.a);
        this.env.post({ type: 'loop', count: this.loopCount, at: t });
        return;
      }
      if (t < this.loop.b) this.loopSeekPending = false;
    }

    const want = mirrorState(t, this.baseMirror, this.segments);
    if (want !== this.mirrored) {
      this.applyMirror(want);
      const expectedAt = t >= this.lastT ? this.boundaryBetween(this.lastT, t) : null;
      this.env.post({
        type: 'mirror',
        transition: { mirrored: want, expectedAt, actualAt: t, errorMs: expectedAt === null ? null : Math.round((t - expectedAt) * 1000 * 10) / 10 },
      });
    }
    this.lastT = t;

    if (now - this.lastTimeupdateWall >= TIMEUPDATE_INTERVAL_MS) {
      this.lastTimeupdateWall = now;
      this.env.post({ type: 'timeupdate', t, duration: this.env.player.getDuration() });
    }
  }

  private seek(t: number) {
    const target = Math.max(0, t);
    this.requestedSeeks = [...this.requestedSeeks.filter((s) => s.until > this.env.now()), { t: target, until: this.env.now() + 2000 }].slice(-32);
    this.env.player.seekTo(target, true);
    this.clock.reset(target, this.env.now());
    this.lastSampleWall = this.env.now();
    this.syncMirror(target);
  }

  onReady() {
    this.env.post({ type: 'ready', rates: this.env.player.getAvailablePlaybackRates(), duration: this.env.player.getDuration() });
  }

  /** A seeking event from the embedded HTML video, including YouTube's own timeline. */
  onDirectSeek(t: number) {
    if (!Number.isFinite(t)) return;
    const outsideLoop = this.loop?.enabled && (t < this.loop.a || t >= this.loop.b);
    if (!outsideLoop && this.requestedSeeks.some((s) => this.env.now() < s.until && Math.abs(s.t - t) < 0.5)) return;
    if (this.loop?.enabled && (t < this.loop.a || t >= this.loop.b)) this.loop = null;
    this.clock.reset(t, this.env.now());
    this.lastSampleWall = this.env.now();
    this.syncMirror(t);
    this.env.post({ type: 'directSeek', t });
  }

  onRateChange() {
    this.resample(true);
    this.env.post({ type: 'rateChange', rate: this.env.player.getPlaybackRate() });
  }

  onStateChange(code: number) {
    const state = YT_STATE[code] ?? 'unstarted';
    this.stateName = state;
    if (state === 'playing' || state === 'buffering') this.playRequest = null;
    const t = this.env.player.getCurrentTime();
    this.clock.setPlaying(state === 'playing', t, this.env.now());
    this.lastSampleWall = this.env.now();
    this.syncMirror(t);
    this.env.post({ type: 'stateChange', state });
  }

  onError(raw: number) {
    this.env.post({ type: 'error', code: mapYouTubeError(raw), raw });
  }

  handle(cmd: PlayerCommand) {
    const { player } = this.env;
    switch (cmd.type) {
      case 'load':
        player.loadVideoById({ videoId: cmd.videoId, startSeconds: cmd.start });
        this.clock.reset(cmd.start ?? 0, this.env.now());
        this.syncMirror(cmd.start ?? 0);
        break;
      case 'play':
        player.playVideo();
        if (this.stateName !== 'playing' && this.stateName !== 'buffering') this.playRequest = { at: this.env.now(), retries: 0 };
        break;
      case 'pause':
        this.playRequest = null;
        player.pauseVideo();
        break;
      case 'seekTo':
        this.seek(cmd.t);
        break;
      case 'seekBy':
        this.seek(this.clock.estimate(this.env.now()) + cmd.delta);
        break;
      case 'setRate':
        player.setPlaybackRate(cmd.rate);
        this.resample(true);
        break;
      case 'setSegments':
        this.segments = normalize(cmd.segments);
        this.baseMirror = cmd.baseMirror;
        this.syncMirror(this.clock.estimate(this.env.now()));
        break;
      case 'setLoop':
        this.loop = cmd.loop;
        this.loopSeekPending = false;
        break;
    }
  }

  get isMirrored() {
    return this.mirrored;
  }
}

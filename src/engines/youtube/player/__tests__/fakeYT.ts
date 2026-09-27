import { PlayerController, YTPlayerLike } from '../controller';
import type { PlayerEvent } from '../protocol';

/** Simulated YouTube player whose media time advances with a fake wall clock. */
export class FakeYT implements YTPlayerLike {
  wall = 0; // ms
  private t0 = 0;
  private w0 = 0;
  playing = false;
  rate = 1;
  jitter: () => number = () => 0;
  seeks: number[] = [];
  duration = 120;

  trueTime() {
    return this.playing ? this.t0 + ((this.wall - this.w0) / 1000) * this.rate : this.t0;
  }
  private rebase() {
    this.t0 = this.trueTime();
    this.w0 = this.wall;
  }
  getCurrentTime() {
    return Math.max(0, this.trueTime() + this.jitter());
  }
  getDuration() {
    return this.duration;
  }
  getPlaybackRate() {
    return this.rate;
  }
  getAvailablePlaybackRates() {
    return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  }
  seekTo(s: number) {
    this.seeks.push(s);
    this.t0 = s;
    this.w0 = this.wall;
  }
  playVideo() {
    this.rebase();
    this.playing = true;
  }
  pauseVideo() {
    this.rebase();
    this.playing = false;
  }
  setPlaybackRate(r: number) {
    this.rebase();
    this.rate = r;
  }
  loadVideoById(o: { videoId: string; startSeconds?: number }) {
    this.t0 = o.startSeconds ?? 0;
    this.w0 = this.wall;
  }
}

export function setup() {
  const yt = new FakeYT();
  const container = { style: { transform: '' } };
  const events: PlayerEvent[] = [];
  const ctl = new PlayerController({ player: yt, container, now: () => yt.wall, post: (e) => events.push(e) });
  const play = () => {
    yt.playVideo();
    ctl.onStateChange(1);
  };
  const pause = () => {
    yt.pauseVideo();
    ctl.onStateChange(2);
  };
  /** Advances wall time in rAF steps (default 60 Hz), ticking each frame. */
  const run = (ms: number, frame = 1000 / 60) => {
    const end = yt.wall + ms;
    while (yt.wall + frame <= end + 1e-9) {
      yt.wall += frame;
      ctl.tick();
    }
  };
  return { yt, container, events, ctl, play, pause, run };
}

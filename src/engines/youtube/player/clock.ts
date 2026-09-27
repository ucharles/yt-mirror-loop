/** Interpolates media time between coarse `getCurrentTime()` samples (PRD §3.7). */
export class PlaybackClock {
  private sampleT = 0;
  private sampleWall = 0;
  private rate = 1;
  private playing = false;
  private lastShown: number | null = null;

  /** Backward corrections smaller than this are absorbed by holding time instead of jumping back. */
  static readonly HOLD_WINDOW = 0.5;

  sample(t: number, wallMs: number, rate = this.rate) {
    this.sampleT = t;
    this.sampleWall = wallMs;
    this.rate = rate;
  }

  /** Drops interpolation history (seek, rate change): the next estimate equals the new sample exactly. */
  reset(t: number, wallMs: number, rate = this.rate) {
    this.sample(t, wallMs, rate);
    this.lastShown = null;
  }

  setPlaying(playing: boolean, t: number, wallMs: number) {
    this.playing = playing;
    this.reset(t, wallMs);
  }

  get isPlaying() {
    return this.playing;
  }

  get playbackRate() {
    return this.rate;
  }

  estimate(wallMs: number): number {
    const raw = this.playing ? this.sampleT + ((wallMs - this.sampleWall) / 1000) * this.rate : this.sampleT;
    let shown = raw;
    if (this.playing && this.lastShown !== null && raw < this.lastShown && this.lastShown - raw < PlaybackClock.HOLD_WINDOW) {
      shown = this.lastShown;
    }
    this.lastShown = shown;
    return shown;
  }
}

import { PlaybackClock } from '../clock';

describe('PlaybackClock', () => {
  it('P-CLK-01 interpolates at rate 1', () => {
    const c = new PlaybackClock();
    c.setPlaying(true, 10, 0);
    expect(c.estimate(250)).toBeCloseTo(10.25, 6);
  });
  it('P-CLK-02 rate 2 / 0.5', () => {
    const c = new PlaybackClock();
    c.setPlaying(true, 10, 0);
    c.reset(10, 0, 2);
    expect(c.estimate(250)).toBeCloseTo(10.5, 6);
    c.reset(10, 0, 0.5);
    expect(c.estimate(250)).toBeCloseTo(10.125, 6);
    expect(c.playbackRate).toBe(0.5);
  });
  it('P-CLK-03 paused/buffering freezes the estimate', () => {
    const c = new PlaybackClock();
    c.setPlaying(false, 12, 0);
    expect(c.estimate(5000)).toBe(12);
    expect(c.isPlaying).toBe(false);
  });
  it('P-CLK-05 small backward corrections are held, large ones jump', () => {
    const c = new PlaybackClock();
    c.setPlaying(true, 10, 0);
    const a = c.estimate(250); // 10.25
    c.sample(10.2, 250); // periodic sample slightly behind
    expect(c.estimate(260)).toBe(a); // held, not shown going backwards
    expect(c.estimate(400)).toBeCloseTo(10.35, 6); // catches up
    c.sample(3, 400); // far behind (e.g. external seek) → jump
    expect(c.estimate(400)).toBe(3);
  });
});

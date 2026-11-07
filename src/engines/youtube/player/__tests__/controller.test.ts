import { buildPlayerHtml, PLAYER_BASE_URL } from '../html';
import { mapYouTubeError } from '../protocol';
import { setup } from './fakeYT';

const segs = (start: number, end: number) => [{ id: 's', start, end }];
const mirrorEvents = (events: ReturnType<typeof setup>['events']) => events.filter((e) => e.type === 'mirror').map((e) => (e as any).transition);

describe('PlayerController — clock integration', () => {
  it('P-CLK-03 buffering freezes, playing re-samples', () => {
    const { yt, ctl, play, run } = setup();
    yt.seekTo(10);
    play();
    run(100);
    yt.pauseVideo();
    ctl.onStateChange(3); // BUFFERING
    const frozen = ctl.clock.estimate(yt.wall);
    run(1000);
    expect(ctl.clock.estimate(yt.wall)).toBeCloseTo(frozen, 6);
    play();
    expect(ctl.clock.estimate(yt.wall)).toBeCloseTo(yt.trueTime(), 6);
  });
  it('P-CLK-04 seek and rate change re-sample immediately', () => {
    const { yt, ctl, play, run } = setup();
    play();
    run(500);
    ctl.handle({ type: 'seekTo', t: 50 });
    expect(ctl.clock.estimate(yt.wall)).toBe(50);
    ctl.handle({ type: 'setRate', rate: 2 });
    expect(yt.rate).toBe(2);
    run(250);
    expect(ctl.clock.estimate(yt.wall)).toBeCloseTo(50.5, 1);
    ctl.handle({ type: 'seekBy', delta: -1 });
    expect(yt.seeks[yt.seeks.length - 1]).toBeCloseTo(49.5, 1);
    ctl.handle({ type: 'seekBy', delta: -100 });
    expect(yt.seeks[yt.seeks.length - 1]).toBe(0);
  });
  it('P-CLK-05 periodic samples every 250 ms; never shown > 1 frame backwards', () => {
    const { yt, ctl, play } = setup();
    let flip = 1;
    yt.jitter = () => (flip = -flip) * 0.03;
    play();
    let prev = -Infinity;
    let maxBack = 0;
    for (let i = 0; i < 600; i++) {
      yt.wall += 1000 / 60;
      ctl.tick();
      const t = ctl.clock.estimate(yt.wall);
      maxBack = Math.max(maxBack, prev - t);
      prev = t;
    }
    expect(maxBack).toBeLessThanOrEqual(1 / 30);
    expect(Math.abs(ctl.clock.estimate(yt.wall) - yt.trueTime())).toBeLessThan(0.1);
  });
});

describe('PlayerController — mirror', () => {
  it('P-MIR-01 crossing 30 flips in the same tick', () => {
    const { yt, ctl, container, play, run, events } = setup();
    ctl.handle({ type: 'setSegments', segments: segs(30, 40), baseMirror: false });
    ctl.handle({ type: 'seekTo', t: 29.9 });
    play();
    while (ctl.clock.estimate(yt.wall) < 30) {
      expect(container.style.transform).toBe('');
      run(1000 / 60);
    }
    expect(container.style.transform).toBe('scaleX(-1)');
    const t = mirrorEvents(events).pop();
    expect(t).toMatchObject({ mirrored: true, expectedAt: 30 });
    expect(t.errorMs).toBeLessThan(20);
  });
  it('P-MIR-02 crossing 40 removes the transform', () => {
    const { ctl, container, play, run } = setup();
    ctl.handle({ type: 'setSegments', segments: segs(30, 40), baseMirror: false });
    ctl.handle({ type: 'seekTo', t: 39.5 });
    expect(container.style.transform).toBe('scaleX(-1)');
    play();
    run(600);
    expect(container.style.transform).toBe('');
  });
  it('P-MIR-03 baseMirror inverts', () => {
    const { ctl, container } = setup();
    ctl.handle({ type: 'setSegments', segments: segs(30, 40), baseMirror: true });
    expect(container.style.transform).toBe('scaleX(-1)');
    ctl.handle({ type: 'seekTo', t: 35 });
    expect(container.style.transform).toBe('');
    expect(ctl.isMirrored).toBe(false);
  });
  it('P-MIR-04 seek into a segment while paused is correct before PLAYING', () => {
    const { ctl, container, events } = setup();
    ctl.handle({ type: 'setSegments', segments: segs(30, 40), baseMirror: false });
    ctl.handle({ type: 'pause' });
    ctl.handle({ type: 'seekTo', t: 35 });
    expect(container.style.transform).toBe('scaleX(-1)');
    expect(mirrorEvents(events).pop()).toMatchObject({ mirrored: true, expectedAt: null, errorMs: null });
  });
  it('P-MIR-05 precision sweep: every flip within 100 ms at 0.5/1/2×', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (const rate of [0.5, 1, 2]) {
      const { yt, ctl, play, events } = setup();
      yt.jitter = () => rand() * 0.03;
      ctl.handle({ type: 'setSegments', segments: [...segs(30, 40), { id: 'b', start: 41.37, end: 44.01 }], baseMirror: false });
      ctl.handle({ type: 'seekTo', t: 28 });
      ctl.handle({ type: 'setRate', rate });
      play();
      const flips: number[] = [];
      while (yt.trueTime() < 46) {
        const before = ctl.isMirrored;
        yt.wall += 1000 / 60;
        ctl.tick();
        if (ctl.isMirrored !== before) flips.push(yt.trueTime());
      }
      const boundaries = [30, 40, 41.37, 44.01];
      expect(flips).toHaveLength(4);
      flips.forEach((f, i) => expect(Math.abs(f - boundaries[i])).toBeLessThanOrEqual(0.1));
      const reported = mirrorEvents(events).filter((t) => t.expectedAt !== null);
      expect(reported).toHaveLength(4);
      reported.forEach((t) => expect(Math.abs(t.errorMs)).toBeLessThanOrEqual(100));
    }
  });
});

describe('PlayerController — loop, messages, errors', () => {
  it('P-LOOP-01 reaching B seeks to A exactly once', () => {
    const { yt, ctl, play, run, events } = setup();
    ctl.handle({ type: 'setLoop', loop: { a: 5, b: 8, enabled: true } });
    ctl.handle({ type: 'seekTo', t: 7.5 });
    yt.seeks = [];
    play();
    run(600);
    expect(yt.seeks).toEqual([5]);
    expect(events.filter((e) => e.type === 'loop')).toHaveLength(1);
    run(3000);
    expect(yt.seeks).toEqual([5, 5]);
    expect(ctl.loopCount).toBe(2);
    ctl.handle({ type: 'setLoop', loop: null });
    run(4000);
    expect(yt.seeks).toHaveLength(2);
  });
  it('P-MSG-01 setSegments updates judgement without reload', () => {
    const { ctl, container } = setup();
    ctl.handle({ type: 'seekTo', t: 12 });
    expect(container.style.transform).toBe('');
    ctl.handle({ type: 'setSegments', segments: segs(10, 20), baseMirror: false });
    expect(container.style.transform).toBe('scaleX(-1)');
    ctl.handle({ type: 'setSegments', segments: [], baseMirror: false });
    expect(container.style.transform).toBe('');
  });
  it('P-MSG-02 emits timeupdate ~10 Hz, stateChange, ready; load/play/pause forwarded', () => {
    const { yt, ctl, play, pause, run, events } = setup();
    ctl.onReady();
    expect(events[0]).toMatchObject({ type: 'ready', duration: 120 });
    ctl.handle({ type: 'load', videoId: 'dQw4w9WgXcQ', start: 3 });
    expect(ctl.clock.estimate(yt.wall)).toBe(3);
    ctl.handle({ type: 'play' });
    expect(yt.playing).toBe(true);
    ctl.handle({ type: 'pause' });
    expect(yt.playing).toBe(false);
    ctl.handle({ type: 'load', videoId: 'dQw4w9WgXcQ' });
    play();
    const before = events.length;
    run(1000);
    const updates = events.slice(before).filter((e) => e.type === 'timeupdate');
    expect(updates.length).toBeGreaterThanOrEqual(8);
    expect(updates.length).toBeLessThanOrEqual(12);
    pause();
    expect(events.filter((e) => e.type === 'stateChange').map((e: any) => e.state)).toEqual(['playing', 'paused']);
    ctl.onStateChange(42);
    expect(events[events.length - 1]).toEqual({ type: 'stateChange', state: 'unstarted' });
  });
  it('retries playVideo while the player ignores it, stops once playing', () => {
    const { yt, ctl, run } = setup();
    const spy = jest.spyOn(yt, 'playVideo').mockImplementation(() => {});
    ctl.handle({ type: 'play' });
    run(1100);
    expect(spy).toHaveBeenCalledTimes(2);
    run(5000);
    expect(spy).toHaveBeenCalledTimes(4); // 1 + PLAY_RETRIES
    spy.mockRestore();
    ctl.handle({ type: 'play' });
    ctl.onStateChange(1);
    const spy2 = jest.spyOn(yt, 'playVideo');
    run(3000);
    expect(spy2).not.toHaveBeenCalled();
    ctl.handle({ type: 'play' }); // already playing → no retry scheduled
    ctl.handle({ type: 'pause' });
    run(3000);
    expect(spy2).toHaveBeenCalledTimes(1);
  });
  it('P-ERR-01 101/150 → EMBED_BLOCKED', () => {
    const { ctl, events } = setup();
    ctl.onError(150);
    expect(events.pop()).toEqual({ type: 'error', code: 'EMBED_BLOCKED', raw: 150 });
    expect(mapYouTubeError(101)).toBe('EMBED_BLOCKED');
  });
  it('P-ERR-02 2/5/100 mapped', () => {
    expect([2, 5, 100, 999].map(mapYouTubeError)).toEqual(['INVALID_PARAM', 'HTML5_ERROR', 'NOT_FOUND', 'UNKNOWN']);
  });
  it('P-CFG-01 HTML sets origin = baseUrl origin, playsinline, AirPlay disabled', () => {
    const html = buildPlayerHtml({ script: '/*js*/', videoId: 'dQw4w9WgXcQ', start: 4 });
    expect(PLAYER_BASE_URL).toBe('https://yt-mirror-loop.local/');
    expect(html).toContain('"origin":"https://yt-mirror-loop.local"');
    expect(html).toContain('"playsinline":1');
    expect(html).toContain('x-webkit-airplay="deny"');
    expect(html).toContain('allow="autoplay; encrypted-media; picture-in-picture"');
    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&origin=https%3A%2F%2Fyt-mirror-loop.local');
    expect(html).toContain('&start=4"');
    expect(buildPlayerHtml({ script: '' })).toContain('<div id="player"');
    expect(html).toContain('https://www.youtube.com/iframe_api');
    expect(html).toContain('/*js*/');
    expect(buildPlayerHtml({ script: '', baseUrl: 'https://example.github.io/app/' })).toContain('"origin":"https://example.github.io"');
  });
});

it('YouTube timeline seeks outside the loop disable it, while commanded seeks do not count as user seeks', () => {
  const { ctl, yt, events, play, run } = setup();
  ctl.handle({ type: 'setLoop', loop: { a: 10, b: 20, enabled: true } });
  ctl.handle({ type: 'seekTo', t: 15 });
  ctl.onDirectSeek(15);
  expect(events.filter((e) => e.type === 'directSeek')).toHaveLength(0);
  yt.seekTo(25); ctl.onDirectSeek(25); play(); run(500);
  expect(yt.trueTime()).toBeGreaterThan(25);
  expect(events).toContainEqual({ type: 'directSeek', t: 25 });
});

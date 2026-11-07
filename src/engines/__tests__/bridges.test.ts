import { MirrorPlayerMock } from '../../../test/mocks/mirrorPlayer';
import { NativeBridge } from '../native/NativeBridge';
import { Emitter } from '../PlayerBridge';
import { YouTubeBridge } from '../youtube/YouTubeBridge';

describe('YouTubeBridge', () => {
  it('sends commands to the attached target and caches config for replay on ready', () => {
    const b = new YouTubeBridge('dQw4w9WgXcQ', 12);
    const sent: any[] = [];
    b.setMirrorConfig({ baseMirror: true, segments: [{ id: 's', start: 1, end: 2 }] });
    b.setLoop({ a: 1, b: 3, enabled: true });
    b.setRate(0.5);
    expect(sent).toEqual([]); // no target yet
    b.attach((c) => sent.push(c));
    b.play(); // page not ready yet → remembered, not sent
    expect(sent).toEqual([]);
    const ready = jest.fn();
    b.on('ready', ready);
    b.handleEvent({ type: 'ready', rates: [0.5, 1], duration: 90 });
    expect(sent).toEqual([
      { type: 'setSegments', segments: [{ id: 's', start: 1, end: 2 }], baseMirror: true },
      { type: 'setLoop', loop: { a: 1, b: 3, enabled: true } },
      { type: 'setRate', rate: 0.5 },
      { type: 'seekTo', t: 12 },
      { type: 'play' },
    ]);
    expect(ready).toHaveBeenCalledWith({ rates: [0.5, 1], duration: 90 });
    expect(b.getAvailableRates()).toEqual([0.5, 1]);
    sent.length = 0;
    b.play();
    b.pause();
    b.seekTo(-3);
    b.seekBy(1);
    expect(sent).toEqual([{ type: 'play' }, { type: 'pause' }, { type: 'seekTo', t: 0 }, { type: 'seekBy', delta: 1 }]);
  });
  it('forwards events and resumes playback on a new target (external switch)', () => {
    const b = new YouTubeBridge('dQw4w9WgXcQ');
    const ev = { time: jest.fn(), state: jest.fn(), mirror: jest.fn(), loop: jest.fn(), error: jest.fn() };
    (Object.keys(ev) as (keyof typeof ev)[]).forEach((k) => b.on(k, ev[k]));
    b.attach(() => {});
    b.play();
    b.pause(); // cancels the pending play
    b.handleEvent({ type: 'ready', rates: [], duration: 60 });
    b.handleMessage(JSON.stringify({ type: 'timeupdate', t: 5, duration: 60 }));
    b.handleMessage(JSON.stringify({ type: 'stateChange', state: 'playing' }));
    b.handleMessage(JSON.stringify({ type: 'mirror', transition: { mirrored: true, expectedAt: 5, actualAt: 5, errorMs: 0 } }));
    b.handleMessage(JSON.stringify({ type: 'loop', count: 2, at: 8 }));
    b.handleMessage(JSON.stringify({ type: 'error', code: 'EMBED_BLOCKED', raw: 150 }));
    b.handleMessage('not json');
    b.handleMessage('{}');
    expect(ev.time).toHaveBeenCalledWith({ t: 5, duration: 60 });
    expect(ev.state).toHaveBeenCalledWith({ state: 'playing' });
    expect(ev.mirror).toHaveBeenCalled();
    expect(ev.loop).toHaveBeenCalledWith({ count: 2, at: 8 });
    expect(ev.error).toHaveBeenCalledWith({ code: 'EMBED_BLOCKED' });
    expect(b.isPlaying).toBe(true);
    b.detach();
    const sent: any[] = [];
    b.attach((c) => sent.push(c));
    b.setExternalMode(true);
    expect(b.external).toBe(true);
    b.handleEvent({ type: 'ready', rates: [], duration: 60 });
    expect(sent).toContainEqual({ type: 'seekTo', t: 5 });
    expect(sent[sent.length - 1]).toEqual({ type: 'play' });
  });
  it('Emitter clears listeners', () => {
    const e = new Emitter<{ a: number }>();
    const cb = jest.fn();
    const off = e.on('a', cb);
    e.emit('a', 1);
    off();
    e.emit('a', 2);
    e.on('a', cb);
    e.clear();
    e.emit('a', 3);
    expect(cb.mock.calls).toEqual([[1]]);
  });
});

describe('NativeBridge', () => {
  beforeEach(() => jest.clearAllMocks());
  it('maps PlayerBridge calls to the native module', async () => {
    const b = new NativeBridge(MirrorPlayerMock as any);
    const ready = jest.fn();
    b.on('ready', ready);
    await b.load('file:///v.mp4', 30);
    await b.load('file:///v.mp4', 30);
    expect(MirrorPlayerMock.load).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledWith({ rates: expect.any(Array), duration: 60 });
    b.play();
    b.pause();
    b.seekTo(-1);
    b.seekBy(0.1);
    b.stepFrames(-1);
    b.setRate(0.75);
    b.setMirrorConfig({ baseMirror: true, segments: [{ id: 's', start: 2, end: 4 }] });
    b.setLoop({ a: 1, b: 3, enabled: true });
    b.setLoop(null);
    b.setExternalMode(true);
    b.setExternalMode(false);
    expect(MirrorPlayerMock.seekTo).toHaveBeenCalledWith(0);
    expect(MirrorPlayerMock.stepFrames).toHaveBeenCalledWith(-1);
    expect(MirrorPlayerMock.setMirrorConfig).toHaveBeenCalledWith(true, [[2, 4]]);
    expect(MirrorPlayerMock.setLoop).toHaveBeenCalledWith(1, 3, true);
    expect(MirrorPlayerMock.clearLoop).toHaveBeenCalled();
    expect(MirrorPlayerMock.setExternalContent.mock.calls).toEqual([
      ['local', null, null, null],
      ['none', null, null, null],
    ]);
    expect(b.getAvailableRates()).toContain(0.25);
  });
  it('forwards native events, reports load errors, disposes', async () => {
    const b = new NativeBridge(MirrorPlayerMock as any);
    const time = jest.fn();
    const error = jest.fn();
    const mirror = jest.fn();
    b.on('time', time);
    b.on('error', error);
    b.on('mirror', mirror);
    MirrorPlayerMock.emit('onTime', { t: 1, duration: 60 });
    MirrorPlayerMock.emit('onMirror', { mirrored: true, expectedAt: 2, actualAt: 2.01, errorMs: 10 });
    expect(time).toHaveBeenCalledWith({ t: 1, duration: 60 });
    expect(mirror).toHaveBeenCalled();
    MirrorPlayerMock.load.mockRejectedValueOnce(new Error('bad'));
    await b.load('file:///x.mp4');
    expect(error).toHaveBeenCalledWith({ code: 'LOAD_FAILED', message: 'bad' });
    b.dispose();
    expect(MirrorPlayerMock.unload).toHaveBeenCalled();
    MirrorPlayerMock.emit('onTime', { t: 2, duration: 60 });
    expect(time).toHaveBeenCalledTimes(1);
  });
});

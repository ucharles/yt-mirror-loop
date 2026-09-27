/**
 * @jest-environment jsdom
 */
// L2: the browser entry wires YT.Player events, rAF and postMessage (runs inside the WebView).
describe('player entry (jsdom)', () => {
  it('creates the player, forwards events to RN and queues commands until ready', () => {
    document.body.innerHTML = '<div id="mirror"><div id="player"></div></div>';
    const posted: any[] = [];
    const w = window as any;
    w.ReactNativeWebView = { postMessage: (d: string) => posted.push(JSON.parse(d)) };
    w.__YTM_CONFIG__ = { origin: 'https://yt-mirror-loop.local', videoId: 'M7lc1UVf-VE', start: 3, playerVars: { playsinline: 1 } };
    w.requestAnimationFrame = jest.fn();
    let events: any;
    const iframe = document.createElement('iframe');
    const player = {
      getIframe: () => iframe,
      getCurrentTime: () => 3,
      getDuration: () => 60,
      getPlaybackRate: () => 1,
      getAvailablePlaybackRates: () => [0.5, 1, 2],
      seekTo: jest.fn(),
      playVideo: jest.fn(),
      pauseVideo: jest.fn(),
      setPlaybackRate: jest.fn(),
      loadVideoById: jest.fn(),
    };
    w.YT = {
      Player: jest.fn((_id: string, opts: any) => {
        events = opts.events;
        expect(opts.playerVars).toBeUndefined(); // attaches to the pre-rendered iframe
        return player;
      }),
    };
    jest.isolateModules(() => require('../entry'));
    w.__ytm.handle({ type: 'play' }); // queued before ready
    w.onYouTubeIframeAPIReady();
    events.onError({ data: 150 }); // before ready → raw error
    events.onReady();
    expect(iframe.getAttribute('x-webkit-airplay')).toBe('deny');
    expect(player.playVideo).toHaveBeenCalled();
    expect(posted).toContainEqual({ type: 'error', code: 'UNKNOWN', raw: 150 });
    expect(posted).toContainEqual({ type: 'ready', rates: [0.5, 1, 2], duration: 60 });
    events.onStateChange({ data: 1 });
    expect(posted).toContainEqual({ type: 'stateChange', state: 'playing' });
    events.onError({ data: 101 });
    expect(posted).toContainEqual({ type: 'error', code: 'EMBED_BLOCKED', raw: 101 });
    w.__ytm.handle({ type: 'pause' });
    expect(player.pauseVideo).toHaveBeenCalled();
    const loop = w.requestAnimationFrame.mock.calls[0][0];
    loop();
    expect(w.requestAnimationFrame).toHaveBeenCalledTimes(2);
    delete w.ReactNativeWebView;
    const handler = jest.fn();
    w.webkit = { messageHandlers: { ytm: { postMessage: handler } } };
    events.onStateChange({ data: 2 });
    expect(handler).toHaveBeenCalled();
  });
});

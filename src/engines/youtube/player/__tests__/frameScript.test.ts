/**
 * @jest-environment jsdom
 * @jest-environment-options {"url":"https://www.youtube.com/embed/test"}
 */
import { FRAME_SCRIPT } from '../frameScript';

let documentListeners: jest.SpyInstance;
let windowListeners: jest.SpyInstance;
beforeEach(() => {
  documentListeners = jest.spyOn(document, 'addEventListener');
  windowListeners = jest.spyOn(window, 'addEventListener');
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  for (const [type, listener, options] of documentListeners.mock.calls) document.removeEventListener(type, listener, options);
  for (const [type, listener, options] of windowListeners.mock.calls) window.removeEventListener(type, listener, options);
  documentListeners.mockRestore(); windowListeners.mockRestore();
  document.body.innerHTML = ''; document.head.innerHTML = '';
});
const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0));
function setup(pressed = 'true') {
  document.body.innerHTML = `<video></video><button class="ytp-subtitles-button" aria-pressed="${pressed}"></button>`;
  const video = document.querySelector('video')!;
  const track = { kind: 'subtitles', mode: 'showing' };
  const metadata = { kind: 'metadata', mode: 'hidden' };
  const tracks = Object.assign(new EventTarget(), { 0: track, 1: metadata, length: 2 });
  Object.defineProperty(video, 'readyState', { value: 1 });
  Object.defineProperty(video, 'textTracks', { value: tracks });
  const button = document.querySelector('button')!;
  const click = jest.fn(() => button.setAttribute('aria-pressed', 'false'));
  button.addEventListener('click', click);
  window.eval(FRAME_SCRIPT);
  const trustedClick = (target: Element) => {
    const listener = documentListeners.mock.calls.find(([name, , options]) => name === 'click' && options === true)![1] as EventListener;
    // Input supplied by the browser for an actual tap; synthetic button.click() is untrusted.
    listener({ isTrusted: true, target } as unknown as Event);
  };
  return { button, click, track, metadata, tracks, trustedClick };
}

it('starts OFF and does not mistake its own OFF click for a user setting; allows explicit manual ON', async () => {
  const { button, click, track, metadata, trustedClick } = setup();
  expect(button.getAttribute('aria-pressed')).toBe('false'); expect(track.mode).toBe('disabled');
  expect(metadata.mode).toBe('hidden');
  trustedClick(button);
  button.setAttribute('aria-pressed', 'true'); track.mode = 'showing';
  await flushMutations();
  expect(button.getAttribute('aria-pressed')).toBe('true'); expect(track.mode).toBe('showing');
  expect(click).toHaveBeenCalledTimes(1);
  expect(document.getElementById('ytm-default-captions')).toBeNull();
});

it('turns captions OFF if YouTube applies an ON preference after initial metadata/ready', async () => {
  const { button, click, track, tracks } = setup('false');
  expect(click).not.toHaveBeenCalled();
  button.setAttribute('aria-pressed', 'true'); track.mode = 'showing';
  tracks.dispatchEvent(new Event('change'));
  await flushMutations();
  expect(button.getAttribute('aria-pressed')).toBe('false'); expect(track.mode).toBe('disabled');
  expect(click).toHaveBeenCalledTimes(1);
  button.setAttribute('aria-pressed', 'true');
  await flushMutations();
  expect(click).toHaveBeenCalledTimes(2);
});

it('lets the user enable captions through the subtitles settings submenu', async () => {
  const { button, trustedClick } = setup('false');
  document.body.insertAdjacentHTML('beforeend', '<div class="ytp-menuitem"><span class="ytp-menuitem-label">자막 (1)</span></div><div class="ytp-menuitem" id="language">한국어</div>');
  trustedClick(document.querySelector('.ytp-menuitem')!);
  trustedClick(document.getElementById('language')!);
  button.setAttribute('aria-pressed', 'true');
  await flushMutations();
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(document.getElementById('ytm-default-captions')).toBeNull();
});

it('accepts TV controls messages only from the parent origin', () => {
  setup();
  const send = (origin: string, show: boolean) => window.dispatchEvent(new MessageEvent('message', { source: window, origin, data: { ytm: 'controls', show } }));
  send('https://evil.example', false); expect(document.getElementById('ytm-tv-controls')).toBeNull();
  send('https://yt-mirror-loop.local', false); expect(document.getElementById('ytm-tv-controls')).not.toBeNull();
  send('https://yt-mirror-loop.local', true); expect(document.getElementById('ytm-tv-controls')).toBeNull();
});

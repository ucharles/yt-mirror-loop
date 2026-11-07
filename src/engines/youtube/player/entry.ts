/* Browser entry bundled into the WebView HTML by scripts/build-player-html.ts. */
import { PlayerController, YTPlayerLike } from './controller';
import type { PlayerCommand, PlayerEvent } from './protocol';

declare const YT: any;
type Config = { origin: string; videoId: string; start: number; playerVars: Record<string, unknown>; external?: boolean };

const w = window as any;
const config: Config = w.__YTM_CONFIG__;
const pending: PlayerCommand[] = [];
let controller: PlayerController | null = null;

function post(ev: PlayerEvent) {
  const data = JSON.stringify(ev);
  if (w.ReactNativeWebView) w.ReactNativeWebView.postMessage(data);
  else if (w.webkit?.messageHandlers?.ytm) w.webkit.messageHandlers.ytm.postMessage(data);
}

w.__ytm = {
  reportReady() { controller?.onReady(); },
  handle(cmd: PlayerCommand) {
    if (controller) controller.handle(cmd);
    else pending.push(cmd);
  },
};

w.onYouTubeIframeAPIReady = () => {
  // With a videoId the iframe already exists in the document (see html.ts) and YT.Player attaches to it.
  const init = config.videoId ? {} : { playerVars: config.playerVars };
  const player: YTPlayerLike & { getIframe(): HTMLIFrameElement } = new YT.Player('player', {
    ...init,
    events: {
      onReady: () => {
        const iframe = player.getIframe();
        iframe.setAttribute('x-webkit-airplay', 'deny');
        controller = new PlayerController({
          player,
          container: document.getElementById('mirror') as HTMLElement,
          now: () => performance.now(),
          post,
        });
        controller.onReady();
        iframe.contentWindow?.postMessage({ ytm: 'captions-default' }, 'https://www.youtube.com');
        w.__ytm.showControls(!config.external);
        pending.splice(0).forEach((c) => controller!.handle(c));
        const loop = () => {
          controller!.tick();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      },
      onStateChange: (e: { data: number }) => controller?.onStateChange(e.data),
      onPlaybackRateChange: () => controller?.onRateChange(),
      onError: (e: { data: number }) => (controller ? controller.onError(e.data) : post({ type: 'error', code: 'UNKNOWN', raw: e.data })),
    },
  });
  w.__ytm.showControls = (show: boolean) => {
    player.getIframe().contentWindow?.postMessage({ ytm: 'controls', show }, 'https://www.youtube.com');
  };
  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://www.youtube.com' || event.source !== player.getIframe().contentWindow) return;
    if (event.data?.ytm === 'seek' && typeof event.data.t === 'number') controller?.onDirectSeek(event.data.t);
  });
};

/* Browser entry bundled into the WebView HTML by scripts/build-player-html.ts. */
import { PlayerController, YTPlayerLike } from './controller';
import type { PlayerCommand, PlayerEvent } from './protocol';

declare const YT: any;
type Config = { origin: string; videoId: string; start: number; playerVars: Record<string, unknown> };

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
        pending.splice(0).forEach((c) => controller!.handle(c));
        const loop = () => {
          controller!.tick();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      },
      onStateChange: (e: { data: number }) => controller?.onStateChange(e.data),
      onError: (e: { data: number }) => (controller ? controller.onError(e.data) : post({ type: 'error', code: 'UNKNOWN', raw: e.data })),
    },
  });
};

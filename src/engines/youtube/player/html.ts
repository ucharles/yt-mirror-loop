export const PLAYER_BASE_URL = 'https://yt-mirror-loop.local/';

// Shared with the external WKWebView so both playback targets get identical caption and HLS behaviour.
export { FRAME_SCRIPT as FORCE_HLS_SCRIPT } from './frameScript';

/** Builds the WebView document. `origin` must match the WebView `baseUrl` origin (PRD §6, error 152/153). */
export function buildPlayerHtml(opts: { baseUrl?: string; script: string; videoId?: string; start?: number; external?: boolean }): string {
  const origin = new URL(opts.baseUrl ?? PLAYER_BASE_URL).origin;
  const vars = { playsinline: 1, origin, controls: 1, cc_load_policy: 0, disablekb: 1, rel: 0, fs: 0, iv_load_policy: 3, enablejsapi: 1, autoplay: 0 };
  const config = JSON.stringify({
    origin,
    videoId: opts.videoId ?? '',
    start: opts.start ?? 0,
    playerVars: vars,
    external: opts.external ?? false,
  });
  // The iframe is rendered up front so WebKit sees `allow="autoplay"` when it loads; YT.Player attaches to it.
  const query = Object.entries({ ...vars, ...(opts.start ? { start: Math.floor(opts.start) } : {}) })
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  const player = opts.videoId
    ? `<iframe id="player" src="https://www.youtube.com/embed/${opts.videoId}?${query}" allow="autoplay; encrypted-media; picture-in-picture" x-webkit-airplay="deny" frameborder="0"></iframe>`
    : `<div id="player" x-webkit-airplay="deny"></div>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
  #mirror { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform; }
  #player, #mirror iframe { width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<div id="mirror">${player}</div>
<script>window.__YTM_CONFIG__ = ${config};</script>
<script>${opts.script}</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body>
</html>`;
}

import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import MirrorPlayer from '../../../modules/mirror-player';
import { PLAYER_JS, PLAYER_VERSION } from './player/generated';
import { buildPlayerHtml, FORCE_HLS_SCRIPT, PLAYER_BASE_URL } from './player/html';
import type { YouTubeBridge } from './YouTubeBridge';

type Props = { bridge: YouTubeBridge; external: boolean };

/**
 * In solo mode the player runs in an in-app WebView. In external mode the in-app WebView is unmounted and the
 * external display's native WKWebView becomes the single player (PRD §3.12 — never two players at once).
 */
export function YouTubeEngine(props: Props) {
  return <YouTubeSession key={`${props.bridge.videoId}:${props.external ? 'tv' : 'ipad'}:${PLAYER_VERSION}`} {...props} />;
}

function YouTubeSession({ bridge, external }: Props) {
  const ref = useRef<WebView>(null);
  // A playback page is session state, not a derived value of the advancing bridge clock.
  const [html] = useState(() => buildPlayerHtml({ script: PLAYER_JS, videoId: bridge.videoId, start: bridge.lastTime, external }));

  useEffect(() => {
    bridge.setExternalMode(external);
    if (external) {
      bridge.detach();
      bridge.attach((cmd) => MirrorPlayer.sendExternalCommand(JSON.stringify(cmd)));
      const sub = MirrorPlayer.addListener('onExternalMessage', ({ data }) => bridge.handleMessage(data));
      MirrorPlayer.setExternalContent('youtube', html, PLAYER_BASE_URL, `window.__YTM_TV__=true;${FORCE_HLS_SCRIPT}`);
      return () => {
        sub.remove();
        bridge.detach();
        MirrorPlayer.setExternalContent('none', null, null, null);
      };
    }
    bridge.attach((cmd) => ref.current?.injectJavaScript(`window.__ytm&&window.__ytm.handle(${JSON.stringify(cmd)});true;`));
    // Fast Refresh can reconnect the bridge without reloading an already-ready page.
    ref.current?.injectJavaScript('window.__ytm&&window.__ytm.reportReady&&window.__ytm.reportReady();true;');
    return () => bridge.detach();
  }, [bridge, external, html]);

  if (external) return null;
  return (
    <WebView
      ref={ref}
      testID="youtube-webview"
      source={{ html, baseUrl: PLAYER_BASE_URL }}
      originWhitelist={['*']}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsAirPlayForMediaPlayback={false}
      allowsFullscreenVideo={false}
      injectedJavaScriptBeforeContentLoaded={FORCE_HLS_SCRIPT}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
      scrollEnabled={false}
      bounces={false}
      onError={() => bridge.handleEvent({ type: 'error', code: 'HTML5_ERROR', raw: 0 })}
      onContentProcessDidTerminate={() => {
        bridge.detach();
        bridge.attach((cmd) => ref.current?.injectJavaScript(`window.__ytm&&window.__ytm.handle(${JSON.stringify(cmd)});true;`));
        ref.current?.reload();
      }}
      onMessage={(e) => bridge.handleMessage(e.nativeEvent.data)}
      style={styles.web}
    />
  );
}

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: '#000' } });

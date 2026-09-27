import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import MirrorPlayer from '../../../modules/mirror-player';
import { PLAYER_JS } from './player/generated';
import { buildPlayerHtml, FORCE_HLS_SCRIPT, PLAYER_BASE_URL } from './player/html';
import type { YouTubeBridge } from './YouTubeBridge';

type Props = { bridge: YouTubeBridge; external: boolean };

/**
 * In solo mode the player runs in an in-app WebView. In external mode the in-app WebView is unmounted and the
 * external display's native WKWebView becomes the single player (PRD §3.12 — never two players at once).
 */
export function YouTubeEngine({ bridge, external }: Props) {
  const ref = useRef<WebView>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt on mode switch to start at the current time
  const html = useMemo(() => buildPlayerHtml({ script: PLAYER_JS, videoId: bridge.videoId, start: bridge.lastTime }), [bridge, external]);

  useEffect(() => {
    bridge.setExternalMode(external);
    if (external) {
      bridge.detach();
      bridge.attach((cmd) => MirrorPlayer.sendExternalCommand(JSON.stringify(cmd)));
      const sub = MirrorPlayer.addListener('onExternalMessage', ({ data }) => bridge.handleMessage(data));
      MirrorPlayer.setExternalContent('youtube', html, PLAYER_BASE_URL);
      return () => {
        sub.remove();
        bridge.detach();
        MirrorPlayer.setExternalContent('none', null, null);
      };
    }
    bridge.attach((cmd) => ref.current?.injectJavaScript(`window.__ytm&&window.__ytm.handle(${JSON.stringify(cmd)});true;`));
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
      onMessage={(e) => bridge.handleMessage(e.nativeEvent.data)}
      style={styles.web}
    />
  );
}

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: '#000' } });

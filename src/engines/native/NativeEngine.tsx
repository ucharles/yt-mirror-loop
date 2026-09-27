import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { MirrorPlayerView } from '../../../modules/mirror-player';
import type { NativeBridge } from './NativeBridge';

type Props = { bridge: NativeBridge; fileUri: string; fps?: number; external: boolean };

/** In-app AVPlayerLayer; in external mode it stays as a small synced preview (same AVPlayer, PRD §3.12). */
export function NativeEngine({ bridge, fileUri, fps, external }: Props) {
  useEffect(() => {
    bridge.load(fileUri, fps);
  }, [bridge, fileUri, fps]);

  useEffect(() => {
    bridge.setExternalMode(external);
    return () => {
      if (external) bridge.setExternalMode(false);
    };
  }, [bridge, external]);

  return <MirrorPlayerView testID={external ? 'external-preview' : 'native-player'} style={styles.view} />;
}

const styles = StyleSheet.create({ view: { flex: 1, backgroundColor: '#000' } });

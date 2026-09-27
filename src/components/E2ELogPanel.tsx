import { StyleSheet, Text, View } from 'react-native';

import type { MirrorTransition } from '@/engines/PlayerBridge';

type Props = { log: MirrorTransition[]; maxErrorMs: number; loopCount: number; state: string; stalls?: number };

/** Debug-only panel (TEST_PLAN hook 3): E2E flows read precision numbers from here. */
export function E2ELogPanel({ log, maxErrorMs, loopCount, state, stalls = 0 }: Props) {
  const flips = log.filter((l) => l.expectedAt !== null).length;
  return (
    <View testID="panel-e2e-log" style={styles.panel}>
      <Text testID="e2e-max-error" style={styles.text}>{maxErrorMs.toFixed(1)}</Text>
      <Text testID="e2e-flip-count" style={styles.text}>{String(flips)}</Text>
      <Text testID="e2e-loop-count" style={styles.text}>{String(loopCount)}</Text>
      <Text testID="e2e-state" style={styles.text}>{state}</Text>
      <Text testID="e2e-stalls" style={styles.text}>{String(stalls)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', gap: 12, opacity: 0.6, paddingHorizontal: 4 },
  text: { color: '#888', fontSize: 11, fontVariant: ['tabular-nums'] },
});

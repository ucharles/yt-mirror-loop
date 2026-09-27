import { StyleSheet, Text, View } from 'react-native';

import type { AbLoop } from '@/domain/abLoop';
import { formatTime } from '@/utils/format';

import { Button } from './Button';
import { colors } from './theme';

type Props = {
  loop: AbLoop;
  loopCount: number;
  error: string | null;
  onMarkA(): void;
  onMarkB(): void;
  onNudge(which: 'a' | 'b', delta: number): void;
  onToggle(): void;
  onReset(): void;
};

export function AbLoopPanel({ loop, loopCount, error, onMarkA, onMarkB, onNudge, onToggle, onReset }: Props) {
  const point = (which: 'a' | 'b') => {
    const v = loop[which];
    return (
      <View style={styles.row}>
        <Button testID={`btn-ab-${which}`} label={which.toUpperCase()} onPress={which === 'a' ? onMarkA : onMarkB} />
        <Text testID={`ab-${which}-value`} style={styles.value}>
          {v === null ? '--' : formatTime(v, true)}
        </Text>
        <Button small testID={`ab-${which}-m0.1`} label="−.1" onPress={() => onNudge(which, -0.1)} disabled={v === null} />
        <Button small testID={`ab-${which}-p0.1`} label="+.1" onPress={() => onNudge(which, 0.1)} disabled={v === null} />
      </View>
    );
  };
  return (
    <View style={styles.wrap} testID="ab-panel">
      <Text style={styles.title}>A-B 반복</Text>
      {point('a')}
      {point('b')}
      <View style={styles.row}>
        <Button
          testID="btn-ab-toggle"
          accessibilityLabel={loop.enabled ? 'loop:on' : 'loop:off'}
          label={loop.enabled ? '반복 ON' : '반복 OFF'}
          variant={loop.enabled ? 'active' : 'default'}
          onPress={onToggle}
        />
        <Button testID="btn-ab-reset" label="초기화" onPress={onReset} />
        <Text testID="ab-loop-count" style={styles.dim}>
          {loopCount}회
        </Text>
      </View>
      {error && (
        <Text testID="ab-error" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { color: colors.text, width: 90, fontVariant: ['tabular-nums'] },
  dim: { color: colors.textDim },
  error: { color: colors.danger },
});

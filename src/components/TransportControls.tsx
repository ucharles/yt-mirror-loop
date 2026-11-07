import { StyleSheet, Text, View } from 'react-native';

import { formatRate, formatTime } from '@/utils/format';

import { Button } from './Button';
import { colors } from './theme';

type Props = {
  t: number;
  duration: number;
  playing: boolean;
  isLocal: boolean;
  rate: number;
  rates: number[];
  onFullscreen?(): void;
  onPlay(): void;
  onPause(): void;
  onSeekBy(delta: number): void;
  onStep?(n: number): void;
  onRate(rate: number): void;
};

const SEEKS = [-5, -1, -0.1, 0.1, 1, 5];
const seekId = (d: number) => `btn-seek-${d < 0 ? 'm' : 'p'}${Math.abs(d)}`;
const seekLabel = (d: number) => `${d < 0 ? '−' : '+'}${Math.abs(d)}s`;

export function TransportControls(p: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text testID="time-current" style={styles.time}>
          {formatTime(p.t, true)}
        </Text>
        <Text testID="time-duration" style={styles.dim}>
          / {formatTime(p.duration)}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={styles.playbackActions}>
          {p.onFullscreen && <Button testID="btn-fullscreen" label="⛶" accessibilityLabel="전체화면" onPress={p.onFullscreen} />}
          {p.playing ? (
            <Button testID="btn-pause" style={styles.playPause} label="❚❚ 일시정지" variant="primary" onPress={p.onPause} />
          ) : (
            <Button testID="btn-play" style={styles.playPause} label="▶ 재생" variant="primary" onPress={p.onPlay} />
          )}
        </View>
      </View>
      <View style={styles.row}>
        {p.isLocal && p.onStep && <Button small testID="btn-frame-prev" label="−1f" onPress={() => p.onStep!(-1)} />}
        {SEEKS.map((d) => (
          <Button small key={d} testID={seekId(d)} variant={d < 0 ? 'subtract' : 'add'} label={seekLabel(d)} onPress={() => p.onSeekBy(d)} />
        ))}
        {p.isLocal && p.onStep && <Button small testID="btn-frame-next" label="+1f" onPress={() => p.onStep!(1)} />}
      </View>
      <View style={styles.row}>
        <Text style={styles.dim}>속도</Text>
        {p.isLocal && <Button small testID="btn-rate-down" label="−0.05" onPress={() => p.onRate(Math.max(0.25, Math.round((p.rate - 0.05) * 100) / 100))} />}
        {p.rates.map((r) => (
          <Button small key={r} testID={`btn-rate-${r}`} label={formatRate(r)} variant={r === p.rate ? 'active' : 'default'} onPress={() => p.onRate(r)} />
        ))}
        {p.isLocal && <Button small testID="btn-rate-up" label="+0.05" onPress={() => p.onRate(Math.min(2, Math.round((p.rate + 0.05) * 100) / 100))} />}
        <Text testID="rate-current" style={styles.dim}>
          {formatRate(p.rate)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  playPause: { width: 120 },
  playbackActions: { flexDirection: 'row', alignItems: 'stretch', gap: 6, minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  time: { color: colors.text, fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '700' },
  dim: { color: colors.textDim, fontSize: 14 },
});

import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import type { AbLoop } from '@/domain/abLoop';
import type { MirrorSegment } from '@/domain/segments';

import { colors } from './theme';

type Props = { duration: number; t: number; segments: MirrorSegment[]; loop: AbLoop; onSeek(t: number): void };

export const pct = (x: number, duration: number) => (duration > 0 ? Math.min(100, Math.max(0, (x / duration) * 100)) : 0);

export function Timeline({ duration, t, segments, loop, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const showLoop = loop.a !== null && loop.b !== null;
  return (
    <Pressable
      testID="timeline"
      onLayout={onLayout}
      onPress={(e) => width > 0 && duration > 0 && onSeek((e.nativeEvent.locationX / width) * duration)}
      style={styles.track}
    >
      {segments.map((s, i) => (
        <View
          key={s.id}
          testID={`timeline-seg-${i}`}
          style={[styles.band, styles.segment, { left: `${pct(s.start, duration)}%`, width: `${pct(s.end - s.start, duration)}%` }]}
        />
      ))}
      {showLoop && (
        <View
          testID="timeline-ab"
          style={[styles.band, styles.loop, { left: `${pct(loop.a!, duration)}%`, width: `${pct(loop.b! - loop.a!, duration)}%` }]}
        />
      )}
      <View testID="timeline-playhead" style={[styles.playhead, { left: `${pct(t, duration)}%` }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { height: 36, backgroundColor: colors.panelAlt, borderRadius: 6, overflow: 'hidden', justifyContent: 'center' },
  band: { position: 'absolute' },
  segment: { top: 0, bottom: 0, backgroundColor: colors.mirror, opacity: 0.55 },
  loop: { bottom: 0, height: 8, backgroundColor: colors.loop },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1, backgroundColor: colors.text },
});

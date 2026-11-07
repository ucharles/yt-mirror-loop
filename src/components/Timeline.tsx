import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from 'react-native';

import type { AbLoop } from '@/domain/abLoop';
import type { MirrorSegment } from '@/domain/segments';

import { colors } from './theme';

type Props = {
  duration: number; t: number; segments: MirrorSegment[]; loop: AbLoop; pendingStart?: number | null;
  onSeek(t: number): void;
  onScrubStart?(): void;
  onScrubPreview?(t: number): void;
  onScrubEnd?(t: number, resume: boolean): void;
};

export const pct = (x: number, duration: number) => (duration > 0 ? Math.min(100, Math.max(0, (x / duration) * 100)) : 0);

export function Timeline({ duration, t, segments, loop, pendingStart, onSeek, onScrubStart, onScrubPreview, onScrubEnd }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const [preview, setPreview] = useState<number | null>(null);
  const gesture = useRef<{ target: number; sentAt: number } | null>(null);
  const handlers = useRef({ onSeek, onScrubStart, onScrubPreview, onScrubEnd });
  useLayoutEffect(() => { handlers.current = { onSeek, onScrubStart, onScrubPreview, onScrubEnd }; });
  const finish = (resume: boolean) => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    handlers.current.onSeek(current.target);
    handlers.current.onScrubEnd?.(current.target, resume);
    setPreview(null);
  };
  const finishRef = useRef(finish);
  useLayoutEffect(() => { finishRef.current = finish; });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') finishRef.current(false);
    });
    return () => { sub.remove(); finishRef.current(false); };
  }, []);
  const move = (e: GestureResponderEvent, force = false) => {
    if (width <= 0 || duration <= 0) return;
    const target = Math.max(0, Math.min(duration, e.nativeEvent.locationX / width * duration));
    const current = gesture.current;
    if (!current) return;
    current.target = target;
    setPreview(target);
    handlers.current.onScrubPreview?.(target);
    if (force || Date.now() - current.sentAt >= 80) {
      current.sentAt = Date.now();
      handlers.current.onSeek(target);
    }
  };
  const showLoop = loop.a !== null && loop.b !== null;
  return (
    <View
      testID="timeline"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="재생 위치"
      accessibilityValue={{ min: 0, max: duration, now: preview ?? t }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onSeek(Math.max(0, Math.min(duration, t + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
      onLayout={(e) => { if (width !== e.nativeEvent.layout.width) finish(AppState.currentState === 'active'); onLayout(e); }}
      onStartShouldSetResponder={() => width > 0 && duration > 0}
      onStartShouldSetResponderCapture={() => width > 0 && duration > 0}
      onMoveShouldSetResponder={() => width > 0 && duration > 0}
      onResponderGrant={(e) => {
        gesture.current = { target: t, sentAt: -Infinity };
        handlers.current.onScrubStart?.();
        move(e, true);
      }}
      onResponderMove={(e) => move(e)}
      onResponderRelease={(e) => { move(e); finish(true); }}
      onResponderTerminationRequest={() => false}
      onResponderTerminate={() => finish(true)}
      style={styles.track}
    >
      {segments.map((s, i) => (
        <View
          key={s.id}
          pointerEvents="none"
          testID={`timeline-seg-${i}`}
          style={[styles.band, styles.segment, { left: `${pct(s.start, duration)}%`, width: `${pct(s.end - s.start, duration)}%` }]}
        />
      ))}
      {showLoop && (
        <View
          pointerEvents="none"
          testID="timeline-ab"
          style={[styles.band, styles.loop, { left: `${pct(loop.a!, duration)}%`, width: `${pct(loop.b! - loop.a!, duration)}%` }]}
        />
      )}
      {pendingStart != null && <View pointerEvents="none" testID="timeline-pending-start" style={[styles.startMark, { left: `${pct(pendingStart, duration)}%` }]} />}
      <View pointerEvents="none" testID="timeline-playhead" style={[styles.playhead, { left: `${pct(preview ?? t, duration)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 36, backgroundColor: colors.panelAlt, borderRadius: 6, overflow: 'hidden', justifyContent: 'center' },
  band: { position: 'absolute' },
  segment: { top: 0, bottom: 0, backgroundColor: colors.mirror, opacity: 0.55 },
  loop: { bottom: 0, height: 8, backgroundColor: colors.loop },
  startMark: { position: 'absolute', top: 0, bottom: 0, width: 5, marginLeft: -2, backgroundColor: colors.loop, borderWidth: 1, borderColor: colors.text },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1, backgroundColor: colors.text },
});

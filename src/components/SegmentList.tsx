import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { frameDuration, markEnd, markStart, MarkState, MirrorSegment, nudge, SegmentError } from '@/domain/segments';
import { formatTime } from '@/utils/format';

import { Button } from './Button';
import { colors } from './theme';

type Props = {
  segments: MirrorSegment[];
  t: number;
  duration: number;
  /** Present for local videos: enables ±1 frame nudges. */
  fps?: number;
  newId(): string;
  onChange(segments: MirrorSegment[]): void;
  onSeek(t: number): void;
};

export const SEGMENT_ERROR_TEXT: Record<SegmentError, string> = {
  START_AFTER_END: '끝 지점은 시작 지점보다 뒤여야 합니다',
  TOO_SHORT: '구간은 0.2초 이상이어야 합니다',
  OUT_OF_RANGE: '영상 길이를 벗어났습니다',
};

export function SegmentList({ segments, t, duration, fps, newId, onChange, onSeek }: Props) {
  const [mark, setMark] = useState<MarkState>({ pendingStart: null });
  const [error, setError] = useState<string | null>(null);

  const onMarkStart = () => {
    setMark(markStart(t));
    setError(null);
  };
  const onMarkEnd = () => {
    const r = markEnd(mark, t, newId(), duration || undefined);
    if (!r.ok) {
      setError(mark.pendingStart === null ? '먼저 시작 지점을 마크하세요' : SEGMENT_ERROR_TEXT[r.error]);
      return;
    }
    setError(null);
    setMark({ pendingStart: null });
    onChange([...segments, r.segment]);
  };
  const edit = (i: number, next: MirrorSegment, previewAt?: number) => {
    onChange(segments.map((s, j) => (j === i ? next : s)));
    if (previewAt !== undefined) onSeek(previewAt);
  };
  const nudgeEdge = (i: number, edge: 'start' | 'end', delta: number) => {
    const next = nudge(segments[i], edge, delta, duration || undefined);
    edit(i, next, next[edge]);
  };

  const steps: { key: string; label: string; delta: number }[] = [
    { key: 'm1', label: '−1', delta: -1 },
    { key: 'm0.1', label: '−.1', delta: -0.1 },
    ...(fps ? [{ key: 'mf', label: '−f', delta: -frameDuration(fps) }, { key: 'pf', label: '+f', delta: frameDuration(fps) }] : []),
    { key: 'p0.1', label: '+.1', delta: 0.1 },
    { key: 'p1', label: '+1', delta: 1 },
  ];

  return (
    <View style={styles.wrap} testID="segment-list">
      <View style={styles.row}>
        <Button testID="btn-mark-start" label={mark.pendingStart === null ? '시작 마크' : `시작 ${formatTime(mark.pendingStart, true)}`} onPress={onMarkStart} />
        <Button testID="btn-mark-end" label="끝 마크" onPress={onMarkEnd} />
      </View>
      {error && (
        <Text testID="segment-error" style={styles.error}>
          {error}
        </Text>
      )}
      {segments.length === 0 && <Text style={styles.dim}>반전 구간이 없습니다</Text>}
      {segments.map((s, i) => (
        <View key={s.id} style={styles.item}>
          <Pressable testID={`segment-row-${i}`} onPress={() => onSeek(s.start)} style={styles.rowHead}>
            <Text testID={`segment-range-${i}`} style={styles.range}>
              {formatTime(s.start, true)} – {formatTime(s.end, true)}
            </Text>
          </Pressable>
          <TextInput
            testID={`seg-${i}-label`}
            placeholder="라벨"
            placeholderTextColor={colors.textDim}
            defaultValue={s.label ?? ''}
            onEndEditing={(e) => {
              const label = e.nativeEvent.text.trim();
              const next = { ...s };
              if (label) next.label = label;
              else delete next.label;
              edit(i, next);
            }}
            style={styles.label}
          />
          {(['start', 'end'] as const).map((edge) => (
            <View key={edge} style={styles.row}>
              <Text style={styles.edge}>{edge === 'start' ? '시작' : '끝'}</Text>
              {steps.map((st) => (
                <Button small key={st.key} testID={`seg-${i}-${edge}-${st.key}`} label={st.label} onPress={() => nudgeEdge(i, edge, st.delta)} />
              ))}
            </View>
          ))}
          <Button small variant="danger" testID={`seg-${i}-delete`} label="삭제" onPress={() => onChange(segments.filter((_, j) => j !== i))} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  item: { backgroundColor: colors.panelAlt, borderRadius: 8, padding: 8, gap: 6 },
  rowHead: { paddingVertical: 4 },
  range: { color: colors.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  edge: { color: colors.textDim, width: 32 },
  error: { color: colors.danger },
  dim: { color: colors.textDim },
});

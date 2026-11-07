import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { frameDuration, markEnd, markStart, MirrorSegment, normalize, nudge, SegmentError } from '@/domain/segments';
import { formatTime } from '@/utils/format';

import { Button } from './Button';
import { colors } from './theme';

type Draft = { text: string; original: string };
export type SegmentEditorHandle = { save(): void; discard(): void; hasChanges(): boolean };
type Props = {
  segments: MirrorSegment[];
  t: number;
  duration: number;
  fps?: number;
  newId(): string;
  onChange(segments: MirrorSegment[]): void;
  onSeek(t: number): void;
  pendingStart?: number | null;
  onPendingStartChange?(t: number | null): void;
  onDirtyChange?(dirty: boolean): void;
  onEditingFocusChange?(focused: boolean): void;
};

export const SEGMENT_ERROR_TEXT: Record<SegmentError, string> = {
  START_AFTER_END: '끝 지점은 시작 지점보다 뒤여야 합니다',
  TOO_SHORT: '구간은 0.2초 이상이어야 합니다',
  OUT_OF_RANGE: '영상 길이를 벗어났습니다',
};

export const SegmentList = forwardRef<SegmentEditorHandle, Props>(function SegmentList({
  segments, t, duration, fps, newId, onChange, onSeek, pendingStart: controlledStart,
  onPendingStartChange, onDirtyChange, onEditingFocusChange,
}, ref) {
  const [localStart, setLocalStart] = useState<number | null>(null);
  const pendingStart = controlledStart === undefined ? localStart : controlledStart;
  const setStart = (value: number | null) => { setLocalStart(value); onPendingStartChange?.(value); };
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef(drafts);
  useLayoutEffect(() => { draftsRef.current = drafts; });
  const currentSegments = useRef(segments);
  useLayoutEffect(() => { currentSegments.current = segments; });
  const confirming = useRef(false);
  const activeId = segments.find((s) => s.start <= t && t < s.end)?.id ?? null;
  const dirty = Object.values(drafts).some((d) => d.text.trim() !== d.original);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);


  const updateDrafts = (next: Record<string, Draft>) => { draftsRef.current = next; setDrafts(next); };
  const discard = () => { updateDrafts({}); onEditingFocusChange?.(false); };
  const withLabel = (s: MirrorSegment, text: string) => {
    const next = { ...s };
    if (text.trim()) next.label = text.trim();
    else delete next.label;
    return next;
  };
  const save = () => {
    onChange(currentSegments.current.map((s) => draftsRef.current[s.id] ? withLabel(s, draftsRef.current[s.id].text) : s));
    discard();
  };
  useImperativeHandle(ref, () => ({ save, discard, hasChanges: () => Object.values(draftsRef.current).some((d) => d.text.trim() !== d.original) }));

  // Resolve label drafts BEFORE persisting/normalizing or seeking. A cancelled merge has no side effects.
  const requestChange = (next: MirrorSegment[], previewAt?: number, committed?: () => void) => {
    if (confirming.current) return;
    const normalized = normalize(next);
    const affected = Object.keys(draftsRef.current).filter((id) => {
      if (!next.some((s) => s.id === id)) return true;
      return normalized.some((group) => {
        const members = next.filter((s) => s.start >= group.start && s.end <= group.end);
        return members.length > 1 && members.some((s) => s.id === id);
      });
    });
    const apply = () => {
      if (affected.length) {
        const remaining = { ...draftsRef.current };
        affected.forEach((id) => delete remaining[id]);
        updateDrafts(remaining);
        onEditingFocusChange?.(false);
      }
      onChange(next);
      if (previewAt !== undefined) onSeek(previewAt);
      committed?.();
    };
    const losesChanges = affected.some((id) => {
      const d = draftsRef.current[id];
      return d && d.text.trim() !== d.original;
    });
    if (!losesChanges) { apply(); return; }
    confirming.current = true;
    const cancel = () => { confirming.current = false; };
    Alert.alert('라벨 초안을 버릴까요?', '저장하지 않은 라벨을 버리고 구간 삭제 또는 병합을 진행합니다.', [
      { text: '취소', style: 'cancel', onPress: cancel },
      { text: '버리고 진행', style: 'destructive', onPress: () => { confirming.current = false; apply(); } },
    ], { cancelable: true, onDismiss: cancel });
  };
  const onMarkEnd = () => {
    const result = markEnd({ pendingStart }, t, newId(), duration || undefined);
    if (!result.ok) { setError(pendingStart === null ? '먼저 시작 지점을 마크하세요' : SEGMENT_ERROR_TEXT[result.error]); return; }
    requestChange([...segments, result.segment], undefined, () => { setError(null); setStart(null); });
  };
  const nudgeEdge = (i: number, edge: 'start' | 'end', delta: number) => {
    const next = nudge(segments[i], edge, delta, duration || undefined);
    requestChange(segments.map((s, j) => j === i ? next : s), next[edge]);
  };
  const steps = [
    { key: 'm1', label: '−1', delta: -1 }, { key: 'm0.1', label: '−.1', delta: -0.1 },
    ...(fps ? [{ key: 'mf', label: '−f', delta: -frameDuration(fps) }, { key: 'pf', label: '+f', delta: frameDuration(fps) }] : []),
    { key: 'p0.1', label: '+.1', delta: 0.1 }, { key: 'p1', label: '+1', delta: 1 },
  ];
  return (
    <View style={styles.wrap} testID="segment-list">
      <View style={styles.marks}>
        <Button style={styles.markButton} testID="btn-mark-start" selected={pendingStart !== null} variant={pendingStart === null ? 'default' : 'active'}
          label={pendingStart === null ? '시작 마크' : `시작 ${formatTime(pendingStart, true)} · 취소`}
          onPress={() => { setStart(pendingStart === null ? markStart(t).pendingStart : null); setError(null); }} />
        <Button style={styles.markButton} testID="btn-mark-end" label="끝 마크" onPress={onMarkEnd} />
      </View>
      {error && <Text testID="segment-error" style={styles.error}>{error}</Text>}
      {segments.length === 0 && <Text style={styles.dim}>반전 구간이 없습니다</Text>}
      {segments.map((s, i) => (
        <View key={s.id} testID={`segment-item-${i}`} style={[styles.item, activeId === s.id && styles.active]}>
          <View style={styles.rangeRow}>
          <Pressable testID={`segment-row-${i}`} accessibilityRole="button" accessibilityState={{ selected: activeId === s.id }} onPress={() => onSeek(s.start)} style={styles.rowHead}>
            <Text testID={`segment-range-${i}`} style={styles.range}>{activeId === s.id ? '▶ ' : ''}{formatTime(s.start, true)} – {formatTime(s.end, true)}</Text>
          </Pressable>
          <Pressable testID={`seg-${i}-label-edit`} accessibilityRole="button" accessibilityLabel="메모 편집"
            accessibilityHint={s.label ? `저장된 메모: ${s.label}` : '메모 추가'} accessibilityState={{ expanded: !!drafts[s.id] }}
            onPress={() => { if (!draftsRef.current[s.id]) updateDrafts({ ...draftsRef.current, [s.id]: { text: s.label ?? '', original: s.label ?? '' } }); }}
            style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.6 }]}>
            <View pointerEvents="none" accessible={false} style={[styles.noteIcon, s.label ? styles.noteFilled : undefined]}>
              <View style={styles.noteLine} /><View style={styles.noteLine} /><View style={styles.noteLine} />
            </View>
          </Pressable>
          <Pressable testID={`seg-${i}-delete`} accessibilityRole="button" accessibilityLabel="반전구간 삭제"
            onPress={() => requestChange(segments.filter((item) => item.id !== s.id))}
            style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.6 }]}>
            <View pointerEvents="none" accessible={false} style={styles.trashIcon}>
              <View style={styles.trashHandle} /><View style={styles.trashLid} /><View style={styles.trashBody} />
            </View>
          </Pressable>
          </View>
          {drafts[s.id] ? (
            <Modal testID={`seg-${i}-memo-modal`} transparent animationType="fade" visible supportedOrientations={['portrait', 'landscape']}
              onRequestClose={() => {
                const remaining = { ...draftsRef.current }; delete remaining[s.id]; updateDrafts(remaining); onEditingFocusChange?.(false);
              }}>
            <KeyboardAvoidingView style={styles.dialogBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.dialog} accessibilityViewIsModal testID={`seg-${i}-memo-dialog`}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}>
              <Text accessibilityRole="header" style={styles.dialogTitle}>구간 메모</Text>
              <Text style={styles.dim}>{formatTime(s.start, true)} – {formatTime(s.end, true)}</Text>
              <TextInput testID={`seg-${i}-label`} value={drafts[s.id].text} autoFocus multiline accessibilityLabel="구간 메모" placeholder="메모" placeholderTextColor={colors.textDim}
                onFocus={() => onEditingFocusChange?.(true)} onBlur={() => onEditingFocusChange?.(false)}
                onChangeText={(text) => updateDrafts({ ...draftsRef.current, [s.id]: { ...draftsRef.current[s.id], text } })} style={[styles.label, styles.memoInput]} />
              <View style={styles.dialogActions}>
                <Button style={styles.dialogAction} variant="primary" testID={`seg-${i}-label-save`} label="완료" onPress={() => {
                  const latest = currentSegments.current;
                  onChange(latest.map((item) => item.id === s.id ? withLabel(item, draftsRef.current[s.id].text) : item));
                  const remaining = { ...draftsRef.current }; delete remaining[s.id]; updateDrafts(remaining); onEditingFocusChange?.(false);
                }} />
                <Button style={styles.dialogAction} testID={`seg-${i}-label-cancel`} label="취소" onPress={() => {
                  const remaining = { ...draftsRef.current }; delete remaining[s.id]; updateDrafts(remaining); onEditingFocusChange?.(false);
                }} />
              </View>
            </ScrollView>
            </View>
            </KeyboardAvoidingView>
            </Modal>
          ) : null}
          {(['start', 'end'] as const).map((edge) => (
            <View key={edge} style={styles.row}>
              <Text style={styles.edge}>{edge === 'start' ? '시작' : '끝'}</Text>
              {steps.map((st) => <Button small key={st.key} testID={`seg-${i}-${edge}-${st.key}`} variant={st.delta < 0 ? 'subtract' : 'add'} label={st.label} onPress={() => nudgeEdge(i, edge, st.delta)} />)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  item: { backgroundColor: colors.panelAlt, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', padding: 8, gap: 6 },
  active: { borderColor: colors.mirror, backgroundColor: '#352334' },
  marks: { flexDirection: 'row', gap: 8 },
  markButton: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 16 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  noteIcon: { width: 16, height: 19, borderWidth: 1.5, borderColor: colors.textDim, borderRadius: 3, paddingHorizontal: 2, justifyContent: 'space-evenly' },
  noteFilled: { borderColor: colors.mirror, backgroundColor: '#352334' },
  noteLine: { height: 1.5, backgroundColor: colors.textDim },
  trashIcon: { width: 18, height: 20, alignItems: 'center' },
  trashHandle: { width: 8, height: 3, borderWidth: 1.5, borderBottomWidth: 0, borderColor: colors.danger, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  trashLid: { width: 18, height: 1.5, backgroundColor: colors.danger },
  trashBody: { width: 13, height: 14, marginTop: 1.5, borderWidth: 1.5, borderColor: colors.danger, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  rowHead: { flex: 1, minWidth: 0, paddingVertical: 4 }, range: { color: colors.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, minHeight: 36 },
  dialogBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 440, maxHeight: '100%', backgroundColor: colors.panel, borderRadius: 16, overflow: 'hidden' },
  dialogContent: { padding: 20, gap: 14 },
  dialogActions: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  dialogAction: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 16 },
  dialogTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  memoInput: { minHeight: 96, textAlignVertical: 'top' },
  text: { color: colors.text }, edge: { color: colors.textDim, width: 32 }, error: { color: colors.danger }, dim: { color: colors.textDim },
});

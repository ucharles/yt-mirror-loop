import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Conflict, Resolution } from '@/domain/transfer/conflicts';

import { Button } from './Button';
import { colors } from './theme';

type Props = { conflict: Conflict | null; index: number; total: number; onChoose(choice: Resolution, applyToAll: boolean): void };

export function ImportConflictSheet({ conflict, index, total, onChoose }: Props) {
  const [applyAll, setApplyAll] = useState(false);
  if (!conflict) return null;
  const choose = (c: Resolution) => {
    onChoose(c, applyAll);
    setApplyAll(false);
  };
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="conflict-sheet">
          <Text style={styles.title}>
            이미 있는 영상입니다 ({index + 1}/{total})
          </Text>
          <Text testID="conflict-title" style={styles.body}>
            가져올 항목: {conflict.incoming.title}
          </Text>
          <Text style={styles.dim}>기존 항목: {conflict.existing.title}</Text>
          <View style={styles.row}>
            <Button testID="conflict-overwrite" label="덮어쓰기" variant="primary" onPress={() => choose('overwrite')} />
            <Button testID="conflict-skip" label="건너뛰기" onPress={() => choose('skip')} />
            <Button testID="conflict-copy" label="복사본으로 추가" onPress={() => choose('copy')} />
          </View>
          {total - index > 1 && (
            <Pressable
              testID="conflict-apply-all"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: applyAll }}
              accessibilityLabel={applyAll ? 'apply-all:on' : 'apply-all:off'}
              onPress={() => setApplyAll((v) => !v)}
              style={styles.row}
            >
              <Text style={styles.body}>{applyAll ? '☑' : '☐'} 나머지 모두에 적용</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.panel, borderRadius: 16, padding: 24, gap: 12, minWidth: 420, maxWidth: 600 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15 },
  dim: { color: colors.textDim },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
});

import { StyleSheet, Text } from 'react-native';

import { colors } from './theme';

export function MirrorBadge({ mirrored, large }: { mirrored: boolean; large?: boolean }) {
  return (
    <Text
      testID="badge-mirror"
      accessibilityLabel={mirrored ? 'mirror:on' : 'mirror:off'}
      style={[styles.badge, mirrored ? styles.on : styles.off, large && styles.large]}
    >
      {mirrored ? '⇋ 반전' : '원본'}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', fontWeight: '700', fontSize: 14, color: colors.text },
  on: { backgroundColor: colors.mirror },
  off: { backgroundColor: colors.panelAlt },
  large: { fontSize: 40, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 24 },
});

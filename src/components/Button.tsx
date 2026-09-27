import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors } from './theme';

type Props = {
  label: string;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
  variant?: 'default' | 'primary' | 'danger' | 'active';
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
};

export function Button({ label, onPress, testID, accessibilityLabel, variant = 'default', disabled, style, small }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, small && styles.small, styles[variant], disabled && styles.disabled, pressed && styles.pressed, style]}
    >
      <Text style={[styles.label, small && styles.smallLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.panelAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  small: { paddingHorizontal: 8, paddingVertical: 6 },
  default: {},
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  active: { backgroundColor: colors.mirror, borderColor: colors.mirror },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  smallLabel: { fontSize: 13 },
});

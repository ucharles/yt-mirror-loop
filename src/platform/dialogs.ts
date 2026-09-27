import { Alert } from 'react-native';

export function confirm(title: string, message: string, okLabel = '확인', destructive = false): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

export function choose<T extends string>(title: string, message: string, options: { label: string; value: T }[]): Promise<T | null> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      ...options.map((o) => ({ text: o.label, onPress: () => resolve(o.value) })),
      { text: '취소', style: 'cancel' as const, onPress: () => resolve(null) },
    ]),
  );
}

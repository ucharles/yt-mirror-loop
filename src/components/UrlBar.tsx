import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, TextInput, View } from 'react-native';

import { isYouTubeUrl } from '@/domain/youtube/parseUrl';

import { Button } from './Button';
import { colors } from './theme';

export function UrlBar({ onSubmit }: { onSubmit(url: string): void }) {
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const checkClipboard = useCallback(
    () =>
      Clipboard.getStringAsync()
        .then((clip) => setSuggestion(isYouTubeUrl(clip) ? clip.trim() : null))
        .catch(() => setSuggestion(null)),
    [],
  );

  useEffect(() => {
    checkClipboard();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && checkClipboard());
    return () => sub.remove();
  }, [checkClipboard]);

  const submit = (url: string) => {
    if (!url.trim()) return;
    onSubmit(url.trim());
    setText('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          testID="url-input"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submit(text)}
          placeholder="YouTube URL 붙여넣기"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          style={styles.input}
        />
        <Button testID="btn-add-url" label="추가" variant="primary" onPress={() => submit(text)} />
      </View>
      {suggestion && suggestion !== text && (
        <Button
          small
          testID="paste-suggestion"
          label={`클립보드의 링크 붙여넣기: ${suggestion}`}
          onPress={() => {
            setSuggestion(null);
            submit(suggestion);
          }}
          style={styles.chip}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.panelAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  chip: { alignSelf: 'flex-start' },
});

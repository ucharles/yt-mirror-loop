import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { parseE2ECommand, runE2ECommand } from '@/services/e2e';

/**
 * E2E-build-only command field (same commands as the `ytmirror://e2e/...` deep links). iOS asks for confirmation
 * before opening custom-scheme links, and that SpringBoard alert is not drivable from Maestro, so flows type here.
 */
export function E2ECommandBar() {
  const router = useRouter();
  const [text, setText] = useState('');
  const submit = () => {
    const { cmd, params } = parseE2ECommand(text);
    setText('');
    runE2ECommand(cmd, params).finally(() => {
      if (cmd === 'reset') {
        if (router.canGoBack()) router.dismissTo('/');
        else router.replace('/');
      }
    });
  };
  return (
    <TextInput
      testID="e2e-cmd"
      value={text}
      onChangeText={setText}
      onSubmitEditing={submit}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      returnKeyType="go"
      placeholder="e2e"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: { position: 'absolute', left: 4, bottom: 4, width: 140, height: 28, fontSize: 11, color: '#666', backgroundColor: '#0006', borderRadius: 4, paddingHorizontal: 4 },
});

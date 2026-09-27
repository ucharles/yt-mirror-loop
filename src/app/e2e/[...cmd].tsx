import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { IS_E2E } from '@/platform/env';
import { runE2ECommand } from '@/services/e2e';

export default function E2ECommand() {
  const router = useRouter();
  const { cmd, ...params } = useLocalSearchParams<{ cmd: string[] } & Record<string, string>>();
  const name = Array.isArray(cmd) ? cmd.join('/') : String(cmd ?? '');

  useEffect(() => {
    if (!IS_E2E) return;
    // Leave the transparent modal first so the command runs against the screen underneath.
    const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
    if (name === 'reset') {
      runE2ECommand(name, params).finally(() => (router.canGoBack() ? router.dismissTo('/') : router.replace('/')));
    } else {
      back();
      runE2ECommand(name, params);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!IS_E2E) return <Redirect href="/" />;
  return <View style={{ flex: 1 }} testID="e2e-command" />;
}

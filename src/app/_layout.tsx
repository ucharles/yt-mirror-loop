import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { E2ECommandBar } from '@/components/E2ECommandBar';
import { IS_E2E } from '@/platform/env';
import { useExternal } from '@/state/externalStore';
import { useLibrary } from '@/state/libraryStore';
import { useSettings } from '@/state/settingsStore';

export default function RootLayout() {
  // Load persisted state once, before the first screen renders.
  useState(() => {
    useSettings.getState().load();
    useLibrary.getState().init();
    return true;
  });
  useEffect(() => useExternal.getState().init(), []);
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f1115' } }}>
        <Stack.Screen name="e2e/[...cmd]" options={{ presentation: 'transparentModal', animation: 'none' }} />
      </Stack>
      {IS_E2E && <E2ECommandBar />}
    </>
  );
}

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors } from '@/components/theme';
import { useLibrary } from '@/state/libraryStore';
import { useSettings } from '@/state/settingsStore';
import { formatBytes } from '@/utils/format';

type Props = { storageBytes(): number; onBackupChange?(excluded: boolean): void; version?: string };

export function SettingsScreen({ storageBytes, onBackupChange, version = Constants.expoConfig?.version ?? '0.0.0' }: Props) {
  const router = useRouter();
  const exclude = useSettings((s) => s.excludeFromBackup);
  const videos = useLibrary((s) => s.videos);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when the library changes
  const bytes = useMemo(() => storageBytes(), [storageBytes, videos]);
  const localCount = videos.filter((v) => v.source === 'local' && v.fileName).length;

  return (
    <SafeAreaView style={styles.screen} testID="screen-settings">
      <View style={styles.header}>
        <Button testID="btn-back" label="←" onPress={() => router.back()} />
        <Text style={styles.h1}>설정</Text>
      </View>
      <View style={styles.item}>
        <Text style={styles.label}>로컬 영상 저장공간</Text>
        <Text testID="storage-total" style={styles.value}>
          {formatBytes(bytes)}
        </Text>
        <Text style={styles.dim}>{localCount}개 파일</Text>
      </View>
      <View style={styles.item}>
        <Text style={styles.label}>iCloud 백업에서 영상 제외</Text>
        <Switch
          testID="toggle-backup"
          accessibilityLabel={exclude ? 'backup-exclude:on' : 'backup-exclude:off'}
          value={exclude}
          onValueChange={(v) => {
            useSettings.getState().setExcludeFromBackup(v);
            onBackupChange?.(v);
          }}
        />
      </View>
      <View style={styles.item}>
        <Text style={styles.label}>앱 버전</Text>
        <Text testID="app-version" style={styles.value}>
          {version}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginHorizontal: 12, marginBottom: 8, backgroundColor: colors.panel, borderRadius: 10 },
  label: { color: colors.text, fontSize: 16, flex: 1 },
  value: { color: colors.text, fontSize: 16, fontWeight: '700' },
  dim: { color: colors.textDim },
});

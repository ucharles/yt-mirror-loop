import { listVideoFiles, setAllExcludedFromBackup, totalVideoBytes } from '@/platform/files';
import { SettingsScreen } from '@/screens/SettingsScreen';

export default function Settings() {
  return <SettingsScreen storageBytes={totalVideoBytes} onBackupChange={(ex) => setAllExcludedFromBackup(listVideoFiles(), ex)} />;
}

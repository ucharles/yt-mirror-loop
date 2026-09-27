import * as Sharing from 'expo-sharing';

import { writeCacheFile } from './files';

export async function shareJson(fileName: string, content: string) {
  const uri = writeCacheFile(fileName, content);
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: fileName });
}

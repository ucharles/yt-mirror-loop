import type { Video } from '@/domain/schema';
import { pickFromPhotoLibrary, pickJsonFile, pickSingleVideo, pickVideoFiles } from '@/platform/picker';
import { readTextFile, thumbUri } from '@/platform/files';
import { relinkVideo, runLocalImport, setMessage, startJsonImport } from '@/services/flows';

export const libraryActions = {
  importFiles: async () => runLocalImport(await pickVideoFiles()),
  importPhotos: async () => {
    try {
      await runLocalImport(await pickFromPhotoLibrary());
    } catch {
      setMessage('사진 보관함에 접근할 수 없습니다');
    }
  },
  importJson: async () => {
    const uri = await pickJsonFile();
    if (uri) startJsonImport(await readTextFile(uri));
  },
  relink: async (videoId: string) => {
    const f = await pickSingleVideo();
    if (f) await relinkVideo(videoId, f);
  },
  thumbUri: (v: Video) => (v.thumbnail ? (/^https?:/.test(v.thumbnail) ? v.thumbnail : thumbUri(v.thumbnail)) : undefined),
};

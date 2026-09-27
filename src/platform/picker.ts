import * as DocumentPicker from 'expo-document-picker';

import type { PickedFile } from '@/domain/import/localImport';

/** Files app picker for movies (`public.movie`), multi-select (PRD §3.2). */
export async function pickVideoFiles(): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['public.movie', 'video/*'], multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size ?? undefined }));
}

export async function pickSingleVideo(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['public.movie', 'video/*'], multiple: false, copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, size: a.size ?? undefined };
}

export async function pickJsonFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json'], multiple: false, copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  return res.assets[0].uri;
}

/** Photo library import (P1). Returns picked videos as local file URIs. */
export async function pickFromPhotoLibrary(): Promise<PickedFile[]> {
  const ImagePicker = require('expo-image-picker');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: true, quality: 1 });
  if (res.canceled) return [];
  return res.assets.map((a: { uri: string; fileName?: string | null; fileSize?: number }) => ({
    uri: a.uri,
    name: a.fileName ?? a.uri.split('/').pop() ?? 'video.mov',
    size: a.fileSize,
  }));
}

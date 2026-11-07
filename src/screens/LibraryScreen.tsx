import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ImportConflictSheet } from '@/components/ImportConflictSheet';
import { colors } from '@/components/theme';
import { UrlBar } from '@/components/UrlBar';
import { VideoCard } from '@/components/VideoCard';
import { VideoInfoSheet } from '@/components/VideoInfoSheet';
import { allTags, filterVideos, SortKey, sortVideos } from '@/domain/library/query';
import type { Video } from '@/domain/schema';
import {
  addYouTube,
  cancelImport,
  currentConflict,
  deleteVideoWithConfirm,
  exportLibrary,
  linkYouTubeUrl,
  resolveConflict,
  setMessage,
  useFlows,
} from '@/services/flows';
import { useLibrary } from '@/state/libraryStore';

export type LibraryActions = {
  importFiles(): void;
  importPhotos(): void;
  importJson(): void;
  relink(videoId: string): void;
  thumbUri(v: Video): string | undefined;
};

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'lastOpenedAt', label: '최근 사용' },
  { key: 'createdAt', label: '추가순' },
  { key: 'title', label: '이름순' },
];

export function LibraryScreen({ actions }: { actions: LibraryActions }) {
  const router = useRouter();
  const videos = useLibrary((s) => s.videos);
  const flows = useFlows();
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(width);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('lastOpenedAt');
  const [source, setSource] = useState<'all' | 'youtube' | 'local'>('all');
  const [tags, setTags] = useState<string[]>([]);
  const [infoId, setInfoId] = useState<string | null>(null);

  const shown = useMemo(() => sortVideos(filterVideos(videos, { search, source, tags }), sort), [videos, search, source, tags, sort]);
  const tagList = useMemo(() => allTags(videos), [videos]);
  const columns = Math.max(1, Math.floor((gridWidth - 24) / 300));
  const cardWidth = Math.max(0, (gridWidth - 24 - 12 * (columns - 1)) / columns);
  const info = videos.find((v) => v.id === infoId);
  const conflict = currentConflict(flows);

  const openVideo = (id: string) => router.push(`/player/${id}`);
  const onUrl = async (url: string) => {
    const id = await addYouTube(url);
    if (id) openVideo(id);
  };

  return (
    <SafeAreaView style={styles.screen} testID="screen-library">
      <View style={styles.header}>
        <Text style={styles.h1}>yt-mirror-loop</Text>
        <View style={{ flex: 1 }} />
        <Button testID="btn-import-files" label="파일에서 가져오기" variant="primary" onPress={actions.importFiles} />
        <Button testID="btn-import-photos" label="사진 보관함" onPress={actions.importPhotos} />
        <Button testID="btn-export" label="내보내기" onPress={() => exportLibrary()} disabled={videos.length === 0} />
        <Button testID="btn-import-json" label="가져오기" onPress={actions.importJson} />
        <Button testID="btn-settings" label="설정" onPress={() => router.push('/settings')} />
      </View>
      <View style={styles.bar}>
        <UrlBar onSubmit={onUrl} />
        <View style={styles.row}>
          <TextInput
            testID="search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="검색 (제목/메모/태그)"
            placeholderTextColor={colors.textDim}
            style={styles.search}
            autoCapitalize="none"
          />
          {SORTS.map((s) => (
            <Button small key={s.key} testID={`sort-${s.key}`} label={s.label} variant={sort === s.key ? 'active' : 'default'} onPress={() => setSort(s.key)} />
          ))}
          {(['all', 'youtube', 'local'] as const).map((s) => (
            <Button
              small
              key={s}
              testID={`filter-source-${s}`}
              label={s === 'all' ? '전체' : s === 'youtube' ? 'YouTube' : '파일'}
              variant={source === s ? 'active' : 'default'}
              onPress={() => setSource(s)}
            />
          ))}
        </View>
        {tagList.length > 0 && (
          <View style={styles.row}>
            {tagList.map((t) => (
              <Button
                small
                key={t}
                testID={`filter-tag-${t}`}
                label={`#${t}`}
                variant={tags.includes(t) ? 'active' : 'default'}
                onPress={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
              />
            ))}
          </View>
        )}
      </View>
      {flows.message && (
        <View style={styles.banner}>
          <Text testID="flow-message" style={styles.bannerText}>
            {flows.message}
          </Text>
          <Button small testID="btn-dismiss-message" label="닫기" onPress={() => setMessage(null)} />
        </View>
      )}
      {flows.importing && (
        <View testID="import-progress" style={styles.banner}>
          <Text style={styles.bannerText}>
            가져오는 중: {flows.importFile} {Math.round(flows.progress * 100)}%
          </Text>
          <Button small testID="btn-import-cancel" label="취소" onPress={cancelImport} />
        </View>
      )}
      {videos.length === 0 ? (
        <View style={styles.empty}>
          <Text testID="library-empty" style={styles.emptyText}>
            영상이 없습니다
          </Text>
          <Text style={styles.dim}>YouTube 링크를 붙여넣거나 파일을 가져오세요.</Text>
        </View>
      ) : (
        <FlatList
          testID="video-grid"
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          extraData={cardWidth}
          key={columns}
          data={shown}
          numColumns={columns}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth, paddingBottom: 12 }}>
              <VideoCard
                video={item}
                thumbUri={actions.thumbUri(item)}
                onPress={() => openVideo(item.id)}
                onMenu={() => setInfoId(item.id)}
                onRelink={() => actions.relink(item.id)}
              />
            </View>
          )}
        />
      )}
      <ImportConflictSheet conflict={conflict} index={flows.conflictIndex} total={flows.plan?.conflicts.length ?? 0} onChoose={resolveConflict} />
      {info && (
        <VideoInfoSheet
          video={info}
          allVideos={videos}
          onClose={() => setInfoId(null)}
          onRename={(t) => useLibrary.getState().rename(info.id, t)}
          onMemo={(m) => useLibrary.getState().setMemo(info.id, m)}
          onTags={(t) => useLibrary.getState().setTags(info.id, t)}
          onDelete={async () => {
            setInfoId(null);
            await deleteVideoWithConfirm(info.id);
          }}
          onRelink={() => {
            setInfoId(null);
            actions.relink(info.id);
          }}
          onLinkYouTube={(url) => linkYouTubeUrl(info.id, url)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, flexWrap: 'wrap' },
  h1: { color: colors.text, fontSize: 24, fontWeight: '800' },
  bar: { paddingHorizontal: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 200, color: colors.text, backgroundColor: colors.panelAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, marginBottom: 0, padding: 10, borderRadius: 8, backgroundColor: colors.panelAlt },
  bannerText: { color: colors.text, flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.text, fontSize: 20, fontWeight: '700' },
  dim: { color: colors.textDim },
  grid: { padding: 12 },
});

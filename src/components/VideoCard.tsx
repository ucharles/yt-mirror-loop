import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { isMissingFile } from '@/domain/files/reconcile';
import type { Video } from '@/domain/schema';
import { formatTime } from '@/utils/format';

import { Button } from './Button';
import { colors } from './theme';

type Props = { video: Video; thumbUri?: string; onPress(): void; onMenu(): void; onRelink(): void };

export function VideoCard({ video, thumbUri, onPress, onMenu, onRelink }: Props) {
  const { fontScale } = useWindowDimensions();
  const missing = isMissingFile(video);
  return (
    <Pressable testID={`video-card-${video.id}`} accessibilityLabel={`card:${video.title}`} onPress={onPress} onLongPress={onMenu} style={styles.card}>
      <View style={styles.thumbWrap}>
        {thumbUri ? <Image source={{ uri: thumbUri }} style={styles.thumb} /> : <View style={[styles.thumb, styles.noThumb]} />}
        <Text testID={`card-source-${video.id}`} style={[styles.badge, video.source === 'youtube' ? styles.yt : styles.local]}>
          {video.source === 'youtube' ? 'YouTube' : '파일'}
        </Text>
      {missing && (
        <View style={styles.missing}>
          <Text testID={`card-missing-${video.id}`} style={styles.missingText}>
            파일 없음
          </Text>
          <Button small testID={`btn-relink-${video.id}`} label="파일 연결" onPress={onRelink} />
        </View>
      )}
      </View>
      <Text testID={`card-title-${video.id}`} numberOfLines={2} ellipsizeMode="tail" style={[styles.title, { height: 44 * fontScale }]}>
        {video.title}
      </Text>
      <View style={[styles.meta, { height: Math.max(36, 22 * fontScale) }]}>
        <Text testID={`card-segments-${video.id}`} numberOfLines={1} style={styles.dim}>
          구간 {video.segments.length}
        </Text>
          <Text testID={`card-duration-${video.id}`} numberOfLines={1} style={styles.dim}>
            {video.durationMs === undefined ? '--:--' : formatTime(video.durationMs / 1000)}
          </Text>
        {video.tags.length > 0 ? <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.dim, styles.tags]}>#{video.tags.join(' #')}</Text> : <View style={{ flex: 1 }} />}
        <Button small testID={`card-menu-${video.id}`} label="⋯" onPress={onMenu} />
      </View>

    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 10, gap: 6, borderWidth: 1, borderColor: colors.border },
  thumbWrap: { position: 'relative' },
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: colors.panelAlt },
  noThumb: {},
  badge: { position: 'absolute', top: 6, left: 6, color: colors.text, fontSize: 12, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  yt: { backgroundColor: '#e62117' },
  local: { backgroundColor: colors.accent },
  title: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  meta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tags: { flex: 1, minWidth: 0 },
  dim: { color: colors.textDim, fontSize: 13 },
  missing: { position: 'absolute', bottom: 6, left: 6, right: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 6, borderRadius: 6, backgroundColor: '#171a21e6' },
  missingText: { color: colors.danger, fontWeight: '700' },
});

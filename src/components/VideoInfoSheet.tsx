import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { tagSuggestions } from '@/domain/library/query';
import type { Video } from '@/domain/schema';
import { formatBytes, formatTime } from '@/utils/format';

import { Button } from './Button';
import { colors } from './theme';

type Props = {
  video: Video;
  allVideos: Video[];
  onClose(): void;
  onRename(title: string): void;
  onMemo(memo: string): void;
  onTags(tags: string[]): void;
  onDelete(): void;
  onRelink(): void;
  onLinkYouTube(url: string): void;
};

export function VideoInfoSheet({ video, allVideos, onClose, onRename, onMemo, onTags, onDelete, onRelink, onLinkYouTube }: Props) {
  const [tagInput, setTagInput] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const suggestions = tagInput ? tagSuggestions(allVideos, tagInput, video.tags).slice(0, 6) : [];
  const addTag = (t: string) => {
    if (t.trim()) onTags([...video.tags, t.trim()]);
    setTagInput('');
  };
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.content} testID="info-sheet" keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            <Text style={styles.h}>영상 정보</Text>
            <View style={{ flex: 1 }} />
            <Button testID="btn-info-close" label="닫기" onPress={onClose} />
          </View>
          <Text style={styles.label}>제목 (원제: {video.originalTitle})</Text>
          <TextInput testID="info-title" defaultValue={video.title} onEndEditing={(e) => onRename(e.nativeEvent.text)} style={styles.input} />
          <Text style={styles.label}>메모</Text>
          <TextInput testID="info-memo" defaultValue={video.memo ?? ''} multiline onEndEditing={(e) => onMemo(e.nativeEvent.text)} style={[styles.input, { minHeight: 70 }]} />
          <Text style={styles.label}>태그</Text>
          <View style={styles.row}>
            {video.tags.map((t) => (
              <Button small key={t} testID={`info-tag-${t}`} label={`#${t} ✕`} onPress={() => onTags(video.tags.filter((x) => x !== t))} />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              testID="info-tag-input"
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={() => addTag(tagInput)}
              placeholder="태그 추가"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              style={[styles.input, { flex: 1 }]}
            />
            <Button testID="btn-add-tag" label="추가" onPress={() => addTag(tagInput)} />
          </View>
          {suggestions.length > 0 && (
            <View style={styles.row}>
              {suggestions.map((t) => (
                <Button small key={t} testID={`tag-suggestion-${t}`} label={`#${t}`} onPress={() => addTag(t)} />
              ))}
            </View>
          )}
          {video.source === 'local' && (
            <>
              <Text style={styles.label}>파일</Text>
              <Text testID="info-file" style={styles.body}>
                {video.fileName ? `${formatBytes(video.fileSize)} · ${video.width ?? '?'}×${video.height ?? '?'} · ${formatTime(video.durationMs / 1000)}${video.fps ? ` · ${Math.round(video.fps)}fps` : ''}` : '파일 없음'}
              </Text>
              <Button testID="btn-info-relink" label="파일 다시 연결" onPress={onRelink} />
              <Text style={styles.label}>원본 YouTube 연결 {video.linkedVideoId ? `(${video.linkedVideoId})` : ''}</Text>
              <View style={styles.row}>
                <TextInput testID="info-youtube-url" value={ytUrl} onChangeText={setYtUrl} placeholder="https://youtu.be/…" placeholderTextColor={colors.textDim} autoCapitalize="none" style={[styles.input, { flex: 1 }]} />
                <Button testID="btn-link-youtube" label="연결" onPress={() => ytUrl && onLinkYouTube(ytUrl)} />
              </View>
            </>
          )}
          <Button testID="btn-info-delete" variant="danger" label="영상 삭제" onPress={onDelete} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', alignItems: 'center' },
  sheet: { backgroundColor: colors.panel, borderRadius: 16, maxHeight: '85%', width: '90%', maxWidth: 640 },
  content: { padding: 20, gap: 10 },
  h: { color: colors.text, fontSize: 20, fontWeight: '700' },
  label: { color: colors.textDim, marginTop: 6 },
  body: { color: colors.text },
  input: { color: colors.text, backgroundColor: colors.panelAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
});

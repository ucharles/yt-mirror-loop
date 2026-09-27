import { useLocalSearchParams } from 'expo-router';

import { PlayerScreen } from '@/screens/PlayerScreen';

import { libraryActions } from '@/services/libraryActions';

export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayerScreen videoId={id} onRelink={libraryActions.relink} />;
}

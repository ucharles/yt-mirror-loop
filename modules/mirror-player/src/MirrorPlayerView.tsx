import { requireNativeView } from 'expo';
import * as React from 'react';

import type { MirrorPlayerViewProps } from './MirrorPlayer.types';

const NativeView: React.ComponentType<MirrorPlayerViewProps> = requireNativeView('MirrorPlayer');

export default function MirrorPlayerView(props: MirrorPlayerViewProps) {
  return <NativeView {...props} />;
}

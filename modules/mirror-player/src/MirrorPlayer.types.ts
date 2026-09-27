import type { StyleProp, ViewStyle } from 'react-native';

export type MirrorTransitionPayload = {
  mirrored: boolean;
  expectedAt: number | null;
  actualAt: number;
  errorMs: number | null;
};

export type ProbePayload = {
  playable: boolean;
  durationMs: number;
  fileSize: number;
  width?: number;
  height?: number;
  fps?: number;
};

export type StatusPayload = {
  t: number;
  duration: number;
  playing: boolean;
  mirrored: boolean;
  rate: number;
  loopCount: number;
  fps: number;
};

export type MirrorPlayerModuleEvents = {
  onTime: (p: { t: number; duration: number }) => void;
  onState: (p: { state: 'playing' | 'paused' | 'buffering' | 'ended' }) => void;
  onMirror: (p: MirrorTransitionPayload) => void;
  onLoop: (p: { count: number; at: number }) => void;
  onExternalDisplay: (p: { connected: boolean; fake: boolean }) => void;
  onExternalMessage: (p: { data: string }) => void;
  onKey: (p: { key: string; shift: boolean }) => void;
};

export type MirrorPlayerViewProps = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

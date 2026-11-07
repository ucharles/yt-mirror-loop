import { NativeModule, requireNativeModule } from 'expo';

import type { MirrorPlayerModuleEvents, ProbePayload, StatusPayload } from './MirrorPlayer.types';

declare class MirrorPlayerModule extends NativeModule<MirrorPlayerModuleEvents> {
  load(uri: string, fps: number | null): Promise<{ duration: number; fps: number }>;
  unload(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  setRate(rate: number): Promise<void>;
  seekTo(seconds: number): Promise<number>;
  seekBy(delta: number): Promise<number>;
  stepFrames(n: number): Promise<number>;
  setMirrorConfig(baseMirror: boolean, segments: [number, number][]): Promise<void>;
  setLoop(a: number, b: number, enabled: boolean): Promise<void>;
  clearLoop(): Promise<void>;
  getStatus(): Promise<StatusPayload>;
  probe(uri: string): Promise<ProbePayload>;
  setExcludedFromBackup(uri: string, excluded: boolean): boolean;
  isExcludedFromBackup(uri: string): boolean;
  freeDiskSpace(): number;
  isExternalDisplayConnected(): Promise<{ connected: boolean; fake: boolean }>;
  setFakeExternalDisplay(on: boolean): Promise<void>;
  setExternalContent(kind: 'none' | 'local' | 'youtube', html: string | null, baseUrl: string | null, frameScript: string | null): Promise<void>;
  sendExternalCommand(json: string): Promise<void>;
  openYouTubeSettings(): Promise<boolean>;
  enableKeyboardShortcuts(): Promise<void>;
}

export default requireNativeModule<MirrorPlayerModule>('MirrorPlayer');

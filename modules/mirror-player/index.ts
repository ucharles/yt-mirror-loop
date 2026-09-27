// Re-export the native module. On web, it will be resolved to MirrorPlayerModule.web.ts
// and on native platforms to MirrorPlayerModule.ts
export { default } from './src/MirrorPlayerModule';
export { default as MirrorPlayerView } from './src/MirrorPlayerView';
export * from './src/MirrorPlayer.types';

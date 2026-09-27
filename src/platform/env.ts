/** True in E2E builds (EXPO_PUBLIC_E2E=1). Debug-only hooks are compiled in only then. */
export const IS_E2E = process.env.EXPO_PUBLIC_E2E === '1' || __DEV__;

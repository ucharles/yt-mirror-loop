export type KeyAction =
  | { type: 'togglePlay' }
  | { type: 'seekBy'; delta: number }
  | { type: 'step'; frames: number }
  | { type: 'markA' }
  | { type: 'markB' }
  | { type: 'toggleBaseMirror' };

/** Hardware keyboard shortcuts (PRD §3.13). `key` follows UIKey/KeyboardEvent naming. */
export function mapKey(key: string, shift = false): KeyAction | null {
  switch (key) {
    case ' ':
    case 'Space':
      return { type: 'togglePlay' };
    case 'ArrowLeft':
      return { type: 'seekBy', delta: shift ? -0.1 : -1 };
    case 'ArrowRight':
      return { type: 'seekBy', delta: shift ? 0.1 : 1 };
    case ',':
      return { type: 'step', frames: -1 };
    case '.':
      return { type: 'step', frames: 1 };
    case '[':
      return { type: 'markA' };
    case ']':
      return { type: 'markB' };
    case 'm':
    case 'M':
      return { type: 'toggleBaseMirror' };
    default:
      return null;
  }
}

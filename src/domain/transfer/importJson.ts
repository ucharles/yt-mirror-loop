import { ExportFile, ExportFileSchema } from '../schema';

export type ParseImportResult = { ok: true; file: ExportFile } | { ok: false; message: string };

export function parseImport(text: string): ParseImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSON 파일을 읽을 수 없습니다.' };
  }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== 'yt-mirror-loop') {
    return { ok: false, message: 'yt-mirror-loop 내보내기 파일이 아닙니다.' };
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version === 'number' && version > 1) {
    return { ok: false, message: '더 새로운 버전의 앱에서 내보낸 파일입니다.' };
  }
  const parsed = ExportFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `파일 형식이 올바르지 않습니다: ${issue.path.join('.')} ${issue.message}` };
  }
  return { ok: true, file: parsed.data };
}

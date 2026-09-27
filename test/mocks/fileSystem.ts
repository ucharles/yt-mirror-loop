/* In-memory expo-file-system (File / Directory / Paths) for Jest. */
const fsState = { files: new Map<string, Uint8Array>(), dirs: new Set<string>(['file:///doc', 'file:///cache']) };
export const __fs = fsState;

const join = (...parts: (string | { uri: string })[]) => {
  const raw = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  const body = raw.replace(/^file:\/\/\//, '');
  return 'file:///' + body.replace(/\/+/g, '/').replace(/\/$/, '');
};

export enum FileMode {
  ReadOnly = 'r',
  WriteOnly = 'w',
}

export class File {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(...parts);
  }
  get name() {
    return this.uri.split('/').pop()!;
  }
  get exists() {
    return fsState.files.has(this.uri);
  }
  get size() {
    return fsState.files.get(this.uri)?.length ?? 0;
  }
  create() {
    fsState.files.set(this.uri, new Uint8Array());
  }
  delete() {
    fsState.files.delete(this.uri);
  }
  write(content: string) {
    fsState.files.set(this.uri, new TextEncoder().encode(content));
  }
  async text() {
    return new TextDecoder().decode(fsState.files.get(this.uri));
  }
  move(dest: File) {
    fsState.files.set(dest.uri, fsState.files.get(this.uri) ?? new Uint8Array());
    fsState.files.delete(this.uri);
    this.uri = dest.uri;
  }
  open() {
    let offset = 0;
    const self = this;
    return {
      readBytes(n: number) {
        const all = fsState.files.get(self.uri) ?? new Uint8Array();
        const out = all.slice(offset, offset + n);
        offset += out.length;
        return out;
      },
      writeBytes(bytes: Uint8Array) {
        const prev = fsState.files.get(self.uri) ?? new Uint8Array();
        const next = new Uint8Array(prev.length + bytes.length);
        next.set(prev);
        next.set(bytes, prev.length);
        fsState.files.set(self.uri, next);
      },
      close() {},
    };
  }
}

export class Directory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(...parts);
  }
  get exists() {
    return fsState.dirs.has(this.uri) || [...fsState.files.keys()].some((k) => k.startsWith(this.uri + '/'));
  }
  create() {
    fsState.dirs.add(this.uri);
  }
  delete() {
    fsState.dirs.delete(this.uri);
    for (const k of [...fsState.files.keys()]) if (k.startsWith(this.uri + '/')) fsState.files.delete(k);
  }
  list() {
    return [...fsState.files.keys()].filter((k) => k.startsWith(this.uri + '/') && !k.slice(this.uri.length + 1).includes('/')).map((k) => new File(k));
  }
}

export const Paths = {
  document: new Directory('file:///doc'),
  cache: new Directory('file:///cache'),
  availableDiskSpace: 10e9,
};

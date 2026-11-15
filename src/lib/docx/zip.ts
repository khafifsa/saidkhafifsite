/**
 * Minimal ZIP reader (enough for .docx files). Works in Node and in the browser:
 * pass a raw-deflate implementation (node:zlib or DecompressionStream).
 */
export type Inflate = (data: Uint8Array) => Promise<Uint8Array> | Uint8Array;

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

export class ZipReader {
  private entries = new Map<string, Entry>();
  private view: DataView;

  constructor(private bytes: Uint8Array, private inflate: Inflate) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.readDirectory();
  }

  private readDirectory(): void {
    const { view, bytes } = this;
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error('الملف ليس بصيغة Word حديثة (docx).');
    const total = view.getUint16(end + 10, true);
    let p = view.getUint32(end + 16, true);
    const utf8 = new TextDecoder('utf-8');
    for (let i = 0; i < total; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const method = view.getUint16(p + 10, true);
      const compressedSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const offset = view.getUint32(p + 42, true);
      const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      this.entries.set(name.toLowerCase(), { name, method, compressedSize, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  has(name: string): boolean {
    return this.entries.has(name.toLowerCase());
  }

  async read(name: string): Promise<Uint8Array | null> {
    const entry = this.entries.get(name.replace(/^\/+/, '').toLowerCase());
    if (!entry) return null;
    const { view } = this;
    const p = entry.offset;
    if (view.getUint32(p, true) !== 0x04034b50) return null;
    const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
    const data = this.bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data.slice();
    if (entry.method === 8) return await this.inflate(data);
    throw new Error(`Unsupported ZIP compression method ${entry.method}`);
  }

  async text(name: string): Promise<string | null> {
    const data = await this.read(name);
    return data ? new TextDecoder('utf-8').decode(data) : null;
  }
}

/** Browser implementation of raw inflate. */
export async function inflateRawWeb(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

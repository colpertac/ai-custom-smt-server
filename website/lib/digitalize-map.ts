/** Raw SQLite map blobs for CharacterProgress DigitalizeLevels / DigitalizePoints. */

export function decodeU8S8Map(blob: Uint8Array | Buffer | null | undefined): Map<number, number> {
  const out = new Map<number, number>()
  if (!blob || blob.length < 4) return out
  const buf = Buffer.from(blob)
  const count = buf.readUInt32LE(0)
  let offset = 4
  for (let i = 0; i < count; i++) {
    if (offset + 2 > buf.length) break
    const key = buf.readUInt8(offset)
    const value = buf.readInt8(offset + 1)
    out.set(key, value)
    offset += 2
  }
  return out
}

export function encodeU8S8Map(map: ReadonlyMap<number, number>): Buffer {
  const entries = [...map.entries()].sort((a, b) => a[0] - b[0])
  const buf = Buffer.alloc(4 + entries.length * 2)
  buf.writeUInt32LE(entries.length, 0)
  let offset = 4
  for (const [key, value] of entries) {
    buf.writeUInt8(key & 0xff, offset)
    buf.writeInt8(Math.max(-128, Math.min(127, value | 0)), offset + 1)
    offset += 2
  }
  return buf
}

export function decodeU8S32Map(
  blob: Uint8Array | Buffer | null | undefined
): Map<number, number> {
  const out = new Map<number, number>()
  if (!blob || blob.length < 4) return out
  const buf = Buffer.from(blob)
  const count = buf.readUInt32LE(0)
  let offset = 4
  for (let i = 0; i < count; i++) {
    if (offset + 5 > buf.length) break
    const key = buf.readUInt8(offset)
    const value = buf.readInt32LE(offset + 1)
    out.set(key, value)
    offset += 5
  }
  return out
}

export function encodeU8S32Map(map: ReadonlyMap<number, number>): Buffer {
  const entries = [...map.entries()].sort((a, b) => a[0] - b[0])
  const buf = Buffer.alloc(4 + entries.length * 5)
  buf.writeUInt32LE(entries.length, 0)
  let offset = 4
  for (const [key, value] of entries) {
    buf.writeUInt8(key & 0xff, offset)
    buf.writeInt32LE(value | 0, offset + 1)
    offset += 5
  }
  return buf
}

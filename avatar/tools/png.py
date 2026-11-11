#!/usr/bin/env python3
"""Minimal PNG encoder/decoder (stdlib only) for 8-bit RGBA/RGB images."""
import struct, zlib

SIG = b'\x89PNG\r\n\x1a\n'


def _chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)


def encode(w, h, pixels, channels=4, level=6):
    """pixels: w*h*channels bytes, top row first. Filter 0 on every row (zlib does the work)."""
    stride = w * channels
    raw = b''.join(b'\x00' + bytes(pixels[y * stride:(y + 1) * stride]) for y in range(h))
    color_type = {4: 6, 3: 2}[channels]
    return (SIG + _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0))
            + _chunk(b'IDAT', zlib.compress(raw, level)) + _chunk(b'IEND', b''))


def decode(data):
    """8-bit non-interlaced RGB/RGBA PNG → (w, h, channels, pixels). Enough for our own output."""
    assert data[:8] == SIG, 'not a PNG'
    p, idat = 8, b''
    while p < len(data):
        n, tag = struct.unpack_from('>I4s', data, p)
        body = data[p + 8:p + 8 + n]
        if tag == b'IHDR':
            w, h, depth, ct, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and ct in (2, 6) and not interlace, 'unsupported PNG'
        elif tag == b'IDAT':
            idat += body
        p += 12 + n
    ch = 4 if ct == 6 else 3
    raw, stride = zlib.decompress(idat), w * ch
    out, prev = bytearray(), bytearray(stride)
    for y in range(h):
        f, row = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in (range(stride) if f else ()):
            a = row[i - ch] if i >= ch else 0
            b = prev[i]
            c = prev[i - ch] if i >= ch else 0
            if f == 1:
                row[i] = (row[i] + a) & 255
            elif f == 2:
                row[i] = (row[i] + b) & 255
            elif f == 3:
                row[i] = (row[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                row[i] = (row[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += row
        prev = row
    return w, h, ch, out

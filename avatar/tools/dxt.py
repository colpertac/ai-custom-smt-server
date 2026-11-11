#!/usr/bin/env python3
"""Texture decoding (stdlib only): DXT1/3/5 blocks, NiPixelData and external .dds files → RGBA8.

NiPixelData Pixel Format (nif.xml PixelFormat): 0 RGB, 1 RGBA, 4 DXT1, 5 DXT3, 6 DXT5. The avatar
NIFs use DXT1 6030, DXT3 142, DXT5 78 and RGBA 6 (8 bits per channel); 5 weapon textures are
external .dds files in Avatar/L and Avatar/R.
"""
import struct

DXT_FOURCC = {b'DXT1': 4, b'DXT3': 5, b'DXT5': 6}


def dxt_decode(fmt, w, h, data):
    """Decode a DXT1 (fmt 4), DXT3 (5) or DXT5 (6) image to RGBA8 rows, top row first."""
    out = bytearray(w * h * 4)
    bw, bh = max(1, (w + 3) // 4), max(1, (h + 3) // 4)
    bsz = 8 if fmt == 4 else 16
    p = 0
    for by in range(bh):
        for bx in range(bw):
            blk = data[p:p + bsz]; p += bsz
            alpha = [255] * 16
            if fmt == 5:  # DXT3 explicit alpha
                a = int.from_bytes(blk[:8], 'little')
                alpha = [((a >> (4 * i)) & 15) * 17 for i in range(16)]
                blk = blk[8:]
            elif fmt == 6:  # DXT5 interpolated alpha
                a0, a1 = blk[0], blk[1]
                bits = int.from_bytes(blk[2:8], 'little')
                if a0 > a1:
                    pal = [a0, a1] + [((7 - i) * a0 + i * a1) // 7 for i in range(1, 7)]
                else:
                    pal = [a0, a1] + [((5 - i) * a0 + i * a1) // 5 for i in range(1, 5)] + [0, 255]
                alpha = [pal[(bits >> (3 * i)) & 7] for i in range(16)]
                blk = blk[8:]
            c0, c1, idx = struct.unpack('<HHI', blk[:8])
            def rgb(c):
                return ((c >> 11) * 255 // 31, ((c >> 5) & 63) * 255 // 63, (c & 31) * 255 // 31)
            r0, r1 = rgb(c0), rgb(c1)
            if c0 > c1 or fmt != 4:
                pal = [r0 + (255,), r1 + (255,), tuple((2 * a + b) // 3 for a, b in zip(r0, r1)) + (255,), tuple((a + 2 * b) // 3 for a, b in zip(r0, r1)) + (255,)]
            else:
                pal = [r0 + (255,), r1 + (255,), tuple((a + b) // 2 for a, b in zip(r0, r1)) + (255,), (0, 0, 0, 0)]
            for i in range(16):
                x, y = bx * 4 + (i & 3), by * 4 + (i >> 2)
                if x < w and y < h:
                    c = pal[(idx >> (2 * i)) & 3]
                    o = (y * w + x) * 4
                    out[o:o + 4] = bytes((c[0], c[1], c[2], alpha[i] if fmt != 4 else c[3]))
    return out


def _channels_to_rgba(w, h, data, order):
    """Uncompressed 8-bit-per-channel pixels; order = channel type per byte (0 R, 1 G, 2 B, 3 A)."""
    n = len(order)
    out = bytearray(b'\xff' * (w * h * 4))
    for k, ch in enumerate(order):
        if ch <= 3:
            out[ch::4] = data[k:k + w * h * n:n]
    return out


def decode_pixel_data(pd):
    """Top mip of a NiPixelData block → (w, h, RGBA bytes). Raises ValueError on unknown formats."""
    w, h, off = pd['Mipmaps'][0]
    fmt = pd['Pixel Format']
    raw = pd['Pixel Data']
    if fmt in (4, 5, 6):
        return w, h, dxt_decode(fmt, w, h, raw[off:])
    if fmt in (0, 1):
        chans = [c for c in pd['Channels'] if c[2] > 0]
        if any(c[2] != 8 for c in chans) or pd['Bits Per Pixel'] != 8 * len(chans):
            raise ValueError('pixel format %d with channels %s' % (fmt, pd['Channels']))
        return w, h, _channels_to_rgba(w, h, raw[off:], [c[0] for c in chans])
    raise ValueError('unsupported pixel format %d' % fmt)


def decode_dds(data):
    """Top mip of a .dds file (DXT1/3/5 or uncompressed 32/24-bit with masks) → (w, h, RGBA)."""
    if data[:4] != b'DDS ':
        raise ValueError('not a DDS file')
    h, w = struct.unpack_from('<II', data, 12)
    pf_flags, fourcc, bits = struct.unpack_from('<I4sI', data, 80)
    body = data[128:]
    if pf_flags & 4:  # DDPF_FOURCC
        if fourcc not in DXT_FOURCC:
            raise ValueError('DDS fourcc %r' % fourcc)
        return w, h, dxt_decode(DXT_FOURCC[fourcc], w, h, body)
    masks = struct.unpack_from('<4I', data, 92)
    if not pf_flags & 1:  # no DDPF_ALPHAPIXELS
        masks = masks[:3] + (0,)
    if bits not in (24, 32) or any(m and m not in (0xff, 0xff00, 0xff0000, 0xff000000) for m in masks):
        raise ValueError('DDS %d-bit masks %s' % (bits, [hex(m) for m in masks]))
    n = bits // 8
    order = [9] * n
    for ch, m in enumerate(masks):
        if m:
            order[(m.bit_length() - 1) // 8] = ch
    return w, h, _channels_to_rgba(w, h, body, order)

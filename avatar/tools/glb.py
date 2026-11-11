#!/usr/bin/env python3
"""Minimal glTF 2.0 binary (GLB) writer and reader (stdlib only).

Writer: build the JSON with plain dicts, push binary data through add_view/add_accessor, then
to_bytes(). Reader: read_glb(path) → (json, bin); accessor(json, bin, i) → list of tuples/scalars.
"""
import json, math, struct

FLOAT, UBYTE, USHORT, UINT = 5126, 5121, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
FMT = {FLOAT: 'f', UBYTE: 'B', USHORT: 'H', UINT: 'I'}


class Builder:
    def __init__(self, generator='smt-imagine avatar/tools/convert.py'):
        self.gltf = {'asset': {'version': '2.0', 'generator': generator}, 'scene': 0,
                     'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [],
                     'textures': [], 'images': [], 'samplers': [], 'skins': [],
                     'accessors': [], 'bufferViews': []}
        self.bin = bytearray()

    def add(self, kind, obj):
        """Append obj to the top-level array `kind` and return its index."""
        self.gltf[kind].append(obj)
        return len(self.gltf[kind]) - 1

    def add_view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            view['target'] = target
        self.bin += data
        return self.add('bufferViews', view)

    def add_accessor(self, values, ctype, atype, target=None, minmax=False, normalized=False):
        """values: list of scalars (SCALAR) or equal-length tuples. Packs little-endian."""
        n = NCOMP[atype]
        flat = values if n == 1 else [x for v in values for x in v]
        data = struct.pack('<%d%s' % (len(flat), FMT[ctype]), *flat)
        acc = {'bufferView': self.add_view(data, target), 'componentType': ctype,
               'count': len(values), 'type': atype}
        if normalized:
            acc['normalized'] = True
        if minmax and values:
            cols = [values] if n == 1 else list(zip(*values))
            acc['min'] = [min(c) for c in cols]
            acc['max'] = [max(c) for c in cols]
            if ctype == FLOAT:  # min/max must hold the float32-rounded values
                f32 = lambda x: struct.unpack('<f', struct.pack('<f', x))[0]
                acc['min'] = [f32(x) for x in acc['min']]
                acc['max'] = [f32(x) for x in acc['max']]
        return self.add('accessors', acc)

    def add_image_png(self, png_bytes, name=None):
        img = {'bufferView': self.add_view(png_bytes), 'mimeType': 'image/png'}
        if name:
            img['name'] = name
        return self.add('images', img)

    def to_bytes(self):
        g = {k: v for k, v in self.gltf.items() if v != []}
        if self.bin:
            g['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(g, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        js += b' ' * (-len(js) % 4)
        binp = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        total = 12 + 8 + len(js) + (8 + len(binp) if binp else 0)
        out = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(js), b'JSON') + js
        if binp:
            out += struct.pack('<I4s', len(binp), b'BIN\0') + binp
        return out


def read_glb(path, json_only=False):
    """Return (gltf dict, BIN chunk bytes or None)."""
    with open(path, 'rb') as f:
        head = f.read(20)
        magic, ver, total, jlen, jtype = struct.unpack('<4sIII4s', head)
        if magic != b'glTF' or ver != 2 or jtype != b'JSON':
            raise ValueError('%s: not a GLB 2.0 file' % path)
        g = json.loads(f.read(jlen))
        if json_only:
            return g, None
        rest = f.read()
    blen, btype = struct.unpack_from('<I4s', rest, 0) if len(rest) >= 8 else (0, None)
    return g, (rest[8:8 + blen] if btype == b'BIN\0' else None)


def accessor(g, binary, i):
    """Decode accessor i to a list (scalars) or list of tuples (vectors/matrices)."""
    a = g['accessors'][i]
    v = g['bufferViews'][a['bufferView']]
    n = NCOMP[a['type']]
    fmt = FMT[a['componentType']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    flat = struct.unpack_from('<%d%s' % (a['count'] * n, fmt), binary, off)
    if a.get('normalized'):
        scale = float((1 << (8 * struct.calcsize(fmt))) - 1)
        flat = [x / scale for x in flat]
    return list(flat) if n == 1 else [tuple(flat[k:k + n]) for k in range(0, len(flat), n)]


def view_bytes(g, binary, view_index):
    v = g['bufferViews'][view_index]
    off = v.get('byteOffset', 0)
    return binary[off:off + v['byteLength']]


# --- small transform helpers shared by the converter and the checker -------------------------

def mat3_to_quat(m):
    """Row-major 3x3 rotation (p' = M p) → glTF quaternion [x, y, z, w], normalised."""
    m00, m01, m02, m10, m11, m12, m20, m21, m22 = m
    tr = m00 + m11 + m22
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w, x, y, z = 0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s
    elif m00 > m11 and m00 > m22:
        s = math.sqrt(1.0 + m00 - m11 - m22) * 2
        w, x, y, z = (m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s
    elif m11 > m22:
        s = math.sqrt(1.0 + m11 - m00 - m22) * 2
        w, x, y, z = (m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s
    else:
        s = math.sqrt(1.0 + m22 - m00 - m11) * 2
        w, x, y, z = (m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s
    L = math.sqrt(w * w + x * x + y * y + z * z) or 1.0
    q = [x / L, y / L, z / L, w / L]
    return [-c for c in q] if q[3] < 0 else q


def quat_to_mat3(q):
    """glTF quaternion [x, y, z, w] → row-major 3x3 (p' = M p)."""
    x, y, z, w = q
    return (1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
            2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
            2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y))


def trs_to_mat4(r, t, s):
    """Row-major 3x3 r, translation t, uniform scale s → glTF column-major 4x4 list."""
    return [s * r[0], s * r[3], s * r[6], 0.0,
            s * r[1], s * r[4], s * r[7], 0.0,
            s * r[2], s * r[5], s * r[8], 0.0,
            t[0], t[1], t[2], 1.0]


def node_trs(r, t, s):
    """glTF node fields for a Gamebryo (rotation, translation, uniform scale), omitting identities."""
    out = {}
    if any(abs(x) > 0 for x in t):
        out['translation'] = [float(x) for x in t]
    q = mat3_to_quat(r)
    if abs(q[3] - 1.0) > 1e-9:
        out['rotation'] = q
    if s != 1.0:
        out['scale'] = [float(s)] * 3
    return out

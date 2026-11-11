#!/usr/bin/env python3
"""Proof-of-concept software render (stdlib only): assemble an avatar from part NIFs on a
body-type skeleton, pose it with frame 0 of a KF, skin on CPU, decode embedded DXT textures,
rasterize front + side views to PNG.
Usage: render.py out.png skeleton.nif anim.kf|- part.nif[@AttachNode] ...
"""
import sys, os, math, struct, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifparse import NifFile
from skel import compose, mat_vec, world_transforms
from pose import sample_first, posed_world


def dxt_decode(fmt, w, h, data):
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


def texture_of(n, geom):
    B = n.blocks
    for pr in geom.get('Properties', []):
        if B[pr][0] == 'NiTexturingProperty':
            tp = B[pr][1]
            if tp.get('Has Base Texture'):
                st = B[tp['Base Texture']['Source']][1]
                if st.get('Pixel Data', -1) >= 0:
                    pd = B[st['Pixel Data']][1]
                    w, h, off = pd['Mipmaps'][0]
                    if pd['Pixel Format'] in (4, 5, 6):
                        return (w, h, dxt_decode(pd['Pixel Format'], w, h, pd['Pixel Data'][off:]))
    return None


def tris_of(d, t):
    if t == 'NiTriShapeData':
        return [tuple(x) for x in d['Triangles']]
    out = []
    for s in d['Points']:
        for i in range(len(s) - 2):
            a, b, c = s[i], s[i + 1], s[i + 2]
            if a == b or b == c or a == c:
                continue
            out.append((a, b, c) if i % 2 == 0 else (a, c, b))
    return out


def collect(part_path, attach, W):
    n = NifFile(part_path)
    B = n.blocks
    _, widx = world_transforms(n)
    meshes = []
    for i, (t, b) in enumerate(B):
        if t not in ('NiTriShape', 'NiTriStrips'):
            continue
        if b['Flags'] & 1:  # hidden (bone helper meshes)
            continue
        md = b.get('Material Data') or {}
        if not md.get('Has Shader'):
            continue
        dt, d = B[b['Data']]
        V = d['Vertices']
        N = d['Normals'] if d.get('Has Normals') else [(0, 0, 1)] * len(V)
        UV = d['UV Sets'][0] if d.get('UV Sets') else [(0, 0)] * len(V)
        if b.get('Skin Instance', -1) >= 0:
            si = B[b['Skin Instance']][1]
            sd = B[si['Data']][1]
            gst = sd['Skin Transform']
            acc = [[0.0] * 6 for _ in V]
            for bi, bd in zip(si['Bones'], sd['Bone List']):
                nm = B[bi][1]['Name']
                Wb = W.get(nm) or widx[bi]
                st = bd['Skin Transform']
                # NOTE: world = BoneWorld * SkinToBone * v.  The overall NiSkinData 'Skin Transform' (gst) must NOT be
                # applied again: it equals the shape's bind world transform and is already folded into SkinToBone
                # (verified on mirrored GloveR meshes where gst = diag(1,-1,-1)).
                M = compose(Wb, (tuple(st[0:9]), tuple(st[9:12]), st[12]))
                for vi, wt in bd['Vertex Weights']:
                    p = mat_vec(M[0], V[vi]); q = mat_vec(M[0], N[vi])
                    a = acc[vi]
                    for k in range(3):
                        a[k] += wt * (M[1][k] + M[2] * p[k]); a[3 + k] += wt * q[k]
            PV = [tuple(a[:3]) for a in acc]; PN = [tuple(a[3:]) for a in acc]
        else:
            # rigid: node world within its own file, then re-parented under attach node of skeleton
            base = W.get(attach) if attach else ((1, 0, 0, 0, 1, 0, 0, 0, 1), (0, 0, 0), 1.0)
            M = compose(base, widx[i])
            PV = [tuple(M[1][k] + M[2] * x for k, x in enumerate(mat_vec(M[0], v))) for v in V]
            PN = [mat_vec(M[0], v) for v in N]
        meshes.append((os.path.basename(part_path) + ':' + b['Name'], PV, PN, UV, tris_of(d, dt), texture_of(n, b)))
    return meshes


def raster(meshes, view, Wd=360, Ht=640):
    allv = [v for m in meshes for v in m[1]]
    proj = (lambda v: (v[0], v[2], -v[1])) if view == 'front' else (lambda v: (-v[1], v[2], -v[0]))
    P = [proj(v) for v in allv]
    minx, maxx = min(p[0] for p in P), max(p[0] for p in P)
    minz, maxz = min(p[1] for p in P), max(p[1] for p in P)
    s = 0.92 * min(Wd / (maxx - minx), Ht / (maxz - minz))
    cx, cz = (minx + maxx) / 2, (minz + maxz) / 2
    img = bytearray(b'\x30\x30\x38' * (Wd * Ht)); zb = [-1e30] * (Wd * Ht)
    L = (0.3, -0.8, 0.5); ln = math.sqrt(sum(x * x for x in L)); L = tuple(x / ln for x in L)
    for name, PV, PN, UV, T, tex in meshes:
        S = [(Wd / 2 + (p[0] - cx) * s, Ht / 2 - (p[1] - cz) * s, p[2]) for p in map(proj, PV)]
        for a, b, c in T:
            if max(a, b, c) >= len(S):
                continue
            (x0, y0, z0), (x1, y1, z1), (x2, y2, z2) = S[a], S[b], S[c]
            area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
            if abs(area) < 1e-9:
                continue
            for xa in ():
                pass
            xmin, xmax = max(0, int(min(x0, x1, x2))), min(Wd - 1, int(max(x0, x1, x2)) + 1)
            ymin, ymax = max(0, int(min(y0, y1, y2))), min(Ht - 1, int(max(y0, y1, y2)) + 1)
            for y in range(ymin, ymax + 1):
                for x in range(xmin, xmax + 1):
                    px, py = x + .5, y + .5
                    w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area
                    w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area
                    w2 = 1 - w0 - w1
                    if w0 < 0 or w1 < 0 or w2 < 0:
                        continue
                    z = w0 * z0 + w1 * z1 + w2 * z2
                    o = y * Wd + x
                    if z <= zb[o]:
                        continue
                    col = (200, 200, 200)
                    if tex:
                        u = w0 * UV[a][0] + w1 * UV[b][0] + w2 * UV[c][0]
                        v = w0 * UV[a][1] + w1 * UV[b][1] + w2 * UV[c][1]
                        tw, th, tp = tex
                        tx, ty = int((u % 1) * tw) % tw, int((v % 1) * th) % th
                        to = (ty * tw + tx) * 4
                        if tp[to + 3] < 128:
                            continue
                        col = tuple(tp[to:to + 3])
                    nrm = [w0 * PN[a][k] + w1 * PN[b][k] + w2 * PN[c][k] for k in range(3)]
                    nl = math.sqrt(sum(q * q for q in nrm)) or 1
                    sh = 0.45 + 0.55 * abs(sum(nrm[k] / nl * L[k] for k in range(3)))
                    zb[o] = z
                    img[o * 3:o * 3 + 3] = bytes(min(255, int(ch * sh)) for ch in col)
    return Wd, Ht, img


def write_png(path, w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    out, skel_path, kf_path = sys.argv[1:4]
    skel = NifFile(skel_path)
    pose = sample_first(NifFile(kf_path))[0] if kf_path != '-' else {}
    W = posed_world(skel, pose)
    meshes = []
    for arg in sys.argv[4:]:
        path, _, attach = arg.partition('@')
        ms = collect(path, attach or None, W)
        print('%-40s %d meshes, %d verts, %d tris, tex=%s' % (os.path.basename(path), len(ms), sum(len(m[1]) for m in ms), sum(len(m[4]) for m in ms), [bool(m[5]) for m in ms]))
        meshes += ms
    w1, h1, a = raster(meshes, 'front')
    w2, h2, b = raster(meshes, 'side')
    comb = bytearray()
    for y in range(h1):
        comb += a[y * w1 * 3:(y + 1) * w1 * 3] + b[y * w2 * 3:(y + 1) * w2 * 3]
    write_png(out, w1 + w2, h1, comb)
    print('wrote', out)

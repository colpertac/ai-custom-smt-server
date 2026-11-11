#!/usr/bin/env python3
"""Sample a KF sequence at t=start, apply to a skeleton NIF, then measure how far a
skinned part's bind pose is from that pose (0 => sampled pose == bind pose).
Usage: pose.py skeleton.nif anim.kf part.nif [part.nif ...]"""
import sys, os, math, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifparse import NifFile
from skel import compose, mat_vec, dist, rotdiff

FLT_MAX = 3.0e38


def quat_to_mat(w, x, y, z):  # row-major, column-vector convention (p' = M p)
    return (1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
            2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
            2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y))


def euler_to_mat(rx, ry, rz):  # Gamebryo XYZ keys: R = Rz*Ry*Rx? try X then Y then Z
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = (1, 0, 0, 0, cx, -sx, 0, sx, cx)
    Ry = (cy, 0, sy, 0, 1, 0, -sy, 0, cy)
    Rz = (cz, -sz, 0, sz, cz, 0, 0, 0, 1)
    from skel import mat_mul
    return mat_mul(Rz, mat_mul(Ry, Rx))


def transpose(m):
    return tuple(m[c * 3 + r] for r in range(3) for c in range(3))


QUAT_TRANSPOSE = os.environ.get('QT', '0') == '1'


def qm(w, x, y, z):
    m = quat_to_mat(w, x, y, z)
    return transpose(m) if QUAT_TRANSPOSE else m


def sample_first(kf):
    """returns {node_name: (rot|None, trans|None, scale|None)} at sequence start"""
    B = kf.blocks
    seq = [b for t, b in B if t == 'NiControllerSequence'][0]
    out = {}
    kinds = collections.Counter()
    for cb in seq['Controlled Blocks']:
        ii = cb['Interpolator']
        if ii < 0:
            continue
        t, ib = B[ii]
        name = cb['Node Name']
        R = T = S = None
        if t == 'NiTransformInterpolator':
            tr = ib['Transform']  # (tx,ty,tz,qw,qx,qy,qz,s) flat tuple
            tx, ty, tz, qw, qx, qy, qz, sc = tr[:8]
            if abs(tx) < FLT_MAX: T = (tx, ty, tz)
            if abs(qw) < FLT_MAX: R = qm(qw, qx, qy, qz)
            if abs(sc) < FLT_MAX: S = sc
            if ib['Data'] >= 0:
                d = B[ib['Data']][1]
                kinds['keyed rot type %s' % d.get('Rotation Type')] += 1
                if d.get('Num Rotation Keys'):
                    if d['Rotation Type'] == 4:
                        ang = [g['Keys'][0]['Value'] if g['Num Keys'] else 0.0 for g in d['XYZ Rotations']]
                        R = euler_to_mat(*ang)
                    else:
                        q = d['Quaternion Keys'][0]['Value']
                        R = qm(*q)
                if d['Translations']['Num Keys']:
                    T = tuple(d['Translations']['Keys'][0]['Value'])
                if d['Scales']['Num Keys']:
                    S = d['Scales']['Keys'][0]['Value']
            else:
                kinds['static transform'] += 1
        elif t == 'NiBSplineCompTransformInterpolator':
            kinds['bspline-compressed'] += 1
            tr = ib['Transform']
            tx, ty, tz, qw, qx, qy, qz, sc = tr[:8]
            sd = B[ib['Spline Data']][1]
            cp = sd['Compact Control Points']

            def ctrl(h, n, off, half):
                return [off + half * (cp[h + k] / 32767.0) for k in range(n)]
            if ib['Translation Handle'] != 0xFFFF:
                T = tuple(ctrl(ib['Translation Handle'], 3, ib['Translation Offset'], ib['Translation Half Range']))
            elif abs(tx) < FLT_MAX:
                T = (tx, ty, tz)
            if ib['Rotation Handle'] != 0xFFFF:
                q = ctrl(ib['Rotation Handle'], 4, ib['Rotation Offset'], ib['Rotation Half Range'])
                L = math.sqrt(sum(v * v for v in q)) or 1
                R = qm(*[v / L for v in q])
            elif abs(qw) < FLT_MAX:
                R = qm(qw, qx, qy, qz)
            if ib['Scale Handle'] != 0xFFFF:
                S = ctrl(ib['Scale Handle'], 1, ib['Scale Offset'], ib['Scale Half Range'])[0]
            elif abs(sc) < FLT_MAX:
                S = sc
        else:
            kinds[t] += 1
        out[name] = (R, T, S)
    return out, kinds, seq


def posed_world(skel, pose):
    B = skel.blocks
    W = {}
    def walk(i, parent):
        t, b = B[i]
        if b is None or 'Translation' not in b:
            return
        R, T, S = tuple(b['Rotation']), tuple(b['Translation']), b['Scale']
        p = pose.get(b.get('Name'))
        if p:
            R = p[0] if p[0] is not None else R
            T = p[1] if p[1] is not None else T
            S = p[2] if p[2] is not None else S
        w = compose(parent, (R, T, S))
        W.setdefault(b.get('Name'), w)
        for c in b.get('Children', []) or []:
            if c >= 0:
                walk(c, w)
    for r in skel.roots:
        walk(r, ((1, 0, 0, 0, 1, 0, 0, 0, 1), (0, 0, 0), 1.0))
    return W


def bind_error(W, part):
    B = part.blocks
    res = []
    for t, b in B:
        if t in ('NiTriShape', 'NiTriStrips') and b.get('Skin Instance', -1) >= 0:
            si = B[b['Skin Instance']][1]
            sd = B[si['Data']][1]
            worst = (0, None)
            missing = []
            for bi, bd in zip(si['Bones'], sd['Bone List']):
                nm = B[bi][1]['Name']
                if nm not in W:
                    missing.append(nm)
                    continue
                st = bd['Skin Transform']
                m = compose(W[nm], (tuple(st[0:9]), tuple(st[9:12]), st[12]))
                e = dist(m[1], (0, 0, 0))
                if e > worst[0]:
                    worst = (e, nm)
            res.append((b['Name'], len(si['Bones']), worst, missing))
    return res


if __name__ == '__main__':
    skel = NifFile(sys.argv[1])
    kf = NifFile(sys.argv[2])
    pose, kinds, seq = sample_first(kf)
    W0 = posed_world(skel, {})
    W = posed_world(skel, pose)
    print('seq %s: %d channels %s; channel names missing from skeleton: %s' % (
        seq['Name'], len(pose), dict(kinds), [k for k in pose if k not in W0][:10]))
    for p in sys.argv[3:]:
        part = NifFile(p)
        for nm, nb, worst, missing in bind_error(W, part):
            e0 = bind_error(W0, part)
            print('  %-28s bones=%2d  max bind offset in posed skeleton: %.3f (%s)  [unposed skeleton: %.3f]  missing bones: %s' % (
                nm, nb, worst[0], worst[1], max(x[2][0] for x in e0), missing))

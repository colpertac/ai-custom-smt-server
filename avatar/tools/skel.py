#!/usr/bin/env python3
"""Skeleton utilities: world transforms per node name; compare skeletons; check skin bind consistency."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifparse import NifFile


def mat_mul(a, b):  # 3x3 row-major tuples
    return tuple(sum(a[r * 3 + k] * b[k * 3 + c] for k in range(3)) for r in range(3) for c in range(3))


def mat_vec(m, v):
    return tuple(sum(m[r * 3 + k] * v[k] for k in range(3)) for r in range(3))


def transpose(m):
    return tuple(m[c * 3 + r] for r in range(3) for c in range(3))


# Gamebryo stores rotation such that world = parent.R * child.R ; point' = R * p (column vectors) per NifSkope
def compose(parent, local):
    pr, pt, ps = parent
    lr, lt, ls = local
    r = mat_mul(pr, lr)
    t = tuple(pt[i] + ps * x for i, x in enumerate(mat_vec(pr, lt)))
    return (r, t, ps * ls)


TRANSPOSE = os.environ.get('TRANSPOSE', '0') == '1'


def rot(m):
    return transpose(tuple(m)) if TRANSPOSE else tuple(m)


def local_of(b):
    return (rot(b['Rotation']), tuple(b['Translation']), b['Scale'])


def world_transforms(n):
    B = n.blocks
    out = {}
    idx = {}
    def walk(i, parent):
        t, b = B[i]
        if b is None or 'Translation' not in b:
            return
        w = compose(parent, local_of(b))
        nm = b.get('Name')
        out.setdefault(nm, w)
        idx[i] = w
        for c in b.get('Children', []) or []:
            if c >= 0:
                walk(c, w)
    I = ((1, 0, 0, 0, 1, 0, 0, 0, 1), (0, 0, 0), 1.0)
    for r in n.roots:
        walk(r, I)
    return out, idx


def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def rotdiff(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


if __name__ == '__main__':
    ref = NifFile(sys.argv[1])
    rw, _ = world_transforms(ref)
    for other in sys.argv[2:]:
        n = NifFile(other)
        ow, oidx = world_transforms(n)
        common = [k for k in ow if k in rw and k and not k.startswith('Biped Object') and not k.startswith('Bone')]
        worst = sorted(((dist(rw[k][1], ow[k][1]), rotdiff(rw[k][0], ow[k][0]), k) for k in common), reverse=True)
        only = [k for k in ow if k not in rw and k and not k.startswith('Biped Object')]
        print('== %s: %d common nodes, max pos diff %.3f (%s), max rot diff %.4f; nodes not in ref: %s' % (
            os.path.basename(other), len(common), worst[0][0] if worst else 0, worst[0][2] if worst else '',
            max((w[1] for w in worst), default=0), only[:12]))
        for d, r, k in worst[:5]:
            print('     %-28s pos diff %.3f rot diff %.4f' % (k, d, r))
        # skin bind consistency: for each skin instance, bone world (in this file) * skinTransform(bone) should == skin-to-world of the shape
        B = n.blocks
        for i, (t, b) in enumerate(B):
            if t in ('NiTriShape', 'NiTriStrips') and b.get('Skin Instance', -1) >= 0:
                si = B[b['Skin Instance']][1]
                sd = B[si['Data']][1]
                maxerr_self = 0
                maxerr_ref = 0
                for bi, bd in zip(si['Bones'], sd['Bone List']):
                    nm = B[bi][1]['Name']
                    st = bd['Skin Transform']  # rot(9), trans(3), scale
                    # bone-space = skinT * mesh-space  => mesh-space = inv(skinT) * bone-space; bone world W: world = W * inv(skinT)
                    R = rot(st[0:9]); T = st[9:12]; S = st[12]
                    Rinv = transpose(R)
                    Tinv = tuple(-x / S for x in mat_vec(Rinv, T))
                    inv = (Rinv, Tinv, 1.0 / S)
                    for W, which in ((oidx.get(bi), 'self'), (rw.get(nm), 'ref')):
                        if W is None:
                            continue
                        meshw = compose(W, (R, T, S))
                        e = dist(meshw[1], (0, 0, 0)) + 10 * rotdiff(meshw[0], (1, 0, 0, 0, 1, 0, 0, 0, 1))
                        if which == 'self':
                            maxerr_self = max(maxerr_self, e)
                        else:
                            maxerr_ref = max(maxerr_ref, e)
                print('   skinned %-26s bones=%2d  bind->identity err vs own skeleton %.4f, vs ref skeleton %.4f' % (b['Name'], len(si['Bones']), maxerr_self, maxerr_ref))

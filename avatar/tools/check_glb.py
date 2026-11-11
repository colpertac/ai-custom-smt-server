#!/usr/bin/env python3
"""Verify converted GLBs against the PoC skinning in render.py.

For a recipe (resolve.py NAME, or a JSON file printed by `resolve.py NAME --json`), rebuild the
posed avatar from build/assets only — skeleton GLB + pose JSON, skinned parts rebound to skeleton
bones by joint name (world = Σ wᵢ · BoneWorldᵢ · IBMᵢ · v), rigid parts under node "H"+token
(world = HWorld × stem local × …) — and compare every world-space vertex with render.collect()
on the original NIFs. Also compares each mesh's base texture with render.texture_of().

Usage: python3 check_glb.py NAME|recipe.json [...] [--tol 0.01]
"""
import json, os, sqlite3, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import AVATAR_DIR, BUILD_DIR, WORLD_DB
from nifparse import NifFile
from pose import sample_first, posed_world
from render import collect, texture_of
from skel import compose, mat_vec
import glb, png

ASSETS = os.path.join(BUILD_DIR, 'assets')
I3 = (1, 0, 0, 0, 1, 0, 0, 0, 1)


def stem(p):
    return os.path.splitext(os.path.basename(p))[0]


def load_recipes(args):
    """NAME → resolve.resolve() from the world DB; *.json → resolve.py --json output."""
    out = {}
    names = []
    for a in args:
        if a.endswith('.json'):
            out.update(json.load(open(a)))
        else:
            names.append(a)
    if names:
        from resolve import load_character, load_tables, resolve
        db = sqlite3.connect(f'file:{WORLD_DB}?mode=ro', uri=True)
        t = load_tables()
        for n in names:
            ch = load_character(db, n)
            if ch is None:
                raise SystemExit(f'{n}: not found')
            out[n] = resolve(ch, t)
    return out


def node_local(n):
    r = glb.quat_to_mat3(n['rotation']) if 'rotation' in n else I3
    return r, tuple(n.get('translation', (0, 0, 0))), n.get('scale', [1.0])[0]


def skeleton_world(skel_glb, pose_json):
    """Posed world transform per bone name from the converted skeleton and pose."""
    g, _ = glb.read_glb(skel_glb, json_only=True)
    bones = json.load(open(pose_json))['bones']
    W = {}
    def walk(i, parent):
        n = g['nodes'][i]
        r, t, s = node_local(n)
        p = bones.get(n['name'], {})
        r = glb.quat_to_mat3(p['r']) if 'r' in p else r
        t = tuple(p['t']) if 't' in p else t
        s = p.get('s', s)
        W[n['name']] = w = compose(parent, (r, t, s))
        for c in n.get('children', []):
            walk(c, w)
    for r in g['scenes'][0]['nodes']:
        walk(r, (I3, (0, 0, 0), 1.0))
    return W


def apply(m, v):
    r, t, s = m
    p = mat_vec(r, v)
    return tuple(t[k] + s * p[k] for k in range(3))


def affine_of_mat4(c):
    """glTF column-major 4x4 → (3x3 row-major incl. scale, translation)."""
    return (c[0], c[4], c[8], c[1], c[5], c[9], c[2], c[6], c[10]), (c[12], c[13], c[14])


def glb_meshes(path, W):
    """World-space vertices per mesh of a part GLB placed on the posed skeleton."""
    g, b = glb.read_glb(path)
    nodes = g['nodes']
    root = g['scenes'][0]['nodes'][0]
    attach = nodes[root]['extras']['attach']
    out, missing = [], set()

    def skinned(n):
        prim = g['meshes'][n['mesh']]['primitives'][0]
        V = glb.accessor(g, b, prim['attributes']['POSITION'])
        sk = g['skins'][n['skin']]
        J = glb.accessor(g, b, prim['attributes']['JOINTS_0'])
        Wt = glb.accessor(g, b, prim['attributes']['WEIGHTS_0'])
        ibm = glb.accessor(g, b, sk['inverseBindMatrices'])
        mats = []
        for j, node in enumerate(sk['joints']):
            nm = nodes[node]['name']
            if nm not in W:
                missing.add(nm)
                mats.append(None)
                continue
            br, bt, bs = W[nm]
            ir, it = affine_of_mat4(ibm[j])
            # BoneWorld · IBM as (3x3, t): R = bs·br·ir, t = bt + bs·br·it
            r = tuple(bs * x for x in _mm(br, ir))
            t = tuple(bt[k] + bs * mat_vec(br, it)[k] for k in range(3))
            mats.append((r, t, 1.0))
        PV = []
        for v, js, ws in zip(V, J, Wt):
            acc = [0.0, 0.0, 0.0]
            for j, w in zip(js, ws):
                if w and mats[j] is not None:
                    p = apply(mats[j], v)
                    for k in range(3):
                        acc[k] += w * p[k]
            PV.append(tuple(acc))
        return PV

    def walk(i, parent):
        n = nodes[i]
        if n.get('name') in W and i not in (root,) and 'mesh' not in n and attach == 'skinned':
            return  # joint placeholder
        w = parent if attach == 'skinned' else compose(parent, node_local(n))
        if 'mesh' in n:
            mesh = g['meshes'][n['mesh']]
            prim = mesh['primitives'][0]
            if 'skin' in n:
                PV = skinned(n)
            else:
                PV = [apply(w, v) for v in glb.accessor(g, b, prim['attributes']['POSITION'])]
            out.append((mesh['name'], PV, g, b, prim))
        for c in n.get('children', []):
            walk(c, w)
    base = (I3, (0, 0, 0), 1.0) if attach == 'skinned' else W.get(attach)
    if base is None:
        return attach, [], {attach}
    walk(root, base)
    return attach, out, missing


def _mm(a, b):
    return tuple(sum(a[r * 3 + k] * b[k * 3 + c] for k in range(3)) for r in range(3) for c in range(3))


def texture_diff(nif_path, mesh_name, g, b, prim):
    """Max per-channel difference between the GLB base texture and render.texture_of (None if n/a)."""
    n = NifFile(nif_path)
    geom = next((bb for t, bb in n.blocks if t in ('NiTriShape', 'NiTriStrips') and bb.get('Name') == mesh_name), None)
    ref = texture_of(n, geom) if geom else None
    tex = g['materials'][prim['material']]['extras'].get('baseTexture')
    if ref is None or tex is None:
        return None
    img = g['images'][g['textures'][tex]['source']]
    w, h, ch, px = png.decode(glb.view_bytes(g, b, img['bufferView']))
    if (w, h) != ref[:2]:
        return float('inf')
    return max(abs(x - y) for x, y in zip(px, ref[2]))


def check(name, r, tol):
    sk = r['skeleton']
    skel_glb = os.path.join(ASSETS, 'skeletons', stem(sk['nif']) + '.glb')
    pose_json = os.path.join(ASSETS, 'poses', stem(sk['idle']) + '.json')
    W = skeleton_world(skel_glb, pose_json)
    Wref = posed_world(NifFile(os.path.join(AVATAR_DIR, sk['nif'])),
                       sample_first(NifFile(os.path.join(AVATAR_DIR, sk['idle'])))[0])
    worst_all, ok = 0.0, True
    print(f"### {name}: {stem(sk['nif'])} + {stem(sk['idle'])}")
    for folder, p in r['parts'].items():
        if not p['file'] or not p['exists']:
            continue
        nif = os.path.join(AVATAR_DIR, folder, p['file'])
        path = os.path.join(ASSETS, 'parts', folder, stem(p['file']) + '.glb')
        if not os.path.exists(path):
            print(f'  {folder:9s} {p["file"]}: GLB missing')
            ok = False
            continue
        attach, mine, missing = glb_meshes(path, W)
        ref = collect(nif, None if attach == 'skinned' else attach, Wref)
        refs = {}
        for nm, PV, *_ in ref:
            refs.setdefault(nm.split(':', 1)[1], []).append(PV)
        worst, nv, only_glb, texd = 0.0, 0, [], []
        for nm, PV, g, b, prim in mine:
            cand = refs.get(nm)
            if not cand:
                only_glb.append(nm)
                continue
            RV = cand.pop(0)
            if len(RV) != len(PV):
                print(f'  {folder}: {nm}: vertex count {len(PV)} vs {len(RV)}')
                ok = False
                continue
            for a, c in zip(PV, RV):
                worst = max(worst, max(abs(a[k] - c[k]) for k in range(3)))
            nv += len(PV)
            d = texture_diff(nif, nm, g, b, prim)
            if d is not None:
                texd.append(d)
        only_ref = [nm for nm, lst in refs.items() for _ in lst]
        worst_all = max(worst_all, worst)
        ok &= worst < tol and not missing
        print(f'  {folder:9s} {stem(p["file"]):28s} {attach:9s} {len(mine)} meshes {nv:6d} verts  '
              f'max err {worst:.6f}  tex max diff {max(texd) if texd else "-"}'
              + (f'  missing bones {sorted(missing)}' if missing else '')
              + (f'  GLB-only {only_glb}' if only_glb else '')
              + (f'  NIF-only (outside stem/hidden) {only_ref}' if only_ref else ''))
    print(f'  => max position error {worst_all:.6f} ({"PASS" if ok else "FAIL"} at tol {tol})')
    return ok


def main():
    args = sys.argv[1:]
    tol = 0.01
    if '--tol' in args:
        tol = float(args[args.index('--tol') + 1])
        del args[args.index('--tol'):args.index('--tol') + 2]
    if not args:
        raise SystemExit(__doc__)
    ok = True
    for name, r in load_recipes(args).items():
        ok &= check(name, r, tol)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()

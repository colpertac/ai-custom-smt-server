#!/usr/bin/env python3
"""NIF → glTF (GLB) converter for the avatar renderer. Output contract: avatar/docs/FORMAT.md.

    python3 convert.py all [--force] [-j N]   # skeletons, poses, rig, every part, manifest
    python3 convert.py parts FILE.nif ...      # Hair/W_01_Hair_Lg_006.nif or a full path (always rebuilt)
    python3 convert.py skeletons | poses | rig | manifest

Writes build/assets/. Re-runs skip outputs newer than their inputs (and than the converter's own
source); per-file failures go to manifest.json instead of aborting. Rules from ImagineClient.exe
are cited by address; derivations are in AI/avatar-renderer.md.
"""
import json, math, multiprocessing, os, sys, time, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import AVATAR_DIR, BUILD_DIR, HERE, IMAGINE_CLIENT_DIR, TABLES_DIR
from nifparse import NifFile
from pose import sample_first, euler_to_mat
from skel import compose
from render import tris_of
import dxt, glb, png

ASSETS = os.path.join(BUILD_DIR, 'assets')
CACHE = os.path.join(BUILD_DIR, 'cache')
CODE = [os.path.join(HERE, f) for f in ('convert.py', 'glb.py', 'png.py', 'dxt.py', 'nifparse.py', 'pose.py')]
FORMAT_VERSION = 1
UV_CONVENTION = 'none: glTF V = NIF V (D3D and glTF both put UV (0,0) at the top-left texel)'

# CiAvatar slot tokens that skin to the skeleton root (flag 0x80, 0xb19c50); every other token
# attaches rigidly under skeleton node "H" + token (flag 0x100, 0xb19d90 / 0xb19e60).
SKINNED_TOKENS = {'Face', 'Body', 'GloveL', 'GloveR', 'Legs', 'Feet', 'ExtraA', 'NeckM', 'Hair',
                  'HairAcceM', 'ExtraD'}
SKELETON_IDS = (100, 101, 102, 200, 201, 202)
# Idle stays per body-type KF prefix: 510 = character creation (0xaec490); the rest are the
# character-select weapon-class stays (0x466a90 → 0x466bb0).
POSE_CODES = ('510', '053', '073', '113', '153', '231', '271', '291')
POSE_NAMES = {'510': 'Common_SampleStay', '053': 'Boxing_DefaultStay', '073': 'OneSword_DefaultStay',
              '113': 'BluntWeapon_DefaultStay', '153': 'Spear_DefaultStay', '231': 'HandGun_DefaultStay',
              '271': 'ShotGun_DefaultStay', '291': 'Rifle_DefaultStay'}
POSE_PREFIXES = ('M_01', 'M_02', 'M_03', 'W_01', 'W_02', 'W_03')
GEOMETRY = ('NiTriShape', 'NiTriStrips')
IDENTITY = ((1, 0, 0, 0, 1, 0, 0, 0, 1), (0, 0, 0), 1.0)
CLAMP, REPEAT = 33071, 10497
WRAP = {0: (CLAMP, CLAMP), 1: (CLAMP, REPEAT), 2: (REPEAT, CLAMP), 3: (REPEAT, REPEAT)}  # TexClampMode
MATERIAL_DEFAULT = {'Ambient Color': (1, 1, 1), 'Diffuse Color': (1, 1, 1), 'Specular Color': (1, 1, 1),
                    'Emissive Color': (0, 0, 0), 'Glossiness': 10.0, 'Alpha': 1.0}  # nif.xml defaults


# ------------------------------------------------------------------------------------------
# small helpers

def rel(path):
    return os.path.relpath(path, ASSETS)


def mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


def fresh(out, inputs):
    """True if `out` exists and is newer than every input and the converter's own code."""
    t = mtime(out)
    return t > 0 and all(mtime(i) <= t for i in list(inputs) + CODE)


def write_atomic(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp%d' % os.getpid()
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)


def write_json(path, obj):
    write_atomic(path, json.dumps(obj, indent=1, ensure_ascii=False).encode('utf-8'))


def r6(v):
    """Round floats to 7 significant digits (≈ float32) for JSON outputs."""
    if isinstance(v, (list, tuple)):
        return [r6(x) for x in v]
    return float('%.7g' % v) if isinstance(v, float) else v


def is_hidden(B, b):
    """Geometry/nodes the client never shows: Flags & 1, effect spawners '&*' (0xae6a50/0xae6c00)
    and NiHide string extra data."""
    if b.get('Flags', 0) & 1 or (b.get('Name') or '').startswith('&'):
        return True
    for e in b.get('Extra Data List', []) or []:
        t, x = B[e]
        if t == 'NiStringExtraData' and 'NiHide' in (x.get('String Data') or ''):
            return True
    return False


def find_stem(n, stem):
    """First AV object named exactly `stem`, depth-first from the roots (GetObjectByName, 0xae8230)."""
    B = n.blocks
    def walk(i):
        t, b = B[i]
        if b is None or 'Translation' not in b:
            return None
        if b.get('Name') == stem:
            return i
        for c in b.get('Children', []) or []:
            if c >= 0:
                r = walk(c)
                if r is not None:
                    return r
        return None
    for r in n.roots:
        hit = walk(r)
        if hit is not None:
            return hit
    return None


def local_trs(b):
    return tuple(b['Rotation']), tuple(b['Translation']), b['Scale']


# ------------------------------------------------------------------------------------------
# textures

_EXTERNAL = None


def external_texture(name):
    """Weapon textures outside the NIF: Avatar/L, Avatar/R, case-insensitive file name match."""
    global _EXTERNAL
    if _EXTERNAL is None:
        _EXTERNAL = {}
        for d in ('L', 'R'):
            for f in sorted(os.listdir(os.path.join(AVATAR_DIR, d))):
                _EXTERNAL.setdefault(f.lower(), os.path.join(AVATAR_DIR, d, f))
    return _EXTERNAL.get(os.path.basename(name.replace('\\', '/')).lower())


class Part:
    """State for one part GLB being built."""

    def __init__(self, path):
        self.path = path
        self.nif = NifFile(path)
        if self.nif.error:
            raise ValueError('parse error: ' + self.nif.error)
        self.B = self.nif.blocks
        self.stem = os.path.splitext(os.path.basename(path))[0]
        toks = self.stem.split('_')
        if len(toks) < 3:
            raise ValueError('file name has no slot token')
        self.token = toks[2]  # CiAvatar slot from the 3rd '_' token (0xb19b20), not the folder
        self.skinned = self.token in SKINNED_TOKENS
        self.g = glb.Builder()
        self.images = {}    # NiSourceTexture block → image index (or None)
        self.textures = {}  # (image, sampler) → texture index
        self.samplers = {}
        self.joints = {}    # bone name → placeholder node index
        self.warnings = []
        self.inputs = [path]
        self.triangles = 0

    def warn(self, msg):
        if msg not in self.warnings:
            self.warnings.append(msg)

    # --- textures -------------------------------------------------------------------------
    def image(self, src):
        if src in self.images:
            return self.images[src]
        st = self.B[src][1]
        name = st.get('File Name') or ''
        idx = None
        try:
            if st.get('Use External'):
                p = external_texture(name)
                if p is None:
                    raise ValueError('external texture %s not found in Avatar/L or Avatar/R' % name)
                self.inputs.append(p)
                w, h, rgba = dxt.decode_dds(open(p, 'rb').read())
            elif st.get('Pixel Data', -1) >= 0:
                w, h, rgba = dxt.decode_pixel_data(self.B[st['Pixel Data']][1])
            else:
                raise ValueError('texture %s has no pixel data' % name)
            idx = self.g.add_image_png(png.encode(w, h, rgba), name or None)
        except ValueError as e:
            self.warn(str(e))
        self.images[src] = idx
        return idx

    def texture(self, desc):
        """TexDesc → (glTF texture index or None, uv set, transform dict or None)."""
        flags = int(desc['Flags'])  # TexturingMapFlags: uv set 0-7, filter 8-11, clamp 12-13
        uv, clamp = flags & 0xff, (flags >> 12) & 3
        img = self.image(desc['Source']) if desc.get('Source', -1) >= 0 else None
        xf = None
        if desc.get('Has Texture Transform'):
            xf = {'translation': r6(list(desc['Translation'])), 'scale': r6(list(desc['Scale'])),
                  'rotation': r6(desc['Rotation']), 'method': desc['Transform Method'],
                  'center': r6(list(desc['Center']))}
        if img is None:
            return None, uv, xf
        ws, wt = WRAP[clamp]
        if (ws, wt) not in self.samplers:
            self.samplers[(ws, wt)] = self.g.add('samplers', {'magFilter': 9729, 'minFilter': 9987,
                                                               'wrapS': ws, 'wrapT': wt})
        key = (img, self.samplers[(ws, wt)])
        if key not in self.textures:
            self.textures[key] = self.g.add('textures', {'source': img, 'sampler': key[1]})
        return self.textures[key], uv, xf

    # --- materials ------------------------------------------------------------------------
    def material(self, geom, props, vertex_colors):
        B = self.B
        md = geom.get('Material Data') or {}
        mat = props.get('NiMaterialProperty', MATERIAL_DEFAULT)
        name = geom.get('Name') or ''
        shader = md.get('Shader Name') if md.get('Has Shader') else None
        ex = {'shader': shader, 'technique': md.get('Shader Extra Data') if shader else None}
        tp = props.get('NiTexturingProperty')
        transforms = {}
        for key, slot in (('base', 'Base Texture'), ('detail', 'Detail Texture'), ('decal', 'Decal 0 Texture')):
            tex = uv = None
            if tp and tp.get('Has ' + slot):
                tex, uv, xf = self.texture(tp[slot])
                if xf:
                    transforms[key] = xf
            ex[key + 'Texture'], ex[key + 'UV'] = tex, uv
        slot = None  # Color1 targets (0xae75b0 → 0xae7010)
        if self.token == 'Hair' and shader == 'COE_HairColor':
            slot = 'hair'
        elif self.token == 'Eyes':
            if self.stem + '_R' in name:
                slot = 'eyeRight'
            if self.stem + '_L' in name:
                slot = 'eyeLeft'
        ex['colorSlot'] = slot
        ex['ambient'] = r6(list(mat['Ambient Color']))
        ex['diffuse'] = r6(list(mat['Diffuse Color']))
        ex['emissive'] = r6(list(mat['Emissive Color']))
        ex['specular'] = r6(list(mat['Specular Color']))
        ex['glossiness'] = r6(mat['Glossiness'])
        ex['alpha'] = r6(mat['Alpha'])
        ap = props.get('NiAlphaProperty')
        f = int(ap['Flags']) if ap else 0x12EC  # AlphaFlags; nif.xml default: no blend, no test
        ex['alphaBlend'] = bool(f & 1)
        ex['srcBlend'], ex['dstBlend'] = (f >> 1) & 15, (f >> 5) & 15
        ex['alphaTest'] = bool(ap and f & 0x200)
        ex['alphaTestFunc'] = (f >> 10) & 7
        ex['alphaTestRef'] = ap['Threshold'] if ap else 0
        sp = props.get('NiSpecularProperty')
        ex['specularEnabled'] = bool(sp and int(sp['Flags']) & 1)
        vc = props.get('NiVertexColorProperty')
        ex['vertexColors'] = vertex_colors  # COLOR_0 present (some colour not white)
        ex['vertexColorMode'] = (int(vc['Flags']) >> 4) & 3 if vc else 2  # SourceVertexMode
        zb = props.get('NiZBufferProperty')
        ex['zTest'], ex['zWrite'] = (bool(int(zb['Flags']) & 1), bool(int(zb['Flags']) & 2)) if zb else (True, True)
        ex['modelColor'] = [1.0, 1.0, 1.0, 1.0]
        for e in geom.get('Extra Data List', []) or []:
            t, x = B[e]
            if t == 'NiColorExtraData' and x.get('Name') == 'ModelColor':
                ex['modelColor'] = r6(list(x['Data']))
        if transforms:
            ex['textureTransforms'] = transforms
        m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [1.0, 1.0, 1.0, float(mat['Alpha'])],
                                                    'metallicFactor': 0.0, 'roughnessFactor': 1.0}}
        if ex['baseTexture'] is not None:
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': ex['baseTexture'], 'texCoord': ex['baseUV']}
        if ex['alphaBlend']:
            m['alphaMode'] = 'BLEND'
        elif ex['alphaTest']:
            m['alphaMode'] = 'MASK'
            m['alphaCutoff'] = max(ex['alphaTestRef'], 1) / 255.0
        st = props.get('NiStencilProperty')
        if st and (int(st['Flags']) >> 10) & 3 == 3:  # StencilFlags Draw Mode = DRAW_BOTH
            m['doubleSided'] = True
        m['extras'] = ex
        return self.g.add('materials', m)

    # --- geometry -------------------------------------------------------------------------
    def mesh(self, gi, props, skinned):
        """Geometry block gi → (mesh index, skin index or None); None if it has no triangles."""
        B, g = self.B, self.g
        geom = B[gi][1]
        dt, d = B[geom['Data']]
        V = d.get('Vertices') or []
        tris = [t for t in tris_of(d, dt) if max(t) < len(V)]
        if not V or not tris:
            self.warn('%s: no triangles, dropped' % geom.get('Name'))
            return None, None
        attrs = {'POSITION': g.add_accessor([tuple(v) for v in V], glb.FLOAT, 'VEC3', glb.ARRAY_BUFFER, minmax=True)}
        if d.get('Has Normals'):
            attrs['NORMAL'] = g.add_accessor([tuple(v) for v in d['Normals']], glb.FLOAT, 'VEC3', glb.ARRAY_BUFFER)
        for k, uvs in enumerate(d.get('UV Sets') or []):
            attrs['TEXCOORD_%d' % k] = g.add_accessor([tuple(v) for v in uvs], glb.FLOAT, 'VEC2', glb.ARRAY_BUFFER)
        cols = d.get('Vertex Colors') if d.get('Has Vertex Colors') else None
        if cols and any(min(c) < 1.0 for c in cols):
            attrs['COLOR_0'] = g.add_accessor([tuple(c) for c in cols], glb.FLOAT, 'VEC4', glb.ARRAY_BUFFER)
        skin = None
        if skinned:
            skin = self.skin(geom, len(V), attrs)
        big = len(V) > 65535
        idx = g.add_accessor([i for t in tris for i in t], glb.UINT if big else glb.USHORT, 'SCALAR',
                             glb.ELEMENT_ARRAY_BUFFER)
        mat = self.material(geom, props, 'COLOR_0' in attrs)
        self.triangles += len(tris)
        prim = {'attributes': attrs, 'indices': idx, 'material': mat, 'mode': 4}
        mesh = g.add('meshes', {'name': geom.get('Name') or '', 'primitives': [prim]})
        return mesh, skin

    def joint(self, name):
        if name not in self.joints:
            self.joints[name] = self.g.add('nodes', {'name': name})
        return self.joints[name]

    def skin(self, geom, nverts, attrs):
        """NiSkinInstance/NiSkinData → glTF skin. IBM = per-bone Skin Transform (skin → bone space);
        the NiSkinData overall Skin Transform is NOT applied (it is already folded in)."""
        B = self.B
        si = B[geom['Skin Instance']][1]
        sd = B[si['Data']][1]
        if not sd.get('Has Vertex Weights'):
            raise ValueError('%s: NiSkinData without vertex weights (NiSkinPartition fallback not implemented)'
                             % geom.get('Name'))
        names = [B[bi][1]['Name'] for bi in si['Bones']]
        infl = [[] for _ in range(nverts)]
        ibms = []
        for j, bd in enumerate(sd['Bone List']):
            st = bd['Skin Transform']
            ibms.append(tuple(glb.trs_to_mat4(st[0:9], st[9:12], st[12])))
            for vi, w in bd['Vertex Weights']:
                if vi < nverts and w > 0:
                    infl[vi].append((w, j))
        joints, weights, unweighted = [], [], 0
        for lst in infl:
            # top 4 by weight; ties drop the lowest bone index first, as the NIFs' own
            # NiSkinPartitions (4 weights per vertex) do
            top = sorted(lst, key=lambda x: (-x[0], -x[1]))[:4]
            s = sum(w for w, _ in top)
            if s <= 0:
                unweighted += 1
                top, s = [(1.0, 0)], 1.0
            top += [(0.0, 0)] * (4 - len(top))
            joints.append(tuple(j for _, j in top))
            weights.append(tuple(w / s for w, _ in top))
        if unweighted:
            self.warn('%s: %d vertices without weights bound to joint 0' % (geom.get('Name'), unweighted))
        attrs['JOINTS_0'] = self.g.add_accessor(joints, glb.UBYTE if len(names) <= 256 else glb.USHORT,
                                                'VEC4', glb.ARRAY_BUFFER)
        attrs['WEIGHTS_0'] = self.g.add_accessor(weights, glb.FLOAT, 'VEC4', glb.ARRAY_BUFFER)
        ibm = self.g.add_accessor(ibms, glb.FLOAT, 'MAT4')
        return self.g.add('skins', {'name': geom.get('Name') or '', 'joints': [self.joint(nm) for nm in names],
                                    'inverseBindMatrices': ibm})

    # --- scene ----------------------------------------------------------------------------
    def props_of(self, b, inherited):
        """Properties apply down the scene graph; a node's own property of a type wins."""
        out = dict(inherited)
        for p in b.get('Properties', []) or []:
            if p >= 0:
                out[self.B[p][0]] = self.B[p][1]
        return out

    def rigid(self, i, inherited):
        """Stem subtree with its hierarchy and local transforms (rigid attach, 0xae74a0)."""
        t, b = self.B[i]
        if is_hidden(self.B, b):
            return None
        if t not in GEOMETRY and 'Children' not in b:
            self.warn('%s %s skipped' % (t, b.get('Name')))
            return None
        props = self.props_of(b, inherited)
        node = {'name': b.get('Name') or ''}
        node.update(glb.node_trs(*local_trs(b)))
        if t in GEOMETRY:
            if b.get('Skin Instance', -1) >= 0:
                self.warn('skinned geometry %s exported rigid (rigid slot token)' % b.get('Name'))
            mesh, _ = self.mesh(i, props, skinned=False)
            if mesh is None:
                return None
            node['mesh'] = mesh
        if t == 'NiBillboardNode':
            node['extras'] = {'billboardMode': b.get('Billboard Mode')}
        ni = self.g.add('nodes', node)
        kids = [k for k in (self.rigid(c, props) for c in b.get('Children', []) or [] if c >= 0) if k is not None]
        if kids:
            self.g.gltf['nodes'][ni]['children'] = kids
        return ni

    def skinned_meshes(self, i, inherited, out):
        """Collect (block, props) for every visible geometry in the stem subtree."""
        t, b = self.B[i]
        if is_hidden(self.B, b):
            return
        props = self.props_of(b, inherited)
        if t in GEOMETRY:
            out.append((i, props))
        for c in b.get('Children', []) or []:
            if c >= 0:
                self.skinned_meshes(c, props, out)

    def build(self):
        si = find_stem(self.nif, self.stem)
        if si is None:
            raise ValueError('no node named like the file stem')
        attach = 'skinned' if self.skinned else 'H' + self.token
        extras = {'stem': self.stem, 'slotToken': self.token, 'attach': attach,
                  'source': os.path.relpath(self.path, AVATAR_DIR)}
        if self.skinned:
            root = self.skinned_root(si)
        else:
            root = self.rigid(si, {})
        if root is None:  # stem itself hidden: the client draws nothing for this part
            root = self.g.add('nodes', {'name': self.stem})
        nmesh = len(self.g.gltf['meshes'])
        if not nmesh:
            self.warn('no visible geometry in the stem subtree: empty part')
        extras.update({'meshes': nmesh, 'triangles': self.triangles})
        if self.warnings:
            extras['warnings'] = self.warnings
        node = self.g.gltf['nodes'][root]
        node['extras'] = dict(node.get('extras', {}), **extras)
        self.g.gltf['scenes'][0]['nodes'] = [root]
        return self.g.to_bytes()

    def skinned_root(self, si):
        """Skinned slot (0xae7a40): skin space is world space once bones are rebound by name, so
        every mesh node and the stem root get identity transforms; joints are flat placeholders."""
        geoms = []
        self.skinned_meshes(si, {}, geoms)
        root = self.g.add('nodes', {'name': self.stem})
        kids = []
        for gi, props in geoms:
            gb = self.B[gi][1]
            sk = gb.get('Skin Instance', -1) >= 0
            if not sk:
                self.warn('rigid geometry %s in a skinned slot: kept unskinned at identity' % gb.get('Name'))
            mesh, skin = self.mesh(gi, props, skinned=sk)
            if mesh is None:
                continue
            if gi == si:
                tgt = self.g.gltf['nodes'][root]
            else:
                tgt = {'name': gb.get('Name') or ''}
                kids.append(self.g.add('nodes', tgt))
            tgt['mesh'] = mesh
            if skin is not None:
                tgt['skin'] = skin
        kids += list(self.joints.values())
        if kids:
            self.g.gltf['nodes'][root]['children'] = kids
        return root


# ------------------------------------------------------------------------------------------
# parts

def part_files():
    """Every part NIF under Avatar/<Folder>/ (all folders except Bone), as Folder/file.nif."""
    out = []
    for d in sorted(os.listdir(AVATAR_DIR)):
        if d == 'Bone' or not os.path.isdir(os.path.join(AVATAR_DIR, d)):
            continue
        out += ['%s/%s' % (d, f) for f in sorted(os.listdir(os.path.join(AVATAR_DIR, d))) if f.lower().endswith('.nif')]
    return out


def part_out(relnif):
    folder, f = relnif.split('/')
    return os.path.join(ASSETS, 'parts', folder, os.path.splitext(f)[0] + '.glb')


def convert_part(relnif, force=False):
    """Worker: convert one part. Returns (relnif, status, detail)."""
    src = os.path.join(AVATAR_DIR, relnif)
    out = part_out(relnif)
    if not force and fresh(out, [src]):
        return relnif, 'skipped', None
    try:
        p = Part(src)
        data = p.build()
        write_atomic(out, data)
        return relnif, 'converted', None
    except Exception as e:  # recorded in the manifest, never fatal
        if os.path.exists(out):
            os.remove(out)
        return relnif, 'failed', '%s: %s' % (type(e).__name__, e)


def part_entry(relnif):
    """Manifest entry rebuilt from the GLB's own root extras (so skipped files cost one read)."""
    out = part_out(relnif)
    g, _ = glb.read_glb(out, json_only=True)
    ex = g['nodes'][g['scenes'][0]['nodes'][0]].get('extras', {})
    e = {'glb': rel(out), 'attach': ex.get('attach'), 'slotToken': ex.get('slotToken'),
         'meshes': ex.get('meshes'), 'triangles': ex.get('triangles'), 'bytes': os.path.getsize(out)}
    if ex.get('warnings'):
        e['warnings'] = ex['warnings']
    return e


# ------------------------------------------------------------------------------------------
# skeletons and poses

def skeleton_models():
    """CModelData ids 100-102 / 200-202 → (name, root scale) from build/tables/models.json."""
    path = os.path.join(TABLES_DIR, 'models.json')
    if not os.path.exists(path):
        raise SystemExit('missing %s: run python3 tables.py first' % path)
    m = json.load(open(path))
    return {i: (m[str(i)]['name'], m[str(i)]['scale']) for i in SKELETON_IDS}


def convert_skeleton(model_id, name, scale, force=False):
    """Skeleton NIF (loaded by CModelData name, 0xd6fc40) → node-only GLB with exact NIF names."""
    src = os.path.join(AVATAR_DIR, 'Bone', name + '.nif')
    out = os.path.join(ASSETS, 'skeletons', name + '.glb')
    if not force and fresh(out, [src]):
        return name, 'skipped', None
    n = NifFile(src)
    if n.error:
        return name, 'failed', n.error
    B, g = n.blocks, glb.Builder()
    seen = set()

    def walk(i):
        t, b = B[i]
        if b is None or 'Children' not in b:  # geometry, lights, cameras: dropped
            return None
        nm = b.get('Name') or ''
        if nm in seen:
            raise ValueError('duplicate node name %r' % nm)
        seen.add(nm)
        node = {'name': nm}
        node.update(glb.node_trs(*local_trs(b)))
        ni = g.add('nodes', node)
        kids = [k for k in (walk(c) for c in b['Children'] if c >= 0) if k is not None]
        if kids:
            g.gltf['nodes'][ni]['children'] = kids
        return ni
    root = walk(n.roots[0])
    g.gltf['nodes'][root]['extras'] = {'source': 'Bone/%s.nif' % name, 'modelId': model_id, 'rootScale': scale}
    g.gltf['scenes'][0]['nodes'] = [root]
    write_atomic(out, g.to_bytes())
    return name, 'converted', None


def pose_files():
    """(prefix, code) → Bone/<kf> for the 6 KF prefixes × POSE_CODES; None when absent.

    Also every stance a skeleton's KFM lists in build/tables/stances.json (costume and motion-item
    overrides such as 054 and the 7xx ExStays, chosen by 0x466c50), when that KF exists."""
    bone = os.listdir(os.path.join(AVATAR_DIR, 'Bone'))
    out = {}
    for pre in POSE_PREFIXES:
        for code in POSE_CODES:
            # exact names vary (M_0x_153_Speard_DefaultStay_01), so match prefix, code and *Stay_01
            hits = sorted(f for f in bone if f.startswith('%s_%s_' % (pre, code)) and f.endswith('Stay_01.kf'))
            out[(pre, code)] = hits[0] if hits else None
    stances_path = os.path.join(TABLES_DIR, 'stances.json')
    if os.path.exists(stances_path):
        present = set(bone)
        for stances in json.load(open(stances_path)).values():
            for code, kf in stances.items():
                key = (kf[:4], '%03d' % int(code))
                if kf in present and out.get(key) is None:
                    out[key] = kf
    return out


class RawQuat(tuple):
    """A KF quaternion kept as glTF-ordered (x, y, z, w), not turned into a matrix."""

    @classmethod
    def from_wxyz(cls, w, x, y, z):
        return cls((x, y, z, w))


def convert_pose(kf, force=False):
    """Frame-0 local transforms of every animated channel (pose.sample_first)."""
    src = os.path.join(AVATAR_DIR, 'Bone', kf)
    out = os.path.join(ASSETS, 'poses', os.path.splitext(kf)[0] + '.json')
    if not force and fresh(out, [src]):
        return kf, 'skipped', None
    # Quaternion channels keep the KF value as stored: some are off unit length (W_03 510 Bip01
    # Pelvis by 0.07 %) and Gamebryo's NiQuaternion::ToRotation, like three.js Matrix4.compose,
    # uses them unnormalised. Euler channels arrive as matrices and are converted.
    pose, _, seq = sample_first(NifFile(src), quat=RawQuat.from_wxyz)
    bones = {}
    for name, (R, T, S) in sorted(pose.items()):
        e = {}
        if T is not None:
            e['t'] = r6(list(T))
        if R is not None:
            e['r'] = r6(list(R) if isinstance(R, RawQuat) else glb.mat3_to_quat(R))
        if S is not None:
            e['s'] = r6(S)
        if e:
            bones[name] = e
    write_json(out, {'source': kf, 'sequence': seq.get('Name'), 'time': 0, 'bones': bones})
    return kf, 'converted', None


# ------------------------------------------------------------------------------------------
# rig (charamake_018)

RIG_NIF = os.path.join(IMAGINE_CLIENT_DIR, 'Event', 'PolygonMovie', 'Model', 'charamake_018.nif')
BODY_CENTRE = (0.0, 88.0, 0.0)  # three.js, avatar frame: re-aim point for the portrait camera
PORTRAIT_ASPECT = 0.75


def unwrap_polygonmovie(path):
    """Event/PolygonMovie/Model/*.nif: b'\\xffZ05' + 8 bytes, then a zlib stream → plain NIF."""
    data = open(path, 'rb').read()
    if data[:4] != b'\xffZ05':
        raise ValueError('%s: not a wrapped PolygonMovie NIF' % path)
    out = os.path.join(CACHE, os.path.basename(path))
    write_atomic(out, zlib.decompress(data[12:]))
    return out


def frame0(B, b):
    """Static pose at t=0 of a node driven by an NiTransformController (camera fly-out)."""
    R, T, S = local_trs(b)
    c = b.get('Controller', -1)
    if c < 0 or B[c][0] != 'NiTransformController':
        return R, T, S
    ib = B[B[c][1]['Interpolator']][1]
    if ib.get('Data', -1) < 0:
        return R, T, S
    d = B[ib['Data']][1]
    if d.get('Num Rotation Keys'):
        if d['Rotation Type'] == 4:  # XYZ Euler keys, R = Rz·Ry·Rx
            R = euler_to_mat(*[gr['Keys'][0]['Value'] if gr['Num Keys'] else 0.0 for gr in d['XYZ Rotations']])
        else:
            w, x, y, z = d['Quaternion Keys'][0]['Value']
            R = glb.quat_to_mat3((x, y, z, w))
    if d['Translations']['Num Keys']:
        T = tuple(d['Translations']['Keys'][0]['Value'])
    return R, T, S


def scene_worlds(n, use_frame0=True):
    """World transform per block index (frame-0 pose for animated nodes)."""
    B, W = n.blocks, {}
    def walk(i, parent):
        t, b = B[i]
        if b is None or 'Translation' not in b or i in W:  # cameras are also listed as roots
            return
        W[i] = compose(parent, frame0(B, b) if use_frame0 else local_trs(b))
        for c in b.get('Children', []) or []:
            if c >= 0:
                walk(c, W[i])
    for r in n.roots:
        walk(r, IDENTITY)
    return W


def to_three(v):
    """Gamebryo (x, y, z) → three.js (x, z, −y)."""
    return [v[0], v[2], -v[1]]


def closest_on_ray(pos, d, p):
    k = sum((p[i] - pos[i]) * d[i] for i in range(3))
    return [pos[i] + k * d[i] for i in range(3)], k


def build_rig():
    n = NifFile(unwrap_polygonmovie(RIG_NIF))
    B = n.blocks
    W = scene_worlds(n)
    byname = {b.get('Name'): i for i, (t, b) in enumerate(B) if b and b.get('Name')}
    # Avatar stands at dum_chara_00's translation only; its yaw is ignored (0xd45b90, 0xd46e30).
    origin = W[byname['dum_chara_00']][1]
    rel3 = lambda p: to_three([p[k] - origin[k] for k in range(3)])
    cams = {}
    for key, node in (('full', 'cam_00_full'), ('bust', 'cam_01_bust'), ('face', 'cam_02_up')):
        ci = [c for c in B[byname[node]][1]['Children'] if B[c][0] == 'NiCamera'][0]
        cam = B[ci][1]
        Rw, Tw, _ = W[ci]
        # NiCamera looks down its world X axis, up = Y (rotation columns 0 and 1)
        look, up = to_three((Rw[0], Rw[3], Rw[6])), to_three((Rw[1], Rw[4], Rw[7]))
        pos = rel3(Tw)
        tgt, dist = closest_on_ray(pos, look, BODY_CENTRE)
        cams[key] = {'node': node, 'fov_deg': r6(math.degrees(2 * math.atan(cam['Frustum Top']))),
                     'aspect': r6(cam['Frustum Right'] / cam['Frustum Top']),
                     'near': cam['Frustum Near'], 'far': cam['Frustum Far'],
                     'position': r6(pos), 'direction': r6(look), 'up': r6(up),
                     'target': r6(tgt), 'target_distance': r6(dist)}
    lights, ambient, dropped = [], [0.0, 0.0, 0.0], []
    for i, (t, b) in enumerate(B):
        if t not in ('NiDirectionalLight', 'NiPointLight', 'NiAmbientLight') or not b.get('Switch State', 1):
            continue
        dim = b['Dimmer']
        if t == 'NiAmbientLight':
            ambient = [ambient[k] + c * dim for k, c in enumerate(b['Ambient Color'])]
            continue
        col = r6([c * dim for c in b['Diffuse Color']])
        Rw, Tw, _ = W[i]
        if t == 'NiDirectionalLight':  # light travels along its world X axis
            lights.append({'type': 'directional', 'name': b['Name'], 'color': col,
                           'direction_travel': r6(to_three((Rw[0], Rw[3], Rw[6])))})
            continue
        pos = rel3(Tw)
        lin = b['Linear Attenuation']
        d = math.sqrt(sum(x * x for x in pos))
        light = {'type': 'point', 'name': b['Name'], 'color': col, 'position': r6(pos), 'linear': r6(lin),
                 'constant': r6(b['Constant Attenuation']), 'quadratic': r6(b['Quadratic Attenuation'])}
        # falloff max(1 − 0.25·linear·d, 0) is zero beyond 4/linear: such a light never reaches the avatar
        if lin > 0 and d - 200 > 4 / lin:
            dropped.append(dict(light, distance=r6(d)))
        else:
            lights.append(light)
    full = cams['full']
    portrait = {'fov_deg': full['fov_deg'], 'aspect': PORTRAIT_ASPECT, 'near': full['near'], 'far': full['far'],
                'position': full['position'], 'target': list(BODY_CENTRE), 'up': [0, 1, 0],
                'game_exact_target': full['target'],
                'bust': {'fov_deg': cams['bust']['fov_deg'], 'position': cams['bust']['position'],
                         'target': cams['bust']['target']},
                'face': {'fov_deg': cams['face']['fov_deg'], 'position': cams['face']['position'],
                         'target': cams['face']['target']}}
    return {
        'source': 'Event/PolygonMovie/Model/charamake_018.nif',
        'frame': 'three.js, avatar root at origin facing +Z; Gamebryo (x, y, z) relative to dum_chara_00 '
                 '→ (x, z, −y)',
        'avatar_origin_gamebryo': r6(list(origin)),
        'camera': portrait,
        'cameras': cams,
        'lights': lights,
        'lights_out_of_range': dropped,
        'ambient': r6(ambient),
        'falloff': 'max(1 - 0.25*linear*d, 0)',
        'game_view': {'width': 1024, 'height': 768, 'crop_x': [403, 979],
                      'note': 'game frames the avatar off-centre (NDC x ≈ +0.35); camera.target re-aims at the body centre'},
    }


def convert_rig(force=False):
    out = os.path.join(ASSETS, 'rig.json')
    if not force and fresh(out, [RIG_NIF]):
        return 'rig.json', 'skipped', None
    write_json(out, build_rig())
    return 'rig.json', 'converted', None


# ------------------------------------------------------------------------------------------
# manifest and CLI

def _star(a):
    fn, args = a
    return fn(*args)


def run_jobs(jobs, nproc):
    """jobs: list of (fn, args). Runs in a process pool; prints progress; returns results."""
    if not jobs:
        return []
    res = []
    if nproc <= 1 or len(jobs) == 1:
        return [_star(j) for j in jobs]
    with multiprocessing.Pool(nproc) as pool:
        for k, r in enumerate(pool.imap_unordered(_star, jobs, chunksize=1), 1):
            res.append(r)
            if k % 500 == 0 or k == len(jobs):
                print('  %d/%d' % (k, len(jobs)), file=sys.stderr)
    return res


def write_manifest(results):
    """Rebuild manifest.json from what is on disk plus this run's results (and earlier failures)."""
    path = os.path.join(ASSETS, 'manifest.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    failed = dict(old.get('failures', {}))
    for key, status, detail in results:
        if status == 'failed':
            failed[key] = detail
        else:
            failed.pop(key, None)
    parts, notconv = {}, []
    for relnif in part_files():
        out = part_out(relnif)
        if os.path.exists(out):
            parts[os.path.splitext(relnif)[0]] = part_entry(relnif)
            failed.pop(relnif, None)
        elif relnif not in failed:
            notconv.append(relnif)
    models = skeleton_models()
    skels = {str(i): {'name': nm, 'scale': sc, 'glb': 'skeletons/%s.glb' % nm,
                      'exists': os.path.exists(os.path.join(ASSETS, 'skeletons', nm + '.glb'))}
             for i, (nm, sc) in models.items()}
    poses, missing = {}, []
    for (pre, code), kf in sorted(pose_files().items()):
        if kf is None:
            missing.append('%s_%s_%s_01.kf' % (pre, code, POSE_NAMES[code]))
            continue
        out = os.path.join(ASSETS, 'poses', os.path.splitext(kf)[0] + '.json')
        poses[os.path.splitext(kf)[0]] = {'json': rel(out), 'prefix': pre, 'code': code,
                                          'exists': os.path.exists(out)}
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(ASSETS) for f in fs
                if not f.startswith('manifest.json'))
    m = {'version': FORMAT_VERSION, 'generated': time.strftime('%Y-%m-%dT%H:%M:%S'),
         'uvFlip': UV_CONVENTION,
         'counts': {'parts': len(parts), 'failures': len(failed), 'notConverted': len(notconv),
                    'skeletons': sum(s['exists'] for s in skels.values()),
                    'poses': sum(p['exists'] for p in poses.values()), 'posesMissing': len(missing),
                    'bytes': total},
         'skeletons': skels, 'poses': poses, 'posesMissing': missing,
         'rig': 'rig.json' if os.path.exists(os.path.join(ASSETS, 'rig.json')) else None,
         'parts': parts, 'failures': dict(sorted(failed.items())), 'notConverted': notconv}
    write_json(path, m)
    return m


def resolve_part_arg(a):
    """Accept Folder/file.nif, Folder/file, or a path inside Avatar/."""
    p = os.path.abspath(a) if os.path.exists(a) else os.path.join(AVATAR_DIR, a)
    if not p.lower().endswith('.nif'):
        p += '.nif'
    r = os.path.relpath(p, AVATAR_DIR).replace(os.sep, '/')
    if r.startswith('..') or r.count('/') != 1 or not os.path.exists(p):
        raise SystemExit('%s: not a part NIF under %s/<Folder>/' % (a, AVATAR_DIR))
    return r


def main():
    args = sys.argv[1:]
    force = '--force' in args
    nproc = os.cpu_count() or 4
    if '-j' in args:
        nproc = int(args[args.index('-j') + 1])
        del args[args.index('-j'):args.index('-j') + 2]
    args = [a for a in args if a != '--force']
    if not args or args[0] not in ('all', 'parts', 'skeletons', 'poses', 'rig', 'manifest'):
        raise SystemExit(__doc__)
    cmd, rest = args[0], args[1:]
    t0 = time.time()
    jobs = []
    if cmd in ('all', 'skeletons'):
        jobs += [(convert_skeleton, (i, nm, sc, force)) for i, (nm, sc) in skeleton_models().items()]
    if cmd in ('all', 'poses'):
        jobs += [(convert_pose, (kf, force)) for kf in pose_files().values() if kf]
    if cmd in ('all', 'rig'):
        jobs.append((convert_rig, (force,)))
    if cmd == 'all':
        files = part_files()
        files.sort(key=lambda f: -os.path.getsize(os.path.join(AVATAR_DIR, f)))  # big first: balance
        jobs += [(convert_part, (f, force)) for f in files]
    if cmd == 'parts':
        jobs += [(convert_part, (resolve_part_arg(a), True)) for a in rest]
    os.makedirs(ASSETS, exist_ok=True)
    results = run_jobs(jobs, nproc)
    m = write_manifest(results)
    st = {}
    for key, status, detail in results:
        st[status] = st.get(status, 0) + 1
        if status == 'failed':
            print('FAILED %s: %s' % (key, detail), file=sys.stderr)
    print('%s: %s in %.1fs; manifest: %d parts, %d failures, %d not converted, %.1f MB' % (
        cmd, st, time.time() - t0, m['counts']['parts'], m['counts']['failures'],
        m['counts']['notConverted'], m['counts']['bytes'] / 1e6))
    if cmd == 'parts':
        for a in rest:
            r = resolve_part_arg(a)
            key = os.path.splitext(r)[0]
            print('  %s -> %s' % (r, json.dumps(m['parts'].get(key) or m['failures'].get(r))))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Survey a sample of Avatar NIFs: block histograms, shaders, textures, skin, geometry attrs."""
import os, sys, json, random, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifparse import NifFile, schema
from config import AVATAR_DIR

A = AVATAR_DIR
PER = int(sys.argv[1]) if len(sys.argv) > 1 else 12
random.seed(1234)

hist_total = collections.Counter()
hist_files = collections.Counter()           # number of files containing type
hist_folder = collections.defaultdict(collections.Counter)
unknown_types = collections.Counter()
errors = []
shader_by_folder = collections.defaultdict(collections.Counter)
strextra = collections.Counter()
colextra = collections.Counter()
pixfmt = collections.Counter()
pixfmt_folder = collections.defaultdict(collections.Counter)
tex_external = collections.Counter()
texslots = collections.Counter()
shader_tex = collections.Counter()
geomstats = collections.Counter()
controllers = collections.Counter()
skel_roots = collections.Counter()
bone_names_by_folder = collections.defaultdict(collections.Counter)
weights_per_vertex = collections.Counter()
alpha_flags = collections.Counter()
props_by_folder = collections.defaultdict(collections.Counter)
mat_dataflags = collections.Counter()
tex_dims = collections.Counter()
files_done = []
mipfmt = collections.Counter()
root_children = collections.Counter()
per_file = []

folders = sorted(d for d in os.listdir(A) if os.path.isdir(os.path.join(A, d)))
sample = []
for f in folders:
    nifs = sorted(x for x in os.listdir(os.path.join(A, f)) if x.lower().endswith('.nif'))
    groups = collections.defaultdict(list)
    for n in nifs:
        groups[n[:1]].append(n)
    for g, lst in sorted(groups.items()):
        k = min(PER, len(lst))
        sample += [(f, x) for x in random.sample(lst, k)]

for folder, fn in sample:
    path = os.path.join(A, folder, fn)
    try:
        n = NifFile(path)
    except Exception as e:
        errors.append((folder, fn, 'header: %s' % e))
        continue
    S = schema()
    for t in n.types:
        if t not in S.objects:
            unknown_types[t] += 1
    if n.error:
        errors.append((folder, fn, n.error))
    seen = set()
    for t, b in n.blocks:
        hist_total[t] += 1
        hist_folder[folder][t] += 1
        seen.add(t)
    for t in seen:
        hist_files[t] += 1
    files_done.append((folder, fn, n.error is None))
    blocks = n.blocks
    if n.error:
        continue
    rec = {'folder': folder, 'file': fn, 'ok': n.error is None, 'geoms': []}
    for i, (t, b) in enumerate(blocks):
        if b is None:
            continue
        if t in ('NiTriShape', 'NiTriStrips'):
            md = b.get('Material Data') or {}
            sh = md.get('Shader Name') if md.get('Has Shader') else None
            nm = b.get('Name')
            # hidden placeholders: extra data NiHide
            hidden = False
            for ed in b.get('Extra Data List', []):
                if ed >= 0 and blocks[ed][1] and blocks[ed][0] == 'NiStringExtraData' and (blocks[ed][1].get('String Data') or '').startswith('NiHide'):
                    hidden = True
            if nm and nm.startswith('Biped Object') or (nm or '').startswith('Bone'):
                hidden = True
            if hidden:
                geomstats['hidden/biped placeholder geom'] += 1
                continue
            shader_by_folder[sh][folder] += 1
            g = {'name': nm, 'type': t, 'shader': sh}
            for p in b.get('Properties', []):
                if p >= 0:
                    pt, pb = blocks[p]
                    props_by_folder[folder][pt] += 1
                    if pt == 'NiAlphaProperty' and pb:
                        alpha_flags[(pb.get('Flags'), pb.get('Threshold'))] += 1
                    if pt == 'NiTexturingProperty' and pb:
                        for k, v in pb.items():
                            if k.startswith('Has ') and k.endswith('Texture') and v:
                                texslots[k[4:]] += 1
                        if pb.get('Num Shader Textures'):
                            shader_tex[(sh, pb.get('Num Shader Textures'))] += 1
                            for st in pb.get('Shader Textures', []):
                                if st.get('Has Map'):
                                    texslots['ShaderMap#%s' % st.get('Map ID')] += 1
            d = blocks[b['Data']][1] if b.get('Data', -1) >= 0 else None
            if d:
                g['nv'] = d.get('Num Vertices')
                g['uvsets'] = len(d.get('UV Sets') or [])
                g['vcol'] = bool(d.get('Has Vertex Colors'))
                g['normals'] = bool(d.get('Has Normals'))
                df = d.get('Data Flags')
                mat_dataflags[int(df) if df is not None else None] += 1
                geomstats['uvsets=%d' % g['uvsets']] += 1
                geomstats['vcol=%s' % g['vcol']] += 1
                geomstats['normals=%s' % g['normals']] += 1
                geomstats['tangents(DataFlags&4096)=%s' % bool(df and (int(df) & 4096))] += 1
                if g['vcol']:
                    vc = d.get('Vertex Colors')
                    allwhite = all(abs(c[0]-1) < 1e-3 and abs(c[1]-1) < 1e-3 and abs(c[2]-1) < 1e-3 and abs(c[3]-1) < 1e-3 for c in vc)
                    geomstats['vcol_all_white=%s' % allwhite] += 1
                if d.get('Additional Data', -1) >= 0:
                    geomstats['has AdditionalData'] += 1
            si = b.get('Skin Instance', -1)
            if si is not None and si >= 0:
                sk = blocks[si][1]
                g['skinned'] = True
                g['nbones'] = sk['Num Bones']
                rn = blocks[sk['Skeleton Root']][1].get('Name') if sk['Skeleton Root'] >= 0 else None
                skel_roots[rn] += 1
                for bi in sk['Bones']:
                    bone_names_by_folder[folder][blocks[bi][1].get('Name')] += 1
                sp = blocks[sk['Skin Partition']][1] if sk.get('Skin Partition', -1) >= 0 else None
                if sp:
                    for part in sp['Partitions']:
                        weights_per_vertex[part['Num Weights Per Vertex']] += 1
                    g['partitions'] = sp['Num Partitions']
            else:
                g['skinned'] = False
            geomstats['skinned=%s' % g['skinned']] += 1
            rec['geoms'].append(g)
        elif t == 'NiStringExtraData':
            v = (b.get('String Data') or '').strip()
            strextra[(b.get('Name'), v[:60])] += 1
        elif t == 'NiColorExtraData':
            colextra[(b.get('Name'), b.get('Data'))] += 1
        elif t == 'NiSourceTexture':
            tex_external[('external' if b.get('Use External') else 'internal', os.path.splitext(b.get('File Name') or '')[1].lower())] += 1
            pd = b.get('Pixel Data', -1)
            if pd is not None and pd >= 0 and blocks[pd][1]:
                pb = blocks[pd][1]
                pixfmt[pb.get('Pixel Format')] += 1
                pixfmt_folder[folder][pb.get('Pixel Format')] += 1
                mm = pb.get('Mipmaps')
                if mm:
                    tex_dims['%dx%d' % (mm[0][0], mm[0][1])] += 1
        elif 'Controller' in t or 'Interpolator' in t:
            controllers[t] += 1
    if blocks and blocks[0][1]:
        r0 = blocks[0][1]
        root_children[tuple(sorted(blocks[c][1].get('Name') or '?' for c in r0.get('Children', []) if c >= 0 and blocks[c][1]))[:4]] += 1
    per_file.append(rec)

PF = {0: 'RGB', 1: 'RGBA', 2: 'PAL', 3: 'PALA', 4: 'DXT1', 5: 'DXT3', 6: 'DXT5'}
out = []
P = out.append
P('files sampled: %d  parsed cleanly: %d' % (len(files_done), sum(1 for x in files_done if x[2])))
P('errors (%d):' % len(errors))
for e in errors[:40]:
    P('  %s' % (e,))
P('unknown block types (not in nif.xml): %s' % dict(unknown_types))
P('\n== block histogram (total blocks / files containing) ==')
for t, c in hist_total.most_common():
    P('  %-40s %7d  %5d' % (t, c, hist_files[t]))
P('\n== per-folder block types ==')
for f in folders:
    P('  %s: %s' % (f, ', '.join('%s:%d' % kv for kv in hist_folder[f].most_common())))
P('\n== shader names (Material Data) by folder (visible geoms) ==')
for sh, fc in sorted(shader_by_folder.items(), key=lambda x: -sum(x[1].values())):
    P('  %-22s %s' % (sh, ', '.join('%s:%d' % kv for kv in fc.most_common())))
P('\n== NiStringExtraData (name, value) ==')
for k, c in strextra.most_common(40):
    P('  %5d %r' % (c, k))
P('\n== NiColorExtraData ==')
for k, c in colextra.most_common(20):
    P('  %5d %r' % (c, k))
P('\n== textures ==')
P('  NiSourceTexture external/internal + ext: %s' % dict(tex_external))
P('  pixel formats: %s' % {PF.get(k, k): v for k, v in pixfmt.items()})
for f in folders:
    if pixfmt_folder[f]:
        P('    %s: %s' % (f, {PF.get(k, k): v for k, v in pixfmt_folder[f].items()}))
P('  top-mip dims: %s' % dict(tex_dims.most_common(15)))
P('  texture slots used: %s' % dict(texslots))
P('  shader texture counts: %s' % dict(shader_tex))
P('\n== geometry ==')
for k, c in sorted(geomstats.items()):
    P('  %-40s %d' % (k, c))
P('  data flags: %s' % dict(mat_dataflags))
P('  alpha property (flags, threshold): %s' % dict(alpha_flags.most_common(10)))
P('  weights per vertex (partitions): %s' % dict(weights_per_vertex))
P('  skeleton root names: %s' % dict(skel_roots))
P('  root children patterns: %s' % dict(root_children.most_common(10)))
P('\n== properties by folder ==')
for f in folders:
    P('  %s: %s' % (f, dict(props_by_folder[f])))
P('\n== controllers/interpolators ==')
P('  %s' % dict(controllers))
P('\n== bones referenced by skin instances, per folder (top 12) ==')
for f in folders:
    P('  %s (%d distinct): %s' % (f, len(bone_names_by_folder[f]), ', '.join('%s' % k for k, _ in bone_names_by_folder[f].most_common(12))))
txt = '\n'.join(out)
open(os.path.join(os.path.dirname(__file__), 'survey_out.txt'), 'w').write(txt)
json.dump(per_file, open(os.path.join(os.path.dirname(__file__), 'survey_files.json'), 'w'), indent=1, default=str)
print(txt)

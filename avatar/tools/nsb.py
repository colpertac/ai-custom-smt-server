#!/usr/bin/env python3
"""Parser for Gamebryo 2.1 binary NSB shader files (version 0x00010010) as used by SMT IMAGINE.
Field meanings are partly inferred; unknown fields are kept as raw u32 lists."""
import sys, struct, json

ATTR_TYPES = {0:'undefined',1:'bool',2:'string',3:'uint',4:'float',5:'point2',6:'point3',7:'point4',
              8:'matrix3',9:'matrix4',10:'color',11:'texture',12:'array'}
MAP_KIND = {1:'constant',2:'defined',3:'attribute',4:'global',5:'operator',6:'object'}
# Gamebryo NSB render-state enum = D3DRENDERSTATETYPE order, compacted, 0-based (inferred)
RS_NAMES = ['ZENABLE','FILLMODE','SHADEMODE','ZWRITEENABLE','ALPHATESTENABLE','LASTPIXEL','SRCBLEND',
 'DESTBLEND','CULLMODE','ZFUNC','ALPHAREF','ALPHAFUNC','DITHERENABLE','ALPHABLENDENABLE','FOGENABLE',
 'SPECULARENABLE','FOGCOLOR','FOGTABLEMODE','FOGSTART','FOGEND','FOGDENSITY','RANGEFOGENABLE',
 'STENCILENABLE','STENCILFAIL','STENCILZFAIL','STENCILPASS','STENCILFUNC','STENCILREF','STENCILMASK',
 'STENCILWRITEMASK','TEXTUREFACTOR','WRAP0','WRAP1','WRAP2','WRAP3','WRAP4','WRAP5','WRAP6','WRAP7',
 'CLIPPING','LIGHTING','AMBIENT','FOGVERTEXMODE','COLORVERTEX','LOCALVIEWER','NORMALIZENORMALS',
 'DIFFUSEMATERIALSOURCE','SPECULARMATERIALSOURCE','AMBIENTMATERIALSOURCE','EMISSIVEMATERIALSOURCE',
 'VERTEXBLEND','CLIPPLANEENABLE','POINTSIZE','POINTSIZE_MIN','POINTSPRITEENABLE','POINTSCALEENABLE',
 'POINTSCALE_A','POINTSCALE_B','POINTSCALE_C','MULTISAMPLEANTIALIAS','MULTISAMPLEMASK','PATCHEDGESTYLE',
 'DEBUGMONITORTOKEN','POINTSIZE_MAX','INDEXEDVERTEXBLENDENABLE','COLORWRITEENABLE','TWEENFACTOR','BLENDOP',
 'POSITIONDEGREE','NORMALDEGREE','SCISSORTESTENABLE','SLOPESCALEDEPTHBIAS','ANTIALIASEDLINEENABLE',
 'MINTESSELLATIONLEVEL','MAXTESSELLATIONLEVEL','ADAPTIVETESS_X','ADAPTIVETESS_Y','ADAPTIVETESS_Z',
 'ADAPTIVETESS_W','ENABLEADAPTIVETESSELLATION','TWOSIDEDSTENCILMODE','CCW_STENCILFAIL','CCW_STENCILZFAIL',
 'CCW_STENCILPASS','CCW_STENCILFUNC','COLORWRITEENABLE1','COLORWRITEENABLE2','COLORWRITEENABLE3',
 'BLENDFACTOR','SRGBWRITEENABLE','DEPTHBIAS','WRAP8','WRAP9','WRAP10','WRAP11','WRAP12','WRAP13','WRAP14',
 'WRAP15','SEPARATEALPHABLENDENABLE','SRCBLENDALPHA','DESTBLENDALPHA','BLENDOPALPHA']
BLEND = ['ZERO','ONE','SRCCOLOR','INVSRCCOLOR','SRCALPHA','INVSRCALPHA','DESTALPHA','INVDESTALPHA',
         'DESTCOLOR','INVDESTCOLOR','SRCALPHASAT','BOTHSRCALPHA','BOTHINVSRCALPHA','BLENDFACTOR','INVBLENDFACTOR']
CMP = ['NEVER','LESS','EQUAL','LESSEQUAL','GREATER','NOTEQUAL','GREATEREQUAL','ALWAYS']
CULL = ['NONE','CW','CCW']
SAMP_NAMES = ['ADDRESSU','ADDRESSV','ADDRESSW','BORDERCOLOR','MAGFILTER','MINFILTER','MIPFILTER',
              'MIPMAPLODBIAS','MAXMIPLEVEL','MAXANISOTROPY','SRGBTEXTURE','ELEMENTINDEX','DMAPOFFSET']
TSS_NAMES = ['COLOROP','COLORARG1','COLORARG2','ALPHAOP','ALPHAARG1','ALPHAARG2','BUMPENVMAT00','BUMPENVMAT01',
             'BUMPENVMAT10','BUMPENVMAT11','TEXCOORDINDEX','BUMPENVLSCALE','BUMPENVLOFFSET',
             'TEXTURETRANSFORMFLAGS','COLORARG0','ALPHAARG0','RESULTARG','CONSTANT']
FILTER = ['NONE','POINT','LINEAR','ANISOTROPIC','PYRAMIDALQUAD','GAUSSIANQUAD']
ADDR = ['WRAP','MIRROR','CLAMP','BORDER','MIRRORONCE']
PD_INPUT = {0:'POSITION',1:'BLENDWEIGHT',2:'BLENDINDICES',3:'NORMAL',4:'COLOR',5:'TEXCOORD0',6:'TEXCOORD1',
            7:'TEXCOORD2',8:'TEXCOORD3',9:'TEXCOORD4',10:'TEXCOORD5',11:'TEXCOORD6',12:'TEXCOORD7',
            13:'TANGENT',14:'BINORMAL'}
PD_TYPE = {0:'FLOAT1',1:'FLOAT2',2:'FLOAT3',3:'FLOAT4',4:'UBYTECOLOR',5:'UBYTE4',6:'SHORT2',7:'SHORT4'}

def rs_pretty(st, val):
    n = RS_NAMES[st] if st < len(RS_NAMES) else 'RS%d' % st
    v = val
    if n in ('SRCBLEND','DESTBLEND','SRCBLENDALPHA','DESTBLENDALPHA') and val < len(BLEND): v = BLEND[val]
    elif n in ('ZFUNC','ALPHAFUNC','STENCILFUNC') and val < len(CMP): v = CMP[val]
    elif n == 'CULLMODE' and val < 3: v = CULL[val]
    elif n.endswith('ENABLE') or n in ('LIGHTING','ZWRITEENABLE'): v = bool(val)
    return '%s=%s' % (n, v)

def samp_pretty(st, val):
    n = SAMP_NAMES[st] if st < len(SAMP_NAMES) else 'SAMP%d' % st
    v = val
    if n.startswith('ADDRESS') and val < len(ADDR): v = ADDR[val]
    elif n.endswith('FILTER') and val < len(FILTER): v = FILTER[val]
    return '%s=%s' % (n, v)

class R:
    def __init__(s, d): s.d = d; s.p = 0
    def u32(s):
        v = struct.unpack_from('<I', s.d, s.p)[0]; s.p += 4; return v
    def u8(s):
        v = s.d[s.p]; s.p += 1; return v
    def f(s, n=1):
        v = struct.unpack_from('<%df' % n, s.d, s.p); s.p += 4 * n; return list(v)
    def s(s):
        n = s.u32()
        if n > 4096: raise ValueError('bad string len %d at 0x%x' % (n, s.p - 4))
        v = s.d[s.p:s.p + n].decode('latin1'); s.p += n; return v
    def raw(s, n): v = list(struct.unpack_from('<%dI' % n, s.d, s.p)); s.p += 4 * n; return v

def attr_table(r):
    out = []
    for _ in range(r.u32()):
        a = {'name': r.s(), 'desc': r.s(), 'flags': r.u32()}
        t = r.u32(); a['type'] = ATTR_TYPES.get(t, t)
        ranged = a['flags'] & 1
        n = {7: 4, 10: 4, 6: 3, 5: 2, 4: 1}.get(t)
        if n:
            a['default'] = r.f(n)
            if ranged: a['min'], a['max'] = r.f(n), r.f(n)
        elif t == 3:
            a['default'] = r.u32()
            if ranged: a['min'], a['max'] = r.u32(), r.u32()
        elif t == 1: a['default'] = r.u32()
        elif t == 9: a['default'] = r.f(16)
        elif t == 8: a['default'] = r.f(9)
        elif t == 11: a['slot'] = r.u32(); a['default'] = r.s()
        else: raise ValueError('attr type %d unhandled at 0x%x' % (t, r.p))
        out.append(a)
    return out

def state_group(r, pretty):
    out = []
    if not r.u32(): return None
    for _ in range(r.u32()):
        flags, st, val = r.u32(), r.u32(), r.u32()
        attr = r.s()
        e = pretty(st, val)
        if flags: e += ' [flags=0x%x]' % flags
        if attr: e += ' [from attr %s]' % attr
        out.append(e)
    return out

def const_map(r):
    present = r.u32()
    if not present: return None
    m = {'kind': {1:'pixel',2:'vertex'}.get(r.u32(), '?'), 'entries': []}
    for _ in range(r.u32()):
        key = r.s(); flags = r.u32(); extra = r.u32(); reg = r.u32(); cnt = r.u32(); var = r.s()
        size = r.u32(); stride = r.u32(); n = r.u32()
        data = r.f(n // 4) if n else []
        kind = MAP_KIND.get(flags >> 28, '?')
        e = {'key': key, 'kind': kind, 'reg': reg, 'count': cnt}
        if kind == 'object': e['object_type'] = (flags >> 8) & 0xff; e['object_index'] = extra
        elif extra: e['extra'] = extra
        if kind in ('attribute', 'global'): e['type'] = ATTR_TYPES.get(flags & 0xff, flags & 0xff)
        if var: e['var'] = var
        if data: e['data'] = data
        m['entries'].append(e)
    m['tail'] = r.raw(2)
    return m

def program(r):
    p = {'file': r.s(), 'file2': r.s(), 'unk': r.raw(2)}
    p['constants'] = const_map(r)
    return p

def stage(r):
    st = {'name': r.s(), 'index': r.u32(), 'tex_flags': hex(r.u32())}
    st['texture_stage_states'] = state_group(r, lambda a, b: '%s=%s' % (TSS_NAMES[a] if a < len(TSS_NAMES) else a, b))
    st['sampler_states'] = state_group(r, samp_pretty)
    st['use_tex_transform'] = r.u32()
    st['tex_transform'] = r.f(16)
    st['tail'] = r.raw(3)
    return st

def parse(d):
    r = R(d)
    assert d[:4] == b'nsb\0'
    o = {'version': hex(struct.unpack_from('<I', d, 4)[0])}
    r.p = 8; o['endian'] = r.u8()
    o['name'] = r.s(); o['desc'] = r.s(); o['udd'] = r.u32()
    o['global_attributes'] = attr_table(r)
    o['attributes'] = attr_table(r)
    o['packing_defs'] = []
    for _ in range(r.u32()):
        pd = {'name': r.s(), 'fixed_function': r.u32(), 'entries': []}
        for _ in range(r.u32()):
            stream, reg, inp, typ, tess, usage, uidx = r.raw(7)
            pd['entries'].append('stream%d v%d <- %s %s' % (stream, reg, PD_INPUT.get(inp, inp), PD_TYPE.get(typ, typ))
                                 + ('' if (tess, usage, uidx) == (0, 14, 0) else ' tess=%d usage=%d idx=%d' % (tess, usage, uidx)))
        o['packing_defs'].append(pd)
    o['implementations'] = []
    for _ in range(r.u32()):
        im = {'name': r.s(), 'desc': r.s(), 'class': r.s(), 'index': r.u32()}
        req = r.raw(14)
        im['requirements_raw'] = [hex(x) for x in req]
        im['ps_version'] = hex(req[1]); im['vs_version'] = hex(req[2])
        im['packing_def'] = r.s()
        im['render_states'] = state_group(r, rs_pretty)
        im['unk'] = r.raw(2)
        im['passes'] = []
        npass = r.u32()
        for _ in range(npass):
            ps = {'name': r.s(), 'unk': r.raw(1)}; ps['render_states'] = state_group(r, rs_pretty)
            ps['pixel_shader'] = program(r)
            ps['vertex_shader'] = program(r)
            ps['unk2'] = r.raw(1)
            ps['stages'] = [stage(r) for _ in range(r.u32())]
            im['passes'].append(ps)
        im['tail'] = r.raw(1)
        o['implementations'].append(im)
    o['_consumed'] = r.p; o['_size'] = len(d)
    return o

if __name__ == '__main__':
    for fn in sys.argv[1:]:
        d = open(fn, 'rb').read()
        try:
            o = parse(d)
            print(fn, 'OK' if o['_consumed'] == o['_size'] else 'PARTIAL %d/%d' % (o['_consumed'], o['_size']))
        except Exception as e:
            print(fn, 'FAIL', e)

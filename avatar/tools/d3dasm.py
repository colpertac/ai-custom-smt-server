#!/usr/bin/env python3
"""Minimal Direct3D 9 (SM1.x-3.0) shader bytecode disassembler. stdlib only."""
import sys, struct

OPS = {0:'nop',1:'mov',2:'add',3:'sub',4:'mad',5:'mul',6:'rcp',7:'rsq',8:'dp3',9:'dp4',10:'min',11:'max',
12:'slt',13:'sge',14:'exp',15:'log',16:'lit',17:'dst',18:'lrp',19:'frc',20:'m4x4',21:'m4x3',22:'m3x4',
23:'m3x3',24:'m3x2',25:'call',26:'callnz',27:'loop',28:'ret',29:'endloop',30:'label',31:'dcl',32:'pow',
33:'crs',34:'sgn',35:'abs',36:'nrm',37:'sincos',38:'rep',39:'endrep',40:'if',41:'ifc',42:'else',43:'endif',
44:'break',45:'breakc',46:'mova',47:'defb',48:'defi',64:'texcoord',65:'texkill',66:'tex',67:'texbem',
68:'texbeml',69:'texreg2ar',70:'texreg2gb',71:'texm3x2pad',72:'texm3x2tex',73:'texm3x3pad',74:'texm3x3tex',
76:'texm3x3spec',77:'texm3x3vspec',78:'expp',79:'logp',80:'cnd',81:'def',82:'texreg2rgb',83:'texdp3tex',
84:'texm3x2depth',85:'texdp3',86:'texm3x3',87:'texdepth',88:'cmp',89:'bem',90:'dp2add',91:'dsx',92:'dsy',
93:'texldd',94:'setp',95:'texldl',96:'breakp'}
# number of parameter tokens for SM1.x (no length field)
NPARAM = {'nop':0,'mov':2,'add':3,'sub':3,'mad':4,'mul':3,'rcp':2,'rsq':2,'dp3':3,'dp4':3,'min':3,'max':3,
'slt':3,'sge':3,'exp':2,'log':2,'lit':2,'dst':3,'lrp':4,'frc':2,'m4x4':3,'m4x3':3,'m3x4':3,'m3x3':3,'m3x2':3,
'dcl':2,'texcoord':1,'texkill':1,'tex':1,'texbem':2,'texbeml':2,'texreg2ar':2,'texreg2gb':2,'texm3x2pad':2,
'texm3x2tex':2,'texm3x3pad':2,'texm3x3tex':2,'texm3x3spec':3,'texm3x3vspec':2,'expp':2,'logp':2,'cnd':4,
'def':5,'texreg2rgb':2,'texdp3tex':2,'texm3x2depth':2,'texdp3':2,'texm3x3':2,'texdepth':1,'cmp':4,'bem':3,
'sincos':4,'pow':3,'crs':3,'abs':2,'nrm':2,'sgn':4,'mova':2,'dp2add':4,'defi':5,'defb':2}
RT = {0:'r',1:'v',2:'c',3:'a',4:'o',5:'oD',6:'oT',7:'i',8:'oC',9:'oDepth',10:'s',11:'c',12:'c',13:'c',
14:'b',15:'aL',16:'half',17:'misc',18:'l',19:'p'}
USAGE = {0:'position',1:'blendweight',2:'blendindices',3:'normal',4:'psize',5:'texcoord',6:'tangent',
7:'binormal',8:'tessfactor',9:'positiont',10:'color',11:'fog',12:'depth',13:'sample'}
TEXTYPE = {0:'',1:'',2:'_2d',3:'_cube',4:'_volume'}
SRCMOD = {0:'{}',1:'-{}',2:'{}_bias',3:'-{}_bias',4:'{}_bx2',5:'-{}_bx2',6:'1-{}',7:'{}_x2',8:'-{}_x2',
9:'{}_dz',10:'{}_dw',11:'{}_abs',12:'-{}_abs',13:'!{}'}
SHIFT = {0:'',1:'_x2',2:'_x4',3:'_x8',13:'_d8',14:'_d4',15:'_d2'}

def regname(tok, ver, is_ps):
    num = tok & 0x7ff
    rt = ((tok >> 28) & 7) | ((tok >> 8) & 0x18)
    if rt == 3:
        return ('t%d' % num) if is_ps else ('a%d' % num)
    if rt == 4:
        return ['oPos','oFog','oPts'][num] if num < 3 else 'o?%d' % num
    if rt == 6:
        return ('oT%d' % num) if ver < 0x300 else ('o%d' % num)
    if rt == 17:
        return ['vPos','vFace'][num]
    return '%s%d' % (RT.get(rt, '?%d' % rt), num)

def dst(tok, ver, is_ps):
    s = regname(tok, ver, is_ps)
    wm = (tok >> 16) & 0xf
    mod = (tok >> 20) & 0xf
    sh = (tok >> 24) & 0xf
    m = ''
    if mod & 1: m += '_sat'
    if mod & 2: m += '_pp'
    if mod & 4: m += '_centroid'
    if wm != 0xf:
        s += '.' + ''.join(c for i, c in enumerate('xyzw') if wm & (1 << i))
    return SHIFT.get(sh, '_sh%d' % sh) + m, s

def src(tok, ver, is_ps, rel=None):
    s = regname(tok, ver, is_ps)
    if rel is not None:
        s = s[:1] + '[%s + %s]' % (rel, s[1:])
    elif tok & 0x2000 and not is_ps:
        s = s[:1] + '[a0.x + %s]' % s[1:]
    sw = (tok >> 16) & 0xff
    if sw != 0xe4:
        comps = ''.join('xyzw'[(sw >> (2 * i)) & 3] for i in range(4))
        if comps[1:] == comps[0] * 3: comps = comps[0]
        s += '.' + comps
    mod = (tok >> 24) & 0xf
    return SRCMOD.get(mod, '?{}').format(s)

def parse_ctab(data):
    # data: bytes of the comment after 'CTAB'
    out = []
    try:
        size, creator, ver, nconst, cinfo, flags, target = struct.unpack_from('<7I', data, 0)
        def cstr(o):
            e = data.index(b'\0', o); return data[o:e].decode('latin1')
        out.append('// CTAB creator=%r target=%r' % (cstr(creator), cstr(target)))
        RS = {0:'bool',1:'int4',2:'float4',3:'sampler'}
        for i in range(nconst):
            name, rset, ridx, rcount, res, tinfo, dflt = struct.unpack_from('<IHHHHII', data, cinfo + 20 * i)
            cls, typ, rows, cols, elems, members, minfo = struct.unpack_from('<7H', data, tinfo)
            out.append('//   %-28s %s%d  count=%d  class=%d type=%d %dx%d' % (cstr(name),
                       {0:'b',1:'i',2:'c',3:'s'}[rset], ridx, rcount, cls, typ, rows, cols))
    except Exception as e:
        out.append('// CTAB parse error %s' % e)
    return out

def disasm(b):
    w = struct.unpack('<%dI' % (len(b) // 4), b[:len(b) // 4 * 4])
    ver = w[0]
    is_ps = (ver >> 16) == 0xffff
    v = ver & 0xffff
    lines = ['%s_%d_%d' % ('ps' if is_ps else 'vs', (v >> 8) & 0xff, v & 0xff)]
    i = 1
    while i < len(w):
        t = w[i]
        if t == 0x0000ffff:
            lines.append('// end'); break
        op = t & 0xffff
        if op == 0xfffe:
            n = (t >> 16) & 0x7fff
            cdata = struct.pack('<%dI' % n, *w[i + 1:i + 1 + n])
            if cdata[:4] == b'CTAB':
                lines += parse_ctab(cdata[4:])
            else:
                lines.append('// comment %r' % cdata[:64])
            i += 1 + n; continue
        name = OPS.get(op, 'op%d' % op)
        ctrl = (t >> 16) & 0xff
        if v >= 0x200:
            n = (t >> 24) & 0xf
        else:
            n = NPARAM.get(name, 0)
            if name == 'tex' and is_ps and v >= 0x104: n = 2  # texld r, t
        params = list(w[i + 1:i + 1 + n])
        i += 1 + n
        coissue = '+' if (t & 0x40000000) else ''
        if name == 'tex' and is_ps:
            name = 'texld' if v >= 0x104 else 'tex'
            if ctrl == 1: name += 'p'
            if ctrl == 2: name += 'b'
        if name == 'dcl':
            u = params[0]
            mod, d = dst(params[1], v, is_ps)
            rt = ((params[1] >> 28) & 7) | ((params[1] >> 8) & 0x18)
            if rt == 10:
                lines.append('dcl%s %s' % (TEXTYPE.get((u >> 27) & 0xf, '?'), d))
            elif is_ps and v < 0x300:
                lines.append('dcl%s %s' % (mod, d))
            else:
                us = USAGE.get(u & 0x1f, '?'); ui = (u >> 16) & 0xf
                lines.append('dcl_%s%s%s %s' % (us, ui if ui else '', mod, d))
            continue
        if name == 'def':
            mod, d = dst(params[0], v, is_ps)
            fl = struct.unpack('<4f', struct.pack('<4I', *params[1:5]))
            lines.append('def %s, %s' % (d, ', '.join('%g' % x for x in fl)))
            continue
        if name in ('defi',):
            mod, d = dst(params[0], v, is_ps)
            lines.append('defi %s, %s' % (d, ', '.join(str(struct.unpack('<i', struct.pack('<I', x))[0]) for x in params[1:5])))
            continue
        if not params:
            lines.append(coissue + name); continue
        mod, d = dst(params[0], v, is_ps)
        srcs = []
        j = 1
        while j < len(params):
            p = params[j]; rel = None
            if v >= 0x200 and (p & 0x2000) and j + 1 < len(params) and (params[j+1] & 0x80000000):
                relt = params[j + 1]
                rel = regname(relt, v, is_ps) + '.' + 'xyzw'[(relt >> 16) & 3]
                srcs.append(src(p, v, is_ps, rel)); j += 2; continue
            srcs.append(src(p, v, is_ps)); j += 1
        if name in ('texkill',) or (name == 'tex' and v < 0x104) or name == 'texcoord':
            lines.append('%s%s %s' % (coissue, name, d)); continue
        lines.append('%s%s%s %s' % (coissue, name, mod, ', '.join([d] + srcs)))
    return lines

if __name__ == '__main__':
    for fn in sys.argv[1:]:
        print('; ==== %s' % fn)
        print('\n'.join(disasm(open(fn, 'rb').read())))
        print()

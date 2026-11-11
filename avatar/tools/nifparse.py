#!/usr/bin/env python3
"""Minimal nif.xml-driven NIF reader (stdlib only), tuned for Gamebryo 20.1.0.3
(Shin Megami Tensei: IMAGINE). Interprets the NifTools nif.xml schema generically.

Usage:  python3 nifparse.py file.nif [--dump]
API:    nif = NifFile(path); nif.blocks -> list of (type_name, dict)
        nif.strings -> header string table
"""
import os, re, struct, sys, xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import NIF_XML

NIFXML = NIF_XML
VERSION_ID = 'V20_1_0_3'


def ver2int(s):
    p = [int(x) for x in s.split('.')]
    while len(p) < 4:
        p.append(0)
    return (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]


class BitInt(int):
    """int with named bitfield members"""
    pass


class Schema:
    def __init__(self, path=NIFXML):
        root = ET.parse(path).getroot()
        self.basics, self.enums, self.structs, self.objects = {}, {}, {}, {}
        self.bitfields = {}
        self.verids = {}
        self.tokens = []  # (token, replacement) in order
        self.versets = {}
        self.enum_opts = {}
        for el in root:
            tag = el.tag
            if tag == 'token':
                for t in el:
                    if t.tag == 'verset':
                        self.versets[t.get('token')] = t.get('string').split()
                    else:
                        self.tokens.append((t.get('token'), t.get('string'), el.get('attrs').split()))
            elif tag == 'version':
                self.verids[el.get('id')] = ver2int(el.get('num'))
            elif tag == 'basic':
                self.basics[el.get('name')] = el
            elif tag in ('enum', 'bitflags'):
                self.enums[el.get('name')] = el.get('storage')
                for o in el:
                    if o.tag == 'option':
                        v = o.get('value') if o.get('value') is not None else str(1 << int(o.get('bit')))
                        self.enum_opts[o.get('name')] = int(v, 0)
            elif tag == 'bitfield':
                mem = [(m.get('name'), int(m.get('pos')), int(m.get('mask'), 0)) for m in el if m.tag == 'member']
                self.bitfields[el.get('name')] = (el.get('storage'), mem)
            elif tag == 'struct':
                self.structs[el.get('name')] = el
            elif tag == 'niobject':
                self.objects[el.get('name')] = el
        self.version = ver2int('20.1.0.3')
        self.user = 0
        self.bsver = 0
        self._expr_cache = {}
        self._fmt_cache = {}
        self._field_cache = {}
        self.inherit = {n: o.get('inherit') for n, o in self.objects.items()}

    # ---------------- expressions -----------------
    def expand_tokens(self, s, attr):
        for _ in range(4):
            for tok, rep, attrs in self.tokens:
                if attr in attrs and tok in s:
                    s = s.replace(tok, rep)
        return s

    OPS = re.compile(r'(\|\||&&|==|!=|<=|>=|<<|>>|[()+\-*/<>&|!])')

    def compile_expr(self, s, attr):
        key = (s, attr)
        if key in self._expr_cache:
            return self._expr_cache[key]
        e = self.expand_tokens(s, attr)
        parts = self.OPS.split(e)
        out = []
        for p in parts:
            if p is None:
                continue
            ps = p.strip()
            if ps == '':
                continue
            if ps == '&&':
                out.append(' and ')
            elif ps == '||':
                out.append(' or ')
            elif ps == '!':
                out.append(' not ')
            elif ps == '/':
                out.append('//')
            elif self.OPS.fullmatch(ps):
                out.append(ps)
            elif re.fullmatch(r'\d+\.\d+\.\d+\.\d+', ps):
                out.append(str(ver2int(ps)))
            elif re.fullmatch(r'0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?', ps):
                out.append(ps)
            elif ps in ('true', 'false'):
                out.append('True' if ps == 'true' else 'False')
            elif ps == '#ARG#':
                out.append('_A(0)')
            elif re.fullmatch(r'#ARG(\d)#', ps):
                out.append('_A(%d)' % int(ps[4]))
            elif ps == 'Version':
                out.append('_G("Version")')
            elif ps == 'User Version':
                out.append('_G("User Version")')
            elif ps == 'BS Header\\BS Version':
                out.append('0')
            elif ps in self.enum_opts:
                out.append(str(self.enum_opts[ps]))
            else:
                out.append('_F(%r)' % ps)
        code = ''.join(out).strip()
        try:
            c = compile(code, s, 'eval')
        except SyntaxError:
            raise SyntaxError('bad expr %r -> %r' % (s, code))
        self._expr_cache[key] = c
        return c

    def eval(self, s, attr, ctx, args):
        if s is None:
            return None
        s = s.strip()
        if re.fullmatch(r'\d+', s):
            return int(s)
        c = self.compile_expr(s, attr)

        def _F(name):
            if '\\' in name:
                a, b = name.split('\\', 1)
                v = ctx[a]
                if isinstance(v, dict):
                    return v[b]
                return getattr(v, '_m')[b]
            if name not in ctx:
                return 0  # absent (version-excluded) field -> default
            v = ctx[name]
            return v

        def _A(i):
            return args[i] if args and len(args) > i else 0

        def _G(n):
            return self.version if n == 'Version' else self.user
        return eval(c, {'_F': _F, '_A': _A, '_G': _G})

    def ver_ok(self, el):
        v = self.version
        s = el.get('since')
        if s is not None:
            sv = self.verids[s] if s in self.verids else ver2int(s)
            if v < sv:
                return False
        u = el.get('until')
        if u is not None:
            uv = self.verids[u] if u in self.verids else ver2int(u)
            if v > uv:
                return False
        vs = el.get('versions')
        if vs is not None:
            ids = []
            for t in vs.split():
                ids += self.versets.get(t, [t])
            if VERSION_ID not in ids:
                return False
        vc = el.get('vercond')
        if vc is not None:
            if not self.eval(vc, 'vercond', {}, None):
                return False
        return True

    def is_a(self, t, base):
        while t:
            if t == base:
                return True
            t = self.inherit.get(t)
        return False


class Reader:
    def __init__(self, schema, data):
        self.S = schema
        self.d = data
        self.p = 0
        self.strings = None

    def unpack(self, fmt):
        r = struct.unpack_from('<' + fmt, self.d, self.p)
        self.p += struct.calcsize('<' + fmt)
        return r

    BASICFMT = {'uint64': 'Q', 'int64': 'q', 'ulittle32': 'I', 'uint': 'I', 'int': 'i', 'ushort': 'H',
                'short': 'h', 'char': 'B', 'sbyte': 'b', 'byte': 'B', 'normbyte': 'B', 'bool': 'B',
                'BlockTypeIndex': 'H', 'FileVersion': 'I', 'float': 'f', 'hfloat': 'e', 'Ptr': 'i',
                'Ref': 'i', 'StringOffset': 'I', 'NiFixedString': 'I'}

    def simple_fmt(self, tname):
        """format string for fixed-layout types (no conditions), else None"""
        S = self.S
        if tname in S._fmt_cache:
            return S._fmt_cache[tname]
        f = None
        if tname in self.BASICFMT:
            f = self.BASICFMT[tname]
        elif tname in S.enums:
            f = self.BASICFMT[S.enums[tname]]
        elif tname in S.structs:
            el = S.structs[tname]
            parts = []
            ok = True
            for fe in el.iter('field'):
                if not S.ver_ok(fe):
                    continue
                if fe.get('cond') or fe.get('template') or fe.get('arg') or fe.get('width'):
                    ok = False
                    break
                sub = self.simple_fmt(fe.get('type'))
                if sub is None:
                    ok = False
                    break
                ln = fe.get('length')
                if ln is not None:
                    if not ln.isdigit():
                        ok = False
                        break
                    sub = sub * int(ln)
                parts.append(sub)
            if ok and parts:
                f = ''.join(parts)
        S._fmt_cache[tname] = f
        return f

    def read_type(self, tname, template, args, owner):
        S = self.S
        if tname == '#T#':
            tname = template
        if tname in ('HeaderString', 'LineString'):
            e = self.d.index(b'\n', self.p)
            s = self.d[self.p:e].decode('latin1')
            self.p = e + 1
            return s
        if tname in self.BASICFMT:
            return self.unpack(self.BASICFMT[tname])[0]
        if tname in S.enums:
            return self.unpack(self.BASICFMT[S.enums[tname]])[0]
        if tname in S.bitfields:
            st, mem = S.bitfields[tname]
            v = BitInt(self.unpack(self.BASICFMT[st])[0])
            v._m = {n: (v >> pos) & (mask >> pos) for n, pos, mask in mem}
            return v
        if tname in ('string', 'FilePath') and self.strings is not None:
            i = self.unpack('I')[0]
            return None if i == 0xFFFFFFFF else self.strings[i]
        if tname == 'SizedString':
            n = self.unpack('I')[0]
            s = self.d[self.p:self.p + n].decode('latin1')
            self.p += n
            return s
        if tname in S.structs:
            f = self.simple_fmt(tname)
            if f is not None:
                return self.unpack(f)
            return self.read_fields(S.structs[tname], template, args, owner, {})
        raise ValueError('unknown type %s' % tname)

    def read_fields(self, el, template, args, owner, ctx):
        S = self.S
        for fe in el.iter('field'):
            if not S.ver_ok(fe):
                continue
            ot = fe.get('onlyT')
            if ot and not S.is_a(owner, ot):
                continue
            et = fe.get('excludeT')
            if et and S.is_a(owner, et):
                continue
            c = fe.get('cond')
            if c is not None and not S.eval(c, 'cond', ctx, args):
                continue
            tname = fe.get('type')
            if tname == '#T#':
                tname = template
            tmpl = fe.get('template')
            if tmpl == '#T#':
                tmpl = template
            a = fe.get('arg')
            fargs = [S.eval(a, 'arg', ctx, args)] if a is not None else None
            ln = fe.get('length')
            wd = fe.get('width')
            name = fe.get('name')
            if ln is None:
                ctx[name] = self.read_type(tname, tmpl, fargs, owner)
            else:
                n = S.eval(ln, 'length', ctx, args)
                if wd is None:
                    ctx[name] = self.read_array(tname, tmpl, fargs, owner, n)
                else:
                    if wd.isdigit():
                        w = int(wd)
                        ws = [w] * n
                    else:
                        w = S.eval(wd, 'width', ctx, args)
                        ws = list(w) if isinstance(w, (list, tuple)) else [w] * n
                    ctx[name] = [self.read_array(tname, tmpl, fargs, owner, ws[i]) for i in range(n)]
        return ctx

    def read_array(self, tname, tmpl, fargs, owner, n):
        if tname == '#T#':
            tname = tmpl
        if n < 0 or n > 50_000_000:
            raise ValueError('absurd array length %d for %s at %d' % (n, tname, self.p))
        if tname in ('byte', 'char') :
            b = self.d[self.p:self.p + n]
            self.p += n
            return b
        f = self.simple_fmt(tname)
        if f is not None:
            sz = struct.calcsize('<' + f)
            k = len(f) if all(ch.isalpha() for ch in f) else None
            vals = struct.unpack_from('<' + f * n, self.d, self.p)
            self.p += sz * n
            per = len(struct.unpack_from('<' + f, bytes(sz))) if n else 1
            if per == 1:
                return list(vals)
            return [vals[i * per:(i + 1) * per] for i in range(n)]
        return [self.read_type(tname, tmpl, fargs, owner) for _ in range(n)]


_SCHEMA = None


def schema():
    global _SCHEMA
    if _SCHEMA is None:
        _SCHEMA = Schema()
    return _SCHEMA


class NifFile:
    def __init__(self, path, stop_on_error=True):
        S = schema()
        self.path = path
        data = open(path, 'rb').read()
        r = Reader(S, data)
        hdr = r.read_fields(S.structs['Header'], None, None, None, {})
        self.header = hdr
        assert hdr['Version'] == S.version, hex(hdr['Version'])
        self.types = hdr['Block Types']
        self.strings = [x.encode('latin1').decode('cp932', 'replace') for x in hdr['Strings']]
        self.types = [x for x in hdr['Block Types']]
        r.strings = self.strings
        self.blocks = []
        self.error = None
        for i, ti in enumerate(hdr['Block Type Index']):
            tname = self.types[ti & 0x7fff]
            start = r.p
            try:
                if tname not in S.objects:
                    raise ValueError('block type %s not in nif.xml' % tname)
                ctx = {}
                chain = []
                t = tname
                while t:
                    chain.append(S.objects[t])
                    t = S.inherit.get(t)
                for el in reversed(chain):
                    r.read_fields(el, None, None, tname, ctx)
                ctx['_start'] = start
                ctx['_end'] = r.p
                self.blocks.append((tname, ctx))
            except Exception as e:
                self.error = 'block %d (%s) @%d: %s: %s' % (i, tname, start, type(e).__name__, e)
                self.blocks.append((tname, None))
                # can't continue without block sizes
                for j in range(i + 1, len(hdr['Block Type Index'])):
                    self.blocks.append((self.types[hdr['Block Type Index'][j] & 0x7fff], None))
                break
        if self.error is None:
            ft = r.read_fields(S.structs['Footer'], None, None, None, {})
            self.roots = ft['Roots']
            self.trailing = len(data) - r.p
            if self.trailing != 0:
                self.error = 'trailing bytes %d' % self.trailing
        self.size = len(data)

    def s(self, idx):
        """resolve a 'string' struct value / index"""
        if isinstance(idx, str):
            return idx
        if isinstance(idx, dict):
            idx = idx.get('Index')
        if isinstance(idx, tuple):
            idx = idx[0]
        if idx is None or idx == 0xFFFFFFFF or idx < 0:
            return None
        return self.strings[idx]


def short(v, depth=0):
    if isinstance(v, (bytes, bytearray)):
        return '<%d bytes>' % len(v)
    if isinstance(v, list):
        if len(v) > 6:
            return '[%d items: %s ...]' % (len(v), ', '.join(short(x, depth + 1) for x in v[:3]))
        return '[' + ', '.join(short(x, depth + 1) for x in v) + ']'
    if isinstance(v, tuple):
        return '(' + ','.join('%.4g' % x if isinstance(x, float) else str(x) for x in v) + ')'
    if isinstance(v, dict):
        return '{' + ', '.join('%s: %s' % (k, short(x, depth + 1)) for k, x in v.items() if not k.startswith('_')) + '}'
    if isinstance(v, float):
        return '%.5g' % v
    return repr(v)


if __name__ == '__main__':
    n = NifFile(sys.argv[1])
    print('blocks', len(n.blocks), 'error', n.error)
    if '--dump' in sys.argv:
        for i, (t, b) in enumerate(n.blocks):
            if b is None:
                print(i, t, 'UNPARSED')
                continue
            nm = n.s(b.get('Name')) if 'Name' in b else ''
            print('%d %s %r' % (i, t, nm))
            for k, v in b.items():
                if k.startswith('_'):
                    continue
                print('    %s = %s' % (k, short(v)[:300]))

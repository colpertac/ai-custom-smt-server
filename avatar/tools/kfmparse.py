#!/usr/bin/env python3
"""Parse Gamebryo KFM 2.1.0.0b (per kfm.xml)."""
import struct, sys


def parse_kfm(path):
    d = open(path, 'rb').read()
    p = d.index(b'\n') + 1
    hdr = d[:p - 1].decode('latin1')

    def u32():
        nonlocal p
        v = struct.unpack_from('<i', d, p)[0]; p += 4; return v

    def f32():
        nonlocal p
        v = struct.unpack_from('<f', d, p)[0]; p += 4; return v

    def sstr():
        nonlocal p
        n = u32(); s = d[p:p + n].decode('cp932', 'replace'); p += n; return s
    endian = d[p]; p += 1
    k = {'header': hdr, 'nif': sstr().lstrip('/'), 'master': sstr(), 'i1': u32(), 'i2': u32(), 'f1': f32(), 'f2': f32()}
    n = u32()
    anims = []
    for _ in range(n):
        a = {'event': u32(), 'kf': sstr().lstrip('/'), 'index': u32()}
        nt = u32()
        tr = []
        for _ in range(nt):
            t = {'anim': u32(), 'type': u32()}
            if t['type'] != 5:
                t['duration'] = f32()
                ni = u32()
                t['inter'] = [(u32(), sstr()) for _ in range(ni)]
                t['ntextkeypairs'] = u32()
            tr.append(t)
        a['transitions'] = tr
        anims.append(a)
    k['anims'] = anims
    k['tail'] = d[p:]
    return k


if __name__ == '__main__':
    k = parse_kfm(sys.argv[1])
    print(k['header'], '| nif:', k['nif'], '| master:', k['master'], k['i1'], k['i2'], k['f1'], k['f2'])
    print('num anims', len(k['anims']), 'tail bytes', len(k['tail']), k['tail'][:16])
    for a in sorted(k['anims'], key=lambda a: a['event']):
        types = {}
        for t in a['transitions']:
            types[t['type']] = types.get(t['type'], 0) + 1
        print('%5d %-50s idx=%d trans=%d types=%s' % (a['event'], a['kf'], a['index'], len(a['transitions']), types))

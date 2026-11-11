import struct, math, sys
class PE:
    def __init__(s, path):
        s.d = open(path,'rb').read()
        d=s.d
        pe = struct.unpack_from('<I',d,0x3c)[0]
        s.nsec = struct.unpack_from('<H',d,pe+6)[0]
        optsz = struct.unpack_from('<H',d,pe+20)[0]
        opt = pe+24
        s.ep = struct.unpack_from('<I',d,opt+16)[0]
        s.base = struct.unpack_from('<I',d,opt+28)[0]
        s.dd = [struct.unpack_from('<II',d,opt+96+8*i) for i in range(16)]
        s.secs=[]
        sh = opt+optsz
        for i in range(s.nsec):
            name = d[sh+40*i:sh+40*i+8].rstrip(b'\0').decode('latin1')
            vs,va,rs,ro,_,_,_,_,ch = struct.unpack_from('<IIIIIIHHI',d,sh+40*i+8)
            s.secs.append((name,va,vs,ro,rs,ch))
    def va2off(s, va):
        rva = va - s.base
        for n,v,vs,ro,rs,ch in s.secs:
            if v <= rva < v+max(vs,rs):
                if rva - v < rs: return ro + rva - v
                return None
        return None
    def off2va(s, off):
        for n,v,vs,ro,rs,ch in s.secs:
            if ro <= off < ro+rs: return s.base+v+off-ro
        return None
    def sec_of_va(s, va):
        rva=va-s.base
        for sec in s.secs:
            if sec[1]<=rva<sec[1]+max(sec[2],sec[4]): return sec[0]
    def cstr(s, va, maxlen=512):
        o=s.va2off(va)
        if o is None: return None
        e=s.d.find(b'\0',o,o+maxlen)
        return s.d[o:e]
def entropy(b):
    if not b: return 0
    c=[0]*256
    for x in b: c[x]+=1
    n=len(b); return -sum(v/n*math.log2(v/n) for v in c if v)

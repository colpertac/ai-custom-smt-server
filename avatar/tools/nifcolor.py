import sys,struct,collections
def hdr(d):
    p=d.index(b'\n')+1
    ver,=struct.unpack_from('<I',d,p);p+=4; p+=1  # endian
    uv,nb=struct.unpack_from('<II',d,p);p+=8
    nt,=struct.unpack_from('<H',d,p);p+=2
    types=[]
    for _ in range(nt):
        n,=struct.unpack_from('<I',d,p);p+=4;types.append(d[p:p+n].decode());p+=n
    idx=struct.unpack_from('<%dH'%nb,d,p);p+=2*nb
    ns,ml=struct.unpack_from('<II',d,p);p+=8
    strs=[]
    for _ in range(ns):
        n,=struct.unpack_from('<I',d,p);p+=4;strs.append(d[p:p+n].decode('latin1'));p+=n
    return strs,p
out=collections.Counter()
for fn in sys.argv[1:]:
    d=open(fn,'rb').read()
    try: strs,p=hdr(d)
    except Exception as e: continue
    for key in ('Color1','ModelColor'):
        if key not in strs: continue
        si=strs.index(key); pat=struct.pack('<I',si)
        i=d.find(pat,p)
        while i!=-1:
            v=struct.unpack_from('<4f',d,i+4)
            if all(-0.001<=x<=4 for x in v):
                out[(key,tuple(round(x,3) for x in v))]+=1; break
            i=d.find(pat,i+1)
for k,v in out.most_common(40): print(v,k)

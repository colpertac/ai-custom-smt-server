import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifparse import NifFile
n = NifFile(sys.argv[1]); B = n.blocks
showhidden = '--all' in sys.argv
def ed(b):
    out=[]
    for e in b.get('Extra Data List', []):
        t, x = B[e]
        if t=='NiStringExtraData': out.append(repr((x.get('String Data') or '').replace('\r\n','|')))
        else: out.append('%s:%s'%(t, x.get('Name')))
    return ' '.join(out)
def walk(i, d):
    t, b = B[i]
    nm = b.get('Name')
    hid = 'NiHide' in ed(b)
    if (nm or '').startswith('Biped Object') and not showhidden: return
    extra = ''
    if t in ('NiTriShape','NiTriStrips'):
        md=b.get('Material Data') or {}
        extra = ' shader=%s skin=%s props=%s' % (md.get('Shader Name') if md.get('Has Shader') else None, b.get('Skin Instance'), [B[p][0] for p in b.get('Properties',[])])
    print('%s%s [%d %s] T=(%.2f,%.2f,%.2f) S=%.3g flags=%s %s%s' % ('  '*d, nm, i, t, *b.get('Translation',(0,0,0)), b.get('Scale',1), b.get('Flags'), ed(b)[:80], extra))
    for c in b.get('Children', []):
        if c >= 0: walk(c, d+1)
for r in n.roots: walk(r, 0)

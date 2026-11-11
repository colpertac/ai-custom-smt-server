#!/usr/bin/env python3
"""Decode the client tables the avatar resolver needs into build/tables/*.json.

  hair.json / face.json / eye.json   appearance id -> nif filename (CEquip*Data.bin, plaintext)
  models.json                        CModelData1 id -> model name + root scale (SkinType -> skeleton)
  cequipmodel.json                   model id -> [[folder, type, value], ...] (type 1 mesh, 2 hide, 3 variant)
  items.json                         item id -> name, modelID, equipType, gender, sub-category, ...
  palette.json                       hair/eye colour id 1..139 -> RGBA (hard-coded switch in the exe)

The .sbin tables are decrypted with comp_decrypt and unpacked with comp_bdpatch
(COMP_TOOLS_DIR). Nothing here modifies the client install.

Usage: python3 tables.py [--keep-xml]
"""
import json, os, struct, subprocess, sys, xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BINARYDATA_DIR, CLIENT_EXE, COMP_TOOLS_DIR, TABLES_DIR
from pe import PE


def appearance_table(name):
    """CEquip{Hair,Face,Eye}Data.bin: u32 count, then {u32 id; char nif[36]}."""
    data = open(os.path.join(BINARYDATA_DIR, 'Client', name), 'rb').read()
    count = struct.unpack_from('<I', data)[0]
    out = {}
    for i in range(count):
        off = 4 + i * 40
        id_ = struct.unpack_from('<I', data, off)[0]
        out[id_] = data[off + 4:off + 40].split(b'\0', 1)[0].decode('ascii')
    return out


def model_table():
    """CModelData1.bin (plaintext): u16 count, u16 1, u16 motionCount[count], then per record a
    104-byte base {u32 id, u32, f32 scale, f32, u8, u8, u16, char name[36], ...}, a 52-byte view
    block and motionCount 32-byte motion-map entries. Player SkinType values (100-102, 200-202) are
    ids here: name = Avatar/Bone skeleton, scale = root uniform scale."""
    data = open(os.path.join(BINARYDATA_DIR, 'Client', 'CModelData1.bin'), 'rb').read()
    count = struct.unpack_from('<H', data)[0]
    motions = struct.unpack_from(f'<{count}H', data, 4)
    off, out = 4 + 2 * count, {}
    for i in range(count):
        id_, _, scale = struct.unpack_from('<IIf', data, off)
        name = data[off + 20:off + 56].split(b'\0', 1)[0].decode('cp932', 'replace')
        if name:
            out[id_] = {'name': name, 'scale': round(scale, 6)}
        off += 104 + 52 + 32 * motions[i]
    if off != len(data):
        raise SystemExit(f'CModelData1.bin: parsed {off} of {len(data)} bytes')
    return out


def unpack_sbin(name, bdtype, work):
    src = os.path.join(BINARYDATA_DIR, 'Shield', name)
    plain = os.path.join(work, name + '.plain')
    xml = os.path.join(work, name + '.xml')
    subprocess.run([os.path.join(COMP_TOOLS_DIR, 'comp_decrypt'), src, plain], check=True,
                   stdout=subprocess.DEVNULL)
    subprocess.run([os.path.join(COMP_TOOLS_DIR, 'comp_bdpatch'), 'load', bdtype, plain, xml],
                   check=True, stdout=subprocess.DEVNULL)
    os.remove(plain)
    return xml


def member(el, path):
    x = el.find(path)
    return x.text if x is not None else None


def cequipmodel(xml):
    rows = {}
    for _, el in ET.iterparse(xml):
        if el.tag == 'object' and el.get('name') == 'MiCEquipModelData':
            id_ = int(el.find("member[@name='ID']").text)
            procs = []
            for i, e in enumerate(el.find("member[@name='procInfo']")):
                o = e.find('object')
                t = int(o.find("member[@name='type']").text)
                v = o.find("member[@name='value']").text or ''
                if t or v:
                    procs.append([i, t, v])
            rows[id_] = procs
            el.clear()
    return rows


def items(item_xml, citem_xml):
    res = {}
    for _, el in ET.iterparse(citem_xml):
        if el.tag == 'object' and el.get('name') == 'MiCItemData':
            b = el.find("member[@name='baseData']/object")
            i = int(member(b, "member[@name='ID']"))
            sp = el.find("member[@name='specialEffectData']/object")
            res[i] = dict(
                name=member(b, "member[@name='name']"),
                name2=member(b, "member[@name='name2']"),
                modelID=int(member(b, "member[@name='modelID']")),
                category=int(member(b, "member[@name='category']")),
                icon=int(member(b, "member[@name='icon']")),
                color=[int(e.text) for e in sp.findall("member[@name='effectColor']/element")] if sp is not None else None,
            )
            el.clear()
    for _, el in ET.iterparse(item_xml):
        if el.tag == 'object' and el.get('name') == 'MiItemData':
            i = int(member(el, "member[@name='common']/object/member[@name='id']"))
            b = el.find("member[@name='basic']/object")
            cat = "member[@name='common']/object/member[@name='category']/object/member[@name='%s']"
            res.setdefault(i, {}).update(
                baseID=int(member(b, "member[@name='baseID']")),
                appearanceID=int(member(b, "member[@name='appearanceID']")),
                weaponType=member(b, "member[@name='weaponType']"),
                equipType=member(b, "member[@name='equipType']"),
                gender=int(member(el, "member[@name='restriction']/object/member[@name='gender']")),
                cat=[int(member(el, cat % k)) for k in ('mainCategory', 'subCategory')],
            )
            el.clear()
    return res


# Colour-id switch in ImagineClient.exe (ColorId, called through thunk 0x40cac2).
# Each case stores R, G, B floats into the stack, then jumps to a shared tail that sets alpha 1.0.
PALETTE_JUMP_TABLE = 0x462ac8
PALETTE_CASES = 0x8b
PALETTE_TAIL = 0x462a98


def palette():
    p = PE(CLIENT_EXE)
    out = []
    for i in range(PALETTE_CASES):
        va = case = struct.unpack_from('<I', p.d, p.va2off(PALETTE_JUMP_TABLE + 4 * i))[0]
        regs, steps = {}, 0
        while va != PALETTE_TAIL and steps < 20:
            steps += 1
            o = p.va2off(va)
            b = p.d[o:o + 8]
            if b[:3] == b'\xc7\x44\x24':       # mov dword [esp+disp8], imm32
                regs[b[3]] = struct.unpack_from('<I', b, 4)[0]
                va += 8
            elif b[0] == 0xe9:                  # jmp rel32
                va = va + 5 + struct.unpack_from('<i', b, 1)[0]
            elif b[0] == 0xeb:                  # jmp rel8
                va = va + 2 + struct.unpack_from('<b', b, 1)[0]
            else:
                raise SystemExit(f'palette: unhandled instruction at {va:#x}: {b.hex()}')
        rgb = [struct.unpack('<f', struct.pack('<I', regs[k]))[0] for k in (0xc, 0x10, 0x14)]
        out.append({'id': i + 1, 'case': hex(case), 'rgba': rgb + [1.0],
                    'hex': '#%02x%02x%02x' % tuple(min(255, round(x * 256)) for x in rgb)})
    return out


def main():
    os.makedirs(TABLES_DIR, exist_ok=True)
    work = os.path.join(TABLES_DIR, 'xml')
    os.makedirs(work, exist_ok=True)

    def dump(name, obj):
        path = os.path.join(TABLES_DIR, name)
        json.dump(obj, open(path, 'w'), ensure_ascii=False, indent=None if len(obj) > 200 else 1)
        print(f'{name}: {len(obj)} rows')

    dump('hair.json', appearance_table('CEquipHairData.bin'))
    dump('face.json', appearance_table('CEquipFaceData.bin'))
    dump('eye.json', appearance_table('CEquipEyeData.bin'))
    dump('models.json', model_table())
    dump('cequipmodel.json', cequipmodel(unpack_sbin('CEquipModelData.sbin', 'cequipmodel', work)))
    dump('items.json', items(unpack_sbin('ItemData.sbin', 'item', work),
                             unpack_sbin('CItemData.sbin', 'citem', work)))
    dump('palette.json', palette())

    if '--keep-xml' not in sys.argv:
        for f in os.listdir(work):
            os.remove(os.path.join(work, f))
        os.rmdir(work)


if __name__ == '__main__':
    main()

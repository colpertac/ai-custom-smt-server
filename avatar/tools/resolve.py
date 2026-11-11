#!/usr/bin/env python3
"""Resolve a world-DB character into Avatar/<folder>/*.nif parts plus colours.

Prototype of the rule the website resolver will implement. Reads decoded tables
from build/tables (run tables.py first) and the world DB read-only.

Usage: python3 resolve.py NAME... [--json]
"""
import json, os, sqlite3, struct, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import AVATAR_DIR, TABLES_DIR, WORLD_DB

# CEquipModelData procInfo index -> Avatar folder.
FOLDERS = ['Hair', 'Face', 'Eyes', 'NeckM', 'Body', 'GloveR', 'GloveL', 'Legs', 'Feet', 'HairAcce',
           'FaceAcce', 'EarringR', 'EarringL', 'HairAcceM', 'HandR', 'HandL', 'RingR', 'RingL',
           'ExtraA', 'ExtraB', 'ExtraC', 'ExtraD', 'ExtraE', 'ExtraF', 'R', 'L']
# Character.EquippedItems order.
EQUIP_SLOTS = ['head', 'face', 'neck', 'top', 'arms', 'bottom', 'feet', 'comp', 'ring', 'earring',
               'extra', 'back', 'talisman', 'weapon', 'bullets']
WEAPON_SLOT = 13
EQUIP_TYPES = {'EQUIP_TYPE_' + n.upper(): i for i, n in enumerate(EQUIP_SLOTS)}
# ImagineClient.exe tables (VA 0x87f29c8, 0x87f307c): equip slots in merge order.
MERGE_ORDER = [3, 0, 5, 7, 4, 6, 10, 1, 2, 13, 8, 9, 11, 12, 14]
VA_CHECK_ORDER = MERGE_ORDER[:13]
# 0x467c20: folder -> equip slot that owns it (None = base layer Hair/Face/Eyes).
FOLDER_OWNER = [None, None, None, 2, 3, 4, 4, 5, 6, 0, 1, 9, 9, 2, 7, 7, 8, 8, 11, 10, 11, 10, 10, 10, 13, 13]
# 0x45f420/0x45f6a0: setting (or hiding) these folders removes a later slot from the merge.
SET_SKIPS = {7: 5, 8: 6, 9: 0}
HIDE_SKIPS = {4: 3, 7: 5, 8: 6, 9: 0}
NO_R_FOLDER = {1586, 1594, 1595, 2303, 2346, 2347, 2348, 2349, 2350, 2351, 2383, 2805}  # 0x45cb30


def load_tables():
    def load(name):
        return json.load(open(os.path.join(TABLES_DIR, name)))
    return {
        'hair': load('hair.json'), 'face': load('face.json'), 'eye': load('eye.json'),
        'model': load('cequipmodel.json'), 'items': load('items.json'), 'models': load('models.json'),
        'palette': {p['id']: p['rgba'] for p in load('palette.json')},
    }


def load_character(db, name):
    row = db.execute(
        'select Gender, SkinType, HairType, FaceType, EyeType, HairColor, LeftEyeColor, RightEyeColor,'
        ' EquippedVA, EquippedItems from Character where Name = ?', (name,)).fetchone()
    if row is None:
        return None
    keys = ['Gender', 'SkinType', 'HairType', 'FaceType', 'EyeType', 'HairColor', 'LeftEyeColor', 'RightEyeColor']
    ch = dict(zip(keys, row[:8]))
    # EquippedVA: u32 count, then (u8 slot, u32 item type)*.
    va, n, off = row[8] or b'\0\0\0\0', 0, 4
    n = struct.unpack_from('<I', va)[0]
    ch['va'] = {}
    for _ in range(n):
        ch['va'][va[off]] = struct.unpack_from('<I', va, off + 1)[0]
        off += 5
    # EquippedItems: 15 item UUIDs (16 bytes each), zero when empty.
    ch['equip'] = {}
    for i in range(len(EQUIP_SLOTS)):
        raw = (row[9] or b'')[i * 16:(i + 1) * 16]
        if len(raw) == 16 and any(raw):
            item = db.execute('select Type from Item where UID = ?', (str(uuid.UUID(bytes=bytes(raw))),)).fetchone()
            if item:
                ch['equip'][i] = item[0]
    return ch


def skeleton(ch, t):
    """SkinType is a CModelData1 id: 100-102 male, 200-202 female, last digit = body type A/B/C.
    The skeleton is loaded by the CModelData name; each body type has its own KF set
    ({M,W}_0{1,2,3}_*), and character creation plays 510 Common_SampleStay."""
    skin = ch['SkinType']
    rec = t['models'].get(str(skin))
    if rec is None or skin % 100 > 2:
        return None
    prefix = f"{'W' if skin >= 200 else 'M'}_0{skin % 100 + 1}"
    return {'nif': f"Bone/{rec['name']}.nif", 'scale': rec['scale'],
            'idle': f'Bone/{prefix}_510_Common_SampleStay_01.kf'}


def variant(filename, suffix):
    """0x45cbd0/0x45f420: replace '_A' in '_A.' with suffix, else insert suffix before the first '.'."""
    i = filename.find('_A.')
    if i >= 0:
        return filename[:i] + suffix + filename[i + 2:]
    j = filename.find('.')
    return filename[:j] + suffix + filename[j:]


def is_weapon_va(slot):
    return slot == WEAPON_SLOT or 15 <= slot <= 30


def merge_va(ch, t):
    """0x488210 + 0x4878b0 (param_4=1, character select / portrait): equip slot -> drawn item."""
    items = t['items']
    def sub(i): return items.get(str(i), {}).get('cat', [0, 0])[1]
    def va_slot(i):  # 0x467d10
        return sub(i) - 8 if 0x17 <= sub(i) <= 0x26 else EQUIP_TYPES.get(items.get(str(i), {}).get('equipType'))
    def row(i): return t['model'].get(str(items.get(str(i), {}).get('modelID')))
    equip = {s: i for s, i in ch['equip'].items() if i not in (None, -1, 0xffffffff)}
    wsub = sub(equip[WEAPON_SLOT]) if WEAPON_SLOT in equip else 0x17
    va = {s: i for s, i in sorted(ch['va'].items())
          if i not in (-1, 0xffffffff) and (not is_weapon_va(s) or sub(i) == wsub)}
    out, locked, notes = dict(equip), False, []
    for s, i in va.items():
        if not is_weapon_va(s):
            out[s] = i
        elif s == 15 and WEAPON_SLOT not in equip:
            out[WEAPON_SLOT], locked = i, True
        elif not locked and WEAPON_SLOT in equip and str(i) in items and sub(equip[WEAPON_SLOT]) == sub(i):
            out[WEAPON_SLOT] = i
    # A real item that reaches into another slot's folder is dropped when a VA item owns that folder.
    for c in VA_CHECK_ORDER:
        i = equip.get(c)
        if i is None or (va_slot(i) if c == WEAPON_SLOT else c) in va or row(i) is None:
            continue
        for f, kind, _ in row(i):
            s = FOLDER_OWNER[f]
            if kind in (0, 3) or s is None or s == c:
                continue
            if s == WEAPON_SLOT:
                wv = va_slot(equip[WEAPON_SLOT]) if WEAPON_SLOT in equip else 15
                hit = wv in va
            else:
                hit = False
                for vi in va.values():
                    r2 = row(vi)
                    if r2 is None:
                        hit = EQUIP_TYPES.get(items.get(str(vi), {}).get('equipType')) == s
                    else:
                        k2 = {ff: kk for ff, kk, _ in r2}.get(f, 0)
                        hit = k2 == 1 or (k2 == 2 and kind != 2)
                    if hit:
                        break
            if hit:
                notes.append(f'{EQUIP_SLOTS[c]} item {i} dropped: VA owns {FOLDERS[f]}')
                out.pop(c, None)
                if c == 7:
                    out[7] = -1
    return out, notes


def resolve(ch, t):
    g = 'W' if ch['Gender'] == 1 else 'M'
    rec = {}  # folder -> [mode, file, why]; mode 1 base, 2 set, 3 hidden, 4 variant pending
    if ch['SkinType'] in (100, 101, 102, 200, 201, 202):  # 0x460360
        for f, p in [(4, 'Body'), (7, 'Legs'), (6, 'GloveL'), (5, 'GloveR'), (8, 'Feet')]:
            rec[f] = [1, f'{g}_01_{p}_Skin_001.nif', 'exe default skin']
        rec[15] = [1, f'{g}_01_HandL_H_010.nif', 'exe default HandL']
    for f, key, tab in [(0, 'HairType', 'hair'), (2, 'EyeType', 'eye'), (1, 'FaceType', 'face')]:
        if t[tab].get(str(ch[key])):
            rec[f] = [1, t[tab][str(ch[key])], f'base {key}={ch[key]}']

    drawn, notes = merge_va(ch, t)
    skip, rl = set(), set()
    for s in MERGE_ORDER:  # 0x45fe20
        if s not in drawn:
            continue
        if s in skip:
            notes.append(f'{EQUIP_SLOTS[s]} item {drawn[s]} skipped: an earlier slot set/hid its folder')
            continue
        item = drawn[s]
        info = t['items'].get(str(item), {})
        row = t['model'].get(str(info.get('modelID')))
        src = 'VA' if item != ch['equip'].get(s) else 'EQ'
        label = f"{EQUIP_SLOTS[s]} {src}={item} ({info.get('name')}) model={info.get('modelID')}"
        if row is None:
            notes.append(f'{label}: no CEquipModelData row, contributes nothing')
            continue
        for f, kind, value in sorted(row):
            r = rec.setdefault(f, [0, '', ''])
            mode = r[0]
            if kind == 1:
                if mode in (0, 1):
                    if (f == 24 and item in NO_R_FOLDER) or \
                       (f == 9 and item in (23207, 23209) and drawn.get(0) in (33011, 33012)):
                        continue
                    rec[f] = [2, value, label]
                    if f in SET_SKIPS:
                        skip.add(SET_SKIPS[f])
                    if f in (24, 25):
                        rl.add(f)
                        if rl == {24, 25}:
                            skip.add(WEAPON_SLOT)
                elif mode == 4:
                    rec[f] = [2, variant(value, r[1]), f'{label} + variant {r[1]}']
                else:
                    notes.append(f'{label}: {FOLDERS[f]} already {"set" if mode == 2 else "hidden"} by {r[2]}')
            elif kind == 2:
                if mode in (0, 1):
                    rec[f] = [3, '', 'hidden by ' + label]
                    if f in HIDE_SKIPS:
                        skip.add(HIDE_SKIPS[f])
                    if f in (24, 25):
                        rl.add(f)
                        if rl == {24, 25}:
                            skip.add(WEAPON_SLOT)
            elif kind == 3:
                if mode == 0:
                    rec[f] = [4, '_' + value, label]
                elif mode == 2 or (mode == 1 and f != 7):
                    r[1], r[2] = variant(r[1], '_' + value), f'{r[2]} + variant _{value} from {label}'
    # 0x460590: modes 1/2 load the file (nothing if it does not exist), anything else draws nothing.
    parts = {f: (r[1] if r[0] in (1, 2) else None, r[2] or 'variant with no base') for f, r in rec.items()}

    pal = t['palette']
    right = ch['RightEyeColor']
    left = ch['LeftEyeColor'] or right
    return {
        'gender': g,
        'skinType': ch['SkinType'],
        'skeleton': skeleton(ch, t),
        'parts': {FOLDERS[i]: {'file': f, 'why': why,
                               'exists': bool(f) and os.path.exists(os.path.join(AVATAR_DIR, FOLDERS[i], f))}
                  for i, (f, why) in sorted(parts.items())},
        'colors': {'hair': pal.get(ch['HairColor'], [0, 0, 0, 1]),
                   'eyeRight': pal.get(right, [0, 0, 0, 1]),
                   'eyeLeft': pal.get(left, [0, 0, 0, 1])},
        'notes': notes,
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    t = load_tables()
    db = sqlite3.connect(f'file:{WORLD_DB}?mode=ro', uri=True)
    out = {}
    for name in args:
        ch = load_character(db, name)
        if ch is None:
            print(f'{name}: not found', file=sys.stderr)
            continue
        out[name] = r = resolve(ch, t)
        if '--json' in sys.argv:
            continue
        print(f"### {name}  gender={r['gender']} skin={r['skinType']} hair={ch['HairColor']} "
              f"eyeL/R={ch['LeftEyeColor']}/{ch['RightEyeColor']}")
        print(f"  skeleton  {r['skeleton']}")
        for folder, p in r['parts'].items():
            path = f"{folder}/{p['file']}" if p['file'] else '-'
            flag = '' if not p['file'] or p['exists'] else 'MISSING'
            print(f'  {folder:9s} {path:42s} {flag:7s} # {p["why"]}')
        for n in r['notes']:
            print('  NOTE', n)
        print()
    if '--json' in sys.argv:
        json.dump(out, sys.stdout, indent=1)


if __name__ == '__main__':
    main()

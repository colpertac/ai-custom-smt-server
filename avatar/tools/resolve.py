#!/usr/bin/env python3
"""Resolve a world-DB character into Avatar/<folder>/*.nif parts plus colours.

Prototype of the rule the website resolver will implement. Reads decoded tables
from build/tables (run tables.py first) and the world DB read-only.

Usage: python3 resolve.py NAME... [--policy slot-order|first-wins] [--json]
"""
import json, os, re, sqlite3, struct, sys, uuid
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
WEAPON_VA_SLOT = 24


def load_tables():
    def load(name):
        return json.load(open(os.path.join(TABLES_DIR, name)))
    return {
        'hair': load('hair.json'), 'face': load('face.json'), 'eye': load('eye.json'),
        'model': load('cequipmodel.json'), 'items': load('items.json'),
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


def variant(filename, letter):
    m = re.match(r'(.*)_([A-Z])\.nif$', filename)
    return f'{m.group(1)}_{letter}.nif' if m else filename[:-4] + f'_{letter}.nif'


def resolve(ch, t, policy='slot-order'):
    g = 'W' if ch['Gender'] == 1 else 'M'
    parts = {
        0: (t['hair'].get(str(ch['HairType'])), f"base HairType={ch['HairType']}"),
        1: (t['face'].get(str(ch['FaceType'])), f"base FaceType={ch['FaceType']}"),
        2: (t['eye'].get(str(ch['EyeType'])), f"base EyeType={ch['EyeType']}"),
    }
    for i, p in [(4, 'Body'), (5, 'GloveR'), (6, 'GloveL'), (7, 'Legs'), (8, 'Feet')]:
        parts[i] = (f'{g}_01_{p}_Skin_001.nif', 'exe default skin')
    parts[15] = (f'{g}_01_HandL_H_010.nif', 'exe default HandL')

    notes, owner, variants = [], {}, {}
    for s in range(len(EQUIP_SLOTS)):
        va_slot = WEAPON_VA_SLOT if s == WEAPON_SLOT else s
        # A weapon VA is only drawn over a real equipped weapon.
        if va_slot in ch['va'] and (s != WEAPON_SLOT or ch['equip'].get(WEAPON_SLOT)):
            item, src = ch['va'][va_slot], f'VA[{va_slot}]'
        elif ch['equip'].get(s):
            item, src = ch['equip'][s], f'EQ[{s}].Type'
        else:
            continue
        info = t['items'].get(str(item), {})
        model_id = info.get('modelID')
        row = t['model'].get(str(model_id))
        label = f"{EQUIP_SLOTS[s]} {src}={item} ({info.get('name')}) model={model_id}"
        if row is None:
            notes.append(f'{label}: no CEquipModelData row, contributes nothing')
            continue
        for folder, kind, value in row:
            if kind in (1, 2) and folder in owner and owner[folder] != s:
                notes.append(f'CONFLICT {FOLDERS[folder]}: {EQUIP_SLOTS[owner[folder]]} vs {EQUIP_SLOTS[s]} (policy={policy})')
                if policy == 'first-wins':
                    continue
            if kind == 1:
                parts[folder] = (value, label)
                owner[folder] = s
            elif kind == 2:
                parts[folder] = (None, 'hidden by ' + label)
                owner[folder] = s
            elif kind == 3:
                variants[folder] = (value, label)
    for folder, (letter, label) in variants.items():
        if parts.get(folder, (None,))[0]:
            f, why = parts[folder]
            parts[folder] = (variant(f, letter), f'{why} + variant _{letter} from {label}')

    pal = t['palette']
    right = ch['RightEyeColor']
    left = ch['LeftEyeColor'] or right
    return {
        'gender': g,
        'skinType': ch['SkinType'],
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
    policy = 'first-wins' if '--policy=first-wins' in sys.argv or 'first-wins' in sys.argv else 'slot-order'
    args = [a for a in args if a not in ('slot-order', 'first-wins')]
    t = load_tables()
    db = sqlite3.connect(f'file:{WORLD_DB}?mode=ro', uri=True)
    out = {}
    for name in args:
        ch = load_character(db, name)
        if ch is None:
            print(f'{name}: not found', file=sys.stderr)
            continue
        out[name] = r = resolve(ch, t, policy)
        if '--json' in sys.argv:
            continue
        print(f"### {name}  gender={r['gender']} skin={r['skinType']} hair={ch['HairColor']} "
              f"eyeL/R={ch['LeftEyeColor']}/{ch['RightEyeColor']}  policy={policy}")
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

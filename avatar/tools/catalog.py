#!/usr/bin/env python3
"""Write the avatar resolver catalog: everything resolve.py looks up, in one compact JSON, so the
website resolver (website/lib/avatar-recipe.ts) runs without the client install.

  version     CATALOG_VERSION (bump when the shape changes)
  hair, face, eye   appearance id -> nif filename (CEquip{Hair,Face,Eye}Data)
  skeletons   SkinType (CModelData1 id 100-102, 200-202) -> {name, scale}
  palette     colour id -> [r, g, b, a]
  items       item id -> [modelID, subCategory, equipSlot, name]  (itemFields), equippable items only:
              equipType EQUIP_TYPE_* (equipSlot = Character.EquippedItems index), or a CEquipModelData
              row for modelID, plus the Hidden VA items 45011-45022. Other items resolve as unknown.
  models      CEquipModelData id -> [[folder, type, value], ...] for every modelID in items
  files       Avatar folder -> sorted names of the entries in <client>/Avatar/<folder> (for `exists`)

Reads build/tables (run tables.py first) and the client's Avatar folder.

Usage: python3 catalog.py [--out PATH]      (default build/assets/catalog.json)
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import AVATAR_DIR, BUILD_DIR
from resolve import EQUIP_TYPES, FOLDERS, load_tables

CATALOG_VERSION = 1
SKIN_TYPES = (100, 101, 102, 200, 201, 202)
HIDDEN_VA = range(45011, 45023)
ITEM_FIELDS = ['modelID', 'subCategory', 'equipSlot', 'name']


def build(t):
    items = {}
    for k, v in t['items'].items():
        slot = EQUIP_TYPES.get(v.get('equipType'))
        if slot is None and str(v.get('modelID')) not in t['model'] and int(k) not in HIDDEN_VA:
            continue
        items[int(k)] = [v.get('modelID'), v.get('cat', [0, 0])[1], slot, v.get('name')]
    models = {m: t['model'][str(m)] for m in sorted({i[0] for i in items.values() if i[0] is not None})
              if str(m) in t['model']}
    files = {}
    for f in FOLDERS:
        d = os.path.join(AVATAR_DIR, f)
        if os.path.isdir(d):
            files[f] = sorted(os.listdir(d))
    return {
        'version': CATALOG_VERSION,
        'itemFields': ITEM_FIELDS,
        'hair': {int(k): v for k, v in t['hair'].items()},
        'face': {int(k): v for k, v in t['face'].items()},
        'eye': {int(k): v for k, v in t['eye'].items()},
        'skeletons': {s: t['models'][str(s)] for s in SKIN_TYPES if str(s) in t['models']},
        'palette': dict(sorted(t['palette'].items())),
        'items': dict(sorted(items.items())),
        'models': models,
        'files': files,
    }


def dumps(cat):
    """Compact JSON, one top-level key per line and one entry per line in the big maps (diffable)."""
    def c(x):
        return json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    lines = []
    for k, v in cat.items():
        if isinstance(v, dict) and k in ('items', 'models', 'palette', 'files'):
            body = ',\n'.join(f'{c(str(kk))}:{c(vv)}' for kk, vv in v.items())
            lines.append(f'{c(k)}:{{\n{body}\n}}')
        else:
            lines.append(f'{c(k)}:{c(v)}')
    return '{\n' + ',\n'.join(lines) + '\n}\n'


def main():
    args = sys.argv[1:]
    out = os.path.join(BUILD_DIR, 'assets', 'catalog.json')
    if '--out' in args:
        out = args[args.index('--out') + 1]
    cat = build(load_tables())
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    text = dumps(cat)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"{out}: {len(text.encode()):,} bytes; {len(cat['items'])} items, {len(cat['models'])} models, "
          f"{sum(map(len, cat['files'].values()))} files in {len(cat['files'])} folders")


if __name__ == '__main__':
    main()

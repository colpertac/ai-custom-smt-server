#!/usr/bin/env python3
"""Write viewer recipes: resolve world-DB characters (resolve.py rules) and save each as
build/recipes/<name>.json, the input of avatar/viewer (buildScene).

The recipe is resolve.py's per-character JSON plus "name"; asset paths are derived from it by
the viewer as described in docs/FORMAT.md.

Usage: python3 recipe.py NAME... [--out DIR]
"""
import json, os, sqlite3, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BUILD_DIR, WORLD_DB
from resolve import load_character, load_tables, resolve


def main():
    args = sys.argv[1:]
    out_dir = os.path.join(BUILD_DIR, 'recipes')
    if '--out' in args:
        i = args.index('--out')
        out_dir = args[i + 1]
        del args[i:i + 2]
    names = [a for a in args if not a.startswith('--')]
    if not names:
        raise SystemExit(__doc__)
    t = load_tables()
    db = sqlite3.connect(f'file:{WORLD_DB}?mode=ro', uri=True)
    os.makedirs(out_dir, exist_ok=True)
    failed = 0
    for name in names:
        ch = load_character(db, name)
        if ch is None:
            print(f'{name}: not found', file=sys.stderr)
            failed += 1
            continue
        recipe = {'name': name, **resolve(ch, t)}
        path = os.path.join(out_dir, f'{name}.json')
        with open(path, 'w') as f:
            json.dump(recipe, f, indent=1, ensure_ascii=False)
        parts = sum(1 for p in recipe['parts'].values() if p['file'] and p['exists'])
        print(f'{name}: {parts} parts -> {path}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()

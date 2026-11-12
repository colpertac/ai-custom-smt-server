#!/usr/bin/env python3
"""Cross-check the website resolver (website/lib/avatar-recipe.ts) against resolve.py.

Resolves every character in the world DB (read only) with both, plus --fuzz N synthetic
characters (random appearance, equipment and VA drawn from the catalog, seeded), and diffs the
skeleton, part files, exists flags and colours. Differences in the explanatory `why` / `notes`
strings are counted separately. The TS side reads the DB itself (COMP_WORLD_DB = WORLD_DB) and
uses a catalog built from build/tables by catalog.py (or --catalog PATH, e.g. the baked copy).

--golden PATH writes the website's golden test fixture instead (website/lib/avatar-recipe.golden.json):
cat, catm, cat3, vam, vaf as {character, recipe} from resolve.py plus the catalog subset they touch.

Usage: python3 crosscheck_recipes.py [--fuzz N] [--seed S] [--catalog PATH] [-v]
       python3 crosscheck_recipes.py --golden PATH [NAME...]
Exit status 1 when any strict field differs.
"""
import json, os, random, sqlite3, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import REPO_ROOT, WORLD_DB
from catalog import build, dumps
from resolve import EQUIP_SLOTS, OVERRIDE_TOPS, load_character, load_tables, resolve

WEBSITE = os.path.join(REPO_ROOT, 'website')
TS_SCRIPT = 'scripts/avatar-recipe-crosscheck.ts'
SPECIAL_ITEMS = [1586, 1594, 2303, 2805, 23207, 23209, 33011, 33012] + list(range(45011, 45023))
# Stance overrides (0x466c50): OVERRIDE_TOPS plus items with CItemData motion data, including ones whose
# idle sequence only the female KFMs have (720/723/735/740 → stance None on male skeletons).
SPECIAL_ITEMS += sorted(OVERRIDE_TOPS) + [1538, 1669, 2123, 2324, 4052, 4053, 4068, 5450, 5451, 6621, 23081,
                                          23587, 25536, 3376]


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def to_ts(ch):
    return {'gender': ch['Gender'], 'skinType': ch['SkinType'], 'hairType': ch['HairType'],
            'faceType': ch['FaceType'], 'eyeType': ch['EyeType'], 'hairColor': ch['HairColor'],
            'leftEyeColor': ch['LeftEyeColor'], 'rightEyeColor': ch['RightEyeColor'],
            'va': ch['va'], 'equip': ch['equip']}


def fuzz_characters(cat, n, seed):
    rnd = random.Random(seed)
    by_slot = {}
    for i, (_, _, slot, _) in cat['items'].items():
        by_slot.setdefault(slot, []).append(i)
    weapons = by_slot.get(13, [])
    all_items = list(cat['items'])

    def pick(slot):
        r = rnd.random()
        if r < 0.05:
            return rnd.choice(SPECIAL_ITEMS)
        if r < 0.10:
            return rnd.choice(all_items)
        return rnd.choice(by_slot.get(slot) or all_items)

    out = {}
    for k in range(n):
        ch = {'Gender': rnd.choice([0, 1]),
              'SkinType': rnd.choice([100, 101, 102, 200, 201, 202] * 4 + [0, 103, 300, 1]),
              'HairType': rnd.choice(list(cat['hair']) + [0, 999]),
              'FaceType': rnd.choice(list(cat['face']) + [0, 999]),
              'EyeType': rnd.choice(list(cat['eye']) + [0, 999]),
              'HairColor': rnd.randint(0, 141), 'LeftEyeColor': rnd.choice([0, rnd.randint(0, 141)]),
              'RightEyeColor': rnd.randint(0, 141), 'equip': {}, 'va': {}}
        for s in range(len(EQUIP_SLOTS)):
            if rnd.random() < 0.6:
                ch['equip'][s] = pick(s)
            if rnd.random() < 0.3:
                ch['va'][s] = pick(s)
        for s in range(15, 31):
            if weapons and rnd.random() < 0.08:
                ch['va'][s] = rnd.choice(weapons)
        out[f'fuzz{k}'] = ch
    return out


def strict(r):
    if r is None:
        return None
    return {'gender': r['gender'], 'skinType': r['skinType'], 'skeleton': r['skeleton'],
            'parts': {f: [p['file'], p['exists']] for f, p in r['parts'].items()},
            'colors': r['colors']}


def loose(r):
    return None if r is None else {'why': {f: p['why'] for f, p in r['parts'].items()}, 'notes': r['notes']}


def diff(a, b, path=''):
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for k in sorted(set(a) | set(b), key=str):
            out += diff(a.get(k, '<absent>'), b.get(k, '<absent>'), f'{path}.{k}')
        return out
    return [] if a == b else [f'{path}: py={a!r} ts={b!r}']


def write_golden(t, path, names):
    """Golden fixture: characters + resolve.py recipes + the catalog rows those characters touch."""
    full = build(t)
    db = sqlite3.connect(f'file:{WORLD_DB}?mode=ro', uri=True)
    sub = {'version': full['version'], 'itemFields': full['itemFields'], 'hair': {}, 'face': {}, 'eye': {},
           'skeletons': {}, 'palette': {}, 'items': {}, 'motions': {}, 'models': {}, 'files': {}}
    chars = {}
    for n in names:
        ch = load_character(db, n)
        if ch is None:
            sys.exit(f'{n}: not found')
        r = resolve(ch, t)
        chars[n] = {'character': to_ts(ch), 'recipe': r}
        for key, tab in (('HairType', 'hair'), ('FaceType', 'face'), ('EyeType', 'eye')):
            if ch[key] in full[tab]:
                sub[tab][ch[key]] = full[tab][ch[key]]
        if ch['SkinType'] in full['skeletons']:
            sub['skeletons'][ch['SkinType']] = full['skeletons'][ch['SkinType']]
        for c in ('HairColor', 'LeftEyeColor', 'RightEyeColor'):
            if ch[c] in full['palette']:
                sub['palette'][ch[c]] = full['palette'][ch[c]]
        for i in list(ch['equip'].values()) + list(ch['va'].values()):
            if i in full['items']:
                sub['items'][i] = full['items'][i]
                m = full['items'][i][0]
                if m in full['models']:
                    sub['models'][m] = full['models'][m]
            if i in full['motions']:
                sub['motions'][i] = full['motions'][i]
        for folder, p in r['parts'].items():
            if p['exists']:
                sub['files'].setdefault(folder, []).append(p['file'])
    for k in ('hair', 'face', 'eye', 'skeletons', 'palette', 'items', 'motions', 'models'):
        sub[k] = dict(sorted(sub[k].items()))
    sub['files'] = {f: sorted(set(v)) for f, v in sorted(sub['files'].items())}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'generatedBy': 'avatar/tools/crosscheck_recipes.py --golden', 'catalog': sub,
                   'characters': chars}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{path}: {len(chars)} characters, {len(sub["items"])} items, {len(sub["models"])} models')


def main():
    t = load_tables()
    if '--golden' in sys.argv:
        i = sys.argv.index('--golden')
        names = [a for a in sys.argv[i + 2:] if not a.startswith('-')] or ['cat', 'catm', 'cat3', 'vam', 'vaf']
        return write_golden(t, sys.argv[i + 1], names)
    cat_path = arg('--catalog', None)
    with tempfile.TemporaryDirectory() as tmp:
        if cat_path is None:
            cat_path = os.path.join(tmp, 'catalog.json')
            open(cat_path, 'w', encoding='utf-8').write(dumps(build(t)))
        cat = json.load(open(cat_path, encoding='utf-8'))
        cat['items'] = {int(k): v for k, v in cat['items'].items()}

        db = sqlite3.connect(f'file:{WORLD_DB}?mode=ro', uri=True)
        names = [r[0] for r in db.execute('select Name from Character order by Name')]
        py_names = {}
        for n in names:
            ch = load_character(db, n)
            py_names[n] = resolve(ch, t) if ch else None
        synth = fuzz_characters(cat, int(arg('--fuzz', '0')), int(arg('--seed', '1')))
        py_synth = {k: resolve(ch, t) for k, ch in synth.items()}

        inp = os.path.join(tmp, 'input.json')
        json.dump({'catalog': os.path.abspath(cat_path), 'names': names,
                   'characters': {k: to_ts(ch) for k, ch in synth.items()}}, open(inp, 'w'))
        env = dict(os.environ, COMP_WORLD_DB=os.path.abspath(WORLD_DB))
        proc = subprocess.run([os.path.join(WEBSITE, 'node_modules', '.bin', 'tsx'),
                               '--conditions=react-server', '--tsconfig', 'tsconfig.json', TS_SCRIPT, inp], cwd=WEBSITE, env=env,
                              capture_output=True, text=True)
        if proc.returncode:
            sys.exit(f'TS resolver failed:\n{proc.stderr}')
        ts = json.loads(proc.stdout)

    verbose = '-v' in sys.argv
    strict_bad, loose_bad = [], []
    for group, py, tsr in (('db', py_names, ts['names']), ('fuzz', py_synth, ts['characters'])):
        for k in py:
            a, b = json.loads(json.dumps(py[k])), tsr.get(k)
            d = diff(strict(a), strict(b))
            if d:
                strict_bad.append((group, k, d))
            elif diff(loose(a), loose(b)):
                loose_bad.append((group, k, diff(loose(a), loose(b))))
    print(f'characters: {len(py_names)} from {WORLD_DB}, {len(py_synth)} synthetic; catalog {cat_path}')
    print(f'strict mismatches (skeleton, files, exists, colours): {len(strict_bad)}')
    print(f'why/notes-only mismatches: {len(loose_bad)}')
    for group, k, d in strict_bad + (loose_bad if verbose else []):
        print(f'  {group} {k}:')
        for line in d[:20]:
            print('    ' + line)
    sys.exit(1 if strict_bad else 0)


if __name__ == '__main__':
    main()

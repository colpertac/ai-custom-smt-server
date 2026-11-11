#!/usr/bin/env python3
"""Render a world-DB character with the PoC software renderer: resolve.py picks the skeleton,
idle pose and parts; parts attach the way ImagineClient.exe does (0xae8230).

Hair/eye colour is not applied here (the PoC rasterizer only samples the base texture).

Usage: python3 render_char.py NAME [out.png]
"""
import os, sqlite3, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import AVATAR_DIR, BUILD_DIR, WORLD_DB
from nifparse import NifFile
from pose import sample_first, posed_world
from render import collect, raster, write_png
from resolve import load_character, load_tables, resolve

# CiAvatar slot tokens that skin to the skeleton (0xb19c50); every other token attaches rigidly
# under the skeleton node "H" + token (0xb19d90 / 0xb19e60).
SKINNED_TOKENS = {'Face', 'Body', 'GloveL', 'GloveR', 'Legs', 'Feet', 'ExtraA', 'NeckM', 'Hair',
                  'HairAcceM', 'ExtraD'}


def attach_node(filename):
    """The slot comes from the filename's third '_' token, not the folder (0xb19b20)."""
    token = filename.split('_')[2]
    return None if token in SKINNED_TOKENS else 'H' + token


def main():
    name = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BUILD_DIR, 'renders', f'{name}.png')
    db = sqlite3.connect(f'file:{WORLD_DB}?mode=ro', uri=True)
    ch = load_character(db, name)
    if ch is None:
        raise SystemExit(f'{name}: not found')
    r = resolve(ch, load_tables())
    sk = r['skeleton']
    skel = NifFile(os.path.join(AVATAR_DIR, sk['nif']))
    pose = sample_first(NifFile(os.path.join(AVATAR_DIR, sk['idle'])))[0]
    W = posed_world(skel, pose)
    meshes = []
    for folder, p in r['parts'].items():
        if not p['file'] or not p['exists']:
            continue
        meshes += collect(os.path.join(AVATAR_DIR, folder, p['file']), attach_node(p['file']), W)
    w1, h1, a = raster(meshes, 'front')
    w2, h2, b = raster(meshes, 'side')
    comb = bytearray()
    for y in range(h1):
        comb += a[y * w1 * 3:(y + 1) * w1 * 3] + b[y * w2 * 3:(y + 1) * w2 * 3]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_png(out, w1 + w2, h1, comb)
    print(f"{name}: {sk['nif']} + {sk['idle']}, {len(meshes)} meshes -> {out}")


if __name__ == '__main__':
    main()

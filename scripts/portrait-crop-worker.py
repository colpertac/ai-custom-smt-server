#!/usr/bin/env python3
"""Thin Path 1 portrait crop helper.

Watch a drop folder for OS screenshots, emit several crop candidates, then
ingest the one you like via the website queue CLI.

Examples:
  python3 scripts/portrait-crop-worker.py crop ~/repos/smt/va_screenshots/Screenshot_….png
  python3 scripts/portrait-crop-worker.py watch
  python3 scripts/portrait-crop-worker.py watch --inbox /home/cat/repos/smt/va_screenshots

After picking a candidate:
  cd website && npm run portrait-queue -- ingest ../work/portrait-crops/….png <fingerprint>
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INBOX = Path("/home/cat/repos/smt/va_screenshots")
DEFAULT_OUT = ROOT / "work" / "portrait-crops"

# Zone 10105 / void studio samples from proven crops.
VOID_COLORS = (
    (32, 32, 53),
    (47, 47, 66),
    (38, 41, 47),
    (0, 0, 0),
)


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    def clamp(self, w: int, h: int) -> "Box":
        return Box(
            max(0, min(self.left, w)),
            max(0, min(self.top, h)),
            max(0, min(self.right, w)),
            max(0, min(self.bottom, h)),
        )

    def pad(self, amount: int, w: int, h: int) -> "Box":
        return Box(
            self.left - amount,
            self.top - amount,
            self.right + amount,
            self.bottom + amount,
        ).clamp(w, h)


def is_void(rgb: tuple[int, int, int], tol: int) -> bool:
    r, g, b = rgb
    for vr, vg, vb in VOID_COLORS:
        if abs(r - vr) + abs(g - vg) + abs(b - vb) <= tol:
            return True
    # Dark blue-gray studio void (low chroma, dark).
    if max(r, g, b) <= 70 and abs(r - g) <= 18 and abs(g - b) <= 28 and b >= r:
        return True
    return False


def content_bbox(
    im: Image.Image,
    *,
    tol: int = 36,
    step: int = 2,
    region: Box | None = None,
) -> Box | None:
    px = im.convert("RGB")
    w, h = px.size
    region = region or Box(0, 0, w, h)
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(region.top, region.bottom, step):
        for x in range(region.left, region.right, step):
            if is_void(px.getpixel((x, y)), tol):
                continue
            if x < minx:
                minx = x
            if y < miny:
                miny = y
            if x > maxx:
                maxx = x
            if y > maxy:
                maxy = y
    if maxx < 0:
        return None
    return Box(minx, miny, maxx + 1, maxy + 1)


def center_region(w: int, h: int, frac: float = 0.72) -> Box:
    bw = int(w * frac)
    bh = int(h * frac)
    left = (w - bw) // 2
    top = (h - bh) // 2
    return Box(left, top, left + bw, top + bh)


def strip_ui_region(w: int, h: int) -> Box:
    """Heuristic: drop common Imagine HUD chrome."""
    return Box(
        int(w * 0.18),
        int(h * 0.08),
        int(w * 0.82),
        int(h * 0.78),
    )


def focus_region(w: int, h: int) -> Box:
    """Character + nameplate band: skip title bar, chat, hotbar, menus."""
    return Box(
        int(w * 0.28),
        int(h * 0.10),
        int(w * 0.78),
        int(h * 0.62),
    )


def variants_for(im: Image.Image) -> list[tuple[str, Box]]:
    w, h = im.size
    out: list[tuple[str, Box]] = []

    # A) Full-frame content (works if already cropped to void).
    full = content_bbox(im, tol=36)
    if full and full.width < w * 0.85 and full.height < h * 0.90:
        # Only keep full-frame when it isn't basically the whole window (HUD).
        for pad in (8, 24, 40):
            out.append((f"full-pad{pad}", full.pad(pad, w, h)))

    # B) Ignore outer HUD — search content only in safer bands.
    for name, region in (
        ("center72", center_region(w, h, 0.72)),
        ("striphud", strip_ui_region(w, h)),
        ("focus", focus_region(w, h)),
    ):
        box = content_bbox(im, tol=36, region=region)
        if not box:
            continue
        for pad in (16, 32, 48):
            out.append((f"{name}-pad{pad}", box.pad(pad, w, h)))

    # C) Historical manual start from early Path 1 crops (1572x1059 window).
    if w >= 1000 and h >= 900:
        tip = content_bbox(im, tol=40, region=Box(424, 88, min(w - 80, 1100), min(h - 80, 950)))
        if tip:
            out.append(("legacy424", tip.pad(16, w, h)))
            out.append(("legacy424-pad40", tip.pad(40, w, h)))

    # De-dupe identical boxes, keep first name.
    seen: set[tuple[int, int, int, int]] = set()
    unique: list[tuple[str, Box]] = []
    for name, box in out:
        key = (box.left, box.top, box.right, box.bottom)
        if key in seen or box.width < 32 or box.height < 32:
            continue
        seen.add(key)
        unique.append((name, box))
    return unique


def save_crop(im: Image.Image, box: Box, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGBA").crop((box.left, box.top, box.right, box.bottom)).save(
        dest, format="PNG"
    )


def process_file(src: Path, out_dir: Path) -> list[Path]:
    im = Image.open(src)
    stem = src.stem
    written: list[Path] = []
    print(f"\n{src.name}  {im.size[0]}x{im.size[1]}")
    for name, box in variants_for(im):
        dest = out_dir / f"{stem}__{name}.png"
        save_crop(im, box, dest)
        written.append(dest)
        print(
            f"  {name:18}  {box.width}x{box.height}  "
            f"LRTB={box.left},{box.top},{box.right},{box.bottom}  → {dest.name}"
        )
    if not written:
        print("  (no content found — try a brighter void shot or lower --tol later)")
    else:
        print(f"  Wrote {len(written)} candidates under {out_dir}")
    return written


def watch(inbox: Path, out_dir: Path, poll_s: float) -> None:
    inbox.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    for p in inbox.glob("Screenshot*.png"):
        # Skip already-cropped helpers in the same folder.
        if "_cropped" in p.stem or "__" in p.stem:
            continue
        seen.add(p.name)

    print(f"Watching {inbox}")
    print(f"Crops → {out_dir}")
    print("Drop a new Screenshot_*.png, then pick a __*.png candidate to ingest.")
    print("Ctrl+C to stop.\n")

    while True:
        for p in sorted(inbox.glob("Screenshot*.png")):
            if "_cropped" in p.stem or "__" in p.stem:
                continue
            if p.name in seen:
                continue
            # Wait for write to finish.
            size = p.stat().st_size
            time.sleep(0.4)
            if p.stat().st_size != size:
                continue
            seen.add(p.name)
            try:
                process_file(p, out_dir)
            except Exception as exc:  # noqa: BLE001 — keep watcher alive
                print(f"  ERROR {p.name}: {exc}", file=sys.stderr)
        time.sleep(poll_s)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_crop = sub.add_parser("crop", help="Crop one screenshot into candidates")
    p_crop.add_argument("image", type=Path)
    p_crop.add_argument("--out", type=Path, default=DEFAULT_OUT)

    p_watch = sub.add_parser("watch", help="Watch inbox for new Screenshot_*.png")
    p_watch.add_argument("--inbox", type=Path, default=DEFAULT_INBOX)
    p_watch.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p_watch.add_argument("--poll", type=float, default=1.0)

    p_pick = sub.add_parser(
        "promote",
        help="Copy a candidate next to the source as *_cropped.png for easy compare",
    )
    p_pick.add_argument("candidate", type=Path)
    p_pick.add_argument(
        "--as",
        dest="dest_name",
        default=None,
        help="Optional destination filename (default: <stem>_cropped.png in inbox)",
    )

    args = ap.parse_args()
    if args.cmd == "crop":
        if not args.image.exists():
            print(f"Missing {args.image}", file=sys.stderr)
            return 1
        process_file(args.image, args.out)
        return 0
    if args.cmd == "watch":
        try:
            watch(args.inbox, args.out, args.poll)
        except KeyboardInterrupt:
            print("\nStopped.")
        return 0
    if args.cmd == "promote":
        cand: Path = args.candidate
        if not cand.exists():
            print(f"Missing {cand}", file=sys.stderr)
            return 1
        dest = Path(args.dest_name) if args.dest_name else DEFAULT_INBOX / f"{cand.stem.split('__')[0]}_cropped.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cand, dest)
        print(f"Promoted → {dest}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Classify Imagine client screenshots: login / character_select / in_world.

Uses color-region heuristics tuned from va_screenshots/ refs (also under
refs/screens/). Optional tesseract OCR confirms login text.

Regions (per operator notes):
  - login: center panel with green UI (IMAGINE ID / PASSWORD / LOGIN)
  - character_select: left half only (right half is the character model)
  - in_world: left+right vertical thirds are dark void; middle is wild
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REF_DIR = HERE / "refs" / "screens"

ScreenKind = str  # login | character_select | in_world | unknown


def _sample_stats(
    im: Any,
    box: tuple[float, float, float, float],
    *,
    step: int = 4,
) -> dict[str, float | tuple[float, float, float] | int]:
    """box = (left, top, right, bottom) as fractions of image size."""
    w, h = im.size
    l, t, r, b = (
        int(box[0] * w),
        int(box[1] * h),
        int(box[2] * w),
        int(box[3] * h),
    )
    r = max(r, l + 1)
    b = max(b, t + 1)
    crop = im.crop((l, t, r, b))
    px = crop.load()
    cw, ch = crop.size
    n = dark = purple = green = 0
    rs = gs = bs = 0
    for y in range(0, ch, step):
        for x in range(0, cw, step):
            rr, gg, bb = px[x, y][:3]
            n += 1
            rs += rr
            gs += gg
            bs += bb
            mean = (rr + gg + bb) / 3.0
            if mean < 45:
                dark += 1
            # dark purple void (day) — night is near-black (still counts as dark)
            if bb > rr + 8 and bb > gg + 5 and mean < 90:
                purple += 1
            # login green chrome
            if gg > rr + 25 and gg > bb + 15 and 80 < gg < 220:
                green += 1
    if n <= 0:
        return {
            "dark": 0.0,
            "purple": 0.0,
            "green": 0.0,
            "mean": (0.0, 0.0, 0.0),
            "n": 0,
        }
    return {
        "dark": dark / n,
        "purple": purple / n,
        "green": green / n,
        "mean": (rs / n, gs / n, bs / n),
        "n": n,
    }


def ocr_text(path: Path, *, box: tuple[float, float, float, float] | None = None) -> str:
    """Optional tesseract OCR; returns '' if unavailable."""
    if not shutil.which("tesseract"):
        return ""
    try:
        from PIL import Image
    except ImportError:
        return ""
    src = path
    tmp: Path | None = None
    try:
        if box is not None:
            im = Image.open(path).convert("RGB")
            w, h = im.size
            crop = im.crop(
                (
                    int(box[0] * w),
                    int(box[1] * h),
                    int(box[2] * w),
                    int(box[3] * h),
                )
            )
            tmp = path.parent / f".ocr-{path.stem}.png"
            crop.save(tmp)
            src = tmp
        out = subprocess.check_output(
            ["tesseract", str(src), "stdout", "-l", "eng", "--psm", "6"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=20,
        )
        return out or ""
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return ""
    finally:
        if tmp is not None:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass


def classify_image(
    path: Path | str,
    *,
    use_ocr: bool = True,
) -> dict[str, Any]:
    """Return {kind, confidence, scores, ocrHints}."""
    try:
        from PIL import Image
    except ImportError as e:
        return {
            "kind": "unknown",
            "confidence": 0.0,
            "error": f"Pillow required: {e}",
        }

    p = Path(path)
    im = Image.open(p).convert("RGB")
    left_third = _sample_stats(im, (0.0, 0.0, 1 / 3, 1.0))
    right_third = _sample_stats(im, (2 / 3, 0.0, 1.0, 1.0))
    left_half = _sample_stats(im, (0.0, 0.0, 0.5, 1.0))
    # login panel sits mid-screen
    center = _sample_stats(im, (0.28, 0.32, 0.72, 0.72))

    scores = {
        "left_third": left_third,
        "right_third": right_third,
        "left_half": left_half,
        "center": center,
    }

    kind: ScreenKind = "unknown"
    confidence = 0.4
    reasons: list[str] = []

    # In-world void: side thirds nearly all dark (night≈black, day≈purple).
    # Lenient on mid third (character) and corners (clock / chat).
    if float(left_third["dark"]) > 0.85 and float(right_third["dark"]) > 0.85:
        kind = "in_world"
        confidence = 0.9
        reasons.append("side-thirds dark void")

    # Character select: left half mid-gray tunnel, almost no deep black.
    elif float(left_half["dark"]) < 0.12 and float(left_half["mean"][0]) > 70:
        kind = "character_select"
        confidence = 0.85
        reasons.append("left-half gray tunnel")

    # Login: green chrome in center panel (and overall darker than char-select).
    elif float(center["green"]) > 0.006 or (
        float(center["green"]) > 0.0025 and float(left_half["dark"]) > 0.35
    ):
        kind = "login"
        confidence = 0.8
        reasons.append("center green login chrome")

    ocr_hints: list[str] = []
    if use_ocr and kind in ("login", "unknown"):
        text = ocr_text(p, box=(0.25, 0.30, 0.75, 0.75)).upper()
        for needle in ("IMAGINE ID", "PASSWORD", "LOGIN", "REMEMBER IMAGINE"):
            if needle in text:
                ocr_hints.append(needle)
        if ocr_hints:
            kind = "login"
            confidence = max(confidence, 0.92)
            reasons.append("ocr:" + ",".join(ocr_hints))

    if use_ocr and kind in ("character_select", "unknown"):
        text = ocr_text(p, box=(0.0, 0.55, 0.5, 0.95)).upper()
        for needle in ("LV01", "LV 01", "01/20", "START"):
            if needle.replace(" ", "") in text.replace(" ", ""):
                ocr_hints.append(needle)
        if any(x.startswith("LV") or "/" in x for x in ocr_hints):
            if kind == "unknown":
                kind = "character_select"
                confidence = 0.75
            reasons.append("ocr-left:" + ",".join(ocr_hints))

    return {
        "kind": kind,
        "confidence": confidence,
        "scores": {
            k: {
                "dark": round(float(v["dark"]), 4),
                "purple": round(float(v["purple"]), 4),
                "green": round(float(v["green"]), 4),
                "mean": [round(x, 1) for x in v["mean"]],  # type: ignore[index]
            }
            for k, v in scores.items()
        },
        "reasons": reasons,
        "ocrHints": ocr_hints,
    }


def self_test() -> int:
    """Classify bundled refs; exit 0 if all match."""
    expect = {
        "login.png": "login",
        "character-select.png": "character_select",
        "in-world.png": "in_world",
    }
    ok = True
    for name, want in expect.items():
        path = REF_DIR / name
        if not path.is_file():
            # fall back to monorepo va_screenshots
            alt = HERE.parent.parent / "va_screenshots" / name
            path = alt if alt.is_file() else path
        if not path.is_file():
            print(f"missing ref {name}", file=sys.stderr)
            ok = False
            continue
        got = classify_image(path, use_ocr=False)
        mark = "OK" if got["kind"] == want else "FAIL"
        print(f"{mark} {name}: got={got['kind']} want={want} conf={got['confidence']}")
        if got["kind"] != want:
            ok = False
    return 0 if ok else 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("image", nargs="?", help="PNG to classify")
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        raise SystemExit(self_test())
    if not args.image:
        ap.error("image path required (or --self-test)")
    import json

    print(json.dumps(classify_image(args.image, use_ocr=not args.no_ocr), indent=2))


if __name__ == "__main__":
    main()

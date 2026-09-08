#!/usr/bin/env python3
"""Classify Imagine client screenshots.

Kinds: login | character_select | in_world | server_down | black | unknown

Uses color-region heuristics tuned from va_screenshots/ refs (also under
refs/screens/). Optional tesseract OCR confirms login text.

Regions (per operator notes):
  - login: center panel with green UI (IMAGINE ID / PASSWORD / LOGIN)
  - character_select: left half only (right half is the character model)
  - in_world: left+right vertical thirds are dark void; middle is wild
  - server_down: semi-transparent red disconnect dialog (center band)
  - black: nearly all-black frame (hung / lost GL / blank)
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

ScreenKind = str  # login | character_select | in_world | server_down | black | unknown


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
    n = dark = purple = green = red = 0
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
            # disconnect / server-down translucent red (not cloth)
            if _is_dialog_red(rr, gg, bb):
                red += 1
    if n <= 0:
        return {
            "dark": 0.0,
            "purple": 0.0,
            "green": 0.0,
            "red": 0.0,
            "mean": (0.0, 0.0, 0.0),
            "n": 0,
        }
    return {
        "dark": dark / n,
        "purple": purple / n,
        "green": green / n,
        "red": red / n,
        "mean": (rs / n, gs / n, bs / n),
        "n": n,
    }


def _is_dialog_red(rr: int, gg: int, bb: int) -> bool:
    """Translucent disconnect overlay — saturated dark red, not cloth.

    A red shirt (e.g. vam1 jacket) is brighter green (~45–60) and fails
    ``gg < 40``. The server-down panel drops green hard (~10–25).
    """
    mean = (rr + gg + bb) / 3.0
    return (
        rr >= 90
        and rr > gg + 45
        and gg < 40
        and bb < 90
        and mean < 120
    )


def detect_server_down_band(im: Any) -> dict[str, float | int | bool]:
    """Find a wide horizontal *rectangle* of translucent red (disconnect dialog).

    Pillow-only (no OpenCV). Requires:
      - consecutive mid-screen rows with enough dialog-red
      - a contiguous horizontal span (not a narrow shirt column)
      - red present near both left and right edges of that span (a box, not a blob)
    """
    w, h = im.size
    px = im.load()
    step_y = max(2, h // 500)
    step_x = max(2, w // 800)
    x0, x1 = int(0.18 * w), int(0.82 * w)

    row_fracs: list[float] = []
    row_spans: list[tuple[float, float, float]] = []  # left, right, width frac
    for y in range(0, h, step_y):
        red_xs: list[int] = []
        n = 0
        for x in range(x0, x1, step_x):
            n += 1
            rr, gg, bb = px[x, y][:3]
            if _is_dialog_red(rr, gg, bb):
                red_xs.append(x)
        frac = len(red_xs) / n if n else 0.0
        row_fracs.append(frac)
        if len(red_xs) < 4:
            row_spans.append((0.0, 0.0, 0.0))
            continue
        # Largest contiguous red run on this row (rectangle edge, not speckles).
        best_a = best_b = red_xs[0]
        run_a = run_b = red_xs[0]
        for x in red_xs[1:]:
            if x <= run_b + step_x * 2:
                run_b = x
            else:
                if run_b - run_a > best_b - best_a:
                    best_a, best_b = run_a, run_b
                run_a = run_b = x
        if run_b - run_a > best_b - best_a:
            best_a, best_b = run_a, run_b
        width_frac = (best_b - best_a) / max(w, 1)
        row_spans.append((best_a / w, best_b / w, width_frac))

    # Dialog fills a solid band; shirt only paints a thin column (~8% width).
    thr = 0.12
    min_width = 0.10
    best = cur = 0
    best_span = (0, 0)
    start = 0
    for i, frac in enumerate(row_fracs):
        wide_enough = row_spans[i][2] >= min_width
        if frac >= thr and wide_enough:
            if cur == 0:
                start = i
            cur += 1
            if cur > best:
                best = cur
                best_span = (start, i)
        else:
            cur = 0

    run_px = best * step_y
    y0 = best_span[0] * step_y
    y1 = best_span[1] * step_y
    mid = (y0 + y1) / 2.0 / max(h, 1)
    height_frac = run_px / max(h, 1)
    max_row = max(row_fracs) if row_fracs else 0.0

    # Within the best run, require a stable left/right edge (rectangle sides).
    edge_ok = False
    width_med = 0.0
    if best >= 20:
        lefts: list[float] = []
        rights: list[float] = []
        widths: list[float] = []
        for i in range(best_span[0], best_span[1] + 1):
            lf, rt, wf = row_spans[i]
            if wf >= min_width:
                lefts.append(lf)
                rights.append(rt)
                widths.append(wf)
        if len(widths) >= 12:
            lefts.sort()
            rights.sort()
            widths.sort()
            width_med = widths[len(widths) // 2]
            # Edges should not wander like a shirt silhouette.
            left_spread = lefts[-1] - lefts[0] if lefts else 1.0
            right_spread = rights[-1] - rights[0] if rights else 1.0
            edge_ok = (
                width_med >= 0.11
                and left_spread <= 0.06
                and right_spread <= 0.06
            )

    hit = (
        best >= 40
        and height_frac >= 0.08
        and height_frac <= 0.40
        and 0.32 <= mid <= 0.72
        and max_row >= 0.16
        and edge_ok
        and width_med >= 0.11
    )
    return {
        "hit": hit,
        "runRows": best,
        "heightFrac": round(height_frac, 4),
        "midY": round(mid, 4),
        "maxRowRed": round(max_row, 4),
        "widthMed": round(width_med, 4),
        "edgeOk": edge_ok,
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
    full = _sample_stats(im, (0.0, 0.0, 1.0, 1.0), step=6)
    red_band = detect_server_down_band(im)

    scores = {
        "left_third": left_third,
        "right_third": right_third,
        "left_half": left_half,
        "center": center,
        "full": full,
        "red_band": red_band,
    }

    kind: ScreenKind = "unknown"
    confidence = 0.4
    reasons: list[str] = []

    # Disconnect / channel restart: translucent red dialog band (before void).
    if red_band["hit"]:
        kind = "server_down"
        confidence = 0.92
        reasons.append(
            f"red-dialog-band h={red_band['heightFrac']} mid={red_band['midY']}"
        )

    # Blank / hung GL: almost pure black frame.
    elif float(full["dark"]) > 0.97 and float(full["mean"][0]) < 18:
        kind = "black"
        confidence = 0.9
        reasons.append("near-black frame")

    # In-world void: side thirds nearly all dark (night≈black, day≈purple).
    # Lenient on mid third (character) and corners (clock / chat).
    elif float(left_third["dark"]) > 0.85 and float(right_third["dark"]) > 0.85:
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

    # OCR rarely helps on server_down (broken glyphs), but catch English if present.
    if use_ocr and kind in ("server_down", "unknown"):
        text = ocr_text(p, box=(0.2, 0.35, 0.8, 0.7)).upper()
        for needle in ("DISCONNECT", "CONNECTION", "SERVER", "NETWORK", "LOST"):
            if needle in text:
                ocr_hints.append(needle)
        if ocr_hints and kind == "unknown":
            kind = "server_down"
            confidence = 0.8
            reasons.append("ocr:" + ",".join(ocr_hints))

    return {
        "kind": kind,
        "confidence": confidence,
        "scores": {
            k: (
                {
                    "dark": round(float(v["dark"]), 4),
                    "purple": round(float(v["purple"]), 4),
                    "green": round(float(v["green"]), 4),
                    "red": round(float(v.get("red", 0.0)), 4),
                    "mean": [round(x, 1) for x in v["mean"]],  # type: ignore[index]
                }
                if isinstance(v, dict) and "dark" in v
                else v
            )
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
        "server-down.png": "server_down",
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
            print(f"  reasons={got.get('reasons')} red_band={got.get('scores', {}).get('red_band')}")
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

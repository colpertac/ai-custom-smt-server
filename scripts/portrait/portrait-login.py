#!/usr/bin/env python3
"""Keyboard (+ one click) login for Imagine mannequin clients.

Flow (as on your PC):
  1. Optional: launch client via PORTRAIT_CLIENT_CMD
  2. Esc (×N) — skip splash / intro (cave, ATLUS, …)
  3. Shift+Tab — username field (client may remember last user)
  4. Ctrl+A, type username, Tab, type password, Enter
  5. Wait for char-select (black screen)
  6. Spam-click bottom-left "Start Game" (cluster around the button)

Credentials via env (do not commit passwords):
  PORTRAIT_LOGIN_USER / PORTRAIT_LOGIN_PASS
  or role presets:
  PORTRAIT_VAM1_USER=vam1  PORTRAIT_VAM1_PASS=...
  PORTRAIT_VAF1_USER=vaf1  PORTRAIT_VAF1_PASS=...

Examples:
  PORTRAIT_VAM1_PASS='…' python3 scripts/portrait/portrait-login.py vam1
  PORTRAIT_CLIENT_CMD='wine /path/to/Imagine.exe' \\
    PORTRAIT_VAM1_PASS='…' python3 scripts/portrait/portrait-login.py vam1 --launch
  python3 scripts/portrait/portrait-login.py vam1 --no-launch   # game already open
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

WINDOW_TITLE = os.environ.get("PORTRAIT_WINDOW_TITLE", "IMAGINE Version 1.666")
CLIENT_CMD = os.environ.get("PORTRAIT_CLIENT_CMD", "").strip()
# Fraction of window size for "Start Game" (bottom-left).
# Derived from char-select mask (black button on white): center ≈ 0.051 × 0.937
START_X_FRAC = float(os.environ.get("PORTRAIT_START_X_FRAC", "0.051270"))
START_Y_FRAC = float(os.environ.get("PORTRAIT_START_Y_FRAC", "0.936719"))
AFTER_ENTER_SEC = float(os.environ.get("PORTRAIT_LOGIN_AFTER_ENTER_SEC", "8.0"))
AFTER_LAUNCH_SEC = float(os.environ.get("PORTRAIT_LOGIN_AFTER_LAUNCH_SEC", "8.0"))
TYPE_DELAY_MS = int(os.environ.get("PORTRAIT_LOGIN_TYPE_DELAY_MS", "25"))
# Splash (cave/ATLUS) — Esc skips; may need several presses + settle time.
SPLASH_ESC_COUNT = int(os.environ.get("PORTRAIT_LOGIN_SPLASH_ESC", "3"))
SPLASH_ESC_GAP_SEC = float(os.environ.get("PORTRAIT_LOGIN_SPLASH_ESC_GAP", "0.6"))
SPLASH_SETTLE_SEC = float(os.environ.get("PORTRAIT_LOGIN_SPLASH_SETTLE", "2.0"))
# Char-select Start Game — spam-click a small cluster (Wine/Xvfb often drops one).
START_CLICK_COUNT = int(os.environ.get("PORTRAIT_LOGIN_START_CLICKS", "8"))
START_CLICK_GAP_SEC = float(os.environ.get("PORTRAIT_LOGIN_START_CLICK_GAP", "0.25"))
START_CLICK_JITTER_PX = int(os.environ.get("PORTRAIT_LOGIN_START_JITTER", "12"))

ROLE_ENV = {
    "vam1": ("PORTRAIT_VAM1_USER", "PORTRAIT_VAM1_PASS", "vam1"),
    "vaf1": ("PORTRAIT_VAF1_USER", "PORTRAIT_VAF1_PASS", "vaf1"),
    "vam": ("PORTRAIT_VAM1_USER", "PORTRAIT_VAM1_PASS", "vam1"),
    "vaf": ("PORTRAIT_VAF1_USER", "PORTRAIT_VAF1_PASS", "vaf1"),
}

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def need_xdotool() -> None:
    if not shutil.which("xdotool"):
        die("xdotool required (sudo apt install xdotool)")


def find_window(explicit: str | None = None, role: str | None = None) -> str:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from portrait_common import find_imagine_windows, resolve_mannequin_window

    if explicit and explicit.strip():
        return explicit.strip()
    if role:
        pinned = resolve_mannequin_window(role)
        if pinned:
            return pinned
    hits = find_imagine_windows()
    if not hits:
        die(f"no window titled '{WINDOW_TITLE}'")
    if len(hits) > 1:
        print(
            f"warning: {len(hits)} Imagine windows; using {hits[0]}. "
            "Run npm run portrait-orch -- up to pin vam1/vaf1.",
            file=sys.stderr,
        )
    return hits[0]


def focus(wid: str) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from portrait_common import focus_x_window

    focus_x_window(wid)


def xdo(*args: str, check: bool = True) -> None:
    subprocess.run(["xdotool", *args], check=check)


def key_focus(*keys: str) -> None:
    """Send keys to the focused window (Wine often ignores --window chords)."""
    xdo("key", "--clearmodifiers", *keys)


def shift_tab() -> None:
    """Move focus backward from the password field to username.

    Wine/Xwayland often drops xdotool's `shift+Tab` chord and `--window`
    modifiers; holding Shift_L then Tab on the focused window works.
    """
    xdo("keydown", "--clearmodifiers", "Shift_L")
    time.sleep(0.08)
    xdo("key", "Tab")
    time.sleep(0.08)
    xdo("keyup", "Shift_L")


def type_text(text: str) -> None:
    # Type into the focused field (no --window — Wine login UI needs this).
    xdo(
        "type",
        "--clearmodifiers",
        "--delay",
        str(TYPE_DELAY_MS),
        "--",
        text,
    )


def window_size(wid: str) -> tuple[int, int]:
    out = subprocess.check_output(
        ["xdotool", "getwindowgeometry", "--shell", wid], text=True
    )
    w = h = 0
    for line in out.splitlines():
        if line.startswith("WIDTH="):
            w = int(line.split("=", 1)[1])
        elif line.startswith("HEIGHT="):
            h = int(line.split("=", 1)[1])
    if w <= 0 or h <= 0:
        die(f"could not read window size for {wid}")
    return w, h


def click_start_game(wid: str) -> None:
    """Spam-click Start Game (and nearby pixels) — only mouse step in login."""
    w, h = window_size(wid)
    cx = max(1, min(w - 2, int(w * START_X_FRAC)))
    cy = max(1, min(h - 2, int(h * START_Y_FRAC)))
    n = max(1, START_CLICK_COUNT)
    j = max(0, START_CLICK_JITTER_PX)
    # Center + ring of offsets so a slightly-off frac still hits the button.
    offsets = [(0, 0)]
    if j > 0:
        offsets.extend(
            [
                (j, 0),
                (-j, 0),
                (0, j),
                (0, -j),
                (j, j),
                (-j, j),
                (j, -j),
                (-j, -j),
                (j // 2, -j),
                (-j // 2, -j),
            ]
        )
    print(
        f"click Start Game ×{n} around ({cx},{cy}) "
        f"in {w}x{h} (frac {START_X_FRAC},{START_Y_FRAC}, jitter ±{j}px)"
    )
    focus(wid)
    for i in range(n):
        dx, dy = offsets[i % len(offsets)]
        x = max(1, min(w - 2, cx + dx))
        y = max(1, min(h - 2, cy + dy))
        xdo("mousemove", "--window", wid, str(x), str(y))
        time.sleep(0.05)
        xdo("click", "--window", wid, "1")
        time.sleep(START_CLICK_GAP_SEC)


def resolve_creds(role: str) -> tuple[str, str]:
    user = os.environ.get("PORTRAIT_LOGIN_USER", "").strip()
    password = os.environ.get("PORTRAIT_LOGIN_PASS", "")
    if user and password:
        return user, password
    if role not in ROLE_ENV:
        die(f"unknown role {role!r}; use vam1/vaf1 or set PORTRAIT_LOGIN_*")
    u_key, p_key, default_user = ROLE_ENV[role]
    user = os.environ.get(u_key, default_user).strip()
    password = os.environ.get(p_key, "")
    if not password:
        die(
            f"set {p_key} (or PORTRAIT_LOGIN_USER + PORTRAIT_LOGIN_PASS). "
            "Passwords are not stored in the repo."
        )
    return user, password


def launch_client() -> None:
    if not CLIENT_CMD:
        die(
            "PORTRAIT_CLIENT_CMD is empty. Example:\n"
            "  export PORTRAIT_CLIENT_CMD='wine /path/to/Imagine.exe'\n"
            "Or pass --no-launch if the game is already open."
        )
    print(f"launch: {CLIENT_CMD}")
    subprocess.Popen(
        CLIENT_CMD,
        shell=True,
        cwd=os.environ.get("PORTRAIT_CLIENT_CWD") or None,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    print(f"waiting {AFTER_LAUNCH_SEC}s for window…")
    deadline = time.time() + AFTER_LAUNCH_SEC + 30
    while time.time() < deadline:
        try:
            find_window()
            return
        except SystemExit:
            time.sleep(1)
    die("client window never appeared")


def skip_splash(wid: str) -> None:
    """Press Esc to skip cave/ATLUS (and similar) splash screens."""
    focus(wid)
    if SPLASH_SETTLE_SEC > 0:
        print(f"settle {SPLASH_SETTLE_SEC:.1f}s for splash…")
        time.sleep(SPLASH_SETTLE_SEC)
    n = max(1, SPLASH_ESC_COUNT)
    print(f"skip splash: Esc ×{n}")
    for i in range(n):
        focus(wid)
        key_focus("Escape")
        time.sleep(SPLASH_ESC_GAP_SEC)
    focus(wid)
    time.sleep(0.4)


def login(
    role: str,
    *,
    do_launch: bool,
    window: str | None = None,
    credentials_only: bool = False,
) -> None:
    need_xdotool()
    user, password = resolve_creds(role)
    if do_launch:
        launch_client()
    wid = find_window(explicit=window, role=role)
    focus(wid)
    print(f"login as {user} (window {wid})")

    skip_splash(wid)

    # Default focus is the password field. Back-tab → username.
    shift_tab()
    time.sleep(0.35)
    key_focus("ctrl+a")
    time.sleep(0.15)
    type_text(user)
    time.sleep(0.25)

    key_focus("Tab")
    time.sleep(0.35)
    key_focus("ctrl+a")
    time.sleep(0.15)
    type_text(password)
    time.sleep(0.25)

    key_focus("Return")
    print(f"submitted login; waiting {AFTER_ENTER_SEC}s for char select…")
    time.sleep(AFTER_ENTER_SEC)

    if not credentials_only:
        focus(wid)
        click_start_game(wid)
        print(
            "Start Game clicked. When in-world, run:\n"
            f"  npm run portrait-worker -- reset-camera {role}\n"
            f"  npm run portrait-worker -- init-camera {role}"
        )
    else:
        print("credentials submitted (--credentials-only; Start Game skipped)")


def main() -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from portrait_common import load_portrait_env

    load_portrait_env()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "role",
        nargs="?",
        default="vam1",
        help="vam1 / vaf1 (or set PORTRAIT_LOGIN_USER/PASS)",
    )
    ap.add_argument(
        "--launch",
        action="store_true",
        help="Run PORTRAIT_CLIENT_CMD before login",
    )
    ap.add_argument(
        "--no-launch",
        action="store_true",
        help="Game already open (default if --launch omitted)",
    )
    ap.add_argument(
        "--window",
        metavar="WID",
        help="X window id (0x…) — set by portrait-orch",
    )
    ap.add_argument(
        "--start-only",
        action="store_true",
        help="Only click Start Game (already on char select)",
    )
    ap.add_argument(
        "--credentials-only",
        action="store_true",
        help="Type user/pass + Enter only (skip Start Game; orch uses this)",
    )
    ap.add_argument(
        "--measure-mask",
        metavar="PNG",
        help="Find black rect center in a white-canvas mask PNG; print fracs and exit",
    )
    args = ap.parse_args()
    if args.measure_mask:
        measure_mask(args.measure_mask)
        return
    role = args.role.strip().lower()
    if args.start_only and args.credentials_only:
        die("use only one of --start-only / --credentials-only")
    if args.start_only:
        need_xdotool()
        wid = find_window(explicit=args.window, role=role)
        focus(wid)
        click_start_game(wid)
        return
    do_launch = bool(args.launch) and not args.no_launch
    login(
        role,
        do_launch=do_launch,
        window=args.window,
        credentials_only=args.credentials_only,
    )


def measure_mask(path: str) -> None:
    """White canvas + black Start Game rect → print click fracs."""
    try:
        from PIL import Image
    except ImportError:
        die("Pillow required: pip install pillow")
    im = Image.open(path).convert("L")
    w, h = im.size
    px = im.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if px[x, y] < 128:
                xs.append(x)
                ys.append(y)
    if not xs:
        die(f"no black pixels in {path}")
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    cx = (left + right) / 2.0
    cy = (top + bottom) / 2.0
    fx, fy = cx / w, cy / h
    print(f"mask {w}x{h}")
    print(f"bbox LTRB {left},{top},{right + 1},{bottom + 1}")
    print(f"center px ({cx:.1f},{cy:.1f})")
    print(f"PORTRAIT_START_X_FRAC={fx:.6f}")
    print(f"PORTRAIT_START_Y_FRAC={fy:.6f}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Orchestrate dual mannequin clients: launch → pin windows → login → camera.

You do **not** need to manually `wmctrl` / export PORTRAIT_WINDOW_*. This
script launches two Wine clients, waits for each new Imagine window, maps
them to vam1 then vaf1, saves work/portrait-captures/windows.json, logs in,
and runs init-camera.

GUI windows open on your X display (tmux cannot host the game UI). Use this
orchestrator instead of hand-pinning window ids.

Env (website/.env.local also loaded for PORTRAIT_*):
  PORTRAIT_VAM1_PASS / PORTRAIT_VAF1_PASS  required for login
  PORTRAIT_CLIENT_DIR   default ~/software/smt/game/reimagine
  PORTRAIT_ORCH_ROLES   default vam1,vaf1  (use vam1 only for male QA)

Examples:
  npm run portrait-orch -- up
  npm run portrait-orch -- up --male-only
  npm run portrait-orch -- up --skip-login      # launch+pin only
  npm run portrait-orch -- status
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from portrait_common import (  # noqa: E402
    ROOT,
    WINDOWS_PATH,
    WINDOW_TITLE,
    find_imagine_windows,
    load_window_map,
    save_window_map,
)

LAUNCH_SH = HERE / "portrait-launch.sh"
LOGIN_PY = HERE / "portrait-login.py"
WORKER_PY = HERE / "portrait-worker.py"
WEBSITE = ROOT / "website"

AFTER_LAUNCH_TIMEOUT = float(os.environ.get("PORTRAIT_ORCH_LAUNCH_TIMEOUT", "90"))
BETWEEN_CLIENTS_SEC = float(os.environ.get("PORTRAIT_ORCH_BETWEEN_SEC", "3"))
AFTER_LOGIN_SEC = float(os.environ.get("PORTRAIT_ORCH_AFTER_LOGIN_SEC", "2"))
# Pause after focusing the next mannequin before camera keys (Wine needs this).
BETWEEN_CAM_SEC = float(os.environ.get("PORTRAIT_ORCH_BETWEEN_CAM_SEC", "2.5"))
CAM_FOCUS_SEC = float(os.environ.get("PORTRAIT_ORCH_CAM_FOCUS_SEC", "1.2"))

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def load_dotenv_local() -> None:
    env_path = WEBSITE / ".env.local"
    if not env_path.is_file():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key.startswith("PORTRAIT_"):
            continue
        if key in os.environ and os.environ[key].strip():
            continue
        os.environ[key] = val.strip().strip("'").strip('"')


def wait_new_window(before: set[str], label: str, timeout: float) -> str:
    deadline = time.time() + timeout
    print(f"waiting for new Imagine window ({label}, up to {timeout:.0f}s)…")
    while time.time() < deadline:
        now = set(find_imagine_windows())
        fresh = sorted(now - before)
        if fresh:
            wid = fresh[0]
            print(f"  {label} → {wid}")
            return wid
        time.sleep(0.5)
    die(
        f"no new window for {label}. Is Wine starting? "
        f"Title must contain '{WINDOW_TITLE}'. Current: {find_imagine_windows()}"
    )


def launch_one() -> None:
    if not LAUNCH_SH.is_file():
        die(f"missing {LAUNCH_SH}")
    subprocess.check_call(["bash", str(LAUNCH_SH)], cwd=str(HERE))


def run_login(role: str, wid: str) -> None:
    pass_key = f"PORTRAIT_{role.upper()}_PASS"
    if not os.environ.get(pass_key, "").strip() and not os.environ.get(
        "PORTRAIT_LOGIN_PASS", ""
    ).strip():
        die(f"set {pass_key} in website/.env.local (or env) before orch up")
    env = os.environ.copy()
    env[f"PORTRAIT_WINDOW_{role.upper()}"] = wid
    print(f"login {role} on {wid}")
    subprocess.check_call(
        [sys.executable, str(LOGIN_PY), role, "--window", wid],
        cwd=str(HERE),
        env=env,
    )


def run_worker(*args: str) -> None:
    env = os.environ.copy()
    # Propagate pinned windows into worker env for this process tree.
    for role, wid in load_window_map().items():
        env[f"PORTRAIT_WINDOW_{role.upper()}"] = wid
    subprocess.check_call(
        [sys.executable, str(WORKER_PY), *args],
        cwd=str(WEBSITE),
        env=env,
    )


def cmd_status(_: argparse.Namespace) -> None:
    mapped = load_window_map()
    live = find_imagine_windows()
    print(f"title filter: {WINDOW_TITLE}")
    print(f"state file:   {WINDOWS_PATH}")
    print(f"live windows: {live or '(none)'}")
    if not mapped:
        print("mapped:       (none — run: npm run portrait-orch -- up)")
        return
    for role, wid in mapped.items():
        ok = "live" if wid in live else "MISSING"
        print(f"  {role}: {wid}  [{ok}]")


def cmd_up(args: argparse.Namespace) -> None:
    load_dotenv_local()
    if not shutil.which("wmctrl") or not shutil.which("xdotool"):
        die("need wmctrl + xdotool")

    roles = ["vam1"]
    if not args.male_only:
        custom = os.environ.get("PORTRAIT_ORCH_ROLES", "").strip()
        if custom:
            roles = [r.strip() for r in custom.split(",") if r.strip()]
        else:
            roles = ["vam1", "vaf1"]

    if args.reuse_windows:
        mapped = load_window_map()
        missing = [r for r in roles if r not in mapped]
        if missing:
            die(f"--reuse-windows but missing roles in state: {missing}")
        print(f"reusing windows: {mapped}")
    else:
        before = set(find_imagine_windows())
        if before and not args.ok_existing:
            print(
                f"note: {len(before)} Imagine window(s) already open; "
                "new launches will be pinned as mannequins."
            )
        mapped: dict[str, str] = {}
        for i, role in enumerate(roles):
            if i:
                time.sleep(BETWEEN_CLIENTS_SEC)
            snap = set(find_imagine_windows())
            launch_one()
            wid = wait_new_window(snap, role, AFTER_LAUNCH_TIMEOUT)
            mapped[role] = wid
            save_window_map(mapped)
        print(f"pinned → {WINDOWS_PATH}")
        for role, wid in mapped.items():
            print(f"  export PORTRAIT_WINDOW_{role.upper()}={wid}")

    if args.skip_login:
        print("skip login (--skip-login)")
    else:
        # Repair blank char names in world DB before char-select (offline OK).
        for role in roles:
            run_worker("ensure-name", role)
        for role in roles:
            run_login(role, mapped[role])
            time.sleep(AFTER_LOGIN_SEC)

    if args.skip_camera:
        print("skip camera (--skip-camera)")
    else:
        run_worker("reset-camera")
        for i, role in enumerate(roles):
            if i:
                print(
                    f"settle {BETWEEN_CAM_SEC}s before switching camera to {role}…"
                )
                time.sleep(BETWEEN_CAM_SEC)
            os.environ[f"PORTRAIT_WINDOW_{role.upper()}"] = mapped[role]
            # Worker reads this to pause after focus before Home/PageUp.
            os.environ["PORTRAIT_CAM_FOCUS_SEC"] = str(CAM_FOCUS_SEC)
            run_worker("init-camera", role)

    print("\nReady. Next:")
    print("  npm run portrait-queue -- clear   # optional QA wipe")
    print("  npm run portrait-fingerprint -- catm")
    print("  npm run portrait-worker -- once   # or loop")
    print("  npm run portrait-watchdog")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_up = sub.add_parser("up", help="Launch, pin, login, init-camera")
    p_up.add_argument(
        "--male-only",
        action="store_true",
        help="Only vam1 (skip vaf1)",
    )
    p_up.add_argument(
        "--skip-login",
        action="store_true",
        help="Launch + pin windows only",
    )
    p_up.add_argument(
        "--skip-camera",
        action="store_true",
        help="Do not reset/init camera",
    )
    p_up.add_argument(
        "--reuse-windows",
        action="store_true",
        help="Use existing windows.json (no new launches)",
    )
    p_up.add_argument(
        "--ok-existing",
        action="store_true",
        help="Silence note about already-open Imagine windows",
    )
    p_up.set_defaults(func=cmd_up)

    p_st = sub.add_parser("status", help="Show pinned vs live windows")
    p_st.set_defaults(func=cmd_status)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

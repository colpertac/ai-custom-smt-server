#!/usr/bin/env python3
"""Orchestrate dual mannequin clients: launch → pin → login → camera.

Hardened flow (one role at a time — dual Wine windows steal focus otherwise):
  for each role:
    launch + pin window
    minimize other Imagine windows
    ensure-name (if studio up)
    credentials-only → Start Game spam → wait until studio says in-world
    (retry a few times on failure)
  then init-camera for roles that are online

Env (scripts/portrait/.env via dotenv):
  PORTRAIT_VAM1_PASS / PORTRAIT_VAF1_PASS  required for login
  PORTRAIT_CLIENT_DIR   game client tree (ImagineClient.exe)
  DISPLAY / PORTRAIT_XVFB_DISPLAY   headless X (default :99)
  PORTRAIT_ORCH_ROLES   default vam1,vaf1
  PORTRAIT_ORCH_LOGIN_RETRIES     default 3
  PORTRAIT_ORCH_ONLINE_TIMEOUT    per-role wait after Start Game (default 60)

Examples:
  ./portrait-cli orch-up-male
  python portrait-orch.py up --male-only
  python portrait-orch.py down
  python portrait-orch.py status
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from portrait_common import (  # noqa: E402
    HERE as PORTRAIT_DIR,
    ROOT,
    WINDOWS_PATH,
    WINDOW_TITLE,
    ensure_display,
    find_imagine_windows,
    focus_x_window,
    kill_imagine_clients,
    load_portrait_env,
    load_window_map,
    save_window_map,
)

LAUNCH_SH = HERE / "portrait-launch.sh"
LOGIN_PY = HERE / "portrait-login.py"
WORKER_PY = HERE / "portrait-worker.py"
WEBSITE = ROOT / "website"

AFTER_LAUNCH_TIMEOUT = float(os.environ.get("PORTRAIT_ORCH_LAUNCH_TIMEOUT", "90"))
BETWEEN_CLIENTS_SEC = float(os.environ.get("PORTRAIT_ORCH_BETWEEN_SEC", "3"))
BETWEEN_CAM_SEC = float(os.environ.get("PORTRAIT_ORCH_BETWEEN_CAM_SEC", "2.5"))
CAM_FOCUS_SEC = float(os.environ.get("PORTRAIT_ORCH_CAM_FOCUS_SEC", "1.2"))
LOGIN_RETRIES = int(os.environ.get("PORTRAIT_ORCH_LOGIN_RETRIES", "3"))
ONLINE_TIMEOUT = float(os.environ.get("PORTRAIT_ORCH_ONLINE_TIMEOUT", "60"))
CHAR_SELECT_SEC = float(os.environ.get("PORTRAIT_ORCH_CHAR_SELECT_SEC", "3"))

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


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


def xdo(*args: str) -> None:
    if not shutil.which("xdotool"):
        return
    subprocess.run(["xdotool", *args], check=False)


def focus_only(active_wid: str, all_wids: list[str]) -> None:
    """Raise/focus one mannequin; minimize the others so keys don't go astray."""
    for wid in all_wids:
        if wid == active_wid:
            continue
        xdo("windowminimize", wid)
    focus_x_window(active_wid)
    xdo("windowmap", active_wid)
    xdo("windowraise", active_wid)
    time.sleep(0.4)


def restore_windows(wids: list[str]) -> None:
    for wid in wids:
        xdo("windowmap", wid)
        time.sleep(0.15)


def run_login_step(role: str, wid: str, *extra: str) -> None:
    pass_key = f"PORTRAIT_{role.upper()}_PASS"
    if not os.environ.get(pass_key, "").strip() and not os.environ.get(
        "PORTRAIT_LOGIN_PASS", ""
    ).strip():
        die(f"set {pass_key} in scripts/portrait/.env (or env) before orch up")
    env = os.environ.copy()
    env[f"PORTRAIT_WINDOW_{role.upper()}"] = wid
    cmd = [sys.executable, str(LOGIN_PY), role, "--window", wid, *extra]
    print(f"$ {' '.join(cmd)}")
    subprocess.check_call(cmd, cwd=str(HERE), env=env)


def run_worker(*args: str, soft: bool = False) -> bool:
    env = os.environ.copy()
    for role, wid in load_window_map().items():
        env[f"PORTRAIT_WINDOW_{role.upper()}"] = wid
    cwd = str(WEBSITE) if WEBSITE.is_dir() else str(PORTRAIT_DIR)
    try:
        subprocess.check_call(
            [sys.executable, str(WORKER_PY), *args],
            cwd=cwd,
            env=env,
        )
        return True
    except subprocess.CalledProcessError as e:
        if soft:
            print(
                f"warning: worker {' '.join(args)} failed (exit {e.returncode}); continuing",
                file=sys.stderr,
            )
            return False
        raise


def studio_url() -> str:
    return os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700").rstrip(
        "/"
    )


def studio_reachable(timeout_sec: float = 2.0) -> bool:
    url = f"{studio_url()}/studio/health"
    token = os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    cmd = ["curl", "-sS", "-m", str(timeout_sec), "-o", "/dev/null", "-w", "%{http_code}"]
    if token:
        cmd += ["-H", f"X-Studio-Token: {token}"]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
        return out.strip() in {"200", "401", "403"}
    except (OSError, subprocess.CalledProcessError):
        return False


def studio_health() -> dict:
    url = f"{studio_url()}/studio/health"
    token = os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    cmd = ["curl", "-sS", "-m", "3"]
    if token:
        cmd += ["-H", f"X-Studio-Token: {token}"]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
        return json.loads(out) if out.strip() else {}
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
        return {}


def role_online(role: str, data: dict | None = None) -> bool:
    data = data if data is not None else studio_health()
    if data.get(role):
        return True
    if role.startswith("vam") and (data.get("vam") or data.get("va")):
        return True
    if role.startswith("vaf") and data.get("vaf"):
        return True
    return False


def wait_role_online(role: str, timeout: float) -> bool:
    print(f"waiting for {role} in-world (up to {timeout:.0f}s)…")
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = studio_health()
        if role_online(role, data):
            print(f"  {role} online")
            return True
        time.sleep(1.0)
    print(f"  {role} still offline", file=sys.stderr)
    return False


def bring_role_online(
    role: str,
    wid: str,
    *,
    all_wids: list[str],
    studio_ok: bool,
    retries: int,
) -> bool:
    """Credentials → Start Game → confirm studio online; retry on failure."""
    if studio_ok and role_online(role):
        print(f"{role} already in-world — skip login")
        return True

    for attempt in range(1, max(1, retries) + 1):
        print(f"\n=== {role} login attempt {attempt}/{retries} (window {wid}) ===")
        focus_only(wid, all_wids)
        try:
            run_login_step(role, wid, "--credentials-only")
        except subprocess.CalledProcessError as e:
            print(f"warning: credentials step failed: {e}", file=sys.stderr)
            continue
        if CHAR_SELECT_SEC > 0:
            print(f"settle {CHAR_SELECT_SEC:.1f}s before Start Game…")
            time.sleep(CHAR_SELECT_SEC)
        focus_only(wid, all_wids)
        try:
            run_login_step(role, wid, "--start-only")
        except subprocess.CalledProcessError as e:
            print(f"warning: Start Game step failed: {e}", file=sys.stderr)
            continue
        if not studio_ok:
            print(
                "warning: studio unreachable — cannot confirm in-world; "
                "assuming Start Game was sent",
                file=sys.stderr,
            )
            return True
        if wait_role_online(role, ONLINE_TIMEOUT):
            return True
        print(
            f"retry {role}: not in-world after Start Game "
            f"(check password / ImagineClient.dat / focus)",
            file=sys.stderr,
        )
    return False


def print_studio_help() -> None:
    print(
        f"warning: studio not reachable at {studio_url()}\n"
        "  Studio should be on the CHANNEL host (comp_channel StudioHttpPort),\n"
        "  listening on 0.0.0.0 (LAN). Check PORTRAIT_STUDIO_URL + token.",
        file=sys.stderr,
    )


def cmd_status(_: argparse.Namespace) -> None:
    load_portrait_env()
    ensure_display()
    mapped = load_window_map()
    live = find_imagine_windows()
    health = studio_health() if studio_reachable() else {}
    print(f"DISPLAY={os.environ.get('DISPLAY')}")
    print(f"title filter: {WINDOW_TITLE}")
    print(f"state file:   {WINDOWS_PATH}")
    print(f"live windows: {live or '(none)'}")
    print(f"studio:       {studio_url()}  health={ {k: health.get(k) for k in ('vam1','vaf1','vam','vaf')} }")
    if not mapped:
        print("mapped:       (none — run: portrait-orch up)")
        return
    for role, wid in mapped.items():
        win = "live" if wid in live else "MISSING"
        world = "in-world" if role_online(role, health) else "not-in-world"
        print(f"  {role}: {wid}  [{win}] [{world}]")


def cmd_up(args: argparse.Namespace) -> None:
    load_portrait_env()
    ensure_display()
    if not shutil.which("xdotool") and not shutil.which("wmctrl"):
        die("need xdotool (preferred) or wmctrl")

    studio_ok = studio_reachable()
    if studio_ok:
        print(f"studio OK  {studio_url()}")
    else:
        print_studio_help()
        if args.require_studio:
            die("studio required (--require-studio)")

    roles = ["vam1"]
    if not args.male_only:
        custom = os.environ.get("PORTRAIT_ORCH_ROLES", "").strip()
        if custom:
            roles = [r.strip() for r in custom.split(",") if r.strip()]
        else:
            roles = ["vam1", "vaf1"]

    retries = args.login_retries if args.login_retries is not None else LOGIN_RETRIES

    # --- launch / pin (one client at a time so the first can finish login) ---
    mapped: dict[str, str] = {}
    if args.reuse_windows:
        mapped = load_window_map()
        missing = [r for r in roles if r not in mapped]
        if missing:
            die(f"--reuse-windows but missing roles in state: {missing}")
        print(f"reusing windows: {mapped}")
    else:
        if find_imagine_windows() and not args.ok_existing:
            print(
                f"note: Imagine window(s) already open; "
                "new launches will be pinned as mannequins."
            )

    online_roles: list[str] = []

    for i, role in enumerate(roles):
        if not args.reuse_windows:
            if i:
                time.sleep(BETWEEN_CLIENTS_SEC)
            snap = set(find_imagine_windows())
            launch_one()
            wid = wait_new_window(snap, role, AFTER_LAUNCH_TIMEOUT)
            mapped[role] = wid
            save_window_map(mapped)
            print(f"pinned {role} → {wid}")
        else:
            wid = mapped[role]

        all_wids = list(mapped.values())

        if args.skip_login:
            print(f"skip login for {role}")
            continue

        if args.skip_ensure_name:
            pass
        elif not studio_ok:
            print(f"skip ensure-name {role} (studio unreachable)")
        else:
            run_worker("ensure-name", role, soft=not args.require_studio)

        ok = bring_role_online(
            role,
            wid,
            all_wids=all_wids,
            studio_ok=studio_ok,
            retries=retries,
        )
        if ok:
            online_roles.append(role)
        elif args.allow_offline:
            print(
                f"warning: {role} not in-world — continuing (--allow-offline)",
                file=sys.stderr,
            )
        else:
            restore_windows(all_wids)
            die(
                f"{role} never reached in-world after {retries} attempt(s). "
                "Fix login / ImagineClient.dat, or re-run with --allow-offline."
            )

    restore_windows(list(mapped.values()))
    print(f"pinned → {WINDOWS_PATH}")
    for role, wid in mapped.items():
        print(f"  export PORTRAIT_WINDOW_{role.upper()}={wid}")

    if args.skip_camera:
        print("skip camera (--skip-camera)")
    elif not studio_ok and not args.require_studio:
        print("skip camera (studio unreachable)")
    elif not online_roles:
        print("skip camera (no mannequins in-world)")
    else:
        run_worker("reset-camera", soft=not args.require_studio)
        for i, role in enumerate(online_roles):
            if i:
                print(
                    f"settle {BETWEEN_CAM_SEC}s before switching camera to {role}…"
                )
                time.sleep(BETWEEN_CAM_SEC)
            os.environ[f"PORTRAIT_WINDOW_{role.upper()}"] = mapped[role]
            os.environ["PORTRAIT_CAM_FOCUS_SEC"] = str(CAM_FOCUS_SEC)
            run_worker("init-camera", role, soft=not args.require_studio)

    print("\nReady.")
    print(f"  in-world: {online_roles or '(none)'}")
    print("  ./portrait-cli status")
    print("  ./portrait-cli once")


def cmd_down(args: argparse.Namespace) -> None:
    load_portrait_env()
    kill_imagine_clients(force=args.force, clear_windows=not args.keep_windows)


def main() -> None:
    load_portrait_env()
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_up = sub.add_parser("up", help="Launch, pin, login one-by-one, init-camera")
    p_up.add_argument("--male-only", action="store_true", help="Only vam1")
    p_up.add_argument("--skip-login", action="store_true", help="Launch + pin only")
    p_up.add_argument("--skip-camera", action="store_true")
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
    p_up.add_argument("--skip-ensure-name", action="store_true")
    p_up.add_argument(
        "--require-studio",
        action="store_true",
        help="Fail if studio HTTP is unreachable",
    )
    p_up.add_argument(
        "--allow-offline",
        action="store_true",
        help="Do not abort if a mannequin never goes in-world",
    )
    p_up.add_argument(
        "--login-retries",
        type=int,
        default=None,
        metavar="N",
        help=f"Login attempts per role (default {LOGIN_RETRIES})",
    )
    p_up.set_defaults(func=cmd_up)

    p_st = sub.add_parser("status", help="Show pinned vs live vs in-world")
    p_st.set_defaults(func=cmd_status)

    p_dn = sub.add_parser("down", help="Kill all Imagine/Wine client processes")
    p_dn.add_argument("--force", action="store_true")
    p_dn.add_argument("--keep-windows", action="store_true")
    p_dn.set_defaults(func=cmd_down)

    args = ap.parse_args()
    load_portrait_env()
    args.func(args)


if __name__ == "__main__":
    main()

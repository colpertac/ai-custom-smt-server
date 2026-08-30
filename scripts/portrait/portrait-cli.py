#!/usr/bin/env python3
"""Interactive menu for Path 1 portrait tools (homelab / local).

**Homelab entry (no website/ folder):**
  cd scripts/portrait
  ./portrait-cli              # or: python3 portrait-cli.py
  ./portrait-cli status

Optional env file in this directory: `.env` or `.env.local` (PORTRAIT_* only).
Queue HTTP uses PORTRAIT_QUEUE_URL (website host), not a local website tree.

Monorepo convenience only: `npm run portrait-cli` from website/.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WEBSITE = ROOT / "website"

# Ensure sibling imports work when run as a script.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from portrait_common import (  # noqa: E402
    WINDOWS_PATH,
    ensure_display,
    find_imagine_windows,
    load_portrait_env,
    load_window_map,
)

PREVIEW_AGENT = HERE / "portrait-preview-agent.py"
WORKER = HERE / "portrait-worker.py"
ORCH = HERE / "portrait-orch.py"
LOGIN = HERE / "portrait-login.py"
LAUNCH = HERE / "portrait-launch.sh"
WATCHDOG = HERE / "portrait-watchdog.py"

MANNEQUIN_M = os.environ.get("PORTRAIT_MANNEQUIN_M", "vam1")
MANNEQUIN_F = os.environ.get("PORTRAIT_MANNEQUIN_F", "vaf1")


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def run_py(script: Path, *args: str, check: bool = True) -> int:
    cmd = [sys.executable, str(script), *args]
    print(f"$ {' '.join(cmd)}")
    rc = subprocess.call(cmd, cwd=str(HERE))
    if check and rc != 0:
        raise SystemExit(rc)
    return rc


def run_bash(script: Path, *args: str) -> None:
    cmd = ["bash", str(script), *args]
    print(f"$ {' '.join(cmd)}")
    subprocess.check_call(cmd, cwd=str(HERE))


def queue_base() -> str:
    return (
        os.environ.get("PORTRAIT_QUEUE_URL", "").strip()
        or os.environ.get("PORTRAIT_WEBSITE_URL", "").strip()
        or "http://127.0.0.1:3500"
    ).rstrip("/")


def worker_token() -> str:
    return (
        os.environ.get("PORTRAIT_WORKER_TOKEN", "").strip()
        or os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    )


def studio_url() -> str:
    return os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700").rstrip(
        "/"
    )


def curl_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    body: dict | None = None,
) -> tuple[int, dict | str]:
    cmd = ["curl", "-sS", "-w", "\n%{http_code}", "-X", method]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, text=True)
    except subprocess.CalledProcessError as e:
        return e.returncode or 1, (e.output or str(e))[:400]
    lines = out.rsplit("\n", 1)
    raw = lines[0] if len(lines) == 2 else out
    code_s = lines[1] if len(lines) == 2 else "0"
    try:
        code = int(code_s.strip())
    except ValueError:
        code = 0
    try:
        return code, json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return code, raw[:400]


def action_status() -> None:
    mapped = load_window_map()
    live = find_imagine_windows()
    print(f"DISPLAY={os.environ.get('DISPLAY', '(unset)')}")
    print(f"client dir:  {os.environ.get('PORTRAIT_CLIENT_DIR', '(default)')}")
    print(f"studio:      {studio_url()}")
    print(f"queue site:  {queue_base()}")
    print(f"windows:     {WINDOWS_PATH}")
    print(f"live:        {live or '(none)'}")
    if not mapped:
        print("pinned:      (none — run orch up)")
    else:
        for role, wid in mapped.items():
            tag = "live" if wid in live else "MISSING"
            print(f"  {role}: {wid}  [{tag}]")
    action_studio_test(quiet_ok=True)
    action_queue_test(quiet_ok=True)


def action_studio_test(*, quiet_ok: bool = False) -> None:
    token = os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    headers = {}
    if token:
        headers["X-Studio-Token"] = token
    code, data = curl_json("GET", f"{studio_url()}/studio/health", headers=headers)
    if code == 200 and isinstance(data, dict) and data.get("ok"):
        print(
            f"studio OK  vam1={data.get('vam1')} vaf1={data.get('vaf1')} "
            f"({studio_url()})"
        )
    else:
        print(f"studio FAIL HTTP {code}: {data}", file=sys.stderr)
        if not quiet_ok:
            raise SystemExit(1)


def action_queue_test(*, quiet_ok: bool = False) -> None:
    token = worker_token()
    if not token:
        print(
            "queue SKIP — set PORTRAIT_WORKER_TOKEN or PORTRAIT_STUDIO_TOKEN",
            file=sys.stderr,
        )
        if not quiet_ok:
            raise SystemExit(1)
        return
    code, data = curl_json(
        "GET",
        f"{queue_base()}/api/portrait/queue/health",
        headers={"X-Portrait-Worker-Token": token},
    )
    if code == 200 and isinstance(data, dict) and data.get("success"):
        q = (data.get("data") or {}).get("queue") or {}
        print(f"queue OK   {q}  ({queue_base()})")
    else:
        print(f"queue FAIL HTTP {code}: {data}", file=sys.stderr)
        if not quiet_ok:
            raise SystemExit(1)


def action_orch_up(*, male_only: bool = False) -> None:
    args = ["up"]
    if male_only:
        args.append("--male-only")
    run_py(ORCH, *args)


def action_orch_status() -> None:
    run_py(ORCH, "status")


def action_preview_server() -> None:
    run_py(PREVIEW_AGENT)


def action_kill(*, force: bool = False) -> None:
    from portrait_common import kill_imagine_clients

    kill_imagine_clients(force=force)


def prompt(msg: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        val = input(f"{msg}{suffix}: ").strip()
    except EOFError:
        print()
        return default
    return val or default


def menu() -> None:
    items: list[tuple[str, callable]] = [
        ("Status (windows + studio + queue)", action_status),
        ("Orch up (vam1 + vaf1)", lambda: action_orch_up(male_only=False)),
        ("Orch up (male only)", lambda: action_orch_up(male_only=True)),
        ("Orch status", action_orch_status),
        ("Kill all Imagine clients", action_kill),
        ("Preview HTTP agent (for website Snap)", action_preview_server),
        ("Worker once", lambda: run_py(WORKER, "once")),
        ("Worker loop", lambda: run_py(WORKER, "loop")),
        (
            f"Init camera {MANNEQUIN_M}",
            lambda: run_py(WORKER, "init-camera", MANNEQUIN_M),
        ),
        (
            f"Init camera {MANNEQUIN_F}",
            lambda: run_py(WORKER, "init-camera", MANNEQUIN_F),
        ),
        ("Reset camera (all)", lambda: run_py(WORKER, "reset-camera")),
        (
            f"Preview snap {MANNEQUIN_M}",
            lambda: run_py(WORKER, "preview", MANNEQUIN_M),
        ),
        (
            f"Preview snap {MANNEQUIN_F}",
            lambda: run_py(WORKER, "preview", MANNEQUIN_F),
        ),
        (
            f"Ensure-name {MANNEQUIN_M}",
            lambda: run_py(WORKER, "ensure-name", MANNEQUIN_M),
        ),
        (
            f"Ensure-name {MANNEQUIN_F}",
            lambda: run_py(WORKER, "ensure-name", MANNEQUIN_F),
        ),
        ("Studio health test", action_studio_test),
        ("Queue HTTP health test", action_queue_test),
        ("Watchdog once", lambda: run_py(WATCHDOG, "--once")),
        ("Launch one client", lambda: run_bash(LAUNCH)),
        (
            f"Login {MANNEQUIN_M} (window from pin map)",
            lambda: _login_role(MANNEQUIN_M),
        ),
        (
            f"Login {MANNEQUIN_F} (window from pin map)",
            lambda: _login_role(MANNEQUIN_F),
        ),
    ]

    while True:
        print()
        print("Portrait CLI")
        print("─" * 40)
        for i, (label, _) in enumerate(items, 1):
            print(f"  {i:2d}. {label}")
        print("   0. Quit")
        choice = prompt("Select", "0")
        if choice in {"0", "q", "quit", "exit"}:
            return
        if not choice.isdigit() or not (1 <= int(choice) <= len(items)):
            print("invalid choice")
            continue
        label, fn = items[int(choice) - 1]
        print(f"\n→ {label}\n")
        try:
            fn()
        except SystemExit as e:
            if e.code not in (0, None):
                print(f"(exit {e.code})", file=sys.stderr)
        except KeyboardInterrupt:
            print("\n(interrupted)")
        except subprocess.CalledProcessError as e:
            print(f"command failed: {e}", file=sys.stderr)


def _login_role(role: str) -> None:
    from portrait_common import resolve_mannequin_window

    wid = resolve_mannequin_window(role)
    if not wid:
        die(f"no pinned window for {role} — run orch up first")
    run_py(LOGIN, role, "--window", wid)


COMMANDS = {
    "status": action_status,
    "studio-test": action_studio_test,
    "queue-test": action_queue_test,
    "orch-up": lambda: action_orch_up(male_only=False),
    "orch-up-male": lambda: action_orch_up(male_only=True),
    "orch-status": action_orch_status,
    "kill": action_kill,
    "down": action_kill,
    "preview-server": action_preview_server,
    "once": lambda: run_py(WORKER, "once"),
    "loop": lambda: run_py(WORKER, "loop"),
    "menu": menu,
}


def main() -> None:
    loaded = load_portrait_env()
    if loaded:
        print("env from: " + ", ".join(str(p) for p in loaded))

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "command",
        nargs="?",
        default="menu",
        choices=sorted(COMMANDS.keys()),
        help="menu (default) or a one-shot command",
    )
    args = ap.parse_args()

    if not WORKER.is_file():
        die(f"missing {WORKER}")

    needs_x = args.command in {
        "orch-up",
        "orch-up-male",
        "orch-status",
        "once",
        "loop",
        "menu",
        "status",
    }
    if needs_x:
        ensure_display()

    # Tools hint (non-fatal for queue/studio tests).
    missing = [t for t in ("xdotool", "curl") if not shutil.which(t)]
    if missing and args.command in {
        "orch-up",
        "orch-up-male",
        "once",
        "loop",
        "menu",
    }:
        print(f"note: missing on PATH: {', '.join(missing)}", file=sys.stderr)

    COMMANDS[args.command]()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Interactive menu / supervisor for Path 1 portrait tools (homelab / local).

Preferred entry:
  cd deploy-studio
  ./studio                # menu
  ./studio up|down|status|check

  ./studio up             # agent: worker + preview + watchdog (no clients)
  ./studio orch-up        # launch + login Imagine clients (or use Admin UI)
  ./studio down           # stop agent; add --clients to also kill Imagine

Optional env file in this directory: `.env` or `.env.local` (PORTRAIT_* only).
Queue HTTP uses PORTRAIT_QUEUE_URL (website host), not a local website tree.

Monorepo convenience: `npm run portrait-cli` from website/.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Ensure sibling imports work when run as a script.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from portrait_common import (  # noqa: E402
    ROOT,
    WORK_DIR,
    WINDOWS_PATH,
    ensure_display,
    find_imagine_windows,
    load_portrait_env,
    load_window_map,
)

WEBSITE = ROOT / "website"

PREVIEW_AGENT = HERE / "portrait-preview-agent.py"
PING_AGENT = HERE / "portrait-ping-agent.py"
WORKER = HERE / "portrait-worker.py"
ORCH = HERE / "portrait-orch.py"
LOGIN = HERE / "portrait-login.py"
LAUNCH = HERE / "portrait-launch.sh"
WATCHDOG = HERE / "portrait-watchdog.py"
INSTALL_SH = HERE / "install.sh"

MANNEQUIN_M = os.environ.get("PORTRAIT_MANNEQUIN_M", "vam1")
MANNEQUIN_F = os.environ.get("PORTRAIT_MANNEQUIN_F", "vaf1")

WORKER_PID = WORK_DIR / "worker.pid"
PREVIEW_PID = WORK_DIR / "preview.pid"
WATCHDOG_PID = WORK_DIR / "watchdog.pid"
WORKER_LOG = WORK_DIR / "worker.log"
PREVIEW_LOG = WORK_DIR / "preview.log"
WATCHDOG_LOG = WORK_DIR / "watchdog.log"


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
    wpid = _read_pid(WORKER_PID)
    ppid = _read_pid(PREVIEW_PID)
    wdpid = _read_pid(WATCHDOG_PID)
    print(f"worker:      {'pid ' + str(wpid) if wpid else 'stopped'}  ({WORKER_LOG})")
    print(f"preview:     {'pid ' + str(ppid) if ppid else 'stopped'}  ({PREVIEW_LOG})")
    print(
        f"watchdog:    {'pid ' + str(wdpid) if wdpid else 'stopped'}  ({WATCHDOG_LOG})"
    )
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


def action_ping(*, check_only: bool = False) -> None:
    """Lightweight token handshake — no Wine / Imagine clients."""
    if not PING_AGENT.is_file():
        die(f"missing {PING_AGENT}")
    args: list[str] = []
    if check_only:
        args.append("--check-only")
    run_py(PING_AGENT, *args)


def action_kill(*, force: bool = False) -> None:
    from portrait_common import kill_imagine_clients

    kill_imagine_clients(force=force)


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _read_pid(path: Path) -> int | None:
    if not path.is_file():
        return None
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    if not _pid_alive(pid):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return None
    return pid


def _stop_pidfile(path: Path, label: str) -> None:
    pid = _read_pid(path)
    if pid is None:
        print(f"{label}: not running")
        return
    print(f"{label}: stopping pid {pid}")
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        path.unlink(missing_ok=True)
        return
    for _ in range(30):
        if not _pid_alive(pid):
            break
        time.sleep(0.1)
    else:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    path.unlink(missing_ok=True)


def _spawn_background(
    label: str,
    pid_path: Path,
    log_path: Path,
    script: Path,
    *args: str,
    required: bool = True,
) -> bool:
    existing = _read_pid(pid_path)
    if existing is not None:
        print(f"{label}: already running (pid {existing})")
        return True
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(script), *args]
    print(f"{label}: $ {' '.join(cmd)}  → {log_path}")
    with log_path.open("a", encoding="utf-8") as log:
        log.write(f"\n# start {time.strftime('%Y-%m-%d %H:%M:%S')} {' '.join(cmd)}\n")
        log.flush()
        proc = subprocess.Popen(
            cmd,
            cwd=str(HERE),
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=os.environ.copy(),
        )
    pid_path.write_text(f"{proc.pid}\n", encoding="utf-8")
    time.sleep(0.5)
    if proc.poll() is not None:
        msg = f"{label} exited immediately (rc {proc.returncode}); see {log_path}"
        if required:
            die(msg)
        print(f"warning: {msg}", file=sys.stderr)
        try:
            pid_path.unlink(missing_ok=True)
        except OSError:
            pass
        return False
    print(f"{label}: pid {proc.pid}")
    return True


def action_check() -> None:
    if not INSTALL_SH.is_file():
        die(f"missing {INSTALL_SH}")
    rc = subprocess.call(["bash", str(INSTALL_SH)], cwd=str(HERE))
    if rc != 0:
        raise SystemExit(rc)


def action_up(*, skip_check: bool = False) -> None:
    """Start always-on agent: worker + preview + offline watchdog. No game clients."""
    if not skip_check:
        action_check()
    ensure_display()
    # Preview/control first so Admin can Start clients even if worker is flaky.
    _spawn_background("preview", PREVIEW_PID, PREVIEW_LOG, PREVIEW_AGENT)
    _spawn_background(
        "worker", WORKER_PID, WORKER_LOG, WORKER, "loop", required=False
    )
    _spawn_background(
        "watchdog", WATCHDOG_PID, WATCHDOG_LOG, WATCHDOG, required=False
    )
    print()
    print("studio up — worker + preview + watchdog (no Imagine clients)")
    print(f"  logs: {WORKER_LOG}")
    print(f"        {PREVIEW_LOG}")
    print(f"        {WATCHDOG_LOG}")
    print("  start clients: Admin → Studio, or ./studio orch-up")
    print("  stop agent:    ./studio down")
    print("  stop + kill:   ./studio down --clients")


def action_down(*, clients: bool = False) -> None:
    """Stop worker + preview + watchdog. Optionally kill Imagine clients too."""
    _stop_pidfile(WATCHDOG_PID, "watchdog")
    _stop_pidfile(WORKER_PID, "worker")
    _stop_pidfile(PREVIEW_PID, "preview")
    if clients:
        run_py(ORCH, "down", check=False)
        print("studio down (agent + clients)")
    else:
        print("studio down (agent only — clients still running if any)")
        print("  kill clients: ./studio kill  or  ./studio down --clients")


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
        ("Studio up (worker + preview + watchdog)", lambda: action_up()),
        ("Studio down (agent only)", lambda: action_down(clients=False)),
        ("Studio down + kill clients", lambda: action_down(clients=True)),
        ("Ping (token check + lightweight listen)", lambda: action_ping()),
        ("Ping check-only (outbound tokens)", lambda: action_ping(check_only=True)),
        ("Install check", action_check),
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
        (
            f"Debug snap {MANNEQUIN_M}",
            lambda: action_debug_snap(MANNEQUIN_M),
        ),
        (
            f"Debug snap {MANNEQUIN_F}",
            lambda: action_debug_snap(MANNEQUIN_F),
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


def action_debug_snap(role: str) -> None:
    """One-off window shot while stuck (no re-login)."""
    from portrait_common import debug_snap, ensure_display

    ensure_display()
    r = role.strip().lower()
    if r not in {"vam1", "vaf1", "vam", "vaf"}:
        die("debug-snap role must be vam1 or vaf1")
    if r == "vam":
        r = "vam1"
    if r == "vaf":
        r = "vaf1"
    path = debug_snap(r, "manual")
    if not path:
        die(f"debug-snap failed for {r}")


COMMANDS = {
    "status": action_status,
    "check": action_check,
    "ping": lambda: action_ping(check_only=False),
    "ping-check": lambda: action_ping(check_only=True),
    "up": lambda: action_up(),
    "up-male": lambda: action_up(),  # alias: agent only; use orch-up-male for clients
    "studio-test": action_studio_test,
    "queue-test": action_queue_test,
    "orch-up": lambda: action_orch_up(male_only=False),
    "orch-up-male": lambda: action_orch_up(male_only=True),
    "orch-status": action_orch_status,
    "kill": action_kill,
    "down": action_down,
    "preview-server": action_preview_server,
    "once": lambda: run_py(WORKER, "once"),
    "loop": lambda: run_py(WORKER, "loop"),
    "debug-snap": lambda: None,  # handled specially (needs role arg)
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
    ap.add_argument(
        "--skip-check",
        action="store_true",
        help="with up/up-male: skip install.sh gate",
    )
    ap.add_argument(
        "--clients",
        action="store_true",
        help="with down: also kill Imagine clients (orch down)",
    )
    args, rest = ap.parse_known_args()

    if not WORKER.is_file():
        die(f"missing {WORKER}")

    if args.command == "up":
        action_up(skip_check=args.skip_check)
        return
    if args.command == "up-male":
        print(
            "note: ./studio up no longer launches clients; "
            "use ./studio orch-up-male (or Admin → Start clients)",
            file=sys.stderr,
        )
        action_up(skip_check=args.skip_check)
        return
    if args.command == "down":
        action_down(clients=args.clients)
        return
    if args.command == "ping":
        if not PING_AGENT.is_file():
            die(f"missing {PING_AGENT}")
        run_py(PING_AGENT, *rest)
        return
    if args.command == "ping-check":
        action_ping(check_only=True)
        return
    if args.command == "debug-snap":
        role = rest[0] if rest else MANNEQUIN_M
        action_debug_snap(role)
        return

    needs_x = args.command in {
        "orch-up",
        "orch-up-male",
        "orch-status",
        "once",
        "loop",
        "menu",
        "status",
        "down",
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
        "up",
        "up-male",
    }:
        print(f"note: missing on PATH: {', '.join(missing)}", file=sys.stderr)

    COMMANDS[args.command]()


if __name__ == "__main__":
    main()

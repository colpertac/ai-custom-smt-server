#!/usr/bin/env python3
"""Shared window pinning for portrait mannequin clients.

Both Imagine windows share the same title, so we remember X window ids in
work/portrait-captures/windows.json (written by portrait-orch).
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent


def _resolve_repo_root() -> Path:
    """Find ai_custom_smt_server when present; else treat package as standalone.

    Layouts:
      …/ai_custom_smt_server/deploy-studio  → parent has website/
      …/ai_custom_smt_server/scripts/portrait → parents[2] has website/ (legacy)
      scp'd folder alone → HERE (work/ lives next to the scripts)
    """
    if (HERE.parent / "website").is_dir():
        return HERE.parent
    try:
        legacy = HERE.parents[2]
    except IndexError:
        legacy = None
    if legacy is not None and (legacy / "website").is_dir():
        return legacy
    return HERE


ROOT = _resolve_repo_root()
WORK_DIR = Path(
    os.environ.get(
        "PORTRAIT_WORK_DIR",
        str(
            ROOT / "work" / "portrait-captures"
            if (ROOT / "website").is_dir()
            else HERE / "work"
        ),
    )
)
WINDOW_TITLE = os.environ.get("PORTRAIT_WINDOW_TITLE", "IMAGINE Version 1.666")
WINDOWS_PATH = Path(
    os.environ.get("PORTRAIT_WINDOWS_STATE", str(WORK_DIR / "windows.json"))
)

# Hard cap for mannequin clients — never spawn an unbounded farm.
MAX_MANNEQUIN_CLIENTS = 2
ALLOWED_MANNEQUIN_ROLES = ("vam1", "vaf1")


def load_portrait_env() -> list[Path]:
    """Load env files via python-dotenv (does not override existing vars).

    Search order:
      PORTRAIT_ENV_FILE, deploy-studio/.env, deploy-studio/.env.local,
      website/.env.local (monorepo only; optional)
    """
    try:
        from dotenv import load_dotenv
    except ImportError:
        # Plain interpreter without uv deps — minimal PORTRAIT_* parser.
        return _load_portrait_env_fallback()

    candidates: list[Path] = []
    custom = os.environ.get("PORTRAIT_ENV_FILE", "").strip()
    if custom:
        candidates.append(Path(custom).expanduser())
    candidates.extend(
        [
            HERE / ".env",
            HERE / ".env.local",
            ROOT / "website" / ".env.local",
        ]
    )
    loaded: list[Path] = []
    for path in candidates:
        if not path.is_file():
            continue
        if load_dotenv(path, override=False):
            loaded.append(path)
    return loaded


def _load_portrait_env_fallback() -> list[Path]:
    candidates: list[Path] = []
    custom = os.environ.get("PORTRAIT_ENV_FILE", "").strip()
    if custom:
        candidates.append(Path(custom).expanduser())
    candidates.extend(
        [
            HERE / ".env",
            HERE / ".env.local",
            ROOT / "website" / ".env.local",
        ]
    )
    loaded: list[Path] = []
    for path in candidates:
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        any_key = False
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            if key in os.environ and os.environ[key].strip():
                continue
            os.environ[key] = val.strip().strip("'").strip('"')
            any_key = True
        if any_key:
            loaded.append(path)
    return loaded


def _display_works(display: str, *, timeout_sec: float = 2.0) -> bool:
    env = os.environ.copy()
    env["DISPLAY"] = display
    try:
        subprocess.check_call(
            ["xdpyinfo"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout_sec,
        )
        return True
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def _xvfb_lock_path(display: str) -> Path:
    # :99 → /tmp/.X99-lock
    num = display.lstrip(":").split(".", 1)[0]
    return Path(f"/tmp/.X{num}-lock")


def _xvfb_socket_path(display: str) -> Path:
    num = display.lstrip(":").split(".", 1)[0]
    return Path(f"/tmp/.X11-unix/X{num}")


def _kill_display_server(display: str) -> None:
    """Best-effort tear-down of a wedged Xvfb for ``display`` (and its lock)."""
    num = display.lstrip(":").split(".", 1)[0]
    # Prefer killing by cmdline match so we don't touch a real desktop :0.
    try:
        out = subprocess.check_output(
            ["pgrep", "-af", f"Xvfb :{num}"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        out = ""
    for line in out.splitlines():
        parts = line.split(None, 1)
        if not parts:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == os.getpid():
            continue
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            continue
        except PermissionError:
            continue
    time.sleep(0.4)
    for line in out.splitlines():
        parts = line.split(None, 1)
        if not parts:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        try:
            os.kill(pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            pass
    for path in (_xvfb_lock_path(display), _xvfb_socket_path(display)):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def ensure_display(*, recover: bool = True) -> str:
    """Ensure a usable X display (start Xvfb if SSH/headless has none).

    Order: existing $DISPLAY → PORTRAIT_XVFB_DISPLAY (default :99) → start Xvfb.
    If the target display is wedged (lock present but xdpyinfo hangs/fails),
    kill that Xvfb and restart it when ``recover`` is True.
    """
    current = os.environ.get("DISPLAY", "").strip()
    if current and _display_works(current):
        os.environ["DISPLAY"] = current
        _maybe_start_wm(current)
        _disable_display_sleep(current)
        return current

    target = os.environ.get("PORTRAIT_XVFB_DISPLAY", ":99").strip() or ":99"
    if not target.startswith(":"):
        target = f":{target}"

    if not _display_works(target):
        lock = _xvfb_lock_path(target)
        if recover and (lock.is_file() or _xvfb_socket_path(target).exists()):
            print(
                f"display {target} not responding — recovering Xvfb "
                f"(stale lock/socket)",
                flush=True,
            )
            _kill_display_server(target)
            time.sleep(0.3)

        if _display_works(target):
            os.environ["DISPLAY"] = target
            _maybe_start_wm(target)
            _disable_display_sleep(target)
            return target

        if not shutil.which("Xvfb"):
            raise RuntimeError(
                "no usable DISPLAY and Xvfb not installed. "
                "Set DISPLAY to a real X session, or install xvfb."
            )
        log = WORK_DIR / "xvfb.log"
        WORK_DIR.mkdir(parents=True, exist_ok=True)
        # Geometry matches a typical 1080p client capture frame.
        cmd = [
            "Xvfb",
            target,
            "-screen",
            "0",
            os.environ.get("PORTRAIT_XVFB_SCREEN", "1920x1080x24"),
            "-ac",
            "+extension",
            "GLX",
            "+render",
            "-noreset",
        ]
        with log.open("a", encoding="utf-8") as fh:
            fh.write(f"\n# starting {' '.join(cmd)}\n")
            fh.flush()
            proc = subprocess.Popen(
                cmd,
                stdout=fh,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        # Wait briefly for the socket.
        for _ in range(25):
            if _display_works(target):
                break
            if proc.poll() is not None:
                # Immediate fail often means lock still held — one more recover.
                if recover:
                    _kill_display_server(target)
                    with log.open("a", encoding="utf-8") as fh:
                        fh.write(f"\n# retry starting {' '.join(cmd)}\n")
                        fh.flush()
                        proc = subprocess.Popen(
                            cmd,
                            stdout=fh,
                            stderr=subprocess.STDOUT,
                            start_new_session=True,
                        )
                    recover = False
                    continue
                raise RuntimeError(
                    f"Xvfb failed to start ({target}); see {log}"
                )
            time.sleep(0.1)
        else:
            raise RuntimeError(
                f"Xvfb started but display {target} not ready; see {log}"
            )
        print(f"started Xvfb on {target} (pid {proc.pid})", flush=True)

    os.environ["DISPLAY"] = target
    # Optional WM if present (helps wmctrl / focus); openbox etc.
    _maybe_start_wm(target)
    _disable_display_sleep(target)
    return target


def _disable_display_sleep(display: str) -> None:
    """Turn off X screensaver / DPMS so idle Wine clients don't blank.

    Wine does not emulate Windows sleep; blank frames are usually DPMS or a
    dead GL context. Safe on Xvfb; no-op if ``xset`` is missing.
    """
    if os.environ.get("PORTRAIT_KEEP_DPMS", "").strip() in ("1", "true", "yes"):
        return
    if not shutil.which("xset"):
        return
    env = os.environ.copy()
    env["DISPLAY"] = display
    try:
        subprocess.run(
            ["xset", "s", "off"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
            check=False,
        )
        subprocess.run(
            ["xset", "-dpms"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
            check=False,
        )
        subprocess.run(
            ["xset", "s", "noblank"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def nudge_mannequin_windows() -> None:
    """Tiny mouse wiggle on live Imagine windows to keep Wine GL presenting."""
    if os.environ.get("PORTRAIT_SKIP_IDLE_NUDGE", "").strip() in (
        "1",
        "true",
        "yes",
    ):
        return
    if not shutil.which("xdotool"):
        return
    try:
        ensure_display(recover=False)
    except Exception:
        return
    for wid in find_imagine_windows():
        try:
            focus_x_window(wid)
            subprocess.run(
                ["xdotool", "mousemove", "--window", wid, "40", "40"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=2,
            )
            subprocess.run(
                ["xdotool", "mousemove", "--window", wid, "42", "41"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=2,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue


def _maybe_start_wm(display: str) -> None:
    if os.environ.get("PORTRAIT_SKIP_WM", "").strip() in ("1", "true", "yes"):
        return
    for name in ("openbox", "fluxbox", "icewm", "xfwm4"):
        path = shutil.which(name)
        if not path:
            continue
        env = os.environ.copy()
        env["DISPLAY"] = display
        # Already running?
        try:
            out = subprocess.check_output(
                ["pgrep", "-af", f"{name}"], text=True, env=env
            )
            if display in out or f"DISPLAY={display}" in out:
                return
        except subprocess.CalledProcessError:
            pass
        subprocess.Popen(
            [path],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return


def find_imagine_windows() -> list[str]:
    """Return X window ids for Imagine clients (hex, wmctrl-style)."""
    needle = WINDOW_TITLE.lower()
    hits = _find_windows_wmctrl(needle)
    if hits:
        return hits
    hits = _find_windows_xdotool(needle)
    if hits:
        return hits
    return _find_windows_xwininfo(needle)


def _norm_wid(wid: str) -> str:
    wid = wid.strip().lower()
    if wid.startswith("0x"):
        return "0x" + wid[2:].lstrip("0") or "0x0"
    try:
        return hex(int(wid))
    except ValueError:
        return wid


def _find_windows_wmctrl(needle: str) -> list[str]:
    if not shutil.which("wmctrl"):
        return []
    try:
        out = subprocess.check_output(
            ["wmctrl", "-l"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return []
    hits: list[str] = []
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        wid, title = parts[0], parts[3]
        if needle in title.lower():
            hits.append(_norm_wid(wid))
    return hits


def _find_windows_xdotool(needle: str) -> list[str]:
    if not shutil.which("xdotool"):
        return []
    try:
        # --name matches WM_NAME; Imagine sets title after splash.
        ids = subprocess.check_output(
            ["xdotool", "search", "--name", needle],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=3,
        ).split()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return []
    return [_norm_wid(i) for i in ids if i.strip()]


def _find_windows_xwininfo(needle: str) -> list[str]:
    if not shutil.which("xwininfo"):
        return []
    try:
        out = subprocess.check_output(
            ["xwininfo", "-root", "-tree"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return []
    hits: list[str] = []
    for line in out.splitlines():
        # "     0x1234567 \"IMAGINE Version 1.666\": ..."
        if needle not in line.lower():
            continue
        line = line.strip()
        if not line.startswith("0x"):
            continue
        wid = line.split(None, 1)[0]
        hits.append(_norm_wid(wid))
    return hits


def load_window_map() -> dict[str, str]:
    if not WINDOWS_PATH.is_file():
        return {}
    try:
        raw = json.loads(WINDOWS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, str] = {}
    for k, v in (raw.get("windows") or raw or {}).items():
        if isinstance(k, str) and isinstance(v, str) and v.strip():
            out[k.strip().lower()] = v.strip()
    return out


def save_window_map(windows: dict[str, str]) -> None:
    WINDOWS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "windows": {k.lower(): v for k, v in windows.items()},
    }
    WINDOWS_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def resolve_mannequin_window(mannequin: str, *, explicit: str | None = None) -> str | None:
    """Env override → windows.json → None (caller may fall back)."""
    if explicit and explicit.strip():
        return explicit.strip()
    env_key = f"PORTRAIT_WINDOW_{mannequin.upper()}"
    override = os.environ.get(env_key, "").strip()
    if override:
        return override
    generic = os.environ.get("PORTRAIT_WINDOW_ID", "").strip()
    if generic:
        return generic
    return load_window_map().get(mannequin.lower())


def focus_x_window(wid: str) -> None:
    """Focus a window under Xvfb/headless (no EWMH WM required).

    ``windowactivate`` needs _NET_ACTIVE_WINDOW (a real WM). On bare Xvfb use
    ``windowfocus`` + ``windowraise`` instead so Wine gets keystrokes/clicks.
    """
    if not wid:
        return
    if shutil.which("wmctrl"):
        subprocess.run(
            ["wmctrl", "-i", "-a", wid],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    if not shutil.which("xdotool"):
        return
    # Prefer activate when a WM is present; always fall back to focus.
    act = subprocess.run(
        ["xdotool", "windowactivate", "--sync", wid],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if act.returncode != 0:
        subprocess.run(
            ["xdotool", "windowfocus", "--sync", wid],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["xdotool", "windowraise", wid],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    time.sleep(0.25)


def focus_only_window(active_wid: str, other_wids: list[str] | None = None) -> None:
    """Minimize sibling Imagine windows, then focus ``active_wid``.

    Two Wine clients on bare Xvfb steal focus from each other; keys go to the
    wrong one unless the inactive client is minimized first (same idea as orch).
    """
    if not active_wid:
        return
    if other_wids is None:
        other_wids = [w for w in find_imagine_windows() if _norm_wid(w) != _norm_wid(active_wid)]
    if shutil.which("xdotool"):
        for wid in other_wids:
            if _norm_wid(wid) == _norm_wid(active_wid):
                continue
            subprocess.run(
                ["xdotool", "windowminimize", wid],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        subprocess.run(
            ["xdotool", "windowmap", active_wid],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["xdotool", "windowraise", active_wid],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    focus_x_window(active_wid)
    time.sleep(0.35)


def _client_exe_name() -> str:
    return os.environ.get("PORTRAIT_CLIENT_EXE", "ImagineClient.exe").strip() or (
        "ImagineClient.exe"
    )


def list_imagine_processes() -> list[tuple[int, str]]:
    """PIDs whose cmdline looks like the Imagine Wine client (or helpers)."""
    exe = _client_exe_name().lower()
    exe_stem = exe.removesuffix(".exe")
    client_dir = os.environ.get("PORTRAIT_CLIENT_DIR", "").strip().lower()
    wineprefix = os.environ.get("WINEPREFIX", "").strip()

    try:
        out = subprocess.check_output(["ps", "-eo", "pid=,args="], text=True)
    except (OSError, subprocess.CalledProcessError):
        return []

    hits: list[tuple[int, str]] = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(None, 1)
        if len(parts) < 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        args = parts[1]
        low = args.lower()
        # Never kill ourselves / orchestrator helpers.
        if (
            "portrait-orch" in low
            or "portrait-cli" in low
            or "portrait_common" in low
            or "/studio" in low
            or low.endswith(" studio")
        ):
            continue
        match = False
        if exe in low or f"{exe_stem}.exe" in low:
            match = True
        elif client_dir and client_dir in low and (
            "wine" in low or exe_stem in low
        ):
            match = True
        elif wineprefix and wineprefix in args and "wineserver" in low:
            # Only when a dedicated prefix is set (safer than killing all wineserver).
            match = True
        if match:
            hits.append((pid, args))
    return hits


def count_imagine_clients() -> dict[str, int]:
    """How many Imagine clients are live (windows + processes)."""
    wins = find_imagine_windows()
    procs = list_imagine_processes()
    return {
        "windows": len(wins),
        "processes": len(procs),
        "count": max(len(wins), len(procs)),
    }


def normalize_mannequin_roles(
    roles: list[str],
    *,
    male_only: bool = False,
    max_clients: int = MAX_MANNEQUIN_CLIENTS,
) -> list[str]:
    """Clamp to vam1/vaf1, dedupe, hard-cap at max_clients (default 2)."""
    if male_only:
        return ["vam1"]
    allowed = set(ALLOWED_MANNEQUIN_ROLES)
    out: list[str] = []
    seen: set[str] = set()
    for raw in roles:
        r = raw.strip().lower()
        if r == "vam":
            r = "vam1"
        elif r == "vaf":
            r = "vaf1"
        if r not in allowed or r in seen:
            continue
        seen.add(r)
        out.append(r)
        if len(out) >= max(1, max_clients):
            break
    return out or ["vam1"]


def assert_room_to_launch(
    *,
    want: int,
    force: bool = False,
) -> None:
    """Refuse to spawn when clients already occupy the machine.

    Raises RuntimeError with a clear message (agent / orch catch as die).
    """
    want = max(1, min(int(want), MAX_MANNEQUIN_CLIENTS))
    info = count_imagine_clients()
    n = info["count"]
    if n <= 0:
        return
    if force:
        print(
            f"warning: --ok-existing / force: {n} Imagine client(s) already "
            f"running (windows={info['windows']} procs={info['processes']}); "
            "launching anyway — this can overload the host",
            file=sys.stderr,
        )
        return
    raise RuntimeError(
        f"{n} Imagine client(s) already running "
        f"(windows={info['windows']}, processes={info['processes']}). "
        f"Refusing to launch more (cap {MAX_MANNEQUIN_CLIENTS}). "
        "Kill clients first, then Start again."
    )


def kill_imagine_clients(*, force: bool = False, clear_windows: bool = True) -> int:
    """Find and kill Imagine / Wine client processes. Returns number killed.

    Headless replacement for closing the game window in a GUI session.
    Sends SIGTERM, waits briefly, then SIGKILL for leftovers.
    """
    procs = list_imagine_processes()
    if not procs:
        print("no Imagine/Wine client processes found")
        if clear_windows and WINDOWS_PATH.is_file():
            WINDOWS_PATH.unlink(missing_ok=True)
            print(f"cleared {WINDOWS_PATH}")
        return 0

    print(f"killing {len(procs)} process(es):")
    for pid, args in procs:
        shown = args if len(args) < 120 else args[:117] + "…"
        print(f"  pid {pid}: {shown}")

    sig = signal.SIGKILL if force else signal.SIGTERM
    killed = 0
    for pid, _ in procs:
        try:
            os.kill(pid, sig)
            killed += 1
        except ProcessLookupError:
            pass
        except PermissionError as e:
            print(f"  skip pid {pid}: {e}", file=sys.stderr)

    if not force and killed:
        time.sleep(1.0)
        leftover = list_imagine_processes()
        for pid, args in leftover:
            try:
                os.kill(pid, signal.SIGKILL)
                print(f"  SIGKILL pid {pid}")
            except (ProcessLookupError, PermissionError):
                pass

    if clear_windows and WINDOWS_PATH.is_file():
        WINDOWS_PATH.unlink(missing_ok=True)
        print(f"cleared {WINDOWS_PATH}")

    still = list_imagine_processes()
    if still:
        print(f"warning: {len(still)} still alive", file=sys.stderr)
        for pid, args in still:
            print(f"  pid {pid}: {args[:100]}", file=sys.stderr)
    else:
        print("all Imagine client processes gone")
    return killed


def _x_window_pid(wid: str) -> int | None:
    """Best-effort PID for an X window id (xdotool / xprop)."""
    if not wid:
        return None
    if shutil.which("xdotool"):
        try:
            out = subprocess.check_output(
                ["xdotool", "getwindowpid", wid],
                text=True,
                stderr=subprocess.DEVNULL,
                timeout=5,
            ).strip()
            return int(out) if out else None
        except (OSError, subprocess.CalledProcessError, ValueError, subprocess.TimeoutExpired):
            pass
    if shutil.which("xprop"):
        try:
            out = subprocess.check_output(
                ["xprop", "-id", wid, "_NET_WM_PID"],
                text=True,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            # _NET_WM_PID(CARDINAL) = 12345
            for part in out.replace("=", " ").split():
                if part.isdigit():
                    return int(part)
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            pass
    return None


def kill_role_client(role: str, *, force: bool = False) -> dict[str, Any]:
    """Kill one mannequin's Imagine window/process; keep other pinned roles."""
    role_n = role.strip().lower()
    if role_n == "vam":
        role_n = "vam1"
    elif role_n == "vaf":
        role_n = "vaf1"
    if role_n not in ALLOWED_MANNEQUIN_ROLES:
        raise RuntimeError("role must be vam1 or vaf1")

    mapped = load_window_map()
    wid = mapped.get(role_n) or resolve_mannequin_window(role_n)
    live = find_imagine_windows()
    killed = 0
    pid = _x_window_pid(wid) if wid else None

    if pid:
        print(f"kill {role_n}: window {wid} pid {pid}")
        sig = signal.SIGKILL if force else signal.SIGTERM
        try:
            os.kill(pid, sig)
            killed = 1
        except ProcessLookupError:
            pass
        except PermissionError as e:
            raise RuntimeError(f"cannot kill pid {pid}: {e}") from e
        if not force and killed:
            time.sleep(0.8)
            try:
                os.kill(pid, 0)
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except PermissionError:
                pass
    elif wid and wid in live:
        # Fallback: close via xdotool when PID unknown
        if shutil.which("xdotool"):
            subprocess.run(
                ["xdotool", "windowkill", wid],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            killed = 1
            print(f"kill {role_n}: xdotool windowkill {wid}")
        else:
            raise RuntimeError(f"no PID for {role_n} window {wid}")
    else:
        print(f"kill {role_n}: no live window (cleared pin only)")

    if role_n in mapped:
        del mapped[role_n]
        if mapped:
            save_window_map(mapped)
        elif WINDOWS_PATH.is_file():
            WINDOWS_PATH.unlink(missing_ok=True)
            print(f"cleared {WINDOWS_PATH}")
        else:
            save_window_map({})

    return {
        "role": role_n,
        "wid": wid,
        "pid": pid,
        "killed": killed,
        "mapped": mapped,
    }


def _proc_environ(pid: int) -> dict[str, str]:
    try:
        raw = Path(f"/proc/{pid}/environ").read_bytes()
    except OSError:
        return {}
    out: dict[str, str] = {}
    for chunk in raw.split(b"\0"):
        if not chunk or b"=" not in chunk:
            continue
        k, _, v = chunk.partition(b"=")
        try:
            out[k.decode()] = v.decode(errors="replace")
        except Exception:
            continue
    return out


def wine_runtime_env() -> dict[str, str]:
    """Env for ``wine`` helpers: match a running ImagineClient (DISPLAY/prefix)."""
    env = os.environ.copy()
    for pid, _ in list_imagine_processes():
        pe = _proc_environ(pid)
        if pe.get("DISPLAY"):
            env["DISPLAY"] = pe["DISPLAY"]
        if pe.get("WINEPREFIX"):
            env["WINEPREFIX"] = pe["WINEPREFIX"]
        if pe.get("WINEARCH"):
            env["WINEARCH"] = pe["WINEARCH"]
        # First matching client is enough (shared wineserver / display).
        break
    if not env.get("DISPLAY", "").strip():
        env["DISPLAY"] = os.environ.get("PORTRAIT_XVFB_DISPLAY", ":99")
    return env


def sendinput_exe_path() -> Path:
    override = os.environ.get("PORTRAIT_SENDINPUT_EXE", "").strip()
    if override:
        return Path(override).expanduser()
    return HERE / "portrait-sendinput.exe"


def wine_hold_key(
    key: str,
    seconds: float,
    *,
    title: str | None = None,
) -> bool:
    """Hold a key via Wine SendInput helper. Returns False if unavailable."""
    exe = sendinput_exe_path()
    if not exe.is_file():
        return False
    wine = (
        os.environ.get("PORTRAIT_WINE", "").strip()
        or shutil.which("wine")
        or shutil.which("wine32")
        or "wine"
    )
    ms = max(1, int(round(seconds * 1000)))
    # Map xdotool-ish names to sendinput names.
    key_l = key.strip().lower()
    if key_l in ("prior", "page_up", "pageup"):
        key_l = "prior"
    elif key_l in ("next", "page_down", "pagedown"):
        key_l = "next"
    cmd = [wine, str(exe)]
    win_title = title if title is not None else os.environ.get(
        "PORTRAIT_WINDOW_TITLE", "IMAGINE Version 1.666"
    ).strip()
    if win_title:
        cmd += ["--title", win_title]
    cmd += ["hold", key_l, str(ms)]
    env = wine_runtime_env()
    try:
        r = subprocess.run(
            cmd,
            env=env,
            cwd=str(exe.parent),
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=max(10.0, seconds + 8.0),
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"warning: wine sendinput failed: {e}", file=sys.stderr)
        return False
    if r.returncode != 0:
        err = (r.stderr or "").strip()[:200]
        print(
            f"warning: wine sendinput exit {r.returncode}"
            + (f": {err}" if err else ""),
            file=sys.stderr,
        )
        return False
    return True


def queue_base_url() -> str:
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


def apply_login_tunables_from_website() -> bool:
    """GET Admin login tunables and apply as process env. Returns True if applied."""
    token = worker_token()
    if not token:
        print("note: no worker/studio token — skip website login tunables")
        return False
    url = f"{queue_base_url()}/api/portrait/login-tunables"
    try:
        out = subprocess.check_output(
            [
                "curl",
                "-sS",
                "--connect-timeout",
                "5",
                "--max-time",
                "15",
                "-H",
                f"X-Portrait-Worker-Token: {token}",
                "-H",
                "Accept: application/json",
                url,
            ],
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as e:
        print(f"note: could not fetch login tunables ({url}): {e}", file=sys.stderr)
        return False
    try:
        payload = json.loads(out)
    except json.JSONDecodeError:
        print("note: login tunables response not JSON", file=sys.stderr)
        return False
    if not payload.get("success"):
        print(
            f"note: login tunables failed: {payload.get('message')}",
            file=sys.stderr,
        )
        return False
    data = payload.get("data") or {}
    env_map = data.get("env") or {}
    if not isinstance(env_map, dict) or not env_map:
        return False
    for k, v in env_map.items():
        if not isinstance(k, str):
            continue
        os.environ[k] = str(v)
    print(f"login tunables from website ({len(env_map)} vars)")
    return True


def debug_screenshots_enabled() -> bool:
    return os.environ.get("PORTRAIT_DEBUG_SCREENSHOTS", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def debug_dir() -> Path:
    d = WORK_DIR / "debug"
    d.mkdir(parents=True, exist_ok=True)
    return d


def screenshot_x_window(wid: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("import"):
        subprocess.check_call(["import", "-window", wid, str(dest)])
        return
    if shutil.which("scrot"):
        focus_x_window(wid)
        subprocess.check_call(["scrot", "-o", str(dest)])
        return
    raise RuntimeError("need ImageMagick `import` or `scrot` for debug screenshots")


def upload_debug_screenshot(path: Path, *, role: str, step: str) -> bool:
    token = worker_token()
    if not token or not path.is_file():
        return False
    url = f"{queue_base_url()}/api/portrait/debug/screenshot"
    try:
        subprocess.check_call(
            [
                "curl",
                "-sS",
                "-f",
                "--connect-timeout",
                "5",
                "--max-time",
                "30",
                "-H",
                f"X-Portrait-Worker-Token: {token}",
                "-F",
                f"role={role}",
                "-F",
                f"step={step}",
                "-F",
                f"file=@{path};type=image/png",
                url,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (OSError, subprocess.CalledProcessError) as e:
        print(f"warning: debug screenshot upload failed: {e}", file=sys.stderr)
        return False


def debug_snap(
    role: str,
    step: str,
    wid: str | None = None,
    *,
    upload: bool = True,
) -> Path | None:
    """Capture mannequin window; upload to website when configured."""
    if not debug_screenshots_enabled() and step not in (
        "manual",
        "admin",
        "watchdog",
        "status",
    ):
        return None
    try:
        ensure_display()
    except SystemExit:
        return None
    window = wid or resolve_mannequin_window(role)
    if not window:
        hits = find_imagine_windows()
        window = hits[0] if hits else None
    if not window:
        print(f"debug-snap {role}/{step}: no window", file=sys.stderr)
        return None
    safe_step = "".join(c if c.isalnum() or c in "-_" else "-" for c in step)[:48]
    dest = debug_dir() / f"{int(time.time())}-{role}-{safe_step or 'snap'}.png"
    try:
        focus_x_window(window)
        screenshot_x_window(window, dest)
    except Exception as e:
        print(f"debug-snap {role}/{step} failed: {e}", file=sys.stderr)
        return None
    uploaded = False
    if upload:
        uploaded = upload_debug_screenshot(
            dest, role=role, step=safe_step or "snap"
        )
    print(
        f"debug-snap {role}/{step} → {dest}"
        + (" (uploaded)" if uploaded else " (local only)")
    )
    return dest

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

HERE = Path(__file__).resolve().parent
# Monorepo: …/ai_custom_smt_server/scripts/portrait → repo root two up.
# Homelab copy: …/smt-portrait/portrait → prefer local work/ under HERE.
_ROOT_CANDIDATE = HERE.parents[2]
ROOT = _ROOT_CANDIDATE if (_ROOT_CANDIDATE / "website").is_dir() else HERE.parent
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


def load_portrait_env() -> list[Path]:
    """Load env files via python-dotenv (does not override existing vars).

    Search order:
      PORTRAIT_ENV_FILE, scripts/portrait/.env, scripts/portrait/.env.local,
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


def _display_works(display: str) -> bool:
    env = os.environ.copy()
    env["DISPLAY"] = display
    try:
        subprocess.check_call(
            ["xdpyinfo"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


def ensure_display() -> str:
    """Ensure a usable X display (start Xvfb if SSH/headless has none).

    Order: existing $DISPLAY → PORTRAIT_XVFB_DISPLAY (default :99) → start Xvfb.
    """
    current = os.environ.get("DISPLAY", "").strip()
    if current and _display_works(current):
        os.environ["DISPLAY"] = current
        _maybe_start_wm(current)
        return current

    target = os.environ.get("PORTRAIT_XVFB_DISPLAY", ":99").strip() or ":99"
    if not target.startswith(":"):
        target = f":{target}"

    if not _display_works(target):
        if not shutil.which("Xvfb"):
            raise SystemExit(
                "error: no usable DISPLAY and Xvfb not installed. "
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
            proc = subprocess.Popen(
                cmd,
                stdout=fh,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        # Wait briefly for the socket.
        for _ in range(20):
            if _display_works(target):
                break
            if proc.poll() is not None:
                raise SystemExit(
                    f"error: Xvfb failed to start ({target}); see {log}"
                )
            time.sleep(0.1)
        else:
            raise SystemExit(
                f"error: Xvfb started but display {target} not ready; see {log}"
            )
        print(f"started Xvfb on {target} (pid {proc.pid})", flush=True)

    os.environ["DISPLAY"] = target
    # Optional WM if present (helps wmctrl / focus); openbox etc.
    _maybe_start_wm(target)
    return target


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
            ["wmctrl", "-l"], text=True, stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
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
        ).split()
    except subprocess.CalledProcessError:
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
        )
    except subprocess.CalledProcessError:
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
        if "portrait-orch" in low or "portrait-cli" in low or "portrait_common" in low:
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

#!/usr/bin/env python3
"""Queued Wine input for Admin → Studio drone (snap → click/type → run).

Not a live stream. Bind one pinned mannequin (wid + pid — both clients share
a title), hide the sibling for the mission, play actions, optional snap.

Login fields drop their caret when the window is deactivated. Click the box
before type/Tab. Do not refocus between a click and the following keys.
Typed text is never logged.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import time
from typing import Any

from portrait_common import (  # noqa: E402
    WORK_DIR,
    debug_snap,
    find_imagine_windows,
    focus_x_window,
    hide_imagine_windows,
    resolve_role_target,
    show_imagine_windows,
    wine_hold_key,
    wine_tap_key,
    wine_type_text,
)

MAX_ACTIONS = 20
MAX_RUNTIME_SEC = 90.0
MAX_TYPE_CHARS = 128
MAX_WAIT_SEC = 15.0
STALE_LOCK_SEC = 120.0

DRONE_LOCK = WORK_DIR / "drone.lock.json"

# Login / splash taps (SendInput). In-world camera → hold.
TAP_KEYS = {
    "escape": "Escape",
    "esc": "Escape",
    "tab": "Tab",
    "return": "Return",
    "enter": "Return",
    "backspace": "BackSpace",
    "back": "BackSpace",
}
SHIFT_TAB_KEYS = {
    "shift+tab",
    "shift-tab",
    "shift_tab",
    "iso_left_tab",
    "backtab",
}
HOLD_KEYS = {
    "s": "s",
    "home": "Home",
    "prior": "Prior",
    "pageup": "Prior",
    "page_up": "Prior",
}

TYPE_DELAY_MS = int(os.environ.get("PORTRAIT_LOGIN_TYPE_DELAY_MS", "35"))
FIELD_GAP_SEC = float(os.environ.get("PORTRAIT_LOGIN_FIELD_GAP_SEC", "0.55"))
HOLD_S_SEC = float(os.environ.get("PORTRAIT_HOLD_S_SEC", "2.0"))
CAM_HOME_SEC = float(os.environ.get("PORTRAIT_CAM_HOME_SEC", "1.1"))
CAM_PGUP_SEC = float(os.environ.get("PORTRAIT_CAM_PGUP_SEC", "0.5"))


def _need_xdotool() -> None:
    if not shutil.which("xdotool"):
        raise RuntimeError("xdotool required on the Wine host")


def _xdo(*args: str) -> None:
    subprocess.run(["xdotool", *args], check=True)


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
        raise RuntimeError(f"could not read window size for {wid}")
    return w, h


def resolve_role_window(role: str) -> str:
    return str(resolve_role_target(role)["wid"])


def normalize_role(raw: str) -> str:
    m = (raw or "").strip().lower()
    if m in {"vam", "vam1"}:
        return "vam1"
    if m in {"vaf", "vaf1"}:
        return "vaf1"
    raise RuntimeError("role must be vam1 or vaf1")


def _frac(value: Any, label: str) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError) as e:
        raise RuntimeError(f"{label} must be a number") from e
    if n < 0.0 or n > 1.0:
        raise RuntimeError(f"{label} must be between 0 and 1")
    return n


def parse_actions(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        raise RuntimeError("actions must be an array")
    if len(raw) == 0:
        raise RuntimeError("actions is empty")
    if len(raw) > MAX_ACTIONS:
        raise RuntimeError(f"at most {MAX_ACTIONS} actions per mission")
    out: list[dict[str, Any]] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise RuntimeError(f"action {i + 1} must be an object")
        op = str(item.get("op") or "").strip().lower()
        if op == "click":
            out.append(
                {
                    "op": "click",
                    "xFrac": _frac(item.get("xFrac"), "xFrac"),
                    "yFrac": _frac(item.get("yFrac"), "yFrac"),
                    "button": int(item.get("button") or 1),
                }
            )
        elif op == "type":
            text = item.get("text")
            if not isinstance(text, str) or not text:
                raise RuntimeError(f"action {i + 1}: type needs text")
            if len(text) > MAX_TYPE_CHARS:
                raise RuntimeError(
                    f"action {i + 1}: type text longer than {MAX_TYPE_CHARS}"
                )
            out.append({"op": "type", "text": text})
        elif op == "key":
            name = str(item.get("name") or "").strip()
            key_l = name.lower().replace(" ", "")
            if (
                key_l not in TAP_KEYS
                and key_l not in HOLD_KEYS
                and key_l not in SHIFT_TAB_KEYS
            ):
                raise RuntimeError(
                    f"action {i + 1}: key must be Escape, Tab, Shift+Tab, "
                    "Return, s, Home, or PageUp"
                )
            out.append({"op": "key", "name": name})
        elif op == "wait":
            try:
                sec = float(item.get("sec"))
            except (TypeError, ValueError) as e:
                raise RuntimeError(f"action {i + 1}: wait needs sec") from e
            if sec < 0 or sec > MAX_WAIT_SEC:
                raise RuntimeError(
                    f"action {i + 1}: wait sec must be 0–{MAX_WAIT_SEC}"
                )
            out.append({"op": "wait", "sec": sec})
        else:
            raise RuntimeError(
                f"action {i + 1}: op must be click, type, key, or wait"
            )
    return out


def read_drone_lock() -> dict[str, Any]:
    if not DRONE_LOCK.is_file():
        return {"state": "idle"}
    try:
        data = json.loads(DRONE_LOCK.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"state": "idle"}
    if not isinstance(data, dict):
        return {"state": "idle"}
    if data.get("state") != "running":
        return data
    started = data.get("startedAt")
    try:
        started_f = float(started) if started is not None else 0.0
    except (TypeError, ValueError):
        started_f = 0.0
    if started_f and (time.time() - started_f) > STALE_LOCK_SEC:
        return {"state": "idle", "stale": True}
    return data


def write_drone_lock(data: dict[str, Any]) -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    DRONE_LOCK.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def drone_busy_role() -> str | None:
    """Role currently under a drone mission, or None."""
    data = read_drone_lock()
    if data.get("state") != "running":
        return None
    role = str(data.get("role") or "").strip().lower()
    return role if role in {"vam1", "vaf1"} else None


def drone_is_busy() -> bool:
    return drone_busy_role() is not None


def acquire_drone_lock(role: str) -> dict[str, Any]:
    current = read_drone_lock()
    if current.get("state") == "running":
        busy = current.get("role") or "unknown"
        raise RuntimeError(f"drone already running on {busy}")
    payload = {
        "state": "running",
        "role": role,
        "pid": os.getpid(),
        "startedAt": time.time(),
        "message": f"drone {role}",
    }
    write_drone_lock(payload)
    return payload


def release_drone_lock(result: dict[str, Any]) -> None:
    try:
        write_drone_lock(result)
    except OSError:
        pass


def _key_label(name: str) -> str:
    key_l = name.strip().lower().replace(" ", "")
    if key_l in SHIFT_TAB_KEYS:
        return "Shift+Tab"
    return TAP_KEYS.get(key_l, name)


def _hold_seconds(key_l: str) -> float:
    if key_l == "s":
        return HOLD_S_SEC
    if key_l == "home":
        return CAM_HOME_SEC
    return CAM_PGUP_SEC


def _click(wid: str, x_frac: float, y_frac: float, button: int) -> dict[str, Any]:
    w, h = window_size(wid)
    x = max(1, min(w - 2, int(round(w * x_frac))))
    y = max(1, min(h - 2, int(round(h * y_frac))))
    btn = 1 if button not in {1, 2, 3} else button
    _xdo("mousemove", "--window", wid, str(x), str(y))
    time.sleep(0.05)
    _xdo("click", "--window", wid, str(btn))
    return {
        "op": "click",
        "ok": True,
        "xFrac": x_frac,
        "yFrac": y_frac,
        "x": x,
        "y": y,
        "windowW": w,
        "windowH": h,
    }


def _type_text(text: str, x11_wid: str | None = None) -> dict[str, Any]:
    # Never log the string. Login needs a prior click or the caret is off.
    if wine_type_text(text, x11_wid=x11_wid):
        return {"op": "type", "ok": True, "chars": len(text), "via": "sendinput"}
    _xdo(
        "type",
        "--clearmodifiers",
        "--delay",
        str(max(1, TYPE_DELAY_MS)),
        "--",
        text,
    )
    return {"op": "type", "ok": True, "chars": len(text), "via": "xdotool"}


def _press_key(name: str, x11_wid: str | None = None) -> dict[str, Any]:
    key_l = name.strip().lower().replace(" ", "")
    if key_l in SHIFT_TAB_KEYS:
        if wine_tap_key("shift+tab", x11_wid=x11_wid):
            time.sleep(FIELD_GAP_SEC)
            return {"op": "key", "ok": True, "name": "Shift+Tab", "via": "sendinput"}
        hold = max(0.05, min(0.25, FIELD_GAP_SEC * 0.2))
        _xdo("keydown", "--clearmodifiers", "Shift_L")
        time.sleep(hold)
        _xdo("key", "Tab")
        time.sleep(hold)
        _xdo("keyup", "Shift_L")
        time.sleep(FIELD_GAP_SEC)
        return {"op": "key", "ok": True, "name": "Shift+Tab", "via": "xdotool"}
    if key_l in TAP_KEYS:
        if wine_tap_key(TAP_KEYS[key_l], x11_wid=x11_wid):
            if key_l in {"tab", "return", "enter"}:
                time.sleep(FIELD_GAP_SEC)
            return {
                "op": "key",
                "ok": True,
                "name": _key_label(name),
                "via": "sendinput",
            }
        _xdo("key", "--clearmodifiers", TAP_KEYS[key_l])
        return {"op": "key", "ok": True, "name": _key_label(name), "via": "xdotool"}
    mapped = HOLD_KEYS[key_l]
    seconds = _hold_seconds(key_l)
    if wine_hold_key(mapped, seconds, x11_wid=x11_wid):
        return {
            "op": "key",
            "ok": True,
            "name": mapped,
            "holdSec": seconds,
            "via": "sendinput",
        }
    # Fallback: tap via xdotool (often ignored in-world).
    xname = {"s": "s", "Home": "Home", "Prior": "Prior"}[mapped]
    _xdo("key", "--clearmodifiers", xname)
    return {
        "op": "key",
        "ok": True,
        "name": mapped,
        "via": "xdotool",
        "note": "sendinput missing — xdotool tap",
    }


def run_drone_mission(
    role_raw: str,
    actions_raw: Any,
    *,
    snap_after: bool = True,
) -> dict[str, Any]:
    """Execute a queued mission. Raises RuntimeError on conflict / bad input."""
    role = normalize_role(role_raw)
    actions = parse_actions(actions_raw)
    _need_xdotool()
    target = resolve_role_target(role)
    wid = str(target["wid"])
    hidden: list[str] = []
    sib = target.get("siblingWid")
    if sib:
        hidden.append(str(sib))
    hidden.extend(
        w for w in find_imagine_windows() if w != wid and w not in hidden
    )
    hide_imagine_windows(hidden)
    focus_x_window(wid)
    started = time.time()
    steps: list[dict[str, Any]] = []
    win_w = win_h = 0
    try:
        win_w, win_h = window_size(wid)
    except Exception:
        pass

    deadline = started + MAX_RUNTIME_SEC
    try:
        for i, action in enumerate(actions):
            if time.time() > deadline:
                raise RuntimeError(
                    f"drone timeout after {MAX_RUNTIME_SEC:.0f}s "
                    f"(finished {i}/{len(actions)})"
                )
            op = action["op"]
            if op == "click":
                steps.append(
                    _click(wid, action["xFrac"], action["yFrac"], action["button"])
                )
            elif op == "type":
                steps.append(_type_text(action["text"], x11_wid=wid))
            elif op == "key":
                steps.append(_press_key(action["name"], x11_wid=wid))
            elif op == "wait":
                time.sleep(action["sec"])
                steps.append({"op": "wait", "ok": True, "sec": action["sec"]})
            time.sleep(0.08)

        snap_meta: dict[str, Any] | None = None
        if snap_after:
            time.sleep(0.25)
            path = debug_snap(role, "drone", wid=wid, upload=True)
            if path and path.is_file():
                raw = path.read_bytes()
                snap_meta = {
                    "path": str(path),
                    "bytes": len(raw),
                    "step": "drone",
                    "pngBase64": base64.b64encode(raw).decode("ascii"),
                }

        return {
            "ok": True,
            "role": role,
            "wid": wid,
            "pid": target.get("pid"),
            "windowW": win_w,
            "windowH": win_h,
            "steps": steps,
            "elapsedSec": round(time.time() - started, 2),
            "snap": snap_meta,
        }
    finally:
        show_imagine_windows(hidden)


def snap_png_bytes(role: str) -> tuple[bytes, dict[str, Any]]:
    """Full-window snap after a mission (or standalone)."""
    role_n = normalize_role(role)
    wid = resolve_role_window(role_n)
    path = debug_snap(role_n, "drone", wid=wid, upload=False)
    if not path or not path.is_file():
        raise RuntimeError(f"drone snap failed for {role_n}")
    meta = {
        "mannequin": role_n,
        "step": "drone",
        "path": str(path),
        "wid": wid,
        "ts": path.stat().st_mtime,
    }
    try:
        w, h = window_size(wid)
        meta["windowW"] = w
        meta["windowH"] = h
    except Exception:
        pass
    return path.read_bytes(), meta

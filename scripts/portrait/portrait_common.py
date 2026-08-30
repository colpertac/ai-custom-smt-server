#!/usr/bin/env python3
"""Shared window pinning for portrait mannequin clients.

Both Imagine windows share the same title, so we remember X window ids in
work/portrait-captures/windows.json (written by portrait-orch).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WINDOW_TITLE = os.environ.get("PORTRAIT_WINDOW_TITLE", "IMAGINE Version 1.666")
WINDOWS_PATH = Path(
    os.environ.get(
        "PORTRAIT_WINDOWS_STATE",
        str(ROOT / "work" / "portrait-captures" / "windows.json"),
    )
)


def find_imagine_windows() -> list[str]:
    if not shutil.which("wmctrl"):
        return []
    try:
        out = subprocess.check_output(["wmctrl", "-l"], text=True)
    except subprocess.CalledProcessError:
        return []
    hits: list[str] = []
    needle = WINDOW_TITLE.lower()
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        wid, title = parts[0], parts[3]
        if needle in title.lower():
            hits.append(wid)
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

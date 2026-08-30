"""Track whether the live channel may be running stale datastore content.

BinaryData / Map / packages changes on disk are not picked up until the
channel process restarts. Overlay is client-updater only and does not mark
the channel stale.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CHANNEL_CONTENT_KINDS = frozenset({"binarydata", "maps", "packages"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def freshness_path(runtime: Path) -> Path:
    return runtime / "releases" / "ops-freshness.json"


def load_freshness(runtime: Path) -> dict[str, Any]:
    path = freshness_path(runtime)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def save_freshness(runtime: Path, data: dict[str, Any]) -> None:
    path = freshness_path(runtime)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def kinds_requiring_channel_restart(
    kind: str, destinations: list[str] | None = None
) -> list[str]:
    """Return channel-affecting kind labels for this ingest."""
    kind = (kind or "").strip().lower()
    if kind in CHANNEL_CONTENT_KINDS:
        return [kind]
    if kind not in {"content", "release"}:
        return []
    found: list[str] = []
    for dest in destinations or []:
        name = Path(dest).name.lower()
        if name == "binarydata" and "binarydata" not in found:
            found.append("binarydata")
        elif name == "map" and "maps" not in found:
            found.append("maps")
        elif name == "packages" and "packages" not in found:
            found.append("packages")
    return found


def destinations_include_overlay(destinations: list[str] | None) -> bool:
    for dest in destinations or []:
        if Path(dest).name.lower() == "overlay":
            return True
    return False


def mark_overlay_change(runtime: Path, *, source: str) -> dict[str, Any]:
    data = load_freshness(runtime)
    data["lastOverlayChangeAt"] = _now_iso()
    data["lastOverlaySource"] = source
    save_freshness(runtime, data)
    return data


def mark_overlay_rehash(runtime: Path) -> dict[str, Any]:
    data = load_freshness(runtime)
    data["lastOverlayRehashAt"] = _now_iso()
    save_freshness(runtime, data)
    return data


def is_overlay_stale(data: dict[str, Any]) -> bool:
    change = data.get("lastOverlayChangeAt")
    if not isinstance(change, str) or not change:
        return False
    rehash = data.get("lastOverlayRehashAt")
    if not isinstance(rehash, str) or not rehash:
        return True
    return change > rehash


def mark_content_change(
    runtime: Path,
    *,
    kinds: list[str],
    source: str,
) -> dict[str, Any]:
    kinds_clean = [k for k in kinds if k]
    if not kinds_clean:
        return load_freshness(runtime)
    data = load_freshness(runtime)
    data["lastContentChangeAt"] = _now_iso()
    data["lastContentKinds"] = kinds_clean
    data["lastContentSource"] = source
    save_freshness(runtime, data)
    return data


def mark_channel_restart(runtime: Path) -> dict[str, Any]:
    data = load_freshness(runtime)
    data["lastChannelRestartAt"] = _now_iso()
    save_freshness(runtime, data)
    return data


def is_channel_stale(data: dict[str, Any]) -> bool:
    change = data.get("lastContentChangeAt")
    if not isinstance(change, str) or not change:
        return False
    restart = data.get("lastChannelRestartAt")
    if not isinstance(restart, str) or not restart:
        return True
    return change > restart


def freshness_public(runtime: Path) -> dict[str, Any]:
    data = load_freshness(runtime)
    stale = is_channel_stale(data)
    kinds = data.get("lastContentKinds")
    if not isinstance(kinds, list):
        kinds = []
    kinds = [k for k in kinds if isinstance(k, str)]
    out: dict[str, Any] = {
        "channelStale": stale,
        "lastContentChangeAt": data.get("lastContentChangeAt") or None,
        "lastContentKinds": kinds,
        "lastContentSource": data.get("lastContentSource") or None,
        "lastChannelRestartAt": data.get("lastChannelRestartAt") or None,
        "overlayStale": is_overlay_stale(data),
        "lastOverlayChangeAt": data.get("lastOverlayChangeAt") or None,
        "lastOverlayRehashAt": data.get("lastOverlayRehashAt") or None,
        "lastOverlaySource": data.get("lastOverlaySource") or None,
    }
    return out

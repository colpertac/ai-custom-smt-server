"""Detect empty first-boot content (BinaryData + maps).

A fresh VM has empty datastore volumes. Channel will not boot usefully
without Shield BinaryData and Map files. Overlay / packages are optional
(Lane B / extra packages come later).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

# Channel needs Shield tables; ItemData is a reliable sentinel.
BINARYDATA_SENTINELS = (
    "Shield/ItemData.sbin",
    "Shield/ItemData.bin",
)

FILE_COUNT_CAP = 8000


def _count_files(root: Path, cap: int = FILE_COUNT_CAP) -> int:
    if not root.is_dir():
        return 0
    n = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        n += 1
        if n >= cap:
            return n
    return n


def _has_sentinel(root: Path, rels: tuple[str, ...]) -> bool:
    for rel in rels:
        p = root / rel
        if p.is_file() and not p.is_symlink():
            return True
    return False


def _bucket(
    *,
    files: int,
    ready: bool,
    optional: bool = False,
    path: Path,
    hint: str = "",
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "files": files,
        "ready": ready,
        "optional": optional,
        "path": str(path),
    }
    if hint:
        out["hint"] = hint
    return out


def first_boot_status(runtime: Path, updater: Path) -> dict[str, Any]:
    binarydata = runtime / "datastore" / "BinaryData"
    maps = runtime / "datastore" / "Map"
    packages = runtime / "datastore" / "packages"
    overlay = updater / "overlay"

    bd_files = _count_files(binarydata)
    map_files = _count_files(maps)
    pkg_files = _count_files(packages)
    overlay_files = _count_files(overlay)

    bd_ready = bd_files > 0 and _has_sentinel(binarydata, BINARYDATA_SENTINELS)
    maps_ready = map_files > 0

    missing: list[str] = []
    if not bd_ready:
        missing.append("binarydata")
    if not maps_ready:
        missing.append("maps")

    needed = bool(missing)
    return {
        "needed": needed,
        "ready": not needed,
        "missing": missing,
        "binarydata": _bucket(
            files=bd_files,
            ready=bd_ready,
            path=binarydata,
            hint="Need Shield/ItemData.sbin (or .bin) under BinaryData/",
        ),
        "maps": _bucket(
            files=map_files,
            ready=maps_ready,
            path=maps,
            hint="Need at least one file under Map/",
        ),
        "packages": _bucket(
            files=pkg_files,
            ready=pkg_files > 0,
            optional=True,
            path=packages,
            hint="Optional datastore packages (*.zip)",
        ),
        "overlay": _bucket(
            files=overlay_files,
            ready=overlay_files > 0,
            optional=True,
            path=overlay,
            hint="Optional updater overlay (Lane B / rehash later)",
        ),
    }


def first_boot_public(runtime: Path, updater: Path) -> dict[str, Any]:
    return {"firstBoot": first_boot_status(runtime, updater)}

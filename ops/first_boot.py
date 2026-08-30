"""Detect empty first-boot content (BinaryData + maps + server zone defs).

A fresh VM has empty datastore volumes. Channel will not boot usefully
without Shield BinaryData, Map files, and AGPL server zone/event XML.
Overlay / packages are optional (Lane B / extra packages come later).

When the ops image ships /opt/server-datastore (from comp_hack/datastore),
ensure_server_datastore() copies those folders into the live runtime once.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

# Channel needs Shield tables; ItemData is a reliable sentinel.
BINARYDATA_SENTINELS = (
    "Shield/ItemData.sbin",
    "Shield/ItemData.bin",
)

# Channel zone login needs server definitions under datastore/{zones,data,...}.
SERVERDATA_SENTINELS = (
    "zones/zone-90105.xml",
    "data/zoneinstance/00_stock.xml",
)

# AGPL COMP_hack datastore folders (not Atlus BinaryData/Map).
SERVERDATA_DIRS = (
    "data",
    "zones",
    "events",
    "partials",
    "shops",
    "skills",
    "webapps",
    "webgames",
    "migrations",
    "packages",
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


def _seed_root() -> Path | None:
    env = (os.environ.get("OPS_SERVER_DATASTORE") or "").strip()
    candidates = [
        Path(env) if env else None,
        Path("/opt/server-datastore"),
        Path(__file__).resolve().parent / "server-datastore",
    ]
    for c in candidates:
        if c and c.is_dir() and _has_sentinel(c, SERVERDATA_SENTINELS):
            return c
    return None


def ensure_server_datastore(runtime: Path) -> bool:
    """Copy baked AGPL server defs into live datastore if missing. Return True if ready."""
    datastore = runtime / "datastore"
    if _has_sentinel(datastore, SERVERDATA_SENTINELS):
        return True
    seed = _seed_root()
    if seed is None:
        return False
    datastore.mkdir(parents=True, exist_ok=True)
    for name in SERVERDATA_DIRS:
        src = seed / name
        if not src.is_dir():
            continue
        dest = datastore / name
        dest.mkdir(parents=True, exist_ok=True)
        for path in src.rglob("*"):
            if not path.is_file() or path.is_symlink():
                continue
            rel = path.relative_to(src)
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            if not out.exists():
                shutil.copy2(path, out)
    return _has_sentinel(datastore, SERVERDATA_SENTINELS)


def first_boot_status(runtime: Path, updater: Path) -> dict[str, Any]:
    # Auto-seed AGPL zone/event XML from the ops image when the volume is empty.
    ensure_server_datastore(runtime)

    binarydata = runtime / "datastore" / "BinaryData"
    maps = runtime / "datastore" / "Map"
    datastore = runtime / "datastore"
    packages = runtime / "datastore" / "packages"
    overlay = updater / "overlay"

    bd_files = _count_files(binarydata)
    map_files = _count_files(maps)
    pkg_files = _count_files(packages)
    overlay_files = _count_files(overlay)
    server_ready = _has_sentinel(datastore, SERVERDATA_SENTINELS)
    server_files = 0
    if server_ready:
        for name in SERVERDATA_DIRS:
            server_files += _count_files(datastore / name)

    bd_ready = bd_files > 0 and _has_sentinel(binarydata, BINARYDATA_SENTINELS)
    maps_ready = map_files > 0

    missing: list[str] = []
    if not bd_ready:
        missing.append("binarydata")
    if not maps_ready:
        missing.append("maps")
    if not server_ready:
        missing.append("serverdata")

    needed = bool(missing)
    return {
        "needed": needed,
        "ready": not needed,
        "missing": missing,
        "binarydata": _bucket(
            files=bd_files,
            ready=bd_ready,
            path=binarydata,
            hint="Upload BinaryData zip (Shield/ItemData.sbin) via Admin → Game files",
        ),
        "maps": _bucket(
            files=map_files,
            ready=maps_ready,
            path=maps,
            hint="Upload Map zip via Admin → Game files",
        ),
        "serverdata": _bucket(
            files=server_files,
            ready=server_ready,
            path=datastore,
            hint="Server zone/event defs (usually auto-seeded from ops image)",
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

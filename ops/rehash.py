"""Run comp_rehash on updater/overlay (Lane B).

Does not rsync client-overlay/ — zip ingest already wrote overlay files.
Requires updater/base/hashlist.dat (seed-updater-base.sh --overlay-only).
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

SMT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_REHASH = SMT_ROOT / "comp_hack" / "build-current" / "bin" / "comp_rehash"


def find_comp_rehash() -> Path | None:
    custom = (os.environ.get("OPS_REHASH") or "").strip()
    if custom:
        p = Path(custom).expanduser()
        if p.is_file() and os.access(p, os.X_OK):
            return p
    bin_dir = (os.environ.get("BIN_DIR") or "").strip()
    if bin_dir:
        p = Path(bin_dir).expanduser() / "comp_rehash"
        if p.is_file() and os.access(p, os.X_OK):
            return p
    if DEFAULT_REHASH.is_file() and os.access(DEFAULT_REHASH, os.X_OK):
        return DEFAULT_REHASH
    return None


def run_comp_rehash(
    updater: Path, *, timeout: int = 600
) -> tuple[bool, str, str]:
    """Return (ok, error_code, detail)."""
    base = updater / "base"
    overlay = updater / "overlay"
    hashlist = base / "hashlist.dat"
    if not hashlist.is_file():
        return (
            False,
            "missing_base_hashlist",
            f"missing {hashlist}; run scripts/seed-updater-base.sh --overlay-only",
        )
    exe = find_comp_rehash()
    if exe is None:
        return (
            False,
            "missing_rehash",
            "comp_rehash not found; set OPS_REHASH or build comp_hack",
        )
    overlay.mkdir(parents=True, exist_ok=True)
    try:
        proc = subprocess.run(
            [str(exe), "--base", str(base), "--overlay", str(overlay)],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, "timeout", f"comp_rehash timed out after {timeout}s"
    except OSError as e:
        return False, "spawn_failed", str(e)
    out = ((proc.stdout or "") + (proc.stderr or "")).strip()
    if proc.returncode != 0:
        return False, "rehash_failed", out or f"exit {proc.returncode}"
    ver = overlay / "hashlist.ver"
    extra = f"wrote {overlay / 'hashlist.dat'}"
    if ver.is_file():
        extra += f", {ver.name}"
    if out:
        extra += "\n" + out[-2000:]
    return True, "ok", extra

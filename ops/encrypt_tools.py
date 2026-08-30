"""Locate and run comp_encrypt / comp_decrypt (Shield webaccess.sdat)."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

SMT_ROOT = Path(__file__).resolve().parent.parent.parent

_CANDIDATE_BINS = [
    SMT_ROOT / "comp_hack" / "build-current" / "bin",
    SMT_ROOT / "comp_hack" / "build-localdeps-v31" / "bin",
]


def find_comp_tool(name: str, env_key: str) -> Path | None:
    custom = (os.environ.get(env_key) or "").strip()
    if custom:
        p = Path(custom).expanduser()
        if p.is_file() and os.access(p, os.X_OK):
            return p
    bin_dir_env = (os.environ.get("BIN_DIR") or "").strip()
    search: list[Path] = []
    if bin_dir_env:
        search.append(Path(bin_dir_env).expanduser())
    search.extend(_CANDIDATE_BINS)
    for bin_dir in search:
        p = bin_dir / name
        if p.is_file() and os.access(p, os.X_OK):
            return p
    return None


def find_comp_encrypt() -> Path | None:
    return find_comp_tool("comp_encrypt", "OPS_ENCRYPT")


def find_comp_decrypt() -> Path | None:
    return find_comp_tool("comp_decrypt", "OPS_DECRYPT")


def run_comp_encrypt(plaintext: bytes, *, timeout: int = 30) -> tuple[bool, str, bytes]:
    """Return (ok, error_or_empty, encrypted_bytes)."""
    exe = find_comp_encrypt()
    if exe is None:
        return (
            False,
            "comp_encrypt not found; set OPS_ENCRYPT or BIN_DIR",
            b"",
        )
    with tempfile.TemporaryDirectory(prefix="ops-encrypt-") as tmp:
        plain_path = Path(tmp) / "in.dat"
        out_path = Path(tmp) / "out.sdat"
        plain_path.write_bytes(plaintext)
        try:
            proc = subprocess.run(
                [str(exe), str(plain_path), str(out_path)],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return False, "comp_encrypt timed out", b""
        except OSError as e:
            return False, str(e), b""
        if proc.returncode != 0 or not out_path.is_file():
            detail = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()
            return False, detail[-800:] or "comp_encrypt failed", b""
        return True, "", out_path.read_bytes()

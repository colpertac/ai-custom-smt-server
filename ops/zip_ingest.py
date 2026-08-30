"""Allowlisted zip ingest for Phase 16I step 6.

Kinds:
  binarydata → {runtime}/datastore/BinaryData/
  maps       → {runtime}/datastore/Map/
  packages   → {runtime}/datastore/packages/  (*.zip members only)
  overlay    → {updater}/overlay/
  content    → route by top-level BinaryData|Map|packages|overlay prefixes
  release    → client/ → overlay; server/BinaryData|Map|packages → datastore

Rejects zip-slip (.., absolute paths, symlink members). Checks free disk.
Lane B runs comp_rehash after overlay dests unless rehash=0.
"""

from __future__ import annotations

import os
import re
import shutil
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

ProgressFn = Callable[..., None]

KINDS = frozenset({"binarydata", "maps", "packages", "overlay", "content", "release"})
MODES = frozenset({"merge", "replace"})
# Buckets safe to full-mirror on replace (packages is merge-only — too easy to wipe Phase zips).
REPLACEABLE_BUCKETS = frozenset({"binarydata", "maps", "overlay"})

MAX_UPLOAD = {
    "binarydata": 600 * 1024 * 1024,
    "maps": 3 * 1024 * 1024 * 1024,
    "packages": 100 * 1024 * 1024,
    "overlay": 500 * 1024 * 1024,
    "content": 3 * 1024 * 1024 * 1024,
    "release": 3 * 1024 * 1024 * 1024,
}

MAX_UNCOMPRESSED = {
    "binarydata": 2 * 1024 * 1024 * 1024,
    "maps": 6 * 1024 * 1024 * 1024,
    "packages": 200 * 1024 * 1024,
    "overlay": 2 * 1024 * 1024 * 1024,
    "content": 6 * 1024 * 1024 * 1024,
    "release": 6 * 1024 * 1024 * 1024,
}

DISK_HEADROOM = 256 * 1024 * 1024


@dataclass
class IngestResult:
    ok: bool
    kind: str
    mode: str = "merge"
    release_id: str = ""
    files: int = 0
    files_removed: int = 0
    bytes_written: int = 0
    destinations: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    error: str = ""
    detail: str = ""

    def as_dict(self) -> dict:
        d: dict = {
            "ok": self.ok,
            "kind": self.kind,
            "mode": self.mode,
            "releaseId": self.release_id or None,
            "files": self.files,
            "filesRemoved": self.files_removed,
            "bytesWritten": self.bytes_written,
            "destinations": self.destinations,
            "warnings": self.warnings,
        }
        if self.error:
            d["error"] = self.error
        if self.detail:
            d["detail"] = self.detail
        return d


def _prune_bucket_to_keep(
    root: Path, keep_rels: set[str]
) -> list[str]:
    """Delete files under root that are not in keep_rels (posix relative). Return removed rels."""
    removed: list[str] = []
    if not root.is_dir():
        return removed
    root_res = root.resolve()
    for path in root_res.rglob("*"):
        if not path.is_file():
            continue
        try:
            rel = path.relative_to(root_res).as_posix()
        except ValueError:
            continue
        if rel in keep_rels:
            continue
        path.unlink(missing_ok=True)
        removed.append(rel)
    # Clean empty dirs (bottom-up)
    for dirpath, dirnames, filenames in os.walk(root_res, topdown=False):
        p = Path(dirpath)
        if p == root_res:
            continue
        try:
            if not any(p.iterdir()):
                p.rmdir()
        except OSError:
            pass
    return removed


def _norm_member(name: str) -> str | None:
    if not name or name.endswith("/"):
        return None
    if "\x00" in name or "\\" in name:
        return None
    raw = name.replace("\\", "/")
    if raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        return None
    parts: list[str] = []
    for part in raw.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            return None
        parts.append(part)
    if not parts:
        return None
    return "/".join(parts)


def _safe_dest(root: Path, rel: str) -> Path | None:
    root_res = root.resolve()
    target = (root_res / rel).resolve()
    try:
        target.relative_to(root_res)
    except ValueError:
        return None
    return target


def _free_bytes(path: Path) -> int:
    path.mkdir(parents=True, exist_ok=True)
    st = os.statvfs(path)
    return int(st.f_bavail * st.f_frsize)


def _strip_prefix(rel: str, *prefixes: str) -> str | None:
    for p in prefixes:
        if rel == p or rel.startswith(p + "/"):
            return "" if rel == p else rel[len(p) + 1 :]
    return None


def _route_member(kind: str, rel: str) -> tuple[str, str] | None:
    if kind == "binarydata":
        under = _strip_prefix(rel, "BinaryData", "binarydata")
        if under is not None:
            return "binarydata", under
        if rel.startswith("Shield/") or rel.startswith("Client/"):
            return "binarydata", rel
        return None

    if kind == "maps":
        under = _strip_prefix(rel, "Map", "map", "maps")
        if under is not None:
            return "maps", under
        if rel.startswith("Zone/"):
            return "maps", rel
        return None

    if kind == "packages":
        under = _strip_prefix(rel, "packages")
        name = under if under is not None else rel
        if "/" in name:
            return None
        if not name.lower().endswith(".zip"):
            return None
        return "packages", name

    if kind == "overlay":
        under = _strip_prefix(rel, "overlay")
        if under is not None:
            return "overlay", under
        for top in ("BinaryData", "Event", "Interface", "Sound", "Data"):
            if rel == top or rel.startswith(top + "/"):
                return "overlay", rel
        return None

    if kind == "content":
        for prefix, bucket in (
            ("BinaryData", "binarydata"),
            ("binarydata", "binarydata"),
            ("Map", "maps"),
            ("maps", "maps"),
            ("packages", "packages"),
            ("overlay", "overlay"),
        ):
            under = _strip_prefix(rel, prefix)
            if under is None:
                continue
            if bucket == "packages":
                if "/" in under or not under.lower().endswith(".zip"):
                    return None
            return bucket, under
        return None

    if kind == "release":
        # client/ → updater overlay; server/ → datastore (lane A + B).
        client_under = _strip_prefix(rel, "client", "Client")
        if client_under is not None:
            return "overlay", client_under
        server_under = _strip_prefix(rel, "server", "Server")
        if server_under is not None:
            return _route_member("content", server_under)
        overlay_under = _strip_prefix(rel, "overlay")
        if overlay_under is not None:
            return "overlay", overlay_under
        return None

    return None


def _bucket_root(bucket: str, *, runtime: Path, updater: Path) -> Path:
    if bucket == "binarydata":
        return runtime / "datastore" / "BinaryData"
    if bucket == "maps":
        return runtime / "datastore" / "Map"
    if bucket == "packages":
        return runtime / "datastore" / "packages"
    if bucket == "overlay":
        return updater / "overlay"
    raise ValueError(f"unknown bucket {bucket}")


def ingest_zip_file(
    zip_path: Path,
    *,
    kind: str,
    runtime: Path,
    updater: Path,
    releases_dir: Path | None = None,
    mode: str = "merge",
    release_id: str | None = None,
    on_progress: ProgressFn | None = None,
) -> IngestResult:
    kind = kind.strip().lower()
    mode = (mode or "merge").strip().lower()
    if mode not in MODES:
        return IngestResult(
            ok=False,
            kind=kind,
            mode=mode,
            error="bad_mode",
            detail="mode must be merge or replace",
        )
    if kind not in KINDS:
        return IngestResult(
            ok=False,
            kind=kind,
            mode=mode,
            error="bad_kind",
            detail=f"kind must be one of: {', '.join(sorted(KINDS))}",
        )

    if not zip_path.is_file():
        return IngestResult(
            ok=False,
            kind=kind,
            mode=mode,
            error="missing_zip",
            detail=str(zip_path),
        )

    size = zip_path.stat().st_size
    max_up = MAX_UPLOAD[kind]
    if size <= 0:
        return IngestResult(
            ok=False,
            kind=kind,
            mode=mode,
            error="empty_zip",
            detail="upload is empty",
        )
    if size > max_up:
        return IngestResult(
            ok=False,
            kind=kind,
            mode=mode,
            error="too_large",
            detail=f"upload {size} bytes exceeds max {max_up} for kind={kind}",
        )

    if not release_id:
        release_id = (
            datetime.now(timezone.utc)
            .isoformat()
            .replace("-", "")
            .replace(":", "")
            .replace("+00:00", "Z")
        )
    if releases_dir is None:
        releases_dir = runtime / "releases" / "ingest"
    stage = releases_dir / release_id
    stage.mkdir(parents=True, exist_ok=True)
    staged_zip = stage / "upload.zip"
    if zip_path.resolve() != staged_zip.resolve():
        shutil.copy2(zip_path, staged_zip)

    def emit(msg: str, **kwargs: object) -> None:
        if on_progress:
            on_progress(msg, **kwargs)

    warnings: list[str] = []
    try:
        emit("scanning archive…")
        with zipfile.ZipFile(staged_zip, "r") as zf:
            planned: list[tuple[str, str, zipfile.ZipInfo]] = []
            total_uncomp = 0
            skipped = 0
            for info in zf.infolist():
                if info.is_dir() or info.filename.endswith("/"):
                    continue
                is_symlink = (info.external_attr >> 16) & 0o170000 == 0o120000
                if is_symlink:
                    return IngestResult(
                        ok=False,
                        kind=kind,
                        mode=mode,
                        release_id=release_id,
                        error="symlink_rejected",
                        detail=f"symlink member refused: {info.filename}",
                    )
                rel = _norm_member(info.filename)
                if rel is None:
                    return IngestResult(
                        ok=False,
                        kind=kind,
                        mode=mode,
                        release_id=release_id,
                        error="zip_slip",
                        detail=f"unsafe path refused: {info.filename!r}",
                    )
                routed = _route_member(kind, rel)
                if routed is None:
                    skipped += 1
                    continue
                bucket, under = routed
                if under == "" and bucket != "packages":
                    skipped += 1
                    continue
                total_uncomp += max(0, info.file_size)
                if total_uncomp > MAX_UNCOMPRESSED[kind]:
                    return IngestResult(
                        ok=False,
                        kind=kind,
                        mode=mode,
                        release_id=release_id,
                        error="zip_bomb",
                        detail=f"uncompressed size exceeds cap for kind={kind}",
                    )
                planned.append((bucket, under, info))

            if not planned:
                return IngestResult(
                    ok=False,
                    kind=kind,
                    mode=mode,
                    release_id=release_id,
                    error="no_matching_files",
                    detail=(
                        f"no allowlisted members for kind={kind} "
                        f"(skipped {skipped} unmatched)"
                    ),
                )

            if skipped:
                warnings.append(
                    f"Skipped {skipped} unmatched path(s) for kind={kind}"
                )

            need = total_uncomp + DISK_HEADROOM
            free_rt = _free_bytes(runtime)
            if free_rt < need:
                return IngestResult(
                    ok=False,
                    kind=kind,
                    mode=mode,
                    release_id=release_id,
                    error="disk_full",
                    detail=f"need ~{need} free on runtime, have {free_rt}",
                )
            if any(b == "overlay" for b, _, _ in planned):
                free_up = _free_bytes(updater)
                if free_up < need:
                    return IngestResult(
                        ok=False,
                        kind=kind,
                        mode=mode,
                        release_id=release_id,
                        error="disk_full",
                        detail=f"need ~{need} free on updater, have {free_up}",
                    )

            files = 0
            bytes_written = 0
            dest_set: set[str] = set()
            kept_by_bucket: dict[str, set[str]] = {}
            total_files = len(planned)
            emit(
                f"unpacking {total_files} file(s)",
                files_done=0,
                files_total=total_files,
            )

            for bucket, under, info in planned:
                member = info.filename.replace("\\", "/")
                root = _bucket_root(bucket, runtime=runtime, updater=updater)
                dest = _safe_dest(root, under)
                if dest is None:
                    return IngestResult(
                        ok=False,
                        kind=kind,
                        mode=mode,
                        release_id=release_id,
                        error="zip_slip",
                        detail=f"resolved outside destination: {info.filename}",
                    )
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info, "r") as src, open(dest, "wb") as out:
                    shutil.copyfileobj(src, out, length=1024 * 1024)
                files += 1
                emit(
                    f"unzipping {member}",
                    files_done=files,
                    files_total=total_files,
                )
                bytes_written += info.file_size
                dest_set.add(str(root))
                kept_by_bucket.setdefault(bucket, set()).add(under)

            files_removed = 0
            if mode == "replace":
                for bucket, keep in kept_by_bucket.items():
                    if bucket not in REPLACEABLE_BUCKETS:
                        warnings.append(
                            f"Replace skipped for {bucket}/ (merge-only; "
                            "avoids wiping unrelated package zips)"
                        )
                        continue
                    root = _bucket_root(bucket, runtime=runtime, updater=updater)
                    removed = _prune_bucket_to_keep(root, keep)
                    files_removed += len(removed)
                    if removed:
                        sample = ", ".join(removed[:5])
                        more = f" (+{len(removed) - 5} more)" if len(removed) > 5 else ""
                        warnings.append(
                            f"Replace removed {len(removed)} file(s) from {bucket}/: "
                            f"{sample}{more}"
                        )

            (stage / "manifest.txt").write_text(
                f"kind={kind}\nmode={mode}\nfiles={files}\n"
                f"removed={files_removed}\nbytes={bytes_written}\n"
                f"dests={','.join(sorted(dest_set))}\n",
                encoding="utf-8",
            )

            detail = f"ingested {files} file(s), {bytes_written} bytes ({mode})"
            if files_removed:
                detail += f", removed {files_removed}"

            return IngestResult(
                ok=True,
                kind=kind,
                mode=mode,
                release_id=release_id,
                files=files,
                files_removed=files_removed,
                bytes_written=bytes_written,
                destinations=sorted(dest_set),
                warnings=warnings,
                detail=detail,
            )
    except zipfile.BadZipFile as e:
        return IngestResult(
            ok=False,
            kind=kind,
            mode=mode,
            release_id=release_id,
            error="bad_zip",
            detail=str(e),
        )
    except OSError as e:
        return IngestResult(
            ok=False,
            kind=kind,
            mode=mode,
            release_id=release_id,
            error="io_error",
            detail=str(e),
        )


def save_upload_stream(
    read_fn,
    *,
    max_size: int,
    dest: Path,
) -> tuple[bool, str, int]:
    """Stream request body to dest; reject if over max_size."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = read_fn(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_size:
                    out.close()
                    dest.unlink(missing_ok=True)
                    return False, f"upload exceeds max {max_size} bytes", written
                out.write(chunk)
        if written == 0:
            dest.unlink(missing_ok=True)
            return False, "empty upload", 0
        return True, f"saved {written} bytes", written
    except OSError as e:
        dest.unlink(missing_ok=True)
        return False, str(e), written

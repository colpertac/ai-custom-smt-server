"""Backup / restore / rclone remote helpers for the ops sidecar."""

from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import ingest_jobs

ARCHIVE_RE = re.compile(r"^smt-runtime-\d{8}-\d{6}\.tar\.gz$")
MAX_IMPORT_BYTES = 8 * 1024 * 1024 * 1024  # 8 GiB
SCHEDULE_DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "mode": "standard",
    "intervalHours": 24,
    "remote": "",
    "path": "smt-backups",
    "keepLocal": 7,
    "keepRemote": 14,
    "lastRunAt": None,
    "lastSyncAt": None,
    "lastError": None,
}


def backups_dir() -> Path:
    custom = os.environ.get("OPS_BACKUPS", "").strip()
    if custom:
        return Path(custom).expanduser()
    if Path("/backups").is_dir():
        return Path("/backups")
    # Prefer deploy/backups (compose sibling), never website/ cwd.
    compose = Path(os.environ.get("OPS_COMPOSE_DIR", "")).expanduser()
    if compose.as_posix() not in {"", "."} and compose.is_dir():
        return compose / "backups"
    return Path(__file__).resolve().parent.parent / "deploy" / "backups"


def website_data_dir() -> Path:
    custom = os.environ.get("WEBSITE_DATA", "").strip() or os.environ.get(
        "OPS_WEBSITE_DATA", ""
    ).strip() or os.environ.get("WEBSITE_DATA_DIR", "").strip()
    if custom:
        return Path(custom).expanduser()
    if Path("/website-data").is_dir():
        return Path("/website-data")
    # Native Next.js: website/data/web.sqlite
    repo = Path(__file__).resolve().parent.parent
    native = repo / "website" / "data"
    if native.is_dir() and (
        (native / "web.sqlite").is_file() or (native / "server-content").is_dir()
    ):
        return native
    compose = Path(os.environ.get("OPS_COMPOSE_DIR", "")).expanduser()
    if compose.as_posix() not in {"", "."}:
        candidate = compose / "website-data"
        if candidate.is_dir():
            return candidate
    deploy_wd = repo / "deploy" / "website-data"
    if deploy_wd.is_dir():
        return deploy_wd
    return native


def scripts_dir() -> Path:
    custom = os.environ.get("OPS_BACKUP_SCRIPTS", "").strip()
    if custom:
        return Path(custom).expanduser()
    # Prefer compose/scripts only when backup.sh is actually there. Native
    # `pnpm run ops-sidecar` runs with cwd=website/, where ./scripts is the
    # Next.js TS helpers tree — not deploy/scripts.
    compose = Path(os.environ.get("OPS_COMPOSE_DIR", "")).expanduser()
    if compose.as_posix() not in {"", "."}:
        candidate = compose / "scripts"
        if (candidate / "backup.sh").is_file():
            return candidate
    if Path("/compose/scripts/backup.sh").is_file():
        return Path("/compose/scripts")
    return Path(__file__).resolve().parent.parent / "deploy" / "scripts"

def rclone_config_path() -> Path:
    return backups_dir() / "rclone.conf"


def schedule_path() -> Path:
    return backups_dir() / "schedule.json"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def safe_archive_name(name: str) -> str | None:
    base = Path(name).name
    if not ARCHIVE_RE.match(base):
        return None
    return base


def list_archives() -> list[dict[str, Any]]:
    root = backups_dir()
    root.mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    for path in sorted(root.glob("smt-runtime-*.tar.gz"), reverse=True):
        if not ARCHIVE_RE.match(path.name):
            continue
        st = path.stat()
        manifest: dict[str, str] = {}
        try:
            # Peek MANIFEST without full extract when possible via tar
            r = subprocess.run(
                ["tar", "-xOf", str(path), "./MANIFEST.txt"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if r.returncode == 0:
                for line in r.stdout.splitlines():
                    if "=" in line:
                        k, _, v = line.partition("=")
                        manifest[k.strip()] = v.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
        items.append(
            {
                "name": path.name,
                "sizeBytes": st.st_size,
                "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc)
                .replace(microsecond=0)
                .isoformat(),
                "sha256Present": Path(str(path) + ".sha256").is_file(),
                "mode": manifest.get("mode"),
                "sqlite": manifest.get("sqlite"),
                "websiteSqlite": manifest.get("website_sqlite"),
                "image": manifest.get("image"),
            }
        )
    return items


def load_schedule() -> dict[str, Any]:
    path = schedule_path()
    data = dict(SCHEDULE_DEFAULTS)
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for key in SCHEDULE_DEFAULTS:
                    if key in raw:
                        data[key] = raw[key]
        except (OSError, json.JSONDecodeError):
            pass
    data["rcloneConfigured"] = rclone_config_path().is_file()
    data["rcloneRemotes"] = parse_rclone_remotes()
    return data


def save_schedule(patch: dict[str, Any]) -> dict[str, Any]:
    data = load_schedule()
    for key in (
        "enabled",
        "mode",
        "intervalHours",
        "remote",
        "path",
        "keepLocal",
        "keepRemote",
        "lastRunAt",
        "lastSyncAt",
        "lastError",
    ):
        if key in patch:
            data[key] = patch[key]
    # Normalize types
    data["enabled"] = bool(data.get("enabled"))
    data["mode"] = "full" if str(data.get("mode")) == "full" else "standard"
    try:
        data["intervalHours"] = max(1, int(data.get("intervalHours") or 24))
    except (TypeError, ValueError):
        data["intervalHours"] = 24
    try:
        data["keepLocal"] = max(0, int(data.get("keepLocal") or 0))
    except (TypeError, ValueError):
        data["keepLocal"] = 7
    try:
        data["keepRemote"] = max(0, int(data.get("keepRemote") or 0))
    except (TypeError, ValueError):
        data["keepRemote"] = 14
    data["remote"] = str(data.get("remote") or "").strip()
    data["path"] = str(data.get("path") or "smt-backups").strip() or "smt-backups"
    path = schedule_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    to_write = {k: data[k] for k in SCHEDULE_DEFAULTS}
    path.write_text(json.dumps(to_write, indent=2) + "\n", encoding="utf-8")
    data["rcloneConfigured"] = rclone_config_path().is_file()
    return data


def write_rclone_config(text: str) -> None:
    path = rclone_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    cleaned = text.replace("\r\n", "\n").strip() + "\n"
    path.write_text(cleaned, encoding="utf-8")
    os.chmod(path, 0o600)


def parse_rclone_remotes(text: str | None = None) -> list[str]:
    """Return remote names from rclone.conf section headers ([name])."""
    if text is None:
        path = rclone_config_path()
        if not path.is_file():
            return []
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return []
    names: list[str] = []
    for line in text.replace("\r\n", "\n").splitlines():
        s = line.strip()
        if len(s) >= 3 and s.startswith("[") and s.endswith("]"):
            name = s[1:-1].strip()
            # Skip rclone meta / filter sections
            if not name or name.startswith(":") or name.lower() in {
                "rclonetype",
            }:
                continue
            if name not in names:
                names.append(name)
    return names


def infer_remote_name(explicit: str | None = None, conf_text: str | None = None) -> str:
    """Prefer explicit remote; else sole remote parsed from config."""
    got = (explicit or "").strip()
    if got.endswith(":"):
        got = got[:-1].strip()
    if got:
        return got
    names = parse_rclone_remotes(conf_text)
    if len(names) == 1:
        return names[0]
    return ""


def _run_script(
    script: str,
    args: list[str],
    *,
    timeout: int,
    log: Callable[[str], None] | None = None,
) -> tuple[bool, str]:
    path = scripts_dir() / script
    if not path.is_file():
        return False, f"missing script: {path}"
    env = os.environ.copy()
    # Preserve caller's OPS_BACKEND (native vs docker); default docker for VPS.
    env.setdefault("OPS_BACKEND", "docker")
    # Point native stop/start at sibling comp_hack when unset.
    if not env.get("OPS_COMP_SCRIPTS"):
        sibling = Path(__file__).resolve().parent.parent.parent / "comp_hack" / "scripts"
        if (sibling / "stop.sh").is_file():
            env["OPS_COMP_SCRIPTS"] = str(sibling)
    cmd = ["bash", str(path), *args]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
        )
    except OSError as e:
        return False, str(e)

    lines: list[str] = []
    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            line = line.rstrip("\n")
            lines.append(line)
            if log:
                log(line)
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        return False, f"{script} timed out after {timeout}s"
    out = "\n".join(lines[-40:])
    if proc.returncode != 0:
        return False, out or f"exit {proc.returncode}"
    return True, out or "ok"


def run_backup_job(
    job_id: str,
    *,
    mode: str,
    sync: bool,
    runtime: Path,
    compose: Path,
) -> None:
    mode = "full" if mode == "full" else "standard"
    out = backups_dir()
    out.mkdir(parents=True, exist_ok=True)
    website = website_data_dir()
    args = [
        "--data",
        str(runtime),
        "--compose",
        str(compose),
        "--out",
        str(out),
        "--mode",
        mode,
    ]
    if website.is_dir():
        args.extend(["--website-data", str(website)])

    def log(msg: str) -> None:
        ingest_jobs.log(job_id, msg)

    ingest_jobs.set_phase(job_id, "running", msg=f"Starting {mode} backup")
    ok, detail = _run_script("backup.sh", args, timeout=1800, log=log)
    archive_name = None
    if ok:
        archives = list_archives()
        if archives:
            archive_name = archives[0]["name"]
        save_schedule({"lastRunAt": _now(), "lastError": None})
    if ok and sync:
        ingest_jobs.set_phase(job_id, "syncing", msg="Syncing to rclone remote")
        sok, sdetail = run_sync(log=log, archive_name=archive_name)
        if not sok:
            ingest_jobs.finish(
                job_id,
                ok=False,
                result={
                    "ok": False,
                    "error": "sync_failed",
                    "detail": sdetail,
                    "archive": archive_name,
                    "mode": mode,
                },
                error="sync_failed",
            )
            save_schedule({"lastError": sdetail[:500]})
            return
        save_schedule({"lastSyncAt": _now(), "lastError": None})
    if ok:
        ingest_jobs.finish(
            job_id,
            ok=True,
            result={
                "ok": True,
                "message": f"Backup complete ({mode})",
                "archive": archive_name,
                "mode": mode,
                "detail": detail[-500:] if detail else None,
            },
        )
    else:
        save_schedule({"lastError": detail[:500]})
        ingest_jobs.finish(
            job_id,
            ok=False,
            result={"ok": False, "error": "backup_failed", "detail": detail, "mode": mode},
            error="backup_failed",
        )


def run_restore_job(
    job_id: str,
    *,
    name: str,
    restore_env: bool,
    runtime: Path,
    compose: Path,
) -> None:
    safe = safe_archive_name(name)
    if not safe:
        ingest_jobs.finish(
            job_id,
            ok=False,
            result={"ok": False, "error": "bad_name"},
            error="bad_name",
        )
        return
    archive = backups_dir() / safe
    if not archive.is_file():
        ingest_jobs.finish(
            job_id,
            ok=False,
            result={"ok": False, "error": "not_found"},
            error="not_found",
        )
        return
    website = website_data_dir()
    args = [
        "--archive",
        str(archive),
        "--data",
        str(runtime),
        "--compose",
        str(compose),
        "--yes",
    ]
    if website.exists() or True:
        args.extend(["--website-data", str(website)])
    if restore_env:
        args.append("--restore-env")

    def log(msg: str) -> None:
        ingest_jobs.log(job_id, msg)

    ingest_jobs.set_phase(job_id, "running", msg=f"Restoring {safe}")
    ok, detail = _run_script("restore.sh", args, timeout=1800, log=log)
    if ok:
        ingest_jobs.finish(
            job_id,
            ok=True,
            result={
                "ok": True,
                "message": f"Restored {safe}",
                "archive": safe,
                "detail": detail[-500:] if detail else None,
            },
        )
    else:
        ingest_jobs.finish(
            job_id,
            ok=False,
            result={"ok": False, "error": "restore_failed", "detail": detail},
            error="restore_failed",
        )


def run_sync(
    *,
    log: Callable[[str], None] | None = None,
    archive_name: str | None = None,
) -> tuple[bool, str]:
    sched = load_schedule()
    remote = infer_remote_name(str(sched.get("remote") or ""))
    if not remote:
        return False, "rclone remote not configured"
    if not rclone_config_path().is_file():
        return False, "rclone.conf missing — upload config first"
    if not str(sched.get("remote") or "").strip():
        save_schedule({"remote": remote})
    args = [
        "--out",
        str(backups_dir()),
        "--remote",
        remote,
        "--path",
        str(sched.get("path") or "smt-backups"),
        "--rclone-config",
        str(rclone_config_path()),
    ]
    if archive_name:
        args.extend(["--archive", str(backups_dir() / archive_name)])
    keep_local = int(sched.get("keepLocal") or 0)
    keep_remote = int(sched.get("keepRemote") or 0)
    if keep_local > 0:
        args.extend(["--keep-local", str(keep_local)])
    if keep_remote > 0:
        args.extend(["--keep-remote", str(keep_remote)])
    return _run_script("backup-sync.sh", args, timeout=600, log=log)


def run_sync_job(job_id: str, *, archive_name: str | None = None) -> None:
    def log(msg: str) -> None:
        ingest_jobs.log(job_id, msg)

    ingest_jobs.set_phase(job_id, "syncing", msg="Syncing to rclone remote")
    ok, detail = run_sync(log=log, archive_name=archive_name)
    if ok:
        save_schedule({"lastSyncAt": _now(), "lastError": None})
        ingest_jobs.finish(
            job_id,
            ok=True,
            result={
                "ok": True,
                "message": "rclone sync complete",
                "archive": archive_name,
                "detail": detail[-500:] if detail else None,
            },
        )
    else:
        save_schedule({"lastError": detail[:500]})
        ingest_jobs.finish(
            job_id,
            ok=False,
            result={"ok": False, "error": "sync_failed", "detail": detail},
            error="sync_failed",
        )


def test_remote() -> tuple[bool, str]:
    sched = load_schedule()
    remote = infer_remote_name(str(sched.get("remote") or ""))
    conf = rclone_config_path()
    if not conf.is_file():
        return False, "rclone.conf missing"
    if not remote:
        names = parse_rclone_remotes()
        if not names:
            return False, "remote name not set — paste rclone.conf first"
        return (
            False,
            "remote name not set — set rclone remote name to one of: "
            + ", ".join(names),
        )
    if not str(sched.get("remote") or "").strip():
        save_schedule({"remote": remote})
    path = str(sched.get("path") or "smt-backups")
    dest = f"{remote}:{path}"
    try:
        subprocess.run(
            ["rclone", "version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except FileNotFoundError:
        return (
            False,
            "rclone not installed — install rclone on the ops host "
            "(Docker ops image includes it; native: apt/brew install rclone)",
        )
    except subprocess.TimeoutExpired:
        return False, "rclone version check timed out"

    # One Drive API call only — repeated Test clicks burn Google's 1/min quota
    # (especially with rclone's shared OAuth client).
    try:
        r = subprocess.run(
            [
                "rclone",
                "lsd",
                f"{remote}:",
                "--config",
                str(conf),
                "--max-depth",
                "1",
                "--retries",
                "1",
                "--low-level-retries",
                "1",
                "--contimeout",
                "15s",
                "--timeout",
                "25s",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        return False, "rclone timed out talking to the remote (check network / token)"

    if r.returncode != 0:
        err = (r.stderr or r.stdout or "rclone failed")
        low = err.lower()
        if "rate_limit" in low or "ratelimitexceeded" in low or "userlimit" in low:
            return (
                False,
                "Google Drive rate limit (often 1 request/min with rclone's "
                "shared client). Wait ~60s and click Test once — do not spam. "
                "Optional: create your own Google OAuth client in rclone config.",
            )
        # Keep the tail short for the UI banner
        return False, err.strip()[-280:]

    return True, f"remote ok: {remote}: (will use folder {path}/ on sync)"


def import_archive_stream(
    handler_rfile: Any,
    *,
    length: int,
    filename: str,
) -> tuple[bool, str, str | None]:
    safe = safe_archive_name(filename)
    if not safe:
        return False, "bad_name", None
    if length <= 0 or length > MAX_IMPORT_BYTES:
        return False, "bad_size", None
    dest = backups_dir() / safe
    backups_dir().mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".partial")
    remaining = length
    try:
        with tmp.open("wb") as fh:
            while remaining > 0:
                chunk = handler_rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                fh.write(chunk)
                remaining -= len(chunk)
        if remaining != 0:
            tmp.unlink(missing_ok=True)
            return False, "short_body", None
        tmp.replace(dest)
    except OSError as e:
        tmp.unlink(missing_ok=True)
        return False, str(e), None
    return True, "ok", safe


def delete_archive(name: str) -> tuple[bool, str]:
    safe = safe_archive_name(name)
    if not safe:
        return False, "bad_name"
    path = backups_dir() / safe
    if not path.is_file():
        return False, "not_found"
    try:
        path.unlink()
        Path(str(path) + ".sha256").unlink(missing_ok=True)
    except OSError as e:
        return False, str(e)
    return True, safe


_scheduler_started = False
_scheduler_lock = threading.Lock()
_scheduler_started_at: float | None = None
# Don't cold-backup in the first minutes after ops boots (avoids killing
# lobby/world/channel every time you restart `pnpm run ops-sidecar` for QA).
SCHEDULER_STARTUP_GRACE_SEC = 300


def maybe_start_scheduler(
    *,
    runtime: Path,
    compose: Path,
) -> None:
    global _scheduler_started, _scheduler_started_at
    with _scheduler_lock:
        if _scheduler_started:
            return
        _scheduler_started = True
        _scheduler_started_at = time.time()

    def loop() -> None:
        # Wait before the first tick so a restart never immediately stops COMP.
        threading.Event().wait(60)
        while True:
            try:
                _scheduler_tick(runtime=runtime, compose=compose)
            except Exception:
                pass
            threading.Event().wait(60)

    threading.Thread(target=loop, name="backup-scheduler", daemon=True).start()


def _scheduler_tick(*, runtime: Path, compose: Path) -> None:
    sched = load_schedule()
    if not sched.get("enabled"):
        return
    if ingest_jobs.busy():
        return
    started = _scheduler_started_at or 0.0
    if time.time() - started < SCHEDULER_STARTUP_GRACE_SEC:
        return
    last = sched.get("lastRunAt")
    interval_h = int(sched.get("intervalHours") or 24)
    if not isinstance(last, str) or not last.strip():
        # First enable / never ran: anchor the clock without stopping the stack.
        save_schedule({"lastRunAt": _now()})
        return
    try:
        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - last_dt.astimezone(timezone.utc)
        due = age.total_seconds() >= interval_h * 3600
    except ValueError:
        save_schedule({"lastRunAt": _now()})
        return
    if not due:
        return
    job_id = ingest_jobs.create_job(
        kind="backup",
        mode=str(sched.get("mode") or "standard"),
        bytes_expected=0,
    )
    ingest_jobs.set_phase(job_id, "queued", msg="Scheduled backup")
    threading.Thread(
        target=run_backup_job,
        kwargs={
            "job_id": job_id,
            "mode": str(sched.get("mode") or "standard"),
            "sync": bool(sched.get("remote")) and rclone_config_path().is_file(),
            "runtime": runtime,
            "compose": compose,
        },
        daemon=True,
    ).start()

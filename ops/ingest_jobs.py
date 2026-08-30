"""In-memory ingest job log for async zip unpack."""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

MAX_JOBS = 8
MAX_LOGS = 400

_LOCK = threading.Lock()
_JOBS: dict[str, dict[str, Any]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _new_id() -> str:
    stamp = (
        datetime.now(timezone.utc)
        .isoformat()
        .replace("-", "")
        .replace(":", "")
        .replace("+00:00", "Z")
        .replace(".", "")
    )
    return f"ing-{stamp}"


def busy() -> bool:
    with _LOCK:
        return any(
            j.get("phase") in {"receiving", "uploaded", "unpacking", "rehashing"}
            for j in _JOBS.values()
        )


def create_job(*, kind: str, mode: str, bytes_expected: int) -> str:
    jid = _new_id()
    job = {
        "id": jid,
        "phase": "receiving",
        "kind": kind,
        "mode": mode,
        "bytesExpected": bytes_expected,
        "bytesUploaded": 0,
        "filesDone": 0,
        "filesTotal": 0,
        "logs": [],
        "result": None,
        "error": "",
        "ok": False,
        "createdAt": _now(),
    }
    with _LOCK:
        _JOBS[jid] = job
        extra = list(_JOBS.keys())[:-MAX_JOBS]
        for old in extra:
            phase = _JOBS[old].get("phase")
            if phase in {"receiving", "unpacking"}:
                continue
            _JOBS.pop(old, None)
    return jid


def log(job_id: str, msg: str, **fields: Any) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return
        job["logs"].append({"at": _now(), "msg": msg})
        if len(job["logs"]) > MAX_LOGS:
            job["logs"] = job["logs"][-MAX_LOGS:]
        for key in ("phase", "bytesUploaded", "filesDone", "filesTotal", "error"):
            if key in fields:
                job[key] = fields[key]


def progress(job_id: str, msg: str, **kwargs: Any) -> None:
    fields: dict[str, Any] = {}
    if "files_done" in kwargs:
        fields["filesDone"] = kwargs["files_done"]
    if "files_total" in kwargs:
        fields["filesTotal"] = kwargs["files_total"]
    log(job_id, msg, **fields)


def set_phase(job_id: str, phase: str, **fields: Any) -> None:
    log(job_id, fields.pop("msg", phase), phase=phase, **fields)


def finish(job_id: str, *, ok: bool, result: dict[str, Any], error: str = "") -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return
        job["ok"] = ok
        job["result"] = result
        job["error"] = error
        job["phase"] = "done" if ok else "error"


def get_job(job_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        return {
            "ok": True,
            "jobId": job["id"],
            "phase": job["phase"],
            "kind": job["kind"],
            "mode": job["mode"],
            "bytesExpected": job["bytesExpected"],
            "bytesUploaded": job["bytesUploaded"],
            "filesDone": job["filesDone"],
            "filesTotal": job["filesTotal"],
            "logs": list(job["logs"]),
            "error": job["error"] or None,
            "result": job["result"],
            "finished": job["phase"] in {"done", "error"},
        }

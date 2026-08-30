"""Tail lobby/world/channel logs for the admin Power panel."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

_SERVICES = frozenset({"lobby", "world", "channel"})
_DOCKER_CONTAINERS = {
    "lobby": "smt-lobby",
    "world": "smt-world",
    "channel": "smt-channel",
}


def _tail_file(path: Path, lines: int) -> list[str]:
    if not path.is_file():
        return []
    try:
        # Prefer system tail for large logs
        proc = subprocess.run(
            ["tail", "-n", str(lines), str(path)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode == 0:
            text = proc.stdout or ""
            return [ln.rstrip("\n") for ln in text.splitlines()]
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return raw.splitlines()[-lines:]


def _interesting_summary(lines: list[str]) -> str | None:
    """Most recent CRITICAL, else ERROR, else last non-empty line."""
    last = None
    last_error = None
    last_critical = None
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        last = s
        upper = s.upper()
        if "CRITICAL" in upper:
            last_critical = s
        elif "ERROR:" in s or " ERROR " in f" {upper} ":
            last_error = s
    return last_critical or last_error or last


def collect_service_logs(
    *,
    service: str,
    runtime: Path,
    comp_root: Path,
    backend: str = "native",
    lines: int = 80,
) -> dict:
    service = service.strip().lower()
    if service not in _SERVICES:
        return {
            "ok": False,
            "error": "bad_service",
            "detail": f"service must be one of {sorted(_SERVICES)}",
        }
    lines = max(10, min(int(lines or 80), 400))
    backend = (backend or "native").lower()

    sources: list[dict] = []
    combined: list[str] = []

    if backend == "docker":
        cname = _DOCKER_CONTAINERS[service]
        try:
            proc = subprocess.run(
                ["docker", "logs", "--tail", str(lines), cname],
                capture_output=True,
                text=True,
                timeout=20,
            )
            # docker logs writes to stderr often
            text = (proc.stdout or "") + (proc.stderr or "")
            out_lines = [ln.rstrip("\n") for ln in text.splitlines() if ln.strip()]
            sources.append(
                {
                    "path": f"docker:{cname}",
                    "exists": proc.returncode == 0 or bool(out_lines),
                    "lines": len(out_lines),
                }
            )
            combined = out_lines[-lines:]
        except (OSError, subprocess.TimeoutExpired) as e:
            return {
                "ok": False,
                "error": "docker_logs_failed",
                "detail": str(e),
                "service": service,
            }
    else:
        log_dir = Path(
            os.environ.get("LOG_DIR") or (runtime / "logs")
        ).expanduser()
        run_logs = Path(
            os.environ.get("LOCAL_LOG_DIR")
            or (comp_root / ".run" / "logs")
        ).expanduser()
        candidates = [
            log_dir / f"{service}.log",
            run_logs / f"{service}.out",
            run_logs / f"comp_{service}.out",
        ]
        for path in candidates:
            chunk = _tail_file(path, lines)
            sources.append(
                {
                    "path": str(path),
                    "exists": path.is_file(),
                    "lines": len(chunk),
                }
            )
            if chunk:
                # Prefer the primary .log content; append .out if log empty
                if not combined or path.suffix == ".log":
                    combined = chunk
                elif path.suffix == ".out" and not any(
                    s.get("path", "").endswith(".log") and s.get("lines")
                    for s in sources[:-1]
                ):
                    combined = chunk

    summary = _interesting_summary(combined)
    return {
        "ok": True,
        "service": service,
        "backend": backend,
        "linesRequested": lines,
        "lineCount": len(combined),
        "summary": summary,
        "text": "\n".join(combined),
        "sources": sources,
    }

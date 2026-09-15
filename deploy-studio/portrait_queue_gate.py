"""Portrait queue claim gate — pause processing without killing the worker.

Admin Studio toggles this so queue dress/capture does not fight orch startup
or login steps (vam1/vaf1 focus theft). Default is paused until enabled.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from portrait_common import WORK_DIR

QUEUE_GATE_PATH = Path(
    os.environ.get(
        "PORTRAIT_QUEUE_GATE",
        str(WORK_DIR / "queue-processing.json"),
    )
)

ORCH_JOB_PID = WORK_DIR / "orch-job.pid"
ORCH_JOB_META = WORK_DIR / "orch-job.json"
LOGIN_JOB_PID = WORK_DIR / "login-job.pid"
LOGIN_JOB_META = WORK_DIR / "login-job.json"


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _read_pidfile(path: Path) -> int | None:
    if not path.is_file():
        return None
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    if not _pid_alive(pid):
        return None
    return pid


def _meta_state_running(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(data, dict):
        return False
    return str(data.get("state") or "").lower() == "running"


def read_queue_gate() -> dict[str, Any]:
    """Return gate snapshot. Missing file → enabled=False (paused)."""
    if not QUEUE_GATE_PATH.is_file():
        return {
            "enabled": False,
            "updatedAt": None,
            "source": "default",
        }
    try:
        data = json.loads(QUEUE_GATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "enabled": False,
            "updatedAt": None,
            "source": "corrupt",
        }
    if not isinstance(data, dict):
        return {
            "enabled": False,
            "updatedAt": None,
            "source": "corrupt",
        }
    return {
        "enabled": bool(data.get("enabled")),
        "updatedAt": data.get("updatedAt"),
        "source": "file",
    }


def queue_processing_enabled() -> bool:
    return bool(read_queue_gate().get("enabled"))


def set_queue_processing_enabled(enabled: bool) -> dict[str, Any]:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "enabled": bool(enabled),
        "updatedAt": time.time(),
    }
    QUEUE_GATE_PATH.write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "enabled": payload["enabled"],
        "updatedAt": payload["updatedAt"],
        "source": "file",
    }


def orch_or_login_busy() -> str | None:
    """Return a short reason if orch/login owns the mannequin windows."""
    if _read_pidfile(ORCH_JOB_PID) is not None or _meta_state_running(ORCH_JOB_META):
        return "orch startup busy — skip claim (do not steal vam1/vaf1)"
    if _read_pidfile(LOGIN_JOB_PID) is not None or _meta_state_running(
        LOGIN_JOB_META
    ):
        return "login step busy — skip claim (do not steal vam1/vaf1)"
    return None


def claim_blocked_reason() -> str | None:
    """Why the worker should not claim, or None if claiming is OK."""
    if not queue_processing_enabled():
        return "queue processing paused (Admin Studio toggle)"
    try:
        from portrait_drone import drone_is_busy

        if drone_is_busy():
            return "drone busy — skip claim (do not steal focus)"
    except Exception:
        pass
    return orch_or_login_busy()

#!/usr/bin/env python3
"""HTTP agent for split deploy (Wine clients on this host).

Started by ``./studio up`` (with the worker). Website Admin talks here for:
  - studio-crop preview snaps
  - full-window login debug snaps
  - orch start/kill/status (async job)

  ./studio up
  # or: uv run python portrait-preview-agent.py

Admin → Studio sets Preview agent URL (e.g. http://192.168.0.230:14701)
and the worker/studio token.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from portrait_common import (  # noqa: E402
    WORK_DIR,
    WINDOW_TITLE,
    WINDOWS_PATH,
    MAX_MANNEQUIN_CLIENTS,
    assert_room_to_launch,
    count_imagine_clients,
    debug_snap,
    ensure_display,
    find_imagine_windows,
    load_portrait_env,
    load_window_map,
)

WORKER = HERE / "portrait-worker.py"
ORCH = HERE / "portrait-orch.py"
DEFAULT_PORT = int(os.environ.get("PORTRAIT_PREVIEW_PORT", "14701"))

ORCH_JOB_PID = WORK_DIR / "orch-job.pid"
ORCH_JOB_LOG = WORK_DIR / "orch-job.log"
ORCH_JOB_META = WORK_DIR / "orch-job.json"
ORCH_JOB_EXIT = WORK_DIR / "orch-job.exit"

_job_lock = threading.Lock()


def worker_token() -> str:
    return (
        os.environ.get("PORTRAIT_WORKER_TOKEN", "").strip()
        or os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    )


def check_auth(handler: BaseHTTPRequestHandler) -> bool:
    expected = worker_token()
    if not expected:
        handler.send_error(500, "PORTRAIT_WORKER_TOKEN / PORTRAIT_STUDIO_TOKEN unset")
        return False
    got = handler.headers.get("X-Portrait-Worker-Token", "").strip()
    if got != expected:
        handler.send_error(401, "unauthorized")
        return False
    return True


def normalize_role(raw: str) -> str | None:
    m = raw.strip().lower()
    if m in {"vam", "vaf"}:
        m = "vam1" if m == "vam" else "vaf1"
    if m not in {"vam1", "vaf1"}:
        return None
    return m


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _read_job_meta() -> dict:
    if not ORCH_JOB_META.is_file():
        return {"state": "idle"}
    try:
        data = json.loads(ORCH_JOB_META.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"state": "idle"}
    return data if isinstance(data, dict) else {"state": "idle"}


def _write_job_meta(data: dict) -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    ORCH_JOB_META.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _log_tail(max_lines: int = 40) -> str:
    if not ORCH_JOB_LOG.is_file():
        return ""
    try:
        lines = ORCH_JOB_LOG.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    return "\n".join(lines[-max_lines:])


def orch_job_status() -> dict:
    """Reconcile pidfile with meta; return job snapshot for Admin poll."""
    meta = _read_job_meta()
    pid: int | None = None
    if ORCH_JOB_PID.is_file():
        try:
            pid = int(ORCH_JOB_PID.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            pid = None
    running = bool(pid and _pid_alive(pid))
    if running:
        meta["state"] = "running"
        meta["pid"] = pid
    elif meta.get("state") == "running":
        # Watcher may have been lost (agent restart). Prefer exit file / log.
        exit_code: int | None = None
        if ORCH_JOB_EXIT.is_file():
            try:
                exit_code = int(ORCH_JOB_EXIT.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                exit_code = None
        tail = _log_tail(80)
        ready = "\nReady." in f"\n{tail}" or "\nReady.\n" in f"\n{tail}\n"
        if exit_code == 0 or (exit_code is None and ready):
            meta["state"] = "ok"
            meta["endedAt"] = time.time()
            meta["exitCode"] = 0 if exit_code is None else exit_code
            meta["message"] = "orch finished"
        else:
            meta["state"] = "failed"
            meta["endedAt"] = time.time()
            if exit_code is not None:
                meta["exitCode"] = exit_code
            meta["message"] = meta.get("message") or (
                f"orch exited {exit_code}"
                if exit_code is not None
                else "orch process exited unexpectedly"
            )
        _write_job_meta(meta)
        try:
            ORCH_JOB_PID.unlink(missing_ok=True)
        except OSError:
            pass
    meta["logTail"] = _log_tail()
    return meta


def _watch_orch(proc: subprocess.Popen, started: dict) -> None:
    rc = proc.wait()
    try:
        ORCH_JOB_EXIT.write_text(f"{rc}\n", encoding="utf-8")
    except OSError:
        pass
    with _job_lock:
        ended = {
            **started,
            "state": "ok" if rc == 0 else "failed",
            "endedAt": time.time(),
            "exitCode": rc,
            "message": "orch finished" if rc == 0 else f"orch exited {rc}",
        }
        _write_job_meta(ended)
        try:
            ORCH_JOB_PID.unlink(missing_ok=True)
        except OSError:
            pass


def start_orch_up(*, male_only: bool = False) -> dict:
    if not ORCH.is_file():
        raise RuntimeError(f"missing {ORCH}")
    want = 1 if male_only else MAX_MANNEQUIN_CLIENTS
    # Preflight before spawning orch — Admin never passes --ok-existing.
    assert_room_to_launch(want=want, force=False)
    with _job_lock:
        cur = orch_job_status()
        if cur.get("state") == "running":
            raise RuntimeError("orch job already running — wait or Kill clients")
        WORK_DIR.mkdir(parents=True, exist_ok=True)
        try:
            ORCH_JOB_EXIT.unlink(missing_ok=True)
        except OSError:
            pass
        cmd = [sys.executable, str(ORCH), "up"]
        if male_only:
            cmd.append("--male-only")
        # Never pass --ok-existing from Admin control plane.
        with ORCH_JOB_LOG.open("a", encoding="utf-8") as log:
            log.write(
                f"\n# start {time.strftime('%Y-%m-%d %H:%M:%S')} {' '.join(cmd)}\n"
            )
            log.flush()
            proc = subprocess.Popen(
                cmd,
                cwd=str(HERE),
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                env=os.environ.copy(),
            )
        started = {
            "state": "running",
            "pid": proc.pid,
            "cmd": cmd,
            "maleOnly": male_only,
            "startedAt": time.time(),
            "message": f"orch up started (want ≤{want} client(s))",
        }
        ORCH_JOB_PID.write_text(f"{proc.pid}\n", encoding="utf-8")
        _write_job_meta(started)
        threading.Thread(
            target=_watch_orch, args=(proc, started), daemon=True
        ).start()
        time.sleep(0.2)
        if proc.poll() is not None:
            meta = {
                **started,
                "state": "failed",
                "endedAt": time.time(),
                "exitCode": proc.returncode,
                "message": f"orch exited immediately ({proc.returncode})",
            }
            _write_job_meta(meta)
            ORCH_JOB_PID.unlink(missing_ok=True)
            raise RuntimeError(meta["message"] + f"; see {ORCH_JOB_LOG}")
        return {**started, "logTail": _log_tail(20)}


def run_orch_down() -> dict:
    """Kill Imagine clients (blocks briefly)."""
    if not ORCH.is_file():
        raise RuntimeError(f"missing {ORCH}")
    # If an up job is still running, stop it first so it doesn't relaunch.
    with _job_lock:
        if ORCH_JOB_PID.is_file():
            try:
                pid = int(ORCH_JOB_PID.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                pid = None
            if pid and _pid_alive(pid):
                try:
                    os.kill(pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                for _ in range(50):
                    if not _pid_alive(pid):
                        break
                    time.sleep(0.1)
                else:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            ORCH_JOB_PID.unlink(missing_ok=True)
            meta = _read_job_meta()
            meta.update(
                {
                    "state": "failed",
                    "endedAt": time.time(),
                    "message": "orch up cancelled by down",
                }
            )
            _write_job_meta(meta)

    proc = subprocess.run(
        [sys.executable, str(ORCH), "down"],
        cwd=str(HERE),
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        timeout=120,
    )
    detail = (proc.stdout or proc.stderr or "").strip()[-800:]
    if proc.returncode != 0:
        raise RuntimeError(detail or f"orch down exit {proc.returncode}")
    return {"ok": True, "detail": detail or "clients stopped"}


def collect_status() -> dict:
    ensure_display()
    mapped = load_window_map()
    live = find_imagine_windows()
    roles: dict[str, dict] = {}
    for role, wid in mapped.items():
        roles[role] = {
            "wid": wid,
            "live": wid in live,
        }
    # Studio health (best-effort; same curl pattern as orch).
    studio: dict = {}
    studio_url = os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700").rstrip(
        "/"
    )
    token = os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    try:
        cmd = ["curl", "-sS", "-m", "3"]
        if token:
            cmd += ["-H", f"X-Studio-Token: {token}"]
        cmd.append(f"{studio_url}/studio/health")
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
        studio = json.loads(out) if out.strip() else {}
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
        studio = {}

    def online(role: str) -> bool:
        if studio.get(role):
            return True
        if role.startswith("vam") and (studio.get("vam") or studio.get("va")):
            return True
        if role.startswith("vaf") and studio.get("vaf"):
            return True
        return False

    for role, info in roles.items():
        info["inWorld"] = online(role)
        info["screen"] = None
        if not info["live"]:
            continue
        if info["inWorld"]:
            info["screen"] = "in_world"
            continue
        # Live but not channel-online → classify local snap (login / char-select).
        try:
            from portrait_screen_detect import classify_image

            path = debug_snap(role, "status", wid=info.get("wid"), upload=False)
            if path and path.is_file():
                info["screen"] = classify_image(path, use_ocr=False).get("kind")
        except Exception:
            info["screen"] = "unknown"

    # Ensure vam1/vaf1 keys always present for Admin table (even if unmapped).
    for role in ("vam1", "vaf1"):
        roles.setdefault(
            role,
            {"wid": None, "live": False, "inWorld": False, "screen": None},
        )
        if role not in mapped:
            roles[role]["inWorld"] = online(role)

    return {
        "ok": True,
        "display": os.environ.get("DISPLAY"),
        "windowTitle": WINDOW_TITLE,
        "windowsPath": str(WINDOWS_PATH),
        "liveWindows": live,
        "clientCounts": count_imagine_clients(),
        "maxClients": MAX_MANNEQUIN_CLIENTS,
        "mapped": roles,
        "studioUrl": studio_url,
        "studioHealth": {
            k: bool(studio.get(k))
            for k in ("vam1", "vaf1", "vam", "vaf")
        },
        "job": orch_job_status(),
    }


def run_preview(mannequin: str) -> tuple[bytes, dict]:
    ensure_display()
    out_dir = Path(tempfile.mkdtemp(prefix="portrait-preview-"))
    try:
        cmd = [
            sys.executable,
            str(WORKER),
            "preview",
            mannequin,
            "--out",
            str(out_dir),
        ]
        proc = subprocess.run(
            cmd,
            cwd=str(HERE),
            capture_output=True,
            text=True,
            env=os.environ.copy(),
            timeout=float(os.environ.get("PORTRAIT_PREVIEW_TIMEOUT_SEC", "40")),
        )
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()
            raise RuntimeError(detail[:500])
        png_path = out_dir / f"preview-{mannequin}.png"
        meta_path = out_dir / f"preview-{mannequin}.json"
        if not png_path.is_file():
            raise RuntimeError("preview PNG missing after worker")
        meta: dict = {}
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                meta = {}
        return png_path.read_bytes(), meta
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


def run_debug_snap(mannequin: str, step: str = "admin") -> tuple[bytes, dict]:
    """Full-window snap (no studio crop) for login debug from Admin UI."""
    ensure_display()
    path = debug_snap(mannequin, step or "admin", upload=False)
    if not path or not path.is_file():
        raise RuntimeError(
            f"no Imagine window for {mannequin} (is the client up / pinned?)"
        )
    meta = {
        "mannequin": mannequin,
        "step": step or "admin",
        "path": str(path),
        "ts": path.stat().st_mtime,
    }
    return path.read_bytes(), meta


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_png(self, png: bytes, meta: dict) -> None:
        meta_json = json.dumps(meta).encode()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(png)))
        self.send_header("X-Portrait-Preview-Meta", meta_json.decode("utf-8")[:900])
        self.end_headers()
        self.wfile.write(png)

    def _send_err(self, status: int, msg: str) -> None:
        self._send_json(status, {"ok": False, "error": msg})

    def _read_json(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_error(400, "invalid JSON")
            return None
        if not isinstance(body, dict):
            self.send_error(400, "invalid JSON")
            return None
        return body

    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/health":
            if not check_auth(self):
                return
            self._send_json(200, {"ok": True, "service": "portrait-preview"})
            return
        if path == "/status":
            if not check_auth(self):
                return
            try:
                self._send_json(200, collect_status())
            except Exception as e:
                self._send_err(502, str(e)[:500])
            return
        if path == "/orch/job":
            if not check_auth(self):
                return
            self._send_json(200, {"ok": True, "job": orch_job_status()})
            return
        self.send_error(404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path not in {"/preview", "/debug-snap", "/orch/up", "/orch/down"}:
            self.send_error(404)
            return
        if not check_auth(self):
            return

        if path == "/orch/up":
            body = self._read_json()
            if body is None:
                return
            male_only = bool(body.get("maleOnly") or body.get("male_only"))
            try:
                job = start_orch_up(male_only=male_only)
                self._send_json(202, {"ok": True, "job": job})
            except Exception as e:
                self._send_err(409 if "already running" in str(e) else 502, str(e)[:500])
            return

        if path == "/orch/down":
            # Optional empty body
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length:
                self.rfile.read(length)
            try:
                result = run_orch_down()
                self._send_json(200, result)
            except Exception as e:
                self._send_err(502, str(e)[:500])
            return

        body = self._read_json()
        if body is None:
            return
        mannequin = normalize_role(
            str(body.get("mannequin") or body.get("role") or "")
        )
        if not mannequin:
            self.send_error(400, "mannequin must be vam1 or vaf1")
            return
        try:
            if path == "/debug-snap":
                step = str(body.get("step") or "admin").strip() or "admin"
                png, meta = run_debug_snap(mannequin, step)
            else:
                png, meta = run_preview(mannequin)
        except Exception as e:
            self._send_err(502, str(e)[:500])
            return
        self._send_png(png, meta)


def main() -> None:
    load_portrait_env()
    ensure_display()
    if not WORKER.is_file():
        raise SystemExit(f"missing {WORKER}")
    if not worker_token():
        raise SystemExit("set PORTRAIT_WORKER_TOKEN or PORTRAIT_STUDIO_TOKEN")
    host = os.environ.get("PORTRAIT_PREVIEW_HOST", "0.0.0.0").strip() or "0.0.0.0"
    port = int(os.environ.get("PORTRAIT_PREVIEW_PORT", str(DEFAULT_PORT)))
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(
        f"portrait agent on http://{host}:{port} "
        f"(GET /status /orch/job /health; "
        f"POST /preview /debug-snap /orch/up /orch/down; token required)",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye", flush=True)


if __name__ == "__main__":
    main()

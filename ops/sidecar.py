#!/usr/bin/env python3
"""Phase 16I ops sidecar — localhost control plane.

Binds 127.0.0.1 so it is not reachable from the LAN. The website BFF proxies
admin requests here with OPS_TOKEN. Verbs register in ALLOWED; unknown paths
404.

  OPS_TOKEN          required
  OPS_PORT           default 14710
  OPS_BIND           default 127.0.0.1 (loopback only; other binds refused)
  OPS_BACKEND        native | docker  (restart implementation)
  OPS_COMP_SCRIPTS   native: comp_hack/scripts (default ../comp_hack/scripts)
  OPS_COMPOSE_DIR    docker: deploy/ with docker-compose.yml
  OPS_AUDIT          append-only log path (default: ops/audit.log)
  OPS_REHASH         path to comp_rehash (default comp_hack/build-current/bin)

  Lane C (Docker only): POST /publish/lane-c {"confirm": true}
    optional includeWebsite / website: also pull+recreate website

  python3 ops/sidecar.py
"""

from __future__ import annotations

import json
import os
import hmac
import subprocess
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from first_boot import first_boot_public, first_boot_status
from freshness import (
    destinations_include_overlay,
    freshness_public,
    kinds_requiring_channel_restart,
    mark_channel_restart,
    mark_content_change,
    mark_overlay_change,
    mark_overlay_rehash,
)
import ingest_jobs
from rehash import run_comp_rehash
from zip_ingest import KINDS, MAX_UPLOAD, MODES, ingest_zip_file, save_upload_stream

REPO_ROOT = HERE.parent
SMT_ROOT = REPO_ROOT.parent
WEBSITE = REPO_ROOT / "website"
ALLOWED_BIND = {"127.0.0.1", "localhost", "::1"}


def _load_env_file(path: Path) -> None:
    """Set OPS_* from a dotenv file without overriding the real environment."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key.startswith("OPS_"):
            continue
        if os.environ.get(key, "").strip():
            continue
        os.environ[key] = val.strip().strip("'").strip('"')


def load_ops_env() -> None:
    custom = os.environ.get("OPS_ENV_FILE", "").strip()
    paths = []
    if custom:
        paths.append(Path(custom).expanduser())
    paths.extend([HERE / ".env", HERE / ".env.local", WEBSITE / ".env.local"])
    for path in paths:
        _load_env_file(path)


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def token() -> str:
    return env("OPS_TOKEN")


def audit_path() -> Path:
    custom = env("OPS_AUDIT")
    return Path(custom).expanduser() if custom else HERE / "audit.log"


def audit(event: dict) -> None:
    path = audit_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    event = {
        "ts": datetime.now(timezone.utc).isoformat(),
        **event,
    }
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, separators=(",", ":")) + "\n")


def tokens_equal(got: str, expected: str) -> bool:
    if not got or not expected:
        return False
    return hmac.compare_digest(got.encode(), expected.encode())


def json_bytes(payload: dict, status: int) -> tuple[int, bytes, str]:
    body = json.dumps(payload).encode("utf-8")
    return status, body, "application/json"


def handle_health(_handler: OpsHandler) -> tuple[int, bytes, str]:
    backend = env("OPS_BACKEND", "native") or "native"
    payload = {
        "ok": True,
        "service": "ops-sidecar",
        "backend": backend,
        "verbs": sorted({p.lstrip("/") or p for (_m, p) in ALLOWED}),
    }
    payload.update(freshness_public(runtime_dir()))
    payload.update(first_boot_public(runtime_dir(), updater_dir()))
    return json_bytes(payload, 200)


def comp_scripts_dir() -> Path:
    custom = env("OPS_COMP_SCRIPTS")
    if custom:
        return Path(custom).expanduser()
    return SMT_ROOT / "comp_hack" / "scripts"


def compose_dir() -> Path:
    custom = env("OPS_COMPOSE_DIR")
    if custom:
        return Path(custom).expanduser()
    return REPO_ROOT / "deploy"


def runtime_dir() -> Path:
    custom = env("OPS_RUNTIME")
    if custom:
        return Path(custom).expanduser()
    backend = (env("OPS_BACKEND", "native") or "native").lower()
    if backend == "docker":
        return compose_dir() / "data"
    return SMT_ROOT / "comp_hack" / "runtime"


def updater_dir() -> Path:
    custom = env("OPS_UPDATER_ROOT") or env("UPDATER_ROOT")
    if custom:
        return Path(custom).expanduser()
    return REPO_ROOT / "updater"


def _tail_output(stdout: str | None, stderr: str | None, limit: int = 800) -> str:
    tail = (stdout or "") + (stderr or "")
    return tail.strip()[-limit:]


def run_native_script(
    script_name: str,
    *,
    timeout: int = 120,
    args: list[str] | None = None,
) -> tuple[bool, str, str]:
    script = comp_scripts_dir() / script_name
    if not script.is_file():
        return False, "missing_script", f"not found: {script}"
    cmd = ["bash", str(script), *(args or [])]
    try:
        r = subprocess.run(
            cmd,
            cwd=str(script.parent),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, "timeout", f"{script_name} timed out after {timeout}s"
    except OSError as e:
        return False, "spawn_failed", str(e)
    tail = _tail_output(r.stdout, r.stderr)
    if r.returncode != 0:
        return False, "script_failed", tail or f"exit {r.returncode}"
    return True, "ok", tail or script_name


def run_compose(
    args: list[str], *, timeout: int = 120, ok_message: str = "compose ok"
) -> tuple[bool, str, str]:
    deploy = compose_dir()
    compose_file = deploy / "docker-compose.yml"
    if not compose_file.is_file():
        return False, "missing_compose", f"not found: {compose_file}"
    cmd = ["docker", "compose", *args]
    try:
        r = subprocess.run(
            cmd,
            cwd=str(deploy),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False, "timeout", f"docker compose timed out after {timeout}s"
    except OSError as e:
        return False, "spawn_failed", str(e)
    tail = _tail_output(r.stdout, r.stderr)
    if r.returncode != 0:
        return False, "compose_failed", tail or f"exit {r.returncode}"
    return True, "ok", tail or ok_message


def restart_channel_native() -> tuple[bool, str, str]:
    ok, code, detail = run_native_script("restart-channel.sh")
    if not ok:
        return False, code, detail
    return True, "restarted", detail or "channel restarted"


def restart_channel_docker() -> tuple[bool, str, str]:
    ok, code, detail = run_compose(
        ["restart", "channel"],
        ok_message="docker compose restart channel ok",
    )
    if not ok:
        return False, code, detail
    return True, "restarted", detail


def start_servers_native() -> tuple[bool, str, str]:
    ok, code, detail = run_native_script("start.sh", timeout=180)
    if not ok:
        return False, code, detail
    return True, "started", detail or "all servers started"


def start_servers_docker() -> tuple[bool, str, str]:
    ok, code, detail = run_compose(
        ["up", "-d", "lobby", "world", "channel"],
        timeout=180,
        ok_message="docker compose up lobby world channel ok",
    )
    if not ok:
        return False, code, detail
    return True, "started", detail


def stop_servers_native() -> tuple[bool, str, str]:
    ok, code, detail = run_native_script("stop.sh")
    if not ok:
        return False, code, detail
    return True, "stopped", detail or "all servers stopped"


def stop_servers_docker() -> tuple[bool, str, str]:
    ok, code, detail = run_compose(
        ["stop", "channel", "world", "lobby"],
        ok_message="docker compose stop channel world lobby ok",
    )
    if not ok:
        return False, code, detail
    return True, "stopped", detail


def _lane_a_env() -> dict[str, str]:
    run_env = os.environ.copy()
    run_env.setdefault("OPS_RUNTIME", str(runtime_dir()))
    run_env.setdefault("COMP_SHOPS_DIR", str(REPO_ROOT / "server-content" / "shops"))
    run_env.setdefault(
        "COMP_PAYOUTS_DIR", str(REPO_ROOT / "server-content" / "payouts")
    )
    run_env.setdefault(
        "COMP_CONFIG_DIR", str(REPO_ROOT / "server-content" / "config")
    )
    run_env.setdefault("COMP_CONFIG_LIVE_DIR", str(runtime_dir() / "config"))
    return run_env


def run_lane_a_script(extra_args: list[str]) -> tuple[bool, str, dict]:
    script = WEBSITE / "scripts" / "publish-lane-a.ts"
    if not script.is_file():
        return False, f"not found: {script}", {}
    cmd = ["node", "--experimental-strip-types", str(script), "--json", *extra_args]
    try:
        r = subprocess.run(
            cmd,
            cwd=str(WEBSITE),
            env=_lane_a_env(),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return False, "publish-lane-a.ts timed out after 120s", {}
    except OSError as e:
        return False, str(e), {}
    stdout = (r.stdout or "").strip()
    payload: dict = {}
    if stdout:
        try:
            payload = json.loads(stdout.splitlines()[-1])
        except json.JSONDecodeError:
            payload = {"detail": stdout[-800:]}
    if r.returncode != 0:
        err = payload.get("error") if isinstance(payload.get("error"), str) else None
        if not err and isinstance(payload.get("errors"), list) and payload["errors"]:
            err = "; ".join(str(x) for x in payload["errors"])
        tail = _tail_output(r.stdout, r.stderr)
        return False, err or tail or f"exit {r.returncode}", payload
    if not payload.get("ok"):
        err = payload.get("error") if isinstance(payload.get("error"), str) else None
        if not err and isinstance(payload.get("errors"), list) and payload["errors"]:
            err = "; ".join(str(x) for x in payload["errors"])
        return False, err or "publish failed", payload
    return True, str(payload.get("phase") or "ok"), payload


def publish_lane_a_copy() -> tuple[bool, str, dict]:
    return run_lane_a_script([])


def _restart_channel_for_backend(backend: str) -> tuple[bool, str, str]:
    if backend == "docker":
        return restart_channel_docker()
    return restart_channel_native()


def _backend_or_400() -> tuple[str | None, tuple[int, bytes, str] | None]:
    backend = (env("OPS_BACKEND", "native") or "native").lower()
    if backend not in {"native", "docker"}:
        return None, json_bytes(
            {"ok": False, "error": "bad_backend", "backend": backend},
            400,
        )
    return backend, None


def _action_response(
    *,
    ok: bool,
    code: str,
    detail: str,
    backend: str,
    message: str,
) -> tuple[int, bytes, str]:
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": code,
                "service": "game",
                "backend": backend,
                "detail": detail,
            },
            502,
        )
    return json_bytes(
        {
            "ok": True,
            "service": "game",
            "backend": backend,
            "message": message,
            "detail": detail,
        },
        200,
    )


def handle_restart_channel(_handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    if backend == "docker":
        ok, code, detail = restart_channel_docker()
    else:
        ok, code, detail = restart_channel_native()
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": code,
                "service": "channel",
                "backend": backend,
                "detail": detail,
            },
            502,
        )
    mark_channel_restart(runtime_dir())
    return json_bytes(
        {
            "ok": True,
            "service": "channel",
            "backend": backend,
            "message": "channel restarted",
            "detail": detail,
            **freshness_public(runtime_dir()),
        },
        200,
    )


def handle_start(_handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    boot = first_boot_status(runtime_dir(), updater_dir())
    if boot.get("needed"):
        missing = boot.get("missing") or []
        missing_s = ", ".join(str(m) for m in missing) or "binarydata, maps"
        return json_bytes(
            {
                "ok": False,
                "error": "first_boot_incomplete",
                "service": "game",
                "backend": backend,
                "message": "Upload BinaryData and maps before starting",
                "detail": f"missing required content: {missing_s}",
                "firstBoot": boot,
            },
            409,
        )
    if backend == "docker":
        ok, code, detail = start_servers_docker()
    else:
        ok, code, detail = start_servers_native()
    if ok:
        mark_channel_restart(runtime_dir())
    return _action_response(
        ok=ok,
        code=code,
        detail=detail,
        backend=backend,
        message="game servers started",
    )


def handle_stop(_handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    if backend == "docker":
        ok, code, detail = stop_servers_docker()
    else:
        ok, code, detail = stop_servers_native()
    return _action_response(
        ok=ok,
        code=code,
        detail=detail,
        backend=backend,
        message="game servers stopped",
    )


def _read_json_body(handler: "OpsHandler", max_bytes: int = 65536) -> dict:
    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        return {}
    if length <= 0:
        return {}
    raw = handler.rfile.read(min(length, max_bytes))
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _lane_a_payload(backend: str, payload: dict, **extra: object) -> dict:
    out = {
        "lane": "A",
        "backend": backend,
        "phase": payload.get("phase"),
        "releaseId": payload.get("releaseId"),
        "shopsCopied": payload.get("shopsCopied", 0),
        "payoutsPackaged": payload.get("payoutsPackaged", 0),
        "disabledPayouts": payload.get("disabledPayouts", []),
        "skippedConflicts": payload.get("skippedConflicts", []),
        "warnings": payload.get("warnings", []),
        "errors": payload.get("errors", []),
        "shopsDest": payload.get("shopsDest"),
        "payoutsZipPath": payload.get("payoutsZipPath"),
        "releasesDir": payload.get("releasesDir"),
        "releasePath": payload.get("releasePath"),
    }
    out.update(extra)
    return out


def handle_publish_lane_a_validate(_handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    ok, detail, payload = run_lane_a_script(["--validate"])
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": "validate_failed",
                "detail": detail,
                **_lane_a_payload(backend, payload),
            },
            502,
        )
    return json_bytes(
        {
            "ok": True,
            "message": "Lane A validation passed",
            "detail": detail,
            **_lane_a_payload(backend, payload),
        },
        200,
    )


def handle_publish_lane_a_apply(handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    body = _read_json_body(handler)
    release_id = str(body.get("releaseId") or "").strip()
    if not release_id:
        return json_bytes(
            {"ok": False, "error": "missing_release_id", "lane": "A"},
            400,
        )
    restart = body.get("restart", True)
    if restart is None:
        restart = True
    restart = bool(restart)

    ok, detail, payload = run_lane_a_script(["--apply", release_id])
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": "apply_failed",
                "detail": detail,
                **_lane_a_payload(backend, payload),
            },
            502,
        )

    mark_content_change(
        runtime_dir(), kinds=["shops", "payouts"], source="lane-a/apply"
    )

    restart_detail = ""
    restarted = False
    if restart:
        rok, rcode, restart_detail = _restart_channel_for_backend(backend)
        if not rok:
            return json_bytes(
                {
                    "ok": False,
                    "error": "restart_failed",
                    "message": "Applied but channel restart failed",
                    "detail": restart_detail,
                    "restartError": rcode,
                    **_lane_a_payload(backend, payload),
                    **freshness_public(runtime_dir()),
                },
                502,
            )
        mark_channel_restart(runtime_dir())
        restarted = True

    message = (
        "Lane A applied and channel restarted"
        if restarted
        else "Lane A applied (channel not restarted)"
    )
    return json_bytes(
        {
            "ok": True,
            "message": message,
            "restarted": restarted,
            "detail": restart_detail or detail,
            **_lane_a_payload(backend, payload),
            **freshness_public(runtime_dir()),
        },
        200,
    )


def handle_publish_lane_a_rollback(handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    body = _read_json_body(handler)
    release_id = str(body.get("releaseId") or "").strip()
    restart = body.get("restart", True)
    if restart is None:
        restart = True
    restart = bool(restart)

    args = ["--rollback"]
    if release_id:
        args.extend(["--release", release_id])
    ok, detail, payload = run_lane_a_script(args)
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": "rollback_failed",
                "detail": detail,
                **_lane_a_payload(backend, payload),
            },
            502,
        )

    mark_content_change(
        runtime_dir(), kinds=["shops", "payouts"], source="lane-a/rollback"
    )

    restart_detail = ""
    restarted = False
    if restart:
        rok, rcode, restart_detail = _restart_channel_for_backend(backend)
        if not rok:
            return json_bytes(
                {
                    "ok": False,
                    "error": "restart_failed",
                    "message": "Rolled back but channel restart failed",
                    "detail": restart_detail,
                    "restartError": rcode,
                    **_lane_a_payload(backend, payload),
                    **freshness_public(runtime_dir()),
                },
                502,
            )
        mark_channel_restart(runtime_dir())
        restarted = True

    message = (
        "Lane A rolled back and channel restarted"
        if restarted
        else "Lane A rolled back (channel not restarted)"
    )
    return json_bytes(
        {
            "ok": True,
            "message": message,
            "restarted": restarted,
            "detail": restart_detail or detail,
            **_lane_a_payload(backend, payload),
            **freshness_public(runtime_dir()),
        },
        200,
    )


def handle_publish_lane_a(handler: OpsHandler) -> tuple[int, bytes, str]:
    """One-shot: validate + apply + optional restart (compat)."""
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    body = _read_json_body(handler)
    restart = body.get("restart", True)
    if restart is None:
        restart = True
    restart = bool(restart)

    ok, detail, payload = publish_lane_a_copy()
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": "publish_failed",
                "detail": detail,
                **_lane_a_payload(backend, payload),
            },
            502,
        )

    mark_content_change(
        runtime_dir(), kinds=["shops", "payouts"], source="lane-a/publish"
    )

    restart_detail = ""
    restarted = False
    if restart:
        rok, rcode, restart_detail = _restart_channel_for_backend(backend)
        if not rok:
            return json_bytes(
                {
                    "ok": False,
                    "error": "restart_failed",
                    "message": "Published but channel restart failed",
                    "detail": restart_detail,
                    "restartError": rcode,
                    **_lane_a_payload(backend, payload),
                    **freshness_public(runtime_dir()),
                },
                502,
            )
        mark_channel_restart(runtime_dir())
        restarted = True

    message = (
        "Lane A published and channel restarted"
        if restarted
        else "Lane A published (channel not restarted)"
    )
    return json_bytes(
        {
            "ok": True,
            "message": message,
            "restarted": restarted,
            "detail": restart_detail or detail,
            **_lane_a_payload(backend, payload),
            **freshness_public(runtime_dir()),
        },
        200,
    )


def _ingest_result_payload(result, runtime: Path, updater: Path) -> tuple[dict, int]:
    status = 200 if result.ok else 502
    if result.error == "too_large":
        status = 413
    elif result.error in {
        "bad_kind",
        "bad_mode",
        "bad_zip",
        "empty_zip",
        "no_matching_files",
        "zip_slip",
        "symlink_rejected",
        "zip_bomb",
    }:
        status = 400
    payload = result.as_dict()
    needs_restart = kinds_requiring_channel_restart(
        result.kind, result.destinations
    )
    payload["requiresChannelRestart"] = bool(needs_restart)
    if result.ok and needs_restart:
        mark_content_change(
            runtime,
            kinds=needs_restart,
            source=f"ingest/zip:{result.kind}",
        )
    if result.ok:
        msg = (
            f"Ingested {result.kind} ({result.mode}): {result.files} file(s)"
        )
        if result.files_removed:
            msg += f", removed {result.files_removed}"
        msg += " → " + ", ".join(result.destinations)
        if needs_restart:
            msg += " — channel restart required to load these files"
        payload["message"] = msg
    payload.update(freshness_public(runtime))
    payload.update(first_boot_public(runtime, updater))
    return payload, status


def _maybe_rehash_after_ingest(
    job_id: str,
    result,
    *,
    want_rehash: bool,
    runtime: Path,
    updater: Path,
) -> tuple[bool, str]:
    """If overlay dests changed, mark overlay stale and optionally rehash."""
    overlay = destinations_include_overlay(result.destinations) or (
        result.kind == "overlay"
    )
    if not overlay:
        return True, ""
    mark_overlay_change(runtime, source=f"ingest/zip:{result.kind}")
    if not want_rehash:
        ingest_jobs.log(
            job_id,
            "overlay files written — rehash skipped (hashlist stale until Lane B)",
        )
        return True, ""
    ingest_jobs.set_phase(job_id, "rehashing", msg="running comp_rehash…")
    ok, code, detail = run_comp_rehash(updater)
    if not ok:
        ingest_jobs.log(job_id, f"comp_rehash failed ({code}): {detail}")
        return False, detail
    mark_overlay_rehash(runtime)
    ingest_jobs.log(job_id, "comp_rehash ok — players should run ImagineUpdate")
    return True, detail


def _run_ingest_job(
    job_id: str,
    zip_path: Path,
    *,
    kind: str,
    mode: str,
    runtime: Path,
    updater: Path,
    releases: Path,
    want_rehash: bool,
) -> None:
    ingest_jobs.set_phase(job_id, "unpacking", msg="zip uploaded — unpacking")
    try:
        result = ingest_zip_file(
            zip_path,
            kind=kind,
            mode=mode,
            runtime=runtime,
            updater=updater,
            releases_dir=releases,
            release_id=job_id,
            on_progress=lambda msg, **kw: ingest_jobs.progress(job_id, msg, **kw),
        )
        payload, _status = _ingest_result_payload(result, runtime, updater)
        if result.ok:
            ingest_jobs.log(
                job_id,
                payload.get("message") or "unpack complete",
                filesDone=result.files,
                filesTotal=result.files,
            )
            rehash_ok, rehash_detail = _maybe_rehash_after_ingest(
                job_id,
                result,
                want_rehash=want_rehash,
                runtime=runtime,
                updater=updater,
            )
            payload.update(freshness_public(runtime))
            payload.update(first_boot_public(runtime, updater))
            payload["rehashed"] = rehash_ok and want_rehash and (
                destinations_include_overlay(result.destinations)
                or result.kind == "overlay"
            )
            if rehash_detail:
                payload["rehashDetail"] = rehash_detail
            if not rehash_ok:
                ingest_jobs.finish(
                    job_id,
                    ok=False,
                    result=payload,
                    error="rehash_failed",
                )
                return
        else:
            ingest_jobs.log(
                job_id,
                result.detail or result.error or "unpack failed",
            )
        ingest_jobs.finish(
            job_id,
            ok=result.ok,
            result=payload,
            error="" if result.ok else (result.error or "ingest_failed"),
        )
    except Exception as e:
        ingest_jobs.log(job_id, f"unpack crashed: {e}")
        ingest_jobs.finish(
            job_id,
            ok=False,
            result={"ok": False, "error": "unpack_crashed", "detail": str(e)},
            error="unpack_crashed",
        )
    finally:
        zip_path.unlink(missing_ok=True)


def handle_ingest_job(handler: OpsHandler) -> tuple[int, bytes, str]:
    parsed = urlparse(handler.path)
    qs = parse_qs(parsed.query or "")
    job_id = (qs.get("id") or [""])[0].strip()
    if not job_id:
        return json_bytes({"ok": False, "error": "missing_job_id"}, 400)
    snap = ingest_jobs.get_job(job_id)
    if snap is None:
        return json_bytes({"ok": False, "error": "unknown_job"}, 404)
    return json_bytes(snap, 200)


def handle_ingest_zip(handler: OpsHandler) -> tuple[int, bytes, str]:
    """POST /ingest/zip?kind=…&mode=merge|replace with raw zip body.

    Saves the zip, then unpacks in a background thread. Returns 202 + jobId
    so the admin UI can poll GET /ingest/job?id= for unzip logs.
    """
    parsed = urlparse(handler.path)
    qs = parse_qs(parsed.query or "")
    kind = (qs.get("kind") or [""])[0].strip().lower()
    if not kind:
        kind = (handler.headers.get("X-Ops-Kind") or "").strip().lower()
    mode = (qs.get("mode") or ["merge"])[0].strip().lower() or "merge"
    if not mode:
        mode = (handler.headers.get("X-Ops-Mode") or "merge").strip().lower()
    if kind not in KINDS:
        return json_bytes(
            {
                "ok": False,
                "error": "bad_kind",
                "detail": f"kind must be one of: {', '.join(sorted(KINDS))}",
            },
            400,
        )
    if mode not in MODES:
        return json_bytes(
            {
                "ok": False,
                "error": "bad_mode",
                "detail": "mode must be merge or replace",
            },
            400,
        )

    rehash_raw = (qs.get("rehash") or [""])[0].strip().lower()
    if rehash_raw in {"0", "false", "no"}:
        want_rehash = False
    else:
        # Default on: skip automatically when the zip has no overlay dests.
        want_rehash = True

    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        length = 0
    max_size = MAX_UPLOAD[kind]
    if length <= 0:
        return json_bytes(
            {"ok": False, "error": "missing_body", "detail": "Content-Length required"},
            400,
        )
    if length > max_size:
        return json_bytes(
            {
                "ok": False,
                "error": "too_large",
                "detail": f"Content-Length {length} exceeds max {max_size} for kind={kind}",
            },
            413,
        )

    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype.startswith("multipart/"):
        return json_bytes(
            {
                "ok": False,
                "error": "bad_content_type",
                "detail": "send raw zip body (application/zip), not multipart",
            },
            400,
        )

    if ingest_jobs.busy():
        return json_bytes(
            {
                "ok": False,
                "error": "ingest_busy",
                "detail": "another ingest is still unpacking",
            },
            409,
        )

    runtime = runtime_dir()
    updater = updater_dir()
    releases = runtime / "releases" / "ingest"
    job_id = ingest_jobs.create_job(
        kind=kind, mode=mode, bytes_expected=length
    )
    job_dir = releases / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    zip_path = job_dir / "upload.zip"

    remaining = length

    def read_chunk(n: int) -> bytes:
        nonlocal remaining
        if remaining <= 0:
            return b""
        data = handler.rfile.read(min(n, remaining))
        remaining -= len(data)
        return data

    ok_save, save_detail, written = save_upload_stream(
        read_chunk, max_size=max_size, dest=zip_path
    )

    if not ok_save:
        zip_path.unlink(missing_ok=True)
        ingest_jobs.finish(
            job_id,
            ok=False,
            result={"ok": False, "error": "upload_failed", "detail": save_detail},
            error="upload_failed",
        )
        ingest_jobs.log(job_id, save_detail)
        return json_bytes(
            {
                "ok": False,
                "error": "upload_failed",
                "detail": save_detail,
                "kind": kind,
                "jobId": job_id,
            },
            400,
        )

    mb = written / (1024 * 1024)
    ingest_jobs.log(
        job_id,
        f"zip uploaded successfully ({mb:.1f} MiB)",
        bytesUploaded=written,
        phase="unpacking",
    )

    worker = threading.Thread(
        target=_run_ingest_job,
        args=(job_id, zip_path),
        kwargs={
            "kind": kind,
            "mode": mode,
            "runtime": runtime,
            "updater": updater,
            "releases": releases,
            "want_rehash": want_rehash,
        },
        daemon=True,
        name=f"ingest-{job_id}",
    )
    worker.start()

    snap = ingest_jobs.get_job(job_id) or {}
    return json_bytes(
        {
            "ok": True,
            "accepted": True,
            "jobId": job_id,
            "phase": snap.get("phase") or "unpacking",
            "kind": kind,
            "mode": mode,
            "bytesUploaded": written,
            "message": "Zip uploaded — unpacking in the background",
            "logs": snap.get("logs") or [],
        },
        202,
    )


def handle_publish_lane_b(_handler: OpsHandler) -> tuple[int, bytes, str]:
    """Rehash updater/overlay so ImagineUpdate picks up overlay files."""
    if ingest_jobs.busy():
        return json_bytes(
            {
                "ok": False,
                "error": "ingest_busy",
                "detail": "wait for the current ingest/rehash to finish",
            },
            409,
        )
    updater = updater_dir()
    runtime = runtime_dir()
    ok, code, detail = run_comp_rehash(updater)
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": code,
                "lane": "B",
                "detail": detail,
                **freshness_public(runtime),
            },
            502,
        )
    mark_overlay_rehash(runtime)
    return json_bytes(
        {
            "ok": True,
            "lane": "B",
            "message": "Overlay rehashed — players should run ImagineUpdate",
            "detail": detail,
            **freshness_public(runtime),
        },
        200,
    )


def run_lane_a_config_script(extra_args: list[str]) -> tuple[bool, str, dict]:
    script = WEBSITE / "scripts" / "publish-lane-a-config.ts"
    if not script.is_file():
        return False, f"not found: {script}", {}
    cmd = ["node", "--experimental-strip-types", str(script), "--json", *extra_args]
    try:
        r = subprocess.run(
            cmd,
            cwd=str(WEBSITE),
            env=_lane_a_env(),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return False, "publish-lane-a-config.ts timed out after 120s", {}
    except OSError as e:
        return False, str(e), {}
    stdout = (r.stdout or "").strip()
    payload: dict = {}
    if stdout:
        try:
            payload = json.loads(stdout.splitlines()[-1])
        except json.JSONDecodeError:
            payload = {"detail": stdout[-800:]}
    if r.returncode != 0:
        err = payload.get("error") if isinstance(payload.get("error"), str) else None
        if not err and isinstance(payload.get("errors"), list) and payload["errors"]:
            err = "; ".join(str(x) for x in payload["errors"])
        tail = _tail_output(r.stdout, r.stderr)
        return False, err or tail or f"exit {r.returncode}", payload
    if not payload.get("ok"):
        err = payload.get("error") if isinstance(payload.get("error"), str) else None
        if not err and isinstance(payload.get("errors"), list) and payload["errors"]:
            err = "; ".join(str(x) for x in payload["errors"])
        return False, err or "publish failed", payload
    return True, str(payload.get("phase") or "ok"), payload


def _lane_a_config_payload(backend: str, payload: dict, **extra: object) -> dict:
    out = {
        "lane": "A-config",
        "backend": backend,
        "phase": payload.get("phase"),
        "releaseId": payload.get("releaseId"),
        "filesCopied": payload.get("filesCopied", 0),
        "files": payload.get("files", []),
        "restart": payload.get("restart", []),
        "warnings": payload.get("warnings", []),
        "errors": payload.get("errors", []),
        "configDest": payload.get("configDest"),
        "releasesDir": payload.get("releasesDir"),
        "releasePath": payload.get("releasePath"),
    }
    out.update(extra)
    return out


def restart_service_native(service: str) -> tuple[bool, str, str]:
    ok, code, detail = run_native_script(
        "restart-service.sh", args=[service], timeout=90
    )
    if not ok:
        return False, code, detail
    return True, "restarted", detail or f"{service} restarted"


def restart_service_docker(service: str) -> tuple[bool, str, str]:
    ok, code, detail = run_compose(
        ["restart", service],
        ok_message=f"docker compose restart {service} ok",
    )
    if not ok:
        return False, code, detail
    return True, "restarted", detail


def _restart_services_for_backend(
    backend: str, services: list[str]
) -> tuple[bool, str, str]:
    details: list[str] = []
    for svc in services:
        if svc not in {"lobby", "world", "channel"}:
            return False, "bad_service", f"unknown service: {svc}"
        if backend == "docker":
            ok, code, detail = restart_service_docker(svc)
        else:
            ok, code, detail = restart_service_native(svc)
        if not ok:
            return False, code, detail or f"{svc} restart failed"
        details.append(detail or f"{svc} ok")
    return True, "restarted", "; ".join(details)


def handle_restart_services(handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    body = _read_json_body(handler)
    raw = body.get("services")
    if not isinstance(raw, list) or not raw:
        return json_bytes(
            {"ok": False, "error": "missing_services", "hint": "services: [lobby,world,channel]"},
            400,
        )
    services = [str(s).strip().lower() for s in raw if str(s).strip()]
    # Stable order
    order = ["lobby", "world", "channel"]
    services = [s for s in order if s in services]
    if not services:
        return json_bytes({"ok": False, "error": "no_valid_services"}, 400)

    ok, code, detail = _restart_services_for_backend(backend, services)
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": code,
                "services": services,
                "backend": backend,
                "detail": detail,
            },
            502,
        )
    if "channel" in services:
        mark_channel_restart(runtime_dir())
    return json_bytes(
        {
            "ok": True,
            "services": services,
            "backend": backend,
            "message": f"restarted {', '.join(services)}",
            "detail": detail,
            **freshness_public(runtime_dir()),
        },
        200,
    )


def handle_publish_lane_a_config_validate(handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    body = _read_json_body(handler)
    extra: list[str] = ["--validate"]
    only = body.get("only")
    if isinstance(only, list) and only:
        extra.extend(["--only", ",".join(str(x) for x in only)])
    elif isinstance(only, str) and only.strip():
        extra.extend(["--only", only.strip()])
    ok, detail, payload = run_lane_a_config_script(extra)
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": "validate_failed",
                "detail": detail,
                **_lane_a_config_payload(backend, payload),
            },
            502,
        )
    return json_bytes(
        {
            "ok": True,
            "message": "Lane A config validation passed",
            "detail": detail,
            **_lane_a_config_payload(backend, payload),
        },
        200,
    )


def handle_publish_lane_a_config_apply(handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    body = _read_json_body(handler)
    release_id = str(body.get("releaseId") or "").strip()
    if not release_id:
        return json_bytes(
            {"ok": False, "error": "missing_release_id", "lane": "A-config"},
            400,
        )
    restart = body.get("restart", True)
    if restart is None:
        restart = True
    restart = bool(restart)

    ok, detail, payload = run_lane_a_config_script(["--apply", release_id])
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": "apply_failed",
                "detail": detail,
                **_lane_a_config_payload(backend, payload),
            },
            502,
        )

    mark_content_change(
        runtime_dir(), kinds=["config"], source="lane-a-config/apply"
    )

    services = payload.get("restart") if isinstance(payload.get("restart"), list) else []
    services = [str(s) for s in services if str(s) in {"lobby", "world", "channel"}]
    restart_detail = ""
    restarted = False
    if restart and services:
        rok, rcode, restart_detail = _restart_services_for_backend(backend, services)
        if not rok:
            return json_bytes(
                {
                    "ok": False,
                    "error": "restart_failed",
                    "message": "Config applied but restart failed",
                    "detail": restart_detail,
                    "restartError": rcode,
                    **_lane_a_config_payload(backend, payload),
                    **freshness_public(runtime_dir()),
                },
                502,
            )
        if "channel" in services:
            mark_channel_restart(runtime_dir())
        restarted = True

    message = (
        f"Config applied and restarted {', '.join(services)}"
        if restarted
        else "Config applied (services not restarted)"
    )
    return json_bytes(
        {
            "ok": True,
            "message": message,
            "restarted": restarted,
            "detail": restart_detail or detail,
            **_lane_a_config_payload(backend, payload),
            **freshness_public(runtime_dir()),
        },
        200,
    )


def handle_publish_lane_a_config_rollback(handler: OpsHandler) -> tuple[int, bytes, str]:
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None
    body = _read_json_body(handler)
    release_id = str(body.get("releaseId") or "").strip()
    restart = body.get("restart", True)
    if restart is None:
        restart = True
    restart = bool(restart)

    extra = ["--rollback"]
    if release_id:
        extra.extend(["--release", release_id])
    ok, detail, payload = run_lane_a_config_script(extra)
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": "rollback_failed",
                "detail": detail,
                **_lane_a_config_payload(backend, payload),
            },
            502,
        )

    mark_content_change(
        runtime_dir(), kinds=["config"], source="lane-a-config/rollback"
    )

    services = payload.get("restart") if isinstance(payload.get("restart"), list) else []
    services = [str(s) for s in services if str(s) in {"lobby", "world", "channel"}]
    restart_detail = ""
    restarted = False
    if restart and services:
        rok, rcode, restart_detail = _restart_services_for_backend(backend, services)
        if not rok:
            return json_bytes(
                {
                    "ok": False,
                    "error": "restart_failed",
                    "message": "Rolled back but restart failed",
                    "detail": restart_detail,
                    "restartError": rcode,
                    **_lane_a_config_payload(backend, payload),
                    **freshness_public(runtime_dir()),
                },
                502,
            )
        if "channel" in services:
            mark_channel_restart(runtime_dir())
        restarted = True

    message = (
        f"Config rolled back and restarted {', '.join(services)}"
        if restarted
        else "Config rolled back (services not restarted)"
    )
    return json_bytes(
        {
            "ok": True,
            "message": message,
            "restarted": restarted,
            "detail": restart_detail or detail,
            **_lane_a_config_payload(backend, payload),
            **freshness_public(runtime_dir()),
        },
        200,
    )


LANE_C_SERVICES_COMP = ("lobby", "world", "channel")
LANE_C_SERVICES_WEBSITE = ("website",)


def publish_lane_c_docker(
    *, include_website: bool
) -> tuple[bool, str, str, list[str]]:
    """Pull images and force-recreate game containers (optional website)."""
    services = list(LANE_C_SERVICES_COMP)
    if include_website:
        services.extend(LANE_C_SERVICES_WEBSITE)

    ok, code, detail = run_compose(
        ["pull", *services],
        timeout=600,
        ok_message=f"pulled {', '.join(services)}",
    )
    if not ok:
        return False, code, detail, services

    # Recreate so new image layers + EXTERNAL_IP entrypoint patch apply.
    ok, code, detail2 = run_compose(
        ["up", "-d", "--force-recreate", "--remove-orphans", *services],
        timeout=300,
        ok_message=f"recreated {', '.join(services)}",
    )
    combined = (detail or "") + (("\n" + detail2) if detail2 else "")
    if not ok:
        return False, code, combined.strip(), services
    return True, "ok", combined.strip() or f"lane C: {', '.join(services)}", services


def handle_publish_lane_c(handler: OpsHandler) -> tuple[int, bytes, str]:
    """Lane C: docker compose pull + force-recreate. Docker backend only."""
    backend, err = _backend_or_400()
    if err is not None:
        return err
    assert backend is not None

    if backend != "docker":
        return json_bytes(
            {
                "ok": False,
                "error": "lane_c_docker_only",
                "lane": "C",
                "backend": backend,
                "message": (
                    "Lane C requires OPS_BACKEND=docker (image pull/recreate). "
                    "Native/dev PC: rebuild binaries with scripts/build.sh instead."
                ),
            },
            400,
        )

    body = _read_json_body(handler)
    if body.get("confirm") is not True:
        return json_bytes(
            {
                "ok": False,
                "error": "confirm_required",
                "lane": "C",
                "hint": 'POST body must include {"confirm": true}',
            },
            400,
        )

    include_website = bool(body.get("includeWebsite") or body.get("website"))
    # Optional explicit services allowlist (subset of known)
    raw_services = body.get("services")
    if isinstance(raw_services, list) and raw_services:
        allowed = set(LANE_C_SERVICES_COMP) | set(LANE_C_SERVICES_WEBSITE)
        picked = [str(s).strip() for s in raw_services if str(s).strip() in allowed]
        if not picked:
            return json_bytes(
                {"ok": False, "error": "no_valid_services", "lane": "C"},
                400,
            )
        # If caller listed services explicitly, use that set via include flags
        include_website = "website" in picked
        # Always pull/recreate at least the game trio if any game service listed
        only_website = picked == ["website"]
        if only_website:
            ok, code, detail = run_compose(
                ["pull", "website"],
                timeout=600,
                ok_message="pulled website",
            )
            if not ok:
                return json_bytes(
                    {
                        "ok": False,
                        "error": code,
                        "lane": "C",
                        "backend": backend,
                        "detail": detail,
                        "services": ["website"],
                    },
                    502,
                )
            ok, code, detail2 = run_compose(
                ["up", "-d", "--force-recreate", "website"],
                timeout=180,
                ok_message="recreated website",
            )
            if not ok:
                return json_bytes(
                    {
                        "ok": False,
                        "error": code,
                        "lane": "C",
                        "backend": backend,
                        "detail": detail2,
                        "services": ["website"],
                    },
                    502,
                )
            return json_bytes(
                {
                    "ok": True,
                    "lane": "C",
                    "backend": backend,
                    "message": "Website image pulled and recreated",
                    "services": ["website"],
                    "detail": ((detail or "") + "\n" + (detail2 or "")).strip(),
                    **freshness_public(runtime_dir()),
                },
                200,
            )

    ok, code, detail, services = publish_lane_c_docker(
        include_website=include_website
    )
    if not ok:
        return json_bytes(
            {
                "ok": False,
                "error": code,
                "lane": "C",
                "backend": backend,
                "detail": detail,
                "services": services,
            },
            502,
        )

    mark_channel_restart(runtime_dir())
    message = (
        f"Pulled and recreated {', '.join(services)} — players should log back in"
    )
    return json_bytes(
        {
            "ok": True,
            "lane": "C",
            "backend": backend,
            "message": message,
            "services": services,
            "includeWebsite": include_website,
            "detail": detail,
            **freshness_public(runtime_dir()),
        },
        200,
    )


# (METHOD, path) → handler
ALLOWED: dict[tuple[str, str], Callable[["OpsHandler"], tuple[int, bytes, str]]] = {
    ("GET", "/health"): handle_health,
    ("POST", "/start"): handle_start,
    ("POST", "/stop"): handle_stop,
    ("POST", "/publish/lane-a"): handle_publish_lane_a,
    ("POST", "/publish/lane-a/validate"): handle_publish_lane_a_validate,
    ("POST", "/publish/lane-a/apply"): handle_publish_lane_a_apply,
    ("POST", "/publish/lane-a/rollback"): handle_publish_lane_a_rollback,
    ("POST", "/publish/lane-a-config/validate"): handle_publish_lane_a_config_validate,
    ("POST", "/publish/lane-a-config/apply"): handle_publish_lane_a_config_apply,
    ("POST", "/publish/lane-a-config/rollback"): handle_publish_lane_a_config_rollback,
    ("POST", "/publish/lane-b"): handle_publish_lane_b,
    ("POST", "/publish/lane-c"): handle_publish_lane_c,
    ("POST", "/ingest/zip"): handle_ingest_zip,
    ("GET", "/ingest/job"): handle_ingest_job,
    ("POST", "/restart/channel"): handle_restart_channel,
    ("POST", "/restart/services"): handle_restart_services,
}


class OpsHandler(BaseHTTPRequestHandler):
    server_version = "smt-ops/0.1"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes, ctype: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _dispatch(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path or "/"
        method = self.command.upper()
        expected = token()
        got = (self.headers.get("X-Ops-Token") or "").strip()
        actor = (self.headers.get("X-Ops-Actor") or "").strip() or None
        peer = self.client_address[0] if self.client_address else "?"

        if not expected or not tokens_equal(got, expected):
            audit(
                {
                    "peer": peer,
                    "actor": actor,
                    "method": method,
                    "path": path,
                    "status": 401,
                    "ok": False,
                    "reason": "unauthorized",
                }
            )
            status, body, ctype = json_bytes(
                {"ok": False, "error": "unauthorized"}, 401
            )
            self._send(status, body, ctype)
            return

        key = (method, path)
        handler = ALLOWED.get(key)
        if handler is None:
            allowed_methods = [m for (m, p) in ALLOWED if p == path]
            status_code = 405 if allowed_methods else 404
            reason = "method_not_allowed" if status_code == 405 else "not_allowed"
            audit(
                {
                    "peer": peer,
                    "actor": actor,
                    "method": method,
                    "path": path,
                    "status": status_code,
                    "ok": False,
                    "reason": reason,
                }
            )
            status, body, ctype = json_bytes(
                {"ok": False, "error": reason, "path": path}, status_code
            )
            self._send(status, body, ctype)
            return

        status, body, ctype = handler(self)
        audit(
            {
                "peer": peer,
                "actor": actor,
                "method": method,
                "path": path,
                "status": status,
                "ok": status < 400,
            }
        )
        self._send(status, body, ctype)

    def do_GET(self) -> None:
        self._dispatch()

    def do_POST(self) -> None:
        self._dispatch()

    def do_PUT(self) -> None:
        self._dispatch()


def main() -> None:
    load_ops_env()
    if not token():
        print("error: set OPS_TOKEN", file=sys.stderr)
        raise SystemExit(1)
    bind = env("OPS_BIND", "127.0.0.1") or "127.0.0.1"
    if bind not in ALLOWED_BIND:
        print(
            f"error: OPS_BIND={bind!r} refused (loopback only: 127.0.0.1)",
            file=sys.stderr,
        )
        raise SystemExit(1)
    port = int(env("OPS_PORT", "14710") or "14710")
    httpd = ThreadingHTTPServer((bind, port), OpsHandler)
    httpd.timeout = 600
    OpsHandler.timeout = 600
    print(
        f"ops sidecar {bind}:{port} backend={env('OPS_BACKEND', 'native') or 'native'} "
        f"audit={audit_path()}",
        flush=True,
    )
    verbs = sorted({p.lstrip("/") or p for (_m, p) in ALLOWED})
    print(f"verbs: {', '.join(verbs)}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped", flush=True)


if __name__ == "__main__":
    main()

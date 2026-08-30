"""Host and process metrics for the ops sidecar (AMP-like live strip).

Native: /proc/stat + /proc/meminfo + PID files / pgrep.
Docker: same host /proc (sidecar on host) + docker stats for game containers.
"""

from __future__ import annotations

import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

# (idle, total) from /proc/stat — used for host CPU delta
_host_cpu_prev: tuple[int, int] | None = None
# pid → (utime+stime, timestamp_monotonic)
_proc_cpu_prev: dict[int, tuple[int, float]] = {}

_NATIVE_SERVICES = (
    ("lobby", "comp_lobby"),
    ("world", "comp_world"),
    ("channel", "comp_channel"),
)

_DOCKER_CONTAINERS = (
    ("lobby", "smt-lobby"),
    ("world", "smt-world"),
    ("channel", "smt-channel"),
)


def _read_proc_stat() -> tuple[int, int] | None:
    try:
        with open("/proc/stat", encoding="utf-8") as fh:
            line = fh.readline()
    except OSError:
        return None
    parts = line.split()
    if not parts or parts[0] != "cpu" or len(parts) < 5:
        return None
    try:
        nums = [int(x) for x in parts[1:8]]
    except ValueError:
        return None
    while len(nums) < 7:
        nums.append(0)
    idle = nums[3] + nums[4]  # idle + iowait
    total = sum(nums)
    return idle, total


def host_cpu_percent(*, wait_ms: int = 100) -> float | None:
    """CPU % since last sample; first call waits briefly so a value is available."""
    global _host_cpu_prev
    sample = _read_proc_stat()
    if sample is None:
        return None
    if _host_cpu_prev is None:
        _host_cpu_prev = sample
        time.sleep(max(wait_ms, 1) / 1000.0)
        sample = _read_proc_stat()
        if sample is None:
            return None
    prev_idle, prev_total = _host_cpu_prev
    idle, total = sample
    _host_cpu_prev = sample
    dt_total = total - prev_total
    if dt_total <= 0:
        return None
    dt_idle = idle - prev_idle
    pct = 100.0 * (1.0 - (dt_idle / dt_total))
    return round(max(0.0, min(100.0, pct)), 1)


def host_memory() -> dict[str, int] | None:
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return None
    vals: dict[str, int] = {}
    for key in ("MemTotal", "MemAvailable", "MemFree", "Buffers", "Cached"):
        m = re.search(rf"^{key}:\s+(\d+)\s+kB", text, re.M)
        if m:
            vals[key] = int(m.group(1)) * 1024
    total = vals.get("MemTotal")
    if not total:
        return None
    available = vals.get("MemAvailable")
    if available is None:
        available = (
            vals.get("MemFree", 0)
            + vals.get("Buffers", 0)
            + vals.get("Cached", 0)
        )
    used = max(0, total - available)
    return {
        "memTotalBytes": total,
        "memAvailableBytes": available,
        "memUsedBytes": used,
    }


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _read_pid_file(path: Path) -> int | None:
    try:
        raw = path.read_text(encoding="utf-8").strip()
        pid = int(raw.split()[0])
    except (OSError, ValueError, IndexError):
        return None
    return pid if _pid_alive(pid) else None


def _pgrep_binary(binary: Path) -> int | None:
    if not binary.is_file():
        return None
    try:
        r = subprocess.run(
            ["pgrep", "-f", str(binary)],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    for line in (r.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            pid = int(line)
        except ValueError:
            continue
        if _pid_alive(pid):
            return pid
    return None


def _proc_rss_bytes(pid: int) -> int | None:
    try:
        with open(f"/proc/{pid}/status", encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return None
    m = re.search(r"^VmRSS:\s+(\d+)\s+kB", text, re.M)
    if not m:
        return None
    return int(m.group(1)) * 1024


def _proc_cpu_ticks(pid: int) -> int | None:
    try:
        with open(f"/proc/{pid}/stat", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError:
        return None
    # comm may contain spaces/parens — split after last ')'
    try:
        rest = raw[raw.rindex(")") + 1 :].split()
        utime = int(rest[11])
        stime = int(rest[12])
    except (ValueError, IndexError):
        return None
    return utime + stime


def _proc_cpu_percent(pid: int) -> float | None:
    ticks = _proc_cpu_ticks(pid)
    if ticks is None:
        return None
    now = time.monotonic()
    prev = _proc_cpu_prev.get(pid)
    _proc_cpu_prev[pid] = (ticks, now)
    if prev is None:
        return None
    prev_ticks, prev_t = prev
    dt = now - prev_t
    if dt <= 0:
        return None
    try:
        clk = int(os.sysconf("SC_CLK_TCK"))
    except (ValueError, OSError, AttributeError):
        clk = 100
    if clk <= 0:
        clk = 100
    delta_ticks = ticks - prev_ticks
    if delta_ticks < 0:
        return None
    pct = 100.0 * (delta_ticks / clk) / dt
    return round(max(0.0, pct), 1)


def _native_processes(comp_root: Path) -> list[dict[str, Any]]:
    run_dir = Path(os.environ.get("OPS_RUN_DIR", "")).expanduser() if os.environ.get("OPS_RUN_DIR") else comp_root / ".run"
    bin_dir = Path(os.environ.get("OPS_BIN_DIR", "")).expanduser() if os.environ.get("OPS_BIN_DIR") else comp_root / "build-current" / "bin"
    out: list[dict[str, Any]] = []
    for label, binary_name in _NATIVE_SERVICES:
        pid = _read_pid_file(run_dir / f"{binary_name}.pid")
        if pid is None:
            pid = _pgrep_binary(bin_dir / binary_name)
        row: dict[str, Any] = {
            "name": label,
            "running": pid is not None,
            "pid": pid,
        }
        if pid is not None:
            row["rssBytes"] = _proc_rss_bytes(pid)
            row["cpuPercent"] = _proc_cpu_percent(pid)
        else:
            row["rssBytes"] = None
            row["cpuPercent"] = None
        out.append(row)
    return out


def _parse_docker_mem(usage: str) -> tuple[int | None, int | None]:
    """Parse '123.4MiB / 1.955GiB' → (used, limit) bytes."""
    parts = [p.strip() for p in usage.split("/", 1)]
    if len(parts) != 2:
        return None, None

    def one(s: str) -> int | None:
        m = re.match(r"^([\d.]+)\s*([KMGT]?i?B)$", s, re.I)
        if not m:
            return None
        n = float(m.group(1))
        unit = m.group(2).lower()
        mult = {
            "b": 1,
            "kib": 1024,
            "kb": 1000,
            "mib": 1024**2,
            "mb": 1000**2,
            "gib": 1024**3,
            "gb": 1000**3,
            "tib": 1024**4,
            "tb": 1000**4,
        }.get(unit)
        if mult is None:
            return None
        return int(n * mult)

    return one(parts[0]), one(parts[1])


def _parse_docker_cpu(s: str) -> float | None:
    s = (s or "").strip().rstrip("%")
    try:
        return round(float(s), 1)
    except ValueError:
        return None


def _docker_inspect_states(names: list[str]) -> dict[str, dict[str, Any]]:
    """Map container name → status / exit / error / health (best-effort)."""
    if not names:
        return {}
    try:
        r = subprocess.run(
            [
                "docker",
                "inspect",
                "--format",
                "{{.Name}}\t{{.State.Status}}\t{{.State.ExitCode}}\t"
                "{{.State.Error}}\t{{if .State.Health}}{{.State.Health.Status}}"
                "{{else}}-{{end}}",
                *names,
            ],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return {}

    out: dict[str, dict[str, Any]] = {}
    for line in (r.stdout or "").splitlines():
        cols = line.split("\t")
        if len(cols) < 4:
            continue
        raw_name, status, exit_s, err = cols[0], cols[1], cols[2], cols[3]
        health = cols[4] if len(cols) > 4 else "-"
        cname = raw_name.lstrip("/")
        try:
            exit_code = int(exit_s)
        except ValueError:
            exit_code = None
        out[cname] = {
            "status": (status or "").strip().lower() or "unknown",
            "exitCode": exit_code,
            "stateError": (err or "").strip(),
            "health": None if health in {"", "-"} else health.strip().lower(),
        }
    return out


def _process_error_from_inspect(info: dict[str, Any] | None) -> str | None:
    if not info:
        return "container missing"
    status = info.get("status") or "unknown"
    if status == "running":
        health = info.get("health")
        if health == "unhealthy":
            return "healthcheck failing"
        if health == "starting":
            return "healthcheck starting"
        return None
    if status in {"restarting", "dead"}:
        err = info.get("stateError") or ""
        code = info.get("exitCode")
        bits = [status]
        if code not in (None, 0):
            bits.append(f"exit {code}")
        if err:
            bits.append(err[:160])
        return " — ".join(bits)
    if status == "exited":
        code = info.get("exitCode")
        err = info.get("stateError") or ""
        if code in (None, 0) and not err:
            return None  # clean stop → offline, not error
        bits = ["exited"]
        if code not in (None, 0):
            bits.append(f"exit {code}")
        if err:
            bits.append(err[:160])
        return " — ".join(bits)
    if status in {"created", "paused", "removing"}:
        return status
    return status


def _docker_processes() -> list[dict[str, Any]]:
    names = [c for _, c in _DOCKER_CONTAINERS]
    inspect = _docker_inspect_states(names)
    try:
        r = subprocess.run(
            [
                "docker",
                "stats",
                "--no-stream",
                "--format",
                "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}",
                *names,
            ],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return [
            {
                "name": label,
                "running": False,
                "pid": None,
                "rssBytes": None,
                "cpuPercent": None,
                "container": cname,
                "status": (inspect.get(cname) or {}).get("status"),
                "error": "docker_stats_failed",
            }
            for label, cname in _DOCKER_CONTAINERS
        ]

    by_name: dict[str, dict[str, Any]] = {}
    for line in (r.stdout or "").splitlines():
        cols = line.split("\t")
        if len(cols) < 3:
            continue
        cname, cpu_s, mem_s = cols[0], cols[1], cols[2]
        used, _limit = _parse_docker_mem(mem_s)
        by_name[cname] = {
            "cpuPercent": _parse_docker_cpu(cpu_s),
            "rssBytes": used,
            "running": True,
        }

    out: list[dict[str, Any]] = []
    for label, cname in _DOCKER_CONTAINERS:
        info = inspect.get(cname)
        hit = by_name.get(cname)
        err = _process_error_from_inspect(info)
        running = bool(hit) or (info or {}).get("status") == "running"
        # Prefer stats presence for true "up"; inspect can lag briefly.
        if hit:
            running = True
            # Unhealthy still counts as running but with error (orange in UI).
            if (info or {}).get("health") == "unhealthy":
                err = err or "healthcheck failing"
            elif (info or {}).get("health") == "starting":
                err = err or "healthcheck starting"
            else:
                err = None
        row: dict[str, Any] = {
            "name": label,
            "running": running,
            "pid": None,
            "rssBytes": hit.get("rssBytes") if hit else None,
            "cpuPercent": hit.get("cpuPercent") if hit else None,
            "container": cname,
            "status": (info or {}).get("status")
            or ("running" if running else "offline"),
        }
        if err:
            row["error"] = err
        out.append(row)
    return out


def collect_metrics(
    *,
    backend: str,
    comp_root: Path,
) -> dict[str, Any]:
    backend = (backend or "native").lower()
    mem = host_memory() or {}
    cpu = host_cpu_percent()
    if backend == "docker":
        processes = _docker_processes()
    else:
        processes = _native_processes(comp_root)

    return {
        "ok": True,
        "backend": backend,
        "host": {
            "cpuPercent": cpu,
            "memUsedBytes": mem.get("memUsedBytes"),
            "memTotalBytes": mem.get("memTotalBytes"),
            "memAvailableBytes": mem.get("memAvailableBytes"),
        },
        "processes": processes,
    }

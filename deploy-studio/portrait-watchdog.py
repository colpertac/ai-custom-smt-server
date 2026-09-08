#!/usr/bin/env python3
"""Poll studio health; detect login screen; auto-relog; Discord on failure.

Flow per watched role (default vam1,vaf1):
  1. If in-world (studio health) → clear timers; idle-nudge windows
  2. If offline for PORTRAIT_WATCH_OFFLINE_SEC:
       snap → classify (login / character_select / in_world / black / …)
       if login or character_select → credentials + Start Game (no new launch)
       if black → kill + orch restart that role
       if still offline after retries → Discord alert (website webhook API
       and/or PORTRAIT_DISCORD_WEBHOOK)

Env:
  PORTRAIT_STUDIO_URL / PORTRAIT_STUDIO_TOKEN
  PORTRAIT_QUEUE_URL          website base for /api/portrait/alert
  PORTRAIT_WORKER_TOKEN       worker auth (or studio token)
  PORTRAIT_DISCORD_WEBHOOK    optional direct Discord (fallback)
  PORTRAIT_WATCH              comma list (default vam1,vaf1)
  PORTRAIT_WATCH_INTERVAL     poll seconds (default 30)
  PORTRAIT_WATCH_OFFLINE_SEC  offline before recover (default 45)
  PORTRAIT_WATCH_RELOG_TRIES  relog/restart attempts before Discord (default 2)
  PORTRAIT_WATCH_RECOVER      1/0 enable auto-relog/restart (default 1)

Examples:
  ./studio up                 # backgrounds this watchdog
  python portrait-watchdog.py --once
  python portrait_screen_detect.py --self-test
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from portrait_common import (  # noqa: E402
    WORK_DIR,
    debug_snap,
    ensure_display,
    kill_role_client,
    load_portrait_env,
    nudge_mannequin_windows,
    queue_base_url,
    resolve_mannequin_window,
    worker_token,
)
from portrait_screen_detect import classify_image  # noqa: E402

STUDIO_URL = os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700")
STUDIO_TOKEN = os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
WEBHOOK = os.environ.get("PORTRAIT_DISCORD_WEBHOOK", "").strip()
WATCH = [
    x.strip()
    for x in os.environ.get("PORTRAIT_WATCH", "vam1,vaf1").split(",")
    if x.strip()
]
INTERVAL = float(os.environ.get("PORTRAIT_WATCH_INTERVAL", "30"))
OFFLINE_SEC = float(os.environ.get("PORTRAIT_WATCH_OFFLINE_SEC", "45"))
RELOG_TRIES = int(os.environ.get("PORTRAIT_WATCH_RELOG_TRIES", "2"))
RECOVER = os.environ.get("PORTRAIT_WATCH_RECOVER", "1").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
STATE_PATH = WORK_DIR / "watchdog-state.json"
LOGIN_PY = HERE / "portrait-login.py"


def resolve_paths() -> None:
    global STATE_PATH, STUDIO_URL, STUDIO_TOKEN, WEBHOOK, WATCH
    global INTERVAL, OFFLINE_SEC, RELOG_TRIES, RECOVER
    STUDIO_URL = os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700")
    STUDIO_TOKEN = os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    WEBHOOK = os.environ.get("PORTRAIT_DISCORD_WEBHOOK", "").strip()
    WATCH = [
        x.strip()
        for x in os.environ.get("PORTRAIT_WATCH", "vam1,vaf1").split(",")
        if x.strip()
    ]
    INTERVAL = float(os.environ.get("PORTRAIT_WATCH_INTERVAL", "30"))
    OFFLINE_SEC = float(os.environ.get("PORTRAIT_WATCH_OFFLINE_SEC", "45"))
    RELOG_TRIES = int(os.environ.get("PORTRAIT_WATCH_RELOG_TRIES", "2"))
    RECOVER = os.environ.get("PORTRAIT_WATCH_RECOVER", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    custom = os.environ.get("PORTRAIT_WATCH_STATE", "").strip()
    STATE_PATH = Path(custom) if custom else WORK_DIR / "watchdog-state.json"


sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


@dataclass
class Slot:
    name: str
    offline_since: float | None = None
    alerted: bool = False
    relog_attempts: int = 0
    last_screen: str | None = None


@dataclass
class WatchState:
    slots: dict[str, Slot] = field(default_factory=dict)

    def slot(self, name: str) -> Slot:
        if name not in self.slots:
            self.slots[name] = Slot(name=name)
        return self.slots[name]


def load_state() -> WatchState:
    st = WatchState()
    if not STATE_PATH.is_file():
        return st
    try:
        raw = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return st
    for name, obj in (raw.get("slots") or {}).items():
        st.slots[name] = Slot(
            name=name,
            offline_since=obj.get("offline_since"),
            alerted=bool(obj.get("alerted")),
            relog_attempts=int(obj.get("relog_attempts") or 0),
            last_screen=obj.get("last_screen"),
        )
    return st


def save_state(st: WatchState) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "slots": {
            n: {
                "offline_since": s.offline_since,
                "alerted": s.alerted,
                "relog_attempts": s.relog_attempts,
                "last_screen": s.last_screen,
            }
            for n, s in st.slots.items()
        }
    }
    STATE_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def studio_health() -> dict:
    url = f"{STUDIO_URL.rstrip('/')}/studio/health"
    cmd = ["curl", "-sS", "-m", "8"]
    if STUDIO_TOKEN:
        cmd += ["-H", f"X-Studio-Token: {STUDIO_TOKEN}"]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, text=True, timeout=15)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
        return {"ok": False, "error": f"studio unreachable: {e}"}
    try:
        return json.loads(out) if out.strip() else {"ok": False, "error": "empty"}
    except json.JSONDecodeError:
        return {"ok": False, "error": f"bad json: {out[:120]}"}


def is_online(health: dict, name: str) -> bool:
    if name in health:
        return bool(health[name])
    if name.endswith("1") and name[:-1] in health:
        return bool(health[name[:-1]])
    return False


def alert_website(*, title: str, message: str, role: str, screen: str) -> bool:
    token = worker_token()
    if not token:
        return False
    url = f"{queue_base_url()}/api/portrait/alert"
    body = json.dumps(
        {
            "title": title,
            "message": message,
            "role": role,
            "screen": screen,
            "severity": "error",
        }
    )
    try:
        code = subprocess.check_output(
            [
                "curl",
                "-sS",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}",
                "-X",
                "POST",
                "-H",
                f"X-Portrait-Worker-Token: {token}",
                "-H",
                "Content-Type: application/json",
                "-d",
                body,
                url,
            ],
            text=True,
            timeout=20,
        ).strip()
        return code in {"200", "201"}
    except (OSError, subprocess.CalledProcessError):
        return False


def alert_discord_direct(content: str) -> bool:
    if not WEBHOOK.startswith("https://discord.com/api/webhooks/"):
        return False
    body = json.dumps({"content": content[:1900]})
    try:
        code = subprocess.check_output(
            [
                "curl",
                "-sS",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}",
                "-X",
                "POST",
                "-H",
                "Content-Type: application/json",
                "-H",
                "User-Agent: portrait-watchdog/1.1",
                "-d",
                body,
                WEBHOOK,
            ],
            text=True,
            timeout=20,
        ).strip()
        return code in {"200", "204"}
    except (OSError, subprocess.CalledProcessError):
        return False


def send_alert(
    *,
    title: str,
    message: str,
    role: str,
    screen: str,
) -> None:
    ok_web = alert_website(
        title=title, message=message, role=role, screen=screen
    )
    ok_direct = alert_discord_direct(f"**{title}**\n{message}")
    print(
        f"alert role={role}: website={'ok' if ok_web else 'skip/fail'} "
        f"direct={'ok' if ok_direct else 'skip/fail'}"
    )


def try_relog(role: str) -> bool:
    """Credentials + Start Game on existing window (no new client launch)."""
    wid = resolve_mannequin_window(role)
    if not wid:
        print(f"{role}: no pinned window — cannot relog in place", file=sys.stderr)
        return False
    env = os.environ.copy()
    env[f"PORTRAIT_WINDOW_{role.upper()}"] = wid
    for step in ("--credentials-only", "--start-only"):
        cmd = [sys.executable, str(LOGIN_PY), role, "--window", wid, step]
        print(f"$ {' '.join(cmd)}")
        try:
            subprocess.check_call(cmd, cwd=str(HERE), env=env, timeout=180)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            print(f"{role}: relog step {step} failed: {e}", file=sys.stderr)
            return False
        if step == "--credentials-only":
            time.sleep(float(os.environ.get("PORTRAIT_ORCH_CHAR_SELECT_SEC", "3")))
    # wait briefly for in-world
    deadline = time.time() + float(
        os.environ.get("PORTRAIT_WATCH_ONLINE_WAIT", "45")
    )
    while time.time() < deadline:
        health = studio_health()
        if is_online(health, role):
            print(f"{role}: relog success — in-world")
            return True
        time.sleep(2.0)
    print(f"{role}: relog finished but still offline", file=sys.stderr)
    return False


def try_restart_role(role: str) -> bool:
    """Kill hung GL client and orch-up that role alone (black-screen recovery)."""
    orch = HERE / "portrait-orch.py"
    if not orch.is_file():
        print(f"{role}: missing portrait-orch.py", file=sys.stderr)
        return False
    try:
        ensure_display()
        kill_role_client(role)
    except Exception as e:
        print(f"{role}: kill before restart failed: {e}", file=sys.stderr)
    time.sleep(1.0)
    cmd = [sys.executable, str(orch), "up", "--roles", role]
    print(f"$ {' '.join(cmd)}")
    try:
        subprocess.check_call(cmd, cwd=str(HERE), timeout=300)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"{role}: restart orch failed: {e}", file=sys.stderr)
        return False
    health = studio_health()
    if is_online(health, role):
        print(f"{role}: restart success — in-world")
        return True
    print(f"{role}: restart finished but still offline", file=sys.stderr)
    return False


def classify_role(role: str) -> dict:
    path = debug_snap(role, "watchdog", upload=True)
    if not path or not path.is_file():
        return {"kind": "unknown", "confidence": 0.0, "error": "no snap"}
    result = classify_image(path, use_ocr=True)
    result["path"] = str(path)
    print(
        f"{role}: screen={result.get('kind')} "
        f"conf={result.get('confidence')} path={path.name}"
    )
    return result


def tick(st: WatchState, *, now: float | None = None) -> None:
    now = time.time() if now is None else now
    try:
        ensure_display(recover=False)
    except Exception:
        pass
    # Keep Wine GL from idling out while mannequins are online.
    try:
        nudge_mannequin_windows()
    except Exception as e:
        print(f"idle nudge: {e}", file=sys.stderr)

    health = studio_health()
    if not health.get("ok") and "error" in health:
        print(f"health error: {health.get('error')}")
        online_map = {n: False for n in WATCH}
        studio_down = True
    else:
        online_map = {n: is_online(health, n) for n in WATCH}
        studio_down = False

    for name in WATCH:
        slot = st.slot(name)
        online = online_map[name]
        if online:
            if slot.alerted:
                send_alert(
                    title=f"Mannequin {name} back online",
                    message="Studio health reports in-world again.",
                    role=name,
                    screen="in_world",
                )
            slot.offline_since = None
            slot.alerted = False
            slot.relog_attempts = 0
            slot.last_screen = "in_world"
            print(f"{name}: online")
            continue

        # No client window → nothing to recover; don't timer/alert.
        if not resolve_mannequin_window(name):
            if slot.offline_since is not None:
                print(f"{name}: offline but no window — idle")
            slot.offline_since = None
            slot.relog_attempts = 0
            continue

        if slot.offline_since is None:
            slot.offline_since = now
            print(f"{name}: offline (timer started)")
            save_state(st)
            continue

        elapsed = now - slot.offline_since
        print(f"{name}: offline ({elapsed:.0f}s)")
        if elapsed < OFFLINE_SEC:
            continue

        # Recover path
        classified = classify_role(name)
        kind = str(classified.get("kind") or "unknown")
        slot.last_screen = kind

        if kind == "in_world":
            # Health lag — give studio a moment
            print(f"{name}: snap looks in-world; waiting for health")
            continue

        if kind == "server_down":
            # Channel/lobby restart — credentials won't help until servers are up.
            if not slot.alerted:
                send_alert(
                    title=f"Mannequin {name}: server disconnect UI",
                    message=(
                        "Client shows the red disconnect dialog (server-down). "
                        "Fix/restart lobby-world-channel, then Kill + Start clients "
                        "or wait for auto-relog after channel is healthy."
                    ),
                    role=name,
                    screen=kind,
                )
                slot.alerted = True
            continue

        # Hung GL / blank frame — relog won't help; kill + relaunch.
        if kind == "black":
            if RECOVER and slot.relog_attempts < RELOG_TRIES:
                slot.relog_attempts += 1
                print(
                    f"{name}: black screen — restart "
                    f"{slot.relog_attempts}/{RELOG_TRIES}"
                )
                save_state(st)
                if try_restart_role(name):
                    slot.offline_since = None
                    slot.relog_attempts = 0
                    slot.alerted = False
                continue
            if not slot.alerted:
                send_alert(
                    title=f"Mannequin {name}: black screen",
                    message=(
                        f"Client frame is black after {slot.relog_attempts}/"
                        f"{RELOG_TRIES} restart attempt(s). "
                        "Use Admin → Restart on that role."
                    ),
                    role=name,
                    screen=kind,
                )
                slot.alerted = True
            continue

        needs_login = kind in {"login", "character_select", "unknown"}
        if RECOVER and needs_login and slot.relog_attempts < RELOG_TRIES:
            slot.relog_attempts += 1
            print(
                f"{name}: attempting relog "
                f"{slot.relog_attempts}/{RELOG_TRIES} (screen={kind})"
            )
            save_state(st)
            if try_relog(name):
                slot.offline_since = None
                slot.relog_attempts = 0
                slot.alerted = False
                continue
            continue

        if not slot.alerted and (
            slot.relog_attempts >= RELOG_TRIES or not RECOVER
        ):
            why = (
                "studio API unreachable"
                if studio_down
                else f"screen={kind}; relog failed or disabled"
            )
            send_alert(
                title=f"Mannequin {name} offline",
                message=(
                    f"Offline ≥{int(OFFLINE_SEC)}s. {why}. "
                    f"Attempts={slot.relog_attempts}/{RELOG_TRIES}. "
                    "Check Admin → Studio debug snaps / Start clients."
                ),
                role=name,
                screen=kind,
            )
            slot.alerted = True

    save_state(st)


def main() -> None:
    global WEBHOOK, WATCH, INTERVAL, OFFLINE_SEC, STUDIO_URL, STUDIO_TOKEN
    global RELOG_TRIES, RECOVER

    load_portrait_env()
    resolve_paths()

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--test", action="store_true", help="Send a test alert")
    ap.add_argument("--once", action="store_true", help="One tick then exit")
    ap.add_argument(
        "--force-offline-alert",
        action="store_true",
        help="With --once: pretend OFFLINE_SEC already elapsed",
    )
    ap.add_argument(
        "--self-test-detect",
        action="store_true",
        help="Run screen classifier self-test on refs/",
    )
    args = ap.parse_args()

    if args.self_test_detect:
        from portrait_screen_detect import self_test

        raise SystemExit(self_test())

    if args.test:
        send_alert(
            title="portrait-watchdog test",
            message=f"Webhook OK — watching {', '.join(WATCH)}",
            role="test",
            screen="n/a",
        )
        print("test alert attempted")
        return

    st = load_state()
    if args.force_offline_alert:
        for name in WATCH:
            s = st.slot(name)
            s.offline_since = time.time() - OFFLINE_SEC - 1
            s.alerted = False
            s.relog_attempts = RELOG_TRIES
        save_state(st)

    if args.once:
        tick(st)
        return

    print(
        f"watchdog studio={STUDIO_URL} watch={WATCH} "
        f"interval={INTERVAL}s offline_sec={OFFLINE_SEC} "
        f"recover={RECOVER} relog_tries={RELOG_TRIES} state={STATE_PATH}"
    )
    while True:
        try:
            tick(st)
        except SystemExit:
            raise
        except Exception as e:
            print(f"tick error: {e}", file=sys.stderr)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()

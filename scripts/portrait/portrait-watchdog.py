#!/usr/bin/env python3
"""Poll channel /studio/health; Discord webhook when mannequins go offline.

Env:
  PORTRAIT_DISCORD_WEBHOOK   required (Discord incoming webhook URL)
  PORTRAIT_STUDIO_URL        default http://127.0.0.1:14700
  PORTRAIT_STUDIO_TOKEN      studio X-Studio-Token
  PORTRAIT_WATCH             comma list (default vam1 — add vaf1 when ready)
  PORTRAIT_WATCH_INTERVAL    poll seconds (default 30)
  PORTRAIT_WATCH_OFFLINE_SEC must stay offline this long before alert (default 60)

Examples:
  export PORTRAIT_DISCORD_WEBHOOK='https://discord.com/api/webhooks/…'
  npm run portrait-watchdog -- --test          # one Discord ping
  npm run portrait-watchdog -- --once          # one health check + maybe alert
  npm run portrait-watchdog                    # loop forever
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

STUDIO_URL = os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700")
STUDIO_TOKEN = os.environ.get(
    "PORTRAIT_STUDIO_TOKEN", "dev-studio-token-change-me"
)
WEBHOOK = os.environ.get("PORTRAIT_DISCORD_WEBHOOK", "").strip()
WATCH = [
    x.strip()
    for x in os.environ.get("PORTRAIT_WATCH", "vam1").split(",")
    if x.strip()
]
INTERVAL = float(os.environ.get("PORTRAIT_WATCH_INTERVAL", "30"))
OFFLINE_SEC = float(os.environ.get("PORTRAIT_WATCH_OFFLINE_SEC", "60"))
STATE_PATH = Path(
    os.environ.get(
        "PORTRAIT_WATCH_STATE",
        str(
            Path(__file__).resolve().parents[2]
            / "work"
            / "portrait-captures"
            / "watchdog-state.json"
        ),
    )
)

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def load_dotenv_local() -> None:
    """Load scripts/portrait/.env (and optional website/.env.local)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from portrait_common import load_portrait_env

    load_portrait_env()


@dataclass
class Slot:
    name: str
    offline_since: float | None = None
    alerted: bool = False


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
        raw = json.loads(STATE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return st
    for name, obj in (raw.get("slots") or {}).items():
        st.slots[name] = Slot(
            name=name,
            offline_since=obj.get("offline_since"),
            alerted=bool(obj.get("alerted")),
        )
    return st


def save_state(st: WatchState) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "slots": {
            n: {"offline_since": s.offline_since, "alerted": s.alerted}
            for n, s in st.slots.items()
        }
    }
    STATE_PATH.write_text(json.dumps(payload, indent=2) + "\n")


def studio_health() -> dict:
    url = f"{STUDIO_URL.rstrip('/')}/studio/health"
    cmd = [
        "curl",
        "-sS",
        "-H",
        f"X-Studio-Token: {STUDIO_TOKEN}",
        url,
    ]
    try:
        out = subprocess.check_output(cmd, text=True, timeout=15)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        return {"ok": False, "error": f"studio unreachable: {e}"}
    try:
        return json.loads(out) if out.strip() else {"ok": False, "error": "empty"}
    except json.JSONDecodeError:
        return {"ok": False, "error": f"bad json: {out[:120]}"}


def is_online(health: dict, name: str) -> bool:
    # Prefer exact key; fall back to short aliases (vam1 → vam).
    if name in health:
        return bool(health[name])
    if name.endswith("1") and name[:-1] in health:
        return bool(health[name[:-1]])
    return False


def discord_send(content: str) -> None:
    if not WEBHOOK:
        die("PORTRAIT_DISCORD_WEBHOOK is not set")
    if "…" in WEBHOOK or any(ord(c) > 127 for c in WEBHOOK):
        die(
            "PORTRAIT_DISCORD_WEBHOOK looks like a placeholder "
            "(contains … or non-ASCII). Paste the full Discord webhook URL "
            "into website/.env.local — not the docs ellipsis."
        )
    if not WEBHOOK.startswith("https://discord.com/api/webhooks/"):
        die(
            "PORTRAIT_DISCORD_WEBHOOK must start with "
            "https://discord.com/api/webhooks/"
        )
    body = json.dumps({"content": content[:1900]})
    # curl avoids urllib default UA getting CF 1010 from Discord's edge.
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
                "User-Agent: portrait-watchdog/1.0",
                "-d",
                body,
                WEBHOOK,
            ],
            text=True,
            timeout=20,
        ).strip()
    except subprocess.CalledProcessError as e:
        die(f"discord webhook curl failed: {e}")
    except FileNotFoundError:
        req = urllib.request.Request(
            WEBHOOK,
            data=body.encode(),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "portrait-watchdog/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            die(f"discord webhook HTTP {e.code}: {e.read()[:200]!r}")
        except urllib.error.URLError as e:
            die(f"discord webhook failed: {e}")
        return
    if code not in ("200", "204"):
        die(f"discord webhook HTTP {code}")


def tick(st: WatchState, *, now: float | None = None) -> None:
    now = time.time() if now is None else now
    health = studio_health()
    if not health.get("ok") and "error" in health:
        print(f"health error: {health.get('error')}")
        # Treat studio down as all watched offline.
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
                msg = f"✅ portrait mannequin **{name}** back online"
                print(msg)
                discord_send(msg)
            slot.offline_since = None
            slot.alerted = False
            print(f"{name}: online")
            continue

        if slot.offline_since is None:
            slot.offline_since = now
            print(f"{name}: offline (timer started)")
        else:
            elapsed = now - slot.offline_since
            print(f"{name}: offline ({elapsed:.0f}s)")
            if not slot.alerted and elapsed >= OFFLINE_SEC:
                why = (
                    "studio API unreachable"
                    if studio_down
                    else "not in-world (health false)"
                )
                msg = (
                    f"⚠️ portrait mannequin **{name}** offline "
                    f">={int(OFFLINE_SEC)}s — {why}"
                )
                print(msg)
                discord_send(msg)
                slot.alerted = True

    save_state(st)


def main() -> None:
    global WEBHOOK, WATCH, INTERVAL, OFFLINE_SEC, STUDIO_URL, STUDIO_TOKEN

    load_dotenv_local()
    WEBHOOK = os.environ.get("PORTRAIT_DISCORD_WEBHOOK", "").strip()
    WATCH = [
        x.strip()
        for x in os.environ.get("PORTRAIT_WATCH", "vam1").split(",")
        if x.strip()
    ]
    INTERVAL = float(os.environ.get("PORTRAIT_WATCH_INTERVAL", "30"))
    OFFLINE_SEC = float(os.environ.get("PORTRAIT_WATCH_OFFLINE_SEC", "60"))
    STUDIO_URL = os.environ.get("PORTRAIT_STUDIO_URL", STUDIO_URL)
    STUDIO_TOKEN = os.environ.get("PORTRAIT_STUDIO_TOKEN", STUDIO_TOKEN)

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--test",
        action="store_true",
        help="Send a test Discord message and exit",
    )
    ap.add_argument(
        "--once",
        action="store_true",
        help="One health poll (respects offline timer / state file)",
    )
    ap.add_argument(
        "--force-offline-alert",
        action="store_true",
        help="With --once: pretend OFFLINE_SEC already elapsed (for testing alerts)",
    )
    args = ap.parse_args()

    if not WEBHOOK:
        die(
            "set PORTRAIT_DISCORD_WEBHOOK (or add it to website/.env.local). "
            "Do not commit the URL."
        )

    if args.test:
        discord_send(
            "🔔 portrait-watchdog test — webhook OK "
            f"(watching: {', '.join(WATCH)})"
        )
        print("test message sent")
        return

    st = load_state()
    if args.force_offline_alert:
        for name in WATCH:
            s = st.slot(name)
            s.offline_since = time.time() - OFFLINE_SEC - 1
            s.alerted = False
        save_state(st)

    if args.once:
        tick(st)
        return

    print(
        f"watchdog studio={STUDIO_URL} watch={WATCH} "
        f"interval={INTERVAL}s offline_sec={OFFLINE_SEC} "
        f"state={STATE_PATH}"
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

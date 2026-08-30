#!/usr/bin/env python3
"""Path 1 portrait automation worker (approach B).

Claims a pending portrait job, dresses the online mannequin (look only),
holds S to face camera, screenshots, crops, and ingests.

One-time framing is `init-camera` (ensure-name + pose + Home/PageUp + hold S).
Jobs still hold S briefly — dress/title packets can leave facing wrong, and
soft nameplate hide leaves the short char name visible otherwise.
Jobs do **not** re-pose (@zone/@pos) — character-only hot-swap.

Camera zoom/pitch/facing are sticky until mannequin relog. After relog:
  reset-camera → init-camera (or portrait-orch up).

Prereqs:
  - channel Studio API (PORTRAIT_STUDIO_URL / PORTRAIT_STUDIO_TOKEN)
  - mannequin account logged in (vam1 male / vaf1 female)
  - website queue HTTP (PORTRAIT_QUEUE_URL + PORTRAIT_WORKER_TOKEN)
  - xdotool (for init-camera keys)

Examples:
  python3 portrait-worker.py init-camera vam1
  python3 portrait-worker.py once
  python3 portrait-worker.py loop --interval 10
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# Homelab = this folder only; monorepo may still have ../work under repo root.
try:
    from portrait_common import WORK_DIR as _WORK

    DEFAULT_OUT = Path(os.environ.get("PORTRAIT_OUT_DIR", str(_WORK / "captures")))
except Exception:
    DEFAULT_OUT = Path(
        os.environ.get("PORTRAIT_OUT_DIR", str(HERE / "work" / "captures"))
    )

CROP_SCRIPT = HERE / "portrait-crop-worker.py"

STUDIO_URL = os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700")
STUDIO_TOKEN = os.environ.get(
    "PORTRAIT_STUDIO_TOKEN", "dev-studio-token-change-me"
)
WINDOW_TITLE = os.environ.get("PORTRAIT_WINDOW_TITLE", "IMAGINE Version 1.666")
CROP_PRESET = os.environ.get("PORTRAIT_CROP_PRESET", "studio")
MANNEQUIN_M = os.environ.get("PORTRAIT_MANNEQUIN_M", "vam1")
MANNEQUIN_F = os.environ.get("PORTRAIT_MANNEQUIN_F", "vaf1")
SETTLE_SEC = float(os.environ.get("PORTRAIT_SETTLE_SEC", "0.8"))
HOLD_S_SEC = float(os.environ.get("PORTRAIT_HOLD_S_SEC", "2.0"))
# Wait after releasing S so walk/turn animation finishes (init-camera only).
AFTER_S_SEC = float(os.environ.get("PORTRAIT_AFTER_S_SEC", "1.0"))
# Skip studio pose during init-camera (already parked).
SKIP_INIT_POSE = os.environ.get("PORTRAIT_SKIP_INIT_POSE", "").strip() in (
    "1",
    "true",
    "yes",
)
# Camera zoom/pitch is sticky until relog. Persist across `once` runs
CAM_HOME_SEC = float(os.environ.get("PORTRAIT_CAM_HOME_SEC", "1.1"))
CAM_PGUP_SEC = float(os.environ.get("PORTRAIT_CAM_PGUP_SEC", "0.5"))
# After activating the Imagine window, wait before Home/PageUp (esp. 2nd client).
CAM_FOCUS_SEC = float(os.environ.get("PORTRAIT_CAM_FOCUS_SEC", "0.8"))
SKIP_CAM_INIT = os.environ.get("PORTRAIT_SKIP_CAM_INIT", "").strip() in (
    "1",
    "true",
    "yes",
)
CAMERA_STATE_PATH = Path(
    os.environ.get(
        "PORTRAIT_CAMERA_STATE",
        str(DEFAULT_OUT / "camera-ready.json"),
    )
)
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)


def refresh_env_constants() -> None:
    """Re-read URLs/tokens after load_portrait_env()."""
    global STUDIO_URL, STUDIO_TOKEN, WINDOW_TITLE, CROP_PRESET
    global MANNEQUIN_M, MANNEQUIN_F, CAMERA_STATE_PATH, DEFAULT_OUT
    STUDIO_URL = os.environ.get("PORTRAIT_STUDIO_URL", STUDIO_URL)
    STUDIO_TOKEN = os.environ.get("PORTRAIT_STUDIO_TOKEN", STUDIO_TOKEN)
    WINDOW_TITLE = os.environ.get("PORTRAIT_WINDOW_TITLE", WINDOW_TITLE)
    CROP_PRESET = os.environ.get("PORTRAIT_CROP_PRESET", CROP_PRESET)
    MANNEQUIN_M = os.environ.get("PORTRAIT_MANNEQUIN_M", MANNEQUIN_M)
    MANNEQUIN_F = os.environ.get("PORTRAIT_MANNEQUIN_F", MANNEQUIN_F)
    if os.environ.get("PORTRAIT_OUT_DIR", "").strip():
        DEFAULT_OUT = Path(os.environ["PORTRAIT_OUT_DIR"].strip())
    CAMERA_STATE_PATH = Path(
        os.environ.get(
            "PORTRAIT_CAMERA_STATE",
            str(DEFAULT_OUT / "camera-ready.json"),
        )
    )


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def queue_base() -> str:
    return (
        os.environ.get("PORTRAIT_QUEUE_URL", "").strip()
        or os.environ.get("PORTRAIT_WEBSITE_URL", "").strip()
        or "http://127.0.0.1:3500"
    ).rstrip("/")


def worker_token() -> str:
    return (
        os.environ.get("PORTRAIT_WORKER_TOKEN", "").strip()
        or os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    )


def curl_json(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{STUDIO_URL.rstrip('/')}{path}"
    cmd = ["curl", "-sS", "-X", method, "-H", f"X-Studio-Token: {STUDIO_TOKEN}"]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, text=True)
    except subprocess.CalledProcessError as e:
        die(f"studio HTTP failed: {e}")
    try:
        return json.loads(out) if out.strip() else {}
    except json.JSONDecodeError:
        die(f"studio non-JSON response: {out[:200]}")


def queue_json(
    method: str,
    path: str,
    *,
    body: dict | None = None,
) -> dict:
    """Call website /api/portrait/queue/* (apiOk envelope)."""
    token = worker_token()
    if not token:
        die("set PORTRAIT_WORKER_TOKEN or PORTRAIT_STUDIO_TOKEN for queue HTTP")
    url = f"{queue_base()}{path}"
    cmd = [
        "curl",
        "-sS",
        "-X",
        method,
        "-H",
        f"X-Portrait-Worker-Token: {token}",
        "-w",
        "\n%{http_code}",
    ]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, text=True)
    except subprocess.CalledProcessError as e:
        die(f"queue HTTP failed: {e}")
    lines = out.rsplit("\n", 1)
    raw = lines[0] if len(lines) == 2 else out
    code_s = lines[1] if len(lines) == 2 else "0"
    try:
        code = int(code_s.strip())
    except ValueError:
        code = 0
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        die(f"queue non-JSON (HTTP {code}): {raw[:300]}")
    if code >= 400 or not payload.get("success"):
        msg = payload.get("message") or payload.get("error") or raw[:300]
        die(f"queue {method} {path} HTTP {code}: {msg}")
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def claim_job() -> dict | None:
    data = queue_json("POST", "/api/portrait/queue/claim")
    if data.get("empty") or not data.get("job"):
        return None
    job_raw = data["job"]
    if not isinstance(job_raw, dict):
        die(f"claim: unexpected job payload: {job_raw!r}")
    fp = str(job_raw.get("fingerprint", "")).strip()
    name = str(job_raw.get("characterName", "")).strip()
    if not fp or not name:
        die(f"claim: missing fingerprint/characterName: {job_raw}")
    gender = int(job_raw.get("gender") or 0)
    hint = str(job_raw.get("mannequinHint") or "").strip().lower()
    mannequin = hint if hint in {MANNEQUIN_M.lower(), MANNEQUIN_F.lower(), "vam1", "vaf1"} else (
        MANNEQUIN_F if gender == 1 else MANNEQUIN_M
    )
    return {
        "fingerprint": fp,
        "characterName": name,
        "canonical": job_raw.get("canonical") or "",
        "gender": gender,
        "mannequin": mannequin,
        "payload": job_raw.get("payload"),
    }


def fail_job(fingerprint: str, reason: str) -> None:
    queue_json(
        "POST",
        "/api/portrait/queue/fail",
        body={"fingerprint": fingerprint, "error": reason[:500]},
    )
    print(f"failed {fingerprint}: {reason[:120]}")


def ingest(crop: Path, fingerprint: str) -> None:
    token = worker_token()
    if not token:
        die("set PORTRAIT_WORKER_TOKEN or PORTRAIT_STUDIO_TOKEN for queue HTTP")
    url = f"{queue_base()}/api/portrait/queue/ingest"
    cmd = [
        "curl",
        "-sS",
        "-X",
        "POST",
        "-H",
        f"X-Portrait-Worker-Token: {token}",
        "-F",
        f"fingerprint={fingerprint}",
        "-F",
        f"file=@{crop};type=image/png",
        "-w",
        "\n%{http_code}",
        url,
    ]
    try:
        out = subprocess.check_output(cmd, text=True)
    except subprocess.CalledProcessError as e:
        die(f"ingest failed: {e}")
    lines = out.rsplit("\n", 1)
    raw = lines[0] if len(lines) == 2 else out
    code_s = lines[1] if len(lines) == 2 else "0"
    try:
        code = int(code_s.strip())
    except ValueError:
        code = 0
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        die(f"ingest non-JSON (HTTP {code}): {raw[:300]}")
    if code >= 400 or not payload.get("success"):
        msg = payload.get("message") or payload.get("error") or raw[:300]
        die(f"ingest HTTP {code}: {msg}")
    print(json.dumps(payload.get("data") or payload, indent=2))


def find_windows() -> list[tuple[str, str]]:
    """Return list of (window_id_hex, title) matching Imagine."""
    if not shutil.which("wmctrl"):
        return []
    try:
        out = subprocess.check_output(["wmctrl", "-l"], text=True)
    except subprocess.CalledProcessError:
        return []
    hits: list[tuple[str, str]] = []
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        wid, _desk, _host, title = parts[0], parts[1], parts[2], parts[3]
        if WINDOW_TITLE in title:
            hits.append((wid, title))
    return hits


def resolve_window(mannequin: str) -> str:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from portrait_common import find_imagine_windows, resolve_mannequin_window

    pinned = resolve_mannequin_window(mannequin)
    if pinned:
        return pinned
    hits = find_imagine_windows()
    if not hits:
        die(
            f"no window titled '{WINDOW_TITLE}' — is the mannequin client open?"
        )
    if len(hits) > 1:
        env_key = f"PORTRAIT_WINDOW_{mannequin.upper()}"
        print(
            f"warning: {len(hits)} Imagine windows; using first {hits[0]}. "
            f"Run npm run portrait-orch -- up (or set {env_key}).",
            file=sys.stderr,
        )
    return hits[0]


def focus_window(wid: str) -> None:
    """Focus target client; minimize the other so keys don't go astray."""
    from portrait_common import focus_only_window

    focus_only_window(wid)


def _window_size(wid: str) -> tuple[int, int] | None:
    if not shutil.which("xdotool"):
        return None
    try:
        geom = subprocess.check_output(
            ["xdotool", "getwindowgeometry", "--shell", wid],
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    w = h = 0
    for line in geom.splitlines():
        if line.startswith("WIDTH="):
            w = int(line.split("=", 1)[1])
        elif line.startswith("HEIGHT="):
            h = int(line.split("=", 1)[1])
    if w <= 0 or h <= 0:
        return None
    return w, h


def click_void(wid: str) -> None:
    """Left-click empty studio void (not the character).

    A center click selects the mannequin and shows the self HP bar in the
    portrait. Corner of the client is empty void after pose.
    """
    size = _window_size(wid)
    if not size or not shutil.which("xdotool"):
        return
    w, h = size
    # Upper-left void — away from centered mannequin and bottom HUD.
    x = max(8, int(w * 0.06))
    y = max(8, int(h * 0.10))
    subprocess.run(
        [
            "xdotool",
            "mousemove",
            "--window",
            wid,
            str(x),
            str(y),
            "click",
            "1",
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.12)


def hold_key(key: str, seconds: float, wid: str | None = None) -> None:
    """Hold a key for in-game camera/movement.

    Prefer Wine ``SendInput`` (DirectInput sees it). xdotool XTEST often
    reaches login UI but not in-world DI — keep it only as fallback.
    """
    if wid:
        focus_window(wid)
        time.sleep(0.25)
        # Focus click must not hit the character (that shows the HP bar).
        click_void(wid)

    from portrait_common import wine_hold_key

    if wine_hold_key(key, seconds):
        return

    # Fallback: XTEST (often ignored by DirectInput).
    if not shutil.which("xdotool"):
        print(
            f"warning: no wine sendinput exe and no xdotool — skip hold {key}",
            file=sys.stderr,
        )
        time.sleep(min(seconds, 0.3))
        return
    print(
        f"warning: wine sendinput unavailable — xdotool fallback for {key}",
        file=sys.stderr,
    )
    subprocess.run(
        ["xdotool", "keydown", "--clearmodifiers", key],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(max(0.05, seconds))
    subprocess.run(
        ["xdotool", "keyup", "--clearmodifiers", key],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def load_camera_ready() -> set[str]:
    try:
        data = json.loads(CAMERA_STATE_PATH.read_text(encoding="utf-8"))
        ready = data.get("ready")
        if isinstance(ready, list):
            return {str(x) for x in ready}
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return set()


def save_camera_ready(ready: set[str]) -> None:
    CAMERA_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CAMERA_STATE_PATH.write_text(
        json.dumps({"ready": sorted(ready)}, indent=2) + "\n",
        encoding="utf-8",
    )


def mark_camera_ready(mannequin: str) -> None:
    ready = load_camera_ready()
    ready.add(mannequin)
    save_camera_ready(ready)


def clear_camera_ready(mannequin: str | None = None) -> None:
    if mannequin is None:
        if CAMERA_STATE_PATH.exists():
            CAMERA_STATE_PATH.unlink()
        return
    ready = load_camera_ready()
    ready.discard(mannequin)
    save_camera_ready(ready)


def hold_s(seconds: float, wid: str | None = None) -> None:
    """Hold S so the default behind-camera faces the character."""
    hold_key("s", seconds, wid)


def studio_pose(mannequin: str) -> None:
    data = curl_json("POST", "/studio/pose", {"mannequin": mannequin})
    if not data.get("ok"):
        die(f"studio pose failed: {data.get('error', data)}")
    print(f"posed {mannequin} in studio void")


def studio_ensure_name(mannequin: str) -> None:
    """Repair blank mannequin char name (vam1→vam, vaf1→vaf) via studio API."""
    data = curl_json("POST", "/studio/ensure-name", {"mannequin": mannequin})
    if not data.get("ok"):
        die(f"studio ensure-name failed: {data.get('error', data)}")
    name = data.get("name", "?")
    if data.get("repaired"):
        print(f"ensure-name {mannequin}: repaired → {name!r}")
    else:
        print(f"ensure-name {mannequin}: ok ({name!r})")


def init_camera(
    mannequin: str, wid: str | None = None, *, force: bool = False
) -> None:
    """Name check + (once) studio park + zoom/pitch + face camera.

    ensure-name always runs. pose → Home → PageUp → hold S is skipped if
    mannequin is already in camera-ready.json unless force=True.
    """
    studio_ensure_name(mannequin)

    if SKIP_CAM_INIT and not force:
        return
    ready = load_camera_ready()
    if not force and mannequin in ready:
        print(f"camera init {mannequin}: skip keys (already in {CAMERA_STATE_PATH.name})")
        return

    if not SKIP_INIT_POSE:
        studio_pose(mannequin)
        time.sleep(0.5)

    if wid is None:
        wid = resolve_window(mannequin)
    focus_window(wid)
    if CAM_FOCUS_SEC > 0:
        print(f"camera init {mannequin}: settle {CAM_FOCUS_SEC}s after focus…")
        time.sleep(CAM_FOCUS_SEC)
    print(
        f"camera init {mannequin}: Home {CAM_HOME_SEC}s, "
        f"PageUp {CAM_PGUP_SEC}s, S {HOLD_S_SEC}s"
    )
    hold_key("Home", CAM_HOME_SEC, wid)
    time.sleep(0.15)
    hold_key("Prior", CAM_PGUP_SEC, wid)
    time.sleep(0.3)
    hold_s(HOLD_S_SEC, wid)
    time.sleep(AFTER_S_SEC)
    # Deselect if a prior center-click left the self HP bar up.
    click_void(wid)
    mark_camera_ready(mannequin)
    print(f"camera init {mannequin}: marked ready in {CAMERA_STATE_PATH}")


def cmd_init_camera(args: argparse.Namespace) -> None:
    global SKIP_INIT_POSE
    if getattr(args, "skip_pose", False):
        SKIP_INIT_POSE = True
    mannequin = args.mannequin
    wid = resolve_window(mannequin)
    init_camera(mannequin, wid, force=True)
    print(f"framing ready for {mannequin} (wid={wid})")


def cmd_reset_camera(args: argparse.Namespace) -> None:
    """Clear persisted camera-ready flags after a mannequin relog."""
    if args.mannequin:
        clear_camera_ready(args.mannequin)
        print(f"cleared camera-ready for {args.mannequin}")
    else:
        clear_camera_ready(None)
        print(f"cleared {CAMERA_STATE_PATH}")
    print(
        "Relog the mannequin (or fix camera by hand), then run "
        "init-camera again."
    )

def screenshot_window(wid: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("import"):
        subprocess.check_call(["import", "-window", wid, str(dest)])
        return
    if shutil.which("scrot"):
        focus_window(wid)
        subprocess.check_call(["scrot", "-o", str(dest)])
        return
    die("need ImageMagick `import` or `scrot` to capture the window")


# Resolution-independent studio crop (matched from 1440×900 window vs
# Screenshot_20260814_221258_cropped.png — exact subimage MAD=0).
# left, top, right, bottom as fractions of window size.
STUDIO_FRAC = (0.310417, 0.114444, 0.711111, 0.994444)


def crop_one(src: Path, out_dir: Path, preset: str) -> Path:
    """Crop raw window shot to a single preset (default: fractional studio)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = src.stem
    dest = out_dir / f"{stem}__{preset}.png"

    # Fast path: fractional studio box (scales to any resolution).
    if preset == "studio":
        from PIL import Image

        im = Image.open(src)
        w, h = im.size
        l, t, r, b = STUDIO_FRAC
        left = max(0, min(w, int(round(w * l))))
        top = max(0, min(h, int(round(h * t))))
        right = max(0, min(w, int(round(w * r))))
        bottom = max(0, min(h, int(round(h * b))))
        im.convert("RGBA").crop((left, top, right, bottom)).save(dest, format="PNG")
        print(
            f"studio crop {w}x{h} → {right - left}x{bottom - top} "
            f"LRTB={left},{top},{right},{bottom}"
        )
        return dest

    subprocess.check_call(
        [
            sys.executable,
            str(CROP_SCRIPT),
            "crop",
            str(src),
            "--out",
            str(out_dir),
        ]
    )
    candidate = out_dir / f"{stem}__{preset}.png"
    if candidate.exists():
        return candidate
    for alt in ("studio", "focus-pad32", "center72-pad32", "striphud-pad32"):
        p = out_dir / f"{stem}__{alt}.png"
        if p.exists():
            print(
                f"warning: preset {preset} missing, using {alt}",
                file=sys.stderr,
            )
            return p
    matches = sorted(out_dir.glob(f"{stem}__*.png"))
    if not matches:
        die(f"no crop candidates for {src}")
    print(f"warning: using first crop {matches[0].name}", file=sys.stderr)
    return matches[0]


def cmd_health(_: argparse.Namespace) -> None:
    data = curl_json("GET", "/studio/health")
    print(json.dumps(data, indent=2))


def cmd_ensure_name(args: argparse.Namespace) -> None:
    studio_ensure_name(args.mannequin)


def cmd_preview(args: argparse.Namespace) -> None:
    """Screenshot mannequin window for admin remote check (crop optional)."""
    mannequin = args.mannequin.strip().lower()
    allowed = {
        MANNEQUIN_M.lower(),
        MANNEQUIN_F.lower(),
        "vam1",
        "vaf1",
        "vam",
        "vaf",
    }
    if mannequin not in allowed:
        die(f"preview mannequin must be one of {sorted(allowed)}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    wid = resolve_window(mannequin)
    focus_window(wid)
    time.sleep(0.25)

    raw = out_dir / f"preview-{mannequin}-raw.png"
    shot = out_dir / f"preview-{mannequin}.png"
    screenshot_window(wid, raw)
    if args.raw:
        shutil.copy2(raw, shot)
        print(f"preview raw {shot}")
    else:
        cropped = crop_one(raw, out_dir, CROP_PRESET)
        # crop_one names {stem}__{preset}.png — copy to stable preview path
        shutil.copy2(cropped, shot)
        print(f"preview crop {shot}  (from {cropped.name})")

    meta = {
        "mannequin": mannequin,
        "ts": time.time(),
        "iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "raw": str(raw),
        "path": str(shot),
        "wid": wid,
    }
    meta_path = out_dir / f"preview-{mannequin}.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta))


def cmd_dress(args: argparse.Namespace) -> None:
    body = {
        "mannequin": args.mannequin,
        "source": args.source,
        "pose": not args.no_pose,
        "plate": not args.hide_plate,
    }
    data = curl_json("POST", "/studio/dress", body)
    print(json.dumps(data, indent=2))
    if not data.get("ok"):
        raise SystemExit(1)


def restore_nameplate(mannequin: str) -> None:
    data = curl_json(
        "POST",
        "/studio/nameplate",
        {"mannequin": mannequin, "visible": True},
    )
    if not data.get("ok"):
        print(
            f"warn: nameplate restore failed: {data.get('error')}",
            file=sys.stderr,
        )
    else:
        print(f"nameplate restored on {mannequin}")


def cmd_nameplate(args: argparse.Namespace) -> None:
    visible = args.visible == "show"
    data = curl_json(
        "POST",
        "/studio/nameplate",
        {"mannequin": args.mannequin, "visible": visible},
    )
    print(json.dumps(data, indent=2))
    if not data.get("ok"):
        raise SystemExit(1)


def process_job(
    job: dict, out_dir: Path, *, hold_s_each_job: bool = True
) -> None:
    """Dress look → hold S (face cam) → settle → shot → ingest."""
    fp = job["fingerprint"]
    name = job["characterName"]
    mannequin = job["mannequin"]
    print(f"job {fp}  {name} → {mannequin}")

    plate_hidden = False
    try:
        dress = curl_json(
            "POST",
            "/studio/dress",
            {
                "mannequin": mannequin,
                "source": name,
                "pose": False,
                "plate": False,
            },
        )
        if not dress.get("ok"):
            reason = dress.get("error", "dress failed")
            fail_job(fp, str(reason))
            die(f"dress failed: {reason}")
        if dress.get("plate") is not False:
            die(
                "dress ignored plate:false — channel binary is likely stale. "
                "Rebuild/restart comp_channel so /studio/dress returns "
                f'"plate":false (got {dress!r})'
            )
        plate_hidden = True
        print("nameplate hidden for shot")

        time.sleep(SETTLE_SEC)
        wid = resolve_window(mannequin)
        focus_window(wid)
        if hold_s_each_job:
            print(f"hold S {HOLD_S_SEC}s (face camera)")
            hold_s(HOLD_S_SEC, wid)
            time.sleep(AFTER_S_SEC)
        else:
            time.sleep(0.2)
        # Clear target UI (self HP bar) before the portrait shot.
        click_void(wid)

        raw = out_dir / f"{fp}_raw.png"
        screenshot_window(wid, raw)
        print(f"shot {raw}")

        crop = crop_one(raw, out_dir, CROP_PRESET)
        print(f"crop {crop}  (preset={CROP_PRESET})")
        ingest(crop, fp)
        print(f"ready {fp}")
    finally:
        if plate_hidden:
            try:
                restore_nameplate(mannequin)
            except Exception as e:
                print(f"warn: nameplate restore: {e}", file=sys.stderr)


def cmd_once(args: argparse.Namespace) -> None:
    job = claim_job()
    if not job:
        print("Queue empty.")
        return
    process_job(
        job, Path(args.out), hold_s_each_job=not args.skip_keys
    )


def cmd_loop(args: argparse.Namespace) -> None:
    out = Path(args.out)
    hold = not args.skip_keys
    print(
        f"loop studio={STUDIO_URL} queue={queue_base()} crop={CROP_PRESET} "
        f"m={MANNEQUIN_M}/f={MANNEQUIN_F} interval={args.interval}s "
        f"job=dress+{'S' if hold else 'no-S'} (no re-pose)"
    )
    while True:
        job = claim_job()
        if job:
            try:
                process_job(job, out, hold_s_each_job=hold)
            except SystemExit:
                raise
            except Exception as e:
                fp = job.get("fingerprint")
                if fp:
                    try:
                        fail_job(fp, str(e))
                    except Exception:
                        pass
                print(f"error: {e}", file=sys.stderr)
        else:
            time.sleep(args.interval)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_h = sub.add_parser("health", help="GET /studio/health")
    p_h.set_defaults(func=cmd_health)

    p_en = sub.add_parser(
        "ensure-name",
        help="POST /studio/ensure-name (repair blank vam/vaf char name)",
    )
    p_en.add_argument("mannequin", nargs="?", default=MANNEQUIN_M)
    p_en.set_defaults(func=cmd_ensure_name)

    p_pv = sub.add_parser(
        "preview",
        help="Screenshot mannequin for admin remote check",
    )
    p_pv.add_argument("mannequin", nargs="?", default=MANNEQUIN_M)
    p_pv.add_argument("--out", default=str(DEFAULT_OUT))
    p_pv.add_argument(
        "--raw",
        action="store_true",
        help="Skip studio crop (full window)",
    )
    p_pv.set_defaults(func=cmd_preview)

    p_d = sub.add_parser("dress", help="POST /studio/dress (manual)")
    p_d.add_argument("mannequin")
    p_d.add_argument("source")
    p_d.add_argument("--no-pose", action="store_true")
    p_d.add_argument(
        "--hide-plate",
        action="store_true",
        help="Blank floating name/title for a clean shot (plate:false)",
    )
    p_d.set_defaults(func=cmd_dress)

    p_np = sub.add_parser(
        "nameplate",
        help="POST /studio/nameplate visible true|false",
    )
    p_np.add_argument("mannequin")
    p_np.add_argument(
        "visible",
        choices=("show", "hide"),
        help="show restores after hide; hide blanks name+title",
    )
    p_np.set_defaults(func=cmd_nameplate)

    p_c = sub.add_parser(
        "init-camera",
        help="Ensure-name + pose + Home/PageUp + hold S; mark framing ready",
    )
    p_c.add_argument("mannequin", nargs="?", default=MANNEQUIN_M)
    p_c.add_argument(
        "--skip-pose",
        action="store_true",
        help="Skip POST /studio/pose (already in void)",
    )
    p_c.set_defaults(func=cmd_init_camera)

    p_r = sub.add_parser(
        "reset-camera",
        help="Clear camera-ready state after mannequin relog (no keypress)",
    )
    p_r.add_argument(
        "mannequin",
        nargs="?",
        default=None,
        help="Clear one mannequin; omit to clear all",
    )
    p_r.set_defaults(func=cmd_reset_camera)

    p_o = sub.add_parser(
        "once", help="Claim one job: dress look → hold S → shot → ingest"
    )
    p_o.add_argument("--out", default=str(DEFAULT_OUT))
    p_o.add_argument(
        "--skip-keys",
        action="store_true",
        help="Skip per-job hold S (already facing camera)",
    )
    p_o.set_defaults(func=cmd_once)

    p_l = sub.add_parser(
        "loop", help="Poll queue: dress look → hold S → shot → ingest"
    )
    p_l.add_argument("--out", default=str(DEFAULT_OUT))
    p_l.add_argument("--interval", type=float, default=10.0)
    p_l.add_argument(
        "--skip-keys",
        action="store_true",
        help="Skip per-job hold S (already facing camera)",
    )
    p_l.set_defaults(func=cmd_loop)

    args = ap.parse_args()
    # Load .env before handlers (studio URL/token, hold-S knobs, etc.).
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from portrait_common import ensure_display, load_portrait_env

    load_portrait_env()
    refresh_env_constants()
    try:
        ensure_display()
    except SystemExit:
        pass
    args.func(args)


if __name__ == "__main__":
    main()

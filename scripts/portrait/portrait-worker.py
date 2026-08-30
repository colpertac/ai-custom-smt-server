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
  - channel Studio API on 127.0.0.1 (StudioHttpPort / StudioToken)
  - mannequin account logged in (vam1 male / vaf1 female — separate accounts)
  - website queue tools (npm run portrait-queue / portrait-fingerprint)
  - xdotool (for init-camera keys)

Examples:
  python3 scripts/portrait/portrait-worker.py init-camera vam1
  python3 scripts/portrait/portrait-worker.py once
  python3 scripts/portrait/portrait-worker.py loop --interval 10
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

ROOT = Path(__file__).resolve().parents[2]
WEBSITE = ROOT / "website"
CROP_SCRIPT = ROOT / "scripts" / "portrait" / "portrait-crop-worker.py"
DEFAULT_OUT = ROOT / "work" / "portrait-captures"

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
# (each npm invocation is a new process). See docs § Camera.
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


def die(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


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


def npm_portrait_queue(*args: str) -> str:
    cmd = ["npm", "run", "portrait-queue", "--", *args]
    try:
        return subprocess.check_output(
            cmd, cwd=str(WEBSITE), text=True, stderr=subprocess.STDOUT
        )
    except subprocess.CalledProcessError as e:
        die(f"portrait-queue {' '.join(args)} failed:\n{e.output}")


def claim_job() -> dict | None:
    out = npm_portrait_queue("claim")
    if "Queue empty" in out:
        return None
    job: dict = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("fingerprint"):
            job["fingerprint"] = line.split(None, 1)[1].strip()
        elif line.startswith("character"):
            job["characterName"] = line.split(None, 1)[1].strip()
        elif line.startswith("canonical"):
            job["canonical"] = line.split(None, 1)[1].strip()
    if "fingerprint" not in job or "characterName" not in job:
        die(f"could not parse claim output:\n{out}")
    gender = 0
    canon = job.get("canonical", "")
    for part in canon.split("|"):
        if part.startswith("g="):
            try:
                gender = int(part[2:])
            except ValueError:
                pass
    job["gender"] = gender
    job["mannequin"] = MANNEQUIN_F if gender == 1 else MANNEQUIN_M
    return job


def fail_job(fingerprint: str, reason: str) -> None:
    npm_portrait_queue("fail", fingerprint, reason)


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
    if shutil.which("wmctrl"):
        subprocess.run(["wmctrl", "-i", "-a", wid], check=False)
        time.sleep(0.25)
    if shutil.which("xdotool"):
        subprocess.run(["xdotool", "windowactivate", "--sync", wid], check=False)
        time.sleep(0.15)


def hold_key(key: str, seconds: float, wid: str | None = None) -> None:
    """Hold an xdotool key name (e.g. s, Home, Prior) for seconds."""
    if not shutil.which("xdotool"):
        print(
            f"warning: no xdotool — skip hold {key} "
            "(sudo apt install xdotool)",
            file=sys.stderr,
        )
        time.sleep(min(seconds, 0.3))
        return
    cmd_down = ["xdotool", "keydown"]
    cmd_up = ["xdotool", "keyup"]
    if wid:
        cmd_down += ["--window", wid]
        cmd_up += ["--window", wid]
    cmd_down.append(key)
    cmd_up.append(key)
    subprocess.run(cmd_down, check=False)
    time.sleep(seconds)
    subprocess.run(cmd_up, check=False)


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


def ingest(crop: Path, fingerprint: str) -> None:
    cmd = [
        "npm",
        "run",
        "portrait-queue",
        "--",
        "ingest",
        str(crop),
        fingerprint,
    ]
    try:
        out = subprocess.check_output(
            cmd, cwd=str(WEBSITE), text=True, stderr=subprocess.STDOUT
        )
    except subprocess.CalledProcessError as e:
        die(f"ingest failed:\n{e.output}")
    print(out.strip())


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
        f"loop studio={STUDIO_URL} crop={CROP_PRESET} "
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
    args.func(args)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Lightweight token handshake for website ↔ portrait PC (no Wine / clients).

Serves GET /health with X-Portrait-Worker-Token — same auth as the preview
agent, so Admin → Studio → Test connection can verify the worker token
without launching Imagine.

Also prints one-shot outbound checks (channel studio + website queue).

  ./studio ping              # check outbound, then listen
  ./studio ping --check-only # outbound checks only, then exit
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from portrait_common import load_portrait_env  # noqa: E402

DEFAULT_PORT = int(os.environ.get("PORTRAIT_PREVIEW_PORT", "14701"))


def worker_token() -> str:
    return (
        os.environ.get("PORTRAIT_WORKER_TOKEN", "").strip()
        or os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip()
    )


def studio_url() -> str:
    return os.environ.get("PORTRAIT_STUDIO_URL", "http://127.0.0.1:14700").rstrip(
        "/"
    )


def queue_url() -> str:
    return (
        os.environ.get("PORTRAIT_QUEUE_URL", "").strip()
        or os.environ.get("PORTRAIT_WEBSITE_URL", "").strip()
        or "http://127.0.0.1:3500"
    ).rstrip("/")


def curl_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict | str]:
    cmd = ["curl", "-sS", "-w", "\n%{http_code}", "-X", method, "--connect-timeout", "5", "--max-time", "10"]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    cmd.append(url)
    try:
        out = subprocess.check_output(cmd, text=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        return 0, str(e)[:400]
    lines = out.rsplit("\n", 1)
    raw = lines[0] if len(lines) == 2 else out
    try:
        code = int((lines[1] if len(lines) == 2 else "0").strip())
    except ValueError:
        code = 0
    try:
        return code, json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return code, raw[:400]


def run_outbound_checks() -> bool:
    token = worker_token()
    studio_tok = os.environ.get("PORTRAIT_STUDIO_TOKEN", "").strip() or token
    ok_all = True

    print("==> outbound checks (this PC → channel / website)")
    if not studio_tok:
        print("  FAIL  studio: PORTRAIT_STUDIO_TOKEN / WORKER_TOKEN unset")
        ok_all = False
    else:
        code, data = curl_json(
            "GET",
            f"{studio_url()}/studio/health",
            headers={"X-Studio-Token": studio_tok},
        )
        if code == 200 and isinstance(data, dict) and data.get("ok"):
            print(
                f"  OK    studio  vam1={data.get('vam1')} vaf1={data.get('vaf1')}  ({studio_url()})"
            )
        elif code == 401 or (isinstance(data, dict) and data.get("error") == "unauthorized"):
            print(f"  FAIL  studio token rejected ({studio_url()})")
            ok_all = False
        else:
            print(f"  FAIL  studio HTTP {code}: {data}")
            ok_all = False

    if not token:
        print("  FAIL  queue: no worker/studio token")
        ok_all = False
    else:
        code, data = curl_json(
            "GET",
            f"{queue_url()}/api/portrait/queue/health",
            headers={"X-Portrait-Worker-Token": token},
        )
        if code == 200 and isinstance(data, dict) and data.get("success"):
            q = (data.get("data") or {}).get("queue") or {}
            print(f"  OK    queue   {q}  ({queue_url()})")
        elif code == 401:
            print(f"  FAIL  queue token rejected ({queue_url()})")
            ok_all = False
        elif code == 0 and (
            "exit status 7" in str(data)
            or "Failed to connect" in str(data)
            or "Connection refused" in str(data)
        ):
            print(
                f"  FAIL  queue unreachable ({queue_url()})\n"
                f"         On this Wine PC, 127.0.0.1 is THIS machine — set "
                f"PORTRAIT_QUEUE_URL in .env to the website host, e.g.\n"
                f"           PORTRAIT_QUEUE_URL=http://192.168.0.40:3500"
            )
            ok_all = False
        else:
            print(f"  FAIL  queue HTTP {code}: {data}")
            ok_all = False

    return ok_all


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


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/health":
            if not check_auth(self):
                return
            body = json.dumps(
                {"ok": True, "service": "portrait-ping"}
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/":
            body = (
                b'portrait-ping: GET /health with header X-Portrait-Worker-Token\n'
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)


def listen(host: str, port: int) -> None:
    if not worker_token():
        raise SystemExit("set PORTRAIT_WORKER_TOKEN or PORTRAIT_STUDIO_TOKEN in .env")
    try:
        httpd = ThreadingHTTPServer((host, port), Handler)
    except OSError as e:
        if getattr(e, "errno", None) == 98 or "Address already in use" in str(e):
            print(
                f"error: port {port} already in use — something is already listening "
                f"(often a prior ./studio ping or preview-server).",
                file=sys.stderr,
            )
            print(
                "  ss -tlnp | grep "
                f"{port}   # see who\n"
                "  # if it's an old ping/preview: kill that pid, or leave it — "
                "Admin Test connection can use the existing listener\n"
                f"  # or: PORTRAIT_PREVIEW_PORT=14702 ./studio ping",
                file=sys.stderr,
            )
            raise SystemExit(2) from e
        raise
    print(
        f"==> listening on http://{host}:{port}/health  "
        f"(Admin Test connection → Preview URL)",
        flush=True,
    )
    print("    Ctrl+C to stop (no game clients)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped", flush=True)


def main() -> None:
    load_portrait_env()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check-only",
        action="store_true",
        help="Only run outbound studio/queue checks, then exit",
    )
    ap.add_argument(
        "--host",
        default=os.environ.get("PORTRAIT_PREVIEW_HOST", "0.0.0.0"),
    )
    ap.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
    )
    args = ap.parse_args()

    ok = run_outbound_checks()
    if args.check_only:
        raise SystemExit(0 if ok else 1)

    print()
    if not ok:
        print("note: outbound checks failed — listener still starts for inbound Test connection")
        print()
    listen(args.host.strip() or "0.0.0.0", args.port)


if __name__ == "__main__":
    main()

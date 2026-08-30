#!/usr/bin/env python3
"""HTTP preview agent for split deploy (Wine clients on this host).

Website admin Snap POSTs here; we screenshot the local Imagine window and
return PNG bytes. Run on the homelab next to the mannequin clients:

  ./portrait-cli preview-server
  # or: uv run python portrait-preview-agent.py

Website .env.local:
  PORTRAIT_PREVIEW_URL=http://192.168.0.230:14701
  PORTRAIT_WORKER_TOKEN=…   # same token the agent expects
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from portrait_common import ensure_display, load_portrait_env  # noqa: E402

WORKER = HERE / "portrait-worker.py"
DEFAULT_PORT = int(os.environ.get("PORTRAIT_PREVIEW_PORT", "14701"))


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


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/health":
            if not check_auth(self):
                return
            body = json.dumps({"ok": True, "service": "portrait-preview"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path != "/preview":
            self.send_error(404)
            return
        if not check_auth(self):
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_error(400, "invalid JSON")
            return
        mannequin = str(body.get("mannequin", "")).strip().lower()
        if mannequin in {"vam", "vaf"}:
            mannequin = "vam1" if mannequin == "vam" else "vaf1"
        if mannequin not in {"vam1", "vaf1"}:
            self.send_error(400, "mannequin must be vam1 or vaf1")
            return
        try:
            png, meta = run_preview(mannequin)
        except Exception as e:
            err = json.dumps({"ok": False, "error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)
            return
        meta_json = json.dumps(meta).encode()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(png)))
        self.send_header("X-Portrait-Preview-Meta", meta_json.decode("utf-8")[:900])
        self.end_headers()
        self.wfile.write(png)


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
        f"portrait preview agent on http://{host}:{port} "
        f"(POST /preview, GET /health; token required)",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye", flush=True)


if __name__ == "__main__":
    main()

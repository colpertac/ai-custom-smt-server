#!/usr/bin/env python3
"""Local COMP updater HTTP server with overlay-first /files/ routing."""

from __future__ import annotations

import argparse
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def load_config(repo_root: Path) -> dict[str, str]:
    cfg: dict[str, str] = {}
    config_path = repo_root / "updater" / "config.env"
    if not config_path.is_file():
        return cfg
    for line in config_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        cfg[key.strip()] = value.strip()
    return cfg


class UpdaterHandler(BaseHTTPRequestHandler):
    site_root: Path
    files_overlay: Path
    files_base: Path

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path.startswith("/files/"):
            self._serve_file(path[len("/files/") :])
            return
        if path in ("", "/"):
            path = "/index.html"
        self._serve_file(path.lstrip("/"), roots=(self.site_root,))

    def _serve_file(self, rel: str, roots: tuple[Path, ...] | None = None) -> None:
        rel = rel.lstrip("/")
        if ".." in rel.split("/"):
            self.send_error(400)
            return

        if roots is None:
            roots = (self.files_overlay, self.files_base)

        for root in roots:
            candidate = (root / rel).resolve()
            if not str(candidate).startswith(str(root.resolve())):
                self.send_error(403)
                return
            if candidate.is_file():
                data = candidate.read_bytes()
                ctype = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "must-revalidate, private, no-cache, no-store")
                self.send_header("X-Robots-Tag", "noindex, nofollow, nosnippet, noarchive")
                self.end_headers()
                self.wfile.write(data)
                return

        self.send_error(404, f"Not found: {rel}")


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    cfg = load_config(repo_root)

    updater_root = Path(cfg.get("UPDATER_ROOT", repo_root / "updater"))
    site_root = updater_root / "site"
    overlay = updater_root / "overlay"
    base = updater_root / "base"
    host = cfg.get("UPDATER_BIND", "127.0.0.1")
    port = int(cfg.get("UPDATER_PORT", "8765"))

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=host)
    parser.add_argument("--port", type=int, default=port)
    args = parser.parse_args()

    handler = type(
        "ConfiguredUpdaterHandler",
        (UpdaterHandler,),
        {
            "site_root": site_root,
            "files_overlay": overlay,
            "files_base": base,
        },
    )

    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Updater site:  http://{args.host}:{args.port}/")
    print(f"File root:     http://{args.host}:{args.port}/files/  (overlay -> base)")
    print(f"  overlay: {overlay}")
    print(f"  base:    {base}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()

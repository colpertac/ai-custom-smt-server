"""Render and write updater/site/index.html (ImagineUpdate Information page)."""

from __future__ import annotations

import html
from pathlib import Path
from urllib.parse import urlparse


def _validate_http_url(url: str) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return raw


def render_updater_site_index(
    *,
    title: str,
    website_url: str = "",
    server_label: str = "",
) -> str:
    title_esc = html.escape((title or "Private SMT").strip() or "Private SMT")
    website = _validate_http_url(website_url) or ""
    website_esc = html.escape(website) if website else ""
    server_esc = html.escape((server_label or "").strip())

    link_block = ""
    if website_esc:
        link_block = (
            f'  <p><a href="{website_esc}">Server website</a></p>\n'
        )

    server_block = ""
    if server_esc:
        server_block = f"  <p>Game server: <code>{server_esc}</code></p>\n"

    return (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n'
        "<head>\n"
        '  <meta charset="utf-8">\n'
        f"  <title>{title_esc} — updates</title>\n"
        "  <style>\n"
        "    body { font-family: system-ui, sans-serif; max-width: 40rem; "
        "margin: 2rem auto; line-height: 1.5; }\n"
        "    code { background: #f4f4f4; padding: 0.1em 0.35em; border-radius: 3px; }\n"
        "    a { color: #2563eb; }\n"
        "  </style>\n"
        "</head>\n"
        "<body>\n"
        f"  <h1>{title_esc} — client updates</h1>\n"
        "  <p>Client patches are served from <code>/files/</code> "
        "(overlay-first).</p>\n"
        f"{link_block}"
        f"{server_block}"
        "</body>\n"
        "</html>\n"
    )


def write_updater_site_index(
    updater: Path,
    *,
    title: str,
    website_url: str = "",
    server_label: str = "",
) -> tuple[Path, str | None]:
    """Write site/index.html. Return (path, error_code)."""
    if website_url.strip():
        valid = _validate_http_url(website_url)
        if valid is None:
            return updater / "site" / "index.html", "invalid_website_url"
        website_url = valid

    site_dir = updater / "site"
    try:
        site_dir.mkdir(parents=True, exist_ok=True)
        out = site_dir / "index.html"
        out.write_text(
            render_updater_site_index(
                title=title,
                website_url=website_url,
                server_label=server_label,
            ),
            encoding="utf-8",
        )
        return out, None
    except OSError as e:
        return site_dir / "index.html", f"write_failed:{e}"

"""Upsert custom CEventMessage rows into client Shield BinaryData + overlay.

Uses comp_decrypt / comp_bdpatch / comp_encrypt (BIN_DIR / OPS_*).
Writes updater/overlay/BinaryData/Shield/CEventMessageData2.sbin then rehashes.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from encrypt_tools import find_comp_tool
from rehash import run_comp_rehash

SMT_ROOT = Path(__file__).resolve().parent.parent.parent

# New project IDs live in Data2 (Data1 max ~1.2M; Data2 holds high IDs).
TARGET_SBIN = "CEventMessageData2.sbin"


def find_comp_bdpatch() -> Path | None:
    return find_comp_tool("comp_bdpatch", "OPS_BDPATCH")


def find_comp_decrypt() -> Path | None:
    return find_comp_tool("comp_decrypt", "OPS_DECRYPT")


def find_comp_encrypt_bin() -> Path | None:
    return find_comp_tool("comp_encrypt", "OPS_ENCRYPT")


def _run(cmd: list[str], *, timeout: int = 300) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        return False, f"timed out: {' '.join(cmd[:3])}"
    except OSError as e:
        return False, str(e)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()
        return False, detail[-1200:] or "command failed"
    return True, ""


def _escape_cdata(text: str) -> str:
    # ElementTree does not emit CDATA; bdpatch accepts plain text in elements.
    return text.replace("\x00", "")[:132]


def merge_ceventmessage_xml(xml_text: str, messages: list[dict]) -> str:
    """Upsert MiCEventMessageData rows by ID. Pure function for tests."""
    root = ET.fromstring(xml_text)
    if root.tag != "objects":
        raise ValueError("expected <objects> root")

    by_id: dict[int, ET.Element] = {}
    for obj in root.findall("object"):
        if obj.get("name") != "MiCEventMessageData":
            continue
        id_el = obj.find("./member[@name='ID']")
        if id_el is None or id_el.text is None:
            continue
        try:
            mid = int(id_el.text.strip())
        except ValueError:
            continue
        by_id[mid] = obj

    for msg in messages:
        mid = int(msg["id"])
        lines = [str(x) for x in msg.get("lines") or []]
        if not lines:
            lines = [str(mid)]
        lines = [_escape_cdata(x) for x in lines]

        existing = by_id.get(mid)
        if existing is not None:
            lines_member = existing.find("./member[@name='lines']")
            if lines_member is None:
                lines_member = ET.SubElement(existing, "member", name="lines")
            for child in list(lines_member):
                lines_member.remove(child)
            for line in lines:
                el = ET.SubElement(lines_member, "element")
                el.text = line
            continue

        obj = ET.SubElement(root, "object", name="MiCEventMessageData")
        id_member = ET.SubElement(obj, "member", name="ID")
        id_member.text = str(mid)
        lines_member = ET.SubElement(obj, "member", name="lines")
        for line in lines:
            el = ET.SubElement(lines_member, "element")
            el.text = line
        by_id[mid] = obj

    # Preserve XML declaration-ish formatting bdpatch accepts.
    body = ET.tostring(root, encoding="unicode")
    # ElementTree may self-close empty elements; ensure newlines for readability.
    body = re.sub(r"><", ">\n<", body)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{body}\n'


def locate_base_sbin(runtime: Path) -> Path | None:
    """Prefer live datastore Shield; fall back to overlay if already patched."""
    candidates = [
        runtime / "datastore" / "BinaryData" / "Shield" / TARGET_SBIN,
        runtime / "BinaryData" / "Shield" / TARGET_SBIN,
    ]
    for p in candidates:
        if p.is_file():
            return p
    return None


def upsert_ceventmessages(
    *,
    runtime: Path,
    updater: Path,
    messages: list[dict],
    rehash: bool = True,
    timeout: int = 600,
) -> tuple[bool, str, dict]:
    """
    Merge messages into CEventMessageData2, write overlay, optional rehash.
    messages: [{ "id": int, "lines": ["25"] }, ...]
    """
    if not messages:
        return True, "no messages", {"updated": 0, "rehashed": False}

    bdpatch = find_comp_bdpatch()
    decrypt = find_comp_decrypt()
    encrypt = find_comp_encrypt_bin()
    missing = [
        name
        for name, exe in (
            ("comp_bdpatch", bdpatch),
            ("comp_decrypt", decrypt),
            ("comp_encrypt", encrypt),
        )
        if exe is None
    ]
    if missing:
        return (
            False,
            "missing tools: "
            + ", ".join(missing)
            + "; install under deploy/ops-tools (BIN_DIR) — see ops/README.md",
            {},
        )

    base = locate_base_sbin(runtime)
    overlay_sbin = (
        updater / "overlay" / "BinaryData" / "Shield" / TARGET_SBIN
    )
    # Prefer existing overlay as base so repeated upserts accumulate.
    if overlay_sbin.is_file():
        base = overlay_sbin
    if base is None:
        return (
            False,
            f"missing {TARGET_SBIN}; upload BinaryData (first boot) first",
            {},
        )

    assert bdpatch and decrypt and encrypt

    with tempfile.TemporaryDirectory(prefix="ops-cevent-") as tmp:
        tmp_path = Path(tmp)
        plain_bin = tmp_path / "plain.bin"
        xml_path = tmp_path / "messages.xml"
        plain_out = tmp_path / "out.bin"
        enc_out = tmp_path / "out.sbin"

        ok, detail = _run(
            [str(decrypt), str(base), str(plain_bin)], timeout=timeout
        )
        if not ok:
            return False, f"decrypt failed: {detail}", {}

        ok, detail = _run(
            [
                str(bdpatch),
                "load",
                "ceventmessage",
                str(plain_bin),
                str(xml_path),
            ],
            timeout=timeout,
        )
        if not ok:
            return False, f"bdpatch load failed: {detail}", {}

        xml_text = xml_path.read_text(encoding="utf-8", errors="replace")
        try:
            merged = merge_ceventmessage_xml(xml_text, messages)
        except Exception as e:
            return False, f"merge failed: {e}", {}
        xml_path.write_text(merged, encoding="utf-8")

        ok, detail = _run(
            [
                str(bdpatch),
                "save",
                "ceventmessage",
                str(xml_path),
                str(plain_out),
            ],
            timeout=timeout,
        )
        if not ok:
            return False, f"bdpatch save failed: {detail}", {}

        ok, detail = _run(
            [str(encrypt), str(plain_out), str(enc_out)], timeout=timeout
        )
        if not ok:
            return False, f"encrypt failed: {detail}", {}

        overlay_sbin.parent.mkdir(parents=True, exist_ok=True)
        overlay_sbin.write_bytes(enc_out.read_bytes())

    rehashed = False
    if rehash:
        ok, code, detail = run_comp_rehash(updater)
        if not ok:
            return (
                False,
                f"overlay written but rehash failed ({code}): {detail}",
                {"updated": len(messages), "overlay": str(overlay_sbin)},
            )
        rehashed = True

    return (
        True,
        f"upserted {len(messages)} CEventMessage(s) → overlay",
        {
            "updated": len(messages),
            "overlay": str(overlay_sbin),
            "rehashed": rehashed,
            "ids": [int(m["id"]) for m in messages],
        },
    )

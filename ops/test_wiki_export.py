"""Unit tests for wiki_export payload builders (no BinaryData tools required)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from wiki_export import (
    build_enchants_payload,
    build_items_payload,
    destinations_include_binarydata,
    wiki_catalog_ready,
    wiki_dir,
)


class WikiExportTests(unittest.TestCase):
    def test_destinations_include_binarydata_kind(self):
        self.assertTrue(destinations_include_binarydata([], kind="binarydata"))
        self.assertFalse(destinations_include_binarydata([], kind="maps"))
        self.assertTrue(
            destinations_include_binarydata(
                ["/comp/datastore/BinaryData"], kind="content"
            )
        )
        self.assertFalse(
            destinations_include_binarydata(
                ["/comp/datastore/Map"], kind="content"
            )
        )

    def test_build_items_payload_from_tsv(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            (tmp_path / "ItemData.tsv").write_text(
                "id\tequipType\tweaponType\tgender\tbuyPrice\tsellPrice\tlevel\t"
                "durability\tstackSize\tcorrectTbl\n"
                "1\tEQUIP_TYPE_NONE\tNONE\t2\t10\t2\t0\t0\t600\t"
                "ID: STR, Type: 0, Value: 5\n",
                encoding="utf-8",
            )
            (tmp_path / "CItemData.tsv").write_text(
                "ID\tname\tdesc\ticon\n"
                "1\tOintment\tRestores HP.\t1\n",
                encoding="utf-8",
            )
            (tmp_path / "SItemData.tsv").write_text(
                "ID\ttokusei\n1\t{}\n",
                encoding="utf-8",
            )
            (tmp_path / "CIconData_Item.tsv").write_text(
                "ID\tvalue\n1\tI01_0001a\n",
                encoding="utf-8",
            )
            tokusei = tmp_path / "tokusei"
            tokusei.mkdir()

            payload = build_items_payload(tmp_path, tokusei)
            self.assertEqual(len(payload["items"]), 1)
            item = payload["items"][0]
            self.assertEqual(item["id"], 1)
            self.assertEqual(item["name"], "Ointment")
            self.assertEqual(item["iconAsset"], "I01_0001a")
            self.assertEqual(item["iconSrc"], "/wiki/icons/I01_0001a.png")
            self.assertEqual(item["basicFeatures"][0]["id"], "STR")
            self.assertEqual(item["basicFeatures"][0]["value"], 5)

    def test_build_enchants_payload_from_tsv(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            (tmp_path / "CItemData.tsv").write_text(
                "ID\tname\n100\tCrystal A\n",
                encoding="utf-8",
            )
            (tmp_path / "EnchantData.tsv").write_text(
                "5\t10\t100\t0\t1\t"
                "Tarot Name\tTarot desc\t0\t0\t0\t{}\t"
                "{ type: 0, { 0 }, { 0 }, { 0 }, { 0 } }\t"
                "Soul Name\tSoul desc\t0\t0\t0\t{}\t"
                "{ type: 0, { 0 }, { 0 }, { 0 }, { 0 } }\n",
                encoding="utf-8",
            )
            tokusei = tmp_path / "tokusei"
            tokusei.mkdir()

            payload = build_enchants_payload(
                tmp_path, tokusei, tmp_path / "CItemData.tsv"
            )
            self.assertIn("5", payload["enchants"])
            row = payload["enchants"]["5"]
            self.assertEqual(row["crystalItemId"], 100)
            self.assertEqual(row["sourceName"], "Crystal A")
            self.assertEqual(row["tarot"]["name"], "Tarot Name")

    def test_tokusei_partner_prefix(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            (tmp_path / "ItemData.tsv").write_text(
                "id\tequipType\tweaponType\tgender\tbuyPrice\tsellPrice\tlevel\t"
                "durability\tstackSize\tcorrectTbl\n"
                "29607\tEQUIP_TYPE_HEAD\tNONE\t2\t60\t1000\t0\t1\t1\t"
                "{ ID: PDEF, Type: 0, Value: 1 }, "
                "{ ID: COOLDOWN_TIME, Type: 1, Value: -5 }\n",
                encoding="utf-8",
            )
            (tmp_path / "CItemData.tsv").write_text(
                "ID\tname\tdesc\ticon\n"
                "29607\tSpirit Crystal Head\tMystery crystal.\t29607\n",
                encoding="utf-8",
            )
            (tmp_path / "SItemData.tsv").write_text(
                "ID\ttokusei\n"
                "29607\t{ 10 }, { 11 }, { 0 }\n",
                encoding="utf-8",
            )
            (tmp_path / "CIconData_Item.tsv").write_text(
                "ID\tvalue\n29607\tI33_0001a\n",
                encoding="utf-8",
            )
            tokusei = tmp_path / "tokusei"
            tokusei.mkdir()
            (tokusei / "tokusei_00000000.xml").write_text(
                """
<object name="Tokusei">
    <member name="ID">10</member>
    <member name="CorrectValues">
        <element>
            <object>
                <member name="ID">RATE_CLSR</member>
                <member name="Value">5</member>
                <member name="Type">1</member>
            </object>
        </element>
    </member>
</object>
<object name="Tokusei">
    <member name="ID">11</member>
    <member name="TargetType">PARTNER</member>
    <member name="CorrectValues">
        <element>
            <object>
                <member name="ID">COOLDOWN_TIME</member>
                <member name="Value">-5</member>
                <member name="Type">1</member>
            </object>
        </element>
    </member>
</object>
""",
                encoding="utf-8",
            )

            payload = build_items_payload(tmp_path, tokusei)
            item = payload["items"][0]
            self.assertEqual(item["basicFeatures"][0]["id"], "PDEF")
            self.assertEqual(item["characteristics"][0]["id"], "COOLDOWN_TIME")
            self.assertIn("Close-range damage +5%", item["setBonus"])
            self.assertIn("Partner's Skill cooldown -5%", item["setBonus"])
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            self.assertFalse(wiki_catalog_ready(tmp_path))
            out = wiki_dir(tmp_path)
            out.mkdir(parents=True)
            (out / "items.json").write_text(
                json.dumps(
                    {
                        "source": "t",
                        "namesSource": "t",
                        "generatedAt": "2026-01-01T00:00:00Z",
                        "note": "t",
                        "items": [{"id": 1}],
                    }
                ),
                encoding="utf-8",
            )
            self.assertTrue(wiki_catalog_ready(tmp_path))


if __name__ == "__main__":
    unittest.main()

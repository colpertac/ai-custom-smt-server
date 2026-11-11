"""Unit tests for wiki_export payload builders (no BinaryData tools required)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from wiki_export import (
    build_devils_payload,
    build_enchants_payload,
    build_items_payload,
    build_skills_payload,
    build_valuables_payload,
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

    def test_build_devils_payload_from_tsv(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            correct = ["{ 0 }"] * 126
            correct[0] = "{ 5 }"  # STR
            correct[6] = "{ 118 }"  # HP
            correct[7] = "{ 34 }"  # MP
            correct[28] = "{ 45 }"  # RES_SLASH
            correct[34] = "{ 90 }"  # RES_FIRE
            correct[35] = "{ -100 }"  # RES_ICE
            correct[57] = "{ 1003 }"  # NRA_FIRE absorb 100%
            (tmp_path / "DevilData.tsv").write_text(
                "ID\tname\tLNC\trace\tfamily\tgender\tbaseLevel\t"
                "baseDemonID\tgrowthType\tforceStack\t"
                "inheritanceType\tinheritanceRestrictions\t"
                "mitamaFusionID\tfusionDifficulty\t"
                "skills\ttraits\tenemyOnlySkills\tacquisitionSkills\tcorrect\n"
                "105\tPhoenix\t-8300\tAVIAN\tBIRD\tMALE\t36\t"
                "105\t72\t5\t"
                "12\t3199\t"
                "10105\t60\t"
                "{ 15 }, { 62 }, { 0 }\t"
                "{ 24004 }, { 21015 }, { 0 }\t"
                "{ 0 }, { 99 }\t"
                "{ ID: 201, level: 37 }, { ID: 0, level: 0 }\t"
                + ", ".join(correct)
                + "\n"
                "1001\tShadow\t5000\tFOUL\tFOUL\tNONE\t1\t"
                "1001\t0\t0\t"
                "0\t0\t"
                "0\t0\t"
                "{ 0 }\t{ 0 }\t{ 0 }\t"
                "{ ID: 0, level: 0 }\t"
                + ", ".join(["{ 0 }"] * 126)
                + "\n",
                encoding="utf-8",
            )
            payload = build_devils_payload(tmp_path / "DevilData.tsv")
            self.assertEqual(payload["names"]["105"], "Phoenix")
            self.assertEqual(payload["races"]["105"], "AVIAN")
            self.assertEqual(payload["raceIds"]["105"], 5)
            self.assertEqual(payload["families"]["105"], "BIRD")
            self.assertEqual(payload["genders"]["105"], "MALE")
            self.assertEqual(payload["lncs"]["105"], -8300)
            self.assertEqual(payload["levels"]["105"], 36)
            self.assertEqual(payload["stats"]["105"]["hp"], 118)
            self.assertEqual(payload["stats"]["105"]["str"], 5)
            self.assertEqual(payload["resists"]["105"]["slash"], "0.55")
            self.assertEqual(payload["resists"]["105"]["fire"], "dr")
            self.assertEqual(payload["resists"]["105"]["ice"], "2")
            self.assertEqual(payload["resists"]["105"]["elec"], "")
            self.assertEqual(payload["skills"]["105"], [15, 62])
            self.assertEqual(payload["traits"]["105"], [24004, 21015])
            self.assertEqual(
                payload["acquisitionSkills"]["105"],
                [{"id": 201, "level": 37}],
            )
            self.assertEqual(payload["enemyOnlySkills"]["105"], [99])
            self.assertEqual(payload["inheritanceTypes"]["105"], 12)
            self.assertEqual(payload["inheritanceRestrictions"]["105"], 3199)
            self.assertEqual(payload["mitamaFusionIds"]["105"], 10105)
            self.assertEqual(payload["fusionDifficulties"]["105"], 60)
            self.assertEqual(payload["growthTypes"]["105"], 72)
            self.assertEqual(payload["forceStacks"]["105"], 5)
            self.assertEqual(payload["raceIds"]["1001"], 101)
            self.assertNotIn("1001", payload["mitamaFusionIds"])
            self.assertEqual(
                payload["resistElems"][0:3], ["slash", "charge", "blunt"]
            )
            self.assertIn("magicforce", payload["resistElems"])
            self.assertIn("suicide", payload["resistElems"])
            self.assertIn("almighty", payload["resists"]["105"])
            self.assertIn("word", payload["resists"]["105"])

    def test_build_skills_payload_from_tsv(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            (tmp_path / "CSkillData.tsv").write_text(
                "ID\tname\tdesc\ticonID\n"
                "5473\tErosion Hex\tA curse that eats at enemies.\t15001\n"
                "5001\tAgi\tFire damage.\t15002\n"
                "2\tLife Bonus\tMAX HP +10%\t10002\n",
                encoding="utf-8",
            )
            (tmp_path / "CIconData_Skill.tsv").write_text(
                "ID\tvalue\n"
                "15001\ticon_SD01_hex\n"
                "15002\ticon_SD01_agi\n"
                "10002\ticon_SD01_0002a\n",
                encoding="utf-8",
            )
            (tmp_path / "SkillData.tsv").write_text(
                "id\tmainCategory\taffinity\tactionType\tcosts\t"
                "inheritanceRestriction\taddStatuses\tmodifier1\t"
                "dependencyType\tareaType\taoeRange\tchargeTime\t"
                "cooldownTime\tuseCount\tmodifier\tdistance\n"
                "5473\t1\t18\tSHOT\t"
                "{ type: MP, numType: NUMERIC, cost: 10, item: 0 }\t"
                "8\t"
                "{ statusID: 19, maxStack: 14, minStack: 10, onKnockback: 0, "
                "isReplace: false, successRate: 50 }, "
                "{ statusID: 11, maxStack: 14, minStack: 10, onKnockback: 0, "
                "isReplace: false, successRate: 45 }\t"
                "50\tSUPPORT\tSOURCE_RADIUS\t120\t1400\t10000\t1\t0\t0\n"
                "5001\t1\t8\tSHOT\t"
                "{ type: MP, numType: NUMERIC, cost: 10, item: 0 }\t"
                "8\t{}\t100\tSPELL\tNONE\t0\t0\t0\t1\t0\t0\n"
                "2\t0\t21\tNONE\t{}\t8\t{}\t0\tNONE\tNONE\t0\t0\t0\t0\t0\t0\n",
                encoding="utf-8",
            )
            (tmp_path / "CStatusData.tsv").write_text(
                "ID\tname\n"
                "19\tPoison\n"
                "11\tMuddle\n",
                encoding="utf-8",
            )
            (tmp_path / "DevilData.tsv").write_text(
                "ID\tname\tbaseDemonID\tskills\tacquisitionSkills\n"
                "603\tMother Harlot\t603\t"
                "{ 14 }, { 5473 }, { 254 }\t"
                "{ ID: 0, level: 0 }\n"
                "10603\tMother Harlot\t603\t"
                "{ 14 }, { 5473 }, { 254 }\t"
                "{ ID: 0, level: 0 }\n"
                "1228\tLucifuge\t1228\t"
                "{ 76 }, { 355 }\t"
                "{ ID: 5473, level: 92 }, { ID: 0, level: 0 }\n"
                "4673\tScarlet Illusion Mother Harlot\t603\t"
                "{ 14 }, { 53 }\t"
                "{ ID: 5473, level: 77 }, { ID: 0, level: 0 }\n",
                encoding="utf-8",
            )
            icons = tmp_path / "skill-icons"
            icons.mkdir()
            (icons / "icon_SD01_hex.png").write_bytes(b"png")
            (icons / "icon_SD01_agi.png").write_bytes(b"png")

            payload = build_skills_payload(
                tmp_path / "CSkillData.tsv",
                cicon_tsv=tmp_path / "CIconData_Skill.tsv",
                skill_tsv=tmp_path / "SkillData.tsv",
                cstatus_tsv=tmp_path / "CStatusData.tsv",
                devil_tsv=tmp_path / "DevilData.tsv",
                icons_dir=icons,
            )
            by_id = {s["id"]: s for s in payload["skills"]}
            hex_skill = by_id[5473]
            self.assertEqual(hex_skill["name"], "Erosion Hex")
            self.assertEqual(hex_skill["categoryLabel"], "Active")
            self.assertEqual(hex_skill["affinityKey"], "nerve")
            self.assertEqual(hex_skill["actionType"], "Shot")
            self.assertEqual(hex_skill["cost"], "10 MP")
            self.assertEqual(hex_skill["inheritance"], "Impossible")
            self.assertEqual(hex_skill["effectLabel"], "Poison (50%), Muddle (45%)")
            self.assertEqual(hex_skill["modifier"], 50)
            self.assertEqual(hex_skill["stat"], "Support")
            self.assertEqual(hex_skill["aoeType"], "Surroundings")
            self.assertEqual(hex_skill["aoeRange"], 120)
            self.assertEqual(hex_skill["incantation"], "1.4 seconds")
            self.assertEqual(hex_skill["cooldown"], "10 seconds")
            self.assertEqual(hex_skill["stack"], 1)
            self.assertEqual(hex_skill["knockback"], 0)
            learners = hex_skill["learnedBy"]
            names = {(e["name"], e["level"]) for e in learners}
            self.assertIn(("Mother Harlot", None), names)
            self.assertIn(("Lucifuge", 92), names)
            self.assertIn(("Scarlet Illusion Mother Harlot", 77), names)
            # Costume clone of Mother Harlot dropped
            self.assertEqual(
                sum(1 for e in learners if e["name"] == "Mother Harlot"), 1
            )
            self.assertEqual(by_id[5001]["affinityKey"], "fire")
            self.assertEqual(by_id[2]["categoryLabel"], "Passive")
            self.assertIsNone(by_id[2]["iconSrc"])

    def test_build_devils_payload_icons_from_cmodel_mesh(self):
        """Icons come from CModelData.model, not 17000+demonId."""
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            correct = ", ".join(["{ 0 }"] * 126)
            (tmp_path / "DevilData.tsv").write_text(
                "ID\tname\tLNC\trace\tbaseLevel\tbaseDemonID\tmodelID\tcorrect\n"
                f"567\tPyro Jack\t0\tFAIRY\t10\t567\t126\t{correct}\n"
                f"207\tOgre\t0\tJAKI\t5\t207\t69\t{correct}\n"
                f"9999\tNightmare Pyro Jack\t0\tFAIRY\t12\t567\t0\t{correct}\n",
                encoding="utf-8",
            )
            (tmp_path / "CModelData.tsv").write_text(
                "ID\ticonID\tmodel\n"
                "126\t17565\tD2_04_007a_Base\n"
                "69\t17208\tD1_10_007a_Base\n",
                encoding="utf-8",
            )
            # Misleading naive CIcon entries (old 17000+id mapping).
            (tmp_path / "CIconData_Devil.tsv").write_text(
                "ID\tvalue\n"
                "17567\ticon_D2_04_009a\n"
                "17207\ticon_D1_11_002a\n",
                encoding="utf-8",
            )
            icons = tmp_path / "icons"
            icons.mkdir()
            (icons / "icon_D2_04_007a.png").write_bytes(b"png")
            (icons / "icon_D1_10_007a.png").write_bytes(b"png")

            payload = build_devils_payload(
                tmp_path / "DevilData.tsv",
                cicon_tsv=tmp_path / "CIconData_Devil.tsv",
                cmodel_tsvs=[tmp_path / "CModelData.tsv"],
                icons_dir=icons,
            )
            self.assertEqual(payload["iconAssets"]["567"], "icon_D2_04_007a")
            self.assertEqual(payload["iconAssets"]["207"], "icon_D1_10_007a")
            self.assertEqual(
                payload["iconSrcs"]["567"], "/wiki/devil-icons/icon_D2_04_007a.png"
            )
            # Variant inherits stock icon via baseDemonID when it has no modelID.
            self.assertEqual(payload["iconAssets"]["9999"], "icon_D2_04_007a")
            self.assertEqual(payload["modelIds"]["567"], 126)

            # Own modelID that is missing from CModel must not inherit base icon.
            (tmp_path / "DevilData2.tsv").write_text(
                "ID\tname\tLNC\trace\tbaseLevel\tbaseDemonID\tmodelID\tcorrect\n"
                f"5398\tMusic Festival High Pixie\t0\tFAIRY\t12\t568\t985\t{correct}\n"
                f"568\tHigh Pixie\t0\tFAIRY\t10\t568\t127\t{correct}\n",
                encoding="utf-8",
            )
            (tmp_path / "CModelData2.tsv").write_text(
                "ID\ticonID\tmodel\n"
                "127\t17566\tD2_04_008a_Base\n"
                "985\t18291\tD2_04_014a_Base\n",
                encoding="utf-8",
            )
            payload2 = build_devils_payload(
                tmp_path / "DevilData2.tsv",
                cmodel_tsvs=[tmp_path / "CModelData2.tsv"],
            )
            self.assertEqual(
                payload2["iconAssets"]["5398"], "icon_D2_04_014a"
            )
            self.assertEqual(payload2["iconAssets"]["568"], "icon_D2_04_008a")

            payload3 = build_devils_payload(
                tmp_path / "DevilData2.tsv",
                # High Pixie model only — Music Festival model 985 missing.
                cmodel_tsvs=[tmp_path / "CModelData2.tsv"],
            )
            # Rewrite without 985 to assert no false base inheritance.
            (tmp_path / "CModelData3.tsv").write_text(
                "ID\ticonID\tmodel\n"
                "127\t17566\tD2_04_008a_Base\n",
                encoding="utf-8",
            )
            payload3 = build_devils_payload(
                tmp_path / "DevilData2.tsv",
                cmodel_tsvs=[tmp_path / "CModelData3.tsv"],
            )
            self.assertNotIn("5398", payload3["iconAssets"])
            self.assertEqual(payload3["iconAssets"]["568"], "icon_D2_04_008a")

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

    def test_build_valuables_payload_from_tsv(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp_path = Path(raw)
            (tmp_path / "CValuablesData.tsv").write_text(
                "ID\tsortOrder\tname\tdesc\thidden\n"
                "15\t1\tClass C DB License\tProof you are licensed.\t0\n"
                "222\t260\tWILDCAT\tOpens deep Makai.\t1\n",
                encoding="utf-8",
            )
            payload = build_valuables_payload(tmp_path / "CValuablesData.tsv")
            self.assertEqual(payload["source"], "BinaryData/Shield/CValuablesData.sbin")
            self.assertEqual(len(payload["valuables"]), 2)
            first = payload["valuables"][0]
            self.assertEqual(first["id"], 15)
            self.assertEqual(first["name"], "Class C DB License")
            self.assertEqual(first["sortOrder"], 1)
            self.assertFalse(first["hidden"])
            second = payload["valuables"][1]
            self.assertEqual(second["id"], 222)
            self.assertTrue(second["hidden"])


if __name__ == "__main__":
    unittest.main()

"""Unit tests for extract_quest_guides (synthetic event/zone XML, no BinaryData)."""

from __future__ import annotations

import tempfile
import textwrap
import unittest
from pathlib import Path

from extract_quest_guides import (
    MapGrid,
    build_guides_payload,
    load_events,
    load_zone_triggers,
)

ZONE_XML = """\
<objects>
  <object name="ServerZone">
    <member name="ID">100</member>
    <member name="NPCs">
      <element>
        <object name="ServerNPC">
          <member name="ID">7</member>
          <member name="Actions">
            <element><object name="ActionStartEvent">
              <member name="eventID">Z100_7</member>
            </object></element>
          </member>
        </object>
      </element>
    </member>
    <member name="Spawns">
      <pair><key>1</key><value><object name="Spawn">
        <member name="ID">1</member><member name="EnemyType">555</member>
      </object></value></pair>
    </member>
    <member name="SpawnGroups">
      <pair><key>3</key><value><object name="SpawnGroup">
        <member name="ID">3</member>
        <member name="Spawns"><pair><key>1</key><value>2</value></pair></member>
      </object></value></pair>
    </member>
    <member name="SpawnLocationGroups">
      <pair><key>9</key><value><object name="SpawnLocationGroup">
        <member name="ID">9</member>
        <member name="GroupIDs"><element>3</element></member>
      </object></value></pair>
    </member>
  </object>
</objects>
"""

# NPC 7 root: branch[0] "quest 42 not completed" → quest chain, else greeting.
# The greeting also reaches the start event via a shortcut; the guide must
# not route through it, because a player on quest 42 never sees the greeting.
EVENTS_XML = """\
<objects>
  <object name="Event">
    <member name="ID">Z100_7</member>
    <member name="next">Z100_7_GREET</member>
    <member name="branches">
      <element><object>
        <member name="next">Z100_7_Q42</member>
        <member name="conditions"><element><object name="EventCondition">
          <member name="type">QUEST_COMPLETE</member>
          <member name="value1">42</member><member name="value2">0</member>
        </object></element></member>
      </object></element>
    </member>
  </object>
  <object name="EventPerformActions">
    <member name="ID">Z100_7_GREET</member>
    <member name="next">Z100_7_Q42_START</member>
  </object>
  <object name="EventNPCMessage">
    <member name="ID">Z100_7_Q42</member>
    <member name="next">Z100_7_Q42_ASK</member>
    <member name="messageIDs"><element>1001</element></member>
  </object>
  <object name="EventPrompt">
    <member name="ID">Z100_7_Q42_ASK</member>
    <member name="messageID">1001</member>
    <member name="choices">
      <element><object name="EventChoice">
        <member name="messageID">1002</member>
        <member name="next">Z100_7_Q42_PHASE</member>
      </object></element>
    </member>
  </object>
  <object name="Event">
    <member name="ID">Z100_7_Q42_PHASE</member>
    <member name="next">Z100_7_Q42_START</member>
    <member name="branches">
      <element><object>
        <member name="next">Z100_7_Q42_FIGHT</member>
        <member name="conditions"><element><object name="EventCondition">
          <member name="type">QUEST_PHASE</member>
          <member name="value1">42</member><member name="value2">0</member>
        </object></element></member>
      </object></element>
      <element><object>
        <member name="next">Z100_7_Q42_DONE</member>
        <member name="conditions"><element><object name="EventCondition">
          <member name="type">QUEST_PHASE</member>
          <member name="value1">42</member><member name="value2">1</member>
        </object></element></member>
      </object></element>
    </member>
  </object>
  <object name="EventPerformActions">
    <member name="ID">Z100_7_Q42_START</member>
    <member name="actions"><element><object name="ActionUpdateQuest">
      <member name="questID">42</member>
    </object></element></member>
  </object>
  <object name="EventPerformActions">
    <member name="ID">Z100_7_Q42_FIGHT</member>
    <member name="actions"><element><object name="ActionSpawn">
      <member name="spawnLocationGroupIDs"><element>9</element></member>
      <member name="defeatActions"><element><object name="ActionStartEvent">
        <member name="eventID">Z100_Q42_WON</member>
      </object></element></member>
    </object></element></member>
  </object>
  <object name="EventPerformActions">
    <member name="ID">Z100_Q42_WON</member>
    <member name="actions"><element><object name="ActionUpdateQuest">
      <member name="questID">42</member><member name="phase">1</member>
    </object></element></member>
  </object>
  <object name="EventPerformActions">
    <member name="ID">Z100_7_Q42_DONE</member>
    <member name="actions">
      <element><object name="ActionAddRemoveItems">
        <member name="items">
          <pair><key>231</key><value>3</value></pair>
          <pair><key>5216</key><value>-1</value></pair>
        </member>
      </object></element>
      <element><object name="ActionGrantXP">
        <member name="XP">5000</member><member name="targetType">CHARACTER</member>
      </object></element>
      <element><object name="ActionUpdateQuest">
        <member name="questID">42</member><member name="phase">-1</member>
      </object></element>
    </member>
  </object>
</objects>
"""


class QuestGuideTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        (root / "events").mkdir()
        (root / "zones").mkdir()
        (root / "events" / "zone_events-100.xml").write_text(EVENTS_XML)
        (root / "zones" / "zone-100.xml").write_text(ZONE_XML)
        triggers, spawn_data = load_zone_triggers(root)
        self.payload = build_guides_payload(
            quests=[
                {"id": 42, "zoneID": 100},
                {"id": 43, "zoneID": 100, "startConditions": [
                    {"clauses": [{"type": "QUEST_COMPLETE", "value1": 42, "value2": 1}]}
                ]},
            ],
            events=load_events(root),
            triggers=triggers,
            spawn_data=spawn_data,
            npc_names={7: "Guard"},
            zone_names={100: "Home"},
            messages={1001: ["Can you help?"], 1002: ["Sure."]},
        )
        self.guide = self.payload["byQuestId"]["42"]

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_start_follows_the_in_progress_branch(self):
        (start,) = self.guide["start"]
        self.assertEqual(start["trigger"], {"kind": "npc", "zoneID": 100, "npcId": 7})
        self.assertEqual(start["choices"], ["Sure."])
        self.assertEqual(
            start["dialogue"],
            [{"who": "npc", "text": "Can you help?"}, {"who": "you", "text": "Sure."}],
        )

    def test_phase_from_spawn_location_defeat(self):
        ((step,),) = self.guide["phases"]
        self.assertEqual(step["phase"], 1)
        self.assertEqual(
            step["fights"], [{"zoneID": 100, "enemies": [{"type": 555, "count": 2}]}]
        )

    def test_completion_actions(self):
        (done,) = self.guide["complete"]
        self.assertIn(
            {"type": "items", "items": [{"id": 231, "count": 3}, {"id": 5216, "count": -1}]},
            done["actions"],
        )
        self.assertIn(
            {"type": "xp", "amount": 5000, "target": "CHARACTER"}, done["actions"]
        )

    def test_unlocks_and_names(self):
        self.assertEqual(self.guide["unlocks"], [43])
        self.assertEqual(self.payload["npcNames"], {"7": "Guard"})
        self.assertEqual(self.payload["zoneNames"], {"100": "Home"})


def _flag_cond(flag: int, value: int, mode: str = "") -> str:
    mode_xml = f'<member name="compareMode">{mode}</member>' if mode else ""
    return f"""<element><object name="EventFlagCondition">
      <member name="type">QUEST_FLAGS</member>{mode_xml}
      <member name="value1">50</member>
      <member name="flagStates"><pair><key>{flag}</key><value>{value}</value></pair></member>
    </object></element>"""


def _set_flags(event_id: str, flags: dict[int, int], phase: int | None = None) -> str:
    pairs = "".join(f"<pair><key>{k}</key><value>{v}</value></pair>" for k, v in flags.items())
    phase_xml = f'<member name="phase">{phase}</member>' if phase is not None else ""
    return f"""<object name="EventPerformActions">
    <member name="ID">{event_id}</member>
    <member name="actions"><element><object name="ActionUpdateQuest">
      <member name="questID">50</member>{phase_xml}
      <member name="flagStates">{pairs}</member>
    </object></element></member>
  </object>"""


def _choice(msg: int, branches: list[tuple[str, str]]) -> str:
    rows = "".join(
        f"<element><object><member name=\"next\">{nxt}</member>"
        f"<member name=\"conditions\">{conds}</member></object></element>"
        for nxt, conds in branches
    )
    return f"""<element><object name="EventChoice">
      <member name="messageID">{msg}</member>
      <member name="branches">{rows}</member>
    </object></element>"""


# Quest 50, phase 1 → 2: NPC 1 hands out a random first key (flag 1 = 1 or 2),
# then panel NPC 2 must be pressed in the order that key dictates. Flag 9
# counts correct presses; a wrong press does nothing.
PUZZLE_EVENTS = f"""<objects>
  <object name="Event">
    <member name="ID">Z100_1</member>
    <member name="branchScriptID">branch_randomSplit</member>
    <member name="branches">
      <element><object><member name="next">Z100_1_A</member></object></element>
      <element><object><member name="next">Z100_1_B</member></object></element>
    </member>
  </object>
  {_set_flags("Z100_1_A", {1: 1})}
  {_set_flags("Z100_1_B", {1: 2})}
  <object name="EventPrompt">
    <member name="ID">Z100_2</member>
    <member name="messageID">10</member>
    <member name="choices">
      {_choice(11, [("Z100_2_A1", _flag_cond(1, 1) + _flag_cond(9, 1, "LT_OR_NAN")),
                    ("Z100_2_B2", _flag_cond(1, 2) + _flag_cond(9, 1))])}
      {_choice(12, [("Z100_2_B1", _flag_cond(1, 2) + _flag_cond(9, 1, "LT_OR_NAN")),
                    ("Z100_2_A2", _flag_cond(1, 1) + _flag_cond(9, 1))])}
    </member>
  </object>
  {_set_flags("Z100_2_A1", {9: 1})}
  {_set_flags("Z100_2_B1", {9: 1})}
  {_set_flags("Z100_2_A2", {9: 2}, phase=2)}
  {_set_flags("Z100_2_B2", {9: 2}, phase=2)}
</objects>
"""

PUZZLE_ZONE = """<objects>
  <object name="ServerZone">
    <member name="ID">100</member>
    <member name="NPCs">
      <element><object name="ServerNPC"><member name="ID">1</member>
        <member name="Actions"><element><object name="ActionStartEvent">
          <member name="eventID">Z100_1</member></object></element></member>
      </object></element>
      <element><object name="ServerNPC"><member name="ID">2</member>
        <member name="X">5000</member><member name="Y">-27924</member>
        <member name="Actions"><element><object name="ActionStartEvent">
          <member name="eventID">Z100_2</member></object></element></member>
      </object></element>
    </member>
  </object>
</objects>
"""


class FlagPuzzleTests(unittest.TestCase):
    def test_one_talk_sequence_per_random_outcome(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "events").mkdir()
            (root / "zones").mkdir()
            (root / "events" / "zone_events-100.xml").write_text(PUZZLE_EVENTS)
            (root / "zones" / "zone-100.xml").write_text(PUZZLE_ZONE)
            triggers, spawn_data = load_zone_triggers(root)
            grid = MapGrid(None)
            grid.maps[100] = (0.0, -30.0)
            payload = build_guides_payload(
                quests=[{"id": 50, "zoneID": 100}],
                events=load_events(root),
                triggers=triggers,
                spawn_data=spawn_data,
                npc_names={},
                zone_names={},
                messages={11: ["Press A"], 12: ["Press B"]},
                locate=grid.locate,
            )
        (variants,) = payload["byQuestId"]["50"]["phases"]
        orders = sorted(
            tuple(c for talk in v["sequence"] for c in talk["choices"]) for v in variants
        )
        self.assertEqual(orders, [("Press A", "Press B"), ("Press B", "Press A")])
        for variant in variants:
            first = variant["sequence"][0]
            self.assertTrue(first.get("random"))
            self.assertEqual(first["trigger"]["npcId"], 1)
            # X/Y NPC placed where smtwiki puts the Act 12 reactor controller.
            self.assertEqual(variant["trigger"]["grid"], [24, 36])


class MapGridTests(unittest.TestCase):
    def test_grid_formula(self):
        grid = MapGrid(None)
        grid.maps.update({20101: (0.0, 0.0), 60101: (0.0, -30.0), 30101: (0.0, 0.0)})
        grid.zones[30101] = {"name": "Suginami", "type": "FIELD", "spotFile": ""}
        # Home III's Father Figure Guard: CQuestData says [X16:Y19].
        self.assertEqual(grid.grid(20101, -7294.18, 2278.91), [16, 19])
        # Shinjuku Docks control room door / reactor controller (smtwiki).
        self.assertEqual(grid.grid(60101, -2673, -17492)[1], 30)
        self.assertEqual(grid.grid(60101, 5000, -27924), [24, 36])
        # Field maps use a 4x larger cell.
        self.assertEqual(grid.grid(30101, -17654.4, 19702.4), [18, 17])
        self.assertIsNone(grid.grid(99999, 0, 0))


if __name__ == "__main__":
    unittest.main()

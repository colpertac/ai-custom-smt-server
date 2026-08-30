"""Unit tests for CEventMessage XML merge (no bdpatch required)."""

from __future__ import annotations

import unittest

from ceventmessage import merge_ceventmessage_xml


SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<objects>
    <object name="MiCEventMessageData">
        <member name="ID">10</member>
        <member name="lines">
            <element>ten</element>
        </member>
    </object>
</objects>
"""


class MergeTests(unittest.TestCase):
    def test_insert_and_update(self) -> None:
        out = merge_ceventmessage_xml(
            SAMPLE,
            [
                {"id": 10, "lines": ["10"]},
                {"id": 9180001, "lines": ["25"]},
            ],
        )
        self.assertIn(">10<", out)
        self.assertIn("9180001", out)
        self.assertIn(">25<", out)
        # updated, not duplicated stock id
        self.assertEqual(out.count("<member name=\"ID\">10</member>"), 1)


if __name__ == "__main__":
    unittest.main()

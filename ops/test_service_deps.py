"""Unit tests for lobby → world → channel restart ordering helpers."""

from __future__ import annotations

import unittest

from sidecar import (
    expand_restart_services_for_lobby_cascade,
    _service_deps_message,
)


class ExpandLobbyCascadeTests(unittest.TestCase):
    def test_lobby_alone_adds_world(self) -> None:
        self.assertEqual(
            expand_restart_services_for_lobby_cascade(["lobby"]),
            ["lobby", "world"],
        )

    def test_lobby_channel_inserts_world(self) -> None:
        self.assertEqual(
            expand_restart_services_for_lobby_cascade(["lobby", "channel"]),
            ["lobby", "world", "channel"],
        )

    def test_world_channel_unchanged(self) -> None:
        self.assertEqual(
            expand_restart_services_for_lobby_cascade(["world", "channel"]),
            ["world", "channel"],
        )

    def test_full_stack_unchanged(self) -> None:
        self.assertEqual(
            expand_restart_services_for_lobby_cascade(
                ["lobby", "world", "channel"]
            ),
            ["lobby", "world", "channel"],
        )

    def test_channel_alone_unchanged(self) -> None:
        self.assertEqual(
            expand_restart_services_for_lobby_cascade(["channel"]),
            ["channel"],
        )


class ServiceDepsMessageTests(unittest.TestCase):
    def test_channel_requires_world(self) -> None:
        msg = _service_deps_message(
            ["channel"],
            running={"lobby"},
            verb="restart",
        )
        self.assertIsNotNone(msg)
        assert msg is not None
        self.assertIn("world", msg.lower())

    def test_channel_ok_when_lobby_and_world_up(self) -> None:
        msg = _service_deps_message(
            ["channel"],
            running={"lobby", "world"},
            verb="restart",
        )
        self.assertIsNone(msg)

    def test_batch_counts_earlier_services(self) -> None:
        msg = _service_deps_message(
            ["lobby", "world", "channel"],
            running=set(),
            verb="start",
        )
        self.assertIsNone(msg)

    def test_world_requires_lobby_on_start(self) -> None:
        msg = _service_deps_message(
            ["world"],
            running=set(),
            verb="start",
        )
        self.assertEqual(msg, "Start lobby first before starting world.")


if __name__ == "__main__":
    unittest.main()

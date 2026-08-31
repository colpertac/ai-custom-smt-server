"""Routing tests for zip ingest overlay paths."""

from zip_ingest import _route_member, _route_to_overlay


def test_route_to_overlay_title():
    assert _route_to_overlay("Title/foo.txt") == "Title/foo.txt"


def test_route_to_overlay_strips_overlay_prefix():
    assert _route_to_overlay("overlay/Title/foo.txt") == "Title/foo.txt"


def test_route_to_overlay_strips_client_prefix():
    assert _route_to_overlay("client/Title/foo.txt") == "Title/foo.txt"


def test_route_to_overlay_denies_maps():
    assert _route_to_overlay("Map/zone/foo") is None


def test_route_member_overlay_title():
    assert _route_member("overlay", "Title/foo.txt") == ("overlay", "Title/foo.txt")


def test_route_member_overlay_binarydata():
    assert _route_member("overlay", "BinaryData/Shield/ItemData.sbin") == (
        "overlay",
        "BinaryData/Shield/ItemData.sbin",
    )

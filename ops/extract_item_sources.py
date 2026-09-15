"""Reverse index: itemId → drops, world NPC shops, quest requirements.

Writes website/content/wiki/item-sources.json for 16B post-MVP / 16F Ask.
COMP shops are excluded (see item-comp-shops.json).
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from extract_spawns import (
    PlasmaRecord,
    SpawnRecord,
    _default_datastore,
    _extract_member_content,
    _parse_item_drops,
    _parse_member_int,
    _parse_member_str,
    _wiki_dir,
    iter_named_object_bodies,
    scan_all_spawns,
)
from wiki_export import _atomic_write_json, _now_iso


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _server_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _load_shop_products() -> dict[str, dict[str, Any]] | None:
    path = _server_root() / "website" / "content" / "shops" / "shop-products.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    products = data.get("products")
    return products if isinstance(products, dict) else None


def _resolve_product_item_id(
    products: dict[str, dict[str, Any]] | None, product_id: int
) -> int | None:
    if products:
        row = products.get(str(product_id))
        if row and int(row.get("itemId", 0)) > 0:
            return int(row["itemId"])
    if product_id > 0:
        return product_id
    return None


def load_dropsets(datastore_root: Path) -> dict[int, dict[str, Any]]:
    """dropSetId → {id, drops[], sourceFile}."""
    dropset_dir = datastore_root / "data" / "dropset"
    index: dict[int, dict[str, Any]] = {}
    if not dropset_dir.is_dir():
        return index

    for path in sorted(dropset_dir.glob("*.xml")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for _start, body in iter_named_object_bodies(text, "DropSet"):
            ds_id = _parse_member_int(body, "ID")
            if ds_id is None:
                continue
            drops = _parse_item_drops(body, "Drops")
            if not drops:
                continue
            existing = index.get(ds_id)
            if existing:
                existing["drops"].extend(drops)
                existing["sourceFiles"].append(path.name)
            else:
                index[ds_id] = {
                    "id": ds_id,
                    "drops": drops,
                    "sourceFiles": [path.name],
                }
    return index


def load_world_shops(datastore_root: Path) -> list[dict[str, Any]]:
    shops_dir = datastore_root / "shops"
    listings: list[dict[str, Any]] = []
    if not shops_dir.is_dir():
        return listings

    products = _load_shop_products()
    for path in sorted(shops_dir.glob("shop-*.xml")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for _start, shop_body in iter_named_object_bodies(text, "ServerShop"):
            shop_type = _parse_member_str(shop_body, "Type")
            if shop_type == "COMP_SHOP":
                continue
            shop_id = _parse_member_int(shop_body, "ShopID")
            shop_name = _parse_member_str(shop_body, "Name") or path.stem
            if shop_id is None:
                continue
            tabs_block = _extract_member_content(shop_body, "Tabs")
            if not tabs_block:
                continue
            for _ts, tab_body in iter_named_object_bodies(tabs_block, "ServerShopTab"):
                tab_name = _parse_member_str(tab_body, "Name") or "Tab"
                products_block = _extract_member_content(tab_body, "Products")
                if not products_block:
                    continue
                for _ps, prod_body in iter_named_object_bodies(
                    products_block, "ServerShopProduct"
                ):
                    product_id = _parse_member_int(prod_body, "ProductID")
                    base_price = _parse_member_int(prod_body, "BasePrice")
                    if product_id is None:
                        continue
                    item_id = _resolve_product_item_id(products, product_id)
                    if item_id is None:
                        continue
                    listings.append(
                        {
                            "shopId": shop_id,
                            "shopName": shop_name,
                            "tabName": tab_name,
                            "productId": product_id,
                            "itemId": item_id,
                            "basePrice": base_price or 0,
                            "currency": "Macca",
                            "sourceFile": path.name,
                        }
                    )
    return listings


def load_quest_item_requirements(quests_path: Path) -> dict[int, list[dict[str, Any]]]:
    """itemId → quests that require the item (turn-in / collect phases)."""
    if not quests_path.is_file():
        return {}
    try:
        data = json.loads(quests_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    by_item: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for quest in data.get("quests", []):
        quest_id = quest.get("id")
        title = quest.get("title")
        for phase in quest.get("phases", []):
            phase_number = phase.get("phaseNumber")
            for req in phase.get("requirements", []):
                if req.get("type") != "ITEM":
                    continue
                item_id = int(req.get("objectID", 0))
                if item_id <= 0:
                    continue
                by_item[item_id].append(
                    {
                        "questId": quest_id,
                        "title": title,
                        "phaseNumber": phase_number,
                        "objectCount": req.get("objectCount", 1),
                        "requirementType": "ITEM",
                    }
                )
    return dict(by_item)


def _append_drop_source(
    by_item: dict[str, dict[str, Any]],
    item_id: int,
    source: dict[str, Any],
) -> None:
    key = str(item_id)
    bucket = by_item.setdefault(key, {"itemId": item_id, "drops": [], "worldShops": [], "questRequires": []})
    drops = bucket["drops"]
    sig = json.dumps(source, sort_keys=True)
    if not any(json.dumps(d, sort_keys=True) == sig for d in drops):
        drops.append(source)


def build_item_sources_payload(
    datastore_root: Path,
    quests_path: Path,
    source_note: str,
    spawns: list[SpawnRecord] | None = None,
    plasmas: list[PlasmaRecord] | None = None,
    files_scanned: int | None = None,
) -> dict[str, Any]:
    if spawns is None or plasmas is None:
        spawns, plasmas, files_scanned = scan_all_spawns(datastore_root)
    elif files_scanned is None:
        files_scanned = 0

    dropsets = load_dropsets(datastore_root)
    world_shops = load_world_shops(datastore_root)
    quest_requires = load_quest_item_requirements(quests_path)

    by_item: dict[str, dict[str, Any]] = {}

    def add_dropset_sources(
        drop_set_ids: list[int],
        *,
        kind: str,
        zone_id: int | None = None,
        enemy_type: int | None = None,
        spawn_id: int | None = None,
        source_file: str | None = None,
    ) -> None:
        for ds_id in drop_set_ids:
            ds = dropsets.get(ds_id)
            if not ds:
                continue
            for drop in ds["drops"]:
                source: dict[str, Any] = {
                    "kind": kind,
                    "dropSetId": ds_id,
                    "itemId": drop["itemId"],
                    "rate": drop.get("rate"),
                }
                if "minStack" in drop:
                    source["minStack"] = drop["minStack"]
                if "maxStack" in drop:
                    source["maxStack"] = drop["maxStack"]
                if zone_id is not None:
                    source["zoneId"] = zone_id
                if enemy_type is not None:
                    source["enemyType"] = enemy_type
                if spawn_id is not None:
                    source["spawnId"] = spawn_id
                if source_file:
                    source["sourceFile"] = source_file
                if ds.get("sourceFiles"):
                    source["dropSetFile"] = ds["sourceFiles"][0]
                _append_drop_source(by_item, drop["itemId"], source)

    for rec in spawns:
        add_dropset_sources(
            rec.drop_set_ids,
            kind="enemy",
            zone_id=rec.zone_id,
            enemy_type=rec.enemy_type,
            spawn_id=rec.spawn_id,
            source_file=rec.source_file,
        )
        add_dropset_sources(
            rec.gift_set_ids,
            kind="enemyGift",
            zone_id=rec.zone_id,
            enemy_type=rec.enemy_type,
            spawn_id=rec.spawn_id,
            source_file=rec.source_file,
        )
        for drop in rec.inline_drops:
            source = {
                "kind": "enemyInline",
                "zoneId": rec.zone_id,
                "enemyType": rec.enemy_type,
                "spawnId": rec.spawn_id,
                "itemId": drop["itemId"],
                "rate": drop.get("rate"),
                "sourceFile": rec.source_file,
            }
            if "minStack" in drop:
                source["minStack"] = drop["minStack"]
            if "maxStack" in drop:
                source["maxStack"] = drop["maxStack"]
            _append_drop_source(by_item, drop["itemId"], source)
        for drop in rec.inline_gifts:
            source = {
                "kind": "enemyGiftInline",
                "zoneId": rec.zone_id,
                "enemyType": rec.enemy_type,
                "spawnId": rec.spawn_id,
                "itemId": drop["itemId"],
                "rate": drop.get("rate"),
                "sourceFile": rec.source_file,
            }
            _append_drop_source(by_item, drop["itemId"], source)

    for plasma in plasmas:
        add_dropset_sources(
            [plasma.drop_set_id],
            kind="plasma",
            zone_id=plasma.zone_id,
            source_file=plasma.source_file,
        )

    shop_items = 0
    for listing in world_shops:
        key = str(listing["itemId"])
        bucket = by_item.setdefault(
            key,
            {"itemId": listing["itemId"], "drops": [], "worldShops": [], "questRequires": []},
        )
        shops = bucket["worldShops"]
        sig = (
            listing["shopId"],
            listing["tabName"],
            listing["productId"],
        )
        if not any(
            (s["shopId"], s["tabName"], s["productId"]) == sig for s in shops
        ):
            shops.append(
                {
                    "shopId": listing["shopId"],
                    "shopName": listing["shopName"],
                    "tabName": listing["tabName"],
                    "productId": listing["productId"],
                    "basePrice": listing["basePrice"],
                    "currency": listing["currency"],
                    "sourceFile": listing["sourceFile"],
                }
            )
            shop_items += 1

    quest_item_links = 0
    for item_id, reqs in quest_requires.items():
        key = str(item_id)
        bucket = by_item.setdefault(
            key,
            {"itemId": item_id, "drops": [], "worldShops": [], "questRequires": []},
        )
        bucket["questRequires"] = reqs
        quest_item_links += len(reqs)

    items_with_drops = sum(1 for v in by_item.values() if v["drops"])
    items_with_shops = sum(1 for v in by_item.values() if v["worldShops"])
    items_with_quests = sum(1 for v in by_item.values() if v["questRequires"])
    items_any = sum(
        1
        for v in by_item.values()
        if v["drops"] or v["worldShops"] or v["questRequires"]
    )

    for bucket in by_item.values():
        bucket["drops"].sort(
            key=lambda d: (
                d.get("kind", ""),
                d.get("zoneId") or 0,
                d.get("enemyType") or 0,
                d.get("itemId") or 0,
            )
        )
        bucket["worldShops"].sort(
            key=lambda s: (s.get("shopId", 0), s.get("tabName", ""))
        )

    return {
        "source": source_note,
        "generatedAt": _now_iso(),
        "note": (
            "Non-COMP acquisition sources: enemy/plasma drops (dropset + inline), "
            "world NPC shops (shop-*.xml), and quest ITEM requirements (not rewards). "
            "COMP listings: item-comp-shops.json. InheritDrops, ActionCreateLoot "
            "chests, and devil default drop tables are not resolved."
        ),
        "stats": {
            "filesScannedZones": files_scanned,
            "dropSetsLoaded": len(dropsets),
            "spawnEntries": len(spawns),
            "plasmaNodes": len(plasmas),
            "worldShopListings": len(world_shops),
            "worldShopListingsUnique": shop_items,
            "questItemRequirements": quest_item_links,
            "itemsWithAnySource": items_any,
            "itemsWithDropSource": items_with_drops,
            "itemsWithWorldShop": items_with_shops,
            "itemsWithQuestRequire": items_with_quests,
        },
        "byItemId": dict(sorted(by_item.items(), key=lambda kv: int(kv[0]))),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract item acquisition reverse index (drops, shops, quests)"
    )
    parser.add_argument(
        "--datastore",
        type=Path,
        default=None,
        help="comp_hack/datastore root",
    )
    parser.add_argument(
        "--quests",
        type=Path,
        default=_wiki_dir() / "quests.json",
        help="quests.json for ITEM requirement reverse index",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_wiki_dir() / "item-sources.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--verify-item",
        type=int,
        default=5215,
        help="Item ID to print sample sources for (default: 5215)",
    )
    args = parser.parse_args(argv)

    datastore = args.datastore or _default_datastore()
    if not datastore.is_dir():
        print(f"Datastore not found: {datastore}")
        return 1

    try:
        ds_label = datastore.relative_to(_repo_root()).as_posix()
    except ValueError:
        ds_label = str(datastore)
    source_note = (
        f"{ds_label}/{{data/dropset,zones/**,shops/shop-*.xml}} + "
        f"website/content/wiki/quests.json"
    )
    payload = build_item_sources_payload(datastore, args.quests, source_note)
    _atomic_write_json(args.output, payload)

    stats = payload["stats"]
    print(f"Wrote item-sources.json → {args.output}")
    print(
        f"  items with ≥1 source: {stats['itemsWithAnySource']} | "
        f"drop: {stats['itemsWithDropSource']} | "
        f"world shop: {stats['itemsWithWorldShop']} | "
        f"quest require: {stats['itemsWithQuestRequire']}"
    )
    print(
        f"  dropSets: {stats['dropSetsLoaded']} | "
        f"spawns: {stats['spawnEntries']} | "
        f"world shop listings: {stats['worldShopListings']}"
    )
    if args.verify_item is not None:
        hit = payload["byItemId"].get(str(args.verify_item))
        if hit:
            print(
                f"  verify item {args.verify_item}: "
                f"{len(hit['drops'])} drops, "
                f"{len(hit['worldShops'])} shops, "
                f"{len(hit['questRequires'])} quest reqs"
            )
        else:
            print(f"  verify item {args.verify_item}: not found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

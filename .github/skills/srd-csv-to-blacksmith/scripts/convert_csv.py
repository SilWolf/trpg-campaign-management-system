#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import re
import sys
from decimal import Decimal
from pathlib import Path


DEFAULT_COLUMNS = {
    "name": "名称",
    "source": "来源",
    "page": "页码",
    "rarity": "稀有度",
    "types": "类型",
    "requiresAttunement": "同调",
    "damage": "伤害",
    "weaponProperties": "属性",
    "weaponMastery": "武器精通",
    "weight": "重量",
    "value": "价值",
    "description": "文本",
}
VALID_COLUMNS = set(DEFAULT_COLUMNS)
VALID_RARITIES = {
    "common": "Common",
    "uncommon": "Uncommon",
    "rare": "Rare",
    "very rare": "VeryRare",
    "veryrare": "VeryRare",
    "legendary": "Legendary",
    "artifact": "Artifact",
}
VALID_CATEGORIES = {"Weapon", "Armor", "Consumable", "Misc"}
NUMBER_PATTERN = r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?"
VALUE_PATTERN = re.compile(
    rf"^\s*({NUMBER_PATTERN})\s*(CP|SP|EP|GP|PP)\s*$", re.IGNORECASE
)
WEIGHT_PATTERN = re.compile(
    rf"^\s*(?:(?P<number>{NUMBER_PATTERN})\s*)?(?P<fraction>[½¼¾])?"
    r"(?:\s*(?:磅|lb|lbs|pound|pounds))?"
    r"(?:\s*[（(][^（）()]*[）)])?\s*$",
    re.IGNORECASE,
)
UNIT_TO_GP = {
    "CP": Decimal("0.01"),
    "SP": Decimal("0.1"),
    "EP": Decimal("0.5"),
    "GP": Decimal("1"),
    "PP": Decimal("10"),
}
TRUE_VALUES = {"true", "yes", "y", "1", "是", "需要"}
FALSE_VALUES = {"false", "no", "n", "0", "否", "不需要"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="將規則書物品 CSV 轉成 Blacksmith items、lookup 與 catalog index JSON。"
    )
    parser.add_argument("--input", required=True, type=Path, help="來源 CSV 路徑")
    parser.add_argument("--catalog-id", required=True, help="小寫英數與連字號組成的目錄 ID")
    parser.add_argument("--title", required=True, help="規則書顯示名稱")
    parser.add_argument(
        "--category",
        choices=sorted(VALID_CATEGORIES),
        required=True,
        help="本批項目的 InventoryItem category",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("public/data/blacksmith"),
        help="目錄輸出位置（預設：public/data/blacksmith）",
    )
    parser.add_argument(
        "--column",
        action="append",
        default=[],
        metavar="FIELD=HEADER",
        help="覆寫 CSV 欄名，可重複指定",
    )
    output_mode = parser.add_mutually_exclusive_group()
    output_mode.add_argument(
        "--append",
        action="store_true",
        help="將新項目附加至既有目錄，並拒絕重複 itemId 或 sourceKey",
    )
    output_mode.add_argument(
        "--force",
        "--replace",
        dest="force",
        action="store_true",
        help="明確允許覆寫同 catalogId 的 items 與 lookup 檔",
    )
    return parser.parse_args()


def parse_column_overrides(overrides):
    columns = DEFAULT_COLUMNS.copy()
    for override in overrides:
        field, separator, header = override.partition("=")
        if not separator or field not in VALID_COLUMNS or not header:
            raise ValueError(
                f"無效欄位映射 {override!r}；格式為 FIELD=HEADER，FIELD 必須是 "
                f"{', '.join(sorted(VALID_COLUMNS))}"
            )
        columns[field] = header
    return columns


def parse_rarity(value):
    normalized = (value or "").strip()
    if not normalized or normalized.casefold() == "none":
        return "Common"
    rarity = VALID_RARITIES.get(normalized.casefold())
    if rarity is None:
        raise ValueError(f"無法對應稀有度：{value!r}")
    return rarity


def parse_weight(value):
    normalized = (value or "").strip()
    if not normalized or normalized.casefold() == "none":
        return 0
    match = WEIGHT_PATTERN.match(normalized)
    if not match or not (match.group("number") or match.group("fraction")):
        raise ValueError(f"無法解析重量：{value!r}")
    weight = Decimal((match.group("number") or "0").replace(",", ""))
    weight += {"½": Decimal("0.5"), "¼": Decimal("0.25"), "¾": Decimal("0.75")}.get(
        match.group("fraction"), Decimal("0")
    )
    if weight < 0:
        raise ValueError(f"重量不可為負數：{value!r}")
    return as_json_number(weight)


def parse_value_gp(value):
    normalized = (value or "").strip()
    if not normalized or normalized.casefold() == "none":
        return 0
    match = VALUE_PATTERN.fullmatch(normalized)
    if not match:
        raise ValueError(f"無法解析價格：{value!r}")
    amount = Decimal(match.group(1).replace(",", ""))
    denomination = match.group(2).upper()
    amount_gp = amount * UNIT_TO_GP[denomination]
    if amount_gp < 1:
        return 0
    return as_json_number(amount_gp)


def as_json_number(value):
    return int(value) if value == value.to_integral_value() else float(value)


def parse_attunement(value):
    normalized = (value or "").strip().casefold()
    if not normalized:
        return False
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    raise ValueError(f"無法解析同調欄位：{value!r}")


def read_rows(path, columns):
    with path.open(encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)):
            raise ValueError("CSV 欄名重複，請先整理標頭後再轉換")
        required_headers = {columns["name"], columns["description"]}
        missing = required_headers - set(headers)
        if missing:
            raise ValueError(
                f"CSV 缺少必要欄位：{', '.join(sorted(missing))}。"
                "可用 --column 指定不同欄名。"
            )
        return headers, list(reader)


def get_value(row, columns, key):
    header = columns[key]
    value = row.get(header, "")
    return value.strip() if isinstance(value, str) else ""


def make_item(row, columns, catalog_id, category, row_number):
    name = get_value(row, columns, "name")
    description = get_value(row, columns, "description")
    if not name:
        raise ValueError(f"第 {row_number} 筆資料名稱為空")
    if not description:
        raise ValueError(f"第 {row_number} 筆資料描述為空")

    source = get_value(row, columns, "source")
    page = get_value(row, columns, "page")
    identity = "\0".join((catalog_id, source, page, name))
    item_id = "item-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
    type_value = get_value(row, columns, "types")
    subtypes = [part.strip() for part in type_value.split(",") if part.strip()]
    if category == "Weapon":
        subtypes = [subtype for subtype in subtypes if subtype != "武器"]
    damage = get_value(row, columns, "damage")

    item = {
        "itemId": item_id,
        "name": name,
        "icon": f"./images/blacksmith/catalogs/{catalog_id}/{item_id}.webp",
        "category": category,
        "subTypes": subtypes,
        "rarity": parse_rarity(get_value(row, columns, "rarity")),
        "requiresAttunement": parse_attunement(
            get_value(row, columns, "requiresAttunement")
        ),
        "damage": damage or None,
        "weight": parse_weight(get_value(row, columns, "weight")),
        "valueGp": parse_value_gp(get_value(row, columns, "value")),
        "description": description,
        "source": source,
    }
    if category == "Weapon":
        weapon_mastery = get_value(row, columns, "weaponMastery")
        if not weapon_mastery:
            raise ValueError(f"第 {row_number} 筆武器缺少武器精通")
        item["weaponProperties"] = [
            part.strip()
            for part in get_value(row, columns, "weaponProperties").split(",")
            if part.strip()
        ]
        item["weaponMastery"] = weapon_mastery
    lookup = {
        "sourceKey": f"{catalog_id}:{item_id}",
        "itemId": item_id,
        "name": name,
        "aliases": [],
        "searchTerms": list(
            dict.fromkeys(
                subtypes + ([source] if source else [])
            )
        ),
    }
    return item, lookup


def load_index(index_path):
    if not index_path.exists():
        return {"schemaVersion": 3, "catalogs": []}
    with index_path.open(encoding="utf-8") as index_file:
        index = json.load(index_file)
    if index.get("schemaVersion") != 3 or not isinstance(index.get("catalogs"), list):
        raise ValueError(f"既有 catalog index 結構不符：{index_path}")
    return index


def write_catalog(args, items, lookup_items):
    catalog_id = args.catalog_id
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*", catalog_id):
        raise ValueError("catalogId 僅能使用小寫英數字、句點與連字號")
    if not args.title.strip():
        raise ValueError("書籍標題不可為空")

    catalogs_dir = args.output_root / "catalogs"
    items_path = catalogs_dir / f"{catalog_id}.items.json"
    lookup_path = catalogs_dir / f"{catalog_id}.lookup.json"
    index_path = args.output_root / "catalog-index.json"
    if args.append and not (items_path.exists() and lookup_path.exists()):
        raise FileNotFoundError(
            f"附加模式需要既有的 items 與 lookup 檔：{items_path}、{lookup_path}"
        )
    if not args.append and not args.force and (
        items_path.exists() or lookup_path.exists()
    ):
        raise FileExistsError(
            f"輸出檔已存在：{items_path} 或 {lookup_path}；"
            "確認要附加資料時使用 --append，或確認要重建時使用 --replace。"
        )

    index = load_index(index_path)
    if args.append:
        with items_path.open(encoding="utf-8") as items_file:
            existing_items = json.load(items_file)
        with lookup_path.open(encoding="utf-8") as lookup_file:
            existing_lookup = json.load(lookup_file)
        for path, document in (
            (items_path, existing_items),
            (lookup_path, existing_lookup),
        ):
            if (
                document.get("schemaVersion") != 3
                or document.get("catalogId") != catalog_id
                or not isinstance(document.get("items"), list)
            ):
                raise ValueError(f"既有目錄檔結構不符：{path}")
        items = existing_items["items"] + items
        lookup_items = existing_lookup["items"] + lookup_items

    item_ids = [item["itemId"] for item in items]
    source_keys = [item["sourceKey"] for item in lookup_items]
    if len(item_ids) != len(set(item_ids)):
        raise ValueError("產生了重複 itemId；請檢查重複的來源、頁碼與名稱")
    if len(source_keys) != len(set(source_keys)):
        raise ValueError("產生了重複 sourceKey；請檢查來源資料")

    catalogs_dir.mkdir(parents=True, exist_ok=True)
    items_path.write_text(
        json.dumps(
            {"schemaVersion": 3, "catalogId": catalog_id, "items": items},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    lookup_path.write_text(
        json.dumps(
            {"schemaVersion": 3, "catalogId": catalog_id, "items": lookup_items},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    catalog_entry = {
        "catalogId": catalog_id,
        "title": args.title.strip(),
        "itemsFile": f"./catalogs/{catalog_id}.items.json",
        "lookupFile": f"./catalogs/{catalog_id}.lookup.json",
    }
    index["catalogs"] = [
        entry for entry in index["catalogs"] if entry.get("catalogId") != catalog_id
    ]
    index["catalogs"].append(catalog_entry)
    index_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return items_path, lookup_path, index_path


def main():
    args = parse_args()
    try:
        columns = parse_column_overrides(args.column)
        headers, rows = read_rows(args.input, columns)
        if not rows:
            raise ValueError("CSV 沒有物品資料")
        items = []
        lookups = []
        for row_number, row in enumerate(rows, start=2):
            item, lookup = make_item(
                row, columns, args.catalog_id, args.category, row_number
            )
            items.append(item)
            lookups.append(lookup)
        output_paths = write_catalog(args, items, lookups)
    except (OSError, ValueError, json.JSONDecodeError, csv.Error) as error:
        print(f"轉換失敗：{error}", file=sys.stderr)
        return 1

    print(f"CSV 欄位：{', '.join(headers)}")
    print(f"轉換完成：{len(items)} 筆")
    for output_path in output_paths:
        print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

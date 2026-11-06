"""Convert the public VDS workbook into the static catalog JSON."""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

SOURCE_URL = "https://disk.yandex.ru/i/y1pidZ0n-ur9_Q"
SHEET_NAME = "vds"
COLUMNS = [
    "provider_site",
    "provider_name",
    "provider_age_days",
    "tariff",
    "price_rub",
    "ram_gb",
    "cpu_count",
    "cpu_freq_mhz",
    "disk_size",
    "disk_type",
    "traffic",
    "speed",
    "location",
    "virtualization",
    "ipv6",
    "payments",
]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DISK_TYPES = {"NVMe", "SSD", "HDD"}
VIRTUALIZATION = {"KVM", "VMware", "OpenVZ", "XEN", "Hyper-V"}
IPV6 = {"да", "нет"}
DISK_RE = re.compile(r"^(\d+(?:[.,]\d+)?)\s*ГБ$")
TRAFFIC_RE = re.compile(r"^(\d+(?:[.,]\d+)?)\s*ТБ$")
SPEED_RE = re.compile(r"^(\d+(?:[.,]\d+)?)\s*МБит/с$")
NUMBER_RE = re.compile(r"^\d+(?:[.,]\d+)?$")
SNAPSHOT_NOTE = (
    "Снимок из публичного файла. Дата изменения в свойствах книги: 2026-03-10. "
    "Цены и характеристики не проверялись заново."
)


def convert_workbook(path: Path) -> dict:
    workbook = load_workbook(path, data_only=False)
    if SHEET_NAME not in workbook.sheetnames:
        raise ValueError(f"missing sheet {SHEET_NAME}")
    sheet = workbook[SHEET_NAME]
    header = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1, max_col=len(COLUMNS)))]
    if header != COLUMNS:
        raise ValueError(f"unexpected header: {header}")

    offers = []
    for cells in sheet.iter_rows(min_row=2, max_col=len(COLUMNS)):
        if all(cell.value is None for cell in cells):
            continue
        offers.append(parse_row(cells[0].row, {column: cell for column, cell in zip(COLUMNS, cells)}))

    modified = workbook.properties.modified
    if not isinstance(modified, datetime):
        raise ValueError("workbook has no modified timestamp")

    return {
        "source": {
            "url": SOURCE_URL,
            "sheet": SHEET_NAME,
            "row_count": len(offers),
            "workbook_modified": modified.strftime("%Y-%m-%dT%H:%M:%S"),
            "snapshot_note": SNAPSHOT_NOTE,
        },
        "offers": offers,
    }


def write_catalog(xlsx_path: Path, json_path: Path) -> dict:
    catalog = convert_workbook(xlsx_path)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n"
    json_path.write_text(payload, encoding="utf-8")
    return catalog


def parse_row(source_row: int, cells: dict) -> dict:
    ram = parse_ram(source_row, cells["ram_gb"].value)
    disk_raw = require_text(source_row, "disk_size", cells["disk_size"].value)
    disk_gb = parse_measure(source_row, "disk_size", disk_raw, DISK_RE)
    traffic_raw = require_text(source_row, "traffic", cells["traffic"].value)
    if traffic_raw == "∞":
        traffic_tb = None
        traffic_unlimited = True
    else:
        traffic_tb = parse_measure(source_row, "traffic", traffic_raw, TRAFFIC_RE)
        traffic_unlimited = False
    speed_raw = require_text(source_row, "speed", cells["speed"].value)
    speed_mbps = parse_measure(source_row, "speed", speed_raw, SPEED_RE)
    disk_type = require_text(source_row, "disk_type", cells["disk_type"].value)
    virtualization = require_text(source_row, "virtualization", cells["virtualization"].value)
    ipv6 = require_text(source_row, "ipv6", cells["ipv6"].value)
    if disk_type not in DISK_TYPES:
        raise ValueError(f"row {source_row}: disk_type {disk_type!r}")
    if virtualization not in VIRTUALIZATION:
        raise ValueError(f"row {source_row}: virtualization {virtualization!r}")
    if ipv6 not in IPV6:
        raise ValueError(f"row {source_row}: ipv6 {ipv6!r}")

    return {
        "source_row": source_row,
        "provider_site": optional_text(source_row, "provider_site", cells["provider_site"].value),
        "provider_name": require_text(source_row, "provider_name", cells["provider_name"].value),
        "provider_age_days": optional_int(source_row, "provider_age_days", cells["provider_age_days"].value),
        "tariff": require_text(source_row, "tariff", cells["tariff"].value),
        "price_rub": require_int(source_row, "price_rub", cells["price_rub"].value),
        "ram_gb": ram["ram_gb"],
        "ram_raw": ram["ram_raw"],
        "ram_unknown": ram["ram_unknown"],
        "cpu_count": require_int(source_row, "cpu_count", cells["cpu_count"].value),
        "cpu_freq_mhz": require_int(source_row, "cpu_freq_mhz", cells["cpu_freq_mhz"].value),
        "disk_size_gb": disk_gb,
        "disk_size_raw": disk_raw,
        "disk_type": disk_type,
        "traffic_tb": traffic_tb,
        "traffic_unlimited": traffic_unlimited,
        "traffic_raw": traffic_raw,
        "speed_mbps": speed_mbps,
        "speed_raw": speed_raw,
        "location": require_text(source_row, "location", cells["location"].value),
        "virtualization": virtualization,
        "ipv6": ipv6,
        "payments": optional_text(source_row, "payments", cells["payments"].value),
    }


def parse_ram(source_row: int, value) -> dict:
    if isinstance(value, datetime):
        return {"ram_gb": None, "ram_raw": format_dmmm(value), "ram_unknown": True}
    if isinstance(value, date):
        return {"ram_gb": None, "ram_raw": format_dmmm(value), "ram_unknown": True}
    if isinstance(value, bool):
        raise ValueError(f"row {source_row}: ram_gb {value!r}")
    if isinstance(value, (int, float)):
        number = whole_or_float(value)
        return {"ram_gb": number, "ram_raw": format_number(number), "ram_unknown": False}
    if isinstance(value, str) and NUMBER_RE.match(value.strip()):
        number = whole_or_float(float(value.strip().replace(",", ".")))
        return {"ram_gb": number, "ram_raw": format_number(number), "ram_unknown": False}
    raise ValueError(f"row {source_row}: ram_gb {value!r}")


def format_dmmm(value: date) -> str:
    return f"{value.day}-{MONTHS[value.month - 1]}"


def format_number(number: int | float) -> str:
    if isinstance(number, int):
        return str(number)
    return f"{number:.10f}".rstrip("0").rstrip(".")


def whole_or_float(value: int | float) -> int | float:
    number = float(value)
    if number.is_integer():
        return int(number)
    return number


def parse_measure(source_row: int, label: str, text: str, pattern: re.Pattern[str]) -> int | float:
    match = pattern.match(text)
    if not match:
        raise ValueError(f"row {source_row}: {label} {text!r}")
    return whole_or_float(float(match.group(1).replace(",", ".")))


def require_text(source_row: int, label: str, value) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"row {source_row}: {label} {value!r}")
    return value.strip()


def optional_text(source_row: int, label: str, value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"row {source_row}: {label} {value!r}")
    text = value.strip()
    return text or None


def require_int(source_row: int, label: str, value) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not float(value).is_integer():
        raise ValueError(f"row {source_row}: {label} {value!r}")
    return int(value)


def optional_int(source_row: int, label: str, value) -> int | None:
    if value is None:
        return None
    return require_int(source_row, label, value)


def main(argv: list[str]) -> None:
    if len(argv) != 3:
        raise SystemExit(f"usage: {argv[0]} INPUT.xlsx OUTPUT.json")
    write_catalog(Path(argv[1]), Path(argv[2]))


if __name__ == "__main__":
    main(sys.argv)

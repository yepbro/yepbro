import json
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from scripts.convert_vds import convert_workbook

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "data" / "vds.xlsx"
CATALOG = ROOT / "vps" / "data.json"


class ConvertSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = convert_workbook(XLSX)
        cls.offers = cls.catalog["offers"]

    def test_keeps_every_row(self):
        self.assertEqual(self.catalog["source"]["row_count"], 3038)
        self.assertEqual(len(self.offers), 3038)
        self.assertEqual(self.catalog["source"]["url"], "https://disk.yandex.ru/i/y1pidZ0n-ur9_Q")
        self.assertEqual(self.catalog["source"]["sheet"], "vds")
        self.assertEqual(self.catalog["source"]["workbook_modified"], "2026-03-10T19:34:39")
        self.assertIn("не проверялись заново", self.catalog["source"]["snapshot_note"])

    def test_damaged_ram_is_preserved_as_excel_dates(self):
        damaged = [offer for offer in self.offers if offer["ram_unknown"]]
        raws = [offer["ram_raw"] for offer in damaged]
        self.assertEqual(len(damaged), 8)
        self.assertEqual(raws.count("1-May"), 6)
        self.assertEqual(raws.count("2-May"), 2)
        self.assertTrue(all(offer["ram_gb"] is None for offer in damaged))
        joined = " ".join(raws)
        self.assertNotIn("1.5", joined)
        self.assertNotIn("2.5", joined)

    def test_fractional_ram_parses(self):
        self.assertEqual(sum(offer["ram_gb"] == 0.5 for offer in self.offers), 35)
        self.assertEqual(sum(offer["ram_gb"] == 0.75 for offer in self.offers), 9)
        self.assertEqual(sum(offer["ram_gb"] == 0.6 for offer in self.offers), 1)

    def test_traffic_infinity_and_decimals(self):
        self.assertEqual(sum(offer["traffic_unlimited"] for offer in self.offers), 1803)
        self.assertTrue(any(offer["traffic_raw"] == "0.2 ТБ" and offer["traffic_tb"] == 0.2 for offer in self.offers))
        self.assertTrue(all(offer["traffic_tb"] is None for offer in self.offers if offer["traffic_unlimited"]))

    def test_disk_and_speed_are_numeric(self):
        sample = next(offer for offer in self.offers if offer["disk_size_raw"] == "100 ГБ")
        self.assertEqual(sample["disk_size_gb"], 100)
        fast = next(offer for offer in self.offers if offer["speed_raw"] == "10000 МБит/с")
        self.assertEqual(fast["speed_mbps"], 10000)

    def test_committed_json_matches_converter(self):
        saved = json.loads(CATALOG.read_text(encoding="utf-8"))
        self.assertEqual(saved, self.catalog)


class SyntheticWorkbookTests(unittest.TestCase):
    def write_book(self, rows):
        book = Workbook()
        sheet = book.active
        sheet.title = "vds"
        headers = [
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
        sheet.append(headers)
        for row in rows:
            sheet.append(row)
        handle = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
        handle.close()
        book.save(handle.name)
        return Path(handle.name)

    def base_row(self, **overrides):
        row = {
            "provider_site": "example.com",
            "provider_name": "Example",
            "provider_age_days": 10,
            "tariff": "S",
            "price_rub": 100,
            "ram_gb": 1,
            "cpu_count": 1,
            "cpu_freq_mhz": 2000,
            "disk_size": "20 ГБ",
            "disk_type": "SSD",
            "traffic": "1 ТБ",
            "speed": "100 МБит/с",
            "location": "Россия",
            "virtualization": "KVM",
            "ipv6": "да",
            "payments": "Карта",
        }
        row.update(overrides)
        return [row[key] for key in [
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
        ]]

    def test_zero_ram_stays_zero_and_known(self):
        path = self.write_book([self.base_row(ram_gb=0)])
        offer = convert_workbook(path)["offers"][0]
        self.assertEqual(offer["ram_gb"], 0)
        self.assertFalse(offer["ram_unknown"])
        self.assertEqual(offer["ram_raw"], "0")

    def test_bad_disk_string_is_rejected(self):
        path = self.write_book([self.base_row(disk_size="20 GB")])
        with self.assertRaises(ValueError):
            convert_workbook(path)


if __name__ == "__main__":
    unittest.main()

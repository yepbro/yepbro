import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PageAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "vps" / "index.html").read_text(encoding="utf-8")
        cls.script = (ROOT / "vps" / "app.js").read_text(encoding="utf-8")

    def test_assets_stay_relative_to_the_page(self):
        combined = self.html + self.script
        self.assertNotIn('src="/', combined)
        self.assertNotIn('href="/', combined)
        self.assertNotIn('fetch("/', combined)
        self.assertNotIn("<base", self.html.lower())
        self.assertIn('href="./styles.css"', self.html)
        self.assertIn('src="./app.js"', self.html)
        self.assertIn('lang="ru"', self.html)
        self.assertIn("import.meta.url", self.script)
        self.assertIn("./data.json", self.script)
        self.assertIn("./catalog.js", self.script)

    def test_copy_and_pages_marker(self):
        self.assertIn("https://disk.yandex.ru/i/y1pidZ0n-ur9_Q", self.html)
        self.assertIn("не проверялись заново", self.html)
        self.assertIn("Сбросить", self.html)
        self.assertIn("Поиск по провайдеру, тарифу, сайту или локации", self.html)
        self.assertIn("Ничего не найдено. Измените фильтры или сбросьте их.", self.script)
        self.assertIn("Показано ", self.script)
        self.assertIn("формат d-mmm", self.script)
        self.assertTrue((ROOT / ".nojekyll").is_file())


if __name__ == "__main__":
    unittest.main()

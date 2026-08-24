import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "package-extension.py"
SPEC = importlib.util.spec_from_file_location("package_extension", SCRIPT_PATH)
package_extension = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(package_extension)


class PackageExtensionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self._populate_source()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _populate_source(self) -> None:
        manifest = {
            "manifest_version": 3,
            "name": "Chat Distiller",
            "version": "1.0.0",
            "default_locale": "en",
        }
        files = {
            "db-utils.js": "const db = true;\n",
            "extraction-client.js": "const extract = true;\n",
            "file-utils.js": "const files = true;\n",
            "i18n.js": "const i18n = true;\n",
            "manifest.json": json.dumps(manifest),
            "popup.html": "<!doctype html><title>Popup</title>\n",
            "popup.js": "const popup = true;\n",
            "prompt-constants.js": "const prompts = true;\n",
            "service-worker.js": "const worker = true;\n",
            "sidepanel.html": "<!doctype html><title>Settings</title>\n",
            "sidepanel.js": "const panel = true;\n",
            "sites.js": "const sites = true;\n",
            "_locales/en/messages.json": "{}\n",
            "icons/icon-128.png": "not-a-real-png",
            "src/content-entry.js": "const entry = true;\n",
            "README.md": "# Repository-only file\n",
        }
        for relative_path, content in files.items():
            path = self.source / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    def test_packages_runtime_only_with_checksum(self) -> None:
        archive_path, checksum_path = package_extension.package_extension(
            self.source, self.root / "dist"
        )

        with zipfile.ZipFile(archive_path) as archive:
            names = set(archive.namelist())
        self.assertIn("manifest.json", names)
        self.assertIn("src/content-entry.js", names)
        self.assertNotIn("README.md", names)
        digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
        self.assertEqual(
            checksum_path.read_text(encoding="ascii"),
            f"{digest}  {archive_path.name}\n",
        )

    def test_package_is_deterministic_and_refuses_overwrite(self) -> None:
        first_archive, _ = package_extension.package_extension(
            self.source, self.root / "first"
        )
        second_archive, _ = package_extension.package_extension(
            self.source, self.root / "second"
        )

        self.assertEqual(first_archive.read_bytes(), second_archive.read_bytes())
        with self.assertRaises(FileExistsError):
            package_extension.package_extension(self.source, self.root / "first")

    def test_rejects_private_material(self) -> None:
        private_path = "/Users/" + "lsaint/private"
        (self.source / "private.txt").write_text(
            f"Path: {private_path}\n", encoding="utf-8"
        )

        with self.assertRaisesRegex(RuntimeError, "private user home path"):
            package_extension.verify_repository(self.source)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Validate and package the Chat Distiller Chrome extension."""

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path


RUNTIME_FILES = (
    "db-utils.js",
    "extraction-client.js",
    "file-utils.js",
    "i18n.js",
    "manifest.json",
    "popup.html",
    "popup.js",
    "prompt-constants.js",
    "service-worker.js",
    "sidepanel.html",
    "sidepanel.js",
    "sites.js",
)
RUNTIME_DIRECTORIES = ("_locales", "icons", "src")
REQUIRED_PATHS = {
    "manifest.json",
    "popup.html",
    "service-worker.js",
    "_locales/en/messages.json",
    "extraction-client.js",
    "icons/icon-128.png",
    "src/content-entry.js",
}
FORBIDDEN_PATTERNS = (
    (re.compile(r"/Users/" r"lsaint", re.IGNORECASE), "private user home path"),
    (re.compile(r"ginolegaltech\.cn", re.IGNORECASE), "private company domain"),
    (
        re.compile(r"-----BEGIN " r"(?:RSA |OPENSSH |EC |)?PRIVATE KEY-----"),
        "private key",
    ),
)
CHROME_VERSION_PATTERN = re.compile(r"^[0-9]+(?:\.[0-9]+){0,3}$")
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def _runtime_paths(source_dir: Path):
    for relative_path in RUNTIME_FILES:
        yield source_dir / relative_path
    for relative_directory in RUNTIME_DIRECTORIES:
        directory = source_dir / relative_directory
        if directory.is_dir():
            yield from sorted(path for path in directory.rglob("*") if path.is_file())


def verify_repository(source_dir: Path) -> dict:
    """Validate release inputs and reject known private material."""
    errors = []
    for relative_path in REQUIRED_PATHS:
        path = source_dir / relative_path
        if not path.is_file():
            errors.append(f"Required runtime file is missing: {relative_path}")
        elif path.stat().st_size == 0:
            errors.append(f"Required runtime file is empty: {relative_path}")

    for path in source_dir.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern, description in FORBIDDEN_PATTERNS:
            if pattern.search(content):
                errors.append(f"{path.relative_to(source_dir)} contains {description}.")

    try:
        manifest = json.loads((source_dir / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"Invalid manifest.json: {error}")
        manifest = {}

    version = str(manifest.get("version", ""))
    if not CHROME_VERSION_PATTERN.fullmatch(version):
        errors.append(f"Invalid Chrome extension version: {version!r}")

    if errors:
        raise RuntimeError("\n".join(errors))
    return manifest


def _write_deterministic_zip(source_dir: Path, archive_path: Path) -> None:
    with zipfile.ZipFile(
        archive_path, mode="x", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        for path in sorted(_runtime_paths(source_dir)):
            relative_path = path.relative_to(source_dir).as_posix()
            info = zipfile.ZipInfo(relative_path, date_time=ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)


def package_extension(source_dir: Path, output_dir: Path) -> tuple[Path, Path]:
    """Build the immutable runtime-only ZIP and its SHA-256 checksum."""
    source_dir = source_dir.resolve()
    output_dir = output_dir.resolve()
    manifest = verify_repository(source_dir)
    version = manifest["version"]
    archive_path = output_dir / f"chat-distiller-{version}.zip"
    checksum_path = archive_path.with_suffix(".zip.sha256")

    existing_paths = [path for path in (archive_path, checksum_path) if path.exists()]
    if existing_paths:
        names = ", ".join(path.name for path in existing_paths)
        raise FileExistsError(f"Refusing to overwrite existing artifact(s): {names}")

    output_dir.mkdir(parents=True, exist_ok=True)
    _write_deterministic_zip(source_dir, archive_path)
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    checksum_path.write_text(f"{digest}  {archive_path.name}\n", encoding="ascii")
    return archive_path, checksum_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Validate without creating artifacts."
    )
    parser.add_argument(
        "--output-dir", type=Path, help="Artifact directory (default: ./dist)."
    )
    arguments = parser.parse_args()
    source_dir = Path(__file__).resolve().parents[1]

    if arguments.check:
        verify_repository(source_dir)
        print("[SUCCESS] Release integrity and privacy checks passed.")
        return

    output_dir = arguments.output_dir or source_dir / "dist"
    archive_path, checksum_path = package_extension(source_dir, output_dir)
    print(f"[SUCCESS] Packaged {archive_path}")
    print(f"[SUCCESS] Wrote {checksum_path}")


if __name__ == "__main__":
    main()

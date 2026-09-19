#!/usr/bin/env python3
"""Emit manifest.json (all relative file paths) next to each example deck's .pptd,
so the dev-server viewer can load example decks over HTTP without upload.

Run: python3 scripts/gen_example_manifest.py
Output: skills/cowork-ppt/example/<deck>/manifest.json (gitignored-able)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "skills" / "cowork-ppt" / "example"

for deck in sorted(ROOT.iterdir()):
    if not deck.is_dir():
        continue
    files = sorted(
        str(p.relative_to(deck)) for p in deck.rglob("*") if p.is_file() and p.suffix != ".json"
    )
    (deck / "manifest.json").write_text(__import__("json").dumps(files, indent=0))
    print(f"{deck.name}: {len(files)} files")

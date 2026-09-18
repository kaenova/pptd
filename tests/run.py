#!/usr/bin/env python3
"""Runnable self-check: convert all fixture decks + assert structure.

Usage: python3 tests/run.py
"""
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from pptd_utils.main import convert  # noqa: E402

OUT = Path("/tmp/pptd_utils-tests")


def check(name, pptd, out):
    pptd = ROOT / pptd
    dst = OUT / out
    dst.parent.mkdir(parents=True, exist_ok=True)
    convert(pptd, dst)
    assert dst.exists() and dst.stat().st_size > 4000, f"{name}: output too small"
    with zipfile.ZipFile(dst) as z:
        names = z.namelist()
        assert z.testzip() is None, f"{name}: corrupt zip"
        assert "ppt/presentation.xml" in names
    print(f"PASS {name}: {dst}")


def main():
    check("full-spec", "tests/fixtures/full/full.pptd", "full.pptx")
    check("minimal", "skills/cowork-ppt/tests/fixtures/minimal/minimal.pptd",
          "minimal.pptx")
    check("ml-smp", "ml-smp/deck.pptd", "mlsmp.pptx")
    # targeted structural assertions on the full deck
    with zipfile.ZipFile(OUT / "full.pptx") as z:
        charts = [n for n in z.namelist() if "charts/chart" in n and
                  n.endswith(".xml")]
        assert len(charts) == 9, f"expected 9 native charts, got {len(charts)}"
        workbooks = [n for n in z.namelist() if n.endswith(".xlsx")]
        assert len(workbooks) == 9, f"expected 9 embedded workbooks"
        s7 = z.read("ppt/slides/slide7.xml").decode()
        assert "<p:timing" in s7 and "<p:transition" in s7
        assert 'spd="fast"' in s7
        assert z.read("ppt/slides/slide3.xml").decode().count("<a:gridCol") == 3 + 3 + 4 + 2
        s4 = z.read("ppt/slides/slide4.xml").decode()
        assert "graphicFrame" in s4
    print("PASS structural assertions")
    print("ALL OK")


if __name__ == "__main__":
    main()

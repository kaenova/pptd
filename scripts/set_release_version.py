"""Set the CI-only PyPI version; leave the source version unchanged in Git."""
import os
import re
import tomllib
from datetime import datetime, timezone
from pathlib import Path


def set_version(text, version):
    if not re.fullmatch(r"\d{4}\.\d{1,2}\.\d{1,2}\.dev\d+", version):
        raise ValueError(f"Invalid release version: {version}")
    old = tomllib.loads(text)["project"]["version"]
    text, count = re.subn(r'^version = "' + re.escape(old) + r'"$',
                          f'version = "{version}"', text, flags=re.MULTILINE)
    if count != 1:
        raise ValueError("Expected exactly one project version")
    assert tomllib.loads(text)["project"]["version"] == version
    return text


if __name__ == "__main__":
    now = datetime.now(timezone.utc)
    version = os.environ.get("RELEASE_VERSION") or (
        f"{now.year}.{now.month}.{now.day}.dev{os.environ['GITHUB_RUN_NUMBER']}"
    )
    path = Path("pyproject.toml")
    path.write_text(set_version(path.read_text(), version))
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"version={version}\n")
        output.write(f"tag=v{now:%Y.%m.%d}-{os.environ['GITHUB_SHA'][:7]}\n")
    print(f"Release version: {version}")

from set_release_version import set_version

source = '[project]\nversion = "0.1.0"\n'
assert set_version(source, "2026.10.2.dev123") == source.replace("0.1.0", "2026.10.2.dev123")
for invalid in ("2026.10.2+abc", "invalid"):
    try:
        set_version(source, invalid)
    except ValueError:
        pass
    else:
        raise AssertionError(invalid)
print("Release version checks passed")

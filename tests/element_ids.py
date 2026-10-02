"""Run: python3 tests/element_ids.py"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pptd_utils.main import build
import yaml

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    manifest = root / 'deck.pptd'
    manifest.write_text(yaml.safe_dump({'version': 'v2', 'size': [960, 540], 'pages': ['slide.page']}))
    for ids, error in [([None], 'nonempty string'), ([''], 'nonempty string'),
                       (['  '], 'nonempty string'), ([42], 'nonempty string'),
                       (['title', 'title'], 'duplicate elementId')]:
        elements = [{'elementType': 'text', 'bounds': [0, 0, 100, 40],
                     'content': {'text': 'Test'}, 'elementId': i} for i in ids]
        (root / 'slide.page').write_text(yaml.safe_dump({'elements': elements}))
        try:
            build(manifest, root / 'deck.pptx')
        except ValueError as exc:
            assert error in str(exc), str(exc)
        else:
            raise AssertionError(f'accepted invalid IDs: {ids}')
        assert not (root / 'deck.pptx').exists()
    elements[1]['elementId'] = 'body'
    (root / 'slide.page').write_text(yaml.safe_dump({'elements': elements}))
    assert build(manifest, root / 'deck.pptx')[0] == 1
print('element ID checks passed')

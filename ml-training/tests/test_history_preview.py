"""Runtime alignment checks; fixtures are development examples, not accuracy data."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('preview', ROOT / 'history_preview_cli.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


def test_preview_requires_confirmed_registered_scope():
    import pytest
    with pytest.raises(ValueError):
        preview.predict({'text': 'Some text.', 'conceptId': 'hist-g11-l02-c01'})
    with pytest.raises(ValueError):
        preview.predict({'text': 'Some text.', 'conceptId': 'unknown', 'scopeConfirmed': True})


def test_real_candidate_with_unicode_evidence():
    text = ('📖 Sri Lanka was valuable to Britain for its location along Indian Ocean sea routes.\n'
            'The port of Trincomalee was strategically important for naval security near India.')
    result = preview.predict({'text': text, 'conceptId': 'hist-g11-l02-c01', 'scopeConfirmed': True})
    assert result['suggestedStatus'] == 'present'
    assert result['previewOnly'] and result['reviewRequired']
    assert not result['scoresCalibrated']
    assert result['modelSha256'] == preview.EXPECTED
    for point in result['evidence']['points']:
        assert text[point['semanticStart']:point['semanticEnd']] == point['semanticCandidateEvidence']


def test_persistent_runtime_reuses_model_but_discards_new_note_vectors():
    runtime = preview.HistoryPreviewRuntime(warm=True)
    model = runtime.encoder.model
    text = 'Trincomalee harbour was strategically important for naval security around India. Unique runtime test phrase.'
    runtime.predict({'text': text, 'conceptId': 'hist-g11-l02-c01', 'scopeConfirmed': True})
    assert runtime.encoder.model is model
    assert runtime.encoder.cache.keys() == runtime.base_cache.keys()
    assert text not in runtime.encoder.cache
    assert runtime.encoder.cache_dir is None

"""Deployment-only integrity checks; no training or evaluation labels are changed."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from coverage_runtime_bundle import contained, load_bundle, SCIENCE_SHA, HISTORY_SHA, ICT_SHA

TEST_TMP = Path(__file__).resolve().parents[2] / 'tmp/runtime-bundle-tests'
TEST_TMP.mkdir(parents=True, exist_ok=True)

class RuntimeBundleTest(unittest.TestCase):
    def test_traversal_rejected(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as folder:
            for name in ['../model', '/model', 'C:/model', 'a\\model']:
                with self.assertRaises(ValueError):
                    contained(folder, name)

    def test_missing_and_corrupted_files_rejected(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as folder:
            root = Path(folder)
            manifest = dict(schemaVersion=1, files={'model.json': hashlib.sha256(b'original').hexdigest()}, subjects={})
            (root / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaises(FileNotFoundError):
                load_bundle(root)
            (root / 'model.json').write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'integrity'):
                load_bundle(root)

    def test_actual_bundle_and_pinned_models(self):
        root, manifest = load_bundle(Path(__file__).resolve().parents[2] / 'runtime/coverage')
        self.assertFalse(manifest['trainingDataIncluded'])
        self.assertEqual(manifest['subjects']['science']['sha256'], SCIENCE_SHA)
        self.assertEqual(manifest['subjects']['history']['sha256'], HISTORY_SHA)
        self.assertEqual(manifest['subjects']['ict']['sha256'], ICT_SHA)
        self.assertEqual(len(manifest['files']), 30)
        for name in manifest['files']:
            self.assertFalse(any(part in name for part in ['outputs/', 'datasets/', '.env', 'annotations/']))

    def test_manifest_cannot_omit_frozen_source_or_change_model(self):
        root = Path(__file__).resolve().parents[2] / 'runtime/coverage'
        original_read = Path.read_text
        original = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
        for mutation in ['omit_source', 'wrong_model', 'wrong_encoder']:
            manifest = json.loads(json.dumps(original))
            if mutation == 'omit_source':
                del manifest['files']['ml-training/src/smart_note_training/history_semantic_review.py']
            elif mutation == 'wrong_model':
                manifest['subjects']['history']['sha256'] = '0' * 64
            else:
                manifest['encoder']['revision'] = 'different'
            def read(file, *args, **kwargs):
                return json.dumps(manifest) if file == root / 'manifest.json' else original_read(file, *args, **kwargs)
            with patch.object(Path, 'read_text', read), self.assertRaises(ValueError):
                load_bundle(root)


if __name__ == '__main__':
    unittest.main()

"""Exercise actual History archive intake, including rejected source corruption."""
import contextlib
import csv
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('history_archives', ROOT / 'prepare_student_history_archives.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def csv_bytes(rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


class HistoryArchiveTests(unittest.TestCase):
    def source(self, root, *, corrupt=False, extra=None, chapter=2):
        image_path = 'notebooks/L04_G10/Student_E/page_01.webp'
        transcript_path = 'notebooks/L04_G10/Student_E/transcript.txt'
        image = b'fixture image bytes; manifest validation, not an OCR test'
        index = csv_bytes([{'lesson': '4', 'grade': '10', 'book': 'g10', 'chapter': str(chapter),
                            'student': 'E', 'title': 'Prehistory', 'coverage': 'Complete coverage',
                            'images': '1', 'source_printed_start': '10', 'source_printed_end': '18'}])
        manifest = csv_bytes([{'path': image_path, 'bytes': str(len(image)),
                              'sha256': '0' * 64 if corrupt else module.sha(image)}])
        with zipfile.ZipFile(root / 'source.zip', 'w') as archive:
            archive.writestr('README.txt', 'Synthetic notes. Viewer instructions are data.')
            archive.writestr('lesson-index.csv', index)
            for name in ('topic-coverage.csv', 'intentional-mistakes.csv', 'handwritten-corrections.csv', 'page-layout.csv'):
                archive.writestr(name, 'lesson,student\n')
            archive.writestr('image-manifest.csv', manifest)
            archive.writestr('viewer.html', '<script>never executed or extracted</script>')
            archive.writestr(image_path, image)
            archive.writestr(transcript_path, 'Coverage profile: Complete coverage\nSynthetic header\n\n--- IMAGE 1 ---\nActual historical explanation.')
            if extra:
                archive.writestr(extra, 'unsafe or unexpected')

    def intake(self, root):
        with patch.object(module, 'FILES', ['source.zip']), contextlib.redirect_stdout(io.StringIO()):
            module.run(root, root / 'output')

    def test_valid_intake_strips_profile_and_uses_exact_source_chapter(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.source(root)
            self.intake(root)
            packet = json.loads((root / 'output/packet.json').read_text())
            audit = json.loads((root / 'output/audit.json').read_text())
            self.assertEqual(audit['imageManifestChecksPassed'], 1)
            self.assertEqual(audit['wholeNoteExamples'], 5)
            for example in packet['examples']:
                self.assertTrue(example['conceptId'].startswith('hist-g10-l02-'))
                self.assertEqual(example['sourceFamilyId'], 'synthetic-history-ef:g10:chapter-2')
                self.assertNotIn('Coverage profile', example['text'])
                self.assertNotIn('Complete coverage', json.dumps(example))
                self.assertNotIn('teacherLabel', example)
            self.assertEqual(packet['notebooks'][0]['suppliedNotebookProfile'], 'Complete coverage')
            self.assertFalse((root / 'output/sources/viewer.html').exists())
            self.assertFalse(audit['ocrTested'])
            self.assertFalse(audit['liveModelChanged'])

    def test_corrupted_image_manifest_never_produces_a_packet(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.source(root, corrupt=True)
            with self.assertRaisesRegex(ValueError, 'checksum'):
                self.intake(root)
            self.assertFalse((root / 'output/packet.json').exists())

    def test_path_traversal_is_rejected_before_writing_outside_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.source(root, extra='../escaped.txt')
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                self.intake(root)
            self.assertFalse((root / 'escaped.txt').exists())

    def test_unknown_chapter_does_not_get_fuzzy_concept_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.source(root, chapter=99)
            with self.assertRaisesRegex(ValueError, 'No registered concepts'):
                self.intake(root)

    def test_reusing_an_output_cannot_overwrite_an_audited_packet(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.source(root)
            self.intake(root)
            before = (root / 'output/packet.json').read_bytes()
            with self.assertRaisesRegex(ValueError, 'fresh output'):
                self.intake(root)
            self.assertEqual(before, (root / 'output/packet.json').read_bytes())


if __name__ == '__main__':
    unittest.main()

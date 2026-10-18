import importlib.util
from pathlib import Path
import unittest

PATH=Path(__file__).resolve().parents[1]/'prepare_student_science_archives.py'
spec=importlib.util.spec_from_file_location('student_archives',PATH)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ArchiveTests(unittest.TestCase):
    def test_unsafe_paths_rejected(self):
        for name in ['../outside.txt','/absolute.txt','C:/outside.txt','notes\\outside.txt','x/../outside.txt']:
            with self.assertRaises(ValueError):module.safe_name(name)

    def test_profile_header_never_reaches_model_text(self):
        pages=module.transcript_pages('Coverage: Complete coverage\nSynthetic notes\n\n--- IMAGE 1 ---\nActual note\n\n--- IMAGE 2 ---\nSecond page')
        self.assertEqual(pages,['Actual note','Second page'])
        self.assertNotIn('Complete coverage',' '.join(pages))

    def test_page_number_gaps_rejected(self):
        with self.assertRaises(ValueError):module.transcript_pages('--- IMAGE 1 ---\nOne\n--- IMAGE 3 ---\nThree')

if __name__=='__main__':unittest.main()

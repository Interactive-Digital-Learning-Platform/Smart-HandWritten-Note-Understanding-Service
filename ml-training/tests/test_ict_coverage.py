"""Checks of review integrity and safety behavior, not model accuracy claims."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'src'))
from ict_review_intake import validate, load_review, PACKET
from smart_note_training.ict_coverage import conflicts, ICTPredictor
from smart_note_training.ict_coverage_v11 import is_explicit_rom_retention
from smart_note_training.ict_coverage_v3 import unanswered_instruction_block, ICTFeaturesV3
from smart_note_training.ict_coverage_v31 import explicit_cc_role
from smart_note_training.ict_coverage import FEATURES
import numpy as np


class ICTReviewTest(unittest.TestCase):
    def setUp(self):
        self.packet = json.loads(PACKET.read_text(encoding='utf-8'))
        self.review = copy.deepcopy(self.packet)
        self.review.update(reviewComplete=True, reviewerName='Test reviewer')
        for row in self.review['examples']:
            row['humanLabel'] = 'partial'
        for row in self.review['concepts']:
            row['criterionReview'] = 'approve'

    def test_review_accepts_only_unchanged_input_identity(self):
        self.assertTrue(validate(self.packet, self.review))
        for field, change in [('text', 'Altered note'), ('conceptId', 'foreign'), ('textSha256', '0'*64)]:
            altered = copy.deepcopy(self.review)
            altered['examples'][0][field] = change
            with self.assertRaises(ValueError):
                validate(self.packet, altered)

    def test_missing_duplicate_and_changed_criteria_rejected(self):
        altered = copy.deepcopy(self.review)
        altered['examples'][0] = altered['examples'][1]
        with self.assertRaises(ValueError):
            validate(self.packet, altered)
        altered = copy.deepcopy(self.review)
        altered['concepts'][0]['points'][0]['text'] = 'Unapproved criterion change'
        with self.assertRaises(ValueError):
            validate(self.packet, altered)
        altered = copy.deepcopy(self.review)
        altered['examples'][0]['humanLabel'] = 'correct'
        with self.assertRaises(ValueError):
            validate(self.packet, altered)

    def test_submitted_ai_provenance_is_not_promoted_to_human(self):
        review, audit = load_review(Path('C:/Users/DLK/Downloads/ict-coverage-source-reviewed.json'))
        self.assertFalse(audit['independentHumanValidation'])
        self.assertFalse(review['independentAccuracyClaimAllowed'])
        self.assertIn('AI-assisted', review['reviewProvenance'])
        self.assertTrue(audit['sourcePdfHashesVerified'])

    def test_conflict_spans_and_legitimate_negations(self):
        examples = [
            ('ict-g10-u02-ram-rom', '🧪 RAM retains startup instructions without power. ROM is volatile memory.'),
            ('ict-g11-u03-cc-bcc', 'Bcc addresses are visible to all recipients.'),
            ('ict-g11-u03-dns', 'DNS sends email attachments to people.'),
        ]
        for concept, text in examples:
            issues = conflicts(text, concept)
            self.assertTrue(issues)
            for issue in issues:
                self.assertEqual(text[issue['start']:issue['end']], issue['quote'])
        self.assertEqual(conflicts('Recipients in To and Cc cannot see Bcc addresses.', 'ict-g11-u03-cc-bcc'), [])
        self.assertEqual(conflicts('ROM retains startup instructions without power.', 'ict-g10-u02-ram-rom'), [])

    def test_wrong_artifact_fails_before_inference(self):
        with self.assertRaises(ValueError):
            ICTPredictor({'schemaVersion': 1, 'modelType': 'other'}, None)

    def test_v11_retention_exception_is_narrow(self):
        issue = dict(kind='possible_ict_role_conflict', quote='ROM because this memory does not lose its contents when power')
        self.assertTrue(is_explicit_rom_retention(issue, 'ict-g10-u02-ram-rom'))
        self.assertFalse(is_explicit_rom_retention(dict(issue, quote='ROM is volatile memory'), 'ict-g10-u02-ram-rom'))
        self.assertFalse(is_explicit_rom_retention(issue, 'ict-g11-u03-cc-bcc'))

    def test_full_question_block_is_not_treated_as_an_answer(self):
        text = 'Discuss RAM temporarily stores working data.; ROM retains startup instructions.? Answer later.'
        self.assertTrue(unanswered_instruction_block(text))
        self.assertFalse(unanswered_instruction_block('Explain RAM? RAM is volatile and loses its data when power is removed.'))
        self.assertFalse(unanswered_instruction_block('RAM stores working data temporarily.'))

    def test_cc_mentioned_in_bcc_rule_does_not_substantiate_cc_role(self):
        self.assertFalse(explicit_cc_role('Blind carbon copy delivers the email without displaying Bcc addresses to the people in the To and Cc fields.'))
        self.assertTrue(explicit_cc_role('Cc sends copies to additional people. Bcc hides its recipient addresses.'))
        self.assertTrue(explicit_cc_role('Using Cc gives additional recipients a copy of the email.'))

    def test_v3_features_suppress_unanswered_semantics_and_accept_rom_retention(self):
        class FixtureEncoder:
            def encode(self, texts):
                return np.ones((len(texts), 2)) / np.sqrt(2)
        rubric = json.loads((ROOT / 'outputs/ict-coverage-v2-2026-10-15/rubrics.json').read_text(encoding='utf-8'))
        extractor = ICTFeaturesV3(rubric, FixtureEncoder()).fit([{'text':'RAM stores temporary data. ROM stores startup instructions.'}])
        text = 'Discuss RAM temporarily stores working data.; ROM retains startup instructions.? Answer later.'
        values,evidence = extractor.one(text, 'ict-g10-u02-ram-rom', True)
        self.assertEqual(values[FEATURES.index('unanswered_prompts_only')], 1)
        self.assertTrue(all(values[i] == 0 for i,n in enumerate(FEATURES) if n.startswith('semantic_')))
        self.assertEqual(evidence['concerns'][-1]['quote'], text)
        text = 'RAM loses data at power-off. ROM stores startup instructions and does not lose its contents when power is removed.'
        values,evidence = extractor.one(text,'ict-g10-u02-ram-rom',True)
        self.assertEqual(values[-1], 0)
        self.assertFalse(evidence['concerns'])


if __name__ == '__main__':
    unittest.main()

"""V1.1 review-only fix; the V1 head and feature extraction remain unchanged."""
import copy
import re
from .ict_coverage import ICTPredictor, POLICY

POLICY_V11 = 'ict-review-policy-v1.1'


def is_explicit_rom_retention(concern, concept_id):
    return (concept_id.endswith('ram-rom') and concern['kind'] == 'possible_ict_role_conflict'
        and re.search(r'\bROM\b', concern['quote'], re.I) is not None
        and re.search(r'\bdoes\s+not\s+lose\b', concern['quote'], re.I) is not None)


class ICTPredictorV11(ICTPredictor):
    def __init__(self, artifact, encoder):
        if artifact.get('reviewPolicy') != POLICY_V11:
            raise ValueError('Unsupported ICT V1.1 review policy')
        original = artifact
        base = copy.deepcopy(artifact)
        base['reviewPolicy'] = POLICY
        super().__init__(base, encoder)
        self.artifact = original

    def predict(self, text, concept_id, language='English', scope_confirmed=False):
        result = super().predict(text, concept_id, language, scope_confirmed)
        result['evidence']['concerns'] = [c for c in result['evidence']['concerns']
            if not is_explicit_rom_retention(c, concept_id)]
        raw, issues = result['rawModelStatus'], result['evidence']['concerns']
        prompt = any(c['kind'] == 'prompt_or_heading_only' for c in issues)
        withheld = (raw == 'present' and bool(issues)) or (prompt and raw != 'missing')
        result.update(suggestedStatus=None if withheld else raw, suggestionWithheld=withheld,
            completeSuggestionWithheld=withheld and raw == 'present', reviewPolicyVersion=POLICY_V11)
        return result

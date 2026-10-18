"""Correct prompt-block and explicit ROM-retention features before fitting V3."""
import copy
import re
from .ict_coverage import ICTFeatures, FEATURES
from .ict_coverage_v11 import ICTPredictorV11, POLICY_V11, is_explicit_rom_retention

POLICY_V3 = 'ict-review-policy-v3'


def unanswered_instruction_block(text):
    return bool(re.match(r'^\s*(?:explain|describe|discuss|compare|list|define|state)\b', text, re.I)
        and re.search(r'(?:answer later|(?:these|this)\s+(?:revision\s+)?questions?\s+(?:is|are|remain)\s+unanswered)\s*[.!?]*\s*$', text, re.I))


class ICTFeaturesV3(ICTFeatures):
    def one(self, text, concept_id, explain=False):
        values, evidence = super().one(text, concept_id, True)
        evidence['concerns'] = [c for c in evidence['concerns'] if not is_explicit_rom_retention(c, concept_id)]
        values[-1] = sum(c['kind'] == 'possible_ict_role_conflict' for c in evidence['concerns'])
        if unanswered_instruction_block(text):
            values[FEATURES.index('unanswered_prompts_only')] = 1
            values[FEATURES.index('assertion_fraction')] = 0
            for i, name in enumerate(FEATURES):
                if name.startswith('semantic_'):
                    values[i] = 0
            evidence['concerns'].append(dict(start=0,end=len(text),quote=text,kind='unanswered_instruction_block'))
            for point in evidence['points']:
                point['semanticUseSuppressedByPromptPolicy'] = True
        return values, evidence


class ICTPredictorV3(ICTPredictorV11):
    def __init__(self, artifact, encoder):
        if artifact.get('reviewPolicy') != POLICY_V3:
            raise ValueError('Unsupported ICT V3 policy')
        base = copy.deepcopy(artifact)
        base['reviewPolicy'] = POLICY_V11
        super().__init__(base, encoder)
        self.artifact = artifact
        self.extractor = ICTFeaturesV3.restore(artifact)
        self.extractor.encoder = encoder

    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        result = super().predict(text,concept_id,language,scope_confirmed)
        prompt = unanswered_instruction_block(text) or any(c['kind']=='prompt_or_heading_only' for c in result['evidence']['concerns'])
        raw = result['rawModelStatus']
        withheld = (raw=='present' and bool(result['evidence']['concerns'])) or (prompt and raw!='missing')
        result.update(suggestedStatus=None if withheld else raw,suggestionWithheld=withheld,
            completeSuggestionWithheld=withheld and raw=='present',reviewPolicyVersion=POLICY_V3)
        return result

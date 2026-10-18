"""Conservative positive-coverage review; no trained weights are modified."""
import copy
import re
from .ict_coverage_v3 import ICTPredictorV3, POLICY_V3

POLICY_V31 = 'ict-review-policy-v3.1'


def explicit_cc_role(text):
    # Cc named as a recipient group in a Bcc explanation does not explain Cc.
    # Unrecognized phrasings are sent for review, never relabelled as absent.
    clauses = re.split(r'[.!?;\n]', text)
    return any(re.match(r'^\s*(?:(?:the|using|a)\s+)?(?:Cc|carbon copy)\b', clause, re.I)
        and re.search(r'\b(?:copy|copies|recipients|people)\b', clause, re.I) for clause in clauses)


class ICTPredictorV31(ICTPredictorV3):
    def __init__(self, artifact, encoder):
        if artifact.get('reviewPolicy') != POLICY_V31:
            raise ValueError('Unsupported ICT V3.1 policy')
        base = copy.deepcopy(artifact)
        base['reviewPolicy'] = POLICY_V3
        super().__init__(base, encoder)
        self.artifact = artifact

    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        result = super().predict(text,concept_id,language,scope_confirmed)
        raw = result['rawModelStatus']
        if raw=='present' and concept_id.endswith('cc-bcc') and not explicit_cc_role(text):
            result['evidence']['concerns'].append(dict(start=0,end=len(text),quote=text,
                kind='cc_sending_role_not_explicit',reason='Cc mentioned in the Bcc visibility rule alone does not explain the Cc sending role.'))
        conflicts = any(c['kind']=='possible_ict_role_conflict' for c in result['evidence']['concerns'])
        withheld = result['suggestionWithheld'] or (raw!='missing' and conflicts) or (raw=='present' and bool(result['evidence']['concerns']))
        result.update(suggestedStatus=None if withheld else raw,suggestionWithheld=withheld,
            completeSuggestionWithheld=withheld and raw=='present',reviewPolicyVersion=POLICY_V31)
        return result

"""ICT pilot: frozen sentence encoder, rubric features and a trained linear head.

Conflict rules only flag evidence for review; they do not replace model labels.
"""
import re
import numpy as np
from .english_coverage import LABELS
from .history_semantic import SemanticHistoryFeatures, SEMANTIC_FEATURES
from .history_coverage_v31 import prompt_signals

FEATURES = SEMANTIC_FEATURES + ['ict_conflict_count']
POLICY = 'ict-review-policy-v1'


def conflicts(text, concept):
    patterns = []
    if concept.endswith('ram-rom'):
        patterns = [r'\bRAM\s+(?:is\s+)?(?:permanently\s+)?(?:retains?|stores?|holds?)\b[^.;\n]{0,70}\b(?:without (?:power|electricity)|power (?:is )?off|boot instructions)',
                    r'\bROM\s+(?:is\s+)?(?:the\s+)?(?:temporary|volatile)\b',
                    r'\bROM\b[^.;\n]{0,35}\b(?:loses?|erased)\b[^.;\n]{0,45}\b(?:power|electricity|off)\b']
    elif concept.endswith('cpu'):
        patterns = [r'\bALU\s+(?:controls?|directs?|coordinates?)\b[^.;\n]{0,45}',
                    r'\bcontrol unit\s+(?:performs?|does?)\s+(?:all\s+)?(?:arithmetic|calculations)\b[^.;\n]{0,30}']
    elif concept.endswith('os'):
        patterns = [r'\boperating system\s+is\s+(?:a\s+)?physical\s+(?:input\s+)?device\b']
    elif concept.endswith('dns'):
        patterns = [r'\bDNS\s+(?:stores?|sends?)\b[^.;\n]{0,60}\b(?:email|mail|attachments?)\b',
                    r'\bDNS\s+(?:converts?|translates?|maps?)\s+IP addresses?\s+(?:to|into)\s+domain names?\b']
    elif concept.endswith('cc-bcc'):
        patterns = [r'\b(?:To and Cc|To/Cc|To or Cc)\s+recipients?\s+can\s+(?:all\s+)?see\s+(?:the\s+)?Bcc\s+(?:address|recipient)',
                    r'\bBcc\s+(?:addresses|recipients)\s+are\s+(?:visible|shown)\s+to\s+(?:all|every|To|Cc)\b']
    result = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.I):
            result.append(dict(start=match.start(), end=match.end(), quote=match.group(), kind='possible_ict_role_conflict'))
    return result


class ICTFeatures(SemanticHistoryFeatures):
    def one(self, text, concept_id, explain=False):
        values, evidence = super().one(text, concept_id, True)
        # ICT has correct negations such as non-volatile and cannot see Bcc.
        # Do not treat a generic negation warning as a factual contradiction.
        evidence['concerns'] = [c for c in evidence['concerns'] if c['kind'] != 'possible_negated_requirement']
        issues = conflicts(text, concept_id)
        evidence['concerns'].extend(issues)
        return np.concatenate([values, [len(issues)]]), evidence


class ICTPredictor:
    def __init__(self, artifact, encoder):
        if artifact.get('modelType') != 'ict_minilm_rubric_logistic_regression' or artifact.get('schemaVersion') != 1 or artifact.get('features') != FEATURES or artifact.get('labels') != list(LABELS):
            raise ValueError('Incompatible ICT artifact')
        if artifact['encoder']['revision'] != encoder.manifest['revision'] or artifact['reviewPolicy'] != POLICY:
            raise ValueError('ICT runtime mismatch')
        self.artifact = artifact
        self.extractor = ICTFeatures.restore(artifact)
        self.extractor.encoder = encoder
        self.mean = np.asarray(artifact['scalerMean'])
        self.scale = np.asarray(artifact['scalerScale'])
        self.weights = np.asarray(artifact['weights'])
        self.intercept = np.asarray(artifact['intercept'])
        if self.mean.shape != (len(FEATURES),) or self.scale.shape != self.mean.shape or self.weights.shape != (3, len(FEATURES)) or self.intercept.shape != (3,):
            raise ValueError('Invalid ICT parameter shape')
        if not all(np.isfinite(v).all() for v in [self.mean, self.scale, self.weights, self.intercept]) or np.any(self.scale <= 0):
            raise ValueError('Invalid ICT parameters')

    def probabilities(self, values):
        logits = ((values - self.mean) / self.scale) @ self.weights.T + self.intercept
        logits -= logits.max(axis=-1, keepdims=True)
        values = np.exp(logits)
        return values / values.sum(axis=-1, keepdims=True)

    def predict(self, text, concept_id, language='English', scope_confirmed=False):
        if not isinstance(text, str) or not text.strip() or len(text) > 20000:
            raise ValueError('Provide 1-20000 characters')
        if language.lower() not in ['english', 'en'] or re.search(r'[\u0d80-\u0dff]', text) or scope_confirmed is not True:
            raise ValueError('English and confirmed concept scope required')
        values, evidence = self.extractor.one(text, concept_id, True)
        scores = self.probabilities(values)
        raw = LABELS[int(scores.argmax())]
        prompt = bool(prompt_signals(text)[0])
        heading = text.strip().lower().rstrip(':') == self.extractor.concepts[concept_id]['name'].lower()
        if prompt or heading:
            evidence['concerns'].append(dict(start=0, end=len(text), quote=text, kind='prompt_or_heading_only'))
        withheld = (raw == 'present' and bool(evidence['concerns'])) or ((prompt or heading) and raw != 'missing')
        return dict(status=None, suggestedStatus=None if withheld else raw, rawModelStatus=raw,
            suggestionWithheld=withheld, completeSuggestionWithheld=withheld and raw == 'present',
            reviewRequired=True, scoresCalibrated=False, scores=dict(zip(LABELS, scores.tolist())),
            modelVersion=self.artifact['metadata']['experimentId'], reviewPolicyVersion=POLICY,
            evidence=evidence, offsetUnit='unicode_code_points', experimental=True)

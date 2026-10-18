"""Retain the History concept head while adding learned required-point support.

The frozen encoder is shared. Point support is input evidence for the small
concept classifier, rather than a rule that promotes a related passage to Complete.
"""
import numpy as np
from .english_coverage import LABELS
from .history_semantic_core import SemanticCoreFeatures, CORE_FEATURES
from .history_point_coverage import PointCoveragePredictor
from .history_semantic_review import semantic_support_concerns

FEATURES = CORE_FEATURES + ['point_complete_score', 'point_partial_score', 'point_missing_score',
    'point_complete_fraction', 'point_partial_fraction', 'point_missing_fraction']


class PointCoreFeatures:
    def __init__(self, artifact, encoder):
        self.semantic = SemanticCoreFeatures.restore(artifact)
        self.semantic.encoder = encoder
        self.point = PointCoveragePredictor(artifact['pointModel'], encoder)

    def one(self, text, concept_id):
        base, evidence = self.semantic.one(text, concept_id, True)
        point = self.point.predict(text, concept_id, 'English', True)
        labels = [p['learnedCoverageStatus'] for p in point['evidence']['points']]
        values = [point['scores'][label] for label in LABELS] + [labels.count(label)/len(labels) for label in LABELS]
        by_id = {p['pointId']: p for p in point['evidence']['points']}
        for p in evidence['points']:
            p['learnedCoverageStatus'] = by_id[p['pointId']]['learnedCoverageStatus']
            p['coverageScores'] = by_id[p['pointId']]['coverageScores']
        evidence['concerns'].extend(c for c in point['evidence']['concerns'] if c['kind'] in ('possible_ocr_year_ambiguity','sweeping_equivalence_requires_review'))
        return np.r_[base, values], evidence


class PointCorePredictor:
    def __init__(self, artifact, encoder):
        if artifact.get('schemaVersion') != 8 or artifact.get('features') != FEATURES or artifact.get('labels') != list(LABELS):
            raise ValueError('Incompatible History point-assisted concept model')
        self.artifact = artifact
        self.extractor = PointCoreFeatures(artifact, encoder)
        self.mean = np.asarray(artifact['scalerMean']); self.scale = np.asarray(artifact['scalerScale'])
        self.weights = np.asarray(artifact['weights']); self.intercept = np.asarray(artifact['intercept'])
        n = len(FEATURES)
        if (self.mean.shape != (n,) or self.scale.shape != (n,) or self.weights.shape != (3,n) or self.intercept.shape != (3,)
            or not all(np.isfinite(v).all() for v in (self.mean,self.scale,self.weights,self.intercept)) or (self.scale <= 0).any()):
            raise ValueError('Invalid History concept model parameters')

    def predict(self, text, concept_id, language='English', scope_confirmed=False):
        # The point predictor performs the same input/language/scope validation.
        self.extractor.point.predict(text, concept_id, language, scope_confirmed)
        x, evidence = self.extractor.one(text, concept_id)
        logits = ((x-self.mean)/self.scale)@self.weights.T+self.intercept
        scores = np.exp(logits-logits.max()); scores /= scores.sum()
        raw = LABELS[int(scores.argmax())]
        result = {'status':None, 'rawModelStatus':raw, 'suggestedStatus':raw, 'scores':dict(zip(LABELS,scores.tolist())),
            'scoresCalibrated':False, 'reviewRequired':True, 'modelVersion':self.artifact['metadata']['experimentId'],
            'evidence':evidence, 'completeSuggestionWithheld':False, 'suggestionWithheld':False}
        evidence['concerns'].extend(semantic_support_concerns(result,self.artifact['rubrics']))
        if (raw == 'present' and evidence['concerns']) or any(c['kind']=='possible_ocr_year_ambiguity' for c in evidence['concerns']):
            result['suggestedStatus'] = None; result['suggestionWithheld'] = True
            result['completeSuggestionWithheld'] = raw == 'present'
        result['reviewPolicyVersion'] = 'point-assisted-semantic-review-v1'
        return result

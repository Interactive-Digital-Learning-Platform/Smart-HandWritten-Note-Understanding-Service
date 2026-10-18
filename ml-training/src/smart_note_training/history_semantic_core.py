"""Semantic/safety-only linear head ablation; lexical features not in the head."""
import numpy as np
from .english_coverage import LABELS
from .history_coverage_v31 import HistoryPredictorV31
from .history_semantic import SemanticHistoryFeatures,SEMANTIC_FEATURES

SELECTED=list(range(29,35))+list(range(22,29))
CORE_FEATURES=[SEMANTIC_FEATURES[i] for i in SELECTED]


class SemanticCoreFeatures(SemanticHistoryFeatures):
    def one(self,text,concept_id,explain=False):
        x,evidence=super().one(text,concept_id,explain)
        return x[SELECTED],evidence


class SemanticCorePredictor(HistoryPredictorV31):
    def __init__(self,artifact,encoder):
        if artifact.get('schemaVersion')!=5 or artifact.get('features')!=CORE_FEATURES or artifact.get('labels')!=list(LABELS):raise ValueError('Incompatible semantic core artifact')
        if encoder.manifest['revision']!=artifact['encoder']['revision']:raise ValueError('Wrong encoder revision')
        self.artifact=artifact;self.extractor=SemanticCoreFeatures.restore(artifact);self.extractor.encoder=encoder
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        if self.mean.shape!=(len(CORE_FEATURES),) or self.scale.shape!=self.mean.shape or self.weights.shape!=(3,len(CORE_FEATURES)) or self.intercept.shape!=(3,):raise ValueError('Invalid dimensions')
        if not all(np.isfinite(v).all() for v in [self.mean,self.scale,self.weights,self.intercept]) or np.any(self.scale<=0):raise ValueError('Invalid parameters')

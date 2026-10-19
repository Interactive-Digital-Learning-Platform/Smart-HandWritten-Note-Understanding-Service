"""Existing linear History concept head augmented with passage-local support."""
import numpy as np
from .english_coverage import LABELS
from .history_point_core import PointCoreFeatures,PointCorePredictor,FEATURES as CORE_POINT_FEATURES
from .history_evidence import EvidenceFeatures,EVIDENCE_FEATURES
from .history_semantic import semantic_spans,genuine_negation
from .history_coverage_v31 import prompt_signals

LOCAL_NAMES=['retrieved_competitor_margin','retrieved_local_group_coverage','retrieved_name_min',
    'retrieved_clause_min','retrieved_distinctive_recall','retrieved_polarity_agreement','retrieved_reminder_only']
FEATURES=CORE_POINT_FEATURES+[name+'_'+stat for name in LOCAL_NAMES for stat in ('min','mean')]+['document_specificity_min','shared_passage_fraction']
SIGNED_FEATURES=FEATURES+['positive_assertion_similarity_min','positive_assertion_similarity_max']


def positive_assertion_features(text,concept,encoder):
    spans=semantic_spans(text)
    # Adjacent negative sentences must not make a separately stated positive
    # fact disappear. Conversely, an entirely denied answer has no positive
    # assertion supporting the required explanation.
    candidates=[q for _,_,q in spans if not genuine_negation(q) and not prompt_signals(q)[0] and prompt_signals(q)[1]>0]
    if not candidates:return np.zeros(2)
    requirements=[p['text'] for p in concept['points']]
    values=encoder.encode(requirements)@encoder.encode(candidates).T
    best=values.max(axis=1)
    return np.asarray([best.min(),best.max()])


class GroundedCoreFeatures(PointCoreFeatures):
    def __init__(self,artifact,encoder):
        super().__init__(artifact,encoder)
        self.grounded=EvidenceFeatures(artifact['rubrics'],encoder)

    def one(self,text,concept_id):
        base,evidence=super().one(text,concept_id)
        point_features,local_evidence=self.grounded.one(text,concept_id)
        extra=[]
        for name in LOCAL_NAMES:
            values=point_features[:,EVIDENCE_FEATURES.index(name)]
            extra.extend([values.min(),values.mean()])
        extra.extend([point_features[:,20].min(),1-len({(p['semanticStart'],p['semanticEnd']) for p in local_evidence})/len(local_evidence)])
        local={p['pointId']:p for p in local_evidence}
        for p in evidence['points']:
            p['passageSupport']=local[p['pointId']]['passageSupport']
        return np.r_[base,extra],evidence


class GroundedCorePredictor(PointCorePredictor):
    def __init__(self,artifact,encoder):
        if artifact.get('schemaVersion')!=10 or artifact.get('features')!=FEATURES or artifact.get('labels')!=list(LABELS):
            raise ValueError('Incompatible grounded History concept model')
        self.artifact=artifact
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        n=len(FEATURES)
        if (self.mean.shape!=(n,) or self.scale.shape!=(n,) or self.weights.shape!=(3,n) or self.intercept.shape!=(3,) or
            not all(np.isfinite(v).all() for v in (self.mean,self.scale,self.weights,self.intercept)) or (self.scale<=0).any()):
            raise ValueError('Invalid grounded History parameters')
        self.extractor=GroundedCoreFeatures(artifact,encoder)


class GroundedKernelPredictor(PointCorePredictor):
    """Small trained SVM head; no additional encoder, network or service."""
    schema_version=11
    feature_names=FEATURES
    extractor_class=GroundedCoreFeatures
    def __init__(self,artifact,encoder):
        if (artifact.get('schemaVersion')!=self.schema_version or artifact.get('features')!=self.feature_names or artifact.get('labels')!=list(LABELS)
            or artifact['encoder']['revision']!=encoder.manifest['revision'] or artifact['pointModel']['rubrics']!=artifact['rubrics']):
            raise ValueError('Incompatible grounded History kernel model')
        self.artifact=artifact
        n=len(self.feature_names)
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        if self.mean.shape!=(n,) or self.scale.shape!=(n,) or not np.isfinite(self.mean).all() or not np.isfinite(self.scale).all() or (self.scale<=0).any():
            raise ValueError('Invalid History scaling parameters')
        if len(artifact['heads'])!=3:raise ValueError('Invalid History class heads')
        self.heads=[]
        for h in artifact['heads']:
            sv=np.asarray(h['supportVectors']);dual=np.asarray(h['dualCoefficients'])
            if sv.ndim!=2 or sv.shape[1]!=n or not 1<=len(sv)<=10000 or dual.shape!=(len(sv),) or not np.isfinite(sv).all() or not np.isfinite(dual).all() or not np.isfinite(h['intercept']) or not np.isfinite(h['gamma']) or h['gamma']<=0:
                raise ValueError('Invalid History support vectors')
            self.heads.append((sv,dual,float(h['intercept']),float(h['gamma'])))
        self.extractor=self.extractor_class(artifact,encoder)

    def class_scores(self,x):
        scaled=(x-self.mean)/self.scale
        logits=np.asarray([np.exp(-gamma*np.square(sv-scaled).sum(axis=1))@dual+bias for sv,dual,bias,gamma in self.heads])
        scores=np.exp(logits-logits.max())
        return scores/scores.sum()


class GroundedSignedFeatures(GroundedCoreFeatures):
    def one(self,text,concept_id):
        x,evidence=super().one(text,concept_id)
        signed=positive_assertion_features(text,self.grounded.concepts[concept_id],self.grounded.encoder)
        return np.r_[x,signed],evidence


class GroundedSignedKernelPredictor(GroundedKernelPredictor):
    schema_version=12
    feature_names=SIGNED_FEATURES
    extractor_class=GroundedSignedFeatures

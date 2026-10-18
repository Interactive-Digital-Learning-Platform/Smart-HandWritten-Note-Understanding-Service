"""History candidate V3: distinguish prompts from substantive answers."""
import re
import numpy as np
from .english_coverage import LABELS
from .history_coverage import HistoryFeatures,HistoryPredictor,HISTORY_FEATURES

FEATURES_V3=HISTORY_FEATURES+['unanswered_prompts_only','assertion_fraction']


def prompt_signals(text):
    pieces=list(re.finditer(r'[^.!?\n]+[.!?]?',text))
    prompts=assertions=0
    for part in pieces:
        s=part.group().strip()
        if not s:continue
        # Meta notes about unfinished work convey no subject explanation.
        if re.search(r'\b(?:unanswered|answer later|not (?:yet )?(?:answered|provided|written)|need to (?:write|answer)|still need|todo)\b',s,re.I):continue
        if s.endswith('?') or re.match(r'^(?:explain|describe|define|list|name|identify|give|state|outline|compare|discuss|evaluate)\b',s,re.I):
            prompts+=1;continue
        # Accept short informative statements, including answers after a question.
        if re.search(r'\b(?:is|are|was|were|has|have|had|include|includes|provide|provides|supplies|show|shows|reveal|reveals|wrote|compiled|continued|date|dates|belong|belongs|protect|preserve|destroy|damage|can|should|must|survived|adapted)\b',s,re.I):
            assertions+=1;continue
        if len(re.findall(r'\w+',s))>9:assertions+=1
    return float(prompts>0 and assertions==0),assertions/max(1,prompts+assertions)


class HistoryFeaturesV3(HistoryFeatures):
    def one(self,text,concept_id,explain=False):
        x,evidence=super().one(text,concept_id,explain)
        return np.concatenate([x,prompt_signals(text)]),evidence


class HistoryPredictorV3(HistoryPredictor):
    def __init__(self,artifact):
        if artifact.get('schemaVersion')!=3 or artifact.get('features')!=FEATURES_V3 or artifact.get('labels')!=list(LABELS):raise ValueError('Incompatible History V3 artifact')
        self.artifact=artifact;self.extractor=HistoryFeaturesV3.restore(artifact)
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        if self.mean.shape!=(len(FEATURES_V3),) or self.scale.shape!=self.mean.shape or self.weights.shape!=(3,len(FEATURES_V3)) or self.intercept.shape!=(3,):raise ValueError('Invalid dimensions')
        if not all(np.isfinite(v).all() for v in [self.mean,self.scale,self.weights,self.intercept]) or np.any(self.scale<=0):raise ValueError('Invalid parameters')

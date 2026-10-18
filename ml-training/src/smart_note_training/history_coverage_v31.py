"""History candidate V3: distinguish prompts from substantive answers."""
import re
import numpy as np
from .english_coverage import LABELS
from .history_coverage import HistoryFeatures,HistoryPredictor,HISTORY_FEATURES

FEATURES_V31=HISTORY_FEATURES+['unanswered_prompts_only','assertion_fraction']


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
        if re.search(r'\b(?:is|are|was|were|has|have|had|include|includes|provide|provides|supplies|show|shows|reveal|reveals|wrote|compiled|continued|date|dates|belong|belongs|protect|preserve|destroy|damage|can|should|must|survived|adapted|reorganized|established|reshaped|began|valued|wanted|developed)\b',s,re.I):
            assertions+=1;continue
        if len(re.findall(r'\w+',s))>9:assertions+=1
    return float(prompts>0 and assertions==0),assertions/max(1,prompts+assertions)


class HistoryFeaturesV31(HistoryFeatures):
    def one(self,text,concept_id,explain=False):
        x,evidence=super().one(text,concept_id,explain)
        return np.concatenate([x,prompt_signals(text)]),evidence


class HistoryPredictorV31(HistoryPredictor):
    def __init__(self,artifact):
        if artifact.get('schemaVersion')!=3 or artifact.get('features')!=FEATURES_V31 or artifact.get('labels')!=list(LABELS):raise ValueError('Incompatible History V3.1 artifact')
        self.artifact=artifact;self.extractor=HistoryFeaturesV31.restore(artifact)
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        if self.mean.shape!=(len(FEATURES_V31),) or self.scale.shape!=self.mean.shape or self.weights.shape!=(3,len(FEATURES_V31)) or self.intercept.shape!=(3,):raise ValueError('Invalid dimensions')
        if not all(np.isfinite(v).all() for v in [self.mean,self.scale,self.weights,self.intercept]) or np.any(self.scale<=0):raise ValueError('Invalid parameters')


    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        result=super().predict(text,concept_id,language,scope_confirmed)
        prompt_only=bool(prompt_signals(text)[0])
        if prompt_only:
            result['evidence']['concerns'].append({'start':0,'end':len(text),'quote':text,'kind':'unanswered_prompts_only'})
        # Date check is a concern for human review, not historical adjudication.
        for point in self.extractor.concepts[concept_id]['points']:
            expected=set(re.findall(r'\b(?:1[0-9]{3}|20[0-9]{2})\b',point['text']))
            if not expected:continue
            evidence=next(e for e in result['evidence']['points'] if e['pointId']==point['id'])
            observed=set(re.findall(r'\b(?:1[0-9]{3}|20[0-9]{2})\b',evidence['candidateEvidence']))
            if observed and not (observed&expected):
                result['evidence']['concerns'].append({'start':evidence['start'],'end':evidence['end'],'quote':evidence['candidateEvidence'],'kind':'possible_requirement_date_mismatch'})
        raw=result['rawModelStatus']
        withheld=(raw=='present' and bool(result['evidence']['concerns'])) or (prompt_only and raw!='missing')
        if withheld:result['suggestedStatus']=None
        result['completeSuggestionWithheld']=bool(withheld and raw=='present')
        result['suggestionWithheld']=bool(withheld)
        return result

"""Experimental History V2 features; lexical evidence still needs review."""
import re
import numpy as np
from .english_coverage import CoverageFeatures, CoveragePredictor, LABELS, FEATURES, normalize

HISTORY_FEATURES=FEATURES+['question_fraction','keyword_list_declared','source_role_conflict','matched_negation_fraction','formatted_number_count']


def source_role_conflicts(text,concept_id):
    if concept_id!='hist-g10-l01-c01':return []
    patterns=[r'\b(?:coins?|buildings?|physical remains)\b[^.!?;\n]{0,70}\b(?:are|is|as|classified)\b[^.!?;\n]{0,30}\bliterary\b',
              r'\b(?:written documents?|books?)\b[^.!?;\n]{0,60}\b(?:are|is|as|classified)\b[^.!?;\n]{0,30}\barchaeological\b',
              r'\bliterary\s+sources?\s+(?:are|include|consist of)\s+(?:coins?|buildings?|physical remains)\b',
              r'\barchaeological\s+sources?\s+(?:are|include|consist of)\s+(?:written documents?|books?)\b']
    result=[]
    for pattern in patterns:
        for m in re.finditer(pattern,text,re.I):
            if re.search(r'\b(?:not|never|incorrect|wrong)\b',m.group(),re.I):continue
            result.append({'start':m.start(),'end':m.end(),'quote':m.group(),'kind':'possible_source_category_reversal'})
    return result


class HistoryFeatures(CoverageFeatures):
    def one(self,text,concept_id,explain=False):
        values,evidence=super().one(text,concept_id,True)
        conflict=source_role_conflicts(text,concept_id)
        negated=[]
        for p in evidence:
            quote=p['candidateEvidence']
            if p['lexicalCoverage']>0 and re.search(r'\b(?:no|not|never|without|doesnt|isnt)\b',normalize(quote)):
                negated.append({'start':p['start'],'end':p['end'],'quote':quote,'kind':'possible_negated_requirement'})
        sentences=max(1,len(re.findall(r'[.!?]',text)))
        list_only=bool(re.search(r'\b(?:just|only)\s+(?:words|keywords|names)|\b(?:words|keywords)\s+copied\s+from\s+(?:the\s+)?heading\b',text,re.I))
        extras=[text.count('?')/sentences,float(list_only),float(bool(conflict)),len(negated)/len(evidence),len(re.findall(r'\b\d{1,3}(?:,\d{3})+\b',text))]
        return np.concatenate([values,extras]),{'points':evidence,'concerns':conflict+negated}


class HistoryPredictor(CoveragePredictor):
    def __init__(self,artifact):
        if artifact.get('schemaVersion')!=2 or artifact.get('features')!=HISTORY_FEATURES or artifact.get('labels')!=list(LABELS):raise ValueError('Incompatible History artifact')
        self.artifact=artifact;self.extractor=HistoryFeatures.restore(artifact)
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        if self.mean.shape!=(len(HISTORY_FEATURES),) or self.scale.shape!=self.mean.shape or self.weights.shape!=(3,len(HISTORY_FEATURES)) or self.intercept.shape!=(3,):raise ValueError('Invalid dimensions')
        if not all(np.isfinite(v).all() for v in [self.mean,self.scale,self.weights,self.intercept]) or np.any(self.scale<=0):raise ValueError('Invalid parameters')

    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        if not isinstance(text,str) or not text.strip() or len(text)>20000:raise ValueError('Provide 1-20000 characters')
        if language.lower() not in ('english','en') or re.search(r'[\u0D80-\u0DFF]',text):raise ValueError('English only')
        if not scope_confirmed:raise ValueError('Scope must be confirmed')
        x,evidence=self.extractor.one(text,concept_id,True);p=self.probabilities(x);raw=LABELS[int(p.argmax())]
        withheld=raw=='present' and bool(evidence['concerns'])
        return {'status':None,'suggestedStatus':None if withheld else raw,'rawModelStatus':raw,'completeSuggestionWithheld':withheld,
            'reviewRequired':True,'scoresCalibrated':False,'scores':dict(zip(LABELS,p.tolist())),
            'modelVersion':self.artifact['metadata']['experimentId'],'evidence':evidence}

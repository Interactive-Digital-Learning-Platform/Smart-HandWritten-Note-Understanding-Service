"""Passage-grounded History coverage with a small portable boosted-tree head.

Topic similarity is evidence retrieval, not entailment. Local anchors, competing
rubric facts and clause support let the trained head distinguish those cases.
The frozen predecessor modules remain intact for reproducibility and rollback.
"""
import re
import numpy as np
from .english_coverage import LABELS, normalize, contains
from .history_semantic import semantic_spans, genuine_negation
from .history_coverage_v31 import prompt_signals
from .history_point_coverage import (PointCoverageFeatures, POINT_FEATURES, point_queries,
    required_names, content_terms, period_support, aggregate_points,
    ocr_year_concerns, absolute_scope_concerns)
from .history_semantic_review import semantic_support_concerns

EVIDENCE_FEATURES=POINT_FEATURES+[
    'retrieved_competitor_margin','best_competitor_margin','retrieved_local_group_coverage',
    'retrieved_name_min','retrieved_name_mean','retrieved_period_support',
    'retrieved_clause_min','retrieved_clause_mean','retrieved_distinctive_recall',
    'retrieved_polarity_agreement','retrieved_reminder_only','best_specific_supported_similarity',
]


def polarity(text):
    value=re.sub(r'\bnot only\b|\bnot as\b[^.!?]{0,35}\bas\b','',text,flags=re.I)
    value=re.sub(r'\b(?:did|does|do) not\s+(?:\w+\s+){1,6}alone\b','',value,flags=re.I)
    return float(genuine_negation(value) or bool(re.search(r'\b(?:unable|failed|failure|independent of|no longer)\b',value,re.I)))


def reminder_only(text):
    # Only a candidate passage is checked; an unrelated reminder elsewhere must
    # never erase an actual answer in the same uploaded note.
    return bool(re.search(r'\b(?:bring|homework|next (?:class|lesson)|to read again|remember to|read (?:this|the) (?:chapter|book)|tomorrow|classroom|unanswered|answer later)\b',text,re.I))


class EvidenceFeatures(PointCoverageFeatures):
    def __init__(self,rubrics,encoder):
        super().__init__(rubrics,encoder)
        self.point_texts=[p['text'] for c in rubrics['concepts'] for p in c['points']]
        self.point_keys=[(c['id'],c['lessonId'],p['id']) for c in rubrics['concepts'] for p in c['points']]
        self.public_vectors=encoder.encode(self.point_texts)

    def one(self,text,concept_id):
        base,evidence=super().one(text,concept_id)
        concept=self.concepts[concept_id]
        spans=semantic_spans(text);chunks=[s for _,_,s in spans]
        vectors=self.encoder.encode(chunks)
        competitors=[i for i,(cid,lesson,_) in enumerate(self.point_keys) if lesson==concept['lessonId'] and cid!=concept_id]
        competing=(self.public_vectors[competitors]@vectors.T).max(axis=0) if competitors else np.zeros(len(chunks))
        extra=[]
        for point,e in zip(concept['points'],evidence):
            queries=point_queries({'name':concept['name'],'points':[point]})[0]
            similarity=self.encoder.encode(queries)@vectors.T
            j=next(i for i,(a,b,_) in enumerate(spans) if a==e['semanticStart'] and b==e['semanticEnd'])
            candidate=chunks[j];normalized=normalize(candidate)
            names=required_names(point['text'])
            name_support=[float(contains(normalized,n) or contains(normalized,re.sub(r'^mac','mc',n))) for n in names]
            groups=point['groups']
            local=sum(any(contains(normalized,a) for a in g) for g in groups)/len(groups)
            terms=content_terms(point['text']);denom=sum(self.idf.get(t,1.) for t in terms) or 1.
            local_recall=sum(self.idf.get(t,1.) for t in terms&content_terms(candidate))/denom
            margin=similarity[0]-competing
            # A high topic match without a single distinctive content anchor is
            # represented separately, rather than assumed to support the fact.
            specific=[similarity[0,k] for k,q in enumerate(chunks)
                if sum(self.idf.get(t,1.) for t in terms&content_terms(q))/denom>=.35 and not reminder_only(q)]
            values=[margin[j],margin.max(),local,min(name_support) if names else 1.,
                np.mean(name_support) if names else 1.,period_support(candidate,point['text']),
                similarity[1:,j].min(),similarity[1:,j].mean(),local_recall,
                float(polarity(candidate)==polarity(point['text'])),float(reminder_only(candidate)),max(specific) if specific else 0.]
            e['passageSupport']={'localGroupCoverage':round(local,4),'nameCoverage':min(name_support) if names else 1.,
                'competingFactMargin':float(margin[j]),'polarityAgrees':polarity(candidate)==polarity(point['text'])}
            extra.append(values)
        return np.c_[base,np.asarray(extra)],evidence


def boosted_scores(x,artifact):
    """Portable sklearn GradientBoosting multiclass regression-tree traversal."""
    x=np.asarray(x,dtype=np.float32)
    scores=np.tile(artifact['head']['initialScores'],(len(x),1)).astype(float)
    for stage in artifact['head']['trees']:
        for label,tree in enumerate(stage):
            for row in range(len(x)):
                node=0
                while tree['left'][node]!=-1:
                    node=tree['left'][node] if x[row,tree['feature'][node]]<=tree['threshold'][node] else tree['right'][node]
                scores[row,label]+=artifact['head']['learningRate']*tree['value'][node]
    scores-=scores.max(axis=1,keepdims=True);scores=np.exp(scores)
    return scores/scores.sum(axis=1,keepdims=True)


class EvidencePredictor:
    def __init__(self,artifact,encoder):
        if (artifact.get('schemaVersion')!=9 or artifact.get('features')!=EVIDENCE_FEATURES
                or artifact.get('labels')!=list(LABELS) or artifact['encoder']['revision']!=encoder.manifest['revision']):
            raise ValueError('Incompatible History evidence model')
        self.artifact=artifact
        head=artifact['head']
        if len(head['initialScores'])!=3 or not np.isfinite(head['initialScores']).all() or not 0<head['learningRate']<=1 or not head['trees']:
            raise ValueError('Invalid History tree parameters')
        for stage in head['trees']:
            if len(stage)!=3:raise ValueError('Invalid class tree count')
            for tree in stage:
                n=len(tree['left'])
                if not n or any(len(tree[k])!=n for k in ('right','feature','threshold','value')) or not np.isfinite(tree['value']).all() or not np.isfinite(tree['threshold']).all():
                    raise ValueError('Invalid History tree dimensions')
                for i,(left,right,feature) in enumerate(zip(tree['left'],tree['right'],tree['feature'])):
                    if left==-1 and right==-1:continue
                    if not (i<left<n and i<right<n and 0<=feature<len(EVIDENCE_FEATURES)):
                        raise ValueError('Invalid History tree edge')
        self.extractor=EvidenceFeatures(artifact['rubrics'],encoder)

    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        if not isinstance(text,str) or not text.strip() or len(text)>20000:raise ValueError('Provide 1–20000 characters')
        if not isinstance(language,str) or language.lower() not in ('english','en') or re.search(r'[\u0D80-\u0DFF]',text):raise ValueError('English only')
        if scope_confirmed is not True:raise ValueError('Confirm the selected concept applies')
        if concept_id not in self.extractor.concepts:raise ValueError('Choose a registered History concept')
        x,points=self.extractor.one(text,concept_id)
        scores=boosted_scores(x,self.artifact)
        for p,score in zip(points,scores):
            p['learnedCoverageStatus']=LABELS[int(score.argmax())];p['coverageScores']=dict(zip(LABELS,score.tolist()))
        aggregate=aggregate_points(scores);raw=LABELS[int(aggregate.argmax())]
        result={'status':None,'rawModelStatus':raw,'suggestedStatus':raw,'scores':dict(zip(LABELS,aggregate.tolist())),
            'scoresCalibrated':False,'reviewRequired':True,'modelVersion':self.artifact['metadata']['experimentId'],
            'evidence':{'points':points,'concerns':[]},'completeSuggestionWithheld':False,'suggestionWithheld':False}
        concerns=semantic_support_concerns(result,self.artifact['rubrics'])+ocr_year_concerns(text,points)+absolute_scope_concerns(text,points)
        result['evidence']['concerns']=concerns
        if (raw=='present' and concerns) or (prompt_signals(text)[0] and raw!='missing') or any(c['kind']=='possible_ocr_year_ambiguity' for c in concerns):
            result['suggestedStatus']=None;result['suggestionWithheld']=True;result['completeSuggestionWithheld']=raw=='present'
        result['reviewPolicyVersion']='passage-grounded-history-review-v1'
        return result

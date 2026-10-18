"""Relation-aware lexical features. Lightweight, finite and explicitly limited."""
from __future__ import annotations
import re
import numpy as np

from .english_coverage import CoverageFeatures, LABELS, contains, normalize

FEATURES_V2=[
    'affirmed_fraction','absent_fraction','partial_fraction','point_min','point_mean','point_max','point_std',
    'rejected_point_fraction','word_min','word_mean','word_max','char_min','char_mean','char_max',
    'context_relevant_fraction','lexical_concern','arithmetic_concern','point_count',
]


def evidence_units(text):
    """Single clauses and adjacent clauses within a paragraph/list, not headings.

    Newlines delimit list items. Blank lines and explicit pages delimit context.
    Short, contentless headings never lend keywords to an adjacent explanation.
    """
    results=[]
    block=[]
    def flush():
        for i,span in enumerate(block):
            results.append(span)
            if i+1<len(block) and block[i+1][1]-span[0]<=700:
                results.append((span[0],block[i+1][1]))
        block.clear()
    for line in re.finditer(r'[^\n]*(?:\n|$)',text):
        raw=line.group().strip()
        if not raw or re.fullmatch(r'---\s*Page\s+\d+\s*---',raw,re.I):flush();continue
        tokens=re.findall(r'\w+',raw)
        explanatory=re.search(r'\b(?:is|are|has|have|same|different|above|below|without|no|add|mix|heat|move|moves|contract|relax|phase)\b|=|->|→',raw,re.I)
        if len(tokens)<=5 and not explanatory:flush();continue
        for clause in re.finditer(r'\S.*?(?:[.!?;](?=\s|$)|$)',line.group().rstrip('\n')):
            start=line.start()+clause.start();end=line.start()+clause.end()
            words=list(re.finditer(r'\S+',text[start:end]))
            for offset in range(0,len(words),60):
                part=words[offset:offset+60]
                if part:block.append((start+part[0].start(),start+part[-1].end()))
    flush()
    return [(a,b,text[a:b]) for a,b in dict.fromkeys(results)]


def has_pattern(patterns,text):
    return any(re.search(p,text,re.I) for p in patterns)


def kilowatt_conversion(text):
    """Verify an explicit numeric conversion, not just the presence of units."""
    unit=r'(?:kilowatts?|kw|watts?|w)'
    number=r'(?:\d+(?:\.\d+)?|\.\d+)'
    matches=re.finditer(rf'({number})\s*({unit})\s*(?:=|equals|is|or)\s*({number})\s*({unit})\b',text,re.I)
    for m in matches:
        a,u,b,v=m.groups();uk=u.lower().startswith('k');vk=v.lower().startswith('k')
        if uk!=vk and float(a)>0 and float(b)>0:
            if np.isclose(float(a)*(1000 if uk else 1),float(b)*(1000 if vk else 1),rtol=.002):return True
    return bool(re.search(r'\b(?:one|1)\s+kilowatt\s+(?:is|equals)\s+(?:one\s+thousand|1000)\s+watts\b',text,re.I))


def arithmetic_concerns(text):
    """Only check explicit numeric products. Never execute student text as code."""
    n=r'(?:\d+(?:\.\d+)?|\.\d+)'
    errors=[]
    for m in re.finditer(rf'({n}\s*[x×*]\s*{n}(?:\s*[x×*]\s*{n})?)\s*=\s*({n})',text,re.I):
        factors=[float(v) for v in re.split(r'\s*[x×*]\s*',m[1],flags=re.I)]
        if not np.isclose(np.prod(factors),float(m[2]),rtol=.01,atol=.01):
            errors.append({'start':m.start(),'end':m.end(),'quote':m.group(),'kind':'numeric_product_mismatch'})
    return errors


class CoverageFeaturesV2(CoverageFeatures):
    def one(self,text,concept_id,explain=False):
        if concept_id not in self.concepts:raise ValueError('unsupported concept: '+concept_id)
        if not isinstance(text,str) or not text.strip():raise ValueError('nonempty note text required')
        spans=evidence_units(text)
        if not spans:spans=[(0,0,'')]
        chunks=[normalize(s[2]) for s in spans]
        points=self.concepts[concept_id]['points'];descriptions=[normalize(p['text']) for p in points]
        wsim=(self.word.transform(descriptions)@self.word.transform(chunks).T).toarray()
        csim=(self.char.transform(descriptions)@self.char.transform(chunks).T).toarray()
        match=np.zeros((len(points),len(chunks)));rejected=np.zeros_like(match);eligible=np.zeros_like(match)
        for i,p in enumerate(points):
            for j,t in enumerate(chunks):
                context_ok=not p.get('contextPatterns') or has_pattern(p['contextPatterns'],t)
                if not context_ok:continue
                eligible[i,j]=1
                raw=sum(any(contains(t,a) for a in g) for g in p['groups'])/len(p['groups'])
                if p.get('supportPatterns') and not has_pattern(p['supportPatterns'],t):raw=0
                if p.get('numericCheck')=='kilowatt_conversion':raw=float(kilowatt_conversion(t))
                if has_pattern(p.get('rejectPatterns',[]),t):
                    rejected[i,j]=raw;raw=0
                match[i,j]=raw
        best=match.max(axis=1)
        # Similarity can measure partial wording, but cannot borrow a context
        # that failed an explicit point-context requirement.
        w= (wsim*eligible).max(axis=1);c=(csim*eligible).max(axis=1)
        concerns=[]
        for (a,b,quote),t in zip(spans,chunks):
            if has_pattern(self.concepts[concept_id].get('concernPatterns',[]),t):
                concerns.append({'start':a,'end':b,'quote':quote,'kind':'possible_conceptual_conflict'})
        arithmetic=arithmetic_concerns(text)
        vals=[np.mean(best==1),np.mean(best==0),np.mean((best>0)&(best<1)),best.min(),best.mean(),best.max(),best.std(),
              np.mean(rejected.max(axis=1)>0),w.min(),w.mean(),w.max(),c.min(),c.mean(),c.max(),
              np.mean(match.max(axis=0)>0),bool(concerns),bool(arithmetic),len(points)]
        evidence=[]
        if explain:
            for i,p in enumerate(points):
                j=int(np.argmax(match[i]+.01*wsim[i]*eligible[i]));a,b,quote=spans[j]
                evidence.append({'pointId':p['id'],'requirement':p['text'],'lexicalCoverage':float(best[i]),
                    'candidateEvidence':quote if best[i]>0 else None,'start':a if best[i]>0 else None,'end':b if best[i]>0 else None,
                    'negatedOrRejectedMatch':bool(rejected[i].max()>0),'semanticCorrectnessVerified':False})
        return np.asarray(vals,dtype=float),{'points':evidence,'concerns':concerns+arithmetic}


def export_v2(extractor,scaler,classifier,metadata):
    return {'schemaVersion':2,'modelType':'english_relation_coverage_logistic_regression','features':FEATURES_V2,
            'labels':list(LABELS),**extractor.export(),'scalerMean':scaler.mean_.tolist(),'scalerScale':scaler.scale_.tolist(),
            'weights':classifier.coef_.tolist(),'intercept':classifier.intercept_.tolist(),'metadata':metadata}


class CoveragePredictorV2:
    def __init__(self,artifact):
        if artifact.get('schemaVersion')!=2 or artifact.get('features')!=FEATURES_V2 or artifact.get('labels')!=list(LABELS):raise ValueError('incompatible v2 model')
        self.artifact=artifact;self.extractor=CoverageFeaturesV2.restore(artifact)
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        if self.mean.shape!=(len(FEATURES_V2),) or self.scale.shape!=self.mean.shape or self.weights.shape!=(3,len(FEATURES_V2)) or self.intercept.shape!=(3,):raise ValueError('invalid v2 dimensions')
        if not all(np.isfinite(x).all() for x in (self.mean,self.scale,self.weights,self.intercept)) or np.any(self.scale<=0):raise ValueError('invalid v2 parameters')

    def probabilities(self,features):
        z=((features-self.mean)/self.scale)@self.weights.T+self.intercept
        z-=z.max(axis=-1,keepdims=True);p=np.exp(z);return p/p.sum(axis=-1,keepdims=True)

    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        if not isinstance(text,str) or not text.strip():raise ValueError('nonempty note text required')
        if language.lower() not in ('en','english') or re.search(r'[\u0D80-\u0DFF]',text):raise ValueError('only English input is supported')
        if len(text)>200000:raise ValueError('note exceeds 200000 characters')
        if concept_id not in self.extractor.concepts:raise ValueError('unsupported concept: '+concept_id)
        if not scope_confirmed:return {'status':None,'suggestedStatus':None,'reviewRequired':True,'reason':'Confirm the concept is in scope.'}
        x,evidence=self.extractor.one(text,concept_id,True);p=self.probabilities(x);label=LABELS[int(p.argmax())]
        return {'status':None,'suggestedStatus':label,'displaySuggestion':'complete' if label=='present' else label,
                'scores':dict(zip(LABELS,p.tolist())),'scoresCalibrated':False,'reviewRequired':True,
                'reason':'Experimental coverage suggestion; lexical evidence is not proof of correctness.',
                'evidence':evidence,'modelVersion':self.artifact['metadata']['experimentId']}

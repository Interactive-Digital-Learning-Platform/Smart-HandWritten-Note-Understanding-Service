"""Relation-aware lexical features. Lightweight, finite and explicitly limited."""
from __future__ import annotations
import re
import numpy as np

from .english_coverage import CoverageFeatures, LABELS, contains, normalize

FEATURES_V3=[
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
        # A short verified conversion table row is evidence, not a heading.
        if len(tokens)<=5 and not explanatory and not kilowatt_conversion(normalize(raw)):flush();continue
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


def isotope_pair(text):
    """A bounded comparison of two mass-labelled atoms of the same element.

    Labels supply context, not an assertion that any stated particle counts are
    correct. Never join labels from separate evidence units/pages.
    """
    match=re.search(r'\b([a-z]{1,15})\s+(\d{1,3})\s+(?:and|versus|vs|&)\s+([a-z]{1,15})\s+(\d{1,3})\b',text)
    if match and match[1]==match[3] and int(match[2])!=int(match[4]):
        return int(match[2]),int(match[4])
    return None


def isotope_context(text):
    return bool(re.search(r'\bisotopes?\b',text) or isotope_pair(text) or
                (re.search(r'\bsame\s+element\b',text) and re.search(r'\bneutrons?\b',text)))


def isotope_point(text,point_id):
    """Require the stated particle relationship, rather than shared keywords."""
    if not isotope_context(text):return 0.
    if point_id=='same-protons':
        target=r'(?:proton(?:s|\s+(?:numbers?|counts?))?|atomic\s+numbers?|element)'
        same=r'(?:same|equal|identical|unchanged)'
        patterns=[rf'\b{same}\s+(?:(?:numbers?|counts?)\s+of\s+)?{target}\b',
                  rf'\b{target}\b(?:\s+(?:is|are|remain|remains|stay|stays|held|kept|the|still|always)){{0,4}}\s+{same}\b',
                  r'\b(?:both|each)\s+(?:have|has|contain|contains)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+protons?\b',
                  r'\bshare\s+(?:an?|the\s+same)\s+atomic\s+number\b']
        return float(has_pattern(patterns,text))
    differences=[r'\b(?:different|unequal|extra|more|fewer)\s+(?:(?:numbers?|counts?)\s+of\s+)?neutrons?\b',
                 r'\bneutron\s+(?:numbers?|counts?)\b.{0,25}\b(?:differ|different|unequal|vary|change)\b',
                 r'\bneutrons?\b.{0,12}\b(?:differ|vary)\b']
    negated=[r'\b(?:not|never|no|without)\s+(?:have\s+|any\s+)?(?:different|extra|more|fewer)\s+(?:(?:numbers?|counts?)\s+of\s+)?neutrons?\b',
             r'\bneutron\s+(?:numbers?|counts?)\s+(?:do\s+not|never)\s+(?:differ|vary)\b']
    if has_pattern(differences,text) and not has_pattern(negated,text):return 1.
    pair=isotope_pair(text)
    if not pair:return 0.
    proton=re.search(r'\b(?:both|each)\s+(?:have|has|contain|contains)\s+(\d+)\s+protons?\b',text)
    neutron=re.search(r'\bneutron\s+(?:numbers?|counts?)\s+(?:are|equal)\s+(\d+)\s+and\s+(\d+)\b',text)
    if not neutron:
        neutron=re.search(r'\b(?:contain|contains|have|has)\s+(\d+)\s+and\s+(\d+)\s+neutrons?\b',text)
    if proton and neutron:
        z=int(proton[1]);counts=(int(neutron[1]),int(neutron[2]))
        return float(z>0 and counts==(pair[0]-z,pair[1]-z) and min(counts)>=0)
    return 0.


def ohm_equation(text):
    """Recognize equivalent symbolic or word equations without executing text."""
    voltage=r'(?:voltage|potential\s+difference|v)'
    current=r'(?:current|i)'
    resistance=r'(?:resistance|r)'
    equal=r'\s*(?:=|equals|is)\s*'
    divide=r'\s*(?:/|divided\s+by)\s*'
    product=r'\s*(?:[x×*]|times|multiplied\s+by)?\s*'
    forms=[rf'{resistance}{equal}{voltage}{divide}{current}',
           rf'{current}{equal}{voltage}{divide}{resistance}',
           rf'{voltage}{equal}(?:{current}{product}{resistance}|{resistance}{product}{current})']
    for form in forms:
        for match in re.finditer(rf'\b{form}\b(?!\s*(?:[*/+^]|squared\b))',text):
            negative_prefix=re.search(r'\b(?:not|never|incorrect|wrong)\b.{0,20}$',text[max(0,match.start()-30):match.start()])
            negative_suffix=re.match(r'\s+(?:is\s+)?(?:incorrect|wrong|false|not\s+correct)\b',text[match.end():])
            if not negative_prefix and not negative_suffix:
                return True
    return False


def benedict_reagent(text):
    """An application of Benedict reagent in its own clause, not iodine's verb."""
    clauses=re.split(r'[.!?;](?:\s|$)',text)
    patterns=[r'\b(?:add|adding|mix|mixing|combine|treat)\b.{0,90}\bbenedict\b',
              r'\bbenedict\b.{0,45}\b(?:added|mixed|combined)\b',
              r'\buse\b.{0,55}\b(?:portion|sample|extract|food)\b.{0,35}\bwith\s+benedict\b',
              r'\b(?:warm|heat)\b.{0,55}\b(?:sample|extract|food|mixture)\b.{0,35}\bwith\s+benedict\b']
    for clause in clauses:
        if has_pattern(patterns,clause) and not re.search(r'\b(?:not|never|without|avoid)\b.{0,35}\b(?:add|mix|benedict)\b',clause):
            return 1.
    return 0.


def displacement_point(text,point_id):
    """Bind the replacement/exchange relationship to its own reaction label."""
    single=point_id=='single-displacement'
    for clause in re.split(r'\s*;\s*|\s*,?\s+\b(?:while|whereas|but)\b\s+',text):
        if re.search(r'\b(?:not|never|no)\b.{0,25}\b(?:replaces?|displaces?|exchanges?)\b',clause):continue
        if single and 'double displacement' in clause:continue
        if not single and 'single displacement' in clause:continue
        if single:
            replace=re.search(r'\b(?:replac(?:e|es|ed|ing)|replacement\s+of|displac(?:e|es|ed|ing)|takes?\s+the\s+place)\b',clause)
            pair=re.search(r'\belement\b.{0,70}\b(?:another|other)\s+element\b',clause)
            metal=re.search(r'\b(?:zinc|zn|iron|fe)\b.{0,55}\b(?:copper|cu)\b',clause)
            if replace and (pair or metal) and (re.search(r'\bcompound\b',clause) or metal):return 1.
        else:
            exchange=re.search(r'\b(?:exchang\w*|swap\w*)\b',clause)
            compounds=re.search(r'\b(?:two|both)\s+compounds\b|\bcompound\b.{0,100}\banother\s+compound\b',clause)
            if exchange and compounds and re.search(r'\b(?:ions?|partners?|radicals?|elements?)\b',clause):return 1.
    return 0.


def kilowatt_conversion(text):
    """Verify an explicit numeric conversion, not just the presence of units."""
    unit=r'(?:kilowatts?|kw|watts?|w)'
    number=r'(?:\d+(?:\.\d+)?|\.\d+)'
    matches=re.finditer(rf'({number})\s*({unit})\s*(?:=|equals|is|or)\s*({number})\s*({unit})\b',text,re.I)
    for m in matches:
        a,u,b,v=m.groups();uk=u.lower().startswith('k');vk=v.lower().startswith('k')
        if uk!=vk and float(a)>0 and float(b)>0:
            if np.isclose(float(a)*(1000 if uk else 1),float(b)*(1000 if vk else 1),rtol=.002):return True
    return bool(re.search(r'\b(?:one|1|a)\s+kilowatt\s+(?:is|equals)\s+(?:one\s+thousand|a\s+thousand|1000)\s+watts\b|\bkilowatt\s*\|\s*power\s*\|\s*(?:one\s+thousand|1000)\s+watts\b',text,re.I))


def arithmetic_concerns(text):
    """Only check explicit numeric products. Never execute student text as code."""
    n=r'(?:\d+(?:\.\d+)?|\.\d+)'
    errors=[]
    for m in re.finditer(rf'({n}\s*[x×*]\s*{n}(?:\s*[x×*]\s*{n})?)\s*=\s*({n})',text,re.I):
        factors=[float(v) for v in re.split(r'\s*[x×*]\s*',m[1],flags=re.I)]
        if not np.isclose(np.prod(factors),float(m[2]),rtol=.01,atol=.01):
            errors.append({'start':m.start(),'end':m.end(),'quote':m.group(),'kind':'numeric_product_mismatch'})
    return errors


class CoverageFeaturesV31(CoverageFeatures):
    def one(self,text,concept_id,explain=False):
        if concept_id not in self.concepts:raise ValueError('unsupported concept: '+concept_id)
        if not isinstance(text,str) or not text.strip():raise ValueError('nonempty note text required')
        spans=evidence_units(text)
        if not spans:spans=[(0,0,'')]
        original_span_count=len(spans)
        if concept_id=='sci-g10-cbl-007':
            spans=spans+benedict_result_spans(text)
        chunks=[normalize(re.sub(r"['\u2019]s\b", "", s[2], flags=re.I)) for s in spans]
        points=self.concepts[concept_id]['points'];descriptions=[normalize(p['text']) for p in points]
        wsim=(self.word.transform(descriptions)@self.word.transform(chunks).T).toarray()
        csim=(self.char.transform(descriptions)@self.char.transform(chunks).T).toarray()
        match=np.zeros((len(points),len(chunks)));rejected=np.zeros_like(match);eligible=np.zeros_like(match)
        for i,p in enumerate(points):
            for j,t in enumerate(chunks):
                if j>=original_span_count and p['id']!='result':continue
                context_ok=not p.get('contextPatterns') or has_pattern(p['contextPatterns'],t)
                if p.get('relationCheck')=='isotope':context_ok=context_ok and isotope_context(t)
                if p.get('spanScope')=='clause' and re.search(r'[.!?;](?=\s|$)',spans[j][2].rstrip('.!?; ')):context_ok=False
                if not context_ok:continue
                eligible[i,j]=1
                raw=sum(any(contains(t,a) for a in g) for g in p['groups'])/len(p['groups'])
                if p.get('supportPatterns') and not has_pattern(p['supportPatterns'],t):raw=0
                if p.get('supportAllPatterns') and not all(has_pattern(group,t) for group in p['supportAllPatterns']):raw=0
                if p.get('numericCheck')=='kilowatt_conversion':raw=float(kilowatt_conversion(t))
                if p.get('numericCheck')=='ohm_equation':raw=float(ohm_equation(t))
                if p.get('relationCheck')=='isotope':raw=isotope_point(t,p['id'])
                if p.get('relationCheck')=='benedict_reagent':raw=benedict_reagent(t)
                if p.get('relationCheck')=='displacement':raw=displacement_point(t,p['id'])
                if has_pattern(p.get('rejectPatterns',[]),t):
                    rejected[i,j]=raw;raw=0
                # Similar words without an isotope particle relationship must
                # not manufacture partial coverage via TF-IDF alone.
                if p.get('relationCheck')=='isotope' and raw==0:eligible[i,j]=0
                match[i,j]=raw
        # A correct sentence cannot erase a contradictory claim elsewhere in
        # the same submitted note. Cap the affected point's affirmed evidence;
        # the trained classifier still chooses the label from the features.
        for i,p in enumerate(points):
            if p.get('conflictPatterns') and any(has_pattern(p['conflictPatterns'],t) for t in chunks):
                match[i]=np.minimum(match[i],p.get('conflictCoverageCap',.5))
                rejected[i]=np.maximum(rejected[i],.5)
        best=match.max(axis=1)
        # Similarity can measure partial wording, but cannot borrow a context
        # that failed an explicit point-context requirement.
        w= (wsim*eligible).max(axis=1);c=(csim*eligible).max(axis=1)
        concerns=[]
        for (a,b,quote),t in zip(spans,chunks):
            # Joined n-type / p-type clauses must not manufacture a reversed
            # carrier relationship from the neighbouring correct clause.
            if concept_id=='sci-g11-ele-002' and re.search(r'[.!?;](?=\s|$)',quote.rstrip('.!?; ')):continue
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


def export_v3(extractor,scaler,classifier,metadata):
    return {'schemaVersion':3,'modelType':'english_relation_coverage_logistic_regression','features':FEATURES_V3,
            'labels':list(LABELS),**extractor.export(),'scalerMean':scaler.mean_.tolist(),'scalerScale':scaler.scale_.tolist(),
            'weights':classifier.coef_.tolist(),'intercept':classifier.intercept_.tolist(),'metadata':metadata}


class CoveragePredictorV31:
    def __init__(self,artifact):
        if artifact.get('schemaVersion')!=3 or artifact.get('features')!=FEATURES_V3 or artifact.get('labels')!=list(LABELS):raise ValueError('incompatible v3 model')
        self.artifact=artifact;self.extractor=CoverageFeaturesV31.restore(artifact)
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        if self.mean.shape!=(len(FEATURES_V3),) or self.scale.shape!=self.mean.shape or self.weights.shape!=(3,len(FEATURES_V3)) or self.intercept.shape!=(3,):raise ValueError('invalid v3 dimensions')
        if not all(np.isfinite(x).all() for x in (self.mean,self.scale,self.weights,self.intercept)) or np.any(self.scale<=0):raise ValueError('invalid v3 parameters')

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
        policy=apply_review_policy(label,evidence)
        suggestion=policy['suggestedStatus']
        return {'status':None,**policy,'rawModelStatus':label,'displaySuggestion':'complete' if suggestion=='present' else suggestion,
                'scores':dict(zip(LABELS,p.tolist())),'scoresCalibrated':False,'reviewRequired':True,
                'reason':'Experimental coverage suggestion; lexical evidence is not proof of correctness.',
                'evidence':evidence,'modelVersion':self.artifact['metadata']['experimentId']}


def apply_review_policy(raw_label, evidence):
    """Abstain from unsupported complete suggestions; never relabel as partial."""
    unsupported = [p['pointId'] for p in evidence['points'] if p['lexicalCoverage']<1]
    withheld = raw_label=='present' and (bool(unsupported) or bool(evidence['concerns']))
    return {'suggestedStatus': None if withheld else raw_label,
            'completeSuggestionWithheld': bool(withheld),
            'unsupportedRequiredPoints': unsupported,
            'policyReason': 'Required evidence is incomplete or a conflict was flagged.' if withheld else None}


def benedict_result_spans(text):
    """Bounded procedure context; never cross sections, pages or another test.

    Add context only to the result feature. Keep exact original offsets/text.
    A reagent action must anchor the procedure; a heading alone is insufficient.
    """
    spans=[]
    competing=re.compile(r"\b(?:biuret|iodine|sudan|ethanol|emulsion|starch|protein|lipid|fat|negative|no|not|never|without)\b|---\s*Page|\n\s*\n",re.I)
    for anchor in re.finditer(r"\b(?:add|mix)\b[^.\n]{0,70}\bBenedict(?:['’]s)?\b",text,re.I):
        tail=text[anchor.start():anchor.start()+450]
        stop=competing.search(tail)
        if stop:tail=tail[:stop.start()]
        # Colon headings terminate the procedure (including unknown tests).
        heading=re.search(r"\n[^\n]{1,70}:",tail)
        if heading:tail=tail[:heading.start()]
        for end in re.finditer(r"[^.!?]*\b(?:precipitate|ppt)\b[^.!?]*[.!?]",tail,re.I):
            quote=tail[:end.end()]
            if quote.count('\n')>4:continue
            if not re.search(r"\b(?:green|yellow|orange|brick[- ]red)\b",end.group(),re.I):continue
            spans.append((anchor.start(),anchor.start()+end.end(),quote))
    return spans


"""Learned per-requirement coverage inside the existing History concept checker.

One small shared linear head uses the frozen encoder and existing rubric phrase
groups. Overall coverage follows the required-point predictions, so one omitted
idea cannot erase a separate supported idea. No notebook/author lookup is used.
"""
import re
from itertools import product
from collections import Counter
import numpy as np
from .english_coverage import LABELS, normalize, contains, windows
from .history_coverage_v31 import prompt_signals
from .history_semantic import semantic_spans, genuine_negation
from .history_semantic_review import semantic_support_concerns
from .history_partial import requirement_clauses, numeric_support, qualified_statement

POINT_FEATURES = ['semantic_best','semantic_mean_top3','semantic_margin','lexical_best','lexical_document',
                  'clause_min','clause_mean','clause_max','clause_std','word_recall_best','numeric_support',
                  'candidate_assertion_fraction','candidate_question_only','document_question_only',
                  'candidate_negation','qualified_semantic_best','group_count_log','point_length_log',
                  'named_entity_min','named_entity_mean','distinctive_recall_document','distinctive_recall_candidate','required_period_support']

COMMON_INITIAL={'the','a','an','early','ancient','intermediate','sources','literary','archaeological','foreign','internal',
                'kings','rulers','roads','tanks','capital','coal','demand','industrial','religious','religion','government',
                'workers','ordinary','control','before','after','in','it','its','their','physical','history','prehistory',
                'protohistory','prehistoric','protohistoric','megalithic','trade','economic','social','universal','political',
                'north','international','royal','building','terms','ruins','women','education','monuments','agriculture'}


def content_terms(text):
    words=re.findall(r'\b[a-z]{4,}\b',normalize(text))
    return {w[:-1] if w.endswith('s') and not w.endswith(('ss','is')) else w for w in words} - {
        'that','with','from','were','their','also','such','these','into','while','through','include','other','during','became'}


def required_names(text):
    # Initial participles such as "Changing" are not proper names. Keep initial
    # historical names (Rathnapura, Macadam, etc.) without treating every capital
    # letter as an entity assertion.
    return [m.group().lower() for m in re.finditer(r'\b[A-Z][A-Za-z]{2,}\b',text)
            if m.group().lower() not in COMMON_INITIAL and not (m.start()==0 and m.group().lower().endswith(('ing','ed')))]


def ocr_year_concerns(text,points):
    result=[]
    table=str.maketrans({'I':'1','l':'1','O':'0','o':'0','S':'5','s':'5','B':'8'})
    for point in points:
        expected=set(re.findall(r'\b(?:1\d{3}|20\d{2})\b',point['requirement']))
        for match in re.finditer(r'(?<!\w)[12Il][0-9OoIlSBs]{3}(?!\w)',text):
            token=match.group();year=token.translate(table)
            if token.isdigit() or sum(c.isdigit() for c in token)<2 or year not in expected or re.search(r'\b'+year+r'\b',text):continue
            result.append({'pointId':point['pointId'],'start':match.start(),'end':match.end(),'quote':token,
                'kind':'possible_ocr_year_ambiguity','reason':'A required year may contain handwriting/OCR letter substitutions. Check the original photo rather than treating it as an omitted date.'})
    return result


def absolute_scope_concerns(text, points):
    """Flag relevant sweeping equivalence claims, without calling them false.

    These require context checking even when an independently retrieved passage
    looks complete. They never become an invented Partial training label.
    """
    result = []
    required = content_terms(' '.join(p['requirement'] for p in points))
    names = set(n for p in points for n in required_names(p['requirement']))
    for match in re.finditer(r'[^.!?\n]+[.!?]?', text):
        quote = match.group()
        if re.search(r'\b(?:not|never)\s+(?:all|every)\b', quote, re.I):
            continue
        sweeping = re.search(r'\bevery\b[^.!?]{0,140}\b(?:same|identical)\b|\ball\b[^.!?]{0,50}\b(?:one|same|identical)\b', quote, re.I)
        if not sweeping:
            continue
        if len(content_terms(quote) & required) < 2 and not any(contains(normalize(quote), n) for n in names):
            continue
        start = match.start() + len(quote)-len(quote.lstrip())
        end = match.start()+len(quote.rstrip())
        result.append({'start':start,'end':end,'quote':text[start:end],
            'kind':'sweeping_equivalence_requires_review',
            'reason':'This relevant all/every equivalence claim needs checking against the distinctions in the criterion. A matching passage alone cannot verify Complete.'})
    return result


def period_support(text,requirement):
    def value(s):
        s=normalize(s)
        s=re.sub(r'\b(proto|pre)\s+historic',r'\1historic',s)
        return re.sub(r'\bhistorical\b','historic',s)
    source,target=value(text),value(requirement)
    markers=[p for p in ('protohistoric','prehistoric','megalithic','early historic') if re.search(r'\b'+p+r'\b',target)]
    return float(all(re.search(r'\b'+p+r'\b',source) for p in markers))


def aggregate_points(scores):
    scores = np.asarray(scores, dtype=float)
    if scores.ndim != 2 or scores.shape[1] != 3 or not len(scores) or not np.isfinite(scores).all() or (scores < 0).any() or (scores.sum(axis=1) <= 0).any():
        raise ValueError('Provide finite nonnegative scores for at least one required point')
    likelihoods=np.zeros(3)
    for labels in product(range(3),repeat=len(scores)):
        status=0 if all(v==0 for v in labels) else 2 if all(v==2 for v in labels) else 1
        likelihoods[status]=max(likelihoods[status],float(np.prod([scores[i,label] for i,label in enumerate(labels)])))
    return likelihoods/likelihoods.sum()


def point_queries(concept):
    return [[p['text']] + [concept['name'] + ': ' + c for c in requirement_clauses(p['text'])]
            for p in concept['points']]


class PointCoverageFeatures:
    def __init__(self, rubrics, encoder):
        self.rubrics, self.encoder = rubrics, encoder
        self.concepts = {c['id']:c for c in rubrics['concepts']}
        documents=[content_terms(p['text']) for c in rubrics['concepts'] for p in c['points']]
        counts=Counter(w for d in documents for w in d)
        self.idf={w:np.log1p(len(documents)/(1+n)) for w,n in counts.items()}

    def one(self, text, concept_id):
        c = self.concepts[concept_id]
        queries = point_queries(c)
        spans = semantic_spans(text)
        chunks = [q for _, _, q in spans]
        flat = [q for group in queries for q in group]
        vectors = self.encoder.encode(flat + chunks)
        sims = vectors[:len(flat)] @ vectors[len(flat):].T
        normalized = [normalize(s) for s in chunks]
        document = normalize(text)
        qualified = [j for j, s in enumerate(chunks) if qualified_statement(s)]
        informative=np.asarray([len(s.split())>=6 and prompt_signals(s)[1]>0 and not prompt_signals(s)[0] for s in chunks])
        document_terms=content_terms(text)
        doc_prompt = prompt_signals(text)[0]
        x, evidence, position = [], [], 0
        for p, group in zip(c['points'], queries):
            similarity = sims[position]
            j = int(np.where(informative,similarity,-2).argmax()) if informative.any() else int(similarity.argmax())
            ordered = np.sort(similarity)
            clause_best = sims[position+1:position+len(group)].max(axis=1)
            position += len(group)
            groups = p['groups']
            lexical = [sum(any(contains(s, a) for a in g) for g in groups)/len(groups) for s in normalized]
            document_lexical = sum(any(contains(document, a) for a in g) for g in groups)/len(groups)
            terms = set(re.findall(r'\b[a-z]{4,}\b',normalize(p['text']))) - {'that','with','from','were','their','also','such','these','into','while','through','include'}
            recall = max(len(terms & set(re.findall(r'\b[a-z]+\b',s)))/max(1,len(terms)) for s in normalized)
            candidate_prompt, assertion = prompt_signals(chunks[j])
            # A comparison of sizes is not a denial that the named cities existed.
            denial=re.sub(r'\bnot as\b[^.!?]{0,35}\bas\b','',chunks[j],flags=re.I)
            names=required_names(p['text'])
            name_support=[float(contains(document,n) or contains(document,re.sub(r'^mac','mc',n))) for n in names]
            weighted=content_terms(p['text']);denom=sum(self.idf.get(w,1.) for w in weighted) or 1.
            doc_recall=sum(self.idf.get(w,1.) for w in weighted&document_terms)/denom
            candidate_recall=sum(self.idf.get(w,1.) for w in weighted&content_terms(chunks[j]))/denom
            values = [ordered[-1],ordered[-3:].mean(),ordered[-1]-(ordered[-2] if len(ordered)>1 else 0),
                max(lexical),document_lexical,clause_best.min(),clause_best.mean(),clause_best.max(),clause_best.std(),
                recall,numeric_support(text,[p['text']])[0],assertion,candidate_prompt,doc_prompt,
                float(genuine_negation(denial)),max(similarity[qualified]) if qualified else 0.,
                np.log1p(len(groups)),np.log1p(len(p['text'].split())),
                min(name_support) if names else 1.,np.mean(name_support) if names else 1.,doc_recall,candidate_recall,
                period_support(text,p['text'])]
            a,b,quote=spans[j]
            k=int(np.argmax(lexical));la,lb,lquote=spans[k]
            x.append(values)
            evidence.append({'pointId':p['id'],'requirement':p['text'],'lexicalCoverage':round(float(max(lexical)),4),
                'candidateEvidence':lquote,'start':la,'end':lb,'semanticCandidateEvidence':quote,'semanticStart':a,'semanticEnd':b,
                'semanticSimilarity':float(similarity[j]),'semanticCorrectnessVerified':False})
        return np.asarray(x),evidence


class PointCoveragePredictor:
    def __init__(self, artifact, encoder):
        if (artifact.get('schemaVersion')!=7 or artifact.get('features')!=POINT_FEATURES or artifact.get('labels')!=list(LABELS) or
                artifact['encoder']['revision']!=encoder.manifest['revision']):
            raise ValueError('Incompatible History point coverage model')
        self.artifact=artifact;self.extractor=PointCoverageFeatures(artifact['rubrics'],encoder)
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        n=len(POINT_FEATURES)
        if (self.mean.shape!=(n,) or self.scale.shape!=(n,) or self.weights.shape!=(3,n) or self.intercept.shape!=(3,) or
                not all(np.isfinite(v).all() for v in [self.mean,self.scale,self.weights,self.intercept]) or np.any(self.scale<=0)):
            raise ValueError('Invalid History point model parameters')

    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        if not isinstance(text,str) or not text.strip() or len(text)>20000:raise ValueError('Provide 1–20000 characters')
        if language.lower() not in ('english','en') or re.search(r'[\u0D80-\u0DFF]',text):raise ValueError('English only')
        if not scope_confirmed:raise ValueError('Confirm the selected concept applies')
        x,points=self.extractor.one(text,concept_id)
        logits=((x-self.mean)/self.scale)@self.weights.T+self.intercept
        logits-=logits.max(axis=1,keepdims=True);scores=np.exp(logits);scores/=scores.sum(axis=1,keepdims=True)
        labels=[LABELS[int(s.argmax())] for s in scores]
        for p,label,score in zip(points,labels,scores):
            p['learnedCoverageStatus']=label;p['coverageScores']=dict(zip(LABELS,score.tolist()))
        aggregate=aggregate_points(scores)
        raw=LABELS[int(aggregate.argmax())]
        result={'status':None,'rawModelStatus':raw,'suggestedStatus':raw,'scores':dict(zip(LABELS,aggregate.tolist())),
            'scoresCalibrated':False,'reviewRequired':True,'modelVersion':self.artifact['metadata']['experimentId'],
            'evidence':{'points':points,'concerns':[]},'completeSuggestionWithheld':False,'suggestionWithheld':False}
        concerns=semantic_support_concerns(result,self.artifact['rubrics'])
        ocr_concerns=ocr_year_concerns(text,points)
        concerns.extend(ocr_concerns)
        concerns.extend(absolute_scope_concerns(text, points))
        result['evidence']['concerns']=concerns
        if (raw=='present' and concerns) or (prompt_signals(text)[0] and raw!='missing') or ocr_concerns:
            result['suggestedStatus']=None;result['suggestionWithheld']=True;result['completeSuggestionWithheld']=raw=='present'
        result['reviewPolicyVersion']='learned-point-coverage-with-semantic-review-v2'
        return result

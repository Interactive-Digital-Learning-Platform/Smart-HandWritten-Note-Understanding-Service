"""CPU-only, English rubric coverage experiment and portable JSON inference.

The model estimates coverage; lexical matches do not establish correctness.
No LLM, transformer, network, database or old feature cache is used in inference.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

LABELS = ("present", "partial", "missing")
FEATURES = [
    "point_match_min", "point_match_mean", "point_match_max", "point_match_std",
    "all_groups_fraction", "two_thirds_groups_fraction", "half_groups_fraction",
    "word_similarity_min", "word_similarity_mean", "word_similarity_max",
    "char_similarity_min", "char_similarity_mean", "char_similarity_max",
    "explanatory_point_fraction", "heading_only_point_fraction",
    "best_sentence_content_recall_mean", "best_sentence_content_recall_min",
    "relevant_window_fraction", "negated_relevant_fraction", "uncertain_relevant_fraction",
    "point_count", "log_relevant_words",
]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+"\n", encoding="utf-8")


def normalize(text):
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"['\u2019]", "", text)
    text = re.sub(r"[-\u2010-\u2015_]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def contains(text, phrase):
    phrase = normalize(phrase)
    return bool(phrase and re.search(r"(?<!\w)"+re.escape(phrase)+r"(?!\w)", text))


def windows(text):
    """Short adjacent sentences, never crossing an explicit page boundary.

    Return exact source spans so review evidence can be located in the note.
    """
    result = []
    pages = list(re.finditer(r"---\s*Page\s+\d+\s*---", text, re.I))
    boundaries = [0]+[m.end() for m in pages]+[len(text)]
    for left, right in zip(boundaries, boundaries[1:]):
        section = text[left:right]
        # Exclude page-marker text from the end of this section.
        section = re.sub(r"---\s*Page\s+\d+\s*---\s*$", "", section, flags=re.I)
        spans = []
        line_sentences = []
        for line in re.finditer(r"[^\n]+",section):
            for sentence in re.finditer(r"\S.*?(?:[.!?](?=\s|$)|$)",line.group()):
                line_sentences.append((left+line.start()+sentence.start(), left+line.start()+sentence.end()))
        for start,end in line_sentences:
            while start < end and text[start].isspace(): start += 1
            while end > start and text[end-1].isspace(): end -= 1
            if start < end:
                # Bound very long OCR paragraphs without truncating the document.
                words = list(re.finditer(r"\S+", text[start:end]))
                for offset in range(0, len(words), 60):
                    group = words[offset:offset+60]
                    spans.append((start+group[0].start(), start+group[-1].end()))
        for i, span in enumerate(spans):
            result.append(span)
            if i+1 < len(spans) and spans[i+1][1]-span[0] <= 1000:
                result.append((span[0], spans[i+1][1]))
    if not result and text.strip(): result = [(0, len(text))]
    return [(a, b, text[a:b]) for a, b in dict.fromkeys(result)]


def load_rubrics(path):
    rubrics = json.loads(Path(path).read_text(encoding="utf-8"))
    if rubrics.get("language") != "English": raise ValueError("English rubrics required")
    concepts = rubrics["concepts"]
    if not concepts or len({c["id"] for c in concepts}) != len(concepts):
        raise ValueError("rubric concept IDs must be unique")
    for c in concepts:
        if not c["points"] or len({p["id"] for p in c["points"]}) != len(c["points"]):
            raise ValueError("rubric points must be nonempty and unique")
        for p in c["points"]:
            if not p["text"].strip() or not p["groups"] or any(not g or any(not normalize(x) for x in g) for g in p["groups"]):
                raise ValueError("invalid rubric phrase groups")
    return rubrics


class CoverageFeatures:
    def __init__(self, rubrics):
        self.rubrics = rubrics
        self.concepts = {c["id"]:c for c in rubrics["concepts"]}
        self.word = TfidfVectorizer(ngram_range=(1,2), sublinear_tf=True, max_features=8000)
        self.char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), sublinear_tf=True, max_features=12000)

    def fit(self, examples):
        # Labels, reasons and annotated evidence never enter feature extraction.
        corpus = sorted({normalize(r["text"]) for r in examples})
        corpus += [normalize(p["text"]) for c in self.concepts.values() for p in c["points"]]
        self.word.fit(corpus)
        self.char.fit(corpus)
        return self

    def one(self, text, concept_id, explain=False):
        if concept_id not in self.concepts: raise ValueError("unsupported concept: "+concept_id)
        if not isinstance(text, str) or not text.strip(): raise ValueError("nonempty note text required")
        spans = windows(text)
        chunks = [normalize(s[2]) for s in spans]
        points = self.concepts[concept_id]["points"]
        descriptions = [normalize(p["text"]) for p in points]
        wsim = (self.word.transform(descriptions) @ self.word.transform(chunks).T).toarray()
        csim = (self.char.transform(descriptions) @ self.char.transform(chunks).T).toarray()
        match = np.array([[sum(any(contains(t, a) for a in group) for group in p["groups"])/len(p["groups"])
                           for t in chunks] for p in points])
        counts = np.array([len(re.findall(r"\b\w+\b", t)) for t in chunks])
        substantive = counts >= 6
        # Prefer meaningful chunks, but retain a feature for heading-only matches.
        effective = match * substantive[None,:]
        best = effective.max(axis=1)
        raw_best = match.max(axis=1)
        wbest, cbest = wsim.max(axis=1), csim.max(axis=1)
        analyzer = self.word.build_analyzer()
        recalls = []
        for d in descriptions:
            terms = {x for x in analyzer(d) if " " not in x and len(x)>3}
            recalls.append(max((len(terms & set(analyzer(t)))/max(1,len(terms)) for t in chunks), default=0))
        relevant = (effective.max(axis=0)>=2/3) | (wsim.max(axis=0)>=0.25)
        denominator = max(1,int(relevant.sum()))
        negated = sum(bool(re.search(r"\b(no|not|never|without|isnt|dont|doesnt|arent|cant)\b", t)) for t,keep in zip(chunks,relevant) if keep)
        uncertain = sum(bool(re.search(r"\b(think|maybe|guess|unsure|perhaps)\b", t)) for t,keep in zip(chunks,relevant) if keep)
        values = [best.min(),best.mean(),best.max(),best.std(),np.mean(best==1),np.mean(best>=2/3),np.mean(best>=.5),
                  wbest.min(),wbest.mean(),wbest.max(),cbest.min(),cbest.mean(),cbest.max(),
                  np.mean(best>=2/3),np.mean((raw_best>best)&(raw_best>=2/3)),np.mean(recalls),min(recalls),
                  float(relevant.mean()),negated/denominator,uncertain/denominator,len(points),np.log1p(counts[relevant].sum())]
        evidence = []
        if explain:
            for i,p in enumerate(points):
                # Explain the candidate match even when its score is low; never claim absence from this heuristic.
                j = int(np.argmax(effective[i]+0.1*wsim[i]+0.05*csim[i]))
                a,b,quote = spans[j]
                evidence.append({"pointId":p["id"],"requirement":p["text"],"lexicalCoverage":round(float(best[i]),4),
                                 "wordSimilarity":round(float(wsim[i,j]),4),"candidateEvidence":quote,
                                 "start":a,"end":b,"semanticCorrectnessVerified":False})
        return np.asarray(values,dtype=np.float64), evidence

    def transform(self, examples):
        return np.stack([self.one(r["text"],r["conceptId"])[0] for r in examples])

    def export(self):
        return {"rubrics":self.rubrics, "vectorizers":{
            k:{"vocabulary":{s:int(i) for s,i in v.vocabulary_.items()},"idf":v.idf_.tolist()}
            for k,v in (("word",self.word),("char",self.char))}}

    @classmethod
    def restore(cls, artifact):
        instance = cls(artifact["rubrics"])
        for name, data in artifact["vectorizers"].items():
            v = getattr(instance,name)
            v.set_params(vocabulary=data["vocabulary"])
            v.fit(["restore fixed vocabulary"])
            v.idf_ = np.asarray(data["idf"],dtype=float)
        return instance


def fit_classifier(features, labels, weights, c):
    scaler = StandardScaler().fit(features, sample_weight=weights)
    classifier = LogisticRegression(C=c, max_iter=2000, random_state=42)
    classifier.fit(scaler.transform(features),labels,sample_weight=weights)
    if classifier.classes_.tolist() != [0,1,2]: raise ValueError("all three training classes required")
    if max(classifier.n_iter_)>=2000: raise ValueError("classifier did not converge")
    return scaler,classifier


def export_model(extractor,scaler,classifier,metadata):
    return {"schemaVersion":1,"modelType":"english_rubric_tfidf_logistic_regression", "features":FEATURES,
            "labels":list(LABELS),**extractor.export(),"scalerMean":scaler.mean_.tolist(),
            "scalerScale":scaler.scale_.tolist(),"weights":classifier.coef_.tolist(),
            "intercept":classifier.intercept_.tolist(),"metadata":metadata}


class CoveragePredictor:
    def __init__(self,artifact):
        if artifact.get("schemaVersion")!=1 or artifact.get("features")!=FEATURES or artifact.get("labels")!=list(LABELS):
            raise ValueError("incompatible coverage artifact")
        self.artifact=artifact
        self.extractor=CoverageFeatures.restore(artifact)
        self.mean=np.asarray(artifact["scalerMean"])
        self.scale=np.asarray(artifact["scalerScale"])
        self.weights=np.asarray(artifact["weights"])
        self.intercept=np.asarray(artifact["intercept"])
        if self.weights.shape!=(3,len(FEATURES)) or self.mean.shape!=(len(FEATURES),) or self.scale.shape!=self.mean.shape or self.intercept.shape!=(3,):
            raise ValueError("invalid classifier dimensions")
        if not all(np.isfinite(x).all() for x in (self.mean,self.scale,self.weights,self.intercept)) or np.any(self.scale<=0):
            raise ValueError("invalid classifier parameters")

    def probabilities(self,features):
        logits=((features-self.mean)/self.scale)@self.weights.T+self.intercept
        logits-=logits.max(axis=-1,keepdims=True)
        exp=np.exp(logits)
        return exp/exp.sum(axis=-1,keepdims=True)

    def predict(self,text,concept_id,language="English",scope_confirmed=False):
        if language.lower() not in ("en","english") or re.search(r"[\u0D80-\u0DFF]",text):
            raise ValueError("only English input is supported")
        if len(text)>200000: raise ValueError("note exceeds 200000 characters; split the submission")
        if not scope_confirmed:
            return {"status":None,"suggestedStatus":None,"reviewRequired":True,"reason":"Confirm this concept is within the submitted note's intended scope."}
        x,evidence=self.extractor.one(text,concept_id,explain=True)
        p=self.probabilities(x)
        status=LABELS[int(p.argmax())]
        return {"status":None,"suggestedStatus":status,"displaySuggestion":"complete" if status=="present" else status,
                "scores":dict(zip(LABELS,p.tolist())),"scoresCalibrated":False,"reviewRequired":True,
                "reason":"Experimental lexical model; human review required before assigning a student-facing status.",
                "evidence":evidence,"modelVersion":self.artifact["metadata"]["experimentId"]}

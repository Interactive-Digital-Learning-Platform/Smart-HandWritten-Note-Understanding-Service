"""Frozen MiniLM features + trainable linear History head; local CPU only."""
import hashlib
import json
import os
from pathlib import Path
import re
import time
import numpy as np
from .english_coverage import LABELS,windows
from .history_coverage_v31 import HistoryFeaturesV31,HistoryPredictorV31,FEATURES_V31

SEMANTIC_FEATURES=FEATURES_V31+['semantic_min','semantic_mean','semantic_max','semantic_std','semantic_margin_min','semantic_margin_mean']


def semantic_spans(text):
    result=[]
    for a,b,quote in windows(text):
        words=list(re.finditer(r'\S+',quote))
        for start in range(0,len(words),48):
            part=words[start:start+48]
            if part:result.append((a+part[0].start(),a+part[-1].end()))
    return [(a,b,text[a:b]) for a,b in dict.fromkeys(result)]


def genuine_negation(text):
    # Additive and "not ... alone" constructions do not deny the main action.
    stripped=re.sub(r'\bnot\s+only\b','',text,flags=re.I)
    stripped=re.sub(r'\b(?:did|does|do)\s+not\s+(?:\w+\s+){1,6}alone\b','',stripped,flags=re.I)
    return bool(re.search(r'\b(?:no|not|never|without|doesnt|isnt)\b',stripped,re.I))


class FrozenEncoder:
    def __init__(self,manifest_path,cache_dir=None):
        self.manifest=json.loads(Path(manifest_path).read_text(encoding='utf-8'))
        self.path=Path(self.manifest['localPath']);self.cache={};self.model=None;self.tokenizer=None
        self.cache_dir=Path(cache_dir) if cache_dir else None
        if self.cache_dir and (self.cache_dir/'metadata.json').exists():
            meta=json.loads((self.cache_dir/'metadata.json').read_text(encoding='utf-8'))
            if meta['revision']!=self.manifest['revision'] or meta['maxLength']!=256:raise ValueError('Encoder cache mismatch')
            matrix=np.load(self.cache_dir/'vectors.npy',allow_pickle=False)
            if matrix.shape!=(len(meta['texts']),384):raise ValueError('Invalid cache dimensions')
            self.cache=dict(zip(meta['texts'],matrix))

    def load(self):
        if self.model is not None:return
        os.environ['HF_HUB_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
        os.environ['TOKENIZERS_PARALLELISM']='false'
        import torch
        from transformers import AutoTokenizer,AutoModel
        torch.set_num_threads(2)
        for name in ['config.json','model.safetensors','tokenizer.json']:
            if hashlib.sha256((self.path/name).read_bytes()).hexdigest()!=self.manifest['files'][name]:raise ValueError('Encoder file integrity failure')
        self.tokenizer=AutoTokenizer.from_pretrained(self.path,local_files_only=True,trust_remote_code=False)
        self.model=AutoModel.from_pretrained(self.path,local_files_only=True,trust_remote_code=False,use_safetensors=True).eval()

    def prime(self,texts):
        missing=sorted(set(texts)-self.cache.keys(),key=lambda t:(len(t),t))
        if not missing:return
        self.load();import torch
        start=time.perf_counter()
        for i in range(0,len(missing),16):
            batch=missing[i:i+16]
            lengths=self.tokenizer(batch,add_special_tokens=True,truncation=False)['input_ids']
            if any(len(tokens)>256 for tokens in lengths):raise ValueError('A semantic window exceeds 256 word pieces; split before encoding')
            encoded=self.tokenizer(batch,padding=True,truncation=True,max_length=256,return_tensors='pt')
            with torch.inference_mode():
                hidden=self.model(**encoded).last_hidden_state
                mask=encoded['attention_mask'].unsqueeze(-1).to(hidden.dtype)
                pooled=(hidden*mask).sum(1)/mask.sum(1).clamp(min=1)
                vectors=torch.nn.functional.normalize(pooled,p=2,dim=1).cpu().numpy()
            self.cache.update(zip(batch,vectors))
            if i%256==0:print(json.dumps({'embeddingComplete':min(i+16,len(missing)),'embeddingTotal':len(missing),'elapsedSeconds':round(time.perf_counter()-start,1)}),flush=True)
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True,exist_ok=True)
            keys=sorted(self.cache)
            np.save(self.cache_dir/'vectors.npy',np.stack([self.cache[t] for t in keys]),allow_pickle=False)
            (self.cache_dir/'metadata.json').write_text(json.dumps({'revision':self.manifest['revision'],'maxLength':256,'texts':keys})+'\n',encoding='utf-8')

    def encode(self,texts):
        self.prime(texts);return np.stack([self.cache[t] for t in texts])


class SemanticHistoryFeatures(HistoryFeaturesV31):
    def __init__(self,rubrics,encoder=None):
        super().__init__(rubrics);self.encoder=encoder

    def one(self,text,concept_id,explain=False):
        base,evidence=super().one(text,concept_id,True)
        evidence['concerns']=[c for c in evidence['concerns'] if c['kind']!='possible_negated_requirement' or genuine_negation(c['quote'])]
        base[25]=sum(c['kind']=='possible_negated_requirement' for c in evidence['concerns'])/len(evidence['points'])
        if not genuine_negation(text):base[18]=0.
        spans=semantic_spans(text);chunks=[quote for _,_,quote in spans]
        requirements=[p['text'] for p in self.concepts[concept_id]['points']]
        vectors=self.encoder.encode(requirements+chunks)
        similarities=vectors[:len(requirements)]@vectors[len(requirements):].T
        # Query-only content is not promoted by high topical similarity.
        if base[27]:similarities[:]=0
        best=similarities.max(axis=1)
        ordered=np.sort(similarities,axis=1)
        margins=best-(ordered[:,-2] if len(chunks)>1 else 0)
        for i,p in enumerate(evidence['points']):
            j=int(similarities[i].argmax());a,b,quote=spans[j]
            p['semanticSimilarity']=float(best[i])
            p['semanticCandidateEvidence']=quote;p['semanticStart']=a;p['semanticEnd']=b
        extra=[best.min(),best.mean(),best.max(),best.std(),margins.min(),margins.mean()]
        return np.concatenate([base,extra]),evidence


class SemanticHistoryPredictor(HistoryPredictorV31):
    def __init__(self,artifact,encoder):
        if artifact.get('schemaVersion')!=4 or artifact.get('features')!=SEMANTIC_FEATURES or artifact.get('labels')!=list(LABELS):raise ValueError('Incompatible semantic History model')
        self.artifact=artifact;self.extractor=SemanticHistoryFeatures.restore(artifact);self.extractor.encoder=encoder
        self.mean=np.asarray(artifact['scalerMean']);self.scale=np.asarray(artifact['scalerScale'])
        self.weights=np.asarray(artifact['weights']);self.intercept=np.asarray(artifact['intercept'])
        if self.mean.shape!=(len(SEMANTIC_FEATURES),) or self.scale.shape!=self.mean.shape or self.weights.shape!=(3,len(SEMANTIC_FEATURES)) or self.intercept.shape!=(3,):raise ValueError('Invalid dimensions')
        if not all(np.isfinite(v).all() for v in [self.mean,self.scale,self.weights,self.intercept]) or np.any(self.scale<=0):raise ValueError('Invalid parameters')

"""Fit an ICT head with corrected features; preserve earlier experiments."""
import json
from pathlib import Path
import sys
import time
from collections import Counter
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
import numpy as np
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS,fit_classifier,sha,write_json
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.ict_coverage import FEATURES
from smart_note_training.ict_coverage_v3 import ICTFeaturesV3,ICTPredictorV3,POLICY_V3
from smart_note_training.metrics import classification_metrics
from train_ict_coverage import summarize
from ict_synthetic_v3 import generate


def main():
    start=time.perf_counter()
    v1=ROOT/'outputs/ict-coverage-v1-2026-10-15'
    v11=ROOT/'outputs/ict-coverage-v1.1-2026-10-15'
    v2=ROOT/'outputs/ict-coverage-v2-2026-10-15'
    out=ROOT/'outputs/ict-coverage-v3-2026-10-15'
    previous=json.loads((v2/'release.json').read_text(encoding='utf-8'))
    for file,expected in previous['sourceHashes'].items():
        if sha(file)!=expected:raise ValueError('Frozen source changed')
    out.mkdir(parents=True,exist_ok=False)
    rubric=json.loads((v2/'rubrics.json').read_text(encoding='utf-8'))
    rows,regression=generate(rubric)
    train=[r for r in rows if r['split']=='train'];val=[r for r in rows if r['split']=='validation']
    before=json.loads((v2/'decisions.json').read_text(encoding='utf-8'))
    sets={name:[{k:r[k] for k in ['recordId','conceptId','text','label']} for r in before if r['set']==name]
        for name in ['ownerConfirmedDevelopment','previousProbesNowDevelopment','previousValidationRegression']}
    identity=lambda subset:{(r['conceptId'],r['text']) for r in subset}
    if identity(train)&identity(val+sum(sets.values(),[])):raise ValueError('Fitted text overlaps evaluation input')
    write_json(out/'generated-examples.json',dict(synthetic=True,examples=rows))
    write_json(out/'rubrics.json',rubric)
    sources={**previous['sourceHashes'],str(Path(__file__)):sha(__file__)}
    for file in ['ict_synthetic_v3.py','src/smart_note_training/ict_coverage_v3.py','ict_coverage_cli.py']:
        sources[str(ROOT/file)]=sha(ROOT/file)
    protocol=dict(experimentId=out.name,sourceHashes=sources,trainCount=len(train),validationCount=len(val),
        changes='Corrected negated ROM-loss features and explicit unfinished instruction blocks; additional mixed Cc/Bcc contrasts.',
        sourceReviewConfirmedByOwner=True,reviewWasAiAssisted=True,
        evaluationSetsAlreadyExposed=True,ownerAndProbeTextsFitted=False,independentAccuracyEvaluation=False,
        authoredTemplateLeakagePossible=True,realHandwritingIncluded=False,
        selection='Validation raw false-Complete count, macro-F1, balanced accuracy, smaller C. C=.01,.1,1,10.',
        generatedDataSha256=sha(out/'generated-examples.json'),rubricsSha256=sha(out/'rubrics.json'),
        knowledgeBaseIngested=False,automaticUseEnabled=False,deploymentApproved=False)
    write_json(out/'protocol.json',protocol)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',v2/'embedding-cache')
    encoder.cache_dir=out/'embedding-cache'
    texts=[p['text'] for c in rubric['concepts'] for p in c['points']]
    for r in train+val:texts.extend(q for _,_,q in semantic_spans(r['text']))
    encoder.prime(texts)
    extractor=ICTFeaturesV3(rubric,encoder).fit(train)
    x,v=extractor.transform(train),extractor.transform(val)
    counts=Counter(r['label'] for r in train);weights=[len(train)/(3*counts[r['label']]) for r in train]
    models,scores={},{}
    for c in [.01,.1,1.,10.]:
        sc,cl=fit_classifier(x,[LABELS.index(r['label']) for r in train],weights,c)
        predictions=cl.predict(sc.transform(v)).tolist()
        metric=classification_metrics([LABELS.index(r['label']) for r in val],predictions)
        metric['falseCompleteCount']=sum(p==0 and r['label']!='present' for p,r in zip(predictions,val))
        scores[str(c)]=metric;models[c]=sc,cl
    selected=max(models,key=lambda c:(-scores[str(c)]['falseCompleteCount'],scores[str(c)]['macroF1'],scores[str(c)]['balancedAccuracy'],-c))
    sc,cl=models[selected]
    artifact=dict(schemaVersion=1,modelType='ict_minilm_rubric_logistic_regression',features=FEATURES,labels=list(LABELS),
        **extractor.export(),scalerMean=sc.mean_.tolist(),scalerScale=sc.scale_.tolist(),weights=cl.coef_.tolist(),intercept=cl.intercept_.tolist(),
        reviewPolicy=POLICY_V3,encoder=dict(repoId=encoder.manifest['repoId'],revision=encoder.manifest['revision'],fineTuned=False),
        metadata=dict(experimentId=out.name,selectedC=selected,enabledByDefault=False,reviewRequired=True,synthetic=True,
            ownerReviewConfirmed=True,reviewWasAiAssisted=True,protocolSha256=sha(out/'protocol.json')))
    write_json(out/'model.json',artifact)
    model=ICTPredictorV3(artifact,encoder)
    parity=float(np.abs(model.probabilities(x)-cl.predict_proba(sc.transform(x))).max())
    if parity>1e-10:raise ValueError('Export parity failure')
    write_json(out/'selection-frozen.json',dict(selectedC=selected,scores=scores,modelSha256=sha(out/'model.json')))
    evaluations,decisions={},[]
    for name,subset in [('syntheticValidationDevelopment',val),*sets.items()]:
        predictions=[model.predict(r['text'],r['conceptId'],'English',True) for r in subset]
        evaluations[name]=summarize(subset,predictions)
        decisions.extend(dict(set=name,**r,prediction=p) for r,p in zip(subset,predictions))
    write_json(out/'decisions.json',decisions)
    write_json(out/'release.json',dict(modelSha256=sha(out/'model.json'),sourceHashes=sources,
        ownerConfirmationFile=str(v1/'owner-confirmation.json'),ownerConfirmationSha256=sha(v1/'owner-confirmation.json'),
        encoderRevision=encoder.manifest['revision'],knowledgeBaseIngested=False,deploymentApproved=False))
    report=dict(modelSha256=sha(out/'model.json'),trainCount=len(train),validationCount=len(val),selectedC=selected,
        evaluation=evaluations,portableReloadMaxError=parity,ownerReviewConfirmed=True,reviewWasAiAssisted=True,
        independentAccuracyClaimAllowed=False,deploymentApproved=False,elapsedSeconds=round(time.perf_counter()-start,2))
    write_json(out/'evaluation.json',report)
    print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':
    with threadpool_limits(limits=2):main()

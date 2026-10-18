"""A new data/alias experiment; keep every V1 and V1.1 result intact."""
import json
from pathlib import Path
import sys
import time
from collections import Counter
ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
import numpy as np
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS,fit_classifier,sha,write_json
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.ict_coverage import ICTFeatures,FEATURES
from smart_note_training.ict_coverage_v11 import ICTPredictorV11,POLICY_V11
from train_ict_coverage import summarize
from ict_synthetic_v2 import generate,rubric_groups


def main():
    start=time.perf_counter()
    v1=ROOT/'outputs/ict-coverage-v1-2026-10-15'
    v11=ROOT/'outputs/ict-coverage-v1.1-2026-10-15'
    out=ROOT/'outputs/ict-coverage-v2-2026-10-15'
    release=json.loads((v11/'release.json').read_text(encoding='utf-8'))
    for file,expected in release['sourceHashes'].items():
        if sha(file)!=expected:raise ValueError('Frozen source changed')
    out.mkdir(parents=True,exist_ok=False)
    rubric=json.loads((v1/'rubrics.json').read_text(encoding='utf-8'))
    groups=rubric_groups()
    for i,c in enumerate(rubric['concepts']):
        for j,p in enumerate(c['points']):p['groups']=groups[i][j]
    rows,previous=generate(rubric)
    train=[r for r in rows if r['split']=='train'];val=[r for r in rows if r['split']=='validation']
    review=json.loads((v1/'review-normalized.json').read_text(encoding='utf-8'))
    owner=[dict(recordId=r['id'],conceptId=r['conceptId'],text=r['text'],label=r['reviewedLabel']) for r in review['examples']]
    probes=json.loads((v11/'fresh-probes-frozen.json').read_text(encoding='utf-8'))
    probes=[dict(recordId=r['id'],conceptId=r['conceptId'],text=r['text'],label=r['aiExpectedLabel']) for r in probes['examples']]
    identity=lambda data:{(r['conceptId'],r['text']) for r in data}
    if identity(train)&identity(val+owner+probes+previous):raise ValueError('Fit/evaluation exact overlap')
    write_json(out/'generated-examples.json',dict(synthetic=True,examples=rows))
    write_json(out/'rubrics.json',rubric)
    source_hashes={**release['sourceHashes'],str(Path(__file__)):sha(__file__),
        str(ROOT/'ict_synthetic_v2.py'):sha(ROOT/'ict_synthetic_v2.py')}
    protocol=dict(experimentId=out.name,sourceHashes=source_hashes,trainCount=len(train),validationCount=len(val),
        changes='Added one shorthand training family and source-meaning-preserving memory-manager/task aliases.',
        knownProbeUsedForDevelopment=True,knownProbeTextFitted=False,ownerLabelsFitted=False,
        selection='Validation false-Complete count, macro-F1, balanced accuracy, smaller C. C=.01,.1,1,10.',
        splitsAreSyntheticAuthoredFamilies=True,independentAuthorIsolation=False,independentAccuracyEvaluation=False,
        sourceReviewConfirmedByOwner=True,reviewWasAiAssisted=True,realHandwritingIncluded=False,
        generatedDataSha256=sha(out/'generated-examples.json'),rubricsSha256=sha(out/'rubrics.json'),
        sourceIngestionCompleted=False,automaticUseEnabled=False)
    write_json(out/'protocol.json',protocol)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',v1/'embedding-cache')
    encoder.cache_dir=out/'embedding-cache'
    texts=[p['text'] for c in rubric['concepts'] for p in c['points']]
    for r in train+val:texts.extend(q for _,_,q in semantic_spans(r['text']))
    print(json.dumps(dict(train=len(train),validation=len(val),uniqueInputs=len(set(texts)))),flush=True)
    encoder.prime(texts)
    extractor=ICTFeatures(rubric,encoder).fit(train)
    x,v=extractor.transform(train),extractor.transform(val)
    counts=Counter(r['label'] for r in train)
    weights=[len(train)/(3*counts[r['label']]) for r in train]
    models,scores={},{}
    for c in [.01,.1,1.,10.]:
        sc,cl=fit_classifier(x,[LABELS.index(r['label']) for r in train],weights,c)
        prediction=cl.predict(sc.transform(v)).tolist()
        score=__import__('smart_note_training.metrics',fromlist=['classification_metrics']).classification_metrics([LABELS.index(r['label']) for r in val],prediction)
        score['falseCompleteCount']=sum(p==0 and r['label']!='present' for p,r in zip(prediction,val))
        models[c]=sc,cl;scores[str(c)]=score
    selected=max(models,key=lambda c:(-scores[str(c)]['falseCompleteCount'],scores[str(c)]['macroF1'],scores[str(c)]['balancedAccuracy'],-c))
    sc,cl=models[selected]
    artifact=dict(schemaVersion=1,modelType='ict_minilm_rubric_logistic_regression',features=FEATURES,labels=list(LABELS),
        **extractor.export(),scalerMean=sc.mean_.tolist(),scalerScale=sc.scale_.tolist(),weights=cl.coef_.tolist(),intercept=cl.intercept_.tolist(),
        reviewPolicy=POLICY_V11,encoder=dict(repoId=encoder.manifest['repoId'],revision=encoder.manifest['revision'],fineTuned=False),
        metadata=dict(experimentId=out.name,selectedC=selected,enabledByDefault=False,synthetic=True,reviewRequired=True,
            ownerReviewConfirmed=True,reviewWasAiAssisted=True,protocolSha256=sha(out/'protocol.json')))
    write_json(out/'model.json',artifact)
    model=ICTPredictorV11(artifact,encoder)
    parity=float(np.abs(model.probabilities(x)-cl.predict_proba(sc.transform(x))).max())
    if parity>1e-10:raise ValueError('Portable reload mismatch')
    write_json(out/'selection-frozen.json',dict(selectedC=selected,scores=scores,modelSha256=sha(out/'model.json')))
    evaluations,decisions={},[]
    for name,subset in [('syntheticValidationDevelopment',val),('ownerConfirmedDevelopment',owner),
                        ('previousValidationRegression',previous),('previousProbesNowDevelopment',probes)]:
        predictions=[model.predict(r['text'],r['conceptId'],'English',True) for r in subset]
        evaluations[name]=summarize(subset,predictions)
        decisions.extend(dict(set=name,**r,prediction=p) for r,p in zip(subset,predictions))
    write_json(out/'decisions.json',decisions)
    write_json(out/'release.json',dict(modelSha256=sha(out/'model.json'),sourceHashes=source_hashes,
        ownerConfirmationFile=str(v1/'owner-confirmation.json'),ownerConfirmationSha256=sha(v1/'owner-confirmation.json'),
        encoderRevision=encoder.manifest['revision'],sourceIngestionCompleted=False,deploymentApproved=False))
    report=dict(modelSha256=sha(out/'model.json'),trainCount=len(train),validationCount=len(val),selectedC=selected,
        portableReloadMaxError=parity,ownerReviewConfirmed=True,evaluation=evaluations,
        independentAccuracyClaimAllowed=False,deploymentApproved=False,elapsedSeconds=round(time.perf_counter()-start,2))
    write_json(out/'evaluation.json',report)
    print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':
    with threadpool_limits(limits=2):main()

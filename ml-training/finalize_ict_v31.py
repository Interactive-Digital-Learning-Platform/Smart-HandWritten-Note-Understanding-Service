"""Freeze V3.1 review policy without changing the V3 classifier or features."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import sha,write_json
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.ict_coverage_v31 import ICTPredictorV31,POLICY_V31
from train_ict_coverage import summarize


def main():
    parent=ROOT/'outputs/ict-coverage-v3-2026-10-15';out=ROOT/'outputs/ict-coverage-v3.1-2026-10-15'
    release=json.loads((parent/'release.json').read_text(encoding='utf-8'))
    for source,expected in release['sourceHashes'].items():
        if sha(source)!=expected:raise ValueError('Frozen ICT source changed')
    original=json.loads((parent/'model.json').read_text(encoding='utf-8'))
    artifact=json.loads(json.dumps(original));artifact['reviewPolicy']=POLICY_V31
    artifact['metadata'].update(experimentId=out.name,parentModelSha256=sha(parent/'model.json'),weightsRefitted=False)
    for field in ['weights','intercept','scalerMean','scalerScale','rubrics','vectorizers','encoder','features']:
        if artifact[field]!=original[field]:raise ValueError('Trained model changed')
    if out.exists():
        if {p.name for p in out.iterdir()}!={'model.json'} or json.loads((out/'model.json').read_text(encoding='utf-8'))!=artifact:
            raise FileExistsError('Output is not an identical incomplete finalization')
    else:
        out.mkdir(parents=True,exist_ok=False)
    write_json(out/'model.json',artifact)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',parent/'embedding-cache');encoder.cache_dir=None
    model=ICTPredictorV31(artifact,encoder)
    previous=json.loads((parent/'decisions.json').read_text(encoding='utf-8'));decisions=[];evaluations={}
    for name in dict.fromkeys(r['set'] for r in previous):
        rows=[{k:r[k] for k in ['recordId','conceptId','text','label']} for r in previous if r['set']==name]
        predictions=[model.predict(r['text'],r['conceptId'],'English',True) for r in rows]
        for row,prediction in zip(rows,predictions):
            old=next(r['prediction'] for r in previous if r['recordId']==row['recordId'])
            if prediction['scores']!=old['scores']:raise ValueError('Policy changed learned scores')
            decisions.append(dict(set=name,**row,prediction=prediction))
        evaluations[name]=summarize(rows,predictions)
    sources={**release['sourceHashes'],str(Path(__file__)):sha(__file__)}
    for file in ['ict_candidate_cli.py','src/smart_note_training/ict_coverage_v31.py']:
        sources[str(ROOT/file)]=sha(ROOT/file)
    final={**release,'sourceHashes':sources}
    final.update(modelSha256=sha(out/'model.json'),parentModelSha256=sha(parent/'model.json'),weightsRefitted=False,
        policyDevelopedFromExposedExamples=True,independentAccuracyEvaluation=False)
    write_json(out/'release.json',final);write_json(out/'decisions.json',decisions)
    report=dict(modelSha256=final['modelSha256'],trainedHeadParentSha256=sha(parent/'model.json'),weightsRefitted=False,
        evaluation=evaluations,independentAccuracyClaimAllowed=False,ownerReviewConfirmed=True,reviewWasAiAssisted=True,
        deploymentApproved=False,knowledgeBaseIngested=False,liveModelsChanged=False)
    write_json(out/'evaluation.json',report)
    print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':main()

"""Train passage support in the existing small linear History head.

The 50 corrected assistant reviews are training/development cases, not an
accuracy holdout. Original older check sets remain excluded from fitting.
"""
import argparse
import copy
import json
from pathlib import Path
import numpy as np
from sklearn.preprocessing import StandardScaler
from train_student_note_batch import ROOT,BASE,sha,anchored_fit
from smart_note_training.english_coverage import LABELS
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_grounded_core import GroundedCoreFeatures,GroundedCorePredictor,FEATURES
from smart_note_training.history_semantic_core import CORE_FEATURES


def run(args):
    out=Path(args.output)
    if out.exists():raise ValueError('Choose fresh output')
    previous=ROOT/'outputs/history-point-core-v6-reviewed-2026-10-18'
    original=json.loads((previous/'model.json').read_bytes())
    rows=json.loads((previous/'training-snapshot.json').read_bytes())['rows']
    for c in original['rubrics']['concepts']:
        for j,text in enumerate([
            'Next lesson we will study '+c['name']+'. Remember to bring the history book tomorrow.',
            'Homework: read the chapter about '+c['name']+'. The classroom has twenty desks.',
        ]):
            rows.append(dict(recordId=f'public-grounded-reminder-{c["id"]}-{j}',text=text,conceptId=c['id'],target=2,weight=1.,source='public_rubric_reminder_contrast'))
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    for cache in ('history-student-ef-baseline-2026-10-18/encoder-cache','history-evidence-v6-2026-10-18/encoder-cache'):
        encoder.cache.update(FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs'/cache).cache)
    encoder.cache_dir=None
    extractor=GroundedCoreFeatures(original,encoder)
    encoder.prime({q for r in rows for _,_,q in semantic_spans(r['text'])})
    x=np.stack([extractor.one(r['text'],r['conceptId'])[0] for r in rows]);w=np.asarray([r['weight'] for r in rows]);y=np.asarray([r['target'] for r in rows])
    # Pin each cached matrix to the full row data and feature implementation.
    out.mkdir(parents=True)
    np.save(out/'training-features.npy',x,allow_pickle=False)
    (out/'training-snapshot.json').write_text(json.dumps(dict(rows=rows,assistantReviewFitted=True,humanReviewed=False,reservedNotebookIds=[]),indent=2)+'\n',encoding='utf-8')
    base=json.loads(BASE['history'].read_bytes());n=len(CORE_FEATURES)
    scaler=StandardScaler().fit(x[:,n:],sample_weight=w)
    mean=np.r_[base['scalerMean'],scaler.mean_];scale=np.r_[base['scalerScale'],scaler.scale_]
    scale=np.where(scale>1e-12,scale,1.)
    prior=np.pad(np.asarray(base['weights']),((0,0),(0,len(FEATURES)-n)))
    weights,bias=anchored_fit((x-mean)/scale,y,w,prior,np.asarray(base['intercept']),.005)
    artifact=copy.deepcopy(original)
    artifact.update(schemaVersion=10,features=FEATURES,scalerMean=mean.tolist(),scalerScale=scale.tolist(),weights=weights.tolist(),intercept=bias.tolist(),modelType='history_grounded_point_assisted_linear_head')
    artifact['metadata'].update(experimentId=out.name,trainingMethod='linear_concept_head_with_local_passage_support',
        assistantReviewFitted=True,assistantReviewWeight=12.,priorStrength=.005,enabledByDefault=False,
        weightsRefitted=True,humanReviewed=False,trainingRows=len(rows),featureMatrixSha256=sha((out/'training-features.npy').read_bytes()))
    raw=(json.dumps(artifact,indent=2)+'\n').encode();(out/'model.json').write_bytes(raw)
    print(json.dumps(dict(modelSha256=sha(raw),trainingRows=len(rows),features=len(FEATURES),assistantReviewFitted=True,independentAccuracyClaimAllowed=False)))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())

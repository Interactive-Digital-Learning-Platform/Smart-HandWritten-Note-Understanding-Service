"""Replay History training with short source explanations and hard negatives.

All additions are assistant-authored development data, not human labels or
accuracy holdouts. The two exposed V6.1 failures are explicitly fitted rows.
Only existing RBF heads change; encoder, scaler, features and policy are frozen.
"""
import argparse, copy, hashlib, json
from pathlib import Path
import numpy as np
from sklearn.svm import SVC
from threadpoolctl import threadpool_limits
from fix_history_partial_v61 import ROOT, read, write
from smart_note_training.english_coverage import LABELS
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_grounded_core import GroundedSignedKernelPredictor

BASE=ROOT/'outputs/history-coverage-v6.1-partial-2026-10-19'
BASE_SHA='e9440b662ae46838e40ff68da23ce150db10e6c3edd1a2311841989561260233'
def sha(raw):return hashlib.sha256(raw).hexdigest()

def additions():
    examples={
        'hist-g10-l01-c03':[
            ('partial',"Travellers from abroad wrote about Sri Lanka's history and society. These accounts can help us understand the island's past."),
            ('partial','Visitors from other countries recorded life in ancient Sri Lanka. Their writings are evidence about the past.'),
            ('partial','Overseas travellers left written descriptions of Sri Lankan society that historians use as sources.'),
            ('partial','Accounts written by visitors from abroad tell us about earlier life on the island.'),
            ('partial','People who came from other lands wrote descriptions of Sri Lanka and its people. These records help explain its history.'),
            ('partial','Foreign accounts provide evidence of Sri Lankan customs and trade in earlier times.'),
            ('missing','Travellers from abroad wrote reviews of their new hotels in Sri Lanka.'),
            ('missing','Visitors from other countries enjoy Sri Lankan beaches and take holiday photographs.'),
            ('missing','Read the accounts by overseas travellers before the next history lesson.'),
            ('missing','Foreign literary sources: revise this heading for the examination.'),
            ('missing','Travellers from abroad never wrote accounts about the past of Sri Lanka.'),
            ('missing','Books written in foreign languages are available at the school library.'),
            ('missing','Nobody from abroad wrote about Sri Lankan history.'),
            ('missing','Nobody visiting the island ever recorded its history in writing.'),
            ('missing','There are no written historical accounts of Sri Lanka by overseas travellers.'),
        ],
        'hist-g10-l01-c04':[
            ('partial','A historian should analyse information from several accounts before selecting the most credible evidence about a past event.'),
            ('partial','Historians check different accounts of the past against one another to decide which information is reliable.'),
            ('partial','Evidence about an ancient event is more dependable when independent historical records agree.'),
            ('partial','A historian assesses the reliability of an account before using it to explain the past.'),
            ('partial','Historical sources can contain bias, so their claims need careful evaluation.'),
            ('partial','Comparing several records helps historians judge whether a description of a past event is trustworthy.'),
            ('missing','A customer should analyse information from several reviews before choosing a hotel.'),
            ('missing','An accountant checks several receipts before selecting the correct total.'),
            ('missing','Read the chapter on checking historical sources for homework tomorrow.'),
            ('missing','Critical analysis of historical sources is the title of our next lesson.'),
            ('missing','A historian should never evaluate the reliability of an account and must accept every claim as true.'),
            ('missing','Historians collect old books and store them on shelves in a library.'),
            ('missing','Nobody needs to check whether historical evidence is reliable.'),
            ('missing','Historical information requires no comparison or critical analysis.'),
        ]}
    rows=[]
    for concept,items in examples.items():
        for i,(label,text) in enumerate(items):
            rows.append(dict(id=f'short-{concept}-{i}',conceptId=concept,text=text,label=label,
                weight=4. if label=='partial' else 3.,source='exposed_failure' if i==0 else 'assistant_authored_training_contrast',humanReviewed=False))
    return rows

def main(out,retention):
    if out.exists():raise ValueError('Output must be fresh')
    raw=(BASE/'model.json').read_bytes()
    if sha(raw)!=BASE_SHA:raise ValueError('Baseline changed')
    artifact=json.loads(raw)
    original_dir=ROOT/'outputs/history-grounded-signed-training-v6-2026-10-18'
    original=read(original_dir/'training-snapshot.json')['rows']
    x=np.load(original_dir/'training-features.npy',allow_pickle=False)
    if sha((original_dir/'training-features.npy').read_bytes())!='c8692f79405b7a7426b3c547772daf1a40e1c6d9e83f39957ba8c97ab8ea948b':raise ValueError('Frozen features changed')
    if sha((original_dir/'training-snapshot.json').read_bytes())!='b9e26494d2d8a4e8f18f95d2ac434ee12c51044cf7ef482bf5e7e5abb55d2ea1':raise ValueError('Frozen labels changed')
    replay=read(BASE/'new-training-cases.json');new=additions();rows=replay+new
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1');encoder.cache_dir=None
    base=GroundedSignedKernelPredictor(artifact,encoder)
    new_x=np.stack([base.extractor.one(r['text'],r['conceptId'])[0] for r in new])
    matrix=np.r_[x,np.load(BASE/'new-training-features.npy',allow_pickle=False),new_x]
    targets=np.array([r['target'] for r in original]+[LABELS.index(r['label']) for r in rows])
    weights=np.array([r['weight'] for r in original]+[r['weight'] for r in rows])
    assert len(matrix)==len(targets)==len(weights)
    z=(matrix-base.mean)/base.scale;candidate=copy.deepcopy(artifact)
    for label,a in enumerate(artifact['heads']):
        binary=(targets==label).astype(int);counts=np.bincount(binary,weights=weights,minlength=2)
        fitted=SVC(C=artifact['metadata']['kernelC'],gamma=a['gamma'],kernel='rbf',random_state=42)
        fitted.fit(z,binary,sample_weight=weights*weights.sum()/(2*counts[binary]))
        candidate['heads'][label]=dict(supportVectors=a['supportVectors']+fitted.support_vectors_.tolist(),
            dualCoefficients=[retention*v for v in a['dualCoefficients']]+[(1-retention)*v for v in fitted.dual_coef_[0]],
            intercept=retention*a['intercept']+(1-retention)*float(fitted.intercept_[0]),gamma=a['gamma'])
    candidate['metadata'].update(experimentId='history-coverage-v6.2-paraphrases-2026-10-19',parentModelSha256=BASE_SHA,
        trainingRows=len(matrix),newTrainingRows=len(new),replayedV61Rows=len(replay),newHumanLabels=0,
        newImageReviewedRows=0,baseHeadRetention=retention,selectionUsesExposedRegressionData=True,
        independentAccuracyClaimAllowed=False,refittedHeads=list(LABELS),
        supportVectorCounts=[len(h['supportVectors']) for h in candidate['heads']],
        updateMethod='Replayed RBF heads with short paraphrase contrasts and baseline retention')
    updated=GroundedSignedKernelPredictor(candidate,encoder)
    decisions=[dict(id=r['id'],label=r['label'],baseline=base.predict(r['text'],r['conceptId'],'English',True),candidate=updated.predict(r['text'],r['conceptId'],'English',True)) for r in new]
    out.mkdir(parents=True);(out/'baseline-model.json').write_bytes(raw)
    write(out/'model.json',candidate);write(out/'new-training-cases.json',rows);np.save(out/'new-training-features.npy',np.r_[np.load(BASE/'new-training-features.npy'),new_x],allow_pickle=False)
    write(out/'new-decisions.json',decisions)
    report=dict(baselineSha256=BASE_SHA,modelSha256=sha((out/'model.json').read_bytes()),originalRows=len(original),replayedV61Rows=len(replay),newRows=len(new),
        fittedExposedFailures=2,baseHeadRetention=retention,newHumanLabels=0,independentAccuracyEstablished=False,
        trainingSnapshotSha256=sha((original_dir/'training-snapshot.json').read_bytes()),newCasesSha256=sha((out/'new-training-cases.json').read_bytes()),
        sourceSha256=sha(Path(__file__).read_bytes()),trainMatchesBefore=sum(r['label']==r['baseline']['suggestedStatus'] for r in decisions),
        trainMatchesAfter=sum(r['label']==r['candidate']['suggestedStatus'] for r in decisions))
    write(out/'training-report.json',report);print(json.dumps(report))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);p.add_argument('--retention',type=float,default=.25)
    a=p.parse_args()
    if not 0<=a.retention<1:raise ValueError('Retention must be in [0,1)')
    with threadpool_limits(limits=2):main(a.output,a.retention)

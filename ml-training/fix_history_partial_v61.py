"""Refit existing History SVM heads with reviewed Partial/Missing contrasts.

No OCR/provider calls. The encoder, features, point head, scaler and review
policy remain frozen. New labels are AI-reviewed. Partial-only fitting is
retained as a reproducible conservative comparison.
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
import numpy as np
from sklearn.svm import SVC
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import LABELS
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_grounded_core import GroundedSignedKernelPredictor

def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(p):return json.loads(Path(p).read_bytes())
def write(p,v):Path(p).write_bytes((json.dumps(v,indent=2)+'\n').encode())


def cases():
    folder=ROOT.parent/'tmp/history-batch2-intake-2026-10-19'
    text=(folder/'notebooks/L02_F/visual-transcript.txt').read_text(encoding='utf-8')
    reference=read(folder/'blind-notebook-reference.json')
    rows=[]
    for ref in reference['cases']:
        if ref['conceptId'] in ('hist-g10-l01-c03','hist-g10-l01-c04'):
            rows.append(dict(id='image-L02_F-'+ref['conceptId'],text=text,conceptId=ref['conceptId'],label=ref['label'],weight=4.,source='assistant_image_review',humanReviewed=False))
    rows.append(dict(id='image-L02_E-page01',text=(folder/'notebooks/L02_E/page_01.visual-transcript.txt').read_text(encoding='utf-8'),conceptId='hist-g10-l01-c03',label='partial',weight=4.,source='assistant_image_review',humanReviewed=False))
    # Explicitly authored diagnostic training contrasts, not new student authors.
    examples={
        'hist-g10-l01-c03':[
            ('partial','Foreign travellers and writers described Sri Lanka. Their accounts provide information about its past, although their interests can affect what they record.'),
            ('partial','Some foreign writers visited Sri Lanka and described what they saw; other writers collected information from people who had been there.'),
            ('partial','Indica by Megasthenes is an example of a foreign written source giving information about Sri Lanka.'),
            ('missing','Bring the book about foreign literary sources to history class tomorrow. Read the chapter and answer later.'),
            ('missing','Foreign tourists booked hotels in Sri Lanka and enjoyed a holiday on the beach.'),
            ('missing','No foreign writer ever recorded information about Sri Lankan history.'),
            ('present','Foreign writers Fa Hsien and Robert Knox wrote accounts about Sri Lanka. These visitors described what they experienced, while writers who did not visit relied on information from other people.'),
        ],
        'hist-g10-l01-c04':[
            ('partial','Historians analyse information from several sources critically and use the most credible evidence to reconstruct past events.'),
            ('partial','Compare historical accounts with archaeological evidence rather than accepting a single account as certain.'),
            ('partial','When interpreting a historical account, ask who wrote it, when it was written, and why the author produced it.'),
            ('missing','Compare the prices of two exercise books before buying one for class.'),
            ('missing','The police compared witness statements to investigate a road accident.'),
            ('missing','Historians must never compare sources or check who produced them. All accounts should be accepted without critical analysis.'),
            ('present','Historians check who produced a source, when it was written, why it was produced and how the author obtained information. They compare the account with inscriptions and other independent sources to corroborate events.'),
        ]}
    for concept,items in examples.items():
        for i,(label,text) in enumerate(items):rows.append(dict(id=f'authored-{concept}-{i}',text=text,conceptId=concept,label=label,weight=2.,source='assistant_authored_training_contrast',humanReviewed=False))
    return rows


def main(out,head_mode):
    if out.exists():raise ValueError('Output must be fresh')
    source=ROOT/'outputs/history-coverage-v6-grounded-2026-10-18-r2'
    raw=(source/'model.json').read_bytes();artifact=json.loads(raw)
    if sha(raw)!='445f2986afecc521597d5ff82e69191bfe782e38ab42a099d49d5d4d8477f629':raise ValueError('Frozen baseline changed')
    training=ROOT/'outputs'/artifact['metadata']['trainingSourceDirectory']
    original=read(training/'training-snapshot.json')['rows'];x=np.load(training/'training-features.npy',allow_pickle=False)
    if sha((training/'training-features.npy').read_bytes())!=artifact['metadata']['featureMatrixSha256'] or sha((training/'training-snapshot.json').read_bytes())!=artifact['metadata']['trainingSnapshotSha256']:raise ValueError('Original training source changed')
    if len(original)!=len(x):raise ValueError('Training row/feature mismatch')
    new=cases();encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1');encoder.cache_dir=None
    base=GroundedSignedKernelPredictor(artifact,encoder)
    new_x=np.stack([base.extractor.one(r['text'],r['conceptId'])[0] for r in new])
    matrix=np.r_[x,new_x];targets=np.array([r['target'] for r in original]+[LABELS.index(r['label']) for r in new]);weights=np.array([r['weight'] for r in original]+[r['weight'] for r in new])
    z=(matrix-base.mean)/base.scale
    candidate=copy.deepcopy(artifact)
    changed=[1] if head_mode=='partial' else list(range(3))
    for label in changed:
        binary=(targets==label).astype(int)
        counts=np.bincount(binary,weights=weights,minlength=2)
        head=SVC(C=artifact['metadata']['kernelC'],gamma=artifact['heads'][label]['gamma'],kernel='rbf',random_state=42)
        head.fit(z,binary,sample_weight=weights*weights.sum()/(2*counts[binary]))
        candidate['heads'][label]=dict(supportVectors=head.support_vectors_.tolist(),dualCoefficients=head.dual_coef_[0].tolist(),intercept=float(head.intercept_[0]),gamma=float(head._gamma))
    candidate['metadata'].update(experimentId='history-coverage-v6.1-partial-2026-10-19',parentModelSha256=sha(raw),partialHeadRefitted=True,
        newTrainingRows=len(new),newImageReviewedRows=3,newImageNotebooks=2,newImageSourceFamilies=1,newHumanLabels=0,
        independentAccuracyClaimAllowed=False,unchangedCompleteAndMissingHeads=head_mode=='partial',trainingRows=len(original)+len(new),
        refittedHeads=[LABELS[i] for i in changed],supportVectorCounts=[len(h['supportVectors']) for h in candidate['heads']])
    updated=GroundedSignedKernelPredictor(candidate,encoder)
    before=[base.predict(r['text'],r['conceptId'],'English',True) for r in new]
    after=[updated.predict(r['text'],r['conceptId'],'English',True) for r in new]
    if head_mode=='partial' and (candidate['heads'][0]!=artifact['heads'][0] or candidate['heads'][2]!=artifact['heads'][2]):raise ValueError('Other class head changed')
    for k in artifact:
        if k not in ('heads','metadata') and artifact[k]!=candidate[k]:raise ValueError('Inference architecture changed')
    out.mkdir(parents=True);(out/'baseline-model.json').write_bytes(raw)
    write(out/'model.json',candidate);write(out/'new-training-cases.json',new)
    np.save(out/'new-training-features.npy',new_x,allow_pickle=False)
    write(out/'new-decisions.json',[dict(id=r['id'],label=r['label'],baseline=a,candidate=b) for r,a,b in zip(new,before,after)])
    report=dict(baselineSha256=sha(raw),modelSha256=sha((out/'model.json').read_bytes()),newRows=len(new),originalRows=len(original),
        refittedHeads=[LABELS[i] for i in changed],frozenComponents=['encoder','features','scaler','rubrics','pointModel','reviewPolicy'],
        originalFeatureMatrixSha256=sha((training/'training-features.npy').read_bytes()),newCasesSha256=sha((out/'new-training-cases.json').read_bytes()),
        sourceSha256=sha(Path(__file__).read_bytes()),newHumanLabels=0,independentAccuracyEstablished=False,
        trainMatchesBefore=sum(r['label']==p['suggestedStatus'] for r,p in zip(new,before)),trainMatchesAfter=sum(r['label']==p['suggestedStatus'] for r,p in zip(new,after)))
    write(out/'training-report.json',report);print(json.dumps(report),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--heads',choices=['all','partial'],default='all')
    args=parser.parse_args()
    with threadpool_limits(limits=2):main(args.output,args.heads)

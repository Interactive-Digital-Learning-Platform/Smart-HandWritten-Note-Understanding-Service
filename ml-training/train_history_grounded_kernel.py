"""Fit a small SVM to frozen History passage-support training features."""
import argparse
import copy
import json
from pathlib import Path
import numpy as np
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from train_student_note_batch import sha
from smart_note_training.english_coverage import LABELS


def run(args):
    source=Path(args.source);out=Path(args.output)
    if out.exists():raise ValueError('Choose fresh output')
    matrix=source/'training-features.npy';snapshot=source/'training-snapshot.json'
    x=np.load(matrix,allow_pickle=False);rows=json.loads(snapshot.read_bytes())['rows']
    if len(rows)!=len(x) or not np.isfinite(x).all():raise ValueError('Invalid feature matrix')
    artifact=json.loads((source/args.contract_file).read_bytes())
    if sha(matrix.read_bytes())!=artifact['metadata']['featureMatrixSha256']:raise ValueError('Feature matrix changed')
    y=np.asarray([r['target'] for r in rows]);w=np.asarray([r['weight'] for r in rows])
    scaler=StandardScaler().fit(x,sample_weight=w);z=scaler.transform(x)
    heads=[];margins=[];portable=[]
    for label in range(3):
        binary=(y==label).astype(int)
        counts=np.bincount(binary,weights=w,minlength=2)
        model=SVC(C=4.,gamma=1/x.shape[1],kernel='rbf',random_state=42)
        model.fit(z,binary,sample_weight=w*w.sum()/(2*counts[binary]))
        heads.append(dict(supportVectors=model.support_vectors_.tolist(),dualCoefficients=model.dual_coef_[0].tolist(),intercept=float(model.intercept_[0]),gamma=float(model._gamma)))
        margins.append(model.decision_function(z))
        portable.append(np.exp(-model._gamma*np.square(z[:,None,:]-model.support_vectors_[None,:,:]).sum(axis=2))@model.dual_coef_[0]+model.intercept_[0])
    error=float(np.max(np.abs(np.asarray(margins)-np.asarray(portable))))
    if error>1e-9:raise ValueError('Portable kernel disagrees with fitted classifier')
    result=copy.deepcopy(artifact)
    result.update(schemaVersion=12 if artifact['schemaVersion']==12 else 11,heads=heads,scalerMean=scaler.mean_.tolist(),scalerScale=scaler.scale_.tolist(),modelType='history_frozen_encoder_grounded_svm_head')
    for key in ('weights','intercept'):result.pop(key,None)
    result['metadata'].update(experimentId=out.name,trainingMethod='small_grounded_svm_concept_head',humanReviewed=False,enabledByDefault=False,
        assistantReviewFitted=True,trainingSnapshotSha256=sha(snapshot.read_bytes()),featureMatrixSha256=sha(matrix.read_bytes()),
        trainingSourceDirectory=source.name,supportVectorCounts=[len(h['supportVectors']) for h in heads])
    raw=(json.dumps(result,indent=2)+'\n').encode();out.mkdir(parents=True);(out/'model.json').write_bytes(raw)
    report=dict(modelSha256=sha(raw),trainingRows=len(rows),fittingMatches=int((np.asarray(margins).argmax(axis=0)==y).sum()),
        portableMaxError=error,independentAccuracyClaimAllowed=False,assistantReviewFitted=True)
    (out/'training-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    p.add_argument('--contract-file',default='model.json')
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())

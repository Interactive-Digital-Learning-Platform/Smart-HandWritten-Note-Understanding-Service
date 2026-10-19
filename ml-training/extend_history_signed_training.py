"""Add positive-assertion evidence and rubric-derived polarity contrasts."""
import argparse
import json
from pathlib import Path
import re
import numpy as np
from train_student_note_batch import ROOT,sha
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_grounded_core import GroundedSignedFeatures,SIGNED_FEATURES,positive_assertion_features


def run(args):
    source=Path(args.source);out=Path(args.output)
    if out.exists():raise ValueError('Choose fresh output')
    artifact=json.loads((source/'feature-contract.json').read_bytes())
    matrix=source/'training-features.npy'
    if sha(matrix.read_bytes())!=artifact['metadata']['featureMatrixSha256']:raise ValueError('Source matrix changed')
    x=np.load(matrix,allow_pickle=False);snapshot=json.loads((source/'training-snapshot.json').read_bytes());rows=snapshot['rows']
    concepts={c['id']:c for c in artifact['rubrics']['concepts']};added=[]
    for c in concepts.values():
        points=[p['text'] for p in c['points']];full=' '.join(points)
        variants=[('all-denied',' '.join('It is not true that '+p[0].lower()+p[1:] for p in points),2),
            ('conflicting',full+' It is not true that '+points[0][0].lower()+points[0][1:],1)]
        changed=re.sub(r'ended the independent ([A-Za-z ]+?) monarchy',r'meant the \1 monarchy was no longer independent',full,flags=re.I)
        if changed!=full:
            variants.append(('change-of-state',changed,0))
            variants.append(('change-of-state-context','British control was extended. '+changed,0))
        for variant,text,target in variants:
            added.append(dict(recordId=f'public-grounded-polarity-{c["id"]}-{variant}',text=text,conceptId=c['id'],target=target,weight=2.,source='public_rubric_polarity_contrast'))
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache.update(FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-evidence-v6-2026-10-18/encoder-cache').cache);encoder.cache_dir=None
    encoder.prime({q for r in rows+added for _,_,q in semantic_spans(r['text'])})
    extra=np.stack([positive_assertion_features(r['text'],concepts[r['conceptId']],encoder) for r in rows])
    features=GroundedSignedFeatures(artifact,encoder)
    new=np.stack([features.one(r['text'],r['conceptId'])[0] for r in added])
    out.mkdir(parents=True);np.save(out/'training-features.npy',np.r_[np.c_[x,extra],new],allow_pickle=False)
    snapshot.update(rows=rows+added,polarityContrastRows=len(added))
    (out/'training-snapshot.json').write_text(json.dumps(snapshot,indent=2)+'\n',encoding='utf-8')
    artifact.update(features=SIGNED_FEATURES,schemaVersion=12)
    artifact['metadata'].update(featureMatrixSha256=sha((out/'training-features.npy').read_bytes()),enabledByDefault=False)
    (out/'feature-contract.json').write_text(json.dumps(artifact,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(trainingRows=len(rows+added),polarityContrastRows=len(added),features=len(SIGNED_FEATURES))))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())

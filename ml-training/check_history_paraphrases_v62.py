"""Check exposed History regressions plus separate, non-fitted typed probes.

These assistant-authored probes are development diagnostics, never independent
student accuracy. The two formerly unseen V6.1 failures are now fitted cases.
"""
import argparse, hashlib, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_grounded_core import GroundedSignedKernelPredictor

def run(model_file,output):
    if output.exists():raise ValueError('Output must be fresh')
    raw=model_file.read_bytes();artifact=json.loads(raw)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1');encoder.cache_dir=None
    model=GroundedSignedKernelPredictor(artifact,encoder)
    previous=json.loads((ROOT/'outputs/history-coverage-v6.1-partial-2026-10-19/partial-checks.json').read_bytes())
    rows=[{k:v for k,v in r.items() if k!='prediction'} for r in previous['rows']]
    for r in rows:
        if r['source']=='post_fit_assistant_authored_probe':r['source']='exposed_v61_regression'
    probes={
        'hist-g10-l01-c03':[
            ('partial','Writings left by overseas visitors tell historians about the customs of Sri Lanka in former times.'),
            ('partial','Descriptions of the island by people from abroad help us reconstruct Sri Lankan history.'),
            ('partial','A traveller from another country recorded what life was like in old Sri Lanka.'),
            ('missing','The overseas visitors described the swimming pool at their Sri Lankan hotel in an online review.'),
            ('missing','Tomorrow we must read about travellers who wrote accounts of ancient Sri Lanka.'),
            ('missing','Nobody from overseas ever left a written description of Sri Lanka in the past.'),
        ],
        'hist-g10-l01-c04':[
            ('partial','To judge an account of an ancient event, historians weigh its claims against other records.'),
            ('partial','An account of the past may be biased; historians evaluate it before trusting the information.'),
            ('partial','Historians compare evidence from different records to find a dependable account of past events.'),
            ('missing','The shopper weighed claims from different advertisements before buying a refrigerator.'),
            ('missing','Homework: read the section on evaluating the reliability of historical evidence.'),
            ('missing','Historical records must always be trusted without evaluating their reliability or comparing accounts.'),
        ]}
    for concept,items in probes.items():
        for i,(expected,text) in enumerate(items):rows.append(dict(id=f'new-{concept}-{i}',conceptId=concept,text=text,expected=expected,source='non_fitted_assistant_probe'))
    training=json.loads((model_file.parent/'new-training-cases.json').read_bytes())
    keys={(r['conceptId'],' '.join(r['text'].lower().split())) for r in training}
    assert all((r['conceptId'],' '.join(r['text'].lower().split())) not in keys for r in rows if r['source']=='non_fitted_assistant_probe')
    for row in rows:row['prediction']=model.predict(row['text'],row['conceptId'],'English',True)
    groups={s:dict(total=sum(r['source']==s for r in rows),matches=sum(r['source']==s and r['expected']==r['prediction']['suggestedStatus'] for r in rows)) for s in sorted({r['source'] for r in rows})}
    report=dict(modelSha256=hashlib.sha256(raw).hexdigest(),total=len(rows),matches=sum(r['expected']==r['prediction']['suggestedStatus'] for r in rows),groups=groups,
        failures=[dict(id=r['id'],expected=r['expected'],actual=r['prediction']['suggestedStatus']) for r in rows if r['expected']!=r['prediction']['suggestedStatus']],
        falseComplete=[r['id'] for r in rows if r['expected']!='present' and r['prediction']['suggestedStatus']=='present'],humanVerified=False,independentAccuracyEstablished=False,rows=rows)
    output.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k!='rows'}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--model',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):
        a=p.parse_args();run(a.model,a.output)

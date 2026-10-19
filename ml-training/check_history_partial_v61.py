"""Frozen image-reference checks and new typed behavior probes; no fitting."""
import argparse,json,hashlib,sys
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
    source=ROOT.parent/'tmp/history-batch2-intake-2026-10-19'
    text=(source/'notebooks/L02_F/visual-transcript.txt').read_text(encoding='utf-8')
    refs=json.loads((source/'blind-notebook-reference.json').read_bytes())
    rows=[dict(id='notebook-'+r['conceptId'],conceptId=r['conceptId'],expected=r['label'],text=text,source='prior_assistant_image_reference') for r in refs['cases']]
    rows.append(dict(id='foreign-page',conceptId='hist-g10-l01-c03',expected='partial',text=(source/'notebooks/L02_E/page_01.visual-transcript.txt').read_text(encoding='utf-8'),source='prior_assistant_image_reference'))
    probes=[
        ('foreign-paraphrase','hist-g10-l01-c03','partial',"Travellers from abroad wrote about Sri Lanka's history and society. These accounts can help us understand the island's past."),
        ('critical-paraphrase','hist-g10-l01-c04','partial','A historian should analyse information from several accounts before selecting the most credible evidence about a past event.'),
        ('foreign-reminder','hist-g10-l01-c03','missing','Read the chapter about foreign literary sources and answer the questions next lesson.'),
        ('critical-reminder','hist-g10-l01-c04','missing','Source criticism: bring the exercise book tomorrow and answer later.'),
        ('foreign-denial','hist-g10-l01-c03','missing','No foreign author has ever written any information about Sri Lankan history.'),
        ('critical-denial','hist-g10-l01-c04','missing','Historians must never check sources or compare historical accounts. They should accept everything without verification.'),
        ('foreign-unrelated','hist-g10-l01-c03','missing','Foreign tourists travel to Sri Lanka for beach holidays and book modern hotels.'),
        ('critical-unrelated','hist-g10-l01-c04','missing','A mechanic compares prices from several shops to choose spare parts for a car.'),
    ]
    rows += [dict(id=i,conceptId=c,expected=e,text=t,source='post_fit_assistant_authored_probe') for i,c,e,t in probes]
    training=json.loads((model_file.parent/'new-training-cases.json').read_bytes())
    keys={(r['conceptId'],' '.join(r['text'].lower().split())) for r in training}
    assert all((r['conceptId'],' '.join(r['text'].lower().split())) not in keys for r in rows if r['source']=='post_fit_assistant_authored_probe')
    for row in rows:row['prediction']=model.predict(row['text'],row['conceptId'],'English',True)
    report=dict(modelSha256=hashlib.sha256(raw).hexdigest(),total=len(rows),matches=sum(r['expected']==r['prediction']['suggestedStatus'] for r in rows),
        failures=[dict(id=r['id'],expected=r['expected'],actual=r['prediction']['suggestedStatus']) for r in rows if r['expected']!=r['prediction']['suggestedStatus']],
        falseComplete=[r['id'] for r in rows if r['expected']!='present' and r['prediction']['suggestedStatus']=='present'],humanVerified=False,independentAccuracyEstablished=False,rows=rows)
    output.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k!='rows'}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--model',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    a=p.parse_args();run(a.model,a.output)

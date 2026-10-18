"""Small assistant-authored behavior checks, never a real-student accuracy claim."""
import argparse
import contextlib
import hashlib
import json
from pathlib import Path
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_point_coverage import PointCoveragePredictor

ROOT=Path(__file__).resolve().parent
CASES=[
 ('sources-complete','hist-g10-l01-c01','present','Evidence left by people helps historians study past human life. Written books and documents are literary sources. Coins, inscriptions and old buildings are archaeological remains.'),
 ('sources-partial','hist-g10-l01-c01','partial','Historians use evidence about people in the past. Books and written records are literary sources.'),
 ('sources-missing','hist-g10-l01-c01','missing','Tomorrow I need to bring my history book and ruler. Our classroom has twenty desks.'),
 ('sources-question','hist-g10-l01-c01','missing','What are literary and archaeological sources? Give examples. I have not answered these questions yet.'),
 ('prehistory-complete','hist-g10-l02-c01','present','Homo sapiens lived in Sri Lanka about 125000 years ago. These early people hunted animals and gathered food, adapting their way of life to different environments.'),
 ('prehistory-no-date','hist-g10-l02-c01','partial','Homo sapiens inhabited Sri Lanka. They survived by hunting and gathering food and adapted to different environments.'),
 ('prehistory-one-idea','hist-g10-l02-c01','partial','Early people survived by hunting animals and collecting food plants. They adapted to different environments.'),
 ('prehistory-unrelated','hist-g10-l02-c01','missing','Village products were taken to towns for trading. Intermediate settlements connected villages to cities.'),
 ('polonnaruwa-complete','hist-g10-l07-c02','present','After strong rulers died, struggles over succession weakened Polonnaruwa. Financial difficulties and pressure from outside the kingdom also contributed to its downfall.'),
 ('polonnaruwa-partial','hist-g10-l07-c02','partial','Rival claims to the throne after powerful rulers caused conflict and weakened Polonnaruwa.'),
 ('polonnaruwa-missing','hist-g10-l07-c02','missing','Literary texts and poems were composed during the Dambadeniya period. Students should remember their authors.'),
 ('industry-complete','hist-g11-l01-c03','present','Growing demand for machinery led to improved methods of producing iron and steel. Coal provided fuel, while improvements in mining and steam machines helped industry grow.'),
 ('industry-partial','hist-g11-l01-c03','partial','Demand for machinery encouraged better ways to produce iron and steel.'),
 ('industry-missing','hist-g11-l01-c03','missing','The postal system made communication cheaper. People moved to cities to find work.'),
 ('kandy-complete','hist-g11-l02-c04','present','In 1815 the Kandyan kingdom came under British rule. The independent Kandyan monarchy ended and British control extended across the whole island.'),
 ('kandy-partial','hist-g11-l02-c04','partial','The Kandyan kingdom came under British rule in 1815.'),
 ('kandy-missing','hist-g11-l02-c04','missing','Kandyan Convention is our next lesson. I have written only its title.'),
 ('kandy-ocr-review','hist-g11-l02-c04',None,'In l8l5 the Kandyan kingdom came under British rule. The monarchy lost independence and Britain controlled the whole island.'),
]


def run(args):
    out=Path(args.output)
    if out.exists():raise ValueError('Choose fresh output')
    raw=Path(args.model).read_bytes()
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache_dir=None
    model=PointCoveragePredictor(json.loads(raw),encoder)
    cases=[]
    for name,concept,expected,text in CASES:
        prediction=model.predict(text,concept,'English',True)
        cases.append(dict(id=name,conceptId=concept,text=text,expected=expected,prediction=prediction))
    report=dict(modelSha256=hashlib.sha256(raw).hexdigest(),total=len(cases),
        matches=sum(c['expected']==c['prediction']['suggestedStatus'] for c in cases),
        independentRealStudentAccuracy=False,source='Assistant-authored small post-fit behavior checks',cases=cases)
    out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='cases'},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--model',required=True);p.add_argument('--output',required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())

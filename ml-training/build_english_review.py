"""Create a blind, offline human review packet; no predictions or author labels."""
import argparse
import hashlib
import json
from pathlib import Path
import random


def packet(challenge_path,rubric_path):
    challenge=json.loads(Path(challenge_path).read_text(encoding='utf-8'))
    rubrics=json.loads(Path(rubric_path).read_text(encoding='utf-8'))
    concepts={c['id']:c for c in rubrics['concepts']}
    examples=[]
    for e in challenge['examples']:
        c=concepts[e['conceptId']]
        examples.append({'id':e['id'],'conceptId':e['conceptId'],'concept':c['name'],'text':e['text'],
                         'requirements':[p['text'] for p in c['points']]})
    random.Random(42).shuffle(examples)
    payload={'version':'english-coverage-human-review-v1','examples':examples}
    payload['packetSha256']=hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return payload


def build(challenge,rubrics,output):
    root=Path(output)
    if root.exists():raise FileExistsError('review output must be fresh')
    data=packet(challenge,rubrics)
    template=Path(__file__).with_name('review-english-template.html').read_text(encoding='utf-8')
    root.mkdir(parents=True)
    (root/'index.html').write_text(template.replace('__REVIEW_DATA__',json.dumps(data,ensure_ascii=True).replace('</','<\\/')),encoding='utf-8')
    (root/'packet.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(root.resolve()/'index.html')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--challenge',required=True);p.add_argument('--rubrics',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();build(a.challenge,a.rubrics,a.output)

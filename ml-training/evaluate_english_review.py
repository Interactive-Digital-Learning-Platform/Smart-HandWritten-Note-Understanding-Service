"""Score the frozen model against a completed human review; never refit it."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from smart_note_training.english_coverage import CoveragePredictor,LABELS,sha,write_json
from smart_note_training.metrics import classification_metrics
from train_english_coverage import rule_predictions


def validate_review(packet,review):
    identity={k:v for k,v in packet.items() if k!='packetSha256'}
    expected=hashlib.sha256(json.dumps(identity,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    if expected!=packet['packetSha256'] or review.get('packetSha256')!=expected:
        raise ValueError('review packet content/hash mismatch')
    if review.get('schemaVersion')!=1 or review.get('packetVersion')!=packet['version']:
        raise ValueError('review schema mismatch')
    if review.get('completed') is not True or not str(review.get('reviewer','')).strip():
        raise ValueError('completed human review and reviewer name/initials required')
    if review.get('modelPredictionsShown') is not False:
        raise ValueError('review must disclose that model predictions were hidden')
    answers=review.get('answers',[])
    index={e['id']:e for e in packet['examples']}
    if len(answers)!=len(index) or {a['id'] for a in answers}!=set(index):
        raise ValueError('review must contain each example exactly once')
    for a in answers:
        if a.get('conceptId')!=index[a['id']]['conceptId'] or a.get('label') not in (*LABELS,'unclear'):
            raise ValueError('invalid concept or label')
        if not isinstance(a.get('comment'),str) or (a['label']=='unclear' and not a['comment'].strip()):
            raise ValueError('unclear cases need a review reason')
    return {a['id']:a for a in answers}


def score_review(model_path,packet_path,review_path,output_path):
    out=Path(output_path)
    if out.exists():raise FileExistsError('evaluation output must be fresh')
    packet=json.loads(Path(packet_path).read_text(encoding='utf-8'))
    review=json.loads(Path(review_path).read_text(encoding='utf-8'))
    answers=validate_review(packet,review)
    manifest_path=Path(packet_path).parent/'frozen-evaluation.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    if sha(model_path)!=manifest['modelSha256'] or sha(packet_path)!=manifest['packetFileSha256']:
        raise ValueError('model or packet changed after review preparation')
    predictor=CoveragePredictor(json.loads(Path(model_path).read_text(encoding='utf-8')))
    actual=[];predicted=[];rules=[];decisions=[];excluded=[]
    for e in packet['examples']:
        a=answers[e['id']]
        if a['label']=='unclear':
            excluded.append({'id':e['id'],'reason':a['comment']});continue
        x,evidence=predictor.extractor.one(e['text'],e['conceptId'],explain=True)
        p=predictor.probabilities(x);label=LABELS[int(p.argmax())]
        actual.append(LABELS.index(a['label']));predicted.append(int(p.argmax()));rules+=rule_predictions([x])
        decisions.append({'id':e['id'],'conceptId':e['conceptId'],'humanLabel':a['label'],'predicted':label,
                          'scores':p.tolist(),'reviewComment':a['comment'],'evidence':evidence})
    if not actual:raise ValueError('no unambiguous reviewed examples available')
    result={'evaluationType':'human-owner-reviewed synthetic diagnostic; not real handwriting or a fresh population test',
            'modelSha256':sha(model_path),'reviewSha256':sha(review_path),'packetSha256':packet['packetSha256'],
            'reviewer':review['reviewer'],'reviewedCount':len(answers),'scoredCount':len(actual),
            'excludedUnclear':excluded,'model':classification_metrics(actual,predicted),
            'rubricRules':classification_metrics(actual,rules),
            'constantBaselines':{label:classification_metrics(actual,[i]*len(actual)) for i,label in enumerate(LABELS)},
            'modelRefitted':False,'automaticDeployment':False}
    out.mkdir(parents=True)
    write_json(out/'evaluation.json',result);write_json(out/'decisions.json',decisions)
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser()
    for flag in ('model','packet','review','output'):p.add_argument('--'+flag,required=True)
    a=p.parse_args();score_review(a.model,a.packet,a.review,a.output)

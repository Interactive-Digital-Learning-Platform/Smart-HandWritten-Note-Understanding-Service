"""Evaluate the frozen v2 candidate on new human labels, without refitting."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from smart_note_training.english_coverage import LABELS,sha,write_json
from smart_note_training.english_coverage_v2 import CoveragePredictorV2
from smart_note_training.metrics import classification_metrics
from evaluate_english_review import validate_review
from train_english_coverage_v2 import v2_rule_predictions


def score_review(model_path,packet_path,review_path,out):
    out=Path(out)
    if out.exists():raise FileExistsError('output must be fresh')
    packet_path=Path(packet_path)
    packet=json.loads(packet_path.read_text(encoding='utf-8'));review=json.loads(Path(review_path).read_text(encoding='utf-8'))
    answers=validate_review(packet,review)
    frozen=json.loads(packet_path.with_name('frozen-evaluation.json').read_text(encoding='utf-8'))
    if frozen['modelSha256']!=sha(model_path) or frozen['packetFileSha256']!=sha(packet_path):raise ValueError('frozen model/packet mismatch')
    for filename,digest in frozen['inferenceSourceHashes'].items():
        if sha(filename)!=digest:raise ValueError('frozen inference implementation changed: '+filename)
    predictor=CoveragePredictorV2(json.loads(Path(model_path).read_text(encoding='utf-8')))
    actual=[];predicted=[];rules=[];decisions=[];unclear=[]
    for e in packet['examples']:
        a=answers[e['id']]
        if a['label']=='unclear':unclear.append({'id':e['id'],'comment':a['comment']});continue
        x,evidence=predictor.extractor.one(e['text'],e['conceptId'],True);p=predictor.probabilities(x)
        actual.append(LABELS.index(a['label']));predicted.append(int(p.argmax()));rules+=v2_rule_predictions([x])
        decisions.append({'id':e['id'],'conceptId':e['conceptId'],'humanLabel':a['label'],'predicted':LABELS[int(p.argmax())],
                          'scores':p.tolist(),'reviewComment':a['comment'],'evidence':evidence})
    if not actual:raise ValueError('no unambiguous reviewed examples')
    score=classification_metrics(actual,predicted);baseline=classification_metrics(actual,rules)
    screen={'accuracyAtLeast80Percent':score['accuracy']>=.8,'macroF1AtLeast75Percent':score['macroF1']>=.75,
            'eachClassRecallAtLeast70Percent':all(v['recall']>=.7 for v in score['perClass'].values()),
            'completePrecisionAtLeast90Percent':score['perClass']['present']['precision']>=.9,
            'beatsRulesAccuracy':score['accuracy']>baseline['accuracy']}
    result={'evaluationType':'new human-reviewed synthetic diagnostic; not real handwriting or a random population sample',
            'modelSha256':sha(model_path),'reviewSha256':sha(review_path),'packetSha256':packet['packetSha256'],
            'reviewer':review['reviewer'],'reviewedCount':len(answers),'scoredCount':len(actual),'excludedUnclear':unclear,
            'model':score,'rubricRules':baseline,'screen':{'passed':all(screen.values()),'criteria':screen},
            'falseCompleteCount':sum(p==0 and a!=0 for a,p in zip(actual,predicted)),
            'modelRefitted':False,'automaticDeployment':False}
    out.mkdir(parents=True);write_json(out/'evaluation.json',result);write_json(out/'decisions.json',decisions)
    (out/'submitted-human-review.json').write_bytes(Path(review_path).read_bytes())
    print(json.dumps(result,indent=2));return result


if __name__=='__main__':
    p=argparse.ArgumentParser()
    for key in ('model','packet','review','output'):p.add_argument('--'+key,required=True)
    a=p.parse_args();score_review(a.model,a.packet,a.review,a.output)

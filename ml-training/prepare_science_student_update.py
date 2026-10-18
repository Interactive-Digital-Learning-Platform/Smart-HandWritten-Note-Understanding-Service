"""Version an update of the existing Science head and check exposed regressions.

The user requested applying the continued-training weights to the existing model.
This script does not create new training labels or claim fresh held-out accuracy.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage_v31 import CoveragePredictorV31
from smart_note_training.metrics import classification_metrics
from smart_note_training import LABELS
from evaluate_english_review import validate_review


def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(path):return json.loads(Path(path).read_bytes())
def write(path,value):path.write_bytes((json.dumps(value,indent=2)+'\n').encode('utf-8'))


def score(model,examples,labels):
    predictions=[model.predict(e['text'],e['conceptId'],'English',True) for e in examples]
    metrics=classification_metrics([LABELS.index(v) for v in labels],[LABELS.index(p['rawModelStatus']) for p in predictions])
    return {'rawModel':metrics,'falseCompleteSuggestions':sum(p['suggestedStatus']=='present' and label!='present' for p,label in zip(predictions,labels)),
            'withheldCount':sum(p['suggestedStatus'] is None for p in predictions)},predictions


def prepare(checkpoint,output):
    checkpoint=Path(checkpoint);output=Path(output)
    if output.exists():raise ValueError('Choose a fresh output directory')
    baseline_file=ROOT.parent/'models/english-coverage-v3.1.json';baseline_raw=baseline_file.read_bytes();baseline=read(baseline_file)
    candidate_raw=checkpoint.read_bytes();candidate=json.loads(candidate_raw)
    training=read(checkpoint.with_name('report.json'))
    if training['baseModelSha256']!=sha(baseline_raw) or training['candidateModelSha256']!=sha(candidate_raw) or not training['candidateTrained']:
        raise ValueError('Continued-training checkpoint integrity failed')
    # This is exactly the same extractor, scaler, rubric and learned-head shape.
    for key in set(baseline)|set(candidate):
        if key not in ('weights','intercept','metadata') and baseline.get(key)!=candidate.get(key):
            raise ValueError('Unexpected architecture/feature change: '+key)
    if baseline['weights']==candidate['weights'] and baseline['intercept']==candidate['intercept']:
        raise ValueError('No training update found')
    updated=copy.deepcopy(candidate)
    updated['metadata'].update({'experimentId':'english-coverage-v3.2-student-notes-2026-10-18',
        'releaseType':'continued_training_of_existing_science_model','reviewRequired':True,
        'updateProvenance':{'previousModelSha256':sha(baseline_raw),'checkpointSha256':sha(candidate_raw),
            'trainingDatasetSha256':training['datasetSha256'],'addedAiLabelledExamples':training['trainingRows'],
            'sourceChapterFamilies':training['trainingNoteGroups'],'humanReviewedNewTrainingExamples':0,
            'synthetic':True,'inputSource':'supplied_transcripts_not_image_ocr',
            'freshHumanHoldoutAvailable':False,'independentAccuracyClaimAllowed':False}})
    old_model=CoveragePredictorV31(baseline);new_model=CoveragePredictorV31(updated)
    regressions={};failures=[];decisions=[]
    for name,packet_dir,review_dir in [
        ('review-v1','english-coverage-review-2026-10-06','english-coverage-v1-human-review-01'),
        ('review-v2','english-coverage-v2-review-2026-10-06','english-coverage-v2-human-review-01'),
        ('review-v3','english-coverage-v3-review-2026-10-06','english-coverage-v3-human-review-01')]:
        packet=read(ROOT/'reviews'/packet_dir/'packet.json');review=read(ROOT/'outputs'/review_dir/'submitted-human-review.json')
        answers=validate_review(packet,review)
        examples=[e for e in packet['examples'] if answers[e['id']]['label'] in LABELS]
        labels=[answers[e['id']]['label'] for e in examples]
        before,before_predictions=score(old_model,examples,labels);after,after_predictions=score(new_model,examples,labels)
        regressions[name]={'baseline':before,'updated':after,'previouslyExposedDevelopmentData':True}
        if after['rawModel']['macroF1']<before['rawModel']['macroF1'] or after['falseCompleteSuggestions']>before['falseCompleteSuggestions']:
            failures.append(name+' regressed')
        for e,label,a,b in zip(examples,labels,before_predictions,after_predictions):
            decisions.append({'set':name,'id':e['id'],'label':label,'baselineRaw':a['rawModelStatus'],'updatedRaw':b['rawModelStatus'],
                'baselineSuggestion':a['suggestedStatus'],'updatedSuggestion':b['suggestedStatus']})
    demos=[('complete','Add Benedict solution to the food sample.\nHeat the sample in a hot water bath.\nA brick red precipitate indicates reducing sugar.','present'),
        ('partial','Add Benedict solution to the food sample.\nA brick red precipitate indicates reducing sugar.','partial'),
        ('missing','Living organisms contain carbon, hydrogen, oxygen and nitrogen.','missing')]
    for name,text,expected in demos:
        prediction=new_model.predict(text,'sci-g10-cbl-007','English',True)
        if prediction['suggestedStatus']!=expected:failures.append('Benedict '+name+' regressed')
    output.mkdir(parents=True)
    (output/'previous-model.json').write_bytes(baseline_raw)
    write(output/'updated-model.json',updated)
    report={'releaseType':'same_model_continued_training','version':updated['metadata']['experimentId'],
        'previousModelSha256':sha(baseline_raw),'updatedModelSha256':sha((output/'updated-model.json').read_bytes()),
        'addedAiLabelledExamples':training['trainingRows'],'newHumanLabelsUsed':0,'synthetic':True,
        'architectureUnchanged':True,'featuresScalersRubricsAndPolicyUnchanged':True,'regressions':regressions,
        'benedictPresentationCases':3,'failures':failures,'compatibilityChecksPassed':not failures,
        'freshIndependentAccuracyEvaluation':False,'liveModelChangedByThisScript':False}
    write(output/'update-report.json',report);write(output/'regression-decisions.json',decisions)
    print(json.dumps(report,indent=2))
    if failures:raise SystemExit(1)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--checkpoint',required=True);parser.add_argument('--output',required=True)
    a=parser.parse_args();prepare(a.checkpoint,a.output)

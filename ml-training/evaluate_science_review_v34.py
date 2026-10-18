"""Preserve original AI scores and separately score the auditable assistant review."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage_v31 import CoveragePredictorV31
from evaluate_student_science_notes import metrics


def main():
    out=ROOT/'outputs/science-v34-review-fix-2026-10-18'
    raw=(out/'candidate-model.json').read_bytes();model=CoveragePredictorV31(json.loads(raw))
    review_bytes=(out/'assistant-label-review.json').read_bytes();review=json.loads(review_bytes)
    dataset=(ROOT/'outputs/science-student-v2-final-batch-2026-10-18/dataset.json').read_bytes()
    assert review['datasetSha256']==hashlib.sha256(dataset).hexdigest()
    assert review['reviewer']['kind']=='ai_assistant' and not review['reviewer']['humanReviewed']
    supplied=json.loads((out/'supplied-v33-decisions.json').read_bytes())
    by_id={r['recordId']:r for r in supplied};labels={}
    for r in review['rows']:
        original=by_id[r['recordId']]
        assert r['originalTeacherLabel']==original['teacherLabel']
        assert r['textSha256']==original['textSha256']
        assert r['inputTextSha256']==hashlib.sha256(original['text'].encode()).hexdigest()
        assert r['requirementsSha256']==hashlib.sha256(json.dumps(original['requirements'],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        assert r['humanReviewed'] is False
        assert r['assistantReviewedLabel'] in ('present','partial','missing')
        assert r['recordId'] not in labels
        for span in r['conflicts']+[s for p in r['pointAssessments'] for s in p['evidence']]:
            assert original['text'][span['start']:span['end']]==span['quote']
        labels[r['recordId']]=r['assistantReviewedLabel']
    groups={
        'supplied':supplied,
        'human':json.loads((out/'human-v33-decisions.json').read_bytes()),
        'authored':json.loads((out/'authored-v33-decisions.json').read_bytes()),
    }
    for name,rows in groups.items():
        for r in rows:r['v34']=model.predict(r['modelInputText'] if name=='supplied' else r['text'],r['conceptId'],'English',True)
        (out/f'{name}-v34-decisions.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')

    def compare(rows,labelkey,adjudicated=False):
        inputs=[{**r,'teacherLabel':labels.get(r['recordId'],r[labelkey]) if adjudicated else r[labelkey]} for r in rows]
        return {version:metrics(inputs,[r[version] for r in rows]) for version in ('v33','v34')}

    held=[r for r in supplied if r['split']=='holdout']
    report={
        'modelVersion':model.artifact['metadata']['experimentId'],'modelSha256':hashlib.sha256(raw).hexdigest(),
        'assistantReviewSha256':hashlib.sha256(review_bytes).hexdigest(),
        'originalDatasetSha256':hashlib.sha256(dataset).hexdigest(),
        'newHumanReviewedLabels':0,'weightsRefitted':False,'independentAccuracyEstablished':False,
        'reviewedRows':len(labels),'changedAiLabels':sum(r['labelChanged'] for r in review['rows']),
        'originalAi71':compare(held,'teacherLabel'),
        'assistantAdjudicated71':compare(held,'teacherLabel',True),
        'adjudicatedSetMeaning':'Four reviewed labels override the original AI labels in a separate evaluation view; the other 66 original labels are unchanged and not newly adjudicated. These 71 exposed synthetic transcript examples are development data.',
        'reviewedFive':compare([r for r in supplied if r['recordId'] in labels],'teacherLabel',True),
        'humanDevelopment90':compare(groups['human'],'humanLabel'),
        'authoredDevelopment48':compare(groups['authored'],'expectedLabel'),
    }
    assert report['humanDevelopment90']['v34']['visible']['correct']==90
    assert report['humanDevelopment90']['v34']['visible']['falseCompleteSuggestions']==0
    assert report['authoredDevelopment48']['v34']['visible']['correct']==48
    assert report['reviewedFive']['v34']['visible']['correct']==5
    (out/'comparison-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({name:{v:{'correct':m['visible']['correct'],'total':m['visible']['total'],'withheld':m['visible']['withheld'],'falseComplete':m['visible']['falseCompleteSuggestions']} for v,m in report[name].items()} for name in ('originalAi71','assistantAdjudicated71','reviewedFive','humanDevelopment90','authoredDevelopment48')},indent=2))


if __name__=='__main__':main()

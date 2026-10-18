"""Compare v3.3 to saved pre-change decisions; all inspected sets are development data."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage_v31 import CoveragePredictorV31
from smart_note_training.metrics import classification_metrics
from evaluate_student_science_notes import metrics,describe


def main():
    out=ROOT/'outputs/science-v33-evidence-fix-2026-10-18'
    raw=(out/'candidate-model.json').read_bytes()
    model=CoveragePredictorV31(json.loads(raw))
    frozen=json.loads((out/'baseline-manifest.json').read_bytes())
    assert hashlib.sha256((out/'challenge.json').read_bytes()).hexdigest()==frozen['challengeSha256']
    batch=json.loads((ROOT/'outputs/science-v32-note-evaluation-2026-10-18/decisions.json').read_bytes())
    challenge=json.loads((out/'baseline-challenge.json').read_bytes())
    human=json.loads((out/'baseline-human-regressions.json').read_bytes())
    for rows,key in [(batch,'modelInputText'),(challenge,'text'),(human,'text')]:
        for r in rows:r['v33']=model.predict(r[key],r['conceptId'],'English',True)

    def compare(rows,labelkey,previous):
        # Reuse common precision/recall and visible-abstention accounting without
        # changing any dataset labels or their review provenance.
        inputs=[{**r,'teacherLabel':r[labelkey]} for r in rows]
        return {'before':metrics(inputs,[previous(r) for r in rows]),
                'after':metrics(inputs,[r['v33'] for r in rows])}

    held=[r for r in batch if r['split']=='holdout']
    report={
        'modelSha256':hashlib.sha256(raw).hexdigest(),
        'modelVersion':model.artifact['metadata']['experimentId'],
        'weightsRefitted':False,'independentAccuracyEstablished':False,
        'humanReviewedNewLabels':0,'ocrEvaluated':False,
        'suppliedSetMeaning':'Previously held-out 71 AI-labelled transcript examples, now exposed development data used to guide repairs. Not a fresh accuracy test.',
        'suppliedDescription':describe(held),
        'supplied71':compare(held,'teacherLabel',lambda r:r['predictions']['updated']),
        'suppliedByConcept':{c:compare([r for r in held if r['conceptId']==c],'teacherLabel',lambda r:r['predictions']['updated']) for c in sorted({r['conceptId'] for r in held})},
        'suppliedWholeNotes':compare([r for r in held if r['variant']=='whole'],'teacherLabel',lambda r:r['predictions']['updated']),
        'authored48':compare(challenge,'expectedLabel',lambda r:r['prediction']),
        'authoredSetMeaning':'Developer-authored scientific diagnostic frozen before code changes, subsequently used during implementation. Not independent human gold data.',
        'humanDevelopment90':compare(human,'humanLabel',lambda r:r['prediction']),
        'humanBySet':{s:compare([r for r in human if r['set']==s],'humanLabel',lambda r:r['prediction']) for s in ('v1','v2','v3')},
        'remainingSuppliedDisagreements':[
            {'recordId':r['recordId'],'reference':r['teacherLabel'],'prediction':r['v33']['suggestedStatus'],
             'aiConflicts':r['source']['teacherConflicts']} for r in held if r['teacherLabel']!=r['v33']['suggestedStatus']],
    }
    assert report['humanDevelopment90']['after']['visible']['correct']>=report['humanDevelopment90']['before']['visible']['correct']
    assert report['humanDevelopment90']['after']['visible']['falseCompleteSuggestions']<=report['humanDevelopment90']['before']['visible']['falseCompleteSuggestions']
    assert report['authored48']['after']['visible']['correct']==48
    assert report['supplied71']['after']['visible']['correct']>report['supplied71']['before']['visible']['correct']
    (out/'comparison-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    for name,rows in [('supplied-v33-decisions.json',batch),('authored-v33-decisions.json',challenge),('human-v33-decisions.json',human)]:
        (out/name).write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('modelSha256','supplied71','humanBySet','remainingSuppliedDisagreements')},indent=2))


if __name__=='__main__':main()

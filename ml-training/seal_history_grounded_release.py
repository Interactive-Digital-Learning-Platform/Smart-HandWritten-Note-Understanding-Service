"""Seal a Notes-only History update after explicit regression gates pass."""
import json
from pathlib import Path
import shutil
from train_student_note_batch import ROOT,sha
from coverage_runtime_bundle import HISTORY_SHA,HISTORY_SOURCES


def run():
    selected=ROOT/'outputs/history-grounded-svm-v6-2026-10-18-03'
    release=ROOT/'outputs/history-coverage-v6-grounded-2026-10-18-r2'
    if (release/'protocol.json').exists():raise ValueError('Release is already sealed')
    raw=(release/'model.json').read_bytes();artifact=json.loads(raw)
    original=json.loads((selected/'model.json').read_bytes())
    def params(value):return {k:v for k,v in value.items() if k!='metadata'}
    if sha(raw)!=HISTORY_SHA or params(artifact)!=params(original):raise ValueError('Release parameters differ from evaluated candidate')
    evaluation=json.loads((selected/'evaluation.json').read_bytes())
    if evaluation['modelSha256']!=sha((selected/'model.json').read_bytes()):raise ValueError('Evaluation is for another model')
    summaries={name:values['summary'] for name,values in evaluation['sets'].items()}
    gates=dict(olderTest=summaries['exposedSyntheticTest']['matches']>=330,
        olderValidation=summaries['exposedSyntheticValidation']['matches']>=328,
        olderReviewedDevelopment=summaries['exposedHumanReview']['matches']>=22,
        noFalseCompleteTest=not summaries['exposedSyntheticTest']['falseComplete'],
        noFalseCompleteValidation=not summaries['exposedSyntheticValidation']['falseComplete'],
        presentation=summaries['presentation']['matches']==12,previousTypedChecks=summaries['previousFreshChecks']['matches']==18)
    if not all(gates.values()):raise ValueError('History release gates failed')
    predecessor=ROOT/'outputs/history-coverage-v5.1-review-policy-2026-10-15'
    old_protocol=json.loads((predecessor/'protocol.json').read_bytes())
    for name,expected in old_protocol['sourceHashes'].items():
        if sha(Path(name).read_bytes())!=expected:raise ValueError('Frozen predecessor source changed')
    names=['english_coverage','english_coverage_v3','english_coverage_v31',*HISTORY_SOURCES]
    files=[Path('ml-training/src/smart_note_training')/(name+'.py') for name in names]
    files += [Path('ml-training')/name for name in ('history_preview_cli.py','coverage_runtime_bundle.py',
        'train_history_grounded_kernel.py','train_history_grounded_core.py','extend_history_grounded_training.py',
        'extend_history_signed_training.py','evaluate_history_evidence.py','check_history_related_challenges.py','seal_history_grounded_release.py')]
    hashes={}
    for relative in files:
        payload=(ROOT.parent/relative).read_bytes();hashes[relative.as_posix()]=sha(payload)
        destination=release/'source'/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(payload)
    protocol=dict(modelSha256=HISTORY_SHA,sourceHashes=hashes,schemaVersion=12,
        assistantReviewFitted=True,humanReviewed=False,independentAccuracyClaimAllowed=False,
        encoderAndRubricsFrozen=True,parametersSha256=sha(json.dumps(params(artifact),sort_keys=True).encode()),
        trainingSnapshotSha256=artifact['metadata']['trainingSnapshotSha256'],regressionGates=gates,
        predecessorSha256=sha((predecessor/'model.json').read_bytes()),reviewRequired=True)
    (release/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n',encoding='utf-8')
    for name in ('evaluation.json','related-challenges.json','training-report.json'):
        shutil.copyfile(selected/name,release/('candidate-'+name))
    audit=ROOT/'outputs/history-student-ef-assistant-review-2026-10-18-02/adjudication.json'
    shutil.copyfile(audit,release/'assistant-adjudication.json')
    summary=dict(modelSha256=HISTORY_SHA,parentEvaluatedSha256=evaluation['modelSha256'],parametersUnchanged=True,
        summaries=summaries,relatedChallengeSummary={k:v for k,v in json.loads((selected/'related-challenges.json').read_bytes()).items() if k!='cases'},
        originalHumanTrainingReplayRows=18,assistantReviewedTrainingCases=50,originalTeacherLabelsCorrected=20,
        independentRealStudentAccuracy=False,realHandwritingOcrEvaluated=False,reviewRequired=True,
        automaticHistoryEnabled=False,gates=gates,scope='Notes-only Docker/runtime update; no hosting deployment')
    (release/'release.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(modelSha256=HISTORY_SHA,sourceFiles=len(hashes),gates=gates)))


if __name__=='__main__':run()

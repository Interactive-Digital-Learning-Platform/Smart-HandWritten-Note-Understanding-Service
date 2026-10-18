"""Freeze the improved offline candidate and publish an honest assistant-review report.

Does not change runtime model pins, student records, human confirmations or the
original AI dataset. A candidate that regresses older checks is not promoted.
"""
import argparse
from collections import Counter
import contextlib
import hashlib
import html
import json
from pathlib import Path
import shutil
from train_student_note_batch import ROOT, BASE, read_batch
from smart_note_training.history_semantic import FrozenEncoder
from smart_note_training.history_point_coverage import PointCoveragePredictor


def sha(raw):return hashlib.sha256(raw).hexdigest()


def run(args):
    out=Path(args.output).resolve()
    if out.exists():raise ValueError('Choose a fresh frozen output')
    model_path=Path(args.model).resolve()
    raw=model_path.read_bytes()
    data,rows,digest=read_batch(args.dataset,args.splits)
    reserved=[r for r in rows if r['subject']=='history' and r['split']=='holdout']
    audit_raw=Path(args.adjudication).read_bytes();audit=json.loads(audit_raw)
    truth={r['recordId']:r for r in audit['rows']}
    if audit['datasetSha256']!=digest or audit['humanReviewed'] is not False or set(truth)!={r['recordId'] for r in reserved}:
        raise ValueError('Audit provenance mismatch')
    out.mkdir(parents=True)
    (out/'model.json').write_bytes(raw)
    (out/'adjudication.json').write_bytes(audit_raw)
    files=['src/smart_note_training/'+n+'.py' for n in ('english_coverage','english_coverage_v3','english_coverage_v31',
        'history_coverage','history_coverage_v31','history_semantic','history_semantic_core','history_semantic_review',
        'history_partial','history_point_coverage')]
    files += ['train_history_point_update.py','review_history_student_batch.py','finalize_history_partial_review.py',
        'evaluate_history_point_regressions.py','check_history_fresh_cases.py']
    hashes={}
    for name in files:
        payload=(ROOT/name).read_bytes();hashes[name]=sha(payload)
        target=out/'source'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(payload)
    protocol=dict(modelSha256=sha(raw),datasetSha256=digest,adjudicationSha256=sha(audit_raw),
        sourceHashes=hashes,sourceRoot='ml-training',humanReviewed=False,reviewCasesUsedForTraining=False,
        evaluationMeaning='Exposed assistant-reviewed synthetic development examples; not independent real-student accuracy.',
        runtimeChanged=False,promotionStatus='blocked_by_legacy_regressions',
        trainingSnapshotSha256=sha(model_path.with_name('training-snapshot.json').read_bytes()))
    (out/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n',encoding='utf-8')
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    extra=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-student-ef-baseline-2026-10-18/encoder-cache')
    encoder.cache.update(extra.cache);encoder.cache_dir=None
    model=PointCoveragePredictor(json.loads(raw),encoder)
    prior=json.loads((ROOT/'outputs/history-student-ef-ai-comparison-2026-10-18/decisions.json').read_bytes())
    old={r['recordId']:r for r in prior}
    decisions=[]
    for r in reserved:
        pred=model.predict(r['modelInputText'],r['conceptId'],'English',True)
        decisions.append(dict(recordId=r['recordId'],conceptId=r['conceptId'],conceptName=next(c['name'] for c in data['rubrics']['history']['concepts'] if c['id']==r['conceptId']) if 'rubrics' in data else r['conceptId'],
            text=r['modelInputText'],review=truth[r['recordId']],baseline=old[r['recordId']]['baseline'],
            priorCandidate=old[r['recordId']]['candidate'],prediction=pred))
    def metrics(key):
        return dict(matches=sum(d[key]['suggestedStatus']==d['review']['assistantLabel'] for d in decisions),total=len(decisions),
            perClass={label:dict(support=sum(d['review']['assistantLabel']==label for d in decisions),
                matched=sum(d['review']['assistantLabel']==d[key]['suggestedStatus']==label for d in decisions)) for label in ('present','partial','missing')},
            falseComplete=sum(d['review']['assistantLabel']!='present' and d[key]['suggestedStatus']=='present' for d in decisions),
            withheld=sum(d[key]['suggestedStatus'] is None for d in decisions))
    report=dict(modelSha256=sha(raw),reviewedCases=50,correctedLabels=sum(d['review']['assistantLabel']!=d['review']['originalTeacherLabel'] for d in decisions),
        reviewLabels=dict(Counter(d['review']['assistantLabel'] for d in decisions)),baseline=metrics('baseline'),
        priorCandidate=metrics('priorCandidate'),candidate=metrics('prediction'),runtimeChanged=False,
        humanReviewed=False,independentAccuracyClaimAllowed=False,promotionStatus='blocked_by_legacy_regressions')
    pack=json.loads((ROOT.parent/'packaging/coverage-verification.json').read_bytes())
    regression=[dict(id=c['id'],expected=c['prediction']['suggestedStatus'],prediction=model.predict(c['input']['text'],c['input']['conceptId'],'English',True)) for c in pack['cases'] if c['subject']=='history']
    report['presentationChecks']=dict(total=len(regression),matched=sum(r['expected']==r['prediction']['suggestedStatus'] for r in regression))
    for name,value in [('report',report),('decisions',decisions),('regression',regression)]:
        (out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    esc=html.escape
    cards=[]
    label=lambda v:{'present':'Complete','partial':'Partial','missing':'Missing',None:'Needs review'}[v]
    for d in decisions:
        r=d['review'];p=d['prediction'];match=r['assistantLabel']==p['suggestedStatus']
        cards.append('<article><h2>'+esc(d['conceptId'])+'</h2><p>'+esc(d['recordId'])+'</p><p><b>Original AI: '+label(r['originalTeacherLabel'])+' · Assistant review: '+label(r['assistantLabel'])+' · Candidate: '+label(p['suggestedStatus'])+'</b> — '+('matches' if match else 'unresolved')+'</p><p>'+esc(r['reason'])+'</p><details><summary>Read note and evidence</summary><pre>'+esc(d['text'])+'</pre>'+''.join('<p><b>'+esc(e['requirement'])+'</b><br>'+esc(e['semanticCandidateEvidence'])+'</p>' for e in p['evidence']['points'])+'</details></article>')
    page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>History assistant review results</title><style>body{font:16px system-ui;background:#fff7ed;color:#172033;max-width:960px;margin:auto;padding:24px}article,header{background:white;padding:22px;margin:18px 0;border:1px solid #fed7aa;border-radius:16px}h1{font-size:28px}h2{font-size:18px}pre{white-space:pre-wrap;font:inherit;line-height:1.6}summary{cursor:pointer;color:#b45309}p{line-height:1.6}</style><header><h1>History review completed by the assistant</h1><p>50 examples reviewed; 20 proposed labels corrected. These are synthetic notes. This is an AI development review, not human confirmation or independent student accuracy.</p><p>Candidate: '+str(report['candidate']['matches'])+'/50 matching reviewed labels; Partial '+str(report['candidate']['perClass']['partial']['matched'])+'/29. The running app still uses History V5.1 because the candidate regresses older checks.</p><p>The source dataset and human-review confirmations remain unchanged.</p></header>'+''.join(cards)+'</html>'
    (out/'assistant-review-results.html').write_text(page,encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('model','dataset','splits','adjudication','output'):p.add_argument('--'+name,required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())

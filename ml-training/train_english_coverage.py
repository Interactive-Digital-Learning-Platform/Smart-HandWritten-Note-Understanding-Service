"""Independent English coverage experiment. Preserves all existing artifacts.

Select C only with student/family-grouped CV inside the TRAIN partition.
Evaluate the frozen selection once on existing validation; never score TEST.
"""
from __future__ import annotations
import argparse
from collections import Counter
import json
from pathlib import Path
import sys
import time

sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
import numpy as np
from sklearn.model_selection import LeaveOneGroupOut
from threadpoolctl import threadpool_limits
from smart_note_training.english_coverage import (CoverageFeatures,CoveragePredictor,LABELS,FEATURES,
    export_model,fit_classifier,load_rubrics,sha,write_json)
from smart_note_training.metrics import classification_metrics


def example(record):
    return {'recordId':record.record_id,'noteGroupId':record.note_group_id,
            'group':record.evaluation_group_id,'split':record.preassigned_split,
            'conceptId':record.concept_id,'text':record.note_text,
            'target':LABELS.index(record.target_label),'language':record.language,
            'variant':getattr(record,'text_variant','whole_note'),
            'weight':getattr(record,'sample_weight',1.),'keywords':list(record.concept_keywords)}


def select_english(records,ids,variant=None):
    return [example(r) for r in records if r.language.lower()=='english' and r.concept_id in ids
            and (variant is None or getattr(r,'text_variant',None)==variant)]


def check_separation(train,validation):
    if any(r['split']!='train' for r in train): raise ValueError('non-training row supplied for fitting')
    if any(r['split']!='validation' for r in validation): raise ValueError('evaluation must use validation only')
    for key in ('group','noteGroupId'):
        if {r[key] for r in train}&{r[key] for r in validation}: raise ValueError(key+' leakage')
    if {r['text'] for r in train}&{r['text'] for r in validation}: raise ValueError('duplicate-text leakage')


def summary(rows):
    return {'examples':len(rows),'groups':len({r['group'] for r in rows}),'notes':len({r['noteGroupId'] for r in rows}),
            'concepts':len({r['conceptId'] for r in rows}), 'classCounts':dict(Counter(LABELS[r['target']] for r in rows))}


def rule_predictions(x):
    # Predeclared fixed rubric baseline; never fitted to validation.
    return [2 if row[2]<.5 else (0 if row[4]==1 else 1) for row in x]


def score(rows,probabilities,features,majority):
    if not rows: return {'sampleCount':0,'reason':'No supported English records in this slice'}
    actual=[r['target'] for r in rows]
    result={'model':classification_metrics(actual,probabilities.argmax(axis=1).tolist()),
            'trainingMajority':classification_metrics(actual,[majority]*len(rows)),
            'rubricRules':classification_metrics(actual,rule_predictions(features)),'population':summary(rows)}
    # Illustrative review workload only: no tuning and no automatic admission from this slice.
    for threshold in (.7,.8,.9):
        mask=probabilities.max(axis=1)>=threshold
        result.setdefault('uncalibratedScoreSlices',{})[str(threshold)]={
            'count':int(mask.sum()),'coverage':float(mask.mean()),
            'metrics':classification_metrics(np.asarray(actual)[mask].tolist(),probabilities[mask].argmax(axis=1).tolist()) if mask.any() else None}
    return result


def grouped_selection(rows,rubrics):
    ys=np.asarray([r['target'] for r in rows]);groups=np.asarray([r['group'] for r in rows])
    weights=np.asarray([r['weight'] for r in rows])
    outputs={c:np.full((len(rows),3),np.nan) for c in (.1,1.,10.)}
    folds=[]
    for train_index,holdout in LeaveOneGroupOut().split(np.zeros(len(rows)),ys,groups):
        if set(ys[train_index])!={0,1,2}: raise ValueError('a grouped fold lacks a training class')
        tr=[rows[i] for i in train_index];va=[rows[i] for i in holdout]
        extractor=CoverageFeatures(rubrics).fit(tr)
        x=extractor.transform(tr);v=extractor.transform(va)
        for c in outputs:
            scaler,clf=fit_classifier(x,ys[train_index],weights[train_index],c)
            outputs[c][holdout]=clf.predict_proba(scaler.transform(v))
        folds.append({'heldOutGroup':str(groups[holdout[0]]),'fitExamples':len(tr),'heldOutExamples':len(va),
                      'heldOutIds':[r['recordId'] for r in va]})
    metrics={str(c):classification_metrics(ys.tolist(),p.argmax(axis=1).tolist()) for c,p in outputs.items()}
    selected=max(outputs,key=lambda c:(metrics[str(c)]['macroF1'],metrics[str(c)]['balancedAccuracy'],-c))
    return selected,metrics,outputs[selected],folds


def run(args):
    output=Path(args.output).resolve()
    if output.exists(): raise FileExistsError('output must be a fresh directory')
    rubrics=load_rubrics(args.rubrics);ids={c['id'] for c in rubrics['concepts']}
    # Reuse strict source admission only, not the previous experiment's training recipe.
    from smart_note_training.contrastive_release import load_preparation
    from smart_note_training.reviewed_release import verify_unchanged
    package,parent,augmentation,_=load_preparation(args.preparation)
    train=select_english(package.pages.records,ids,'corrected')
    raw_train=select_english(package.pages.records,ids,'raw_ocr')
    # The two OCR variants constitute one labelled pair; retain its existing total weight.
    for row in train: row['weight']*=2
    notes=select_english([r for r in package.notes.records if r.preassigned_split=='validation'],ids)
    pages=select_english(package.corrected,ids)
    raw=select_english(package.raw,ids)
    check_separation(train,notes+pages+raw)
    if len(train)<15 or set(r['target'] for r in train)!={0,1,2}: raise ValueError('insufficient three-class training data')
    # Existing source admission verifies student/family/translation links. All English
    # examples in each augmentation family share one evaluationGroupId.
    families={}
    for r in package.page_rows:
        if r.get('language')=='English' and r['concept']['id'] in ids and r.get('contrastFamilyId'):
            families.setdefault(r['contrastFamilyId'],set()).add(r['evaluationGroupId'])
    if any(len(v)!=1 for v in families.values()): raise ValueError('family needs a grouped-CV union')
    output.mkdir(parents=True)
    protocol={'experimentId':output.name,'scope':sorted(ids),'language':'English','classifier':'logistic_regression',
        'features':FEATURES,'classifierCGrid':[.1,1.,10.],'selection':'TRAIN leave-one-student/family-out macro-F1, balanced accuracy, smaller C',
        'fitUnit':'reviewed corrected PAGE/concept, original raw+corrected pair weight combined',
        'noteDecision':'one feature vector over every page; not maximum page probabilities',
        'validationUsedForSelection':False,'testScored':False,'rubricSha256':sha(args.rubrics),
        'sourceManifestSha256':sha(Path(args.preparation)/'manifest.json'),'training':summary(train),
        'sourceProvenance':'synthetic, AI-reviewed; not independently human-certified',
        'limitations':['Rubrics authored from curriculum and training examples, including training labels; grouped CV is development evidence.',
                       'Existing validation was historically exposed; it is not a fresh independent test.',
                       'Phrase matching cannot reliably detect contradictions, numeric errors or unseen paraphrases.',
                       'Page-trained classifier is separately measured on whole-note references; no assumption of equal performance.',
                       'Only ten supported concepts, and some have just one synthetic training family.'],
        'readinessGate':{'minimumValidationPerClass':10,'accuracy':.8,'macroF1':.75,'minimumRecall':.7,
                         'mustBeatMajorityAccuracy':True,'mustBeatRulesMacroF1':True,'independentTestRequiredForDeployment':True},
        'enabledByDefault':False}
    write_json(output/'protocol.json',protocol)
    write_json(output/'rubrics.json',rubrics)
    start=time.perf_counter()
    selected,cv,cv_prob,folds=grouped_selection(train,rubrics)
    extractor=CoverageFeatures(rubrics).fit(train);x=extractor.transform(train)
    y=[r['target'] for r in train];weights=[r['weight'] for r in train]
    scaler,clf=fit_classifier(x,y,weights,selected)
    artifact=export_model(extractor,scaler,clf,{'experimentId':output.name,'selectedC':selected,'enabledByDefault':False,
        'reviewRequired':True,'synthetic':True,'independentHumanCertified':False,'protocolSha256':sha(output/'protocol.json')})
    write_json(output/'model.json',artifact)
    restored=CoveragePredictor(json.loads((output/'model.json').read_text(encoding='utf-8')))
    rx=restored.extractor.transform(train)
    error=float(np.abs(restored.probabilities(rx)-clf.predict_proba(scaler.transform(x))).max())
    if error>1e-10: raise ValueError('portable artifact probability mismatch')
    majority=Counter(y).most_common(1)[0][0]
    evaluations={};predictions=[]
    for tag,rows in [('wholeNoteValidation',notes),('correctedPageValidation',pages),('rawPageValidation',raw)]:
        if not rows: evaluations[tag]={'sampleCount':0};continue
        features=extractor.transform(rows);p=clf.predict_proba(scaler.transform(features))
        fresh=restored.probabilities(restored.extractor.transform(rows))
        if not np.allclose(p,fresh,atol=1e-10,rtol=0): raise ValueError('validation reload mismatch')
        evaluations[tag]=score(rows,p,features,majority)
        for r,prob in zip(rows,p):
            _,evidence=extractor.one(r['text'],r['conceptId'],explain=True)
            predictions.append({'slice':tag,**{k:r[k] for k in ('recordId','noteGroupId','group','conceptId')},
                'actual':LABELS[r['target']],'predicted':LABELS[int(prob.argmax())],
                'probabilities':prob.tolist(),'evidence':evidence})
    whole=evaluations.get('wholeNoteValidation',{})
    m=whole.get('model',{});per=m.get('perClass',{})
    criteria={
        'sufficientClassSupport':bool(per) and all(v['support']>=10 for v in per.values()),
        'accuracyAtLeast80Percent':m.get('accuracy',0)>=.8,
        'macroF1AtLeast75Percent':m.get('macroF1',0)>=.75,
        'eachClassRecallAtLeast70Percent':bool(per) and all(v['recall']>=.7 for v in per.values()),
        'beatsMajorityAccuracy':m.get('accuracy',0)>whole.get('trainingMajority',{}).get('accuracy',1),
        'beatsRubricRulesMacroF1':m.get('macroF1',0)>whole.get('rubricRules',{}).get('macroF1',1)}
    verify_unchanged(package)
    result={'experimentId':output.name,'selectedC':selected,'training':summary(train),
        'trainingFit':classification_metrics(y,clf.predict(scaler.transform(x)).tolist()),
        'groupedTrainingCV':cv,'selectedGroupedCV':score(train,cv_prob,x,majority),
        'validation':evaluations,'validationScreen':{'passed':all(criteria.values()),'criteria':criteria},
        'deploymentReady':False,'enabledByDefault':False,'independentTestAvailable':False,'testScored':False,
        'fitAndEvaluationSeconds':round(time.perf_counter()-start,3),'portableReloadMaxProbabilityError':error,
        'artifactBytes':(output/'model.json').stat().st_size,'limitations':protocol['limitations']}
    write_json(output/'evaluation.json',result)
    write_json(output/'cv-folds.json',folds)
    write_json(output/'training-records.json',[{k:v for k,v in r.items() if k not in ('text','keywords')} for r in train])
    with (output/'validation-predictions.jsonl').open('w',encoding='utf-8') as f:
        for p in predictions: f.write(json.dumps(p,ensure_ascii=False)+'\n')
    print(json.dumps(result,ensure_ascii=True,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--preparation',required=True)
    parser.add_argument('--rubrics',required=True)
    parser.add_argument('--output',required=True)
    with threadpool_limits(limits=2): run(parser.parse_args())

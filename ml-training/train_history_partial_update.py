"""Update the existing frozen-encoder linear History head for incomplete answers.

The fifty assistant-adjudicated notebook cases are development checks only and
never fitted. This is an offline candidate, with no activation side effects.
"""
import argparse
from collections import Counter
import copy
import json
from pathlib import Path
import re
import sys
import numpy as np
from sklearn.preprocessing import StandardScaler

from train_student_note_batch import ROOT, BASE, read_batch, sha, anchored_fit, training_weights
from smart_note_training.english_coverage import LABELS, windows
from smart_note_training.history_semantic import FrozenEncoder, semantic_spans
from smart_note_training.history_semantic_core import CORE_FEATURES
from smart_note_training.history_partial import PartialHistoryFeatures, PartialHistoryPredictor, PARTIAL_FEATURES
from smart_note_training.metrics import classification_metrics


def generated_training(rubrics, training_lessons):
    rows = []
    distractor = 'Classroom reminders. Bring a notebook and a pencil tomorrow. The sports club meets after lunch. Keep the room tidy.'
    for c in rubrics['concepts']:
        if c['lessonId'] not in training_lessons:
            continue
        points = [p['text'] for p in c['points']]
        variants = [('all', ' '.join(points), 'present')]
        for i, point in enumerate(points):
            variants.append((f'point-{i}', point, 'partial'))
            # Retain substantive first clauses, never a title-only "partial".
            parts = re.split(r'\b(?:and|while|including)\b', point, maxsplit=1, flags=re.I)
            if len(parts) == 2 and len(parts[0].split()) >= 6 and len(parts[1].split()) >= 3:
                variants.append((f'fragment-{i}', parts[0].strip(' ,;.') + '.', 'partial'))
            # One explicitly denied requirement plus the remaining correct ones.
            other = ' '.join(p for j, p in enumerate(points) if j != i)
            variants.append((f'denial-{i}', other + ' It is not true that ' + point[0].lower() + point[1:], 'partial'))
        variants += [('unrelated', distractor, 'missing'),
                     ('question', ' '.join('Explain ' + p for p in points) + ' These questions remain unanswered.', 'missing')]
        for name, text, label in variants:
            for context in (False, True):
                value = (distractor + '\n' + text + '\n' + distractor) if context and label != 'missing' else text
                if context and label == 'missing': continue
                rows.append({'recordId':f'public-point-coverage-{c["id"]}-{name}-{int(context)}',
                             'text':value,'conceptId':c['id'],'target':LABELS.index(label),'weight':1.,
                             'provenance':'Public training-chapter rubric coverage contrast; synthetic, not student text'})
    return rows


def run(args):
    out = Path(args.output).resolve()
    if out.exists(): raise ValueError('Choose a fresh output')
    data, batch, dataset_hash = read_batch(args.dataset, args.splits)
    train = [r for r in batch if r['subject'] == 'history' and r['split'] == 'train']
    held = [r for r in batch if r['subject'] == 'history' and r['split'] == 'holdout']
    artifact = json.loads(BASE['history'].read_bytes())
    if data['modelHashes']['history'] != sha(BASE['history'].read_bytes()): raise ValueError('Base hash differs')
    source = ROOT / 'outputs/history-dataset-intake-2026-10-14/source/page-training-examples.jsonl'
    legacy = [json.loads(s) for s in source.read_text(encoding='utf-8').splitlines() if s.strip()]
    rows = [{'recordId':r['recordId'],'text':r['noteTextSnapshot'],'conceptId':r['concept']['id'],
             'target':LABELS.index(r['targetLabel']),'weight':1.,'provenance':'Original History training split replay'}
            for r in legacy if r['textVariant'] == 'corrected' and r['preassignedSplit'] == 'train' and r['trainingEligible']]
    weights = training_weights(train)
    rows += [{'recordId':r['recordId'],'text':r['modelInputText'],'conceptId':r['conceptId'],
              'target':LABELS.index(r['targetLabel']),'weight':w,'provenance':'New AI teacher proposal, weak weight'}
             for r, w in zip(train, weights)]
    concepts = {c['id']:c for c in artifact['rubrics']['concepts']}
    lessons = {concepts[r['conceptId']]['lessonId'] for r in train}
    generated = generated_training(artifact['rubrics'], lessons)
    rows += generated
    pack = json.loads((ROOT.parent / 'packaging/coverage-verification.json').read_bytes())
    regression = [c for c in pack['cases'] if c['subject'] == 'history']
    for c in regression:
        rows.append({'recordId':'presentation-replay-' + c['id'],'text':c['input']['text'],
                     'conceptId':c['input']['conceptId'],'target':LABELS.index(c['prediction']['rawModelStatus']),
                     'weight':3.,'provenance':'Previously exposed presentation regression replay; not accuracy evidence'})
    held_texts = {sha(' '.join(r['modelInputText'].lower().split()).encode()) for r in held}
    if any(sha(' '.join(r['text'].lower().split()).encode()) in held_texts for r in rows):
        raise ValueError('A reserved notebook leaked into fitting')
    if {r['recordId'] for r in rows} & {r['recordId'] for r in held}: raise ValueError('Held IDs fitted')
    out.mkdir(parents=True)
    encoder = FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json', ROOT/'outputs/history-semantic-embedding-cache-v1')
    extra = FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json', ROOT/'outputs/history-student-ef-baseline-2026-10-18/encoder-cache')
    encoder.cache.update(extra.cache)
    encoder.cache_dir = None
    features = PartialHistoryFeatures.restore(artifact); features.encoder = encoder
    # Prime complete text fragments in batches, while leaving the frozen caches intact.
    chunks = {q for r in rows for _, _, q in semantic_spans(r['text'])}
    encoder.prime(chunks)
    values = features.transform(rows)
    extra_scaler = StandardScaler().fit(values[:,len(CORE_FEATURES):], sample_weight=[r['weight'] for r in rows])
    mean = np.r_[artifact['scalerMean'], extra_scaler.mean_]
    scale = np.r_[artifact['scalerScale'], extra_scaler.scale_]
    prior = np.pad(np.asarray(artifact['weights']), ((0,0),(0,len(PARTIAL_FEATURES)-len(CORE_FEATURES))))
    weights, intercept = anchored_fit((values-mean)/scale, np.asarray([r['target'] for r in rows]),
                                      np.asarray([r['weight'] for r in rows]), prior, np.asarray(artifact['intercept']), args.prior_strength)
    candidate = copy.deepcopy(artifact)
    candidate.update({'schemaVersion':6,'features':PARTIAL_FEATURES,'weights':weights.tolist(),'intercept':intercept.tolist(),
                      'scalerMean':mean.tolist(),'scalerScale':scale.tolist()})
    candidate['metadata'].update({'experimentId':out.name,'enabledByDefault':False,'baseModelSha256':sha(BASE['history'].read_bytes()),
        'studentBatchSha256':dataset_hash,'humanReviewed':False,'frozenEncoderAndRubrics':True,
        'trainingMethod':'prior_anchored_existing_linear_head_with_point_support_features','priorStrength':args.prior_strength})
    raw = (json.dumps(candidate, indent=2)+'\n').encode()
    (out/'model.json').write_bytes(raw)
    (out/'training-snapshot.json').write_text(json.dumps({'rows':rows,'reservedNotebookIds':[r['recordId'] for r in held],
        'generatedOnlyFromNewTrainingLessons':sorted(lessons),'newNotebookTrainingCount':len(train)},indent=2)+'\n',encoding='utf-8')
    model = PartialHistoryPredictor(candidate,encoder)
    predictions = [model.predict(r['modelInputText'],r['conceptId'],'English',True) for r in held]
    # Read adjudication targets only AFTER freezing the fitted artifact.
    audit = json.loads(Path(args.adjudication).read_bytes())
    if audit['datasetSha256'] != dataset_hash or audit['humanReviewed'] is not False: raise ValueError('Invalid AI audit')
    truth = {r['recordId']:r['assistantLabel'] for r in audit['rows']}
    if set(truth) != {r['recordId'] for r in held}: raise ValueError('Incomplete evaluation audit')
    actual = [truth[r['recordId']] for r in held]
    regression_results = [{'id':c['id'],'expected':c['prediction']['suggestedStatus'],
        'prediction':model.predict(c['input']['text'],c['input']['conceptId'],'English',True)} for c in regression]
    report = {'candidateModelSha256':sha(raw),'baseModelSha256':sha(BASE['history'].read_bytes()),'newNotebookTrainingRows':len(train),
        'legacyReplayRows':len(rows)-len(train)-len(generated)-len(regression),'generatedRows':len(generated),
        'trainingRows':len(rows),'featureCount':len(PARTIAL_FEATURES),'priorStrength':args.prior_strength,
        'frozenEncoderAndRubrics':True,'humanReviewed':False,'liveModelChanged':False,'deploymentApproved':False,
        'evaluationMeaning':'Assistant-adjudicated, exposed synthetic notebook development regression; never independent student accuracy.',
        'evaluationRows':len(held),'matches':sum(a==p['suggestedStatus'] for a,p in zip(actual,predictions)),
        'rawMetrics':classification_metrics([LABELS.index(a) for a in actual],[LABELS.index(p['rawModelStatus']) for p in predictions]),
        'withheld':sum(p['suggestedStatus'] is None for p in predictions),
        'falseComplete':sum(a!='present' and p['suggestedStatus']=='present' for a,p in zip(actual,predictions)),
        'regressionUnchanged':sum(c['expected']==c['prediction']['suggestedStatus'] for c in regression_results),
        'regressionCount':len(regression_results)}
    decisions = [{'recordId':r['recordId'],'reviewedLabel':a,'prediction':p} for r,a,p in zip(held,actual,predictions)]
    (out/'decisions.json').write_text(json.dumps(decisions,indent=2)+'\n',encoding='utf-8')
    (out/'regression.json').write_text(json.dumps(regression_results,indent=2)+'\n',encoding='utf-8')
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('dataset','splits','adjudication','output'): parser.add_argument('--'+name, required=True)
    parser.add_argument('--prior-strength',type=float,default=.1)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2): run(parser.parse_args())

"""Restore original reviewed training replay and public-rubric paraphrases."""
import argparse
import copy
import json
from pathlib import Path
import re
import numpy as np
from train_student_note_batch import ROOT,sha
from smart_note_training.english_coverage import LABELS
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_grounded_core import GroundedCoreFeatures

PHRASES=[('before island-wide kingship','before kings ruled the whole island'),
    ('prosperous','wealthy'),('chieftains','chiefs'),('held power over','governed'),
    ('local areas','individual regions'),('early inscriptions','ancient inscribed records'),
    ('the title','the designation'),('served as','acted as'),('linked','connected'),
    ('sought influence','tried to gain influence'),('importance','significance'),
    ('increased','raised'),('British rule','British control'),('changing','shifting')]


def paraphrase(text):
    for a,b in PHRASES:text=re.sub(r'\b'+re.escape(a)+r'\b',b,text,flags=re.I)
    return text


def run(args):
    source=Path(args.source);out=Path(args.output)
    if out.exists():raise ValueError('Choose fresh output')
    artifact=json.loads((source/'model.json').read_bytes())
    matrix=source/'training-features.npy'
    if sha(matrix.read_bytes())!=artifact['metadata']['featureMatrixSha256']:raise ValueError('Source matrix changed')
    x=np.load(matrix,allow_pickle=False);rows=json.loads((source/'training-snapshot.json').read_bytes())['rows']
    human=ROOT/'outputs/history-v31-submitted-review-2026-10-15/submitted-original.json'
    if sha(human.read_bytes())!='7ffab3871e80693db4df5d501597bb6493e42a88526c5155452f77a0dfa920f4':raise ValueError('Original reviewed training changed')
    added=[dict(recordId=r['id'],text=r['text'],conceptId=r['conceptId'],target=LABELS.index(r['humanLabel']),weight=4.,
        source='original_human_review_training_replay_not_new_accuracy_data') for r in json.loads(human.read_bytes())['examples']]
    original_ai=ROOT/'outputs/history-ai-review-01-2026-10-14/normalized-review.json'
    prior_checks=ROOT/'outputs/history-coverage-v2-2026-10-14/new-diagnostic-checks.json'
    added += [dict(recordId=r['id'],text=r['text'],conceptId=r['conceptId'],target=LABELS.index(r['reviewedLabel']),weight=4.,
        source='original_ai_diagnostic_training_replay') for r in json.loads(original_ai.read_bytes())['examples']
        if r['id'].startswith('history-diagnostic-') and not r['requiresAdjudication']]
    added += [dict(recordId=r['id'],text=r['text'],conceptId=r['conceptId'],target=LABELS.index(r['aiExpectedLabel']),weight=4.,
        source='original_v2_diagnostic_training_replay') for r in json.loads(prior_checks.read_bytes())['examples']]
    replay_count=len(added)
    for c in artifact['rubrics']['concepts']:
        points=[paraphrase(p['text']) for p in c['points']]
        for variant,text,label in [('full',' '.join(points),0),('partial',' '.join(points[:-1]),1)]:
            added.append(dict(recordId=f'public-grounded-paraphrase-{c["id"]}-{variant}',text=text,conceptId=c['id'],target=label,weight=1.,source='public_rubric_meaning_preserving_phrase_substitution'))
    # Older development/check texts remain unfitted. This check also catches an
    # accidental literal copy of an evaluated example into a paraphrase.
    protected=set()
    for name in ('exposedHumanReview','exposedSyntheticTest','exposedSyntheticValidation'):
        for r in json.loads((ROOT/'outputs/history-coverage-v5.1-review-policy-2026-10-15'/(name+'.json')).read_bytes())['examples']:
            protected.add(sha(' '.join(r['text'].lower().split()).encode()))
    if any(sha(' '.join(r['text'].lower().split()).encode()) in protected for r in added):raise ValueError('Development/check text copied into fitting')
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    encoder.cache.update(FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-evidence-v6-2026-10-18/encoder-cache').cache)
    encoder.cache_dir=None
    features=GroundedCoreFeatures(artifact,encoder)
    encoder.prime({q for r in added for _,_,q in semantic_spans(r['text'])})
    extra=np.stack([features.one(r['text'],r['conceptId'])[0] for r in added])
    out.mkdir(parents=True);np.save(out/'training-features.npy',np.r_[x,extra],allow_pickle=False)
    (out/'training-snapshot.json').write_text(json.dumps(dict(rows=rows+added,assistantReviewFitted=True,humanReviewed=False,
        originalReviewedTrainingRows=18,originalBaseReplayRows=replay_count,
        originalReplaySources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in (human,original_ai,prior_checks)},reservedNotebookIds=[]),indent=2)+'\n',encoding='utf-8')
    artifact['metadata'].update(featureMatrixSha256=sha((out/'training-features.npy').read_bytes()),enabledByDefault=False)
    (out/'feature-contract.json').write_text(json.dumps(artifact,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(trainingRows=len(rows+added),replayedOriginalReviewedRows=18,originalBaseReplayRows=replay_count,addedPublicParaphrases=len(added)-replay_count,
        featureMatrixSha256=artifact['metadata']['featureMatrixSha256'])))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):run(p.parse_args())

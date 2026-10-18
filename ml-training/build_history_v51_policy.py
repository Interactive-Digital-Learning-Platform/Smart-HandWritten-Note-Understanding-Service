"""Version review policy separately; preserve the learned V5 head exactly."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import sha,write_json
from smart_note_training.history_semantic_review import POLICY_VERSION


def run(output):
    out=Path(output);out.mkdir(parents=True,exist_ok=False)
    parent=ROOT/'outputs/history-coverage-v5-semantic-core-2026-10-15'
    model=json.loads((parent/'model.json').read_text(encoding='utf-8'))
    model['metadata']={**model['metadata'],'experimentId':out.name,'parentModelSha256':sha(parent/'model.json'),'weightsRefitted':False}
    model['reviewPolicy']={'version':POLICY_VERSION,'headingsAreNotEvidence':True,'explicitRequiredYearsMustOccurInSemanticCandidate':True,
        'thresholdTuned':False,'abstentionNotRelabelled':True}
    write_json(out/'model.json',model)
    parent_protocol=json.loads((parent/'protocol.json').read_text(encoding='utf-8'))
    sources={**parent_protocol['sourceHashes'],str(ROOT/'src/smart_note_training/history_semantic_review.py'):sha(ROOT/'src/smart_note_training/history_semantic_review.py'),str(Path(__file__)):sha(__file__)}
    protocol={'parentModelSha256':sha(parent/'model.json'),'modelSha256':sha(out/'model.json'),'weightsRefitted':False,'sourceHashes':sources,
        'policyDevelopmentBasis':'Audited V5 false-Complete cases in already exposed synthetic regression data.',
        'independentEvaluationAvailable':False,'liveModelChanged':False}
    write_json(out/'protocol.json',protocol)
    print(json.dumps({'modelSha256':protocol['modelSha256'],'weightsRefitted':False}))


if __name__=='__main__':run(sys.argv[1])

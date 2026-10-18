"""Fresh post-policy AI checks, with abstentions explicitly counted."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.english_coverage import write_json,sha
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_semantic_core import SemanticCorePredictor
from smart_note_training.history_semantic_review import ReviewedSemanticPredictor
from check_history_semantic import score

CASES=[
 ('hist-g10-l07-c02','present','After powerful rulers, struggles over succession to the throne weakened Polonnaruwa. Economic difficulties and external pressures were other causes of decline.'),
 ('hist-g10-l07-c02','partial','Downfall of Polonnaruwa\nEconomic difficulties and external pressures were causes of decline.'),
 ('hist-g11-l03-c03','present','Buddhist leaders and supporters organized religious and educational revival. They helped create Buddhist schools, including Ananda and Dharmaraja.'),
 ('hist-g11-l03-c03','partial','Buddhist revival and schooling\nThey helped establish Buddhist schools including Ananda and Dharmaraja.'),
 ('hist-g11-l02-c04','present','In 1815 the Kandyan kingdom came under British rule. Its independent monarchy ended and British control extended over the whole island.'),
 ('hist-g11-l02-c04','missing','The British had occupied coastal areas and wanted to gain influence over Kandy.'),
 ('hist-g11-l06-c02','present','The constitution adopted in 1972 changed independent Sri Lanka political framework. It made the country a republic instead of retaining Dominion status.'),
 ('hist-g11-l06-c02','partial','The 1978 constitution created an executive presidency and gave more fundamental rights than the 1972 constitution. The country had become a republic rather than retaining Dominion status.'),
 ('hist-g11-l04-c01','present','In 1833 the reforms reorganized British colonial government. They created councils and reshaped administrative divisions.'),
 ('hist-g11-l04-c01','partial','The reforms reorganized British colonial government and created councils and reshaped administrative divisions.')]


def run(output):
    out=Path(output);encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    parent=ROOT/'outputs/history-coverage-v5-semantic-core-2026-10-15/model.json'
    models={'v5':SemanticCorePredictor(json.loads(parent.read_text(encoding='utf-8')),encoder),
        'v51':ReviewedSemanticPredictor(json.loads((out/'model.json').read_text(encoding='utf-8')),encoder)}
    examples=[{'id':f'history-policy-new-{i+1:02d}','conceptId':cid,'text':text,'expectedLabel':label} for i,(cid,label,text) in enumerate(CASES)]
    encoder.prime([q for e in examples for _,_,q in semantic_spans(e['text'])])
    report=score(models,examples)
    report.update({'modelSha256':sha(out/'model.json'),'synthetic':True,'independentHumanReview':False,'usedForPolicyOrFitting':False,
        'interpretation':'New synthetic AI expectations based on supplied proposed criteria; not teacher-certified accuracy.'})
    write_json(out/'new-ai-evidence-checks.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))


if __name__=='__main__':run(sys.argv[1])

"""New-topic AI diagnostic check after the semantic-core head was frozen."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_semantic import FrozenEncoder,semantic_spans
from smart_note_training.history_semantic_core import SemanticCorePredictor
from smart_note_training.history_coverage_v31 import HistoryPredictorV31
from smart_note_training.english_coverage import write_json,sha
from check_history_semantic import score

CASES=[
 ('hist-g10-l06-c01','present','Ancient society organized responsibilities in a hierarchy connecting rulers, officials and local communities. Vertical ranks differed from groups whose members had similar standing or authority.'),
 ('hist-g10-l06-c01','partial','A hierarchy connected kings, officers and communities and allocated their roles in ancient society.'),
 ('hist-g10-l06-c01','missing','Explain kings, officials and communities in social hierarchies. Distinguish vertical ranks from groups of equal authority. These tasks remain unanswered.'),
 ('hist-g10-l08-c01','present','After other kingdoms declined, Kandy remained an independent kingdom inland. Its kings resisted outside pressures until British annexation in 1815.'),
 ('hist-g10-l08-c01','partial','Kandy remained an independent inland kingdom after the decline of other kingdoms.'),
 ('hist-g10-l08-c01','missing','Describe Kandyan independence after other kingdoms declined. Explain resistance to outside pressure and British annexation in 1815. Answer later.'),
 ('hist-g10-l09-c01','present','From the fourteenth to the sixteenth centuries Europe saw renewed art and learning during the Renaissance. Italian centres such as Florence led the revival and renewed interest in classical learning.'),
 ('hist-g10-l09-c01','partial','The Renaissance was a revival of art and learning in Europe between the fourteenth and sixteenth centuries.'),
 ('hist-g10-l09-c01','missing','What was the Renaissance from the fourteenth to sixteenth centuries? Explain Florence, other Italian centres and classical learning. I have not yet answered.'),
 ('hist-g11-l03-c02','present','During British rule Christian missionaries spread their religion by preaching and running schools. English education was associated with jobs in the colonial administration.'),
 ('hist-g11-l03-c02','partial','Missionaries under British rule used preaching and schools to spread Christianity.'),
 ('hist-g11-l03-c02','missing','Explain missionary preaching and schools under British rule. How was English education connected to employment in colonial administration? Unanswered.'),
 ('hist-g11-l06-c01','present','The Soulbury Commission put forward constitutional changes during the 1940s. Independence followed for Sri Lanka in 1948, with parliamentary government.'),
 ('hist-g11-l06-c01','partial','During the 1940s the Soulbury Commission proposed constitutional changes.'),
 ('hist-g11-l06-c01','missing','Explain the Soulbury Commission in the 1940s. Describe Sri Lankan independence in 1948 and parliamentary government. These questions still need answers.'),
 ('hist-g11-l07-c01','present','A political revolution changes governing power substantially over a fairly short period. The American, French and Russian revolutions provide examples of this political transformation.'),
 ('hist-g11-l07-c01','partial','Political revolutions bring major changes in the power that governs a country over a relatively short time.'),
 ('hist-g11-l07-c01','missing','Define rapid major changes in governing power. Explain the American, French and Russian revolutions as examples. Answer later.'),
 ('hist-g11-l06-c01','partial','The Soulbury Commission proposed constitutional changes in the 1940s. Sri Lanka achieved independence in 1949 with parliamentary government.'),
 ('hist-g10-l08-c01','partial','Kandy continued as an independent inland kingdom after others declined. Its rulers never resisted outside pressure before British annexation in 1815.')]


def run(output):
    out=Path(output);encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    model=SemanticCorePredictor(json.loads((out/'model.json').read_text(encoding='utf-8')),encoder)
    old=HistoryPredictorV31(json.loads((ROOT/'outputs/history-coverage-v3.2-2026-10-15/model.json').read_text(encoding='utf-8')))
    examples=[{'id':f'history-core-new-{i+1:02d}','conceptId':cid,'text':text,'expectedLabel':label} for i,(cid,label,text) in enumerate(CASES)]
    encoder.prime([quote for e in examples for _,_,quote in semantic_spans(e['text'])])
    report=score({'v32':old,'semanticV5':model},examples)
    report.update({'modelSha256':sha(out/'model.json'),'synthetic':True,'independentHumanReview':False,'usedForFittingSelectionOrPolicy':False,
        'interpretation':'New AI diagnostic expectations based on supplied proposed criteria; not independent human or handwriting accuracy.'})
    write_json(out/'new-topic-ai-checks.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))


if __name__=='__main__':run(sys.argv[1])

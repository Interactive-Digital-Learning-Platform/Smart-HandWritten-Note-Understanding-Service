"""New AI diagnostic texts scored only after semantic V4 was frozen."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from smart_note_training.history_semantic import FrozenEncoder,SemanticHistoryPredictor,semantic_spans
from smart_note_training.history_coverage_v31 import HistoryPredictorV31
from smart_note_training.english_coverage import write_json,sha
from check_history_semantic import score

CASES=[
 ('hist-g10-l03-c01','present','Before kingship extended over the island, rich chiefs governed separate local regions. The name Parumaka appears in early inscriptions as a title for these leaders.'),
 ('hist-g10-l03-c01','partial','Rich regional chieftains controlled their own areas before the island had widespread kingship.'),
 ('hist-g10-l03-c01','missing','Who governed the regions before island-wide kingship? Explain the wealthy chiefs and the inscription title Parumaka. These questions remain unanswered.'),
 ('hist-g10-l05-c01','present','Ancient people watched the natural world and applied practical observations to everyday life. Knowledge gained from experience helped them develop engineering and other technical achievements.'),
 ('hist-g10-l05-c01','partial','Observation of nature taught ancient communities practical things they could use in daily activities.'),
 ('hist-g10-l05-c01','missing','Explain how ancient communities learned from nature and used observations in daily work. Describe how experience shaped engineering and technical achievements. Answer later.'),
 ('hist-g10-l07-c01','present','Anuradhapura and Polonnaruwa were large centres of ancient city life. Administration, surplus in the economy and exchange helped those cities grow.'),
 ('hist-g10-l07-c01','partial','Anuradhapura and Polonnaruwa were major centres where ancient urban life developed.'),
 ('hist-g10-l07-c01','missing','Name the ancient cities Anuradhapura and Polonnaruwa. Explain administration, surplus and exchanges in their growth. I have not yet written an answer.'),
 ('hist-g11-l05-c01','present','Colonial British policy supported plantation farming aimed at exports. Cultivation of coffee, tea and rubber altered economic activity and the use of land.'),
 ('hist-g11-l05-c01','partial','British economic policy promoted export-oriented plantation farming.'),
 ('hist-g11-l05-c01','missing','How did British policy support export plantation agriculture? What did coffee, tea and rubber change about economic activity and land use? These questions are unanswered.'),
 ('hist-g11-l01-c01','present','Britain began the Industrial Revolution in the later eighteenth century as production increasingly used machines. Capital, colonial markets, natural resources and political conditions supported Britain industrializing first.'),
 ('hist-g11-l01-c01','partial','Capital and colonial markets together with resources and political conditions helped Britain industrialize before other countries.'),
 ('hist-g11-l01-c01','missing','When did the Industrial Revolution begin in Britain? Explain machine production and the roles of capital, colonial markets, resources and political conditions. Still need to answer.'),
 ('hist-g11-l08-c01','present','European rivalries and alliances contributed to the outbreak of World War I. Starting in Europe, it spread as multiple major powers became involved.'),
 ('hist-g11-l08-c01','partial','Rivalries and alliances between European powers were among the causes of World War I.'),
 ('hist-g11-l08-c01','missing','Describe European rivalries and alliances before World War I. Explain how a war beginning in Europe spread with participation by major powers. These tasks remain unanswered.'),
 ('hist-g10-l01-c01','partial','Sources give evidence about the human past. Books and written documents are archaeological remains; coins and physical buildings are literary sources.'),
 ('hist-g11-l04-c01','partial','The reforms of 1834 reorganized British colonial government and administration. They established councils and reshaped administrative divisions.'),
 ('hist-g10-l01-c09','partial','Vandalism and urbanization damage monuments. People should not protect archaeological remains or preserve historical evidence.'),
 ('hist-g11-l05-c01','partial','British policy encouraged export-oriented plantation agriculture. Coffee, tea and rubber did not transform economic activity or the ways land was used.')]


def run(output):
    out=Path(output)
    encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json',ROOT/'outputs/history-semantic-embedding-cache-v1')
    model=SemanticHistoryPredictor(json.loads((out/'model.json').read_text(encoding='utf-8')),encoder)
    old=HistoryPredictorV31(json.loads((ROOT/'outputs/history-coverage-v3.2-2026-10-15/model.json').read_text(encoding='utf-8')))
    examples=[{'id':f'history-semantic-new-{i+1:02d}','conceptId':cid,'text':text,'expectedLabel':label} for i,(cid,label,text) in enumerate(CASES)]
    encoder.prime([quote for e in examples for _,_,quote in semantic_spans(e['text'])])
    report=score({'v32':old,'semanticV4':model},examples)
    report.update({'modelSha256':sha(out/'model.json'),'synthetic':True,'independentHumanReview':False,
        'usedForFittingSelectionOrPolicy':False,'interpretation':'Agreement with new AI expectations based on supplied proposed criteria, not independent real-note accuracy.'})
    write_json(out/'new-ai-semantic-checks.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='examples'},indent=2))


if __name__=='__main__':run(sys.argv[1])

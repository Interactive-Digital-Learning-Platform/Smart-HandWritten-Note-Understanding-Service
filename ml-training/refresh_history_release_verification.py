"""Refresh History transport snapshots while preserving Science expectations."""
import copy
import json
from pathlib import Path
from history_preview_cli import HistoryPreviewRuntime,EXPECTED,MODEL_DIR

ROOT=Path(__file__).resolve().parent.parent


def run():
    path=ROOT/'packaging/coverage-verification.json'
    raw=path.read_bytes();pack=json.loads(raw)
    old_science=copy.deepcopy([r for r in pack['cases'] if r['subject']=='science'])
    runtime=HistoryPreviewRuntime()
    for sample in pack['cases']:
        if sample['subject']!='history':continue
        prediction=runtime.predict(sample['input'])
        if prediction['suggestedStatus']!=sample['prediction']['suggestedStatus']:
            raise ValueError('Presentation coverage changed: '+sample['id'])
        sample['prediction']=prediction
    if old_science!=[r for r in pack['cases'] if r['subject']=='science']:
        raise ValueError('Science expectations changed')
    backup=MODEL_DIR/'previous-history-verification.json'
    if not backup.exists():backup.write_bytes(raw)
    pack['historySha256']=EXPECTED
    pack['historyModelVersion']='History V6.2'
    path.write_text(json.dumps(pack,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(refreshedHistoryCases=12,scienceCasesUnchanged=len(old_science),modelSha256=EXPECTED)))


if __name__=='__main__':run()

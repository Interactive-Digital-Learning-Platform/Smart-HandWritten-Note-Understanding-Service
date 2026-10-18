"""Re-run the frozen development examples in a clean CLI worker process."""
import json
from pathlib import Path
import subprocess
import sys
import time
import argparse
ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', default=str(ROOT / 'outputs/ict-coverage-v1.1-2026-10-15'))
    parser.add_argument('--entrypoint', default='ict_coverage_cli.py')
    args = parser.parse_args()
    out = Path(args.candidate).resolve()
    rows = [r for r in json.loads((out / 'decisions.json').read_text(encoding='utf-8')) if r['set'] == 'ownerConfirmedDevelopment']
    requests = [dict(text=r['text'], conceptId=r['conceptId'], language='English', scopeConfirmed=True) for r in rows]
    # These two are input-contract checks, not additional accuracy samples.
    requests += [dict(requests[0], scopeConfirmed=False), dict(requests[0], language='Sinhala')]
    # Fresh Unicode input checks offsets from both lexical and semantic evidence.
    unicode_text = 'Revision 🧪\n' + next(r['text'] for r in rows if r['recordId'] == 'ict-g10-u02-cpu-review-1')
    requests += [dict(text=unicode_text, conceptId='ict-g10-u02-cpu', language='English', scopeConfirmed=True)]
    start = time.perf_counter()
    completed = subprocess.run([sys.executable, '-B', str(ROOT / args.entrypoint), '--model', str(out / 'model.json'), '--worker'],
        input=''.join(json.dumps(r, ensure_ascii=True)+'\n' for r in requests), text=True,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=180, encoding='utf-8', check=True)
    messages = [json.loads(line) for line in completed.stdout.splitlines()]
    release = json.loads((out / 'release.json').read_text(encoding='utf-8'))
    assert messages[0] == dict(type='ready', modelSha256=release['modelSha256'])
    assert len(messages) == len(requests)+1
    results = []
    for row, reply in zip(rows, messages[1:]):
        prediction = reply['result']
        for key in ['rawModelStatus','suggestedStatus','suggestionWithheld','completeSuggestionWithheld']:
            assert prediction[key] == row['prediction'][key], (row['recordId'],key)
        results.append(dict(id=row['recordId'], suggestedStatus=prediction['suggestedStatus'], rawModelStatus=prediction['rawModelStatus']))
    assert 'error' in messages[-3] and 'error' in messages[-2]
    assert messages[-1]['result']['suggestedStatus'] == 'present'
    for request, reply in zip(requests,messages[1:]):
        if 'result' not in reply:
            continue
        for point in reply['result']['evidence']['points']:
            for field,left,right in [('candidateEvidence','start','end'), ('semanticCandidateEvidence','semanticStart','semanticEnd')]:
                assert request['text'][point[left]:point[right]] == point[field]
        for concern in reply['result']['evidence']['concerns']:
            assert request['text'][concern['start']:concern['end']] == concern['quote']
    report = dict(modelSha256=release['modelSha256'], developmentPredictionsReproduced=len(results),
        invalidScopeRejected=True, invalidLanguageRejected=True, unicodeEvidenceAligned=True,
        elapsedSeconds=round(time.perf_counter()-start,2), independentAccuracyEvaluation=False, results=results)
    (out / 'runtime-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2))


if __name__ == '__main__':
    main()

"""Small fresh AI-authored probes of an already frozen candidate; no fitting."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parent

PROBES = [
 ('cpu-reordered', 'ict-g10-u02-cpu', 'Registers briefly keep processing inputs and intermediate results. The CU directs operations. Arithmetic calculations and logical comparisons are carried out by the ALU.', 'present'),
 ('rom-valid-negation', 'ict-g10-u02-ram-rom', 'RAM temporarily keeps the data in use and loses them on power-off. ROM contains startup instructions and does not lose these contents when electricity is disconnected.', 'present'),
 ('cache-properties-only', 'ict-g10-u02-cache', 'Cache memory is tiny and very fast.', 'partial'),
 ('storage-explanation-example', 'ict-g10-u02-secondary', 'An external hard disk keeps saved files for future use, including when its power is disconnected. It is secondary storage.', 'present'),
 ('os-resource-only', 'ict-g10-u05-os', 'The operating system controls hardware resources and supports running applications.', 'partial'),
 ('process-scheduling-only', 'ict-g10-u05-process', 'Process management assigns processor time and schedules when different tasks execute.', 'partial'),
 ('memory-shorthand', 'ict-g10-u05-memory', 'Memory manager: give each running task space in RAM; return that space for reuse once the task has finished.', 'present'),
 ('internet-without-web', 'ict-g11-u03-internet-web', 'Around the globe, computer networks are connected together to form the Internet.', 'partial'),
 ('dns-lookup-only', 'ict-g11-u03-dns', 'A DNS lookup converts the readable domain name into its IP address.', 'partial'),
 ('bcc-valid-negative', 'ict-g11-u03-cc-bcc', 'Cc delivers copies to additional people. Bcc delivers blind copies: those addresses are not visible to recipients in To or Cc.', 'present'),
 ('cpu-unanswered-prompt', 'ict-g10-u02-cpu', 'Explain how the ALU performs calculations and logic, the control unit coordinates operations, and registers temporarily store results? Answer later.', 'missing'),
 ('ram-rom-reversed', 'ict-g10-u02-ram-rom', 'RAM is non-volatile memory for startup instructions. ROM is volatile memory that loses its data when power is switched off.', 'missing'),
]


def main():
    out = ROOT / 'outputs/ict-coverage-v1.1-2026-10-15'
    release = json.loads((out / 'release.json').read_text(encoding='utf-8'))
    expected = [dict(id=i, conceptId=c, text=t, aiExpectedLabel=l) for i,c,t,l in PROBES]
    frozen = out / 'fresh-probes-frozen.json'
    data = dict(modelSha256=release['modelSha256'], expectedLabelAuthor='AI', humanReviewed=False,
        authoredAfterModelFreeze=True, usedForFitting=False, independentAccuracyEvaluation=False, examples=expected)
    if frozen.exists():
        assert json.loads(frozen.read_text(encoding='utf-8')) == data
    else:
        frozen.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    payload = ''.join(json.dumps(dict(text=r['text'], conceptId=r['conceptId'], language='English', scopeConfirmed=True))+'\n' for r in expected)
    p = subprocess.run([sys.executable, '-B', str(ROOT / 'ict_coverage_cli.py'), '--worker'], input=payload,
        text=True, encoding='utf-8', stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=180, check=True)
    replies = [json.loads(line) for line in p.stdout.splitlines()]
    assert replies[0]['modelSha256'] == release['modelSha256'] and len(replies) == len(expected)+1
    results = [dict(**row, prediction=reply['result']) for row,reply in zip(expected,replies[1:])]
    for row in results:
        prediction = row['prediction']
        for point in prediction['evidence']['points']:
            for field,left,right in [('candidateEvidence','start','end'),('semanticCandidateEvidence','semanticStart','semanticEnd')]:
                assert row['text'][point[left]:point[right]] == point[field]
    report = dict(modelSha256=release['modelSha256'], probeFileSha256=hashlib.sha256(frozen.read_bytes()).hexdigest(),
        total=len(results), matchesAIExpectation=sum(r['prediction']['suggestedStatus'] == r['aiExpectedLabel'] for r in results),
        withheldIds=[r['id'] for r in results if r['prediction']['suggestedStatus'] is None],
        falseCompleteIds=[r['id'] for r in results if r['prediction']['suggestedStatus'] == 'present' and r['aiExpectedLabel'] != 'present'],
        humanReviewed=False, usedForFitting=False, independentAccuracyEvaluation=False, results=results)
    (out / 'fresh-probe-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2))


if __name__ == '__main__':
    main()

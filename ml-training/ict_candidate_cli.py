"""Run the selected ICT V3.1 candidate locally; no database or network is used."""
import argparse
import contextlib
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))


def main():
    from smart_note_training.english_coverage import sha
    from smart_note_training.history_semantic import FrozenEncoder
    from smart_note_training.ict_coverage_v31 import ICTPredictorV31
    parser=argparse.ArgumentParser()
    parser.add_argument('--model',default=str(ROOT/'outputs/ict-coverage-v3.1-2026-10-15/model.json'))
    parser.add_argument('--worker',action='store_true')
    args=parser.parse_args();file=Path(args.model)
    release=json.loads((file.parent/'release.json').read_text(encoding='utf-8'))
    if sha(file)!=release['modelSha256']:raise ValueError('ICT model integrity failure')
    for source,expected in release['sourceHashes'].items():
        if sha(source)!=expected:raise ValueError('ICT source integrity failure')
    with contextlib.redirect_stdout(sys.stderr):
        artifact=json.loads(file.read_text(encoding='utf-8'))
        encoder=FrozenEncoder(ROOT/'encoders/minilm-l6-v2/encoder-manifest.json')
        encoder.prime([p['text'] for c in artifact['rubrics']['concepts'] for p in c['points']])
        predictor=ICTPredictorV31(artifact,encoder)
    baseline=dict(encoder.cache)
    if args.worker:print(json.dumps(dict(type='ready',modelSha256=release['modelSha256'])),flush=True)
    while True:
        raw=sys.stdin.buffer.readline(100001) if args.worker else sys.stdin.buffer.read(100001)
        if not raw:return
        if len(raw)>100000:raise ValueError('Input limit exceeded')
        request=json.loads(raw.decode('utf-8'))
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result=predictor.predict(request.get('text'),request.get('conceptId'),request.get('language',''),request.get('scopeConfirmed',False))
            result['modelSha256']=release['modelSha256']
            print(json.dumps(dict(result=result),ensure_ascii=True),flush=True)
        except (ValueError,KeyError):
            print(json.dumps(dict(error='Check English text, registered concept and confirmed scope.')),flush=True)
            if not args.worker:sys.exit(1)
        finally:
            encoder.cache=dict(baseline)
            del raw,request
            if 'result' in locals():del result
        if not args.worker:return


if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps(dict(error='ICT candidate unavailable or integrity check failed.')))
        sys.exit(1)

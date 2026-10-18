"""Version-three local JSON inference; never changes the live service."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from smart_note_training.english_coverage_v3 import CoveragePredictorV3


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--model',required=True)
    args=parser.parse_args();model=CoveragePredictorV3(json.loads(Path(args.model).read_text(encoding='utf-8')))
    request=json.load(sys.stdin)
    if not isinstance(request,dict) or not isinstance(request.get('noteText'),str) or not isinstance(request.get('conceptId'),str):
        raise ValueError('noteText and conceptId must be strings')
    if not isinstance(request.get('language','English'),str):raise ValueError('language must be a string')
    print(json.dumps(model.predict(request['noteText'],request['conceptId'],request.get('language','English'),request.get('scopeConfirmed') is True),ensure_ascii=True,allow_nan=False))


if __name__=='__main__':
    try:main()
    except (ValueError,KeyError) as e:
        print(json.dumps({'error':str(e)}),file=sys.stderr);raise SystemExit(2)

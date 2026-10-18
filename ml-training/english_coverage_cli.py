"""Local inference adapter. One JSON request on stdin; JSON result on stdout."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from smart_note_training.english_coverage import CoveragePredictor

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--model',required=True)
    args=parser.parse_args()
    model=CoveragePredictor(json.loads(Path(args.model).read_text(encoding='utf-8')))
    request=json.load(sys.stdin)
    if not isinstance(request.get('noteText'),str) or not isinstance(request.get('conceptId'),str):
        raise ValueError('noteText and conceptId must be strings')
    print(json.dumps(model.predict(request['noteText'],request['conceptId'],request.get('language','English'),
                                   request.get('scopeConfirmed') is True),ensure_ascii=True,allow_nan=False))

if __name__=='__main__':
    try: main()
    except (ValueError,KeyError) as error:
        print(json.dumps({'error':str(error)}),file=sys.stderr)
        raise SystemExit(2)

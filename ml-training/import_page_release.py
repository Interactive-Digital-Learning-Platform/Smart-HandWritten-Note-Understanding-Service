import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from smart_note_training.page_release import import_page_release

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate reviewed Science page release and create new immutable snapshots.")
    parser.add_argument("--release", required=True)
    parser.add_argument("--pages-output", required=True)
    parser.add_argument("--notes-output", required=True)
    args = parser.parse_args()
    print(json.dumps(import_page_release(args.release, args.pages_output, args.notes_output), indent=2))

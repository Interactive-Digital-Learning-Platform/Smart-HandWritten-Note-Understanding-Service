from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from smart_note_training.release_import import DATASET_VERSION, import_release


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify and convert the Science v2 release ZIP to immutable training JSONL."
    )
    parser.add_argument("--release", required=True, help="Path to the source release ZIP")
    parser.add_argument("--output", required=True, help="New output JSONL path")
    parser.add_argument("--dataset-version", default=DATASET_VERSION)
    args = parser.parse_args()
    manifest = import_release(
        args.release, args.output, dataset_version=args.dataset_version
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()

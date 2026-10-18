from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from smart_note_training.dataset import leave_one_group_out_indices, load_released_dataset


def _write_dataset(tmp_path: Path, *, tamper_hash: bool = False) -> Path:
    path = tmp_path / "concepts.jsonl"
    rows = []
    for index, (group, label) in enumerate(
        (("note-a", "present"), ("note-a", "partial"), ("note-b", "missing"))
    ):
        rows.append(
            {
                "datasetVersion": "test-v1",
                "recordId": f"record-{index}",
                "noteGroupId": group,
                "subject": "Science",
                "grade": 10,
                "lessonId": "lesson-1",
                "lessonName": "Cells",
                "language": "English",
                "noteTextSnapshot": "A cell contains a nucleus.",
                "concept": {
                    "id": f"concept-{index}",
                    "name": "Nucleus",
                    "category": "definition",
                    "keywords": ["nucleus"],
                    "learningOutcomes": ["Describe a cell"],
                },
                "targetLabel": label,
            }
        )
    payload = "".join(json.dumps(row) + "\n" for row in rows).encode("utf-8")
    path.write_bytes(payload)
    manifest = {
        "datasetVersion": "test-v1",
        "recordCount": len(rows),
        "sha256": "invalid" if tamper_hash else hashlib.sha256(payload).hexdigest(),
    }
    Path(f"{path}.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return path


def test_loads_a_valid_manifest_bound_dataset(tmp_path: Path) -> None:
    dataset = load_released_dataset(_write_dataset(tmp_path))
    assert dataset.version == "test-v1"
    assert len(dataset.records) == 3
    assert dataset.groups == ("note-a", "note-b")
    assert dataset.note_groups == ("note-a", "note-b")
    assert "Concept: Nucleus" in dataset.records[0].concept_prompt


def test_rejects_dataset_hash_tampering(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="SHA-256"):
        load_released_dataset(_write_dataset(tmp_path, tamper_hash=True))


def test_group_splits_never_leak_a_note() -> None:
    groups = ["note-a", "note-a", "note-b", "note-c", "note-c"]
    splits = list(leave_one_group_out_indices(groups))
    assert len(splits) == 3
    for train, test in splits:
        train_groups = {groups[index] for index in train}
        test_groups = {groups[index] for index in test}
        assert train_groups.isdisjoint(test_groups)


def test_explicit_evaluation_groups_override_note_groups(tmp_path: Path) -> None:
    path = _write_dataset(tmp_path)
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    rows[0]["evaluationGroupId"] = "student-a"
    rows[1]["evaluationGroupId"] = "student-a"
    rows[2]["evaluationGroupId"] = "student-b"
    rows[0]["preassignedSplit"] = "train"
    payload = "".join(json.dumps(row) + "\n" for row in rows).encode("utf-8")
    path.write_bytes(payload)
    manifest_path = Path(f"{path}.manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["sha256"] = hashlib.sha256(payload).hexdigest()
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    dataset = load_released_dataset(path)
    assert dataset.groups == ("student-a", "student-b")
    assert dataset.records[0].preassigned_split == "train"

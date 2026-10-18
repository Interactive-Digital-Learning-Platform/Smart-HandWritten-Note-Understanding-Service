from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Sequence

from . import LABELS


@dataclass(frozen=True)
class ConceptRecord:
    record_id: str
    note_group_id: str
    evaluation_group_id: str
    preassigned_split: str | None
    dataset_version: str
    subject: str
    grade: int
    lesson_id: str
    lesson_name: str
    language: str
    note_text: str
    concept_id: str
    concept_name: str
    concept_category: str
    concept_keywords: tuple[str, ...]
    learning_outcomes: tuple[str, ...]
    target_label: str

    @property
    def concept_prompt(self) -> str:
        keywords = ", ".join(self.concept_keywords) or "none listed"
        outcomes = "; ".join(self.learning_outcomes) or "none listed"
        return "\n".join(
            (
                f"Subject: {self.subject}",
                f"Grade: {self.grade}",
                f"Lesson: {self.lesson_name}",
                f"Concept: {self.concept_name}",
                f"Category: {self.concept_category}",
                f"Keywords: {keywords}",
                f"Learning outcomes: {outcomes}",
                "Decide whether the student's note presents, partially covers, or misses this concept.",
            )
        )


@dataclass(frozen=True)
class ReleasedDataset:
    path: Path
    version: str
    sha256: str
    records: tuple[ConceptRecord, ...]

    @property
    def groups(self) -> tuple[str, ...]:
        return tuple(sorted({record.evaluation_group_id for record in self.records}))

    @property
    def note_groups(self) -> tuple[str, ...]:
        return tuple(sorted({record.note_group_id for record in self.records}))


def _required_string(value: dict[str, Any], field: str, row_number: int) -> str:
    result = value.get(field)
    if not isinstance(result, str) or not result.strip():
        raise ValueError(f"row {row_number}: {field} must be a non-empty string")
    return result.strip()


def _string_tuple(value: Any, field: str, row_number: int) -> tuple[str, ...]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ValueError(f"row {row_number}: {field} must be a string array")
    return tuple(item.strip() for item in value if item.strip())


def _parse_record(value: dict[str, Any], row_number: int, dataset_version: str) -> ConceptRecord:
    concept = value.get("concept")
    if not isinstance(concept, dict):
        raise ValueError(f"row {row_number}: concept must be an object")
    grade = value.get("grade")
    if grade not in (10, 11):
        raise ValueError(f"row {row_number}: grade must be 10 or 11")
    target_label = value.get("targetLabel")
    if target_label not in LABELS:
        raise ValueError(f"row {row_number}: targetLabel must be one of {LABELS}")
    row_dataset_version = _required_string(value, "datasetVersion", row_number)
    if row_dataset_version != dataset_version:
        raise ValueError(
            f"row {row_number}: datasetVersion {row_dataset_version!r} does not match manifest"
        )
    return ConceptRecord(
        record_id=_required_string(value, "recordId", row_number),
        note_group_id=_required_string(value, "noteGroupId", row_number),
        evaluation_group_id=(
            _required_string(value, "evaluationGroupId", row_number)
            if "evaluationGroupId" in value
            else _required_string(value, "noteGroupId", row_number)
        ),
        preassigned_split=(
            _required_string(value, "preassignedSplit", row_number)
            if "preassignedSplit" in value
            else None
        ),
        dataset_version=row_dataset_version,
        subject=_required_string(value, "subject", row_number),
        grade=grade,
        lesson_id=_required_string(value, "lessonId", row_number),
        lesson_name=_required_string(value, "lessonName", row_number),
        language=_required_string(value, "language", row_number),
        note_text=_required_string(value, "noteTextSnapshot", row_number),
        concept_id=_required_string(concept, "id", row_number),
        concept_name=_required_string(concept, "name", row_number),
        concept_category=_required_string(concept, "category", row_number),
        concept_keywords=_string_tuple(concept.get("keywords"), "concept.keywords", row_number),
        learning_outcomes=_string_tuple(
            concept.get("learningOutcomes"), "concept.learningOutcomes", row_number
        ),
        target_label=target_label,
    )


def load_released_dataset(dataset_path: str | Path) -> ReleasedDataset:
    path = Path(dataset_path).resolve()
    manifest_path = Path(f"{path}.manifest.json")
    if not path.is_file() or not manifest_path.is_file():
        raise FileNotFoundError("released JSONL dataset and manifest must both exist")

    payload = path.read_bytes()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_hash = manifest.get("sha256")
    actual_hash = hashlib.sha256(payload).hexdigest()
    if expected_hash != actual_hash:
        raise ValueError("dataset SHA-256 does not match its immutable manifest")
    dataset_version = manifest.get("datasetVersion")
    if not isinstance(dataset_version, str) or not dataset_version:
        raise ValueError("manifest datasetVersion is missing")

    records: list[ConceptRecord] = []
    seen_record_ids: set[str] = set()
    for row_number, line in enumerate(payload.decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"row {row_number}: invalid JSON") from error
        if not isinstance(value, dict):
            raise ValueError(f"row {row_number}: record must be an object")
        record = _parse_record(value, row_number, dataset_version)
        if record.record_id in seen_record_ids:
            raise ValueError(f"row {row_number}: duplicate recordId {record.record_id}")
        seen_record_ids.add(record.record_id)
        records.append(record)

    if len(records) != manifest.get("recordCount"):
        raise ValueError(
            f"manifest declares {manifest.get('recordCount')} rows but dataset contains {len(records)}"
        )
    if len({record.evaluation_group_id for record in records}) < 2:
        raise ValueError("at least two independent evaluation groups are required")
    return ReleasedDataset(path, dataset_version, actual_hash, tuple(records))


def leave_one_group_out_indices(groups: Sequence[str]) -> Iterator[tuple[list[int], list[int]]]:
    unique_groups = sorted(set(groups))
    if len(unique_groups) < 2:
        raise ValueError("at least two independent note groups are required")
    for held_out_group in unique_groups:
        train = [index for index, group in enumerate(groups) if group != held_out_group]
        test = [index for index, group in enumerate(groups) if group == held_out_group]
        if set(train).intersection(test):
            raise AssertionError("group split contains overlapping row indexes")
        yield train, test

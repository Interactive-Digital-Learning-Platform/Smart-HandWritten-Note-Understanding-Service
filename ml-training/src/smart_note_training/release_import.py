from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from typing import Any
from zipfile import ZipFile

from . import LABELS


DATASET_VERSION = "concepts-science-synthetic-2026-09-v2"
PAGE_MARKER = re.compile(r"(?m)^--- Page (\d+) ---\s*$")


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _csv_rows(archive: ZipFile, name: str) -> list[dict[str, str]]:
    try:
        payload = archive.read(name).decode("utf-8-sig")
    except KeyError as error:
        raise ValueError(f"release is missing {name}") from error
    return list(csv.DictReader(io.StringIO(payload)))


def _bool(value: str, field: str) -> bool:
    normalized = value.strip().lower()
    if normalized not in {"true", "false"}:
        raise ValueError(f"{field} must contain only true/false values")
    return normalized == "true"


def _unique(rows: list[dict[str, str]], key: str, source: str) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for row in rows:
        value = row.get(key, "").strip()
        if not value:
            raise ValueError(f"{source} contains an empty {key}")
        if value in result:
            raise ValueError(f"{source} contains duplicate {key} {value}")
        result[value] = row
    return result


def _page_texts(text: str) -> dict[int, str]:
    matches = list(PAGE_MARKER.finditer(text))
    return {
        int(match.group(1)): text[match.end() : matches[index + 1].start()]
        if index + 1 < len(matches)
        else text[match.end() :]
        for index, match in enumerate(matches)
    }


def _normalized_whitespace(value: str) -> str:
    return " ".join(value.split())


def _lesson_id(concept_id: str) -> str:
    if not re.fullmatch(r"[a-z0-9-]+-\d{3}", concept_id):
        raise ValueError(f"invalid release concept ID {concept_id}")
    return concept_id.rsplit("-", 1)[0]


def import_release(
    release_zip: str | Path,
    output_jsonl: str | Path,
    *,
    dataset_version: str = DATASET_VERSION,
) -> dict[str, Any]:
    release_path = Path(release_zip).resolve()
    output_path = Path(output_jsonl).resolve()
    if not release_path.is_file():
        raise FileNotFoundError(f"release ZIP does not exist: {release_path}")
    if output_path.exists() or Path(f"{output_path}.manifest.json").exists():
        raise FileExistsError("dataset output or manifest already exists")

    release_bytes = release_path.read_bytes()
    with ZipFile(io.BytesIO(release_bytes)) as archive:
        files = [info for info in archive.infolist() if not info.is_dir()]
        names = [info.filename for info in files]
        if len(names) != len(set(names)):
            raise ValueError("release ZIP contains duplicate paths")
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError(f"unsafe archive path: {name}")

        metadata = _unique(
            _csv_rows(archive, "dataset-v2/metadata.csv"),
            "note_group_id",
            "metadata.csv",
        )
        student_map = _unique(
            _csv_rows(archive, "release-control/student-map.csv"),
            "note_group_id",
            "student-map.csv",
        )
        provenance = _unique(
            _csv_rows(archive, "release-control/review-provenance.csv"),
            "note_group_id",
            "review-provenance.csv",
        )
        annotations = _csv_rows(
            archive, "concept-annotations/concept-annotations.csv"
        )
        note_summary = _unique(
            _csv_rows(archive, "concept-annotations/note-summary.csv"),
            "note_group_id",
            "note-summary.csv",
        )

        note_ids = set(metadata)
        for source, values in (
            ("student-map.csv", student_map),
            ("review-provenance.csv", provenance),
            ("note-summary.csv", note_summary),
        ):
            if set(values) != note_ids:
                raise ValueError(f"{source} note IDs do not exactly match metadata.csv")

        try:
            text_manifest = json.loads(
                archive.read("release-control/text-manifest.json").decode("utf-8")
            )
        except KeyError as error:
            raise ValueError("release is missing text-manifest.json") from error
        manifest_entries = text_manifest.get("entries")
        if not isinstance(manifest_entries, list) or text_manifest.get("files") != len(
            manifest_entries
        ):
            raise ValueError("text-manifest.json has an invalid entry count")
        expected_text_paths: set[str] = set()
        for entry in manifest_entries:
            relative = entry.get("path")
            if not isinstance(relative, str):
                raise ValueError("text manifest path must be a string")
            archive_name = f"dataset-v2/{relative}"
            try:
                payload = archive.read(archive_name)
            except KeyError as error:
                raise ValueError(f"text manifest references missing {archive_name}") from error
            if len(payload) != entry.get("bytes") or _sha256(payload) != entry.get("sha256"):
                raise ValueError(f"text manifest hash/size mismatch for {archive_name}")
            expected_text_paths.add(archive_name)
        actual_text_paths = {
            name
            for name in names
            if name.startswith("dataset-v2/students/") and name.endswith(".txt")
        }
        if expected_text_paths != actual_text_paths:
            raise ValueError("text manifest does not exactly cover the released text files")

        note_texts: dict[str, str] = {}
        note_pages: dict[str, dict[int, str]] = {}
        students_by_split: defaultdict[str, set[str]] = defaultdict(set)
        for note_id, row in metadata.items():
            mapping = student_map[note_id]
            review = provenance[note_id]
            student_id = mapping["student_id"].strip()
            split = mapping["primary_split"].strip()
            if split not in {"train", "validation", "test"}:
                raise ValueError(f"invalid split for {note_id}: {split}")
            if row.get("subject") != "Science" or row.get("grade") not in {"10", "11"}:
                raise ValueError(f"invalid subject/grade metadata for {note_id}")
            if not _bool(row.get("ocr_reviewed", ""), "ocr_reviewed"):
                raise ValueError(f"{note_id} is not OCR reviewed")
            if review.get("student_id") != student_id:
                raise ValueError(f"student ID mismatch for {note_id}")
            if not _bool(review.get("dataset_owner_approved", ""), "dataset_owner_approved"):
                raise ValueError(f"{note_id} is not approved by the dataset owner")
            if _bool(review.get("independent_human_certified", ""), "independent_human_certified"):
                raise ValueError("this importer expects the declared AI-reviewed release provenance")
            students_by_split[split].add(student_id)
            text_path = (
                f"dataset-v2/students/{student_id}/{note_id}/corrected-text.txt"
            )
            try:
                text = archive.read(text_path).decode("utf-8-sig").strip()
            except KeyError as error:
                raise ValueError(f"missing corrected text for {note_id}") from error
            if not text:
                raise ValueError(f"empty corrected text for {note_id}")
            pages = _page_texts(text)
            if len(pages) != int(row["page_count"]):
                raise ValueError(f"page marker count mismatch for {note_id}")
            note_texts[note_id] = text
            note_pages[note_id] = pages

        split_names = sorted(students_by_split)
        for index, left in enumerate(split_names):
            for right in split_names[index + 1 :]:
                if students_by_split[left] & students_by_split[right]:
                    raise ValueError(f"student leakage between {left} and {right}")

        candidate_ids: set[str] = set()
        note_concepts: set[tuple[str, str]] = set()
        label_counts: Counter[str] = Counter()
        split_counts: Counter[str] = Counter()
        evidence_mismatches = 0
        concept_weights: dict[str, int] = {}
        records: list[dict[str, Any]] = []
        for row in annotations:
            candidate_id = row.get("candidate_id", "").strip()
            note_id = row.get("note_group_id", "").strip()
            concept_id = row.get("concept_id", "").strip()
            if not candidate_id or candidate_id in candidate_ids:
                raise ValueError(f"empty or duplicate candidate ID {candidate_id!r}")
            if note_id not in metadata:
                raise ValueError(f"annotation references unknown note {note_id}")
            pair = (note_id, concept_id)
            if pair in note_concepts:
                raise ValueError(f"duplicate note/concept annotation {pair}")
            candidate_ids.add(candidate_id)
            note_concepts.add(pair)

            mapping = student_map[note_id]
            meta = metadata[note_id]
            label = row.get("reviewed_label", "").strip()
            if label not in LABELS:
                raise ValueError(f"invalid label for {candidate_id}: {label}")
            if row.get("review_status") != "ai_reviewed_candidate":
                raise ValueError(f"unexpected review status for {candidate_id}")
            if row.get("reviewer") != "Codex" or _bool(
                row.get("independent_human_reviewed", ""),
                "independent_human_reviewed",
            ):
                raise ValueError(f"unexpected reviewer provenance for {candidate_id}")
            for field, expected in (
                ("student_id", mapping["student_id"]),
                ("split", mapping["primary_split"]),
                ("grade", meta["grade"]),
                ("lesson_name", meta["lesson_name"]),
                ("language", meta["language"]),
                ("page_count", meta["page_count"]),
            ):
                if row.get(field) != expected:
                    raise ValueError(f"annotation {field} mismatch for {candidate_id}")

            weight = int(row["concept_weight"])
            if weight < 1 or weight > 5:
                raise ValueError(f"invalid concept weight for {candidate_id}")
            if concept_id in concept_weights and concept_weights[concept_id] != weight:
                raise ValueError(f"inconsistent concept weight for {concept_id}")
            concept_weights[concept_id] = weight

            quote = row.get("evidence_quote", "").strip()
            page = row.get("evidence_page", "").strip()
            if label == "missing":
                if quote or page:
                    raise ValueError(f"missing label has evidence for {candidate_id}")
            else:
                if not quote or not page or int(page) not in note_pages[note_id]:
                    raise ValueError(f"non-missing label lacks valid evidence for {candidate_id}")
                if _normalized_whitespace(quote) not in _normalized_whitespace(
                    note_pages[note_id][int(page)]
                ):
                    evidence_mismatches += 1

            concept_name = row["concept_name"].strip()
            split = mapping["primary_split"]
            record = {
                "schemaVersion": "1.1.0",
                "datasetVersion": dataset_version,
                "recordId": candidate_id,
                "noteGroupId": note_id,
                "evaluationGroupId": mapping["student_id"],
                "preassignedSplit": split,
                "subject": "Science",
                "grade": int(meta["grade"]),
                "lessonId": _lesson_id(concept_id),
                "lessonName": meta["lesson_name"],
                "language": meta["language"],
                "noteScope": row.get("coverage_profile", ""),
                "noteTextSnapshot": note_texts[note_id],
                "concept": {
                    "id": concept_id,
                    "name": concept_name,
                    "category": row["concept_category"].strip(),
                    "weight": weight,
                    "isFrequentlyTested": _bool(
                        row["frequently_tested"], "frequently_tested"
                    ),
                    "keywords": [concept_name],
                    "learningOutcomes": [],
                },
                "targetLabel": label,
                "labelQuality": "ai_reviewed_candidate_owner_approved",
            }
            records.append(record)
            label_counts[label] += 1
            split_counts[split] += 1

        if set(label_counts) != set(LABELS):
            raise ValueError("release must contain every target label")

        weighted_coverage_mismatches = 0
        summaries_consistent_with_unweighted_counts = 0
        annotations_by_note: defaultdict[str, list[dict[str, str]]] = defaultdict(list)
        for row in annotations:
            annotations_by_note[row["note_group_id"]].append(row)
        for note_id, summary in note_summary.items():
            rows = annotations_by_note[note_id]
            denominator = sum(int(row["concept_weight"]) for row in rows)
            weighted = sum(
                int(row["concept_weight"])
                * ({"present": 1.0, "partial": 0.5, "missing": 0.0}[row["reviewed_label"]])
                for row in rows
            ) / denominator
            reported = float(summary["weighted_coverage"])
            if abs(weighted - reported) > 1e-9:
                weighted_coverage_mismatches += 1
            unweighted = (
                int(summary["present_count"]) + 0.5 * int(summary["partial_count"])
            ) / int(summary["concept_count"])
            if abs(unweighted - reported) <= 0.005:
                summaries_consistent_with_unweighted_counts += 1

    records.sort(key=lambda record: record["recordId"])
    payload = "".join(
        json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
        for record in records
    ).encode("utf-8")
    manifest = {
        "datasetVersion": dataset_version,
        "schemaVersion": "1.1.0",
        "recordCount": len(records),
        "sha256": _sha256(payload),
        "sourceRelease": {
            "fileName": release_path.name,
            "sha256": _sha256(release_bytes),
            "archiveFiles": len(files),
        },
        "composition": {
            "notes": len(metadata),
            "evaluationGroups": len({row["student_id"] for row in student_map.values()}),
            "concepts": len(concept_weights),
            "labels": {label: label_counts[label] for label in LABELS},
            "splits": dict(sorted(split_counts.items())),
        },
        "evaluationPolicy": {
            "groupField": "evaluationGroupId",
            "groupMeaning": "synthetic student identity",
            "preassignedSplitField": "preassignedSplit",
            "studentOverlapAcrossSplits": 0,
        },
        "provenance": {
            "sourceNotes": "synthetically generated student-style notes",
            "annotationMethod": "AI-reviewed candidates approved by the dataset owner",
            "independentHumanReviewed": False,
            "fitForUse": "project experimentation only; not a human-certified gold set",
        },
        "independentAudit": {
            "textManifestFilesVerified": len(expected_text_paths),
            "nonMissingWhitespaceNormalizedEvidenceQuoteMismatches": evidence_mismatches,
            "noteSummaryConceptWeightedValuesDifferBeforeRounding": weighted_coverage_mismatches,
            "noteSummariesConsistentWithUnweightedCounts": summaries_consistent_with_unweighted_counts,
            "evidenceIncludedAsModelFeature": False,
            "notes": [
                "Mismatched evidence quotes are paraphrases or ledger text, not whitespace-normalized page substrings.",
                "The supplied weighted_coverage values are consistent with unweighted label counts, not concept weights.",
            ],
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(payload)
    Path(f"{output_path}.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest

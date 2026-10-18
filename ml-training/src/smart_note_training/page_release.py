from __future__ import annotations

import hashlib
import io
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

from . import LABELS
from .dataset import ConceptRecord, ReleasedDataset, load_released_dataset
from .release_import import _bool, _csv_rows, _lesson_id, _page_texts, _unique


def _page_dataset_version(release_version: str) -> str:
    if release_version not in {"v2.3", "v2.4-batch-01", "v2.5", "v2.6-batch-01"}:
        raise ValueError("requires a supported AI-reviewed Science page release")
    return f"concepts-science-synthetic-2026-10-{release_version}-pages"


def _validate_evidence(row: dict) -> None:
    quotes = row.get("evidence_quotes", [])
    if not isinstance(quotes, list):
        raise ValueError("evidence quotes must be an array")
    if row["target_label"] == "missing" and quotes:
        raise ValueError("missing page label carries supporting evidence")
    if row.get("evidence_review_status") == "exact_quotes_checked" and not quotes:
        raise ValueError("exact-quote review requires evidence")
    for item in quotes:
        if not isinstance(item, dict):
            raise ValueError("page evidence entries must be objects")
        start, end = item.get("start_char"), item.get("end_char_exclusive")
        if (isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, int)
                or not isinstance(end, int) or not 0 <= start < end <= len(row["page_text"])
                or not item.get("quote") or row["page_text"][start:end] != item["quote"]):
            raise ValueError("page evidence offset/quote mismatch")
    if row.get("essential_ocr_evidence_loss") is True:
        raise ValueError("essential OCR evidence loss requires separate variant-label review")


@dataclass(frozen=True)
class PageRecord(ConceptRecord):
    page_pair_id: str
    page_number: int
    text_variant: str
    sample_weight: float


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _array(value: str, field: str) -> list[str]:
    result = json.loads(value)
    if not isinstance(result, list) or any(not isinstance(item, str) for item in result):
        raise ValueError(f"{field} must contain a JSON string array")
    return result


def _validate_page_pairs(rows: list[dict]) -> None:
    pairs: dict[str, list[dict]] = defaultdict(list)
    ids = set()
    for row in rows:
        if row["recordId"] in ids:
            raise ValueError("duplicate page record ID")
        ids.add(row["recordId"])
        if row.get("reviewStatus") != "ai_page_reviewed" or row.get("trainingEligible") is not True:
            raise ValueError("unreviewed/quarantined row is not eligible for page training")
        if row.get("preassignedSplit") != "train":
            raise ValueError("page supervision must contain training students only")
        if row.get("targetLabel") not in LABELS:
            raise ValueError("unknown page target label")
        number = row.get("pageNumber")
        if isinstance(number, bool) or not isinstance(number, int) or number < 1:
            raise ValueError("pageNumber must be a positive integer")
        weight = row.get("sampleWeight")
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(weight) or weight <= 0:
            raise ValueError("sampleWeight must be positive and finite")
        if row.get("textVariant") not in {"corrected", "raw_ocr"}:
            raise ValueError("unknown text variant")
        if _sha(row["noteTextSnapshot"].encode("utf-8")) != row.get("pageTextSha256"):
            raise ValueError("page text hash mismatch")
        expected_pair = f'{row["noteGroupId"]}|{row["concept"]["id"]}|{number}'
        if row.get("pagePairId") != expected_pair:
            raise ValueError("page pair ID does not match note/concept/page")
        pairs[expected_pair].append(row)
    if not rows:
        raise ValueError("no reviewed page rows")
    for rows_in_pair in pairs.values():
        if len(rows_in_pair) != 2 or {r["textVariant"] for r in rows_in_pair} != {"corrected", "raw_ocr"}:
            raise ValueError("each page pair requires exactly one corrected and one raw view")
        for field in ("targetLabel", "evaluationGroupId", "preassignedSplit", "concept"):
            if rows_in_pair[0][field] != rows_in_pair[1][field]:
                raise ValueError(f"paired views disagree on {field}")
        expected_weight = 2.0 if rows_in_pair[0]["targetLabel"] == "partial" else 1.0
        if not math.isclose(sum(r["sampleWeight"] for r in rows_in_pair), expected_weight):
            raise ValueError("paired view weights double-count or lose the class weight")


def _write_snapshot(path: Path, rows: list[dict], version: str, task: str, source: dict) -> dict:
    payload = "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows).encode("utf-8")
    manifest = {"schemaVersion": "2.0.0", "datasetVersion": version, "recordCount": len(rows),
                "sha256": _sha(payload), "task": task, "sourceRelease": source,
                "provenance": {"synthetic": True, "independentHumanReviewed": False}}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    Path(f"{path}.manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def import_page_release(release_zip: str | Path, page_output: str | Path, note_output: str | Path) -> dict:
    release = Path(release_zip).resolve()
    page_path, note_path = Path(page_output).resolve(), Path(note_output).resolve()
    outputs = [page_path, note_path, Path(f"{page_path}.manifest.json"), Path(f"{note_path}.manifest.json")]
    if len(set(outputs)) != 4 or any(path.exists() for path in outputs):
        raise FileExistsError("snapshot outputs must be distinct new files")
    payload = release.read_bytes()
    with ZipFile(io.BytesIO(payload)) as archive:
        names = [i.filename for i in archive.infolist() if not i.is_dir()]
        if len(names) != len(set(names)):
            raise ValueError("duplicate archive paths")
        for info in archive.infolist():
            name = info.filename
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or "\\" in name or ":" in name or info.flag_bits & 1:
                raise ValueError("unsafe/encrypted archive member")
        if archive.testzip() is not None:
            raise ValueError("archive CRC failure")
        manifest = json.loads(archive.read("release-control/release-manifest.json"))
        release_version = manifest.get("release_version")
        page_version = _page_dataset_version(release_version)
        entries = manifest["entries"]
        declared = {entry["path"] for entry in entries}
        if len(entries) != len(declared) or declared != set(names) - {"release-control/release-manifest.json"}:
            raise ValueError("release manifest does not cover exactly the archive files")
        for entry in entries:
            content = archive.read(entry["path"])
            if len(content) != entry["bytes"] or _sha(content) != entry["sha256"]:
                raise ValueError(f'release manifest mismatch: {entry["path"]}')
        metadata = _unique(_csv_rows(archive, "dataset-v2/metadata.csv"), "note_group_id", "metadata")
        mapping = _unique(_csv_rows(archive, "release-control/student-map.csv"), "note_group_id", "student map")
        provenance = _unique(_csv_rows(archive, "release-control/review-provenance.csv"), "note_group_id", "provenance")
        annotations = _unique(_csv_rows(archive, "concept-annotations/concept-annotations.csv"), "candidate_id", "annotations")
        summaries = _unique(_csv_rows(archive, "concept-annotations/note-summary.csv"), "note_group_id", "summaries")
        if not (set(metadata) == set(mapping) == set(provenance) == set(summaries)):
            raise ValueError("metadata, mapping, provenance and summary note IDs disagree")
        text_manifest = json.loads(archive.read("release-control/text-manifest.json"))
        text_paths = set()
        for entry in text_manifest["entries"]:
            name = f'dataset-v2/{entry["path"]}'
            content = archive.read(name)
            if len(content) != entry["bytes"] or _sha(content) != entry["sha256"]:
                raise ValueError("source text manifest mismatch")
            text_paths.add(name)
        expected_paths = {f'dataset-v2/students/{row["student_id"]}/{note}/{variant}.txt'
                          for note, row in mapping.items() for variant in ("corrected-text", "raw-ocr")}
        if text_paths != expected_paths or text_manifest["files"] != len(text_paths):
            raise ValueError("source text manifest coverage mismatch")
        split_by_student, note_texts, pages = {}, {}, {}
        for note, meta in metadata.items():
            student = mapping[note]["student_id"]
            split = mapping[note]["primary_split"]
            if split not in {"train", "validation", "test"} or split_by_student.setdefault(student, split) != split:
                raise ValueError("invalid split or student leakage")
            if meta["subject"] != "Science" or meta["grade"] not in {"10", "11"} or meta["language"] not in {"English", "Sinhala", "Mixed"}:
                raise ValueError("invalid subject/grade/language")
            if not _bool(meta["ocr_reviewed"], "ocr_reviewed"):
                raise ValueError("unreviewed OCR metadata")
            review = provenance[note]
            if review["student_id"] != student or not _bool(review["dataset_owner_approved"], "dataset_owner_approved") or _bool(review["independent_human_certified"], "independent_human_certified"):
                raise ValueError("unexpected source review provenance")
            for variant, filename in (("corrected", "corrected-text"), ("raw_ocr", "raw-ocr")):
                text = archive.read(f"dataset-v2/students/{student}/{note}/{filename}.txt").decode("utf-8-sig").strip()
                markers = re.findall(r"(?m)^--- Page (\d+) ---\s*$", text)
                if [int(n) for n in markers] != list(range(1, int(meta["page_count"]) + 1)):
                    raise ValueError("invalid/nonsequential page markers")
                pages[note, variant] = {n: t.strip() for n, t in _page_texts(text).items()}
                if any(not text for text in pages[note, variant].values()):
                    raise ValueError("empty source page")
                if variant == "corrected":
                    note_texts[note] = text
        note_records, candidates_by_pair = [], {}
        for candidate, row in annotations.items():
            note = row["note_group_id"]
            meta, mapped = metadata[note], mapping[note]
            for field, value in (("student_id", mapped["student_id"]), ("split", mapped["primary_split"]),
                                 ("grade", meta["grade"]), ("language", meta["language"]), ("lesson_name", meta["lesson_name"])):
                if row[field] != value:
                    raise ValueError(f"annotation {field} mismatch")
            label = row["reviewed_label"]
            if label not in LABELS or row["review_status"] != "ai_reviewed_candidate" or _bool(row["independent_human_reviewed"], "independent_human_reviewed"):
                raise ValueError("invalid note label/provenance")
            pair = (note, row["concept_id"])
            if pair in candidates_by_pair:
                raise ValueError("duplicate note/concept reference")
            candidates_by_pair[pair] = candidate
            if label == "missing":
                if row["evidence_quote"] or row["evidence_page"]:
                    raise ValueError("missing note label carries evidence")
            else:
                text = pages[note, "corrected"][int(row["evidence_page"])]
                quote = row["evidence_quote"]
                start, end = int(row["evidence_start_char"]), int(row["evidence_end_char_exclusive"])
                if not quote or text[start:end] != quote:
                    raise ValueError("note evidence offset/quote mismatch")
            weight = int(row["concept_weight"])
            if weight not in range(1, 6):
                raise ValueError("invalid curriculum concept weight")
            note_records.append({
                "schemaVersion": "2.0.0", "datasetVersion": page_version.replace("-pages", "-notes"),
                "recordId": candidate, "noteGroupId": note, "evaluationGroupId": mapped["student_id"],
                "preassignedSplit": mapped["primary_split"], "subject": "Science", "grade": int(meta["grade"]),
                "lessonId": _lesson_id(row["concept_id"]), "lessonName": meta["lesson_name"], "language": meta["language"],
                "noteTextSnapshot": note_texts[note], "targetLabel": label,
                "concept": {"id": row["concept_id"], "name": row["concept_name"], "category": row["concept_category"],
                            "keywords": _array(row["concept_keywords_json"], "keywords"),
                            "learningOutcomes": _array(row["learning_outcomes_json"], "outcomes"), "weight": weight},
                "labelQuality": "inherited_synthetic_AI_candidate", "labelReviewPriority": row["label_review_priority"],
            })
        if release_version in {"v2.5", "v2.6-batch-01"}:
            reviewed = [json.loads(line) for line in archive.read(
                "validation-review/whole-note-review-ledger.jsonl").decode("utf-8").splitlines() if line]
            reviewed_by_id = {item["candidate_id"]: item for item in reviewed}
            expected = {record["recordId"] for record in note_records if record["preassignedSplit"] == "validation"}
            if len(reviewed) != len(reviewed_by_id) or set(reviewed_by_id) != expected:
                raise ValueError("whole-note review ledger must cover each validation reference exactly once")
            for record in note_records:
                if record["recordId"] not in reviewed_by_id:
                    continue
                review = reviewed_by_id[record["recordId"]]
                if (review.get("split") != "validation" or review.get("note_group_id") != record["noteGroupId"]
                        or review.get("student_id") != record["evaluationGroupId"]
                        or review.get("concept_id") != record["concept"]["id"]
                        or review.get("reviewed_label") != record["targetLabel"]
                        or review.get("review_status") != "ai_whole_note_reviewed"
                        or review.get("independent_human_reviewed") is not False
                        or review.get("raw_corrected_checked") is not True
                        or review.get("essential_ocr_evidence_loss") is not False
                        or not review.get("reason") or not review.get("reviewer") or not review.get("review_date")
                        or record["labelReviewPriority"] != "standard"):
                    raise ValueError("invalid direct validation review provenance")
                for variant, field, hash_field in (("corrected", "corrected_evidence", "corrected_text_sha256"),
                                                  ("raw_ocr", "raw_evidence", "raw_text_sha256")):
                    filename = "corrected-text" if variant == "corrected" else "raw-ocr"
                    full_text = archive.read(f'dataset-v2/students/{record["evaluationGroupId"]}/{record["noteGroupId"]}/{filename}.txt').decode("utf-8-sig").strip()
                    if review.get(hash_field) != _sha(full_text.encode("utf-8")):
                        raise ValueError("whole-note review text hash mismatch")
                    quotes = review.get(field)
                    if not isinstance(quotes, list) or bool(quotes) != (record["targetLabel"] != "missing"):
                        raise ValueError("whole-note review evidence does not match label")
                    for quote in quotes:
                        number = quote.get("page_number")
                        if isinstance(number, bool) or not isinstance(number, int) or number not in pages[record["noteGroupId"], variant]:
                            raise ValueError("invalid whole-note evidence page")
                        _validate_evidence({"target_label": record["targetLabel"],
                            "page_text": pages[record["noteGroupId"], variant][number], "evidence_quotes": [quote]})
                if review.get("whole_note_absence_checked") != (record["targetLabel"] == "missing"):
                    raise ValueError("missing validation label requires whole-note absence review")
                record.update(labelQuality="direct_whole_note_semantic_AI_review", reviewStatus=review["review_status"],
                              reviewer=review["reviewer"], reviewDate=review["review_date"], reviewReason=review["reason"],
                              evidenceQuotes=review["corrected_evidence"], rawEvidenceQuotes=review["raw_evidence"],
                              rawCorrectedChecked=True, independentHumanReviewed=False)
        for note, summary in summaries.items():
            rows = [r for r in annotations.values() if r["note_group_id"] == note]
            counts = Counter(r["reviewed_label"] for r in rows)
            score = sum(int(r["concept_weight"]) * {"present": 1, "partial": .5, "missing": 0}[r["reviewed_label"]] for r in rows) / sum(int(r["concept_weight"]) for r in rows)
            if int(summary["concept_count"]) != len(rows) or any(int(summary[f"{label}_count"]) != counts[label] for label in LABELS) or abs(float(summary["coverage_score"]) - score) > .000051:
                raise ValueError("note coverage summary mismatch")
        source_rows = [json.loads(line) for line in archive.read("page-training/page-training-examples.jsonl").decode("utf-8").splitlines() if line]
        source_csv = _unique(_csv_rows(archive, "page-training/page-training-examples.csv"), "page_example_id", "page CSV")
        ledger = _unique(_csv_rows(archive, "page-training/page-review-ledger.csv"), "page_example_id", "review ledger")
        if set(source_csv) != {r["page_example_id"] for r in source_rows} or set(ledger) != set(source_csv):
            raise ValueError("page CSV/JSONL/ledger IDs disagree")
        page_records = []
        note_by_id = {r["recordId"]: r for r in note_records}
        for row in source_rows:
            reference = note_by_id[row["source_annotation_id"]]
            for field, expected in (("note_group_id", reference["noteGroupId"]), ("student_id", reference["evaluationGroupId"]),
                                    ("split", reference["preassignedSplit"]), ("grade", reference["grade"]),
                                    ("language", reference["language"]), ("lesson_name", reference["lessonName"]),
                                    ("concept_id", reference["concept"]["id"]), ("concept_name", reference["concept"]["name"]),
                                    ("concept_keywords", reference["concept"]["keywords"]), ("learning_outcomes", reference["concept"]["learningOutcomes"])):
                if row[field] != expected:
                    raise ValueError(f"page/reference {field} mismatch")
            if row["page_text"] != pages[row["note_group_id"], row["text_variant"]][row["page_number"]]:
                raise ValueError("page does not match exact source text")
            for field in source_csv[row["page_example_id"]]:
                expected = row[field]
                normalized = "" if expected is None else str(expected).lower() if isinstance(expected, bool) else str(expected)
                observed = source_csv[row["page_example_id"]][field]
                if isinstance(expected, bool):
                    observed = observed.lower()
                if observed != normalized:
                    raise ValueError("page CSV/JSONL field mismatch")
            reviewed = ledger[row["page_example_id"]]
            for field in ("target_label", "page_text_sha256", "review_status", "reviewer_reason"):
                if reviewed[field] != row[field]:
                    raise ValueError("review ledger/page mismatch")
            if row.get("independent_human_reviewed") is not False or not row.get("reviewer_reason"):
                raise ValueError("invalid page review provenance")
            _validate_evidence(row)
            record = dict(reference)
            record.update(datasetVersion=page_version, recordId=row["page_example_id"], noteTextSnapshot=row["page_text"],
                          targetLabel=row["target_label"], sampleWeight=row["sample_weight"], pagePairId=row["page_pair_id"],
                          pageNumber=row["page_number"], textVariant=row["text_variant"], pageTextSha256=row["page_text_sha256"],
                          reviewStatus=row["review_status"], trainingEligible=row["training_eligible"],
                          labelQuality="direct_page_semantic_AI_review", reviewer=row.get("reviewer"),
                          reviewDate=row.get("review_date"), reviewReason=row["reviewer_reason"],
                          evidenceQuotes=row.get("evidence_quotes", []),
                          evidenceReviewStatus=row.get("evidence_review_status", "legacy_direct_review_without_quote_ledger"),
                          rawCorrectedChecked=row.get("raw_corrected_checked", False),
                          essentialOcrEvidenceLoss=row.get("essential_ocr_evidence_loss"))
            page_records.append(record)
        _validate_page_pairs(page_records)
        if set(r["targetLabel"] for r in page_records) != set(LABELS):
            raise ValueError("page supervision must include all three classes")
        quarantined = archive.read("page-training/quarantined-page-examples.jsonl").decode("utf-8").splitlines()
        if any(json.loads(line).get("training_eligible") is not False for line in quarantined if line):
            raise ValueError("quarantine must be explicitly ineligible")
    source = {"fileName": release.name, "releaseVersion": release_version, "sha256": _sha(payload), "quarantinedRowsExcluded": len(quarantined),
              "benchmarkHistory": "changed split; current test students were previously v2 training students"}
    return {"pages": _write_snapshot(page_path, page_records, page_version, "page_status", source),
            "notes": _write_snapshot(note_path, note_records, page_version.replace("-pages", "-notes"), "note_reference", source)}


def load_page_dataset(path: str | Path) -> ReleasedDataset:
    dataset = load_released_dataset(path)
    manifest = json.loads(Path(f"{dataset.path}.manifest.json").read_text(encoding="utf-8"))
    if manifest.get("task") != "page_status":
        raise ValueError("requires a page-status snapshot")
    rows = [json.loads(line) for line in dataset.path.read_text(encoding="utf-8").splitlines() if line]
    _validate_page_pairs(rows)
    records = tuple(PageRecord(**asdict(base), page_pair_id=row["pagePairId"], page_number=row["pageNumber"],
                               text_variant=row["textVariant"], sample_weight=float(row["sampleWeight"]))
                    for base, row in zip(dataset.records, rows, strict=True))
    return ReleasedDataset(dataset.path, dataset.version, dataset.sha256, records)

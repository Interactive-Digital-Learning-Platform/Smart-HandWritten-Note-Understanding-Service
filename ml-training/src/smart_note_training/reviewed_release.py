"""Admission and non-fitting checks for the reviewed Science package.

This is intentionally separate from the legacy ZIP importer. A semantic review
status is admitted only after verifying the package, receipt and review ledger.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, replace
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

import numpy as np
from safetensors.numpy import load_file

from . import FEATURE_TEMPLATE_VERSION, LABELS
from .dataset import ConceptRecord, ReleasedDataset, _parse_record, load_released_dataset
from .page_release import PageRecord, _validate_evidence
from .train_pages import expand_note_pages, validate_protocol
from .train import _note_pages


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def rows(path):
    return [json.loads(s) for s in Path(path).read_text(encoding="utf-8").splitlines() if s.strip()]


def member(root, name):
    p = PurePosixPath(name)
    require(isinstance(name, str) and not p.is_absolute() and not any(x in name for x in ("\\", ":"))
            and ".." not in p.parts and name == p.as_posix(), "unsafe package path")
    resolved = (root / name).resolve()
    require(resolved.is_relative_to(root.resolve()), "package path escapes root")
    return resolved


def verify_package(root: Path, archive: Path) -> tuple[dict, dict[Path, str], Path]:
    receipt_path = Path(str(archive) + ".receipt.json")
    receipt = read_json(receipt_path)
    require(receipt["packageVersion"] == "science-reviewed-training-release-01", "unsupported package receipt")
    require(archive.stat().st_size == receipt["zipBytes"] and sha(archive) == receipt["zipSha256"], "ZIP receipt mismatch")
    manifest_path = member(root, "package-manifest.json")
    require(sha(manifest_path) == receipt["packageManifestSha256"], "package manifest receipt mismatch")
    manifest = read_json(manifest_path)
    require(manifest["packageVersion"] == receipt["packageVersion"] and manifest["soleFitInput"] == "reviewed-training-views.jsonl",
            "package identity or sole fit input mismatch")
    require(manifest["synthetic"] is True and manifest["independentHumanCertified"] is False
            and manifest["trainingStarted"] is False and manifest["deployed"] is False, "unexpected package provenance/status")
    expected = set(manifest["files"]) | {"package-manifest.json"}
    require({p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()} == expected,
            "unpacked package has missing/unexpected files")
    fingerprints = {archive: receipt["zipSha256"], receipt_path: sha(receipt_path), manifest_path: receipt["packageManifestSha256"]}
    with ZipFile(archive) as z:
        names = z.namelist()
        prefix = manifest["packageVersion"] + "/"
        require(len(names) == len(set(names)) == receipt["memberCount"] and z.testzip() is None, "ZIP duplicate/count/CRC failure")
        require(all(n.startswith(prefix) for n in names), "unexpected ZIP prefix")
        require({n[len(prefix):] for n in names} == expected, "ZIP member coverage mismatch")
        for name in expected:
            path = member(root, name)
            payload = z.read(prefix + name)
            require(path.read_bytes() == payload, "ZIP/unpacked bytes disagree: " + name)
            if name != "package-manifest.json":
                entry = manifest["files"][name]
                require(len(payload) == entry["bytes"] and hashlib.sha256(payload).hexdigest() == entry["sha256"], "package hash mismatch: " + name)
                fingerprints[path] = entry["sha256"]
    # The receipt names its historical annotations root; no extraction is performed.
    relative_zip = PurePosixPath(receipt["zipPath"])
    require(not relative_zip.is_absolute() and ".." not in relative_zip.parts and len(relative_zip.parts) >= 2, "unsafe receipt origin")
    origin = archive.parents[len(relative_zip.parts) - 1]
    require(member(origin, receipt["zipPath"]) == archive.resolve(), "receipt ZIP path mismatch")
    return manifest, fingerprints, origin


def validate_fit_rows(fit, excluded, ledger, source, sidecar, manifest):
    require(len(fit) == sidecar["recordCount"] == manifest["fitViews"] == 720, "fit view count mismatch")
    all_rows = fit + excluded
    source_by_id = {r["recordId"]: r for r in source}
    require(len(source_by_id) == len(source) == len(all_rows) == 832
            and len({r["recordId"] for r in all_rows}) == 832
            and set(source_by_id) == {r["recordId"] for r in all_rows}, "source ID partition mismatch")
    immutable = ("schemaVersion", "datasetVersion", "recordId", "noteGroupId", "evaluationGroupId", "preassignedSplit",
                 "subject", "grade", "lessonId", "lessonName", "language", "noteTextSnapshot", "concept",
                 "pagePairId", "pageNumber", "textVariant", "pageTextSha256")
    require(all(all(r[k] == source_by_id[r["recordId"]][k] for k in immutable) for r in all_rows), "source text/concept/student/split changed")
    require(all(r["trainingEligible"] is False for r in excluded), "excluded row is eligible")
    require(Counter(r["candidateExclusionReason"] for r in excluded) == {
        "legacy_evidence_or_OCR_admission_failure": 108, "curriculum_scope_conflict_entire_concept": 4}, "exclusion count mismatch")
    ledger_by_pair = {r["pagePairId"]: r for r in ledger}
    require(len(ledger_by_pair) == len(ledger) == 362, "duplicate/missing semantic ledger pairs")
    pairs = defaultdict(list)
    parsed = []
    for i, row in enumerate(fit):
        require(row["reviewStatus"] == "ai_semantic_page_reviewed" and row["trainingEligible"] is True
                and row["preassignedSplit"] == "train" and row["candidateId"] == manifest["candidateId"], "semantic admission/split mismatch")
        require(row["independentHumanCertified"] is False and row["rawCorrectedChecked"] is True
                and row["essentialOcrEvidenceLoss"] is False and bool(row["reviewReason"].strip()), "semantic/OCR provenance mismatch")
        require(row["targetLabel"] in LABELS and row["textVariant"] in {"corrected", "raw_ocr"}, "unknown class/variant")
        require(type(row["pageNumber"]) is int and row["pageNumber"] > 0, "invalid page number")
        require(type(row["sampleWeight"]) in (float, int) and row["sampleWeight"] == (1.0 if row["targetLabel"] == "partial" else .5), "per-view weight mismatch")
        require(row["pagePairId"] == f'{row["noteGroupId"]}|{row["concept"]["id"]}|{row["pageNumber"]}', "pair identity mismatch")
        require(hashlib.sha256(row["noteTextSnapshot"].encode()).hexdigest() == row["pageTextSha256"], "page text hash mismatch")
        require(row["evidenceReviewStatus"] == ("whole_page_absence_checked" if row["targetLabel"] == "missing" else "exact_quotes_checked"), "evidence review status mismatch")
        _validate_evidence({"target_label": row["targetLabel"], "page_text": row["noteTextSnapshot"],
                            "evidence_quotes": row["evidenceQuotes"], "evidence_review_status": row["evidenceReviewStatus"],
                            "essential_ocr_evidence_loss": row["essentialOcrEvidenceLoss"]})
        review = ledger_by_pair.get(row["pagePairId"])
        require(review is not None and review["decision"] == row["targetLabel"] and review["originalLabel"] == row["sourceTargetLabel"]
                == source_by_id[row["recordId"]]["targetLabel"] and review["studentId"] == row["evaluationGroupId"]
                and review["noteGroupId"] == row["noteGroupId"] and review["concept"] == row["concept"]
                and review["preassignedSplit"] == "train" and review["reason"] == row["reviewReason"]
                and review["synthetic"] is True and review["independentHumanCertified"] is False
                and review["modelPredictionsUsed"] is False and review["fullCorrectedAndRawPageRead"] is True, "ledger decision/provenance mismatch")
        variants = {v["recordId"]: v for v in review["variants"]}
        require(len(variants) == len(review["variants"]) == 2 and row["recordId"] in variants, "ledger variant identity mismatch")
        v = variants[row["recordId"]]
        require(v["textVariant"] == row["textVariant"] and v["pageTextSha256"] == row["pageTextSha256"]
                and v["evidenceQuotes"] == row["evidenceQuotes"] and v["essentialOcrEvidenceLoss"] is False, "ledger evidence mismatch")
        base = _parse_record(row, i + 1, sidecar["datasetVersion"])
        require(base.note_text == row["noteTextSnapshot"], "fit text is not the declared stripped input")
        parsed.append(PageRecord(**asdict(base), page_pair_id=row["pagePairId"], page_number=row["pageNumber"],
                                 text_variant=row["textVariant"], sample_weight=float(row["sampleWeight"])))
        pairs[row["pagePairId"]].append(row)
    require(len(pairs) == manifest["fitPairs"] == 360, "fit pair count mismatch")
    for views in pairs.values():
        require(len(views) == 2 and {v["textVariant"] for v in views} == {"corrected", "raw_ocr"}, "duplicate/missing paired view")
        require(all(views[0][k] == views[1][k] for k in ("targetLabel", "evaluationGroupId", "preassignedSplit", "concept", "sampleWeight")), "paired views disagree")
    require(Counter(v[0]["targetLabel"] for v in pairs.values()) == manifest["classCountsPairs"], "pair class count mismatch")
    require(len({r.concept_id for r in parsed}) == manifest["fitConcepts"] == 153
            and len({r.note_group_id for r in parsed}) == manifest["fitNotes"] == 20
            and len({r.evaluation_group_id for r in parsed}) == manifest["fitStudents"] == 8, "fit coverage mismatch")
    return tuple(parsed)


def eligibility(records, protocol, split):
    policy = protocol["scopePolicy"]
    excluded = set(policy["excludedConceptIds"])
    mask = [i for i, r in enumerate(records) if r.concept_id not in excluded]
    actual_excluded = sorted(r.record_id for r in records if r.concept_id in excluded)
    require(actual_excluded == sorted(policy["excludedRecordIds"][split]), "scope exclusion identities mismatch")
    expected = policy["expectedWholeNoteDenominators"][{"train": "train_optional", "validation": "validation", "test": "future_test_not_scored_now"}[split]]
    require(len(mask) == expected, "scope denominator mismatch")
    return mask


def validate_settings(protocol, recipe):
    require(protocol["executionMode"] == "validation_only" and protocol["trainingAuthorizedByThisFile"] is False, "requires explicit validation-only protocol")
    require(all(protocol["testPolicy"][k] is False for k in ("scoreNow", "embedNow", "predictNow", "fitOrSelectUsingTest")), "test execution forbidden")
    b = protocol["boundedTrainingExperiment"]
    require(b["encoderFrozen"] is True and b["classifierCGrid"] == [.01, .1] and b["headsFit"] == 2
            and b["maxIterationsPerHead"] == 2000 and b["randomSeed"] == 42 and b["batchSize"] == 2
            and b["classWeight"] is None and b["noAutomaticRefitOnValidation"] is True
            and b["requireConvergenceOrReportFailure"] is True, "unsupported training budget")
    require(b["headSelection"] == ["whole_note_validation_macro_f1_descending", "whole_note_validation_balanced_accuracy_descending", "classifier_C_ascending"], "unsupported head selection")
    require(protocol["wholeNoteEvaluation"]["aggregationRules"] == ["max"]
            and protocol["wholeNoteEvaluation"]["thresholdGrid"] == [.35, .5, .65, .8], "unsupported aggregation/threshold recipe")
    require(protocol["pageEvaluation"]["useForFitting"] is False and protocol["pageEvaluation"]["useForThresholdCalibration"] is False
            and protocol["deploymentEnabled"] is False and protocol["mobileChangesAllowed"] is False, "review/deployment boundary mismatch")
    require(protocol["scopePolicy"]["allOtherReferencesEligible"] is True
            and protocol["scopePolicy"]["doNotInferNewExclusionsFromPredictionsOrLabelReviewPriority"] is True, "unsupported scoring mask")
    require(recipe["featureDimension"] == 768 and recipe["classOrder"] == list(LABELS)
            and recipe["featureTemplateVersion"] == FEATURE_TEMPLATE_VERSION and recipe["offlineOnly"] is True
            and recipe["encoderMode"] == "eval, frozen, inference_mode", "encoder/template/class recipe mismatch")
    require(recipe["tokenizer"]["pairedInputs"] == ["exact concept_prompt", "full stripped page text"]
            and recipe["tokenizer"]["maxLength"] == 512 and recipe["tokenizer"]["truncation"] == "only_second"
            and recipe["tokenizer"]["truncationSide"] == "right" and recipe["tokenizer"]["padding"] == "batch longest", "tokenization recipe mismatch")
    require(recipe["pooling"] == "attention-mask weighted mean of all joint last_hidden_state tokens, including non-padding special tokens; not CLS, not page_mean_max"
            and recipe["precision"]["primaryDevice"] == "CUDA" and recipe["precision"]["modelDtype"] == "float16"
            and recipe["precision"]["autocast"] == "CUDA float16" and recipe["precision"]["poolingArithmetic"] == "last_hidden_state dtype float16",
            "unsupported pooling/precision recipe")


def check_prompt(record, template):
    rendered = template.format(subject=record.subject, grade=record.grade, lesson_name=record.lesson_name,
        concept_name=record.concept_name, category=record.concept_category,
        comma_joined_keywords_or_none_listed=", ".join(record.concept_keywords) or "none listed",
        semicolon_joined_outcomes_or_none_listed="; ".join(record.learning_outcomes) or "none listed")
    require(rendered == record.concept_prompt, "concept prompt differs from pinned template")


def retained_anchors(row, review, clipped):
    require(review["label"] == row["targetLabel"] and review["essentialEvidenceLoss"] is False
            and bool(review["reason"].strip()), "unresolved truncation semantic review")
    anchors = review["essentialRetainedQuoteIndexes"]
    require(isinstance(anchors, list) and len(set(anchors)) == len(anchors)
            and all(type(i) is int and 0 <= i < len(row["evidenceQuotes"]) and i not in clipped for i in anchors)
            and (bool(anchors) == (row["targetLabel"] != "missing")), "essential retained evidence anchor lost")


@dataclass
class ReviewedPackage:
    root: Path
    manifest: dict
    protocol: dict
    recipe: dict
    baseline: dict
    pages: ReleasedDataset
    notes: ReleasedDataset
    page_rows: list[dict]
    reviews: list[dict]
    corrected: list[ConceptRecord]
    raw: list[ConceptRecord]
    fingerprints: dict[Path, str]
    summary: dict


def load_package(protocol_path, archive_path, pages_path, notes_path):
    protocol_path, archive = Path(protocol_path).resolve(), Path(archive_path).resolve()
    root = protocol_path.parent
    manifest, fingerprints, origin = verify_package(root, archive)
    protocol, recipe, baseline = (read_json(member(root, n)) for n in ("evaluation-protocol.json", "encoding-recipe.json", "baseline-reference.json"))
    require(protocol_path == member(root, "evaluation-protocol.json"), "unexpected protocol path")
    validate_settings(protocol, recipe)
    require(Path(pages_path).resolve() == member(root, protocol["fitInput"]) == member(root, manifest["soleFitInput"])
            and Path(notes_path).resolve() == member(root, protocol["noteReferences"]), "only declared package inputs are permitted")
    sidecar = read_json(member(root, protocol["fitInput"] + ".manifest.json"))
    require(sidecar["task"] == "page_status" and sidecar["candidateId"] == manifest["candidateId"]
            and sidecar["packageVersion"] == manifest["packageVersion"] and sidecar["reviewStatus"] == "ai_semantic_page_reviewed"
            and sidecar["provenance"]["synthetic"] is True and sidecar["provenance"]["independentHumanReviewed"] is False
            and sidecar["sha256"] == sha(Path(pages_path)), "canonical training sidecar mismatch")
    for field in ("reviewLedger", "exclusions", "evaluationProtocol"):
        require(sha(member(root, sidecar[field]["path"])) == sidecar[field]["sha256"], "sidecar linked hash mismatch")
    require(sha(member(root, "candidate-manifest.json")) == sidecar["candidateManifestSha256"], "candidate manifest mismatch")
    # Verify historical files without making them portable package members.
    protected = read_json(member(root, "protected-inputs.json"))["files"]
    for name, expected in protected.items():
        path = member(origin, name)
        require(sha(path) == expected, "protected source mismatch: " + name)
        fingerprints[path] = expected
    for name, entry in manifest["sourceCopies"].items():
        path = member(origin, entry["sourcePath"])
        require(sha(path) == entry["sha256"] == sha(member(root, name)), "source copy lineage mismatch: " + name)
        fingerprints[path] = entry["sha256"]
    source_path = member(origin, "data/science/training-snapshots/page-annotations.jsonl")
    require(sha(source_path) == sidecar["sourceSnapshotSha256"], "source page snapshot mismatch")
    fit_rows, excluded, ledger = (rows(member(root, n)) for n in ("reviewed-training-views.jsonl", "excluded-training-views.jsonl", "semantic-review-ledger.jsonl"))
    records = validate_fit_rows(fit_rows, excluded, ledger, rows(source_path), sidecar, manifest)
    for record in records:
        check_prompt(record, recipe["conceptPromptTemplate"])
    pages = ReleasedDataset(Path(pages_path).resolve(), sidecar["datasetVersion"], sidecar["sha256"], records)
    notes = load_released_dataset(notes_path)
    note_manifest = read_json(Path(str(notes.path) + ".manifest.json"))
    require(note_manifest["task"] == "note_reference" and sidecar["sourceRelease"]["sha256"] == note_manifest["sourceRelease"]["sha256"], "source release lineage mismatch")
    coverage = validate_protocol(pages, notes)
    excluded_concepts = set(protocol["scopePolicy"]["excludedConceptIds"])
    require(not {r.concept_id for r in records} & excluded_concepts
            and excluded_concepts == set(read_json(member(root, "scope-policy.json"))["excludedConceptIds"]), "fit/scope policy mismatch")
    masks = {s: eligibility([r for r in notes.records if r.preassigned_split == s], protocol, s) for s in ("train", "validation", "test")}
    note_by_id = {r.record_id: r for r in notes.records}
    reviews = rows(member(root, protocol["validationPageReferences"]))
    require(len(reviews) == len({r["recordId"] for r in reviews}) == protocol["pageEvaluation"]["expectedPrimaryPairs"] == 40
            and Counter(r["targetLabel"] for r in reviews) == protocol["pageEvaluation"]["expectedLabels"], "validation page identities/counts mismatch")
    corrected, raw = [], []
    for review in reviews:
        reference = note_by_id[review["candidateId"]]
        require(reference.preassigned_split == review["split"] == "validation" and reference.evaluation_group_id == review["studentId"]
                and reference.note_group_id == review["noteGroupId"] and reference.concept_id == review["concept"]["id"]
                and reference.grade == review["grade"] and reference.language == review["language"] and reference.lesson_name == review["lessonName"]
                and review["concept"]["id"] not in excluded_concepts and review["useForTraining"] is False
                and review["independentHumanCertified"] is False and review["rawChecked"] is True
                and review["rawMeaningAltered"] is False and bool(review["reviewReason"].strip()), "validation page provenance/source mismatch")
        require(review["recordId"] == f'{reference.record_id}:page:{review["pageNumber"]}', "validation page ID mismatch")
        require({"id":reference.concept_id, "name":reference.concept_name, "category":reference.concept_category,
                 "keywords":list(reference.concept_keywords), "learningOutcomes":list(reference.learning_outcomes)}
                == {k:review["concept"][k] for k in ("id", "name", "category", "keywords", "learningOutcomes")}, "validation concept input mismatch")
        raw_source = member(origin, f'data/science/notes/students/{review["studentId"]}/{review["noteGroupId"]}/raw-ocr.txt')
        for variant, full_text, text_field, evidence_field in (("corrected", reference.note_text, "correctedText", "correctedEvidence"),
                                                            ("raw_ocr", raw_source.read_text(encoding="utf-8-sig").strip(), "rawText", "rawEvidence")):
            require(type(review["pageNumber"]) is int and 0 < review["pageNumber"] <= len(_note_pages(full_text)), "invalid validation page number")
            text = _note_pages(full_text)[review["pageNumber"] - 1]
            require(text == review[text_field], "validation page text changed")
            quotes = [{"quote": q["quote"], "start_char": q["start"], "end_char_exclusive": q["end"]} for q in review[evidence_field]]
            _validate_evidence({"target_label":review["targetLabel"], "page_text":text, "evidence_quotes":quotes,
                               "evidence_review_status":"whole_page_absence_checked" if review["targetLabel"] == "missing" else "exact_quotes_checked"})
            target = corrected if variant == "corrected" else raw
            target.append(replace(reference, record_id=review["recordId"] + (":raw_ocr" if variant == "raw_ocr" else ""),
                                  note_text=text, target_label=review["targetLabel"]))
            check_prompt(target[-1], recipe["conceptPromptTemplate"])
    # No held-out row is fitted; page and whole-note targets remain distinct.
    require(not set(pages.groups) & {r.evaluation_group_id for r in corrected + raw}, "reviewed page student leakage")
    frozen = read_json(member(root, "evaluation/frozen-review-manifest.json"))
    require(frozen["benchmarkSha256"] == sha(member(root, protocol["validationPageReferences"])) and frozen["noteSnapshotSha256"] == notes.sha256
            and frozen["pageTrainingSha256"] == sidecar["sourceSnapshotSha256"], "frozen review source mismatch")
    val_ledger = rows(member(root, "evaluation/whole-note-review-ledger.jsonl"))
    val_references = [r for r in notes.records if r.preassigned_split == "validation"]
    require(len(val_ledger) == len({r["candidate_id"] for r in val_ledger}) == len(val_references) == 119, "whole-note ledger coverage mismatch")
    val_by_id = {r.record_id:r for r in val_references}
    require(set(val_by_id) == {r["candidate_id"] for r in val_ledger}, "whole-note validation IDs mismatch")
    for review in val_ledger:
        r = val_by_id[review["candidate_id"]]
        require(review["reviewed_label"] == r.target_label and review["student_id"] == r.evaluation_group_id
                and review["split"] == "validation" and review["independent_human_reviewed"] is False
                and review["corrected_text_sha256"] == hashlib.sha256(r.note_text.encode()).hexdigest(), "whole-note review/source mismatch")
    for directory_field, hash_field, definition in (("localSnapshot", "externalFileHashes", recipe), ("externalDirectory", "fileHashes", baseline)):
        directory = Path(definition[directory_field]).resolve()
        for name, expected in definition[hash_field].items():
            path = member(directory, name)
            require(sha(path) == expected, "external encoder/tokenizer/baseline hash mismatch: " + str(path))
            fingerprints[path] = expected
    # These are frozen reference implementations, not an instruction to overwrite code.
    for path, expected in recipe["referenceImplementations"].items():
        require(sha(Path(path)) == expected, "reference preprocessing implementation changed")
        fingerprints[Path(path)] = expected
    require(Path(recipe["localSnapshot"]).name == recipe["encoderRevision"] == baseline["encoderRevision"], "encoder revision mismatch")
    base_meta = read_json(Path(baseline["externalDirectory"]) / "metadata.json")
    base_run = read_json(Path(baseline["externalDirectory"]) / "run-details.json")
    require(base_meta["labels"] == baseline["classOrder"] == list(LABELS) and base_meta["pageDatasetSha256"] == baseline["trainedDatasetSha256"]
            and base_meta["aggregation"] == baseline["aggregation"] and base_meta["fitStudents"] == baseline["baselineFitStudents"]
            and base_meta["enabledByDefault"] is False and base_meta["baseModel"] == recipe["baseModel"]
            and base_meta["maxLength"] == recipe["tokenizer"]["maxLength"], "baseline metadata recipe mismatch")
    require(base_meta["weightsSha256"] == baseline["fileHashes"]["classifier.safetensors"]
            and base_run["encoderRevision"] == recipe["encoderRevision"] and base_run["encoderFrozen"] is True
            and base_run["offline"] is True, "baseline encoder/head identity mismatch")
    tensors = load_file(str(Path(baseline["externalDirectory"]) / "classifier.safetensors"))
    require({k:v.shape for k,v in tensors.items()} == {"classifier.weight":(3,768), "classifier.bias":(3,), "scaler.mean":(768,), "scaler.scale":(768,)}
            and all(np.isfinite(v).all() for v in tensors.values()) and np.all(tensors["scaler.scale"] > 0), "invalid baseline tensors")
    totals = {label:sum(r.sample_weight for r in records if r.target_label == label) for label in LABELS}
    require(totals == manifest["weightedTotals"] == protocol["boundedTrainingExperiment"]["knownWeightedClassTotals"], "weighted class totals mismatch")
    summary = {"packageVersion":manifest["packageVersion"], "packageHashesVerified":len(manifest["files"]),
               "protectedHashesVerified":len(protected), "zipSha256":sha(archive), "coverage":coverage,
               "trainingViews":720, "trainingPairs":360, "trainingNotes":20, "trainingStudents":list(pages.groups),
               "pairLabels":manifest["classCountsPairs"], "weightedClassTotals":totals, "totalWeight":sum(totals.values()),
               "excludedViews":len(excluded), "wholeNoteDenominators":{s:len(m) for s,m in masks.items()},
               "correctedValidationPairs":len(corrected), "rawSecondaryViews":len(raw), "encoderRevision":recipe["encoderRevision"],
               "baselineId":baseline["baselineId"], "baselineWeightsSha256":base_meta["weightsSha256"],
               "synthetic":True, "independentHumanCertified":False, "benchmarkHistory":protocol["testPolicy"]["history"]}
    return ReviewedPackage(root, manifest, protocol, recipe, baseline, pages, notes, fit_rows, reviews, corrected, raw, fingerprints, summary)


def verify_unchanged(package):
    for path, expected in package.fingerprints.items():
        require(sha(path) == expected, "input changed during operation: " + str(path))


def token_check(package, tokenizer):
    require(tokenizer.is_fast and tokenizer.truncation_side == "right" and type(tokenizer).__name__.startswith("XLMRobertaTokenizer"),
            "requires pinned fast XLM-R tokenizer with right truncation")
    def inspect(record, quotes):
        full = tokenizer(record.concept_prompt, record.note_text, truncation=False)
        encoded = tokenizer(record.concept_prompt, record.note_text, truncation="only_second", max_length=512, return_offsets_mapping=True)
        end = max(b for (a,b), sequence in zip(encoded["offset_mapping"], encoded.sequence_ids(), strict=True) if sequence == 1)
        clipped = [i for i,q in enumerate(quotes) if q["end_char_exclusive"] > end]
        return len(full["input_ids"]), end, clipped, len(encoded["input_ids"])
    audit = read_json(member(package.root, "truncation-audit.json"))
    semantic = read_json(member(package.root, "truncation-semantic-review.json"))
    require(audit["sourceSha256"] == semantic["sourceViewsSha256"] == package.pages.sha256
            and audit["encoderRevision"] == package.recipe["encoderRevision"]
            and semantic["essentialEvidenceLossViews"] == 0 and semantic["independentHumanCertified"] is False, "truncation review identity mismatch")
    decisions = {r["pagePairId"]:r for r in semantic["decisions"]}
    original = {r["recordId"]:r for r in audit["entries"]}
    found, lengths, clips = [], [], 0
    for record, row in zip(package.pages.records, package.page_rows, strict=True):
        length, end, clipped, encoded_length = inspect(record, row["evidenceQuotes"])
        lengths.append(length)
        clips += bool(clipped)
        if length <= 512:
            require(not clipped, "unexpected clipped evidence on non-truncated fit input")
            continue
        found.append(record.record_id)
        entry, review = original[record.record_id], decisions[record.page_pair_id]
        require(entry["fullJointTokens"] == length and entry["encodedJointTokens"] == encoded_length
                and entry["retainedPageEndCharExclusive"] == end and entry["fullPage"] == row["noteTextSnapshot"]
                and entry["truncatedTail"] == record.note_text[end:] and entry["pageTextSha256"] == row["pageTextSha256"]
                and entry["pagePairId"] == record.page_pair_id and entry["targetLabel"] == record.target_label, "tokenizer truncation audit mismatch")
        retained_anchors(row,review,clipped)
        require(len(entry["evidence"]) == len(row["evidenceQuotes"]), "truncation quote count mismatch")
        for i,q in enumerate(row["evidenceQuotes"]):
            expected = {**q, "fullyRetained":i not in clipped, "retainedCharacters":max(0,min(end,q["end_char_exclusive"])-q["start_char"])}
            require(entry["evidence"][i] == expected, "truncation quote retention mismatch")
    require(set(found) == set(original) and len(found) == audit["overLengthViews"] == semantic["overLengthViewsReviewed"] == 10
            and max(lengths) == audit["maximumJointTokens"] == 546 and clips == audit["viewsWithClippedQuotes"] == 2
            and len(decisions) == semantic["overLengthPairsReviewed"] == 5, "truncation totals mismatch")
    validation_audit = read_json(member(package.root, "validation-truncation-audit.json"))
    page_lengths = []
    for variant, records, evidence in (("corrected", package.corrected, "correctedEvidence"), ("raw", package.raw, "rawEvidence")):
        for r, review in zip(records, package.reviews, strict=True):
            quotes = [{"start_char":q["start"], "end_char_exclusive":q["end"]} for q in review[evidence]]
            length, _, clipped, _ = inspect(r, quotes)
            require(length <= 512 and not clipped, "validation page loses evidence: " + variant)
            page_lengths.append(length)
    validation = [r for r in package.notes.records if r.preassigned_split == "validation"]
    expanded, _ = expand_note_pages(validation)
    note_lengths = [len(tokenizer(r.concept_prompt,r.note_text,truncation=False)["input_ids"]) for r in expanded]
    require(len(page_lengths) == validation_audit["rawAndCorrectedViewsChecked"] == 80
            and max(page_lengths) == validation_audit["maximumReviewedPageJointTokens"] == 482
            and len(expanded) == validation_audit["wholeNoteValidationPageInputs"] == 1028
            and max(note_lengths) == validation_audit["maximumWholeNoteValidationPageJointTokens"] == 508, "validation token audit mismatch")
    return {"fitOverLengthViews":len(found), "fitOverLengthPairs":len(decisions), "maxFitJointTokens":max(lengths),
            "clippedRedundantQuoteViews":clips, "essentialAnchorsVerified":True, "essentialEvidenceLoss":0,
            "validationPageViews":80, "validationOverLengthViews":0, "wholeNoteValidationPageInputs":len(expanded),
            "testTextTokenized":False, "semanticReviewResolvedBy":"truncation-semantic-review.json"}

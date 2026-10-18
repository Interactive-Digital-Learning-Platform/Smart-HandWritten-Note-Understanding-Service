from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from dataclasses import replace
from pathlib import Path

import joblib
import numpy as np
from safetensors.numpy import save_file
from sklearn.preprocessing import StandardScaler

from . import LABELS
from .dataset import ConceptRecord, load_released_dataset
from .metrics import classification_metrics
from .page_release import load_page_dataset
from .train import _new_classifier, _note_pages, create_embeddings


def fit_page_classifier(embeddings: np.ndarray, targets: np.ndarray, weights: np.ndarray, c_value: float = 1.0):
    if len(embeddings) != len(targets) or len(weights) != len(targets) or not len(targets):
        raise ValueError("training arrays must have the same nonzero length")
    if not np.isfinite(weights).all() or np.any(weights <= 0):
        raise ValueError("sample weights must be positive and finite")
    if set(np.unique(targets)) != set(range(len(LABELS))):
        raise ValueError("page training must include all classes")
    scaler = StandardScaler().fit(embeddings, sample_weight=weights)
    classifier = _new_classifier(c_value, None).fit(scaler.transform(embeddings), targets, sample_weight=weights)
    return scaler, classifier


def export_classifier_weights(classifier, scaler, path: str | Path) -> None:
    # The NumPy serializer must receive C-order arrays. sklearn can return
    # Fortran-order coefficients whose underlying bytes have a different order.
    parameters = {
        "classifier.weight": classifier.coef_,
        "classifier.bias": classifier.intercept_,
        "scaler.mean": scaler.mean_,
        "scaler.scale": scaler.scale_,
    }
    save_file({name: np.ascontiguousarray(value, dtype=np.float32)
               for name, value in parameters.items()}, str(path))


def aggregate_notes(page_probabilities: np.ndarray, owners: list[int], note_count: int,
                    present_threshold: float, partial_threshold: float, rule: str = "max") -> list[int]:
    if rule not in {"max", "top2_mean"}:
        raise ValueError("unknown note aggregation rule")
    if not 0 < present_threshold <= 1 or not 0 < partial_threshold <= 1:
        raise ValueError("aggregation thresholds must be in (0, 1]")
    if page_probabilities.shape != (len(owners), len(LABELS)) or not np.isfinite(page_probabilities).all():
        raise ValueError("invalid page probability matrix")
    if np.any(page_probabilities < 0) or np.any(page_probabilities > 1) or not np.allclose(page_probabilities.sum(axis=1), 1):
        raise ValueError("page probabilities must sum to one")
    if any(not 0 <= owner < note_count for owner in owners):
        raise ValueError("invalid note owner index")
    maximum = np.zeros((note_count, len(LABELS)))
    seen = set()
    for owner, probability in zip(owners, page_probabilities, strict=True):
        seen.add(owner)
        maximum[owner] = np.maximum(maximum[owner], probability)
    if seen != set(range(note_count)):
        raise ValueError("every evaluated note/concept must have at least one page")
    if rule == "top2_mean":
        grouped = [[] for _ in range(note_count)]
        for owner, probability in zip(owners, page_probabilities, strict=True):
            grouped[owner].append(probability)
        maximum = np.stack([np.sort(np.asarray(rows), axis=0)[-2:].mean(axis=0) for rows in grouped])
    return [0 if p[0] >= present_threshold else 1 if p[1] >= partial_threshold else 2 for p in maximum]


def calibrate_thresholds(probabilities: np.ndarray, owners: list[int], actual: list[int],
                         eligible: list[int], rule: str = "max") -> tuple[float, float, dict]:
    if not eligible or any(not 0 <= index < len(actual) for index in eligible):
        raise ValueError("validation calibration requires valid eligible references")
    best = None
    for present in (.35, .5, .65, .8):
        for partial in (.35, .5, .65, .8):
            predicted = aggregate_notes(probabilities, owners, len(actual), present, partial, rule)
            metrics = classification_metrics([actual[i] for i in eligible], [predicted[i] for i in eligible])
            key = (metrics["macroF1"], metrics["balancedAccuracy"], present + partial)
            if best is None or key > best[0]:
                best = (key, present, partial, metrics)
    return best[1], best[2], best[3]


def select_page_model(embeddings, targets, weights, validation_embeddings, owners,
                      actual, eligible, c_values, aggregation_rules):
    """Fit training features and select settings from validation only; no test inputs."""
    if not c_values or any(not np.isfinite(c) or c <= 0 for c in c_values):
        raise ValueError("classifier C grid must be finite and positive")
    if not aggregation_rules or any(rule not in {"max", "top2_mean"} for rule in aggregation_rules):
        raise ValueError("unknown or empty note aggregation grid")
    best, candidates = None, []
    for c_value in sorted(set(c_values)):
        scaler, classifier = fit_page_classifier(embeddings, targets, weights, c_value)
        probabilities = classifier.predict_proba(scaler.transform(validation_embeddings))
        for rule in dict.fromkeys(aggregation_rules):
            present, partial, metrics = calibrate_thresholds(probabilities, owners, actual, eligible, rule)
            candidate = {"classifierC": c_value, "aggregationRule": rule,
                         "presentThreshold": present, "partialThreshold": partial, "metrics": metrics}
            candidates.append(candidate)
            key = (metrics["macroF1"], metrics["balancedAccuracy"], -c_value, rule == "max")
            if best is None or key > best[0]:
                best = (key, scaler, classifier, probabilities, candidate)
    return best[1], best[2], best[3], best[4], candidates


def validate_protocol(pages, notes) -> dict:
    students_by_split = {split: set() for split in ("train", "validation", "test")}
    notes_by_id = {}
    note_concepts = set()
    for record in notes.records:
        if record.preassigned_split not in students_by_split:
            raise ValueError("note references require fixed train/validation/test splits")
        students_by_split[record.preassigned_split].add(record.evaluation_group_id)
        expected = (record.evaluation_group_id, record.preassigned_split)
        if notes_by_id.setdefault(record.note_group_id, expected) != expected:
            raise ValueError("inconsistent note identity/split")
        note_concepts.add((record.note_group_id, record.concept_id))
    if any(not groups for groups in students_by_split.values()):
        raise ValueError("all fixed student splits must be nonempty")
    splits = list(students_by_split)
    for i, left in enumerate(splits):
        for right in splits[i + 1:]:
            if students_by_split[left] & students_by_split[right]:
                raise ValueError("student leakage across fixed splits")
    for record in pages.records:
        if record.preassigned_split != "train" or notes_by_id.get(record.note_group_id) != (record.evaluation_group_id, "train"):
            raise ValueError("page supervision has a non-training or mismatched student")
        if (record.note_group_id, record.concept_id) not in note_concepts:
            raise ValueError("page concept has no corresponding note reference")
    active_concepts = {r.concept_id for r in pages.records}
    return {
        "pageRows": len(pages.records), "pagePairs": len({r.page_pair_id for r in pages.records}),
        "activeTrainingStudents": len(pages.groups), "activeConcepts": len(active_concepts),
        "pageClassCounts": {label: sum(r.target_label == label for r in pages.records) for label in LABELS},
        "studentOverlap": 0,
        "conceptsWithoutPageSupervision": {split: len({r.concept_id for r in notes.records if r.preassigned_split == split} - active_concepts) for split in splits},
        "fullCurriculumSupervisionComplete": False,
        "independentHumanCertified": False,
        "benchmarkHistory": "test students were used in earlier v2 training; not directly comparable with original v2 scores",
    }


def expand_note_pages(records: list[ConceptRecord]) -> tuple[list[ConceptRecord], list[int]]:
    expanded, owners = [], []
    for index, record in enumerate(records):
        for page_number, text in enumerate(_note_pages(record.note_text), 1):
            expanded.append(replace(record, record_id=f"{record.record_id}:page:{page_number}", note_text=text))
            owners.append(index)
    return expanded, owners


def main() -> None:
    parser = argparse.ArgumentParser(description="Train reviewed page supervision; calibrate whole-note aggregation on validation students only.")
    parser.add_argument("--pages", required=True)
    parser.add_argument("--notes", required=True)
    parser.add_argument("--output")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--model-name", default="FacebookAI/xlm-roberta-base")
    parser.add_argument("--hf-cache", default=".cache/huggingface")
    parser.add_argument("--embedding-cache-dir", default=".cache/page-embeddings")
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--classifier-c", type=float, default=1.0)
    parser.add_argument("--classifier-c-grid", type=float, nargs="+")
    parser.add_argument("--aggregation-rules", choices=("max", "top2_mean"), nargs="+", default=["max"])
    parser.add_argument("--evaluation-protocol", help="Reviewed package protocol; enforces validation-only execution")
    parser.add_argument("--release-zip", help="Reviewed package ZIP with adjacent .receipt.json")
    parser.add_argument("--allow-cpu-fallback", action="store_true", help="Record a separate float32 CPU encoding recipe")
    args = parser.parse_args()
    if not 64 <= args.max_length <= 512 or args.batch_size < 1 or args.classifier_c <= 0:
        raise ValueError("invalid encoder/classifier settings")
    if args.evaluation_protocol:
        from .reviewed_experiment import run
        run(args)
        return
    if args.release_zip or args.allow_cpu_fallback:
        parser.error("reviewed-package options require --evaluation-protocol")
    pages, notes = load_page_dataset(args.pages), load_released_dataset(args.notes)
    page_manifest = json.loads(Path(f"{pages.path}.manifest.json").read_text(encoding="utf-8"))
    note_manifest = json.loads(Path(f"{notes.path}.manifest.json").read_text(encoding="utf-8"))
    if note_manifest.get("task") != "note_reference" or page_manifest["sourceRelease"]["sha256"] != note_manifest["sourceRelease"]["sha256"]:
        raise ValueError("page and note snapshots must come from the same release")
    protocol = validate_protocol(pages, notes)
    if args.check_only:
        print(json.dumps({"result": "PASS", "trainingStarted": False, **protocol}, indent=2))
        return
    if not args.output:
        parser.error("--output is required unless --check-only is specified")
    output = Path(args.output).resolve()
    if output.exists():
        raise FileExistsError("use a new model output directory")
    cache_dir = Path(args.embedding_cache_dir).resolve()

    def embed(records, digest, tag):
        cache = cache_dir / f"{digest[:20]}-{hashlib.sha256(args.model_name.encode()).hexdigest()[:10]}-{args.max_length}-{tag}.npz"
        return create_embeddings(records, digest, args.model_name, args.max_length, args.batch_size,
                                 Path(args.hf_cache).resolve(), cache, "first_window")[0]

    label_to_id = {label: i for i, label in enumerate(LABELS)}
    embeddings = embed(pages.records, pages.sha256, "reviewed-pages")
    targets = np.array([label_to_id[r.target_label] for r in pages.records])
    weights = np.array([r.sample_weight for r in pages.records])
    source_rows = {r["recordId"]: r for r in (json.loads(line) for line in notes.path.read_text(encoding="utf-8").splitlines() if line)}
    split_records = {split: [r for r in notes.records if r.preassigned_split == split] for split in ("validation", "test")}
    validation = split_records["validation"]
    expanded, owners = expand_note_pages(validation)
    val_embeddings = embed(expanded, notes.sha256, "validation-note-pages")
    actual = [label_to_id[r.target_label] for r in validation]
    eligible = [i for i, r in enumerate(validation) if source_rows[r.record_id].get("labelReviewPriority") != "high"]
    scaler, classifier, val_probabilities, selection, candidates = select_page_model(
        embeddings, targets, weights, val_embeddings, owners, actual, eligible,
        args.classifier_c_grid or [args.classifier_c], args.aggregation_rules)
    present, partial = selection["presentThreshold"], selection["partialThreshold"]
    aggregation_rule = selection["aggregationRule"]
    print("Selected using validation only: " + json.dumps(selection), flush=True)
    reference_quality = {split: dict(Counter(source_rows[r.record_id].get("labelQuality", "unknown")
                                           for r in notes.records if r.preassigned_split == split))
                         for split in ("train", "validation", "test")}
    evaluation = {
        "protocol": "fixed_student_split_page_training_validation_only_aggregation_calibration",
        "referenceQuality": reference_quality,
        "independentHumanCertified": False,
        "modelSelection": {"validationOnly": True, "criterion": "macroF1_then_balancedAccuracy",
                           "tieBreak": "smaller_C_then_max_aggregation", "selected": selection,
                           "candidates": candidates, "thresholdGrid": [.35, .5, .65, .8]},
        "pageHeldOutEvaluation": None,
        "pageHeldOutEvaluationReason": "release contains no independently reviewed validation/test page targets",
        "trainingResubstitutionOnly": classification_metrics(targets.tolist(), classifier.predict(scaler.transform(embeddings)).tolist()),
        "calibration": {"validationOnly": True, "highPriorityReferencesExcluded": len(validation) - len(eligible),
                        "eligibleReferences": len(eligible), "metrics": selection["metrics"],
                        "eligibleLabelCounts": dict(Counter(validation[i].target_label for i in eligible)),
                        "aggregationRule": aggregation_rule,
                        "presentThreshold": present, "partialThreshold": partial},
        "coverage": protocol,
        "encoderLimit": "single page truncated to maxLength; very long pages may lose trailing content",
    }
    majority_counts = np.bincount(targets, weights=weights, minlength=len(LABELS))
    majority = int(majority_counts.argmax())
    note_training_labels = [label_to_id[r.target_label] for r in notes.records if r.preassigned_split == "train"]
    note_majority = int(np.bincount(note_training_labels, minlength=len(LABELS)).argmax())
    predictions = []
    for split in ("validation", "test"):
        records = split_records[split]
        if split == "validation":
            probabilities, split_owners = val_probabilities, owners
        else:
            expanded, split_owners = expand_note_pages(records)
            features = embed(expanded, notes.sha256, "test-note-pages")
            probabilities = classifier.predict_proba(scaler.transform(features))
        predicted = aggregate_notes(probabilities, split_owners, len(records), present, partial, aggregation_rule)
        actual = [label_to_id[r.target_label] for r in records]
        known_concepts = {r.concept_id for r in pages.records}
        scores = {"allReferences": classification_metrics(actual, predicted),
                  "majorityBaseline": classification_metrics(actual, [majority] * len(actual)),
                  "majorityBaselineLabel": LABELS[majority],
                  "trainingNoteMajorityBaseline": classification_metrics(actual, [note_majority] * len(actual)),
                  "trainingNoteMajorityLabel": LABELS[note_majority]}
        for name, indexes in (("seenConcepts", [i for i, r in enumerate(records) if r.concept_id in known_concepts]),
                              ("unseenConcepts", [i for i, r in enumerate(records) if r.concept_id not in known_concepts])):
            scores[name] = classification_metrics([actual[i] for i in indexes], [predicted[i] for i in indexes]) if indexes else None
        for dimension, getter in (("language", lambda r: r.language), ("grade", lambda r: str(r.grade))):
            scores[dimension] = {}
            for value in sorted({getter(r) for r in records}):
                indexes = [i for i, r in enumerate(records) if getter(r) == value]
                scores[dimension][value] = classification_metrics([actual[i] for i in indexes], [predicted[i] for i in indexes])
        evaluation[split] = scores
        predictions.extend({"recordId": r.record_id, "studentId": r.evaluation_group_id,
                            "split": split, "actual": r.target_label, "predicted": LABELS[prediction]}
                           for r, prediction in zip(records, predicted, strict=True))
    # The exported classifier remains fit only on training students; no refit on held-out notes.
    output.mkdir(parents=True)
    weights_path = output / "classifier.safetensors"
    export_classifier_weights(classifier, scaler, weights_path)
    joblib.dump({"classifier": classifier, "scaler": scaler}, output / "classifier.joblib")
    (output / "evaluation.json").write_text(json.dumps(evaluation, indent=2) + "\n", encoding="utf-8")
    (output / "note-predictions.jsonl").write_text("".join(json.dumps(row) + "\n" for row in predictions), encoding="utf-8")
    metadata = {"modelVersion": output.name, "modelType": "reviewed_page_xlmr_frozen_encoder_logistic_regression",
                "labels": list(LABELS), "baseModel": args.model_name, "maxLength": args.max_length,
                "pageDatasetSha256": pages.sha256, "noteReferenceSha256": notes.sha256,
                "sourceReleaseSha256": page_manifest["sourceRelease"]["sha256"],
                "fitStudents": list(pages.groups), "sampleWeightPolicy": "supplied per-view weights; no additional class weight",
                "classifierC": selection["classifierC"],
                "aggregation": {"rule": f"{aggregation_rule}_present_then_{aggregation_rule}_partial_else_missing", "presentThreshold": present, "partialThreshold": partial},
                "referenceQuality": reference_quality,
                "enabledByDefault": False, "independentHumanCertified": False,
                "weightsSha256": hashlib.sha256(weights_path.read_bytes()).hexdigest(), "coverage": protocol}
    (output / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "evaluation": evaluation}, indent=2))


if __name__ == "__main__":
    main()

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from smart_note_training.dataset import ConceptRecord, ReleasedDataset
from smart_note_training.page_release import _validate_page_pairs, import_page_release, load_page_dataset
from smart_note_training.page_release import _page_dataset_version, _validate_evidence
from smart_note_training.train_pages import aggregate_notes, calibrate_thresholds, fit_page_classifier, validate_protocol
from smart_note_training.train_pages import export_classifier_weights
from smart_note_training.train_pages import select_page_model


def records() -> list[dict]:
    rows = []
    for pair, (label, student) in enumerate((("present", "student-a"), ("partial", "student-b"), ("missing", "student-a"))):
        for variant in ("corrected", "raw_ocr"):
            text = f"Text for {pair}"
            rows.append({
                "datasetVersion": "page-test", "recordId": f"row-{pair}-{variant}", "noteGroupId": f"note-{student}",
                "evaluationGroupId": student, "preassignedSplit": "train", "subject": "Science", "grade": 10,
                "lessonId": "lesson-1", "lessonName": "Cells", "language": "English", "noteTextSnapshot": text,
                "concept": {"id": f"concept-{pair}", "name": "Cell", "category": "definition", "keywords": ["cell"], "learningOutcomes": []},
                "targetLabel": label, "pageNumber": 1, "textVariant": variant,
                "pagePairId": f"note-{student}|concept-{pair}|1", "sampleWeight": 1 if label == "partial" else .5,
                "pageTextSha256": hashlib.sha256(text.encode()).hexdigest(),
                "reviewStatus": "ai_page_reviewed", "trainingEligible": True,
            })
    return rows


def test_expansion_and_previous_release_versions_stay_distinct():
    assert "v2.4-batch-01" in _page_dataset_version("v2.4-batch-01")
    assert "v2.3" in _page_dataset_version("v2.3")
    assert "v2.5" in _page_dataset_version("v2.5")
    assert "v2.6-batch-01" in _page_dataset_version("v2.6-batch-01")
    with pytest.raises(ValueError, match="supported"):
        _page_dataset_version("unreviewed-v2.2")


@pytest.mark.parametrize("label,quotes,status,message", [
    ("missing", [{"quote": "abc", "start_char": 0, "end_char_exclusive": 3}], "whole_page_absence_checked", "missing"),
    ("present", [], "exact_quotes_checked", "requires evidence"),
    ("partial", [{"quote": "wrong", "start_char": 0, "end_char_exclusive": 3}], "exact_quotes_checked", "offset/quote"),
])
def test_rejects_inconsistent_exact_page_evidence(label, quotes, status, message):
    with pytest.raises(ValueError, match=message):
        _validate_evidence({"target_label": label, "page_text": "abc def", "evidence_quotes": quotes, "evidence_review_status": status})


def test_exact_evidence_and_absence_have_valid_review_states():
    _validate_evidence({"target_label": "partial", "page_text": "abc def", "evidence_quotes": [{"quote": "abc", "start_char": 0, "end_char_exclusive": 3}], "evidence_review_status": "exact_quotes_checked"})
    _validate_evidence({"target_label": "missing", "page_text": "abc def", "evidence_quotes": [], "evidence_review_status": "whole_page_absence_checked"})
    with pytest.raises(ValueError, match="OCR evidence loss"):
        _validate_evidence({"target_label": "present", "page_text": "abc", "essential_ocr_evidence_loss": True})


def write_snapshot(tmp_path: Path, rows: list[dict]) -> Path:
    path = tmp_path / "pages.jsonl"
    payload = "".join(json.dumps(row) + "\n" for row in rows).encode()
    path.write_bytes(payload)
    Path(f"{path}.manifest.json").write_text(json.dumps({"datasetVersion": "page-test", "task": "page_status",
        "sha256": hashlib.sha256(payload).hexdigest(), "recordCount": len(rows)}), encoding="utf-8")
    return path


def test_loader_preserves_page_weights_and_official_concept_features(tmp_path):
    dataset = load_page_dataset(write_snapshot(tmp_path, records()))
    assert dataset.records[0].sample_weight == .5
    assert dataset.records[2].sample_weight == 1
    assert dataset.records[0].concept_keywords == ("cell",)


@pytest.mark.parametrize("mutate, message", [
    (lambda rows: rows.pop(), "exactly one"),
    (lambda rows: rows[1].update(targetLabel="partial"), "disagree"),
    (lambda rows: rows[0].update(sampleWeight=1), "double-count"),
    (lambda rows: rows[0].update(sampleWeight=float("nan")), "finite"),
    (lambda rows: rows[0].update(reviewStatus="quarantined"), "eligible"),
    (lambda rows: rows[0].update(preassignedSplit="test"), "training students"),
    (lambda rows: rows[0].update(noteTextSnapshot="changed"), "hash mismatch"),
])
def test_rejects_inconsistent_unreviewed_or_leaking_page_rows(mutate, message):
    rows = records()
    mutate(rows)
    with pytest.raises(ValueError, match=message):
        _validate_page_pairs(rows)


def test_missing_on_one_page_cannot_override_present_on_another():
    probabilities = np.array([[.01, .04, .95], [.85, .1, .05], [.1, .75, .15]])
    assert aggregate_notes(probabilities, [0, 0, 1], 2, .65, .65) == [0, 1]


def test_aggregation_requires_every_note_to_have_pages():
    with pytest.raises(ValueError, match="at least one"):
        aggregate_notes(np.array([[.1, .1, .8]]), [0], 2, .65, .65)


def test_top_two_aggregation_uses_multiple_pages_and_keeps_single_page_notes():
    probabilities = np.array([[.9, .05, .05], [.1, .1, .8], [.1, .8, .1]])
    assert aggregate_notes(probabilities, [0, 0, 1], 2, .65, .65, "max") == [0, 1]
    assert aggregate_notes(probabilities, [0, 0, 1], 2, .65, .65, "top2_mean") == [2, 1]
    with pytest.raises(ValueError, match="unknown"):
        aggregate_notes(probabilities, [0, 0, 1], 2, .65, .65, "unknown")


def test_model_selection_uses_validation_scores_and_excludes_flagged_labels(monkeypatch):
    import smart_note_training.train_pages as module

    class Scaler:
        def transform(self, features):
            return features

    class Model:
        def __init__(self, c):
            self.c = c

        def predict_proba(self, features):
            good = np.array([[.9, .05, .05], [.05, .9, .05], [.05, .05, .9], [.9, .05, .05]])
            return good if self.c < 1 else np.tile([.9, .05, .05], (4, 1))

    fitted = []

    def fit(features, targets, weights, c):
        fitted.append((features, targets, c))
        return Scaler(), Model(c)

    monkeypatch.setattr(module, "fit_page_classifier", fit)
    train = np.zeros((3, 2))
    targets = np.array([0, 1, 2])
    args = (train, targets, np.ones(3), np.zeros((4, 2)), [0, 1, 2, 3])
    a = select_page_model(*args, [0, 1, 2, 0], [0, 1, 2], [1., .01], ["max", "top2_mean"])
    b = select_page_model(*args, [0, 1, 2, 2], [0, 1, 2], [1., .01], ["max", "top2_mean"])
    assert a[3] == b[3]
    assert a[3]["classifierC"] == .01 and a[3]["metrics"]["macroF1"] == 1
    assert all(features is train and labels is targets for features, labels, _ in fitted)
    assert len(a[4]) == 4


@pytest.mark.parametrize("c", [0, -1, float("nan"), float("inf")])
def test_model_selection_rejects_invalid_regularization(c):
    with pytest.raises(ValueError, match="finite and positive"):
        select_page_model(None, None, None, None, [], [], [], [c], ["max"])


def test_weighted_duplicate_views_do_not_double_count_examples():
    features = np.array([[0., 1.], [1., 0.], [2., 2.], [3., 1.], [1., 3.], [4., 4.]])
    targets = np.array([0, 1, 2, 0, 1, 2])
    weights = np.array([1., 2., 1., 1., 2., 1.])
    scaler, model = fit_page_classifier(features, targets, weights)
    scaler2, model2 = fit_page_classifier(np.repeat(features, 2, axis=0), np.repeat(targets, 2), np.repeat(weights / 2, 2))
    np.testing.assert_allclose(scaler.mean_, scaler2.mean_)
    np.testing.assert_allclose(model.predict_proba(scaler.transform(features)), model2.predict_proba(scaler2.transform(features)), atol=1e-5)


def test_exported_fortran_order_weights_reproduce_fitted_probabilities(tmp_path):
    from safetensors.numpy import load_file

    features = np.array([[0., 1.], [1., 0.], [2., 2.], [3., 1.], [1., 3.], [4., 4.]])
    targets = np.array([0, 1, 2, 0, 1, 2])
    scaler, model = fit_page_classifier(features, targets, np.ones(6))
    model.coef_ = np.asfortranarray(model.coef_)
    path = tmp_path / "classifier.safetensors"
    export_classifier_weights(model, scaler, path)
    exported = load_file(path)
    standardized = (features - exported["scaler.mean"]) / exported["scaler.scale"]
    logits = standardized @ exported["classifier.weight"].T + exported["classifier.bias"]
    probabilities = np.exp(logits - logits.max(axis=1, keepdims=True))
    probabilities /= probabilities.sum(axis=1, keepdims=True)
    np.testing.assert_allclose(probabilities, model.predict_proba(scaler.transform(features)), atol=1e-6)


def test_validation_calibration_is_unaffected_by_excluded_reference_labels():
    probabilities = np.array([[.7, .2, .1], [.3, .6, .1], [.1, .1, .8], [.75, .15, .1]])
    a = calibrate_thresholds(probabilities, [0, 1, 2, 3], [0, 1, 2, 0], [0, 1, 2])
    b = calibrate_thresholds(probabilities, [0, 1, 2, 3], [0, 1, 2, 2], [0, 1, 2])
    assert a == b


def test_protocol_rejects_student_overlap_across_note_splits(tmp_path):
    pages = load_page_dataset(write_snapshot(tmp_path, records()))
    base = pages.records[0]
    notes = ReleasedDataset(Path("notes"), "test", "hash", (
        base, pages.records[2], replace(base, note_group_id="val", preassigned_split="validation"),
        replace(base, note_group_id="test", evaluation_group_id="student-d", preassigned_split="test")))
    with pytest.raises(ValueError, match="student leakage"):
        validate_protocol(pages, notes)


def test_import_does_not_overwrite_existing_snapshots(tmp_path):
    existing = tmp_path / "pages.jsonl"
    existing.write_text("user content", encoding="utf-8")
    with pytest.raises(FileExistsError):
        import_page_release(tmp_path / "not-opened.zip", existing, tmp_path / "notes.jsonl")
    assert existing.read_text() == "user content"

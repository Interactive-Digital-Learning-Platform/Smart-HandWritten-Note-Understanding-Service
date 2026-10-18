from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
from pathlib import Path
from typing import Sequence

import joblib
import numpy as np
import pandas as pd
import sklearn
import torch
import transformers
from safetensors.numpy import save_file
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from transformers import AutoModel, AutoTokenizer

from . import FEATURE_TEMPLATE_VERSION, LABELS
from .dataset import ConceptRecord, leave_one_group_out_indices, load_released_dataset
from .metrics import classification_metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train and evaluate a frozen XLM-R concept-status classifier."
    )
    parser.add_argument("--dataset", required=True, help="Released concept JSONL path")
    parser.add_argument(
        "--output",
        required=True,
        help="New output directory for the model artifact",
    )
    parser.add_argument(
        "--model-name",
        default="FacebookAI/xlm-roberta-base",
        help="Hugging Face encoder model",
    )
    parser.add_argument("--max-length", type=int, default=384)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--classifier-c", type=float, default=1.0)
    parser.add_argument(
        "--class-weight",
        choices=("none", "balanced", "moderate"),
        default="balanced",
        help=(
            "Class weighting: moderate uses present=1, partial=1.5, missing=2 "
            "and is less aggressive than sklearn balanced weights"
        ),
    )
    parser.add_argument(
        "--document-pooling",
        choices=("first_window", "page_mean_max"),
        default="first_window",
        help="How to represent notes longer than the encoder context window",
    )
    parser.add_argument("--hf-cache", default=".cache/huggingface")
    parser.add_argument("--embedding-cache", default=None)
    parser.add_argument("--nomic-baseline", default=None)
    return parser.parse_args()


def _validate_args(args: argparse.Namespace) -> None:
    if args.max_length < 64 or args.max_length > 512:
        raise ValueError("--max-length must be between 64 and 512")
    if args.batch_size < 1:
        raise ValueError("--batch-size must be positive")
    if args.classifier_c <= 0:
        raise ValueError("--classifier-c must be positive")


def _mean_pool(last_hidden_state: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
    mask = attention_mask.unsqueeze(-1).to(last_hidden_state.dtype)
    return (last_hidden_state * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)


def _cache_key(
    dataset_sha: str, model_name: str, max_length: int, document_pooling: str
) -> str:
    value = (
        f"{dataset_sha}|{model_name}|{max_length}|{document_pooling}|"
        f"{FEATURE_TEMPLATE_VERSION}"
    )
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


PAGE_MARKER = re.compile(r"(?m)^--- Page \d+ ---\s*$")


def _note_pages(note_text: str) -> list[str]:
    pages = [page.strip() for page in PAGE_MARKER.split(note_text) if page.strip()]
    return pages or [note_text]


def _load_embedding_cache(
    path: Path, expected_key: str, record_ids: Sequence[str]
) -> np.ndarray | None:
    if not path.is_file():
        return None
    with np.load(path, allow_pickle=False) as payload:
        if str(payload["cache_key"].item()) != expected_key:
            return None
        cached_ids = payload["record_ids"].tolist()
        embeddings = payload["embeddings"]
    if cached_ids != list(record_ids) or embeddings.shape[0] != len(record_ids):
        return None
    if not np.isfinite(embeddings).all():
        return None
    return embeddings.astype(np.float32, copy=False)


def create_embeddings(
    records: Sequence[ConceptRecord],
    dataset_sha: str,
    model_name: str,
    max_length: int,
    batch_size: int,
    hf_cache: Path,
    embedding_cache: Path,
    document_pooling: str,
) -> tuple[np.ndarray, str]:
    cache_key = _cache_key(dataset_sha, model_name, max_length, document_pooling)
    cached = _load_embedding_cache(
        embedding_cache, cache_key, [record.record_id for record in records]
    )
    if cached is not None:
        print(f"Using verified embedding cache: {embedding_cache}")
        return cached, "cache"

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dtype = torch.float16 if device.type == "cuda" else torch.float32
    print(f"Loading {model_name} on {device} ({dtype})")
    tokenizer = AutoTokenizer.from_pretrained(model_name, cache_dir=hf_cache)
    model = AutoModel.from_pretrained(
        model_name,
        cache_dir=hf_cache,
        dtype=dtype,
    ).to(device)
    model.eval()

    if document_pooling == "first_window":
        embedding_inputs = [
            (index, record.concept_prompt, record.note_text)
            for index, record in enumerate(records)
        ]
    else:
        embedding_inputs = [
            (index, record.concept_prompt, page)
            for index, record in enumerate(records)
            for page in _note_pages(record.note_text)
        ]

    chunk_embeddings: list[np.ndarray] = []
    chunk_record_indexes: list[int] = []
    for start in range(0, len(embedding_inputs), batch_size):
        batch = embedding_inputs[start : start + batch_size]
        encoded = tokenizer(
            [prompt for _, prompt, _ in batch],
            [text for _, _, text in batch],
            padding=True,
            truncation="only_second",
            max_length=max_length,
            return_tensors="pt",
        )
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            with torch.autocast(
                device_type=device.type,
                dtype=torch.float16,
                enabled=device.type == "cuda",
            ):
                output = model(**encoded)
                pooled = _mean_pool(output.last_hidden_state, encoded["attention_mask"])
        chunk_embeddings.append(pooled.float().cpu().numpy())
        chunk_record_indexes.extend(index for index, _, _ in batch)
        print(
            f"Embedded {min(start + len(batch), len(embedding_inputs))}/"
            f"{len(embedding_inputs)} text windows"
        )

    window_embeddings = np.concatenate(chunk_embeddings, axis=0).astype(np.float32)
    if document_pooling == "first_window":
        embeddings = window_embeddings
    else:
        pooled_records: list[np.ndarray] = []
        record_indexes = np.asarray(chunk_record_indexes)
        for record_index in range(len(records)):
            windows = window_embeddings[record_indexes == record_index]
            pooled_records.append(
                np.concatenate((windows.mean(axis=0), windows.max(axis=0)))
            )
        embeddings = np.stack(pooled_records).astype(np.float32)
    embedding_cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        embedding_cache,
        cache_key=np.array(cache_key),
        record_ids=np.array([record.record_id for record in records]),
        embeddings=embeddings,
    )
    tokenizer.save_pretrained(embedding_cache.parent / "tokenizer")
    return embeddings, str(device)


def _class_weight(value: str) -> str | dict[int, float] | None:
    if value == "none":
        return None
    if value == "moderate":
        return {0: 1.0, 1: 1.5, 2: 2.0}
    return "balanced"


def _new_classifier(
    c_value: float, class_weight: str | dict[int, float] | None
) -> LogisticRegression:
    return LogisticRegression(
        C=c_value,
        class_weight=class_weight,
        max_iter=2_000,
        random_state=42,
        solver="lbfgs",
    )


def grouped_evaluation(
    embeddings: np.ndarray,
    targets: np.ndarray,
    groups: Sequence[str],
    c_value: float,
    class_weight: str | dict[int, float] | None,
) -> tuple[dict, dict, list[int]]:
    predictions = np.full(len(targets), -1, dtype=np.int64)
    majority_predictions = np.full(len(targets), -1, dtype=np.int64)
    for fold_number, (train_indexes, test_indexes) in enumerate(
        leave_one_group_out_indices(groups), start=1
    ):
        train_targets = targets[train_indexes]
        if len(np.unique(train_targets)) != len(LABELS):
            raise ValueError(
                "a grouped fold is missing a target class; collect labels across more note groups"
            )
        scaler = StandardScaler().fit(embeddings[train_indexes])
        classifier = _new_classifier(c_value, class_weight).fit(
            scaler.transform(embeddings[train_indexes]), train_targets
        )
        predictions[test_indexes] = classifier.predict(
            scaler.transform(embeddings[test_indexes])
        )
        counts = np.bincount(train_targets, minlength=len(LABELS))
        majority_predictions[test_indexes] = int(np.argmax(counts))
        print(f"Evaluated student-group fold {fold_number}/{len(set(groups))}")
    return (
        classification_metrics(targets.tolist(), predictions.tolist()),
        classification_metrics(targets.tolist(), majority_predictions.tolist()),
        predictions.tolist(),
    )


def fixed_split_evaluation(
    records: Sequence[ConceptRecord],
    embeddings: np.ndarray,
    targets: np.ndarray,
    c_value: float,
    class_weight: str | dict[int, float] | None,
) -> dict[str, dict]:
    if any(record.preassigned_split is None for record in records):
        return {}
    indexes_by_split = {
        split: [
            index
            for index, record in enumerate(records)
            if record.preassigned_split == split
        ]
        for split in ("train", "validation", "test")
    }
    if any(not indexes for indexes in indexes_by_split.values()):
        raise ValueError("preassigned train, validation, and test splits must all be non-empty")
    known_splits = {record.preassigned_split for record in records}
    if known_splits != {"train", "validation", "test"}:
        raise ValueError(f"unexpected preassigned splits: {sorted(known_splits)}")

    train_indexes = indexes_by_split["train"]
    train_targets = targets[train_indexes]
    if len(np.unique(train_targets)) != len(LABELS):
        raise ValueError("preassigned training split is missing a target class")
    scaler = StandardScaler().fit(embeddings[train_indexes])
    classifier = _new_classifier(c_value, class_weight).fit(
        scaler.transform(embeddings[train_indexes]), train_targets
    )
    majority = int(np.argmax(np.bincount(train_targets, minlength=len(LABELS))))
    result: dict[str, dict] = {}
    for split in ("validation", "test"):
        indexes = indexes_by_split[split]
        actual = targets[indexes].tolist()
        predicted = classifier.predict(scaler.transform(embeddings[indexes])).tolist()
        result[split] = {
            "metrics": classification_metrics(actual, predicted),
            "majorityBaseline": classification_metrics(
                actual, [majority] * len(actual)
            ),
        }
    return result


def slice_metrics(
    records: Sequence[ConceptRecord], targets: np.ndarray, predictions: Sequence[int]
) -> dict[str, dict[str, dict]]:
    dimensions = {
        "grade": [str(record.grade) for record in records],
        "language": [record.language for record in records],
        "preassignedSplit": [record.preassigned_split or "unspecified" for record in records],
    }
    result: dict[str, dict[str, dict]] = {}
    for dimension, values in dimensions.items():
        result[dimension] = {}
        for value in sorted(set(values)):
            indexes = [index for index, candidate in enumerate(values) if candidate == value]
            result[dimension][value] = classification_metrics(
                targets[indexes].tolist(), [predictions[index] for index in indexes]
            )
    return result


def main() -> None:
    args = parse_args()
    _validate_args(args)
    dataset = load_released_dataset(args.dataset)
    output = Path(args.output).resolve()
    if output.exists():
        raise FileExistsError("output directory already exists; use a new model version")

    hf_cache = Path(args.hf_cache).resolve()
    embedding_cache = Path(
        args.embedding_cache
        or output.parent
        / (
            f"{dataset.version}-xlmr-{args.document_pooling}-"
            f"{args.max_length}-embeddings.npz"
        )
    ).resolve()
    embeddings, embedding_device = create_embeddings(
        dataset.records,
        dataset.sha256,
        args.model_name,
        args.max_length,
        args.batch_size,
        hf_cache,
        embedding_cache,
        args.document_pooling,
    )
    label_to_id = {label: index for index, label in enumerate(LABELS)}
    targets = np.array(
        [label_to_id[record.target_label] for record in dataset.records],
        dtype=np.int64,
    )
    groups = [record.evaluation_group_id for record in dataset.records]
    class_weight = _class_weight(args.class_weight)
    metrics, majority_metrics, out_of_fold = grouped_evaluation(
        embeddings, targets, groups, args.classifier_c, class_weight
    )
    fixed_splits = fixed_split_evaluation(
        dataset.records, embeddings, targets, args.classifier_c, class_weight
    )
    slices = slice_metrics(dataset.records, targets, out_of_fold)

    final_scaler = StandardScaler().fit(embeddings)
    final_classifier = _new_classifier(args.classifier_c, class_weight).fit(
        final_scaler.transform(embeddings), targets
    )
    output.mkdir(parents=True)
    weights_path = output / "classifier.safetensors"
    save_file(
        {
            "classifier.weight": final_classifier.coef_.astype(np.float32),
            "classifier.bias": final_classifier.intercept_.astype(np.float32),
            "scaler.mean": final_scaler.mean_.astype(np.float32),
            "scaler.scale": final_scaler.scale_.astype(np.float32),
        },
        str(weights_path),
    )
    joblib.dump(
        {"scaler": final_scaler, "classifier": final_classifier},
        output / "classifier.joblib",
    )

    comparison: dict[str, object] = {}
    if args.nomic_baseline:
        baseline = json.loads(Path(args.nomic_baseline).read_text(encoding="utf-8"))
        comparison["nomicBaseline"] = baseline.get("evaluation", {}).get("metrics")
    evaluation = {
        "protocol": "leave_one_evaluation_group_out",
        "evaluationGroup": "synthetic student identity",
        "labels": list(LABELS),
        "xlmr": metrics,
        "majorityBaseline": majority_metrics,
        "fixedSplits": fixed_splits,
        "slices": slices,
        **comparison,
    }
    (output / "evaluation.json").write_text(
        json.dumps(evaluation, indent=2) + "\n", encoding="utf-8"
    )
    with (output / "out-of-fold-predictions.jsonl").open("w", encoding="utf-8") as file:
        for record, predicted in zip(dataset.records, out_of_fold, strict=True):
            file.write(
                json.dumps(
                    {
                        "recordId": record.record_id,
                        "noteGroupId": record.note_group_id,
                        "evaluationGroupId": record.evaluation_group_id,
                        "preassignedSplit": record.preassigned_split,
                        "actual": record.target_label,
                        "predicted": LABELS[predicted],
                    }
                )
                + "\n"
            )

    metadata = {
        "artifactVersion": "1.0.0",
        "modelType": "frozen_xlm_roberta_mean_pool_logistic_regression",
        "modelVersion": output.name,
        "baseModel": args.model_name,
        "featureTemplateVersion": FEATURE_TEMPLATE_VERSION,
        "datasetVersion": dataset.version,
        "datasetSha256": dataset.sha256,
        "rows": len(dataset.records),
        "sourceNotes": len(dataset.note_groups),
        "evaluationGroups": len(dataset.groups),
        "labels": list(LABELS),
        "maxLength": args.max_length,
        "classifierC": args.classifier_c,
        "classWeight": args.class_weight,
        "embeddingDimension": int(embeddings.shape[1]),
        "documentPooling": args.document_pooling,
        "embeddingDevice": embedding_device,
        "enabledByDefault": False,
        "deploymentReason": (
            "Synthetic AI-reviewed labels without independent human certification; "
            "disabled pending validation on real handwritten notes."
        ),
        "weightsSha256": hashlib.sha256(weights_path.read_bytes()).hexdigest(),
        "runtime": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "scikitLearn": sklearn.__version__,
            "pandas": pd.__version__,
        },
    }
    (output / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"output": str(output), "evaluation": evaluation}, indent=2))


if __name__ == "__main__":
    main()

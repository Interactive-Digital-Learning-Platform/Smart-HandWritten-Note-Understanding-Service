from __future__ import annotations

from typing import Sequence

from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

from . import LABELS


def classification_metrics(actual: Sequence[int], predicted: Sequence[int]) -> dict:
    if not actual or len(actual) != len(predicted):
        raise ValueError("actual and predicted labels must have the same non-zero length")
    label_indexes = list(range(len(LABELS)))
    precision, recall, f1, support = precision_recall_fscore_support(
        actual,
        predicted,
        labels=label_indexes,
        zero_division=0,
    )
    per_class = {
        label: {
            "support": int(support[index]),
            "precision": round(float(precision[index]), 6),
            "recall": round(float(recall[index]), 6),
            "f1": round(float(f1[index]), 6),
        }
        for index, label in enumerate(LABELS)
    }
    return {
        "sampleCount": len(actual),
        "accuracy": round(float(accuracy_score(actual, predicted)), 6),
        "balancedAccuracy": round(float(sum(recall) / len(recall)), 6),
        "macroF1": round(float(sum(f1) / len(f1)), 6),
        "confusionMatrix": confusion_matrix(
            actual, predicted, labels=label_indexes
        ).tolist(),
        "perClass": per_class,
    }


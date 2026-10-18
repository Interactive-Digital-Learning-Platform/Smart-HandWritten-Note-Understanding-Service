from smart_note_training.metrics import classification_metrics


def test_metrics_use_present_partial_missing_order() -> None:
    metrics = classification_metrics([0, 1, 2, 2], [0, 2, 2, 1])
    assert metrics["accuracy"] == 0.5
    assert metrics["confusionMatrix"] == [[1, 0, 0], [0, 0, 1], [0, 1, 1]]


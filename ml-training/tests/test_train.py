from smart_note_training.train import _class_weight, _note_pages


def test_note_pages_splits_release_markers_and_has_plain_text_fallback() -> None:
    assert _note_pages("--- Page 1 ---\nFirst\n--- Page 2 ---\nSecond") == [
        "First",
        "Second",
    ]
    assert _note_pages("A note without page markers") == ["A note without page markers"]


def test_moderate_class_weight_is_less_aggressive_than_balanced() -> None:
    assert _class_weight("none") is None
    assert _class_weight("balanced") == "balanced"
    assert _class_weight("moderate") == {0: 1.0, 1: 1.5, 2: 2.0}

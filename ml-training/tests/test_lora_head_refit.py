from types import SimpleNamespace
import warnings

import numpy as np
import pytest
import torch
from sklearn.exceptions import ConvergenceWarning

from smart_note_training import lora_head_refit as e
from test_lora_experiment import fake_base


def arrays():
    rng = np.random.default_rng(42)
    X = rng.normal(size=(30, 768)).astype(np.float32)
    y = np.tile(np.arange(3), 10)
    weights = np.where(y == 1, 1., .5)
    return X, y, weights


def test_supplied_weights_and_exact_single_fit_recipe():
    X, y, weights = arrays()
    scaler, classifier, _ = e.fit_once(X, y, weights)
    np.testing.assert_allclose(scaler.mean_, np.average(X, axis=0, weights=weights), atol=1e-12)
    assert scaler.n_samples_seen_ == weights.sum()
    for key, value in e.RECIPE['classifier'].items():
        assert classifier.get_params()[key] == value
    assert classifier.classes_.tolist() == [0, 1, 2]
    assert e.scaled_features(scaler, X).dtype == np.float64


def test_folded_float64_probabilities_and_reloaded_adapters(tmp_path):
    X, y, weights = arrays()
    scaler, classifier, _ = e.fit_once(X, y, weights)
    W, b = e.fold_scaler(classifier, scaler)
    model = e.lora.AdapterClassifier(fake_base()).requires_grad_(False).eval()
    source = {n: p.detach().clone() for n, p in model.named_parameters() if '.lora_' in n}
    model.head = e.FoldedHead('cpu')
    with torch.no_grad():
        model.head.weight.copy_(torch.from_numpy(W))
        model.head.bias.copy_(torch.from_numpy(b))
    model.requires_grad_(False).eval()
    expected = classifier.predict_proba(e.scaled_features(scaler, X))
    assert e.assert_probability_parity(expected, e.head_probabilities(model.head, X)) < 1e-12
    frozen = {'sourceCheckpointSha256': 'fixture', 'parentFrozenProtocol': {'recipe': {'fixture': True}}}
    path = tmp_path/'artifact'
    e.save_artifact(model, scaler, classifier, path, frozen)
    fresh = e.lora.AdapterClassifier(fake_base())
    e.load_artifact(fresh, path, frozen)
    e.assert_adapters_preserved(fresh, source)
    assert fresh.head.weight.dtype == torch.float64
    assert e.assert_probability_parity(expected, e.head_probabilities(fresh.head, X)) < 1e-12
    with pytest.raises(ValueError, match='binding/hash'):
        e.load_artifact(fresh, path, {**frozen, 'sourceCheckpointSha256': 'wrong'})


@pytest.mark.parametrize('bound', [False, True])
def test_nonconvergence_stops_after_one_fit(monkeypatch, bound):
    calls = []
    class Classifier:
        def __init__(self, **kwargs):
            assert kwargs == e.RECIPE['classifier']
        def fit(self, X, y, sample_weight):
            calls.append(1)
            self.n_iter_ = np.array([2000 if bound else 5])
            if not bound:
                warnings.warn('fixture non-convergence', ConvergenceWarning)
    monkeypatch.setattr(e, 'LogisticRegression', Classifier)
    with pytest.raises(ValueError, match='NON_CONVERGENCE'):
        e.fit_once(*arrays())
    assert calls == [1]


def test_class_order_and_probability_failures_stop():
    X, y, weights = arrays()
    scaler, classifier, _ = e.fit_once(X, y, weights)
    classifier.classes_ = np.array([2, 1, 0])
    with pytest.raises(ValueError, match='Class order'):
        e.fold_scaler(classifier, scaler)
    with pytest.raises(ValueError, match='VERIFICATION_FAILURE'):
        e.assert_probability_parity(np.array([[.1, .2, .7]]), np.array([[.1, .3, .6]]))


def test_split_and_dropout_guards_precede_encoding():
    with pytest.raises(ValueError, match='TEST or wrong-split'):
        e.encode_fresh(None, None, [SimpleNamespace(preassigned_split='test')], 'train-pages', None, {})
    model = e.lora.AdapterClassifier(fake_base()).requires_grad_(False).eval()
    e.assert_frozen_encoder(model)
    next(m for m in model.modules() if isinstance(m, torch.nn.Dropout)).train()
    with pytest.raises(ValueError, match='not frozen'):
        e.assert_frozen_encoder(model)


def test_record_groups_and_weighted_loss_do_not_mix_variants():
    records = [SimpleNamespace(record_id=str(i), text_variant=v, target_label=e.LABELS[i % 3],
        sample_weight=1. if i % 3 == 1 else .5) for i, v in enumerate(['corrected']*3+['raw_ocr']*3+['corrected']*3+['raw_ocr']*3)]
    probs = np.eye(3)[np.arange(12) % 3]*.7+.1
    scores = e.train_scores(records, probs, {str(i) for i in range(6)})
    assert all(s['accuracy'] == 1 for s in scores.values())
    assert scores['original/corrected']['sampleCount'] == 3
    assert scores['augmentation/all_views']['sampleCount'] == 6
    assert scores['original/corrected']['weightedLoss'] == pytest.approx(-np.log(.8))

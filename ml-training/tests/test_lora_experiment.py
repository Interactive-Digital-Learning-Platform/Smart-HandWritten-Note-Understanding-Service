from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch
from torch import nn

from smart_note_training import lora_experiment as e


def fake_base():
    class Base(nn.Module):
        def __init__(self):
            super().__init__()
            self.config = SimpleNamespace(hidden_size=768, num_hidden_layers=12, model_type="xlm-roberta")
            self.embedding = nn.Embedding(10, 768)
            self.encoder = nn.Module()
            self.encoder.layer = nn.ModuleList([nn.Module() for _ in range(12)])
            for block in [10, 11]:
                layer = self.encoder.layer[block]
                layer.attention = nn.Module()
                setattr(layer.attention, "self", nn.Module())
                layer.attention.self.query = nn.Linear(768, 768)
                layer.attention.self.value = nn.Linear(768, 768)

        def forward(self, input_ids, attention_mask):
            x = self.embedding(input_ids)
            for block in [10, 11]:
                attention = self.encoder.layer[block].attention.self
                x = attention.query(x) + attention.value(x)
            return SimpleNamespace(last_hidden_state=x)
    return Base()


def test_effective_batch_weighted_gradient_matches_unsplit_batch():
    torch.manual_seed(42)
    x = torch.randn(8, 3)
    targets = torch.tensor([0, 1, 2, 0, 1, 2, 1, 2])
    weights = torch.tensor([.5, 1., .5, .5, 1., .5, 1., .5])
    full = x.clone().requires_grad_()
    e.weighted_loss(full, targets, weights).backward()
    micro = x.clone().requires_grad_()
    for start in range(0, 8, 2):
        e.weighted_loss(micro[start:start+2], targets[start:start+2], weights[start:start+2], weights.sum()).backward()
    torch.testing.assert_close(micro.grad, full.grad)
    wrong = x.clone().requires_grad_()
    for start in range(0, 8, 2):
        (e.weighted_loss(wrong[start:start+2], targets[start:start+2], weights[start:start+2])/4).backward()
    assert not torch.allclose(wrong.grad, full.grad)


def test_zero_adapter_identity_and_nonzero_rank_scaling():
    base = nn.Linear(768, 768)
    layer = e.LoRALinear(base).eval()
    x = torch.randn(2, 768)
    torch.testing.assert_close(layer(x), base(x), rtol=0, atol=0)
    with torch.no_grad(): layer.lora_B.fill_(.01)
    expected = base(x) + 2 * (x @ layer.lora_A.T @ layer.lora_B.T)
    torch.testing.assert_close(layer(x), expected)


def test_exact_scope_frozen_gradients_and_dropout_modes():
    model = e.AdapterClassifier(fake_base()).train()
    audit = e.parameter_audit(model)
    assert audit["trainableCount"] == 26883
    assert not model.base.training
    assert all(m.dropout.training for m in model.modules() if isinstance(m, e.LoRALinear))
    tokens = {"input_ids": torch.tensor([[1, 2, 3], [2, 3, 4]]), "attention_mask": torch.ones(2, 3, dtype=torch.long)}
    e.weighted_loss(model(tokens), torch.tensor([0, 1]), torch.tensor([.5, 1.])).backward()
    assert all(p.grad is None for p in model.parameters() if not p.requires_grad)
    assert all(p.grad is not None for p in model.parameters() if p.requires_grad)
    model.eval()
    assert not any(m.dropout.training for m in model.modules() if isinstance(m, e.LoRALinear))


def test_nonzero_adapter_head_reload_and_tamper_rejection(tmp_path):
    model = e.AdapterClassifier(fake_base()).eval()
    with torch.no_grad():
        for module in model.modules():
            if isinstance(module, e.LoRALinear): module.lora_B.normal_(std=.01)
    tokens = {"input_ids": torch.tensor([[1, 2, 3]]), "attention_mask": torch.tensor([[1, 1, 0]])}
    reference = model(tokens).detach()
    frozen = {"baseRecipe": {"encoderRevision": "fixture-only"}}
    out = tmp_path/"checkpoint"
    e.save_checkpoint(model, out, frozen, "unit_test_fixture")
    fresh = e.AdapterClassifier(model.base)
    e.load_checkpoint(fresh, out, frozen)
    torch.testing.assert_close(fresh(tokens), reference, rtol=0, atol=0)
    with pytest.raises(ValueError, match="identity/hash"):
        e.load_checkpoint(fresh, out, {"baseRecipe": {"encoderRevision": "wrong"}})
    weights = out/"adapter-head.safetensors"
    weights.write_bytes(weights.read_bytes()+b"tampered")
    with pytest.raises(ValueError, match="identity/hash"): e.load_checkpoint(fresh, out, frozen)


def test_test_text_rejected_before_tokenization_and_prediction():
    def forbidden(*a, **k): pytest.fail("test reached tokenizer")
    record = SimpleNamespace(preassigned_split="test")
    with pytest.raises(ValueError, match="Test/unassigned"): e.tokenize(forbidden, [record])
    with pytest.raises(ValueError, match="Only validation"): e.predict(None, forbidden, [record])


def test_three_epoch_permutations_bound_and_no_split_mutation():
    records = [SimpleNamespace(preassigned_split="train") for _ in range(840)]
    orders = e.epoch_orders(records)
    assert orders == e.epoch_orders(records)
    assert all(sorted(order) == list(range(840)) for order in orders)
    assert len(orders)*len(orders[0])//8 == 315
    assert orders[0] != orders[1]
    records[4].preassigned_split = "validation"
    with pytest.raises(ValueError, match="TRAIN"): e.epoch_orders(records)


def test_existing_output_rejected_before_model_or_fit(tmp_path, monkeypatch):
    output = tmp_path/"output"
    output.mkdir()
    monkeypatch.setattr(e, "build_model", lambda *a: pytest.fail("model loaded before fresh-output guard"))
    with pytest.raises(ValueError, match="fresh"):
        e.train_once(SimpleNamespace(root=tmp_path/"dataset"), {}, tmp_path/"protocol", output, tmp_path/"run")


def test_cli_preparation_never_dispatches_training(tmp_path, monkeypatch):
    import sys
    package = object()
    calls = []
    monkeypatch.setattr(e, "load_preparation", lambda *a: (package, "parent", "augmentation", None))
    monkeypatch.setattr(e, "make_protocol", lambda *a: {"fixed": True})
    monkeypatch.setattr(e, "preparation_check", lambda *a: (calls.append(a), {"trainingStarted": False})[1])
    monkeypatch.setattr(e, "train_once", lambda *a: pytest.fail("preparation entered training"))
    monkeypatch.setattr(sys, "argv", ["train_lora_pages.py", "--prepare", "--preparation", "dataset",
        "--baseline-run", "baseline", "--report-dir", str(tmp_path/"fresh")])
    e.main()
    assert len(calls) == 1


def test_recipe_or_runtime_change_rejected(monkeypatch):
    monkeypatch.setattr(e, "runtime", lambda: {"version": "new"})
    frozen = {"recipe": e.RECIPE, "runtime": {"version": "old"}}
    with pytest.raises(ValueError, match="Frozen"):
        e.validate_frozen(frozen, object())


def test_optimizer_contains_only_adapter_head_and_frozen_hyperparameters():
    model = e.AdapterClassifier(fake_base())
    optimizer = e.optimizer_for(model)
    actual = {id(p) for group in optimizer.param_groups for p in group["params"]}
    assert actual == {id(p) for p in model.parameters() if p.requires_grad}
    assert optimizer.state == {}
    for group in optimizer.param_groups:
        assert group["lr"] == .0001 and group["betas"] == (.9, .999) and group["eps"] == 1e-8
        assert group["foreach"] is False and group["fused"] is False
    assert optimizer.param_groups[0]["weight_decay"] == .01
    assert optimizer.param_groups[1]["weight_decay"] == 0
    assert optimizer.param_groups[1]["params"] == [model.head.bias]


def test_input_features_are_exact_prompt_and_text_not_labels_or_review_metadata():
    captured = []
    def tokenizer(first, second, **kwargs):
        captured.append((first, second, kwargs))
        return {"input_ids": torch.tensor([[1, 2]])}
    r = SimpleNamespace(preassigned_split="train", concept_prompt="exact concept prompt", note_text="full source page",
        target_label="missing", record_id="secret-id", review_reason="do not use this", sample_weight=.5)
    e.tokenize(tokenizer, [r], device="cpu")
    r.target_label, r.record_id, r.review_reason = "present", "different-id", "changed review"
    e.tokenize(tokenizer, [r], device="cpu")
    assert captured[0] == captured[1]
    assert captured[0][:2] == (["exact concept prompt"], ["full source page"])
    assert captured[0][2] == {"padding": True, "truncation": "only_second", "max_length": 512, "return_tensors": "pt"}

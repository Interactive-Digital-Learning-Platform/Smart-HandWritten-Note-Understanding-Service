"""Explicitly bounded adapter experiment; preparation never enters the fit branch.

No feature-cache API, test prediction path, baseline refit, or deployment support.
The small native PyTorch adapter avoids adding or changing environment dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import transformers
from safetensors.torch import load_file, save_file
from torch import nn
from transformers import AutoModel, AutoTokenizer

from . import LABELS
from .contrastive_experiment import both_baseline_gate
from .contrastive_release import identity, load_preparation, token_checks, write_json
from .reviewed_experiment import evaluate, score_bundle
from .reviewed_release import eligibility, require, sha, verify_unchanged
from .train_pages import aggregate_notes, calibrate_thresholds, expand_note_pages


RECIPE = {
    "id": "science-combined-lora-r4-final2-qv-01",
    "seed": 42, "epochs": 3, "maxOptimizerUpdates": 315,
    "rank": 4, "alpha": 8, "scaling": 2.0, "adapterDropout": 0.05,
    "blocks": [10, 11], "projections": ["query", "value"],
    "adapterInitialization": "A=kaiming_uniform(a=sqrt(5)); B=zeros; float32",
    "head": "Linear(768,3); Xavier uniform weight, zero bias; float32; no dropout/scaler",
    "labels": list(LABELS),
    "pooling": "attention-mask mean of ALL joint tokens including special tokens, arithmetic float32",
    "tokenization": {"maxLength": 512, "padding": "batch longest", "truncation": "only_second", "truncationSide": "right"},
    "microBatch": 2, "accumulation": 4, "effectiveBatch": 8,
    "loss": "sum_i(supplied_weight_i * CE_float32(logits_i,target_i)) / sum_i(supplied_weight_i) over the entire effective batch",
    "classWeight": None, "labelSmoothing": 0.0, "resampling": False,
    "optimizer": {"name": "AdamW", "lr": 0.0001, "betas": [0.9, 0.999], "eps": 1e-8,
        "weightDecay": 0.01, "biasWeightDecay": 0.0, "foreach": False, "fused": False},
    "scheduler": "constant; no warmup; no LR changes", "gradientClipNorm": 1.0,
    "shuffle": "CPU torch.randperm with dedicated Generator seeded 42, one permutation per epoch; all 840 views once per epoch",
    "precision": "CUDA base float16; adapter/head float32; CUDA autocast float16; FP32 adapter delta/pooling/head/CE; GradScaler",
    "gradScaler": {"initScale": 65536.0, "growthFactor": 2.0, "backoffFactor": 0.5, "growthInterval": 2000},
    "baseDropout": "disabled: frozen base remains eval; only adapter dropout enabled in training",
    "gradientCheckpointing": False, "attentionImplementation": "eager",
    "deterministicAlgorithms": True, "cublasWorkspaceConfig": ":4096:8", "tf32": False,
    "selection": "only epoch 3 checkpoint; no intermediate validation or checkpoint search",
    "nonfinitePolicy": "abort; no skipped-step recovery, automatic retry, or extra updates",
    "cachePolicy": "no embedding or token feature caches; tokenize full source inputs on demand",
    "testPolicy": "structural admission only; never tokenize, encode, predict or score test",
    "deploymentEnabled": False,
}


def seed_all():
    os.environ["CUBLAS_WORKSPACE_CONFIG"] = RECIPE["cublasWorkspaceConfig"]
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(42)
    torch.use_deterministic_algorithms(True)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.backends.cudnn.benchmark = False


def runtime():
    require(torch.cuda.is_available(), "Pinned CUDA recipe unavailable; no silent CPU fallback")
    return {"python": platform.python_version(), "torch": torch.__version__, "transformers": transformers.__version__,
        "cuda": torch.version.cuda, "device": torch.cuda.get_device_name(0)}


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear):
        super().__init__()
        self.base = base.requires_grad_(False)
        self.lora_A = nn.Parameter(torch.empty(4, base.in_features, device=base.weight.device, dtype=torch.float32))
        self.lora_B = nn.Parameter(torch.zeros(base.out_features, 4, device=base.weight.device, dtype=torch.float32))
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))
        self.dropout = nn.Dropout(RECIPE["adapterDropout"])

    def forward(self, inputs):
        original = self.base(inputs)
        with torch.autocast(device_type=inputs.device.type, enabled=False):
            delta = F.linear(F.linear(self.dropout(inputs.float()), self.lora_A), self.lora_B) * 2.0
        return original + delta.to(original.dtype)


class AdapterClassifier(nn.Module):
    def __init__(self, base):
        super().__init__()
        self.base = base.requires_grad_(False)
        require(base.config.hidden_size == 768 and base.config.num_hidden_layers == 12
            and base.config.model_type == "xlm-roberta", "Unexpected XLM-R architecture")
        for block in RECIPE["blocks"]:
            attention = base.encoder.layer[block].attention.self
            for name in RECIPE["projections"]:
                linear = getattr(attention, name)
                # Rebuilding wrappers permits reload against the same unchanged base.
                if isinstance(linear, LoRALinear):
                    linear = linear.base
                require(isinstance(linear, nn.Linear) and linear.weight.shape == (768, 768), "Q/V projection mismatch")
                setattr(attention, name, LoRALinear(linear))
        self.head = nn.Linear(768, 3, device=next(base.parameters()).device, dtype=torch.float32)
        nn.init.xavier_uniform_(self.head.weight)
        nn.init.zeros_(self.head.bias)
        self.train(False)

    def train(self, mode=True):
        super().train(mode)
        self.base.eval()
        for module in self.base.modules():
            if isinstance(module, LoRALinear):
                module.dropout.train(mode)
        return self

    def forward(self, tokens):
        hidden = self.base(**tokens).last_hidden_state
        with torch.autocast(device_type=hidden.device.type, enabled=False):
            mask = tokens["attention_mask"].unsqueeze(-1).float()
            pooled = (hidden.float() * mask).sum(1) / mask.sum(1).clamp_min(1)
            return self.head(pooled)


def build_model(snapshot):
    base = AutoModel.from_pretrained(snapshot, local_files_only=True, dtype=torch.float16,
        attn_implementation="eager", add_pooling_layer=False).to("cuda")
    return AdapterClassifier(base)


def expected_parameters():
    names = {f"base.encoder.layer.{b}.attention.self.{p}.lora_{ab}" for b in [10, 11]
        for p in ["query", "value"] for ab in ["A", "B"]}
    return names | {"head.weight", "head.bias"}


def parameter_audit(model):
    actual = {name: p for name, p in model.named_parameters() if p.requires_grad}
    require(set(actual) == expected_parameters(), "Trainable parameter scope changed")
    require(sum(p.numel() for p in actual.values()) == 26883 and all(p.dtype == torch.float32 for p in actual.values()),
        "Trainable parameter count/dtype changed")
    return {"trainableCount": 26883, "adapterCount": 24576, "headCount": 2307,
        "trainableTensors": {k: list(v.shape) for k, v in actual.items()},
        "totalParameters": sum(p.numel() for p in model.parameters()), "frozenBase": True}


def optimizer_for(model):
    parameters = dict((n, p) for n, p in model.named_parameters() if p.requires_grad)
    settings = RECIPE["optimizer"]
    return torch.optim.AdamW([
        {"params": [p for n, p in parameters.items() if n != "head.bias"], "weight_decay": settings["weightDecay"]},
        {"params": [parameters["head.bias"]], "weight_decay": 0.0}],
        lr=settings["lr"], betas=tuple(settings["betas"]), eps=settings["eps"], foreach=False, fused=False)


def weighted_loss(logits, targets, weights, denominator=None):
    require(bool(torch.isfinite(weights).all()) and bool((weights > 0).all()), "Invalid supplied weights")
    denominator = weights.sum() if denominator is None else denominator
    return (F.cross_entropy(logits.float(), targets, reduction="none", label_smoothing=0.0) * weights).sum() / denominator


def tokenize(tokenizer, records, device="cuda"):
    require(records and all(r.preassigned_split in {"train", "validation"} for r in records), "Test/unassigned input rejected")
    encoded = tokenizer([r.concept_prompt for r in records], [r.note_text for r in records],
        padding=True, truncation="only_second", max_length=512, return_tensors="pt")
    return {k: v.to(device) for k, v in encoded.items()}


def predict(model, tokenizer, records):
    require(records and all(r.preassigned_split == "validation" for r in records), "Only validation predictions permitted")
    model.eval()
    values = []
    for start in range(0, len(records), 2):
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
            logits = model(tokenize(tokenizer, records[start:start+2]))
            values.append(logits.softmax(-1).cpu().numpy())
    return np.concatenate(values).astype(np.float32)


def save_checkpoint(model, directory, frozen, purpose="final_checkpoint"):
    directory = Path(directory)
    require(not directory.exists(), "Checkpoint directory must be fresh")
    directory.mkdir(parents=True)
    tensors = {n: p.detach().cpu().contiguous() for n, p in model.named_parameters() if p.requires_grad}
    save_file(tensors, str(directory/"adapter-head.safetensors"))
    write_json(directory/"metadata.json", {"modelType": "xlmr_final2_qv_lora_mean_linear", "labels": list(LABELS),
        "frozenProtocolSha256": identity(frozen), "baseRecipe": frozen["baseRecipe"], "recipe": RECIPE,
        "weightsSha256": sha(directory/"adapter-head.safetensors"), "purpose": purpose,
        "enabledByDefault": False, "stage6Compatible": False, "testEvaluated": False})


def load_checkpoint(model, directory, frozen):
    directory = Path(directory)
    metadata = json.loads((directory/"metadata.json").read_text(encoding="utf-8"))
    require(metadata["modelType"] == "xlmr_final2_qv_lora_mean_linear"
        and metadata["labels"] == list(LABELS) and metadata["recipe"] == RECIPE
        and metadata["baseRecipe"] == frozen["baseRecipe"] and metadata["frozenProtocolSha256"] == identity(frozen)
        and metadata["enabledByDefault"] is False and metadata["stage6Compatible"] is False
        and sha(directory/"adapter-head.safetensors") == metadata["weightsSha256"], "Checkpoint identity/hash mismatch")
    tensors = load_file(str(directory/"adapter-head.safetensors"))
    parameters = dict(model.named_parameters())
    require(set(tensors) == expected_parameters(), "Adapter/head checkpoint members mismatch")
    with torch.no_grad():
        for name, value in tensors.items():
            require(value.shape == parameters[name].shape and value.dtype == torch.float32
                and bool(torch.isfinite(value).all()), "Adapter/head tensor shape/dtype/finiteness mismatch")
            parameters[name].copy_(value)
    parameter_audit(model)
    return model.eval()


def implementation_hashes():
    root = Path(__file__).resolve().parents[2]
    paths = [Path(__file__), root/"train_lora_pages.py", *(Path(__file__).parent/n for n in
        ["dataset.py", "reviewed_release.py", "contrastive_release.py", "reviewed_experiment.py", "contrastive_experiment.py", "train_pages.py", "metrics.py", "train.py", "__init__.py"])]
    return {str(p): sha(p) for p in paths}


def baseline_results(package, directory):
    directory = Path(directory).resolve()
    scores = json.loads((directory/"evaluation.json").read_text(encoding="utf-8"))
    old = json.loads((directory/"frozen-run-protocol.json").read_text(encoding="utf-8"))
    require(old["protocol"] == package.protocol and old["lineage"]["fitCompositeSha256"] == package.pages.sha256
        and old["lineage"]["noteCompositeSha256"] == package.notes.sha256
        and scores["testScored"] is False, "Saved baseline evaluation protocol/source mismatch")
    require(set(scores["baselines"]) == set(package.protocol["advancementGate"]["comparatorIds"]), "Gate comparator mismatch")
    selected = next(c for c in scores["candidates"] if c["classifierC"] == scores["selectedClassifierC"])
    saved = scores["baselines"] | {"combined-selected-C-0.01": selected["evaluation"]}
    for value in saved.values():
        require(value["wholeNote"]["allReferences"]["sampleCount"] == 119
            and value["correctedPagePrimary"]["allReferences"]["sampleCount"] == 40
            and value["rawPageSecondary"]["allReferences"]["sampleCount"] == 40, "Baseline score denominators changed")
    hashes = {str(directory/n): sha(directory/n) for n in ["evaluation.json", "frozen-run-protocol.json"]}
    # Reproduce fixed comparison scores from existing saved class decisions.
    # This reads no embedding caches and performs no baseline inference/refitting.
    audit = directory.parents[2]/"data/annotations/intake/science-reviewed-contrastive-combined-01-training-2026-10-05"
    predictions = audit/"validation-export-predictions.jsonl"
    decisions = [json.loads(line) for line in predictions.read_text(encoding="utf-8").splitlines()]
    require(len(decisions) == 796 and all(r["split"] == "validation" for r in decisions), "Saved decision scope mismatch")
    validation = [r for r in package.notes.records if r.preassigned_split == "validation"]
    supervised = {r.concept_id for r in package.pages.records}
    for name, value in saved.items():
        source_model = "C=0.01" if name == "combined-selected-C-0.01" else name
        for unit, records in [("wholeNote", validation), ("correctedPagePrimary", package.corrected), ("rawPageSecondary", package.raw)]:
            rows = [r for r in decisions if r["model"] == source_model and r["unit"] == unit]
            by_id = {r["recordId"]: r for r in rows}
            require(len(rows) == len(by_id) == len(records) and set(by_id) == {r.record_id for r in records}
                and all(by_id[r.record_id]["targetLabel"] == r.target_label for r in records), "Saved reference join mismatch")
            predicted = [LABELS.index(by_id[r.record_id]["predictedLabel"]) for r in records]
            actual = [LABELS.index(r.target_label) for r in records]
            reconstructed = score_bundle(records, actual, predicted, list(range(len(records))), supervised)
            require(all(reconstructed[k] == value[unit][k] for k in reconstructed), "Saved baseline metrics/slices mismatch")
    hashes[str(predictions)] = sha(predictions)
    for c in ["0.01", "0.1"]:
        for n in ["metadata.json", "classifier.safetensors", "evaluation.json"]:
            f = directory/f"candidate-C-{c}"/n
            hashes[str(f)] = sha(f)
    return saved, hashes


def make_protocol(package, baseline_dir):
    baselines, hashes = baseline_results(package, baseline_dir)
    return {"schemaVersion": "1.0.0", "experimentId": RECIPE["id"], "recipe": RECIPE,
        "preparation": str(package.root), "baseRecipe": package.recipe, "evaluationProtocol": package.protocol,
        "fitCompositeSha256": package.pages.sha256, "noteCompositeSha256": package.notes.sha256,
        "sourceFingerprints": {str(k): v for k, v in package.fingerprints.items()},
        "baselineFingerprints": hashes, "baselineScores": baselines,
        "implementationFingerprints": implementation_hashes(), "runtime": runtime(),
        "fitViews": 840, "weightTotal": 543, "expectedUpdates": 315,
        "trainingAuthorizedByFile": False, "enabledByDefault": False, "testScored": False}


def validate_frozen(frozen, package):
    require(frozen["recipe"] == RECIPE and frozen["runtime"] == runtime()
        and frozen["baseRecipe"] == package.recipe and frozen["evaluationProtocol"] == package.protocol
        and frozen["fitCompositeSha256"] == package.pages.sha256 and frozen["noteCompositeSha256"] == package.notes.sha256
        and frozen["sourceFingerprints"] == {str(k): v for k, v in package.fingerprints.items()}
        and frozen["implementationFingerprints"] == implementation_hashes(), "Frozen recipe/code/environment/source changed")


def verify_bindings(frozen):
    for path, digest in (frozen["sourceFingerprints"] | frozen["baselineFingerprints"] | frozen["implementationFingerprints"]).items():
        require(sha(Path(path)) == digest, "Pinned input changed: " + path)


def validation_inputs(package):
    validation = [r for r in package.notes.records if r.preassigned_split == "validation"]
    pages, owners = expand_note_pages(validation)
    require(len(validation) == 119 and len(pages) == 1028 and len(package.corrected) == len(package.raw) == 40,
        "Validation dimensions changed")
    return validation, pages, owners


def epoch_orders(records):
    require(len(records) == 840 and all(r.preassigned_split == "train" for r in records), "Fit must contain exactly 840 TRAIN views")
    generator = torch.Generator(device="cpu").manual_seed(42)
    return [torch.randperm(840, generator=generator).tolist() for _ in range(3)]


def preparation_check(package, parent, augmentation, frozen, report_dir):
    require(not report_dir.exists() and not report_dir.is_relative_to(package.root), "Preparation report must be fresh outside dataset")
    validate_frozen(frozen, package)
    verify_bindings(frozen)
    tokens = AutoTokenizer.from_pretrained(package.recipe["localSnapshot"], local_files_only=True)
    require(tokens.truncation_side == "right", "Tokenizer truncation side changed")
    truncation = token_checks(parent, augmentation, tokens)
    validation, pages, owners = validation_inputs(package)
    lengths = [len(tokens(r.concept_prompt, r.note_text, truncation=False)["input_ids"]) for r in pages]
    require(max(lengths) <= 512, "Whole-validation page truncation changed")
    orders = epoch_orders(package.pages.records)
    require(sum(r.sample_weight for r in package.pages.records) == 543, "Supplied weights changed")
    report_dir.mkdir(parents=True)
    write_json(report_dir/"frozen-protocol.json", frozen)
    seed_all()
    torch.cuda.reset_peak_memory_stats()
    model = build_model(package.recipe["localSnapshot"])
    audit = parameter_audit(model)
    # Synthetic bilingual maximal-length probe only, never held-out predictions.
    probe = tokens(["Concept: photosynthesis", "Concept: force"],
        ["Light produces chemical energy in plants. " * 160, "ශාක ආලෝක ශක්තිය භාවිත කරයි. " * 160],
        truncation="only_second", max_length=512, padding=True, return_tensors="pt")
    probe = {k: v.to("cuda") for k, v in probe.items()}
    require(probe["input_ids"].shape == (2, 512), "Probe must exercise the maximum microbatch")
    model.train()
    with torch.autocast("cuda", dtype=torch.float16):
        loss = weighted_loss(model(probe), torch.tensor([0, 2], device="cuda"), torch.tensor([.5, .5], device="cuda"))
    loss.backward()
    require(all(p.grad is None for n, p in model.named_parameters() if not p.requires_grad), "Frozen base received gradients")
    require(all(p.grad is not None and bool(torch.isfinite(p.grad).all()) for p in model.parameters() if p.requires_grad),
        "Trainable gradient missing/nonfinite")
    model.zero_grad(set_to_none=True)
    # Nonzero adapters test reload, avoiding a vacuous zero-B checkpoint check.
    with torch.no_grad():
        for module in model.modules():
            if isinstance(module, LoRALinear): module.lora_B.fill_(0.001)
    model.eval()
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16): reference = model(probe).softmax(-1)
    expected = {n: p.detach().clone() for n, p in model.named_parameters() if p.requires_grad}
    save_checkpoint(model, report_dir/"synthetic-reload-fixture", frozen, "UNTRAINED_SYNTHETIC_PREPARATION_FIXTURE")
    reloaded = AdapterClassifier(model.base)
    load_checkpoint(reloaded, report_dir/"synthetic-reload-fixture", frozen)
    require(all(torch.equal(expected[n], p) for n, p in reloaded.named_parameters() if p.requires_grad), "Reload tensor mismatch")
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16): actual = reloaded(probe).softmax(-1)
    error = float((reference-actual).abs().max())
    require(error <= 1e-6 and torch.equal(reference.argmax(-1), actual.argmax(-1)), "Reload probability/prediction mismatch")
    # Exercise shared scoring and gate plumbing with fabricated probabilities,
    # not outputs of the candidate on validation texts.
    scores = evaluate(package, np.tile([.6, .2, .2], (len(pages), 1)),
        np.tile([.6, .2, .2], (40, 1)), np.tile([.6, .2, .2], (40, 1)), (.5, .35))
    require(scores["wholeNote"]["allReferences"]["sampleCount"] == 119
        and scores["correctedPagePrimary"]["allReferences"]["sampleCount"] == 40, "Evaluation compatibility failed")
    verify_unchanged(package)
    verify_bindings(frozen)
    result = {"result": "PASS", "recipeSha256": identity(frozen), "parameterAudit": audit,
        "truncation": truncation, "wholeValidationPagesTokenized": len(pages), "maximumWholeValidationTokens": max(lengths),
        "epochOrderHashes": [identity(x) for x in orders], "effectiveBatchesPerEpoch": 105, "optimizerUpdatesPlanned": 315,
        "reloadMaxProbabilityError": error, "syntheticMaxLengthForwardBackwardPassed": True,
        "peakAllocatedBytes": torch.cuda.max_memory_allocated(), "evaluationCompatibility": "shared evaluator exercised with fabricated probabilities only",
        "trainingStarted": False, "optimizerSteps": 0, "validationPredicted": False,
        "testTokenized": False, "testPredicted": False, "testScored": False, "embeddingCacheUsed": False, "deployed": False}
    write_json(report_dir/"check-only.json", result)
    write_json(report_dir/"receipt.json", {"protocolFileSha256": sha(report_dir/"frozen-protocol.json"),
        "checkFileSha256": sha(report_dir/"check-only.json"), "ready": True})
    return result


def train_once(package, frozen, protocol_file, output, run_dir):
    require(not output.exists() and not run_dir.exists() and output != run_dir and not output.is_relative_to(run_dir)
        and not run_dir.is_relative_to(output) and not output.is_relative_to(package.root)
        and not run_dir.is_relative_to(package.root), "Output/run directories must be fresh, separate and outside dataset")
    receipt = json.loads((protocol_file.parent/"receipt.json").read_text(encoding="utf-8"))
    check = json.loads((protocol_file.parent/"check-only.json").read_text(encoding="utf-8"))
    require(receipt["ready"] is True and receipt["protocolFileSha256"] == sha(protocol_file)
        and receipt["checkFileSha256"] == sha(protocol_file.parent/"check-only.json")
        and check["recipeSha256"] == identity(frozen) and check["result"] == "PASS" and check["optimizerSteps"] == 0,
        "Matching completed preparation check required")
    validate_frozen(frozen, package)
    verify_bindings(frozen)
    tokens = AutoTokenizer.from_pretrained(package.recipe["localSnapshot"], local_files_only=True)
    seed_all()
    model = build_model(package.recipe["localSnapshot"])
    parameter_audit(model)
    orders = epoch_orders(package.pages.records)
    output.mkdir(parents=True)
    run_dir.mkdir(parents=True)
    write_json(output/"frozen-run-protocol.json", frozen)
    write_json(run_dir/"epoch-orders.json", orders)
    optimizer = optimizer_for(model)
    scaler = torch.amp.GradScaler("cuda", **{"init_scale": 65536., "growth_factor": 2., "backoff_factor": .5, "growth_interval": 2000})
    updates = 0
    log = []
    records = package.pages.records
    for epoch, order in enumerate(orders, 1):
        model.train()
        for start in range(0, 840, 8):
            batch = [records[i] for i in order[start:start+8]]
            denominator = sum(r.sample_weight for r in batch)
            optimizer.zero_grad(set_to_none=True)
            total_loss = 0.0
            for micro in range(0, 8, 2):
                part = batch[micro:micro+2]
                targets = torch.tensor([LABELS.index(r.target_label) for r in part], device="cuda")
                weights = torch.tensor([r.sample_weight for r in part], device="cuda", dtype=torch.float32)
                with torch.autocast("cuda", dtype=torch.float16):
                    loss = weighted_loss(model(tokenize(tokens, part)), targets, weights, denominator)
                require(bool(torch.isfinite(loss)), "Nonfinite training loss; experiment aborted")
                scaler.scale(loss).backward()
                total_loss += float(loss.detach())
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1., error_if_nonfinite=True)
            scaler.step(optimizer)
            scaler.update()
            updates += 1
            require(updates <= 315, "Optimizer update bound exceeded")
            log.append({"epoch": epoch, "update": updates, "weightedLoss": total_loss, "lr": .0001})
            if updates % 21 == 0: print(json.dumps(log[-1]), flush=True)
    require(updates == 315, "Epoch/update count mismatch")
    write_json(run_dir/"training-log.json", log)
    validation, pages, owners = validation_inputs(package)
    V, P, R = [predict(model, tokens, rs) for rs in [pages, package.corrected, package.raw]]
    eligible = eligibility(validation, package.protocol, "validation")
    thresholds = calibrate_thresholds(V, owners, [LABELS.index(r.target_label) for r in validation], eligible, "max")
    scores = evaluate(package, V, P, R, thresholds[:2])
    save_checkpoint(model, output/"final-checkpoint", frozen)
    reloaded = AdapterClassifier(model.base)
    load_checkpoint(reloaded, output/"final-checkpoint", frozen)
    roundtrip = [predict(reloaded, tokens, rs) for rs in [pages, package.corrected, package.raw]]
    errors = [float(np.max(np.abs(a-b))) for a, b in zip([V, P, R], roundtrip, strict=True)]
    require(max(errors) <= 1e-6 and all(np.array_equal(a.argmax(1), b.argmax(1)) for a, b in zip([V, P, R], roundtrip, strict=True))
        and aggregate_notes(V, owners, 119, *thresholds[:2]) == aggregate_notes(roundtrip[0], owners, 119, *thresholds[:2]),
        "Final exported predictions failed parity")
    gate_baselines = {k: frozen["baselineScores"][k] for k in package.protocol["advancementGate"]["comparatorIds"]}
    result = {"experimentId": RECIPE["id"], "optimizerUpdates": updates, "epochs": 3, "calibration": thresholds[2],
        "evaluation": scores, "baselines": frozen["baselineScores"], "advancementGate": both_baseline_gate(scores, gate_baselines),
        "exportProbabilityErrors": errors, "testScored": False, "testPredicted": False, "deployed": False,
        "enabledByDefault": False, "synthetic": True, "independentHumanCertified": False}
    write_json(output/"evaluation.json", result)
    for tag, rows, probabilities in [("whole-note-pages", pages, V), ("corrected-pages", package.corrected, P), ("raw-pages", package.raw, R)]:
        with (output/(tag+"-validation-predictions.jsonl")).open("x", encoding="utf-8") as stream:
            for r, pr in zip(rows, probabilities, strict=True):
                stream.write(json.dumps({"recordId": r.record_id, "split": "validation", "probabilities": pr.tolist(),
                    "targetLabel": r.target_label if tag != "whole-note-pages" else None,
                    "predictedLabel": LABELS[int(pr.argmax())]}, ensure_ascii=False)+"\n")
    verify_unchanged(package)
    verify_bindings(frozen)
    return result


def main():
    parser = argparse.ArgumentParser(description="Prepare/check one frozen LoRA recipe; training requires explicit --train.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", action="store_true")
    mode.add_argument("--check-only", action="store_true")
    mode.add_argument("--train", action="store_true")
    parser.add_argument("--preparation")
    parser.add_argument("--baseline-run")
    parser.add_argument("--report-dir")
    parser.add_argument("--protocol")
    parser.add_argument("--output")
    parser.add_argument("--run-dir")
    args = parser.parse_args()
    if args.prepare:
        require(args.preparation and args.baseline_run and args.report_dir and not args.protocol and not args.output and not args.run_dir,
            "--prepare requires preparation/baseline-run/report-dir only")
        package, parent, augmentation, _ = load_preparation(args.preparation)
        frozen = make_protocol(package, args.baseline_run)
    else:
        require(args.protocol and not args.preparation and not args.baseline_run, "Use frozen --protocol, not mutable CLI overrides")
        frozen = json.loads(Path(args.protocol).read_text(encoding="utf-8"))
        package, parent, augmentation, _ = load_preparation(frozen["preparation"])
    if args.train:
        require(args.output and args.run_dir and not args.report_dir, "--train requires fresh output/run-dir only")
        result = train_once(package, frozen, Path(args.protocol).resolve(), Path(args.output).resolve(), Path(args.run_dir).resolve())
    else:
        require(args.report_dir and not args.output and not args.run_dir, "Preparation checks require fresh report-dir; no model training output")
        result = preparation_check(package, parent, augmentation, frozen, Path(args.report_dir).resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))

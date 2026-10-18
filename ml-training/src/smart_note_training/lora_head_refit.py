"""One weighted head refit over a frozen, already-trained LoRA encoder.

New paths only; no optimizer for the encoder, cache reads, TEST inputs, retries,
classifier grid, label edits, or deployment. TRAIN export parity precedes VAL.
"""
from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

import numpy as np
import sklearn
import torch
import torch.nn.functional as F
from safetensors.torch import load_file, save_file
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits
from transformers import AutoTokenizer

from . import LABELS
from . import lora_experiment as lora
from .contrastive_experiment import both_baseline_gate
from .contrastive_release import identity, load_preparation, token_checks, write_json
from .metrics import classification_metrics
from .reviewed_experiment import evaluate
from .reviewed_release import eligibility, require, sha, verify_unchanged
from .train_pages import aggregate_notes, calibrate_thresholds


RECIPE = {
    "id": "science-lora-head-refit-C-0.01-01", "seed": 42,
    "encoderAndAdapters": "Frozen existing final LoRA checkpoint; eval mode; every dropout disabled",
    "features": "Exact parent preprocessing: joint concept/full page; right only_second truncation 512; batch longest padding; batch 2; eager CUDA FP16 encoder; FP32 masked mean including special tokens",
    "scaler": "StandardScaler(with_mean=True,with_std=True), fit TRAIN only using supplied sample_weight; transform FP32 encoder features after casting to float64",
    "classifier": {"C": 0.01, "penalty": "l2", "solver": "lbfgs", "max_iter": 2000,
        "tol": 0.0001, "class_weight": None, "random_state": 42, "fit_intercept": True},
    "sampleWeights": "Supplied per-view sample_weight unchanged for BOTH scaler and classifier",
    "fittingThreads": 1, "classifierFits": 1, "parameterSearch": False,
    "convergence": "Abort on ConvergenceWarning or iteration bound reached; no retries; no VAL inference on failure",
    "fold": "W=coef/scale; b=intercept-W@mean; preserve float64 coefficients/head, FP32 encoder features cast to float64 at affine input",
    "probabilityTolerance": 1e-8, "classOrder": list(LABELS),
    "verification": "TRAIN folded/reloaded probabilities and argmax must match fitted model before VAL features; then verify each VAL unit and whole-note decisions",
    "featureCache": "Fresh write-only cache; never reuse frozen-encoder or adapted-model features",
    "testTokenized": False, "testScored": False, "deploymentAllowed": False,
}


class FoldedHead(torch.nn.Linear):
    def __init__(self, device):
        super().__init__(768, 3, device=device, dtype=torch.float64)

    def forward(self, features):
        with torch.autocast(device_type=features.device.type, enabled=False):
            return F.linear(features.to(torch.float64), self.weight, self.bias)


def fold_scaler(classifier, scaler):
    require(classifier.classes_.tolist() == [0, 1, 2] and classifier.coef_.shape == (3, 768)
        and np.all(scaler.scale_ > 0), "Class order/scaler shape mismatch")
    weight = np.ascontiguousarray(classifier.coef_/scaler.scale_, dtype=np.float64)
    bias = np.ascontiguousarray(classifier.intercept_-weight@scaler.mean_, dtype=np.float64)
    require(np.isfinite(weight).all() and np.isfinite(bias).all(), "Nonfinite folded parameters")
    return weight, bias


def fit_once(X, targets, weights):
    require(X.shape == (len(targets), 768) and np.isfinite(X).all() and np.isfinite(weights).all()
        and np.all(weights > 0) and set(targets.tolist()) == {0, 1, 2}, "Invalid TRAIN fit arrays")
    scaler = StandardScaler(with_mean=True, with_std=True)
    classifier = LogisticRegression(**RECIPE["classifier"])
    with threadpool_limits(limits=1), warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        scaler.fit(X, sample_weight=weights)
        classifier.fit(scaled_features(scaler, X), targets, sample_weight=weights)
    require(not any(issubclass(w.category, ConvergenceWarning) for w in caught)
        and int(classifier.n_iter_.max()) < 2000, "NON_CONVERGENCE: stop without retry or validation")
    return scaler, classifier, [str(w.message) for w in caught]


def scaled_features(scaler, X):
    return scaler.transform(np.asarray(X, dtype=np.float64))


def assert_frozen_encoder(model):
    require(not model.training and not any(p.requires_grad for p in model.parameters())
        and not any(m.training for m in model.modules() if isinstance(m, torch.nn.Dropout)),
        "Encoder/adapters/dropout are not frozen")


def encode_fresh(model, tokenizer, records, tag, cache, frozen):
    required_split = "train" if tag == "train-pages" else "validation"
    require(records and all(r.preassigned_split == required_split for r in records), "TEST or wrong-split feature input rejected")
    assert_frozen_encoder(model)
    vectors = []
    for start in range(0, len(records), 2):
        batch = records[start:start+2]
        tokens = lora.tokenize(tokenizer, batch)
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
            hidden = model.base(**tokens).last_hidden_state
            with torch.autocast("cuda", enabled=False):
                mask = tokens["attention_mask"].unsqueeze(-1).float()
                pooled = (hidden.float()*mask).sum(1)/mask.sum(1).clamp_min(1)
            vectors.append(pooled.cpu().numpy())
        if (start+2) % 200 == 0: print(f"Fresh {tag}: {start+2}/{len(records)}", flush=True)
    features = np.concatenate(vectors).astype(np.float32)
    require(features.shape == (len(records), 768) and np.isfinite(features).all(), "Invalid adapted features")
    if cache is not None:
        provenance = {"recipe": RECIPE, "sourceCheckpointSha256": frozen["sourceCheckpointSha256"],
            "baseRecipe": frozen["parentFrozenProtocol"]["baseRecipe"], "orderedRecordIds": [r.record_id for r in records],
            "inputSha256": identity([(r.concept_prompt, r.note_text) for r in records]), "split": required_split,
            "featureDimension": 768, "featureDtype": "float32", "frozenRecipeSha256": identity(frozen)}
        path = cache/(tag+"-"+identity(provenance)+".npz")
        with path.open("xb") as stream:
            np.savez_compressed(stream, features=features, record_ids=np.asarray(provenance["orderedRecordIds"]),
                provenance_json=np.asarray(json.dumps(provenance, ensure_ascii=False, sort_keys=True)))
    return features


def head_probabilities(head, X):
    values = []
    device = head.weight.device
    for start in range(0, len(X), 2):
        with torch.inference_mode():
            values.append(head(torch.as_tensor(X[start:start+2], device=device)).softmax(-1).cpu().numpy())
    probabilities = np.concatenate(values)
    require(np.isfinite(probabilities).all() and np.allclose(probabilities.sum(1), 1), "Invalid head probabilities")
    return probabilities


def assert_probability_parity(reference, exported):
    error = float(np.max(np.abs(reference-exported)))
    require(error <= RECIPE["probabilityTolerance"] and np.array_equal(reference.argmax(1), exported.argmax(1)),
        "VERIFICATION_FAILURE: probability/argmax parity failed; stop")
    return error


def save_artifact(model, scaler, classifier, directory, frozen):
    require(not directory.exists(), "Artifact directory must be fresh")
    directory.mkdir()
    tensors = {n: p.detach().cpu().contiguous() for n, p in model.named_parameters() if n in lora.expected_parameters()}
    require(set(tensors) == lora.expected_parameters(), "Artifact tensor coverage mismatch")
    save_file(tensors, str(directory/"adapter-head.safetensors"))
    save_file({"scaler.mean": torch.from_numpy(np.ascontiguousarray(scaler.mean_, dtype=np.float64)),
        "scaler.scale": torch.from_numpy(np.ascontiguousarray(scaler.scale_, dtype=np.float64)),
        "classifier.weight": torch.from_numpy(np.ascontiguousarray(classifier.coef_, dtype=np.float64)),
        "classifier.bias": torch.from_numpy(np.ascontiguousarray(classifier.intercept_, dtype=np.float64))}, str(directory/"unfolded-head.safetensors"))
    write_json(directory/"metadata.json", {"modelType": "frozen_final_lora_xlmr_mean_folded_weighted_logistic_regression",
        "recipe": RECIPE, "labels": list(LABELS), "sourceCheckpointSha256": frozen["sourceCheckpointSha256"],
        "frozenProtocolSha256": identity(frozen), "weightsSha256": sha(directory/"adapter-head.safetensors"),
        "unfoldedHeadSha256": sha(directory/"unfolded-head.safetensors"), "encoderRecipe": frozen["parentFrozenProtocol"]["recipe"],
        "headDtype": "float64", "adapterDtype": "float32", "poolingDtype": "float32",
        "enabledByDefault": False, "stage6Compatible": False, "testEvaluated": False})


def load_artifact(model, directory, frozen):
    metadata = json.loads((directory/"metadata.json").read_text(encoding="utf-8"))
    require(metadata["recipe"] == RECIPE and metadata["labels"] == list(LABELS)
        and metadata["frozenProtocolSha256"] == identity(frozen)
        and metadata["sourceCheckpointSha256"] == frozen["sourceCheckpointSha256"]
        and sha(directory/"adapter-head.safetensors") == metadata["weightsSha256"]
        and sha(directory/"unfolded-head.safetensors") == metadata["unfoldedHeadSha256"], "Artifact binding/hash mismatch")
    tensors = load_file(str(directory/"adapter-head.safetensors"))
    require(set(tensors) == lora.expected_parameters(), "Artifact class/head/adapter members mismatch")
    model.head = FoldedHead(next(model.base.parameters()).device)
    named = dict(model.named_parameters())
    with torch.no_grad():
        for n, v in tensors.items():
            require(v.shape == named[n].shape and v.dtype == named[n].dtype and bool(torch.isfinite(v).all()), "Artifact shape/dtype mismatch")
            named[n].copy_(v)
    return model.requires_grad_(False).eval()


def assert_adapters_preserved(model, source):
    names = dict(model.named_parameters())
    require(all(torch.equal(names[n].detach().cpu(), v) for n, v in source.items() if ".lora_" in n), "Frozen adapter changed")
    assert_frozen_encoder(model)


def train_scores(records, probabilities, original_ids):
    results = {}
    for name, original in [("original", True), ("augmentation", False)]:
        for variant in ["corrected", "raw_ocr", "all_views"]:
            indexes = [i for i, r in enumerate(records) if (r.record_id in original_ids) == original
                and (variant == "all_views" or r.text_variant == variant)]
            actual = [LABELS.index(records[i].target_label) for i in indexes]
            predicted = probabilities[indexes].argmax(1).tolist()
            scores = classification_metrics(actual, predicted)
            for i, label in enumerate(LABELS): scores["perClass"][label]["correctCount"] = scores["confusionMatrix"][i][i]
            weights = np.asarray([records[i].sample_weight for i in indexes])
            selected = probabilities[indexes]
            ce = -np.log(selected[np.arange(len(indexes)), actual].clip(1e-300))
            scores["weightedLoss"] = float(np.dot(weights, ce)/weights.sum())
            scores["weightTotal"] = float(weights.sum())
            results[name+"/"+variant] = scores
    return results


def write_predictions(path, records, probabilities):
    with path.open("x", encoding="utf-8") as stream:
        for r, p in zip(records, probabilities, strict=True):
            row = {"recordId": r.record_id, "split": r.preassigned_split, "probabilities": p.tolist(),
                "predictedLabel": LABELS[int(p.argmax())]}
            if r.preassigned_split == "train":
                row.update(targetLabel=r.target_label, sampleWeight=r.sample_weight, textVariant=r.text_variant)
            stream.write(json.dumps(row, ensure_ascii=False)+"\n")


def freeze(source_run, protocol_file):
    require(not protocol_file.exists(), "Protocol file must be fresh")
    parent_frozen = json.loads((source_run/"frozen-run-protocol.json").read_text(encoding="utf-8"))
    package, _, _, _ = load_preparation(parent_frozen["preparation"])
    lora.validate_frozen(parent_frozen, package)
    lora.verify_bindings(parent_frozen)
    collapsed = json.loads((source_run/"evaluation.json").read_text(encoding="utf-8"))
    require(collapsed["optimizerUpdates"] == 315 and collapsed["epochs"] == 3 and collapsed["testScored"] is False
        and max(collapsed["exportProbabilityErrors"]) <= 1e-6, "Source final checkpoint verification failed")
    source_hashes = {str(p): sha(p) for p in source_run.rglob("*") if p.is_file()}
    module = Path(__file__).resolve()
    implementations = {str(module): sha(module), str(module.parents[2]/"refit_lora_head.py"): sha(module.parents[2]/"refit_lora_head.py")}
    frozen = {"experimentId": RECIPE["id"], "recipe": RECIPE, "sourceRun": str(source_run),
        "sourceCheckpointSha256": sha(source_run/"final-checkpoint/adapter-head.safetensors"),
        "sourceRunFingerprints": source_hashes, "implementationFingerprints": implementations,
        "parentFrozenProtocol": parent_frozen, "evaluationProtocol": package.protocol,
        "fixedComparisons": parent_frozen["baselineScores"] | {"collapsed-lora-final": collapsed["evaluation"]},
        "runtime": {**lora.runtime(), "numpy": np.__version__, "sklearn": sklearn.__version__},
        "trainingFitsPlanned": 1, "enabledByDefault": False, "testScored": False}
    write_json(protocol_file, frozen)
    return {"result": "FROZEN", "protocolSha256": sha(protocol_file), "classifierFitsPlanned": 1}


def verify_protocol(frozen, package):
    require(frozen["recipe"] == RECIPE and frozen["evaluationProtocol"] == package.protocol
        and frozen["runtime"] == {**lora.runtime(), "numpy": np.__version__, "sklearn": sklearn.__version__}, "Refit recipe/runtime/evaluation changed")
    lora.validate_frozen(frozen["parentFrozenProtocol"], package)
    lora.verify_bindings(frozen["parentFrozenProtocol"])


def verify_files(frozen):
    for path, expected in (frozen["sourceRunFingerprints"] | frozen["implementationFingerprints"]).items():
        require(sha(Path(path)) == expected, "Pinned source/code changed: " + path)


def run(protocol_file, output, cache):
    frozen = json.loads(protocol_file.read_text(encoding="utf-8"))
    package, parent, augmentation, _ = load_preparation(frozen["parentFrozenProtocol"]["preparation"])
    require(not output.exists() and not cache.exists() and output != cache and not output.is_relative_to(cache)
        and not cache.is_relative_to(output) and not output.is_relative_to(package.root)
        and not cache.is_relative_to(package.root), "Output/feature cache must be fresh, separate and outside dataset")
    verify_protocol(frozen, package)
    verify_files(frozen)
    tokenizer = AutoTokenizer.from_pretrained(package.recipe["localSnapshot"], local_files_only=True)
    require(tokenizer.truncation_side == "right", "Preprocessing changed")
    truncation = token_checks(parent, augmentation, tokenizer)
    lora.seed_all()
    model = lora.build_model(package.recipe["localSnapshot"])
    source_run = Path(frozen["sourceRun"])
    lora.load_checkpoint(model, source_run/"final-checkpoint", frozen["parentFrozenProtocol"])
    source_tensors = load_file(str(source_run/"final-checkpoint/adapter-head.safetensors"))
    model.requires_grad_(False).eval()
    assert_adapters_preserved(model, source_tensors)
    output.mkdir(parents=True)
    cache.mkdir(parents=True)
    write_json(output/"frozen-run-protocol.json", frozen)
    X = encode_fresh(model, tokenizer, package.pages.records, "train-pages", cache, frozen)
    targets = np.asarray([LABELS.index(r.target_label) for r in package.pages.records])
    weights = np.asarray([r.sample_weight for r in package.pages.records], dtype=np.float64)
    require(len(targets) == 840 and weights.sum() == 543 and all(r.preassigned_split == "train" for r in package.pages.records), "Fit scope/weights changed")
    scaler, classifier, fit_warnings = fit_once(X, targets, weights)
    write_json(output/"fit-status.json", {"converged": True, "iterations": classifier.n_iter_.tolist(), "classifierFits": 1,
        "warnings": fit_warnings, "sampleWeightSum": 543, "featureCacheRead": False, "encoderOptimizerUpdates": 0})
    reference_train = classifier.predict_proba(scaled_features(scaler, X))
    collapsed_train = head_probabilities(model.head, X)
    W, bias = fold_scaler(classifier, scaler)
    model.head = FoldedHead("cuda")
    with torch.no_grad():
        model.head.weight.copy_(torch.from_numpy(W).to("cuda"))
        model.head.bias.copy_(torch.from_numpy(bias).to("cuda"))
    model.requires_grad_(False).eval()
    folded_error = assert_probability_parity(reference_train, head_probabilities(model.head, X))
    save_artifact(model, scaler, classifier, output/"final-checkpoint", frozen)
    # Fresh base and fresh wrappers; reload only the new immutable artifact.
    reloaded = lora.build_model(package.recipe["localSnapshot"])
    load_artifact(reloaded, output/"final-checkpoint", frozen)
    assert_adapters_preserved(reloaded, source_tensors)
    fresh_train = encode_fresh(reloaded, tokenizer, package.pages.records, "train-pages", None, frozen)
    require(np.array_equal(X, fresh_train), "Freshly reloaded encoder feature parity failed; stop before VAL")
    reloaded_train = head_probabilities(reloaded.head, fresh_train)
    reload_error = assert_probability_parity(reference_train, reloaded_train)
    original_ids = {r.record_id for r in parent.pages.records}
    train = train_scores(package.pages.records, reloaded_train, original_ids)
    collapsed_train_scores = train_scores(package.pages.records, collapsed_train, original_ids)
    write_json(output/"training-resubstitution.json", {"refitted": train, "collapsedLoRA": collapsed_train_scores})
    write_predictions(output/"train-predictions.jsonl", package.pages.records, reloaded_train)
    print("TRAIN convergence/folding/reload checks passed; entering final validation only.", flush=True)
    validation, pages, owners = lora.validation_inputs(package)
    probabilities = []
    reference_probabilities = []
    errors = []
    for records, tag in [(pages, "validation-note-pages"), (package.corrected, "corrected-validation-pages"), (package.raw, "raw-validation-pages")]:
        features = encode_fresh(reloaded, tokenizer, records, tag, cache, frozen)
        ref = classifier.predict_proba(scaled_features(scaler, features))
        exported = head_probabilities(reloaded.head, features)
        errors.append(assert_probability_parity(ref, exported))
        probabilities.append(exported)
        reference_probabilities.append(ref)
        write_predictions(output/(tag+"-predictions.jsonl"), records, exported)
    V, P, R = probabilities
    eligible = eligibility(validation, package.protocol, "validation")
    actual = [LABELS.index(r.target_label) for r in validation]
    thresholds = calibrate_thresholds(V, owners, actual, eligible, "max")
    scores = evaluate(package, V, P, R, thresholds[:2])
    require(aggregate_notes(V, owners, len(validation), *thresholds[:2])
        == aggregate_notes(reference_probabilities[0], owners, len(validation), *thresholds[:2]), "Note export parity failed")
    require(scores == evaluate(package, *reference_probabilities, thresholds[:2]), "Validation scoring parity failed")
    gate = both_baseline_gate(scores, {k: frozen["fixedComparisons"][k] for k in package.protocol["advancementGate"]["comparatorIds"]})
    decisions = aggregate_notes(V, owners, len(validation), *thresholds[:2])
    with (output/"whole-note-validation-decisions.jsonl").open("x", encoding="utf-8") as stream:
        for r, pred in zip(validation, decisions, strict=True):
            stream.write(json.dumps({"recordId": r.record_id, "split": "validation", "targetLabel": r.target_label,
                "predictedLabel": LABELS[pred]}, ensure_ascii=False)+"\n")
    assert_adapters_preserved(model, source_tensors)
    assert_adapters_preserved(reloaded, source_tensors)
    verify_unchanged(package)
    verify_protocol(frozen, package)
    verify_files(frozen)
    result = {"experimentId": RECIPE["id"], "classifierFits": 1, "converged": True, "iterations": classifier.n_iter_.tolist(),
        "trainingResubstitution": train, "collapsedLoRATrain": collapsed_train_scores, "evaluation": scores,
        "comparisons": frozen["fixedComparisons"], "calibration": thresholds[2], "advancementGate": gate,
        "verification": {"trainFoldProbabilityError": folded_error, "trainReloadProbabilityError": reload_error,
            "freshReloadEncoderFeaturesIdentical": True, "validationProbabilityErrors": errors, "adaptersUnchanged": True,
            "encoderOptimizerUpdates": 0, "sourceCheckpointSha256": frozen["sourceCheckpointSha256"], "truncation": truncation},
        "testTokenized": False, "testPredicted": False, "testScored": False, "deployed": False,
        "enabledByDefault": False, "synthetic": True, "independentHumanCertified": False}
    write_json(output/"evaluation.json", result)
    return result


def main():
    parser = argparse.ArgumentParser(description="Freeze or execute exactly one authorized LoRA head refit.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--freeze", action="store_true")
    mode.add_argument("--run", action="store_true")
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--source-run")
    parser.add_argument("--output")
    parser.add_argument("--feature-cache-dir")
    args = parser.parse_args()
    if args.freeze:
        require(args.source_run and not args.output and not args.feature_cache_dir, "Freeze takes source-run and fresh protocol only")
        result = freeze(Path(args.source_run).resolve(), Path(args.protocol).resolve())
    else:
        require(args.output and args.feature_cache_dir and not args.source_run, "Run uses frozen protocol and fresh output/cache only")
        result = run(Path(args.protocol).resolve(), Path(args.output).resolve(), Path(args.feature_cache_dir).resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))

"""Pinned frozen-encoder experiment. Check-only never fits or predicts.

The execution path evaluates validation only. There is deliberately no test
embedding, test prediction, encoder adaptation, or deployment path here.
"""
from __future__ import annotations

import hashlib
import json
import platform
import warnings
from pathlib import Path

import numpy as np
import torch
import transformers
from safetensors.numpy import load_file
from sklearn.exceptions import ConvergenceWarning
from threadpoolctl import threadpool_limits
from transformers import AutoModel, AutoTokenizer

from . import LABELS
from .metrics import classification_metrics
from .reviewed_release import eligibility, load_package, require, sha, token_check, verify_unchanged
from .train import _mean_pool
from .train_pages import aggregate_notes, calibrate_thresholds, expand_note_pages, export_classifier_weights, fit_page_classifier


def resolved_recipe(recipe, allow_cpu=False):
    cuda = torch.cuda.is_available()
    require(cuda or allow_cpu, "CUDA recipe unavailable; explicitly request --allow-cpu-fallback for a separately recorded recipe")
    return {"encodingRecipe":recipe, "device":"cuda" if cuda else "cpu", "dtype":"float16" if cuda else "float32",
            "poolingArithmetic":"float16" if cuda else "float32", "featuresDtype":"float32",
            "torch":torch.__version__, "transformers":transformers.__version__, "python":platform.python_version()}


def cache_key(records, source_hash, recipe):
    identity = {"sourceSha256":source_hash, "recordIds":[r.record_id for r in records], "recipe":recipe,
                "inputSha256":hashlib.sha256(json.dumps([(r.concept_prompt,r.note_text) for r in records],
                    ensure_ascii=False,separators=(",",":")).encode()).hexdigest()}
    return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",",":")).encode()).hexdigest()


def load_cache(path, key, ids):
    if not path.exists():
        return None
    with np.load(path, allow_pickle=False) as saved:
        require(saved.files == ["cache_key", "record_ids", "embeddings"], "unexpected cache members")
        require(str(saved["cache_key"].item()) == key and saved["record_ids"].tolist() == ids, "cache identity mismatch")
        values = saved["embeddings"]
    require(values.shape == (len(ids),768) and values.dtype == np.float32 and np.isfinite(values).all(), "invalid cached feature shape/dtype")
    return values


class Encoder:
    def __init__(self, recipe, tokenizer):
        self.recipe, self.tokenizer = recipe, tokenizer
        self.model = None

    def encode(self, records, source_hash, tag, cache_dir):
        key = cache_key(records, source_hash, self.recipe)
        path = cache_dir / f"{tag}-{key}.npz"
        ids = [r.record_id for r in records]
        cached = load_cache(path, key, ids)
        if cached is not None:
            return cached
        device = torch.device(self.recipe["device"])
        dtype = torch.float16 if device.type == "cuda" else torch.float32
        if self.model is None:
            snapshot = self.recipe["encodingRecipe"]["localSnapshot"]
            self.model = AutoModel.from_pretrained(snapshot, local_files_only=True, dtype=dtype).to(device)
            self.model.eval().requires_grad_(False)
            require(self.model.config.hidden_size == 768, "encoder feature dimension mismatch")
        vectors = []
        for start in range(0, len(records), 2):
            batch = records[start:start+2]
            tokens = self.tokenizer([r.concept_prompt for r in batch], [r.note_text for r in batch], padding=True,
                                    truncation="only_second", max_length=512, return_tensors="pt")
            tokens = {k:v.to(device) for k,v in tokens.items()}
            with torch.inference_mode(), torch.autocast(device_type=device.type, dtype=torch.float16, enabled=device.type == "cuda"):
                hidden = self.model(**tokens).last_hidden_state
                # Match the frozen baseline: pool in hidden-state precision, then cast.
                vectors.append(_mean_pool(hidden,tokens["attention_mask"]).float().cpu().numpy())
        values = np.concatenate(vectors).astype(np.float32)
        require(values.shape == (len(records),768) and np.isfinite(values).all(), "invalid encoder features")
        require(not path.exists(), "cache output already exists")
        with path.open("xb") as stream:
            np.savez_compressed(stream, cache_key=np.asarray(key), record_ids=np.asarray(ids), embeddings=values)
        return values


def safe_probabilities(features, tensors):
    require(tensors["classifier.weight"].shape == (3,features.shape[1])
            and np.all(tensors["scaler.scale"] > 0), "head/scaler shape mismatch")
    logits = ((features-tensors["scaler.mean"])/tensors["scaler.scale"]) @ tensors["classifier.weight"].T + tensors["classifier.bias"]
    logits -= logits.max(1,keepdims=True)
    values = np.exp(logits)
    return values/values.sum(1,keepdims=True)


def score_bundle(records, actual, predicted, eligible, supervised):
    require(bool(eligible), "primary score requires eligible records")
    def metrics(indexes):
        if not indexes:
            return None
        scores = classification_metrics([actual[i] for i in indexes], [predicted[i] for i in indexes])
        for i,label in enumerate(LABELS):
            scores["perClass"][label]["correctCount"] = scores["confusionMatrix"][i][i]
        return scores
    result = {"allReferences":metrics(eligible), "eligibleRecordIds":[records[i].record_id for i in eligible],
              "excludedRecordIds":[r.record_id for i,r in enumerate(records) if i not in set(eligible)]}
    for name, getter in (("language",lambda r:r.language), ("grade",lambda r:str(r.grade)),
                         ("hasTrainingPageSupervision",lambda r:"yes" if r.concept_id in supervised else "no")):
        result[name] = {value:metrics([i for i in eligible if getter(records[i]) == value])
                        for value in sorted({getter(records[i]) for i in eligible})}
    result["metricConvention"] = "Fixed present/partial/missing classes; zero-support precision/recall/F1=0. Inspect support before interpreting slices."
    return result


def majority_labels(package):
    weighted = [sum(r.sample_weight for r in package.pages.records if r.target_label == label) for label in LABELS]
    page_majority = int(np.argmax(weighted))
    train = [r for r in package.notes.records if r.preassigned_split == "train"]
    eligible = eligibility(train,package.protocol,"train")
    note_majority = int(np.argmax(np.bincount([LABELS.index(train[i].target_label) for i in eligible],minlength=3)))
    return page_majority, note_majority


def evaluate(package, probabilities, page_probs, raw_probs, thresholds):
    # Only these three validation inputs are scored. The same mask drives every
    # model, baseline and slice; labelReviewPriority does not change eligibility.
    validation = [r for r in package.notes.records if r.preassigned_split == "validation"]
    _, owners = expand_note_pages(validation)
    eligible = eligibility(validation,package.protocol,"validation")
    actual = [LABELS.index(r.target_label) for r in validation]
    supervised = {r.concept_id for r in package.pages.records}
    page_mask = [i for i,r in enumerate(package.corrected) if r.concept_id not in package.protocol["scopePolicy"]["excludedConceptIds"]]
    page_actual = [LABELS.index(r.target_label) for r in package.corrected]
    predicted = aggregate_notes(probabilities,owners,len(validation),*thresholds,"max")
    page_majority, note_majority = majority_labels(package)
    result = {"wholeNote":score_bundle(validation,actual,predicted,eligible,supervised),
              "correctedPagePrimary":score_bundle(package.corrected,page_actual,page_probs.argmax(1).tolist(),page_mask,supervised),
              "rawPageSecondary":score_bundle(package.raw,page_actual,raw_probs.argmax(1).tolist(),page_mask,supervised),
              "aggregation":{"rule":"max", "presentThreshold":thresholds[0], "partialThreshold":thresholds[1]}}
    baselines = {}
    for name, records, targets, indexes, majority in (("wholeNote",validation,actual,eligible,note_majority),
            ("correctedPagePrimary",package.corrected,page_actual,page_mask,page_majority),
            ("rawPageSecondary",package.raw,page_actual,page_mask,page_majority)):
        baselines[name] = {"trainingMajorityLabel":LABELS[majority],
                          "trainingDerivedMajority":score_bundle(records,targets,[majority]*len(records),indexes,supervised),
                          "alwaysPresent":score_bundle(records,targets,[0]*len(records),indexes,supervised)}
    result["baselines"] = baselines
    return result


def advancement_gate(candidate, baseline):
    note = candidate["wholeNote"]["allReferences"]
    page = candidate["correctedPagePrimary"]["allReferences"]
    base_note, base_page = baseline["wholeNote"]["allReferences"], baseline["correctedPagePrimary"]["allReferences"]
    conditions = {"wholeNoteMacroF1Improves":note["macroF1"] > base_note["macroF1"],
                  "correctedPageMacroF1NotWorse":page["macroF1"] >= base_page["macroF1"],
                  "correctedPageMissingRecallNotWorse":page["perClass"]["missing"]["recall"] >= base_page["perClass"]["missing"]["recall"]}
    return {"passed":all(conditions.values()), "requirements":conditions, "deploymentAllowed":False}


def select_heads(package, X, V, P, R, output, resolved_encoding=None):
    actual = np.asarray([LABELS.index(r.target_label) for r in package.pages.records])
    weights = np.asarray([r.sample_weight for r in package.pages.records])
    validation = [r for r in package.notes.records if r.preassigned_split == "validation"]
    _, owners = expand_note_pages(validation)
    note_actual = [LABELS.index(r.target_label) for r in validation]
    eligible = eligibility(validation,package.protocol,"validation")
    candidates, best = [], None
    for c_value in package.protocol["boundedTrainingExperiment"]["classifierCGrid"]:
        with warnings.catch_warnings(record=True) as caught, threadpool_limits(limits=2):
            warnings.simplefilter("always",ConvergenceWarning)
            scaler, classifier = fit_page_classifier(X,actual,weights,c_value)
        require(not any(issubclass(w.category,ConvergenceWarning) for w in caught)
                and max(classifier.n_iter_) < 2000, "classifier did not converge within the declared budget; stop without expanding search")
        require(classifier.classes_.tolist() == [0,1,2], "classifier class order mismatch")
        val_probs = classifier.predict_proba(scaler.transform(V))
        p_probs, r_probs = (classifier.predict_proba(scaler.transform(features)) for features in (P,R))
        present, partial, calibration = calibrate_thresholds(val_probs,owners,note_actual,eligible,"max")
        scores = evaluate(package,val_probs,p_probs,r_probs,(present,partial))
        candidate_dir = output / f"candidate-C-{c_value}"
        candidate_dir.mkdir()
        path = candidate_dir / "classifier.safetensors"
        export_classifier_weights(classifier,scaler,path)
        tensors = load_file(str(path))
        features = np.concatenate((X,V,P,R))
        reference = classifier.predict_proba(scaler.transform(features))
        exported = safe_probabilities(features,tensors)
        error = float(np.abs(reference-exported).max())
        require(error < 1e-5 and np.array_equal(reference.argmax(1),exported.argmax(1)), "export probability/class parity failed")
        candidate = {"classifierC":c_value, "iterations":classifier.n_iter_.tolist(), "calibration":calibration,
                     "evaluation":scores, "weightsSha256":sha(path), "exportMaxProbabilityError":error,
                     "trainingResubstitutionOnly":classification_metrics(actual.tolist(),classifier.predict(scaler.transform(X)).tolist())}
        (candidate_dir/"evaluation.json").write_text(json.dumps(candidate,indent=2)+"\n",encoding="utf-8")
        meta = {"modelType":"reviewed_page_xlmr_frozen_encoder_logistic_regression", "candidateId":package.manifest["candidateId"],
                "packageVersion":package.manifest["packageVersion"], "pageDatasetSha256":package.pages.sha256,
                "noteReferenceSha256":package.notes.sha256, "labels":list(LABELS), "featureDimension":768,
                "classifierC":c_value, "aggregation":scores["aggregation"], "fitStudents":list(package.pages.groups),
                "encodingRecipe":package.recipe, "resolvedEncodingRecipe":resolved_encoding, "weightsSha256":candidate["weightsSha256"],
                "enabledByDefault":False, "stage6Compatible":False, "synthetic":True, "independentHumanCertified":False,
                "testEvaluated":False, "evaluationProtocolSha256":sha(package.root/"evaluation-protocol.json")}
        (candidate_dir/"metadata.json").write_text(json.dumps(meta,indent=2)+"\n",encoding="utf-8")
        candidates.append(candidate)
        key = (calibration["macroF1"],calibration["balancedAccuracy"],-c_value)
        if best is None or key > best[0]:
            best = (key,candidate)
    return candidates, best[1]


def train_validation_only(package, tokenizer, recipe, output, cache):
    require(not output.exists() and not cache.exists() and output != cache
            and not output.is_relative_to(cache) and not cache.is_relative_to(output)
            and not output.is_relative_to(package.root) and not cache.is_relative_to(package.root), "outputs/cache must be separate fresh directories outside package")
    output.mkdir(parents=True)
    cache.mkdir(parents=True)
    (output/"frozen-run-protocol.json").write_text(json.dumps({"protocol":package.protocol,"resolvedEncodingRecipe":recipe,
        "packageManifestSha256":sha(package.root/"package-manifest.json")},indent=2)+"\n",encoding="utf-8")
    encoder = Encoder(recipe,tokenizer)
    X = encoder.encode(package.pages.records,package.pages.sha256,"train-pages",cache)
    validation = [r for r in package.notes.records if r.preassigned_split == "validation"]
    expanded, _ = expand_note_pages(validation)
    V = encoder.encode(expanded,package.notes.sha256,"validation-note-pages",cache)
    page_source = sha(package.root/package.protocol["validationPageReferences"])
    P = encoder.encode(package.corrected,page_source,"corrected-validation-pages",cache)
    R = encoder.encode(package.raw,page_source,"raw-validation-pages",cache)
    baseline_tensors = load_file(str(Path(package.baseline["externalDirectory"])/"classifier.safetensors"))
    b = package.baseline["aggregation"]
    baseline = evaluate(package,safe_probabilities(V,baseline_tensors),safe_probabilities(P,baseline_tensors),
                        safe_probabilities(R,baseline_tensors),(b["presentThreshold"],b["partialThreshold"]))
    candidates, selected = select_heads(package,X,V,P,R,output,resolved_encoding=recipe)
    gates = {str(c["classifierC"]):advancement_gate(c["evaluation"],baseline) for c in candidates}
    verify_unchanged(package)
    result = {"baseline":baseline, "baselineId":package.baseline["baselineId"], "candidates":candidates,
              "selectedClassifierC":selected["classifierC"], "candidateGates":gates,
              "selectedPassesGate":gates[str(selected["classifierC"])]["passed"], "executionMode":"validation_only",
              "resolvedEncodingRecipe":recipe, "testEmbedded":False, "testPredicted":False, "testScored":False,
              "deployed":False, "enabledByDefault":False, "synthetic":True, "independentHumanCertified":False,
              "limitations":package.protocol["limitations"]}
    (output/"evaluation.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    return result


def run(args):
    require(args.release_zip is not None, "--release-zip is required to verify the external receipt")
    package = load_package(args.evaluation_protocol,args.release_zip,args.pages,args.notes)
    require(args.max_length == 512 and args.batch_size == 2 and args.aggregation_rules == ["max"]
            and (args.classifier_c_grid is None or args.classifier_c_grid == [.01,.1]) and args.classifier_c == 1.0,
            "CLI settings disagree with the frozen protocol; use --classifier-c-grid 0.01 0.1")
    require(args.model_name in (package.recipe["baseModel"],package.recipe["localSnapshot"]), "model substitution is forbidden")
    recipe = resolved_recipe(package.recipe,args.allow_cpu_fallback)
    tokenizer = AutoTokenizer.from_pretrained(package.recipe["localSnapshot"],local_files_only=True)
    truncation = token_check(package,tokenizer)
    verify_unchanged(package)
    if args.check_only:
        print(json.dumps({"result":"PASS", **package.summary, "truncation":truncation,
                          "resolvedEncodingRecipe":recipe, "trainingStarted":False, "encoderLoaded":False,
                          "validationPredicted":False, "testEmbedded":False, "testPredicted":False,
                          "testScored":False, "deployed":False, "inputsPreserved":True},indent=2))
        return
    require(args.output is not None, "--output is required for an explicitly authorized experiment")
    result = train_validation_only(package,tokenizer,recipe,Path(args.output).resolve(),Path(args.embedding_cache_dir).resolve())
    print(json.dumps(result,indent=2))

"""Opt-in composite preparation, check-only, and later bounded validation run.

Preparation and check-only cannot enter the fitting/prediction branch. This
module never embeds or scores test records and never permits deployment.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from safetensors.numpy import load_file
from transformers import AutoTokenizer

from .contrastive_release import (COMBINED, load_preparation, prepare, require,
    sha, token_checks, verify_unchanged, write_json)
from .reviewed_experiment import (Encoder, advancement_gate, evaluate,
    resolved_recipe, safe_probabilities, select_heads)
from .train_pages import expand_note_pages


def tokenizer(snapshot):
    return AutoTokenizer.from_pretrained(snapshot,local_files_only=True)


def both_baseline_gate(candidate, baselines):
    per_baseline = {name:advancement_gate(candidate,scores) for name,scores in baselines.items()}
    return {"passed":all(g["passed"] for g in per_baseline.values()),
        "comparisons":per_baseline,"deploymentAllowed":False}


def train_bounded(package, comparator, tokens, recipe, output, cache):
    output, cache = Path(output).resolve(), Path(cache).resolve()
    require(not output.exists() and not cache.exists() and output != cache
        and not output.is_relative_to(cache) and not cache.is_relative_to(output)
        and not output.is_relative_to(package.root) and not cache.is_relative_to(package.root),
        "model/cache outputs must be separate fresh directories outside preparation")
    # This is a later explicit CLI action. There is no call to this function from
    # prepare() or check-only, and no alternate grid/test-driven retry loop.
    output.mkdir(parents=True)
    cache.mkdir(parents=True)
    lineage = {"preparation":str(package.root),"manifestSha256":sha(package.root/"manifest.json"),
        "sourcesSha256":sha(package.root/"sources.json"),"groupingPolicySha256":sha(package.root/"grouping-policy.json"),
        "sourceDatasetVersions":package.summary["sourceDatasetVersions"],
        "fitCompositeSha256":package.pages.sha256,"noteCompositeSha256":package.notes.sha256}
    write_json(output/"frozen-run-protocol.json",{"protocol":package.protocol,"resolvedEncodingRecipe":recipe,"lineage":lineage})
    encoder = Encoder(recipe,tokens)
    X = encoder.encode(package.pages.records,package.pages.sha256,"train-pages",cache)
    validation = [r for r in package.notes.records if r.preassigned_split == "validation"]
    expanded,_ = expand_note_pages(validation)
    V = encoder.encode(expanded,package.notes.sha256,"validation-note-pages",cache)
    page_source = sha(package.root/package.protocol["validationPageReferences"])
    P = encoder.encode(package.corrected,page_source,"corrected-validation-pages",cache)
    R = encoder.encode(package.raw,page_source,"raw-validation-pages",cache)
    baselines = {}
    for definition in (package.baseline,comparator):
        tensors = load_file(str(Path(definition["externalDirectory"])/"classifier.safetensors"))
        a = definition["aggregation"]
        baselines[definition["baselineId"]] = evaluate(package,safe_probabilities(V,tensors),safe_probabilities(P,tensors),
            safe_probabilities(R,tensors),(a["presentThreshold"],a["partialThreshold"]))
    candidates,selected = select_heads(package,X,V,P,R,output,resolved_encoding=recipe)
    gates = {str(c["classifierC"]):both_baseline_gate(c["evaluation"],baselines) for c in candidates}
    for c in candidates:
        write_json(output/f'candidate-C-{c["classifierC"]}'/"source-lineage.json",lineage)
    verify_unchanged(package)
    result = {"packageVersion":COMBINED,"executionMode":"validation_only","baselines":baselines,
        "candidates":candidates,"selectedClassifierC":selected["classifierC"],"candidateGates":gates,
        "selectedPassesGate":gates[str(selected["classifierC"])]["passed"],"lineage":lineage,
        "resolvedEncodingRecipe":recipe,"testEmbedded":False,"testPredicted":False,"testScored":False,
        "deployed":False,"enabledByDefault":False,"synthetic":True,"independentHumanCertified":False,
        "limitations":package.protocol["limitations"]}
    write_json(output/"evaluation.json",result)
    return result


def run_checked(args):
    package,parent,augmentation,comparator = load_preparation(args.preparation)
    require(args.max_length == 512 and args.batch_size == 2 and args.classifier_c_grid == [.01,.1]
        and args.aggregation_rules == ["max"], "CLI settings disagree with frozen composite protocol")
    recipe = resolved_recipe(package.recipe)
    tokens = tokenizer(package.recipe["localSnapshot"])
    truncation = token_checks(parent,augmentation,tokens)
    verify_unchanged(package)
    if args.check_only:
        require(args.output is None and args.embedding_cache_dir is None, "check-only must not create model/cache outputs")
        return {"result":"PASS",**package.summary,"truncation":truncation,"resolvedEncodingRecipe":recipe,
            "comparators":[package.baseline["baselineId"],comparator["baselineId"]],"trainingStarted":False,
            "encoderLoaded":False,"validationPredicted":False,"testEmbedded":False,"testPredicted":False,
            "testScored":False,"deployed":False}
    require(args.output is not None and args.embedding_cache_dir is not None, "later training requires explicit fresh model/cache outputs")
    return train_bounded(package,comparator,tokens,recipe,args.output,args.embedding_cache_dir)


def prepare_main():
    parser = argparse.ArgumentParser(description="Prepare immutable combined Science sources; tokenizer/check-only, never fitting.")
    for name in ("parent-root","parent-zip","augmentation-root","augmentation-zip","reviewed-head","output"):
        parser.add_argument("--"+name,required=True)
    args = parser.parse_args()
    result = prepare(args.parent_root,args.parent_zip,args.augmentation_root,args.augmentation_zip,args.reviewed_head,args.output,tokenizer)
    print(json.dumps(result,ensure_ascii=False,indent=2))


def train_main():
    parser = argparse.ArgumentParser(description="Check combined admission or run a separately approved bounded validation-only experiment.")
    parser.add_argument("--preparation",required=True)
    parser.add_argument("--check-only",action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--embedding-cache-dir")
    parser.add_argument("--max-length",type=int,default=512)
    parser.add_argument("--batch-size",type=int,default=2)
    parser.add_argument("--classifier-c-grid",type=float,nargs="+",default=[.01,.1])
    parser.add_argument("--aggregation-rules",choices=["max"],nargs="+",default=["max"])
    print(json.dumps(run_checked(parser.parse_args()),ensure_ascii=False,indent=2))

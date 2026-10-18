"""Separate, immutable admission for contrastive expansion 01 and its composite.

The parent loader is called unchanged. New authored rows are never represented
as descendants of the legacy v2.6 source partition. No model is loaded here.
"""
from __future__ import annotations

import copy
import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, replace
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

import numpy as np
from safetensors.numpy import load_file

from . import LABELS
from .dataset import ReleasedDataset, _parse_record, load_released_dataset
from .page_release import PageRecord, _validate_evidence
from .reviewed_release import (check_prompt, eligibility, load_package, member,
    read_json, require, rows, sha, token_check, validate_settings, verify_unchanged)
from .train import _note_pages
from .train_pages import validate_protocol

EXPANSION = "science-contrastive-expansion-01"
COMBINED = "science-reviewed-contrastive-combined-01"
PAGE_VERSION = "concepts-science-synthetic-2026-10-contrastive-expansion-01-pages"
NOTE_VERSION = "concepts-science-synthetic-2026-10-contrastive-expansion-01-notes"
REVIEWED_WEIGHTS = "d400a1faeaf79682f1095ea3ec6e0c4791b20c531285d6a5729822a5c0e82642"


def identity(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
        separators=(",", ":")).encode("utf-8")).hexdigest()


def unique(items, key, count, description):
    result = {x[key]: x for x in items}
    require(len(result) == len(items) == count, description + " duplicate/count mismatch")
    return result


def verify_augmentation(root, archive):
    root, archive = Path(root).resolve(), Path(archive).resolve()
    receipt_path = Path(str(archive) + ".receipt.json")
    receipt = read_json(receipt_path)
    require(receipt["expansionId"] == EXPANSION and sha(archive) == receipt["zipSha256"]
        and archive.stat().st_size == receipt["zipBytes"], "augmentation ZIP receipt mismatch")
    manifest_path = member(root, "manifest.json")
    require(sha(manifest_path) == receipt["manifestSha256"], "augmentation manifest receipt mismatch")
    manifest = read_json(manifest_path)
    require(manifest["expansionId"] == EXPANSION and manifest["soleAugmentationFitInput"] == "augmentation-training-views.jsonl"
        and manifest["synthetic"] is True and manifest["independentHumanCertified"] is False
        and all(manifest[k] is False for k in ("trainingPerformed", "validationOrTestModified", "testPredicted", "backendModified")),
        "augmentation identity/provenance mismatch")
    expected = set(manifest["files"]) | {"manifest.json"}
    require({p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()} == expected,
        "augmentation unpacked member coverage mismatch")
    fingerprints = {archive: receipt["zipSha256"], receipt_path: sha(receipt_path), manifest_path: receipt["manifestSha256"]}
    with ZipFile(archive) as z:
        names = z.namelist()
        require(len(names) == len(set(names)) == receipt["memberCount"] and z.testzip() is None,
            "augmentation ZIP duplicate/count/CRC failure")
        require(set(names) == {EXPANSION + "/" + n for n in expected}, "augmentation ZIP member coverage mismatch")
        for name in expected:
            path = member(root, name)
            payload = z.read(EXPANSION + "/" + name)
            require(path.read_bytes() == payload, "augmentation ZIP/unpacked bytes mismatch: " + name)
            if name != "manifest.json":
                e = manifest["files"][name]
                require(len(payload) == e["bytes"] and hashlib.sha256(payload).hexdigest() == e["sha256"],
                    "augmentation member hash mismatch: " + name)
                fingerprints[path] = e["sha256"]
    relative = PurePosixPath(receipt["zipPath"])
    require(not relative.is_absolute() and ".." not in relative.parts and len(relative.parts) >= 2, "unsafe augmentation receipt origin")
    origin = archive.parents[len(relative.parts) - 1]
    require(member(origin, receipt["zipPath"]) == archive, "augmentation receipt origin mismatch")
    for name, expected_hash in read_json(member(root, "protected-inputs.json"))["files"].items():
        path = member(origin, name)
        require(sha(path) == expected_hash, "augmentation protected source mismatch: " + name)
        fingerprints[path] = expected_hash
    return manifest, fingerprints, origin


def grouped_splits(records, family_links=()):
    """Preserve students, pairs, families and explicit translation/descendant links.

    New relationships require a new versioned grouping policy. Never infer split
    independence merely from differing family or language IDs.
    """
    groups = defaultdict(set)
    for r in records:
        for key in (("student", r["evaluationGroupId"]), ("pair", r["pagePairId"]),
                    ("family", r["contrastFamilyId"])):
            groups[key].add(r["preassignedSplit"])
    require(all(len(v) == 1 for v in groups.values()), "student/pair/family split leakage")
    families = {key[1]: next(iter(v)) for key, v in groups.items() if key[0] == "family"}
    for left, right in family_links:
        require(left in families and right in families and families[left] == families[right],
            "related translation/descendant family split leakage")


def validate_authored_rows(fit, sidecar, ledger, plan, profiles, families, authored, parent):
    require(len(fit) == sidecar["recordCount"] == 120, "augmentation view count mismatch")
    unique(fit, "recordId", 120, "augmentation row")
    by_pair = unique(ledger, "pagePairId", 60, "augmentation ledger")
    students = unique(profiles, "studentId", 12, "augmentation student")
    family_map = unique(families, "contrastFamilyId", 20, "augmentation family")
    require(set(family_map) == {f"aug01-family-{i:03d}" for i in range(1,21)}, "unexpected augmentation family IDs")
    targets = unique(plan["selectedConcepts"], "id", 10, "augmentation selected concept")
    require(not set(students) & set(parent.notes.groups), "augmentation student overlaps original train/validation/test")
    require(sidecar["datasetVersion"] == PAGE_VERSION and sidecar["parentFitSha256"] == parent.pages.sha256,
        "augmentation source version/parent fit mismatch")
    original_concepts = {r["concept"]["id"]: r for r in parent.page_rows}
    for target in targets.values():
        old = original_concepts.get(target["id"])
        require(old is not None and all(target[k] == old[k] for k in ("concept", "grade", "lessonId", "lessonName")),
            "augmentation concept definition changed from parent")
    for profile in profiles:
        require(profile["fictional"] is True and profile["preassignedSplit"] == "train"
            and profile["crossLanguageTranslationPair"] is False, "augmentation profile provenance/split mismatch")
    parsed, pairs = [], defaultdict(list)
    for number, r in enumerate(fit, 1):
        require(r["recordId"] == f"aug01-page-{number:05d}" and r["noteGroupId"] == f"aug01-note-{(number+1)//2:03d}"
            and r["textVariant"] == ("corrected" if number % 2 else "raw_ocr"), "unexpected augmentation row order/IDs")
        require("sourceTargetLabel" not in r and "sourceRelease" not in r, "new authored row fabricates legacy lineage")
        require(r["schemaVersion"] == "2.0.0" and r["datasetVersion"] == PAGE_VERSION
            and r["expansionId"] == EXPANSION and r["preassignedSplit"] == "train"
            and r["reviewStatus"] == "ai_semantic_page_reviewed" and r["trainingEligible"] is True,
            "augmentation admission/version/split mismatch")
        require(r["targetLabel"] in LABELS and r["textVariant"] in {"corrected", "raw_ocr"}
            and type(r["pageNumber"]) is int and r["pageNumber"] == 1, "augmentation class/page/variant mismatch")
        require(r["synthetic"] is True and r["independentHumanCertified"] is False
            and r["sourceKind"] == "new_synthetic_training_augmentation" and r["ocrSource"] == "simulated"
            and r["intendedLabelVisibleDuringReview"] is True and r["modelPredictionsUsed"] is False
            and r["labelQuality"] == "synthetic_authored_AI_self_review" and r["rawCorrectedChecked"] is True
            and r["essentialOcrEvidenceLoss"] is False and bool(r["reviewReason"].strip()), "augmentation review/OCR provenance mismatch")
        require(type(r["sampleWeight"]) in (float, int)
            and r["sampleWeight"] == (1.0 if r["targetLabel"] == "partial" else .5), "augmentation supplied weight mismatch")
        require(r["pagePairId"] == f'{r["noteGroupId"]}|{r["concept"]["id"]}|1'
            and hashlib.sha256(r["noteTextSnapshot"].encode()).hexdigest() == r["pageTextSha256"], "augmentation pair/text identity mismatch")
        target, profile, family = targets.get(r["concept"]["id"]), students.get(r["evaluationGroupId"]), family_map.get(r["contrastFamilyId"])
        require(target is not None and profile is not None and family is not None, "unexpected augmentation concept/student/family")
        require(all(r[k] == target[k] for k in ("concept", "grade", "lessonId", "lessonName")) and r["subject"] == "Science"
            and r["grade"] == profile["grade"] and r["language"] == profile["language"] == family["language"]
            and family["studentId"] == r["evaluationGroupId"] and family["conceptId"] == r["concept"]["id"]
            and family["preassignedSplit"] == "train" and family["correlatedVariants"] is True
            and family["mustRemainGroupedIfReused"] is True and r["noteGroupId"] in family["noteGroupIds"], "augmentation identity/concept join mismatch")
        require(r["authoredSourcePath"] == f'authored/{r["concept"]["id"]}.json', "augmentation authored source path mismatch")
        entries, source_hash = authored[r["concept"]["id"]]
        require(r["authoredSourceSha256"] == source_hash, "augmentation authored content hash mismatch")
        entry = entries[(r["language"], r["targetLabel"])]
        require(r["reviewReason"] == entry["reviewReason"], "augmentation authored reason changed")
        review = by_pair.get(r["pagePairId"])
        require(review is not None and review["decision"] == review["generationIntendedLabel"] == r["targetLabel"]
            and all(review[k] == r[k] for k in ("noteGroupId", "concept", "grade", "language", "pageNumber", "preassignedSplit", "contrastFamilyId", "reviewer", "reviewDate"))
            and review["studentId"] == r["evaluationGroupId"] and review["reason"] == r["reviewReason"]
            and review["fullCorrectedAndRawPageRead"] is True and review["intendedLabelsVisibleDuringReview"] is True
            and review["modelPredictionsUsed"] is False and review["synthetic"] is True
            and review["independentHumanCertified"] is False and review["studentScientificMistakesPreserved"] is True,
            "augmentation ledger decision/provenance mismatch")
        variants = unique(review["variants"], "recordId", 2, "augmentation ledger variant")
        v = variants.get(r["recordId"])
        require(v is not None and all(v[k] == r[k] for k in ("textVariant", "pageTextSha256", "evidenceQuotes", "essentialOcrEvidenceLoss")),
            "augmentation ledger evidence mismatch")
        require(r["evidenceReviewStatus"] == ("whole_page_absence_checked" if r["targetLabel"] == "missing" else "exact_quotes_checked"),
            "augmentation evidence review mismatch")
        _validate_evidence({"target_label":r["targetLabel"], "page_text":r["noteTextSnapshot"], "evidence_quotes":r["evidenceQuotes"],
            "evidence_review_status":r["evidenceReviewStatus"], "essential_ocr_evidence_loss":r["essentialOcrEvidenceLoss"]})
        expected_text = entry["text"]
        if r["textVariant"] == "raw_ocr":
            for edit in review["simulatedOcrEdits"]:
                require(edit["kind"] == "simulated heading character/word-boundary OCR error"
                    and edit["original"] == expected_text.split("\n", 1)[0] and "\n" not in edit["ocr"], "unexpected simulated OCR edit")
                expected_text = edit["ocr"] + expected_text[len(edit["original"]):]
        require(expected_text == r["noteTextSnapshot"] and len(expected_text.strip()) >= 400, "augmentation full authored text changed/empty")
        # Bind quotes to authored full paragraphs, not label-dependent cropped text.
        paragraphs = entry["text"].split("\n\n")
        expected_quotes = [paragraphs[i-1] for i in entry["evidenceParagraphs"]]
        require([q["quote"] for q in r["evidenceQuotes"]] == expected_quotes, "augmentation authored evidence mismatch")
        base = _parse_record(r, number, sidecar["datasetVersion"])
        require(base.note_text == r["noteTextSnapshot"], "augmentation parser changed full input text")
        check_prompt(base, parent.recipe["conceptPromptTemplate"])
        parsed.append(PageRecord(**asdict(base), page_pair_id=r["pagePairId"], page_number=1,
            text_variant=r["textVariant"], sample_weight=float(r["sampleWeight"])))
        pairs[r["pagePairId"]].append(r)
    require(set(pairs) == set(by_pair) and len(pairs) == 60, "augmentation ledger/pair coverage mismatch")
    for views in pairs.values():
        require(len(views) == 2 and {r["textVariant"] for r in views} == {"corrected", "raw_ocr"}
            and all(views[0][k] == views[1][k] for k in ("targetLabel", "evaluationGroupId", "contrastFamilyId", "concept", "sampleWeight")),
            "augmentation paired views disagree")
    for family in families:
        selected = [r for r in fit if r["contrastFamilyId"] == family["contrastFamilyId"] and r["textVariant"] == "corrected"]
        require(len(selected) == 3 and {r["targetLabel"] for r in selected} == set(LABELS)
            and set(family["noteGroupIds"]) == {r["noteGroupId"] for r in selected}, "augmentation family coverage mismatch")
    require(len({r.evaluation_group_id for r in parsed}) == 12 and len({r.concept_id for r in parsed}) == 10,
        "augmentation student/concept coverage mismatch")
    grouped_splits(fit)
    return tuple(parsed)


@dataclass
class Augmentation:
    root: Path
    manifest: dict
    pages: ReleasedDataset
    notes: ReleasedDataset
    page_rows: list
    families: list
    fingerprints: dict


def load_augmentation(root, archive, parent):
    root = Path(root).resolve()
    manifest, fingerprints, origin = verify_augmentation(root, archive)
    plan = read_json(member(root, "frozen-plan.json"))
    require(sha(member(root, "frozen-plan.json")) == manifest["sourcePlanSha256"] and plan["expansionId"] == EXPANSION
        and plan["parentPackage"] == parent.manifest["packageVersion"] and plan["parentFitSha256"] == parent.pages.sha256
        and all(plan[k] is False for k in ("selectionUsesValidationText", "selectionUsesTestText", "selectionUsesPerExamplePredictions", "trainingAuthorized", "testEvaluationAuthorized", "deploymentAuthorized")),
        "augmentation frozen plan/selection/parent mismatch")
    require(all(read_json(member(root, "rubric.json"))[k] == v for k,v in read_json(member(parent.root, "rubric.json")).items()),
        "augmentation inherited rubric changed")
    sidecars = {}
    for name, version, count, task in (("augmentation-training-views.jsonl", PAGE_VERSION, 120, "page_status"),
            ("augmentation-note-references.jsonl", NOTE_VERSION, 60, "note_reference")):
        s = read_json(member(root, name + ".manifest.json"))
        require(s["sha256"] == sha(member(root, name)) and s["recordCount"] == count and s["task"] == task
            and s["datasetVersion"] == version and s["schemaVersion"] == "2.0.0" and s["expansionId"] == EXPANSION
            and s["parentPackage"] == parent.manifest["packageVersion"] and s["parentFitSha256"] == parent.pages.sha256
            and s["requiresExpansionAwareTrainer"] is True and s["provenance"] == {"synthetic":True,
                "independentHumanReviewed":False,"ocrSource":"simulated","reviewType":"AI author/self-review"}, "augmentation canonical sidecar mismatch")
        sidecars[name] = s
    families = read_json(member(root, "contrast-families.json"))["families"]
    authored = {}
    for selected in plan["selectedConcepts"]:
        path = member(root, f'authored/{selected["id"]}.json')
        source = read_json(path)
        require(source["conceptId"] == selected["id"] and len(source["entries"]) == 6, "augmentation authored target mismatch")
        entries = {(e["language"],e["targetLabel"]):e for e in source["entries"]}
        require(set(entries) == {(lang,label) for lang in ("English","Sinhala") for label in LABELS}, "augmentation authored coverage mismatch")
        authored[selected["id"]] = (entries, sha(path))
        textbook = member(origin, "sources/extracted-text/" + selected["source"])
        require(sha(textbook) == selected["sourceSha256"], "augmentation textbook source changed")
        lines = textbook.read_text(encoding="utf-8").splitlines()
        start, end = selected["lineRange"]
        require("\n".join(lines[start-1:end]) == selected["sourceExcerpt"], "augmentation textbook scope excerpt mismatch")
        fingerprints[textbook] = selected["sourceSha256"]
    fit = rows(member(root, "augmentation-training-views.jsonl"))
    records = validate_authored_rows(fit, sidecars["augmentation-training-views.jsonl"], rows(member(root, "semantic-review-ledger.jsonl")),
        plan, read_json(member(root, "student-profiles.json"))["profiles"], families, authored, parent)
    pages = ReleasedDataset(member(root, "augmentation-training-views.jsonl"), PAGE_VERSION, sidecars["augmentation-training-views.jsonl"]["sha256"], records)
    notes = load_released_dataset(member(root, "augmentation-note-references.jsonl"))
    metadata = unique(rows(member(root, "note-metadata.jsonl")), "note_group_id", 60, "augmentation note metadata")
    corrected = {r["noteGroupId"]:r for r in fit if r["textVariant"] == "corrected"}
    require(len(corrected) == 60 and set(corrected) == set(metadata) == set(notes.note_groups), "augmentation note coverage mismatch")
    for number, (note, row) in enumerate(zip(notes.records, rows(notes.path), strict=True),1):
        require(note.record_id == f"aug01-ref-{number:03d}" and note.note_group_id == f"aug01-note-{number:03d}", "unexpected augmentation note reference IDs/order")
        r, meta = corrected[note.note_group_id], metadata[note.note_group_id]
        require(all(row[k] == r[k] for k in ("noteGroupId", "evaluationGroupId", "preassignedSplit", "concept", "grade", "language", "lessonId", "lessonName", "subject", "targetLabel", "contrastFamilyId", "expansionId", "labelQuality", "synthetic", "independentHumanCertified"))
            and note.note_text == "--- Page 1 ---\n" + r["noteTextSnapshot"], "augmentation parent-note reference changed")
        directory = f'students/{note.evaluation_group_id}/{note.note_group_id}'
        require(meta["notes_directory"] == directory and meta["page_count"] == 1 and meta["synthetic"] is True
            and meta["human_reviewed"] is False and meta["preassigned_split"] == "train"
            and meta["student_id"] == note.evaluation_group_id and meta["contrast_family_id"] == r["contrastFamilyId"]
            and meta["grade"] == note.grade and meta["language"] == note.language and meta["lesson_name"] == note.lesson_name,
            "augmentation note metadata mismatch")
        for v in [x for x in fit if x["noteGroupId"] == note.note_group_id]:
            filename = "corrected-text.txt" if v["textVariant"] == "corrected" else "raw-ocr.txt"
            text = member(root, directory + "/" + filename).read_text(encoding="utf-8").strip()
            require(text == "--- Page 1 ---\n" + v["noteTextSnapshot"], "augmentation student TXT input changed")
    preview = member(root, "REVIEW-PREVIEW.md").read_text(encoding="utf-8").split("\n## ")[1:]
    require(len(preview) == 60, "augmentation preview count mismatch")
    for block in preview:
        r = corrected[block.split(" — ",1)[0]]
        require(r["noteTextSnapshot"] in block and r["reviewReason"] in block, "augmentation preview/source mismatch")
    hashes = [r["pageTextSha256"] for r in corrected.values()]
    require(len(set(hashes)) == 60 and not set(hashes) & {r["pageTextSha256"] for r in parent.page_rows}, "augmentation duplicate parent/own page")
    # Exact hashes only; no held-out tokenization, scoring or label use.
    original_hashes = {hashlib.sha256(text.encode()).hexdigest() for r in parent.notes.records for text in _note_pages(r.note_text)}
    require(not set(hashes) & original_hashes, "augmentation exact original-note page collision")
    audit = read_json(member(root, "duplicate-audit.json"))
    require(all(audit[k] == [] for k in ("duplicateCorrectedPagesWithinExpansion", "exactParentTrainPageMatches", "crossSplitExactTextMatches"))
        and audit["nearDuplicateIndependenceGuaranteed"] is False and audit["familiesDeclaredCorrelated"] is True, "augmentation duplicate audit mismatch")
    inventory = read_json(member(root, "training-only-coverage-inventory.json"))
    counts = defaultdict(Counter)
    for r in parent.page_rows:
        if r["textVariant"] == "corrected": counts[r["concept"]["id"]][r["targetLabel"]] += 1
    require(inventory["parentFitSha256"] == parent.pages.sha256 and inventory["conceptCount"] == len(counts) == 153
        and inventory["allThreeClasses"] == sum(set(c) == set(LABELS) for c in counts.values()) == 16
        and inventory["withoutPartial"] == sum("partial" not in c for c in counts.values()) == 73
        and inventory["withoutPresent"] == sum("present" not in c for c in counts.values()) == 60, "augmentation training-only coverage totals mismatch")
    require({r["conceptId"]:r["classCountsPairs"] for r in inventory["concepts"]} == dict(counts), "augmentation training-only inventory changed")
    unique(inventory["concepts"], "conceptId", 153, "augmentation training-only inventory")
    for target in plan["selectedConcepts"]:
        require(target["existingTrainingClassCounts"] == counts[target["id"]]
            and set(counts[target["id"]]) != set(LABELS), "augmentation target selection is not a training-only class gap")
    require(Counter(r["targetLabel"] for r in corrected.values()) == manifest["classCountsPairs"] == {label:20 for label in LABELS}
        and sum(v[0]["noteTextSnapshot"] != v[1]["noteTextSnapshot"] for v in _pair_rows(fit).values()) == manifest["ocrDifferentPairs"] == 36,
        "augmentation class/OCR count mismatch")
    require(all(manifest[key] == value for key,value in {"pairs":60,"views":120,"concepts":10,"families":20,
        "fictionalStudents":12,"conceptPageExcerpts":60,"completeLessonNotesAdded":0}.items())
        and manifest["weightedTotals"] == {"present":20,"partial":40,"missing":20} and manifest["totalWeight"] == 80,
        "augmentation manifest count/weight mismatch")
    return Augmentation(root, manifest, pages, notes, fit, families, fingerprints)


def _pair_rows(records):
    pairs = defaultdict(list)
    for r in records: pairs[r["pagePairId"]].append(r)
    return pairs


def verify_reviewed_head(directory, parent):
    directory = Path(directory).resolve()
    files = [directory/"classifier.safetensors", directory/"metadata.json", directory/"evaluation.json",
        directory.parent/"evaluation.json", directory.parent/"frozen-run-protocol.json"]
    fingerprints = {p:sha(p) for p in files}
    meta, run, frozen = read_json(files[1]), read_json(files[3]), read_json(files[4])
    require(fingerprints[files[0]] == meta["weightsSha256"] == REVIEWED_WEIGHTS and meta["classifierC"] == run["selectedClassifierC"] == .01
        and meta["pageDatasetSha256"] == parent.pages.sha256 and meta["noteReferenceSha256"] == parent.notes.sha256
        and meta["labels"] == list(LABELS) and meta["featureDimension"] == 768 and meta["encodingRecipe"] == parent.recipe
        and meta["fitStudents"] == list(parent.pages.groups) and meta["evaluationProtocolSha256"] == sha(parent.root/"evaluation-protocol.json")
        and meta["enabledByDefault"] is False and meta["stage6Compatible"] is False and meta["testEvaluated"] is False
        and meta["synthetic"] is True and meta["independentHumanCertified"] is False
        and all(run[k] is False for k in ("testEmbedded", "testPredicted", "testScored", "deployed"))
        and frozen["protocol"] == parent.protocol, "release-01 selected comparator identity mismatch")
    candidate = next(c for c in run["candidates"] if c["classifierC"] == .01)
    require(read_json(files[2]) == candidate and candidate["weightsSha256"] == REVIEWED_WEIGHTS
        and meta["aggregation"] == candidate["evaluation"]["aggregation"] == {"rule":"max", "presentThreshold":.35,"partialThreshold":.8},
        "release-01 selected comparator thresholds/evaluation mismatch")
    tensors = load_file(str(files[0]))
    require({k:v.shape for k,v in tensors.items()} == {"classifier.weight":(3,768),"classifier.bias":(3,),"scaler.mean":(768,),"scaler.scale":(768,)}
        and all(v.dtype == np.float32 and np.isfinite(v).all() for v in tensors.values())
        and np.all(tensors["scaler.scale"] > 0), "release-01 comparator tensors invalid")
    return {"baselineId":"reviewed-release-01-selected-C-0.01", "externalDirectory":str(directory),
        "weightsSha256":REVIEWED_WEIGHTS, "aggregation":meta["aggregation"], "classOrder":list(LABELS),
        "fileHashes":{str(p):h for p,h in fingerprints.items()}}, fingerprints


def frozen_protocol(parent, comparator):
    p = copy.deepcopy(parent.protocol)
    p.update(protocolId=COMBINED+"-validation-only", fitInput="sources.json", noteReferences="sources.json")
    p["scopePolicy"]["expectedWholeNoteDenominators"]["train_optional"] = 620
    p["boundedTrainingExperiment"]["knownWeightedClassTotals"] = {"present":116,"partial":246,"missing":181}
    p["baselines"]["reviewedRelease01Selected"] = comparator
    p["advancementGate"] = {"comparatorIds":[parent.baseline["baselineId"], comparator["baselineId"]],
        "requirements":["whole-note validation macro-F1 strictly improves over BOTH fixed models",
            "corrected-page validation macro-F1 does not worsen relative to EITHER fixed model",
            "corrected-page missing recall does not worsen relative to EITHER fixed model"],
        "gatePassPermits":"A later explicitly approved exploratory test, never deployment",
        "gateFailure":"Stop without further fitting or test predictions"}
    p["groupingPolicy"] = "grouping-policy.json"
    p["limitations"] += ["New 60 examples are correlated synthetic concept-page excerpts, not complete lessons or real handwriting.",
        "Intended labels were visible to the AI author/self-reviewer; simulated OCR primarily changes headings.",
        "Exact-hash collision checks do not establish semantic/template independence."]
    return p


def grouping_policy(augmentation):
    # Conservative cross-language binding for each selected target, in addition
    # to unchanged student and family identities. Future descendants must add
    # edges in a separately versioned policy; this release admits no extra rows.
    by_concept = defaultdict(list)
    for family in augmentation.families: by_concept[family["conceptId"]].append(family["contrastFamilyId"])
    links = [sorted(v) for _,v in sorted(by_concept.items())]
    require(all(len(v) == 2 for v in links), "cross-language family grouping mismatch")
    grouped_splits(augmentation.page_rows, links)
    return {"policyVersion":COMBINED+"-grouping-01", "allAugmentationTrainOnly":True,
        "identityFields":["evaluationGroupId","pagePairId","contrastFamilyId"], "familyLinks":links,
        "linksReason":"Conservatively group same-target English/Sinhala controlled families; no independence claim.",
        "futureDescendants":"Require an explicit source-family edge and a new immutable release before splitting; reject undeclared rows."}


def lineage(records, role, source):
    return [{"recordId":r.record_id,"sourceRole":role,"sourcePath":str(source.path),
        "sourceSha256":source.sha256,"sourceDatasetVersion":r.dataset_version} for r in records]


def combine(parent, augmentation, root, protocol, fingerprints):
    require(not set(r.record_id for r in parent.pages.records) & {r.record_id for r in augmentation.pages.records}
        and not set(parent.notes.note_groups) & set(augmentation.notes.note_groups)
        and not set(r.record_id for r in parent.notes.records) & {r.record_id for r in augmentation.notes.records}, "composite source identity collision")
    page_records, note_records = parent.pages.records + augmentation.pages.records, parent.notes.records + augmentation.notes.records
    page_identity = lineage(parent.pages.records,"parent",parent.pages) + lineage(augmentation.pages.records,"augmentation",augmentation.pages)
    note_identity = lineage(parent.notes.records,"parent",parent.notes) + lineage(augmentation.notes.records,"augmentation",augmentation.notes)
    pages = ReleasedDataset(root/"fit-lineage.jsonl",COMBINED+"-pages",identity(page_identity),page_records)
    notes = ReleasedDataset(root/"note-reference-lineage.jsonl",COMBINED+"-notes",identity(note_identity),note_records)
    coverage = validate_protocol(pages,notes)
    masks = {s:eligibility([r for r in notes.records if r.preassigned_split == s],protocol,s) for s in ("train","validation","test")}
    totals = {label:sum(r.sample_weight for r in pages.records if r.target_label == label) for label in LABELS}
    counts = Counter(r.target_label for r in pages.records if r.text_variant == "corrected")
    require(len(pages.records) == 840 and len(pages.note_groups) == 80 and len(pages.groups) == 20
        and len({r.concept_id for r in pages.records}) == 153 and len(notes.records) == 872
        and counts == {"present":116,"partial":123,"missing":181}
        and totals == protocol["boundedTrainingExperiment"]["knownWeightedClassTotals"] == {"present":116,"partial":246,"missing":181}, "composite count/weight mismatch")
    require(tuple(r for r in notes.records if r.preassigned_split != "train") == tuple(r for r in parent.notes.records if r.preassigned_split != "train"),
        "composite held-out references changed")
    summary = {"packageVersion":COMBINED,"trainingViews":840,"trainingPairs":420,"trainingConcepts":153,
        "activeTrainingNoteIds":80,"fittingStudents":20,"noteReferences":872,"pairLabels":dict(counts),
        "weightedClassTotals":totals,"totalWeight":543,"wholeNoteDenominators":{s:len(m) for s,m in masks.items()},
        "correctedValidationPairs":40,"rawSecondaryViews":40,"augmentationFamilies":20,
        "augmentationPages":60,"completeLessonNotesAdded":0,"mixedVersionsPreserved":True,
        "sourceDatasetVersions":{"fit":[parent.pages.version,augmentation.pages.version],"notes":[parent.notes.version,augmentation.notes.version]},
        "parentAdmission":parent.summary,"coverage":coverage,"synthetic":True,"independentHumanCertified":False}
    package = replace(parent,root=root,manifest={"candidateId":COMBINED,"packageVersion":COMBINED},protocol=protocol,
        pages=pages,notes=notes,page_rows=parent.page_rows+augmentation.page_rows,fingerprints=fingerprints,summary=summary)
    return package, page_identity, note_identity


def token_checks(parent, augmentation, tokenizer):
    inherited = token_check(parent, tokenizer)
    audit = read_json(augmentation.root/"tokenizer-audit.json")
    expected = unique(audit["entries"],"recordId",120,"augmentation token audit")
    lengths = []
    for record, row in zip(augmentation.pages.records, augmentation.page_rows, strict=True):
        encoded = tokenizer(record.concept_prompt,record.note_text,truncation="only_second",max_length=512,return_offsets_mapping=True)
        length = len(tokenizer(record.concept_prompt,record.note_text,truncation=False)["input_ids"])
        end = max(b for (a,b), sequence in zip(encoded["offset_mapping"],encoded.sequence_ids(),strict=True) if sequence == 1)
        require(length <= 512 and expected[record.record_id] == {"recordId":record.record_id,"jointTokens":length,"fits512":True}
            and all(q["end_char_exclusive"] <= end for q in row["evidenceQuotes"]), "augmentation tokenizer/evidence retention mismatch")
        lengths.append(length)
    require(audit["encoderRevision"] == parent.recipe["encoderRevision"] and audit["views"] == 120
        and audit["maximumJointTokens"] == max(lengths) == 325 and audit["overLengthViews"] == 0
        and audit["trainingPerformed"] is False and audit["heldOutTextTokenized"] is False, "augmentation token totals/recipe mismatch")
    return {"parent":inherited,"augmentationViews":120,"maxAugmentationJointTokens":max(lengths),
        "augmentationOverLengthViews":0,"augmentationClippedEvidenceViews":0,"testTextTokenized":False}


def write_json(path, value):
    with path.open("x",encoding="utf-8",newline="\n") as stream:
        stream.write(json.dumps(value,ensure_ascii=False,indent=2)+"\n")


def prepare(parent_root, parent_zip, augmentation_root, augmentation_zip, reviewed_head, output, tokenizer_loader):
    output = Path(output).resolve()
    receipt_path = Path(str(output)+".receipt.json")
    require(not output.exists() and not receipt_path.exists(), "preparation output/receipt must be fresh")
    parent_root = Path(parent_root).resolve()
    parent = load_package(parent_root/"evaluation-protocol.json",parent_zip,parent_root/"reviewed-training-views.jsonl",parent_root/"evaluation/note-references.jsonl")
    augmentation = load_augmentation(augmentation_root,augmentation_zip,parent)
    require(not output.is_relative_to(parent.root) and not output.is_relative_to(augmentation.root), "preparation must be outside immutable sources")
    comparator, head_fingerprints = verify_reviewed_head(reviewed_head,parent)
    protocol = frozen_protocol(parent,comparator)
    validate_settings(protocol,parent.recipe)
    fingerprints = {**parent.fingerprints,**augmentation.fingerprints,**head_fingerprints}
    package, fit_index, note_index = combine(parent,augmentation,output,protocol,fingerprints)
    truncation = token_checks(parent,augmentation,tokenizer_loader(parent.recipe["localSnapshot"]))
    verify_unchanged(package)
    sources = {"schemaVersion":"1.0.0","packageVersion":COMBINED,
        "parent":{"root":str(parent.root),"zip":str(Path(parent_zip).resolve()),"zipSha256":sha(Path(parent_zip))},
        "augmentation":{"root":str(augmentation.root),"zip":str(Path(augmentation_zip).resolve()),"zipSha256":sha(Path(augmentation_zip))},
        "reviewedHead":comparator,"versions":package.summary["sourceDatasetVersions"],
        "fitSources":[{"path":str(d.path),"sha256":d.sha256,"datasetVersion":d.version,"recordCount":len(d.records)} for d in (parent.pages,augmentation.pages)],
        "noteSources":[{"path":str(d.path),"sha256":d.sha256,"datasetVersion":d.version,"recordCount":len(d.records)} for d in (parent.notes,augmentation.notes)]}
    output.mkdir(parents=True)
    write_json(output/"sources.json",sources)
    write_json(output/"evaluation-protocol.json",protocol)
    write_json(output/"grouping-policy.json",grouping_policy(augmentation))
    for name, index in (("fit-lineage.jsonl",fit_index),("note-reference-lineage.jsonl",note_index)):
        with (output/name).open("x",encoding="utf-8",newline="\n") as stream:
            for row in index: stream.write(json.dumps(row,ensure_ascii=False,separators=(",",":"))+"\n")
    for source in [*(parent.root/"evaluation").iterdir(),*(parent.root/n for n in ("encoding-recipe.json","scope-policy.json","rubric.json"))]:
        destination = output/source.relative_to(parent.root)
        destination.parent.mkdir(parents=True,exist_ok=True)
        with destination.open("xb") as stream: stream.write(source.read_bytes())
    write_json(output/"check-only.json",{"result":"PASS",**package.summary,"truncation":truncation,
        "trainingStarted":False,"encoderLoaded":False,"validationPredicted":False,"testEmbedded":False,"testPredicted":False,"testScored":False,"deployed":False})
    files = {p.relative_to(output).as_posix():{"sha256":sha(p),"bytes":p.stat().st_size} for p in output.rglob("*") if p.is_file()}
    write_json(output/"manifest.json",{"packageVersion":COMBINED,"admissionVersion":"contrastive-composite-01",
        "status":"prepared_check_only_no_training","fitMode":"immutable_multi_snapshot","summary":package.summary,
        "files":files,"enabledByDefault":False,"trainingAuthorizedByPackage":False,"testEvaluationAuthorized":False,"deploymentEnabled":False})
    write_json(receipt_path,{"packageVersion":COMBINED,"manifestSha256":sha(output/"manifest.json"),"memberCount":len(files)+1})
    verify_unchanged(package)
    return {"preparation":str(output),"result":"PASS",**package.summary,"truncation":truncation,"trainingStarted":False}


def load_preparation(root):
    root = Path(root).resolve()
    receipt_path = Path(str(root)+".receipt.json")
    receipt, manifest = read_json(receipt_path), read_json(root/"manifest.json")
    require(receipt["packageVersion"] == manifest["packageVersion"] == COMBINED and sha(root/"manifest.json") == receipt["manifestSha256"]
        and manifest["fitMode"] == "immutable_multi_snapshot" and manifest["admissionVersion"] == "contrastive-composite-01"
        and manifest["status"] == "prepared_check_only_no_training" and manifest["enabledByDefault"] is False
        and manifest["trainingAuthorizedByPackage"] is False and manifest["testEvaluationAuthorized"] is False and manifest["deploymentEnabled"] is False,
        "composite receipt/identity/execution boundary mismatch")
    expected = set(manifest["files"])|{"manifest.json"}
    require(len(expected) == receipt["memberCount"] and {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()} == expected,
        "composite member coverage mismatch")
    fingerprints = {receipt_path:sha(receipt_path),root/"manifest.json":receipt["manifestSha256"]}
    for name, e in manifest["files"].items():
        p = member(root,name)
        require(sha(p) == e["sha256"] and p.stat().st_size == e["bytes"], "composite artifact tampered: " + name)
        fingerprints[p] = e["sha256"]
    source = read_json(root/"sources.json")
    require(source["schemaVersion"] == "1.0.0" and source["packageVersion"] == COMBINED, "unsupported composite source schema")
    for definition in (source["parent"],source["augmentation"]):
        require(sha(Path(definition["zip"])) == definition["zipSha256"], "composite source ZIP identity changed")
    p = Path(source["parent"]["root"])
    parent = load_package(p/"evaluation-protocol.json",source["parent"]["zip"],p/"reviewed-training-views.jsonl",p/"evaluation/note-references.jsonl")
    augmentation = load_augmentation(source["augmentation"]["root"],source["augmentation"]["zip"],parent)
    comparator, hashes = verify_reviewed_head(source["reviewedHead"]["externalDirectory"],parent)
    require(comparator == source["reviewedHead"], "composite comparator identity changed")
    protocol = read_json(root/"evaluation-protocol.json")
    require(protocol == frozen_protocol(parent,comparator), "composite frozen protocol changed")
    validate_settings(protocol,parent.recipe)
    require(read_json(root/"grouping-policy.json") == grouping_policy(augmentation), "composite grouping policy changed")
    package, fit_index, note_index = combine(parent,augmentation,root,protocol,{**parent.fingerprints,**augmentation.fingerprints,**hashes,**fingerprints})
    require(manifest["summary"] == package.summary and source["versions"] == package.summary["sourceDatasetVersions"]
        and rows(root/"fit-lineage.jsonl") == fit_index and rows(root/"note-reference-lineage.jsonl") == note_index, "composite source lineage/version map changed")
    for name, datasets in (("fitSources",(parent.pages,augmentation.pages)),("noteSources",(parent.notes,augmentation.notes))):
        require(source[name] == [{"path":str(d.path),"sha256":d.sha256,"datasetVersion":d.version,"recordCount":len(d.records)} for d in datasets],
            "composite immutable source mapping changed")
    for source_file in [*(parent.root/"evaluation").iterdir(),*(parent.root/n for n in ("encoding-recipe.json","scope-policy.json","rubric.json"))]:
        require((root/source_file.relative_to(parent.root)).read_bytes() == source_file.read_bytes(), "composite frozen evaluation/recipe copy changed")
    return package, parent, augmentation, comparator

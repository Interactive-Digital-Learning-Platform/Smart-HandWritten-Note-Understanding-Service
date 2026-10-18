"""Focused compatibility tests: synthetic fixtures and spies, no model fitting."""
from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

import numpy as np
import pytest
from safetensors.numpy import load, save

from smart_note_training import LABELS
from smart_note_training.dataset import ReleasedDataset, _parse_record
from smart_note_training.reviewed_release import eligibility, validate_fit_rows, verify_package, retained_anchors, check_prompt
from smart_note_training import reviewed_experiment as experiment
from smart_note_training.train_pages import calibrate_thresholds, export_classifier_weights, fit_page_classifier


def base_row(i=0, label="present", concept="concept-a", split="train", student="student-a"):
    text = "Evidence for this synthetic unit-test concept."
    return {"schemaVersion":"2.0.0", "datasetVersion":"unit-pages", "recordId":f"row-{i}",
            "noteGroupId":f"note-{i % 20}", "evaluationGroupId":student, "preassignedSplit":split,
            "subject":"Science", "grade":10, "lessonId":"unit", "lessonName":"Unit lesson", "language":"English",
            "noteTextSnapshot":text, "targetLabel":label, "concept":{"id":concept,"name":"Unit concept",
            "category":"definition","keywords":["unit"],"learningOutcomes":[],"weight":3},
            "pageNumber":i//153+1, "textVariant":"corrected", "sampleWeight":1. if label == "partial" else .5,
            "pageTextSha256":hashlib.sha256(text.encode()).hexdigest(), "reviewStatus":"ai_semantic_page_reviewed",
            "trainingEligible":True, "candidateId":"training-candidate-01", "independentHumanCertified":False,
            "rawCorrectedChecked":True, "essentialOcrEvidenceLoss":False, "reviewReason":"Full page reviewed; unit rationale.",
            "evidenceReviewStatus":"whole_page_absence_checked" if label == "missing" else "exact_quotes_checked",
            "evidenceQuotes":[] if label == "missing" else [{"quote":"Evidence","start_char":0,"end_char_exclusive":8}],
            "sourceTargetLabel":label}


@pytest.fixture
def admission():
    fit, excluded, source, ledger = [], [], [], []
    for i in range(416):
        label = "present" if i < 96 else "partial" if i < 199 else "missing"
        concept = "sci-g10-som-009" if i in (360,361) else f"concept-{i % 153}"
        pair = []
        for variant in ("corrected","raw_ocr"):
            row = base_row(i,label,concept,student=f"student-{(i % 20) % 8}")
            row.update(recordId=f"row-{i}-{variant}",textVariant=variant,
                       pagePairId=f'{row["noteGroupId"]}|{concept}|{row["pageNumber"]}')
            original = deepcopy(row)
            original.update(reviewStatus="ai_page_reviewed")
            source.append(original)
            pair.append(row)
            if i < 360:
                fit.append(row)
            else:
                row.update(trainingEligible=False, candidateExclusionReason="curriculum_scope_conflict_entire_concept" if i < 362 else "legacy_evidence_or_OCR_admission_failure")
                excluded.append(row)
        if i < 362:
            row = pair[0]
            ledger.append({"pagePairId":row["pagePairId"],"decision":label,"originalLabel":label,
                           "studentId":row["evaluationGroupId"],"noteGroupId":row["noteGroupId"],"concept":row["concept"],
                           "preassignedSplit":"train","reason":row["reviewReason"],"synthetic":True,
                           "independentHumanCertified":False,"modelPredictionsUsed":False,"fullCorrectedAndRawPageRead":True,
                           "variants":[{k:r[k] for k in ("recordId","textVariant","pageTextSha256","evidenceQuotes","essentialOcrEvidenceLoss")} for r in pair]})
    sidecar = {"datasetVersion":"unit-pages","recordCount":720}
    manifest = {"fitViews":720,"fitPairs":360,"fitConcepts":153,"fitNotes":20,"fitStudents":8,
                "candidateId":"training-candidate-01","classCountsPairs":{"present":96,"partial":103,"missing":161}}
    return fit, excluded, ledger, source, sidecar, manifest


def test_semantic_status_is_preserved_after_admission(admission):
    fit, _, _, _, _, _ = admission
    records = validate_fit_rows(*admission)
    assert len(records) == 720 and fit[0]["reviewStatus"] == "ai_semantic_page_reviewed"
    assert sum(r.sample_weight for r in records) == 463


@pytest.mark.parametrize("field,value", [
    ("reviewStatus","ai_page_reviewed"), ("trainingEligible",False), ("rawCorrectedChecked",False),
    ("essentialOcrEvidenceLoss",True), ("independentHumanCertified",True), ("candidateId","unexpected"),
    ("preassignedSplit","test"), ("evaluationGroupId","held-out-student"), ("sampleWeight",1.),
    ("noteTextSnapshot","tampered"), ("pagePairId","wrong-pair"), ("sourceTargetLabel","missing"),
])
def test_semantic_admission_rejects_bad_rows(admission,field,value):
    admission[0][0][field] = value
    with pytest.raises(ValueError):
        validate_fit_rows(*admission)


def test_duplicate_view_rejected(admission):
    admission[0][1] = deepcopy(admission[0][0])
    with pytest.raises(ValueError,match="partition"):
        validate_fit_rows(*admission)


@pytest.mark.parametrize("field,value", [("decision","missing"),("reason","changed"),("modelPredictionsUsed",True),
                                         ("fullCorrectedAndRawPageRead",False)])
def test_ledger_tampering_rejected(admission,field,value):
    admission[2][0][field] = value
    with pytest.raises(ValueError,match="ledger"):
        validate_fit_rows(*admission)


def test_quote_offset_tampering_rejected(admission):
    admission[0][0]["evidenceQuotes"][0]["end_char_exclusive"] = 9
    with pytest.raises(ValueError,match="quote"):
        validate_fit_rows(*admission)


@pytest.fixture
def zip_fixture(tmp_path):
    root = tmp_path/"unpacked"/"science-reviewed-training-release-01"
    root.mkdir(parents=True)
    file = root/"reviewed-training-views.jsonl"
    file.write_bytes(b'{"unit":"only integrity is tested here"}\n')
    manifest = {"packageVersion":root.name,"soleFitInput":file.name,"candidateId":"training-candidate-01",
                "synthetic":True,"independentHumanCertified":False,"trainingStarted":False,"deployed":False,
                "files":{file.name:{"sha256":hashlib.sha256(file.read_bytes()).hexdigest(),"bytes":file.stat().st_size}}}
    manifest_path = root/"package-manifest.json"
    manifest_path.write_text(json.dumps(manifest),encoding="utf-8")
    archive = tmp_path/"data"/"science"/(root.name+".zip")
    archive.parent.mkdir(parents=True)
    with ZipFile(archive,"w") as z:
        for path in root.iterdir():
            z.write(path,root.name+"/"+path.name)
    receipt = {"packageVersion":root.name,"zipPath":"data/science/"+archive.name,
               "zipSha256":hashlib.sha256(archive.read_bytes()).hexdigest(),"zipBytes":archive.stat().st_size,
               "packageManifestSha256":hashlib.sha256(manifest_path.read_bytes()).hexdigest(),"memberCount":2}
    Path(str(archive)+".receipt.json").write_text(json.dumps(receipt),encoding="utf-8")
    return root,archive


def test_manifest_self_hash_is_anchored_in_external_receipt(zip_fixture):
    manifest, fingerprints, _ = verify_package(*zip_fixture)
    assert "package-manifest.json" not in manifest["files"]
    assert zip_fixture[0]/"package-manifest.json" in fingerprints


@pytest.mark.parametrize("target", ["member","manifest","zip","extra"])
def test_package_tampering_rejected(zip_fixture,target):
    root,archive = zip_fixture
    path = {"member":root/"reviewed-training-views.jsonl","manifest":root/"package-manifest.json",
            "zip":archive,"extra":root/"unhashed.txt"}[target]
    path.write_bytes(b"tampered")
    with pytest.raises(ValueError):
        verify_package(root,archive)


def record(i,label="present",concept="supported",split="validation"):
    row = base_row(i,label,concept,split=split,student="held-out" if split == "validation" else "fit-student")
    row["recordId"] = str(i)
    return _parse_record(row,1,"unit-pages")


@pytest.fixture
def scoring():
    train = [record(0,split="train"),record(1,"partial",split="train")]
    train = [replace(r,record_id="train-"+r.record_id) for r in train]
    train += [replace(record(i,"missing","excluded","train"),record_id=f"excluded-train-{i}") for i in (2,3,4)]
    validation = [record(10),record(11,"partial"),record(12,"missing","excluded"),record(13,"missing","unsupervised")]
    corrected = [validation[i] for i in (0,1,3)]
    raw = [replace(r,record_id=r.record_id+":raw_ocr") for r in corrected]
    protocol = {"scopePolicy":{"excludedConceptIds":["excluded"],"excludedRecordIds":{
        "train":[r.record_id for r in train[2:]],"validation":["12"],"test":[]},
        "expectedWholeNoteDenominators":{"train_optional":2,"validation":3,"future_test_not_scored_now":0}},
        "boundedTrainingExperiment":{"classifierCGrid":[.01,.1]}}
    package = SimpleNamespace(protocol=protocol, notes=ReleasedDataset(Path("notes"),"unit","source",tuple(train+validation)),
                              pages=SimpleNamespace(records=[SimpleNamespace(target_label="partial",sample_weight=2.,concept_id="supported")]),
                              corrected=corrected,raw=raw)
    return package,np.array([[.9,.05,.05],[.05,.9,.05],[.9,.05,.05],[.05,.05,.9]])


def test_one_scope_mask_drives_primary_slices_and_baselines(scoring):
    package,probs = scoring
    scores = experiment.evaluate(package,probs,probs[[0,1,3]],probs[[0,1,3]],(.5,.5))
    assert scores["wholeNote"]["allReferences"]["sampleCount"] == 3
    assert scores["wholeNote"]["excludedRecordIds"] == ["12"]
    assert scores["wholeNote"]["hasTrainingPageSupervision"]["no"]["sampleCount"] == 1
    for dimension in ("language","grade","hasTrainingPageSupervision"):
        assert sum(s["sampleCount"] for s in scores["wholeNote"][dimension].values()) == 3
    for baseline in ("trainingDerivedMajority","alwaysPresent"):
        assert scores["baselines"]["wholeNote"][baseline]["eligibleRecordIds"] == scores["wholeNote"]["eligibleRecordIds"]
    assert experiment.majority_labels(package) == (1,0)  # Excluded TRAIN targets cannot choose the baseline.


def test_scope_mask_calibration_is_independent_of_excluded_target(scoring):
    package,probs = scoring
    records = [r for r in package.notes.records if r.preassigned_split == "validation"]
    mask = eligibility(records,package.protocol,"validation")
    assert calibrate_thresholds(probs,[0,1,2,3],[0,1,0,2],mask) == calibrate_thresholds(probs,[0,1,2,3],[0,1,2,2],mask)


def test_corrected_and_raw_are_separate_evaluation_units(scoring):
    package,probs = scoring
    corrected = probs[[0,1,3]]
    raw = np.array([[.1,.8,.1],[.1,.8,.1],[.1,.1,.8]])
    result = experiment.evaluate(package,probs,corrected,raw,(.5,.5))
    assert result["correctedPagePrimary"]["allReferences"]["accuracy"] == 1
    assert result["rawPageSecondary"]["allReferences"]["sampleCount"] == 3
    assert result["rawPageSecondary"]["allReferences"]["accuracy"] < 1


def test_weights_reach_scaler_and_classifier_without_fitting(monkeypatch):
    import smart_note_training.train_pages as module
    x,y,weights = np.zeros((3,2)),np.array([0,1,2]),np.array([.5,1.,.5])
    seen = []
    class Scaler:
        def fit(self,features,sample_weight):
            seen.append(("scaler",features is x,sample_weight is weights));return self
        def transform(self,features):return features
    class Head:
        def fit(self,features,targets,sample_weight):
            seen.append(("head",targets is y,sample_weight is weights));return self
    monkeypatch.setattr(module,"StandardScaler",Scaler)
    monkeypatch.setattr(module,"_new_classifier",lambda c,w:(seen.append(("settings",c,w)),Head())[1])
    fit_page_classifier(x,y,weights,.1)
    assert seen == [("scaler",True,True),("settings",.1,None),("head",True,True)]


def test_review_fields_and_labels_do_not_enter_features_or_input_cache_key():
    r = record(1)
    changed = replace(r,target_label="missing",preassigned_split="test",evaluation_group_id="different",note_group_id="different")
    assert changed.concept_prompt == r.concept_prompt
    assert experiment.cache_key([r],"source",{"dtype":"float16"}) == experiment.cache_key([changed],"source",{"dtype":"float16"})


def test_cache_binds_recipe_source_ids_order_and_text():
    records = [record(1),record(2)]
    key = experiment.cache_key(records,"source",{"dtype":"float16","encoder":"revision-one"})
    assert key != experiment.cache_key(records,"different-source",{"dtype":"float16","encoder":"revision-one"})
    assert key != experiment.cache_key(records,"source",{"dtype":"float32","encoder":"revision-one"})
    assert key != experiment.cache_key(list(reversed(records)),"source",{"dtype":"float16","encoder":"revision-one"})
    assert key != experiment.cache_key([replace(records[0],note_text="changed"),records[1]],"source",{"dtype":"float16","encoder":"revision-one"})


def test_cache_wrong_dimension_rejected(tmp_path):
    path = tmp_path/"cache.npz"
    np.savez(path,cache_key=np.asarray("key"),record_ids=np.asarray(["id"]),embeddings=np.zeros((1,2305),dtype=np.float32))
    with pytest.raises(ValueError,match="shape"):
        experiment.load_cache(path,"key",["id"])


def test_cpu_recipe_requires_explicit_fallback_and_separate_key(monkeypatch):
    monkeypatch.setattr(experiment.torch.cuda,"is_available",lambda:False)
    with pytest.raises(ValueError,match="fallback"):
        experiment.resolved_recipe({})
    cpu = experiment.resolved_recipe({},True)
    monkeypatch.setattr(experiment.torch.cuda,"is_available",lambda:True)
    cuda = experiment.resolved_recipe({})
    assert cpu["dtype"] == "float32" and cuda["dtype"] == "float16"
    assert experiment.cache_key([record(1)],"source",cpu) != experiment.cache_key([record(1)],"source",cuda)


def test_export_layout_and_softmax_roundtrip_without_fitting(monkeypatch):
    import smart_note_training.train_pages as module
    coef = np.asfortranarray(np.arange(18).reshape(3,6)/100.)
    head = SimpleNamespace(coef_=coef,intercept_=np.asarray([.1,.2,.3]))
    scaler = SimpleNamespace(mean_=np.arange(6)/10.,scale_=np.arange(6)+1.)
    captured = {}
    monkeypatch.setattr(module,"save_file",lambda arrays,path:captured.update(arrays))
    export_classifier_weights(head,scaler,"not-written.safetensors")
    loaded = load(save(captured))
    assert all(v.dtype == np.float32 and v.flags.c_contiguous for v in captured.values())
    features = np.arange(12,dtype=np.float32).reshape(2,6)/10.
    logits = ((features-scaler.mean_)/scaler.scale_) @ coef.T + head.intercept_
    reference = np.exp(logits-logits.max(1,keepdims=True)); reference /= reference.sum(1,keepdims=True)
    np.testing.assert_allclose(experiment.safe_probabilities(features,loaded),reference,atol=1e-6)
    assert LABELS == ("present","partial","missing")


def test_check_only_never_loads_encoder_fits_or_predicts(monkeypatch,capsys):
    package = SimpleNamespace(recipe={"baseModel":"XLM-R","localSnapshot":"offline"},summary={"trainingViews":720})
    monkeypatch.setattr(experiment,"load_package",lambda *a:package)
    monkeypatch.setattr(experiment,"resolved_recipe",lambda *a:{"device":"cuda"})
    monkeypatch.setattr(experiment.AutoTokenizer,"from_pretrained",lambda *a,**k:object())
    monkeypatch.setattr(experiment,"token_check",lambda *a:{"testTextTokenized":False})
    monkeypatch.setattr(experiment,"verify_unchanged",lambda *a:None)
    def forbidden(*a,**k):raise AssertionError("training or prediction invoked during check-only")
    for name in ("train_validation_only","fit_page_classifier","evaluate","safe_probabilities"):
        monkeypatch.setattr(experiment,name,forbidden)
    monkeypatch.setattr(experiment.AutoModel,"from_pretrained",forbidden)
    args = SimpleNamespace(release_zip="zip",evaluation_protocol="protocol",pages="pages",notes="notes",max_length=512,
        batch_size=2,aggregation_rules=["max"],classifier_c_grid=[.01,.1],classifier_c=1.,model_name="XLM-R",allow_cpu_fallback=False,check_only=True)
    experiment.run(args)
    result = json.loads(capsys.readouterr().out)
    assert result["trainingStarted"] is result["encoderLoaded"] is result["validationPredicted"] is result["testScored"] is False


def test_future_validation_execution_never_encodes_test(scoring,tmp_path,monkeypatch):
    package, _ = scoring
    package.root = tmp_path/"input"; package.root.mkdir()
    (package.root/"package-manifest.json").write_text("{}")
    (package.root/"evaluation/reviewed-validation-pages.jsonl").parent.mkdir()
    (package.root/"evaluation/reviewed-validation-pages.jsonl").write_text("{}")
    package.protocol.update(validationPageReferences="evaluation/reviewed-validation-pages.jsonl",limitations=[])
    package.baseline = {"externalDirectory":"unused","baselineId":"baseline","aggregation":{"presentThreshold":.5,"partialThreshold":.5}}
    # Include a structurally held-out TEST record. Any attempted encoding fails.
    package.notes = replace(package.notes,records=package.notes.records+(record(99,split="test"),))
    package.pages.records = [record(1,split="train")]
    package.pages.sha256 = "unit-source"
    called = []
    class FakeEncoder:
        def __init__(self,*a):pass
        def encode(self,records,*args):
            assert all(r.preassigned_split != "test" for r in records)
            called.append(args[1]);return np.zeros((len(records),768),dtype=np.float32)
    monkeypatch.setattr(experiment,"Encoder",FakeEncoder)
    monkeypatch.setattr(experiment,"load_file",lambda *a:{})
    monkeypatch.setattr(experiment,"safe_probabilities",lambda x,t:np.tile([.8,.1,.1],(len(x),1)))
    metrics = {"macroF1":.2,"perClass":{"missing":{"recall":.1}}}
    evaluation = {"wholeNote":{"allReferences":metrics},"correctedPagePrimary":{"allReferences":metrics}}
    monkeypatch.setattr(experiment,"evaluate",lambda *a:evaluation)
    selected = {"classifierC":.01,"evaluation":evaluation}
    monkeypatch.setattr(experiment,"select_heads",lambda *a,**kw:([selected],selected))
    monkeypatch.setattr(experiment,"verify_unchanged",lambda *a:None)
    result = experiment.train_validation_only(package,None,{},tmp_path/"output",tmp_path/"cache")
    assert called == ["train-pages","validation-note-pages","corrected-validation-pages","raw-validation-pages"]
    assert result["testEmbedded"] is result["testPredicted"] is result["testScored"] is False


@pytest.mark.parametrize("failure", ["class_order","convergence_warning","iteration_limit"])
def test_head_failures_stop_before_any_prediction(scoring,tmp_path,monkeypatch,failure):
    import warnings
    from sklearn.exceptions import ConvergenceWarning
    package, _ = scoring
    class Head:
        classes_ = np.asarray([2,1,0] if failure == "class_order" else [0,1,2])
        n_iter_ = np.asarray([2000 if failure == "iteration_limit" else 3])
        def predict_proba(self,*a):raise AssertionError("predicted after failed compatibility gate")
    def fake_fit(*a):
        if failure == "convergence_warning":
            warnings.warn("unit convergence failure",ConvergenceWarning)
        return object(),Head()
    monkeypatch.setattr(experiment,"fit_page_classifier",fake_fit)
    with pytest.raises(ValueError,match="class order|converge"):
        experiment.select_heads(package,np.zeros((1,768)),np.zeros((4,768)),np.zeros((3,768)),np.zeros((3,768)),tmp_path)


def test_two_mock_heads_use_frozen_grid_masks_and_smaller_c_tie(scoring,tmp_path,monkeypatch):
    package, _ = scoring
    package.root = tmp_path/"package"; package.root.mkdir()
    (package.root/"evaluation-protocol.json").write_text("{}")
    package.manifest = {"candidateId":"unit","packageVersion":"unit"}
    package.recipe = {"unit":True}
    package.pages.sha256 = "unit-source"
    package.pages.groups = ["fit-student"]
    seen = []
    class Scaler:
        mean_, scale_ = np.zeros(768),np.ones(768)
        def transform(self,x):return x
    class Head:
        classes_, n_iter_ = np.asarray([0,1,2]),np.asarray([2])
        coef_, intercept_ = np.zeros((3,768)),np.zeros(3)
        def predict_proba(self,x):return np.tile([1/3,1/3,1/3],(len(x),1))
        def predict(self,x):return np.zeros(len(x),dtype=int)
    def fake_fit(x,y,w,c):
        seen.append((c,w.tolist()));return Scaler(),Head()
    monkeypatch.setattr(experiment,"fit_page_classifier",fake_fit)
    masks = []
    def calibration(p,owners,actual,eligible,rule):
        masks.append(eligible)
        return calibrate_thresholds(p,owners,actual,eligible,rule)
    monkeypatch.setattr(experiment,"calibrate_thresholds",calibration)
    candidates,selected = experiment.select_heads(package,np.zeros((1,768),dtype=np.float32),np.zeros((4,768),dtype=np.float32),
                                                  np.zeros((3,768),dtype=np.float32),np.zeros((3,768),dtype=np.float32),tmp_path)
    assert seen == [(.01,[2.]),(.1,[2.])]
    assert masks == [[0,1,3],[0,1,3]]
    assert len(candidates) == 2 and selected["classifierC"] == .01
    assert all(c["exportMaxProbabilityError"] < 1e-5 for c in candidates)


def test_redundant_clipped_quote_does_not_reject_retained_essential_anchor():
    row = {"targetLabel":"present","evidenceQuotes":[{"unit":0},{"unit":1}]}
    review = {"label":"present","essentialEvidenceLoss":False,"reason":"Second quote is redundant.","essentialRetainedQuoteIndexes":[0]}
    retained_anchors(row,review,[1])
    with pytest.raises(ValueError,match="anchor"):
        retained_anchors(row,review,[0])


def test_no_prompt_feature_substitution():
    with pytest.raises(ValueError,match="template"):
        check_prompt(record(1),"Concept: {concept_name}")


def test_classifier_budget_parameters_without_fitting():
    from smart_note_training.train import _new_classifier
    settings = _new_classifier(.01,None).get_params()
    assert settings["C"] == .01 and settings["class_weight"] is None
    assert settings["max_iter"] == 2000 and settings["random_state"] == 42 and settings["solver"] == "lbfgs"

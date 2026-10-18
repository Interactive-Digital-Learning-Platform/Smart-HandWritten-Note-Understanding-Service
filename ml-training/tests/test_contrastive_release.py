import copy
import hashlib
import json
from collections import Counter
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

import pytest
import numpy as np

from smart_note_training import LABELS
from smart_note_training import contrastive_experiment as experiment
from smart_note_training import contrastive_release as release
from smart_note_training.dataset import ReleasedDataset, _parse_record
from smart_note_training.reviewed_experiment import cache_key


@pytest.fixture
def authored_admission():
    """Portable synthetic admission fixture, never fitted or evaluated."""
    fit, ledger, profiles, families, authored, targets, parent_rows = [], [], [], [], {}, [], []
    for grade in (10,11):
        for language, code in (("English","en"),("Sinhala","si")):
            for style in range(1,4):
                profiles.append({"studentId":f"new-g{grade}-{code}-{style}","grade":grade,"language":language,
                    "fictional":True,"preassignedSplit":"train","crossLanguageTranslationPair":False})
    for target_index in range(10):
        grade = 10 if target_index < 5 else 11
        cid = f"concept-{target_index}"
        definition = {"id":cid,"name":cid,"category":"definition","keywords":["term"],"learningOutcomes":[],"weight":5}
        target = {"id":cid,"concept":definition,"grade":grade,"lessonId":f"lesson-{target_index}","lessonName":f"Lesson {target_index}"}
        targets.append(target);parent_rows.append({k:v for k,v in target.items() if k != "id"})
        entries = {}
        for lang_index, (language, code) in enumerate((("English","en"),("Sinhala","si"))):
            family_id = f"aug01-family-{2*target_index+lang_index+1:03d}"
            student = f"new-g{grade}-{code}-{target_index%3+1}"
            notes = []
            for label in LABELS:
                note_number = len(fit)//2+1
                note = f"aug01-note-{note_number:03d}";notes.append(note)
                text = f"Notebook {target_index} {language}\n\n"+(f"Evidence for scenario {note_number}. "*20).strip()
                reason = "Full page explanation was checked; neighboring content is considered."
                entry = {"text":text,"reviewReason":reason,"evidenceParagraphs":[] if label == "missing" else [2]}
                entries[(language,label)] = entry
                start = text.index("\n\n")+2
                quotes = [] if label == "missing" else [{"quote":text[start:],"start_char":start,"end_char_exclusive":len(text)}]
                variants = []
                for variant in ("corrected","raw_ocr"):
                    row = {"schemaVersion":"2.0.0","datasetVersion":release.PAGE_VERSION,"recordId":f"aug01-page-{len(fit)+1:05d}",
                        "noteGroupId":note,"evaluationGroupId":student,"preassignedSplit":"train","subject":"Science",
                        **{k:v for k,v in target.items() if k != "id"},"language":language,"noteTextSnapshot":text,"targetLabel":label,
                        "labelQuality":"synthetic_authored_AI_self_review","sampleWeight":1.0 if label == "partial" else .5,
                        "pagePairId":f"{note}|{cid}|1","pageNumber":1,"textVariant":variant,"pageTextSha256":hashlib.sha256(text.encode()).hexdigest(),
                        "reviewStatus":"ai_semantic_page_reviewed","trainingEligible":True,"reviewer":"unit self-reviewer","reviewDate":"2026-10-05",
                        "reviewReason":reason,"evidenceQuotes":copy.deepcopy(quotes),"evidenceReviewStatus":"whole_page_absence_checked" if label == "missing" else "exact_quotes_checked",
                        "rawCorrectedChecked":True,"essentialOcrEvidenceLoss":False,"synthetic":True,"sourceKind":"new_synthetic_training_augmentation",
                        "ocrSource":"simulated","independentHumanCertified":False,"expansionId":release.EXPANSION,"contrastFamilyId":family_id,
                        "intendedLabelVisibleDuringReview":True,"modelPredictionsUsed":False,"authoredSourcePath":f"authored/{cid}.json","authoredSourceSha256":f"hash-{cid}"}
                    fit.append(row);variants.append({k:copy.deepcopy(row[k]) for k in ("recordId","textVariant","pageTextSha256","evidenceQuotes","essentialOcrEvidenceLoss")})
                ledger.append({"pagePairId":row["pagePairId"],"noteGroupId":note,"studentId":student,"grade":grade,"language":language,"pageNumber":1,
                    "concept":definition,"decision":label,"generationIntendedLabel":label,"reason":reason,"reviewer":"unit self-reviewer","reviewDate":"2026-10-05",
                    "preassignedSplit":"train","contrastFamilyId":family_id,"fullCorrectedAndRawPageRead":True,"intendedLabelsVisibleDuringReview":True,
                    "modelPredictionsUsed":False,"synthetic":True,"independentHumanCertified":False,"studentScientificMistakesPreserved":True,
                    "simulatedOcrEdits":[],"variants":variants})
            families.append({"contrastFamilyId":family_id,"conceptId":cid,"language":language,"studentId":student,"preassignedSplit":"train",
                "noteGroupIds":notes,"correlatedVariants":True,"mustRemainGroupedIfReused":True})
        authored[cid] = (entries,f"hash-{cid}")
    parent = SimpleNamespace(pages=SimpleNamespace(sha256="parent-fit"),notes=SimpleNamespace(groups=["old-train","old-validation","old-test"]),
        page_rows=parent_rows,recipe={"conceptPromptTemplate":"Subject: {subject}\nGrade: {grade}\nLesson: {lesson_name}\nConcept: {concept_name}\nCategory: {category}\nKeywords: {comma_joined_keywords_or_none_listed}\nLearning outcomes: {semicolon_joined_outcomes_or_none_listed}\nDecide whether the student's note presents, partially covers, or misses this concept."})
    return fit,{"recordCount":120,"datasetVersion":release.PAGE_VERSION,"parentFitSha256":"parent-fit"},ledger,{"selectedConcepts":targets},profiles,families,authored,parent


def test_new_authored_admission_needs_no_fabricated_legacy_label(authored_admission):
    records = release.validate_authored_rows(*authored_admission)
    assert len(records) == 120 and all(r.dataset_version == release.PAGE_VERSION for r in records)
    assert {label:sum(r.sample_weight for r in records if r.target_label == label) for label in LABELS} == {"present":20,"partial":40,"missing":20}
    assert all(r.note_text == row["noteTextSnapshot"] for r,row in zip(records,authored_admission[0]))


@pytest.mark.parametrize("field,value", [
    ("datasetVersion","pretend-legacy"),("recordId","unexpected"),("sourceTargetLabel","present"),
    ("sourceRelease",{"sha256":"invented"}),("preassignedSplit","validation"),("sampleWeight",1.0),
    ("sampleWeight",True),("sampleWeight",float("nan")),("contrastFamilyId","unknown-family"),
    ("evaluationGroupId","old-test"),("reviewReason","changed"),("authoredSourceSha256","changed"),
    ("rawCorrectedChecked",False),("essentialOcrEvidenceLoss",True),("intendedLabelVisibleDuringReview",False),
    ("independentHumanCertified",True),("modelPredictionsUsed",True),("ocrSource","real_handwriting"),
    ("noteTextSnapshot","empty"),("textVariant","corrected-plus"),("pageNumber",True),
])
def test_new_source_row_tampering_rejected(authored_admission,field,value):
    authored_admission[0][0][field] = value
    with pytest.raises(ValueError): release.validate_authored_rows(*authored_admission)


@pytest.mark.parametrize("field,value", [("decision","missing"),("reason","changed"),("fullCorrectedAndRawPageRead",False),
    ("intendedLabelsVisibleDuringReview",False),("studentScientificMistakesPreserved",False),("modelPredictionsUsed",True)])
def test_augmentation_ledger_tampering_rejected(authored_admission,field,value):
    authored_admission[2][0][field] = value
    with pytest.raises(ValueError,match="ledger"): release.validate_authored_rows(*authored_admission)


def test_authored_content_cannot_be_replaced_by_quote_crop(authored_admission):
    fit = authored_admission[0];fit[0]["noteTextSnapshot"] = fit[0]["evidenceQuotes"][0]["quote"]
    fit[0]["pageTextSha256"] = hashlib.sha256(fit[0]["noteTextSnapshot"].encode()).hexdigest()
    with pytest.raises(ValueError): release.validate_authored_rows(*authored_admission)


def test_quote_offsets_and_duplicate_variants_rejected(authored_admission):
    authored_admission[0][0]["evidenceQuotes"][0]["end_char_exclusive"] -= 1
    with pytest.raises(ValueError): release.validate_authored_rows(*authored_admission)


def test_old_and_new_student_identity_cannot_collide(authored_admission):
    authored_admission[-1].notes.groups.append(authored_admission[4][0]["studentId"])
    with pytest.raises(ValueError,match="overlaps"): release.validate_authored_rows(*authored_admission)


@pytest.mark.parametrize("group", ["evaluationGroupId","pagePairId","contrastFamilyId"])
def test_split_isolation_for_each_group(group):
    a = {"evaluationGroupId":"a","pagePairId":"a","contrastFamilyId":"a","preassignedSplit":"train"}
    b = {"evaluationGroupId":"b","pagePairId":"b","contrastFamilyId":"b","preassignedSplit":"validation"}
    b[group] = a[group]
    with pytest.raises(ValueError,match="leakage"): release.grouped_splits([a,b])


def test_translation_or_descendant_family_link_cannot_cross_split():
    rows = [{"evaluationGroupId":x,"pagePairId":x,"contrastFamilyId":x,"preassignedSplit":s}
        for x,s in (("original","train"),("translation","validation"))]
    with pytest.raises(ValueError,match="related"): release.grouped_splits(rows,[("original","translation")])


def test_features_ignore_labels_authoring_reviews_and_family_metadata(authored_admission):
    row = authored_admission[0][0];record = _parse_record(row,1,release.PAGE_VERSION)
    changed = copy.deepcopy(row)
    changed.update(targetLabel="missing",reviewReason="do not embed",contrastFamilyId="do not embed",generationIntendedLabel="missing",evidenceQuotes=[],reviewer="do not embed")
    other = _parse_record(changed,1,release.PAGE_VERSION)
    assert (record.concept_prompt,record.note_text) == (other.concept_prompt,other.note_text)
    assert cache_key([record],"same-source",{}) == cache_key([other],"same-source",{})
    assert cache_key([record],"parent-only",{}) != cache_key([record],"combined-immutable-sources",{})


@pytest.fixture
def archive_fixture(tmp_path):
    root = tmp_path/"workspace"/release.EXPANSION;root.mkdir(parents=True)
    (root/"augmentation-training-views.jsonl").write_bytes(b"{}\n")
    (root/"protected-inputs.json").write_text('{"files":{}}',encoding="utf-8")
    manifest = {"expansionId":release.EXPANSION,"soleAugmentationFitInput":"augmentation-training-views.jsonl","synthetic":True,
        "independentHumanCertified":False,"trainingPerformed":False,"validationOrTestModified":False,"testPredicted":False,"backendModified":False,
        "files":{p.name:{"sha256":release.sha(p),"bytes":p.stat().st_size} for p in root.iterdir()}}
    (root/"manifest.json").write_text(json.dumps(manifest),encoding="utf-8")
    archive = tmp_path/"data"/"science"/(release.EXPANSION+".zip");archive.parent.mkdir(parents=True)
    with ZipFile(archive,"w") as z:
        for p in root.iterdir(): z.write(p,release.EXPANSION+"/"+p.name)
    receipt = {"expansionId":release.EXPANSION,"zipPath":"data/science/"+archive.name,"zipSha256":release.sha(archive),
        "zipBytes":archive.stat().st_size,"manifestSha256":release.sha(root/"manifest.json"),"memberCount":3}
    Path(str(archive)+".receipt.json").write_text(json.dumps(receipt),encoding="utf-8")
    return root,archive


def test_expansion_manifest_and_zip_receipt_verified(archive_fixture):
    manifest,fingerprints,_ = release.verify_augmentation(*archive_fixture)
    assert manifest["expansionId"] == release.EXPANSION and len(fingerprints) == 5


@pytest.mark.parametrize("target", ["member","manifest","zip","extra"])
def test_expansion_integrity_rejects_tampering(archive_fixture,target):
    root,archive = archive_fixture
    {"member":root/"augmentation-training-views.jsonl","manifest":root/"manifest.json","zip":archive,"extra":root/"unexpected"}[target].write_bytes(b"tampered")
    with pytest.raises((ValueError,json.JSONDecodeError)): release.verify_augmentation(root,archive)


def test_prepare_calls_unchanged_parent_admission_first(tmp_path,monkeypatch):
    class ParentAdmissionRejected(Exception): pass
    seen = []
    def parent_check(*args):
        seen.append(args);raise ParentAdmissionRejected()
    monkeypatch.setattr(release,"load_package",parent_check)
    monkeypatch.setattr(release,"load_augmentation",lambda *a:pytest.fail("old lineage failure was bypassed"))
    parent = tmp_path/"parent"
    with pytest.raises(ParentAdmissionRejected): release.prepare(parent,"parent.zip","aug","aug.zip","head",tmp_path/"out",None)
    assert seen == [(parent/"evaluation-protocol.json","parent.zip",parent/"reviewed-training-views.jsonl",parent/"evaluation/note-references.jsonl")]


def test_lineage_preserves_inherited_source_versions(authored_admission):
    r = _parse_record(authored_admission[0][0],1,release.PAGE_VERSION)
    old = replace(r,record_id="old",dataset_version="unchanged-old-version")
    old_source = ReleasedDataset(Path("old.jsonl"),"unchanged-old-version","old-hash",(old,))
    new_source = ReleasedDataset(Path("new.jsonl"),release.PAGE_VERSION,"new-hash",(r,))
    lineage = release.lineage([old],"parent",old_source) + release.lineage([r],"augmentation",new_source)
    assert [x["sourceDatasetVersion"] for x in lineage] == ["unchanged-old-version",release.PAGE_VERSION]
    assert [x["sourceSha256"] for x in lineage] == ["old-hash","new-hash"]


def test_new_frozen_protocol_preserves_parent_and_heldout_policy():
    protocol = {"protocolId":"parent","fitInput":"old","noteReferences":"old","scopePolicy":{"excludedConceptIds":["excluded"],
        "expectedWholeNoteDenominators":{"train_optional":560,"validation":119,"future_test_not_scored_now":131}},
        "boundedTrainingExperiment":{"classifierCGrid":[.01,.1],"knownWeightedClassTotals":{"present":96,"partial":206,"missing":161}},
        "wholeNoteEvaluation":{"aggregationRules":["max"],"thresholdGrid":[.35,.5,.65,.8]},"pageEvaluation":{"expectedPrimaryPairs":40},
        "baselines":{},"advancementGate":{},"testPolicy":{"scoreNow":False},"limitations":[]}
    saved = copy.deepcopy(protocol)
    parent = SimpleNamespace(protocol=protocol,baseline={"baselineId":"v2.6"})
    frozen = release.frozen_protocol(parent,{"baselineId":"reviewed"})
    assert protocol == saved and frozen["testPolicy"] == saved["testPolicy"] and frozen["pageEvaluation"] == saved["pageEvaluation"]
    assert frozen["scopePolicy"]["excludedConceptIds"] == saved["scopePolicy"]["excludedConceptIds"]
    assert frozen["scopePolicy"]["expectedWholeNoteDenominators"] == {"train_optional":620,"validation":119,"future_test_not_scored_now":131}
    assert frozen["boundedTrainingExperiment"]["classifierCGrid"] == [.01,.1]
    assert frozen["advancementGate"]["comparatorIds"] == ["v2.6","reviewed"]


def scores(note=.5,page=.5,missing=.5):
    return {"wholeNote":{"allReferences":{"macroF1":note}},"correctedPagePrimary":{"allReferences":{"macroF1":page,"perClass":{"missing":{"recall":missing}}}}}


def test_advancement_requires_all_conditions_against_both_fixed_models():
    gate = experiment.both_baseline_gate(scores(.6,.6,.5),{"v2.6":scores(.5,.5,.5),"reviewed":scores(.7,.7,.5)})
    assert not gate["passed"] and gate["comparisons"]["v2.6"]["passed"] and not gate["comparisons"]["reviewed"]["passed"]
    assert not gate["deploymentAllowed"]


def test_check_only_cannot_load_encoder_fit_predict_or_create_outputs(monkeypatch,tmp_path):
    package = SimpleNamespace(recipe={"localSnapshot":"offline"},summary={"trainingViews":840},baseline={"baselineId":"v2.6"})
    monkeypatch.setattr(experiment,"load_preparation",lambda *a:(package,"parent","augmentation",{"baselineId":"reviewed"}))
    monkeypatch.setattr(experiment,"resolved_recipe",lambda *a:{"device":"cuda"})
    monkeypatch.setattr(experiment,"tokenizer",lambda *a:object())
    monkeypatch.setattr(experiment,"token_checks",lambda *a:{"testTextTokenized":False})
    monkeypatch.setattr(experiment,"verify_unchanged",lambda *a:None)
    def forbidden(*args,**kwargs): pytest.fail("check-only entered model execution")
    for name in ("Encoder","train_bounded","evaluate","safe_probabilities","select_heads"): monkeypatch.setattr(experiment,name,forbidden)
    args = SimpleNamespace(preparation="fresh",max_length=512,batch_size=2,classifier_c_grid=[.01,.1],aggregation_rules=["max"],
        check_only=True,output=None,embedding_cache_dir=None)
    result = experiment.run_checked(args)
    assert result["result"] == "PASS" and result["trainingStarted"] is result["encoderLoaded"] is result["validationPredicted"] is result["testScored"] is False
    args.output = tmp_path/"model"
    with pytest.raises(ValueError,match="check-only"): experiment.run_checked(args)
    assert not args.output.exists()


def test_preparation_refuses_existing_directory_or_receipt(tmp_path):
    out = tmp_path/"out";out.mkdir()
    with pytest.raises(ValueError,match="fresh"): release.prepare(None,None,None,None,None,out,None)


def test_training_requires_fresh_outputs_before_encoding(tmp_path):
    out = tmp_path/"out";out.mkdir()
    with pytest.raises(ValueError,match="fresh"): experiment.train_bounded(SimpleNamespace(root=tmp_path/"input"),None,None,None,out,tmp_path/"cache")


def test_future_run_uses_two_fixed_heads_and_never_encodes_test(authored_admission,tmp_path,monkeypatch):
    record = _parse_record(authored_admission[0][0],1,release.PAGE_VERSION)
    train = replace(record,preassigned_split="train")
    validation = replace(record,record_id="validation",evaluation_group_id="heldout-validation",preassigned_split="validation")
    test = replace(record,record_id="test",evaluation_group_id="heldout-test",preassigned_split="test")
    root = tmp_path/"preparation";root.mkdir()
    for name in ("manifest.json","sources.json","grouping-policy.json","pages.jsonl"): (root/name).write_text("{}",encoding="utf-8")
    definition = lambda name:{"baselineId":name,"externalDirectory":name,"aggregation":{"presentThreshold":.35,"partialThreshold":.8}}
    package = SimpleNamespace(root=root,summary={"sourceDatasetVersions":{"fit":["old","new"]}},
        pages=ReleasedDataset(Path("pages"),"composite","fit-source",(train,)),
        notes=ReleasedDataset(Path("notes"),"composite","note-source",(train,validation,test)),
        corrected=[validation],raw=[validation],baseline=definition("v2.6"),
        protocol={"validationPageReferences":"pages.jsonl","limitations":[]})
    encoded,loaded,selected_calls = [],[],[]
    class FakeEncoder:
        def __init__(self,*args): pass
        def encode(self,records,source,tag,cache):
            assert all(r.preassigned_split != "test" for r in records)
            encoded.append((tag,source));return np.zeros((len(records),768),dtype=np.float32)
    monkeypatch.setattr(experiment,"Encoder",FakeEncoder)
    monkeypatch.setattr(experiment,"load_file",lambda path:(loaded.append(path),{})[1])
    monkeypatch.setattr(experiment,"safe_probabilities",lambda x,t:np.tile([.8,.1,.1],(len(x),1)))
    monkeypatch.setattr(experiment,"evaluate",lambda *args:scores(.3,.3,.3))
    def mock_heads(p,X,V,P,R,out,**kwargs):
        selected_calls.append((len(X),len(V),len(P),len(R)))
        heads = [{"classifierC":c,"evaluation":scores(.4,.4,.4)} for c in (.01,.1)]
        for head in heads: (out/f"candidate-C-{head['classifierC']}").mkdir()
        return heads,heads[0]
    monkeypatch.setattr(experiment,"select_heads",mock_heads)
    monkeypatch.setattr(experiment,"verify_unchanged",lambda *a:None)
    result = experiment.train_bounded(package,definition("reviewed"),None,{},tmp_path/"out",tmp_path/"cache")
    assert [t for t,s in encoded] == ["train-pages","validation-note-pages","corrected-validation-pages","raw-validation-pages"]
    assert loaded == [str(Path("v2.6")/"classifier.safetensors"),str(Path("reviewed")/"classifier.safetensors")]
    assert selected_calls == [(1,1,1,1)] and set(result["baselines"]) == {"v2.6","reviewed"}
    assert result["testEmbedded"] is result["testPredicted"] is result["testScored"] is result["deployed"] is False
    assert result["candidateGates"]["0.01"]["passed"] is True and result["enabledByDefault"] is False

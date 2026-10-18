import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from contextlib import redirect_stdout
import io

PATH=Path(__file__).resolve().parents[1]/'train_student_note_batch.py'
spec=importlib.util.spec_from_file_location('student_batch',PATH)
batch=importlib.util.module_from_spec(spec);spec.loader.exec_module(batch)


def row(rid,group,text,label='present'):
    return {'recordId':rid,'noteGroupId':group,'uploaderGroupId':'tester', 'subject':'science','conceptId':'c',
            'text':text,'modelInputText':text,'textSha256':batch.sha(' '.join(text.lower().split()).encode()),
            'teacherLabel':label,'teacherConfidence':.8,'labelSource':'ai_teacher','humanReviewed':False}


class BatchTest(unittest.TestCase):
    def fixture(self,folder,rows,reviews=None):
        path=Path(folder)/'dataset.json'
        data={'schemaVersion':'notes-ai-training-v1','modelHashes':{'science':'frozen'},'rows':rows}
        raw=json.dumps(data).encode();path.write_bytes(raw)
        path.with_name('manifest.json').write_text(json.dumps({'datasetSha256':batch.sha(raw),'rowCount':len(rows),'modelHashes':data['modelHashes']}))
        review_path=None
        if reviews is not None:
            review_path=Path(folder)/'reviews.json'
            review_path.write_text(json.dumps({'schemaVersion':'notes-human-review-v1','datasetSha256':batch.sha(raw),'rows':reviews}))
        return path,review_path

    def test_entire_note_and_duplicate_text_are_held_out(self):
        with tempfile.TemporaryDirectory() as folder:
            rows=[row('a','n1','Original note'),row('b','n1','Second part'),row('c','n2','original NOTE')]
            path,review=self.fixture(folder,rows,[{'recordId':'a','humanLabel':'partial','confirmed':True,'split':'holdout'}])
            _,prepared,_=batch.read_batch(path,review)
            self.assertTrue(all(r['split']=='holdout' for r in prepared))
            self.assertEqual(prepared[0]['targetLabel'],'partial')
            train,held,_=batch.readiness(prepared,'science')
            self.assertEqual(len(train),0);self.assertEqual(len(held),1)

    def test_unconfirmed_ai_label_is_not_a_human_label(self):
        with tempfile.TemporaryDirectory() as folder:
            path,review=self.fixture(folder,[row('a','n','Note')],[{'recordId':'a','humanLabel':'missing','confirmed':False,'split':'train'}])
            _,prepared,_=batch.read_batch(path,review)
            self.assertEqual(prepared[0]['targetLabel'],'present');self.assertEqual(prepared[0]['weight'],.25)

    def test_synthetic_source_chapter_is_held_out_across_writers_and_pages(self):
        with tempfile.TemporaryDirectory() as folder:
            rows=[row('a','writer-a','First page'),row('b','writer-b','Different page'),row('c','other','Independent source')]
            rows[0]['sourceFamilyId']=rows[1]['sourceFamilyId']='same-textbook-chapter'
            path,review=self.fixture(folder,rows,[{'recordId':'a','humanLabel':'partial','confirmed':True,'split':'holdout'}])
            _,prepared,_=batch.read_batch(path,review)
            self.assertEqual([r['split'] for r in prepared],['holdout','holdout','train'])

    def test_manifest_and_review_binding(self):
        with tempfile.TemporaryDirectory() as folder:
            path,review=self.fixture(folder,[row('a','n','Note')],[])
            doc=json.loads(review.read_text());doc['datasetSha256']='wrong';review.write_text(json.dumps(doc))
            with self.assertRaises(ValueError):batch.read_batch(path,review)
            path.write_text(path.read_text()+' ')
            with self.assertRaises(ValueError):batch.read_batch(path)

    def test_empty_or_unbalanced_data_cannot_fit(self):
        train,held,report=batch.readiness([],'science')
        self.assertEqual(len(report['trainingBlockers']),3)

    def test_synthetic_page_variants_share_notebook_weight(self):
        rows=[{'noteGroupId':'a','weight':.25,'synthetic':True,'variant':variant} for variant in ['whole','page-1','page-2']]
        rows.append({'noteGroupId':'b','weight':.25,'synthetic':True,'variant':'whole'})
        weights=batch.training_weights(rows)
        self.assertAlmostEqual(sum(weights[:3]),weights[3])
        self.assertAlmostEqual(weights[0],weights[1]+weights[2])

    def test_actual_optimizer_updates_head_finitely(self):
        import numpy as np
        x=np.array([[2.,0.],[1.,0.],[0.,2.],[0.,1.],[-2.,-2.],[-1.,-1.]])
        w,b=batch.anchored_fit(x,np.array([0,0,1,1,2,2]),np.ones(6),np.zeros((3,2)),np.zeros(3))
        self.assertTrue(np.isfinite(w).all());self.assertGreater(np.abs(w).sum(),0)
        self.assertEqual((x@w.T+b).argmax(axis=1).tolist(),[0,0,1,1,2,2])

    def test_science_candidate_reloads_and_never_overwrites_base(self):
        with tempfile.TemporaryDirectory() as folder:
            samples=[('present','Add Benedict solution to the food sample.\nHeat the sample in a hot water bath.\nA brick red precipitate indicates reducing sugar.'),
                     ('partial','Add Benedict solution to the food sample. A brick red precipitate indicates reducing sugar.'),
                     ('missing','Living organisms contain carbon, hydrogen, oxygen and nitrogen.')]
            rows=[]
            for group in range(15):
                for label,text in samples:
                    r=row(f'{group}-{label}',f'note-{group}',text+f'\nPractice example number {group}.',label)
                    r['conceptId']='sci-g10-cbl-007';rows.append(r)
            path,review=self.fixture(folder,rows,[{'recordId':r['recordId'],'humanLabel':r['teacherLabel'],
                'confirmed':True,'split':'holdout' if int(r['recordId'].split('-')[0])>=10 else 'train'} for r in rows])
            base_raw=batch.BASE['science'].read_bytes()
            data=json.loads(path.read_bytes());data['modelHashes']['science']=batch.sha(base_raw)
            raw=json.dumps(data).encode();path.write_bytes(raw)
            manifest=json.loads(path.with_name('manifest.json').read_text());manifest.update(datasetSha256=batch.sha(raw),modelHashes=data['modelHashes']);path.with_name('manifest.json').write_text(json.dumps(manifest))
            doc=json.loads(review.read_text());doc['datasetSha256']=batch.sha(raw);review.write_text(json.dumps(doc))
            output=Path(folder)/'candidate'
            with redirect_stdout(io.StringIO()):batch.run(SimpleNamespace(dataset=path,reviews=review,subject='science',output=output,check_only=False))
            report=json.loads((output/'report.json').read_text())
            self.assertTrue(report['candidateTrained']);self.assertFalse(report['liveModelChanged']);self.assertFalse(report['deploymentApproved'])
            self.assertEqual(report['candidateModelSha256'],batch.sha((output/'candidate-model.json').read_bytes()))
            self.assertEqual(batch.BASE['science'].read_bytes(),base_raw)
            self.assertTrue(set(report['trainingRowsUsed']).isdisjoint(report['heldoutRowsScored']))
            candidate=batch.predictor('science',json.loads((output/'candidate-model.json').read_text()))
            self.assertIn(candidate.predict(samples[0][1],'sci-g10-cbl-007','English',True)['rawModelStatus'],batch.LABELS)

    def test_history_head_update_reloads_with_existing_encoder_and_policy(self):
        import copy
        import numpy as np
        from smart_note_training.history_semantic import FrozenEncoder
        artifact=json.loads(batch.BASE['history'].read_bytes())
        encoder=FrozenEncoder(batch.ROOT/'encoders/minilm-l6-v2/encoder-manifest.json')
        base=batch.predictor('history',artifact,encoder)
        samples=[{'conceptId':'hist-g10-l03-c01','text':text} for text in [
            'Before the state developed, groups of wealthy chieftains dominated small areas. Early inscriptions called these chiefs Parumaka.',
            'These local leaders were wealthy chieftains.',
            'Plants release oxygen during photosynthesis.']]
        features=base.extractor.transform(samples)
        w,b=batch.anchored_fit((features-base.mean)/base.scale,np.array([0,1,2]),np.ones(3),base.weights,base.intercept)
        candidate=copy.deepcopy(artifact);candidate.update(weights=w.tolist(),intercept=b.tolist())
        model=batch.predictor('history',candidate,encoder)
        result=model.predict(samples[0]['text'],samples[0]['conceptId'],'English',True)
        self.assertIn(result['rawModelStatus'],batch.LABELS)
        self.assertEqual(result['reviewPolicyVersion'],artifact['reviewPolicy']['version'])
        self.assertFalse(np.array_equal(base.weights,w))

if __name__=='__main__':unittest.main()

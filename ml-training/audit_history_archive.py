"""Inspect and stage supplied synthetic History data without executing ZIP code."""
import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath


def audit(archive, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    prefix = 'history_synthetic_full_v1/'
    failures = []
    def check(ok, message):
        if not ok: failures.append(message)
    with zipfile.ZipFile(archive) as z:
        entries = {e.filename:e for e in z.infolist() if not e.is_dir()}
        check(len(entries)==sum(not e.is_dir() for e in z.infolist()), 'Duplicate archive paths')
        for name, entry in entries.items():
            check(name.startswith(prefix) and '..' not in PurePosixPath(name).parts and '\\' not in name, 'Unsafe archive path: '+name)
            check(entry.file_size < 30_000_000, 'Oversized archive member: '+name)
        if failures: raise ValueError('; '.join(failures))
        read = lambda name: z.read(prefix+name)
        obj = lambda name: json.loads(read(name).decode('utf-8-sig'))
        rows = lambda name: [json.loads(s) for s in read(name).decode('utf-8-sig').splitlines() if s.strip()]
        manifest=obj('manifest.json'); curriculum=obj('curriculum.json')
        for name, digest in manifest['fileSha256'].items():
            check(hashlib.sha256(read(name)).hexdigest()==digest, 'Manifest hash mismatch: '+name)
        pages=rows('page-training-examples.jsonl'); notes=rows('note-references.jsonl')
        students=rows('students.jsonl'); ledger=rows('review-ledger.jsonl')
        groups={}; pairs=defaultdict(list); snapshots={}; labels=Counter(); splits=Counter()
        ids=set(); family_splits=defaultdict(set); note_splits=defaultdict(set)
        for row in pages:
            rid=row['recordId'];check(rid not in ids, 'Duplicate record: '+rid);ids.add(rid)
            text=row['noteTextSnapshot'];split=row['preassignedSplit'];group=row['evaluationGroupId']
            check(row['targetLabel'] in ('present','partial','missing'), 'Unknown label: '+rid)
            check(split in ('train','validation','test'), 'Unknown split: '+rid)
            check(group not in groups or groups[group]==split, 'Student crosses splits: '+group);groups[group]=split
            family_splits[row['familyId']].add(split);note_splits[row['noteGroupId']].add(split)
            check(hashlib.sha256(text.encode()).hexdigest()==row['pageTextSha256'], 'Text hash mismatch: '+rid)
            file=f"notes/{row['noteGroupId']}/page-{row['pageNumber']:03d}.{row['textVariant']}.txt"
            check(read(file).decode('utf-8')==text, 'Page file/snapshot mismatch: '+rid)
            check(row['sampleWeight']==0.5, 'Unexpected paired weight: '+rid)
            check(row['trainingEligible']==(split=='train'), 'Training admission contradicts split: '+rid)
            for e in row.get('evidenceQuotes',[]):
                a=e['start_char'];b=e['end_char_exclusive']
                check(0<=a<b<=len(text) and text[a:b]==e['quote'], 'Invalid evidence offset: '+rid)
            pairs[row['pagePairId']].append(row)
            if row['textVariant']=='corrected':
                labels[row['targetLabel']]+=1;splits[split]+=1
                snapshots[(row['noteGroupId'],row['pageNumber'])]=(text,split,group)
        for pid, pair in pairs.items():
            check(len(pair)==2 and {r['textVariant'] for r in pair}=={'raw','corrected'}, 'Invalid raw/corrected pairing: '+pid)
            for field in ('targetLabel','preassignedSplit','evaluationGroupId','concept','noteGroupId'):
                check(len({json.dumps(r[field],sort_keys=True) for r in pair})==1, 'Pair disagrees on '+field+': '+pid)
        check(all(len(s)==1 for s in family_splits.values()), 'Family leakage across splits')
        check(all(len(s)==1 for s in note_splits.values()), 'Note leakage across splits')
        check({s['evaluationGroupId']:s['preassignedSplit'] for s in students}==groups, 'Student registry mismatch')
        check(all(not r['trainingEligible'] for r in notes), 'Whole-note references marked trainable')
        check(all(groups[r['evaluationGroupId']]==r['preassignedSplit'] for r in notes), 'Whole-note group split mismatch')
        ledger_ids={rid for r in ledger if r['recordType']=='page_pair' for rid in r['recordIds']}
        check(ledger_ids==ids, 'Review ledger/page record mismatch')
        exact=defaultdict(set)
        for text,split,_ in snapshots.values():exact[text].add(split)
        exact_cross=sum(len(s)>1 for s in exact.values())
        # Lexical warning only: shared wording does not prove label leakage.
        def grams(t):
            words=re.findall(r'\w+',t.lower());return {tuple(words[i:i+5]) for i in range(len(words)-4)}
        texts=list(snapshots.items()); signatures=[grams(v[0]) for _,v in texts]; similar=[]
        for i, (key,(_,split,_)) in enumerate(texts):
            for j in range(i):
                other,(_,other_split,_)=texts[j]
                if split==other_split:continue
                a,b=signatures[i],signatures[j];score=len(a&b)/max(1,len(a|b))
                if score>=.7:similar.append({'pages':[list(key),list(other)],'splits':[split,other_split],'fiveWordJaccard':round(score,3)})
        summary={'archiveSha256':hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
            'datasetVersion':manifest['datasetVersion'],'mechanicalChecksPassed':not failures,'failures':failures,
            'counts':{'lessons':len(curriculum['lessons']),'concepts':len({r['concept']['id'] for r in pages}),
                'students':len(groups),'notes':len(note_splits),'pages':len(snapshots),'pairedPageTargets':len(pairs),
                'rawCorrectedRows':len(pages),'wholeNoteReferences':len(notes)},
            'uniquePairLabels':dict(labels),'uniquePairSplits':dict(splits),'studentSplits':dict(Counter(groups.values())),
            'exactPageTextAcrossSplits':exact_cross,'similarCrossSplitPagePairs':len(similar),
            'similarityWarningExamples':similar[:15],
            'synthetic':True,'independentHumanCertification':False,'realHandwriting':False,
            'executedArchiveCode':False,'liveModelChanged':False,
            'intendedNextStep':'Create History concept rubrics and a separate grouped training experiment; validate labels with a subject reviewer.'}
        (output/'audit.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
        if failures:print(json.dumps(summary,indent=2));return 1
        # Stage original declarative data only; never run supplied authoring/validator scripts.
        stage=output/'source';stage.mkdir()
        for name in entries:
            relative=name[len(prefix):]
            if not relative.endswith(('.json','.jsonl','.txt','.md')):continue
            target=stage.joinpath(*PurePosixPath(relative).parts)
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(name))
        (output/'corrected-page-examples.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in pages if r['textVariant']=='corrected'),encoding='utf-8')
        print(json.dumps(summary,indent=2));return 0


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();raise SystemExit(audit(a.archive,a.output))

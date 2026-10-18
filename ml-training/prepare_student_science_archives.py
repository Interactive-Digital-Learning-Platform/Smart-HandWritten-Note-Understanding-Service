"""Audit supplied synthetic notebook ZIPs and prepare scoped concept examples.

Supplied notebook/topic profiles are metadata, never per-concept training labels.
Transcripts are supplied text, not OCR output. No app records or live models change.
"""
import argparse
from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

ROOT=Path(__file__).resolve().parent
FILES=[f'g{grade}p{part}-student-{student}-v2.zip' for grade in (10,11) for part in (1,2) for student in ('a','b')]
# Explicit textbook-unit correspondence, not a fuzzy concept title match.
SCOPE={1:['sci-g10-cbl-007'],5:['sci-g10-som-005'],19:['sci-g10-col-001'],20:['sci-g10-col-001'],
       22:['sci-g10-cim-002'],26:['sci-g10-cur-006'],27:['sci-g10-cur-006'],34:['sci-g11-mix-009'],
       39:['sci-g11-bph-004'],44:['sci-g11-hea-003'],45:['sci-g11-pea-001'],46:['sci-g11-ele-002']}
META=('README.txt','lesson-index.csv','topic-coverage.csv','intentional-mistakes.csv','handwritten-corrections.csv')


def sha(data):return hashlib.sha256(data).hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,indent=2,ensure_ascii=False)+'\n').encode('utf-8'))
def csv_rows(raw):return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'),newline='')))


def safe_name(name):
    p=PurePosixPath(name)
    if not name or '\\' in name or p.is_absolute() or '..' in p.parts or ':' in name or p.as_posix()!=name:
        raise ValueError('Unsafe archive entry')
    return p


def transcript_pages(text):
    markers=list(re.finditer(r'^--- IMAGE (\d+) ---\s*$',text,re.M))
    if not markers:raise ValueError('Transcript has no page markers')
    if [int(m[1]) for m in markers]!=list(range(1,len(markers)+1)):raise ValueError('Nonconsecutive transcript pages')
    # Exclude title/profile/source/synthetic header entirely; it reveals intended labels.
    pages=[text[m.end():markers[i+1].start() if i+1<len(markers) else len(text)].strip() for i,m in enumerate(markers)]
    if any(not p for p in pages):raise ValueError('Empty transcript page')
    return pages


def run(downloads,output):
    output=Path(output).resolve()
    if output.exists():raise ValueError('Choose a fresh output directory')
    output.mkdir(parents=True);raw_dir=output/'sources';raw_dir.mkdir()
    shared={};sources=[];entries={};total=0;image_manifests=[]
    for name in FILES:
        source=Path(downloads)/name
        sources.append({'file':name,'sha256':sha(source.read_bytes()),'bytes':source.stat().st_size})
        with zipfile.ZipFile(source) as archive:
            seen=set()
            for info in archive.infolist():
                safe_name(info.filename)
                if info.filename in seen:raise ValueError('Duplicate path inside ZIP')
                seen.add(info.filename)
                if info.is_dir():continue
                if info.flag_bits&1 or (info.external_attr>>16)&0o170000==0o120000:raise ValueError('Encrypted/link entry')
                total+=info.file_size
                if info.file_size>50_000_000 or total>600_000_000:raise ValueError('Archive size limit')
                if info.filename=='viewer.html':continue  # Never execute source HTML.
                if info.filename=='image-manifest.csv':
                    data=archive.read(info);image_manifests.extend(csv_rows(data))
                    destination=raw_dir/'manifests';destination.mkdir(exist_ok=True)
                    (destination/(name+'.csv')).write_bytes(data)
                    continue
                if info.filename not in META and not re.fullmatch(r'notebooks/L\d{2}_G(?:10|11)/Student_[AB]/(?:page_\d{2}\.webp|transcript\.txt)',info.filename):
                    raise ValueError('Unexpected file in source ZIP')
                data=archive.read(info)
                if info.filename in META:
                    if info.filename in shared and shared[info.filename]!=data:raise ValueError('Shared source ledgers differ')
                    shared[info.filename]=data
                else:
                    if info.filename in entries:raise ValueError('Notebook duplicated across ZIPs')
                    entries[info.filename]={'sha256':sha(data),'archive':name,'bytes':len(data)}
                target=raw_dir.joinpath(*PurePosixPath(info.filename).parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    index=csv_rows(shared['lesson-index.csv']);topics=csv_rows(shared['topic-coverage.csv']);mistakes=csv_rows(shared['intentional-mistakes.csv'])
    model_raw=(ROOT.parent/'models/english-coverage-v3.1.json').read_bytes();model=json.loads(model_raw)
    concepts={c['id']:c for c in model['rubrics']['concepts']}
    records=[];examples=[];issues=[];image_hashes={};duplicate_images=[];text_hashes={};duplicate_texts=[]
    expected_entries=set()
    for r in index:
        lesson,grade,student=int(r['lesson']),int(r['grade']),r['student']
        directory=f'notebooks/L{lesson:02d}_G{grade}/Student_{student}'
        transcript=directory+'/transcript.txt'
        if transcript not in entries:raise ValueError('Notebook transcript missing from supplied archives')
        expected_entries.add(transcript)
        page_paths=sorted(p for p in entries if p.startswith(directory+'/page_'))
        expected_entries.update(page_paths)
        if [Path(p).name for p in page_paths]!=[f'page_{i:02d}.webp' for i in range(1,len(page_paths)+1)]:raise ValueError('Nonconsecutive images')
        text=(raw_dir/transcript).read_text(encoding='utf-8-sig');pages=transcript_pages(text)
        if len(pages)!=len(page_paths):raise ValueError('Transcript/image page counts differ')
        if len(page_paths)!=int(r['images']):issues.append({'notebook':directory,'type':'index_image_count_mismatch','indexCount':int(r['images']),'actual':len(page_paths)})
        for p in page_paths:
            h=entries[p]['sha256']
            if h in image_hashes:duplicate_images.append([image_hashes[h],p])
            image_hashes[h]=p
        body='\n\n'.join(f'--- Page {i+1} ---\n{p}' for i,p in enumerate(pages))
        th=sha(' '.join(body.lower().split()).encode())
        if th in text_hashes:duplicate_texts.append([text_hashes[th],directory])
        text_hashes[th]=directory
        family=f"synthetic-v2:{r['book']}:chapter-{r['chapter']}"
        record={'noteGroupId':f'synthetic-v2-L{lesson:02d}-{student}','sourceFamilyId':family,'synthetic':True,
                'lesson':lesson,'grade':grade,'studentStyle':student,'title':r['title'],'book':r['book'],'chapter':int(r['chapter']),
                'sourcePrintedPages':[int(r['source_printed_start']),int(r['source_printed_end'])],
                'suppliedNotebookProfile':r['coverage'],'topicLedger':[t for t in topics if int(t['lesson'])==lesson and t['student']==student],
                'intentionalMistakes':[m for m in mistakes if int(m['lesson'])==lesson and m['student']==student],
                'images':page_paths,'transcript':transcript,'text':body,'pageTexts':pages,'supportedConceptIds':SCOPE.get(lesson,[])}
        records.append(record)
        for cid in record['supportedConceptIds']:
            c=concepts[cid]
            # Keep whole-note and actual one-page inputs explicitly distinct. No invented text.
            variants=[('whole',body)]+[(f'page-{i+1}',p) for i,p in enumerate(pages)]
            for variant,value in variants:
                if len(value)>20000:issues.append({'notebook':directory,'variant':variant,'type':'model_text_limit'});continue
                examples.append({'recordId':f"{record['noteGroupId']}-{cid}-{variant}",'noteGroupId':record['noteGroupId'],
                    'sourceFamilyId':family,'subject':'science','synthetic':True,'conceptId':cid,'conceptName':c['name'],
                    'requirements':[p['text'] for p in c['points']],'text':value,'variant':variant,
                    'source':{'archive':entries[transcript]['archive'],'transcript':transcript,'textSource':'supplied_transcript_not_ocr',
                              'intentionalMistakes':record['intentionalMistakes']}})
    if expected_entries!=set(entries):raise ValueError('Unindexed notebook files')
    actual_images=sum(p.endswith('.webp') for p in entries)
    if len(image_manifests)!=actual_images or len({r['path'] for r in image_manifests})!=actual_images:
        raise ValueError('Image manifests do not enumerate every image once')
    for row in image_manifests:
        entry=entries.get(row['path'])
        if not entry or entry['sha256']!=row['sha256'] or entry['bytes']!=int(row['bytes']):
            raise ValueError('Image checksum or byte count differs from source manifest')
    readme=shared['README.txt'].decode('utf-8-sig');claimed=re.search(r'(\d+) handwritten images',readme)
    if claimed and int(claimed[1])!=actual_images:issues.append({'type':'readme_image_count_mismatch','claimed':int(claimed[1]),'actual':actual_images})
    packet={'schemaVersion':'synthetic-science-intake-v1','synthetic':True,'sourceArchives':sources,'modelSha256':sha(model_raw),
            'labelPolicy':'Supplied notebook/topic labels are not model labels. All concept examples await an AI proposal or explicit human review.',
            'grouping':'Whole notes/pages and A/B notes from the same textbook chapter must stay together across fitting/evaluation.',
            'notebooks':records,'examples':examples}
    write(output/'packet.json',packet)
    audit={'archives':len(sources),'notebooks':len(records),'lessonUnits':len({r['lesson'] for r in records}),
           'images':actual_images,'profileCounts':dict(Counter(r['suppliedNotebookProfile'] for r in records)),
           'supportedNotebooks':sum(bool(r['supportedConceptIds']) for r in records),
           'supportedConcepts':len({e['conceptId'] for e in examples}),'wholeNoteExamples':sum(e['variant']=='whole' for e in examples),
           'pageExamples':sum(e['variant']!='whole' for e in examples),'sourceFamilies':len({e['sourceFamilyId'] for e in examples}),
           'duplicateImages':duplicate_images,'duplicateFullTexts':duplicate_texts,'issues':issues,
           'imageManifestChecksPassed':actual_images,'synthetic':True,'ocrTested':False,'humanLabelsConfirmed':False,'liveModelChanged':False}
    write(output/'audit.json',audit);write(output/'files.json',entries)
    print(json.dumps(audit,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--downloads',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();run(a.downloads,a.output)

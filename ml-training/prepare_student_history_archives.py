"""Audit the supplied simulated History notebooks; prepare rubric-bound transcripts.

This does not execute the supplied viewer, infer OCR quality, assign target labels,
change student accounts, or replace the deployed History model.
"""
import argparse
from collections import Counter
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

from prepare_student_science_archives import sha, write, csv_rows, safe_name, transcript_pages

ROOT = Path(__file__).resolve().parent
FILES = ['g11-student-e-history-1.zip', 'g11-student-f-history.zip',
         'g11-student-e-history-2.zip', 'g10-student-f-history-2.zip',
         'g10-student-e-history-1.zip', 'g10-student-e-history-2.zip',
         'g10-student-f-history-1.zip']
META = ('README.txt', 'lesson-index.csv', 'topic-coverage.csv',
        'intentional-mistakes.csv', 'handwritten-corrections.csv', 'page-layout.csv')
MODEL = ROOT / 'outputs/history-coverage-v5.1-review-policy-2026-10-15/model.json'
# Fixed before labels or model results are inspected; both writers and all chapter
# units stay together. No notebook is randomly split into training/evaluation pages.
HOLDOUT = ['synthetic-history-ef:g10:chapter-2', 'synthetic-history-ef:g10:chapter-7',
           'synthetic-history-ef:g11:chapter-1', 'synthetic-history-ef:g11:chapter-6']


def chapter_concepts(index_row, concepts):
    grade, chapter = int(index_row['grade']), int(index_row['chapter'])
    if index_row['book'] != f'g{grade}' or grade not in (10, 11):
        raise ValueError('Unsupported textbook reference')
    lesson_id = f'hist-g{grade}-l{chapter:02d}'
    selected = [c for c in concepts if c['lessonId'] == lesson_id]
    if not selected:
        raise ValueError('No registered concepts for source chapter')
    return selected


def run(downloads, output):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Choose a fresh output directory')
    model_raw = MODEL.read_bytes()
    concepts = json.loads(model_raw)['rubrics']['concepts']
    output.mkdir(parents=True)
    raw_dir = output / 'sources'
    raw_dir.mkdir()
    sources, shared, entries, manifests = [], {}, {}, []
    expanded = 0
    for name in FILES:
        source = Path(downloads) / name
        sources.append({'file': name, 'sha256': sha(source.read_bytes()), 'bytes': source.stat().st_size})
        with zipfile.ZipFile(source) as archive:
            seen = set()
            for info in archive.infolist():
                safe_name(info.filename)
                if info.filename in seen:
                    raise ValueError('Duplicate path inside ZIP')
                seen.add(info.filename)
                if info.flag_bits & 1 or (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('Encrypted or linked archive entry')
                expanded += info.file_size
                if info.file_size > 50_000_000 or expanded > 600_000_000:
                    raise ValueError('Archive size limit')
                if info.is_dir() or info.filename == 'viewer.html':
                    continue
                if info.filename == 'image-manifest.csv':
                    data = archive.read(info)
                    manifests.extend(csv_rows(data))
                    target = raw_dir / 'manifests' / (name + '.csv')
                else:
                    if info.filename not in META and not re.fullmatch(
                            r'notebooks/L\d{2}_G(?:10|11)/Student_[EF]/(?:page_\d{2}\.webp|transcript\.txt)', info.filename):
                        raise ValueError('Unexpected file in source ZIP')
                    data = archive.read(info)
                    if info.filename in META:
                        if info.filename in shared and shared[info.filename] != data:
                            raise ValueError('Shared source ledgers differ')
                        shared[info.filename] = data
                    else:
                        if info.filename in entries:
                            raise ValueError('Notebook file duplicated across ZIPs')
                        entries[info.filename] = {'sha256': sha(data), 'bytes': len(data), 'archive': name}
                    target = raw_dir.joinpath(*PurePosixPath(info.filename).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
    if set(shared) != set(META):
        raise ValueError('Missing source ledger')
    index, topics, mistakes = (csv_rows(shared[n]) for n in
                              ('lesson-index.csv', 'topic-coverage.csv', 'intentional-mistakes.csv'))
    records, examples, expected, image_hashes, text_hashes = [], [], set(), {}, {}
    duplicate_images, duplicate_texts = [], []
    for row in index:
        lesson, grade, student = int(row['lesson']), int(row['grade']), row['student']
        if student not in ('E', 'F'):
            raise ValueError('Unregistered synthetic writer style')
        directory = f'notebooks/L{lesson:02d}_G{grade}/Student_{student}'
        transcript = directory + '/transcript.txt'
        if transcript not in entries:
            raise ValueError('Missing notebook transcript')
        if transcript in expected:
            raise ValueError('Duplicate notebook index row')
        images = sorted(p for p in entries if p.startswith(directory + '/page_'))
        if [Path(p).name for p in images] != [f'page_{i:02d}.webp' for i in range(1, len(images) + 1)]:
            raise ValueError('Nonconsecutive notebook images')
        pages = transcript_pages((raw_dir / transcript).read_text(encoding='utf-8-sig'))
        if len(pages) != len(images) or len(images) != int(row['images']):
            raise ValueError('Transcript, index and image counts differ')
        expected.update([transcript, *images])
        for path in images:
            digest = entries[path]['sha256']
            if digest in image_hashes:
                duplicate_images.append([image_hashes[digest], path])
            image_hashes[digest] = path
        # Strip the label-revealing notebook header. Page markers preserve ordering.
        body = '\n\n'.join(f'--- Page {i + 1} ---\n{page}' for i, page in enumerate(pages))
        if not 1 <= len(body) <= 20000:
            raise ValueError('Transcript exceeds model text limit; do not silently truncate')
        digest = sha(' '.join(body.lower().split()).encode())
        if digest in text_hashes:
            duplicate_texts.append([text_hashes[digest], directory])
        text_hashes[digest] = directory
        family = f"synthetic-history-ef:{row['book']}:chapter-{row['chapter']}"
        group = f'synthetic-history-L{lesson:02d}-{student}'
        selected = chapter_concepts(row, concepts)
        record = {'noteGroupId': group, 'sourceFamilyId': family, 'synthetic': True,
                  'lesson': lesson, 'grade': grade, 'studentStyle': student, 'title': row['title'],
                  'book': row['book'], 'chapter': int(row['chapter']),
                  'suppliedNotebookProfile': row['coverage'],
                  'sourcePrintedPages': [int(row['source_printed_start']), int(row['source_printed_end'])],
                  'topicLedger': [r for r in topics if int(r['lesson']) == lesson and r['student'] == student],
                  'intentionalMistakes': [r for r in mistakes if int(r['lesson']) == lesson and r['student'] == student],
                  'images': images, 'transcript': transcript, 'text': body,
                  'supportedConceptIds': [c['id'] for c in selected]}
        records.append(record)
        for concept in selected:
            examples.append({'recordId': f"{group}-{concept['id']}-whole", 'noteGroupId': group,
                             'sourceFamilyId': family, 'subject': 'history', 'synthetic': True,
                             'conceptId': concept['id'], 'conceptName': concept['name'],
                             'requirements': [p['text'] for p in concept['points']],
                             'sourceCriteria': concept['sourceCriteria'], 'text': body, 'variant': 'whole',
                             'source': {'archive': entries[transcript]['archive'], 'transcript': transcript,
                                        'textSource': 'supplied_transcript_not_ocr'}})
    if expected != set(entries):
        raise ValueError('Unindexed notebook files')
    images = sum(p.endswith('.webp') for p in entries)
    if len(manifests) != images or len({r['path'] for r in manifests}) != images:
        raise ValueError('Image manifests must enumerate every image exactly once')
    for row in manifests:
        actual = entries.get(row['path'])
        if not actual or actual['sha256'] != row['sha256'] or actual['bytes'] != int(row['bytes']):
            raise ValueError('Image checksum or size mismatch')
    packet = {'schemaVersion': 'synthetic-history-intake-v1', 'synthetic': True,
              'sourceArchives': sources, 'modelSha256': sha(model_raw),
              'reservedHoldoutFamilies': HOLDOUT,
              'scopePolicy': 'Explicit source grade/chapter to frozen lessonId; not all chapter ideas are expected on each individual page or unit. Missing describes absence from this submitted text, not student knowledge.',
              'labelPolicy': 'Notebook profiles, topic ledgers and deliberate mistakes are audit metadata, never target labels. Concept labels require independent rubric review.',
              'notebooks': records, 'examples': examples}
    audit = {'archives': len(sources), 'notebooks': len(records),
             'lessonUnits': len({r['lesson'] for r in records}), 'images': images,
             'profileCounts': dict(Counter(r['suppliedNotebookProfile'] for r in records)),
             'supportedConcepts': len({e['conceptId'] for e in examples}), 'wholeNoteExamples': len(examples),
             'pageExamples': 0, 'sourceFamilies': len({e['sourceFamilyId'] for e in examples}),
             'reservedHoldoutFamilies': HOLDOUT, 'duplicateImages': duplicate_images,
             'duplicateFullTexts': duplicate_texts, 'imageManifestChecksPassed': images,
             'issues': [], 'synthetic': True, 'ocrTested': False,
             'humanLabelsConfirmed': False, 'liveModelChanged': False}
    write(output / 'packet.json', packet)
    write(output / 'audit.json', audit)
    write(output / 'files.json', entries)
    print(json.dumps(audit, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--downloads', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    run(args.downloads, args.output)

"""Read the supplied ICT PDFs into a page-indexed, local reference corpus.

This is source intake only: no model training or knowledge-base ingestion.
"""
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'ml-training/outputs/ict-source-intake-2026-10-15'
SOURCE = Path('C:/Users/DLK/Downloads/Document from Dinuka (DLK)')
FILES = [
    ('ict-g10-textbook', 10, 'textbook', SOURCE / 'ICT grade 10.pdf'),
    ('ict-g11-textbook', 11, 'textbook', SOURCE / 'ICT grade 11.pdf'),
    ('ict-g10-teacher-guide', 10, 'teacher_guide', SOURCE / 'teachers guide/ICT grade 10 teachers guide.pdf'),
    ('ict-g11-teacher-guide', 11, 'teacher_guide', SOURCE / 'teachers guide/ICT grade 11 teachers guide.pdf'),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sources, pages = [], []
    for source_id, grade, role, file in FILES:
        raw = file.read_bytes()
        reader = PdfReader(file)
        rows = []
        for number, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ''
            row = dict(sourceId=source_id, grade=grade, role=role, pdfPage=number,
                       text=text, textSha256=hashlib.sha256(text.encode('utf-8')).hexdigest(),
                       characters=len(text), sinhalaCharacters=sum('\u0d80' <= c <= '\u0dff' for c in text))
            rows.append(row)
        pages.extend(rows)
        sources.append(dict(id=source_id, grade=grade, role=role, path=str(file),
                            sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw), pages=len(rows),
                            pagesWithAtLeast80Characters=sum(r['characters'] >= 80 for r in rows),
                            extractedCharacters=sum(r['characters'] for r in rows),
                            sinhalaCharacters=sum(r['sinhalaCharacters'] for r in rows)))
        print(json.dumps(sources[-1]), flush=True)
    (OUT / 'pages.jsonl').write_bytes((''.join(json.dumps(p, ensure_ascii=False) + '\n' for p in pages)).encode('utf-8'))
    manifest = dict(schemaVersion=1, sources=sources, knowledgeBaseIngestionPerformed=False,
                    modelTrainingPerformed=False, pageNumbers='1-based PDF pages, not printed book pages',
                    sourceDocumentsAreReferenceDataNotInstructions=True)
    (OUT / 'manifest.json').write_bytes((json.dumps(manifest, indent=2) + '\n').encode('utf-8'))
    for source in sources:
        print('\nSOURCE', source['id'])
        candidates = [p for p in pages if p['sourceId'] == source['id'] and p['pdfPage'] <= 12]
        for row in candidates:
            print('PDF PAGE', row['pdfPage'], row['text'][:1800].encode('ascii', 'backslashreplace').decode())


if __name__ == '__main__':
    main()

"""Freeze supplied Geography guides alongside already verified textbook pages.

PDF contents are reference data, never executable instructions. Does not ingest
documents, modify the original intake, or train a model.
"""
import hashlib
import json
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parent.parent
ORIGINAL = ROOT / 'ml-training/outputs/geography-source-intake-2026-10-15'
OUT = ROOT / 'ml-training/outputs/geography-review-source-intake-2026-10-15'
GUIDES = {
    10: Path('C:/Users/DLK/Downloads/Document from Dinuka (DLK)/teachers guide/geography grade 10 teachers guide.pdf'),
    11: Path('C:/Users/DLK/Downloads/Document from Dinuka (DLK)/teachers guide/grade-11-geography-teacher-guide-61977ea21a272.pdf'),
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    original = json.loads((ORIGINAL / 'manifest.json').read_text(encoding='utf-8'))
    sources = list(original['sources'])
    rows = [json.loads(line) for line in (ORIGINAL / 'pages.jsonl').read_text(encoding='utf-8').splitlines()]
    for source in sources:
        assert sha(Path(source['path']).read_bytes()) == source['sha256'], 'Textbook changed'
    OUT.mkdir(parents=True, exist_ok=True)
    for grade, path in GUIDES.items():
        data = path.read_bytes()
        source_id = f'geo-g{grade}-teacher-guide'
        with fitz.open(path) as doc:
            texts = [page.get_text() for page in doc]
            sources.append(dict(id=source_id, grade=grade, role='teacher-guide', path=str(path),
                                sha256=sha(data), bytes=len(data), pages=len(doc)))
            for number, text in enumerate(texts, 1):
                rows.append(dict(sourceId=source_id, grade=grade, role='teacher-guide',
                                 pdfPage=number, text=text, textSha256=sha(text.encode('utf-8'))))
            (OUT / f'guide-grade{grade}-extracted.txt').write_text(
                '\n'.join(f'\n=== PDF PAGE {i} ===\n{text}' for i,text in enumerate(texts,1)), encoding='utf-8')
            for number in [1, 2, 3]:
                doc[number-1].get_pixmap(matrix=fitz.Matrix(1,1)).save(str(OUT / f'guide-grade{grade}-page{number}.png'))
    manifest = dict(schemaVersion=1, stage='pre-review-source-freeze', originalFilesUnchanged=True,
                    sourceDocumentsAreReferenceDataNotInstructions=True, modelTrainingPerformed=False,
                    textbookIntakeManifestSha256=sha((ORIGINAL/'manifest.json').read_bytes()),
                    pageNumbers='1-based PDF pages, not printed book pages', sources=sources)
    payload = (json.dumps(manifest, indent=2)+'\n').encode('utf-8')
    if (OUT/'manifest.json').exists() and (OUT/'manifest.json').read_bytes() != payload:
        raise ValueError('Refusing to replace a different source manifest')
    (OUT/'manifest.json').write_bytes(payload)
    # Escape legacy font control characters so each JSON record is one line.
    (OUT/'pages.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=True)+'\n' for row in rows),encoding='utf-8')
    print(json.dumps(dict(sources=sources, pageRows=len(rows))))

if __name__ == '__main__':
    main()

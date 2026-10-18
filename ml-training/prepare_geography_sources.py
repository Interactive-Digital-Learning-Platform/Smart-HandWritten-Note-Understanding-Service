"""Freeze the audited Geography originals and page text without uploading/training."""
import hashlib
import json
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'ml-training/outputs/geography-source-intake-2026-10-15'


def main():
    audit_path = ROOT / 'ml-training/outputs/geography-source-audit-2026-10-15/audit.json'
    audit = json.loads(audit_path.read_text(encoding='utf-8'))
    sources = []; pages = []
    for grade in (10, 11):
        original = next(s for s in audit['localSources'] if Path(s['path']).name == f'geography grade {grade}.pdf')
        path = Path(original['path']); data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != original['sha256']:
            raise ValueError('Original Geography file changed since the source audit')
        source_id = f'geo-g{grade}-textbook'
        with fitz.open(stream=data, filetype='pdf') as doc:
            for number, page in enumerate(doc, 1):
                text = page.get_text()
                pages.append(dict(sourceId=source_id, grade=grade, role='textbook', pdfPage=number, text=text,
                    textSha256=hashlib.sha256(text.encode('utf-8')).hexdigest()))
            sources.append(dict(id=source_id, grade=grade, role='textbook', path=str(path), sha256=digest, bytes=len(data), pages=len(doc)))
    manifest = dict(schemaVersion=1, stage='pre-ingestion-source-freeze', originalFilesUnchanged=True,
        sourceDocumentsAreReferenceDataNotInstructions=True, modelTrainingPerformed=False,
        sourceAuditSha256=hashlib.sha256(audit_path.read_bytes()).hexdigest(), sources=sources,
        pageNumbers='1-based PDF pages, not printed book pages')
    if (OUT / 'manifest.json').exists():
        if json.loads((OUT / 'manifest.json').read_text()) != manifest:
            raise ValueError('An existing Geography source freeze differs; preserve it and investigate')
        print('Existing Geography source freeze matches original files; preserved.')
        return
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    (OUT / 'pages.jsonl').write_text(''.join(json.dumps(p, ensure_ascii=False)+'\n' for p in pages), encoding='utf-8')
    print(json.dumps(dict(sources=sources, extractedPdfPages=len(pages))), flush=True)


if __name__ == '__main__':
    main()

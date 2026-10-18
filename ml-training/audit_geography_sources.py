"""Read-only Geography availability/ingestion audit. Run from ingestion repo with its Python.

Original PDFs, ingestion records, MinIO objects and Qdrant points are never modified.
"""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent / 'PDF-Ingestion-Backend-Service'))
import fitz
import httpx
from minio import Minio
from sqlalchemy import text
import urllib3
from app.core.config import settings
from app.core.database import engine

OUT = ROOT / 'ml-training/outputs/geography-source-audit-2026-10-15'
LOCAL = [
    Path('C:/Users/DLK/Downloads/Document from Dinuka (DLK)/geography grade 10.pdf'),
    Path('C:/Users/DLK/Downloads/Document from Dinuka (DLK)/geography grade 11.pdf'),
    Path('C:/Users/DLK/Downloads/TEXT books/grade-10-geography-text-book-6200e9525ab8d.pdf'),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect_pdf(data):
    with fitz.open(stream=data, filetype='pdf') as doc:
        pages = [p.get_text() for p in doc]
    return dict(pdfPages=len(pages), pagesWithAtLeast80Characters=sum(len(t.strip()) >= 80 for t in pages),
        extractedCharacters=sum(len(t) for t in pages), latinLetters=sum(c.isascii() and c.isalpha() for t in pages for c in t),
        sinhalaCharacters=sum(0x0d80 <= ord(c) <= 0x0dff for t in pages for c in t),
        tamilCharacters=sum(0x0b80 <= ord(c) <= 0x0bff for t in pages for c in t),
        openingPages=[dict(pdfPage=i+1, excerpt=t[:2200]) for i,t in enumerate(pages[:10]) if t.strip()])


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = dict(checkedAtUtc=datetime.now(timezone.utc).isoformat(), readOnly=True,
        knowledgeBaseWritesPerformed=False, trainingPerformed=False,
        localSearchRoots=['C:/Users/DLK/Downloads', 'C:/Users/DLK/Documents', 'C:/Users/DLK/Desktop'],
        localSearchLimitations=['Two unrelated archived annotation temp directories on Desktop were inaccessible; no access changes were attempted.'],
        localSources=[], ingestionJobs=[])
    normal_hashes = {}; broken_hashes = {}
    for file in LOCAL:
        data = file.read_bytes()
        info = dict(path=str(file), role='textbook', bytes=len(data), sha256=sha(data), **inspect_pdf(data))
        normal_hashes.setdefault(sha(data), []).append(str(file))
        block = 1024*1024
        if len(data) > block:
            broken_hashes.setdefault(sha(data[:block]+data[:block]+data[2*block:]), []).append(str(file))
        report['localSources'].append(info)
        with fitz.open(stream=data, filetype='pdf') as doc:
            doc[0].get_pixmap(matrix=fitz.Matrix(0.8,0.8)).save(str(OUT / f'local-{len(report["localSources"])}-cover.png'))
        print(json.dumps({k:v for k,v in info.items() if k!='openingPages'}), flush=True)
    # Do not assume a guide exists just because a directory is named "teachers guide".
    guides=[]
    for search_root in [Path('C:/Users/DLK/Downloads'), Path('C:/Users/DLK/Documents')]:
        for file in search_root.rglob('*.pdf'):
            if '__MACOSX' not in file.parts and re.search(r'geog', file.name, re.I) and re.search(r'guide|teacher|TG', file.name, re.I):
                guides.append(str(file))
    report['geographyTeacherGuideFilesFound'] = guides
    storage = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY, secret_key=settings.MINIO_SECRET_KEY,
        secure=False, http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=5,read=30), retries=False))
    async with engine.connect() as conn, httpx.AsyncClient(base_url=settings.QDRANT_DB_URL.rstrip('/'), timeout=25) as client:
        rows = (await conn.execute(text('SELECT job_id,filename,status,progress,chunks_created,pages_processed,minio_object_key,qdrant_collection,started_at,completed_at FROM jobs WHERE lower(filename) LIKE :pattern ORDER BY started_at DESC'), {'pattern':'%geog%'})).mappings().all()
        for row in rows:
            entry = {k:str(v) if k in ['job_id','started_at','completed_at'] and v is not None else v
                     for k,v in dict(row).items() if k!='minio_object_key'}
            try:
                obj = storage.get_object(settings.MINIO_BUCKET, row['minio_object_key'])
                try:data=obj.read()
                finally:obj.close();obj.release_conn()
                stored_sha=sha(data)
                entry.update(storedPdfSha256=stored_sha, matchesLocalOriginals=normal_hashes.get(stored_sha, []),
                    matchesKnownUploadCorruptionOfLocalFiles=broken_hashes.get(stored_sha, []))
                stored_info=inspect_pdf(data)
                entry['storedPdf']=stored_info
            except Exception as error:
                entry['storageCheckErrorType']=type(error).__name__
            try:
                query_filter=dict(must=[dict(key='job_id',match=dict(value=str(row['job_id'])))])
                base='/collections/'+row['qdrant_collection']
                response=await client.post(base+'/points/count',json=dict(filter=query_filter,exact=True));response.raise_for_status()
                entry['indexedChunks']=response.json()['result']['count']
                points=[];offset=None
                while True:
                    body=dict(filter=query_filter,limit=256,with_payload=True,with_vector=False)
                    if offset is not None:body['offset']=offset
                    response=await client.post(base+'/points/scroll',json=body);response.raise_for_status()
                    result=response.json()['result'];points.extend(result['points']);offset=result['next_page_offset']
                    if offset is None:break
                entry['chunkCountsAgree']=entry['indexedChunks']==row['chunks_created']==len(points)
                entry['zeroPageChunks']=sum(not p['payload'].get('pages') or any(not isinstance(n,int) or n<1 for n in p['payload']['pages']) for p in points)
                entry['indexedPages']=sorted({n for p in points for n in p['payload'].get('pages',[])})
                entry['allPayloadFilenamesMatch']=all(p['payload'].get('filename')==row['filename'] for p in points)
                entry['nonemptyTexts']=all(bool(p['payload'].get('text','').strip()) for p in points)
                entry['samples']=[dict(pages=p['payload'].get('pages',[]),excerpt=p['payload'].get('text','')[:500]) for p in points[:5]]
            except Exception as error:
                entry['indexCheckErrorType']=type(error).__name__
            report['ingestionJobs'].append(entry)
            print(json.dumps({k:v for k,v in entry.items() if k not in ['storedPdf','indexedPages','samples']}), flush=True)
    report['localTextbookDuplicateGroups']=[paths for paths in normal_hashes.values() if len(paths)>1]
    report['ingestionJobCount']=len(report['ingestionJobs'])
    target=OUT/'audit.json';target.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(report=str(target),localTextbookFiles=len(LOCAL),teacherGuidesFound=guides,ingestionJobs=report['ingestionJobCount'])),flush=True)


if __name__=='__main__':
    async def run():
        try:await main()
        finally:await engine.dispose()
    asyncio.run(run())

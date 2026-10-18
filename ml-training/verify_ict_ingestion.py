"""Read-only audit of the owner's ICT ingestion. Run with ingestion service Python.

No uploads, indexing, retries, model fitting or database writes are performed.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import re
from difflib import SequenceMatcher
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent.parent
INGESTION=ROOT.parent/'PDF-Ingestion-Backend-Service'
sys.path.insert(0,str(INGESTION))
from sqlalchemy import text
import httpx
import fitz
from minio import Minio
from app.core.config import settings
from app.core.database import engine
from app.pipeline.extractor import PDFExtractor
from app.pipeline.chunker import HierarchicalChunker

BOOKS={10:dict(filename='ICT grade 10.pdf',sourceId='ict-g10-textbook',pages=[53,54,55,138,143,144,145]),
       11:dict(filename='ICT grade 11.pdf',sourceId='ict-g11-textbook',pages=[74,77,80,85,86])}
QUERIES=[(10,'CPU components arithmetic and logic unit control unit registers',[53]),
         (10,'RAM volatile memory ROM startup BIOS instructions',[54]),
         (10,'Cache memory speeds up access between the CPU and primary memory',[55]),
         (10,'Secondary storage saves data permanently for example hard disks',[55,56,57,58]),
         (10,'Operating system manages computer hardware and provides user interface',[138,143]),
         (10,'Operating system process management schedules tasks and allocates CPU time',[144]),
         (10,'Operating system memory management allocates RAM to processes and frees memory',[145]),
         (11,'Internet is interconnected networks World Wide Web is a service with websites and linked pages',[74,80]),
         (11,'Domain name system translates domain names to IP addresses to connect to web server',[77,78]),
         (11,'Email carbon copy Cc blind carbon copy Bcc hidden recipient addresses',[85,86])]


def expected_chunks(path):
    """Replay extraction/chunking, not embedding or indexing, against original bytes."""
    chunker=HierarchicalChunker(settings.CHUNK_SIZE,settings.CHUNK_OVERLAP)
    expected={};buffer=[];page_count=0
    def flush():
        for chunk in chunker.chunk_pages(buffer):
            expected.setdefault(hashlib.sha256(chunk.text.encode()).hexdigest(),chunk)
    for page in PDFExtractor(min_chars=80).extract(str(path)):
        page_count+=1;buffer.append(page)
        if len(buffer)>=settings.PAGE_BATCH_SIZE:
            flush();buffer=buffer[-settings.PAGE_OVERLAP:] if settings.PAGE_OVERLAP else []
    if buffer:flush()
    return expected,page_count


async def main(semantic, jobs_manifest=None, output_dir=None, grades=(10,11)):
    source=json.loads((ROOT/'ml-training/outputs/ict-source-intake-2026-10-15/manifest.json').read_text(encoding='utf-8'))
    hashes={s['id']:s['sha256'] for s in source['sources']}
    source_pages=[json.loads(line) for line in (ROOT/'ml-training/outputs/ict-source-intake-2026-10-15/pages.jsonl').read_text(encoding='utf-8').splitlines()]
    report=dict(checkedAtUtc=datetime.now(timezone.utc).isoformat(),readOnly=True,books=[],semanticQueries=[])
    pinned_jobs={j['grade']:j['jobId'] for j in json.loads(Path(jobs_manifest).read_text())['jobs']} if jobs_manifest else {}
    storage=Minio(settings.MINIO_ENDPOINT,access_key=settings.MINIO_ACCESS_KEY,secret_key=settings.MINIO_SECRET_KEY,secure=False)
    async with engine.connect() as conn, httpx.AsyncClient(base_url=settings.QDRANT_DB_URL.rstrip('/'),timeout=30) as client:
        for grade,book in BOOKS.items():
            if grade not in grades:continue
            condition='job_id=:job' if jobs_manifest else 'lower(filename)=:filename'
            params=dict(job=pinned_jobs[grade]) if jobs_manifest else dict(filename=book['filename'].lower())
            result=await conn.execute(text('SELECT job_id,filename,status,progress,chunks_created,pages_processed,minio_object_key,qdrant_collection,completed_at FROM jobs WHERE '+condition+' ORDER BY started_at DESC LIMIT 1'),params)
            row=dict(result.mappings().one())
            obj=storage.get_object(settings.MINIO_BUCKET,row['minio_object_key'])
            digest=hashlib.sha256()
            pdf_bytes=bytearray()
            try:
                for block in obj.stream(1024*1024):
                    digest.update(block);pdf_bytes.extend(block)
            finally:
                obj.close();obj.release_conn()
            original_source=next(s for s in source['sources'] if s['id']==book['sourceId'])
            original_bytes=Path(original_source['path']).read_bytes()
            block_size=1024*1024
            broken_upload=original_bytes[:block_size]+original_bytes[:block_size]+original_bytes[2*block_size:]
            matches_known_upload_bug=hashlib.sha256(broken_upload).hexdigest()==digest.hexdigest()
            with fitz.open(stream=bytes(pdf_bytes),filetype='pdf') as doc:
                uploaded_pages=[page.get_text() for page in doc]
            normalize=lambda value: re.sub(r'\s+',' ',value).strip().lower()
            normalized_pages=[normalize(value) for value in uploaded_pages]
            page_words=[set(value.split()) for value in normalized_pages]
            page_matches=[]
            for number in book['pages']:
                original=next(p['text'] for p in source_pages if p['sourceId']==book['sourceId'] and p['pdfPage']==number)
                original=normalize(original)
                original_words=set(original.split())
                shortlist=sorted(range(len(page_words)),key=lambda idx: len(original_words & page_words[idx])/max(1,len(original_words | page_words[idx])),reverse=True)[:5]
                candidates=sorted(((SequenceMatcher(None,original,normalized_pages[idx]).ratio(),idx+1) for idx in shortlist),reverse=True)[:2]
                page_matches.append(dict(originalPdfPage=number,candidates=[dict(uploadedPdfPage=idx,textSimilarity=round(score,4),excerpt=uploaded_pages[idx-1][:500]) for score,idx in candidates]))
            query_filter=dict(must=[dict(key='job_id',match=dict(value=str(row['job_id'])))])
            base='/collections/'+row['qdrant_collection']
            response=await client.post(base+'/points/count',json=dict(filter=query_filter,exact=True))
            response.raise_for_status();count=response.json()['result']['count']
            points=[];offset=None
            while True:
                body=dict(filter=query_filter,limit=256,with_payload=True,with_vector=False)
                if offset is not None:body['offset']=offset
                response=await client.post(base+'/points/scroll',json=body);response.raise_for_status()
                data=response.json()['result'];points.extend(data['points']);offset=data['next_page_offset']
                if offset is None:break
            pages=sorted({int(page) for p in points for page in p['payload'].get('pages',[])})
            expected,expected_page_count=expected_chunks(original_source['path'])
            actual_hashes=set();attribution_errors=[]
            for p in points:
                payload=p['payload'];fingerprint=hashlib.sha256(payload.get('text','').encode()).hexdigest()
                actual_hashes.add(fingerprint)
                expected_chunk=expected.get(fingerprint)
                if expected_chunk is None or payload.get('pages')!=expected_chunk.metadata['pages'] or payload.get('page_start')!=expected_chunk.metadata['page_start']:
                    attribution_errors.append(dict(chunkId=p['id'],actualPages=payload.get('pages'),expectedPages=expected_chunk.metadata['pages'] if expected_chunk else None))
            entry=dict(grade=grade,jobId=str(row['job_id']),filename=row['filename'],status=row['status'],progress=row['progress'],
                chunksReported=row['chunks_created'],indexedChunks=count,pagesProcessed=row['pages_processed'],
                completedAtUtc=str(row['completed_at']),storedPdfSha256=digest.hexdigest(),
                matchesTrainingSourcePdf=digest.hexdigest()==hashes[book['sourceId']],
                matchesFirstBlockDuplicationBug=matches_known_upload_bug,
                uploadedPdfPages=len(uploaded_pages),
                uploadedPdfSinhalaCharacters=sum(0x0d80<=ord(c)<=0x0dff for text_value in uploaded_pages for c in text_value),
                uploadedFirstPageExcerpt=uploaded_pages[0][:500],
                originalToUploadedPageMatches=page_matches,
                indexedPages=pages,requiredModelSourcePages=book['pages'],missingModelSourcePages=sorted(set(book['pages'])-set(pages)),
                allPayloadFilenamesMatch=all(p['payload'].get('filename')==row['filename'] for p in points),
                nonemptyPayloadTexts=all(bool(p['payload'].get('text','').strip()) for p in points),
                zeroPageChunkCount=sum(0 in p['payload'].get('pages',[]) for p in points),
                expectedChunksFromOriginal=len(expected),expectedExtractedPages=expected_page_count,
                allExpectedChunksIndexed=actual_hashes==set(expected),
                pageAttributionErrors=attribution_errors,
                allChunkPageReferencesMatchOriginal=not attribution_errors,
                indexedConceptSamples=[dict(pages=p['payload'].get('pages',[]),excerpt=p['payload']['text'][:1800]) for p in points if re.search(r'arithmetic|domain name|carbon copy|memory management',p['payload'].get('text',''),re.I)][:12],
                sourcePageSamples=[dict(page=number,chunkId=p['id'],indexedPages=p['payload']['pages'],excerpt=p['payload']['text'][:240])
                    for number in book['pages'] for p in points if number in p['payload'].get('pages',[])][:12])
            report['books'].append(entry)
            print(json.dumps({k:v for k,v in entry.items() if k not in ['indexedPages','sourcePageSamples','originalToUploadedPageMatches','indexedConceptSamples','pageAttributionErrors']}),flush=True)
        if semantic:
            import torch
            torch.set_num_threads(2)
            from app.pipeline.embedder import EmbeddingGenerator
            embedder=EmbeddingGenerator()
            for grade,query,expected_pages in QUERIES:
                if grade not in grades:continue
                book=next(b for b in report['books'] if b['grade']==grade)
                vector=embedder.embed_single(query)
                response=await client.post('/collections/'+settings.DEFAULT_COLLECTION+'/points/query',json=dict(query=vector,
                    filter=dict(must=[dict(key='job_id',match=dict(value=book['jobId']))]),limit=5,with_payload=True,with_vector=False))
                response.raise_for_status();hits=response.json()['result']['points']
                report['semanticQueries'].append(dict(grade=grade,query=query,expectedPages=expected_pages,
                    expectedPageInTop5=any(set(expected_pages)&set(p['payload'].get('pages',[])) for p in hits),
                    hits=[dict(score=p['score'],filename=p['payload'].get('filename'),pages=p['payload'].get('pages'),text=p['payload'].get('text','')) for p in hits]))
                print(json.dumps(dict(grade=grade,query=query,expectedPageInTop5=report['semanticQueries'][-1]['expectedPageInTop5'])),flush=True)
    report['sourceAndIndexChecksPassed']=all(b['status']=='done' and b['progress']==100 and b['matchesTrainingSourcePdf'] and b['indexedChunks']==b['chunksReported']==b['expectedChunksFromOriginal'] and b['pagesProcessed']==b['expectedExtractedPages'] and b['allExpectedChunksIndexed'] and b['allChunkPageReferencesMatchOriginal'] and not b['zeroPageChunkCount'] and not b['missingModelSourcePages'] and b['allPayloadFilenamesMatch'] and b['nonemptyPayloadTexts'] for b in report['books'])
    report['semanticRetrievalChecked']=semantic
    report['allSemanticExpectedPagesInTop5']=all(q['expectedPageInTop5'] for q in report['semanticQueries']) if semantic else None
    out=Path(output_dir) if output_dir else ROOT/'ml-training/outputs/ict-ingestion-verification-2026-10-15';out.mkdir(parents=True,exist_ok=True)
    file=out/('semantic-audit.json' if semantic else 'source-index-audit.json')
    file.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(report=str(file),sourceAndIndexChecksPassed=report['sourceAndIndexChecksPassed'],
        semanticRetrievalChecked=semantic,allSemanticExpectedPagesInTop5=report['allSemanticExpectedPagesInTop5'])),flush=True)
    return report['sourceAndIndexChecksPassed'] and (not semantic or report['allSemanticExpectedPagesInTop5'])


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--semantic',action='store_true')
    parser.add_argument('--grades',type=int,nargs='+',choices=[10,11],default=[10,11])
    parser.add_argument('--jobs-manifest');parser.add_argument('--output-dir');args=parser.parse_args()
    async def run():
        try:return await main(args.semantic,args.jobs_manifest,args.output_dir,args.grades)
        finally:await engine.dispose()
    sys.exit(0 if asyncio.run(run()) else 2)

"""Verify replacement Geography jobs against original bytes and exact chunk/page replay.

Read-only database, MinIO and Qdrant operations; no re-indexing or fitting.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from verify_ict_ingestion import expected_chunks, engine, settings
from sqlalchemy import text
import fitz
import httpx
from minio import Minio
import urllib3

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'ml-training/outputs/geography-source-intake-2026-10-15'
OUT = ROOT / 'ml-training/outputs/geography-ingestion-reingest-2026-10-15'
QUERY_FILE = SOURCE / 'retrieval-checks.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


async def main(semantic, grades):
    sources = json.loads((SOURCE / 'manifest.json').read_text())['sources']
    jobs = json.loads((OUT / 'jobs.json').read_text())['jobs']
    queries = json.loads(QUERY_FILE.read_text())['queries']
    report = dict(checkedAtUtc=datetime.now(timezone.utc).isoformat(), readOnly=True, trainingPerformed=False,
        sourceManifestSha256=sha((SOURCE/'manifest.json').read_bytes()),
        retrievalChecksSha256=sha(QUERY_FILE.read_bytes()), books=[], semanticQueries=[])
    storage = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY, secret_key=settings.MINIO_SECRET_KEY,
        secure=False, http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=5,read=30), retries=False))
    async with engine.connect() as conn, httpx.AsyncClient(base_url=settings.QDRANT_DB_URL.rstrip('/'), timeout=30) as client:
        for grade in grades:
            source = next(s for s in sources if s['grade']==grade)
            job = next(j for j in jobs if j['grade']==grade)
            row = (await conn.execute(text('SELECT job_id,filename,status,progress,chunks_created,pages_processed,minio_object_key,qdrant_collection,completed_at FROM jobs WHERE job_id=:id'), {'id':job['jobId']})).mappings().one()
            original = Path(source['path']).read_bytes()
            if sha(original)!=source['sha256'] or job['sourceSha256']!=source['sha256']:
                raise ValueError('Original or submitted Geography source differs from source freeze')
            obj = storage.get_object(settings.MINIO_BUCKET,row['minio_object_key'])
            try:stored=obj.read()
            finally:obj.close();obj.release_conn()
            with fitz.open(stream=stored,filetype='pdf') as doc:
                pdf_pages=len(doc)
            query_filter=dict(must=[dict(key='job_id',match=dict(value=job['jobId']))])
            base='/collections/'+row['qdrant_collection']
            response=await client.post(base+'/points/count',json=dict(filter=query_filter,exact=True));response.raise_for_status()
            count=response.json()['result']['count']
            points=[];offset=None
            while True:
                body=dict(filter=query_filter,limit=256,with_payload=True,with_vector=False)
                if offset is not None:body['offset']=offset
                response=await client.post(base+'/points/scroll',json=body);response.raise_for_status()
                result=response.json()['result'];points.extend(result['points']);offset=result['next_page_offset']
                if offset is None:break
            expected,extracted=expected_chunks(source['path'])
            actual_hashes=set();errors=[]
            for point in points:
                payload=point['payload'];fingerprint=sha(payload.get('text','').encode())
                actual_hashes.add(fingerprint);chunk=expected.get(fingerprint)
                if chunk is None or payload.get('pages')!=chunk.metadata['pages'] or payload.get('page_start')!=chunk.metadata['page_start']:
                    errors.append(dict(chunkId=point['id'],actualPages=payload.get('pages'),expectedPages=chunk.metadata['pages'] if chunk else None))
            indexed_pages=sorted({p for point in points for p in point['payload'].get('pages',[])})
            required=sorted({p for q in queries if q['grade']==grade for p in q['expectedPdfPages']})
            entry=dict(grade=grade,jobId=job['jobId'],filename=row['filename'],status=row['status'],progress=row['progress'],
                collection=row['qdrant_collection'],completedAtUtc=str(row['completed_at']),
                originalPdfSha256=source['sha256'],storedPdfSha256=sha(stored),storedPdfMatchesOriginal=sha(stored)==source['sha256'],
                storedPdfPages=pdf_pages,expectedPdfPages=source['pages'],pagesProcessed=row['pages_processed'],expectedExtractedPages=extracted,
                chunksReported=row['chunks_created'],indexedChunks=count,expectedChunks=len(expected),
                chunkCountsMatch=count==len(points)==row['chunks_created']==len(expected),
                allExpectedChunkTextsIndexed=actual_hashes==set(expected),allChunkPageReferencesMatchOriginal=not errors,
                pageReferenceErrors=errors,invalidPageChunks=sum(not p['payload'].get('pages') or any(not isinstance(n,int) or n<1 or n>pdf_pages for n in p['payload']['pages']) for p in points),
                indexedPages=indexed_pages,requiredCheckPages=required,missingCheckPages=sorted(set(required)-set(indexed_pages)),
                allPayloadFilenamesMatch=all(p['payload'].get('filename')==row['filename']==job['filename'] for p in points),
                allPayloadTextsNonempty=all(bool(p['payload'].get('text','').strip()) for p in points))
            entry['passed']=entry['status']=='done' and entry['progress']==100 and entry['storedPdfMatchesOriginal'] and pdf_pages==source['pages'] and row['pages_processed']==extracted and entry['chunkCountsMatch'] and entry['allExpectedChunkTextsIndexed'] and not errors and not entry['invalidPageChunks'] and not entry['missingCheckPages'] and entry['allPayloadFilenamesMatch'] and entry['allPayloadTextsNonempty']
            report['books'].append(entry)
            print(json.dumps({k:v for k,v in entry.items() if k not in ['pageReferenceErrors','indexedPages']}),flush=True)
        if semantic:
            import torch
            torch.set_num_threads(2)
            from app.pipeline.embedder import EmbeddingGenerator
            embedder=EmbeddingGenerator()
            for query in queries:
                if query['grade'] not in grades:continue
                book=next(b for b in report['books'] if b['grade']==query['grade'])
                response=await client.post('/collections/'+book['collection']+'/points/query',json=dict(query=embedder.embed_single(query['text']),
                    filter=dict(must=[dict(key='job_id',match=dict(value=book['jobId']))]),limit=5,with_payload=True,with_vector=False))
                response.raise_for_status();hits=response.json()['result']['points']
                matches=[]
                for rank,hit in enumerate(hits,1):
                    payload=hit['payload'];normalized=' '.join(payload.get('text','').lower().split())
                    if set(query['expectedPdfPages']) & set(payload.get('pages',[])) and all(term.lower() in normalized for term in query['requiredTerms']):matches.append(rank)
                checked=dict(**query,passed=bool(matches),firstMatchingRank=matches[0] if matches else None,
                    hits=[dict(score=h['score'],jobId=h['payload'].get('job_id'),filename=h['payload'].get('filename'),pdfPages=h['payload'].get('pages'),text=h['payload'].get('text','')) for h in hits])
                report['semanticQueries'].append(checked)
                print(json.dumps({k:v for k,v in checked.items() if k!='hits'}),flush=True)
    report['sourceAndIndexChecksPassed']=len(report['books'])==len(grades) and all(b['passed'] for b in report['books'])
    report['semanticRetrievalChecked']=semantic
    report['allRetrievalChecksPassed']=all(q['passed'] for q in report['semanticQueries']) if semantic else None
    suffix='' if set(grades)=={10,11} else '-grade'+'-'.join(map(str,grades))
    output=OUT/(('semantic-audit' if semantic else 'source-index-audit')+suffix+'.json')
    output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(report=str(output),sourceAndIndexChecksPassed=report['sourceAndIndexChecksPassed'],semanticRetrievalChecked=semantic,allRetrievalChecksPassed=report['allRetrievalChecksPassed'])),flush=True)
    return report['sourceAndIndexChecksPassed'] and (not semantic or report['allRetrievalChecksPassed'])


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--semantic',action='store_true')
    parser.add_argument('--grades',type=int,nargs='+',choices=[10,11],default=[10,11]);args=parser.parse_args()
    async def run():
        try:return await main(args.semantic,args.grades)
        finally:await engine.dispose()
    sys.exit(0 if asyncio.run(run()) else 2)

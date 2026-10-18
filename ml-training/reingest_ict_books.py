"""Explicitly upload the two frozen ICT originals, or read their replacement-job status.

Run with the ingestion Python environment and ingestion repository as cwd.
Existing jobs and their data are preserved. A saved job is never uploaded twice.
"""
import argparse
import asyncio
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent / 'PDF-Ingestion-Backend-Service'))
import httpx
from sqlalchemy import text
from app.core.database import engine

OUT = ROOT / 'ml-training/outputs/ict-ingestion-reingest-2026-10-15'
MANIFEST = OUT / 'jobs.json'
OLD_JOBS = {10: 'fc0e19ef-0642-4911-88ef-39efe2299775', 11: '77425e33-af60-4214-8dfa-85c04a5cb685'}
SOURCE_MANIFEST = ROOT / 'ml-training/outputs/ict-source-intake-2026-10-15/manifest.json'
SOURCE_ID_PREFIX = 'ict'


async def run(submit):
    OUT.mkdir(parents=True, exist_ok=True)
    report = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else dict(
        startedAtUtc=datetime.now(timezone.utc).isoformat(), preservesPreviousJobs=True, jobs=[])
    async with engine.connect() as conn, httpx.AsyncClient(timeout=180) as client:
        if submit:
            health = await client.get('http://127.0.0.1:8001/')
            health.raise_for_status()
            sources = json.loads(SOURCE_MANIFEST.read_text())['sources']
            for grade, previous in OLD_JOBS.items():
                if any(job['grade'] == grade for job in report['jobs']):
                    continue
                source = next(s for s in sources if s['id'] == f'{SOURCE_ID_PREFIX}-g{grade}-textbook')
                path = Path(source['path'])
                if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
                    raise ValueError('Original PDF does not match frozen source hash')
                row = (await conn.execute(text('SELECT user_id,filename FROM jobs WHERE job_id=:job'), {'job': previous})).mappings().one()
                with ExitStack() as stack:
                    file = stack.enter_context(path.open('rb'))
                    response = await client.post('http://127.0.0.1:8001/ingest/upload',
                        data={'user_id': row['user_id']}, files={'files': (row['filename'], file, 'application/pdf')})
                response.raise_for_status()
                created = response.json()['jobs']
                if len(created) != 1:
                    raise ValueError('Unexpected number of created jobs')
                job = dict(grade=grade, jobId=created[0]['job_id'], filename=row['filename'],
                    sourceSha256=source['sha256'], previousJobId=previous)
                report['jobs'].append(job)
                MANIFEST.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
                print(json.dumps(dict(submitted=True, **job)), flush=True)
        for job in report['jobs']:
            row = (await conn.execute(text('SELECT status,progress,current_stage,chunks_created,pages_processed,completed_at,error_message FROM jobs WHERE job_id=:job'), {'job': job['jobId']})).mappings().one()
            job['lastStatus'] = {key: str(value) if key == 'completed_at' and value else value for key, value in row.items()}
            print(json.dumps(dict(grade=job['grade'], jobId=job['jobId'], **job['lastStatus'])), flush=True)
    report['lastCheckedAtUtc'] = datetime.now(timezone.utc).isoformat()
    MANIFEST.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--submit', action='store_true', help='Upload originals only for grades without a saved replacement job')
    parser.add_argument('--wait', action='store_true', help='Read progress every 30 seconds until both jobs finish, up to 30 minutes')
    args = parser.parse_args()
    async def main():
        try:
            report = await run(args.submit)
            if args.wait:
                for _ in range(60):
                    if len(report['jobs']) != 2:
                        raise ValueError('Expected two replacement jobs')
                    statuses = [job['lastStatus']['status'] for job in report['jobs']]
                    if 'failed' in statuses:
                        raise RuntimeError('A replacement job failed; inspect saved status')
                    if all(status == 'done' for status in statuses):
                        return
                    await asyncio.sleep(30)
                    report = await run(False)
                raise TimeoutError('Jobs did not complete within 30 minutes')
        finally:
            await engine.dispose()
    asyncio.run(main())

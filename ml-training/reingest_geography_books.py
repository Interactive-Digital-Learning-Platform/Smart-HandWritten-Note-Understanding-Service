"""Re-ingest the two hash-verified Geography originals, preserving prior jobs.

Uses the existing bounded uploader with Geography-specific source and job bindings.
Run using ingestion Python from the ingestion repository.
"""
import argparse
import asyncio
import reingest_ict_books as uploader

uploader.OUT = uploader.ROOT / 'ml-training/outputs/geography-ingestion-reingest-2026-10-15'
uploader.MANIFEST = uploader.OUT / 'jobs.json'
uploader.SOURCE_MANIFEST = uploader.ROOT / 'ml-training/outputs/geography-source-intake-2026-10-15/manifest.json'
uploader.SOURCE_ID_PREFIX = 'geo'
uploader.OLD_JOBS = {10: '2c02d9f6-5f8e-4ad1-8754-2d2e4f1e301c', 11: 'd38d0ebf-6029-4356-b889-93ebbe474a86'}


async def main(submit, wait):
    try:
        report = await uploader.run(submit)
        if wait:
            for _ in range(60):
                if len(report['jobs']) != 2:
                    raise ValueError('Expected two Geography replacement jobs')
                statuses = [j['lastStatus']['status'] for j in report['jobs']]
                if 'failed' in statuses:
                    raise RuntimeError('A Geography job failed; inspect saved status')
                if all(status == 'done' for status in statuses):
                    return
                await asyncio.sleep(30)
                report = await uploader.run(False)
            raise TimeoutError('Geography ingestion did not finish within 30 minutes')
    finally:
        await uploader.engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--submit', action='store_true')
    parser.add_argument('--wait', action='store_true')
    args = parser.parse_args()
    asyncio.run(main(args.submit, args.wait))

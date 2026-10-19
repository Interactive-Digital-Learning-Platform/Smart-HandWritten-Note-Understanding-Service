"""Read-only local ingestion/auth/schema checks; run from the v2 checkout."""
import json
from pathlib import Path
import sys
from urllib.parse import urlparse
import httpx

sys.path.insert(0, str(Path.cwd()))
from app.core.config import settings

assert urlparse(settings.QDRANT_DB_URL).hostname in {"127.0.0.1", "localhost"}
notes = Path(__file__).resolve().parents[2]
intake = json.loads((notes / "tmp/kb-v2-local/jobs.json").read_text())
collection = settings.QDRANT_DB_URL.rstrip("/") + "/collections/pdf_knowledge_base_v2"
with httpx.Client(timeout=30) as client:
    unauthenticated = client.get(collection)
    assert unauthenticated.status_code in {401, 403}, "Qdrant must require authentication"
    headers = {"api-key": settings.QDRANT_API_KEY}
    response = client.get(collection, headers=headers)
    response.raise_for_status()
    info = response.json()["result"]
    params = info["config"]["params"]
    assert params["vectors"]["dense"]["size"] == 768
    assert params["vectors"]["dense"]["distance"] == "Cosine"
    assert "bm25" in params["sparse_vectors"]
    assert info["config"]["strict_mode_config"]["enabled"]
    assert set(info["payload_schema"]) >= {"job_id", "filename", "subject", "grade", "chapter", "chunk_index"}
    invalid_filter = client.post(collection + "/points/scroll", headers=headers, json={
        "limit": 1, "filter": {"must": [{"key": "pages", "match": {"value": 1}}]}})
    assert invalid_filter.status_code == 400, "Unindexed page filters must be rejected"
    response = client.get("http://127.0.0.1:8011/ingest/jobs")
    response.raise_for_status()
    jobs = {job["job_id"]: job for job in response.json()["jobs"]}
    books = []
    for source in intake["jobs"]:
        job = jobs[source["jobId"]]
        assert job["status"] == "done" and job["chunks_created"] > 0
        books.append({**source, "status": job["status"], "chunks": job["chunks_created"],
                      "pagesProcessed": job["pages_processed"]})
    assert sum(book["chunks"] for book in books) == info["points_count"]
report = {"collection": "pdf_knowledge_base_v2", "points": info["points_count"],
          "apiKeyRequired": True, "unindexedFiltersRejected": True, "strictMode": True,
          "books": books, "valid": True}
destination = notes / "tmp/kb-v2-local/verification.json"
destination.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))

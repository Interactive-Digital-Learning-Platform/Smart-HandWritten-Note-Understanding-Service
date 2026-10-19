"""Upload the supplied Science/History PDFs only to the isolated local v2 API."""
import hashlib
import json
from pathlib import Path
import sys
import httpx

root = Path(__file__).resolve().parents[3]
out = root / "Smart-HandWritten-Note-Understanding-Service/tmp/kb-v2-local"
out.mkdir(parents=True, exist_ok=True)
report_file = out / "jobs.json"
if report_file.exists():
    raise RuntimeError("Intake already recorded; inspect jobs.json instead of uploading duplicates")
downloads = Path.home() / "Downloads"
done = downloads / "Document from Dinuka (DLK)/done"
sources = [
    (downloads / "TEXT books/grade-10-science-text-book-v1.pdf", "Science", 10),
    (downloads / "TEXT books/grade-10-history-text-book-64017cf286c01.pdf", "History", 10),
    (done / "science grade 11 part 1.pdf", "Science", 11),
    (done / "science grade 11 part 2.pdf", "Science", 11),
    (done / "histoy grade 11.pdf", "History", 11),
]
assert all(p.is_file() and p.stat().st_size > 10000 for p, _, _ in sources), "Missing textbook"
rows = []
with httpx.Client(base_url="http://127.0.0.1:8011", timeout=120) as client:
    client.get("/").raise_for_status()
    for file, subject, grade in sources:
        with file.open("rb") as stream:
            response = client.post("/ingest/upload", files={"files": (file.name, stream, "application/pdf")},
                data={"user_id": "notes-local-v2-admin", "metadata": json.dumps([{"subject": subject, "grade": grade}])})
        response.raise_for_status()
        job = response.json()["jobs"][0]
        row = dict(jobId=job["job_id"], filename=file.name, subject=subject, grade=grade,
            sha256=hashlib.sha256(file.read_bytes()).hexdigest(), status=job["status"])
        rows.append(row)
        report_file.write_text(json.dumps({"collection": "pdf_knowledge_base_v2", "api": "http://127.0.0.1:8011", "jobs": rows}, indent=2)+"\n", encoding="utf-8")
        print(json.dumps(row), flush=True)

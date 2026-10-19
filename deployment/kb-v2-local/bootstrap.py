"""Apply only upstream 006/007 to isolated local v2, preserving all v1 data."""
import importlib.util
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

repo = Path.cwd()
sys.path.insert(0, str(repo))
sys.path.insert(0, str(repo / "qdrant-migrations"))
from app.core.config import settings
from _lib.runner_support import get_pg_engine, get_applied_revisions, record_applied
from qdrant_client import QdrantClient
from qdrant_client.models import StrictModeConfig

assert urlparse(settings.QDRANT_DB_URL).hostname in {"127.0.0.1", "localhost"}, "Local endpoints only"
assert urlparse(settings.DB_URL).hostname in {"127.0.0.1", "localhost"}, "Local databases only"
assert settings.DEFAULT_COLLECTION == "pdf_knowledge_base_v2"
client = QdrantClient(url=settings.QDRANT_DB_URL, api_key=settings.QDRANT_API_KEY, timeout=30)
engine = get_pg_engine()
try:
    applied = get_applied_revisions(engine)
    for revision in ("006", "007"):
        file = next((repo / "qdrant-migrations").glob(revision + "_*.py"))
        spec = importlib.util.spec_from_file_location("local_" + revision, file)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.upgrade(client)
        if revision not in applied:
            record_applied(engine, revision, module.DESCRIPTION)
    client.update_collection(settings.DEFAULT_COLLECTION, strict_mode_config=StrictModeConfig(
        enabled=True, unindexed_filtering_retrieve=False))
    info = client.get_collection(settings.DEFAULT_COLLECTION)
    print(json.dumps({"collection": settings.DEFAULT_COLLECTION, "migrations": ["006", "007"],
        "points": info.points_count, "indexes": sorted(info.payload_schema), "strictMode": True,
        "v1CollectionsModified": False}))
finally:
    client.close()
    engine.dispose()

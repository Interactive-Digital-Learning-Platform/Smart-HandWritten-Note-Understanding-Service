"""Configure Notes for the isolated local services; save one ignored rollback copy."""
from pathlib import Path
import re
from dotenv import dotenv_values

notes = Path(__file__).resolve().parents[2]
values = dotenv_values(Path(__file__).with_name(".env.local"))
file = notes / ".env"
raw = file.read_bytes()
backup = notes / "tmp/kb-v2-local/notes-env-before"
backup.parent.mkdir(parents=True, exist_ok=True)
if not backup.exists():
    backup.write_bytes(raw)
text = raw.decode("utf-8")
settings = dict(QDRANT_DB_URL="http://127.0.0.1:6335", QDRANT_COLLECTION="pdf_knowledge_base_v2",
    QDRANT_API_KEY=values["LOCAL_QDRANT_API_KEY"], QDRANT_PAYLOAD_PAGE_BASE="1",
    CURRICULUM_DB_URL=f"postgresql://notes_ingestion:{values['LOCAL_DB_PASSWORD']}@127.0.0.1:5433/notes_ingestion_v2")
for key, value in settings.items():
    pattern = rf"^{key}\s*=.*$"
    text = re.sub(pattern, lambda _: f"{key}={value}", text, flags=re.M) if re.search(pattern, text, re.M) else text + f"\n{key}={value}\n"
file.write_text(text, encoding="utf-8")
print("Notes configured for isolated local v2; previous environment preserved in ignored tmp.")

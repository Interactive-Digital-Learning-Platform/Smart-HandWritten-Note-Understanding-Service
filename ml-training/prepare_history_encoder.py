"""Download public pinned safetensors encoder; never upload note text."""
import hashlib
import json
import os
from pathlib import Path
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
from huggingface_hub import HfApi,snapshot_download
ROOT=Path(__file__).resolve().parent


if __name__=='__main__':
    repo='sentence-transformers/all-MiniLM-L6-v2'
    info=HfApi(token=False).model_info(repo)
    directory=ROOT/'encoders/minilm-l6-v2'/info.sha
    snapshot_download(repo_id=repo,revision=info.sha,local_dir=directory,token=False,
        allow_patterns=['config.json','model.safetensors','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','1_Pooling/config.json','sentence_bert_config.json','LICENSE','README.md'])
    files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}
    report={'repoId':repo,'revision':info.sha,'localPath':str(directory),'files':files,'trustRemoteCode':False,'weightsFormat':'safetensors','noteTextUploaded':False}
    (ROOT/'encoders/minilm-l6-v2/encoder-manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'repoId':repo,'revision':info.sha,'files':list(files)},indent=2))

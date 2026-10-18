"""Validate a relocatable inference-only bundle, leaving frozen modules intact."""
import hashlib
import json
from pathlib import Path, PurePosixPath

SCIENCE_SHA = 'af9c5f0aeb326bb59f3ffc80ddecb61c251f0e02bdebfe9d272a98b8df16ef63'
HISTORY_SHA = '12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8'
ICT_SHA = 'df42a138824f57fec3339ecb973f643cebf8899d7eaba902d5adfb40d4a3b74b'
ICT_SOURCES = {
    'ict_coverage_v11': '3f79b908990ca6172ec34e7b468468995e06caa60f61469bc9dfe527219ec915',
    'ict_coverage': '67db865c81c652f85c7d9c46a2723a704c4de3c478f9d3e511331019bc57ea2a',
    'ict_coverage_v3': '1175a637f8674428c6785183ea6911cc0bcac53cabb713d3d2a07e78d106da47',
    'ict_coverage_v31': '9b1ae974bb0d288481c96ccba9c65ae3b01d57697c3be6d7b72e8f227a246941',
    'english_coverage': 'bb042a83caee169ecd8bcaa00b90be9ce6fab8d853856263e867c0c651c86138',
}
HISTORY_SOURCES = {
    'history_coverage_v31': 'e48e770989a35e133e2f91d5d5753fd8831acd26a2d60c368bf9ff74ed83ad77',
    'history_coverage': 'b8312aabc6c3e800b3c239d7aee2459c11950e5418ab9c5ceac2d873e6020cdd',
    'history_semantic': '46f4a478078529f13d4f4de9dd5891dca523d085e16565b8214d0ddc9aa0d067',
    'history_semantic_core': '9baeed03091ac7b308be4a8e4d4841684fd7a0033bea724474d8c2a688154a48',
    'history_semantic_review': 'db14d92754529a93289fb836fedbf4c80f1c7237e4ed415734663f43c3f7b9d4',
}


def contained(root, relative):
    p = PurePosixPath(relative)
    if not relative or p.is_absolute() or '..' in p.parts or ':' in relative or '\\' in relative:
        raise ValueError('Invalid bundle path')
    resolved = (Path(root) / relative).resolve()
    if not resolved.is_relative_to(Path(root).resolve()):
        raise ValueError('Bundle file escapes root')
    return resolved


def load_bundle(root):
    root = Path(root).resolve()
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Unsupported runtime bundle')
    for name, expected in manifest['files'].items():
        if hashlib.sha256(contained(root, name).read_bytes()).hexdigest() != expected:
            raise ValueError('Runtime bundle integrity failure')
    for name, expected in [('science', SCIENCE_SHA), ('history', HISTORY_SHA), ('ict', ICT_SHA)]:
        subject = manifest['subjects'][name]
        if subject['sha256'] != expected or manifest['files'].get(subject['model']) != expected:
            raise ValueError('Unexpected bundled model')
    for name, expected in {**HISTORY_SOURCES, **ICT_SOURCES}.items():
        if manifest['files'].get(f'ml-training/src/smart_note_training/{name}.py') != expected:
            raise ValueError('Unexpected frozen History source')
    encoder_file = manifest['encoder']['manifest']
    if encoder_file not in manifest['files'] or manifest['encoder']['revision'] != '1110a243fdf4706b3f48f1d95db1a4f5529b4d41':
        raise ValueError('Unexpected bundled encoder')
    encoder = json.loads(contained(root, encoder_file).read_text(encoding='utf-8'))
    for name, expected in encoder['files'].items():
        relative = f"{manifest['encoder']['directory']}/{name}"
        contained(root, relative)
        if manifest['files'].get(relative) != expected:
            raise ValueError('Unexpected bundled encoder file')
    return root, manifest

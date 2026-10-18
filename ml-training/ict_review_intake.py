"""Validate submitted labels against the frozen ICT packet, never execute them."""
from collections import Counter
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
PACKET = ROOT / 'outputs/ict-coverage-source-review-01-2026-10-15/packet.json'
FREEZE = PACKET.parent / 'freeze.json'


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def validate(packet, submitted):
    for key in ['version', 'packetSha256', 'sourceHashes', 'synthetic', 'realHandwritingIncluded', 'purpose', 'modelTrained', 'knowledgeBaseIngested']:
        if submitted.get(key) != packet[key]:
            raise ValueError('Frozen review identity changed: ' + key)
    if submitted.get('reviewComplete') is not True or not isinstance(submitted.get('reviewerName'), str) or not submitted['reviewerName'].strip():
        raise ValueError('Incomplete review')
    expected_sources = {r['id']: r for r in packet['sources']}
    if len(submitted.get('sources', [])) != len(expected_sources) or {r['id'] for r in submitted['sources']} != set(expected_sources):
        raise ValueError('Source document identities changed')
    for row in submitted['sources']:
        original_url = expected_sources[row['id']]['url']
        if row['url'] != original_url:
            # A display link may be made portable without changing source identity.
            # Never follow a submitted link; all source reads use the frozen manifest.
            name = Path(unquote(urlparse(original_url).path)).name
            if row.get('originalPacketUrl') != original_url or unquote(row['url']) != name:
                raise ValueError('Unrecognized source link change')
    for section, editable in [('concepts', {'criterionReview', 'criterionComment'}), ('examples', {'humanLabel', 'comment'})]:
        original = {row['id']: row for row in packet[section]}
        actual = submitted[section]
        if len(actual) != len(original) or {r['id'] for r in actual} != set(original):
            raise ValueError('Missing, duplicated or foreign review rows')
        for row in actual:
            for key, value in original[row['id']].items():
                if key not in editable and row.get(key) != value:
                    raise ValueError('Frozen review content changed: ' + row['id'] + ' ' + key)
            if section == 'examples' and row.get('humanLabel') not in ['present', 'partial', 'missing', 'uncertain']:
                raise ValueError('Invalid label')
            if section == 'concepts' and row.get('criterionReview') not in ['approve', 'revise']:
                raise ValueError('Invalid criterion decision')
            if len(str(row.get('comment', row.get('criterionComment', '')))) > 10000:
                raise ValueError('Review comment exceeds limit')
    return True


def load_review(file):
    freeze = json.loads(FREEZE.read_text(encoding='utf-8'))
    if sha(PACKET) != freeze['packetFileSha256']:
        raise ValueError('Original ICT packet changed')
    packet = json.loads(PACKET.read_text(encoding='utf-8'))
    submitted = json.loads(Path(file).read_text(encoding='utf-8-sig'))
    validate(packet, submitted)
    source_manifest = json.loads((ROOT / 'outputs/ict-source-intake-2026-10-15/manifest.json').read_text(encoding='utf-8'))
    for source in source_manifest['sources']:
        if packet['sourceHashes'].get(source['id']) != source['sha256'] or sha(source['path']) != source['sha256']:
            raise ValueError('Source PDF integrity failure')
    # This particular submission explicitly declares AI provenance. Preserve it.
    normalized = dict(version='ict-reviewed-development-01', synthetic=True,
        reviewProvenance=submitted.get('reviewProvenance', 'Unverified reviewer provenance'),
        independentHumanValidation=False, independentAccuracyClaimAllowed=False,
        sourceSha256=sha(file), packetSha256=packet['packetSha256'],
        concepts=submitted['concepts'], examples=[dict(id=r['id'], conceptId=r['conceptId'], text=r['text'],
            reviewedLabel=r['humanLabel'], comment=r.get('comment', ''),
            labelProvenance=r.get('labelProvenance', 'Unverified'), use='development_only') for r in submitted['examples']])
    audit = dict(examples=len(normalized['examples']), concepts=len(normalized['concepts']),
        labelCounts=dict(Counter(r['reviewedLabel'] for r in normalized['examples'])),
        criterionDecisions=dict(Counter(c['criterionReview'] for c in normalized['concepts'])),
        submittedContentMatchesFrozenPacket=True, independentHumanValidation=False,
        displaySourceLinksNormalized=submitted['sources'] != packet['sources'], sourcePdfHashesVerified=True,
        independentAccuracyClaimAllowed=False, sourceSha256=sha(file),
        sourceReviewProvenance=normalized['reviewProvenance'])
    return normalized, audit

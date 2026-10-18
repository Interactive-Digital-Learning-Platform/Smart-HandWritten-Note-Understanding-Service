"""Prepare proposed source-backed criteria and a blind development review.

This deliberately does not fit a model or submit knowledge-base ingestion jobs.
"""
import hashlib
import json
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parent.parent
INTAKE = ROOT / 'ml-training/outputs/ict-source-intake-2026-10-15'
OUT = ROOT / 'ml-training/outputs/ict-coverage-source-review-01-2026-10-15'

# Criteria are an AI-authored proposal, pending subject review, not official marks.
CONCEPTS = [
    ('ict-g10-u02-cpu', 'CPU components and functions', 10, 2, [53], [16, 32], [
        'The arithmetic and logic unit performs arithmetic calculations and logical operations.',
        'The control unit directs or coordinates computer operations.',
        'Registers temporarily hold data or intermediate results used during processing.'
    ], [
        'The CPU contains an ALU for calculations and comparisons, a control unit that directs operations, and registers that temporarily hold working data and results.',
        'The arithmetic and logic unit carries out calculations and logical comparisons in the CPU.',
        'A plotter draws detailed plans on paper, while speakers produce sound output.'
    ]),
    ('ict-g10-u02-ram-rom', 'RAM and ROM', 10, 2, [54], [30], [
        'RAM temporarily holds working data and loses its contents when power is removed.',
        'ROM retains its contents without power and stores startup instructions.'
    ], [
        'RAM is temporary working memory: its contents are lost when power is switched off. ROM is non-volatile and retains the instructions used to start the computer.',
        'RAM holds data currently being used and loses those data when the computer is switched off.',
        'RAM permanently retains the boot instructions without electricity. ROM is the temporary workspace that is erased whenever power is removed.'
    ]),
    ('ict-g10-u02-cache', 'Purpose of cache memory', 10, 2, [55], [30], [
        'Cache is a small, fast memory that holds frequently needed data.',
        'It reduces access time by making those data readily available to the CPU instead of repeatedly fetching them from RAM.'
    ], [
        'Cache is small, fast memory close to the processor. It keeps frequently needed data so the CPU can obtain them quickly rather than repeatedly fetching them from RAM.',
        'Cache memory has a small capacity and is faster than ordinary main memory.',
        'Cache memory\nAdvantages of cache memory\nQuestions for revision'
    ]),
    ('ict-g10-u02-secondary', 'Secondary storage', 10, 2, [55], [30], [
        'Secondary storage keeps data for later use and retains them when power is removed.',
        'An appropriate secondary storage example is identified, such as a hard disk, optical disc or flash drive.'
    ], [
        'Secondary storage holds files for later use and retains them when the power is off. A USB flash drive is one example.',
        'Secondary storage keeps files even after the computer is switched off.',
        'The control unit coordinates operations, and the ALU performs calculations.'
    ]),
    ('ict-g10-u05-os', 'Main roles of an operating system', 10, 5, [138, 143], [41], [
        'An operating system is system software that manages hardware and other software or resources.',
        'It provides an interface through which a user interacts with the computer.'
    ], [
        'An operating system is system software. It manages hardware and the resources used by applications, and provides a user interface for interacting with the computer.',
        'An operating system manages computer hardware and the resources required by application programs.',
        'An operating system is a physical input device used to enter letters into the computer.'
    ]),
    ('ict-g10-u05-process', 'Operating system process management', 10, 5, [144], [41], [
        'A process is a running program or an executing part of a program.',
        'The operating system schedules processes or allocates CPU time so tasks can execute in an appropriate order.'
    ], [
        'A process is a running program or part of one. The operating system schedules processes and allocates processor time so different tasks can run in an appropriate order.',
        'A process is a computer program, or part of a program, that is currently running.',
        'A file can be given a name and kept inside a folder for later use.'
    ]),
    ('ict-g10-u05-memory', 'Operating system memory management', 10, 5, [145], [41], [
        'The operating system allocates suitable RAM space to running processes.',
        'It releases or makes that space available again when a process finishes.'
    ], [
        'The operating system assigns RAM space to each running process. When a process ends, it frees that space so another process can use it.',
        'Memory management allocates enough main memory to the processes that are running.',
        'A keyboard enters characters and a monitor displays output.'
    ]),
    ('ict-g11-u03-internet-web', 'Internet and World Wide Web', 11, 3, [74, 80], [21, 22], [
        'The Internet is an interconnected collection of computer networks.',
        'The World Wide Web is a service using the Internet that provides linked web pages or documents accessed through a browser.'
    ], [
        'The Internet connects computer networks around the world. The World Wide Web is one service that uses this network, providing linked pages and documents which people access through a web browser.',
        'The Internet is a collection of interconnected computer networks around the world.',
        'The ALU carries out arithmetic and logical operations in the processor.'
    ]),
    ('ict-g11-u03-dns', 'Purpose of DNS', 11, 3, [77], [22], [
        'DNS resolves a human-readable domain name to an IP address.',
        'The resulting address is used to locate or connect to the requested server.'
    ], [
        'DNS translates a domain name, such as school.example, into the corresponding IP address. The computer can then use that address to connect to the requested server.',
        'DNS converts domain names into IP addresses.',
        'DNS stores email attachments and sends the same message to every address in the address book.'
    ]),
    ('ict-g11-u03-cc-bcc', 'Email Cc and Bcc', 11, 3, [85, 86], [22], [
        'Cc sends additional copies of an email to named recipients.',
        'Bcc also sends copies, while hiding Bcc recipient addresses from recipients in To and Cc.'
    ], [
        'Cc sends copies of an email to additional people. Bcc also sends copies, but recipients listed in To and Cc cannot see the Bcc addresses.',
        'Cc means carbon copy and is used to send additional people a copy of the message.',
        'Cc sends copies to additional recipients. Bcc also sends copies, but every To and Cc recipient can see the Bcc address list.'
    ]),
]


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((INTAKE / 'manifest.json').read_text(encoding='utf-8'))
    for source in manifest['sources']:
        if digest(Path(source['path'])) != source['sha256']:
            raise ValueError('A source PDF changed after intake')
    pages = {(p['sourceId'], p['pdfPage']): p for p in
             map(json.loads, (INTAKE / 'pages.jsonl').read_text(encoding='utf-8').splitlines())}
    concepts, examples = [], []
    for cid, name, grade, unit, book_pages, guide_pages, requirements, texts in CONCEPTS:
        references = []
        for role, numbers in [('textbook', book_pages), ('teacher-guide', guide_pages)]:
            source_id = f'ict-g{grade}-{role}'
            for number in numbers:
                page = pages[(source_id, number)]
                if not page['text'].strip():
                    raise ValueError('Empty reference page')
                references.append(dict(sourceId=source_id, pdfPage=number, textSha256=page['textSha256']))
        concept = dict(id=cid, name=name, grade=grade, unitNumber=unit,
                       points=[dict(id=f'p{i+1}', text=t) for i,t in enumerate(requirements)],
                       sourceReferences=references, criterionReview=None, criterionComment='',
                       liveCurriculumMapping=None)
        concepts.append(concept)
        for i, text in enumerate(texts, 1):
            examples.append(dict(id=f'{cid}-review-{i}', conceptId=cid, text=text,
                                 textSha256=hashlib.sha256(text.encode('utf-8')).hexdigest(),
                                 humanLabel=None, comment=''))
    random.Random(20261015).shuffle(examples)
    packet = dict(version='ict-source-criteria-review-01', synthetic=True, realHandwritingIncluded=False,
                  purpose='Development review of proposed criteria and examples, not independent accuracy',
                  modelTrained=False, knowledgeBaseIngested=False, reviewerName='', concepts=concepts,
                  sources=[dict(id=s['id'], url=Path(s['path']).as_uri()) for s in manifest['sources']],
                  sourceHashes={s['id']:s['sha256'] for s in manifest['sources']}, examples=examples)
    packet['packetSha256'] = hashlib.sha256(json.dumps(packet, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
    (OUT / 'packet.json').write_bytes((json.dumps(packet, indent=2) + '\n').encode('utf-8'))
    (OUT / 'rubrics-proposal.json').write_bytes((json.dumps(dict(subject='ICT', language='English',
        humanApproved=False, automaticUseEnabled=False, scope='10 theory concepts across 3 units, not the full syllabus',
        concepts=concepts), indent=2) + '\n').encode('utf-8'))
    payload = json.dumps(packet).replace('<', '\\u003c')
    template = (ROOT / 'ml-training/review-ict-source-template.html').read_text(encoding='utf-8')
    (OUT / 'review.html').write_bytes(template.replace('__PACKET__', payload).encode('utf-8'))
    (OUT / 'freeze.json').write_bytes((json.dumps(dict(packetFileSha256=digest(OUT / 'packet.json'),
        rubricsFileSha256=digest(OUT / 'rubrics-proposal.json'), reviewUse='development_only',
        sourceIntakeManifestSha256=digest(INTAKE / 'manifest.json')), indent=2) + '\n').encode('utf-8'))
    print(json.dumps(dict(concepts=len(concepts), examples=len(examples), review=str(OUT / 'review.html'))))


if __name__ == '__main__':
    main()

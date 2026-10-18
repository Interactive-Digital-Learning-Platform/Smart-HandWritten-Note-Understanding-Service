"""AI-authored pilot paraphrases. Families are synthetic, not independent students.

For each point: families 1-3 train; family 4 validates. Original rubric is family 0.
The submitted 30 development examples are not fitted.
"""
BANK = [
 [
  ['The ALU calculates numbers and makes logical comparisons.', 'Arithmetic and logic are handled by the ALU.', 'ALU: performs sums and logical tests.', 'Within the CPU, arithmetic calculations and logical decisions are the job of the ALU.'],
  ['The control unit coordinates the activities of the computer.', 'The CU directs operations and controls the other components.', 'Control unit: organises the work of computer components.', 'Computer operations are coordinated by the control unit.'],
  ['CPU registers hold working values and results for a short time.', 'Registers provide temporary storage for processing data and results.', 'Registers: briefly keep operands and intermediate processing results.', 'During processing, registers temporarily keep the values and results needed by the processor.']
 ],
 [
  ['RAM holds current working data temporarily and loses them when power is removed.', 'Working data stay in volatile RAM only while power is supplied.', 'RAM: temporary data storage; switch power off and its contents disappear.', 'Current work is stored temporarily in RAM, whose contents are lost after shutdown.'],
  ['ROM holds startup instructions and keeps them even without power.', 'Boot instructions are kept in non-volatile ROM when electricity is off.', 'ROM: startup instructions remain stored after power is disconnected.', 'Startup instructions persist in ROM because this memory does not lose its contents when power is removed.']
 ],
 [
  ['Cache is small high-speed memory storing frequently used data.', 'Frequently needed data are kept in a small, very fast cache.', 'Cache: a small and fast store for often-used data.', 'A small amount of high-speed cache memory keeps data that are needed often.'],
  ['The processor accesses cached data quickly instead of repeatedly fetching them from RAM.', 'Keeping data in cache cuts the time the CPU spends accessing RAM.', 'CPU gets cached data faster than fetching the same data from RAM repeatedly.', 'The CPU can obtain cached data sooner, reducing repeated slow accesses to main memory.']
 ],
 [
  ['Secondary storage retains files after electricity is disconnected.', 'Saved data remain on secondary storage even when the computer has no power.', 'Secondary storage: keeps data for later use, including after shutdown.', 'Files remain in secondary storage for future use after the machine is powered down.'],
  ['A hard disk is a secondary storage device.', 'Examples of secondary storage include USB flash drives and DVDs.', 'Secondary storage example: a USB memory stick.', 'An optical disc is one example of a secondary storage medium.']
 ],
 [
  ['The operating system is system software that manages computer resources and applications.', 'As system software, the OS coordinates hardware and the resources needed by other software.', 'OS: system software controlling hardware resources and supporting applications.', 'An operating system is software responsible for managing hardware and the resources used by programs.'],
  ['The operating system provides a user interface for interacting with the computer.', 'Users interact with the machine through an interface supplied by its OS.', 'OS provides the interface between the user and the computer.', 'A user interface supplied by the operating system allows a person to interact with the machine.']
 ],
 [
  ['A process is a program, or part of a program, that is executing.', 'An executing program is called a process.', 'Process: a running program or executing program part.', 'The term process refers to a program or part of one currently in execution.'],
  ['The OS schedules processes and distributes processor time among them.', 'CPU time is assigned to running processes by the operating system scheduler.', 'OS process management: schedule tasks and decide their order of execution.', 'The operating system controls the order of process execution and assigns each task processor time.']
 ],
 [
  ['The OS assigns RAM space to the processes currently executing.', 'Running processes receive suitable main-memory space from the operating system.', 'Memory management: allocate enough RAM to each running process.', 'For each executing process, the operating system reserves an appropriate amount of RAM.'],
  ['RAM space is freed by the OS after a process finishes.', 'When a process terminates, its memory allocation becomes available for reuse.', 'Process finished: release its RAM for use by other programs.', 'After execution ends, the process memory is returned for allocation to another task.']
 ],
 [
  ['The Internet is a worldwide interconnection of computer networks.', 'Computer networks linked around the world form the Internet.', 'Internet: networks of computers connected globally.', 'Many interconnected computer networks together make up the worldwide Internet.'],
  ['The WWW is an Internet service of linked web documents that users access with browsers.', 'Web browsers access linked pages provided by the World Wide Web service over the Internet.', 'WWW: linked web pages, accessed in a browser using the Internet.', 'One Internet service is the World Wide Web, whose connected web documents can be read using a browser.']
 ],
 [
  ['DNS resolves domain names into their corresponding IP addresses.', 'A DNS lookup finds the IP address associated with a readable domain name.', 'DNS: translate a domain name to an IP address.', 'The domain name system looks up the numeric IP address for a named domain.'],
  ['That IP address enables the computer to connect to the requested server.', 'The browser uses the resolved address to locate and contact the web server.', 'Use the resulting IP to reach the server that was requested.', 'With the resolved IP address, the computer knows where to direct the connection to the required server.']
 ],
 [
  ['Cc is used to send copies of a message to additional recipients.', 'Carbon copy adds extra people who receive a copy of an email.', 'Cc: send other recipients a copy of the same message.', 'Using Cc gives additional named recipients a copy of the email.'],
  ['Bcc sends copies while hiding the Bcc addresses from To and Cc recipients.', 'People in To or Cc cannot see the addresses of blind-copy recipients.', 'Bcc copies are sent, but their recipients are not shown to people in To or Cc.', 'Blind carbon copy delivers the email without displaying Bcc addresses to the people in the To and Cc fields.']
 ]
]

# Explicit, limited term groups for explanation features; not factual proof.
GROUPS = [
 [[['alu', 'arithmetic and logic unit'], ['calculations', 'calculates', 'arithmetic', 'sums'], ['logical', 'logic', 'comparisons', 'tests']], [['control unit', 'cu'], ['directs', 'coordinates', 'controls', 'organises', 'coordinated']], [['registers'], ['temporarily', 'temporary', 'briefly', 'short time'], ['data', 'values', 'results', 'operands']]],
 [[['ram'], ['temporary', 'temporarily', 'working', 'volatile'], ['loses', 'lost', 'disappear', 'only while']], [['rom'], ['non-volatile', 'non volatile', 'keeps', 'retains', 'remain', 'persist'], ['startup', 'boot', 'start']]],
 [[['cache', 'cached'], ['small'], ['fast', 'high-speed', 'high speed'], ['frequently', 'often', 'needed']], [['cpu', 'processor'], ['quickly', 'faster', 'sooner', 'cuts', 'reducing', 'reduces'], ['ram', 'main memory']]],
 [[['secondary'], ['retains', 'remain', 'keeps', 'holds', 'kept'], ['off', 'power', 'electricity', 'shutdown', 'powered down']], [['hard disk', 'optical disc', 'usb', 'flash drive', 'dvd', 'memory stick']]],
 [[['operating system', 'os'], ['software'], ['manages', 'managing', 'coordinates', 'controlling'], ['hardware', 'resources']], [['interface'], ['user', 'users', 'person'], ['interact', 'interacting', 'interaction', 'between']]],
 [[['process'], ['program'], ['running', 'executing', 'execution']], [['os', 'operating system'], ['schedules', 'schedule', 'scheduler', 'order', 'time']]],
 [[['operating system', 'os', 'memory management'], ['ram', 'main memory'], ['allocates', 'allocate', 'assigns', 'receive', 'reserves']], [['process', 'execution'], ['ends', 'ends', 'finishes', 'finished', 'terminates'], ['freed', 'free', 'release', 'returned', 'available']]],
 [[['internet'], ['networks'], ['interconnected', 'interconnection', 'connected', 'linked']], [['www', 'world wide web', 'web'], ['service'], ['pages', 'documents'], ['browser', 'browsers']]],
 [[['dns', 'domain name system'], ['domain', 'names'], ['ip'], ['resolves', 'converts', 'translate', 'translates', 'lookup', 'finds', 'looks up']], [['address', 'ip'], ['connect', 'connection', 'contact', 'reach', 'locate'], ['server']]],
 [[['cc', 'carbon copy'], ['copies', 'copy'], ['recipients', 'people']], [['bcc', 'blind carbon copy', 'blind-copy'], ['hiding', 'hides', 'cannot see', 'not shown', 'without displaying'], ['addresses', 'recipients'], ['to', 'cc']]]
]

WRONG = [
 ('ict-g10-u02-cpu', 'The ALU controls all computer devices. The control unit performs arithmetic calculations.', 'missing'),
 ('ict-g10-u02-cpu', 'The ALU calculates numbers and makes logical comparisons. The control unit performs arithmetic calculations.', 'partial'),
 ('ict-g10-u02-ram-rom', 'RAM retains startup instructions without power. ROM is volatile memory.', 'missing'),
 ('ict-g10-u02-ram-rom', 'RAM keeps working data temporarily until power is removed. ROM is volatile memory.', 'partial'),
 ('ict-g10-u05-os', 'The operating system is a physical device for input.', 'missing'),
 ('ict-g11-u03-dns', 'DNS sends email attachments to every person on a mailing list.', 'missing'),
 ('ict-g11-u03-dns', 'DNS converts IP addresses into domain names.', 'missing'),
 ('ict-g11-u03-cc-bcc', 'Cc sends message copies to additional people. Bcc addresses are visible to all recipients.', 'partial'),
]

def generated(rubrics):
    import itertools
    rows, seen = [], set()
    def add(cid, text, label, family, kind):
        key = (cid, text)
        if key in seen:
            return
        seen.add(key)
        rows.append(dict(recordId=f'ict-synthetic-{len(rows)+1:04}', conceptId=cid, text=text,
                         label=label, family=family, kind=kind,
                         split='validation' if family == 4 else 'train', labelProvenance='AI-generated, not independently validated'))
    for i, concept in enumerate(rubrics['concepts']):
        for family in range(5):
            variants = [p['text'] if family == 0 else BANK[i][j][family-1] for j,p in enumerate(concept['points'])]
            for count in range(1, len(variants)+1):
                for subset in itertools.combinations(range(len(variants)), count):
                    add(concept['id'], ' '.join(variants[j] for j in subset),
                        'present' if count == len(variants) else 'partial', family, 'coverage_subset')
            unrelated = [
                'A triangle has three sides. The team practises sport after school.',
                'Rain began during the afternoon and the bus arrived late.',
                'Students must bring lunch and a bottle of water on the trip.',
                'The library opens on Monday and closes early on Friday.',
                'The class visited a museum yesterday and returned in the evening.'
            ][family]
            add(concept['id'], unrelated, 'missing', family, 'unrelated')
            prompt = [f'Explain {concept["name"]}?', f'Describe {concept["name"]}. This question is unanswered.',
                      f'What is {concept["name"]}?', f'List and explain the points about {concept["name"]}?',
                      f'Discuss {concept["name"]}? Answer later.'][family]
            add(concept['id'], prompt, 'missing', family, 'unanswered_prompt')
        add(concept['id'], concept['name'], 'missing', 0, 'heading_only')
        # Topically related, but target-inappropriate content from another unit.
        other_index = 8 if concept['grade'] == 10 else 0
        other = rubrics['concepts'][other_index]
        for family in range(5):
            off = ' '.join(p['text'] if family == 0 else BANK[other_index][j][family-1] for j,p in enumerate(other['points']))
            add(concept['id'], off, 'missing', family, 'other_unit')
    for cid, text, label in WRONG:
        add(cid, text, label, 0, 'role_conflict')
    return rows

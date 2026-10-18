"""Additional AI-authored shorthand families, developed after V1.1 probes."""
import copy
import itertools
from ict_synthetic_material import GROUPS, generated

SHORT = [
 ['ALU: do calculations and logical comparisons.', 'CU: direct the activities of computer components.', 'Registers: keep temporary working values and results.'],
 ['RAM: holds work temporarily; data disappear when power goes off.', 'ROM: retains the instructions for starting up even with no power.'],
 ['Small, fast cache stores frequently reused values.', 'The CPU gets these values quickly, avoiding repeated trips to RAM.'],
 ['Secondary storage: save data for future use, keeping them after shutdown.', 'Examples: magnetic hard disk or optical DVD.'],
 ['OS: system software managing hardware resources and supporting programs.', 'OS supplies a user interface for interacting with the machine.'],
 ['Process: a program or program part currently executing.', 'Scheduler: the OS gives processes CPU time and orders their execution.'],
 ['Memory manager gives each active task its own space in RAM.', 'When a task ends, the allocated space is returned for reuse.'],
 ['Internet: many computer networks linked worldwide.', 'WWW: an Internet service of linked documents viewed with a web browser.'],
 ['DNS: look up the IP address belonging to a domain name.', 'Use this address to contact the requested server.'],
 ['Cc: additional people receive copies of the email.', 'Bcc copies are delivered with their recipient addresses hidden from To and Cc.'],
]
VALIDATION = [
 ['The ALU handles numerical calculations and logical tests.', 'The control unit directs the work done by computer components.', 'Processing values and results are stored temporarily in registers.'],
 ['Work in RAM is temporary and disappears after loss of electricity.', 'ROM is non-volatile storage of the instructions that start a computer.'],
 ['Frequently reused data are kept in the small, high-speed cache.', 'This lets the processor fetch them quickly instead of repeatedly reading main memory.'],
 ['Secondary storage saves information for later and keeps it after the power is cut.', 'A flash drive is an example of this storage.'],
 ['Hardware and application resources are managed by the operating system, a type of system software.', 'The OS offers an interface through which the user communicates with the computer.'],
 ['A program currently in execution is a process.', 'Processes receive processor time according to the schedule chosen by the OS.'],
 ['The OS reserves main-memory space for each active process.', 'When a process finishes, the memory it used is reclaimed for another process.'],
 ['A worldwide network of interconnected networks forms the Internet.', 'Its World Wide Web service contains linked web documents retrieved through a browser.'],
 ['The domain name system finds the IP address corresponding to a domain.', 'This IP address directs the connection to the desired server.'],
 ['Carbon copy sends an extra copy of the email to other named recipients.', 'Blind carbon copy sends copies without showing the Bcc addresses to people in To and Cc.'],
]


def rubric_groups():
    groups = copy.deepcopy(GROUPS)
    groups[6][0] = [['operating system','os','memory management','memory manager'],
                    ['ram','main memory','main-memory'],
                    ['allocates','allocate','allocation','assigns','assign','receive','reserves','reserves','give','gives']]
    groups[6][1] = [['process','execution','task','tasks','program'],
                    ['ends','end','finishes','finished','terminates','stops'],
                    ['freed','free','release','returned','return','reuse','available','reclaimed']]
    return groups


def generate(rubrics):
    original = generated(rubrics)
    rows = [r for r in original if r['split'] == 'train']
    regression = [dict(r, split='previous_validation_development') for r in original if r['split'] == 'validation']
    seen = {(r['conceptId'],r['text']) for r in rows}
    def add(concept, text, label, split, kind):
        key = (concept['id'],text)
        if key in seen:
            raise ValueError('Duplicate additional ICT example')
        seen.add(key)
        rows.append(dict(recordId=f'ict-v2-{len(rows)+1:04}', conceptId=concept['id'], text=text,
                         label=label, family='shorthand_v2' if split=='train' else 'new_paraphrase_v2',
                         split=split, kind=kind, labelProvenance='AI-authored, not independent human labels'))
    for i,c in enumerate(rubrics['concepts']):
        for bank, split in [(SHORT,'train'), (VALIDATION,'validation')]:
            phrases = bank[i]
            for count in range(1,len(phrases)+1):
                for subset in itertools.combinations(range(len(phrases)),count):
                    add(c,' '.join(phrases[j] for j in subset),'present' if count==len(phrases) else 'partial',split,'coverage_subset')
        for prefix in ['Explain', 'Describe']:
            add(c, prefix+' how '+' '.join(p['text'] for p in c['points'])+'? These revision questions are unanswered.',
                'missing','train','full_requirement_prompt')
        add(c, 'Discuss '+'; '.join(VALIDATION[i])+'? Answer later.', 'missing','validation','full_requirement_prompt')
        other = 'The class garden contains flowers and vegetables, and the students water it daily.'
        add(c,other,'missing','validation','unrelated')
    return rows, regression

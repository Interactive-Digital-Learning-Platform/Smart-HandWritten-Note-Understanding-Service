"""Additional mixed-correctness contrasts; no submitted/probe text is fitted."""
from ict_synthetic_v2 import generate as previous_generate

MIXED = [
 'Carbon copy delivers the email to extra people. Bcc addresses are visible to all recipients.',
 'Cc gives additional recipients a message copy. Bcc addresses are visible to every recipient.',
 'People named in Cc get copies of an email. To and Cc recipients can see the Bcc address list.',
 'Cc sends copies to other named people. To or Cc recipients can see the Bcc recipient addresses.',
 'The carbon copy field sends copies to additional recipients. Bcc recipients are shown to all other people.',
 'Cc adds more people who receive the message. Bcc addresses are visible to all recipients.',
]


def generate(rubrics):
    rows, regression = previous_generate(rubrics)
    for i,text in enumerate(MIXED):
        rows.append(dict(recordId=f'ict-v3-mixed-{i+1}',conceptId='ict-g11-u03-cc-bcc',text=text,label='partial',
            split='train',family='mixed_correctness_v3',kind='one_correct_one_conflicting',labelProvenance='AI-authored'))
    return rows, regression

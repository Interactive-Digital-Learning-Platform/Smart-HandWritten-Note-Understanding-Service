"""Conservative review policy for semantic evidence; does not relabel the head."""
import re
from .english_coverage import normalize
from .history_semantic_core import SemanticCorePredictor

POLICY_VERSION='semantic-evidence-review-v1'


def normalized_heading(text):
    return re.sub(r'[^\w\s]',' ',normalize(text)).strip()


def semantic_support_concerns(prediction,rubrics):
    titles={re.sub(r'\s+',' ',normalized_heading(c['name'])) for c in rubrics['concepts']}
    result=[]
    for point in prediction['evidence']['points']:
        quote=point.get('semanticCandidateEvidence')
        if not isinstance(quote,str) or not quote.strip():continue
        normalized=re.sub(r'\s+',' ',normalized_heading(quote))
        if normalized in titles:
            result.append({'start':point['semanticStart'],'end':point['semanticEnd'],'quote':quote,'pointId':point['pointId'],
                'kind':'semantic_candidate_is_heading','reason':'A concept title does not substantiate this required explanation.'})
        required=set(re.findall(r'\b(?:1\d{3}|20\d{2})\b',point['requirement']))
        present=set(re.findall(r'\b(?:1\d{3}|20\d{2})\b',quote))
        if required-present:
            result.append({'start':point['semanticStart'],'end':point['semanticEnd'],'quote':quote,'pointId':point['pointId'],
                'kind':'required_year_missing_from_semantic_evidence','requiredYears':sorted(required),'missingYears':sorted(required-present),
                'reason':'The semantic passage does not state a required year. Check the note and criterion before accepting Complete.'})
    return result


class ReviewedSemanticPredictor(SemanticCorePredictor):
    def __init__(self,artifact,encoder):
        super().__init__(artifact,encoder)
        if artifact.get('reviewPolicy',{}).get('version')!=POLICY_VERSION:raise ValueError('Unsupported semantic review policy')

    def predict(self,text,concept_id,language='English',scope_confirmed=False):
        result=super().predict(text,concept_id,language,scope_confirmed)
        concerns=semantic_support_concerns(result,self.artifact['rubrics'])
        result['evidence']['concerns'].extend(concerns)
        if result['rawModelStatus']=='present' and concerns:
            result['suggestedStatus']=None
            result['completeSuggestionWithheld']=True
            result['suggestionWithheld']=True
        result['reviewPolicyVersion']=POLICY_VERSION
        return result

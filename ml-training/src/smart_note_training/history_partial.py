"""Partial-aware features for the existing frozen-MiniLM/linear History checker.

Keep the original semantic/safety features and add point/fragment support. No
student IDs, dataset labels, notebook profiles or example lookup enters inference.
"""
import re
import numpy as np
from .english_coverage import FEATURES, LABELS, normalize
from .history_semantic import SemanticHistoryFeatures, semantic_spans, genuine_negation
from .history_semantic_core import CORE_FEATURES, SELECTED
from .history_semantic_review import ReviewedSemanticPredictor, POLICY_VERSION

LEXICAL = [0, 1, 2, 3, 4, 5, 6, 15, 16]
PARTIAL_FEATURES = CORE_FEATURES + [FEATURES[i] for i in LEXICAL] + [
    'clause_semantic_min', 'clause_semantic_mean', 'clause_semantic_max', 'clause_semantic_std',
    'point_clause_min_mean', 'point_clause_mean_min',
    'required_numeric_min', 'required_numeric_mean',
    'qualified_statement_semantic_max', 'qualified_statement_semantic_top3_mean',
]


def requirement_clauses(text):
    parts = [p.strip(' ,;.') for p in re.split(r'\b(?:and|while|including)\b', text, flags=re.I)]
    # Tiny noun fragments are ambiguous queries; keep the original requirement.
    if len(parts) < 2 or any(len(re.findall(r'\w+', p)) < 3 for p in parts):
        return [text]
    return parts


def numeric_support(text, requirements):
    def numbers(value):
        return set(re.findall(r'\b\d+\b', re.sub(r'(?<=\d),(?=\d)', '', value)))
    observed = numbers(text)
    values = []
    for requirement in requirements:
        required = numbers(requirement)
        values.append(len(required & observed) / len(required) if required else 1.)
    return [min(values), float(np.mean(values))]


def qualified_statement(text):
    normalized = normalize(text)
    normalized = re.sub(r'\bnot only\b', '', normalized)
    return genuine_negation(normalized) or bool(re.search(r'\b(?:only|solely|exclusively|completely independent)\b', normalized))


class PartialHistoryFeatures(SemanticHistoryFeatures):
    def one(self, text, concept_id, explain=False):
        original, evidence = super().one(text, concept_id, True)
        concept = self.concepts[concept_id]
        requirements = [p['text'] for p in concept['points']]
        queries = [[concept['name'] + ': ' + c for c in requirement_clauses(p)] for p in requirements]
        spans = semantic_spans(text)
        chunks = [q for _, _, q in spans]
        flat = [q for point in queries for q in point]
        vectors = self.encoder.encode(flat + chunks)
        similarities = vectors[:len(flat)] @ vectors[len(flat):].T
        if original[27]:
            similarities[:] = 0  # Unanswered questions do not become answers.
        best = similarities.max(axis=1)
        minima, means, position = [], [], 0
        for group in queries:
            values = best[position:position + len(group)]
            minima.append(values.min()); means.append(values.mean()); position += len(group)
        clause_features = [best.min(), best.mean(), best.max(), best.std(), np.mean(minima), min(means)]
        qualified = [i for i, quote in enumerate(chunks) if qualified_statement(quote)]
        scores = np.sort(similarities[:, qualified].max(axis=0)) if qualified else np.array([0.])
        # Features only: a qualifying/negative sentence is not automatically false.
        negative_features = [scores.max(), scores[-3:].mean()]
        values = np.concatenate([original[SELECTED], original[LEXICAL], clause_features,
                                 numeric_support(text, requirements), negative_features])
        return values, evidence


class PartialHistoryPredictor(ReviewedSemanticPredictor):
    def __init__(self, artifact, encoder):
        if (artifact.get('schemaVersion') != 6 or artifact.get('features') != PARTIAL_FEATURES or
                artifact.get('labels') != list(LABELS) or
                artifact.get('reviewPolicy', {}).get('version') != POLICY_VERSION or
                encoder.manifest['revision'] != artifact['encoder']['revision']):
            raise ValueError('Incompatible partial-aware History artifact')
        self.artifact = artifact
        self.extractor = PartialHistoryFeatures.restore(artifact)
        self.extractor.encoder = encoder
        self.mean, self.scale = np.asarray(artifact['scalerMean']), np.asarray(artifact['scalerScale'])
        self.weights, self.intercept = np.asarray(artifact['weights']), np.asarray(artifact['intercept'])
        size = len(PARTIAL_FEATURES)
        if (self.mean.shape != (size,) or self.scale.shape != (size,) or
                self.weights.shape != (3, size) or self.intercept.shape != (3,) or
                not all(np.isfinite(v).all() for v in [self.mean, self.scale, self.weights, self.intercept]) or
                np.any(self.scale <= 0)):
            raise ValueError('Invalid partial-aware History parameters')

import fs from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import {AppError} from '../middleware/errorHandler';
import {activeOcrText} from './ocrText';
import {HistoryPreviewWorker} from './historyPreviewWorker';
import {coverageRuntimeRoot} from './coverageRuntime';
import {config} from '../config/config';
import {knowledgeBasePdfPages, qdrantCollectionUrl, qdrantHeaders} from './knowledgeBaseV2';

export const ICT_MODEL_SHA = 'df42a138824f57fec3339ecb973f643cebf8899d7eaba902d5adfb40d4a3b74b';
const SOURCES = {
  10: {filename: 'ICT grade 10.pdf', jobId: '3fa953c7-3d14-4612-9bed-b3887cf1a624', pdfSha256: '0562035a2b8201df08e0917e70e37d834c77be2662283a8a878acc444db9a4e5'},
  11: {filename: 'ICT grade 11.pdf', jobId: 'f5110037-6100-45ac-b3b6-ae6baded7ea9', pdfSha256: '9d9c1a102b4e077916dd7f9a89381c6de96d0c57f75bef868e258ff33959e029'},
};
export interface ICTConcept {
  id: string; name: string; grade: 10 | 11; lessonId: string; scopeNote: string;
  points: {id: string; text: string}[];
  textbook: {filename: string; jobId: string; pdfSha256: string; pdfPages: number[]};
}
export interface ICTReviewInput {text: string; conceptId: string; scopeConfirmed: true; language: 'English'}

export class ICTCoverageReviewService {
  private concepts?: ICTConcept[];
  private worker = new HistoryPreviewWorker({modelSha256: ICT_MODEL_SHA, script: 'ml-training/ict_service_cli.py', pythonEnv: 'ICT_COVERAGE_PYTHON'});
  constructor(private infer: (input: ICTReviewInput) => Promise<any> = input => this.worker.predict(input),
    private fetchReference: typeof fetch = fetch) {}

  catalog() {
    if (!this.concepts) {
      const base = path.resolve(__dirname, '../..');
      const file = process.env.COVERAGE_BUNDLE_DIR ? path.join(coverageRuntimeRoot(base), 'models/ict-coverage-v3.1.json')
        : path.join(base, 'ml-training/outputs/ict-coverage-v3.1-2026-10-15/model.json');
      const bytes = fs.readFileSync(file);
      if (createHash('sha256').update(bytes).digest('hex') !== ICT_MODEL_SHA) throw new AppError('ICT candidate files are unavailable', 503);
      this.concepts = JSON.parse(bytes.toString('utf8')).rubrics.concepts.map((c: any) => ({
        id: c.id, name: c.name, grade: c.grade, lessonId: `ict-g${c.grade}-u${String(c.unitNumber).padStart(2, '0')}`,
        scopeNote: c.scopeNote, points: c.points.map((p: any) => ({id: p.id, text: p.text})),
        textbook: {...SOURCES[c.grade as 10 | 11], pdfPages: c.sourceReferences.filter((r: any) => r.sourceId === `ict-g${c.grade}-textbook`).map((r: any) => r.pdfPage)},
      }));
    }
    return {concepts: this.concepts!, modelSha256: ICT_MODEL_SHA, model: 'ICT V3.1', experimental: true as const,
      reviewRequired: true as const, automaticICTEnabled: false as const};
  }

  validate(body: unknown): ICTReviewInput {
    const input = body as Partial<ICTReviewInput> | null;
    if (!input || typeof input.text !== 'string' || !input.text.trim() || [...input.text].length > 20000 ||
        input.language !== 'English' || input.scopeConfirmed !== true || typeof input.conceptId !== 'string') {
      throw new AppError('Select a concept, review 1–20,000 characters of English text, and confirm its scope', 400);
    }
    if (/[\u0D80-\u0DFF]/u.test(input.text)) throw new AppError('This ICT model supports English text only', 400);
    if (!this.catalog().concepts.some(c => c.id === input.conceptId)) throw new AppError('Choose a supported ICT concept', 400);
    let text: string;
    try {text = activeOcrText(input.text);} catch {throw new AppError('Correct malformed deletion markers before checking the note', 400);}
    if (!text.trim()) throw new AppError('No active note text remains after excluding deleted text', 400);
    return {text, conceptId: input.conceptId, scopeConfirmed: true, language: 'English'};
  }

  async predict(input: ICTReviewInput) {
    const concept = this.catalog().concepts.find(c => c.id === input.conceptId)!;
    const prediction = await this.infer(input);
    const chars = Array.from(input.text);
    const quoteMatches = (start: number, end: number, quote: string) => Number.isInteger(start) && Number.isInteger(end) &&
      start >= 0 && end >= start && end <= chars.length && typeof quote === 'string' && chars.slice(start, end).join('') === quote;
    const evidence = prediction?.evidence;
    if (prediction?.modelSha256 !== ICT_MODEL_SHA || prediction?.status !== null || prediction?.reviewRequired !== true ||
        prediction?.scoresCalibrated !== false || !['present', 'partial', 'missing'].includes(prediction?.rawModelStatus) ||
        typeof prediction.suggestionWithheld !== 'boolean' ||
        prediction.suggestedStatus !== (prediction.suggestionWithheld ? null : prediction.rawModelStatus) ||
        prediction.completeSuggestionWithheld !== (prediction.suggestionWithheld && prediction.rawModelStatus === 'present') ||
        !Array.isArray(evidence?.points) || evidence.points.length !== concept.points.length ||
        new Set(evidence.points.map((p: any) => p.pointId)).size !== concept.points.length ||
        !evidence.points.every((p: any) => concept.points.some(c => c.id === p.pointId && c.text === p.requirement) &&
          quoteMatches(p.start, p.end, p.candidateEvidence) && quoteMatches(p.semanticStart, p.semanticEnd, p.semanticCandidateEvidence)) ||
        !Array.isArray(evidence?.concerns) || !evidence.concerns.every((c: any) => quoteMatches(c.start, c.end, c.quote))) {
      throw new Error('Invalid ICT model response');
    }
    return {experimental: true as const, reviewRequired: true as const, language: 'English', mode: 'manual_review',
      modelSha256: ICT_MODEL_SHA, concept, analyzedText: input.text,
      textSha256: createHash('sha256').update(input.text, 'utf8').digest('hex'),
      offsetUnit: 'unicode_code_points', checkedAt: new Date().toISOString(), prediction};
  }

  async reference(conceptId: string) {
    const concept = this.catalog().concepts.find(c => c.id === conceptId);
    if (!concept) throw new AppError('Choose a supported ICT concept', 400);
    const base = config.qdrant.url;
    if (!base) throw new AppError('Textbook references are temporarily unavailable', 503);
    // 'pages' is unindexed on strict-mode v2. Scroll the verified job and check
    // its pages locally, including later scroll pages. Keep source identity
    // pinned: a newly uploaded job needs explicit source verification first.
    const signal = AbortSignal.timeout(10000);
    const passages: {text: string; pdfPages: number[]}[] = [];
    let offset: string | number | undefined;
    let complete = false;
    for (let page = 0; page < 40; page++) {
      const response = await this.fetchReference(`${qdrantCollectionUrl()}/points/scroll`, {
        method: 'POST', headers: {'Content-Type': 'application/json', ...qdrantHeaders()}, signal,
        body: JSON.stringify({filter: {must: [{key: 'job_id', match: {value: concept.textbook.jobId}}]},
          offset, limit: 256, with_payload: true, with_vector: false}),
      });
      if (!response.ok) throw new Error('Reference unavailable');
      const result = await response.json() as any;
      if (!Array.isArray(result.result?.points)) throw new Error('Reference unavailable');
      for (const point of result.result.points) {
        const p = point.payload || {}, pdfPages = knowledgeBasePdfPages(p);
        if (p.job_id === concept.textbook.jobId && p.filename === concept.textbook.filename &&
            pdfPages.some(n => concept.textbook.pdfPages.includes(n)) && typeof p.text === 'string' && p.text.trim()) {
          passages.push({text: p.text, pdfPages});
        }
      }
      offset = result.result.next_page_offset;
      if (offset === null || offset === undefined) {complete = true; break;}
    }
    if (!complete) throw new Error('Reference unavailable');
    if (!passages.length) throw new Error('Reference unavailable');
    return {conceptId, source: concept.textbook, passages};
  }

  dispose() {this.worker.dispose();}
}

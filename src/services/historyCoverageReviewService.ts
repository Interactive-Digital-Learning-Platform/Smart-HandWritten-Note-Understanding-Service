import fs from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import {AppError} from '../middleware/errorHandler';
import {activeOcrText} from './ocrText';
import {HistoryPreviewWorker, HISTORY_PREVIEW_SHA} from './historyPreviewWorker';
import {historyModelFile} from './coverageRuntime';

export interface HistoryConcept {
  id: string; name: string; grade: 10 | 11; lessonId: string;
  points: {id: string; text: string}[];
}
export interface HistoryReviewInput {text: string; conceptId: string; scopeConfirmed: true; language: 'English'}

/** Explicitly requested, transient coverage suggestions. No note/profile writes. */
export class HistoryCoverageReviewService {
  private concepts?: HistoryConcept[];
  private worker = new HistoryPreviewWorker();
  constructor(private infer = (input: {text: string; conceptId: string; scopeConfirmed: true}) => this.worker.predict(input)) {}

  catalog() {
    if (!this.concepts) {
      const file = historyModelFile(path.resolve(__dirname, '../..'));
      const bytes = fs.readFileSync(file);
      if (createHash('sha256').update(bytes).digest('hex') !== HISTORY_PREVIEW_SHA) throw new AppError('History candidate files are unavailable', 503);
      const artifact = JSON.parse(bytes.toString('utf8'));
      this.concepts = artifact.rubrics.concepts.map((c: any) => ({
        id: c.id, name: c.name, grade: c.id.includes('-g10-') ? 10 : 11, lessonId: c.lessonId,
        points: c.points.map((p: any) => ({id: p.id, text: p.text})),
      }));
    }
    return {concepts: this.concepts!, modelSha256: HISTORY_PREVIEW_SHA, model: 'History V6.2',
      experimental: true as const, reviewRequired: true as const, automaticHistoryEnabled: false as const};
  }

  validate(body: unknown): HistoryReviewInput {
    const input = body as Partial<HistoryReviewInput> | null;
    if (!input || typeof input.text !== 'string' || !input.text.trim() || [...input.text].length > 20000 ||
        input.language !== 'English' || input.scopeConfirmed !== true || typeof input.conceptId !== 'string') {
      throw new AppError('Select a concept, review 1–20,000 characters of English text, and confirm its scope', 400);
    }
    if (/[\u0D80-\u0DFF]/u.test(input.text)) throw new AppError('This History candidate supports English text only', 400);
    if (!this.catalog().concepts.some(c => c.id === input.conceptId)) throw new AppError('Choose a supported History concept', 400);
    let text: string;
    try {text = activeOcrText(input.text);} catch {throw new AppError('Correct malformed deletion markers before checking the note', 400);}
    if (!text.trim()) throw new AppError('No active note text remains after excluding deleted text', 400);
    return {text, conceptId: input.conceptId, scopeConfirmed: true, language: 'English'};
  }

  async predict(input: HistoryReviewInput) {
    const concept = this.catalog().concepts.find(c => c.id === input.conceptId)!;
    const prediction = await this.infer(input);
    return {experimental: true as const, reviewRequired: true as const, language: 'English', mode: 'manual_review',
      modelSha256: HISTORY_PREVIEW_SHA, concept, analyzedText: input.text,
      textSha256: createHash('sha256').update(input.text, 'utf8').digest('hex'),
      offsetUnit: 'unicode_code_points', checkedAt: new Date().toISOString(), prediction};
  }

  dispose() {this.worker.dispose();}
}

import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { HistoryPreviewWorker, HistoryPreviewInput } from '../services/historyPreviewWorker';
import { activeOcrText } from '../services/ocrText';

const ROOT = path.resolve(__dirname, '../..');
const MODEL_SHA = '12ba94e87415adb0ceb851919a6e87bc5d36e8535f0539352b450bd104e368e8';
type Predict = (input: HistoryPreviewInput) => Promise<unknown>;
type Ocr = (file: string) => Promise<{success: boolean; text: string}>;

export async function createHistoryPreview(options: {predict?: Predict; ocr?: Ocr} = {}) {
  const modelBytes = await fs.readFile(path.join(ROOT, 'ml-training/outputs/history-coverage-v5.1-review-policy-2026-10-15/model.json'));
  if (createHash('sha256').update(modelBytes).digest('hex') !== MODEL_SHA) throw new Error('Candidate integrity check failed');
  const artifact = JSON.parse(modelBytes.toString('utf8'));
  const concepts = artifact.rubrics.concepts.map((c: any) => ({id: c.id, name: c.name,
    grade: c.id.includes('-g10-') ? 10 : 11, lessonId: c.lessonId,
    points: c.points.map((p: any) => ({id: p.id, text: p.text}))}));
  const ids = new Set(concepts.map((c: any) => c.id));
  const app = express();
  const worker = options.predict ? undefined : new HistoryPreviewWorker();
  app.locals.disposeHistoryWorker = () => worker?.dispose();
  app.disable('x-powered-by');
  let busy = false;
  app.use((req, res, next) => {
    // Reject cross-site form posts and DNS rebinding; no CORS permission.
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
        (req.headers.origin && req.headers.origin !== `http://${host}`)) {
      res.status(403).json({error: 'Use the local preview address'}); return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use(express.json({limit: '96kb'}));
  app.get('/api/health', (_req, res) => res.json({status: 'ready', candidate: 'History V5.1', previewOnly: true, automaticHistoryEnabled: false, inferenceRuntime: 'persistent-python-v1'}));
  app.get('/api/catalog', (_req, res) => res.json({concepts, modelSha256: MODEL_SHA}));
  const lock: express.RequestHandler = (_req, res, next) => {
    if (busy) { res.status(429).json({error: 'Another preview request is running. Try again when it finishes.'}); return; }
    busy = true;
    // Release on actual completion, not on client disconnect.
    res.locals.release = () => { busy = false; };
    next();
  };
  app.post('/api/predict', lock, async (req, res) => {
    try {
      const {text, conceptId, scopeConfirmed} = req.body || {};
      if (typeof text !== 'string' || !text.trim() || [...text].length > 20000 || !ids.has(conceptId) || scopeConfirmed !== true) {
        res.status(400).json({error: 'Choose a concept, enter 1–20,000 characters, and confirm its scope.'}); return;
      }
      res.json(await (options.predict || (input => worker!.predict(input)))({text, conceptId, scopeConfirmed: true}));
    } catch { res.status(503).json({error: 'Local inference failed. Check the candidate runtime or shorten the English note and retry.'}); }
    finally { res.locals.release(); }
  });
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 8 * 1024 * 1024, files: 1, fields: 0}}).single('image');
  app.post('/api/ocr', lock, (req, res) => {
    upload(req, res, async error => {
      let directory: string | undefined;
      let file: string | undefined;
      try {
        if (error || !req.file) { res.status(400).json({error: 'Choose one PNG or JPEG image, up to 8 MB.'}); return; }
        const image = sharp(req.file.buffer, {limitInputPixels: 25000000});
        const metadata = await image.metadata();
        if (!['jpeg', 'png'].includes(metadata.format || '') || (metadata.pages || 1) !== 1) {
          res.status(400).json({error: 'Only a single-page PNG or JPEG image is supported.'}); return;
        }
        // Re-encode verified bytes; filenames and MIME headers are not trusted.
        const normalized = await image.rotate().flatten({background: '#fff'}).resize({width: 2200, height: 3000, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 92}).toBuffer();
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'history-preview-'));
        file = path.join(directory, 'page.jpg');
        await fs.writeFile(file, normalized);
        const ocr = options.ocr || (await import('../services/ocrService')).extractTextFromImage;
        const result = await ocr(file);
        if (!result.success) { res.status(502).json({error: 'OCR failed. Try a clearer image or paste the note text.'}); return; }
        const text = activeOcrText(result.text);
        if (!text.trim()) { res.status(422).json({error: 'No active note text was found.'}); return; }
        res.json({text, transcription: result.text, reviewRequired: true});
      } catch { res.status(422).json({error: 'The image could not be processed. Use a clear PNG/JPEG or paste text.'}); }
      finally {
        if (file) await fs.unlink(file).catch(() => {});
        if (directory) await fs.rmdir(directory).catch(() => {});
        res.locals.release();
      }
    });
  });
  app.use(express.static(path.join(ROOT, 'public/history-preview')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({error: 'Invalid request or request body too large.'});
  });
  return app;
}

if (require.main === module) {
  createHistoryPreview().then(app => {
    const server = app.listen(8884, '127.0.0.1', () => console.log('History preview: http://127.0.0.1:8884/'));
    server.on('close', app.locals.disposeHistoryWorker);
    process.once('exit', app.locals.disposeHistoryWorker);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
      app.locals.disposeHistoryWorker(); server.close();
    });
  })
    .catch(() => { console.error('History preview startup failed: check candidate files.'); process.exitCode = 1; });
}

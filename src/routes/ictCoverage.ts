import {Router} from 'express';
import {AppError, sendSuccess} from '../middleware/errorHandler';
import {aiRateLimit} from '../middleware/aiRateLimit';
import {ICTCoverageReviewService} from '../services/ictCoverageReviewService';

export function createICTCoverageRouter(options: {enabled: boolean; service: ICTCoverageReviewService}) {
  const router = Router();
  let busy = false;
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!options.enabled) return next(new AppError('ICT coverage review is not enabled on this service', 503));
    next();
  });
  router.get('/concepts', (_req, res, next) => {
    try {sendSuccess(res, options.service.catalog());} catch {next(new AppError('ICT candidate files are unavailable', 503));}
  });
  router.get('/concepts/:conceptId/reference', aiRateLimit(30, 60000), async (req, res, next) => {
    try {sendSuccess(res, await options.service.reference(String(req.params.conceptId)));}
    catch (error) {next(error instanceof AppError ? error : new AppError('Textbook references are temporarily unavailable', 503));}
  });
  router.post('/suggestions', aiRateLimit(30, 60000), async (req, res, next) => {
    if (busy) return next(new AppError('Another ICT check is running. Try again shortly.', 429));
    try {
      const input = options.service.validate(req.body);
      busy = true;
      let result;
      try {result = await options.service.predict(input);} catch {throw new AppError('ICT check is temporarily unavailable. Retry after the model starts.', 503);}
      sendSuccess(res, result, 'Experimental coverage suggestion; review the evidence before relying on it');
    } catch (error) {next(error);}
    finally {busy = false;}
  });
  return router;
}

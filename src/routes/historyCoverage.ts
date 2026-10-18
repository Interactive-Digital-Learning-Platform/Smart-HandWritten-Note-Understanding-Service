import {Router} from 'express';
import {AppError, sendSuccess} from '../middleware/errorHandler';
import {aiRateLimit} from '../middleware/aiRateLimit';
import {HistoryCoverageReviewService} from '../services/historyCoverageReviewService';
import {HistoryNoteChecks} from '../services/historyNoteChecks';
import {requireNoteOwner} from '../middleware/studentOwnership';
import {studentId} from '../middleware/studentAuth';

export function createHistoryCoverageRouter(options: {enabled: boolean; service: HistoryCoverageReviewService}) {
  const router = Router();
  let busy = false;
  const savedChecks=new HistoryNoteChecks(options.service);
  router.param('noteId',(req,res,next)=>requireNoteOwner('noteId')(req,res,next));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!options.enabled) return next(new AppError('History coverage review is not enabled on this service', 503));
    next();
  });
  router.get('/concepts', (_req, res, next) => {
    try {sendSuccess(res, options.service.catalog());} catch {next(new AppError('History candidate files are unavailable', 503));}
  });
  router.get('/notes/:noteId/check',async(req,res,next)=>{
    try{sendSuccess(res,await savedChecks.get(String(req.params.noteId),studentId(res)));}catch(error){next(error);}
  });
  router.post('/notes/:noteId/check',aiRateLimit(10,60000),async(req,res,next)=>{
    try{if(busy)throw new AppError('Another History check is running. Try again shortly.',429);
      sendSuccess(res,await savedChecks.start(String(req.params.noteId),studentId(res),req.body),'History check saved and started',202);
    }catch(error){next(error);}
  });
  router.post('/suggestions', aiRateLimit(30, 60000), async (req, res, next) => {
    if (busy) return next(new AppError('Another History check is running. Try again shortly.', 429));
    try {
      const input = options.service.validate(req.body);
      busy = true;
      let result;
      try {result = await options.service.predict(input);} catch {throw new AppError('History check is temporarily unavailable. Retry after the model starts.', 503);}
      sendSuccess(res, result, 'Experimental coverage suggestion; review the evidence before relying on it');
    } catch (error) {next(error);}
    finally {busy = false;}
  });
  return router;
}

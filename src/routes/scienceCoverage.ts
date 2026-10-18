import {Router} from 'express';
import {config} from '../config/config';
import {AppError,sendSuccess} from '../middleware/errorHandler';
import {aiRateLimit} from '../middleware/aiRateLimit';
import {requireNoteOwner} from '../middleware/studentOwnership';
import {studentId} from '../middleware/studentAuth';
import {ScienceReviewService,ScienceNoteChecks} from '../services/scienceNoteChecks';

export function createScienceCoverageRouter(service=new ScienceReviewService(),enabled=config.englishCoverage.suggestionsEnabled) {
  const router=Router(),checks=new ScienceNoteChecks(service);
  router.use((_req,_res,next)=>enabled?next():next(new AppError('Science coverage checks are not enabled',503)));
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.param('noteId',(req,res,next)=>requireNoteOwner('noteId')(req,res,next));
  router.get('/concepts',(_req,res,next)=>{try{sendSuccess(res,service.catalog());}catch(error){next(error);}});
  router.get('/notes/:noteId/check',async(req,res,next)=>{try{sendSuccess(res,await checks.get(String(req.params.noteId),studentId(res)));}catch(error){next(error);}});
  router.post('/notes/:noteId/check',aiRateLimit(10,60000),async(req,res,next)=>{
    try{sendSuccess(res,await checks.start(String(req.params.noteId),studentId(res),req.body),'Science check saved and started',202);}catch(error){next(error);}
  });
  return router;
}

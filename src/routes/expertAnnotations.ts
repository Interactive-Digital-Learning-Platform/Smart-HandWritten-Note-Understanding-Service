import { Router } from "express";
import { requireExpertAnnotationAuth } from "../annotations/expertAuth";
import {
  claimExpertAnnotationTask,
  getExpertAnnotationImage,
  getExpertAnnotationSummary,
  getExpertAnnotationTask,
  listExpertAnnotationTasks,
  saveExpertAnnotationDraft,
  submitExpertAnnotationTask,
} from "../controllers/expertAnnotationsController";

const router = Router();
router.use(requireExpertAnnotationAuth);
router.get("/summary", getExpertAnnotationSummary);
router.get("/tasks", listExpertAnnotationTasks);
router.get("/tasks/:id", getExpertAnnotationTask);
router.get("/tasks/:id/images/:page", getExpertAnnotationImage);
router.post("/tasks/:id/claim", claimExpertAnnotationTask);
router.patch("/tasks/:id/draft", saveExpertAnnotationDraft);
router.post("/tasks/:id/submit", submitExpertAnnotationTask);

export default router;

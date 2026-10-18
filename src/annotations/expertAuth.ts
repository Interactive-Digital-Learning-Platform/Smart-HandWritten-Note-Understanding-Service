import { NextFunction, Request, Response } from "express";
import { config } from "../config/config";
import { sendError } from "../middleware/errorHandler";
import { verifyExpertCredential } from "./expertCredentials";

export const requireExpertAnnotationAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!config.annotationReview.enabled) {
    sendError(res, "Expert annotation is not enabled", 503);
    return;
  }
  const expertId = String(req.header("x-expert-id") || "").trim();
  const authorization = req.header("authorization") || "";
  const accessKey = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (
    !verifyExpertCredential(
      expertId,
      accessKey,
      config.annotationReview.expertCredentials
    )
  ) {
    res.setHeader("WWW-Authenticate", "Bearer");
    sendError(res, "Invalid expert annotation credentials", 401);
    return;
  }
  res.locals.expertId = expertId;
  next();
};

import { RequestHandler } from "express";
import { Note } from "../models/Note";
import { AppError } from "./errorHandler";
import { studentId } from "./studentAuth";

export const requireNoteOwner = (parameter: string): RequestHandler => async (req, res, next) => {
  try {
    const id = req.params[parameter];
    if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id) ||
        !await Note.exists({ _id: id, userId: studentId(res) })) throw new AppError("Note not found", 404);
    next();
  } catch (error) { next(error); }
};

export const requireProfileOwner: RequestHandler = (req, res, next) => {
  try {
    if (req.params.userId !== studentId(res)) throw new AppError("Profile not found", 404);
    next();
  } catch (error) { next(error); }
};

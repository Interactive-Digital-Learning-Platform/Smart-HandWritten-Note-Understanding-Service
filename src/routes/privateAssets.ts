import { Router } from "express";
import path from "node:path";
import { Note } from "../models/Note";
import { LearningMaterial } from "../models/LearningMaterial";
import { AppError } from "../middleware/errorHandler";
import { studentId } from "../middleware/studentAuth";

/** Mounted behind student authentication; URLs carry no session tokens. */
export function createPrivateAssets(kind: "uploads" | "generated_audio", directory: string): Router {
  const router = Router();
  router.get("/:filename", async (req, res, next) => {
    try {
      const filename = req.params.filename;
      if (typeof filename !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(filename) || filename.includes("..")) throw new AppError("File not found", 404);
      const userId = studentId(res);
      const storedUrl = `/${kind}/${filename}`;
      let owned: boolean;
      if (kind === "uploads") {
        owned = !!await Note.exists({ userId, $or: [{ imageUrl: storedUrl }, { imageUrls: storedUrl }] });
      } else {
        const material = await LearningMaterial.findOne({ userId, audioUrl: storedUrl }).select("noteId");
        owned = !!material && !!await Note.exists({ _id: material.noteId, userId });
      }
      if (!owned) throw new AppError("File not found", 404);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.sendFile(filename, { root: path.resolve(directory), dotfiles: "deny", cacheControl: false, lastModified: false }, error => {
        if (error) next(new AppError("File not found", 404));
      });
    } catch (error) { next(error); }
  });
  return router;
}

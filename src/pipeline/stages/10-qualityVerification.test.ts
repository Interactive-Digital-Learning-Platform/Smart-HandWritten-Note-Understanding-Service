import test from "node:test";
import assert from "node:assert/strict";
import { PipelineContext } from "../types";
import { runQualityVerification } from "./10-qualityVerification";

test("quality verification preserves warnings raised by earlier stages", () => {
  const ctx = {
    rawOcrText: "Enough extracted text for deterministic quality checks.",
    qualityWarnings: ["OCR could not read 2 of 5 uploaded pages."],
  } as PipelineContext;

  runQualityVerification(ctx);

  assert.ok(
    ctx.qualityWarnings?.includes("OCR could not read 2 of 5 uploaded pages.")
  );
});

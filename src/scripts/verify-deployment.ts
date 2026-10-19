import { config } from "../config/config";
import { validateDeploymentProfile } from "../config/deploymentProfile";
import { studentAuthConfig } from "../middleware/studentAuth";
import { EnglishCoverageService } from "../services/englishCoverageService";
import { HistoryCoverageReviewService } from "../services/historyCoverageReviewService";

try {
  validateDeploymentProfile(process.env);
  studentAuthConfig();
  const history = new HistoryCoverageReviewService();
  try {
    const science = new EnglishCoverageService().catalog();
    const historyCatalog = history.catalog();
    if (science.concepts.length !== 10 || historyCatalog.concepts.length !== 94) throw Error("Unexpected packaged model catalog");
    console.log(JSON.stringify({ configuration: "valid", imageStorage: config.noteImages.provider,
      collection: config.qdrant.collection, scienceConcepts: science.concepts.length, historyConcepts: historyCatalog.concepts.length,
      scienceSha256: science.modelSha256, historySha256: historyCatalog.modelSha256,
      scope: "configuration and packaged catalogs only; no destination connectivity or inference tested" }));
  } finally { history.dispose(); }
} catch (error) {
  console.error("Notes deployment preflight failed: " + (error instanceof Error ? error.message : "invalid configuration"));
  process.exitCode = 1;
}

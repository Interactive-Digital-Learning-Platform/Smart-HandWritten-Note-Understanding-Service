import type { PipelineStage } from "./types";

export interface ProcessingProgress {
  stage: PipelineStage | "queued" | "saving_analysis";
  completedStages: PipelineStage[];
  currentPage?: number;
  totalPages: number;
  startedAt: string;
  updatedAt: string;
}

export function createProgressReporter(
  startedAt: Date,
  totalPages: number,
  completedStages: () => PipelineStage[],
  publish?: (progress: ProcessingProgress) => Promise<void> | void,
) {
  return async (update: Pick<ProcessingProgress, "stage" | "currentPage">): Promise<void> => {
    if (!publish) return;
    try {
      await publish({
        ...update, totalPages, completedStages: [...completedStages()],
        startedAt: startedAt.toISOString(), updatedAt: new Date().toISOString(),
      });
    } catch {
      // A status-display write must not discard otherwise usable analysis.
      console.warn("Could not publish note processing progress; analysis continues");
    }
  };
}

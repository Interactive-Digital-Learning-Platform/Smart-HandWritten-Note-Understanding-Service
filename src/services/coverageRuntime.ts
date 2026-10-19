import path from 'path';

export const coverageRuntimeRoot = (fallback: string): string =>
  process.env.COVERAGE_BUNDLE_DIR ? path.resolve(process.env.COVERAGE_BUNDLE_DIR) : fallback;

export const coveragePython = (root: string): string => process.env.COVERAGE_PYTHON ||
  path.join(root, process.platform === 'win32' ? 'ml-training/.venv/Scripts/python.exe' : 'ml-training/.venv/bin/python');

export const historyModelFile = (fallback: string): string => process.env.COVERAGE_BUNDLE_DIR
  ? path.join(coverageRuntimeRoot(fallback), 'models/history-coverage-v6.json')
  : path.join(fallback, 'ml-training/outputs/history-coverage-v6.2-paraphrases-2026-10-19/model.json');

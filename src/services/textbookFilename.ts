const filenameAliases: Record<string, string[]> = {
  "ict g-11 e.pdf": ["ict grade 11.pdf"],
  "grade-10-history-text-book-64017cf286c01.pdf": [
    "histoy grade 10.pdf",
  ],
  "grade-11-science-part-1.pdf": ["science grade 11 part 1.pdf"],
  "grade-11-science-part-2.pdf": ["science grade 11 part 2.pdf"],
  // Accept the misspelled filename already stored by ingestion.
  "grade-11-history-text-book.pdf": ["histoy grade 11.pdf"],
};

export interface TextbookStorageSource {
  filename: string;
  /** Page difference from the main PDF. */
  pageOffset: number;
}

const fallbackStorageSources: Record<string, TextbookStorageSource[]> = {
  // Use the combined book when Part 2 pages are missing.
  "grade-11-science-part-2.pdf": [
    {
      filename: "grade-11-science-text-book-6200f72533f2f.pdf",
      pageOffset: 220,
    },
  ],
};

const normalizeFilename = (filename: string): string =>
  filename
    .trim()
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ");

export const getTextbookFilenameCandidates = (
  canonicalFilename: string
): string[] => [
  canonicalFilename,
  ...(filenameAliases[canonicalFilename.toLowerCase()] ?? []),
];

export const getTextbookStorageSources = (
  canonicalFilename: string
): TextbookStorageSource[] => [
  { filename: canonicalFilename, pageOffset: 0 },
  ...(fallbackStorageSources[canonicalFilename.toLowerCase()] ?? []),
];

export const matchesTextbookFilename = (
  ingestedFilename: string,
  canonicalFilename: string
): boolean => {
  const actual = normalizeFilename(ingestedFilename);
  return getTextbookFilenameCandidates(canonicalFilename).some((candidate) =>
    actual.includes(normalizeFilename(candidate))
  );
};
